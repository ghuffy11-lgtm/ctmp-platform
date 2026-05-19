import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import type { StorageBackend, StorageReadResult, StorageWriteResult } from './storage.types';

/**
 * S3-compatible storage backend. Works with AWS S3 + MinIO when `forcePathStyle`
 * is on. Buckets are namespaced (`reports`, `bid-documents`); both are
 * auto-created on first write if `STORAGE_AUTO_CREATE_BUCKETS=true` (dev/staging
 * default). Production should provision buckets via Terraform with stricter ACLs.
 */
@Injectable()
export class S3StorageBackend implements StorageBackend, OnModuleInit {
  private readonly logger = new Logger(S3StorageBackend.name);
  private client!: S3Client;
  private bucketPrefix!: string;
  private autoCreate!: boolean;
  private readonly ensuredBuckets = new Set<string>();

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const endpoint = this.config.get<string>('storage.s3Endpoint');
    const region = this.config.get<string>('storage.s3Region') ?? 'us-east-1';
    const accessKeyId = this.config.get<string>('storage.s3AccessKey') ?? '';
    const secretAccessKey = this.config.get<string>('storage.s3SecretKey') ?? '';
    const forcePathStyle = this.config.get<boolean>('storage.s3ForcePathStyle') ?? true;

    this.bucketPrefix = this.config.get<string>('storage.s3BucketPrefix') ?? 'ctmp';
    this.autoCreate = this.config.get<boolean>('storage.s3AutoCreateBuckets') ?? false;

    this.client = new S3Client({
      endpoint: endpoint || undefined,
      region,
      forcePathStyle,
      credentials: accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined,
    });
  }

  async write(args: {
    namespace: string;
    storageKey: string;
    payload: Buffer;
    contentType?: string;
  }): Promise<StorageWriteResult> {
    const bucket = this.bucketFor(args.namespace);
    await this.ensureBucket(bucket);
    await this.client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: args.storageKey,
        Body: args.payload,
        ContentType: args.contentType,
      }),
    );
    return { storageKey: args.storageKey, fileSize: args.payload.byteLength };
  }

  async read(namespace: string, storageKey: string): Promise<StorageReadResult> {
    const bucket = this.bucketFor(namespace);
    try {
      const res = await this.client.send(
        new GetObjectCommand({ Bucket: bucket, Key: storageKey }),
      );
      const stream = res.Body as Readable;
      return {
        stream,
        size: res.ContentLength ?? 0,
        contentType: res.ContentType,
      };
    } catch (err) {
      if (err instanceof S3ServiceException && (err.$metadata.httpStatusCode === 404 || err.name === 'NoSuchKey')) {
        throw new NotFoundException('Object not found in S3');
      }
      throw err;
    }
  }

  async remove(namespace: string, storageKey: string): Promise<void> {
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucketFor(namespace), Key: storageKey }),
      );
    } catch {
      // best-effort — ignore missing objects
    }
  }

  // ---------------------------------------------------------------------------

  private bucketFor(namespace: string): string {
    // S3 bucket names must be DNS-safe lowercase. namespace is already.
    return `${this.bucketPrefix}-${namespace}`;
  }

  private async ensureBucket(bucket: string): Promise<void> {
    if (this.ensuredBuckets.has(bucket)) return;
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: bucket }));
    } catch (err) {
      if (!this.autoCreate) {
        throw err;
      }
      this.logger.warn(`Auto-creating bucket ${bucket}`);
      try {
        await this.client.send(new CreateBucketCommand({ Bucket: bucket }));
      } catch (createErr) {
        if (createErr instanceof S3ServiceException && createErr.name === 'BucketAlreadyOwnedByYou') {
          // benign race with another replica
        } else {
          throw createErr;
        }
      }
    }
    this.ensuredBuckets.add(bucket);
  }
}
