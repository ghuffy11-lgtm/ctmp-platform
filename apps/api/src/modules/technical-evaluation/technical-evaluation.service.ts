import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditRiskLevel, EnvelopeStatus, EnvelopeType, TechnicalResult, TenderStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EvaluateBidDto } from './dto/evaluate-bid.dto';

@Injectable()
export class TechnicalEvaluationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
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

    return result;
  }

  async findAll(tenderId: string) {
    const evaluations = await this.prisma.technicalEvaluation.findMany({
      where: { bid: { tenderId } },
      orderBy: { createdAt: 'desc' },
      include: { bid: { select: { vendorId: true } } },
    });
    return {
      items: evaluations.map(e => ({
        id: e.id,
        bidId: e.bidId,
        evaluatorUserId: e.evaluatorUserId,
        result: e.result === 'PENDING' ? undefined : e.result,
        score: e.overallScore ? Number(e.overallScore) : undefined,
      })),
      page: 1,
      pageSize: evaluations.length,
      total: evaluations.length,
    };
  }

  async evaluate(bidId: string, dto: EvaluateBidDto, evaluatorId: string) {
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
      include: { technicalEvaluations: { select: { result: true } } },
    });

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

    await this.audit.log({
      eventType: 'TECHNICAL_RESULTS_FINALIZED',
      entityType: 'Tender',
      entityId: tenderId,
      tenderId,
      actorUserId: userId,
      afterValue: {
        status: TenderStatus.COMMERCIAL_SEALED,
        passed: updates.filter(u => u.result === TechnicalResult.PASS).length,
        failed: updates.filter(u => u.result === TechnicalResult.FAIL).length,
      },
      riskLevel: AuditRiskLevel.HIGH,
    });

    return this.findAll(tenderId);
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
