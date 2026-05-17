import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { VendorAuthController } from './vendor-auth.controller';
import { VendorAuthService } from './vendor-auth.service';
import { VendorJwtStrategy } from './strategies/vendor-jwt.strategy';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('jwt.vendorSecret'),
        signOptions: { expiresIn: config.get<string>('jwt.vendorExpiresIn', '24h') },
      }),
    }),
  ],
  controllers: [VendorAuthController],
  providers: [VendorAuthService, VendorJwtStrategy],
  exports: [VendorAuthService],
})
export class VendorAuthModule {}
