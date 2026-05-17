import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { UpdateVendorDto } from './dto/update-vendor.dto';

@Injectable()
export class VendorsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    throw new Error('Not implemented');
  }

  async findOne(id: string) {
    throw new Error('Not implemented');
  }

  async listRegistrations() {
    throw new Error('Not implemented');
  }

  async approve(registrationId: string) {
    // TODO: create vendor record, send approval email, audit log
    throw new Error('Not implemented');
  }

  async reject(registrationId: string, reason: string) {
    // TODO: update status, send rejection email, audit log
    throw new Error('Not implemented');
  }

  async update(id: string, dto: UpdateVendorDto) {
    // TODO: audit log
    throw new Error('Not implemented');
  }
}
