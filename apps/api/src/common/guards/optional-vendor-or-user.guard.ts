import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Accepts either a vendor JWT or an internal user JWT. Caller is responsible
 * for handling both shapes downstream (e.g. checking `user.vendorId` vs `user.id`).
 *
 * Strategy: try vendor-jwt first; on failure fall back to plain jwt.
 */
@Injectable()
export class OptionalVendorOrUserGuard implements CanActivate {
  private readonly vendorGuard = new (AuthGuard('vendor-jwt'))();
  private readonly userGuard = new (AuthGuard('jwt'))();

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      const ok = await Promise.resolve(this.vendorGuard.canActivate(context));
      if (ok) return true;
    } catch {
      // fall through
    }
    try {
      const ok = await Promise.resolve(this.userGuard.canActivate(context));
      if (ok) return true;
    } catch {
      // fall through
    }
    throw new UnauthorizedException();
  }
}
