import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { TenderStatus, TenderVisibility, AuditRiskLevel, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TenderStorageService } from './tender-storage.service';
import { CreateTenderDto } from './dto/create-tender.dto';
import { UpdateTenderDto } from './dto/update-tender.dto';
import { ListTendersDto } from './dto/list-tenders.dto';

interface MulterFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

// BUG-012 locked: PDF + Office docs. Server-side mime allow-list.
const ALLOWED_TENDER_DOC_MIMES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

// Statuses in which RFQ documents may be added or removed. Mirrors EDITABLE_STATUSES on the UI.
const TENDER_DOC_EDITABLE: TenderStatus[] = [
  TenderStatus.DRAFT,
  TenderStatus.INTERNAL_REVIEW,
  TenderStatus.APPROVED,
];

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
    private readonly tenderStorage: TenderStorageService,
  ) {}

  async findAll(query: ListTendersDto, user?: any) {
    const where: Prisma.TenderWhereInput = {};
    if (query.status && STATUS_API_TO_DB[query.status]) {
      where.status = STATUS_API_TO_DB[query.status];
    }
    if (query.departmentId) where.departmentId = query.departmentId;

    // BUG-028 Part B: dept-scoping for internal users. Roles holding
    // `system:view_all_departments` (SYSTEM_ADMIN, AUDITOR, PROCUREMENT_ADMIN)
    // see everything; everyone else is restricted to their department membership.
    if (
      user?.id &&
      !user?.vendorId &&
      !((user.permissions ?? []) as string[]).includes('system:view_all_departments')
    ) {
      const depts = (user.departments ?? []) as string[];
      where.departmentId = depts.length > 0 ? { in: depts } : { in: [] };
    }

    // BUG-015 vendor visibility: PUBLIC tenders OR INVITATION_ONLY tenders where the
    // caller appears in tender_vendors. Only PUBLISHED / CLARIFICATION_PERIOD statuses
    // are vendor-visible regardless of visibility mode.
    if (user?.vendorId) {
      where.AND = [
        { status: { in: [TenderStatus.PUBLISHED, TenderStatus.CLARIFICATION_PERIOD] } },
        {
          OR: [
            { visibility: TenderVisibility.PUBLIC },
            {
              visibility: TenderVisibility.INVITATION_ONLY,
              tenderVendors: { some: { vendorId: user.vendorId } },
            },
          ],
        },
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

    // BUG-028 Part B: dept-scoping on detail. If the caller is an internal user
    // who lacks the org-wide bypass perm and the tender belongs to a department
    // they don't belong to, treat it as not-found (do not leak existence).
    if (
      user?.id &&
      !user?.vendorId &&
      !((user.permissions ?? []) as string[]).includes('system:view_all_departments')
    ) {
      const depts = (user.departments ?? []) as string[];
      if (!depts.includes(tender.departmentId)) {
        throw new NotFoundException('Tender not found');
      }
    }

    // BUG-015 vendor visibility on detail: PUBLIC OR (INVITATION_ONLY + invited).
    // Must also be in PUBLISHED / CLARIFICATION_PERIOD.
    if (user?.vendorId) {
      const allowedStatuses = [TenderStatus.PUBLISHED, TenderStatus.CLARIFICATION_PERIOD] as TenderStatus[];
      const isPublicAllowed = tender.visibility === TenderVisibility.PUBLIC;
      const isInvited =
        tender.visibility === TenderVisibility.INVITATION_ONLY &&
        (tender.tenderVendors ?? []).some((tv: any) => tv.vendor.id === user.vendorId);
      if ((!isPublicAllowed && !isInvited) || !allowedStatuses.includes(tender.status)) {
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
        category: dto.category ?? null,
        procurementType: dto.procurementType ?? null,
        estimatedBudget: dto.estimatedBudget != null ? new Prisma.Decimal(dto.estimatedBudget) : null,
        // BUG-015: visibility is locked at create time. Default PUBLIC; switch to INVITATION_ONLY
        // requires picking ≥3 invited vendors before Publish (enforced in publish()).
        visibility: dto.visibility === 'INVITATION_ONLY' ? TenderVisibility.INVITATION_ONLY : TenderVisibility.PUBLIC,
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
      select: { id: true, status: true, title: true, description: true, submissionCloseAt: true, clarificationCloseAt: true, departmentId: true, category: true, procurementType: true, estimatedBudget: true },
    });
    if (!tender) throw new NotFoundException('Tender not found');
    if (tender.status !== TenderStatus.DRAFT && tender.status !== TenderStatus.INTERNAL_REVIEW) {
      throw new BadRequestException(
        `Tender is ${tender.status}; updates only allowed in DRAFT or INTERNAL_REVIEW`,
      );
    }

    // BUG-009: department editable in Draft only — once submitted for approval
    // the department is bound to the approval chain and cannot drift.
    if (dto.departmentId !== undefined && dto.departmentId !== tender.departmentId) {
      if (tender.status !== TenderStatus.DRAFT) {
        throw new BadRequestException(
          'Department can only be changed while the tender is in DRAFT status.',
        );
      }
    }

    const data: Prisma.TenderUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.submissionDeadline !== undefined) data.submissionCloseAt = new Date(dto.submissionDeadline);
    if (dto.clarificationDeadline !== undefined) {
      data.clarificationCloseAt = dto.clarificationDeadline ? new Date(dto.clarificationDeadline) : null;
    }
    if (dto.departmentId !== undefined) data.department = { connect: { id: dto.departmentId } };
    if (dto.category !== undefined) data.category = dto.category;
    if (dto.procurementType !== undefined) data.procurementType = dto.procurementType;
    if (dto.estimatedBudget !== undefined) {
      data.estimatedBudget = dto.estimatedBudget != null ? new Prisma.Decimal(dto.estimatedBudget) : null;
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
    // BUG-008/010/012/015: prerequisites — procurementType + estimatedBudget + ≥1 RFQ doc.
    // INVITATION_ONLY adds ≥3 invited vendors.
    const tender = await this.prisma.tender.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        visibility: true,
        procurementType: true,
        estimatedBudget: true,
        _count: { select: { tenderDocuments: true, tenderVendors: true } },
      },
    });
    if (!tender) throw new NotFoundException('Tender not found');
    const missing: string[] = [];
    if (!tender.procurementType) missing.push('procurementType');
    if (tender.estimatedBudget == null) missing.push('estimatedBudget');
    if (tender._count.tenderDocuments === 0) missing.push('at least one RFQ document');
    if (
      tender.visibility === TenderVisibility.INVITATION_ONLY &&
      tender._count.tenderVendors < 3
    ) {
      missing.push(`at least 3 invited vendors (currently ${tender._count.tenderVendors})`);
    }
    if (missing.length > 0) {
      throw new BadRequestException(
        `Cannot publish: missing required field(s) — ${missing.join(', ')}. Set them on the edit form and try again.`,
      );
    }
    return this.transition(id, userId, TenderStatus.APPROVED, TenderStatus.PUBLISHED, 'TENDER_PUBLISHED', AuditRiskLevel.MEDIUM);
  }

  // BUG-015: invitation workflow ---------------------------------------------
  // Add-yes / remove-no after Publish, until Submission Closed:
  //   Draft / Internal Review / Approved → full add + remove
  //   Published / Clarification Period   → add only, remove rejected (vendor may
  //                                        already be preparing — removal is unfair)
  //   Submission Closed and beyond       → frozen, all writes rejected.
  private static readonly INVITE_ADD_STATUSES: TenderStatus[] = [
    TenderStatus.DRAFT,
    TenderStatus.INTERNAL_REVIEW,
    TenderStatus.APPROVED,
    TenderStatus.PUBLISHED,
    TenderStatus.CLARIFICATION_PERIOD,
  ];
  private static readonly INVITE_REMOVE_STATUSES: TenderStatus[] = [
    TenderStatus.DRAFT,
    TenderStatus.INTERNAL_REVIEW,
    TenderStatus.APPROVED,
  ];

  async listInvitedVendors(tenderId: string) {
    const rows = await this.prisma.tenderVendor.findMany({
      where: { tenderId },
      include: { vendor: { select: { id: true, companyName: true, status: true } } },
      orderBy: { invitedAt: 'desc' },
    });
    return rows.map(r => ({
      vendorId: r.vendor.id,
      vendorName: r.vendor.companyName,
      vendorStatus: r.vendor.status,
      invitedAt: r.invitedAt.toISOString(),
      invitedBy: r.invitedBy ?? null,
    }));
  }

  async inviteVendor(tenderId: string, vendorId: string, userId: string) {
    const tender = await this.prisma.tender.findUnique({
      where: { id: tenderId },
      select: { id: true, status: true, visibility: true },
    });
    if (!tender) throw new NotFoundException('Tender not found');
    if (tender.visibility !== TenderVisibility.INVITATION_ONLY) {
      throw new BadRequestException('Invitations only apply to INVITATION_ONLY tenders.');
    }
    if (!TendersService.INVITE_ADD_STATUSES.includes(tender.status)) {
      throw new BadRequestException(`Invitations are frozen once tender reaches ${tender.status}.`);
    }
    const vendor = await this.prisma.vendor.findUnique({
      where: { id: vendorId },
      select: { id: true, companyName: true, status: true },
    });
    if (!vendor) throw new NotFoundException('Vendor not found');
    if (vendor.status !== 'APPROVED') {
      throw new BadRequestException(`Only APPROVED vendors can be invited (vendor is ${vendor.status}).`);
    }
    try {
      await this.prisma.tenderVendor.create({
        data: { tenderId, vendorId, invitedBy: userId },
      });
    } catch (err: any) {
      if (err.code === 'P2002') {
        throw new BadRequestException('Vendor already invited.');
      }
      throw err;
    }
    await this.audit.log({
      eventType: 'TENDER_VENDOR_INVITED',
      entityType: 'TenderVendor',
      entityId: vendorId,
      tenderId,
      vendorId,
      actorUserId: userId,
      afterValue: { vendorName: vendor.companyName },
      riskLevel: AuditRiskLevel.HIGH,
    });
    return { ok: true };
  }

  async uninviteVendor(tenderId: string, vendorId: string, userId: string) {
    const tender = await this.prisma.tender.findUnique({
      where: { id: tenderId },
      select: { id: true, status: true, visibility: true },
    });
    if (!tender) throw new NotFoundException('Tender not found');
    if (tender.visibility !== TenderVisibility.INVITATION_ONLY) {
      throw new BadRequestException('Invitations only apply to INVITATION_ONLY tenders.');
    }
    if (!TendersService.INVITE_REMOVE_STATUSES.includes(tender.status)) {
      throw new BadRequestException(
        `Removing invitees is only allowed before Publish — current status: ${tender.status}.`,
      );
    }
    const existing = await this.prisma.tenderVendor.findUnique({
      where: { tenderId_vendorId: { tenderId, vendorId } },
      include: { vendor: { select: { companyName: true } } },
    });
    if (!existing) throw new NotFoundException('Invitee not found');
    await this.prisma.tenderVendor.delete({
      where: { tenderId_vendorId: { tenderId, vendorId } },
    });
    await this.audit.log({
      eventType: 'TENDER_VENDOR_UNINVITED',
      entityType: 'TenderVendor',
      entityId: vendorId,
      tenderId,
      vendorId,
      actorUserId: userId,
      beforeValue: { vendorName: existing.vendor.companyName },
      riskLevel: AuditRiskLevel.HIGH,
    });
    return { ok: true };
  }

  async uploadDocument(tenderId: string, file: MulterFile, userId: string) {
    if (!file) throw new BadRequestException('File is required');
    if (!ALLOWED_TENDER_DOC_MIMES.has(file.mimetype)) {
      throw new BadRequestException('Unsupported file type. Allowed: PDF, DOC, DOCX, XLS, XLSX.');
    }
    const tender = await this.prisma.tender.findUnique({
      where: { id: tenderId },
      select: { id: true, status: true },
    });
    if (!tender) throw new NotFoundException('Tender not found');
    if (!TENDER_DOC_EDITABLE.includes(tender.status)) {
      throw new ConflictException(`Documents are locked once tender leaves ${TENDER_DOC_EDITABLE.join('/')}`);
    }

    const docId = randomUUID();
    const { storageKey, checksumSha256, fileSize } = await this.tenderStorage.write({
      tenderId,
      docId,
      originalFilename: file.originalname,
      payload: file.buffer,
      mimeType: file.mimetype,
    });

    const doc = await this.prisma.tenderDocument.create({
      data: {
        id: docId,
        tenderId,
        originalFilename: file.originalname,
        storageKey,
        mimeType: file.mimetype || 'application/octet-stream',
        fileSize: BigInt(fileSize),
        checksumSha256,
        uploadedBy: userId,
      },
    });

    await this.audit.log({
      eventType: 'TENDER_DOCUMENT_UPLOADED',
      entityType: 'TenderDocument',
      entityId: doc.id,
      tenderId,
      actorUserId: userId,
      afterValue: { filename: doc.originalFilename, fileSize, checksumSha256 },
      riskLevel: AuditRiskLevel.LOW,
    });

    return {
      id: doc.id,
      filename: doc.originalFilename,
      mimeType: doc.mimeType,
      fileSize: Number(doc.fileSize),
      checksumSha256: doc.checksumSha256,
      uploadedAt: doc.uploadedAt.toISOString(),
    };
  }

  async deleteDocumentEntry(tenderId: string, documentId: string, userId: string) {
    const doc = await this.prisma.tenderDocument.findFirst({
      where: { id: documentId, tenderId },
      include: { tender: { select: { status: true } } },
    });
    if (!doc) throw new NotFoundException('Document not found');
    if (!TENDER_DOC_EDITABLE.includes(doc.tender.status)) {
      throw new ConflictException('Documents are locked at this tender status');
    }
    await this.prisma.tenderDocument.delete({ where: { id: doc.id } });
    await this.tenderStorage.delete(doc.storageKey);
    await this.audit.log({
      eventType: 'TENDER_DOCUMENT_DELETED',
      entityType: 'TenderDocument',
      entityId: doc.id,
      tenderId,
      actorUserId: userId,
      beforeValue: { filename: doc.originalFilename, checksumSha256: doc.checksumSha256 },
      riskLevel: AuditRiskLevel.LOW,
    });
    return { ok: true };
  }

  async streamDocument(tenderId: string, documentId: string, userId: string) {
    const doc = await this.prisma.tenderDocument.findFirst({
      where: { id: documentId, tenderId },
    });
    if (!doc) throw new NotFoundException('Document not found');
    const { stream, size, mimeType } = await this.tenderStorage.stream(doc.storageKey);
    await this.audit.log({
      eventType: 'TENDER_DOCUMENT_DOWNLOADED',
      entityType: 'TenderDocument',
      entityId: doc.id,
      tenderId,
      actorUserId: userId,
      riskLevel: AuditRiskLevel.LOW,
    });
    return {
      id: doc.id,
      filename: doc.originalFilename,
      mimeType: doc.mimeType || mimeType,
      fileSize: size,
      stream,
    };
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

  // WALK-052: final lifecycle step. Confirmed Award → Tender Closed.
  // No reason field required (the decision is in the Award row).
  async closeTender(id: string, userId: string) {
    const tender = await this.prisma.tender.findUnique({
      where: { id },
      select: { id: true, status: true, reference: true },
    });
    if (!tender) throw new NotFoundException('Tender not found');
    if (tender.status !== TenderStatus.AWARDED) {
      throw new BadRequestException(
        `Cannot close tender from ${tender.status}; must be AWARDED.`,
      );
    }
    const updated = await this.prisma.tender.update({
      where: { id },
      data: { status: TenderStatus.TENDER_CLOSED },
    });
    await this.audit.log({
      eventType: 'TENDER_CLOSED',
      entityType: 'Tender',
      entityId: id,
      tenderId: id,
      actorUserId: userId,
      beforeValue: { status: tender.status },
      afterValue: { status: TenderStatus.TENDER_CLOSED },
      riskLevel: AuditRiskLevel.MEDIUM,
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
    // BUG-006 retest A4: emit daysLeft so the Days Left widget shows the
    // countdown instead of '—'. Negative values mean the deadline has passed;
    // null means no deadline set yet.
    const daysLeft =
      t.submissionCloseAt
        ? Math.ceil((t.submissionCloseAt.getTime() - Date.now()) / 86_400_000)
        : null;
    return {
      id: t.id,
      referenceNumber: t.reference,
      title: t.title,
      status: STATUS_DB_TO_API[t.status as TenderStatus],
      submissionDeadline: t.submissionCloseAt?.toISOString() ?? null,
      departmentId: t.departmentId ?? null,
      departmentName: t.department?.name ?? '',
      departmentCode: t.department?.code ?? null,
      visibility: t.visibility ?? 'PUBLIC',
      category: t.category ?? null,
      procurementType: t.procurementType ?? null,
      estimatedBudget: t.estimatedBudget != null ? Number(t.estimatedBudget) : null,
      createdAt: t.createdAt?.toISOString() ?? null,
      createdByName: t.createdByUser?.displayName ?? null,
      updatedAt: t.updatedAt.toISOString(),
      daysLeft,
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
