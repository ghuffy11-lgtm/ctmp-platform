import { Inject, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { STORAGE_BACKEND } from '../../common/storage/storage.module';
import type { StorageBackend } from '../../common/storage/storage.types';

const NAMESPACE = 'award-justifications';

@Injectable()
export class AwardStorageService {
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
}
