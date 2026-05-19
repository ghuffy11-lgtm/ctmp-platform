import type { Readable } from 'stream';

export interface StorageWriteResult {
  storageKey: string;
  fileSize: number;
}

export interface StorageReadResult {
  stream: Readable;
  size: number;
  contentType?: string;
}

/**
 * Storage backend abstraction. Local disk and S3-compatible (MinIO, AWS S3)
 * implementations are interchangeable behind this contract.
 *
 * Path-traversal protection is the implementation's responsibility — `storageKey`
 * values returned from `write()` must round-trip safely back through `read()` and
 * `remove()` without escaping the configured root.
 */
export interface StorageBackend {
  /** Persist a buffer under a deterministic key inside a logical namespace. */
  write(args: {
    namespace: string;
    storageKey: string;
    payload: Buffer;
    contentType?: string;
  }): Promise<StorageWriteResult>;

  /** Stream a previously-written object back. */
  read(namespace: string, storageKey: string): Promise<StorageReadResult>;

  /** Remove an object. Best-effort — missing objects do not throw. */
  remove(namespace: string, storageKey: string): Promise<void>;
}
