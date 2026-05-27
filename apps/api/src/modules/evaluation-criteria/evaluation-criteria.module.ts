import { Module } from '@nestjs/common';
import { EvaluationCriteriaController } from './evaluation-criteria.controller';
import { EvaluationCriteriaService } from './evaluation-criteria.service';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [EvaluationCriteriaController],
  providers: [EvaluationCriteriaService],
  exports: [EvaluationCriteriaService],
})
export class EvaluationCriteriaModule {}
