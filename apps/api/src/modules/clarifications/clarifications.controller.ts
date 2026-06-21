import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { OptionalVendorOrUserGuard } from '../../common/guards/optional-vendor-or-user.guard';
import { VendorJwtAuthGuard } from '../../common/guards/vendor-jwt.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ClarificationsService } from './clarifications.service';
import { CreateClarificationDto } from './dto/create-clarification.dto';
import { ReplyClarificationDto } from './dto/reply-clarification.dto';

@ApiTags('clarifications')
@ApiBearerAuth()
@Controller()
export class ClarificationsController {
  constructor(private readonly clarificationsService: ClarificationsService) {}

  @Get('tenders/:tenderId/clarifications')
  @Public()
  @UseGuards(OptionalVendorOrUserGuard)
  @ApiOperation({ operationId: 'listClarifications', summary: 'List clarifications for a tender' })
  findAll(@Param('tenderId') tenderId: string, @CurrentUser() user: any) {
    return this.clarificationsService.findAll(tenderId, user);
  }

  // BUG-146 (2026-06-21): vendor-only — list tenders the calling vendor has
  // clarification threads on, regardless of tender lifecycle state. Lets the
  // vendor portal picker surface tenders past Clarification Period
  // (Technical Evaluation, Commercial Evaluation, etc.) without widening
  // the general tender-visibility filter.
  @Get('vendor/clarification-tenders')
  @UseGuards(VendorJwtAuthGuard)
  @ApiOperation({ operationId: 'listVendorClarificationTenders', summary: 'List tenders the calling vendor has clarification threads on' })
  listVendorTenders(@CurrentUser() user: any) {
    return this.clarificationsService.myTendersWithClarifications(user);
  }

  @Post('tenders/:tenderId/clarifications')
  @Public()
  @UseGuards(OptionalVendorOrUserGuard)
  @ApiOperation({ operationId: 'createClarification', summary: 'Submit clarification question' })
  create(
    @Param('tenderId') tenderId: string,
    @Body() dto: CreateClarificationDto,
    @CurrentUser() user: any,
  ) {
    return this.clarificationsService.create(tenderId, dto, user);
  }

  // BUG-147 (2026-06-21): reply now accepts BOTH admin and vendor callers.
  // PermissionsGuard removed because vendor tokens carry no `permissions[]`
  // claim and would always fail it. Authorisation is enforced in the
  // service layer instead:
  //   * admin caller → must hold `clarification:reply` (checked in service)
  //   * vendor caller → must own the thread (checked in service)
  @Post('clarifications/:id/reply')
  @Public()
  @UseGuards(OptionalVendorOrUserGuard)
  @ApiOperation({ operationId: 'replyClarification', summary: 'Reply to clarification (admin or vendor)' })
  reply(
    @Param('id') id: string,
    @Body() dto: ReplyClarificationDto,
    @CurrentUser() user: any,
  ) {
    return this.clarificationsService.reply(id, dto, user);
  }
}
