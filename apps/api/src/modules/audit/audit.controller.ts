import { Controller, Get, Patch, Query, Param, UseGuards, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
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

  @Get('security-alerts')
  @RequirePermissions('audit:view')
  @ApiOperation({ operationId: 'listSecurityAlerts', summary: 'List security alerts (e.g. AUDIT_CHAIN_BREAK)' })
  listSecurityAlerts(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('unacknowledgedOnly') unacknowledgedOnly?: string,
  ) {
    return this.auditService.listSecurityAlerts({
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 50,
      unacknowledgedOnly: unacknowledgedOnly === 'true',
    });
  }

  @Patch('security-alerts/:id/acknowledge')
  @RequirePermissions('audit:view')
  @ApiOperation({ operationId: 'acknowledgeSecurityAlert', summary: 'Acknowledge a security alert' })
  acknowledgeAlert(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    if (!/^\d+$/.test(id)) {
      throw new BadRequestException('id must be a positive integer');
    }
    return this.auditService.acknowledgeAlert(BigInt(id), userId);
  }
}
