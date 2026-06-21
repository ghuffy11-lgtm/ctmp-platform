import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { VendorJwtAuthGuard } from '../../common/guards/vendor-jwt.guard';
import { OptionalVendorOrUserGuard } from '../../common/guards/optional-vendor-or-user.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { NegotiationService } from './negotiation.service';
import { LaunchNegotiationDto } from './dto/launch-negotiation.dto';
import { SubmitNegotiationDto } from './dto/submit-negotiation.dto';
import { CloseNegotiationDto } from './dto/close-negotiation.dto';

// BUG-115 (2026-06-09): admin + vendor endpoints for the negotiation workflow.
// Same module hosts both surfaces; per-route guards select which JWT applies.

const MAX_NEGOTIATION_PDF_BYTES = 25 * 1024 * 1024;

@ApiTags('negotiation')
@ApiBearerAuth()
@Controller()
export class NegotiationController {
  constructor(private readonly service: NegotiationService) {}

  // ---------- Admin (procurement) ----------

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('negotiation:view')
  @Get('tenders/:tenderId/negotiation')
  @ApiOperation({ operationId: 'listNegotiationRounds', summary: 'List all negotiation rounds for a tender' })
  list(@Param('tenderId') tenderId: string) {
    return this.service.listRoundsForTender(tenderId);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('negotiation:launch')
  @Post('tenders/:tenderId/negotiation/rounds')
  @ApiOperation({
    operationId: 'launchNegotiationRound',
    summary: 'Launch a new negotiation round (closes any open prior round)',
  })
  launch(
    @Param('tenderId') tenderId: string,
    @Body() dto: LaunchNegotiationDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.launchRound(tenderId, dto, userId);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('negotiation:launch')
  @Post('tenders/:tenderId/negotiation/close')
  @ApiOperation({
    operationId: 'closeNegotiationRound',
    summary: 'Close the open negotiation round without launching another; tender state reverts to Commercial Evaluation',
  })
  close(
    @Param('tenderId') tenderId: string,
    @Body() dto: CloseNegotiationDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.closeOpenRound(tenderId, dto ?? {}, userId);
  }

  // ---------- Vendor ----------

  @UseGuards(VendorJwtAuthGuard)
  @Get('vendor/negotiation/invitations')
  @ApiOperation({
    operationId: 'listVendorNegotiationInvitations',
    summary: 'List the caller vendor user\'s open negotiation invitations',
  })
  listForVendor(@Req() req: any) {
    return this.service.listInvitationsForVendorUser(req.user?.id);
  }

  @UseGuards(VendorJwtAuthGuard)
  @Post('tenders/:tenderId/negotiation/upload-pdf')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_NEGOTIATION_PDF_BYTES } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    operationId: 'uploadNegotiationPdf',
    summary: 'Vendor uploads the revised commercial PDF; returns documentId valid for 15 minutes',
  })
  uploadPdf(
    @Param('tenderId') tenderId: string,
    @UploadedFile() file: any,
    @Req() req: any,
  ) {
    if (!file) throw new BadRequestException('File is required');
    return this.service.uploadCommercialPdf(tenderId, file, req.user?.id);
  }

  @UseGuards(VendorJwtAuthGuard)
  @Post('tenders/:tenderId/negotiation/submissions')
  @ApiOperation({
    operationId: 'submitNegotiation',
    summary: 'Vendor submits the revised BoQ + remarks against an open invitation',
  })
  submit(
    @Param('tenderId') tenderId: string,
    @Body() dto: SubmitNegotiationDto,
    @Req() req: any,
  ) {
    return this.service.submitNegotiation(tenderId, dto, req.user?.id);
  }

  // BUG-129 (2026-06-11): view + download a negotiation submission's PDF.
  // Both routes use OptionalVendorOrUserGuard so admins (with
  // comparison:commercial:view) and the owning vendor user can both read.
  // Service-layer permission check enforces the actual gate.
  @UseGuards(OptionalVendorOrUserGuard)
  @Get('tenders/:tenderId/negotiation-submissions/:submissionId/commercial-pdf/view')
  @ApiOperation({
    operationId: 'viewNegotiationPdf',
    summary: 'Stream the negotiation submission PDF inline for the in-app viewer',
  })
  async viewNegotiationPdf(
    @Param('tenderId') tenderId: string,
    @Param('submissionId') submissionId: string,
    @CurrentUser() user: any,
    @Res() res: Response,
  ) {
    const result = await this.service.getNegotiationPdf(tenderId, submissionId, user, 'view');
    res.setHeader('Content-Type', result.mimeType);
    res.setHeader('Content-Length', String(result.fileSize ?? 0));
    res.setHeader('Content-Disposition', `inline; filename="${result.filename.replace(/"/g, '')}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    result.stream.pipe(res);
  }

  @UseGuards(OptionalVendorOrUserGuard)
  @Get('tenders/:tenderId/negotiation-submissions/:submissionId/commercial-pdf')
  @ApiOperation({
    operationId: 'downloadNegotiationPdf',
    summary: 'Download the negotiation submission PDF as an attachment',
  })
  async downloadNegotiationPdf(
    @Param('tenderId') tenderId: string,
    @Param('submissionId') submissionId: string,
    @CurrentUser() user: any,
    @Res() res: Response,
  ) {
    const result = await this.service.getNegotiationPdf(tenderId, submissionId, user, 'download');
    res.setHeader('Content-Type', result.mimeType);
    res.setHeader('Content-Length', String(result.fileSize ?? 0));
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename.replace(/"/g, '')}"`);
    result.stream.pipe(res);
  }
}
