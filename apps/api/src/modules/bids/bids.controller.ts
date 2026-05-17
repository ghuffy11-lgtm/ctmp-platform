import { Controller, Get, Post, Put, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { VendorJwtAuthGuard } from '../../common/guards/vendor-jwt.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { BidsService } from './bids.service';
import { UploadEnvelopeDto } from './dto/upload-envelope.dto';

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

  @UseGuards(VendorJwtAuthGuard)
  @Put('bids/:bidId/technical-envelope')
  @ApiOperation({ operationId: 'uploadTechnicalEnvelope', summary: 'Upload technical envelope documents' })
  uploadTechnical(@Param('bidId') bidId: string, @Body() dto: UploadEnvelopeDto, @CurrentUser() vendor: any) {
    return this.bidsService.uploadTechnical(bidId, dto, vendor);
  }

  @UseGuards(VendorJwtAuthGuard)
  @Put('bids/:bidId/commercial-envelope')
  @ApiOperation({ operationId: 'uploadCommercialEnvelope', summary: 'Upload commercial envelope documents' })
  uploadCommercial(@Param('bidId') bidId: string, @Body() dto: UploadEnvelopeDto, @CurrentUser() vendor: any) {
    return this.bidsService.uploadCommercial(bidId, dto, vendor);
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

  @UseGuards(JwtAuthGuard)
  @Get('bids/:bidId/documents/:documentId')
  @ApiOperation({ operationId: 'downloadBidDocument', summary: 'Download bid document — envelope state + permission checked' })
  downloadDocument(@Param('bidId') bidId: string, @Param('documentId') documentId: string, @CurrentUser() user: any) {
    return this.bidsService.downloadDocument(bidId, documentId, user);
  }
}
