import { Controller, Get, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { VendorsService } from './vendors.service';
import { UpdateVendorDto } from './dto/update-vendor.dto';

@ApiTags('vendors')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('vendors')
export class VendorsController {
  constructor(private readonly vendorsService: VendorsService) {}

  @Get()
  @RequirePermissions('vendors:list')
  @ApiOperation({ operationId: 'listVendors', summary: 'List all registered vendors' })
  findAll() {
    return this.vendorsService.findAll();
  }

  @Get('registrations')
  @RequirePermissions('vendors:approve')
  @ApiOperation({ operationId: 'listVendorRegistrations', summary: 'List pending vendor registrations' })
  listRegistrations() {
    return this.vendorsService.listRegistrations();
  }

  @Patch('registrations/:id/approve')
  @RequirePermissions('vendors:approve')
  @ApiOperation({ operationId: 'approveVendorRegistration', summary: 'Approve vendor registration' })
  approve(@Param('id') id: string) {
    return this.vendorsService.approve(id);
  }

  @Patch('registrations/:id/reject')
  @RequirePermissions('vendors:approve')
  @ApiOperation({ operationId: 'rejectVendorRegistration', summary: 'Reject vendor registration' })
  reject(@Param('id') id: string, @Body('reason') reason: string) {
    return this.vendorsService.reject(id, reason);
  }

  @Get(':id')
  @RequirePermissions('vendors:read')
  @ApiOperation({ operationId: 'getVendor', summary: 'Get vendor profile' })
  findOne(@Param('id') id: string) {
    return this.vendorsService.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions('vendors:update')
  @ApiOperation({ operationId: 'updateVendor', summary: 'Update vendor profile' })
  update(@Param('id') id: string, @Body() dto: UpdateVendorDto) {
    return this.vendorsService.update(id, dto);
  }
}
