import { Injectable, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { RecordAttendanceDto } from './dto/record-attendance.dto';

@Injectable()
export class CommitteeService {
  private readonly logger = new Logger(CommitteeService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createSession(tenderId: string, dto: CreateSessionDto, userId: string) {
    // TODO: tender must be in Commercial Sealed; create committee session, audit log
    throw new Error('Not implemented');
  }

  async recordAttendance(sessionId: string, dto: RecordAttendanceDto, userId: string) {
    // TODO: record who attended, audit log
    throw new Error('Not implemented');
  }

  async openEnvelopes(sessionId: string, userId: string) {
    // TODO: GUARD — this is THE ONLY path to open commercial envelopes;
    // set envelopes to OPENED, transition tender to Committee Commercial Opening,
    // opening changes ENVELOPE STATE ONLY — visibility still requires explicit permissions;
    // audit log with all attendees
    // System Admin does NOT get commercial visibility automatically
    throw new Error('Not implemented');
  }

  async getRecords(sessionId: string) {
    // TODO: requires explicit committee:view_records permission
    throw new Error('Not implemented');
  }
}
