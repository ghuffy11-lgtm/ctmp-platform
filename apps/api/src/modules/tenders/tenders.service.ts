import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { TenderStatus, TenderVisibility, AuditRiskLevel, BidStatus, EnvelopeStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { vendorTenderViewDenial } from './vendor-access';
import { AuditService } from '../audit/audit.service';
import { TenderStorageService } from './tender-storage.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SystemSettingsService } from '../system-settings/system-settings.service';
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
  // BUG-115 (2026-06-09): negotiation phase. See master plan §10.
  'Negotiation': TenderStatus.NEGOTIATION,
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
    // BUG-120 (2026-06-10): invitation email dispatch.
    private readonly notifications: NotificationsService,
    private readonly settings: SystemSettingsService,
    private readonly config: ConfigService,
  ) {}

  // BUG-110 (2026-06-05): anonymous public read for the vendor portal landing
  // page. Tighter than findAll — only status ∈ {Published, Clarification Period}
  // and visibility = PUBLIC. No invitation-only (anonymous can't be invited),
  // no department scoping, no department-cross visibility via committee/eval
  // membership (none of those apply for anonymous callers).
  async findAllPublic(query: ListTendersDto) {
    // Owner report 2026-08-07: closed tenders were still advertised on the
    // public landing page. A tender only leaves PUBLISHED when an admin runs
    // close-submissions, and nothing in the API does that automatically (there
    // is no scheduler), so a tender whose deadline passed months ago stayed on
    // the list with a "Closed" countdown. The submit gate always rejected those
    // bids, but listing them as opportunities is misleading — so the public
    // list now keys off the deadline rather than waiting for the status change.
    const where: Prisma.TenderWhereInput = {
      status: { in: [TenderStatus.PUBLISHED, TenderStatus.CLARIFICATION_PERIOD] },
      visibility: TenderVisibility.PUBLIC,
      OR: [
        { submissionCloseAt: null }, // no deadline set = still open
        { submissionCloseAt: { gt: new Date() } },
      ],
    };
    if (query.category) where.category = query.category;
    if (query.search && query.search.trim().length > 0) {
      const q = query.search.trim();
      where.AND = [
        {
          OR: [
            { reference: { contains: q, mode: 'insensitive' } },
            { title: { contains: q, mode: 'insensitive' } },
          ],
        },
      ];
    }

    const page = Number(query.page ?? 1);
    const pageSize = Math.min(Number(query.pageSize ?? 100), 200);
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

  async findAll(query: ListTendersDto, user?: any) {
    const where: Prisma.TenderWhereInput = {};
    if (query.status && STATUS_API_TO_DB[query.status]) {
      where.status = STATUS_API_TO_DB[query.status];
    }
    if (query.departmentId) where.departmentId = query.departmentId;

    // BUG-090 (2026-06-02): archive-page filters. Owner uses the new
    // /awarded-tenders page to browse past procurement decisions. All filters
    // are optional and compose with the existing dept-scoping below.
    if (query.awardedFrom || query.awardedTo) {
      const range: { gte?: Date; lt?: Date } = {};
      if (query.awardedFrom) range.gte = new Date(query.awardedFrom);
      if (query.awardedTo) {
        // Inclusive end-of-day: bump to the next day and use lt.
        const end = new Date(query.awardedTo);
        end.setUTCDate(end.getUTCDate() + 1);
        range.lt = end;
      }
      where.awardedAt = range;
    }
    if (query.category) where.category = query.category;

    // BUG-090: search must compose with the dept-scoping OR below. Collect both
    // into a where.AND so each is independently required.
    const andClauses: Prisma.TenderWhereInput[] = [];
    if (query.search && query.search.trim().length > 0) {
      const q = query.search.trim();
      andClauses.push({
        OR: [
          { reference: { contains: q, mode: 'insensitive' } },
          { title: { contains: q, mode: 'insensitive' } },
        ],
      });
    }

    // BUG-028 Part B: dept-scoping for internal users. Roles holding
    // `system:view_all_departments` (SYSTEM_ADMIN, AUDITOR, PROCUREMENT_ADMIN)
    // see everything; everyone else is restricted to their department membership.
    // BUG-062 / WALK-041: committee members + commercial evaluators are
    // cross-departmental by nature — broaden the filter so a user assigned to
    // a session or commercial evaluation for an out-of-dept tender can still
    // see that tender.
    if (
      user?.id &&
      !user?.vendorId &&
      !((user.permissions ?? []) as string[]).includes('system:view_all_departments')
    ) {
      const depts = (user.departments ?? []) as string[];
      andClauses.push({
        OR: [
          { departmentId: depts.length > 0 ? { in: depts } : { in: [] } },
          { committeeSessions: { some: { committeeMembers: { some: { userId: user.id } } } } },
          { bids: { some: { commercialEvaluations: { some: { evaluatorUserId: user.id } } } } },
        ],
      });
    }
    // BUG-015 vendor visibility: PUBLIC tenders OR INVITATION_ONLY tenders where the
    // caller appears in tender_vendors.
    // BUG-127 (2026-06-11): NEGOTIATION added — invited vendors need to see
    // the tender to submit revised commercial offers. Without this, clicking
    // a tender in negotiation state from My Bids returned 403 which cascaded
    // into a forced-logout via the 401 interceptor.
    if (user?.vendorId) {
      andClauses.push(
        // Owner report 2026-08-07: hide tenders whose submission window has
        // closed, instead of waiting for an admin to run close-submissions.
        // NEGOTIATION is deliberately exempt — a negotiation round happens
        // AFTER the original deadline, so filtering on it would cut invited
        // vendors off from submitting their revised offer. Vendors reach
        // tenders they already bid on through My Bids, and the tender detail
        // endpoint is unchanged, so nothing they own becomes unreachable.
        {
          OR: [
            { status: TenderStatus.NEGOTIATION },
            {
              status: { in: [TenderStatus.PUBLISHED, TenderStatus.CLARIFICATION_PERIOD] },
              OR: [
                { submissionCloseAt: null },
                { submissionCloseAt: { gt: new Date() } },
              ],
            },
          ],
        },
        {
          OR: [
            { visibility: TenderVisibility.PUBLIC },
            {
              visibility: TenderVisibility.INVITATION_ONLY,
              tenderVendors: { some: { vendorId: user.vendorId } },
            },
          ],
        },
      );
    }
    if (andClauses.length > 0) where.AND = andClauses;

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
        // BUG-092 (2026-06-02): awarded vendor for the Awarded Tenders archive
        // Overview tab. Owner saw "Winner Vendor" blank because the detail
        // serializer didn't include the award fields at all.
        awardedVendor: { select: { id: true, companyName: true } },
        // WALK-057: bidCount for the detail page's Bids stat tile next to Days Left.
        _count: { select: { bids: true } },
      },
    });
    if (!tender) throw new NotFoundException('Tender not found');

    // BUG-028 Part B: dept-scoping on detail. If the caller is an internal user
    // who lacks the org-wide bypass perm and the tender belongs to a department
    // they don't belong to, treat it as not-found (do not leak existence).
    // BUG-062 / WALK-041: committee members + commercial evaluators are
    // cross-departmental — allow access when the caller is assigned to a
    // session or has a commercial evaluation row for this tender.
    if (
      user?.id &&
      !user?.vendorId &&
      !((user.permissions ?? []) as string[]).includes('system:view_all_departments')
    ) {
      const depts = (user.departments ?? []) as string[];
      if (!depts.includes(tender.departmentId)) {
        const [memberHit, evaluatorHit] = await Promise.all([
          this.prisma.committeeMember.count({
            where: { userId: user.id, session: { tenderId: tender.id } },
          }),
          this.prisma.commercialEvaluation.count({
            where: { evaluatorUserId: user.id, bid: { tenderId: tender.id } },
          }),
        ]);
        if (memberHit === 0 && evaluatorHit === 0) {
          throw new NotFoundException('Tender not found');
        }
      }
    }

    // BUG-015 vendor visibility on detail: PUBLIC OR (INVITATION_ONLY + invited).
    // Must also be in PUBLISHED / CLARIFICATION_PERIOD / NEGOTIATION (BUG-127).
    // Owner report 2026-08-07: this used to throw a flat "Tender not accessible
    // to vendor", which reads like a permissions fault even when the real
    // reason is simply that submissions closed. vendorTenderViewDenial names
    // the actual reason and, where relevant, the date.
    if (user?.vendorId) {
      const invited = (tender.tenderVendors ?? []).some(
        (tv: any) => tv.vendor.id === user.vendorId,
      );
      const denial = vendorTenderViewDenial(tender, invited);
      if (denial) throw new ForbiddenException(denial);
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
        // BUG-137 (2026-06-19): persist the supporting-docs requirement flag.
        requiresSupportingDocuments: dto.requiresSupportingDocuments ?? false,
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
      select: { id: true, status: true, visibility: true, title: true, description: true, submissionCloseAt: true, clarificationCloseAt: true, departmentId: true, category: true, procurementType: true, estimatedBudget: true },
    });
    if (!tender) throw new NotFoundException('Tender not found');
    // BUG-122b (2026-06-11): standard updates still locked once Approved,
    // BUT a visibility-only change is allowed in APPROVED — the tender
    // hasn't published yet so no vendor has seen it, and it's a common
    // post-approval realisation that PUBLIC should have been
    // INVITATION_ONLY (or vice versa). Other field changes still blocked.
    const onlyVisibilityChange = (() => {
      const keys = Object.keys(dto).filter(k => (dto as any)[k] !== undefined);
      return keys.length === 1 && keys[0] === 'visibility';
    })();
    if (
      tender.status !== TenderStatus.DRAFT &&
      tender.status !== TenderStatus.INTERNAL_REVIEW &&
      !(tender.status === TenderStatus.APPROVED && onlyVisibilityChange)
    ) {
      throw new BadRequestException(
        `Tender is ${tender.status}; updates only allowed in DRAFT or INTERNAL_REVIEW (visibility-only updates also permitted in APPROVED).`,
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

    // BUG-122 + BUG-122b (2026-06-11): visibility editable in DRAFT /
    // INTERNAL_REVIEW / APPROVED — i.e. anywhere pre-publish. Reject the
    // change if any submitted bid exists. PUBLIC ↔ INVITATION_ONLY both
    // directions allowed.
    let visibilityChange: TenderVisibility | undefined;
    if (dto.visibility !== undefined) {
      const requested = dto.visibility === 'INVITATION_ONLY'
        ? TenderVisibility.INVITATION_ONLY
        : TenderVisibility.PUBLIC;
      if (requested !== tender.visibility) {
        const submittedBidCount = await this.prisma.bid.count({
          where: { tenderId: id, status: { notIn: [BidStatus.DRAFT, BidStatus.WITHDRAWN] } },
        });
        if (submittedBidCount > 0) {
          throw new BadRequestException(
            `Cannot change visibility: ${submittedBidCount} vendor bid(s) are already submitted. Cancel the tender and reissue if you need to change visibility.`,
          );
        }
        visibilityChange = requested;
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
    if (visibilityChange !== undefined) data.visibility = visibilityChange;
    // BUG-137 (2026-06-19): allow edit of the supporting-docs flag.
    if (dto.requiresSupportingDocuments !== undefined) {
      data.requiresSupportingDocuments = dto.requiresSupportingDocuments;
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
    const result = await this.transition(id, userId, TenderStatus.APPROVED, TenderStatus.PUBLISHED, 'TENDER_PUBLISHED', AuditRiskLevel.MEDIUM);
    // BUG-120 (2026-06-10): once published, sweep the invitation list and
    // email everyone who's been queued. Best-effort, non-blocking.
    if (tender.visibility === TenderVisibility.INVITATION_ONLY) {
      this.dispatchPendingInvitationEmails(id, userId).catch(err =>
        this.logger.error(`Publish-time invitation sweep failed for tender=${id}: ${err}`),
      );
    }
    return result;
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
  // BUG-124 (2026-06-11): removal extended to Published / Clarification Period
  // as long as the vendor has no binding bid yet. Frozen at Submission Closed
  // and beyond (the bid window is over; removal would break audit semantics).
  private static readonly INVITE_REMOVE_STATUSES: TenderStatus[] = [
    TenderStatus.DRAFT,
    TenderStatus.INTERNAL_REVIEW,
    TenderStatus.APPROVED,
    TenderStatus.PUBLISHED,
    TenderStatus.CLARIFICATION_PERIOD,
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
      // BUG-120 (2026-06-10): expose extras + notified flag so the picker UI
      // can show a count chip and let admin edit pre-publish.
      extraEmails: r.extraNotificationEmails ?? [],
      notifiedAt: r.notifiedAt?.toISOString() ?? null,
    }));
  }

  // BUG-120 (2026-06-10): edit the ad-hoc extra emails for an invited vendor.
  async updateInvitationExtras(
    tenderId: string,
    vendorId: string,
    extraEmails: string[],
    userId: string,
  ) {
    const row = await this.prisma.tenderVendor.findUnique({
      where: { tenderId_vendorId: { tenderId, vendorId } },
    });
    if (!row) throw new NotFoundException('Invitation not found');
    const normalised = Array.from(
      new Set((extraEmails ?? []).map(e => e.trim().toLowerCase()).filter(e => e.length > 0)),
    );
    await this.prisma.tenderVendor.update({
      where: { tenderId_vendorId: { tenderId, vendorId } },
      data: { extraNotificationEmails: normalised },
    });
    await this.audit.log({
      eventType: 'TENDER_INVITATION_EXTRAS_UPDATED',
      entityType: 'TenderVendor',
      entityId: vendorId,
      tenderId,
      vendorId,
      actorUserId: userId,
      beforeValue: { extraEmailCount: (row.extraNotificationEmails ?? []).length },
      afterValue: { extraEmailCount: normalised.length },
      riskLevel: AuditRiskLevel.LOW,
    });
    return { ok: true, extraEmails: normalised };
  }

  async inviteVendor(tenderId: string, vendorId: string, userId: string, extraEmails: string[] = []) {
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
    // BUG-120 (2026-06-10): normalise + dedupe ad-hoc extras.
    const normalisedExtras = Array.from(
      new Set((extraEmails ?? []).map(e => e.trim().toLowerCase()).filter(e => e.length > 0)),
    );
    try {
      await this.prisma.tenderVendor.create({
        data: {
          tenderId,
          vendorId,
          invitedBy: userId,
          extraNotificationEmails: normalisedExtras,
        },
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
      afterValue: { vendorName: vendor.companyName, extraEmailCount: normalisedExtras.length },
      riskLevel: AuditRiskLevel.HIGH,
    });

    // BUG-120 (2026-06-10): mid-flight invitation — fire the email right away
    // when the tender is already past publish; best-effort, doesn't block the
    // POST response on SMTP failures.
    if (TendersService.IMMEDIATE_INVITATION_DISPATCH_STATUSES.includes(tender.status)) {
      this.dispatchInvitationEmail(tenderId, vendorId, userId).catch(err =>
        this.logger.error(`Invitation dispatch failed for tender=${tenderId} vendor=${vendorId}: ${err}`),
      );
    }

    return { ok: true };
  }

  // BUG-120 (2026-06-10): which states allow an immediate post-invite email.
  // (Anything before Published just queues — the publish() call below will
  // sweep + send to everyone who's been invited but not yet notified.)
  private static readonly IMMEDIATE_INVITATION_DISPATCH_STATUSES: TenderStatus[] = [
    TenderStatus.PUBLISHED,
    TenderStatus.CLARIFICATION_PERIOD,
  ];

  // BUG-120 (2026-06-10): central invitation-email dispatcher. Used by both
  // inviteVendor() (post-publish) and publish() (the sweep). Builds the BCC
  // list from vendor_users.email + extra_notification_emails, sends one
  // email per invited vendor, then stamps notified_at so a re-publish or
  // a follow-up invite doesn't double-send.
  private async dispatchInvitationEmail(
    tenderId: string,
    vendorId: string,
    actorUserId: string,
    // BUG-123 (2026-06-11): optional overrides. `force=true` ignores the
    // notified_at gate (used by manual Resend). `templateCode` picks the
    // reminder template instead of the default invitation.
    opts: { force?: boolean; templateCode?: string } = {},
  ): Promise<{ status: string; recipientCount?: number } | null> {
    const tender = await this.prisma.tender.findUnique({
      where: { id: tenderId },
      select: {
        id: true, reference: true, title: true, category: true,
        submissionCloseAt: true,
      },
    });
    if (!tender) return null;

    const invitation = await this.prisma.tenderVendor.findUnique({
      where: { tenderId_vendorId: { tenderId, vendorId } },
      include: {
        vendor: {
          select: {
            id: true, companyName: true,
            vendorUsers: { select: { email: true, status: true } },
          },
        },
      },
    });
    if (!invitation) return null;
    if (invitation.notifiedAt && !opts.force) {
      // BUG-123: force=true bypasses this gate (manual Resend / reminder).
      // Otherwise: already notified once — don't re-send. Avoids the
      // publish-sweep double-sending when the same vendor was invited
      // post-publish.
      return null;
    }

    const vendorEmails = (invitation.vendor.vendorUsers ?? [])
      .filter(u => u.status === 'ACTIVE')
      .map(u => u.email);
    const extras = invitation.extraNotificationEmails ?? [];
    const bcc = Array.from(new Set([...vendorEmails, ...extras].map(e => e.trim().toLowerCase()).filter(Boolean)));

    if (bcc.length === 0) {
      this.logger.warn(`dispatchInvitationEmail: no recipients for tender=${tenderId} vendor=${vendorId}`);
      return null;
    }

    // Build the variables. Vendor portal URL comes from the new setting;
    // falls back to the API origin when empty.
    const systemNameRow = await this.prisma.systemSetting.findUnique({ where: { key: 'branding.system_name' } });
    const portalUrlRow = await this.prisma.systemSetting.findUnique({ where: { key: 'branding.vendor_portal_url' } });
    const systemName = systemNameRow?.value || 'CTMP';
    // BUG-144 (2026-06-19): registered app.vendorPortalUrl is always present
    // with a hardcoded fallback, so emails always contain an absolute URL.
    const vendorPortalUrl = portalUrlRow?.value
      || this.config.get<string>('app.vendorPortalUrl')
      || '';
    const tenderUrl = `${vendorPortalUrl.replace(/\/+$/, '')}/tenders/${tender.id}`;

    const variables: Record<string, string> = {
      systemName,
      vendorName: invitation.vendor.companyName ?? '',
      tenderReference: tender.reference ?? '',
      tenderTitle: tender.title ?? '',
      tenderCategory: tender.category ?? '—',
      submissionDeadline: tender.submissionCloseAt
        ? tender.submissionCloseAt.toISOString()
        : 'See tender for details',
      vendorPortalUrl,
      tenderUrl,
    };

    // Use platform from-address in TO; everyone goes BCC.
    const smtpCfg = await this.settings.resolveSmtpConfig();
    const platformFrom = smtpCfg.from || 'no-reply@ctmp.local';

    const templateCode = opts.templateCode ?? 'TENDER_INVITATION_SENT';
    const result = await this.notifications.sendEmailWithBcc(
      platformFrom,
      bcc,
      templateCode,
      variables,
    );

    await this.prisma.tenderVendor.update({
      where: { tenderId_vendorId: { tenderId, vendorId } },
      data: { notifiedAt: new Date() },
    });

    await this.audit.log({
      eventType: opts.force ? 'TENDER_INVITATION_REMINDED' : 'TENDER_INVITATION_NOTIFIED',
      entityType: 'TenderVendor',
      entityId: vendorId,
      tenderId,
      vendorId,
      actorUserId,
      afterValue: {
        recipientCount: bcc.length,
        vendorUserEmails: vendorEmails.length,
        extraEmails: extras.length,
        templateCode,
      },
      riskLevel: AuditRiskLevel.MEDIUM,
    });

    return { status: 'SENT', recipientCount: bcc.length };
  }

  // BUG-120 (2026-06-10): used at publish-time to batch-notify every invited
  // vendor that hasn't been told yet. Best-effort per vendor; one failure
  // doesn't block the rest.
  private async dispatchPendingInvitationEmails(tenderId: string, actorUserId: string) {
    const pending = await this.prisma.tenderVendor.findMany({
      where: { tenderId, notifiedAt: null },
      select: { vendorId: true },
    });
    for (const row of pending) {
      try {
        await this.dispatchInvitationEmail(tenderId, row.vendorId, actorUserId);
      } catch (err) {
        this.logger.error(`publish-time invitation dispatch failed tender=${tenderId} vendor=${row.vendorId}: ${err}`);
      }
    }
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
        `Removing invitees is frozen at this tender status (${tender.status}).`,
      );
    }
    const existing = await this.prisma.tenderVendor.findUnique({
      where: { tenderId_vendorId: { tenderId, vendorId } },
      include: { vendor: { select: { companyName: true } } },
    });
    if (!existing) throw new NotFoundException('Invitee not found');

    // BUG-124 (2026-06-11): post-publish removal blocked if vendor has any
    // binding bid. Pre-publish there are no bids to worry about — skip the
    // check (cheap optimisation).
    const postPublish = tender.status === TenderStatus.PUBLISHED || tender.status === TenderStatus.CLARIFICATION_PERIOD;
    if (postPublish) {
      const bindingBidCount = await this.prisma.bid.count({
        where: {
          tenderId,
          vendorId,
          status: { notIn: [BidStatus.DRAFT, BidStatus.WITHDRAWN] },
        },
      });
      if (bindingBidCount > 0) {
        throw new BadRequestException(
          `Cannot remove "${existing.vendor.companyName}": they have already submitted a bid. Disqualify the bid or cancel the tender instead.`,
        );
      }
    }

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

  // WALK-016/017 / BUG-067: vendor portal needs to view + download RFQ docs
  // on tenders they can already see. Internal users still need their dept
  // scope to admit them. The visibility check reuses findOne, which is the
  // single source of truth for who can read what.
  async streamDocument(tenderId: string, documentId: string, user: any) {
    // Throws NotFound for vendors who cannot see the tender (BUG-015), and
    // for internal users out of dept scope (BUG-050 / BUG-062). Side benefit:
    // we never leak document existence to unauthorised callers.
    await this.findOne(tenderId, user);

    const doc = await this.prisma.tenderDocument.findFirst({
      where: { id: documentId, tenderId },
    });
    if (!doc) throw new NotFoundException('Document not found');
    const { stream, size, mimeType } = await this.tenderStorage.stream(doc.storageKey);
    // For vendor callers `user.id` is the vendor_user.id (FK to vendor_users,
    // NOT users). Splitting prevents the audit_logs FK violation that surfaced
    // during BUG-067 verification.
    const isVendor = !!user?.vendorId;
    await this.audit.log({
      eventType: 'TENDER_DOCUMENT_DOWNLOADED',
      entityType: 'TenderDocument',
      entityId: doc.id,
      tenderId,
      actorUserId: isVendor ? undefined : user?.id,
      actorVendorUserId: isVendor ? user?.id : undefined,
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

  // BUG-112 (2026-06-07) Piece 1: revert a Published tender back to an
  // earlier editable state (Approved / Internal Review / Draft). Blocked
  // when any vendor has a bid in a binding submitted state — admin must
  // Cancel the tender instead. HIGH-risk audit event.
  async revert(
    id: string,
    dto: { targetStatus: 'Approved' | 'Internal Review' | 'Draft'; reason: string },
    userId: string,
  ) {
    if (!dto?.reason || dto.reason.trim().length < 20) {
      throw new BadRequestException('Reason is required and must be at least 20 characters.');
    }
    const allowedTargets = ['Approved', 'Internal Review', 'Draft'];
    if (!allowedTargets.includes(dto.targetStatus)) {
      throw new BadRequestException(`targetStatus must be one of ${allowedTargets.join(', ')}.`);
    }
    const tender = await this.prisma.tender.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        bids: { select: { status: true } },
      },
    });
    if (!tender) throw new NotFoundException('Tender not found');
    if (tender.status !== TenderStatus.PUBLISHED) {
      throw new BadRequestException(`Revert only supported from Published; current status is ${tender.status}.`);
    }
    // Block when ANY binding bid exists. DRAFT and WITHDRAWN are preserved.
    const BLOCKING: Set<BidStatus> = new Set([
      BidStatus.SUBMITTED,
      BidStatus.LATE_SUBMITTED,
      BidStatus.LATE_ACCEPTED,
      BidStatus.EVALUATED,
      BidStatus.AWARDED,
      BidStatus.NOT_AWARDED,
      BidStatus.DISQUALIFIED,
    ]);
    const blockingCount = tender.bids.filter(b => BLOCKING.has(b.status)).length;
    if (blockingCount > 0) {
      throw new ConflictException(
        `Cannot revert: ${blockingCount} vendor bid(s) are in a binding state. Use Cancel instead.`,
      );
    }
    const targetDbStatus = STATUS_API_TO_DB[dto.targetStatus];
    // BUG-123 (2026-06-11): clear notified_at on every invited vendor so the
    // next Publish re-sends to everyone. Without this the publish-sweep
    // skips already-notified rows, which is what the owner hit when they
    // reverted to Internal Review and re-published.
    const { updated, resetCount } = await this.prisma.$transaction(async tx => {
      const updated = await tx.tender.update({
        where: { id },
        data: { status: targetDbStatus },
      });
      const reset = await tx.tenderVendor.updateMany({
        where: { tenderId: id, notifiedAt: { not: null } },
        data: { notifiedAt: null },
      });
      return { updated, resetCount: reset.count };
    });
    await this.audit.log({
      eventType: 'TENDER_REVERTED',
      entityType: 'Tender',
      entityId: id,
      tenderId: id,
      actorUserId: userId,
      beforeValue: { status: TenderStatus.PUBLISHED },
      afterValue: { status: targetDbStatus, invitationNotificationsReset: resetCount },
      reason: dto.reason.trim(),
      riskLevel: AuditRiskLevel.HIGH,
    });
    return updated;
  }

  // BUG-123 (2026-06-11): manual reminder. Fires the dispatcher for one
  // vendor even when notified_at is already set, using a dedicated
  // TENDER_INVITATION_REMINDER template so the subject reads as a reminder.
  async resendInvitation(tenderId: string, vendorId: string, userId: string) {
    const tender = await this.prisma.tender.findUnique({
      where: { id: tenderId },
      select: { id: true, status: true, visibility: true },
    });
    if (!tender) throw new NotFoundException('Tender not found');
    if (tender.visibility !== TenderVisibility.INVITATION_ONLY) {
      throw new BadRequestException('Only INVITATION_ONLY tenders have invitation emails.');
    }
    // Only post-publish — pre-publish has no email yet to "remind" about.
    const allowed: TenderStatus[] = [
      TenderStatus.PUBLISHED,
      TenderStatus.CLARIFICATION_PERIOD,
    ];
    if (!allowed.includes(tender.status)) {
      throw new BadRequestException(
        `Reminders can only be sent once the tender is Published (current: ${tender.status}).`,
      );
    }
    return this.dispatchInvitationEmail(tenderId, vendorId, userId, {
      force: true,
      templateCode: 'TENDER_INVITATION_REMINDER',
    });
  }

  // BUG-132 (2026-06-14): cancel allowed from any state (except already
  // Cancelled). Cascade closes open negotiation rounds + locks all bid
  // envelopes so a Cancelled tender can't have lingering open work.
  // No automatic vendor email — owner notifies out-of-band when desired.
  async cancel(id: string, reason: string, userId: string) {
    if (!reason?.trim() || reason.trim().length < 20) {
      throw new BadRequestException('Cancellation reason required (min 20 characters).');
    }
    const tender = await this.prisma.tender.findUnique({
      where: { id },
      select: { id: true, status: true, previousStatus: true },
    });
    if (!tender) throw new NotFoundException('Tender not found');
    if (tender.status === TenderStatus.CANCELLED) {
      throw new BadRequestException('Tender is already cancelled.');
    }

    const now = new Date();
    const result = await this.prisma.$transaction(async tx => {
      // Close any open negotiation rounds.
      const closedRounds = await tx.negotiationRound.updateMany({
        where: { tenderId: id, closedAt: null },
        data: {
          closedAt: now,
          closedBy: userId,
          closeReason: 'Auto-closed by tender cancellation.',
        },
      });

      // Lock every non-LOCKED bid envelope.
      const lockedEnvelopes = await tx.bidEnvelope.updateMany({
        where: { bid: { tenderId: id }, status: { not: EnvelopeStatus.LOCKED } },
        data: { status: EnvelopeStatus.LOCKED, lockedAt: now },
      });

      const updated = await tx.tender.update({
        where: { id },
        data: { status: TenderStatus.CANCELLED, previousStatus: null },
      });

      return {
        updated,
        roundsClosed: closedRounds.count,
        envelopesLocked: lockedEnvelopes.count,
      };
    });

    await this.audit.log({
      eventType: 'TENDER_CANCELLED',
      entityType: 'Tender',
      entityId: id,
      tenderId: id,
      actorUserId: userId,
      beforeValue: { status: tender.status },
      afterValue: {
        status: TenderStatus.CANCELLED,
        roundsClosed: result.roundsClosed,
        envelopesLocked: result.envelopesLocked,
      },
      reason,
      riskLevel: AuditRiskLevel.HIGH,
    });
    return result.updated;
  }

  // BUG-132 (2026-06-14): put a tender on Hold. Snapshots the current status
  // into previousStatus so Resume can return it. No side-effects on bids or
  // negotiation rounds — Hold is reversible.
  async suspend(id: string, dto: { reason: string }, userId: string) {
    if (!dto?.reason || dto.reason.trim().length < 20) {
      throw new BadRequestException('Reason is required and must be at least 20 characters.');
    }
    const tender = await this.prisma.tender.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!tender) throw new NotFoundException('Tender not found');
    if (tender.status === TenderStatus.SUSPENDED) {
      throw new BadRequestException('Tender is already on hold.');
    }
    if (tender.status === TenderStatus.CANCELLED) {
      throw new BadRequestException('Cancelled tenders cannot be put on hold.');
    }

    const updated = await this.prisma.tender.update({
      where: { id },
      data: { status: TenderStatus.SUSPENDED, previousStatus: tender.status },
    });
    await this.audit.log({
      eventType: 'TENDER_SUSPENDED',
      entityType: 'Tender',
      entityId: id,
      tenderId: id,
      actorUserId: userId,
      beforeValue: { status: tender.status },
      afterValue: { status: TenderStatus.SUSPENDED, previousStatus: tender.status },
      reason: dto.reason.trim(),
      riskLevel: AuditRiskLevel.HIGH,
    });
    return updated;
  }

  // BUG-132 (2026-06-14): resume a held tender back to its previousStatus.
  async resume(id: string, dto: { reason: string }, userId: string) {
    if (!dto?.reason || dto.reason.trim().length < 20) {
      throw new BadRequestException('Reason is required and must be at least 20 characters.');
    }
    const tender = await this.prisma.tender.findUnique({
      where: { id },
      select: { id: true, status: true, previousStatus: true },
    });
    if (!tender) throw new NotFoundException('Tender not found');
    if (tender.status !== TenderStatus.SUSPENDED) {
      throw new BadRequestException(
        `Resume only supported from Suspended; current status is ${tender.status}.`,
      );
    }
    if (!tender.previousStatus) {
      throw new BadRequestException(
        'Cannot resume — no previous status recorded. Restore via a state-change action instead.',
      );
    }

    const target = tender.previousStatus;
    const updated = await this.prisma.tender.update({
      where: { id },
      data: { status: target, previousStatus: null },
    });
    await this.audit.log({
      eventType: 'TENDER_RESUMED',
      entityType: 'Tender',
      entityId: id,
      tenderId: id,
      actorUserId: userId,
      beforeValue: { status: TenderStatus.SUSPENDED, previousStatus: target },
      afterValue: { status: target },
      reason: dto.reason.trim(),
      riskLevel: AuditRiskLevel.HIGH,
    });
    return updated;
  }

  // BUG-125 (2026-06-11): reverse of closeTender. Tender Closed → Awarded.
  // Requires a reason (≥20 chars) since this re-opens a terminal-state
  // record. Same perm as closeTender (tender:close) — the same role decides
  // both directions. Audit HIGH risk.
  async reopenTender(
    id: string,
    dto: { reason: string },
    userId: string,
  ) {
    if (!dto?.reason || dto.reason.trim().length < 20) {
      throw new BadRequestException('Reason is required and must be at least 20 characters.');
    }
    const tender = await this.prisma.tender.findUnique({
      where: { id },
      select: { id: true, status: true, reference: true },
    });
    if (!tender) throw new NotFoundException('Tender not found');
    if (tender.status !== TenderStatus.TENDER_CLOSED) {
      throw new BadRequestException(
        `Reopen only supported from Tender Closed; current status is ${tender.status}.`,
      );
    }
    const updated = await this.prisma.tender.update({
      where: { id },
      data: { status: TenderStatus.AWARDED },
    });
    await this.audit.log({
      eventType: 'TENDER_REOPENED',
      entityType: 'Tender',
      entityId: id,
      tenderId: id,
      actorUserId: userId,
      beforeValue: { status: TenderStatus.TENDER_CLOSED },
      afterValue: { status: TenderStatus.AWARDED },
      reason: dto.reason.trim(),
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

  // BUG-141 (2026-06-19): re-open a Submission Closed tender by pushing the
  // submission deadline into the future. Reason is mandatory; HIGH-risk audit
  // since it reverses a closed state. Only allowed from SUBMISSION_CLOSED —
  // once the technical envelopes have been opened, this is no longer safe.
  async extendSubmission(
    id: string,
    dto: { newSubmissionDeadline: string; newClarificationDeadline?: string; reason: string },
    userId: string,
  ) {
    if (!dto?.reason || dto.reason.trim().length < 20) {
      throw new BadRequestException('Reason is required and must be at least 20 characters.');
    }
    const newDeadline = new Date(dto.newSubmissionDeadline);
    if (Number.isNaN(newDeadline.getTime())) {
      throw new BadRequestException('newSubmissionDeadline is not a valid date.');
    }
    if (newDeadline.getTime() <= Date.now()) {
      throw new BadRequestException('newSubmissionDeadline must be in the future.');
    }

    const tender = await this.prisma.tender.findUnique({
      where: { id },
      select: { id: true, status: true, reference: true, submissionCloseAt: true, clarificationCloseAt: true },
    });
    if (!tender) throw new NotFoundException('Tender not found');
    if (tender.status !== TenderStatus.SUBMISSION_CLOSED) {
      throw new BadRequestException(
        `Extension only supported from Submission Closed; current status is ${tender.status}. Once technical envelopes have been opened, the tender cannot be re-opened for new submissions.`,
      );
    }

    const data: Prisma.TenderUpdateInput = {
      status: TenderStatus.PUBLISHED,
      submissionCloseAt: newDeadline,
    };
    if (dto.newClarificationDeadline !== undefined) {
      const ncl = new Date(dto.newClarificationDeadline);
      if (Number.isNaN(ncl.getTime())) {
        throw new BadRequestException('newClarificationDeadline is not a valid date.');
      }
      data.clarificationCloseAt = ncl;
    }

    const updated = await this.prisma.tender.update({ where: { id }, data });

    await this.audit.log({
      eventType: 'TENDER_SUBMISSION_EXTENDED',
      entityType: 'Tender',
      entityId: id,
      tenderId: id,
      actorUserId: userId,
      beforeValue: {
        status: TenderStatus.SUBMISSION_CLOSED,
        submissionCloseAt: tender.submissionCloseAt?.toISOString() ?? null,
        clarificationCloseAt: tender.clarificationCloseAt?.toISOString() ?? null,
      },
      afterValue: {
        status: TenderStatus.PUBLISHED,
        submissionCloseAt: newDeadline.toISOString(),
        clarificationCloseAt: dto.newClarificationDeadline ?? tender.clarificationCloseAt?.toISOString() ?? null,
      },
      reason: dto.reason.trim(),
      riskLevel: AuditRiskLevel.HIGH,
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
      // BUG-132 (2026-06-14): set when status === 'Suspended' so the admin
      // Resume dialog can show "Will be resumed to: <previousStatus>".
      previousStatus: t.previousStatus
        ? STATUS_DB_TO_API[t.previousStatus as TenderStatus]
        : null,
      // BUG-137 (2026-06-19): bid wizard reads this to show the Supporting
      // Documents step + admin tender pages render the read-only badge.
      requiresSupportingDocuments: t.requiresSupportingDocuments ?? false,
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
      // WALK-057: Bids stat tile next to Days Left. `_count.bids` is set when
      // findOne includes it; safe fallback to 0 if a caller path skips that.
      bidCount: t._count?.bids ?? 0,
      description: t.description ?? undefined,
      clarificationDeadline: t.clarificationCloseAt?.toISOString() ?? null,
      // BUG-092 (2026-06-02): expose award fields on the detail response so the
      // Awarded Tenders archive Overview tab can render them. The fields exist
      // on the model (BUG-068 + Phase D) but were never serialized.
      awardedAt: t.awardedAt?.toISOString() ?? null,
      awardedAmount: t.awardedAmount != null ? Number(t.awardedAmount) : null,
      awardedVendorId: t.awardedVendor?.id ?? t.awardedVendorId ?? null,
      awardedVendorName: t.awardedVendor?.companyName ?? null,
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
