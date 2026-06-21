import { Controller, Get, Post, Patch, Body, Param, Query, Res, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { OptionalVendorOrUserGuard } from '../../common/guards/optional-vendor-or-user.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { VendorsService } from './vendors.service';
import { UpdateVendorDto } from './dto/update-vendor.dto';

@ApiTags('vendors')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('vendors')
export class VendorsController {
  constructor(private readonly vendorsService: VendorsService) {}

  @Get()
  @RequirePermissions('vendor:view')
  @ApiOperation({ operationId: 'listVendors', summary: 'List vendors with optional status filter' })
  findAll(
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.vendorsService.findAll({
      status,
      page: Number(page ?? 1),
      pageSize: Number(pageSize ?? 50),
    });
  }

  @Get(':id')
  @RequirePermissions('vendor:view')
  @ApiOperation({ operationId: 'getVendor', summary: 'Get vendor profile' })
  findOne(@Param('id') id: string) {
    return this.vendorsService.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions('vendor:edit_profile')
  @ApiOperation({ operationId: 'updateVendor', summary: 'Update vendor profile' })
  update(@Param('id') id: string, @Body() dto: UpdateVendorDto) {
    return this.vendorsService.update(id, dto);
  }

  @Post(':id/approve')
  @RequirePermissions('vendor:approve')
  @ApiOperation({ operationId: 'approveVendor', summary: 'Approve vendor registration' })
  approve(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.vendorsService.approve(id, userId);
  }

  @Post(':id/reject')
  @RequirePermissions('vendor:reject')
  @ApiOperation({ operationId: 'rejectVendor', summary: 'Reject vendor registration' })
  reject(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.vendorsService.reject(id, reason, userId);
  }

  @Post(':id/suspend')
  @RequirePermissions('vendor:suspend')
  @ApiOperation({ operationId: 'suspendVendor', summary: 'Suspend an approved vendor' })
  suspend(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.vendorsService.suspend(id, reason, userId);
  }

  // BUG-137 (2026-06-19): registration documents — list, view, download.
  // Admin (vendor:view) sees any vendor's docs; the vendor's own user sees
  // only their own. OptionalVendorOrUserGuard handles both JWT shapes.
  @Get(':id/documents')
  @RequirePermissions('vendor:view')
  @ApiOperation({ operationId: 'listVendorDocuments', summary: "List a vendor's registration documents" })
  listDocuments(@Param('id') id: string) {
    return this.vendorsService.listDocuments(id);
  }

  @UseGuards(OptionalVendorOrUserGuard)
  @Get(':id/documents/:documentId/view')
  @ApiOperation({ operationId: 'viewVendorDocument', summary: 'Stream a vendor registration document PDF inline' })
  async viewDocument(
    @Param('id') id: string,
    @Param('documentId') documentId: string,
    @CurrentUser() user: any,
    @Res() res: Response,
  ) {
    const result = await this.vendorsService.getDocument(id, documentId, user, 'view');
    res.setHeader('Content-Type', result.mimeType);
    res.setHeader('Content-Length', String(result.fileSize ?? 0));
    res.setHeader('Content-Disposition', `inline; filename="${result.filename.replace(/"/g, '')}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    result.stream.pipe(res);
  }

  @UseGuards(OptionalVendorOrUserGuard)
  @Get(':id/documents/:documentId')
  @ApiOperation({ operationId: 'downloadVendorDocument', summary: 'Download a vendor registration document PDF as an attachment' })
  async downloadDocument(
    @Param('id') id: string,
    @Param('documentId') documentId: string,
    @CurrentUser() user: any,
    @Res() res: Response,
  ) {
    const result = await this.vendorsService.getDocument(id, documentId, user, 'download');
    res.setHeader('Content-Type', result.mimeType);
    res.setHeader('Content-Length', String(result.fileSize ?? 0));
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename.replace(/"/g, '')}"`);
    result.stream.pipe(res);
  }
}
