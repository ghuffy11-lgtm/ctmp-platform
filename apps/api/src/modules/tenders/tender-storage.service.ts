import { Inject, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import type { Readable } from 'stream';
import { STORAGE_BACKEND } from '../../common/storage/storage.module';
import type { StorageBackend } from '../../common/storage/storage.types';

const NAMESPACE = 'tender-documents';

@Injectable()
export class TenderStorageService {
  constructor(@Inject(STORAGE_BACKEND) private readonly backend: StorageBackend) {}

  async write(args: {
    tenderId: string;
    docId: string;
    originalFilename: string;
    payload: Buffer;
    mimeType?: string;
  }): Promise<{ storageKey: string; checksumSha256: string; fileSize: number }> {
    const safeName = args.originalFilename.replace(/[^A-Za-z0-9._-]/g, '_').slice(-128);
    const storageKey = `${args.tenderId}/${args.docId}-${safeName}`;
    const result = await this.backend.write({
      namespace: NAMESPACE,
      storageKey,
      payload: args.payload,
      contentType: args.mimeType,
    });
    const checksumSha256 = createHash('sha256').update(args.payload).digest('hex');
    return {
      storageKey: result.storageKey,
      fileSize: result.fileSize,
      checksumSha256,
    };
  }

  async stream(storageKey: string): Promise<{ stream: Readable; size: number; mimeType: string }> {
    const r = await this.backend.read(NAMESPACE, storageKey);
    return { stream: r.stream, size: r.size, mimeType: r.contentType ?? 'application/octet-stream' };
  }

  async delete(storageKey: string): Promise<void> {
    await this.backend.remove(NAMESPACE, storageKey);
  }
}
