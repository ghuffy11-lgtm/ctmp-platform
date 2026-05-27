import { BadRequestException, Body, Controller, Get, Param, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AwardService } from './award.service';
import { AwardRecommendationDto } from './dto/award-recommendation.dto';
import { AwardApprovalDto } from './dto/award-approval.dto';
import { ConfirmAwardDto } from './dto/confirm-award.dto';
import { AmendAwardDto } from './dto/amend-award.dto';

const MAX_JUSTIFICATION_BYTES = 25 * 1024 * 1024;

@ApiTags('award')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('tenders/:tenderId')
export class AwardController {
  constructor(private readonly awardService: AwardService) {}

  // --- Legacy 2-step flow kept for backwards compat with anything still wired
  // to the old endpoints. Phase D's single-Confirm flow below supersedes both
  // for new callers. The old POST `award-recommendation` is what the Phase C
  // Recommend button currently hits as a stop-gap.
  @Post('award-recommendation')
  @RequirePermissions('award:recommend')
  @ApiOperation({ operationId: 'submitAwardRecommendation', summary: 'LEGACY: 2-step award recommendation (Phase C stop-gap)' })
  recommend(
    @Param('tenderId') tenderId: string,
    @Body() dto: AwardRecommendationDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.awardService.recommend(tenderId, dto, userId);
  }

  @Post('award-approval')
  @RequirePermissions('award:approve')
  @ApiOperation({ operationId: 'approveAward', summary: 'LEGACY: approve award recommendation' })
  approve(
    @Param('tenderId') tenderId: string,
    @Body() dto: AwardApprovalDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.awardService.approve(tenderId, dto, userId);
  }

  @Post('award')
  @RequirePermissions('award:finalize')
  @ApiOperation({ operationId: 'issueAward', summary: 'LEGACY: issue formal award' })
  issue(@Param('tenderId') tenderId: string, @CurrentUser('id') userId: string) {
    return this.awardService.issue(tenderId, userId);
  }

  // --- Phase D — single-Confirm flow (master plan F1-F7, G4). ---

  // Read-only quorum snapshot for the page header chip.
  @Get('quorum')
  @RequirePermissions('comparison:commercial:view')
  @ApiOperation({ operationId: 'getQuorum', summary: 'Quorum + Chair-present check for the latest committee session' })
  quorum(@Param('tenderId') tenderId: string) {
    return this.awardService.quorum(tenderId);
  }

  // Step 1 of override path: upload the justification PDF, get back a documentId
  // to reference in the Confirm/Amend body. Lowest-PASS confirms skip this.
  @Post('award/justification-document')
  @RequirePermissions('comparison:commercial:confirm')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_JUSTIFICATION_BYTES } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    operationId: 'uploadAwardJustification',
    summary: 'Upload an award-justification PDF; returns a documentId valid for 15 minutes',
  })
  uploadJustification(
    @Param('tenderId') tenderId: string,
    @UploadedFile() file: any,
    @CurrentUser('id') userId: string,
  ) {
    return this.awardService.uploadJustification(tenderId, file, userId);
  }

  // Final Confirm — single click. Transitions tender → Awarded.
  @Post('award/confirm')
  @RequirePermissions('comparison:commercial:confirm')
  @ApiOperation({ operationId: 'confirmAward', summary: 'Final Confirm; transitions tender to Awarded' })
  confirm(
    @Param('tenderId') tenderId: string,
    @Body() dto: ConfirmAwardDto,
    @CurrentUser('id') userId: string,
  ) {
    if (!dto?.bidId) throw new BadRequestException('bidId is required');
    return this.awardService.confirmAward(tenderId, dto, userId);
  }

  // Amend a confirmed award — creates a new Award row that supersedes the
  // active one (master plan F7). Always requires text + PDF.
  @Post('award/amend')
  @RequirePermissions('award:amend')
  @ApiOperation({ operationId: 'amendAward', summary: 'Amend a confirmed award; supersedes the active record' })
  amend(
    @Param('tenderId') tenderId: string,
    @Body() dto: AmendAwardDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.awardService.amendAward(tenderId, dto, userId);
  }

  // History view — all awards for a tender (active + superseded).
  @Get('awards')
  @RequirePermissions('comparison:commercial:view')
  @ApiOperation({ operationId: 'listAwards', summary: 'List the full award history for a tender' })
  list(@Param('tenderId') tenderId: string) {
    return this.awardService.listAwards(tenderId);
  }
}
