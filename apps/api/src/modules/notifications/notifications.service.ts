import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async sendEmail(to: string, templateCode: string, variables: Record<string, string>) {
    // TODO: load template from notification_templates, render, send via nodemailer, log delivery
    throw new Error('Not implemented');
  }

  async notifyTenderPublished(tenderId: string) {
    // TODO: send to all invited vendors
    throw new Error('Not implemented');
  }

  async notifyBidSubmitted(bidId: string) {
    // TODO: send receipt to vendor, notify procurement team
    throw new Error('Not implemented');
  }

  async notifyAwardDecision(tenderId: string) {
    // TODO: notify winner + losers with appropriate messages
    throw new Error('Not implemented');
  }
}
