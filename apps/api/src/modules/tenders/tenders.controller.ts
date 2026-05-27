import { Controller, Delete, Get, Post, Patch, Body, Param, Query, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import type { Response } from 'express';
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

const MAX_TENDER_DOC_BYTES = 50 * 1024 * 1024;

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
  findAll(@Query() query: ListTendersDto, @CurrentUser() user: any) {
    return this.tendersService.findAll(query, user);
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
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.tendersService.findOne(id, user);
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
  async downloadDocument(
    @Param('id') id: string,
    @Param('documentId') documentId: string,
    @CurrentUser('id') userId: string,
    @Res() res: Response,
  ) {
    const result = await this.tendersService.streamDocument(id, documentId, userId);
    res.setHeader('Content-Type', result.mimeType);
    res.setHeader('Content-Length', String(result.fileSize ?? 0));
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename.replace(/"/g, '')}"`);
    result.stream.pipe(res);
  }

  // BUG-012: Tender RFQ document upload + delete pipeline.
  @Post(':id/documents')
  @RequirePermissions('tender:edit')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_TENDER_DOC_BYTES } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ operationId: 'uploadTenderDocument', summary: 'Upload a tender RFQ document (multipart, server SHA-256)' })
  uploadDocument(
    @Param('id') id: string,
    @UploadedFile() file: any,
    @CurrentUser('id') userId: string,
  ) {
    return this.tendersService.uploadDocument(id, file, userId);
  }

  @Delete(':id/documents/:documentId')
  @RequirePermissions('tender:edit')
  @ApiOperation({ operationId: 'deleteTenderDocument', summary: 'Delete a tender RFQ document (only editable statuses)' })
  deleteDocument(
    @Param('id') id: string,
    @Param('documentId') documentId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.tendersService.deleteDocumentEntry(id, documentId, userId);
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
