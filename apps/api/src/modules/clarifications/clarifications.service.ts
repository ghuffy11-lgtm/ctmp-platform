import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ClarificationStatus, Prisma, TenderStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreateClarificationDto } from './dto/create-clarification.dto';
import { ReplyClarificationDto } from './dto/reply-clarification.dto';

@Injectable()
export class ClarificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenderId: string, user: any) {
    const isVendor = !!user?.vendorId;
    const where: Prisma.TenderClarificationWhereInput = { tenderId };
    if (isVendor) {
      // Vendor sees: own clarifications (all) + others' clarifications only when a public reply exists.
      where.OR = [
        { vendorId: user.vendorId },
        { isPublic: true },
        { replies: { some: {} }, isPublic: true },
      ];
    }
    const items = await this.prisma.tenderClarification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        vendor: { select: { id: true, companyName: true } },
        replies: {
          orderBy: { createdAt: 'asc' },
          include: { repliedByUser: { select: { displayName: true } } },
        },
      },
      take: 200,
    });
    return {
      items: items.map(c => ({
        id: c.id,
        tenderId: c.tenderId,
        vendorId: c.vendorId ?? null,
        vendorName: c.vendor?.companyName ?? null,
        vendorCompany: c.vendor?.companyName ?? null,
        question: c.question,
        status: c.status,
        createdAt: c.createdAt.toISOString(),
        replies: c.replies.map(r => ({
          id: r.id,
          clarificationId: r.clarificationId,
          reply: r.answer,
          visibility: c.isPublic ? 'GENERAL_PUBLIC' : 'PRIVATE_TO_VENDOR',
          repliedAt: r.createdAt.toISOString(),
          repliedByName: r.repliedByUser.displayName,
        })),
      })),
      total: items.length,
      page: 1,
      pageSize: 200,
    };
  }

  async create(tenderId: string, dto: CreateClarificationDto, user: any) {
    const tender = await this.prisma.tender.findUnique({
      where: { id: tenderId },
      select: { id: true, status: true },
    });
    if (!tender) throw new NotFoundException('Tender not found');
    if (
      tender.status !== TenderStatus.PUBLISHED &&
      tender.status !== TenderStatus.CLARIFICATION_PERIOD
    ) {
      throw new BadRequestException(`Cannot submit clarifications when tender is ${tender.status}`);
    }

    const data: Prisma.TenderClarificationCreateInput = {
      tender: { connect: { id: tenderId } },
      question: dto.question,
      status: ClarificationStatus.OPEN,
    };
    if (user?.vendorId) {
      data.vendor = { connect: { id: user.vendorId } };
      data.askedByVendorUser = { connect: { id: user.id } };
    } else if (user?.id) {
      data.askedByUser = { connect: { id: user.id } };
    }

    return this.prisma.tenderClarification.create({ data });
  }

  async reply(clarificationId: string, dto: ReplyClarificationDto, user: any) {
    if (user?.vendorId) {
      throw new ForbiddenException('Vendors cannot reply to clarifications');
    }
    const clarification = await this.prisma.tenderClarification.findUnique({
      where: { id: clarificationId },
    });
    if (!clarification) throw new NotFoundException('Clarification not found');

    // Update visibility on the parent if reply is public, mark status ANSWERED, append reply.
    const [, reply] = await this.prisma.$transaction([
      this.prisma.tenderClarification.update({
        where: { id: clarificationId },
        data: {
          status: ClarificationStatus.ANSWERED,
          isPublic: dto.isPublic || clarification.isPublic,
        },
      }),
      this.prisma.tenderClarificationReply.create({
        data: {
          clarificationId,
          answer: dto.reply,
          repliedByUserId: user.id,
        },
      }),
    ]);

    return reply;
  }
}
