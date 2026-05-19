import { Module } from '@nestjs/common';
import { CommitteeController } from './committee.controller';
import { CommitteeService } from './committee.service';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [CommitteeController],
  providers: [CommitteeService],
  exports: [CommitteeService],
})
export class CommitteeModule {}
