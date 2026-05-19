import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditRiskLevel } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll() {
    const roles = await this.prisma.role.findMany({
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
      include: {
        _count: {
          select: { rolePermissions: true, userRoles: true },
        },
      },
    });

    return {
      items: roles.map(r => ({
        id: r.id,
        name: r.name,
        description: r.description ?? undefined,
        permissionCount: r._count.rolePermissions,
        userCount: r._count.userRoles,
        isSystem: r.isSystem,
      })),
    };
  }

  async findOne(id: string) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: {
        rolePermissions: { include: { permission: true } },
        _count: { select: { rolePermissions: true, userRoles: true } },
      },
    });
    if (!role) throw new NotFoundException('Role not found');
    return {
      id: role.id,
      name: role.name,
      description: role.description ?? undefined,
      permissionCount: role._count.rolePermissions,
      userCount: role._count.userRoles,
      isSystem: role.isSystem,
      permissions: role.rolePermissions.map(rp => ({
        id: rp.permission.id,
        code: rp.permission.code,
        name: rp.permission.name,
        description: rp.permission.description ?? undefined,
        group: rp.permission.category,
      })),
    };
  }

  async create(data: any) {
    // TODO: audit log
    throw new Error('Not implemented');
  }

  async update(id: string, data: any) {
    // TODO: audit log on permission changes
    throw new Error('Not implemented');
  }

  async remove(id: string) {
    // TODO: prevent deletion of system roles, audit log
    throw new Error('Not implemented');
  }

  async assignToUser(userId: string, roleId: string) {
    // TODO: used by users service
    throw new Error('Not implemented');
  }

  async getPermissions(roleId: string) {
    const role = await this.prisma.role.findUnique({
      where: { id: roleId },
      include: { rolePermissions: { select: { permissionId: true } } },
    });
    if (!role) throw new NotFoundException('Role not found');
    return { permissionIds: role.rolePermissions.map(rp => rp.permissionId) };
  }

  async setPermissions(roleId: string, permissionIds: string[], actorUserId?: string) {
    if (!Array.isArray(permissionIds)) {
      throw new BadRequestException('permissionIds must be an array');
    }

    const role = await this.prisma.role.findUnique({
      where: { id: roleId },
      include: { rolePermissions: { select: { permissionId: true } } },
    });
    if (!role) throw new NotFoundException('Role not found');
    if (role.isSystem) {
      throw new ForbiddenException('System roles are read-only');
    }

    const requestedIds = new Set(permissionIds);
    if (requestedIds.size !== permissionIds.length) {
      throw new BadRequestException('permissionIds must be unique');
    }

    // Verify all requested permissions exist.
    const existing = await this.prisma.permission.findMany({
      where: { id: { in: permissionIds } },
      select: { id: true },
    });
    if (existing.length !== permissionIds.length) {
      throw new BadRequestException('One or more permissionIds do not exist');
    }

    const currentIds = new Set(role.rolePermissions.map(rp => rp.permissionId));
    const toAdd = permissionIds.filter(id => !currentIds.has(id));
    const toRemove = [...currentIds].filter(id => !requestedIds.has(id));

    await this.prisma.$transaction([
      this.prisma.rolePermission.deleteMany({
        where: { roleId, permissionId: { in: toRemove } },
      }),
      this.prisma.rolePermission.createMany({
        data: toAdd.map(permissionId => ({ roleId, permissionId })),
        skipDuplicates: true,
      }),
    ]);

    if (toAdd.length > 0 || toRemove.length > 0) {
      await this.audit.log({
        eventType: 'ROLE_PERMISSIONS_UPDATED',
        entityType: 'Role',
        entityId: roleId,
        actorUserId,
        actorRoleCode: undefined,
        beforeValue: { permissionIds: [...currentIds] },
        afterValue: { permissionIds },
        metadata: { added: toAdd, removed: toRemove },
        riskLevel: AuditRiskLevel.HIGH,
      });
    }

    return { permissionIds };
  }
}
