import { Module } from '@nestjs/common';
import { CommercialEvaluationController } from './commercial-evaluation.controller';
import { CommercialEvaluationService } from './commercial-evaluation.service';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [CommercialEvaluationController],
  providers: [CommercialEvaluationService],
  exports: [CommercialEvaluationService],
})
export class CommercialEvaluationModule {}
