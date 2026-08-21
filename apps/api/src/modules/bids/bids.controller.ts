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
import { CommercialTermsDto } from './dto/commercial-terms.dto';

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
  @RequirePermissions('bid:view_metadata')
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

  // Migration 052 (2026-08-06): bid-level commercial terms. Separate from the
  // BOQ save so they are also enterable on tenders with no BOQ template.
  @UseGuards(VendorJwtAuthGuard)
  @Get('bids/:bidId/commercial-terms')
  @ApiOperation({ operationId: 'getBidCommercialTerms', summary: 'Read the bid-level commercial terms' })
  getCommercialTerms(@Param('bidId') bidId: string, @CurrentUser() vendor: any) {
    return this.bidsService.getCommercialTerms(bidId, vendor);
  }

  @UseGuards(VendorJwtAuthGuard)
  @Put('bids/:bidId/commercial-terms')
  @ApiOperation({
    operationId: 'updateBidCommercialTerms',
    summary: 'Replace the bid-level commercial terms (all fields optional, DRAFT bids only)',
  })
  updateCommercialTerms(
    @Param('bidId') bidId: string,
    @Body() dto: CommercialTermsDto,
    @CurrentUser() vendor: any,
  ) {
    return this.bidsService.updateCommercialTerms(bidId, dto, vendor);
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

  // BUG-022 / retest D2: list must serve both vendors (own DRAFT envelope) and
  // admin users (envelope must be OPENED for technical, OPENED + commercial:view
  // for commercial). VendorJwtAuthGuard alone returned 401 to admins.
  @UseGuards(OptionalVendorOrUserGuard)
  @Get('bids/:bidId/envelopes/:envelopeType/documents')
  @ApiOperation({ operationId: 'listBidEnvelopeDocuments', summary: 'List documents currently attached to an envelope' })
  listEnvelopeDocs(
    @Param('bidId') bidId: string,
    @Param('envelopeType') envelopeType: string,
    @CurrentUser() user: any,
  ) {
    return this.bidsService.listEnvelopeDocuments(bidId, parseEnvelopeType(envelopeType), user);
  }

  // BUG-037 Phase A. Stream a bid PDF inline for the modal viewer. Service
  // writes the audit row BEFORE the stream begins (master plan rule).
  @UseGuards(OptionalVendorOrUserGuard)
  @Get('bids/:bidId/envelopes/:envelopeType/documents/:documentId/view')
  @ApiOperation({ operationId: 'viewBidDocument', summary: 'Stream a bid document inline for the in-app viewer' })
  async viewBidDocument(
    @Param('bidId') bidId: string,
    @Param('envelopeType') envelopeType: string,
    @Param('documentId') documentId: string,
    @CurrentUser() user: any,
    @Res() res: Response,
  ) {
    parseEnvelopeType(envelopeType); // validate path segment
    const result = await this.bidsService.viewBidDocument(bidId, documentId, user);
    res.setHeader('Content-Type', result.mimeType || 'application/pdf');
    res.setHeader('Content-Length', String(result.fileSize ?? 0));
    res.setHeader('Content-Disposition', `inline; filename="${result.filename.replace(/"/g, '')}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    result.stream.pipe(res);
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

  // ----------------------------------------------------------------
  // BUG-137 (2026-06-19): bid supporting documents
  // ----------------------------------------------------------------

  @UseGuards(OptionalVendorOrUserGuard)
  @Get('bids/:bidId/supporting-documents')
  @ApiOperation({ operationId: 'listBidSupportingDocuments', summary: 'List supporting documents on a bid' })
  listSupportingDocuments(@Param('bidId') bidId: string, @CurrentUser() user: any) {
    return this.bidsService.listSupportingDocuments(bidId, user);
  }

  @UseGuards(VendorJwtAuthGuard)
  @Post('bids/:bidId/supporting-documents')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_DOC_BYTES } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ operationId: 'uploadBidSupportingDocument', summary: 'Upload a supporting document PDF (DRAFT bids only)' })
  uploadSupportingDocument(
    @Param('bidId') bidId: string,
    @UploadedFile() file: any,
    @CurrentUser() vendor: any,
  ) {
    return this.bidsService.uploadSupportingDocument(bidId, file, vendor);
  }

  @UseGuards(VendorJwtAuthGuard)
  @Delete('bids/:bidId/supporting-documents/:documentId')
  @ApiOperation({ operationId: 'deleteBidSupportingDocument', summary: 'Remove a supporting document (DRAFT bids only)' })
  async deleteSupportingDocument(
    @Param('bidId') bidId: string,
    @Param('documentId') documentId: string,
    @CurrentUser() vendor: any,
  ) {
    await this.bidsService.deleteSupportingDocument(bidId, documentId, vendor);
    return { ok: true };
  }

  @UseGuards(OptionalVendorOrUserGuard)
  @Get('bids/:bidId/supporting-documents/:documentId/view')
  @ApiOperation({ operationId: 'viewBidSupportingDocument', summary: 'Stream a supporting document PDF inline' })
  async viewSupportingDocument(
    @Param('bidId') bidId: string,
    @Param('documentId') documentId: string,
    @CurrentUser() user: any,
    @Res() res: Response,
  ) {
    const result = await this.bidsService.streamSupportingDocument(bidId, documentId, user, 'view');
    res.setHeader('Content-Type', result.mimeType);
    res.setHeader('Content-Length', String(result.fileSize ?? 0));
    res.setHeader('Content-Disposition', `inline; filename="${result.filename.replace(/"/g, '')}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    result.stream.pipe(res);
  }

  @UseGuards(OptionalVendorOrUserGuard)
  @Get('bids/:bidId/supporting-documents/:documentId')
  @ApiOperation({ operationId: 'downloadBidSupportingDocument', summary: 'Download a supporting document PDF as an attachment' })
  async downloadSupportingDocument(
    @Param('bidId') bidId: string,
    @Param('documentId') documentId: string,
    @CurrentUser() user: any,
    @Res() res: Response,
  ) {
    const result = await this.bidsService.streamSupportingDocument(bidId, documentId, user, 'download');
    res.setHeader('Content-Type', result.mimeType);
    res.setHeader('Content-Length', String(result.fileSize ?? 0));
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename.replace(/"/g, '')}"`);
    result.stream.pipe(res);
  }
}
