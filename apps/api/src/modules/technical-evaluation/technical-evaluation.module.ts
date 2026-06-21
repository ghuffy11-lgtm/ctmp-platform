import { Module } from '@nestjs/common';
import { TechnicalEvaluationController } from './technical-evaluation.controller';
import { TechnicalEvaluationService } from './technical-evaluation.service';
import { AuditModule } from '../audit/audit.module';
// BUG-140 (2026-06-19): manager notification email when finalize() runs.
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [AuditModule, NotificationsModule],
  controllers: [TechnicalEvaluationController],
  providers: [TechnicalEvaluationService],
  exports: [TechnicalEvaluationService],
})
export class TechnicalEvaluationModule {}
