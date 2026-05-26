import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { TenderStatus, TenderVisibility, AuditRiskLevel, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateTenderDto } from './dto/create-tender.dto';
import { UpdateTenderDto } from './dto/update-tender.dto';
import { ListTendersDto } from './dto/list-tenders.dto';

// External API uses human-readable status names; DB enum uses SNAKE_UPPER.
const STATUS_API_TO_DB: Record<string, TenderStatus> = {
  'Draft': TenderStatus.DRAFT,
  'Internal Review': TenderStatus.INTERNAL_REVIEW,
  'Approved': TenderStatus.APPROVED,
  'Published': TenderStatus.PUBLISHED,
  'Clarification Period': TenderStatus.CLARIFICATION_PERIOD,
  'Submission Closed': TenderStatus.SUBMISSION_CLOSED,
  'Technical Opening': TenderStatus.TECHNICAL_OPENING,
  'Technical Evaluation': TenderStatus.TECHNICAL_EVALUATION,
  'Commercial Sealed': TenderStatus.COMMERCIAL_SEALED,
  'Committee Commercial Opening': TenderStatus.COMMITTEE_COMMERCIAL_OPENING,
  'Commercial Evaluation / Comparison': TenderStatus.COMMERCIAL_EVALUATION,
  'Award Recommendation': TenderStatus.AWARD_RECOMMENDATION,
  'Awarded': TenderStatus.AWARDED,
  'Tender Closed': TenderStatus.TENDER_CLOSED,
  'Cancelled': TenderStatus.CANCELLED,
  'Suspended': TenderStatus.SUSPENDED,
  'Archived': TenderStatus.ARCHIVED,
};

const STATUS_DB_TO_API: Record<TenderStatus, string> = Object.fromEntries(
  Object.entries(STATUS_API_TO_DB).map(([k, v]) => [v, k]),
) as Record<TenderStatus, string>;

@Injectable()
export class TendersService {
  private readonly logger = new Logger(TendersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll(query: ListTendersDto, user?: any) {
    const where: Prisma.TenderWhereInput = {};
    if (query.status && STATUS_API_TO_DB[query.status]) {
      where.status = STATUS_API_TO_DB[query.status];
    }
    if (query.departmentId) where.departmentId = query.departmentId;

    // Vendor visibility filter: only PUBLIC visibility + PUBLISHED/CLARIFICATION_PERIOD status
    if (user?.vendorId) {
      where.AND = [
        { visibility: TenderVisibility.PUBLIC },
        { status: { in: [TenderStatus.PUBLISHED, TenderStatus.CLARIFICATION_PERIOD] } },
      ];
    }

    const page = Number(query.page ?? 1);
    const pageSize = Number(query.pageSize ?? 20);
    const skip = (page - 1) * pageSize;

    const [total, tenders] = await this.prisma.$transaction([
      this.prisma.tender.count({ where }),
      this.prisma.tender.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { updatedAt: 'desc' },
        include: {
          department: { select: { name: true, code: true } },
          createdByUser: { select: { displayName: true } },
        },
      }),
    ]);

    return {
      page,
      pageSize,
      total,
      data: tenders.map(t => this.serializeSummary(t)),
    };
  }

  async findOne(id: string, user?: any) {
    const tender = await this.prisma.tender.findUnique({
      where: { id },
      include: {
        department: { select: { name: true, code: true } },
        createdByUser: { select: { displayName: true } },
        tenderDocuments: true,
        tenderVendors: { include: { vendor: { select: { id: true, companyName: true } } } },
      },
    });
    if (!tender) throw new NotFoundException('Tender not found');

    // Vendor visibility: only PUBLIC visibility + PUBLISHED/CLARIFICATION_PERIOD status
    if (user?.vendorId) {
      const allowedStatuses = [TenderStatus.PUBLISHED, TenderStatus.CLARIFICATION_PERIOD] as TenderStatus[];
      if (tender.visibility !== TenderVisibility.PUBLIC || !allowedStatuses.includes(tender.status)) {
        throw new ForbiddenException('Tender not accessible to vendor');
      }
    }

    return this.serializeDetail(tender);
  }

  async create(dto: CreateTenderDto, userId: string) {
    const reference = await this.generateReference();
    const tender = await this.prisma.tender.create({
      data: {
        reference,
        title: dto.title,
        description: dto.description,
        departmentId: dto.departmentId,
        submissionCloseAt: new Date(dto.submissionDeadline),
        clarificationCloseAt: dto.clarificationDeadline ? new Date(dto.clarificationDeadline) : null,
        status: TenderStatus.DRAFT,
        createdBy: userId,
        owningUserId: userId,
      },
      include: {
        department: { select: { name: true, code: true } },
        createdByUser: { select: { displayName: true } },
      },
    });

    await this.audit.log({
      eventType: 'TENDER_CREATED',
      entityType: 'Tender',
      entityId: tender.id,
      tenderId: tender.id,
      actorUserId: userId,
      afterValue: { reference: tender.reference, title: tender.title, status: tender.status },
      riskLevel: AuditRiskLevel.LOW,
    });

    return this.serializeDetail(tender);
  }

  async update(id: string, dto: UpdateTenderDto) {
    const tender = await this.prisma.tender.findUnique({
      where: { id },
      select: { id: true, status: true, title: true, description: true, submissionCloseAt: true, clarificationCloseAt: true },
    });
    if (!tender) throw new NotFoundException('Tender not found');
    if (tender.status !== TenderStatus.DRAFT && tender.status !== TenderStatus.INTERNAL_REVIEW) {
      throw new BadRequestException(
        `Tender is ${tender.status}; updates only allowed in DRAFT or INTERNAL_REVIEW`,
      );
    }

    const data: Prisma.TenderUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.submissionDeadline !== undefined) data.submissionCloseAt = new Date(dto.submissionDeadline);
    if (dto.clarificationDeadline !== undefined) {
      data.clarificationCloseAt = dto.clarificationDeadline ? new Date(dto.clarificationDeadline) : null;
    }

    const updated = await this.prisma.tender.update({
      where: { id },
      data,
      include: {
        department: { select: { name: true, code: true } },
        createdByUser: { select: { displayName: true } },
      },
    });

    await this.audit.log({
      eventType: 'TENDER_UPDATED',
      entityType: 'Tender',
      entityId: id,
      tenderId: id,
      beforeValue: tender,
      afterValue: { ...tender, ...data },
      riskLevel: AuditRiskLevel.LOW,
    });

    return this.serializeDetail(updated);
  }

  async downloadDocument(tenderId: string, documentId: string) {
    const doc = await this.prisma.tenderDocument.findFirst({
      where: { id: documentId, tenderId },
    });
    if (!doc) throw new NotFoundException('Document not found');
    // Real impl: stream from S3 / local store using doc.storageKey. For now return
    // metadata so the controller can wrap a stream or presigned URL later.
    return {
      id: doc.id,
      filename: doc.originalFilename,
      mimeType: doc.mimeType,
      storageKey: doc.storageKey,
      checksumSha256: doc.checksumSha256,
    };
  }

  async submitForApproval(id: string, userId: string) {
    return this.transition(id, userId, TenderStatus.DRAFT, TenderStatus.INTERNAL_REVIEW, 'TENDER_SUBMITTED_FOR_APPROVAL');
  }

  async publish(id: string, userId: string) {
    return this.transition(id, userId, TenderStatus.APPROVED, TenderStatus.PUBLISHED, 'TENDER_PUBLISHED', AuditRiskLevel.MEDIUM);
  }

  async cancel(id: string, reason: string, userId: string) {
    if (!reason?.trim()) throw new BadRequestException('Cancellation reason required');
    const tender = await this.prisma.tender.findUnique({ where: { id }, select: { id: true, status: true } });
    if (!tender) throw new NotFoundException('Tender not found');
    const cancellable: TenderStatus[] = [
      TenderStatus.DRAFT, TenderStatus.INTERNAL_REVIEW, TenderStatus.APPROVED,
      TenderStatus.PUBLISHED, TenderStatus.CLARIFICATION_PERIOD,
    ];
    if (!cancellable.includes(tender.status)) {
      throw new BadRequestException(`Cannot cancel from ${tender.status}`);
    }
    const updated = await this.prisma.tender.update({
      where: { id },
      data: { status: TenderStatus.CANCELLED },
    });
    await this.audit.log({
      eventType: 'TENDER_CANCELLED',
      entityType: 'Tender',
      entityId: id,
      tenderId: id,
      actorUserId: userId,
      beforeValue: { status: tender.status },
      afterValue: { status: TenderStatus.CANCELLED },
      reason,
      riskLevel: AuditRiskLevel.HIGH,
    });
    return updated;
  }

  async closeSubmissions(id: string, userId: string) {
    const tender = await this.prisma.tender.findUnique({ where: { id }, select: { id: true, status: true } });
    if (!tender) throw new NotFoundException('Tender not found');
    if (
      tender.status !== TenderStatus.PUBLISHED &&
      tender.status !== TenderStatus.CLARIFICATION_PERIOD
    ) {
      throw new BadRequestException(`Cannot close submissions from ${tender.status}`);
    }
    const updated = await this.prisma.tender.update({
      where: { id },
      data: { status: TenderStatus.SUBMISSION_CLOSED },
    });
    await this.audit.log({
      eventType: 'TENDER_SUBMISSIONS_CLOSED',
      entityType: 'Tender',
      entityId: id,
      tenderId: id,
      actorUserId: userId,
      beforeValue: { status: tender.status },
      afterValue: { status: TenderStatus.SUBMISSION_CLOSED },
      riskLevel: AuditRiskLevel.MEDIUM,
    });
    return updated;
  }

  async approve(id: string, comments: string | undefined, userId: string) {
    const tender = await this.prisma.tender.findUnique({
      where: { id },
      select: { id: true, status: true, reference: true },
    });
    if (!tender) throw new NotFoundException('Tender not found');
    if (tender.status !== TenderStatus.INTERNAL_REVIEW) {
      throw new BadRequestException(`Tender is ${tender.status}; can only approve from INTERNAL_REVIEW`);
    }
    const updated = await this.prisma.tender.update({
      where: { id },
      data: { status: TenderStatus.APPROVED },
    });
    await this.audit.log({
      eventType: 'TENDER_APPROVED',
      entityType: 'Tender',
      entityId: id,
      tenderId: id,
      actorUserId: userId,
      beforeValue: { status: tender.status },
      afterValue: { status: TenderStatus.APPROVED },
      reason: comments,
      riskLevel: AuditRiskLevel.MEDIUM,
    });
    return updated;
  }

  async reject(id: string, reason: string, userId: string) {
    if (!reason?.trim()) throw new BadRequestException('Rejection reason required for audit');
    const tender = await this.prisma.tender.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!tender) throw new NotFoundException('Tender not found');
    if (tender.status !== TenderStatus.INTERNAL_REVIEW) {
      throw new BadRequestException(`Tender is ${tender.status}; can only reject from INTERNAL_REVIEW`);
    }
    const updated = await this.prisma.tender.update({
      where: { id },
      data: { status: TenderStatus.DRAFT },
    });
    await this.audit.log({
      eventType: 'TENDER_REJECTED',
      entityType: 'Tender',
      entityId: id,
      tenderId: id,
      actorUserId: userId,
      beforeValue: { status: tender.status },
      afterValue: { status: TenderStatus.DRAFT },
      reason,
      riskLevel: AuditRiskLevel.MEDIUM,
    });
    return updated;
  }

  // -----------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------

  private async transition(
    id: string,
    userId: string,
    from: TenderStatus,
    to: TenderStatus,
    eventType: string,
    risk: AuditRiskLevel = AuditRiskLevel.LOW,
  ) {
    const tender = await this.prisma.tender.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!tender) throw new NotFoundException('Tender not found');
    if (tender.status !== from) {
      throw new BadRequestException(`Tender is ${tender.status}; transition to ${to} requires ${from}`);
    }
    const updated = await this.prisma.tender.update({ where: { id }, data: { status: to } });
    await this.audit.log({
      eventType,
      entityType: 'Tender',
      entityId: id,
      tenderId: id,
      actorUserId: userId,
      beforeValue: { status: from },
      afterValue: { status: to },
      riskLevel: risk,
    });
    return updated;
  }

  private async generateReference(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `TDR-${year}-`;
    const last = await this.prisma.tender.findFirst({
      where: { reference: { startsWith: prefix } },
      orderBy: { reference: 'desc' },
      select: { reference: true },
    });
    const lastNum = last ? parseInt(last.reference.slice(prefix.length), 10) : 0;
    const next = String(lastNum + 1).padStart(4, '0');
    return `${prefix}${next}`;
  }

  private serializeSummary(t: any) {
    return {
      id: t.id,
      referenceNumber: t.reference,
      title: t.title,
      status: STATUS_DB_TO_API[t.status as TenderStatus],
      submissionDeadline: t.submissionCloseAt?.toISOString() ?? null,
      departmentName: t.department?.name ?? '',
      departmentCode: t.department?.code ?? null,
      category: t.category ?? null,
      // Prisma column is `tenderType` (DB `tender_type`); frontend canonical name is `procurementType`.
      // Mapping here until the Prisma field is renamed under the BUG-008/9/10/11 bundle.
      procurementType: t.tenderType ?? null,
      estimatedBudget: t.budgetEstimate != null ? Number(t.budgetEstimate) : null,
      createdAt: t.createdAt?.toISOString() ?? null,
      createdByName: t.createdByUser?.displayName ?? null,
      updatedAt: t.updatedAt.toISOString(),
    };
  }

  private serializeDetail(t: any) {
    return {
      ...this.serializeSummary(t),
      description: t.description ?? undefined,
      clarificationDeadline: t.clarificationCloseAt?.toISOString() ?? null,
      documents: (t.tenderDocuments ?? []).map((d: any) => ({
        id: d.id,
        filename: d.originalFilename,
        mimeType: d.mimeType,
        fileSize: Number(d.fileSize),
        checksumSha256: d.checksumSha256,
        uploadedAt: d.uploadedAt.toISOString(),
      })),
      invitedVendors: (t.tenderVendors ?? []).map((tv: any) => ({
        vendorId: tv.vendor.id,
        vendorName: tv.vendor.companyName,
      })),
    };
  }
}
