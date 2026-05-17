import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditLogInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url, user, ip } = request;

    return next.handle().pipe(
      tap(() => {
        if (['POST', 'PATCH', 'DELETE', 'PUT'].includes(method)) {
          this.logger.log(`AUDIT ${method} ${url} by user=${user?.id ?? 'anonymous'} ip=${ip}`);
        }
      }),
    );
  }
}
