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
  // BUG-115 (2026-06-09): negotiation phase. See master plan §10.
  NEGOTIATION: 'Negotiation',
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
    // BUG-111 (2026-06-06): per-section weight totals + role lookup.
    const roleByCriterion = new Map(criteria.map(c => [c.name, (c as any).evaluatorRole ?? 'EITHER']));
    const weightByCriterion = new Map(
      criteria.map(c => [c.name, c.weight != null ? Number(c.weight) : 0]),
    );
    let weightTechnical = 0;
    let weightProcurement = 0;
    let weightEither = 0;
    for (const c of criteria) {
      const w = c.weight != null ? Number(c.weight) : 0;
      const role = (c as any).evaluatorRole ?? 'EITHER';
      if (role === 'TECHNICAL') weightTechnical += w;
      else if (role === 'PROCUREMENT') weightProcurement += w;
      else weightEither += w;
    }

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
          // BUG-111: surface role so frontend can chip-tag per criterion.
          evaluatorRole: roleByCriterion.get(c.name) ?? 'EITHER',
          consensusScore: average,
          evaluatorCount: values.length,
        };
      });

      // BUG-111 (2026-06-06): per-section weighted subscores. For each role,
      // compute the weighted average of criterion consensus scores limited to
      // criteria of that role. Stays 0..100 percent within the section, so
      // the UI can render "T: X / weightTechnical" and "P: X / weightProcurement"
      // as `toAbsolute(percent, weight)` integers.
      const consensusForRole = (role: 'TECHNICAL' | 'PROCUREMENT') => {
        let weightedSum = 0;
        let weightTotal = 0;
        for (const cc of consensusByCriterion) {
          if (cc.evaluatorRole !== role) continue;
          if (cc.consensusScore == null) continue;
          const w = cc.weight ?? 0;
          weightedSum += cc.consensusScore * w;
          weightTotal += w;
        }
        return weightTotal > 0 ? weightedSum / weightTotal : null;
      };
      const consensusScoreTechnical = consensusForRole('TECHNICAL');
      const consensusScoreProcurement = consensusForRole('PROCUREMENT');

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
        // BUG-111 (2026-06-06): per-section subscores for the split UI.
        consensusScoreTechnical,
        consensusScoreProcurement,
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
        // BUG-111: per-criterion role so the matrix UI can chip-tag rows.
        evaluatorRole: (c as any).evaluatorRole ?? 'EITHER',
      })),
      totalMaxScore,
      // BUG-111 (2026-06-06): per-section weight totals so the UI can render
      // "T: X / weightTechnical" and "P: X / weightProcurement".
      weightTechnical,
      weightProcurement,
      weightEither,
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
      // BUG-115 (2026-06-09): keep comparison surface live during negotiation.
      TenderStatus.NEGOTIATION,
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
        // BUG-068 / Phase F BOQ: when vendor submitted per-line prices, the
        // commercial total is sum(unit_price * qty) of BIDDING rows. Falls back
        // to commercialEvaluations.totalPrice (BUG-053 manual entry) for legacy
        // bids that have no boq rows.
        bidBoqItems: {
          include: { tenderBoqItem: { select: { qty: true } } },
        },
        // BUG-115 (2026-06-09): pull every negotiation invitation for this
        // bid with its submission + per-line prices. Service derives
        // negotiationHistory[] for the comparison response.
        negotiationInvitations: {
          include: {
            round: { select: { roundNumber: true, launchedAt: true, closedAt: true } },
            submission: { include: { boqItems: true } },
          },
        },
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
      // BUG-068: BOQ-driven total trumps manual entry. If the vendor submitted
      // any BIDDING rows, sum unit_price * qty; otherwise fall back to the
      // average manual entry (BUG-053 path) for legacy / no-BOQ tenders.
      const biddingLines = bid.bidBoqItems.filter(
        (i: any) => i.status === 'BIDDING' && i.unitPrice != null,
      );
      const boqTotal = biddingLines.length > 0
        ? biddingLines.reduce(
            (s: number, i: any) => s + Number(i.unitPrice) * Number(i.tenderBoqItem.qty),
            0,
          )
        : null;
      const originalCommercialTotal = boqTotal != null
        ? boqTotal
        : prices.length > 0
          ? prices.reduce((s, v) => s + v, 0) / prices.length
          : null;
      const currency =
        bid.commercialEvaluations.find(e => e.currency)?.currency ?? 'KWD';

      // BUG-115 (2026-06-09): build per-round negotiation history. Sorted by
      // round number ascending. `% reduction vs previous` walks down the
      // chain (round N vs round N-1; round 1 vs original).
      const submittedInvitations = (bid.negotiationInvitations ?? [])
        .filter((i: any) => i.submission != null)
        .sort((a: any, b: any) => a.round.roundNumber - b.round.roundNumber);

      const negotiationHistory = submittedInvitations.map((inv: any, idx: number) => {
        const sub = inv.submission as any;
        const subTotal = sub.totalPrice == null ? null : Number(sub.totalPrice);
        const prevSub = idx === 0 ? null : submittedInvitations[idx - 1].submission as any;
        const prevTotal = idx === 0
          ? originalCommercialTotal
          : (prevSub == null || prevSub.totalPrice == null ? null : Number(prevSub.totalPrice));
        const percentReductionVsPrevious =
          subTotal != null && prevTotal != null && prevTotal > 0
            ? ((prevTotal - subTotal) / prevTotal) * 100
            : null;
        const percentReductionVsOriginal =
          subTotal != null && originalCommercialTotal != null && originalCommercialTotal > 0
            ? ((originalCommercialTotal - subTotal) / originalCommercialTotal) * 100
            : null;
        return {
          // BUG-129 (2026-06-11): submissionId so the frontend can build
          // the negotiation PDF view/download URL.
          submissionId: inv.submission.id,
          roundNumber: inv.round.roundNumber,
          submittedAt: inv.submission.submittedAt.toISOString(),
          totalPrice: subTotal,
          currency: inv.submission.currency ?? currency,
          percentReductionVsPrevious,
          percentReductionVsOriginal,
          commercialPdfFilename: inv.submission.commercialPdfFilename,
          remarks: inv.submission.remarks ?? null,
          boqLines: (inv.submission.boqItems ?? []).map((b: any) => ({
            tenderBoqItemId: b.tenderBoqItemId,
            status: b.status,
            unitPrice: b.unitPrice == null ? null : Number(b.unitPrice),
            lineTotal: b.status === 'BIDDING' && b.unitPrice != null
              // Note: qty is on the template line; comparison page also has the
              // tender's boqTemplate so the renderer can resolve qty there
              // when needed. We expose unitPrice here; the FE multiplies by qty
              // from its own template lookup (matches the existing boqLines pattern).
              ? null
              : null,
          })),
        };
      });

      // "Current" price for lowest-PASS + downstream resolution = latest
      // non-null negotiation submission total, else the original.
      const latestNegotiationTotal = negotiationHistory.length > 0
        ? negotiationHistory[negotiationHistory.length - 1].totalPrice
        : null;
      const commercialTotal = latestNegotiationTotal != null
        ? latestNegotiationTotal
        : originalCommercialTotal;

      // Open invitation (no submission yet) tells the page to show
      // "negotiation pending" badges on the per-vendor card.
      const openInvitation = (bid.negotiationInvitations ?? []).find(
        (i: any) => i.submission == null && i.round.closedAt == null,
      );

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
        // BUG-068 / Phase F BOQ: per-line breakdown for the Itemized matrix
        // and the per-vendor card's Line Items block.
        boqLines: bid.bidBoqItems.map((i: any) => ({
          tenderBoqItemId: i.tenderBoqItemId,
          status: i.status,
          unitPrice: i.unitPrice == null ? null : Number(i.unitPrice),
          lineTotal: i.status === 'BIDDING' && i.unitPrice != null
            ? Number(i.unitPrice) * Number(i.tenderBoqItem.qty)
            : null,
        })),
        // BUG-115 (2026-06-09): original + negotiated views.
        originalCommercialTotal,
        negotiationHistory,
        hasOpenNegotiationInvitation: openInvitation != null,
        openNegotiationInvitationId: openInvitation?.id ?? null,
        openNegotiationRoundNumber: openInvitation?.round?.roundNumber ?? null,
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

    // BUG-068 / Phase F BOQ: surface the template so the Itemized matrix can
    // render rows = template items, cols = vendors. Filters out the legacy
    // placeholder row (auto-backfilled by migration 020 for existing tenders)
    // so the Itemized view doesn't show a fake "no BOQ defined" row.
    const boqRows = await this.prisma.tenderBoqItem.findMany({
      where: {
        tenderId,
        NOT: { itemNo: '0', description: 'Legacy tender — no BOQ defined' },
      },
      orderBy: [{ sortOrder: 'asc' }, { itemNo: 'asc' }],
    });
    const boqTemplate = boqRows.map(r => ({
      id: r.id,
      itemNo: r.itemNo,
      description: r.description,
      qty: Number(r.qty),
      unit: r.unit,
    }));

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
      boqTemplate,
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
          // BUG-095 (2026-06-02): include BoQ rows so winnerPrice can compute
          // from the structured per-line totals when BoQ exists (matches the
          // vendor-list aggregator + BUG-091 fix on award.service).
          bidBoqItems: {
            include: { tenderBoqItem: { select: { qty: true } } },
          },
          // BUG-115 (2026-06-09): include the latest negotiation submission so
          // winnerPrice prefers it over BoQ / commercial evaluation totals.
          negotiationInvitations: {
            include: {
              round:      { select: { roundNumber: true } },
              submission: { select: { totalPrice: true, currency: true, submittedAt: true } },
            },
          },
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

    // BUG-095: BoQ-driven total first, fall back to manual entry average.
    const biddingLines = (bid?.bidBoqItems ?? []).filter(
      (i: any) => i.status === 'BIDDING' && i.unitPrice != null,
    );
    const boqTotal = biddingLines.length > 0
      ? biddingLines.reduce(
          (s: number, i: any) => s + Number(i.unitPrice) * Number(i.tenderBoqItem.qty),
          0,
        )
      : null;
    const prices = (bid?.commercialEvaluations ?? [])
      .map(e => (e.totalPrice != null ? Number(e.totalPrice) : null))
      .filter((v): v is number => typeof v === 'number');
    const manualAvg = prices.length > 0
      ? prices.reduce((s, v) => s + v, 0) / prices.length
      : null;

    // BUG-115 (2026-06-09): if the awarded bid was negotiated, the LATEST
    // round's submission total trumps every other source. We also surface
    // the savings figure so AwardSummaryCard can render "Awarded after N
    // rounds — X% saved".
    const submitted = (bid?.negotiationInvitations ?? [])
      .filter((i: any) => i.submission?.totalPrice != null)
      .sort((a: any, b: any) => b.round.roundNumber - a.round.roundNumber);
    const negotiatedTotal = submitted.length > 0 && submitted[0].submission?.totalPrice != null
      ? Number(submitted[0].submission.totalPrice)
      : null;
    const negotiatedRoundCount = submitted.length;
    const originalPrice = boqTotal ?? manualAvg;
    const winnerPrice = negotiatedTotal != null ? negotiatedTotal : originalPrice;
    const negotiationSavings = (negotiatedTotal != null && originalPrice != null && originalPrice > 0)
      ? {
          originalPrice,
          finalPrice: negotiatedTotal,
          savingsAmount: originalPrice - negotiatedTotal,
          savingsPercent: ((originalPrice - negotiatedTotal) / originalPrice) * 100,
          roundCount: negotiatedRoundCount,
        }
      : null;
    const winnerCurrency =
      submitted[0]?.submission?.currency
      ?? bid?.commercialEvaluations.find(e => e.currency)?.currency
      ?? 'KWD';

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
      // BUG-115 (2026-06-09): additive. Null when no negotiation happened.
      negotiationSavings,
    };
  }
}
