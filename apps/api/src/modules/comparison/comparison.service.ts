import { Injectable, NotFoundException } from '@nestjs/common';
import { TenderStatus, TechnicalResult } from '@prisma/client';
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
}
