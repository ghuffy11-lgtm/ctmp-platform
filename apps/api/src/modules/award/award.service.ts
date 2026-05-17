import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AwardRecommendationDto } from './dto/award-recommendation.dto';
import { AwardApprovalDto } from './dto/award-approval.dto';

@Injectable()
export class AwardService {
  constructor(private readonly prisma: PrismaService) {}

  async recommend(tenderId: string, dto: AwardRecommendationDto, userId: string) {
    // TODO: tender in Commercial Evaluation; transition to Award Recommendation; audit log
    throw new Error('Not implemented');
  }

  async approve(tenderId: string, dto: AwardApprovalDto, userId: string) {
    // TODO: approve → Awarded or reject → back to Commercial Evaluation; audit log
    throw new Error('Not implemented');
  }

  async issue(tenderId: string, userId: string) {
    // TODO: transition → Awarded, notify winner + losers, transition → Tender Closed; audit log
    throw new Error('Not implemented');
  }
}
