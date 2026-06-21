import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY, ANY_PERMISSION_KEY } from '../decorators/permissions.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    // BUG-111 (2026-06-06): OR-of-perms via @RequireAnyPermission.
    const requiredAny = this.reflector.getAllAndOverride<string[]>(ANY_PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length && !requiredAny?.length) return true;

    const { user } = context.switchToHttp().getRequest();
    const userPerms: string[] = user?.permissions ?? [];
    if (required?.length && !required.every((p) => userPerms.includes(p))) return false;
    if (requiredAny?.length && !requiredAny.some((p) => userPerms.includes(p))) return false;
    return true;
  }
}
