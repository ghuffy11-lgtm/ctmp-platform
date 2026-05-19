import { Inject, Injectable } from '@nestjs/common';
import type { Readable } from 'stream';
import { STORAGE_BACKEND } from '../../common/storage/storage.module';
import type { StorageBackend } from '../../common/storage/storage.types';

const NAMESPACE = 'reports';

@Injectable()
export class ReportStorageService {
  constructor(@Inject(STORAGE_BACKEND) private readonly backend: StorageBackend) {}

  async write(
    jobId: string,
    format: 'XLSX' | 'PDF',
    payload: Buffer,
  ): Promise<{ storageKey: string; fileSize: number }> {
    const ext = format === 'PDF' ? 'pdf' : 'xlsx';
    const contentType =
      format === 'PDF'
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    return this.backend.write({
      namespace: NAMESPACE,
      storageKey: `${jobId}.${ext}`,
      payload,
      contentType,
    });
  }

  async stream(storageKey: string): Promise<{ stream: Readable; size: number; mimeType: string }> {
    const r = await this.backend.read(NAMESPACE, storageKey);
    return { stream: r.stream, size: r.size, mimeType: r.contentType ?? 'application/octet-stream' };
  }

  async delete(storageKey: string): Promise<void> {
    await this.backend.remove(NAMESPACE, storageKey);
  }
}
