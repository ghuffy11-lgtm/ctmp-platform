import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditRiskLevel, BidBoqStatus, BidStatus, Prisma, TenderStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { BidBoqLineStatus, ReplaceBidBoqDto } from './dto/replace-bid-boq.dto';
import { ReplaceTenderBoqDto } from './dto/replace-tender-boq.dto';

// Mirrors the gate in evaluation-criteria.service.ts:replaceTenderCriteria.
// BOQ is locked once the tender is published; vendors bid against the template.
const TEMPLATE_EDITABLE_STATUSES: TenderStatus[] = [
  TenderStatus.DRAFT,
  TenderStatus.INTERNAL_REVIEW,
  TenderStatus.APPROVED,
];

/**
 * BUG-068 / Phase F BOQ — owner-locked decisions 2026-05-31:
 *
 * 1. PDF on commercial envelope is OPTIONAL. BOQ is the legal price record.
 * 2. Auto-backfilled placeholder row exists for every legacy tender.
 * 3. Vendor partial bids use explicit NOT_BIDDING; blanks rejected at submit.
 * 4. Template editable only in Draft / Internal Review / Approved.
 */
@Injectable()
export class BoqService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ───────────── Tender BOQ template ─────────────

  async listTenderBoq(tenderId: string) {
    const tender = await this.prisma.tender.findUnique({
      where: { id: tenderId },
      select: { id: true },
    });
    if (!tender) throw new NotFoundException('Tender not found');
    const items = await this.prisma.tenderBoqItem.findMany({
      where: { tenderId },
      orderBy: [{ sortOrder: 'asc' }, { itemNo: 'asc' }],
    });
    return {
      items: items.map(i => ({
        id: i.id,
        itemNo: i.itemNo,
        description: i.description,
        qty: Number(i.qty),
        unit: i.unit,
        sortOrder: i.sortOrder,
      })),
    };
  }

  async replaceTenderBoq(tenderId: string, dto: ReplaceTenderBoqDto, actorUserId: string) {
    const tender = await this.prisma.tender.findUnique({
      where: { id: tenderId },
      select: { id: true, status: true },
    });
    if (!tender) throw new NotFoundException('Tender not found');
    if (!TEMPLATE_EDITABLE_STATUSES.includes(tender.status)) {
      throw new BadRequestException(
        `BOQ template is locked once tender leaves DRAFT/INTERNAL_REVIEW/APPROVED (current: ${tender.status}).`,
      );
    }

    // Validate unique item_no per payload.
    const seen = new Set<string>();
    for (const it of dto.items) {
      const key = it.itemNo.trim();
      if (seen.has(key)) {
        throw new BadRequestException(`Duplicate item_no "${key}" in payload.`);
      }
      seen.add(key);
    }

    const existing = await this.prisma.tenderBoqItem.findMany({
      where: { tenderId },
      select: { id: true },
    });
    const existingIds = new Set(existing.map(e => e.id));
    const keepIds = new Set(dto.items.filter(i => i.id).map(i => i.id as string));
    const toDelete = [...existingIds].filter(id => !keepIds.has(id));

    await this.prisma.$transaction(async tx => {
      if (toDelete.length > 0) {
        // Restrict-on-delete from bid_boq_items will block deletion of rows
        // already referenced by submitted bids. That's intentional — once a
        // vendor bids against an item, the buyer cannot retroactively yank it.
        // Pre-Published tenders have no bids yet, so this is safe in practice.
        await tx.tenderBoqItem.deleteMany({ where: { id: { in: toDelete } } });
      }
      for (let i = 0; i < dto.items.length; i++) {
        const it = dto.items[i];
        const data = {
          tenderId,
          itemNo: it.itemNo.trim(),
          description: it.description.trim(),
          qty: new Prisma.Decimal(it.qty),
          unit: it.unit.trim(),
          sortOrder: it.sortOrder ?? i,
        };
        if (it.id && existingIds.has(it.id)) {
          await tx.tenderBoqItem.update({ where: { id: it.id }, data });
        } else {
          await tx.tenderBoqItem.create({ data });
        }
      }
    });

    await this.audit.log({
      eventType: 'BOQ_TEMPLATE_REPLACED',
      entityType: 'Tender',
      entityId: tenderId,
      tenderId,
      actorUserId,
      afterValue: { itemCount: dto.items.length },
      riskLevel: AuditRiskLevel.HIGH,
    });

    return this.listTenderBoq(tenderId);
  }

  // ───────────── Bid BOQ entries ─────────────

  async listBidBoq(bidId: string, user: any) {
    const bid = await this.prisma.bid.findUnique({
      where: { id: bidId },
      select: { id: true, vendorId: true, tenderId: true },
    });
    if (!bid) throw new NotFoundException('Bid not found');

    // Vendor: own bid only. Internal user: gated by tender:view (the controller
    // applies the perm decorator; here we just trust the guard).
    if (user?.vendorId && bid.vendorId !== user.vendorId) {
      throw new ForbiddenException('Not your bid');
    }

    const items = await this.prisma.bidBoqItem.findMany({
      where: { bidId },
      include: {
        tenderBoqItem: {
          select: { itemNo: true, description: true, qty: true, unit: true, sortOrder: true },
        },
      },
      orderBy: { tenderBoqItem: { sortOrder: 'asc' } },
    });
    return {
      items: items.map(i => ({
        id: i.id,
        tenderBoqItemId: i.tenderBoqItemId,
        itemNo: i.tenderBoqItem.itemNo,
        description: i.tenderBoqItem.description,
        qty: Number(i.tenderBoqItem.qty),
        unit: i.tenderBoqItem.unit,
        status: i.status,
        unitPrice: i.unitPrice == null ? null : Number(i.unitPrice),
        lineTotal: i.status === BidBoqStatus.BIDDING && i.unitPrice != null
          ? Number(i.unitPrice) * Number(i.tenderBoqItem.qty)
          : null,
        remarks: i.remarks ?? null,
      })),
    };
  }

  async replaceBidBoq(bidId: string, dto: ReplaceBidBoqDto, vendor: any) {
    const bid = await this.prisma.bid.findUnique({
      where: { id: bidId },
      select: { id: true, vendorId: true, tenderId: true, status: true, submittedAt: true },
    });
    if (!bid) throw new NotFoundException('Bid not found');
    if (!vendor?.vendorId || bid.vendorId !== vendor.vendorId) {
      throw new ForbiddenException('Not your bid');
    }
    if (bid.status !== BidStatus.DRAFT || bid.submittedAt != null) {
      throw new ForbiddenException('Bid is already submitted and immutable');
    }

    // Tender's BOQ template must cover every line the vendor sends, and the
    // vendor's payload must cover every template row exactly once.
    const tenderItems = await this.prisma.tenderBoqItem.findMany({
      where: { tenderId: bid.tenderId },
      select: { id: true },
    });
    const tenderItemIds = new Set(tenderItems.map(t => t.id));
    const seen = new Set<string>();
    for (const line of dto.items) {
      if (!tenderItemIds.has(line.tenderBoqItemId)) {
        throw new BadRequestException(`Unknown tenderBoqItemId ${line.tenderBoqItemId}`);
      }
      if (seen.has(line.tenderBoqItemId)) {
        throw new BadRequestException(`Duplicate line for tenderBoqItemId ${line.tenderBoqItemId}`);
      }
      seen.add(line.tenderBoqItemId);
      // Consistency check mirroring the DB CHECK constraint (clearer error than the FK violation).
      if (line.status === BidBoqLineStatus.BIDDING) {
        if (line.unitPrice == null || line.unitPrice < 0) {
          throw new BadRequestException(`BIDDING line ${line.tenderBoqItemId} requires unitPrice >= 0`);
        }
      } else if (line.status === BidBoqLineStatus.NOT_BIDDING) {
        if (line.unitPrice != null) {
          throw new BadRequestException(`NOT_BIDDING line ${line.tenderBoqItemId} must omit unitPrice`);
        }
      }
    }
    // Coverage check: every template row must appear in the payload.
    if (seen.size !== tenderItemIds.size) {
      throw new BadRequestException(
        `Payload covers ${seen.size} lines but template has ${tenderItemIds.size}. Every line must have a status.`,
      );
    }

    await this.prisma.$transaction(async tx => {
      await tx.bidBoqItem.deleteMany({ where: { bidId } });
      await tx.bidBoqItem.createMany({
        data: dto.items.map(line => ({
          bidId,
          tenderBoqItemId: line.tenderBoqItemId,
          status: line.status === BidBoqLineStatus.BIDDING ? BidBoqStatus.BIDDING : BidBoqStatus.NOT_BIDDING,
          unitPrice: line.unitPrice != null ? new Prisma.Decimal(line.unitPrice) : null,
          remarks: line.remarks?.trim() ?? null,
        })),
      });
    });

    await this.audit.log({
      eventType: 'BID_BOQ_REPLACED',
      entityType: 'Bid',
      entityId: bidId,
      tenderId: bid.tenderId,
      bidId,
      actorVendorUserId: vendor.id,
      afterValue: {
        biddingCount: dto.items.filter(i => i.status === BidBoqLineStatus.BIDDING).length,
        notBiddingCount: dto.items.filter(i => i.status === BidBoqLineStatus.NOT_BIDDING).length,
      },
      riskLevel: AuditRiskLevel.LOW,
    });

    return this.listBidBoq(bidId, vendor);
  }

  // ───────────── Helpers used by other services ─────────────

  /**
   * Returns true when the tender has a real (non-placeholder) BOQ template.
   * The migration auto-backfills a single placeholder row ('item_no=0',
   * description='Legacy tender — no BOQ defined') for every existing tender;
   * those rows DO NOT count.
   */
  async hasRealBoqTemplate(tenderId: string): Promise<boolean> {
    const count = await this.prisma.tenderBoqItem.count({
      where: {
        tenderId,
        NOT: { itemNo: '0', description: 'Legacy tender — no BOQ defined' },
      },
    });
    return count > 0;
  }
}
