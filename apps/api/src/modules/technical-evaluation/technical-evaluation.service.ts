import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditRiskLevel, BidStatus, EnvelopeStatus, EnvelopeType, TechnicalResult, TenderStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EvaluateBidDto } from './dto/evaluate-bid.dto';

@Injectable()
export class TechnicalEvaluationService {
  private readonly logger = new Logger(TechnicalEvaluationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    // BUG-140 (2026-06-19): manager notification email on finalize.
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  async openEnvelopes(tenderId: string, userId: string) {
    const tender = await this.prisma.tender.findUnique({
      where: { id: tenderId },
      select: { id: true, status: true },
    });
    if (!tender) throw new NotFoundException('Tender not found');
    if (tender.status !== TenderStatus.SUBMISSION_CLOSED) {
      throw new BadRequestException(`Technical envelopes can only open from SUBMISSION_CLOSED`);
    }

    const now = new Date();
    const result = await this.prisma.$transaction(async tx => {
      const envelopes = await tx.bidEnvelope.findMany({
        where: {
          envelopeType: EnvelopeType.TECHNICAL,
          status: EnvelopeStatus.SUBMITTED,
          bid: { tenderId },
        },
        select: { id: true },
      });
      if (envelopes.length === 0) {
        return { tenderId, openedEnvelopeCount: 0 };
      }
      await tx.bidEnvelope.updateMany({
        where: { id: { in: envelopes.map(e => e.id) } },
        data: {
          status: EnvelopeStatus.OPENED,
          openedAt: now,
          openedByUserId: userId,
        },
      });
      await tx.tender.update({
        where: { id: tenderId },
        data: { status: TenderStatus.TECHNICAL_OPENING },
      });
      return { tenderId, openedEnvelopeCount: envelopes.length };
    });

    await this.audit.log({
      eventType: 'TECHNICAL_ENVELOPES_OPENED',
      entityType: 'Tender',
      entityId: tenderId,
      tenderId,
      actorUserId: userId,
      beforeValue: { status: TenderStatus.SUBMISSION_CLOSED },
      afterValue: { status: TenderStatus.TECHNICAL_OPENING, openedEnvelopeCount: result.openedEnvelopeCount },
      riskLevel: AuditRiskLevel.MEDIUM,
    });

    // BUG-143 (2026-06-19): notify the tender department's TECHNICAL_EVALUATOR
    // role-holders that they can begin scoring. Best-effort — failures logged
    // but the envelope-open status flip is never rolled back. Closes the long-
    // standing BUG-020 deferred backlog item.
    await this.dispatchOpenedEmail(tenderId, result.openedEnvelopeCount).catch(err => {
      this.logger.warn(`TECHNICAL_ENVELOPES_OPENED email dispatch failed for ${tenderId}: ${err?.message ?? err}`);
    });

    return result;
  }

  // BUG-143 (2026-06-19): build + send the evaluator notification on
  // technical-envelopes-opened. Mirrors BUG-140's dispatchFinalizedEmail
  // shape. Audit row written once (after the loop) carrying the recipient
  // list, so an empty dispatch leaves a discoverable breadcrumb.
  private async dispatchOpenedEmail(tenderId: string, openedCount: number): Promise<void> {
    const tender = await this.prisma.tender.findUnique({
      where: { id: tenderId },
      select: {
        id: true,
        reference: true,
        title: true,
        departmentId: true,
        department: { select: { name: true } },
      },
    });
    if (!tender) return;
    if (!tender.departmentId) {
      this.logger.warn(`Tender ${tenderId} has no department; skipping TECHNICAL_ENVELOPES_OPENED_EVALUATOR email.`);
      return;
    }

    const recipients = await this.prisma.user.findMany({
      where: {
        status: 'ACTIVE',
        userRoles: { some: { role: { code: 'TECHNICAL_EVALUATOR' } } },
        userDepartments: { some: { departmentId: tender.departmentId } },
      },
      select: { id: true, email: true, displayName: true },
    });

    if (recipients.length === 0) {
      this.logger.warn(`No TECHNICAL_EVALUATOR users in dept ${tender.departmentId}; skipping email for ${tenderId}.`);
      // Still audit so the operational gap is visible.
      await this.audit.log({
        eventType: 'TECHNICAL_OPENED_EMAIL_SENT',
        entityType: 'Tender',
        entityId: tenderId,
        tenderId,
        afterValue: { recipientCount: 0, reason: 'no_active_evaluators_in_department' },
        riskLevel: AuditRiskLevel.LOW,
      });
      return;
    }

    // BUG-144 (2026-06-19): registered app.adminPortalUrl is always present
    // with a hardcoded fallback, so the email always carries an absolute link.
    const adminBase = this.config.get<string>('app.adminPortalUrl') ?? '';
    const tenderUrl = `${adminBase.replace(/\/+$/, '')}/technical-evaluation?tenderId=${tenderId}`;
    const systemName = this.config.get<string>('app.systemName') ?? 'CTMP';
    const departmentName = tender.department?.name ?? '(department)';

    const sentTo: string[] = [];
    for (const r of recipients) {
      if (!r.email) continue;
      try {
        await this.notifications.sendEmail(r.email, 'TECHNICAL_ENVELOPES_OPENED_EVALUATOR', {
          evaluatorName: r.displayName ?? 'Evaluator',
          tenderReference: tender.reference,
          tenderTitle: tender.title,
          submissionCount: String(openedCount),
          newStatus: 'Technical Opening',
          departmentName,
          tenderUrl,
          systemName,
        });
        sentTo.push(r.email);
      } catch (err) {
        this.logger.warn(`Failed to email evaluator ${r.email} for ${tenderId}: ${(err as Error)?.message ?? err}`);
      }
    }

    await this.audit.log({
      eventType: 'TECHNICAL_OPENED_EMAIL_SENT',
      entityType: 'Tender',
      entityId: tenderId,
      tenderId,
      afterValue: { recipients: sentTo, recipientCount: sentTo.length },
      riskLevel: AuditRiskLevel.LOW,
    });
  }

  async findAll(tenderId: string) {
    // BUG-057 / WALK-026: include `comments` and per-criterion `scores` so
    // the frontend scorecard hydrates from the caller's previously-saved
    // evaluation instead of resetting to blanks on every bid switch.
    const evaluations = await this.prisma.technicalEvaluation.findMany({
      where: { bid: { tenderId } },
      orderBy: { createdAt: 'desc' },
      include: {
        bid: { select: { vendorId: true } },
        evaluatorUser: { select: { displayName: true } },
        scores: true,
      },
    });
    return {
      items: evaluations.map(e => ({
        id: e.id,
        bidId: e.bidId,
        evaluatorUserId: e.evaluatorUserId,
        evaluatorName: e.evaluatorUser?.displayName ?? undefined,
        result: e.result === 'PENDING' ? undefined : e.result,
        score: e.overallScore ? Number(e.overallScore) : undefined,
        comments: e.comments ?? undefined,
        finalizedAt: e.finalizedAt?.toISOString() ?? undefined,
        updatedAt: e.updatedAt.toISOString(),
        criterionScores: e.scores.map(s => ({
          criterion: s.criterion,
          weight: Number(s.weight),
          score: Number(s.score),
          comments: s.comments ?? undefined,
        })),
      })),
      page: 1,
      pageSize: evaluations.length,
      total: evaluations.length,
    };
  }

  async evaluate(bidId: string, dto: EvaluateBidDto, user: { id: string; permissions?: string[] }) {
    const evaluatorId = user.id;
    const userPerms = new Set(user.permissions ?? []);
    const hasTechnical = userPerms.has('technical:evaluate');
    const hasProcurement = userPerms.has('technical:evaluate:procurement');

    const bid = await this.prisma.bid.findUnique({
      where: { id: bidId },
      include: {
        tender: { select: { id: true, status: true, technicalPassThreshold: true } },
        bidEnvelopes: { where: { envelopeType: EnvelopeType.TECHNICAL }, select: { status: true } },
      },
    });
    if (!bid) throw new NotFoundException('Bid not found');
    const technicalStatus = bid.bidEnvelopes[0]?.status;
    if (technicalStatus !== EnvelopeStatus.OPENED) {
      throw new BadRequestException('Technical envelope not opened');
    }

    const threshold = bid.tender.technicalPassThreshold
      ? Number(bid.tender.technicalPassThreshold)
      : 70;

    // BUG-111 (2026-06-06): per-criterion role check. Load tender criteria so
    // we can look up each submitted score's assigned role and verify the caller
    // is allowed to score it. Submissions that target a criterion outside the
    // caller's role get a 403 naming the criterion.
    const tenderCriteria = await this.prisma.tenderTechnicalCriterion.findMany({
      where: { tenderId: bid.tenderId },
      select: { name: true, evaluatorRole: true },
    });
    const roleByName = new Map(tenderCriteria.map(c => [c.name, c.evaluatorRole]));
    if (dto.criterionScores) {
      for (const c of dto.criterionScores) {
        const role = roleByName.get(c.criterion) ?? 'EITHER';
        const allowed =
          role === 'EITHER'
            ? (hasTechnical || hasProcurement)
            : role === 'TECHNICAL'
              ? hasTechnical
              : role === 'PROCUREMENT'
                ? hasProcurement
                : false;
        if (!allowed) {
          throw new ForbiddenException(
            `Criterion "${c.criterion}" is assigned to ${role} evaluators; you do not have the required permission.`,
          );
        }
      }
    }

    // Compute overallScore from per-criterion rows when provided. Weighted
    // average normalised to 0–100. If only the aggregate `score` is sent
    // (legacy clients), use it as-is. At least one must be present.
    let overallScore: number;
    if (dto.criterionScores && dto.criterionScores.length > 0) {
      const totalWeight = dto.criterionScores.reduce((s, c) => s + c.weight, 0);
      if (totalWeight <= 0) {
        throw new BadRequestException('Sum of criterion weights must be positive');
      }
      const weighted = dto.criterionScores.reduce(
        (s, c) => s + c.score * c.weight,
        0,
      );
      // Each criterion's `score` is already 0–100; weighted average stays 0–100.
      overallScore = weighted / totalWeight;
    } else if (typeof dto.score === 'number') {
      overallScore = dto.score;
    } else {
      throw new BadRequestException(
        'Either `score` or `criterionScores` must be provided',
      );
    }
    overallScore = Math.max(0, Math.min(100, overallScore));

    const result: TechnicalResult = overallScore >= threshold
      ? TechnicalResult.PASS
      : TechnicalResult.FAIL;

    const evaluation = await this.prisma.$transaction(async tx => {
      const ev = await tx.technicalEvaluation.upsert({
        where: { bidId_evaluatorUserId: { bidId, evaluatorUserId: evaluatorId } },
        update: { overallScore, comments: dto.notes, result },
        create: {
          bidId,
          evaluatorUserId: evaluatorId,
          overallScore,
          comments: dto.notes,
          result,
        },
      });

      if (dto.criterionScores && dto.criterionScores.length > 0) {
        // Atomic replace: drop the evaluator's previous per-criterion rows for
        // this bid and write the new set. Keeps the comparison aggregation
        // stable across re-submissions.
        await tx.technicalEvaluationScore.deleteMany({
          where: { technicalEvaluationId: ev.id },
        });
        await tx.technicalEvaluationScore.createMany({
          data: dto.criterionScores.map(c => ({
            technicalEvaluationId: ev.id,
            criterion: c.criterion,
            weight: c.weight,
            score: c.score,
            comments: c.comments,
          })),
        });
      }
      return ev;
    });

    await this.audit.log({
      eventType: 'TECHNICAL_EVALUATION_SUBMITTED',
      entityType: 'TechnicalEvaluation',
      entityId: evaluation.id,
      tenderId: bid.tenderId,
      bidId,
      actorUserId: evaluatorId,
      afterValue: {
        score: overallScore,
        result,
        criterionCount: dto.criterionScores?.length ?? 0,
      },
      riskLevel: AuditRiskLevel.LOW,
    });

    return evaluation;
  }

  async finalize(tenderId: string, userId: string) {
    const tender = await this.prisma.tender.findUnique({
      where: { id: tenderId },
      select: { id: true, status: true },
    });
    if (!tender) throw new NotFoundException('Tender not found');
    if (
      tender.status !== TenderStatus.TECHNICAL_OPENING &&
      tender.status !== TenderStatus.TECHNICAL_EVALUATION
    ) {
      throw new BadRequestException(`Cannot finalize from ${tender.status}`);
    }

    // Aggregate evaluator results per bid → bid-level PASS/FAIL on majority.
    const bids = await this.prisma.bid.findMany({
      where: { tenderId },
      include: {
        technicalEvaluations: { select: { result: true } },
        vendor: { select: { id: true, companyName: true } },
      },
    });

    // BUG-073 (2026-06-01): block finalize when any active bid lacks an
    // evaluation. Owner finalized a tender with one vendor un-evaluated; the
    // pre-existing path silently marked them FAIL and locked the tender. Now
    // we refuse with 409 and name the unevaluated vendors so the evaluator
    // knows exactly what's left.
    const activeBidStatuses: BidStatus[] = [
      BidStatus.SUBMITTED,
      BidStatus.LATE_ACCEPTED,
    ];
    const unevaluated = bids
      .filter(b => activeBidStatuses.includes(b.status) && b.technicalEvaluations.length === 0)
      .map(b => ({ vendorId: b.vendor.id, vendorName: b.vendor.companyName, bidId: b.id }));
    if (unevaluated.length > 0) {
      throw new ConflictException({
        code: 'UNEVALUATED_VENDORS',
        message: `Cannot finalize — un-evaluated: ${unevaluated.map(u => u.vendorName).join(', ')}.`,
        unevaluatedVendors: unevaluated,
      });
    }

    const updates: Array<{ bidId: string; result: TechnicalResult }> = [];
    for (const bid of bids) {
      const evals = bid.technicalEvaluations;
      if (evals.length === 0) {
        updates.push({ bidId: bid.id, result: TechnicalResult.FAIL });
        continue;
      }
      const pass = evals.filter(e => e.result === TechnicalResult.PASS).length;
      const final = pass * 2 >= evals.length ? TechnicalResult.PASS : TechnicalResult.FAIL;
      updates.push({ bidId: bid.id, result: final });
    }

    const now = new Date();
    await this.prisma.$transaction([
      ...updates.map(u =>
        this.prisma.bid.update({
          where: { id: u.bidId },
          data: { technicalResult: u.result },
        }),
      ),
      // Seal commercial envelopes for bids that PASSED. Failed bids' commercial envelopes
      // are also LOCKED so they can never be opened.
      this.prisma.bidEnvelope.updateMany({
        where: {
          envelopeType: EnvelopeType.COMMERCIAL,
          bid: { tenderId, technicalResult: TechnicalResult.PASS },
        },
        data: { status: EnvelopeStatus.SEALED },
      }),
      this.prisma.bidEnvelope.updateMany({
        where: {
          envelopeType: EnvelopeType.COMMERCIAL,
          bid: { tenderId, technicalResult: TechnicalResult.FAIL },
        },
        data: { status: EnvelopeStatus.LOCKED, lockedAt: now },
      }),
      this.prisma.tender.update({
        where: { id: tenderId },
        data: { status: TenderStatus.COMMERCIAL_SEALED },
      }),
    ]);

    const passed = updates.filter(u => u.result === TechnicalResult.PASS).length;
    const failed = updates.filter(u => u.result === TechnicalResult.FAIL).length;

    await this.audit.log({
      eventType: 'TECHNICAL_RESULTS_FINALIZED',
      entityType: 'Tender',
      entityId: tenderId,
      tenderId,
      actorUserId: userId,
      afterValue: {
        status: TenderStatus.COMMERCIAL_SEALED,
        passed,
        failed,
      },
      riskLevel: AuditRiskLevel.HIGH,
    });

    // BUG-140 (2026-06-19): notify the tender's owning manager that the
    // engineering / evaluator team have completed their technical work.
    // Best-effort — failure logged but does not roll back the finalize.
    await this.dispatchFinalizedEmail(tenderId, updates.length, passed, failed).catch(err => {
      this.logger.warn(`TECHNICAL_EVALUATION_FINALIZED email dispatch failed for ${tenderId}: ${err?.message ?? err}`);
    });

    return this.findAll(tenderId);
  }

  // BUG-140 (2026-06-19): build + send the manager confirmation email.
  private async dispatchFinalizedEmail(
    tenderId: string,
    totalBids: number,
    passCount: number,
    failCount: number,
  ): Promise<void> {
    // Load tender + manager + evaluator list in one round-trip.
    const tender = await this.prisma.tender.findUnique({
      where: { id: tenderId },
      select: {
        id: true,
        reference: true,
        title: true,
        status: true,
        owningUserId: true,
        createdBy: true,
        owningUser: { select: { displayName: true, email: true } },
        createdByUser: { select: { displayName: true, email: true } },
        bids: {
          select: {
            technicalEvaluations: {
              select: { evaluatorUser: { select: { displayName: true, email: true } } },
            },
          },
        },
      },
    });
    if (!tender) return;

    const manager = tender.owningUser ?? tender.createdByUser;
    if (!manager?.email) {
      this.logger.warn(`No owning/createdBy user email on tender ${tenderId}; skipping TECHNICAL_EVALUATION_FINALIZED email.`);
      return;
    }

    // Distinct evaluator names across all bids' technical evaluations.
    const evaluatorNames = new Set<string>();
    for (const bid of tender.bids) {
      for (const te of bid.technicalEvaluations) {
        const u = te.evaluatorUser;
        if (u?.displayName) evaluatorNames.add(u.displayName);
        else if (u?.email) evaluatorNames.add(u.email);
      }
    }
    const evaluatorList = evaluatorNames.size > 0
      ? Array.from(evaluatorNames).join(', ')
      : '(no evaluators recorded)';

    // BUG-144 (2026-06-19): registered app.adminPortalUrl is always present
    // with a hardcoded fallback, so the email always carries an absolute link.
    const adminBase = this.config.get<string>('app.adminPortalUrl') ?? '';
    const tenderUrl = `${adminBase.replace(/\/+$/, '')}/tenders/${tenderId}`;
    const systemName = this.config.get<string>('app.systemName') ?? 'CTMP';

    await this.notifications.sendEmail(manager.email, 'TECHNICAL_EVALUATION_FINALIZED', {
      managerName: manager.displayName ?? 'Procurement Manager',
      tenderReference: tender.reference,
      tenderTitle: tender.title,
      totalBids: String(totalBids),
      passCount: String(passCount),
      failCount: String(failCount),
      evaluatorList,
      newStatus: 'Commercial Sealed',
      tenderUrl,
      systemName,
    });

    await this.audit.log({
      eventType: 'TECHNICAL_FINALIZED_EMAIL_SENT',
      entityType: 'Tender',
      entityId: tenderId,
      tenderId,
      afterValue: { recipient: manager.email, evaluators: Array.from(evaluatorNames), passed: passCount, failed: failCount },
      riskLevel: AuditRiskLevel.LOW,
    });
  }

  async listCriteria(tenderId: string) {
    const tender = await this.prisma.tender.findUnique({
      where: { id: tenderId },
      select: { id: true, technicalPassThreshold: true },
    });
    if (!tender) throw new NotFoundException('Tender not found');

    const criteria = await this.prisma.tenderTechnicalCriterion.findMany({
      where: { tenderId },
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    });

    if (criteria.length > 0) {
      return {
        tenderId,
        passThreshold: Number(tender.technicalPassThreshold ?? 70),
        source: 'TENDER' as const,
        criteria: criteria.map(c => ({
          code: c.code,
          name: c.name,
          description: c.description ?? undefined,
          maxScore: Number(c.maxScore),
          weight: c.weight ? Number(c.weight) : undefined,
          mandatory: c.mandatory,
          // BUG-111: surface the per-criterion role so the scorecard UI can
          // filter visible rows by the caller's permissions.
          evaluatorRole: c.evaluatorRole,
        })),
      };
    }

    return {
      tenderId,
      passThreshold: Number(tender.technicalPassThreshold ?? 70),
      source: 'SYSTEM_DEFAULT' as const,
      criteria: [
        { code: 'COMPLIANCE', name: 'Compliance with Technical Specs', description: 'Full adherence to Appendix A equipment list and operational parameters.', maxScore: 30, mandatory: true },
        { code: 'TEAM', name: 'Team Experience & Qualifications', description: 'Years of relevant experience for the assigned Project Manager and Senior Engineers.', maxScore: 25, mandatory: false },
        { code: 'METHODOLOGY', name: 'Project Methodology & Timeline', description: 'Detailing project phase milestones and risk mitigation strategies.', maxScore: 25, mandatory: false },
        { code: 'SLA', name: 'Support & Maintenance SLA', description: 'Post-implementation technical support availability and response times.', maxScore: 20, mandatory: false },
      ],
    };
  }
}
