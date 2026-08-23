import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { VendorInvitationsService } from './vendor-invitations.service';
import { CreateVendorInvitationDto } from './dto/create-vendor-invitation.dto';
import { ListVendorInvitationsDto } from './dto/list-vendor-invitations.dto';
import { RevokeVendorInvitationDto } from './dto/revoke-vendor-invitation.dto';

// 2026-08-24: invite prospective suppliers to join the registry.
//
// Throttle names `short` / `long` must match the global registration in
// app.module.ts. Sending mail to a caller-chosen address is a spam vector even
// behind auth, so these are tighter than a normal CRUD endpoint — 3/min is
// generous for a human typing two fields and awkward for a script. The service
// adds a per-sender 24h cap on top, which the throttle alone cannot express.
@ApiTags('vendor-invitations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('vendor-invitations')
export class VendorInvitationsController {
  constructor(private readonly invitations: VendorInvitationsService) {}

  @Post()
  @RequirePermissions('vendor:invite')
  @Throttle({ short: { limit: 3, ttl: 60_000 }, long: { limit: 20, ttl: 3_600_000 } })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: 'createVendorInvitation',
    summary: 'Invite a prospective supplier to register. Not tender-scoped.',
  })
  create(@Body() dto: CreateVendorInvitationDto, @CurrentUser('id') userId: string) {
    return this.invitations.create(dto, userId);
  }

  @Get()
  @RequirePermissions('vendor:invite')
  @ApiOperation({ operationId: 'listVendorInvitations', summary: 'List registry invitations' })
  list(@Query() query: ListVendorInvitationsDto) {
    return this.invitations.list(query);
  }

  @Post(':id/resend')
  @RequirePermissions('vendor:invite')
  @Throttle({ short: { limit: 3, ttl: 60_000 }, long: { limit: 20, ttl: 3_600_000 } })
  @ApiOperation({
    operationId: 'resendVendorInvitation',
    summary: 'Resend an invitation. Rotates the token, so the previous link stops working.',
  })
  resend(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('id') userId: string) {
    return this.invitations.resend(id, userId);
  }

  @Post(':id/revoke')
  @RequirePermissions('vendor:invite')
  @ApiOperation({ operationId: 'revokeVendorInvitation', summary: 'Withdraw a pending invitation' })
  revoke(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RevokeVendorInvitationDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.invitations.revoke(id, dto?.reason, userId);
  }
}
