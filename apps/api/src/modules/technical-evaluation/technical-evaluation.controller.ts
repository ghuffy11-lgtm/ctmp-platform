import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TechnicalEvaluationService } from './technical-evaluation.service';
import { EvaluateBidDto } from './dto/evaluate-bid.dto';

@ApiTags('technical-evaluation')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller()
export class TechnicalEvaluationController {
  constructor(private readonly technicalEvaluationService: TechnicalEvaluationService) {}

  @Post('tenders/:tenderId/technical-opening')
  @RequirePermissions('technical:open')
  @ApiOperation({ operationId: 'openTechnicalEnvelopes', summary: 'Open technical envelopes — only after Submission Closed' })
  openEnvelopes(@Param('tenderId') tenderId: string, @CurrentUser('id') userId: string) {
    return this.technicalEvaluationService.openEnvelopes(tenderId, userId);
  }

  @Get('tenders/:tenderId/technical-evaluations')
  @RequirePermissions('technical:evaluate')
  @ApiOperation({ operationId: 'listTechnicalEvaluations', summary: 'List technical evaluations for a tender' })
  findAll(@Param('tenderId') tenderId: string) {
    return this.technicalEvaluationService.findAll(tenderId);
  }

  @Post('bids/:bidId/technical-evaluations')
  @RequirePermissions('technical:evaluate')
  @ApiOperation({ operationId: 'submitTechnicalEvaluation', summary: 'Submit technical evaluation score' })
  evaluate(
    @Param('bidId') bidId: string,
    @Body() dto: EvaluateBidDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.technicalEvaluationService.evaluate(bidId, dto, userId);
  }

  @Post('tenders/:tenderId/finalize-technical-results')
  @RequirePermissions('technical:finalize')
  @ApiOperation({ operationId: 'finalizeTechnicalResults', summary: 'Finalize technical evaluation results' })
  finalize(@Param('tenderId') tenderId: string, @CurrentUser('id') userId: string) {
    return this.technicalEvaluationService.finalize(tenderId, userId);
  }

  @Get('tenders/:tenderId/technical-criteria')
  @RequirePermissions('technical:evaluate')
  @ApiOperation({ operationId: 'listTechnicalCriteria', summary: 'Get evaluation criteria configured for tender' })
  listCriteria(@Param('tenderId') tenderId: string) {
    return this.technicalEvaluationService.listCriteria(tenderId);
  }
}
