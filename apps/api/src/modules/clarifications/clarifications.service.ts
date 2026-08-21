import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ClarificationStatus, Prisma, TenderStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreateClarificationDto } from './dto/create-clarification.dto';
import { ReplyClarificationDto } from './dto/reply-clarification.dto';

// BUG-146 (2026-06-21): humanise the TenderStatus enum to the label form
// used by the frontend StatusBadge. Inline mapping rather than importing
// from tenders.service.ts to keep this module standalone.
const TENDER_STATUS_LABEL: Record<TenderStatus, string> = {
  DRAFT: 'Draft',
  INTERNAL_REVIEW: 'Internal Review',
  APPROVED: 'Approved',
  PUBLISHED: 'Published',
  CLARIFICATION_PERIOD: 'Clarification Period',
  SUBMISSION_CLOSED: 'Submission Closed',
  TECHNICAL_OPENING: 'Technical Opening',
  TECHNICAL_EVALUATION: 'Technical Evaluation',
  COMMERCIAL_SEALED: 'Commercial Sealed',
  COMMITTEE_COMMERCIAL_OPENING: 'Committee Commercial Opening',
  COMMERCIAL_EVALUATION: 'Commercial Evaluation / Comparison',
  NEGOTIATION: 'Negotiation',
  AWARD_RECOMMENDATION: 'Award Recommendation',
  AWARDED: 'Awarded',
  TENDER_CLOSED: 'Tender Closed',
  CANCELLED: 'Cancelled',
  SUSPENDED: 'Suspended',
  ARCHIVED: 'Archived',
};

// BUG-147 (2026-06-21): single source of truth for the tender states in
// which clarifications can be initiated or where the picker can surface
// the tender. Both `create()` and `myTendersWithClarifications()` consult
// this constant so the two whitelists can never drift again.
// Excludes pre-publish (DRAFT/INTERNAL_REVIEW/APPROVED — no vendor
// engagement yet) and terminal states (TENDER_CLOSED/CANCELLED/SUSPENDED/
// ARCHIVED — nothing to clarify).
const CLARIFICATION_ALLOWED_STATES: TenderStatus[] = [
  TenderStatus.PUBLISHED,
  TenderStatus.CLARIFICATION_PERIOD,
  TenderStatus.SUBMISSION_CLOSED,
  TenderStatus.TECHNICAL_OPENING,
  TenderStatus.TECHNICAL_EVALUATION,
  TenderStatus.COMMERCIAL_SEALED,
  TenderStatus.COMMITTEE_COMMERCIAL_OPENING,
  TenderStatus.COMMERCIAL_EVALUATION,
  TenderStatus.NEGOTIATION,
  TenderStatus.AWARD_RECOMMENDATION,
  TenderStatus.AWARDED,
];

@Injectable()
export class ClarificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenderId: string, user: any) {
    const isVendor = !!user?.vendorId;
    const where: Prisma.TenderClarificationWhereInput = { tenderId };
    if (isVendor) {
      // BUG-145 (2026-06-19): every clarification thread is now private to
      // the asking vendor. Vendors only see their own threads — the previous
      // "or there's a public reply on someone else's thread" branch is gone.
      where.vendorId = user.vendorId;
    }
    const items = await this.prisma.tenderClarification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        vendor: { select: { id: true, companyName: true } },
        askedByUser: { select: { displayName: true } },
        askedByVendorUser: { select: { fullName: true } },
        replies: {
          orderBy: { createdAt: 'asc' },
          include: {
            repliedByUser: { select: { displayName: true } },
            repliedByVendorUser: { select: { fullName: true } },
          },
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
        // BUG-147 (2026-06-21): expose who asked so the UI can show
        // "asked by Procurement" vs "asked by vendor X".
        askedByAdmin: !!c.askedByUserId,
        askedByName: c.askedByUser?.displayName ?? c.askedByVendorUser?.fullName ?? null,
        status: c.status,
        createdAt: c.createdAt.toISOString(),
        replies: c.replies.map(r => ({
          id: r.id,
          clarificationId: r.clarificationId,
          reply: r.answer,
          // BUG-145 (2026-06-19): every reply is private to the asking
          // vendor. Field retained on the response for backwards-compat with
          // existing frontends; frontends should ignore it.
          visibility: 'PRIVATE_TO_VENDOR',
          // BUG-147 (2026-06-21): reply caller type so the UI can show
          // who replied (Procurement vs Vendor).
          repliedByAdmin: !!r.repliedByUserId,
          repliedAt: r.createdAt.toISOString(),
          repliedByName: r.repliedByUser?.displayName ?? r.repliedByVendorUser?.fullName ?? null,
        })),
      })),
      total: items.length,
      page: 1,
      pageSize: 200,
    };
  }

  // BUG-146 (2026-06-21) + 2026-06-21 follow-up + BUG-147: vendor-only
  // picker source for the /clarifications hub. Returns two sets unioned:
  //   (A) tenders where the vendor already has at least one clarification
  //       thread, REGARDLESS of current tender state — so the vendor can
  //       always navigate back to historical threads even after the tender
  //       moves into a terminal state.
  //   (B) tenders in a clarification-eligible state (`CLARIFICATION_ALLOWED_STATES`)
  //       where the vendor is engaged (invited via tender_vendors, or has
  //       submitted a bid) — so the vendor can INITIATE a new thread on a
  //       tender they care about, regardless of whether the regular /tenders
  //       listing exposes it.
  // Exposes only id/reference/title/status — no commercial data, no award
  // state. Status uses humanised labels matching the frontend StatusBadge.
  async myTendersWithClarifications(user: any) {
    if (!user?.vendorId) {
      return { items: [] };
    }
    const tenders = await this.prisma.tender.findMany({
      where: {
        OR: [
          // (A) has existing thread, any state
          { tenderClarifications: { some: { vendorId: user.vendorId } } },
          // (B) clarification-eligible state + vendor engaged
          {
            AND: [
              { status: { in: CLARIFICATION_ALLOWED_STATES } },
              {
                OR: [
                  { tenderVendors: { some: { vendorId: user.vendorId } } },
                  { bids: { some: { vendorId: user.vendorId } } },
                ],
              },
            ],
          },
        ],
      },
      select: { id: true, reference: true, title: true, status: true },
      orderBy: { updatedAt: 'desc' },
    });
    return {
      items: tenders.map(t => ({
        id: t.id,
        referenceNumber: t.reference,
        title: t.title,
        status: TENDER_STATUS_LABEL[t.status] ?? t.status,
      })),
    };
  }

  async create(tenderId: string, dto: CreateClarificationDto, user: any) {
    const tender = await this.prisma.tender.findUnique({
      where: { id: tenderId },
      select: { id: true, status: true },
    });
    if (!tender) throw new NotFoundException('Tender not found');

    // BUG-147 (2026-06-21): unified whitelist for the full active tender
    // lifecycle, including NEGOTIATION + AWARD_RECOMMENDATION + AWARDED.
    if (!CLARIFICATION_ALLOWED_STATES.includes(tender.status)) {
      // Owner report 2026-08-07: no raw status names in vendor-facing errors.
      throw new BadRequestException(
        'Questions can no longer be raised on this tender — it has closed or been cancelled. ' +
          'For anything outstanding, contact the procurement team directly.',
      );
    }

    const data: Prisma.TenderClarificationCreateInput = {
      tender: { connect: { id: tenderId } },
      question: dto.question,
      status: ClarificationStatus.OPEN,
    };
    if (user?.vendorId) {
      // Vendor caller — thread is owned by their vendor automatically.
      data.vendor = { connect: { id: user.vendorId } };
      data.askedByVendorUser = { connect: { id: user.id } };
    } else if (user?.id) {
      // BUG-147 (2026-06-21): admin caller MUST specify the target vendor
      // (otherwise the vendor-side query has no way to surface the thread).
      if (!dto.targetVendorId) {
        throw new BadRequestException('targetVendorId is required when admin initiates a clarification');
      }
      // Verify the target vendor is engaged with this tender (invited or
      // has a bid). Avoids admin asking a random vendor on someone else's
      // tender.
      const engagement = await this.prisma.tender.findFirst({
        where: {
          id: tenderId,
          OR: [
            { tenderVendors: { some: { vendorId: dto.targetVendorId } } },
            { bids: { some: { vendorId: dto.targetVendorId } } },
          ],
        },
        select: { id: true },
      });
      if (!engagement) {
        throw new BadRequestException('Target vendor is not invited and has no bid on this tender');
      }
      data.vendor = { connect: { id: dto.targetVendorId } };
      data.askedByUser = { connect: { id: user.id } };
    }

    return this.prisma.tenderClarification.create({ data });
  }

  async reply(clarificationId: string, dto: ReplyClarificationDto, user: any) {
    if (!user) throw new ForbiddenException('Authentication required');

    const clarification = await this.prisma.tenderClarification.findUnique({
      where: { id: clarificationId },
    });
    if (!clarification) throw new NotFoundException('Clarification not found');

    // BUG-147 (2026-06-21): two-way reply model.
    //   * vendor caller → must own the thread
    //   * admin caller  → must hold `clarification:reply` permission
    //     (permission check moved from controller to service because the
    //     controller now accepts vendor tokens too, which carry no perms)
    const isVendor = !!user?.vendorId;
    if (isVendor) {
      if (clarification.vendorId !== user.vendorId) {
        throw new ForbiddenException('Not your clarification thread');
      }
    } else {
      const perms: string[] = user?.permissions ?? [];
      if (!perms.includes('clarification:reply')) {
        throw new ForbiddenException('clarification:reply permission required');
      }
    }

    // Re-open the thread if a new round of conversation is happening.
    // Status stays ANSWERED when admin replies (vendor's question got an
    // answer) and goes back to OPEN when vendor replies (admin needs to
    // respond again).
    const nextStatus = isVendor ? ClarificationStatus.OPEN : ClarificationStatus.ANSWERED;

    const [, reply] = await this.prisma.$transaction([
      this.prisma.tenderClarification.update({
        where: { id: clarificationId },
        data: { status: nextStatus },
      }),
      this.prisma.tenderClarificationReply.create({
        data: {
          clarification: { connect: { id: clarificationId } },
          answer: dto.reply,
          // BUG-147 (2026-06-21): record caller-type on the reply row so
          // the UI can distinguish admin replies from vendor replies.
          ...(isVendor
            ? { repliedByVendorUser: { connect: { id: user.id } } }
            : { repliedByUser: { connect: { id: user.id } } }),
          isPublic: false,
        },
      }),
    ]);

    return reply;
  }
}
