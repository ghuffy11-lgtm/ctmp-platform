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

interface AwardMinutesData {
  tender: {
    reference: string;
    title: string;
    departmentName: string;
    departmentCode: string;
    awardedAt: string;
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
  winner: { vendorName: string; commercialTotal: number | null; currency: string };
  bids: Array<{
    vendorName: string;
    technicalResult: 'PASS' | 'FAIL' | 'PENDING';
    technicalScore: number | null;
    technicalMaxScore: number | null;
    commercialTotal: number | null;
    currency: string;
    isWinner: boolean;
  }>;
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

    const winningBid = await this.prisma.bid.findFirst({
      where: { id: award.recommendedBidId },
      include: {
        vendor: { select: { companyName: true } },
        commercialEvaluations: { select: { totalPrice: true, currency: true } },
      },
    });
    const winnerPrices = (winningBid?.commercialEvaluations ?? [])
      .map(e => (e.totalPrice != null ? Number(e.totalPrice) : null))
      .filter((v): v is number => typeof v === 'number');
    const winnerTotal = winnerPrices.length > 0
      ? winnerPrices.reduce((s, v) => s + v, 0) / winnerPrices.length
      : null;
    const winnerCurrency = winningBid?.commercialEvaluations.find(e => e.currency)?.currency ?? 'KWD';

    const allBids = await this.prisma.bid.findMany({
      where: { tenderId },
      include: {
        vendor: { select: { companyName: true } },
        technicalEvaluations: { select: { overallScore: true } },
        commercialEvaluations: { select: { totalPrice: true, currency: true } },
      },
      orderBy: { submittedAt: 'asc' },
    });

    const criteria = await this.prisma.tenderTechnicalCriterion.findMany({ where: { tenderId } });
    const techMax = criteria.reduce((s, c) => s + Number(c.maxScore), 0) || null;

    const bids = allBids.map(b => {
      const techScores = b.technicalEvaluations
        .map(e => (e.overallScore != null ? Number(e.overallScore) : null))
        .filter((v): v is number => typeof v === 'number');
      const techScore = techScores.length > 0
        ? techScores.reduce((s, v) => s + v, 0) / techScores.length
        : null;
      const prices = b.commercialEvaluations
        .map(e => (e.totalPrice != null ? Number(e.totalPrice) : null))
        .filter((v): v is number => typeof v === 'number');
      const commercialTotal = prices.length > 0
        ? prices.reduce((s, v) => s + v, 0) / prices.length
        : null;
      const currency = b.commercialEvaluations.find(e => e.currency)?.currency ?? 'KWD';
      return {
        vendorName: b.vendor.companyName,
        technicalResult: b.technicalResult as 'PASS' | 'FAIL' | 'PENDING',
        technicalScore: techScore,
        technicalMaxScore: techMax,
        commercialTotal,
        currency,
        isWinner: b.id === award.recommendedBidId,
      };
    });

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
        vendorName: winningBid?.vendor.companyName ?? 'unknown',
        commercialTotal: winnerTotal,
        currency: winnerCurrency,
      },
      bids,
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

    const bidRows = d.bids.map(b => `
      <tr class="${b.isWinner ? 'winner' : ''} ${b.technicalResult === 'FAIL' ? 'failed' : ''}">
        <td>${escapeHtml(b.vendorName)}${b.isWinner ? ' <strong>(awarded)</strong>' : ''}</td>
        <td>${b.technicalResult}</td>
        <td class="num">${fmtScore(b.technicalScore, b.technicalMaxScore)}</td>
        <td class="num">${fmtCur(b.commercialTotal, b.currency)}</td>
      </tr>
    `).join('');

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
  body { font-family: 'Noto Sans', 'Inter', sans-serif; font-size: 11pt; color: #1a1c1e; padding: 20mm 18mm; line-height: 1.45; }
  h1 { font-size: 22pt; margin: 0 0 4pt; }
  h2 { font-size: 13pt; margin: 18pt 0 6pt; border-bottom: 2pt solid #022448; padding-bottom: 3pt; color: #022448; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3pt solid #022448; padding-bottom: 12pt; }
  .ref { font-family: 'Courier New', monospace; font-size: 10pt; color: #555; }
  .meta { font-size: 9.5pt; color: #555; line-height: 1.6; }
  table { width: 100%; border-collapse: collapse; margin-top: 6pt; }
  th, td { border: 1pt solid #ccc; padding: 5pt 7pt; text-align: left; }
  th { background: #f0f3f7; font-size: 9.5pt; text-transform: uppercase; letter-spacing: 0.4pt; }
  td.num { text-align: right; font-family: 'Courier New', monospace; }
  tr.winner td { background: #e6f7ec; font-weight: 600; }
  tr.failed td { color: #888; }
  .summary-box { background: #f7f8fb; border: 1pt solid #d0d5dd; padding: 10pt 12pt; border-radius: 4pt; margin-top: 8pt; }
  .summary-row { display: flex; justify-content: space-between; padding: 2pt 0; }
  .summary-row .label { color: #555; }
  .summary-row .value { font-weight: 600; }
  .justification { background: #fff8e6; border-left: 3pt solid #d8a800; padding: 8pt 10pt; margin-top: 6pt; font-size: 10pt; white-space: pre-wrap; }
  .amendment-banner { background: #fff3e0; border: 1pt solid #ff9800; padding: 6pt 10pt; border-radius: 3pt; margin-top: 6pt; font-size: 10pt; }
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
    <div class="summary-row"><span class="label">Selection basis</span><span class="value">${d.award.isLowest ? 'Lowest commercial price among technically-PASS vendors (auto-selected default)' : 'Override (non-lowest pick — see justification below)'}</span></div>
    <div class="summary-row"><span class="label">Confirmed by</span><span class="value">${escapeHtml(d.award.confirmedByName)}</span></div>
    <div class="summary-row"><span class="label">Confirmed at</span><span class="value">${fmtDate(d.award.confirmedAt)}</span></div>
  </div>

  ${d.award.justificationText ? `
    <h2>Justification</h2>
    <div class="justification">${escapeHtml(d.award.justificationText)}</div>
    ${d.award.justificationPdfFilename ? `<p class="meta" style="margin-top: 4pt;">Attached: <strong>${escapeHtml(d.award.justificationPdfFilename)}</strong> (sha256: <code style="font-size: 8pt;">${d.award.justificationPdfSha256 ?? '—'}</code>)</p>` : ''}
  ` : ''}

  <h2>All bids considered</h2>
  <table>
    <thead><tr><th>Vendor</th><th>Technical</th><th>Score</th><th>Commercial total</th></tr></thead>
    <tbody>${bidRows || '<tr><td colspan="4">No bids on record.</td></tr>'}</tbody>
  </table>

  <h2>Committee attendance</h2>
  <table>
    <thead><tr><th>Member</th><th>Role</th><th>Status</th></tr></thead>
    <tbody>${attendeeRows || '<tr><td colspan="3">No committee session on record.</td></tr>'}</tbody>
  </table>

  <h2>Vendor notifications</h2>
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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
