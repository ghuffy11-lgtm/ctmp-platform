import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditRiskLevel, NotificationStatus } from '@prisma/client';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private transporter: Transporter | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  private getTransporter(): Transporter {
    if (this.transporter) return this.transporter;
    const host = this.config.get<string>('SMTP_HOST') ?? 'localhost';
    const port = Number(this.config.get<string>('SMTP_PORT') ?? '1025');
    const user = this.config.get<string>('SMTP_USER');
    const pass = this.config.get<string>('SMTP_PASSWORD');
    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      ...(user ? { auth: { user, pass: pass ?? '' } } : {}),
      ignoreTLS: !user,
    });
    return this.transporter;
  }

  private render(template: string, variables: Record<string, string>): string {
    return template.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, key) =>
      variables[key] !== undefined ? String(variables[key]) : '',
    );
  }

  async sendEmail(to: string, templateCode: string, variables: Record<string, string>) {
    const template = await this.prisma.notificationTemplate.findUnique({
      where: { code: templateCode },
    });
    if (!template) {
      throw new NotFoundException(`Notification template not found: ${templateCode}`);
    }
    if (!template.isActive) {
      this.logger.warn(`Skipping disabled template ${templateCode}`);
      return { status: 'SKIPPED' as const };
    }

    const subject = this.render(template.subjectTemplate, variables);
    const body = this.render(template.bodyTemplate, variables);
    const from = this.config.get<string>('SMTP_FROM') ?? 'no-reply@ctmp.local';

    let status: NotificationStatus = NotificationStatus.QUEUED;
    let error: string | null = null;
    let sentAt: Date | null = null;

    try {
      const info = await this.getTransporter().sendMail({
        from,
        to,
        subject,
        text: body,
      });
      status = NotificationStatus.SENT;
      sentAt = new Date();
      this.logger.log(`sent ${templateCode} to ${to} (messageId=${info.messageId})`);
    } catch (err) {
      status = NotificationStatus.FAILED;
      error = err instanceof Error ? err.message : String(err);
      this.logger.error(`sendEmail ${templateCode} to ${to} failed: ${error}`);
    }

    await this.prisma.notificationLog.create({
      data: {
        templateCode,
        subject,
        recipientEmail: to,
        status,
        error,
        sentAt,
      },
    });

    if (status === NotificationStatus.FAILED) {
      throw new Error(`Email delivery failed: ${error}`);
    }
    return { status };
  }

  async notifyTenderPublished(_tenderId: string) {
    throw new Error('Not implemented');
  }

  async notifyBidSubmitted(_bidId: string) {
    throw new Error('Not implemented');
  }

  async notifyAwardDecision(_tenderId: string) {
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
