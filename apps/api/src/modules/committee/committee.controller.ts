import { Controller, Get, Post, Patch, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CommitteeService } from './committee.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { RecordAttendanceDto } from './dto/record-attendance.dto';
import { AmendSessionDto } from './dto/amend-session.dto';

@ApiTags('committee')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller()
export class CommitteeController {
  constructor(private readonly committeeService: CommitteeService) {}

  @Post('tenders/:tenderId/committee-sessions')
  @RequirePermissions('committee:create_session')
  @ApiOperation({ operationId: 'createCommitteeSession', summary: 'Create committee commercial opening session' })
  createSession(
    @Param('tenderId') tenderId: string,
    @Body() dto: CreateSessionDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.committeeService.createSession(tenderId, dto, userId);
  }

  @Get('tenders/:tenderId/committee-sessions')
  @RequirePermissions('committee:view_minutes')
  @ApiOperation({ operationId: 'listCommitteeSessions', summary: 'List committee sessions for tender (newest first)' })
  listForTender(@Param('tenderId') tenderId: string) {
    return this.committeeService.listForTender(tenderId);
  }

  @Post('committee-sessions/:sessionId/attendance')
  @RequirePermissions('committee:record_attendance')
  @ApiOperation({ operationId: 'recordSessionAttendance', summary: 'Record committee member attendance' })
  recordAttendance(
    @Param('sessionId') sessionId: string,
    @Body() dto: RecordAttendanceDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.committeeService.recordAttendance(sessionId, dto, userId);
  }

  @Post('committee-sessions/:sessionId/open-commercial-envelopes')
  @RequirePermissions('committee:open_commercial')
  @ApiOperation({ operationId: 'openCommercialEnvelopes', summary: 'Open commercial envelopes — committee only, changes envelope state' })
  openEnvelopes(
    @Param('sessionId') sessionId: string,
    @Body() body: { remarks?: string } = {},
    @CurrentUser('id') userId: string,
  ) {
    return this.committeeService.openEnvelopes(sessionId, userId, body?.remarks);
  }

  @Get('committee-sessions/:sessionId/opening-records')
  @RequirePermissions('committee:view_minutes')
  @ApiOperation({ operationId: 'getOpeningRecords', summary: 'Get commercial opening records' })
  getRecords(@Param('sessionId') sessionId: string) {
    return this.committeeService.getRecords(sessionId);
  }

  // BUG-097 (2026-06-03): owner asked for the ability to reschedule a session
  // (date / time / location). Gated by `committee:create_session` since the
  // same role that creates a session should be able to move it.
  @Patch('committee-sessions/:sessionId')
  @RequirePermissions('committee:create_session')
  @ApiOperation({ operationId: 'rescheduleCommitteeSession', summary: 'Reschedule or relocate an existing session (before it is opened)' })
  reschedule(
    @Param('sessionId') sessionId: string,
    @Body() body: { scheduledAt?: string; location?: string },
    @CurrentUser('id') userId: string,
  ) {
    return this.committeeService.reschedule(sessionId, body ?? {}, userId);
  }

  // BUG-148 (2026-06-21): post-hoc amendment for sessions where attendance
  // / quorum config needs correcting (typically after commercial envelopes
  // have already opened but the award stage is blocked). Same permission
  // as createSession; reason text mandatory; HIGH-severity audit.
  @Patch('committee-sessions/:sessionId/amend')
  @RequirePermissions('committee:create_session')
  @ApiOperation({ operationId: 'amendCommitteeSession', summary: 'Amend a committee session (quorum count, role, attendance) — post-hoc with reason' })
  amend(
    @Param('sessionId') sessionId: string,
    @Body() dto: AmendSessionDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.committeeService.amendSession(sessionId, dto, userId);
  }
}
