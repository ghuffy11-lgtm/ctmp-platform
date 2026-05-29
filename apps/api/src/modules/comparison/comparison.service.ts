import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { TenderStatus, TechnicalResult, EnvelopeType, EnvelopeStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

const STATUS_DB_TO_API: Record<TenderStatus, string> = {
  DRAFT: 'Draft',
  INTERNAL_REVIEW: 'Internal Review',
  APPROVED: 'Approved',
  PUBLISHED: 'Published',
  CLARIFICATION_PERIOD: 'Clarification Period',
  SUBMISSION_CLOSED: 'Submission Closed',
  TECHNICAL_OPENING: 'Technical Opening',
  TECHNICAL_EVALUATION: 'Technical Evaluation',
  COMMERCIAL_SEALED: 'Commercial Sealed',
  COMMITTEE_COMMERCIAL_OPENING: 'Committee Commercial Opening',
  COMMERCIAL_EVALUATION: 'Commercial Evaluation / Comparison',
  AWARD_RECOMMENDATION: 'Award Recommendation',
  AWARDED: 'Awarded',
  TENDER_CLOSED: 'Tender Closed',
  CANCELLED: 'Cancelled',
  SUSPENDED: 'Suspended',
  ARCHIVED: 'Archived',
} as Record<TenderStatus, string>;

@Injectable()
export class ComparisonService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Phase B (BUG-036): aggregate technical evaluations per vendor for a tender.
   *
   * Returns:
   *   - tender meta
   *   - criteria definitions (TenderTechnicalCriterion: name, maxScore, weight, mandatory)
   *   - per-vendor block with:
   *       consensus = average of evaluators' overallScore + the bid's official
   *                   technicalResult (set by finalize-technical-results)
   *       perCriterion = average across evaluators per criterion name (matched
   *                      to the criteria definition by name; unmatched criteria
   *                      show under "Other")
   *       evaluators = each evaluator's full breakdown (overall + per criterion
   *                    score + comments) — drives the cell expand-to-detail UI
   */
  async technicalComparison(tenderId: string) {
    const tender = await this.prisma.tender.findUnique({
      where: { id: tenderId },
      include: {
        department: { select: { name: true, code: true } },
      },
    });
    if (!tender) throw new NotFoundException('Tender not found');

    const criteria = await this.prisma.tenderTechnicalCriterion.findMany({
      where: { tenderId },
      orderBy: { sortOrder: 'asc' },
    });

    const bids = await this.prisma.bid.findMany({
      where: { tenderId },
      include: {
        vendor: { select: { id: true, companyName: true } },
        technicalEvaluations: {
          include: {
            evaluatorUser: { select: { id: true, displayName: true } },
            scores: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { submittedAt: 'asc' },
    });

    const criteriaNames = new Set(criteria.map(c => c.name));
    const maxByCriterion = new Map(criteria.map(c => [c.name, Number(c.maxScore)]));
    const totalMaxScore = criteria.reduce((sum, c) => sum + Number(c.maxScore), 0);

    const vendors = bids.map(bid => {
      const evaluators = bid.technicalEvaluations.map(te => {
        const perCriterion = te.scores.map(s => ({
          criterion: s.criterion,
          score: Number(s.score),
          weight: s.weight != null ? Number(s.weight) : null,
          maxScore: maxByCriterion.get(s.criterion) ?? null,
          comments: s.comments ?? null,
          inDefinedCriteria: criteriaNames.has(s.criterion),
        }));
        return {
          evaluationId: te.id,
          evaluatorUserId: te.evaluatorUserId,
          evaluatorName: te.evaluatorUser.displayName,
          result: te.result,
          overallScore: te.overallScore != null ? Number(te.overallScore) : null,
          finalizedAt: te.finalizedAt?.toISOString() ?? null,
          comments: te.comments ?? null,
          perCriterion,
        };
      });

      // Consensus: simple averages across evaluators that have a finalized score.
      const finalised = evaluators.filter(e => e.overallScore != null);
      const consensusScore = finalised.length > 0
        ? finalised.reduce((s, e) => s + (e.overallScore ?? 0), 0) / finalised.length
        : null;

      // Per-criterion consensus = avg of each evaluator's score for that criterion.
      const consensusByCriterion = criteria.map(c => {
        const values = evaluators
          .map(e => e.perCriterion.find(p => p.criterion === c.name)?.score)
          .filter((v): v is number => typeof v === 'number');
        const average = values.length > 0
          ? values.reduce((s, v) => s + v, 0) / values.length
          : null;
        return {
          criterionId: c.id,
          criterionName: c.name,
          maxScore: Number(c.maxScore),
          weight: c.weight != null ? Number(c.weight) : null,
          mandatory: c.mandatory,
          consensusScore: average,
          evaluatorCount: values.length,
        };
      });

      return {
        bidId: bid.id,
        vendorId: bid.vendor.id,
        vendorName: bid.vendor.companyName,
        bidStatus: bid.status,
        submittedAt: bid.submittedAt?.toISOString() ?? null,
        // Official aggregated result, set by finalize-technical-results. Trumps
        // per-evaluator opinions for the display badge.
        consensusResult: bid.technicalResult,
        consensusFinalised: bid.technicalResult !== TechnicalResult.PENDING,
        consensusScore,
        evaluators,
        consensusByCriterion,
      };
    });

    // PASS / FAIL aggregate counts (for the page header).
    const passCount = vendors.filter(v => v.consensusResult === TechnicalResult.PASS).length;
    const failCount = vendors.filter(v => v.consensusResult === TechnicalResult.FAIL).length;
    const pendingCount = vendors.filter(v => v.consensusResult === TechnicalResult.PENDING).length;

    return {
      tender: {
        id: tender.id,
        referenceNumber: tender.reference,
        title: tender.title,
        status: STATUS_DB_TO_API[tender.status as TenderStatus],
        departmentName: tender.department?.name ?? null,
        departmentCode: tender.department?.code ?? null,
        technicalPassThreshold: tender.technicalPassThreshold != null
          ? Number(tender.technicalPassThreshold)
          : null,
      },
      criteria: criteria.map(c => ({
        id: c.id,
        code: c.code,
        name: c.name,
        description: c.description,
        maxScore: Number(c.maxScore),
        weight: c.weight != null ? Number(c.weight) : null,
        mandatory: c.mandatory,
        sortOrder: c.sortOrder,
      })),
      totalMaxScore,
      summary: {
        bidCount: vendors.length,
        passCount,
        failCount,
        pendingCount,
        evaluatorTotal: vendors.reduce((s, v) => s + v.evaluators.length, 0),
      },
      vendors,
    };
  }

  /**
   * Phase C (BUG-035): commercial comparison surface.
   *
   * Returns ALL vendors (PASS + FAIL + PENDING) — the page grays FAIL rows
   * but still surfaces them for audit transparency (master-plan rule A3).
   * Each vendor block carries:
   *   technicalScore + technicalResult — from TechnicalEvaluation / Bid
   *   commercialTotal + currency + comments — from CommercialEvaluation (average
   *     across evaluators if multiple submitted)
   *   commercialEnvelopeStatus — whether the committee has opened the envelope
   *   commercialDocuments — list of bid documents in the COMMERCIAL envelope
   *     (filenames only; per-file download still gated by commercial:download)
   *   vendorProfile — minimal company snapshot
   * The server also pre-computes `lowestPassBidId` per master-plan rule F1.
   */
  async commercialComparison(tenderId: string, user: any) {
    const tender = await this.prisma.tender.findUnique({
      where: { id: tenderId },
      include: {
        department: { select: { name: true, code: true } },
      },
    });
    if (!tender) throw new NotFoundException('Tender not found');

    // Per spec: commercial visibility only AFTER the committee opening session
    // has flipped at least one envelope to OPENED. Status-side gate; the
    // endpoint-level permission gate is `comparison:commercial:view`.
    const openedEnvelopes = await this.prisma.bidEnvelope.count({
      where: {
        envelopeType: EnvelopeType.COMMERCIAL,
        status: EnvelopeStatus.OPENED,
        bid: { tenderId },
      },
    });
    const allowedTenderStatuses: TenderStatus[] = [
      TenderStatus.COMMITTEE_COMMERCIAL_OPENING,
      TenderStatus.COMMERCIAL_EVALUATION,
      TenderStatus.AWARD_RECOMMENDATION,
      TenderStatus.AWARDED,
      TenderStatus.TENDER_CLOSED,
    ];
    const committeeOpened = openedEnvelopes > 0 || allowedTenderStatuses.includes(tender.status);
    if (!committeeOpened) {
      throw new ForbiddenException(
        'Commercial comparison is only available after the committee commercial opening session.',
      );
    }

    const bids = await this.prisma.bid.findMany({
      where: { tenderId },
      include: {
        vendor: {
          select: { id: true, companyName: true, status: true, country: true },
        },
        bidEnvelopes: {
          include: {
            bidDocuments: { select: { id: true, originalFilename: true, fileSize: true, uploadedAt: true } },
          },
        },
        technicalEvaluations: { select: { overallScore: true } },
        commercialEvaluations: { select: { totalPrice: true, currency: true, comments: true, evaluatorUserId: true } },
      },
      orderBy: { submittedAt: 'asc' },
    });

    const criteria = await this.prisma.tenderTechnicalCriterion.findMany({
      where: { tenderId },
      orderBy: { sortOrder: 'asc' },
    });
    const totalMaxScore = criteria.reduce((sum, c) => sum + Number(c.maxScore), 0);

    const vendors = bids.map(bid => {
      const techScores = bid.technicalEvaluations
        .map(e => (e.overallScore != null ? Number(e.overallScore) : null))
        .filter((v): v is number => typeof v === 'number');
      const technicalScore = techScores.length > 0
        ? techScores.reduce((s, v) => s + v, 0) / techScores.length
        : null;

      const prices = bid.commercialEvaluations
        .map(e => (e.totalPrice != null ? Number(e.totalPrice) : null))
        .filter((v): v is number => typeof v === 'number');
      const commercialTotal = prices.length > 0
        ? prices.reduce((s, v) => s + v, 0) / prices.length
        : null;
      const currency =
        bid.commercialEvaluations.find(e => e.currency)?.currency ?? 'KWD';

      const commercialEnvelope = bid.bidEnvelopes.find(e => e.envelopeType === EnvelopeType.COMMERCIAL);

      return {
        bidId: bid.id,
        vendorId: bid.vendor.id,
        vendorName: bid.vendor.companyName,
        vendor: {
          id: bid.vendor.id,
          companyName: bid.vendor.companyName,
          status: bid.vendor.status,
          country: bid.vendor.country ?? null,
        },
        bidStatus: bid.status,
        submittedAt: bid.submittedAt?.toISOString() ?? null,
        technicalResult: bid.technicalResult,
        technicalScore,
        technicalMaxScore: totalMaxScore || null,
        commercialEnvelopeStatus: commercialEnvelope?.status ?? null,
        commercialEnvelopeOpenedAt: commercialEnvelope?.openedAt?.toISOString() ?? null,
        commercialTotal,
        currency,
        commercialDocuments: (commercialEnvelope?.bidDocuments ?? []).map(d => ({
          id: d.id,
          filename: d.originalFilename,
          fileSize: Number(d.fileSize),
          uploadedAt: d.uploadedAt.toISOString(),
        })),
        commentsByEvaluator: bid.commercialEvaluations
          .filter(e => e.comments)
          .map(e => ({ evaluatorUserId: e.evaluatorUserId, comments: e.comments ?? '' })),
      };
    });

    // Master plan F1: pre-select the lowest commercial price among technically-PASS vendors.
    const passWithPrice = vendors.filter(
      v => v.technicalResult === TechnicalResult.PASS && v.commercialTotal != null,
    );
    passWithPrice.sort((a, b) => (a.commercialTotal ?? Infinity) - (b.commercialTotal ?? Infinity));
    const lowestPassBidId = passWithPrice.length > 0 ? passWithPrice[0].bidId : null;

    // Audit-view count for the header badge.
    const auditViewCount = await this.prisma.auditLog.count({
      where: {
        tenderId,
        eventType: { in: ['BID_DOCUMENT_VIEWED', 'COMMERCIAL_COMPARISON_VIEWED'] },
      },
    });

    // BUG-054 / WALK-050: when tender is Awarded, surface the active Award row
    // so the page can render an AwardSummaryCard in place of (or above) the
    // per-vendor comparison cards. "Active" = not yet superseded by an amendment.
    const award = await this.activeAwardSummary(tenderId);

    return {
      tender: {
        id: tender.id,
        referenceNumber: tender.reference,
        title: tender.title,
        status: STATUS_DB_TO_API[tender.status as TenderStatus],
        departmentName: tender.department?.name ?? null,
        departmentCode: tender.department?.code ?? null,
        currency: tender.currency ?? 'KWD',
        estimatedBudget: tender.estimatedBudget != null ? Number(tender.estimatedBudget) : null,
      },
      summary: {
        bidCount: vendors.length,
        passCount: vendors.filter(v => v.technicalResult === TechnicalResult.PASS).length,
        failCount: vendors.filter(v => v.technicalResult === TechnicalResult.FAIL).length,
        pendingCount: vendors.filter(v => v.technicalResult === TechnicalResult.PENDING).length,
        priceCount: vendors.filter(v => v.commercialTotal != null).length,
        auditViewCount,
      },
      lowestPassBidId,
      vendors,
      award,
    };
  }

  private async activeAwardSummary(tenderId: string) {
    const award = await this.prisma.award.findFirst({
      where: { tenderId, supersededByAwardId: null },
      orderBy: { confirmedAt: 'desc' },
    });
    if (!award) return null;

    const [vendor, bid, confirmer, latestMinutes] = await Promise.all([
      this.prisma.vendor.findUnique({
        where: { id: award.recommendedVendorId },
        select: { id: true, companyName: true },
      }),
      this.prisma.bid.findUnique({
        where: { id: award.recommendedBidId },
        include: {
          commercialEvaluations: { select: { totalPrice: true, currency: true } },
        },
      }),
      this.prisma.user.findUnique({
        where: { id: award.confirmedBy },
        select: { displayName: true, email: true },
      }),
      this.prisma.awardMinutes.findFirst({
        where: { awardId: award.id },
        orderBy: { generatedAt: 'desc' },
        select: { id: true, generatedAt: true },
      }),
    ]);

    const prices = (bid?.commercialEvaluations ?? [])
      .map(e => (e.totalPrice != null ? Number(e.totalPrice) : null))
      .filter((v): v is number => typeof v === 'number');
    const winnerPrice = prices.length > 0
      ? prices.reduce((s, v) => s + v, 0) / prices.length
      : null;
    const winnerCurrency =
      bid?.commercialEvaluations.find(e => e.currency)?.currency ?? 'KWD';

    return {
      awardId: award.id,
      winnerVendorId: award.recommendedVendorId,
      winnerVendorName: vendor?.companyName ?? '—',
      winnerBidId: award.recommendedBidId,
      winnerPrice,
      winnerCurrency,
      isLowest: award.isLowest,
      justificationText: award.justificationText,
      justificationPdfFilename: award.justificationPdfFilename,
      notifyWinner: award.notifyWinner,
      notifyLosers: award.notifyLosers,
      confirmedByName: confirmer?.displayName ?? confirmer?.email ?? '—',
      confirmedAt: award.confirmedAt.toISOString(),
      minutesGeneratedAt: latestMinutes?.generatedAt.toISOString() ?? null,
    };
  }
}
