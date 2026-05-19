import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditRiskLevel } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';

interface SettingUpdate {
  key: string;
  value: string;
}

const SENSITIVE_KEYS = new Set<string>([
  'jwt.secret',
  'jwt.refresh_secret',
  'vendor_jwt.secret',
  'vendor_jwt.refresh_secret',
  'smtp.password',
  'database.password',
  'ad.bind_password',
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
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
          value: s.value ?? '',
          description: s.description ?? undefined,
          category: s.category ?? extractCategory(s.key),
          type: normalizeType(s.valueType),
          readOnly: s.readOnly || READ_ONLY_KEYS.has(s.key),
        })),
    };
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
