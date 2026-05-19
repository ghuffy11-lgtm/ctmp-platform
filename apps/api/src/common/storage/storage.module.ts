import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LocalStorageBackend } from './local-storage.backend';
import { S3StorageBackend } from './s3-storage.backend';
import type { StorageBackend } from './storage.types';

export const STORAGE_BACKEND = Symbol('STORAGE_BACKEND');

@Module({
  providers: [
    LocalStorageBackend,
    S3StorageBackend,
    {
      provide: STORAGE_BACKEND,
      inject: [ConfigService, LocalStorageBackend, S3StorageBackend],
      useFactory: (
        config: ConfigService,
        local: LocalStorageBackend,
        s3: S3StorageBackend,
      ): StorageBackend => {
        const driver = (config.get<string>('storage.driver') ?? 'local').toLowerCase();
        return driver === 's3' ? s3 : local;
      },
    },
  ],
  exports: [STORAGE_BACKEND],
})
export class StorageModule {}
