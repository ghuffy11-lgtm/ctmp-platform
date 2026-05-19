import { registerAs } from '@nestjs/config';

export default registerAs('audit', () => ({
  verifyOnStart: process.env.AUDIT_VERIFY_ON_START ?? 'true',
  verifyLimit: process.env.AUDIT_VERIFY_LIMIT ?? '1000',
}));
