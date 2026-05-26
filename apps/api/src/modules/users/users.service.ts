import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { AuditRiskLevel, Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateUserDto, UserAuthTypeDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

const BCRYPT_ROUNDS = 12;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll() {
    const users = await this.prisma.user.findMany({
      orderBy: [{ status: 'asc' }, { displayName: 'asc' }],
      select: {
        id: true,
        email: true,
        displayName: true,
        adUsername: true,
        authType: true,
        status: true,
        lastLoginAt: true,
        createdAt: true,
        userRoles: { select: { role: { select: { id: true, name: true } } } },
        userDepartments: {
          select: {
            isPrimary: true,
            department: { select: { id: true, name: true, code: true } },
          },
        },
      },
      take: 500,
    });

    const data = users.map(u => ({
      id: u.id,
      email: u.email,
      displayName: u.displayName,
      adUsername: u.adUsername,
      authType: u.authType,
      status: u.status,
      lastLoginAt: u.lastLoginAt,
      createdAt: u.createdAt,
      roles: u.userRoles.map(ur => ur.role),
      departments: u.userDepartments.map(ud => ({
        id: ud.department.id,
        name: ud.department.name,
        code: ud.department.code,
        isPrimary: ud.isPrimary,
      })),
    }));

    return { data, total: data.length };
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        displayName: true,
        adUsername: true,
        authType: true,
        status: true,
        lastLoginAt: true,
        createdAt: true,
        userRoles: { select: { role: { select: { id: true, name: true } } } },
        userDepartments: {
          select: {
            isPrimary: true,
            department: { select: { id: true, name: true, code: true } },
          },
        },
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return {
      ...user,
      roles: user.userRoles.map(ur => ur.role),
      departments: user.userDepartments.map(ud => ({
        id: ud.department.id,
        name: ud.department.name,
        code: ud.department.code,
        isPrimary: ud.isPrimary,
      })),
      userRoles: undefined,
      userDepartments: undefined,
    };
  }

  async findByUsername(username: string) {
    return this.prisma.user.findFirst({
      where: { OR: [{ adUsername: username }, { email: username }] },
    });
  }

  async create(dto: CreateUserDto, actorUserId?: string) {
    const authType = dto.authType ?? UserAuthTypeDto.AD;

    if (authType === UserAuthTypeDto.AD && !dto.adUsername) {
      throw new BadRequestException('adUsername is required when authType=AD');
    }
    if (authType === UserAuthTypeDto.LOCAL && !dto.password) {
      throw new BadRequestException('password is required when authType=LOCAL');
    }

    await this.validateDepartmentSelection(dto.departmentIds, dto.primaryDepartmentId);

    if (dto.roleId) {
      const role = await this.prisma.role.findUnique({ where: { id: dto.roleId } });
      if (!role) throw new BadRequestException('roleId does not exist');
    }

    const passwordHash = dto.password ? await bcrypt.hash(dto.password, BCRYPT_ROUNDS) : null;

    let created;
    try {
      created = await this.prisma.$transaction(async tx => {
        const user = await tx.user.create({
          data: {
            email: dto.email,
            displayName: dto.displayName,
            adUsername: dto.adUsername ?? null,
            authType,
            passwordHash,
            status: 'ACTIVE',
          },
          select: { id: true },
        });

        if (dto.roleId) {
          await tx.userRole.create({
            data: {
              userId: user.id,
              roleId: dto.roleId,
              grantedBy: actorUserId ?? null,
            },
          });
        }

        if (dto.departmentIds && dto.departmentIds.length > 0) {
          await tx.userDepartment.createMany({
            data: dto.departmentIds.map(deptId => ({
              userId: user.id,
              departmentId: deptId,
              isPrimary: deptId === dto.primaryDepartmentId,
            })),
          });
        }

        return user;
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('A user with that email or AD username already exists');
      }
      throw err;
    }

    const full = await this.findOne(created.id);

    await this.audit.log({
      eventType: 'USER_CREATED',
      entityType: 'User',
      entityId: created.id,
      actorUserId,
      afterValue: {
        email: full.email,
        displayName: full.displayName,
        authType: full.authType,
        roleIds: full.roles.map(r => r.id),
        departmentIds: full.departments.map(d => d.id),
      },
      riskLevel: AuditRiskLevel.HIGH,
    });

    return full;
  }

  async update(id: string, dto: UpdateUserDto, actorUserId?: string) {
    const before = await this.prisma.user.findUnique({
      where: { id },
      include: {
        userRoles: { select: { roleId: true } },
        userDepartments: { select: { departmentId: true, isPrimary: true } },
      },
    });
    if (!before) throw new NotFoundException('User not found');

    if (dto.password && before.authType !== 'LOCAL') {
      throw new BadRequestException('password can only be set on LOCAL auth users');
    }

    if (dto.roleId) {
      const role = await this.prisma.role.findUnique({ where: { id: dto.roleId } });
      if (!role) throw new BadRequestException('roleId does not exist');
    }

    if (dto.departmentIds !== undefined) {
      await this.validateDepartmentSelection(dto.departmentIds, dto.primaryDepartmentId);
    }

    const passwordHash = dto.password ? await bcrypt.hash(dto.password, BCRYPT_ROUNDS) : undefined;

    await this.prisma.$transaction(async tx => {
      const data: Prisma.UserUpdateInput = { updatedAt: new Date() };
      if (dto.email !== undefined) data.email = dto.email;
      if (dto.displayName !== undefined) data.displayName = dto.displayName;
      if (dto.adUsername !== undefined) data.adUsername = dto.adUsername;
      if (dto.status !== undefined) data.status = dto.status;
      if (passwordHash !== undefined) {
        data.passwordHash = passwordHash;
        data.failedLoginCount = 0;
        data.lockedUntil = null;
      }
      await tx.user.update({ where: { id }, data });

      if (dto.roleId !== undefined) {
        await tx.userRole.deleteMany({ where: { userId: id } });
        await tx.userRole.create({
          data: { userId: id, roleId: dto.roleId, grantedBy: actorUserId ?? null },
        });
      }

      if (dto.departmentIds !== undefined) {
        await tx.userDepartment.deleteMany({ where: { userId: id } });
        if (dto.departmentIds.length > 0) {
          await tx.userDepartment.createMany({
            data: dto.departmentIds.map(deptId => ({
              userId: id,
              departmentId: deptId,
              isPrimary: deptId === dto.primaryDepartmentId,
            })),
          });
        }
      }
    });

    const after = await this.findOne(id);

    await this.audit.log({
      eventType: 'USER_UPDATED',
      entityType: 'User',
      entityId: id,
      actorUserId,
      beforeValue: {
        email: before.email,
        displayName: before.displayName,
        status: before.status,
        roleIds: before.userRoles.map(r => r.roleId),
        departmentIds: before.userDepartments.map(d => d.departmentId),
        passwordChanged: false,
      },
      afterValue: {
        email: after.email,
        displayName: after.displayName,
        status: after.status,
        roleIds: after.roles.map(r => r.id),
        departmentIds: after.departments.map(d => d.id),
        passwordChanged: passwordHash !== undefined,
      },
      riskLevel: passwordHash !== undefined ? AuditRiskLevel.HIGH : AuditRiskLevel.MEDIUM,
    });

    return after;
  }

  async remove(id: string, actorUserId?: string) {
    const before = await this.prisma.user.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('User not found');
    if (before.status === 'DISABLED') return { id, status: 'DISABLED' };

    await this.prisma.user.update({
      where: { id },
      data: { status: 'DISABLED', updatedAt: new Date() },
    });

    await this.audit.log({
      eventType: 'USER_DISABLED',
      entityType: 'User',
      entityId: id,
      actorUserId,
      beforeValue: { status: before.status },
      afterValue: { status: 'DISABLED' },
      riskLevel: AuditRiskLevel.HIGH,
    });

    return { id, status: 'DISABLED' };
  }

  private async validateDepartmentSelection(departmentIds?: string[], primaryDepartmentId?: string) {
    if (!departmentIds || departmentIds.length === 0) {
      if (primaryDepartmentId) {
        throw new BadRequestException('primaryDepartmentId must be in departmentIds');
      }
      return;
    }
    const unique = new Set(departmentIds);
    if (unique.size !== departmentIds.length) {
      throw new BadRequestException('departmentIds must be unique');
    }
    if (primaryDepartmentId && !unique.has(primaryDepartmentId)) {
      throw new BadRequestException('primaryDepartmentId must be in departmentIds');
    }
    const found = await this.prisma.department.findMany({
      where: { id: { in: departmentIds } },
      select: { id: true },
    });
    if (found.length !== departmentIds.length) {
      throw new BadRequestException('One or more departmentIds do not exist');
    }
  }
}
