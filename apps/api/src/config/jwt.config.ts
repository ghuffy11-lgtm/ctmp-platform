import { registerAs } from '@nestjs/config';

// BUG-151 (2026-06-22): fail-fast on missing or weak JWT secrets at module
// load time. Pre-fix, missing VENDOR_JWT_SECRET caused VendorJwtStrategy to
// initialise with `secretOrKey: ''` which then accepted attacker-minted
// HS256 tokens signed with the empty-string secret — full vendor portal
// compromise. We assert all four secrets are set + at least 32 bytes (the
// minimum RFC 7518 recommended length for HS256). Boot fails loudly rather
// than silently running a vulnerable verifier.
//
// Production environment requirements (set BEFORE first deploy):
//   JWT_SECRET                  — admin token signing secret (≥32 chars, random)
//   JWT_REFRESH_SECRET          — admin refresh-token signing secret (≥32 chars, random, DIFFERENT from JWT_SECRET)
//   VENDOR_JWT_SECRET           — vendor access-token signing secret (≥32 chars, random, DIFFERENT from admin secrets)
//   VENDOR_JWT_REFRESH_SECRET   — vendor refresh-token signing secret (≥32 chars, random, DIFFERENT from above)
// Each MUST be uniquely generated (e.g. `openssl rand -base64 48`).
// Re-use across environments is a credential-leak path.
function requireSecret(envName: string, value: string | undefined): string {
  if (!value || value.length < 32) {
    throw new Error(
      `[CONFIG] ${envName} environment variable is missing or shorter than 32 chars. ` +
        `Generate one with: openssl rand -base64 48`,
    );
  }
  return value;
}

export default registerAs('jwt', () => ({
  secret: requireSecret('JWT_SECRET', process.env.JWT_SECRET),
  expiresIn: process.env.JWT_EXPIRES_IN ?? '8h',
  vendorSecret: requireSecret(
    'VENDOR_JWT_SECRET',
    process.env.VENDOR_JWT_SECRET ?? process.env.JWT_VENDOR_SECRET,
  ),
  vendorExpiresIn: process.env.VENDOR_JWT_EXPIRES_IN ?? process.env.JWT_VENDOR_EXPIRES_IN ?? '24h',
  refreshSecret: requireSecret('JWT_REFRESH_SECRET', process.env.JWT_REFRESH_SECRET),
  refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  vendorRefreshSecret: requireSecret(
    'VENDOR_JWT_REFRESH_SECRET',
    process.env.VENDOR_JWT_REFRESH_SECRET,
  ),
  vendorRefreshExpiresIn: process.env.VENDOR_JWT_REFRESH_EXPIRES_IN ?? '7d',
}));
