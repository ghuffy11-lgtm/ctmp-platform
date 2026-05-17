import { Module } from '@nestjs/common';
import { AwardController } from './award.controller';
import { AwardService } from './award.service';

@Module({
  controllers: [AwardController],
  providers: [AwardService],
  exports: [AwardService],
})
export class AwardModule {}
