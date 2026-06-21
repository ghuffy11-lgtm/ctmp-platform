import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SystemSettingsController, PublicBrandingController } from './system-settings.controller';
import { SystemSettingsService } from './system-settings.service';
import { SecureSettingsService } from './secure-settings.service';
import { BrandingService } from './branding.service';
import { AuditModule } from '../audit/audit.module';
import { StorageModule } from '../../common/storage/storage.module';

@Module({
  imports: [AuditModule, ConfigModule, StorageModule],
  controllers: [SystemSettingsController, PublicBrandingController],
  providers: [SystemSettingsService, SecureSettingsService, BrandingService],
  exports: [SystemSettingsService, SecureSettingsService, BrandingService],
})
export class SystemSettingsModule {}
