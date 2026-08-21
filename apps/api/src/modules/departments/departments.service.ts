import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { AuditRiskLevel, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';

@Injectable()
export class DepartmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll(limit = 100, includeInactive = false) {
    const data = await this.prisma.department.findMany({
      where: includeInactive ? {} : { isActive: true },
      select: { id: true, name: true, nameAr: true, code: true, parentId: true, isActive: true },
      orderBy: { name: 'asc' },
      take: limit,
    });
    return { data, total: data.length };
  }

  async findOne(id: string) {
    const dept = await this.prisma.department.findUnique({
      where: { id },
      select: { id: true, name: true, nameAr: true, code: true, parentId: true, isActive: true },
    });
    if (!dept) throw new NotFoundException('Department not found');
    return dept;
  }

  async create(dto: CreateDepartmentDto, actorUserId?: string) {
    if (dto.parentId) {
      const parent = await this.prisma.department.findUnique({ where: { id: dto.parentId } });
      if (!parent) throw new BadRequestException('parentId does not exist');
    }

    let dept;
    try {
      dept = await this.prisma.department.create({
        data: {
          code: dto.code,
          name: dto.name,
          nameAr: dto.nameAr?.trim() || null,
          parentId: dto.parentId ?? null,
        },
        select: { id: true, name: true, nameAr: true, code: true, parentId: true, isActive: true },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(`Department code '${dto.code}' already exists`);
      }
      throw err;
    }

    await this.audit.log({
      eventType: 'DEPARTMENT_CREATED',
      entityType: 'Department',
      entityId: dept.id,
      actorUserId,
      afterValue: dept,
      riskLevel: AuditRiskLevel.MEDIUM,
    });

    return dept;
  }

  async update(id: string, dto: UpdateDepartmentDto, actorUserId?: string) {
    const before = await this.prisma.department.findUnique({
      where: { id },
      select: { id: true, name: true, nameAr: true, code: true, parentId: true, isActive: true },
    });
    if (!before) throw new NotFoundException('Department not found');

    if (dto.parentId !== undefined && dto.parentId !== null) {
      if (dto.parentId === id) throw new BadRequestException('Department cannot be its own parent');
      const parent = await this.prisma.department.findUnique({ where: { id: dto.parentId } });
      if (!parent) throw new BadRequestException('parentId does not exist');
    }

    const data: Prisma.DepartmentUpdateInput = { updatedAt: new Date() };
    if (dto.name !== undefined) data.name = dto.name;
    // Migration 054: blank string clears the Arabic name (falls back to name).
    if (dto.nameAr !== undefined) data.nameAr = dto.nameAr?.trim() || null;
    if (dto.parentId !== undefined) {
      data.parent = dto.parentId === null
        ? { disconnect: true }
        : { connect: { id: dto.parentId } };
    }
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    const after = await this.prisma.department.update({
      where: { id },
      data,
      select: { id: true, name: true, nameAr: true, code: true, parentId: true, isActive: true },
    });

    await this.audit.log({
      eventType: 'DEPARTMENT_UPDATED',
      entityType: 'Department',
      entityId: id,
      actorUserId,
      beforeValue: before,
      afterValue: after,
      riskLevel: AuditRiskLevel.MEDIUM,
    });

    return after;
  }

  async disable(id: string, actorUserId?: string) {
    const before = await this.prisma.department.findUnique({
      where: { id },
      select: { id: true, name: true, nameAr: true, code: true, parentId: true, isActive: true },
    });
    if (!before) throw new NotFoundException('Department not found');
    if (!before.isActive) return before;

    const after = await this.prisma.department.update({
      where: { id },
      data: { isActive: false, updatedAt: new Date() },
      select: { id: true, name: true, nameAr: true, code: true, parentId: true, isActive: true },
    });

    await this.audit.log({
      eventType: 'DEPARTMENT_DISABLED',
      entityType: 'Department',
      entityId: id,
      actorUserId,
      beforeValue: before,
      afterValue: after,
      riskLevel: AuditRiskLevel.MEDIUM,
    });

    return after;
  }
}
