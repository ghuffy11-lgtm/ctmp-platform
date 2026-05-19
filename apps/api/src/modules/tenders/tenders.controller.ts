import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { OptionalVendorOrUserGuard } from '../../common/guards/optional-vendor-or-user.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TendersService } from './tenders.service';
import { CreateTenderDto } from './dto/create-tender.dto';
import { UpdateTenderDto } from './dto/update-tender.dto';
import { ListTendersDto } from './dto/list-tenders.dto';

@ApiTags('tenders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('tenders')
export class TendersController {
  constructor(private readonly tendersService: TendersService) {}

  @Get()
  @Public()
  @UseGuards(OptionalVendorOrUserGuard)
  @ApiOperation({ operationId: 'listTenders', summary: 'List tenders with filters (accessible to vendors for published browsing)' })
  findAll(@Query() query: ListTendersDto) {
    return this.tendersService.findAll(query);
  }

  @Post()
  @RequirePermissions('tender:create')
  @ApiOperation({ operationId: 'createTender', summary: 'Create tender draft' })
  create(@Body() dto: CreateTenderDto, @CurrentUser('id') userId: string) {
    return this.tendersService.create(dto, userId);
  }

  @Get(':id')
  @Public()
  @UseGuards(OptionalVendorOrUserGuard)
  @ApiOperation({ operationId: 'getTender', summary: 'Get tender detail (accessible to vendors for published tenders)' })
  findOne(@Param('id') id: string) {
    return this.tendersService.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions('tender:edit')
  @ApiOperation({ operationId: 'updateTender', summary: 'Update tender draft' })
  update(@Param('id') id: string, @Body() dto: UpdateTenderDto) {
    return this.tendersService.update(id, dto);
  }

  @Get(':id/documents/:documentId')
  @RequirePermissions('tender:view')
  @ApiOperation({ operationId: 'downloadTenderDocument', summary: 'Download tender document' })
  downloadDocument(@Param('id') id: string, @Param('documentId') documentId: string) {
    return this.tendersService.downloadDocument(id, documentId);
  }

  @Post(':id/submit-for-approval')
  @RequirePermissions('tender:edit')
  @ApiOperation({ operationId: 'submitTenderForApproval', summary: 'Submit tender for internal approval' })
  submitForApproval(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.tendersService.submitForApproval(id, userId);
  }

  @Post(':id/publish')
  @RequirePermissions('tender:publish')
  @ApiOperation({ operationId: 'publishTender', summary: 'Publish approved tender' })
  publish(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.tendersService.publish(id, userId);
  }

  @Post(':id/cancel')
  @RequirePermissions('tender:cancel')
  @ApiOperation({ operationId: 'cancelTender', summary: 'Cancel tender' })
  cancel(@Param('id') id: string, @Body('reason') reason: string, @CurrentUser('id') userId: string) {
    return this.tendersService.cancel(id, reason, userId);
  }

  @Post(':id/close-submissions')
  @RequirePermissions('tender:close_submission')
  @ApiOperation({ operationId: 'closeSubmissions', summary: 'Close bid submission window' })
  closeSubmissions(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.tendersService.closeSubmissions(id, userId);
  }

  @Post(':id/approve')
  @RequirePermissions('tender:approve')
  @ApiOperation({ operationId: 'approveTender', summary: 'Approve tender from Internal Review' })
  approve(
    @Param('id') id: string,
    @Body('comments') comments: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.tendersService.approve(id, comments, userId);
  }

  @Post(':id/reject')
  @RequirePermissions('tender:approve')
  @ApiOperation({ operationId: 'rejectTender', summary: 'Reject tender from Internal Review' })
  reject(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.tendersService.reject(id, reason, userId);
  }
}
