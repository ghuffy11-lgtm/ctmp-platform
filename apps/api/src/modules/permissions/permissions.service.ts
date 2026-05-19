import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const perms = await this.prisma.permission.findMany({
      orderBy: [{ category: 'asc' }, { code: 'asc' }],
    });
    return {
      items: perms.map(p => ({
        id: p.id,
        code: p.code,
        name: p.name,
        description: p.description ?? undefined,
        group: p.category,
      })),
    };
  }

  async getPermissionsForUser(userId: string): Promise<string[]> {
    const rows = await this.prisma.userRole.findMany({
      where: { userId },
      include: {
        role: {
          include: {
            rolePermissions: { include: { permission: true } },
          },
        },
      },
    });
    const codes = new Set<string>();
    for (const ur of rows) {
      for (const rp of ur.role.rolePermissions) {
        codes.add(rp.permission.code);
      }
    }
    return Array.from(codes);
  }
}
