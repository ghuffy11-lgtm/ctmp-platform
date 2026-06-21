import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
// BUG-105 (2026-06-05): pdfkit's CommonJS export is `module.exports = PDFDocument`
// (no `default` key), but @types/pdfkit declares it as a var, so the previous
// `import PDFDocument from 'pdfkit'` compiled to `pdfkit_1.default` which is
// undefined at runtime — every PDF export failed with "default is not a
// constructor". TS `import = require()` syntax binds the real CommonJS export.
import PDFDocument = require('pdfkit');
import { PrismaService } from '../../database/prisma.service';
import { BrandingService } from '../system-settings/branding.service';
import { SystemSettingsService } from '../system-settings/system-settings.service';

interface RenderInput {
  reportCode: string;
  reportName: string;
  format: 'XLSX' | 'PDF';
  filters?: Record<string, unknown>;
  requestedBy: string;
}

interface ReportRow {
  /** Column header → cell value. Order of keys defines column order. */
  [column: string]: string | number | null | undefined;
}

@Injectable()
export class ReportRendererService {
  constructor(
    private readonly prisma: PrismaService,
    // BUG-107 (2026-06-05): branding service for logo embed + system name read.
    private readonly branding: BrandingService,
    private readonly settings: SystemSettingsService,
  ) {}

  async render(input: RenderInput): Promise<Buffer> {
    const dataset = await this.collectDataset(input);
    return input.format === 'PDF'
      ? this.renderPdf(input, dataset)
      : this.renderXlsx(input, dataset);
  }

  // -------------------------------------------------------------------------
  // Dataset collection — one branch per report code.
  // Each branch returns { columns, rows } so the renderer is generic.
  // -------------------------------------------------------------------------

  private async collectDataset(input: RenderInput): Promise<{ columns: string[]; rows: ReportRow[] }> {
    switch (input.reportCode) {
      case 'tender_summary':         return this.tenderSummary(input);
      case 'tender_lifecycle':       return this.tenderLifecycle(input);
      case 'vendor_directory':       return this.vendorDirectory();
      case 'vendor_activity':        return this.vendorActivity();
      case 'bid_submissions':        return this.bidSubmissions(input);
      case 'technical_evaluations':  return this.technicalEvaluations(input);
      // BUG-045 / Phase G: commercial_comparison removed — see ReportsService catalog.
      case 'award_history':          return this.awardHistory();
      case 'audit_trail':            return this.auditTrail(input);
      default:
        return { columns: ['note'], rows: [{ note: `No collector defined for ${input.reportCode}` }] };
    }
  }

  private async tenderSummary(input: RenderInput) {
    const where = this.tenderDateRange(input);
    const tenders = await this.prisma.tender.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { department: { select: { name: true } } },
    });
    const columns = ['Reference', 'Title', 'Status', 'Department', 'Submission Deadline', 'Created'];
    const rows: ReportRow[] = tenders.map(t => ({
      Reference: t.reference,
      Title: t.title,
      Status: t.status,
      Department: t.department.name,
      'Submission Deadline': t.submissionCloseAt?.toISOString() ?? '',
      Created: t.createdAt.toISOString(),
    }));
    return { columns, rows };
  }

  private async tenderLifecycle(input: RenderInput) {
    const tenders = await this.prisma.tender.findMany({
      where: this.tenderDateRange(input),
      orderBy: { createdAt: 'desc' },
      select: {
        reference: true, title: true, status: true,
        createdAt: true, submissionCloseAt: true, technicalOpeningAt: true,
        awardedAt: true,
      },
    });
    const columns = ['Reference', 'Title', 'Status', 'Created', 'Submission Closed', 'Technical Opened', 'Awarded'];
    return {
      columns,
      rows: tenders.map(t => ({
        Reference: t.reference,
        Title: t.title,
        Status: t.status,
        Created: t.createdAt.toISOString(),
        'Submission Closed': t.submissionCloseAt?.toISOString() ?? '',
        'Technical Opened': t.technicalOpeningAt?.toISOString() ?? '',
        Awarded: t.awardedAt?.toISOString() ?? '',
      })),
    };
  }

  private async vendorDirectory() {
    const vendors = await this.prisma.vendor.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        vendorUsers: { where: { isPrimaryContact: true }, take: 1, select: { email: true, fullName: true } },
      },
    });
    return {
      columns: ['Company', 'Status', 'Contact', 'Email', 'Country', 'Tax #', 'Registered'],
      rows: vendors.map(v => ({
        Company: v.companyName,
        Status: v.status,
        Contact: v.vendorUsers[0]?.fullName ?? '',
        Email: v.vendorUsers[0]?.email ?? '',
        Country: v.country ?? '',
        'Tax #': v.taxNumber ?? '',
        Registered: v.createdAt.toISOString(),
      })),
    };
  }

  private async vendorActivity() {
    const vendors = await this.prisma.vendor.findMany({
      include: {
        _count: { select: { bids: true, tenderClarifications: true } },
        vendorUsers: { take: 1, orderBy: { lastLoginAt: 'desc' }, select: { lastLoginAt: true } },
      },
    });
    return {
      columns: ['Company', 'Status', 'Bids', 'Clarifications', 'Last Login'],
      rows: vendors.map(v => ({
        Company: v.companyName,
        Status: v.status,
        Bids: v._count.bids,
        Clarifications: v._count.tenderClarifications,
        'Last Login': v.vendorUsers[0]?.lastLoginAt?.toISOString() ?? '',
      })),
    };
  }

  private async bidSubmissions(input: RenderInput) {
    const bids = await this.prisma.bid.findMany({
      where: this.bidDateRange(input),
      include: {
        tender: { select: { reference: true } },
        vendor: { select: { companyName: true } },
        bidEnvelopes: { select: { envelopeType: true, status: true } },
      },
      orderBy: { submittedAt: 'desc' },
    });
    return {
      columns: ['Tender', 'Vendor', 'Bid Status', 'Submitted', 'Technical Env', 'Commercial Env'],
      rows: bids.map(b => ({
        Tender: b.tender.reference,
        Vendor: b.vendor.companyName,
        'Bid Status': b.status,
        Submitted: b.submittedAt?.toISOString() ?? '',
        'Technical Env': b.bidEnvelopes.find(e => e.envelopeType === 'TECHNICAL')?.status ?? '',
        'Commercial Env': b.bidEnvelopes.find(e => e.envelopeType === 'COMMERCIAL')?.status ?? '',
      })),
    };
  }

  private async technicalEvaluations(input: RenderInput) {
    const evals = await this.prisma.technicalEvaluation.findMany({
      include: {
        bid: { include: { tender: { select: { reference: true } }, vendor: { select: { companyName: true } } } },
        evaluatorUser: { select: { displayName: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
    return {
      columns: ['Tender', 'Vendor', 'Evaluator', 'Score', 'Result', 'Finalized'],
      rows: evals.map(e => ({
        Tender: e.bid.tender.reference,
        Vendor: e.bid.vendor.companyName,
        Evaluator: e.evaluatorUser.displayName,
        Score: e.overallScore ? Number(e.overallScore) : null,
        Result: e.result,
        Finalized: e.finalizedAt?.toISOString() ?? '',
      })),
    };
  }

  private async awardHistory() {
    // BUG-105 (2026-06-05): the renderer used to read t.awardedAmount directly,
    // but on staging that column is NULL for every awarded tender (BUG-088 —
    // confirmAward never populated it). The download looked empty in the money
    // column. Apply the same fallback AnalyticsService._resolveAwardedAmount
    // uses: fall back to the awarded vendor's bid's latest CommercialEvaluation
    // total when the tender column is null.
    // BUG-115 (2026-06-09): two additional columns — `Original Price` and
    // `Negotiation Savings %` — when the awarded bid went through negotiation.
    // The existing `Awarded Amount` column now reflects the negotiated price
    // (via the same resolver chain analytics uses).
    const tenders = await this.prisma.tender.findMany({
      where: { awardedAt: { not: null } },
      include: {
        awardedVendor: { select: { companyName: true } },
        bids: {
          where: { isAlternative: false },
          select: {
            vendorId: true,
            commercialEvaluations: {
              select: { totalPrice: true, createdAt: true },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
            negotiationInvitations: {
              select: {
                round: { select: { roundNumber: true } },
                submission: { select: { totalPrice: true } },
              },
            },
          },
        },
      },
      orderBy: { awardedAt: 'desc' },
    });
    return {
      columns: [
        'Reference',
        'Title',
        'Awarded Vendor',
        'Awarded Amount',
        'Original Price',
        'Negotiation Savings %',
        'Awarded At',
      ],
      rows: tenders.map(t => {
        const awardedBid = t.awardedVendorId
          ? t.bids.find(b => b.vendorId === t.awardedVendorId)
          : undefined;
        // Original price = latest CommercialEvaluation total (used as the
        // pre-negotiation baseline). Falls back to tender.awardedAmount when
        // no CE row exists (legacy).
        const originalPrice = awardedBid?.commercialEvaluations?.[0]?.totalPrice != null
          ? Number(awardedBid.commercialEvaluations[0].totalPrice)
          : (t.awardedAmount != null ? Number(t.awardedAmount) : null);
        // Latest negotiation submission (newest round first).
        const submitted = (awardedBid?.negotiationInvitations ?? [])
          .filter((i: any) => i.submission?.totalPrice != null)
          .sort((a: any, b: any) => b.round.roundNumber - a.round.roundNumber);
        const negotiated = submitted.length > 0 ? Number(submitted[0].submission!.totalPrice) : null;
        // Awarded Amount = negotiated when present, else BUG-088 fallback.
        let amount: number | null = negotiated != null
          ? negotiated
          : (t.awardedAmount != null ? Number(t.awardedAmount) : null);
        if (amount == null && originalPrice != null) amount = originalPrice;
        const savingsPercent = (negotiated != null && originalPrice != null && originalPrice > 0)
          ? Number((((originalPrice - negotiated) / originalPrice) * 100).toFixed(2))
          : null;
        return {
          Reference: t.reference,
          Title: t.title,
          'Awarded Vendor': t.awardedVendor?.companyName ?? '',
          'Awarded Amount': amount,
          'Original Price': originalPrice,
          'Negotiation Savings %': savingsPercent,
          'Awarded At': t.awardedAt?.toISOString() ?? '',
        };
      }),
    };
  }

  private async auditTrail(input: RenderInput) {
    const fromDate = typeof input.filters?.fromDate === 'string' ? new Date(input.filters.fromDate) : undefined;
    const toDate = typeof input.filters?.toDate === 'string' ? new Date(input.filters.toDate) : undefined;
    const logs = await this.prisma.auditLog.findMany({
      where: {
        ...(fromDate || toDate ? { eventTime: { gte: fromDate, lte: toDate } } : {}),
      },
      orderBy: { id: 'desc' },
      take: 10000,
    });
    return {
      columns: ['Time', 'Event', 'Entity', 'Risk', 'Actor', 'Reason'],
      rows: logs.map(l => ({
        Time: l.eventTime.toISOString(),
        Event: l.eventType,
        Entity: `${l.entityType} ${l.entityId ?? ''}`.trim(),
        Risk: l.riskLevel,
        Actor: l.actorUserId ?? l.actorVendorUserId ?? '',
        Reason: l.reason ?? '',
      })),
    };
  }

  private tenderDateRange(input: RenderInput) {
    const fromDate = typeof input.filters?.fromDate === 'string' ? new Date(input.filters.fromDate) : undefined;
    const toDate = typeof input.filters?.toDate === 'string' ? new Date(input.filters.toDate) : undefined;
    const departmentId = typeof input.filters?.departmentId === 'string' ? input.filters.departmentId : undefined;
    return {
      ...(fromDate || toDate ? { createdAt: { gte: fromDate, lte: toDate } } : {}),
      ...(departmentId ? { departmentId } : {}),
    };
  }

  private bidDateRange(input: RenderInput) {
    const fromDate = typeof input.filters?.fromDate === 'string' ? new Date(input.filters.fromDate) : undefined;
    const toDate = typeof input.filters?.toDate === 'string' ? new Date(input.filters.toDate) : undefined;
    return fromDate || toDate ? { createdAt: { gte: fromDate, lte: toDate } } : {};
  }

  // -------------------------------------------------------------------------
  // Format-specific rendering
  // -------------------------------------------------------------------------

  private async renderXlsx(input: RenderInput, dataset: { columns: string[]; rows: ReportRow[] }): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    // BUG-107 Piece 2: workbook.creator is the configurable system name.
    const branding = await this.settings.getPublicBranding();
    workbook.creator = branding.systemName;
    workbook.company = branding.systemName;
    workbook.created = new Date();

    const sheet = workbook.addWorksheet(input.reportName.slice(0, 31));
    sheet.columns = dataset.columns.map(c => ({ header: c, key: c, width: Math.max(c.length + 2, 14) }));
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };

    for (const row of dataset.rows) sheet.addRow(row);
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: dataset.columns.length } };

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer as ArrayBuffer);
  }

  private async renderPdf(input: RenderInput, dataset: { columns: string[]; rows: ReportRow[] }): Promise<Buffer> {
    // BUG-107 Piece 2/3: resolve branding for header (logo + system name)
    // before opening the PDF stream so we can embed both atomically.
    const branding = await this.settings.getPublicBranding();
    const logoBuffer = branding.hasReportLogo ? await this.branding.readBuffer('report_logo') : null;
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 36, layout: 'landscape' });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // BUG-107 Piece 3: branding header — logo on the left, system name on
      // the right of the report title. Falls back to text-only if no logo.
      if (logoBuffer) {
        try {
          doc.image(logoBuffer, 36, 30, { fit: [120, 40] });
          doc.fontSize(9).fillColor('#94A3B8').text(branding.systemName, 160, 36, { align: 'left' });
          doc.fillColor('#0F172A');
          doc.moveDown(2);
        } catch {
          // logo decode failed — render text header only
          doc.fontSize(11).fillColor('#475569').text(branding.systemName, { align: 'left' });
          doc.fillColor('#0F172A');
        }
      } else {
        doc.fontSize(11).fillColor('#475569').text(branding.systemName, { align: 'left' });
        doc.fillColor('#0F172A');
      }

      doc.fontSize(18).text(input.reportName, { align: 'left' });
      doc.fontSize(10).fillColor('#475569').text(`Generated: ${new Date().toISOString()}`);
      doc.moveDown(0.5);
      if (input.filters && Object.keys(input.filters).length > 0) {
        doc.text(`Filters: ${JSON.stringify(input.filters)}`);
      }
      doc.moveDown();

      const pageWidth = doc.page.width - 72;
      const colWidth = pageWidth / dataset.columns.length;

      // Header row
      doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(9);
      let x = 36;
      const headerY = doc.y;
      for (const col of dataset.columns) {
        doc.text(col, x, headerY, { width: colWidth - 4, ellipsis: true });
        x += colWidth;
      }
      doc.moveDown();
      doc.font('Helvetica').fontSize(8).fillColor('#0F172A');

      // Rows
      for (const row of dataset.rows) {
        if (doc.y > doc.page.height - 60) doc.addPage();
        const y = doc.y;
        let cx = 36;
        for (const col of dataset.columns) {
          const v = row[col];
          doc.text(v === null || v === undefined ? '' : String(v), cx, y, {
            width: colWidth - 4, ellipsis: true,
          });
          cx += colWidth;
        }
        doc.moveDown(0.6);
      }

      doc.end();
    });
  }
}
