import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SystemSettingsService } from './system-settings.service';

interface SettingUpdate {
  key: string;
  value: string;
}

@ApiTags('system-settings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('system-settings')
export class SystemSettingsController {
  constructor(private readonly service: SystemSettingsService) {}

  @Get()
  @RequirePermissions('system:configure')
  @ApiOperation({ operationId: 'listSystemSettings', summary: 'List all platform settings grouped by category' })
  list() {
    return this.service.list();
  }

  @Post('batch')
  @RequirePermissions('system:configure')
  @ApiOperation({ operationId: 'updateSystemSettings', summary: 'Batch update platform settings; atomic + audited' })
  batchUpdate(
    @Body('updates') updates: SettingUpdate[],
    @CurrentUser('id') userId: string,
  ) {
    return this.service.batchUpdate(updates, userId);
  }
}
