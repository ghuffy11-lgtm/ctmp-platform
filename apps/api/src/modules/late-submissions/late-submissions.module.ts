import { Module } from '@nestjs/common';
import { LateSubmissionsController } from './late-submissions.controller';
import { LateSubmissionsService } from './late-submissions.service';

@Module({
  controllers: [LateSubmissionsController],
  providers: [LateSubmissionsService],
  exports: [LateSubmissionsService],
})
export class LateSubmissionsModule {}
