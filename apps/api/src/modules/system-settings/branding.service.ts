import { Inject, Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { STORAGE_BACKEND } from '../../common/storage/storage.module';
import type { StorageBackend } from '../../common/storage/storage.types';

const NAMESPACE = 'branding';
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp']);
// BUG-108 (2026-06-05): admin_logo type added so admin Sidebar + admin login
// page can carry their own branding distinct from the vendor surfaces.
const ALLOWED_TYPES = new Set(['admin_logo', 'vendor_logo', 'report_logo']);
const KEY_BY_TYPE: Record<string, string> = {
  admin_logo: 'branding.admin_portal_logo_storage_key',
  vendor_logo: 'branding.vendor_portal_logo_storage_key',
  report_logo: 'branding.report_logo_storage_key',
};
const MAX_BYTES = 1_500_000; // 1.5 MB — sized for both hint thresholds (200 / 500 KB).

/**
 * BUG-107 Piece 3: branding logo upload + serve.
 * Reuses the existing StorageBackend abstraction (local / S3). Storage key
 * is persisted on a system_settings row so the public endpoint can resolve it.
 */
@Injectable()
export class BrandingService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_BACKEND) private readonly storage: StorageBackend,
  ) {}

  async upload(type: string, file: { buffer: Buffer; mimetype: string; size: number }, actorUserId: string) {
    if (!ALLOWED_TYPES.has(type)) {
      throw new BadRequestException(`Unknown branding type: ${type}. Allowed: ${[...ALLOWED_TYPES].join(', ')}`);
    }
    if (!ALLOWED_MIME.has(file.mimetype)) {
      throw new BadRequestException(`Unsupported MIME type: ${file.mimetype}. Allowed: ${[...ALLOWED_MIME].join(', ')}`);
    }
    if (file.size > MAX_BYTES) {
      throw new BadRequestException(`File exceeds ${MAX_BYTES} bytes (${(MAX_BYTES / 1024).toFixed(0)} KB)`);
    }

    const sha = createHash('sha256').update(file.buffer).digest('hex');
    const ext = this.extForMime(file.mimetype);
    const storageKey = `${type}-${Date.now()}-${randomBytes(4).toString('hex')}.${ext}`;
    const result = await this.storage.write({
      namespace: NAMESPACE,
      storageKey,
      payload: file.buffer,
      contentType: file.mimetype,
    });

    // Persist the new key + content type on the setting. We piggyback on `value`
    // (string) — encoded as `storageKey|mimetype|sha256` so the serve endpoint
    // can stream with the right Content-Type without re-querying storage meta.
    const encoded = `${result.storageKey}|${file.mimetype}|${sha}`;
    const settingKey = KEY_BY_TYPE[type];
    await this.prisma.systemSetting.update({
      where: { key: settingKey },
      data: { value: encoded, updatedBy: actorUserId },
    });

    return {
      type,
      storageKey: result.storageKey,
      fileSize: result.fileSize,
      sha256: sha,
      mimetype: file.mimetype,
      publicUrl: `/api/v1/branding/${type}`,
    };
  }

  async serve(type: string): Promise<{ stream: NodeJS.ReadableStream; contentType: string }> {
    if (!ALLOWED_TYPES.has(type)) throw new NotFoundException();
    const setting = await this.prisma.systemSetting.findUnique({ where: { key: KEY_BY_TYPE[type] } });
    if (!setting?.value) throw new NotFoundException(`No ${type} configured`);
    const [storageKey, mimetype] = setting.value.split('|');
    if (!storageKey) throw new NotFoundException();
    const obj = await this.storage.read(NAMESPACE, storageKey);
    return { stream: obj.stream as NodeJS.ReadableStream, contentType: mimetype || 'application/octet-stream' };
  }

  /** Returns the storage_key + mime for a type, or null if unset. Used by reports renderer. */
  async getMetadata(type: string): Promise<{ storageKey: string; mimetype: string } | null> {
    if (!ALLOWED_TYPES.has(type)) return null;
    const setting = await this.prisma.systemSetting.findUnique({ where: { key: KEY_BY_TYPE[type] } });
    if (!setting?.value) return null;
    const [storageKey, mimetype] = setting.value.split('|');
    if (!storageKey) return null;
    return { storageKey, mimetype: mimetype || 'application/octet-stream' };
  }

  /** Returns a Buffer of the logo bytes for embedding in PDFs. */
  async readBuffer(type: string): Promise<Buffer | null> {
    const meta = await this.getMetadata(type);
    if (!meta) return null;
    try {
      const obj = await this.storage.read(NAMESPACE, meta.storageKey);
      const chunks: Buffer[] = [];
      for await (const chunk of obj.stream as any) chunks.push(Buffer.from(chunk));
      return Buffer.concat(chunks);
    } catch {
      return null;
    }
  }

  private extForMime(mime: string): string {
    switch (mime) {
      case 'image/png': return 'png';
      case 'image/jpeg': return 'jpg';
      case 'image/svg+xml': return 'svg';
      case 'image/webp': return 'webp';
      default: return 'bin';
    }
  }
}
