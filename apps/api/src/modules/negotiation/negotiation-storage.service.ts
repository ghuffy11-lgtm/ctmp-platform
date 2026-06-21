import { Inject, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import type { Readable } from 'stream';
import { STORAGE_BACKEND } from '../../common/storage/storage.module';
import type { StorageBackend } from '../../common/storage/storage.types';

// BUG-115 (2026-06-09): mirrors AwardStorageService. Separate namespace so
// negotiation PDFs don't collide with award justification PDFs.
const NAMESPACE = 'negotiation-submissions';

@Injectable()
export class NegotiationStorageService {
  constructor(@Inject(STORAGE_BACKEND) private readonly backend: StorageBackend) {}

  async write(args: {
    tenderId: string;
    docId: string;
    originalFilename: string;
    payload: Buffer;
  }): Promise<{ storageKey: string; sha256: string; fileSize: number }> {
    const safeName = args.originalFilename.replace(/[^A-Za-z0-9._-]/g, '_').slice(-128);
    const storageKey = `${args.tenderId}/${args.docId}-${safeName}`;
    const result = await this.backend.write({
      namespace: NAMESPACE,
      storageKey,
      payload: args.payload,
      contentType: 'application/pdf',
    });
    const sha256 = createHash('sha256').update(args.payload).digest('hex');
    return { storageKey: result.storageKey, fileSize: result.fileSize, sha256 };
  }

  // BUG-129 (2026-06-11): stream a stored negotiation PDF by storage key.
  // Mirrors BidStorageService.stream().
  async stream(storageKey: string): Promise<{ stream: Readable; size: number; mimeType: string }> {
    const r = await this.backend.read(NAMESPACE, storageKey);
    return { stream: r.stream, size: r.size, mimeType: r.contentType ?? 'application/pdf' };
  }
}
