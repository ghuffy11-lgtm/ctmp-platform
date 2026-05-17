import { Module } from '@nestjs/common';
import { TechnicalEvaluationController } from './technical-evaluation.controller';
import { TechnicalEvaluationService } from './technical-evaluation.service';

@Module({
  controllers: [TechnicalEvaluationController],
  providers: [TechnicalEvaluationService],
  exports: [TechnicalEvaluationService],
})
export class TechnicalEvaluationModule {}
