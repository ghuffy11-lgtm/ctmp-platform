import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditRiskLevel, BidStatus, LateExceptionStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateExceptionDto } from './dto/create-exception.dto';

@Injectable()
export class LateSubmissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll(tenderId: string) {
    const items = await this.prisma.lateSubmissionException.findMany({
      where: { tenderId },
      orderBy: { createdAt: 'desc' },
      include: { vendor: { select: { id: true, companyName: true } } },
    });
    return {
      items: items.map(e => ({
        id: e.id,
        tenderId: e.tenderId,
        vendorId: e.vendorId,
        vendorName: e.vendor.companyName,
        grantedBy: e.grantedBy ?? undefined,
        reason: e.reason,
        status: e.status,
        expiresAt: e.expiresAt.toISOString(),
        createdAt: e.createdAt.toISOString(),
      })),
      page: 1,
      pageSize: items.length,
      total: items.length,
    };
  }

  async create(tenderId: string, dto: CreateExceptionDto, grantedByUserId: string) {
    if (!dto.reason?.trim()) throw new BadRequestException('Reason required');
    const expiresAt = new Date(dto.expiresAt);
    if (expiresAt < new Date()) throw new BadRequestException('expiresAt must be future');

    const tender = await this.prisma.tender.findUnique({
      where: { id: tenderId },
      select: { id: true },
    });
    if (!tender) throw new NotFoundException('Tender not found');

    const vendor = await this.prisma.vendor.findUnique({
      where: { id: dto.vendorId },
      select: { id: true },
    });
    if (!vendor) throw new NotFoundException('Vendor not found');

    // Partial unique index in DB blocks duplicate ACTIVE exceptions per (tender, vendor).
    // Active = PENDING_APPROVAL or GRANTED.
    const active = await this.prisma.lateSubmissionException.findFirst({
      where: {
        tenderId,
        vendorId: dto.vendorId,
        status: { in: [LateExceptionStatus.PENDING_APPROVAL, LateExceptionStatus.GRANTED] },
      },
    });
    if (active) {
      throw new ConflictException('Active exception already exists for this vendor on this tender');
    }

    const result = await this.prisma.$transaction(async tx => {
      const exception = await tx.lateSubmissionException.create({
        data: {
          tenderId,
          vendorId: dto.vendorId,
          reason: dto.reason,
          expiresAt,
          grantedBy: grantedByUserId,
          grantedAt: new Date(),
          status: LateExceptionStatus.GRANTED,
        },
      });

      // Link the most recent DRAFT bid for this (tender, vendor) so the
      // bid.submit() deadline check can see the exception via prisma include.
      const draftBid = await tx.bid.findFirst({
        where: {
          tenderId,
          vendorId: dto.vendorId,
          status: BidStatus.DRAFT,
          isAlternative: false,
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });
      if (draftBid) {
        await tx.bid.update({
          where: { id: draftBid.id },
          data: { lateExceptionId: exception.id },
        });
      }

      return { exception, linkedBidId: draftBid?.id };
    });

    await this.audit.log({
      eventType: 'LATE_SUBMISSION_EXCEPTION_GRANTED',
      entityType: 'LateSubmissionException',
      entityId: result.exception.id,
      tenderId,
      vendorId: dto.vendorId,
      bidId: result.linkedBidId,
      actorUserId: grantedByUserId,
      afterValue: {
        reason: dto.reason,
        expiresAt: expiresAt.toISOString(),
        linkedBidId: result.linkedBidId ?? null,
      },
      riskLevel: AuditRiskLevel.HIGH,
    });

    return result.exception;
  }

  async isExceptionActive(tenderId: string, vendorId: string): Promise<boolean> {
    const now = new Date();
    const active = await this.prisma.lateSubmissionException.findFirst({
      where: {
        tenderId,
        vendorId,
        status: LateExceptionStatus.GRANTED,
        expiresAt: { gt: now },
      },
    });
    return !!active;
  }
}
