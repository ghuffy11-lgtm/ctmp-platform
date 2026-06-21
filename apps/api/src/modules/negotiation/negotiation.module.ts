import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { StorageModule } from '../../common/storage/storage.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SystemSettingsModule } from '../system-settings/system-settings.module';
import { NegotiationController } from './negotiation.controller';
import { NegotiationService } from './negotiation.service';
import { NegotiationStorageService } from './negotiation-storage.service';

// BUG-115 (2026-06-09): negotiation workflow module.
// BUG-127 (2026-06-11): NotificationsModule + SystemSettingsModule wired so
// launchRound() can dispatch the optional TENDER_NEGOTIATION_LAUNCHED email.
@Module({
  imports: [AuditModule, StorageModule, NotificationsModule, SystemSettingsModule],
  controllers: [NegotiationController],
  providers: [NegotiationService, NegotiationStorageService],
  exports: [NegotiationService],
})
export class NegotiationModule {}
