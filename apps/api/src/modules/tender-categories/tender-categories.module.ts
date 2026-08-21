import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { AuditModule } from '../audit/audit.module';
import { TenderCategoriesController } from './tender-categories.controller';
import { TenderCategoriesService } from './tender-categories.service';

@Module({
  imports: [DatabaseModule, AuditModule],
  controllers: [TenderCategoriesController],
  providers: [TenderCategoriesService],
  exports: [TenderCategoriesService],
})
export class TenderCategoriesModule {}
