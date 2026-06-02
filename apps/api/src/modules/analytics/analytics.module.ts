import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

// BUG-086 Phase 1 (2026-06-02): executive analytics. Single endpoint returning
// the data behind the new /executive dashboard page. Read-only aggregations
// over the existing tender / award tables — no new schema or migration.
@Module({
  imports: [DatabaseModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
})
export class AnalyticsModule {}
