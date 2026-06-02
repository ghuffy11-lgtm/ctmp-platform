import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { AnalyticsService } from './analytics.service';

// BUG-086 Phase 1: executive dashboard endpoint.
// BUG-087 (2026-06-02): perm gate changed from reports:view to executive:dashboard
// per owner directive — only the EXECUTIVE role (and SYSTEM_ADMIN) should see
// this surface. Procurement Admin / Manager / Auditor lose access.
@ApiTags('analytics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('executive-summary')
  @RequirePermissions('executive:dashboard')
  @ApiOperation({
    operationId: 'getExecutiveSummary',
    summary: 'Aggregated KPIs + monthly trend + breakdowns for executives',
  })
  executiveSummary(@Query('year') year?: string) {
    const y = year ? Number(year) : new Date().getFullYear();
    return this.analytics.executiveSummary(Number.isFinite(y) ? y : new Date().getFullYear());
  }
}
