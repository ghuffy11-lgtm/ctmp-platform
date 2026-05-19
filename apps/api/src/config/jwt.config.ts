import { registerAs } from '@nestjs/config';

export default registerAs('jwt', () => ({
  secret: process.env.JWT_SECRET,
  expiresIn: process.env.JWT_EXPIRES_IN ?? '8h',
  vendorSecret: process.env.VENDOR_JWT_SECRET ?? process.env.JWT_VENDOR_SECRET,
  vendorExpiresIn: process.env.VENDOR_JWT_EXPIRES_IN ?? process.env.JWT_VENDOR_EXPIRES_IN ?? '24h',
  refreshSecret: process.env.JWT_REFRESH_SECRET,
  refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  vendorRefreshSecret: process.env.VENDOR_JWT_REFRESH_SECRET,
  vendorRefreshExpiresIn: process.env.VENDOR_JWT_REFRESH_EXPIRES_IN ?? '7d',
}));
