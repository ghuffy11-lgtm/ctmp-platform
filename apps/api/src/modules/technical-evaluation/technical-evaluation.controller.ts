import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions, RequireAnyPermission } from '../../common/decorators/permissions.decorator';
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
  // BUG-111 (2026-06-06): list + submit are open to either evaluator role.
  @RequireAnyPermission('technical:evaluate', 'technical:evaluate:procurement')
  @ApiOperation({ operationId: 'listTechnicalEvaluations', summary: 'List technical evaluations for a tender' })
  findAll(@Param('tenderId') tenderId: string) {
    return this.technicalEvaluationService.findAll(tenderId);
  }

  @Post('bids/:bidId/technical-evaluations')
  @RequireAnyPermission('technical:evaluate', 'technical:evaluate:procurement')
  @ApiOperation({ operationId: 'submitTechnicalEvaluation', summary: 'Submit technical evaluation score (per-criterion role check inside service)' })
  evaluate(
    @Param('bidId') bidId: string,
    @Body() dto: EvaluateBidDto,
    @CurrentUser() user: any,
  ) {
    return this.technicalEvaluationService.evaluate(bidId, dto, user);
  }

  @Post('tenders/:tenderId/finalize-technical-results')
  @RequirePermissions('technical:finalize')
  @ApiOperation({ operationId: 'finalizeTechnicalResults', summary: 'Finalize technical evaluation results' })
  finalize(@Param('tenderId') tenderId: string, @CurrentUser('id') userId: string) {
    return this.technicalEvaluationService.finalize(tenderId, userId);
  }

  @Get('tenders/:tenderId/technical-criteria')
  @RequireAnyPermission('technical:evaluate', 'technical:evaluate:procurement')
  @ApiOperation({ operationId: 'listTechnicalCriteria', summary: 'Get evaluation criteria (caller filters client-side by their role)' })
  listCriteria(@Param('tenderId') tenderId: string) {
    return this.technicalEvaluationService.listCriteria(tenderId);
  }
}
