import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { EvaluateCommercialDto } from './dto/evaluate-commercial.dto';

@Injectable()
export class CommercialEvaluationService {
  constructor(private readonly prisma: PrismaService) {}

  async getComparison(tenderId: string) {
    // TODO: GUARD — requires commercial:view permission (not just committee opening);
    // System Admin does NOT see this without explicit permission;
    // commercial envelopes must be OPENED
    throw new Error('Not implemented');
  }

  async evaluate(bidId: string, dto: EvaluateCommercialDto, evaluatorId: string) {
    // TODO: requires commercial:evaluate permission; commercial envelope must be OPENED; audit log
    throw new Error('Not implemented');
  }
}
