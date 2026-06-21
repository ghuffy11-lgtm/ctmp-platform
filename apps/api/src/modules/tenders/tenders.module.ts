import { Module } from '@nestjs/common';
import { TendersController, PublicTendersController } from './tenders.controller';
import { TendersService } from './tenders.service';
import { TenderStorageService } from './tender-storage.service';
import { AuditModule } from '../audit/audit.module';
import { StorageModule } from '../../common/storage/storage.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SystemSettingsModule } from '../system-settings/system-settings.module';

@Module({
  // BUG-120 (2026-06-10): NotificationsModule + SystemSettingsModule wired
  // so inviteVendor() / publish() can fire the TENDER_INVITATION_SENT email.
  imports: [AuditModule, StorageModule, NotificationsModule, SystemSettingsModule],
  controllers: [TendersController, PublicTendersController],
  providers: [TendersService, TenderStorageService],
  exports: [TendersService],
})
export class TendersModule {}
