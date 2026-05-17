import { Module } from '@nestjs/common';
import { ClarificationsController } from './clarifications.controller';
import { ClarificationsService } from './clarifications.service';

@Module({
  controllers: [ClarificationsController],
  providers: [ClarificationsService],
  exports: [ClarificationsService],
})
export class ClarificationsModule {}
