import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ClarificationsService } from './clarifications.service';
import { CreateClarificationDto } from './dto/create-clarification.dto';
import { ReplyClarificationDto } from './dto/reply-clarification.dto';

@ApiTags('clarifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller()
export class ClarificationsController {
  constructor(private readonly clarificationsService: ClarificationsService) {}

  @Get('tenders/:tenderId/clarifications')
  @RequirePermissions('clarifications:list')
  @ApiOperation({ operationId: 'listClarifications', summary: 'List clarifications for a tender' })
  findAll(@Param('tenderId') tenderId: string, @CurrentUser() user: any) {
    return this.clarificationsService.findAll(tenderId, user);
  }

  @Post('tenders/:tenderId/clarifications')
  @RequirePermissions('clarifications:create')
  @ApiOperation({ operationId: 'createClarification', summary: 'Submit clarification question' })
  create(
    @Param('tenderId') tenderId: string,
    @Body() dto: CreateClarificationDto,
    @CurrentUser() user: any,
  ) {
    return this.clarificationsService.create(tenderId, dto, user);
  }

  @Post('clarifications/:id/reply')
  @RequirePermissions('clarifications:reply')
  @ApiOperation({ operationId: 'replyClarification', summary: 'Reply to clarification' })
  reply(
    @Param('id') id: string,
    @Body() dto: ReplyClarificationDto,
    @CurrentUser() user: any,
  ) {
    return this.clarificationsService.reply(id, dto, user);
  }
}
