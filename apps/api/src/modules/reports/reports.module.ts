import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { ReportRendererService } from './report-renderer.service';
import { ReportStorageService } from './report-storage.service';
import { ReportQueueService } from './report-queue.service';
import { AuditModule } from '../audit/audit.module';
import { StorageModule } from '../../common/storage/storage.module';

@Module({
  imports: [AuditModule, StorageModule],
  controllers: [ReportsController],
  providers: [ReportsService, ReportRendererService, ReportStorageService, ReportQueueService],
  exports: [ReportsService],
})
export class ReportsModule {}
