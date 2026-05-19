import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream } from 'fs';
import { mkdir, stat, unlink, writeFile } from 'fs/promises';
import { extname, join, resolve } from 'path';
import type { StorageBackend, StorageReadResult, StorageWriteResult } from './storage.types';

const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xls': 'application/vnd.ms-excel',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.zip': 'application/zip',
  '.txt': 'text/plain',
};

@Injectable()
export class LocalStorageBackend implements StorageBackend {
  private readonly logger = new Logger(LocalStorageBackend.name);
  private readonly root: string;

  constructor(config: ConfigService) {
    this.root = resolve(
      config.get<string>('storage.localRoot') ?? join(process.cwd(), 'data'),
    );
  }

  async write(args: {
    namespace: string;
    storageKey: string;
    payload: Buffer;
    contentType?: string;
  }): Promise<StorageWriteResult> {
    const abs = this.resolvePath(args.namespace, args.storageKey);
    await mkdir(join(abs, '..'), { recursive: true });
    await writeFile(abs, args.payload);
    const { size } = await stat(abs);
    return { storageKey: args.storageKey, fileSize: size };
  }

  async read(namespace: string, storageKey: string): Promise<StorageReadResult> {
    const abs = this.resolvePath(namespace, storageKey);
    let size: number;
    try {
      const info = await stat(abs);
      size = info.size;
    } catch {
      throw new NotFoundException('Object not found on local storage');
    }
    return {
      stream: createReadStream(abs),
      size,
      contentType: CONTENT_TYPE_BY_EXT[extname(abs).toLowerCase()],
    };
  }

  async remove(namespace: string, storageKey: string): Promise<void> {
    try {
      await unlink(this.resolvePath(namespace, storageKey));
    } catch {
      // ignore — best-effort
    }
  }

  private resolvePath(namespace: string, storageKey: string): string {
    const namespaceRoot = resolve(this.root, namespace);
    const abs = resolve(namespaceRoot, storageKey);
    if (!abs.startsWith(namespaceRoot + (process.platform === 'win32' ? '\\' : '/'))
        && abs !== namespaceRoot) {
      throw new NotFoundException('Invalid storage key');
    }
    return abs;
  }
}
