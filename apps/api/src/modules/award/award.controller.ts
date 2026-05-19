import { Controller, Post, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AwardService } from './award.service';
import { AwardRecommendationDto } from './dto/award-recommendation.dto';
import { AwardApprovalDto } from './dto/award-approval.dto';

@ApiTags('award')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('tenders/:tenderId')
export class AwardController {
  constructor(private readonly awardService: AwardService) {}

  @Post('award-recommendation')
  @RequirePermissions('award:recommend')
  @ApiOperation({ operationId: 'submitAwardRecommendation', summary: 'Submit award recommendation' })
  recommend(
    @Param('tenderId') tenderId: string,
    @Body() dto: AwardRecommendationDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.awardService.recommend(tenderId, dto, userId);
  }

  @Post('award-approval')
  @RequirePermissions('award:approve')
  @ApiOperation({ operationId: 'approveAward', summary: 'Approve or reject award recommendation' })
  approve(
    @Param('tenderId') tenderId: string,
    @Body() dto: AwardApprovalDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.awardService.approve(tenderId, dto, userId);
  }

  @Post('award')
  @RequirePermissions('award:finalize')
  @ApiOperation({ operationId: 'issueAward', summary: 'Issue formal award' })
  issue(@Param('tenderId') tenderId: string, @CurrentUser('id') userId: string) {
    return this.awardService.issue(tenderId, userId);
  }
}
