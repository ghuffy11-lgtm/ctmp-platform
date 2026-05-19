import { Module } from '@nestjs/common';
import { AwardController } from './award.controller';
import { AwardService } from './award.service';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [AwardController],
  providers: [AwardService],
  exports: [AwardService],
})
export class AwardModule {}
