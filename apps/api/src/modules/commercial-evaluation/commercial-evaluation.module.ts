import { Module } from '@nestjs/common';
import { CommercialEvaluationController } from './commercial-evaluation.controller';
import { CommercialEvaluationService } from './commercial-evaluation.service';

@Module({
  controllers: [CommercialEvaluationController],
  providers: [CommercialEvaluationService],
  exports: [CommercialEvaluationService],
})
export class CommercialEvaluationModule {}
