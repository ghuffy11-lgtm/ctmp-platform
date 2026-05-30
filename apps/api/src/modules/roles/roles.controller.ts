import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RolesService } from './roles.service';

@ApiTags('roles')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @RequirePermissions('roles:manage')
  @ApiOperation({ operationId: 'listRoles', summary: 'List all roles' })
  findAll() {
    return this.rolesService.findAll();
  }

  @Get(':id')
  @RequirePermissions('roles:manage')
  @ApiOperation({ operationId: 'getRole', summary: 'Get role with permissions' })
  findOne(@Param('id') id: string) {
    return this.rolesService.findOne(id);
  }

  @Post()
  @RequirePermissions('roles:manage')
  @ApiOperation({ operationId: 'createRole', summary: 'Create role' })
  create(@Body() body: any, @CurrentUser('id') userId: string) {
    return this.rolesService.create(body, userId);
  }

  @Patch(':id')
  @RequirePermissions('roles:manage')
  @ApiOperation({ operationId: 'updateRole', summary: 'Update role' })
  update(@Param('id') id: string, @Body() body: any) {
    return this.rolesService.update(id, body);
  }

  @Delete(':id')
  @RequirePermissions('roles:manage')
  @ApiOperation({ operationId: 'deleteRole', summary: 'Delete role' })
  remove(@Param('id') id: string) {
    return this.rolesService.remove(id);
  }

  @Get(':id/permissions')
  @RequirePermissions('roles:manage')
  @ApiOperation({ operationId: 'getRolePermissions', summary: 'Get permission IDs assigned to role' })
  getPermissions(@Param('id') id: string) {
    return this.rolesService.getPermissions(id);
  }

  @Patch(':id/permissions')
  @RequirePermissions('roles:manage')
  @ApiOperation({ operationId: 'setRolePermissions', summary: 'Replace permission set for role' })
  setPermissions(
    @Param('id') id: string,
    @Body('permissionIds') permissionIds: string[],
    @CurrentUser('id') userId: string,
  ) {
    return this.rolesService.setPermissions(id, permissionIds, userId);
  }
}
