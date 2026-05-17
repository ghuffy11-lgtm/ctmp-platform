import { registerAs } from '@nestjs/config';

export default registerAs('ad', () => ({
  url: process.env.AD_URL,
  baseDn: process.env.AD_BASE_DN,
  bindDn: process.env.AD_BIND_DN,
  bindPassword: process.env.AD_BIND_PASSWORD,
  domain: process.env.AD_DOMAIN,
}));
