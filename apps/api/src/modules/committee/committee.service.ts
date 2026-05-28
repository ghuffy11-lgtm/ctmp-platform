import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AuditRiskLevel, CommitteeSessionStatus, EnvelopeStatus, EnvelopeType, TechnicalResult, TenderStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { RecordAttendanceDto } from './dto/record-attendance.dto';

@Injectable()
export class CommitteeService {
  private readonly logger = new Logger(CommitteeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
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

    return session;
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

  async openEnvelopes(sessionId: string, userId: string) {
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

    // Quorum: majority of committee members marked present.
    const present = session.committeeMembers.filter(m => m.attendances[0]?.present === true).length;
    if (present * 2 < session.committeeMembers.length) {
      throw new BadRequestException(`Quorum not met (${present}/${session.committeeMembers.length})`);
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
        data: { status: CommitteeSessionStatus.COMPLETED, openedBy: userId, openedAt: now },
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
