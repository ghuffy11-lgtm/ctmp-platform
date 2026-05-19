import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditRiskLevel, EnvelopeStatus, EnvelopeType, TechnicalResult } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EvaluateCommercialDto } from './dto/evaluate-commercial.dto';

@Injectable()
export class CommercialEvaluationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getComparison(tenderId: string, user?: any) {
    const tender = await this.prisma.tender.findUnique({
      where: { id: tenderId },
      select: { id: true, status: true },
    });
    if (!tender) throw new NotFoundException('Tender not found');

    const perms: string[] = user?.permissions ?? [];
    const canView = perms.includes('commercial:view');
    if (!canView) throw new ForbiddenException('commercial:view required');

    const bids = await this.prisma.bid.findMany({
      where: { tenderId, technicalResult: TechnicalResult.PASS },
      include: {
        vendor: { select: { id: true, companyName: true } },
        bidEnvelopes: {
          where: { envelopeType: EnvelopeType.COMMERCIAL },
          select: { status: true },
        },
        commercialEvaluations: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { totalPrice: true, currency: true, score: true },
        },
        technicalEvaluations: { select: { overallScore: true } },
      },
    });

    const rows = bids.map(b => {
      const commercial = b.bidEnvelopes[0];
      const eval0 = b.commercialEvaluations[0];
      const opened = commercial?.status === EnvelopeStatus.OPENED;
      const detailsVisible = opened && canView;
      return {
        bidId: b.id,
        vendorId: b.vendorId,
        vendorCompany: b.vendor.companyName,
        technicalResult: 'PASS' as const,
        commercialEnvelopeStatus: commercial?.status ?? EnvelopeStatus.SEALED,
        commercialDetailsVisible: detailsVisible,
        totalAmount: detailsVisible && eval0?.totalPrice ? Number(eval0.totalPrice) : undefined,
        currency: detailsVisible ? eval0?.currency ?? undefined : undefined,
      };
    });

    // Rank by lowest totalAmount (commercial-only ranking). Bids missing amount go last.
    const ranked = [...rows].sort((a, b) => {
      const av = a.totalAmount ?? Number.POSITIVE_INFINITY;
      const bv = b.totalAmount ?? Number.POSITIVE_INFINITY;
      return av - bv;
    });
    ranked.forEach((r, i) => Object.assign(r, { rank: i + 1 }));

    // Audit the view since this is sensitive.
    await this.audit.log({
      eventType: 'COMMERCIAL_COMPARISON_VIEWED',
      entityType: 'Tender',
      entityId: tenderId,
      tenderId,
      actorUserId: user?.id,
      riskLevel: AuditRiskLevel.MEDIUM,
    });

    return {
      tenderId,
      callerCommercialAccess: {
        canView,
        canDownload: perms.includes('commercial:download'),
        canEvaluate: perms.includes('commercial:evaluate'),
        canExport: perms.includes('commercial:export'),
      },
      rows: ranked,
    };
  }

  async evaluate(bidId: string, dto: EvaluateCommercialDto, evaluatorId: string) {
    const bid = await this.prisma.bid.findUnique({
      where: { id: bidId },
      include: {
        bidEnvelopes: {
          where: { envelopeType: EnvelopeType.COMMERCIAL },
          select: { status: true },
        },
      },
    });
    if (!bid) throw new NotFoundException('Bid not found');
    if (bid.technicalResult !== TechnicalResult.PASS) {
      throw new BadRequestException('Bid must have technical PASS before commercial evaluation');
    }
    const commercial = bid.bidEnvelopes[0];
    if (commercial?.status !== EnvelopeStatus.OPENED) {
      throw new BadRequestException('Commercial envelope must be OPENED by committee first');
    }

    const evaluation = await this.prisma.commercialEvaluation.upsert({
      where: { bidId_evaluatorUserId: { bidId, evaluatorUserId: evaluatorId } },
      update: { totalPrice: dto.totalPrice, comments: dto.notes },
      create: {
        bidId,
        evaluatorUserId: evaluatorId,
        totalPrice: dto.totalPrice,
        comments: dto.notes,
      },
    });

    await this.audit.log({
      eventType: 'COMMERCIAL_EVALUATION_SUBMITTED',
      entityType: 'CommercialEvaluation',
      entityId: evaluation.id,
      tenderId: bid.tenderId,
      bidId,
      actorUserId: evaluatorId,
      afterValue: { totalPrice: dto.totalPrice },
      riskLevel: AuditRiskLevel.HIGH,
    });

    return evaluation;
  }
}
