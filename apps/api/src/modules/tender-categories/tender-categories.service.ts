import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditRiskLevel, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateTenderCategoryDto, UpdateTenderCategoryDto } from './dto/tender-category.dto';

/**
 * Managed tender categories (migration 054, 2026-08-13).
 *
 * Until now the category list was a hardcoded array duplicated in the tender
 * create and edit pages, and `tenders.category` was free text with nowhere to
 * hang an Arabic name.
 *
 * That column stays free text on purpose — converting it to a foreign key would
 * ripple through create/edit, list filters, reports, analytics and the executive
 * drill-downs for no benefit here. The trade-off is that the link is BY NAME, so
 * a rename must carry the tenders with it; `update()` does exactly that inside
 * one transaction.
 */
@Injectable()
export class TenderCategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private static readonly SELECT = {
    id: true,
    name: true,
    nameAr: true,
    isActive: true,
    sortOrder: true,
  } as const;

  /** Dropdown source. `includeInactive` is for the settings screen. */
  async findAll(includeInactive = false) {
    const items = await this.prisma.tenderCategory.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: TenderCategoriesService.SELECT,
    });
    return { items };
  }

  async create(dto: CreateTenderCategoryDto, actorUserId?: string) {
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('name is required');
    try {
      const created = await this.prisma.tenderCategory.create({
        data: {
          name,
          nameAr: dto.nameAr?.trim() || null,
          sortOrder: dto.sortOrder ?? 0,
        },
        select: TenderCategoriesService.SELECT,
      });
      await this.audit.log({
        eventType: 'TENDER_CATEGORY_CREATED',
        entityType: 'TenderCategory',
        entityId: created.id,
        actorUserId,
        afterValue: created,
        riskLevel: AuditRiskLevel.LOW,
      });
      return created;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(`Category '${name}' already exists`);
      }
      throw err;
    }
  }

  async update(id: string, dto: UpdateTenderCategoryDto, actorUserId?: string) {
    const before = await this.prisma.tenderCategory.findUnique({
      where: { id },
      select: TenderCategoriesService.SELECT,
    });
    if (!before) throw new NotFoundException('Category not found');

    const nextName = dto.name?.trim();
    const renaming = !!nextName && nextName !== before.name;

    const data: Prisma.TenderCategoryUpdateInput = { updatedAt: new Date() };
    if (nextName) data.name = nextName;
    // Blank string clears the Arabic name — the consumer falls back to `name`.
    if (dto.nameAr !== undefined) data.nameAr = dto.nameAr?.trim() || null;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;

    let after;
    try {
      // A rename and the tenders carrying the old name move together, or not at
      // all. Without this, renaming would orphan every tender in that category:
      // tenders.category holds the NAME, not an id.
      after = await this.prisma.$transaction(async tx => {
        const updated = await tx.tenderCategory.update({
          where: { id },
          data,
          select: TenderCategoriesService.SELECT,
        });
        if (renaming) {
          await tx.tender.updateMany({
            where: { category: before.name },
            data: { category: nextName },
          });
        }
        return updated;
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(`Category '${nextName}' already exists`);
      }
      throw err;
    }

    await this.audit.log({
      eventType: 'TENDER_CATEGORY_UPDATED',
      entityType: 'TenderCategory',
      entityId: id,
      actorUserId,
      beforeValue: before,
      afterValue: after,
      riskLevel: AuditRiskLevel.LOW,
    });
    return after;
  }

  /**
   * Deactivate rather than delete: tenders reference the name, and history must
   * keep reading correctly. An inactive category disappears from the dropdown
   * but existing tenders are untouched.
   */
  async deactivate(id: string, actorUserId?: string) {
    const before = await this.prisma.tenderCategory.findUnique({
      where: { id },
      select: TenderCategoriesService.SELECT,
    });
    if (!before) throw new NotFoundException('Category not found');

    const inUse = await this.prisma.tender.count({ where: { category: before.name } });
    const after = await this.prisma.tenderCategory.update({
      where: { id },
      data: { isActive: false, updatedAt: new Date() },
      select: TenderCategoriesService.SELECT,
    });

    await this.audit.log({
      eventType: 'TENDER_CATEGORY_DEACTIVATED',
      entityType: 'TenderCategory',
      entityId: id,
      actorUserId,
      beforeValue: before,
      afterValue: { ...after, tendersUsingIt: inUse },
      riskLevel: AuditRiskLevel.LOW,
    });
    return { ...after, tendersUsingIt: inUse };
  }
}
