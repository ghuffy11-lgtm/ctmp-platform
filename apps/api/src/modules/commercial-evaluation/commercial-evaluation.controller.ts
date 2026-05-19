import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CommercialEvaluationService } from './commercial-evaluation.service';
import { EvaluateCommercialDto } from './dto/evaluate-commercial.dto';

@ApiTags('commercial-evaluation')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller()
export class CommercialEvaluationController {
  constructor(private readonly commercialEvaluationService: CommercialEvaluationService) {}

  @Get('tenders/:tenderId/commercial-comparison')
  @RequirePermissions('commercial:view')
  @ApiOperation({ operationId: 'getCommercialComparison', summary: 'Get commercial comparison — requires commercial:view permission' })
  getComparison(@Param('tenderId') tenderId: string, @CurrentUser() user: any) {
    return this.commercialEvaluationService.getComparison(tenderId, user);
  }

  @Post('bids/:bidId/commercial-evaluations')
  @RequirePermissions('commercial:evaluate')
  @ApiOperation({ operationId: 'submitCommercialEvaluation', summary: 'Submit commercial evaluation — requires commercial:evaluate permission' })
  evaluate(
    @Param('bidId') bidId: string,
    @Body() dto: EvaluateCommercialDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.commercialEvaluationService.evaluate(bidId, dto, userId);
  }
}
