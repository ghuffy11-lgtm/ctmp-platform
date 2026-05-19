import { Controller, Get, Patch, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('notification-templates')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @RequirePermissions('notification_templates:manage')
  @ApiOperation({ operationId: 'listNotificationTemplates', summary: 'List notification templates' })
  listTemplates() {
    return this.notificationsService.listTemplates();
  }

  @Patch(':id')
  @RequirePermissions('notification_templates:manage')
  @ApiOperation({ operationId: 'updateNotificationTemplate', summary: 'Update notification template subject/body/enabled flag' })
  updateTemplate(
    @Param('id') id: string,
    @Body() body: { subject?: string; bodyTemplate?: string; enabled?: boolean },
    @CurrentUser('id') userId: string,
  ) {
    return this.notificationsService.updateTemplate(id, body, userId);
  }
}
