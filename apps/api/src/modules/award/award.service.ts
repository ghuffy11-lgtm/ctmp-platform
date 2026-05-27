import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AuditRiskLevel, BidStatus, EnvelopeType, EnvelopeStatus, TenderStatus, TechnicalResult } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AwardStorageService } from './award-storage.service';
import { AwardRecommendationDto } from './dto/award-recommendation.dto';
import { AwardApprovalDto } from './dto/award-approval.dto';
import { ConfirmAwardDto } from './dto/confirm-award.dto';
import { AmendAwardDto } from './dto/amend-award.dto';

interface MulterFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

interface PendingJustification {
  id: string;
  storageKey: string;
  sha256: string;
  filename: string;
  uploadedAt: number;
}

@Injectable()
export class AwardService {
  // In-memory holding tank for uploaded justification PDFs. The client uploads
  // first, gets back a `documentId`, then references it in the Confirm/Amend
  // request body. Entries auto-expire after 15 minutes so abandoned uploads
  // don't accumulate. Confirm/Amend consume + delete the entry.
  private static readonly pendingJustifications = new Map<string, PendingJustification>();
  private static readonly PENDING_TTL_MS = 15 * 60 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: AwardStorageService,
  ) {}

  private static gcPending() {
    const now = Date.now();
    for (const [id, p] of AwardService.pendingJustifications) {
      if (now - p.uploadedAt > AwardService.PENDING_TTL_MS) {
        AwardService.pendingJustifications.delete(id);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Phase D: justification PDF upload (Confirm/Amend reference the returned id)
  // -------------------------------------------------------------------------
  async uploadJustification(tenderId: string, file: MulterFile, userId: string) {
    if (!file) throw new BadRequestException('File is required');
    if (file.mimetype !== 'application/pdf') {
      throw new BadRequestException('Only PDF files are accepted for award justifications.');
    }
    const head = file.buffer?.subarray(0, 5).toString('ascii');
    if (head !== '%PDF-') {
      throw new BadRequestException('File does not appear to be a valid PDF.');
    }
    AwardService.gcPending();

    const docId = randomUUID();
    const { storageKey, sha256 } = await this.storage.write({
      tenderId,
      docId,
      originalFilename: file.originalname,
      payload: file.buffer,
    });
    AwardService.pendingJustifications.set(docId, {
      id: docId,
      storageKey,
      sha256,
      filename: file.originalname,
      uploadedAt: Date.now(),
    });
    await this.audit.log({
      eventType: 'AWARD_JUSTIFICATION_UPLOADED',
      entityType: 'AwardJustification',
      entityId: docId,
      tenderId,
      actorUserId: userId,
      afterValue: { filename: file.originalname, sha256 },
      riskLevel: AuditRiskLevel.MEDIUM,
    });
    return {
      documentId: docId,
      filename: file.originalname,
      sha256,
      expiresInSeconds: Math.floor(AwardService.PENDING_TTL_MS / 1000),
    };
  }

  // -------------------------------------------------------------------------
  // Phase D: quorum check — pulls latest committee session + attendance
  // -------------------------------------------------------------------------
  async quorum(tenderId: string) {
    const session = await this.prisma.committeeSession.findFirst({
      where: { tenderId },
      orderBy: { scheduledAt: 'desc' },
      include: {
        committeeMembers: { include: { user: { select: { displayName: true } } } },
        committeeAttendances: true,
      },
    });
    if (!session) {
      return {
        hasQuorum: false,
        reason: 'No committee session scheduled for this tender.',
        requiredCount: null,
        presentCount: 0,
        totalMembers: 0,
        chairPresent: false,
        requiredRoleCode: 'CHAIR',
        requiredRolePresent: false,
      };
    }
    const presentMemberIds = new Set(
      session.committeeAttendances.filter(a => a.present).map(a => a.memberId),
    );
    const presentCount = presentMemberIds.size;
    const totalMembers = session.committeeMembers.length;
    const requiredCount = session.requiredQuorumCount ?? null;
    const requiredRoleCode = session.requiredRoleCode ?? 'CHAIR';

    const chairMember = session.committeeMembers.find(m => m.isChair);
    const chairPresent = !!chairMember && presentMemberIds.has(chairMember.id);

    // requiredRolePresent: at least one member with role_in_committee = required_role_code is PRESENT.
    // For default CHAIR we treat it as "isChair flag".
    const requiredRolePresent = requiredRoleCode === 'CHAIR'
      ? chairPresent
      : session.committeeMembers.some(
          m => m.roleInCommittee === requiredRoleCode && presentMemberIds.has(m.id),
        );

    const reasons: string[] = [];
    if (requiredCount != null && presentCount < requiredCount) {
      reasons.push(`Need ${requiredCount - presentCount} more member(s) present`);
    }
    if (!requiredRolePresent) {
      reasons.push(`${requiredRoleCode} must be present`);
    }
    const hasQuorum = reasons.length === 0 && (requiredCount == null || presentCount >= requiredCount);

    return {
      sessionId: session.id,
      hasQuorum,
      reason: reasons.length > 0 ? reasons.join(' + ') : null,
      requiredCount,
      presentCount,
      totalMembers,
      chairPresent,
      requiredRoleCode,
      requiredRolePresent,
    };
  }

  // -------------------------------------------------------------------------
  // Phase D: server-side lowest-PASS detection (mirrors ComparisonService logic)
  // -------------------------------------------------------------------------
  private async computeLowestPassBidId(tenderId: string): Promise<string | null> {
    const bids = await this.prisma.bid.findMany({
      where: { tenderId, technicalResult: TechnicalResult.PASS },
      include: { commercialEvaluations: { select: { totalPrice: true } } },
    });
    const ranked = bids
      .map(b => {
        const prices = b.commercialEvaluations
          .map(e => (e.totalPrice != null ? Number(e.totalPrice) : null))
          .filter((v): v is number => typeof v === 'number');
        const avg = prices.length > 0
          ? prices.reduce((s, v) => s + v, 0) / prices.length
          : null;
        return { bidId: b.id, price: avg };
      })
      .filter(b => b.price != null)
      .sort((a, b) => (a.price as number) - (b.price as number));
    return ranked.length > 0 ? ranked[0].bidId : null;
  }

  // -------------------------------------------------------------------------
  // Phase D: Confirm (final single-click). Replaces the old recommend+approve
  // 2-step flow per master plan F5. Optionally records vendor notifications.
  // -------------------------------------------------------------------------
  async confirmAward(tenderId: string, dto: ConfirmAwardDto, userId: string) {
    const tender = await this.prisma.tender.findUnique({
      where: { id: tenderId },
      select: { id: true, status: true },
    });
    if (!tender) throw new NotFoundException('Tender not found');
    const confirmableStatuses: TenderStatus[] = [
      TenderStatus.COMMERCIAL_EVALUATION,
      TenderStatus.AWARD_RECOMMENDATION,
      TenderStatus.COMMITTEE_COMMERCIAL_OPENING,
    ];
    if (!confirmableStatuses.includes(tender.status)) {
      throw new BadRequestException(`Cannot Confirm award when tender is ${tender.status}`);
    }

    // Quorum + Chair check (master plan G4).
    const quorum = await this.quorum(tenderId);
    if (!quorum.hasQuorum) {
      throw new BadRequestException(`Quorum not met: ${quorum.reason ?? 'unknown reason'}`);
    }

    // Commercial envelope must have been opened.
    const openedCommercial = await this.prisma.bidEnvelope.count({
      where: {
        envelopeType: EnvelopeType.COMMERCIAL,
        status: EnvelopeStatus.OPENED,
        bid: { tenderId },
      },
    });
    if (openedCommercial === 0) {
      throw new BadRequestException('No commercial envelope has been opened.');
    }

    const bid = await this.prisma.bid.findFirst({
      where: { id: dto.bidId, tenderId },
      select: { id: true, vendorId: true, technicalResult: true },
    });
    if (!bid) throw new NotFoundException('Bid not found on this tender');
    if (bid.technicalResult !== TechnicalResult.PASS) {
      throw new BadRequestException('Only technically-PASS bids can be awarded.');
    }

    // Server re-verifies isLowest claim (client can't lie about it).
    const serverLowest = await this.computeLowestPassBidId(tenderId);
    const isActuallyLowest = serverLowest === dto.bidId;
    if (dto.isLowest && !isActuallyLowest) {
      throw new BadRequestException(
        'Client claimed isLowest but server-computed lowest-PASS bid differs. Refresh and try again.',
      );
    }

    let justificationPdfStorageKey: string | null = null;
    let justificationPdfSha256: string | null = null;
    let justificationPdfFilename: string | null = null;

    if (!isActuallyLowest) {
      // Override path: text + PDF required (master plan F2).
      if (!dto.justificationText || dto.justificationText.trim().length < 100) {
        throw new BadRequestException('Override award requires written justification (min 100 chars).');
      }
      if (!dto.justificationDocumentId) {
        throw new BadRequestException('Override award requires an attached PDF justification.');
      }
      AwardService.gcPending();
      const pending = AwardService.pendingJustifications.get(dto.justificationDocumentId);
      if (!pending) {
        throw new BadRequestException(
          'Justification PDF reference is invalid or expired. Re-upload the PDF and try again.',
        );
      }
      justificationPdfStorageKey = pending.storageKey;
      justificationPdfSha256 = pending.sha256;
      justificationPdfFilename = pending.filename;
      AwardService.pendingJustifications.delete(dto.justificationDocumentId);
    }

    const award = await this.prisma.$transaction(async tx => {
      const created = await tx.award.create({
        data: {
          tenderId,
          recommendedVendorId: bid.vendorId,
          recommendedBidId: bid.id,
          isLowest: isActuallyLowest,
          justificationText: dto.justificationText?.trim() ?? null,
          justificationPdfStorageKey,
          justificationPdfSha256,
          justificationPdfFilename,
          notifyWinner: dto.notifyWinner ?? false,
          notifyLosers: dto.notifyLosers ?? false,
          confirmedBy: userId,
        },
      });

      await tx.tender.update({
        where: { id: tenderId },
        data: {
          status: TenderStatus.AWARDED,
          awardedVendorId: bid.vendorId,
          awardedAt: new Date(),
        },
      });
      // Mark winning bid as AWARDED. Other bids remain at their current status.
      await tx.bid.update({
        where: { id: bid.id },
        data: { status: BidStatus.AWARDED },
      });
      return created;
    });

    await this.audit.log({
      eventType: 'AWARD_CONFIRMED',
      entityType: 'Award',
      entityId: award.id,
      tenderId,
      bidId: bid.id,
      actorUserId: userId,
      afterValue: {
        awardId: award.id,
        vendorId: bid.vendorId,
        isLowest: isActuallyLowest,
        notifyWinner: award.notifyWinner,
        notifyLosers: award.notifyLosers,
      },
      reason: dto.justificationText ?? (isActuallyLowest ? 'Lowest commercial PASS — auto-selected default' : undefined),
      riskLevel: AuditRiskLevel.CRITICAL,
    });

    // Notification dispatch is deferred to Phase E (BUG-042). The flags are
    // persisted on the Award row so Phase E can act on them retroactively
    // (or NotificationsService can be wired in here when ready).

    return award;
  }

  async amendAward(tenderId: string, dto: AmendAwardDto, userId: string) {
    const tender = await this.prisma.tender.findUnique({
      where: { id: tenderId },
      select: { id: true, status: true, awardedVendorId: true },
    });
    if (!tender) throw new NotFoundException('Tender not found');
    if (tender.status !== TenderStatus.AWARDED) {
      throw new BadRequestException('Only AWARDED tenders can be amended.');
    }

    const existingAward = await this.prisma.award.findFirst({
      where: { tenderId, supersededByAwardId: null },
      orderBy: { confirmedAt: 'desc' },
    });
    if (!existingAward) {
      throw new NotFoundException('No active award found for this tender.');
    }
    if (existingAward.recommendedBidId === dto.newBidId) {
      throw new BadRequestException('New bid id is identical to the active award; nothing to amend.');
    }

    const bid = await this.prisma.bid.findFirst({
      where: { id: dto.newBidId, tenderId },
      select: { id: true, vendorId: true, technicalResult: true },
    });
    if (!bid) throw new NotFoundException('Bid not found on this tender');
    if (bid.technicalResult !== TechnicalResult.PASS) {
      throw new BadRequestException('New awarded bid must be technical PASS.');
    }

    AwardService.gcPending();
    const pending = AwardService.pendingJustifications.get(dto.justificationDocumentId);
    if (!pending) {
      throw new BadRequestException(
        'Justification PDF reference is invalid or expired. Re-upload the PDF and try again.',
      );
    }

    // Amendments always carry justification text + PDF.
    const result = await this.prisma.$transaction(async tx => {
      const newAward = await tx.award.create({
        data: {
          tenderId,
          recommendedVendorId: bid.vendorId,
          recommendedBidId: bid.id,
          isLowest: false, // amendments are by definition an override
          justificationText: dto.justificationText.trim(),
          justificationPdfStorageKey: pending.storageKey,
          justificationPdfSha256: pending.sha256,
          justificationPdfFilename: pending.filename,
          notifyWinner: false,
          notifyLosers: false,
          confirmedBy: userId,
        },
      });
      await tx.award.update({
        where: { id: existingAward.id },
        data: { supersededByAwardId: newAward.id, supersededAt: new Date() },
      });
      await tx.tender.update({
        where: { id: tenderId },
        data: { awardedVendorId: bid.vendorId, awardedAt: new Date() },
      });
      await tx.bid.updateMany({
        where: { id: existingAward.recommendedBidId },
        data: { status: BidStatus.SUBMITTED },
      });
      await tx.bid.update({
        where: { id: bid.id },
        data: { status: BidStatus.AWARDED },
      });
      return newAward;
    });
    AwardService.pendingJustifications.delete(dto.justificationDocumentId);

    await this.audit.log({
      eventType: 'AWARD_AMENDED',
      entityType: 'Award',
      entityId: result.id,
      tenderId,
      bidId: bid.id,
      actorUserId: userId,
      beforeValue: {
        previousAwardId: existingAward.id,
        previousBidId: existingAward.recommendedBidId,
        previousVendorId: existingAward.recommendedVendorId,
      },
      afterValue: {
        newAwardId: result.id,
        newBidId: bid.id,
        newVendorId: bid.vendorId,
      },
      reason: dto.justificationText,
      riskLevel: AuditRiskLevel.CRITICAL,
    });

    return result;
  }

  async listAwards(tenderId: string) {
    const awards = await this.prisma.award.findMany({
      where: { tenderId },
      orderBy: { confirmedAt: 'desc' },
    });
    return awards.map(a => ({
      id: a.id,
      tenderId: a.tenderId,
      vendorId: a.recommendedVendorId,
      bidId: a.recommendedBidId,
      isLowest: a.isLowest,
      justificationText: a.justificationText,
      justificationPdfFilename: a.justificationPdfFilename,
      justificationPdfSha256: a.justificationPdfSha256,
      notifyWinner: a.notifyWinner,
      notifyLosers: a.notifyLosers,
      confirmedBy: a.confirmedBy,
      confirmedAt: a.confirmedAt.toISOString(),
      supersededByAwardId: a.supersededByAwardId,
      supersededAt: a.supersededAt?.toISOString() ?? null,
      isActive: a.supersededByAwardId === null,
    }));
  }

  async recommend(tenderId: string, dto: AwardRecommendationDto, userId: string) {
    if (!dto.justification?.trim()) throw new BadRequestException('Justification required');

    const tender = await this.prisma.tender.findUnique({
      where: { id: tenderId },
      select: { id: true, status: true },
    });
    if (!tender) throw new NotFoundException('Tender not found');
    if (tender.status !== TenderStatus.COMMERCIAL_EVALUATION) {
      throw new BadRequestException(`Tender must be in COMMERCIAL_EVALUATION`);
    }

    const bid = await this.prisma.bid.findFirst({
      where: { id: dto.recommendedBidId, tenderId },
      select: { id: true, vendorId: true, technicalResult: true },
    });
    if (!bid) throw new NotFoundException('Bid not found on this tender');
    if (bid.technicalResult !== 'PASS') {
      throw new BadRequestException('Recommended bid must have technical PASS');
    }

    const updated = await this.prisma.tender.update({
      where: { id: tenderId },
      data: {
        status: TenderStatus.AWARD_RECOMMENDATION,
        awardedVendorId: bid.vendorId,
      },
    });

    await this.audit.log({
      eventType: 'AWARD_RECOMMENDED',
      entityType: 'Tender',
      entityId: tenderId,
      tenderId,
      bidId: bid.id,
      actorUserId: userId,
      afterValue: { recommendedBidId: bid.id, recommendedVendorId: bid.vendorId },
      reason: dto.justification,
      riskLevel: AuditRiskLevel.HIGH,
    });

    return updated;
  }

  async approve(tenderId: string, dto: AwardApprovalDto, userId: string) {
    const tender = await this.prisma.tender.findUnique({
      where: { id: tenderId },
      select: { id: true, status: true, awardedVendorId: true },
    });
    if (!tender) throw new NotFoundException('Tender not found');
    if (tender.status !== TenderStatus.AWARD_RECOMMENDATION) {
      throw new BadRequestException(`Tender must be in AWARD_RECOMMENDATION`);
    }

    if (dto.approved) {
      const updated = await this.prisma.tender.update({
        where: { id: tenderId },
        data: { status: TenderStatus.AWARDED, awardedAt: new Date() },
      });
      await this.audit.log({
        eventType: 'AWARD_APPROVED',
        entityType: 'Tender',
        entityId: tenderId,
        tenderId,
        actorUserId: userId,
        afterValue: { status: TenderStatus.AWARDED },
        reason: dto.notes,
        riskLevel: AuditRiskLevel.CRITICAL,
      });
      return updated;
    }

    const reverted = await this.prisma.tender.update({
      where: { id: tenderId },
      data: { status: TenderStatus.COMMERCIAL_EVALUATION, awardedVendorId: null },
    });
    await this.audit.log({
      eventType: 'AWARD_REJECTED',
      entityType: 'Tender',
      entityId: tenderId,
      tenderId,
      actorUserId: userId,
      afterValue: { status: TenderStatus.COMMERCIAL_EVALUATION },
      reason: dto.notes,
      riskLevel: AuditRiskLevel.HIGH,
    });
    return reverted;
  }

  async issue(tenderId: string, userId: string) {
    const tender = await this.prisma.tender.findUnique({
      where: { id: tenderId },
      select: { id: true, status: true, awardedVendorId: true },
    });
    if (!tender) throw new NotFoundException('Tender not found');
    if (tender.status !== TenderStatus.AWARDED) {
      throw new BadRequestException('Tender must be in AWARDED status to issue');
    }
    if (!tender.awardedVendorId) {
      throw new BadRequestException('No awarded vendor recorded');
    }

    await this.prisma.$transaction([
      this.prisma.tender.update({
        where: { id: tenderId },
        data: { status: TenderStatus.TENDER_CLOSED },
      }),
      // Mark winning vendor's bid as AWARDED.
      this.prisma.bid.updateMany({
        where: { tenderId, vendorId: tender.awardedVendorId },
        data: { status: BidStatus.AWARDED },
      }),
    ]);

    await this.audit.log({
      eventType: 'AWARD_ISSUED',
      entityType: 'Tender',
      entityId: tenderId,
      tenderId,
      actorUserId: userId,
      afterValue: { status: TenderStatus.TENDER_CLOSED },
      riskLevel: AuditRiskLevel.CRITICAL,
    });

    return { tenderId, status: TenderStatus.TENDER_CLOSED };
  }
}
