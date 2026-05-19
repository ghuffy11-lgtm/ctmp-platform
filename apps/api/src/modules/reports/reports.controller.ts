import { Controller, Get, Post, Body, Param, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
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
  exportReport(
    @Param('reportCode') reportCode: string,
    @Body() dto: ExportReportDto,
    @CurrentUser() user: any,
  ) {
    return this.reportsService.exportReport(reportCode, dto, user.id, user.permissions ?? []);
  }

  @Get('jobs')
  @RequirePermissions('reports:export')
  @ApiOperation({ operationId: 'listReportJobs', summary: 'List recent export jobs for caller' })
  listJobs(
    @CurrentUser('id') userId: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.reportsService.listJobs(Number(page ?? 1), Number(pageSize ?? 20), userId);
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
  async download(
    @Param('jobId') jobId: string,
    @CurrentUser('id') userId: string,
    @Res() res: Response,
  ) {
    const result = await this.reportsService.download(jobId, userId);
    const filename = `${result.reportName ?? result.reportCode ?? jobId}.${(result.format ?? 'xlsx').toLowerCase()}`;
    res.setHeader('Content-Type', result.mimeType);
    res.setHeader('Content-Length', String(result.fileSize ?? 0));
    res.setHeader('Content-Disposition', `attachment; filename="${filename.replace(/"/g, '')}"`);
    result.stream.pipe(res);
  }
}
