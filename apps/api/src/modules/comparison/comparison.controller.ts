import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { ComparisonService } from './comparison.service';

@ApiTags('comparison')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('tenders/:tenderId/comparison')
export class ComparisonController {
  constructor(private readonly comparisonService: ComparisonService) {}

  // Phase B (BUG-036). Read-only consolidated view of all vendor technical
  // evaluations for a tender.
  @Get('technical')
  @RequirePermissions('comparison:technical:view')
  @ApiOperation({
    operationId: 'getTechnicalComparison',
    summary: 'Aggregate technical evaluations per vendor for a tender (consensus + per-evaluator)',
  })
  technical(@Param('tenderId') tenderId: string) {
    return this.comparisonService.technicalComparison(tenderId);
  }
}
