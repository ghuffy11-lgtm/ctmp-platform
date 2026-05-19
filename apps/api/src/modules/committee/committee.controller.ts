import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CommitteeService } from './committee.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { RecordAttendanceDto } from './dto/record-attendance.dto';

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
  openEnvelopes(@Param('sessionId') sessionId: string, @CurrentUser('id') userId: string) {
    return this.committeeService.openEnvelopes(sessionId, userId);
  }

  @Get('committee-sessions/:sessionId/opening-records')
  @RequirePermissions('committee:view_minutes')
  @ApiOperation({ operationId: 'getOpeningRecords', summary: 'Get commercial opening records' })
  getRecords(@Param('sessionId') sessionId: string) {
    return this.committeeService.getRecords(sessionId);
  }
}
