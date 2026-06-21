import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import {
  AuditRiskLevel,
  BidBoqStatus,
  NegotiationInvitationStatus,
  TechnicalResult,
  TenderStatus,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SystemSettingsService } from '../system-settings/system-settings.service';
import { NegotiationStorageService } from './negotiation-storage.service';
import { LaunchNegotiationDto } from './dto/launch-negotiation.dto';
import { SubmitNegotiationDto } from './dto/submit-negotiation.dto';
import { CloseNegotiationDto } from './dto/close-negotiation.dto';

// BUG-115 (2026-06-09): negotiation workflow service. See plan +
// IN_APP_COMPARISON_MASTER_PLAN_2026-05-27.md §10.

interface MulterFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

interface PendingNegotiationPdf {
  id: string;
  storageKey: string;
  sha256: string;
  filename: string;
  uploadedAt: number;
}

const PENDING_TTL_MS = 15 * 60 * 1000;

// States in which Procurement can launch a negotiation round.
const LAUNCH_ALLOWED_STATES: TenderStatus[] = [
  TenderStatus.COMMERCIAL_EVALUATION,
  TenderStatus.NEGOTIATION,
];

@Injectable()
export class NegotiationService {
  private readonly logger = new Logger(NegotiationService.name);

  // In-memory holding tank — same pattern as AwardService.pendingJustifications.
  // Vendor uploads PDF first, gets documentId back, references it in the
  // POST /submissions body within 15 min.
  private static readonly pendingPdfs = new Map<string, PendingNegotiationPdf>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: NegotiationStorageService,
    // BUG-127 (2026-06-11): optional launch-email dispatch.
    private readonly notifications: NotificationsService,
    private readonly settings: SystemSettingsService,
    private readonly config: ConfigService,
  ) {}

  private static gcPending() {
    const now = Date.now();
    for (const [id, p] of NegotiationService.pendingPdfs) {
      if (now - p.uploadedAt > PENDING_TTL_MS) {
        NegotiationService.pendingPdfs.delete(id);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Vendor: upload the revised commercial PDF; returns documentId.
  // -------------------------------------------------------------------------
  async uploadCommercialPdf(tenderId: string, file: MulterFile, vendorUserId: string) {
    if (!file) throw new BadRequestException('File is required');
    if (file.mimetype !== 'application/pdf') {
      throw new BadRequestException('Only PDF files are accepted for negotiation submissions.');
    }
    const head = file.buffer?.subarray(0, 5).toString('ascii');
    if (head !== '%PDF-') {
      throw new BadRequestException('File does not appear to be a valid PDF.');
    }
    NegotiationService.gcPending();

    const docId = randomUUID();
    const { storageKey, sha256 } = await this.storage.write({
      tenderId,
      docId,
      originalFilename: file.originalname,
      payload: file.buffer,
    });
    NegotiationService.pendingPdfs.set(docId, {
      id: docId,
      storageKey,
      sha256,
      filename: file.originalname,
      uploadedAt: Date.now(),
    });
    await this.audit.log({
      eventType: 'NEGOTIATION_PDF_UPLOADED',
      entityType: 'NegotiationPdf',
      entityId: docId,
      tenderId,
      actorVendorUserId: vendorUserId,
      afterValue: { filename: file.originalname, sha256 },
      riskLevel: AuditRiskLevel.MEDIUM,
    });
    return {
      documentId: docId,
      filename: file.originalname,
      sha256,
      expiresInSeconds: Math.floor(PENDING_TTL_MS / 1000),
    };
  }

  // -------------------------------------------------------------------------
  // Procurement: launch a new round (closes any open prior round atomically).
  // -------------------------------------------------------------------------
  async launchRound(tenderId: string, dto: LaunchNegotiationDto, userId: string) {
    const tender = await this.prisma.tender.findUnique({
      where: { id: tenderId },
      select: { id: true, status: true },
    });
    if (!tender) throw new NotFoundException('Tender not found');
    if (!LAUNCH_ALLOWED_STATES.includes(tender.status)) {
      throw new BadRequestException(
        `Negotiation can only be launched from Commercial Evaluation / Comparison or an existing Negotiation round (current: ${tender.status}).`,
      );
    }

    // Validate that all bidIds are PASS bids on this tender.
    const invitedBids = await this.prisma.bid.findMany({
      where: { id: { in: dto.bidIds }, tenderId },
      select: { id: true, technicalResult: true },
    });
    if (invitedBids.length !== dto.bidIds.length) {
      throw new BadRequestException('Some invited bids do not belong to this tender.');
    }
    const nonPass = invitedBids.filter(b => b.technicalResult !== TechnicalResult.PASS);
    if (nonPass.length > 0) {
      throw new BadRequestException(
        `Only technically-PASS bids can be invited to negotiation. Excluded: ${nonPass.map(b => b.id).join(', ')}`,
      );
    }

    const result = await this.prisma.$transaction(async tx => {
      // Close any open prior round automatically — launching N+1 implies N is done.
      await tx.negotiationRound.updateMany({
        where: { tenderId, closedAt: null },
        data: { closedAt: new Date(), closedBy: userId, closeReason: 'Auto-closed when launching the next round.' },
      });

      // Compute next round number.
      const latest = await tx.negotiationRound.findFirst({
        where: { tenderId },
        orderBy: { roundNumber: 'desc' },
        select: { roundNumber: true },
      });
      const nextRoundNumber = (latest?.roundNumber ?? 0) + 1;

      const round = await tx.negotiationRound.create({
        data: {
          tenderId,
          roundNumber: nextRoundNumber,
          launchedBy: userId,
          launchReason: dto.reason.trim(),
        },
      });
      await tx.negotiationInvitation.createMany({
        data: dto.bidIds.map(bidId => ({ roundId: round.id, bidId })),
        skipDuplicates: true,
      });

      // Flip tender status to NEGOTIATION if it isn't already.
      if (tender.status !== TenderStatus.NEGOTIATION) {
        await tx.tender.update({
          where: { id: tenderId },
          data: { status: TenderStatus.NEGOTIATION },
        });
      }
      return round;
    });

    await this.audit.log({
      eventType: 'NEGOTIATION_ROUND_LAUNCHED',
      entityType: 'NegotiationRound',
      entityId: result.id,
      tenderId,
      actorUserId: userId,
      afterValue: {
        roundNumber: result.roundNumber,
        bidIds: dto.bidIds,
        reason: dto.reason,
        emailDispatched: dto.sendEmail === true,
      },
      riskLevel: AuditRiskLevel.HIGH,
    });

    // BUG-127 (2026-06-11): optional email dispatch on launch.
    if (dto.sendEmail) {
      this.dispatchNegotiationLaunchEmails(
        tenderId,
        result.id,
        result.roundNumber,
        dto.reason.trim(),
        dto.bidIds,
        userId,
      ).catch(err =>
        this.logger.error(`Negotiation launch email dispatch failed tender=${tenderId} round=${result.id}: ${err}`),
      );
    }

    return this.listRoundsForTender(tenderId);
  }

  // BUG-127 (2026-06-11): dispatcher for the launch-time invitation email.
  // One email per invited vendor; BCC = vendor users + extras from the
  // existing tender_vendors row (same data BUG-120 invitation flow uses).
  private async dispatchNegotiationLaunchEmails(
    tenderId: string,
    roundId: string,
    roundNumber: number,
    launchReason: string,
    bidIds: string[],
    actorUserId: string,
  ) {
    const tender = await this.prisma.tender.findUnique({
      where: { id: tenderId },
      select: { id: true, reference: true, title: true },
    });
    if (!tender) return;

    // Build per-bid → vendor map with the BCC list (vendor users + extras
    // from tender_vendors where the row exists).
    const bids = await this.prisma.bid.findMany({
      where: { id: { in: bidIds }, tenderId },
      select: {
        id: true,
        vendorId: true,
        vendor: {
          select: {
            companyName: true,
            vendorUsers: { select: { email: true, status: true } },
          },
        },
      },
    });
    const tenderVendors = await this.prisma.tenderVendor.findMany({
      where: { tenderId, vendorId: { in: bids.map(b => b.vendorId) } },
      select: { vendorId: true, extraNotificationEmails: true },
    });
    const extrasByVendor = new Map(tenderVendors.map(tv => [tv.vendorId, tv.extraNotificationEmails ?? []]));

    const systemNameRow = await this.prisma.systemSetting.findUnique({ where: { key: 'branding.system_name' } });
    const portalUrlRow = await this.prisma.systemSetting.findUnique({ where: { key: 'branding.vendor_portal_url' } });
    const systemName = systemNameRow?.value || 'CTMP';
    // BUG-144 (2026-06-19): registered app.vendorPortalUrl is always present
    // with a hardcoded fallback, so emails always contain an absolute URL.
    const vendorPortalUrl = portalUrlRow?.value
      || this.config.get<string>('app.vendorPortalUrl')
      || '';
    const tenderUrl = `${vendorPortalUrl.replace(/\/+$/, '')}/tenders/${tender.id}`;

    const smtpCfg = await this.settings.resolveSmtpConfig();
    const platformFrom = smtpCfg.from || 'no-reply@ctmp.local';

    for (const bid of bids) {
      const vendorEmails = (bid.vendor.vendorUsers ?? [])
        .filter(u => u.status === 'ACTIVE')
        .map(u => u.email);
      const extras = extrasByVendor.get(bid.vendorId) ?? [];
      const bcc = Array.from(new Set([...vendorEmails, ...extras].map(e => e.trim().toLowerCase()).filter(Boolean)));
      if (bcc.length === 0) {
        this.logger.warn(`negotiation launch email: no recipients for tender=${tenderId} bid=${bid.id}`);
        continue;
      }

      try {
        await this.notifications.sendEmailWithBcc(
          platformFrom,
          bcc,
          'TENDER_NEGOTIATION_LAUNCHED',
          {
            systemName,
            vendorName: bid.vendor.companyName ?? '',
            tenderReference: tender.reference ?? '',
            tenderTitle: tender.title ?? '',
            roundNumber: String(roundNumber),
            launchReason,
            vendorPortalUrl,
            tenderUrl,
          },
        );
        await this.audit.log({
          eventType: 'NEGOTIATION_INVITATION_NOTIFIED',
          entityType: 'NegotiationRound',
          entityId: roundId,
          tenderId,
          bidId: bid.id,
          vendorId: bid.vendorId,
          actorUserId,
          afterValue: { recipientCount: bcc.length, roundNumber },
          riskLevel: AuditRiskLevel.MEDIUM,
        });
      } catch (err) {
        this.logger.error(`launch email failed for bid=${bid.id}: ${err}`);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Procurement: close the currently-open round without launching another.
  // Reverts tender state to COMMERCIAL_EVALUATION so comparison resumes.
  // -------------------------------------------------------------------------
  async closeOpenRound(tenderId: string, dto: CloseNegotiationDto, userId: string) {
    const open = await this.prisma.negotiationRound.findFirst({
      where: { tenderId, closedAt: null },
      orderBy: { roundNumber: 'desc' },
    });
    if (!open) throw new NotFoundException('No open negotiation round on this tender.');

    await this.prisma.$transaction(async tx => {
      await tx.negotiationRound.update({
        where: { id: open.id },
        data: { closedAt: new Date(), closedBy: userId, closeReason: dto.reason ?? null },
      });
      await tx.tender.update({
        where: { id: tenderId },
        data: { status: TenderStatus.COMMERCIAL_EVALUATION },
      });
    });

    await this.audit.log({
      eventType: 'NEGOTIATION_ROUND_CLOSED',
      entityType: 'NegotiationRound',
      entityId: open.id,
      tenderId,
      actorUserId: userId,
      afterValue: { roundNumber: open.roundNumber, reason: dto.reason ?? null },
      riskLevel: AuditRiskLevel.MEDIUM,
    });

    return this.listRoundsForTender(tenderId);
  }

  // -------------------------------------------------------------------------
  // Vendor: submit revised BoQ prices + PDF for an open invitation.
  // -------------------------------------------------------------------------
  async submitNegotiation(
    tenderId: string,
    dto: SubmitNegotiationDto,
    vendorUserId: string,
  ) {
    // Per-line validation matches the existing bid_boq_items_status_price_consistent CHECK.
    for (const line of dto.boqLines) {
      if (line.status === 'BIDDING' && (line.unitPrice == null || line.unitPrice < 0)) {
        throw new BadRequestException(`BoQ line ${line.tenderBoqItemId}: BIDDING requires a non-negative unit price.`);
      }
      if (line.status === 'NOT_BIDDING' && line.unitPrice != null) {
        throw new BadRequestException(`BoQ line ${line.tenderBoqItemId}: NOT_BIDDING must not carry a unit price.`);
      }
    }

    const invitation = await this.prisma.negotiationInvitation.findUnique({
      where: { id: dto.invitationId },
      include: {
        round: { select: { id: true, tenderId: true, closedAt: true, roundNumber: true } },
        bid: { select: { id: true, vendorId: true } },
        submission: { select: { id: true } },
      },
    });
    if (!invitation) throw new NotFoundException('Invitation not found');
    if (invitation.round.tenderId !== tenderId) {
      throw new BadRequestException('Invitation does not belong to this tender.');
    }
    if (invitation.round.closedAt) {
      throw new BadRequestException('This negotiation round is closed; submission is no longer accepted.');
    }
    if (invitation.submission) {
      throw new BadRequestException('A submission already exists for this invitation. Submissions are immutable.');
    }

    // Vendor authorisation: caller's vendor must own the parent bid.
    const vendorUser = await this.prisma.vendorUser.findUnique({
      where: { id: vendorUserId },
      select: { vendorId: true },
    });
    if (!vendorUser || vendorUser.vendorId !== invitation.bid.vendorId) {
      throw new ForbiddenException('You can only submit on negotiation invitations for your own vendor.');
    }

    // Resolve pending PDF.
    NegotiationService.gcPending();
    const pending = NegotiationService.pendingPdfs.get(dto.commercialPdfDocumentId);
    if (!pending) {
      throw new BadRequestException(
        'Commercial PDF reference is invalid or expired. Re-upload the PDF and try again.',
      );
    }

    // Validate each BoQ line references this tender (defence-in-depth).
    const templateIds = await this.prisma.tenderBoqItem.findMany({
      where: { tenderId, id: { in: dto.boqLines.map(l => l.tenderBoqItemId) } },
      select: { id: true, qty: true },
    });
    if (templateIds.length !== dto.boqLines.length) {
      throw new BadRequestException('Some BoQ line ids do not belong to this tender.');
    }
    const qtyByLineId = new Map(templateIds.map(r => [r.id, Number(r.qty)]));

    // Compute total price = sum(qty * unitPrice) for BIDDING rows.
    const totalPrice = dto.boqLines.reduce((sum, l) => {
      if (l.status !== 'BIDDING' || l.unitPrice == null) return sum;
      return sum + Number(l.unitPrice) * (qtyByLineId.get(l.tenderBoqItemId) ?? 0);
    }, 0);

    const submission = await this.prisma.$transaction(async tx => {
      const created = await tx.bidNegotiationSubmission.create({
        data: {
          invitationId: invitation.id,
          submittedByVendorUserId: vendorUserId,
          totalPrice,
          commercialPdfStorageKey: pending.storageKey,
          commercialPdfSha256: pending.sha256,
          commercialPdfFilename: pending.filename,
          remarks: dto.remarks ?? null,
          boqItems: {
            createMany: {
              data: dto.boqLines.map(l => ({
                tenderBoqItemId: l.tenderBoqItemId,
                status: l.status as BidBoqStatus,
                unitPrice: l.status === 'BIDDING' ? l.unitPrice ?? null : null,
                remarks: l.remarks ?? null,
              })),
            },
          },
        },
      });
      await tx.negotiationInvitation.update({
        where: { id: invitation.id },
        data: { status: NegotiationInvitationStatus.SUBMITTED },
      });
      return created;
    });

    NegotiationService.pendingPdfs.delete(dto.commercialPdfDocumentId);

    await this.audit.log({
      eventType: 'NEGOTIATION_SUBMITTED',
      entityType: 'BidNegotiationSubmission',
      entityId: submission.id,
      tenderId,
      bidId: invitation.bid.id,
      actorVendorUserId: vendorUserId,
      afterValue: {
        invitationId: invitation.id,
        roundNumber: invitation.round.roundNumber,
        totalPrice,
        pdfFilename: pending.filename,
      },
      riskLevel: AuditRiskLevel.MEDIUM,
    });

    return submission;
  }

  // -------------------------------------------------------------------------
  // Admin: list all rounds + invitations + submissions for a tender.
  // -------------------------------------------------------------------------
  async listRoundsForTender(tenderId: string) {
    const rounds = await this.prisma.negotiationRound.findMany({
      where: { tenderId },
      orderBy: { roundNumber: 'asc' },
      include: {
        launchedByUser: { select: { displayName: true, email: true } },
        closedByUser:   { select: { displayName: true, email: true } },
        invitations: {
          include: {
            bid: { select: { id: true, vendorId: true, vendor: { select: { companyName: true } } } },
            submission: {
              include: {
                boqItems: true,
              },
            },
          },
        },
      },
    });
    return {
      tenderId,
      rounds: rounds.map(r => ({
        id: r.id,
        roundNumber: r.roundNumber,
        launchedAt: r.launchedAt.toISOString(),
        launchedByName: r.launchedByUser?.displayName ?? r.launchedByUser?.email ?? '—',
        launchReason: r.launchReason,
        closedAt: r.closedAt?.toISOString() ?? null,
        closedByName: r.closedByUser?.displayName ?? r.closedByUser?.email ?? null,
        closeReason: r.closeReason,
        invitations: r.invitations.map(inv => ({
          id: inv.id,
          bidId: inv.bid.id,
          vendorId: inv.bid.vendorId,
          vendorName: inv.bid.vendor?.companyName ?? '—',
          status: inv.status,
          invitedAt: inv.invitedAt.toISOString(),
          submission: inv.submission ? {
            id: inv.submission.id,
            submittedAt: inv.submission.submittedAt.toISOString(),
            totalPrice: inv.submission.totalPrice == null ? null : Number(inv.submission.totalPrice),
            currency: inv.submission.currency,
            commercialPdfFilename: inv.submission.commercialPdfFilename,
            remarks: inv.submission.remarks,
            boqLines: inv.submission.boqItems.map(b => ({
              tenderBoqItemId: b.tenderBoqItemId,
              status: b.status,
              unitPrice: b.unitPrice == null ? null : Number(b.unitPrice),
              remarks: b.remarks,
            })),
          } : null,
        })),
      })),
    };
  }

  // -------------------------------------------------------------------------
  // Vendor: list all open invitations for this vendor user.
  // -------------------------------------------------------------------------
  async listInvitationsForVendorUser(vendorUserId: string) {
    const vendorUser = await this.prisma.vendorUser.findUnique({
      where: { id: vendorUserId },
      select: { vendorId: true },
    });
    if (!vendorUser) return { invitations: [] };

    // BUG-128 (2026-06-11): include closed rounds + submission detail so
    // the vendor's NegotiationSection on the bid detail page can render
    // past submitted rounds (read-only) AND the open invitation form
    // without needing to also hit the admin-only /tenders/:id/negotiation
    // route (which was returning 401 → forcing the vendor to logout).
    const invitations = await this.prisma.negotiationInvitation.findMany({
      where: {
        bid: { vendorId: vendorUser.vendorId },
      },
      include: {
        round: { select: { id: true, tenderId: true, roundNumber: true, launchedAt: true, launchReason: true, closedAt: true } },
        bid: { select: { id: true, tenderId: true, tender: { select: { reference: true, title: true } } } },
        submission: {
          include: { boqItems: true },
        },
      },
      orderBy: { invitedAt: 'desc' },
    });

    return {
      invitations: invitations.map(inv => ({
        id: inv.id,
        status: inv.status,
        invitedAt: inv.invitedAt.toISOString(),
        bidId: inv.bid.id,
        tenderId: inv.bid.tenderId,
        tenderReference: inv.bid.tender?.reference ?? '—',
        tenderTitle: inv.bid.tender?.title ?? '—',
        roundNumber: inv.round.roundNumber,
        roundLaunchedAt: inv.round.launchedAt.toISOString(),
        roundLaunchReason: inv.round.launchReason,
        roundClosedAt: inv.round.closedAt?.toISOString() ?? null,
        submission: inv.submission
          ? {
              id: inv.submission.id,
              submittedAt: inv.submission.submittedAt.toISOString(),
              totalPrice: inv.submission.totalPrice == null ? null : Number(inv.submission.totalPrice),
              currency: inv.submission.currency,
              commercialPdfFilename: inv.submission.commercialPdfFilename,
              remarks: inv.submission.remarks,
              boqLines: (inv.submission.boqItems ?? []).map(b => ({
                tenderBoqItemId: b.tenderBoqItemId,
                status: b.status,
                unitPrice: b.unitPrice == null ? null : Number(b.unitPrice),
              })),
            }
          : null,
      })),
    };
  }

  // -------------------------------------------------------------------------
  // BUG-129 (2026-06-11): view/download a negotiation submission's PDF.
  // Mirrors BidsService.viewBidDocument permission model:
  //   - Admin with comparison:commercial:view or commercial:view → allowed.
  //   - Vendor whose vendor owns the parent bid → allowed.
  //   - Otherwise → 403.
  // Inline view writes a NEGOTIATION_PDF_VIEWED audit row when an admin is the
  // actor. Download writes _DOWNLOADED. Vendor self-view is not audited
  // (matches existing bid-document behaviour).
  // -------------------------------------------------------------------------
  async getNegotiationPdf(
    tenderId: string,
    submissionId: string,
    user: any,
    mode: 'view' | 'download',
  ) {
    const submission = await this.prisma.bidNegotiationSubmission.findUnique({
      where: { id: submissionId },
      include: {
        invitation: {
          include: {
            round: { select: { tenderId: true } },
            bid: { select: { id: true, vendorId: true, tenderId: true } },
          },
        },
      },
    });
    if (!submission) throw new NotFoundException('Negotiation submission not found');
    if (submission.invitation.round.tenderId !== tenderId) {
      throw new BadRequestException('Submission does not belong to this tender.');
    }

    const isVendor = !!user?.vendorId;
    if (isVendor) {
      if (submission.invitation.bid.vendorId !== user.vendorId) {
        throw new ForbiddenException('Not your bid');
      }
    } else {
      const perms: string[] = user?.permissions ?? [];
      const ok = perms.includes('comparison:commercial:view') || perms.includes('commercial:view');
      if (!ok) {
        throw new ForbiddenException('comparison:commercial:view permission required');
      }
    }

    if (!isVendor && user?.id) {
      await this.audit.log({
        eventType: mode === 'view' ? 'NEGOTIATION_PDF_VIEWED' : 'NEGOTIATION_PDF_DOWNLOADED',
        entityType: 'BidNegotiationSubmission',
        entityId: submission.id,
        tenderId,
        bidId: submission.invitation.bid.id,
        vendorId: submission.invitation.bid.vendorId,
        actorUserId: user.id,
        afterValue: { filename: submission.commercialPdfFilename, sha256: submission.commercialPdfSha256 },
        riskLevel: AuditRiskLevel.MEDIUM,
      });
    }

    const { stream, size, mimeType } = await this.storage.stream(submission.commercialPdfStorageKey);
    return {
      filename: submission.commercialPdfFilename,
      mimeType: mimeType || 'application/pdf',
      fileSize: size,
      stream,
    };
  }

  // -------------------------------------------------------------------------
  // Used by AwardService.confirmAward to auto-close any open round on award.
  // -------------------------------------------------------------------------
  async autoCloseOpenRoundOnAward(tenderId: string, userId: string) {
    const open = await this.prisma.negotiationRound.findFirst({
      where: { tenderId, closedAt: null },
      orderBy: { roundNumber: 'desc' },
    });
    if (!open) return null;
    await this.prisma.negotiationRound.update({
      where: { id: open.id },
      data: { closedAt: new Date(), closedBy: userId, closeReason: 'Auto-closed by award confirmation.' },
    });
    await this.audit.log({
      eventType: 'NEGOTIATION_ROUND_CLOSED',
      entityType: 'NegotiationRound',
      entityId: open.id,
      tenderId,
      actorUserId: userId,
      afterValue: { roundNumber: open.roundNumber, reason: 'auto-closed-by-award' },
      riskLevel: AuditRiskLevel.MEDIUM,
    });
    return open;
  }
}
