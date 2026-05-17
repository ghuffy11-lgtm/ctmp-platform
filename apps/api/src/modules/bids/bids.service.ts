import { Injectable, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { UploadEnvelopeDto } from './dto/upload-envelope.dto';

@Injectable()
export class BidsService {
  private readonly logger = new Logger(BidsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async draftBid(tenderId: string, vendor: any) {
    // TODO: verify vendor is invited, tender is Published/Clarification Period, no existing SUBMITTED bid
    throw new Error('Not implemented');
  }

  async uploadTechnical(bidId: string, dto: UploadEnvelopeDto, vendor: any) {
    // TODO: only allowed in DRAFT envelope state, verify bid belongs to vendor, store SHA-256 checksum
    throw new Error('Not implemented');
  }

  async uploadCommercial(bidId: string, dto: UploadEnvelopeDto, vendor: any) {
    // TODO: only allowed in DRAFT envelope state, verify bid belongs to vendor, store SHA-256 checksum
    throw new Error('Not implemented');
  }

  async submit(bidId: string, vendor: any) {
    // TODO: check deadline (unless exception granted), lock envelopes, generate SHA-256 receipt,
    // set bid status SUBMITTED — IMMUTABLE after this; check late submission exception; audit log
    throw new Error('Not implemented');
  }

  async getReceipt(bidId: string, vendor: any) {
    // TODO: verify bid belongs to vendor, return receipt with checksums
    throw new Error('Not implemented');
  }

  async downloadDocument(bidId: string, documentId: string, user: any) {
    // TODO: check envelope state (technical: must be OPENED; commercial: requires explicit commercial:download permission)
    // NEVER allow generic commercial file download without committee opening + permission check
    throw new Error('Not implemented');
  }
}
