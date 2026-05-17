import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { ReportsService } from './reports.service';
import { ExportReportDto } from './dto/export-report.dto';

@ApiTags('reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get()
  @RequirePermissions('reports:list')
  @ApiOperation({ operationId: 'listReports', summary: 'List available report types' })
  listReports() {
    return this.reportsService.listReports();
  }

  @Post(':reportCode/export')
  @RequirePermissions('reports:export')
  @ApiOperation({ operationId: 'exportReport', summary: 'Start report export job' })
  exportReport(@Param('reportCode') reportCode: string, @Body() dto: ExportReportDto) {
    return this.reportsService.exportReport(reportCode, dto);
  }

  @Get('jobs/:jobId')
  @RequirePermissions('reports:export')
  @ApiOperation({ operationId: 'getReportJob', summary: 'Get report job status' })
  getJob(@Param('jobId') jobId: string) {
    return this.reportsService.getJob(jobId);
  }

  @Get('jobs/:jobId/download')
  @RequirePermissions('reports:export')
  @ApiOperation({ operationId: 'downloadReport', summary: 'Download completed report' })
  download(@Param('jobId') jobId: string) {
    return this.reportsService.download(jobId);
  }
}
