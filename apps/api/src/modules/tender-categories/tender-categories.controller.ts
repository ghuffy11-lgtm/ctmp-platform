import {
  Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TenderCategoriesService } from './tender-categories.service';
import { CreateTenderCategoryDto, UpdateTenderCategoryDto } from './dto/tender-category.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

// Migration 054 (2026-08-13). Mirrors the departments module: the list is
// readable by any signed-in user (the tender create/edit dropdowns need it),
// while managing the taxonomy needs `system:configure` — the same permission
// that already guards departments.
@ApiTags('tender-categories')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('tender-categories')
export class TenderCategoriesController {
  constructor(private readonly categories: TenderCategoriesService) {}

  @Get()
  @ApiOperation({ operationId: 'listTenderCategories', summary: 'List tender categories' })
  findAll(@Query('includeInactive') includeInactive?: string) {
    return this.categories.findAll(includeInactive === 'true');
  }

  @Post()
  @RequirePermissions('system:configure')
  @ApiOperation({ operationId: 'createTenderCategory', summary: 'Create a tender category' })
  create(@Body() dto: CreateTenderCategoryDto, @CurrentUser('id') userId: string) {
    return this.categories.create(dto, userId);
  }

  @Patch(':id')
  @RequirePermissions('system:configure')
  @ApiOperation({
    operationId: 'updateTenderCategory',
    summary: 'Update a tender category (a rename also moves the tenders using it)',
  })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTenderCategoryDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.categories.update(id, dto, userId);
  }

  @Delete(':id')
  @HttpCode(200)
  @RequirePermissions('system:configure')
  @ApiOperation({
    operationId: 'deactivateTenderCategory',
    summary: 'Deactivate a category — never deleted, because tenders reference it by name',
  })
  deactivate(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.categories.deactivate(id, userId);
  }
}
