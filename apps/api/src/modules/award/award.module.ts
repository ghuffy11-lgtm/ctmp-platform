import { Module } from '@nestjs/common';
import { AwardController } from './award.controller';
import { AwardService } from './award.service';
import { AwardStorageService } from './award-storage.service';
import { AuditModule } from '../audit/audit.module';
import { StorageModule } from '../../common/storage/storage.module';

@Module({
  imports: [AuditModule, StorageModule],
  controllers: [AwardController],
  providers: [AwardService, AwardStorageService],
  exports: [AwardService],
})
export class AwardModule {}
