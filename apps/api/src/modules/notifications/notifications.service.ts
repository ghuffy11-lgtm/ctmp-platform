import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditRiskLevel, NotificationStatus } from '@prisma/client';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { promises as fs } from 'fs';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SystemSettingsService } from '../system-settings/system-settings.service';

const LOGO_CID = 'brandlogo';
const VENDOR_LOGO_CID = 'vendorlogo';

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

  private escapeHtml(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Like render(), but HTML-escapes each substituted VALUE so vendor names /
  // tender titles containing &, <, > can't break or inject into the markup.
  // The template's own HTML tags are left intact.
  private renderHtml(template: string, variables: Record<string, string>): string {
    return template.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, key) =>
      variables[key] !== undefined ? this.escapeHtml(String(variables[key])) : '',
    );
  }

  // Plain-text fallback derived from the rendered HTML body (for clients that
  // don't render HTML, and for deliverability).
  private htmlToText(html: string): string {
    return html
      .replace(/<\s*br\s*\/?>/gi, '\n')
      .replace(/<\/\s*(p|div|tr|h[1-6]|li)\s*>/gi, '\n')
      .replace(/<li[^>]*>/gi, '  - ')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]+\n/g, '\n')
      .trim();
  }

  // Wrap a template's inner HTML content in the branded shell (logo header,
  // accent bar, footer). systemName + logo come from branding settings.
  private brandShell(innerHtml: string, systemName: string, hasLogo: boolean, hasVendorLogo = false, noticeHtml = ''): string {
    const brand = this.escapeHtml(systemName);
    const header = hasLogo
      ? `<img src="cid:${LOGO_CID}" alt="${brand}" style="max-height:46px;display:block;border:0;">`
      : `<div style="font-size:18px;font-weight:700;color:#ffffff;letter-spacing:0.3px;">${brand}</div>`;
    // Explicit width/height ATTRIBUTES (not CSS max-*) so Outlook/webmail size
    // it down — the rasterised PNG is hi-res (retina). ~h-12 like the portal;
    // the logo is portrait (260x309) so width ≈ height * 260/309 ≈ 40.
    const sigLogo = hasVendorLogo
      ? `<div style="margin:18px 0 0;text-align:left;"><img src="cid:${VENDOR_LOGO_CID}" alt="${brand}" width="40" height="48" style="display:block;border:0;width:40px;height:48px;"></div>`
      : '';
    return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:'Segoe UI',Arial,Helvetica,sans-serif;color:#1f2933;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:24px 12px;text-align:left;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" align="center" style="width:600px;max-width:100%;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(16,42,67,0.12);text-align:left;">
        <tr><td align="left" style="background:#0b3d5c;padding:18px 28px;text-align:left;">${header}</td></tr>
        <tr><td style="height:4px;line-height:4px;font-size:0;background:#1d6fa5;">&nbsp;</td></tr>
        <tr><td align="left" style="padding:28px;font-size:14px;line-height:1.65;color:#1f2933;text-align:left;">${noticeHtml}${innerHtml}${sigLogo}</td></tr>
        <tr><td align="left" style="padding:18px 28px;background:#f0f2f5;border-top:1px solid #e3e7eb;font-size:12px;line-height:1.5;color:#6b7280;text-align:left;">
          <strong style="color:#374151;">${brand}</strong><br>
          This is an automated message — please do not reply to this email.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
  }

  // Read the configured admin (raster) branding logo from local storage so it
  // can be embedded inline (CID). Returns null on any failure (e.g. s3 driver,
  // missing file) — the shell then falls back to a text brand header.
  private async loadLogoAttachment(adminLogoKey: string | null): Promise<{ filename: string; content: Buffer; cid: string } | null> {
    if (!adminLogoKey) return null;
    try {
      const root = this.config.get<string>('STORAGE_LOCAL_ROOT') ?? process.env.STORAGE_LOCAL_ROOT ?? '/data';
      const content = await fs.readFile(`${root}/branding/${adminLogoKey}`);
      const ext = adminLogoKey.split('.').pop() || 'png';
      return { filename: `logo.${ext}`, content, cid: LOGO_CID };
    } catch (err) {
      this.logger.warn(`brand logo not loaded (${adminLogoKey}): ${err instanceof Error ? err.message : err}`);
      return null;
    }
  }

  // Vendor-portal logo shown beneath the signature. The uploaded vendor logo is
  // an SVG (which email clients won't render), so a rasterised PNG is expected
  // at branding/vendor_logo.png (produced by scripts/rasterize_vendor_logo).
  // Returns null if absent.
  private async loadVendorLogoAttachment(): Promise<{ filename: string; content: Buffer; cid: string } | null> {
    try {
      const root = this.config.get<string>('STORAGE_LOCAL_ROOT') ?? process.env.STORAGE_LOCAL_ROOT ?? '/data';
      const content = await fs.readFile(`${root}/branding/vendor_logo.png`);
      return { filename: 'vendor-logo.png', content, cid: VENDOR_LOGO_CID };
    } catch {
      return null;
    }
  }

  // 2026-06-28: per-role onboarding guide PDF, IT-placed at
  // ${STORAGE_LOCAL_ROOT}/role-guides/<ROLE_CODE>.pdf. Returns null if no guide
  // exists for the role (the welcome email is still sent, just without it).
  private async loadRoleGuideAttachment(roleCode: string): Promise<{ filename: string; content: Buffer } | null> {
    if (!roleCode) return null;
    try {
      const root = this.config.get<string>('STORAGE_LOCAL_ROOT') ?? process.env.STORAGE_LOCAL_ROOT ?? '/data';
      const content = await fs.readFile(`${root}/role-guides/${roleCode}.pdf`);
      return { filename: `${roleCode}.pdf`, content };
    } catch {
      return null;
    }
  }

  // 2026-06-28: welcome / onboarding email for a newly-created internal user,
  // with their role's step-by-step guide attached when one is available.
  async sendRoleWelcome(opts: { to: string; userName: string; roleName: string; roleCode: string | null }) {
    const guide = opts.roleCode ? await this.loadRoleGuideAttachment(opts.roleCode) : null;
    const portalUrl = this.config.get<string>('ADMIN_PORTAL_URL') ?? process.env.ADMIN_PORTAL_URL ?? '';
    const extra = guide ? [{ filename: guide.filename, content: guide.content, contentType: 'application/pdf' }] : [];
    return this.sendEmail(
      opts.to,
      'USER_WELCOME',
      { userName: opts.userName, roleName: opts.roleName, portalUrl },
      extra,
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

  // HTML counterpart of overrideHeader() for the branded email shell.
  private overrideNoticeHtml(originalTo: string, originalBcc: string[] = []): string {
    const rcpts = [originalTo, ...originalBcc].filter(Boolean).map(r => this.escapeHtml(r));
    return `<div style="margin:0 0 20px;padding:12px 14px;background:#fff7ed;border:1px solid #fdba74;border-radius:6px;font-size:12px;color:#9a3412;">
      <strong>TEST MODE</strong> — <code>notifications.email_override</code> is active.<br>
      Original recipients: ${rcpts.join(', ')}
    </div>`;
  }

  async sendEmail(
    to: string,
    templateCode: string,
    variables: Record<string, string>,
    extraAttachments: Array<{ filename: string; content: Buffer; contentType?: string }> = [],
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

    let subject = this.render(template.subjectTemplate, variables);
    const innerHtml = this.renderHtml(template.bodyTemplate, variables);
    // 2026-06-26: branded HTML shell + inline (CID) logo.
    const branding = await this.settings.resolveEmailBranding();
    const logo = await this.loadLogoAttachment(branding.adminLogoKey);
    const vendorLogo = await this.loadVendorLogoAttachment();
    // BUG-107 Piece 5: From address comes from DB-first SMTP config.
    const smtpCfg = await this.settings.resolveSmtpConfig();
    const from = smtpCfg.from || 'no-reply@ctmp.local';

    // BUG-121 (2026-06-11): test-mode override.
    const override = await this.loadEmailOverride();
    const originalTo = to;
    let noticeHtml = '';
    let noticeText = '';
    if (override) {
      noticeHtml = this.overrideNoticeHtml(originalTo);
      noticeText = this.overrideHeader(originalTo);
      subject = `[TEST OVERRIDE → ${originalTo}] ${subject}`;
      to = override;
    }
    const html = this.brandShell(innerHtml, branding.systemName, !!logo, !!vendorLogo, noticeHtml);
    const text = (noticeText ? noticeText + '\n' : '') + this.htmlToText(innerHtml);
    const attachments = [
      ...[logo, vendorLogo].filter(Boolean).map(a => ({ filename: a!.filename, content: a!.content, cid: a!.cid })),
      ...extraAttachments,
    ];

    let status: NotificationStatus = NotificationStatus.QUEUED;
    let error: string | null = null;
    let sentAt: Date | null = null;

    try {
      const transporter = await this.getTransporter();
      const info = await transporter.sendMail({
        from,
        to,
        subject,
        html,
        text,
        ...(attachments.length ? { attachments } : {}),
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
    const innerHtml = this.renderHtml(template.bodyTemplate, variables);
    const branding = await this.settings.resolveEmailBranding();
    const logo = await this.loadLogoAttachment(branding.adminLogoKey);
    const vendorLogo = await this.loadVendorLogoAttachment();
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
    let noticeHtml = '';
    let noticeText = '';
    if (override) {
      noticeHtml = this.overrideNoticeHtml(originalTo, originalBcc);
      noticeText = this.overrideHeader(originalTo, originalBcc);
      subject = `[TEST OVERRIDE → ${originalBcc.length} recipients] ${subject}`;
      effectiveTo = override;
      effectiveBccForSend = []; // collapse — single email to the override only.
    }
    const html = this.brandShell(innerHtml, branding.systemName, !!logo, !!vendorLogo, noticeHtml);
    const text = (noticeText ? noticeText + '\n' : '') + this.htmlToText(innerHtml);
    const attachments = [logo, vendorLogo].filter(Boolean).map(a => ({ filename: a!.filename, content: a!.content, cid: a!.cid }));

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
        html,
        text,
        ...(attachments.length ? { attachments } : {}),
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
