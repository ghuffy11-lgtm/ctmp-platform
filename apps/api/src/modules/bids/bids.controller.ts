import { BadRequestException, Controller, Delete, Get, Param, Post, Put, Body, Query, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import type { Response } from 'express';
import { EnvelopeType } from '@prisma/client';
import { VendorJwtAuthGuard } from '../../common/guards/vendor-jwt.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { OptionalVendorOrUserGuard } from '../../common/guards/optional-vendor-or-user.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { BidsService } from './bids.service';
import { UploadEnvelopeDto } from './dto/upload-envelope.dto';

const MAX_DOC_BYTES = 50 * 1024 * 1024; // 50 MB hard cap per file

function parseEnvelopeType(raw: string): EnvelopeType {
  const upper = raw.toUpperCase();
  if (upper !== EnvelopeType.TECHNICAL && upper !== EnvelopeType.COMMERCIAL) {
    throw new BadRequestException(`envelopeType must be TECHNICAL or COMMERCIAL`);
  }
  return upper as EnvelopeType;
}

@ApiTags('bids')
@ApiBearerAuth()
@Controller()
export class BidsController {
  constructor(private readonly bidsService: BidsService) {}

  @UseGuards(VendorJwtAuthGuard)
  @Post('tenders/:tenderId/bids/draft')
  @ApiOperation({ operationId: 'draftBid', summary: 'Create bid draft for tender' })
  draftBid(@Param('tenderId') tenderId: string, @CurrentUser() vendor: any) {
    return this.bidsService.draftBid(tenderId, vendor);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('bids:list')
  @Get('tenders/:tenderId/bids')
  @ApiOperation({ operationId: 'listTenderBids', summary: 'List bids for a tender (admin only)' })
  listForTender(
    @Param('tenderId') tenderId: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.bidsService.listForTender(
      tenderId,
      Number(page ?? 1),
      Number(pageSize ?? 100),
    );
  }

  @UseGuards(VendorJwtAuthGuard)
  @Put('bids/:bidId/technical-envelope')
  @ApiOperation({ operationId: 'uploadTechnicalEnvelope', summary: 'Attach uploaded documents to technical envelope' })
  uploadTechnical(@Param('bidId') bidId: string, @Body() dto: UploadEnvelopeDto, @CurrentUser() vendor: any) {
    return this.bidsService.uploadTechnical(bidId, dto, vendor);
  }

  @UseGuards(VendorJwtAuthGuard)
  @Put('bids/:bidId/commercial-envelope')
  @ApiOperation({ operationId: 'uploadCommercialEnvelope', summary: 'Attach uploaded documents to commercial envelope' })
  uploadCommercial(@Param('bidId') bidId: string, @Body() dto: UploadEnvelopeDto, @CurrentUser() vendor: any) {
    return this.bidsService.uploadCommercial(bidId, dto, vendor);
  }

  @UseGuards(VendorJwtAuthGuard)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_DOC_BYTES } }))
  @Post('bids/:bidId/envelopes/:envelopeType/documents')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    operationId: 'uploadBidDocument',
    summary: 'Upload a single document to a DRAFT envelope (multipart, server-side SHA-256)',
  })
  uploadDocument(
    @Param('bidId') bidId: string,
    @Param('envelopeType') envelopeType: string,
    @UploadedFile() file: any,
    @CurrentUser() vendor: any,
  ) {
    return this.bidsService.uploadDocument(bidId, parseEnvelopeType(envelopeType), file, vendor);
  }

  @UseGuards(VendorJwtAuthGuard)
  @Get('bids/:bidId/envelopes/:envelopeType/documents')
  @ApiOperation({ operationId: 'listBidEnvelopeDocuments', summary: 'List documents currently attached to an envelope' })
  listEnvelopeDocs(
    @Param('bidId') bidId: string,
    @Param('envelopeType') envelopeType: string,
    @CurrentUser() vendor: any,
  ) {
    return this.bidsService.listEnvelopeDocuments(bidId, parseEnvelopeType(envelopeType), vendor);
  }

  @UseGuards(VendorJwtAuthGuard)
  @Delete('bids/:bidId/documents/:documentId')
  @ApiOperation({ operationId: 'deleteBidDocument', summary: 'Remove a document from a DRAFT envelope' })
  deleteDocument(
    @Param('bidId') bidId: string,
    @Param('documentId') documentId: string,
    @CurrentUser() vendor: any,
  ) {
    return this.bidsService.deleteDocument(bidId, documentId, vendor);
  }

  @UseGuards(VendorJwtAuthGuard)
  @Post('bids/:bidId/submit')
  @ApiOperation({ operationId: 'submitBid', summary: 'Submit bid — immutable after this point' })
  submit(@Param('bidId') bidId: string, @CurrentUser() vendor: any) {
    return this.bidsService.submit(bidId, vendor);
  }

  @UseGuards(VendorJwtAuthGuard)
  @Get('bids/:bidId/receipt')
  @ApiOperation({ operationId: 'getBidReceipt', summary: 'Get submission receipt' })
  getReceipt(@Param('bidId') bidId: string, @CurrentUser() vendor: any) {
    return this.bidsService.getReceipt(bidId, vendor);
  }

  @UseGuards(OptionalVendorOrUserGuard)
  @Get('bids/:bidId/documents/:documentId')
  @ApiOperation({ operationId: 'downloadBidDocument', summary: 'Download bid document — envelope state + permission checked' })
  async downloadDocument(
    @Param('bidId') bidId: string,
    @Param('documentId') documentId: string,
    @CurrentUser() user: any,
    @Res() res: Response,
  ) {
    const result = await this.bidsService.downloadDocument(bidId, documentId, user);
    res.setHeader('Content-Type', result.mimeType);
    res.setHeader('Content-Length', String(result.fileSize ?? 0));
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename.replace(/"/g, '')}"`);
    result.stream.pipe(res);
  }
}
