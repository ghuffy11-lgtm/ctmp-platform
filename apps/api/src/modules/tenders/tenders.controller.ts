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
import { InviteVendorDto } from './dto/invite-vendor.dto';
import { RevertTenderDto } from './dto/revert-tender.dto';
import { SuspendTenderDto } from './dto/suspend-tender.dto';
import { ResumeTenderDto } from './dto/resume-tender.dto';
import { CancelTenderDto } from './dto/cancel-tender.dto';
import { ExtendSubmissionDto } from './dto/extend-submission.dto';

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

  // WALK-016/017 / BUG-067: vendor portal needs to view + download RFQ docs
  // on tenders they can already see (per BUG-015 visibility rules). Switched
  // from JwtAuthGuard + tender:view to OptionalVendorOrUserGuard; service
  // does role-aware access control (internal users still need tender:view via
  // the dept-scoped findOne; vendors get visibility-rule check).
  @Public()
  @UseGuards(OptionalVendorOrUserGuard)
  @Get(':id/documents/:documentId')
  @ApiOperation({ operationId: 'downloadTenderDocument', summary: 'Download tender document (admin or vendor on visible tender)' })
  async downloadDocument(
    @Param('id') id: string,
    @Param('documentId') documentId: string,
    @CurrentUser() user: any,
    @Res() res: Response,
  ) {
    const result = await this.tendersService.streamDocument(id, documentId, user);
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

  // BUG-015: invitation workflow endpoints.
  @Get(':id/invited-vendors')
  @RequirePermissions('tender:view')
  @ApiOperation({ operationId: 'listInvitedVendors', summary: 'List vendors invited to an INVITATION_ONLY tender' })
  listInvitedVendors(@Param('id') id: string) {
    return this.tendersService.listInvitedVendors(id);
  }

  @Post(':id/invited-vendors')
  @RequirePermissions('tender:edit')
  @ApiOperation({ operationId: 'inviteVendor', summary: 'Invite a vendor to bid on an INVITATION_ONLY tender' })
  inviteVendor(
    @Param('id') id: string,
    @Body() dto: InviteVendorDto,
    @CurrentUser('id') userId: string,
  ) {
    // BUG-120 (2026-06-10): pass extra ad-hoc emails through; service
    // normalises + dedupes before persisting.
    return this.tendersService.inviteVendor(id, dto.vendorId, userId, dto.extraEmails ?? []);
  }

  // BUG-120 (2026-06-10): PATCH endpoint to edit the ad-hoc extras for an
  // already-invited vendor without removing them. (Removal isn't allowed
  // post-publish per BUG-015.)
  @Patch(':id/invited-vendors/:vendorId/extra-emails')
  @RequirePermissions('tender:edit')
  @ApiOperation({ operationId: 'updateInvitationExtras', summary: 'Update ad-hoc extra notification emails for an invited vendor' })
  updateExtras(
    @Param('id') id: string,
    @Param('vendorId') vendorId: string,
    @Body() body: { extraEmails: string[] },
    @CurrentUser('id') userId: string,
  ) {
    return this.tendersService.updateInvitationExtras(id, vendorId, body?.extraEmails ?? [], userId);
  }

  // BUG-123 (2026-06-11): manual resend of the invitation as a reminder.
  // Uses TENDER_INVITATION_REMINDER template + force=true so notified_at
  // doesn't block. Only valid for Published / Clarification Period tenders.
  @Post(':id/invited-vendors/:vendorId/resend-invitation')
  @RequirePermissions('tender:edit')
  @ApiOperation({ operationId: 'resendInvitation', summary: 'Send a reminder invitation email to an already-invited vendor' })
  resendInvitation(
    @Param('id') id: string,
    @Param('vendorId') vendorId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.tendersService.resendInvitation(id, vendorId, userId);
  }

  @Delete(':id/invited-vendors/:vendorId')
  @RequirePermissions('tender:edit')
  @ApiOperation({ operationId: 'uninviteVendor', summary: 'Remove a vendor invitation (only allowed before Publish)' })
  uninviteVendor(
    @Param('id') id: string,
    @Param('vendorId') vendorId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.tendersService.uninviteVendor(id, vendorId, userId);
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
  @ApiOperation({ operationId: 'cancelTender', summary: 'Cancel tender (any state); cascades close negotiation rounds + lock envelopes' })
  cancel(
    @Param('id') id: string,
    @Body() dto: CancelTenderDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.tendersService.cancel(id, dto.reason, userId);
  }

  // BUG-132 (2026-06-14): Hold (Suspend) — pause the tender; remembers the
  // prior state for Resume. Single permission tender:suspend covers both.
  @Post(':id/suspend')
  @RequirePermissions('tender:suspend')
  @ApiOperation({ operationId: 'suspendTender', summary: 'Put the tender on Hold; Resume returns it to the prior state' })
  suspend(
    @Param('id') id: string,
    @Body() dto: SuspendTenderDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.tendersService.suspend(id, dto, userId);
  }

  @Post(':id/resume')
  @RequirePermissions('tender:suspend')
  @ApiOperation({ operationId: 'resumeTender', summary: 'Resume a held tender to its previous status' })
  resume(
    @Param('id') id: string,
    @Body() dto: ResumeTenderDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.tendersService.resume(id, dto, userId);
  }

  @Post(':id/close-submissions')
  @RequirePermissions('tender:close_submission')
  @ApiOperation({ operationId: 'closeSubmissions', summary: 'Close bid submission window' })
  closeSubmissions(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.tendersService.closeSubmissions(id, userId);
  }

  // BUG-141 (2026-06-19): re-open a Submission Closed tender with a new
  // future deadline. Same authority as closing — reuse tender:close_submission.
  @Post(':id/extend-submission')
  @RequirePermissions('tender:close_submission')
  @ApiOperation({
    operationId: 'extendSubmission',
    summary: 'Re-open a Submission Closed tender with a new submission deadline',
  })
  extendSubmission(
    @Param('id') id: string,
    @Body() dto: ExtendSubmissionDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.tendersService.extendSubmission(id, dto, userId);
  }

  // WALK-052: Final tender lifecycle close (Awarded → Tender Closed).
  @Post(':id/close-tender')
  @RequirePermissions('tender:close')
  @ApiOperation({ operationId: 'closeTender', summary: 'Close awarded tender (final lifecycle step)' })
  closeTender(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.tendersService.closeTender(id, userId);
  }

  // BUG-125 (2026-06-11): reverse of close. Tender Closed → Awarded. Requires
  // a reason ≥20 chars; HIGH-risk audit. Same perm as close.
  @Post(':id/reopen')
  @RequirePermissions('tender:close')
  @ApiOperation({ operationId: 'reopenTender', summary: 'Re-open a Tender Closed tender back to Awarded' })
  reopenTender(
    @Param('id') id: string,
    @Body() body: { reason: string },
    @CurrentUser('id') userId: string,
  ) {
    return this.tendersService.reopenTender(id, body, userId);
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

  // BUG-112 (2026-06-07) Piece 1: revert Published → earlier editable state.
  @Post(':id/revert')
  @RequirePermissions('tender:revert')
  @ApiOperation({ operationId: 'revertTender', summary: 'Revert a Published tender back to an editable state (BUG-112)' })
  revertTender(
    @Param('id') id: string,
    @Body() dto: RevertTenderDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.tendersService.revert(id, dto, userId);
  }
}

// BUG-110 (2026-06-05): public read of currently-open tenders for the
// anonymous vendor portal landing page. Separate controller class so it
// carries NO auth guards — anonymous callers OK. Service-level filtering
// restricts results to status ∈ {Published, Clarification Period} +
// visibility = PUBLIC (no invitation-only — anonymous can't be invited).
@ApiTags('public')
@Controller()
export class PublicTendersController {
  constructor(private readonly tendersService: TendersService) {}

  @Public()
  @Get('public/tenders')
  @ApiOperation({
    operationId: 'listPublicTenders',
    summary: 'Anonymous list of currently-open public tenders for the vendor portal landing page',
  })
  listPublic(@Query() query: ListTendersDto) {
    return this.tendersService.findAllPublic(query);
  }
}
