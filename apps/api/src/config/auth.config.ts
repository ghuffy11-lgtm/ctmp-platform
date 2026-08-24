import { registerAs } from '@nestjs/config';

// 2026-08-24: this file did not exist.
//
// Five `auth.*` keys were being read across the codebase —
//
//   auth.maxFailedLogins          auth.service.ts:235, vendor-auth.service.ts:553
//   auth.lockoutMinutes           auth.service.ts:236, vendor-auth.service.ts:554
//   auth.verifyEmailTtlHours      vendor-auth.service.ts:185
//   auth.resetPasswordTtlMinutes  vendor-auth.service.ts:465
//   auth.bcryptRounds             vendor-auth.service.ts:597
//
// — but no registerAs('auth') existed and nothing was loaded in app.module.ts,
// so every lookup returned `undefined` and silently fell through to its
// hardcoded `?? default`. The behaviour was correct; the configurability was
// an illusion. Setting an environment variable did nothing at all.
//
// The defaults below are deliberately IDENTICAL to the fallbacks that were
// already in force, so registering this changes no running behaviour — it only
// makes the env vars real. Change a value here only on purpose.
export default registerAs('auth', () => ({
  /** Failed sign-ins before an account locks. Applies to internal and vendor users. */
  maxFailedLogins: parseInt(process.env.AUTH_MAX_FAILED_LOGINS ?? '5', 10),

  /** How long a locked account stays locked, in minutes. */
  lockoutMinutes: parseInt(process.env.AUTH_LOCKOUT_MINUTES ?? '15', 10),

  /** Lifetime of a vendor email-verification token, in hours. */
  verifyEmailTtlHours: parseInt(process.env.AUTH_VERIFY_EMAIL_TTL_HOURS ?? '24', 10),

  /** Lifetime of a vendor password-reset token, in minutes. */
  resetPasswordTtlMinutes: parseInt(process.env.AUTH_RESET_PASSWORD_TTL_MINUTES ?? '60', 10),

  /**
   * bcrypt cost factor for vendor passwords.
   *
   * Raising this does NOT re-hash existing passwords — they keep their original
   * cost until the user next changes their password. Lowering it weakens every
   * hash written from then on. 12 is the value every existing vendor hash was
   * written with, and matches BCRYPT_ROUNDS in users.service.ts.
   */
  bcryptRounds: parseInt(process.env.AUTH_BCRYPT_ROUNDS ?? '12', 10),
}));
