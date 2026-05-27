import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TenderStatus, AuditRiskLevel } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateLibraryEntryDto, UpdateLibraryEntryDto } from './dto/library-entry.dto';
import { ReplaceTenderCriteriaDto } from './dto/replace-tender-criteria.dto';

// Per master plan: per-tender criteria are editable while the tender is in
// DRAFT, INTERNAL_REVIEW, or APPROVED. Locked once Publish flips it.
const EDITABLE_STATUSES: TenderStatus[] = [
  TenderStatus.DRAFT,
  TenderStatus.INTERNAL_REVIEW,
  TenderStatus.APPROVED,
];

@Injectable()
export class EvaluationCriteriaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // -------------------------------------------------------- Library --
  async listLibrary(includeInactive = false) {
    const where: Prisma.EvaluationCriteriaLibraryWhereInput = includeInactive ? {} : { isActive: true };
    const items = await this.prisma.evaluationCriteriaLibrary.findMany({
      where,
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
    return items.map(this.serializeLibrary);
  }

  async createLibraryEntry(dto: CreateLibraryEntryDto, userId: string) {
    try {
      const created = await this.prisma.evaluationCriteriaLibrary.create({
        data: {
          name: dto.name.trim(),
          description: dto.description?.trim() ?? null,
          defaultWeight: dto.defaultWeight != null ? new Prisma.Decimal(dto.defaultWeight) : null,
          defaultMaxScore: new Prisma.Decimal(dto.defaultMaxScore ?? 100),
          defaultIsGate: dto.defaultIsGate ?? false,
          isActive: dto.isActive ?? true,
          createdBy: userId,
        },
      });
      await this.audit.log({
        eventType: 'CRITERIA_LIBRARY_CREATED',
        entityType: 'EvaluationCriteriaLibrary',
        entityId: created.id,
        actorUserId: userId,
        afterValue: { name: created.name },
        riskLevel: AuditRiskLevel.LOW,
      });
      return this.serializeLibrary(created);
    } catch (err: any) {
      if (err.code === 'P2002') {
        throw new BadRequestException('A library entry with that name already exists.');
      }
      throw err;
    }
  }

  async updateLibraryEntry(id: string, dto: UpdateLibraryEntryDto, userId: string) {
    const existing = await this.prisma.evaluationCriteriaLibrary.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Library entry not found');
    const data: Prisma.EvaluationCriteriaLibraryUpdateInput = {
      updatedAt: new Date(),
    };
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.description !== undefined) data.description = dto.description?.trim() ?? null;
    if (dto.defaultWeight !== undefined) {
      data.defaultWeight = dto.defaultWeight != null ? new Prisma.Decimal(dto.defaultWeight) : null;
    }
    if (dto.defaultMaxScore !== undefined) data.defaultMaxScore = new Prisma.Decimal(dto.defaultMaxScore);
    if (dto.defaultIsGate !== undefined) data.defaultIsGate = dto.defaultIsGate;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    const updated = await this.prisma.evaluationCriteriaLibrary.update({
      where: { id },
      data,
    });
    await this.audit.log({
      eventType: 'CRITERIA_LIBRARY_UPDATED',
      entityType: 'EvaluationCriteriaLibrary',
      entityId: id,
      actorUserId: userId,
      beforeValue: { name: existing.name, isActive: existing.isActive },
      afterValue: { name: updated.name, isActive: updated.isActive },
      riskLevel: AuditRiskLevel.LOW,
    });
    return this.serializeLibrary(updated);
  }

  async deactivateLibraryEntry(id: string, userId: string) {
    return this.updateLibraryEntry(id, { isActive: false } as UpdateLibraryEntryDto, userId);
  }

  // --------------------------------------------------- Per-tender --

  async listTenderCriteria(tenderId: string) {
    const items = await this.prisma.tenderTechnicalCriterion.findMany({
      where: { tenderId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return items.map(this.serializeTenderCriterion);
  }

  /**
   * Replace ALL per-tender criteria atomically. Validates:
   *   - tender is in DRAFT / INTERNAL_REVIEW / APPROVED
   *   - codes are unique within the payload
   *   - weights sum to EXACTLY 100 (master plan §C2)
   *   - each weight + maxScore is positive
   * Criteria with `id` set are preserved by id; new ones get a fresh id.
   * Criteria omitted from the payload are deleted.
   */
  async replaceTenderCriteria(tenderId: string, dto: ReplaceTenderCriteriaDto, userId: string) {
    const tender = await this.prisma.tender.findUnique({
      where: { id: tenderId },
      select: { id: true, status: true },
    });
    if (!tender) throw new NotFoundException('Tender not found');
    if (!EDITABLE_STATUSES.includes(tender.status)) {
      throw new BadRequestException(
        `Criteria are locked once tender leaves DRAFT/INTERNAL_REVIEW/APPROVED (current: ${tender.status}).`,
      );
    }

    const codes = new Set<string>();
    let weightSum = 0;
    for (const c of dto.criteria) {
      const code = c.code.trim();
      if (codes.has(code)) {
        throw new BadRequestException(`Duplicate criterion code "${code}" in payload.`);
      }
      codes.add(code);
      weightSum += Number(c.weight);
    }
    // Allow tiny FP slop (e.g. 100.0001 from 33.33+33.33+33.34).
    if (Math.abs(weightSum - 100) > 0.05) {
      throw new BadRequestException(
        `Weights must sum to 100. Current sum: ${weightSum.toFixed(2)}.`,
      );
    }

    const existing = await this.prisma.tenderTechnicalCriterion.findMany({
      where: { tenderId },
      select: { id: true },
    });
    const existingIds = new Set(existing.map(e => e.id));
    const keepIds = new Set(dto.criteria.filter(c => c.id).map(c => c.id as string));
    const toDelete = [...existingIds].filter(id => !keepIds.has(id));

    await this.prisma.$transaction(async tx => {
      // Delete removed.
      if (toDelete.length > 0) {
        await tx.tenderTechnicalCriterion.deleteMany({ where: { id: { in: toDelete } } });
      }
      // Upsert each.
      for (let i = 0; i < dto.criteria.length; i++) {
        const c = dto.criteria[i];
        const data = {
          tenderId,
          code: c.code.trim(),
          name: c.name.trim(),
          description: c.description?.trim() ?? null,
          maxScore: new Prisma.Decimal(c.maxScore),
          weight: new Prisma.Decimal(c.weight),
          mandatory: c.mandatory,
          sortOrder: c.sortOrder ?? i,
        };
        if (c.id && existingIds.has(c.id)) {
          await tx.tenderTechnicalCriterion.update({ where: { id: c.id }, data });
        } else {
          await tx.tenderTechnicalCriterion.create({ data });
        }
      }
    });

    await this.audit.log({
      eventType: 'TENDER_CRITERIA_REPLACED',
      entityType: 'Tender',
      entityId: tenderId,
      tenderId,
      actorUserId: userId,
      afterValue: {
        criterionCount: dto.criteria.length,
        weightSum,
        codes: [...codes],
      },
      riskLevel: AuditRiskLevel.MEDIUM,
    });

    return this.listTenderCriteria(tenderId);
  }

  // ----------------------------------------------------- helpers --

  private serializeLibrary = (e: any) => ({
    id: e.id,
    name: e.name,
    description: e.description ?? null,
    defaultWeight: e.defaultWeight != null ? Number(e.defaultWeight) : null,
    defaultMaxScore: Number(e.defaultMaxScore),
    defaultIsGate: e.defaultIsGate,
    isActive: e.isActive,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
  });

  private serializeTenderCriterion = (c: any) => ({
    id: c.id,
    tenderId: c.tenderId,
    code: c.code,
    name: c.name,
    description: c.description ?? null,
    maxScore: Number(c.maxScore),
    weight: c.weight != null ? Number(c.weight) : null,
    mandatory: c.mandatory,
    sortOrder: c.sortOrder,
  });
}
