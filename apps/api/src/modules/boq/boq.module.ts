import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { BoqController } from './boq.controller';
import { BoqService } from './boq.service';

@Module({
  imports: [AuditModule],
  controllers: [BoqController],
  providers: [BoqService],
  exports: [BoqService],
})
export class BoqModule {}
