import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { ReportRendererService } from './report-renderer.service';
import { ReportStorageService } from './report-storage.service';
import { ReportQueueService } from './report-queue.service';
import { AuditModule } from '../audit/audit.module';
import { StorageModule } from '../../common/storage/storage.module';
import { SystemSettingsModule } from '../system-settings/system-settings.module';

@Module({
  imports: [AuditModule, StorageModule, SystemSettingsModule],
  controllers: [ReportsController],
  providers: [ReportsService, ReportRendererService, ReportStorageService, ReportQueueService],
  exports: [ReportsService],
})
export class ReportsModule {}
