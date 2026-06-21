import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { VendorStatus } from '@prisma/client';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { AnalyticsService } from './analytics.service';

// BUG-086 Phase 1: executive dashboard endpoint.
// BUG-087 (2026-06-02): perm gate changed from reports:view to executive:dashboard
// per owner directive — only the EXECUTIVE role (and SYSTEM_ADMIN) should see
// this surface. Procurement Admin / Manager / Auditor lose access.
// BUG-100 (2026-06-04): per-vendor executive drill-down. Two new routes for
// /executive/vendors directory + /executive/vendors/[id] detail. Same gate.
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

  @Get('vendors')
  @RequirePermissions('executive:dashboard')
  @ApiOperation({
    operationId: 'listExecutiveVendorDirectory',
    summary: 'Vendor directory with per-vendor award count, total spend, win rate',
  })
  listVendors(
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('country') country?: string,
    @Query('year') year?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('sort') sort?: string,
  ) {
    const parsedYear = year ? Number(year) : undefined;
    const parsedPage = page ? Number(page) : undefined;
    const parsedPageSize = pageSize ? Number(pageSize) : undefined;
    const parsedStatus =
      status && status !== 'ALL' && status in VendorStatus
        ? (status as VendorStatus)
        : 'ALL';
    return this.analytics.listVendorDirectory({
      q,
      status: parsedStatus,
      country,
      year: Number.isFinite(parsedYear) ? parsedYear : undefined,
      page: Number.isFinite(parsedPage) ? parsedPage : undefined,
      pageSize: Number.isFinite(parsedPageSize) ? parsedPageSize : undefined,
      sort,
    });
  }

  @Get('vendors/:vendorId')
  @RequirePermissions('executive:dashboard')
  @ApiOperation({
    operationId: 'getExecutiveVendorProfile',
    summary: 'Single-vendor profile + award history + spend trend + bid participation',
  })
  getVendor(@Param('vendorId', new ParseUUIDPipe()) vendorId: string) {
    return this.analytics.getVendorProfile(vendorId);
  }

  @Get('departments')
  @RequirePermissions('executive:dashboard')
  @ApiOperation({
    operationId: 'getDepartmentOverview',
    summary: 'Department-wise procurement overview — tenders, spend, savings, top vendors (BUG-101)',
  })
  departmentOverview(@Query('year') year?: string) {
    const y = year ? Number(year) : new Date().getFullYear();
    return this.analytics.departmentOverview(Number.isFinite(y) ? y : new Date().getFullYear());
  }

  @Get('departments/:departmentId')
  @RequirePermissions('executive:dashboard')
  @ApiOperation({
    operationId: 'getDepartmentProfile',
    summary: 'Per-department drill-down — metrics + every tender + top vendors + year trend (BUG-102)',
  })
  getDepartment(
    @Param('departmentId', new ParseUUIDPipe()) departmentId: string,
    @Query('year') year?: string,
  ) {
    // Empty / "all" year → all-time scoping (null sentinel).
    let y: number | null = null;
    if (year && year !== 'all') {
      const n = Number(year);
      if (Number.isFinite(n)) y = n;
    }
    return this.analytics.getDepartmentProfile(departmentId, y);
  }

  // BUG-133 (2026-06-14): filtered tender list backing the /executive/tenders
  // drill-down page. Same data fields as the admin /tenders list, but uses the
  // analytics resolver chain for awardedAmount (BoQ-aware) and exposes the
  // querystring filters that the executive dashboard tiles need.
  @Get('tenders-list')
  @RequirePermissions('executive:dashboard')
  @ApiOperation({
    operationId: 'listExecutiveTenders',
    summary: 'Filtered tender list for executive drill-downs (resolver-priced amounts)',
  })
  listTenders(
    @Query('createdYear') createdYear?: string,
    @Query('awardedYear') awardedYear?: string,
    @Query('hasAward') hasAward?: string,
    @Query('hasNegotiation') hasNegotiation?: string,
    @Query('activeOnly') activeOnly?: string,
    @Query('status') status?: string,
    @Query('statusNot') statusNot?: string,
    @Query('category') category?: string,
    @Query('departmentId') departmentId?: string,
    @Query('vendorId') vendorId?: string,
    @Query('sort') sort?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const parsedCreatedYear = createdYear ? Number(createdYear) : undefined;
    const parsedAwardedYear = awardedYear ? Number(awardedYear) : undefined;
    const parsedPage = page ? Number(page) : undefined;
    const parsedPageSize = pageSize ? Number(pageSize) : undefined;
    return this.analytics.listExecutiveTenders({
      createdYear: Number.isFinite(parsedCreatedYear) ? parsedCreatedYear : undefined,
      awardedYear: Number.isFinite(parsedAwardedYear) ? parsedAwardedYear : undefined,
      hasAward: hasAward === 'true',
      hasNegotiation: hasNegotiation === 'true',
      activeOnly: activeOnly === 'true',
      status,
      statusNot,
      category,
      departmentId,
      vendorId,
      sort,
      page: Number.isFinite(parsedPage) ? parsedPage : undefined,
      pageSize: Number.isFinite(parsedPageSize) ? parsedPageSize : undefined,
    });
  }
}
