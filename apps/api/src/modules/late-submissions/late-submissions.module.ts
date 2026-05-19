import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { LateSubmissionsController } from './late-submissions.controller';
import { LateSubmissionsService } from './late-submissions.service';

@Module({
  imports: [AuditModule],
  controllers: [LateSubmissionsController],
  providers: [LateSubmissionsService],
  exports: [LateSubmissionsService],
})
export class LateSubmissionsModule {}
