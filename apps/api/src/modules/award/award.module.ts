import { Module } from '@nestjs/common';
import { AwardController } from './award.controller';
import { AwardService } from './award.service';
import { AwardStorageService } from './award-storage.service';
import { AwardMinutesService } from './award-minutes.service';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { StorageModule } from '../../common/storage/storage.module';

@Module({
  imports: [AuditModule, NotificationsModule, StorageModule],
  controllers: [AwardController],
  providers: [AwardService, AwardStorageService, AwardMinutesService],
  exports: [AwardService, AwardMinutesService],
})
export class AwardModule {}
