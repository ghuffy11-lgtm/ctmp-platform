import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    throw new Error('Not implemented');
  }

  async findOne(id: string) {
    throw new Error('Not implemented');
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
}
