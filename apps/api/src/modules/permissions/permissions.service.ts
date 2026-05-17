import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    throw new Error('Not implemented');
  }

  async getPermissionsForUser(userId: string): Promise<string[]> {
    // TODO: join user_roles → role_permissions → permissions, return permission codes
    throw new Error('Not implemented');
  }
}
