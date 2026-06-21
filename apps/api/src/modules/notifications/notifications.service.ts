import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditRiskLevel, NotificationStatus } from '@prisma/client';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SystemSettingsService } from '../system-settings/system-settings.service';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private transporter: Transporter | null = null;
  private cachedConfigKey: string | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly settings: SystemSettingsService,
  ) {}

  // BUG-107 Piece 5: SMTP config now comes from DB (system_settings) with env
  // fallback. Transporter is cached but rebuilt when underlying config changes
  // (detected via a string key of host:port:user — cheap to recompute).
  private async getTransporter(): Promise<Transporter> {
    const cfg = await this.settings.resolveSmtpConfig();
    const cacheKey = `${cfg.host}:${cfg.port}:${cfg.user}`;
    if (this.transporter && this.cachedConfigKey === cacheKey) return this.transporter;
    this.transporter = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.port === 465,
      ...(cfg.user ? { auth: { user: cfg.user, pass: cfg.password } } : {}),
      ignoreTLS: !cfg.user,
    });
    this.cachedConfigKey = cacheKey;
    return this.transporter;
  }

  private render(template: string, variables: Record<string, string>): string {
    return template.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, key) =>
      variables[key] !== undefined ? String(variables[key]) : '',
    );
  }

  // BUG-121 (2026-06-11): when notifications.email_override is set to a
  // non-empty address, every outbound email is rerouted to that single
  // address. Used during staging / end-to-end testing so the owner can
  // verify content without spamming real vendors. Returns null when the
  // setting is empty (= override disabled).
  private async loadEmailOverride(): Promise<string | null> {
    try {
      const row = await this.prisma.systemSetting.findUnique({
        where: { key: 'notifications.email_override' },
      });
      const v = row?.value?.trim();
      if (!v) return null;
      // Sanity check: must look like an email.
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
        this.logger.warn(`notifications.email_override looks invalid: ${v} — ignoring`);
        return null;
      }
      return v;
    } catch {
      return null;
    }
  }

  // Builds a "TEST OVERRIDE — original recipients: …" preamble that's
  // prepended to the body so the owner can see who would have received
  // the message in production.
  private overrideHeader(originalTo: string, originalBcc: string[] = []): string {
    const rcpts = [originalTo, ...originalBcc].filter(Boolean);
    return [
      '────────────────────────────────────────────────────────────',
      'TEST MODE — notifications.email_override is active.',
      'Original recipients (would have received this in production):',
      ...rcpts.map(r => `  • ${r}`),
      '────────────────────────────────────────────────────────────',
      '',
    ].join('\n');
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

    let subject = this.render(template.subjectTemplate, variables);
    let body = this.render(template.bodyTemplate, variables);
    // BUG-107 Piece 5: From address comes from DB-first SMTP config.
    const smtpCfg = await this.settings.resolveSmtpConfig();
    const from = smtpCfg.from || 'no-reply@ctmp.local';

    // BUG-121 (2026-06-11): test-mode override.
    const override = await this.loadEmailOverride();
    const originalTo = to;
    if (override) {
      body = this.overrideHeader(originalTo) + body;
      subject = `[TEST OVERRIDE → ${originalTo}] ${subject}`;
      to = override;
    }

    let status: NotificationStatus = NotificationStatus.QUEUED;
    let error: string | null = null;
    let sentAt: Date | null = null;

    try {
      const transporter = await this.getTransporter();
      const info = await transporter.sendMail({
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
        // BUG-121 (2026-06-11): keep the intended recipient in the audit log
        // even when test-mode override redirected the actual SMTP delivery.
        recipientEmail: originalTo,
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

  // BUG-120 (2026-06-10): BCC-capable variant for invitation broadcasts.
  // `to` is typically the platform's own SMTP `from` address (so the
  // envelope has a valid TO line) and every actual recipient goes into
  // `bcc` — that way contacts within the same vendor don't see each
  // other on the To/CC line.
  async sendEmailWithBcc(
    to: string,
    bcc: string[],
    templateCode: string,
    variables: Record<string, string>,
  ) {
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
    const cleanBcc = Array.from(new Set(bcc.filter(e => typeof e === 'string' && e.includes('@'))));
    if (cleanBcc.length === 0) {
      this.logger.warn(`sendEmailWithBcc ${templateCode}: empty BCC list — nothing to send.`);
      return { status: 'SKIPPED' as const };
    }
    let subject = this.render(template.subjectTemplate, variables);
    let body = this.render(template.bodyTemplate, variables);
    const smtpCfg = await this.settings.resolveSmtpConfig();
    const from = smtpCfg.from || 'no-reply@ctmp.local';

    // BUG-121 (2026-06-11): test-mode override — collapse TO + BCC to a
    // single test address; preserve originals in the body + per-recipient
    // log rows so the audit trail still names everyone who'd have received
    // the message in production.
    const override = await this.loadEmailOverride();
    const originalTo = to;
    const originalBcc = cleanBcc;
    let effectiveTo = to;
    let effectiveBccForSend: string[] = cleanBcc;
    if (override) {
      body = this.overrideHeader(originalTo, originalBcc) + body;
      subject = `[TEST OVERRIDE → ${originalBcc.length} recipients] ${subject}`;
      effectiveTo = override;
      effectiveBccForSend = []; // collapse — single email to the override only.
    }

    let status: NotificationStatus = NotificationStatus.QUEUED;
    let error: string | null = null;
    let sentAt: Date | null = null;
    try {
      const transporter = await this.getTransporter();
      const info = await transporter.sendMail({
        from,
        to: effectiveTo,
        ...(effectiveBccForSend.length > 0 ? { bcc: effectiveBccForSend } : {}),
        subject,
        text: body,
      });
      status = NotificationStatus.SENT;
      sentAt = new Date();
      this.logger.log(
        `sent ${templateCode} bcc=${effectiveBccForSend.length}${override ? ` (override=${override}, was ${cleanBcc.length} bcc)` : ''} (messageId=${info.messageId})`,
      );
    } catch (err) {
      status = NotificationStatus.FAILED;
      error = err instanceof Error ? err.message : String(err);
      this.logger.error(`sendEmailWithBcc ${templateCode} failed: ${error}`);
    }

    // One log row per ORIGINAL recipient so audits/searches still find each
    // intended address even when the override rerouted the SMTP delivery.
    await this.prisma.notificationLog.createMany({
      data: cleanBcc.map(rcpt => ({
        templateCode,
        subject,
        recipientEmail: rcpt,
        status,
        error,
        sentAt,
      })),
    });

    if (status === NotificationStatus.FAILED) {
      throw new Error(`Email delivery failed: ${error}`);
    }
    return { status, recipientCount: cleanBcc.length };
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
