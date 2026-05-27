import { Module } from '@nestjs/common';
import { TendersController } from './tenders.controller';
import { TendersService } from './tenders.service';
import { TenderStorageService } from './tender-storage.service';
import { AuditModule } from '../audit/audit.module';
import { StorageModule } from '../../common/storage/storage.module';

@Module({
  imports: [AuditModule, StorageModule],
  controllers: [TendersController],
  providers: [TendersService, TenderStorageService],
  exports: [TendersService],
})
export class TendersModule {}
