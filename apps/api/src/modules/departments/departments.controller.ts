import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, UseGuards, HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { DepartmentsService } from './departments.service';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('departments')
@ApiBearerAuth()
@Controller('departments')
export class DepartmentsController {
  constructor(private readonly departments: DepartmentsService) {}

  @Get()
  @Public()
  @ApiOperation({ operationId: 'listDepartments', summary: 'List active departments (or all)' })
  findAll(
    @Query('pageSize') pageSize?: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.departments.findAll(
      Number(pageSize) || 100,
      includeInactive === 'true',
    );
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('system:configure')
  @ApiOperation({ operationId: 'getDepartment', summary: 'Get department by ID' })
  findOne(@Param('id') id: string) {
    return this.departments.findOne(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('system:configure')
  @ApiOperation({ operationId: 'createDepartment', summary: 'Create department' })
  create(@Body() dto: CreateDepartmentDto, @CurrentUser('id') userId: string) {
    return this.departments.create(dto, userId);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('system:configure')
  @ApiOperation({ operationId: 'updateDepartment', summary: 'Update department' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateDepartmentDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.departments.update(id, dto, userId);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('system:configure')
  @HttpCode(200)
  @ApiOperation({ operationId: 'disableDepartment', summary: 'Soft-disable department' })
  disable(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.departments.disable(id, userId);
  }
}
