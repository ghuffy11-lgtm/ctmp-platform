import { Injectable, Logger, InternalServerErrorException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes, createCipheriv, createDecipheriv, createHash } from 'crypto';
import { PrismaService } from '../../database/prisma.service';

/**
 * BUG-107 Piece 5: encrypted-at-rest storage for secret system_settings.
 *
 * Layout: AES-256-GCM with random 12-byte IV. Ciphertext blob is
 * `IV (12) | AUTH_TAG (16) | CIPHERTEXT (n)` packed into the
 * `system_settings.encrypted_value` BYTEA column. Plaintext `value` column
 * stays NULL for these keys.
 *
 * Key derivation: SHA-256 of `process.env.SETTINGS_ENCRYPTION_KEY` (so any
 * string length is accepted; a long random key is still recommended). If the
 * env var is missing in dev, falls back to a deterministic dev key so the
 * service doesn't crash at boot — flagged via warning log.
 */
@Injectable()
export class SecureSettingsService {
  private readonly logger = new Logger(SecureSettingsService.name);
  private readonly key: Buffer;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    const raw = this.config.get<string>('SETTINGS_ENCRYPTION_KEY')
      ?? process.env.SETTINGS_ENCRYPTION_KEY;
    if (!raw) {
      this.logger.warn(
        'SETTINGS_ENCRYPTION_KEY env var missing — using a deterministic DEV fallback. '
        + 'Configure a real 32+ char random key before production use.',
      );
    }
    this.key = createHash('sha256').update(raw ?? 'ctmp-dev-fallback-key-do-not-use-in-prod').digest();
  }

  encrypt(plaintext: string): Buffer {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, ciphertext]);
  }

  decrypt(blob: Buffer): string {
    if (blob.length < 28) {
      throw new InternalServerErrorException('encrypted_value blob is malformed (too short)');
    }
    const iv = blob.subarray(0, 12);
    const tag = blob.subarray(12, 28);
    const ciphertext = blob.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  }

  /** Set the encrypted value for an existing setting key (must be flagged is_encrypted). */
  async setEncrypted(key: string, plaintext: string, actorUserId: string | null = null): Promise<void> {
    const row = await this.prisma.systemSetting.findUnique({ where: { key } });
    if (!row) throw new BadRequestException(`Setting '${key}' does not exist`);
    if (!row.isEncrypted) throw new BadRequestException(`Setting '${key}' is not an encrypted slot`);
    const blob = plaintext === '' ? null : this.encrypt(plaintext);
    await this.prisma.systemSetting.update({
      where: { key },
      data: {
        encryptedValue: blob ? new Uint8Array(blob) : null,
        updatedBy: actorUserId ?? undefined,
      },
    });
  }

  /** Decrypted plaintext value, or null if not set. */
  async getEncrypted(key: string): Promise<string | null> {
    const row = await this.prisma.systemSetting.findUnique({ where: { key } });
    if (!row || !row.isEncrypted || !row.encryptedValue) return null;
    try {
      return this.decrypt(Buffer.from(row.encryptedValue));
    } catch (err) {
      this.logger.error(`Failed to decrypt setting '${key}': ${err instanceof Error ? err.message : err}`);
      return null;
    }
  }

  /** Plaintext value for a non-encrypted setting; null if missing or empty. */
  async getPlain(key: string): Promise<string | null> {
    const row = await this.prisma.systemSetting.findUnique({ where: { key } });
    return row?.value && row.value !== '' ? row.value : null;
  }
}
