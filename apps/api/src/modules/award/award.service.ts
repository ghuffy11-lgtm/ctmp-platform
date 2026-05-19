import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditRiskLevel, BidStatus, TenderStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AwardRecommendationDto } from './dto/award-recommendation.dto';
import { AwardApprovalDto } from './dto/award-approval.dto';

@Injectable()
export class AwardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

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
