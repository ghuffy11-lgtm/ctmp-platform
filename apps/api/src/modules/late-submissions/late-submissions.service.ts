import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateExceptionDto } from './dto/create-exception.dto';

@Injectable()
export class LateSubmissionsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenderId: string) {
    throw new Error('Not implemented');
  }

  async create(tenderId: string, dto: CreateExceptionDto, grantedByUserId: string) {
    // TODO: enforce one active exception per (tender, vendor) via DB partial unique index,
    // require reason + expiry, audit log — late submissions blocked by default per business rules
    throw new Error('Not implemented');
  }

  async isExceptionActive(tenderId: string, vendorId: string): Promise<boolean> {
    // TODO: called by bids service during submission check
    throw new Error('Not implemented');
  }
}
