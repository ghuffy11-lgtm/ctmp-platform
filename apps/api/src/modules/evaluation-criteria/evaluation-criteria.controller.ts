import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { EvaluationCriteriaService } from './evaluation-criteria.service';
import { CreateLibraryEntryDto, UpdateLibraryEntryDto } from './dto/library-entry.dto';
import { ReplaceTenderCriteriaDto } from './dto/replace-tender-criteria.dto';

@ApiTags('evaluation-criteria')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller()
export class EvaluationCriteriaController {
  constructor(private readonly service: EvaluationCriteriaService) {}

  // --- Library CRUD (Phase F, BUG-043) ---
  @Get('evaluation-criteria/library')
  @RequirePermissions('criteria:library:manage')
  @ApiOperation({ operationId: 'listCriteriaLibrary', summary: 'List evaluation-criteria library entries' })
  listLibrary(@Query('includeInactive') includeInactive?: string) {
    return this.service.listLibrary(includeInactive === 'true');
  }

  @Post('evaluation-criteria/library')
  @RequirePermissions('criteria:library:manage')
  @ApiOperation({ operationId: 'createCriteriaLibraryEntry', summary: 'Create library entry' })
  create(@Body() dto: CreateLibraryEntryDto, @CurrentUser('id') userId: string) {
    return this.service.createLibraryEntry(dto, userId);
  }

  @Put('evaluation-criteria/library/:id')
  @RequirePermissions('criteria:library:manage')
  @ApiOperation({ operationId: 'updateCriteriaLibraryEntry', summary: 'Update library entry' })
  update(@Param('id') id: string, @Body() dto: UpdateLibraryEntryDto, @CurrentUser('id') userId: string) {
    return this.service.updateLibraryEntry(id, dto, userId);
  }

  @Delete('evaluation-criteria/library/:id')
  @RequirePermissions('criteria:library:manage')
  @ApiOperation({ operationId: 'deactivateCriteriaLibraryEntry', summary: 'Soft-delete a library entry (is_active=false)' })
  deactivate(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.deactivateLibraryEntry(id, userId);
  }

  // --- Per-tender criteria (Phase F, BUG-044) ---
  @Get('tenders/:tenderId/criteria')
  @RequirePermissions('tender:view')
  @ApiOperation({ operationId: 'listTenderCriteria', summary: 'List per-tender evaluation criteria' })
  listTenderCriteria(@Param('tenderId') tenderId: string) {
    return this.service.listTenderCriteria(tenderId);
  }

  @Put('tenders/:tenderId/criteria')
  @RequirePermissions('criteria:tender:edit')
  @ApiOperation({
    operationId: 'replaceTenderCriteria',
    summary: 'Replace ALL per-tender criteria atomically. Weights must sum to 100.',
  })
  replaceTenderCriteria(
    @Param('tenderId') tenderId: string,
    @Body() dto: ReplaceTenderCriteriaDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.replaceTenderCriteria(tenderId, dto, userId);
  }
}
