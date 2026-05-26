import { registerAs } from '@nestjs/config';

export default registerAs('captcha', () => ({
  provider: (process.env.CAPTCHA_PROVIDER ?? 'stub').toLowerCase(),
  secretKey: process.env.CAPTCHA_SECRET_KEY ?? '',
  verifyUrl: process.env.CAPTCHA_VERIFY_URL ?? 'https://hcaptcha.com/siteverify',
  timeoutMs: parseInt(process.env.CAPTCHA_VERIFY_TIMEOUT_MS ?? '5000', 10),
  // Opt-in to allow stub provider in production. Default off so prod deploys
  // that forget to swap the provider fail loudly at startup.
  allowStubInProd: (process.env.CAPTCHA_ALLOW_STUB_IN_PROD ?? 'false').toLowerCase() === 'true',
}));
