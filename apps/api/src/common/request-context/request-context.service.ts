import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';

/**
 * Per-request context propagated via Node's AsyncLocalStorage. Set once
 * at the start of an HTTP request by {@link RequestContextMiddleware},
 * read anywhere downstream without explicit threading through method
 * signatures. Used by AuditService to attach the originating client IP
 * and User-Agent to audit_logs rows when the calling service didn't
 * pass them explicitly.
 *
 * Returns undefined when called outside of a request scope (background
 * jobs, scripts, BullMQ workers) — call sites must handle that.
 */
export interface RequestContext {
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class RequestContextService {
  private readonly storage = new AsyncLocalStorage<RequestContext>();

  run<T>(ctx: RequestContext, fn: () => T): T {
    return this.storage.run(ctx, fn);
  }

  get(): RequestContext | undefined {
    return this.storage.getStore();
  }
}
