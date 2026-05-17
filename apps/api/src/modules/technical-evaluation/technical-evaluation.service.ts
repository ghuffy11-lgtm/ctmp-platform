import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { EvaluateBidDto } from './dto/evaluate-bid.dto';

@Injectable()
export class TechnicalEvaluationService {
  constructor(private readonly prisma: PrismaService) {}

  async openEnvelopes(tenderId: string, userId: string) {
    // TODO: GUARD — tender must be in Submission Closed state; set technical envelopes to OPENED,
    // transition tender to Technical Opening, audit log
    throw new Error('Not implemented');
  }

  async findAll(tenderId: string) {
    throw new Error('Not implemented');
  }

  async evaluate(bidId: string, dto: EvaluateBidDto, evaluatorId: string) {
    // TODO: check technical envelope OPENED, record score/notes, audit log
    throw new Error('Not implemented');
  }

  async finalize(tenderId: string, userId: string) {
    // TODO: check all bids evaluated, transition to Commercial Sealed, seal commercial envelopes, audit log
    throw new Error('Not implemented');
  }
}
