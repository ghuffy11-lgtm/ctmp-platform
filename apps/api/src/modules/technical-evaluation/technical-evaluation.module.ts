import { Module } from '@nestjs/common';
import { TechnicalEvaluationController } from './technical-evaluation.controller';
import { TechnicalEvaluationService } from './technical-evaluation.service';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [TechnicalEvaluationController],
  providers: [TechnicalEvaluationService],
  exports: [TechnicalEvaluationService],
})
export class TechnicalEvaluationModule {}
