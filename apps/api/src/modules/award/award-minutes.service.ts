import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { randomUUID } from 'crypto';
import * as puppeteer from 'puppeteer-core';
import { TechnicalResult } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { STORAGE_BACKEND } from '../../common/storage/storage.module';
import type { StorageBackend } from '../../common/storage/storage.types';

const NAMESPACE = 'award-minutes';

interface BidBoqLine {
  itemCode: string;
  itemDescription: string;
  qty: number;
  unit: string;
  status: string; // BIDDING / NO_BID / etc.
  unitPrice: number | null;
  lineTotal: number | null;
}

interface BidNegotiationRow {
  roundNumber: number;
  submittedAt: string;
  totalPrice: number | null;
  currency: string;
}

interface BidEntry {
  bidId: string;
  vendorName: string;
  technicalResult: 'PASS' | 'FAIL' | 'PENDING';
  technicalScore: number | null;
  technicalMaxScore: number | null;
  // BUG-150 (2026-06-21): resolved price chain — show all three so the
  // reader can audit how the awarded price was determined.
  originalPrice: number | null;     // commercialEval avg OR BoQ total pre-negotiation
  negotiatedPrice: number | null;   // latest negotiation submission (null if no negotiation)
  finalPrice: number | null;        // negotiated ?? original
  currency: string;
  isWinner: boolean;
  boqLines: BidBoqLine[];
  negotiationRows: BidNegotiationRow[];
  perCriterionScores: Array<{ criterion: string; score: number | null; maxScore: number }>;
}

interface AwardMinutesData {
  tender: {
    reference: string;
    title: string;
    departmentName: string;
    departmentCode: string;
    awardedAt: string;
    estimatedBudget: number | null;
    currency: string;
  };
  award: {
    id: string;
    confirmedAt: string;
    confirmedByName: string;
    isLowest: boolean;
    justificationText: string | null;
    justificationPdfFilename: string | null;
    justificationPdfSha256: string | null;
    supersedes: { previousAwardId: string; previousVendorName: string } | null;
    notifyWinner: boolean;
    notifyLosers: boolean;
  };
  winner: {
    vendorName: string;
    commercialTotal: number | null;
    currency: string;
    negotiationSavings: {
      originalPrice: number;
      finalPrice: number;
      savingsAmount: number;
      savingsPercent: number;
      roundCount: number;
    } | null;
  };
  bids: BidEntry[];
  criteria: Array<{ code: string; name: string; maxScore: number; weight: number | null; mandatory: boolean }>;
  // BUG-150 (2026-06-21): per-round attendance set across vendors so the PDF
  // can render a clean per-round comparison table.
  negotiationRounds: Array<{
    roundNumber: number;
    launchedAt: string;
    closedAt: string | null;
    submissions: Array<{
      vendorName: string;
      totalPrice: number | null;
      currency: string;
      submittedAt: string | null;
    }>;
  }>;
  boqTemplate: Array<{ itemCode: string; description: string; qty: number; unit: string }>;
  attendees: Array<{ displayName: string; roleInCommittee: string | null; isChair: boolean; present: boolean }>;
}

@Injectable()
export class AwardMinutesService {
  private readonly logger = new Logger(AwardMinutesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
    @Inject(STORAGE_BACKEND) private readonly storage: StorageBackend,
  ) {}

  /**
   * Phase E (BUG-038). Generate the official Award Minutes PDF for the
   * tender's active (non-superseded) award. ON-DEMAND only — no auto-gen
   * at Confirm time. Each call writes a new award_minutes row + storage
   * object so the audit trail keeps a history of every generated copy
   * (master plan H2: "Re-clicking generates a fresh row").
   *
   * BUG-150 (2026-06-21): content overhaul. Was showing only a single
   * commercial total per bid sourced from the manual CommercialEvaluation
   * table — bids priced via BoQ or Negotiation displayed "—". Now uses
   * the same 3-source resolver chain as award.service.resolveBidWinningPrice
   * (Negotiation → BoQ → CommercialEvaluation), and adds:
   *   • detailed per-criterion technical scoring matrix
   *   • per-round negotiation matrix across all vendors
   *   • per-vendor BoQ line items (when tender uses BoQ)
   * so the minutes document is a complete decision record.
   */
  async generate(tenderId: string, userId: string): Promise<{
    buffer: Buffer;
    sha256: string;
    filename: string;
    minutesId: string;
  }> {
    const data = await this.collectData(tenderId);
    const html = this.renderHtml(data);
    const buffer = await this.htmlToPdf(html);
    const sha256 = createHash('sha256').update(buffer).digest('hex');

    const minutesId = randomUUID();
    const storageKey = `${tenderId}/${minutesId}-award-minutes.pdf`;
    await this.storage.write({
      namespace: NAMESPACE,
      storageKey,
      payload: buffer,
      contentType: 'application/pdf',
    });

    await this.prisma.awardMinutes.create({
      data: {
        id: minutesId,
        awardId: data.award.id,
        pdfStorageKey: storageKey,
        sha256,
        generatedBy: userId,
      },
    });

    await this.audit.log({
      eventType: 'AWARD_MINUTES_GENERATED',
      entityType: 'AwardMinutes',
      entityId: minutesId,
      tenderId,
      actorUserId: userId,
      afterValue: { awardId: data.award.id, sha256, bytes: buffer.length },
      riskLevel: 'MEDIUM' as any,
    });

    return {
      buffer,
      sha256,
      filename: `award-minutes-${data.tender.reference}.pdf`,
      minutesId,
    };
  }

  private async collectData(tenderId: string): Promise<AwardMinutesData> {
    const tender = await this.prisma.tender.findUnique({
      where: { id: tenderId },
      include: { department: { select: { name: true, code: true } } },
    });
    if (!tender) throw new NotFoundException('Tender not found');

    const award = await this.prisma.award.findFirst({
      where: { tenderId, supersededByAwardId: null },
      orderBy: { confirmedAt: 'desc' },
    });
    if (!award) throw new NotFoundException('No active award for this tender');

    const confirmedByUser = await this.prisma.user.findUnique({
      where: { id: award.confirmedBy },
      select: { displayName: true },
    });

    const supersededPrev = await this.prisma.award.findFirst({
      where: { tenderId, supersededByAwardId: award.id },
    });
    let supersedes: AwardMinutesData['award']['supersedes'] = null;
    if (supersededPrev) {
      const prevVendor = await this.prisma.vendor.findUnique({
        where: { id: supersededPrev.recommendedVendorId },
        select: { companyName: true },
      });
      supersedes = {
        previousAwardId: supersededPrev.id,
        previousVendorName: prevVendor?.companyName ?? 'unknown',
      };
    }

    // BUG-150 (2026-06-21): load BoQ template + technical criteria once so
    // both can flow into multiple sections (matrix headers + per-bid lines).
    const boqTemplate = await this.prisma.tenderBoqItem.findMany({
      where: { tenderId },
      orderBy: { sortOrder: 'asc' },
    });
    const criteria = await this.prisma.tenderTechnicalCriterion.findMany({
      where: { tenderId },
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    });
    const techMax = criteria.reduce((s, c) => s + Number(c.maxScore), 0) || null;

    // BUG-150 (2026-06-21): per-bid data superset — everything the resolver
    // chain needs, plus per-bid BoQ lines + per-bid negotiation submissions +
    // per-criterion technical scores. Loaded for ALL bids in one query.
    const allBids = await this.prisma.bid.findMany({
      where: { tenderId },
      include: {
        vendor: { select: { companyName: true } },
        technicalEvaluations: {
          select: {
            overallScore: true,
            scores: { select: { criterion: true, score: true, weight: true } },
          },
        },
        commercialEvaluations: { select: { totalPrice: true, currency: true } },
        bidBoqItems: {
          include: { tenderBoqItem: { select: { itemNo: true, description: true, qty: true, unit: true } } },
        },
        negotiationInvitations: {
          include: {
            round: { select: { roundNumber: true } },
            submission: { select: { id: true, submittedAt: true, totalPrice: true, currency: true } },
          },
        },
      },
      orderBy: { submittedAt: 'asc' },
    });

    const bids: BidEntry[] = allBids.map((b: any) => {
      // Resolver chain (same priority as award.service.resolveBidWinningPrice):
      //   1) latest negotiation submission, 2) BoQ total, 3) commercial-eval avg.
      const negotiationSubs = (b.negotiationInvitations ?? [])
        .filter((i: any) => i.submission?.totalPrice != null)
        .sort((a: any, z: any) => z.round.roundNumber - a.round.roundNumber);
      const negotiatedPrice = negotiationSubs.length > 0
        ? Number(negotiationSubs[0].submission!.totalPrice)
        : null;

      const biddingLines = (b.bidBoqItems ?? []).filter(
        (i: any) => i.status === 'BIDDING' && i.unitPrice != null,
      );
      const boqTotal = biddingLines.length > 0
        ? biddingLines.reduce(
            (s: number, i: any) => s + Number(i.unitPrice) * Number(i.tenderBoqItem.qty),
            0,
          )
        : null;

      const commercialEvalPrices: number[] = (b.commercialEvaluations ?? [])
        .map((e: any) => (e.totalPrice != null ? Number(e.totalPrice) : null))
        .filter((v: number | null): v is number => typeof v === 'number');
      const commercialEvalAvg = commercialEvalPrices.length > 0
        ? commercialEvalPrices.reduce((s, v) => s + v, 0) / commercialEvalPrices.length
        : null;

      // Original = pre-negotiation baseline (BoQ first, then commercial-eval).
      const originalPrice = boqTotal ?? commercialEvalAvg;
      const finalPrice = negotiatedPrice ?? originalPrice;
      const currency = (b.commercialEvaluations.find((e: any) => e.currency)?.currency)
        ?? (negotiationSubs[0]?.submission?.currency)
        ?? 'KWD';

      // Per-criterion average across evaluators.
      const perCriterionMap = new Map<string, number[]>();
      for (const te of (b.technicalEvaluations as any[])) {
        for (const s of (te.scores ?? [])) {
          const arr = perCriterionMap.get(s.criterion) ?? [];
          if (s.score != null) arr.push(Number(s.score));
          perCriterionMap.set(s.criterion, arr);
        }
      }
      const perCriterionScores = criteria.map(c => {
        const arr = perCriterionMap.get(c.name) ?? perCriterionMap.get(c.code) ?? [];
        const avg = arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : null;
        // Backend stores per-criterion scores on a 0–100 scale; rescale to
        // criterion's maxScore so the PDF reads naturally.
        const max = Number(c.maxScore);
        const scaled = avg != null ? (avg / 100) * max : null;
        return { criterion: c.name, score: scaled, maxScore: max };
      });

      // Overall score (weighted average across evaluators), rescaled to techMax.
      const overallScores: number[] = (b.technicalEvaluations as any[])
        .map((e: any) => (e.overallScore != null ? Number(e.overallScore) : null))
        .filter((v: number | null): v is number => typeof v === 'number');
      const overallAvg = overallScores.length > 0
        ? overallScores.reduce((s, v) => s + v, 0) / overallScores.length
        : null;
      const technicalScore = overallAvg != null && techMax != null
        ? (overallAvg / 100) * techMax
        : overallAvg;

      const boqLines: BidBoqLine[] = (b.bidBoqItems ?? []).map((i: any) => ({
        itemCode: i.tenderBoqItem?.itemNo ?? '',
        itemDescription: i.tenderBoqItem?.description ?? '',
        qty: Number(i.tenderBoqItem?.qty ?? 0),
        unit: i.tenderBoqItem?.unit ?? '',
        status: i.status,
        unitPrice: i.unitPrice != null ? Number(i.unitPrice) : null,
        lineTotal: (i.unitPrice != null && i.tenderBoqItem?.qty != null)
          ? Number(i.unitPrice) * Number(i.tenderBoqItem.qty)
          : null,
      }));

      const negotiationRows: BidNegotiationRow[] = (b.negotiationInvitations ?? [])
        .filter((i: any) => i.submission != null)
        .map((i: any) => ({
          roundNumber: i.round.roundNumber,
          submittedAt: i.submission!.submittedAt.toISOString(),
          totalPrice: i.submission!.totalPrice != null ? Number(i.submission!.totalPrice) : null,
          currency: i.submission!.currency ?? currency,
        }))
        .sort((a: BidNegotiationRow, z: BidNegotiationRow) => a.roundNumber - z.roundNumber);

      return {
        bidId: b.id,
        vendorName: b.vendor.companyName,
        technicalResult: b.technicalResult as 'PASS' | 'FAIL' | 'PENDING',
        technicalScore,
        technicalMaxScore: techMax,
        originalPrice,
        negotiatedPrice,
        finalPrice,
        currency,
        isWinner: b.id === award.recommendedBidId,
        boqLines,
        negotiationRows,
        perCriterionScores,
      };
    });

    // Winner-specific aggregation for the Decision summary box.
    const winnerEntry = bids.find(b => b.isWinner);
    const winnerCurrency = winnerEntry?.currency ?? 'KWD';
    const winnerNegotiationSavings = (winnerEntry?.negotiatedPrice != null && winnerEntry.originalPrice != null && winnerEntry.originalPrice > 0)
      ? {
          originalPrice: winnerEntry.originalPrice,
          finalPrice: winnerEntry.negotiatedPrice,
          savingsAmount: winnerEntry.originalPrice - winnerEntry.negotiatedPrice,
          savingsPercent: ((winnerEntry.originalPrice - winnerEntry.negotiatedPrice) / winnerEntry.originalPrice) * 100,
          roundCount: winnerEntry.negotiationRows.length,
        }
      : null;

    // BUG-150 (2026-06-21): tender-wide negotiation rounds matrix.
    const rounds = await this.prisma.negotiationRound.findMany({
      where: { tenderId },
      orderBy: { roundNumber: 'asc' },
      include: {
        invitations: {
          include: {
            bid: { include: { vendor: { select: { companyName: true } } } },
            submission: { select: { submittedAt: true, totalPrice: true, currency: true } },
          },
        },
      },
    });
    const negotiationRounds: AwardMinutesData['negotiationRounds'] = rounds.map(r => ({
      roundNumber: r.roundNumber,
      launchedAt: r.launchedAt.toISOString(),
      closedAt: r.closedAt?.toISOString() ?? null,
      submissions: r.invitations.map(inv => ({
        vendorName: inv.bid?.vendor?.companyName ?? 'unknown',
        totalPrice: inv.submission?.totalPrice != null ? Number(inv.submission.totalPrice) : null,
        currency: inv.submission?.currency ?? 'KWD',
        submittedAt: inv.submission?.submittedAt?.toISOString() ?? null,
      })),
    }));

    const session = await this.prisma.committeeSession.findFirst({
      where: { tenderId },
      orderBy: { scheduledAt: 'desc' },
      include: {
        committeeMembers: { include: { user: { select: { displayName: true } } } },
        committeeAttendances: true,
      },
    });
    const attendeeSet = new Set(
      (session?.committeeAttendances ?? []).filter(a => a.present).map(a => a.memberId),
    );
    const attendees = (session?.committeeMembers ?? []).map(m => ({
      displayName: m.user.displayName,
      roleInCommittee: m.roleInCommittee ?? null,
      isChair: m.isChair,
      present: attendeeSet.has(m.id),
    }));

    return {
      tender: {
        reference: tender.reference,
        title: tender.title,
        departmentName: tender.department?.name ?? '—',
        departmentCode: tender.department?.code ?? '—',
        awardedAt: (tender.awardedAt ?? new Date()).toISOString(),
        estimatedBudget: tender.estimatedBudget != null ? Number(tender.estimatedBudget) : null,
        currency: tender.currency ?? winnerCurrency,
      },
      award: {
        id: award.id,
        confirmedAt: award.confirmedAt.toISOString(),
        confirmedByName: confirmedByUser?.displayName ?? 'unknown',
        isLowest: award.isLowest,
        justificationText: award.justificationText,
        justificationPdfFilename: award.justificationPdfFilename,
        justificationPdfSha256: award.justificationPdfSha256,
        supersedes,
        notifyWinner: award.notifyWinner,
        notifyLosers: award.notifyLosers,
      },
      winner: {
        vendorName: winnerEntry?.vendorName ?? 'unknown',
        commercialTotal: winnerEntry?.finalPrice ?? null,
        currency: winnerCurrency,
        negotiationSavings: winnerNegotiationSavings,
      },
      bids,
      criteria: criteria.map(c => ({
        code: c.code,
        name: c.name,
        maxScore: Number(c.maxScore),
        weight: c.weight != null ? Number(c.weight) : null,
        mandatory: c.mandatory,
      })),
      negotiationRounds,
      boqTemplate: boqTemplate.map(b => ({
        itemCode: b.itemNo,
        description: b.description ?? '',
        qty: Number(b.qty),
        unit: b.unit ?? '',
      })),
      attendees,
    };
  }

  private renderHtml(d: AwardMinutesData): string {
    const fmtCur = (n: number | null, c: string) =>
      n == null ? '—' : new Intl.NumberFormat('en-GB', { style: 'currency', currency: c, maximumFractionDigits: 3 }).format(n);
    const fmtScore = (n: number | null, m: number | null) =>
      n == null ? '—' : m != null ? `${n.toFixed(1)} / ${m}` : n.toFixed(1);
    const fmtDate = (iso: string) => new Date(iso).toLocaleString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
    const pct = (a: number, b: number) => b > 0 ? `${(((b - a) / b) * 100).toFixed(1)}%` : '—';

    const winnerCurrency = d.winner.currency;
    const hasNegotiation = d.negotiationRounds.length > 0;
    const hasBoq = d.boqTemplate.length > 0;
    const hasCriteria = d.criteria.length > 0;

    // ────────── Bids overview table (incl. resolved final price) ──────────
    const bidRows = d.bids.map(b => `
      <tr class="${b.isWinner ? 'winner' : ''} ${b.technicalResult === 'FAIL' ? 'failed' : ''}">
        <td>${escapeHtml(b.vendorName)}${b.isWinner ? ' <strong>(awarded)</strong>' : ''}</td>
        <td>${b.technicalResult}</td>
        <td class="num">${fmtScore(b.technicalScore, b.technicalMaxScore)}</td>
        <td class="num">${fmtCur(b.originalPrice, b.currency)}</td>
        <td class="num">${b.negotiatedPrice != null ? fmtCur(b.negotiatedPrice, b.currency) : '<span class="muted">—</span>'}</td>
        <td class="num"><strong>${fmtCur(b.finalPrice, b.currency)}</strong></td>
      </tr>
    `).join('');

    // ────────── Per-criterion technical matrix ──────────
    const techMatrix = hasCriteria ? `
      <h2>Technical Evaluation — Per-Criterion Scores</h2>
      <table>
        <thead>
          <tr>
            <th>Criterion</th>
            <th class="num">Max</th>
            ${d.bids.map(b => `<th class="num">${escapeHtml(shortName(b.vendorName))}${b.isWinner ? ' ★' : ''}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${d.criteria.map((c, idx) => `
            <tr>
              <td>${escapeHtml(c.name)}${c.mandatory ? ' <span class="badge">MANDATORY</span>' : ''}${c.weight != null ? ` <span class="muted">(w: ${c.weight})</span>` : ''}</td>
              <td class="num">${c.maxScore}</td>
              ${d.bids.map(b => {
                const cell = b.perCriterionScores[idx];
                return `<td class="num">${cell?.score != null ? cell.score.toFixed(1) : '<span class="muted">—</span>'}</td>`;
              }).join('')}
            </tr>
          `).join('')}
          <tr class="total-row">
            <td><strong>Overall</strong></td>
            <td class="num"><strong>${d.bids[0]?.technicalMaxScore ?? '—'}</strong></td>
            ${d.bids.map(b => `<td class="num"><strong>${fmtScore(b.technicalScore, b.technicalMaxScore)}</strong> · <span class="${b.technicalResult === 'PASS' ? 'pass' : 'fail'}">${b.technicalResult}</span></td>`).join('')}
          </tr>
        </tbody>
      </table>
    ` : '';

    // ────────── Commercial BoQ per-vendor matrix ──────────
    const boqMatrix = hasBoq ? `
      <h2>Commercial Comparison — BoQ Line Items</h2>
      <table class="small">
        <thead>
          <tr>
            <th>#</th>
            <th>Item</th>
            <th class="num">Qty</th>
            <th>Unit</th>
            ${d.bids.map(b => `<th class="num">${escapeHtml(shortName(b.vendorName))}${b.isWinner ? ' ★' : ''}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${d.boqTemplate.map(item => `
            <tr>
              <td>${escapeHtml(item.itemCode)}</td>
              <td>${escapeHtml(item.description)}</td>
              <td class="num">${item.qty}</td>
              <td>${escapeHtml(item.unit)}</td>
              ${d.bids.map(b => {
                const line = b.boqLines.find(l => l.itemCode === item.itemCode);
                if (!line) return '<td class="num"><span class="muted">—</span></td>';
                if (line.status !== 'BIDDING') return `<td class="num"><span class="muted">${escapeHtml(line.status)}</span></td>`;
                return `<td class="num">${line.unitPrice != null ? fmtCur(line.unitPrice, b.currency) : '—'}</td>`;
              }).join('')}
            </tr>
          `).join('')}
          <tr class="total-row">
            <td colspan="4"><strong>BoQ Total (before negotiation)</strong></td>
            ${d.bids.map(b => `<td class="num"><strong>${fmtCur(b.originalPrice, b.currency)}</strong></td>`).join('')}
          </tr>
        </tbody>
      </table>
    ` : '';

    // ────────── Negotiation rounds matrix ──────────
    const negotiationMatrix = hasNegotiation ? `
      <h2>Negotiation Rounds</h2>
      <table>
        <thead>
          <tr>
            <th>Round</th>
            <th>Launched</th>
            <th>Closed</th>
            ${d.bids.map(b => `<th class="num">${escapeHtml(shortName(b.vendorName))}${b.isWinner ? ' ★' : ''}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Original</strong></td>
            <td colspan="2"><span class="muted">pre-negotiation baseline</span></td>
            ${d.bids.map(b => `<td class="num">${fmtCur(b.originalPrice, b.currency)}</td>`).join('')}
          </tr>
          ${d.negotiationRounds.map(r => `
            <tr>
              <td><strong>Round ${r.roundNumber}</strong></td>
              <td>${fmtDate(r.launchedAt)}</td>
              <td>${r.closedAt ? fmtDate(r.closedAt) : '<span class="muted">open</span>'}</td>
              ${d.bids.map(b => {
                const sub = r.submissions.find(s => s.vendorName === b.vendorName);
                if (!sub || sub.totalPrice == null) return '<td class="num"><span class="muted">—</span></td>';
                const pctVsOrig = (b.originalPrice != null && b.originalPrice > 0)
                  ? ` <span class="muted">(${pct(sub.totalPrice, b.originalPrice)})</span>`
                  : '';
                return `<td class="num">${fmtCur(sub.totalPrice, sub.currency)}${pctVsOrig}</td>`;
              }).join('')}
            </tr>
          `).join('')}
          <tr class="total-row">
            <td colspan="3"><strong>Final price</strong></td>
            ${d.bids.map(b => `<td class="num"><strong>${fmtCur(b.finalPrice, b.currency)}</strong></td>`).join('')}
          </tr>
        </tbody>
      </table>
    ` : '';

    const attendeeRows = d.attendees.map(a => `
      <tr>
        <td>${escapeHtml(a.displayName)}${a.isChair ? ' (Chair)' : ''}</td>
        <td>${escapeHtml(a.roleInCommittee ?? '—')}</td>
        <td>${a.present ? 'Present' : 'Absent'}</td>
      </tr>
    `).join('');

    return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Award Minutes — ${escapeHtml(d.tender.reference)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Noto Sans', 'Inter', sans-serif; font-size: 10.5pt; color: #1a1c1e; padding: 18mm 14mm; line-height: 1.45; }
  h1 { font-size: 22pt; margin: 0 0 4pt; }
  h2 { font-size: 12pt; margin: 16pt 0 6pt; border-bottom: 2pt solid #022448; padding-bottom: 3pt; color: #022448; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3pt solid #022448; padding-bottom: 12pt; }
  .ref { font-family: 'Courier New', monospace; font-size: 10pt; color: #555; }
  .meta { font-size: 9.5pt; color: #555; line-height: 1.6; }
  table { width: 100%; border-collapse: collapse; margin-top: 6pt; font-size: 9.5pt; }
  table.small { font-size: 9pt; }
  th, td { border: 1pt solid #ccc; padding: 4pt 6pt; text-align: left; vertical-align: top; }
  th { background: #f0f3f7; font-size: 9pt; text-transform: uppercase; letter-spacing: 0.3pt; }
  td.num { text-align: right; font-family: 'Courier New', monospace; white-space: nowrap; }
  tr.winner td { background: #e6f7ec; font-weight: 600; }
  tr.failed td { color: #888; }
  tr.total-row td { background: #f7f8fb; border-top: 2pt solid #022448; }
  .summary-box { background: #f7f8fb; border: 1pt solid #d0d5dd; padding: 10pt 12pt; border-radius: 4pt; margin-top: 8pt; }
  .summary-row { display: flex; justify-content: space-between; padding: 2pt 0; }
  .summary-row .label { color: #555; }
  .summary-row .value { font-weight: 600; }
  .justification { background: #fff8e6; border-left: 3pt solid #d8a800; padding: 8pt 10pt; margin-top: 6pt; font-size: 10pt; white-space: pre-wrap; }
  .amendment-banner { background: #fff3e0; border: 1pt solid #ff9800; padding: 6pt 10pt; border-radius: 3pt; margin-top: 6pt; font-size: 10pt; }
  .muted { color: #888; }
  .badge { display: inline-block; font-size: 7.5pt; padding: 1pt 4pt; border-radius: 2pt; background: #fde6e6; color: #a40000; vertical-align: middle; }
  .pass { color: #198754; font-weight: 600; }
  .fail { color: #b00020; font-weight: 600; }
  footer { margin-top: 24pt; padding-top: 8pt; border-top: 1pt solid #ccc; font-size: 8pt; color: #777; text-align: center; }
</style></head>
<body>
  <div class="header">
    <div>
      <h1>Award Minutes</h1>
      <p class="ref">${escapeHtml(d.tender.reference)}</p>
      <p class="meta"><strong>${escapeHtml(d.tender.title)}</strong></p>
    </div>
    <div class="meta" style="text-align: right;">
      <div>${escapeHtml(d.tender.departmentName)} (${escapeHtml(d.tender.departmentCode)})</div>
      <div>Generated: ${fmtDate(new Date().toISOString())}</div>
    </div>
  </div>

  ${d.award.supersedes ? `<div class="amendment-banner">⚠ This is an <strong>amended</strong> award. It supersedes a previous award to <strong>${escapeHtml(d.award.supersedes.previousVendorName)}</strong>. Both records remain in the audit trail.</div>` : ''}

  <h2>Decision</h2>
  <div class="summary-box">
    <div class="summary-row"><span class="label">Awarded vendor</span><span class="value">${escapeHtml(d.winner.vendorName)}</span></div>
    <div class="summary-row"><span class="label">Awarded amount</span><span class="value">${fmtCur(d.winner.commercialTotal, d.winner.currency)}</span></div>
    ${d.tender.estimatedBudget != null ? `<div class="summary-row"><span class="label">Budgeted</span><span class="value">${fmtCur(d.tender.estimatedBudget, d.tender.currency)}</span></div>` : ''}
    ${d.winner.negotiationSavings ? `
    <div class="summary-row"><span class="label">Original bid</span><span class="value">${fmtCur(d.winner.negotiationSavings.originalPrice, d.winner.currency)}</span></div>
    <div class="summary-row"><span class="label">Negotiation savings</span><span class="value">${fmtCur(d.winner.negotiationSavings.savingsAmount, d.winner.currency)} (${d.winner.negotiationSavings.savingsPercent.toFixed(1)}% off — ${d.winner.negotiationSavings.roundCount} round(s))</span></div>
    ` : ''}
    <div class="summary-row"><span class="label">Selection basis</span><span class="value">${d.award.isLowest ? 'Lowest commercial price among technically-PASS vendors (auto-selected default)' : 'Override (non-lowest pick — see justification below)'}</span></div>
    <div class="summary-row"><span class="label">Confirmed by</span><span class="value">${escapeHtml(d.award.confirmedByName)}</span></div>
    <div class="summary-row"><span class="label">Confirmed at</span><span class="value">${fmtDate(d.award.confirmedAt)}</span></div>
  </div>

  ${d.award.justificationText ? `
    <h2>Justification</h2>
    <div class="justification">${escapeHtml(d.award.justificationText)}</div>
    ${d.award.justificationPdfFilename ? `<p class="meta" style="margin-top: 4pt;">Attached: <strong>${escapeHtml(d.award.justificationPdfFilename)}</strong> (sha256: <code style="font-size: 8pt;">${d.award.justificationPdfSha256 ?? '—'}</code>)</p>` : ''}
  ` : ''}

  <h2>All Bids Considered</h2>
  <table>
    <thead>
      <tr>
        <th>Vendor</th>
        <th>Technical</th>
        <th class="num">Tech Score</th>
        <th class="num">Original Price</th>
        <th class="num">Negotiated Price</th>
        <th class="num">Final Price</th>
      </tr>
    </thead>
    <tbody>${bidRows || '<tr><td colspan="6">No bids on record.</td></tr>'}</tbody>
  </table>

  ${techMatrix}

  ${boqMatrix}

  ${negotiationMatrix}

  <h2>Committee Attendance</h2>
  <table>
    <thead><tr><th>Member</th><th>Role</th><th>Status</th></tr></thead>
    <tbody>${attendeeRows || '<tr><td colspan="3">No committee session on record.</td></tr>'}</tbody>
  </table>

  <h2>Vendor Notifications</h2>
  <p class="meta">Winner notification: <strong>${d.award.notifyWinner ? 'opted in' : 'opted out'}</strong> · Losers notification: <strong>${d.award.notifyLosers ? 'opted in' : 'opted out'}</strong></p>

  <footer>
    Award id: ${d.award.id} · Generated by CTMP · This document is immutable; each generation is recorded in the audit trail.
  </footer>
</body></html>`;
  }

  private async htmlToPdf(html: string): Promise<Buffer> {
    const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH ?? '/usr/bin/chromium-browser';
    const browser = await puppeteer.launch({
      executablePath,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
    });
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const pdfUint8 = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '0', bottom: '0', left: '0', right: '0' },
      });
      return Buffer.from(pdfUint8);
    } finally {
      await browser.close();
    }
  }
}

// BUG-150 (2026-06-21): keep vendor column headers compact in matrix tables.
function shortName(name: string): string {
  if (name.length <= 22) return name;
  return name.slice(0, 20).trimEnd() + '…';
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
