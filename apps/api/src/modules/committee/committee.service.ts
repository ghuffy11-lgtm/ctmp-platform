import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AuditRiskLevel, CommitteeSessionStatus, EnvelopeStatus, EnvelopeType, TechnicalResult, TenderStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { RecordAttendanceDto } from './dto/record-attendance.dto';
import { AmendSessionDto } from './dto/amend-session.dto';

@Injectable()
export class CommitteeService {
  private readonly logger = new Logger(CommitteeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async createSession(tenderId: string, dto: CreateSessionDto, userId: string) {
    const tender = await this.prisma.tender.findUnique({
      where: { id: tenderId },
      select: { id: true, status: true },
    });
    if (!tender) throw new NotFoundException('Tender not found');
    if (tender.status !== TenderStatus.COMMERCIAL_SEALED) {
      throw new BadRequestException(`Committee session requires tender in COMMERCIAL_SEALED`);
    }

    const uniqueMembers = Array.from(new Set(dto.memberIds));
    if (!uniqueMembers || uniqueMembers.length < 2) {
      throw new BadRequestException('At least 2 committee members required');
    }

    const session = await this.prisma.committeeSession.create({
      data: {
        tenderId,
        scheduledAt: new Date(dto.scheduledAt),
        location: dto.location,
        createdBy: userId,
        status: CommitteeSessionStatus.SCHEDULED,
        requiredQuorumCount: dto.requiredQuorumCount ?? null,
        requiredRoleCode: dto.requiredRoleCode ?? 'CHAIR',
        committeeMembers: {
          create: uniqueMembers.map((userId, idx) => ({
            userId,
            isChair: idx === 0,
            roleInCommittee: idx === 0 ? 'Chair' : 'Member',
          })),
        },
      },
      include: { committeeMembers: true },
    });

    await this.audit.log({
      eventType: 'COMMITTEE_SESSION_CREATED',
      entityType: 'CommitteeSession',
      entityId: session.id,
      tenderId,
      actorUserId: userId,
      afterValue: { scheduledAt: session.scheduledAt, memberCount: dto.memberIds.length },
      riskLevel: AuditRiskLevel.MEDIUM,
    });

    // BUG-062 / WALK-040: dispatch invitation emails to every committee
    // member. Best-effort — failures are logged but do not roll back the
    // session creation, matching the dispatchAwardNotifications pattern.
    void this.dispatchInvitationEmails(session.id).catch(err =>
      this.logger.error(`Committee session invitation dispatch failed: ${err}`),
    );

    return session;
  }

  private async dispatchInvitationEmails(sessionId: string) {
    const session = await this.prisma.committeeSession.findUnique({
      where: { id: sessionId },
      include: {
        tender: { select: { reference: true, title: true } },
        committeeMembers: {
          include: { user: { select: { email: true, displayName: true } } },
        },
      },
    });
    if (!session) return;
    const variables = {
      tenderReference: session.tender.reference,
      tenderTitle: session.tender.title,
      scheduledAt: session.scheduledAt.toISOString().replace('T', ' ').replace(/:\d\d\.\d+Z$/, ' UTC'),
      location: session.location ?? '—',
      requiredQuorumCount: session.requiredQuorumCount?.toString() ?? '—',
      requiredRoleCode: session.requiredRoleCode ?? 'CHAIR',
    };
    for (const m of session.committeeMembers) {
      const to = m.user?.email;
      if (!to) continue;
      try {
        await this.notifications.sendEmail(to, 'COMMITTEE_SESSION_INVITATION', {
          ...variables,
          recipientName: m.user.displayName ?? to,
        });
      } catch (err) {
        this.logger.warn(`Failed to send COMMITTEE_SESSION_INVITATION to ${to}: ${err}`);
      }
    }
  }

  // BUG-097 (2026-06-03): allow rescheduling a session before it's been
  // completed (i.e. commercial envelopes opened). Date / time / location are
  // editable; member list stays untouched.
  async reschedule(
    sessionId: string,
    body: { scheduledAt?: string; location?: string },
    userId: string,
  ) {
    const session = await this.prisma.committeeSession.findUnique({
      where: { id: sessionId },
      select: { id: true, status: true, scheduledAt: true, location: true },
    });
    if (!session) throw new NotFoundException('Committee session not found');
    if (session.status === CommitteeSessionStatus.COMPLETED) {
      throw new BadRequestException('Session is already completed — cannot reschedule.');
    }
    const data: { scheduledAt?: Date; location?: string | null } = {};
    if (body.scheduledAt) {
      const d = new Date(body.scheduledAt);
      if (Number.isNaN(d.getTime())) {
        throw new BadRequestException('Invalid scheduledAt — expected ISO 8601 timestamp.');
      }
      data.scheduledAt = d;
    }
    if (body.location !== undefined) {
      data.location = body.location?.trim() ? body.location.trim() : null;
    }
    if (Object.keys(data).length === 0) {
      throw new BadRequestException('Nothing to update — provide scheduledAt and/or location.');
    }
    const updated = await this.prisma.committeeSession.update({
      where: { id: sessionId },
      data,
    });
    await this.audit.log({
      eventType: 'COMMITTEE_SESSION_RESCHEDULED',
      entityType: 'CommitteeSession',
      entityId: sessionId,
      actorUserId: userId,
      beforeValue: { scheduledAt: session.scheduledAt?.toISOString(), location: session.location },
      afterValue: { scheduledAt: updated.scheduledAt?.toISOString(), location: updated.location },
      riskLevel: AuditRiskLevel.MEDIUM,
    });
    return this.findOne(sessionId);
  }

  // BUG-148 (2026-06-21): post-hoc session amendment for the case where
  // commercial envelopes have already opened with imperfect attendance /
  // quorum config and the award stage is now blocked. Authorised admin can
  // (a) lower required_quorum_count, (b) change required_role_code, or
  // (c) toggle attendance. Reason text mandatory; HIGH audit row carries
  // before+after snapshot. Same permission as createSession.
  async amendSession(sessionId: string, dto: AmendSessionDto, userId: string) {
    const session = await this.prisma.committeeSession.findUnique({
      where: { id: sessionId },
      include: {
        committeeMembers: {
          include: {
            user: { select: { displayName: true } },
            attendances: { select: { present: true } },
          },
        },
      },
    });
    if (!session) throw new NotFoundException('Committee session not found');

    // Capture before-state for the audit row.
    const beforeAttendance = session.committeeMembers.map(m => ({
      memberId: m.id,
      userId: m.userId,
      displayName: m.user?.displayName ?? null,
      present: m.attendances[0]?.present === true,
    }));
    const beforeValue = {
      requiredQuorumCount: session.requiredQuorumCount,
      requiredRoleCode: session.requiredRoleCode,
      attendance: beforeAttendance,
    };

    const updates: Array<Promise<any>> = [];

    // Session config updates (quorum count / role code).
    const sessionPatch: Record<string, any> = {};
    if (dto.requiredQuorumCount !== undefined) {
      sessionPatch.requiredQuorumCount = dto.requiredQuorumCount;
    }
    if (dto.requiredRoleCode !== undefined) {
      sessionPatch.requiredRoleCode = dto.requiredRoleCode;
    }

    // Attendance replace (mark listed user-ids present, others absent).
    let attendanceUpdated = false;
    let newAttendanceRows: Array<{ sessionId: string; memberId: string; present: boolean; recordedBy: string }> = [];
    if (dto.attendeeIds) {
      const attendeeSet = new Set(dto.attendeeIds);
      newAttendanceRows = session.committeeMembers.map(m => ({
        sessionId,
        memberId: m.id,
        present: attendeeSet.has(m.userId),
        recordedBy: userId,
      }));
      attendanceUpdated = true;
    }

    await this.prisma.$transaction([
      ...(Object.keys(sessionPatch).length > 0
        ? [this.prisma.committeeSession.update({ where: { id: sessionId }, data: sessionPatch })]
        : []),
      ...(attendanceUpdated
        ? [
            this.prisma.committeeAttendance.deleteMany({ where: { sessionId } }),
            this.prisma.committeeAttendance.createMany({ data: newAttendanceRows }),
          ]
        : []),
    ]);

    // Re-read for the after-state snapshot.
    const after = await this.prisma.committeeSession.findUnique({
      where: { id: sessionId },
      include: {
        committeeMembers: {
          include: {
            user: { select: { displayName: true } },
            attendances: { select: { present: true } },
          },
        },
      },
    });
    const afterAttendance = (after?.committeeMembers ?? []).map(m => ({
      memberId: m.id,
      userId: m.userId,
      displayName: m.user?.displayName ?? null,
      present: m.attendances[0]?.present === true,
    }));
    const afterValue = {
      requiredQuorumCount: after?.requiredQuorumCount,
      requiredRoleCode: after?.requiredRoleCode,
      attendance: afterAttendance,
    };

    await this.audit.log({
      eventType: 'COMMITTEE_SESSION_AMENDED',
      entityType: 'CommitteeSession',
      entityId: sessionId,
      tenderId: session.tenderId,
      actorUserId: userId,
      beforeValue,
      afterValue: { ...afterValue, reason: dto.reason },
      riskLevel: AuditRiskLevel.HIGH,
    });

    return this.findOne(sessionId);
  }

  async recordAttendance(sessionId: string, dto: RecordAttendanceDto, userId: string) {
    const session = await this.prisma.committeeSession.findUnique({
      where: { id: sessionId },
      include: { committeeMembers: { select: { id: true, userId: true } } },
    });
    if (!session) throw new NotFoundException('Committee session not found');
    if (session.status === CommitteeSessionStatus.COMPLETED) {
      throw new BadRequestException('Session already completed');
    }

    const attendeeSet = new Set(dto.attendeeIds);
    const attendanceRows = session.committeeMembers.map(m => ({
      sessionId,
      memberId: m.id,
      present: attendeeSet.has(m.userId),
      recordedBy: userId,
    }));

    await this.prisma.$transaction([
      this.prisma.committeeAttendance.deleteMany({ where: { sessionId } }),
      this.prisma.committeeAttendance.createMany({ data: attendanceRows }),
    ]);

    await this.audit.log({
      eventType: 'COMMITTEE_ATTENDANCE_RECORDED',
      entityType: 'CommitteeSession',
      entityId: sessionId,
      tenderId: session.tenderId,
      actorUserId: userId,
      afterValue: {
        attended: attendanceRows.filter(r => r.present).length,
        absent: attendanceRows.filter(r => !r.present).length,
      },
      riskLevel: AuditRiskLevel.LOW,
    });

    return this.findOne(sessionId);
  }

  async openEnvelopes(sessionId: string, userId: string, remarks?: string) {
    const session = await this.prisma.committeeSession.findUnique({
      where: { id: sessionId },
      include: {
        tender: { select: { id: true, status: true } },
        committeeMembers: {
          include: { attendances: { select: { present: true } } },
        },
      },
    });
    if (!session) throw new NotFoundException('Committee session not found');
    if (session.tender.status !== TenderStatus.COMMERCIAL_SEALED) {
      throw new BadRequestException(`Tender must be in COMMERCIAL_SEALED to open commercial envelopes`);
    }
    if (session.status === CommitteeSessionStatus.COMPLETED) {
      throw new BadRequestException('Session already completed');
    }

    // BUG-079 (2026-06-01): meeting-date hard gate. Owner opened commercial on
    // 2026-06-01 for a session scheduled 2026-06-02 — the system silently
    // allowed it. Now: refuse with 409 + scheduledAt when before the meeting.
    if (session.scheduledAt && new Date() < session.scheduledAt) {
      throw new ConflictException({
        code: 'BEFORE_MEETING_DATE',
        message: `Commercial opening blocked until the scheduled meeting time (${session.scheduledAt.toISOString()}).`,
        scheduledAt: session.scheduledAt.toISOString(),
      });
    }

    // BUG-148 (2026-06-21): unified quorum rule. The pre-BUG-148 majority
    // rule (`present * 2 >= members.length`) would let opening succeed with
    // 3 of 4 members present even when the session was configured with
    // `required_quorum_count = 4`, and the award stage would then block
    // with "Need 1 more member(s) present". Both gates now consult the
    // same `required_quorum_count` + `required_role_code` fields so they
    // never disagree. Falls back to majority when required_quorum_count is
    // unset (legacy sessions).
    const presentCount = session.committeeMembers.filter(m => m.attendances[0]?.present === true).length;
    const requiredCount = session.requiredQuorumCount ?? Math.ceil(session.committeeMembers.length / 2);
    const requiredRoleCode = session.requiredRoleCode ?? 'CHAIR';
    const quorumReasons: string[] = [];
    if (presentCount < requiredCount) {
      quorumReasons.push(`Need ${requiredCount - presentCount} more member(s) present (${presentCount}/${requiredCount})`);
    }
    const chairMember = session.committeeMembers.find(m => m.isChair);
    const requiredRolePresent = requiredRoleCode === 'CHAIR'
      ? !!chairMember && chairMember.attendances[0]?.present === true
      : session.committeeMembers.some(m => m.roleInCommittee === requiredRoleCode && m.attendances[0]?.present === true);
    if (!requiredRolePresent) {
      quorumReasons.push(`${requiredRoleCode} must be present`);
    }
    if (quorumReasons.length > 0) {
      throw new BadRequestException(`Quorum not met: ${quorumReasons.join(' + ')}`);
    }

    const now = new Date();
    const tenderId = session.tender.id;

    // Open commercial envelopes ONLY for technically-passed bids. This is the ONLY path
    // to change commercial envelope state. Visibility is still gated by commercial:view.
    const result = await this.prisma.$transaction(async tx => {
      const envelopes = await tx.bidEnvelope.findMany({
        where: {
          envelopeType: EnvelopeType.COMMERCIAL,
          status: EnvelopeStatus.SEALED,
          bid: { tenderId, technicalResult: TechnicalResult.PASS },
        },
        include: {
          bidDocuments: { select: { id: true, checksumSha256: true } },
        },
      });

      // Update each envelope + insert opening record per envelope.
      for (const env of envelopes) {
        await tx.bidEnvelope.update({
          where: { id: env.id },
          data: {
            status: EnvelopeStatus.OPENED,
            openedAt: now,
            openedByUserId: userId,
            committeeSessionId: sessionId,
            hashVerifiedAt: now,
          },
        });
        await tx.committeeOpeningRecord.create({
          data: {
            sessionId,
            bidEnvelopeId: env.id,
            checksumVerified: env.bidDocuments.every(d => /^[a-f0-9]{64}$/.test(d.checksumSha256)),
            recordedBy: userId,
          },
        });
      }

      await tx.committeeSession.update({
        where: { id: sessionId },
        data: {
          status: CommitteeSessionStatus.COMPLETED,
          openedBy: userId,
          openedAt: now,
          // BUG-077 (2026-06-01): persist the opening remarks the operator typed.
          // Previously the endpoint accepted no body so the remarks state in the
          // UI was dropped on submit — operator reload showed empty.
          ...(remarks !== undefined ? { minutesText: remarks } : {}),
        },
      });

      await tx.tender.update({
        where: { id: tenderId },
        data: { status: TenderStatus.COMMITTEE_COMMERCIAL_OPENING },
      });

      return {
        sessionId,
        openedEnvelopeCount: envelopes.length,
        records: envelopes.map(e => ({
          id: e.id,
          bidId: e.bidId,
          vendorId: '',  // populated by getRecords with join
          envelopeStatus: EnvelopeStatus.OPENED,
          checksumVerified: e.bidDocuments.every(d => /^[a-f0-9]{64}$/.test(d.checksumSha256)),
          openedAt: now.toISOString(),
        })),
      };
    });

    await this.audit.log({
      eventType: 'COMMERCIAL_ENVELOPES_OPENED',
      entityType: 'CommitteeSession',
      entityId: sessionId,
      tenderId,
      actorUserId: userId,
      beforeValue: { tenderStatus: TenderStatus.COMMERCIAL_SEALED },
      afterValue: {
        tenderStatus: TenderStatus.COMMITTEE_COMMERCIAL_OPENING,
        openedEnvelopeCount: result.openedEnvelopeCount,
      },
      riskLevel: AuditRiskLevel.CRITICAL,
    });

    // Transition tender to COMMERCIAL_EVALUATION so subsequent UI flow lands there.
    await this.prisma.tender.update({
      where: { id: tenderId },
      data: { status: TenderStatus.COMMERCIAL_EVALUATION },
    });

    return result;
  }

  async getRecords(sessionId: string) {
    const records = await this.prisma.committeeOpeningRecord.findMany({
      where: { sessionId },
      include: {
        bidEnvelope: {
          include: { bid: { include: { vendor: { select: { id: true, companyName: true } } } } },
        },
      },
      orderBy: { recordedAt: 'asc' },
    });
    return {
      items: records.map(r => ({
        id: r.id,
        bidId: r.bidEnvelope.bidId,
        vendorId: r.bidEnvelope.bid.vendorId,
        vendorCompany: r.bidEnvelope.bid.vendor.companyName,
        envelopeStatus: r.bidEnvelope.status,
        checksumVerified: r.checksumVerified,
        technicalResult: r.bidEnvelope.bid.technicalResult,
        openedAt: r.bidEnvelope.openedAt?.toISOString(),
      })),
    };
  }

  async findOne(sessionId: string) {
    const session = await this.prisma.committeeSession.findUnique({
      where: { id: sessionId },
      include: {
        committeeMembers: {
          include: {
            user: { select: { displayName: true } },
            attendances: { select: { present: true } },
          },
        },
      },
    });
    if (!session) throw new NotFoundException('Session not found');
    const chair = session.committeeMembers.find(m => m.isChair);
    return {
      id: session.id,
      tenderId: session.tenderId,
      status: session.status,
      scheduledAt: session.scheduledAt.toISOString(),
      openedAt: session.openedAt?.toISOString(),
      remarks: session.minutesText ?? undefined,
      chairName: chair?.user.displayName,
      requiredQuorumCount: session.requiredQuorumCount ?? null,
      requiredRoleCode: session.requiredRoleCode ?? 'CHAIR',
      members: session.committeeMembers.map(m => ({
        userId: m.userId,
        name: m.user.displayName,
        role: m.roleInCommittee ?? (m.isChair ? 'Chair' : 'Member'),
        attended: m.attendances[0]?.present,
      })),
    };
  }

  async listForTender(tenderId: string) {
    const sessions = await this.prisma.committeeSession.findMany({
      where: { tenderId },
      orderBy: { scheduledAt: 'desc' },
      include: {
        committeeMembers: {
          include: {
            user: { select: { displayName: true } },
            attendances: { select: { present: true }, take: 1 },
          },
        },
      },
    });

    return {
      items: sessions.map(s => {
        const chair = s.committeeMembers.find(m => m.isChair);
        return {
          id: s.id,
          tenderId: s.tenderId,
          status: s.status,
          scheduledAt: s.scheduledAt.toISOString(),
          openedAt: s.openedAt?.toISOString(),
          remarks: s.minutesText ?? undefined,
          chairName: chair?.user.displayName,
          requiredQuorumCount: s.requiredQuorumCount ?? null,
          requiredRoleCode: s.requiredRoleCode ?? 'CHAIR',
          members: s.committeeMembers.map((m: typeof s.committeeMembers[number]) => ({
            userId: m.userId,
            name: m.user.displayName,
            role: m.roleInCommittee ?? (m.isChair ? 'Chair' : 'Member'),
            attended: m.attendances[0]?.present,
          })),
        };
      }),
    };
  }
}
