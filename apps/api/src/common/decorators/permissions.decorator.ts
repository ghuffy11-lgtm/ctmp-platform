import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

// BUG-111 (2026-06-06): OR semantics — caller passes the route if they hold
// AT LEAST ONE of the listed permissions. Used for endpoints accessible to
// multiple distinct evaluator roles (e.g. technical:evaluate vs
// technical:evaluate:procurement on the technical evaluation submit route).
export const ANY_PERMISSION_KEY = 'any_permission';
export const RequireAnyPermission = (...permissions: string[]) =>
  SetMetadata(ANY_PERMISSION_KEY, permissions);
