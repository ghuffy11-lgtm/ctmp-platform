import { BadRequestException, ForbiddenException, Injectable, NotFoundException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditRiskLevel } from '@prisma/client';
import * as nodemailer from 'nodemailer';
import { Client as LdapClient } from 'ldapts';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SecureSettingsService } from './secure-settings.service';

interface SettingUpdate {
  key: string;
  value: string;
}

// BUG-107 Piece 5: smtp.password + ad.bind_password are no longer treated as
// blocked sensitive keys here — they live in encrypted_value via the new
// /system-settings/secure endpoint. Plain `batchUpdate` still won't touch them
// (it filters out is_encrypted rows). Other secret env-mirror keys remain
// blocked from any UI-driven write.
const SENSITIVE_KEYS = new Set<string>([
  'jwt.secret',
  'jwt.refresh_secret',
  'vendor_jwt.secret',
  'vendor_jwt.refresh_secret',
  'database.password',
  'captcha.secret_key',
]);

const READ_ONLY_KEYS = new Set<string>([
  'system.version',
  'system.install_date',
]);

function extractCategory(key: string): string {
  const [head] = key.split('.');
  return head ? head.charAt(0).toUpperCase() + head.slice(1) : 'General';
}

function normalizeType(t: string): 'STRING' | 'NUMBER' | 'BOOLEAN' | 'JSON' {
  switch (t.toLowerCase()) {
    case 'number':
    case 'int':
    case 'integer':
    case 'decimal':
      return 'NUMBER';
    case 'boolean':
    case 'bool':
      return 'BOOLEAN';
    case 'json':
    case 'object':
      return 'JSON';
    default:
      return 'STRING';
  }
}

function validateValue(type: string, value: string): { ok: true } | { ok: false; reason: string } {
  switch (normalizeType(type)) {
    case 'NUMBER':
      return Number.isFinite(Number(value)) ? { ok: true } : { ok: false, reason: 'not a number' };
    case 'BOOLEAN':
      return value === 'true' || value === 'false'
        ? { ok: true }
        : { ok: false, reason: 'must be "true" or "false"' };
    case 'JSON':
      try {
        JSON.parse(value);
        return { ok: true };
      } catch {
        return { ok: false, reason: 'invalid JSON' };
      }
    default:
      return { ok: true };
  }
}

@Injectable()
export class SystemSettingsService {
  private readonly logger = new Logger(SystemSettingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
    private readonly secure: SecureSettingsService,
  ) {}

  async list() {
    const settings = await this.prisma.systemSetting.findMany({
      orderBy: { key: 'asc' },
    });
    return {
      items: settings
        .filter(s => !SENSITIVE_KEYS.has(s.key))
        .map(s => ({
          key: s.key,
          // BUG-107 Piece 5: encrypted rows expose presence-only via a sentinel
          // — never echo decrypted plaintext back to the admin UI.
          value: s.isEncrypted
            ? (s.encryptedValue ? '••••••••' : '')
            : (s.value ?? ''),
          description: s.description ?? undefined,
          category: s.category ?? extractCategory(s.key),
          type: normalizeType(s.valueType),
          readOnly: s.readOnly || READ_ONLY_KEYS.has(s.key),
          isEncrypted: s.isEncrypted,
        })),
    };
  }

  // BUG-107 Piece 2/3 + BUG-108: public branding endpoint. Anonymous read of
  // system name, vendor portal name (separate brand string for vendor side),
  // and flags indicating which logo types are uploaded. Logo URLs are well-
  // known: /api/v1/branding/{admin_logo,vendor_logo,report_logo}.
  async getPublicBranding() {
    const rows = await this.prisma.systemSetting.findMany({
      where: { key: { in: [
        'branding.system_name',
        'branding.vendor_portal_name',
        'branding.admin_portal_logo_storage_key',
        'branding.vendor_portal_logo_storage_key',
        'branding.report_logo_storage_key',
      ] } },
    });
    const byKey = new Map(rows.map(r => [r.key, r.value]));
    const systemName = byKey.get('branding.system_name') || 'CTMP';
    return {
      systemName,
      // BUG-108: vendor portal name falls back to system_name if unset so the
      // vendor surfaces always have a usable brand string.
      vendorPortalName: byKey.get('branding.vendor_portal_name') || systemName,
      hasAdminLogo: !!byKey.get('branding.admin_portal_logo_storage_key'),
      hasVendorLogo: !!byKey.get('branding.vendor_portal_logo_storage_key'),
      hasReportLogo: !!byKey.get('branding.report_logo_storage_key'),
    };
  }

  // 2026-06-26: branding used to render the HTML email shell — the system name
  // and the admin (raster/JPG) logo storage key, which the notifications
  // service attaches inline (CID) to every outbound email.
  async resolveEmailBranding(): Promise<{ systemName: string; adminLogoKey: string | null }> {
    const [name, logoKey] = await Promise.all([
      this.prisma.systemSetting.findUnique({ where: { key: 'branding.system_name' } }),
      this.prisma.systemSetting.findUnique({ where: { key: 'branding.admin_portal_logo_storage_key' } }),
    ]);
    return {
      systemName: name?.value || 'CTMP',
      adminLogoKey: logoKey?.value || null,
    };
  }

  // BUG-107 Piece 5: resolve SMTP config from DB first, env fallback. Called
  // by NotificationsService at transporter-creation time.
  async resolveSmtpConfig() {
    const [host, port, user, from] = await Promise.all([
      this.secure.getPlain('smtp.host'),
      this.secure.getPlain('smtp.port'),
      this.secure.getPlain('smtp.user'),
      this.secure.getPlain('smtp.from'),
    ]);
    const password = await this.secure.getEncrypted('smtp.password');
    return {
      host: host ?? this.config.get<string>('SMTP_HOST') ?? 'localhost',
      port: Number(port ?? this.config.get<string>('SMTP_PORT') ?? '1025'),
      user: user ?? this.config.get<string>('SMTP_USER') ?? '',
      password: password ?? this.config.get<string>('SMTP_PASSWORD') ?? '',
      from: from ?? this.config.get<string>('SMTP_FROM') ?? 'noreply@ctmp.local',
    };
  }

  // BUG-107 Piece 5: resolve AD config from DB first, env fallback.
  async resolveAdConfig() {
    const [url, domain] = await Promise.all([
      this.secure.getPlain('ad.url'),
      this.secure.getPlain('ad.domain'),
    ]);
    return {
      url: url ?? this.config.get<string>('ad.url') ?? '',
      domain: domain ?? this.config.get<string>('ad.domain') ?? '',
    };
  }

  // BUG-107 Piece 5: one-shot SMTP test. Builds an ephemeral transporter from
  // current config and sends a test message. Doesn't touch the cached
  // transporter inside NotificationsService.
  async testSmtp(to: string): Promise<{ ok: boolean; message: string }> {
    try {
      const cfg = await this.resolveSmtpConfig();
      const transporter = nodemailer.createTransport({
        host: cfg.host,
        port: cfg.port,
        secure: cfg.port === 465,
        ...(cfg.user ? { auth: { user: cfg.user, pass: cfg.password } } : {}),
        ignoreTLS: !cfg.user,
      });
      await transporter.verify();
      await transporter.sendMail({
        from: cfg.from,
        to,
        subject: 'CTMP SMTP Test',
        text: 'This is a test message from the CTMP platform. Receiving it confirms SMTP is configured correctly.',
      });
      return { ok: true, message: `Test mail sent to ${to} via ${cfg.host}:${cfg.port}` };
    } catch (err) {
      this.logger.warn(`testSmtp failed: ${err instanceof Error ? err.message : err}`);
      return { ok: false, message: err instanceof Error ? err.message : 'Unknown SMTP error' };
    }
  }

  // BUG-107 Piece 5: one-shot AD bind test.
  async testAd(username: string, password: string): Promise<{ ok: boolean; message: string }> {
    try {
      const cfg = await this.resolveAdConfig();
      if (!cfg.url || !cfg.domain) {
        return { ok: false, message: 'AD URL or domain not configured' };
      }
      const client = new LdapClient({ url: cfg.url });
      await client.bind(`${username}@${cfg.domain}`, password);
      await client.unbind();
      return { ok: true, message: `Bound successfully against ${cfg.url} as ${username}@${cfg.domain}` };
    } catch (err) {
      this.logger.warn(`testAd failed: ${err instanceof Error ? err.message : err}`);
      return { ok: false, message: err instanceof Error ? err.message : 'Unknown LDAP error' };
    }
  }

  async batchUpdate(updates: SettingUpdate[], actorUserId: string) {
    if (!Array.isArray(updates) || updates.length === 0) {
      throw new BadRequestException('updates must be a non-empty array');
    }

    // Pre-validation pass: all keys must exist, not be sensitive, not be read-only,
    // and the value must parse against the stored valueType. Whole batch rejected
    // if any single update fails — keeps the txn atomic in spirit.
    const keys = updates.map(u => u.key);
    if (new Set(keys).size !== keys.length) {
      throw new BadRequestException('Duplicate keys in updates');
    }

    const existing = await this.prisma.systemSetting.findMany({
      where: { key: { in: keys } },
    });
    const byKey = new Map(existing.map(s => [s.key, s]));

    for (const u of updates) {
      if (SENSITIVE_KEYS.has(u.key)) {
        throw new ForbiddenException(`Cannot update sensitive key '${u.key}' via this endpoint`);
      }
      if (READ_ONLY_KEYS.has(u.key)) {
        throw new ForbiddenException(`Setting '${u.key}' is read-only`);
      }
      const current = byKey.get(u.key);
      if (!current) {
        throw new NotFoundException(`Setting '${u.key}' does not exist`);
      }
      if (current.readOnly) {
        throw new ForbiddenException(`Setting '${u.key}' is read-only`);
      }
      // BUG-107 Piece 5: encrypted slots are write-only via POST /system-settings/secure.
      if (current.isEncrypted) {
        throw new ForbiddenException(`Setting '${u.key}' is encrypted — use POST /system-settings/secure to update.`);
      }
      const v = validateValue(current.valueType, u.value);
      if (!v.ok) {
        throw new BadRequestException(`Invalid value for '${u.key}': ${v.reason}`);
      }
    }

    // Atomic write — update + per-key audit are interleaved inside a single txn so
    // a partial failure rolls back every settings change AND the audit entries.
    const changedKeys: string[] = [];
    await this.prisma.$transaction(async tx => {
      for (const u of updates) {
        const before = byKey.get(u.key)!;
        if (before.value === u.value) continue;
        await tx.systemSetting.update({
          where: { key: u.key },
          data: { value: u.value, updatedBy: actorUserId },
        });
        changedKeys.push(u.key);
      }
    });

    // Audit log per changed key. Done outside the txn so the hash chain stays
    // append-only and serialized; AuditService.log() opens its own txn.
    for (const u of updates) {
      if (!changedKeys.includes(u.key)) continue;
      const before = byKey.get(u.key)!;
      await this.audit.log({
        eventType: 'SYSTEM_SETTING_UPDATED',
        entityType: 'SystemSetting',
        entityId: undefined,
        actorUserId,
        beforeValue: { key: u.key, value: before.value },
        afterValue: { key: u.key, value: u.value },
        metadata: { valueType: before.valueType },
        riskLevel: AuditRiskLevel.HIGH,
      });
    }

    return this.list();
  }
}
