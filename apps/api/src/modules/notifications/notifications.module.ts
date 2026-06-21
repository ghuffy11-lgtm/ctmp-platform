import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { AuditModule } from '../audit/audit.module';
import { SystemSettingsModule } from '../system-settings/system-settings.module';

@Module({
  imports: [AuditModule, SystemSettingsModule],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
