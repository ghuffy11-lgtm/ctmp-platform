import { Controller, Get, Query, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { AuditService } from './audit.service';
import { AuditSearchDto } from './dto/audit-search.dto';

@ApiTags('audit')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller()
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get('audit-logs')
  @RequirePermissions('audit:read')
  @ApiOperation({ operationId: 'searchAuditLogs', summary: 'Search system-wide audit logs' })
  search(@Query() query: AuditSearchDto) {
    return this.auditService.search(query);
  }

  @Get('tenders/:tenderId/audit-logs')
  @RequirePermissions('audit:read')
  @ApiOperation({ operationId: 'getTenderAuditLogs', summary: 'Get audit logs for a specific tender' })
  getTenderLogs(@Param('tenderId') tenderId: string, @Query() query: AuditSearchDto) {
    return this.auditService.getTenderLogs(tenderId, query);
  }
}
