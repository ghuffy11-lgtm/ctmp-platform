import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditRiskLevel } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
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

  async listTemplates() {
    const templates = await this.prisma.notificationTemplate.findMany({
      orderBy: { code: 'asc' },
    });
    return {
      items: templates.map(t => ({
        id: t.id,
        code: t.code,
        name: t.name,
        channel: t.channel as 'EMAIL' | 'IN_APP' | 'SMS',
        subject: t.subjectTemplate,
        bodyTemplate: t.bodyTemplate,
        enabled: t.isActive,
      })),
    };
  }

  async updateTemplate(
    id: string,
    patch: { subject?: string; bodyTemplate?: string; enabled?: boolean },
    actorUserId: string,
  ) {
    const existing = await this.prisma.notificationTemplate.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Notification template not found');

    if (patch.bodyTemplate !== undefined && !patch.bodyTemplate.trim()) {
      throw new BadRequestException('bodyTemplate cannot be empty');
    }

    const data: Record<string, unknown> = {};
    if (patch.subject !== undefined) data.subjectTemplate = patch.subject;
    if (patch.bodyTemplate !== undefined) data.bodyTemplate = patch.bodyTemplate;
    if (patch.enabled !== undefined) data.isActive = patch.enabled;

    if (Object.keys(data).length === 0) {
      return this.serialize(existing);
    }

    const updated = await this.prisma.notificationTemplate.update({
      where: { id },
      data,
    });

    await this.audit.log({
      eventType: 'NOTIFICATION_TEMPLATE_UPDATED',
      entityType: 'NotificationTemplate',
      entityId: id,
      actorUserId,
      beforeValue: {
        subject: existing.subjectTemplate,
        bodyTemplate: existing.bodyTemplate,
        enabled: existing.isActive,
      },
      afterValue: {
        subject: updated.subjectTemplate,
        bodyTemplate: updated.bodyTemplate,
        enabled: updated.isActive,
      },
      metadata: { code: existing.code, channel: existing.channel },
      riskLevel: AuditRiskLevel.MEDIUM,
    });

    return this.serialize(updated);
  }

  private serialize(t: any) {
    return {
      id: t.id,
      code: t.code,
      name: t.name,
      channel: t.channel,
      subject: t.subjectTemplate,
      bodyTemplate: t.bodyTemplate,
      enabled: t.isActive,
    };
  }
}
