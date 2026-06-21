import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { VendorAuthController } from './vendor-auth.controller';
import { VendorAuthService } from './vendor-auth.service';
import { VendorJwtStrategy } from './strategies/vendor-jwt.strategy';
import { CaptchaService } from '../../common/services/captcha.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuditModule } from '../audit/audit.module';
import { SystemSettingsModule } from '../system-settings/system-settings.module';
// BUG-137 (2026-06-19): vendor-auth needs the vendor doc storage service for
// the anonymous registration-document upload endpoint.
import { VendorsModule } from '../vendors/vendors.module';

@Module({
  imports: [
    PassportModule,
    NotificationsModule,
    AuditModule,
    SystemSettingsModule,
    VendorsModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('jwt.vendorSecret') ?? '',
        signOptions: { expiresIn: config.get<string>('jwt.vendorExpiresIn', '24h') as never },
      }),
    }),
  ],
  controllers: [VendorAuthController],
  providers: [VendorAuthService, VendorJwtStrategy, CaptchaService],
  exports: [VendorAuthService],
})
export class VendorAuthModule {}
