import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { VendorJwtAuthGuard } from '../../common/guards/vendor-jwt.guard';
import { OptionalVendorOrUserGuard } from '../../common/guards/optional-vendor-or-user.guard';
import { Public } from '../../common/decorators/public.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { BoqService } from './boq.service';
import { ReplaceTenderBoqDto } from './dto/replace-tender-boq.dto';
import { ReplaceBidBoqDto } from './dto/replace-bid-boq.dto';

@ApiTags('boq')
@ApiBearerAuth()
@Controller()
export class BoqController {
  constructor(private readonly service: BoqService) {}

  // -----------------------------------------------------------------------
  // Tender BOQ template — admin reads + writes, vendor reads (to render the
  // bid form). Both auth flavours go through OptionalVendorOrUserGuard.
  // -----------------------------------------------------------------------
  @Public()
  @UseGuards(OptionalVendorOrUserGuard)
  @Get('tenders/:id/boq')
  @ApiOperation({ operationId: 'getTenderBoq', summary: 'List BOQ template rows for a tender' })
  listTenderBoq(@Param('id') id: string) {
    return this.service.listTenderBoq(id);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('tender:edit')
  @Put('tenders/:id/boq')
  @ApiOperation({
    operationId: 'replaceTenderBoq',
    summary: 'Replace ALL BOQ template rows atomically. Locked once tender leaves Draft/Internal Review/Approved.',
  })
  replaceTenderBoq(
    @Param('id') id: string,
    @Body() dto: ReplaceTenderBoqDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.replaceTenderBoq(id, dto, userId);
  }

  // -----------------------------------------------------------------------
  // Per-bid entries — vendor writes (own bid in DRAFT). Admin reads via the
  // commercial-comparison aggregator instead; no admin write path.
  // -----------------------------------------------------------------------
  @UseGuards(OptionalVendorOrUserGuard)
  @Get('bids/:bidId/boq-items')
  @ApiOperation({ operationId: 'getBidBoqItems', summary: 'List bid BOQ entries' })
  listBidBoq(@Param('bidId') bidId: string, @CurrentUser() user: any) {
    return this.service.listBidBoq(bidId, user);
  }

  @UseGuards(VendorJwtAuthGuard)
  @Put('bids/:bidId/boq-items')
  @ApiOperation({
    operationId: 'replaceBidBoqItems',
    summary: 'Replace ALL bid BOQ entries atomically. Vendor-only, pre-submit.',
  })
  replaceBidBoq(
    @Param('bidId') bidId: string,
    @Body() dto: ReplaceBidBoqDto,
    @CurrentUser() vendor: any,
  ) {
    return this.service.replaceBidBoq(bidId, dto, vendor);
  }
}
