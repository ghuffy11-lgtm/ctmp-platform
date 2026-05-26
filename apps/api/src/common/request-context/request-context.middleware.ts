import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { RequestContextService } from './request-context.service';

/**
 * Captures the originating client IP and User-Agent for the current HTTP
 * request and stores them in {@link RequestContextService}'s async storage
 * for the duration of the request handler. Downstream code (notably
 * AuditService) reads these without having to plumb them through
 * controller→service signatures.
 *
 * Note: req.ip respects the Express `trust proxy` setting. main.ts sets
 * `trust proxy=1` so a single upstream nginx hop is trusted and
 * X-Forwarded-For's leftmost value wins.
 */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(private readonly ctx: RequestContextService) {}

  use(req: Request, _res: Response, next: NextFunction): void {
    const ipAddress = req.ip ?? undefined;
    const ua = req.headers['user-agent'];
    const userAgent = typeof ua === 'string' ? ua : Array.isArray(ua) ? ua[0] : undefined;
    this.ctx.run({ ipAddress, userAgent }, () => next());
  }
}
