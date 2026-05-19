import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { LateExceptionStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreateExceptionDto } from './dto/create-exception.dto';

@Injectable()
export class LateSubmissionsService {
  constructor(private readonly prisma: PrismaService) {}

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

    return this.prisma.lateSubmissionException.create({
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
