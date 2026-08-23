import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditRiskLevel, Prisma, VendorInvitationStatus } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateVendorInvitationDto } from './dto/create-vendor-invitation.dto';
import { ListVendorInvitationsDto } from './dto/list-vendor-invitations.dto';

const TEMPLATE_CODE = 'VENDOR_REGISTRY_INVITATION';

// Per-sender ceiling, on top of the per-endpoint @Throttle. The throttle stops a
// burst; this stops a slow drip. This endpoint makes the server send mail to an
// address the caller chooses, so it is a spam vector even though it is
// authenticated — an over-permissioned or compromised staff account should not
// be able to mail thousands of strangers from our domain.
const MAX_INVITES_PER_SENDER_24H = 20;

// Resending rotates the token and kills the previous link. A short cooldown
// stops an impatient double-click from invalidating the link the recipient is
// in the middle of clicking.
const RESEND_COOLDOWN_MS = 5 * 60 * 1000;

export interface InvitationRow {
  id: string;
  email: string;
  companyName: string;
  status: 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED';
  invitedByName: string | null;
  invitedAt: Date;
  lastSentAt: Date;
  sendCount: number;
  expiresAt: Date;
  acceptedAt: Date | null;
  acceptedVendorId: string | null;
  revokedAt: Date | null;
  revokeReason: string | null;
}

@Injectable()
export class VendorInvitationsService {
  private readonly logger = new Logger(VendorInvitationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  // ---------------------------------------------------------------------------
  // Token helpers. Same discipline as vendor-auth: the raw token is emailed and
  // never persisted; only its SHA-256 hash is stored.
  // ---------------------------------------------------------------------------
  private newToken() {
    const rawToken = randomBytes(32).toString('hex');
    return { rawToken, tokenHash: this.hashToken(rawToken) };
  }

  private hashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  private ttlDays(): number {
    const v = Number(this.config.get<number>('app.vendorInviteTtlDays'));
    return Number.isFinite(v) && v > 0 ? v : 14;
  }

  private expiryFromNow(): Date {
    return new Date(Date.now() + this.ttlDays() * 86_400_000);
  }

  /** Derived — there is no stored EXPIRED status. See migration 057. */
  private derivedStatus(row: { status: VendorInvitationStatus; expiresAt: Date }): InvitationRow['status'] {
    if (row.status === VendorInvitationStatus.PENDING && row.expiresAt.getTime() < Date.now()) {
      return 'EXPIRED';
    }
    return row.status;
  }

  private async vendorPortalUrl(): Promise<string> {
    // DB setting first, then config — the two-tier pattern already used by the
    // tender invitation dispatcher.
    const row = await this.prisma.systemSetting.findUnique({
      where: { key: 'branding.vendor_portal_url' },
    });
    const base = row?.value || this.config.get<string>('app.vendorPortalUrl') || '';
    return base.replace(/\/+$/, '');
  }

  /**
   * Sends the invitation email.
   *
   * `sendEmail` writes a notification_logs row and then **throws** on SMTP
   * failure (notifications.service.ts:302). Letting that propagate would abort
   * `create()` after the invitation row already exists — leaving an orphan
   * PENDING invitation whose link was never delivered, and whose address is now
   * blocked by the partial unique index from being invited again.
   *
   * So the throw is caught and downgraded to an `emailStatus` the caller returns
   * to the UI: the invitation exists and is resendable, and the operator is told
   * plainly that the mail did not go out rather than being shown a success.
   */
  private async dispatch(
    invitation: { email: string; companyName: string; expiresAt: Date },
    rawToken: string,
    inviterName: string,
  ): Promise<'SENT' | 'FAILED'> {
    const portal = await this.vendorPortalUrl();
    const registerUrl = `${portal}/register?invite=${rawToken}`;
    const branding = await this.prisma.systemSetting.findUnique({
      where: { key: 'branding.system_name' },
    });

    try {
      await this.notifications.sendEmail(invitation.email, TEMPLATE_CODE, {
        systemName: branding?.value || 'CTMP',
        companyName: invitation.companyName,
        inviterName,
        registerUrl,
        recipientEmail: invitation.email,
        // Formatted here rather than passed as raw ISO. Other templates pass ISO
        // strings for dates; that is an existing wart and not one to repeat in a
        // supplier's first impression of the platform.
        expiresOn: invitation.expiresAt.toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        }),
      });
      return 'SENT';
    } catch (err) {
      this.logger.error(`Invitation email to ${invitation.email} failed: ${err}`);
      return 'FAILED';
    }
  }

  private async inviterName(userId: string): Promise<string> {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { displayName: true },
    });
    return u?.displayName || 'Our procurement team';
  }

  // ---------------------------------------------------------------------------
  // Create
  // ---------------------------------------------------------------------------
  async create(dto: CreateVendorInvitationDto, actorUserId: string) {
    const email = dto.email.trim().toLowerCase();

    // 1. Per-sender daily cap.
    const sentToday = await this.prisma.vendorInvitation.count({
      where: { invitedBy: actorUserId, invitedAt: { gt: new Date(Date.now() - 86_400_000) } },
    });
    if (sentToday >= MAX_INVITES_PER_SENDER_24H) {
      throw new HttpException(
        `Daily invitation limit reached (${MAX_INVITES_PER_SENDER_24H} per user per 24 hours).`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // 2. Already a supplier? Being specific is safe here — the endpoint is
    //    authenticated staff-only, so this is not an enumeration surface.
    const existingUser = await this.prisma.vendorUser.findUnique({ where: { email } });
    if (existingUser) {
      throw new ConflictException('That email address already has a supplier account.');
    }

    // 3. An existing invitation for this address?
    const existing = await this.prisma.vendorInvitation.findFirst({
      where: { email, status: VendorInvitationStatus.PENDING },
    });
    if (existing) {
      if (existing.expiresAt.getTime() >= Date.now()) {
        throw new ConflictException({
          code: 'INVITATION_ALREADY_PENDING',
          message: 'An invitation to that address is already pending. Resend it instead.',
          invitationId: existing.id,
        });
      }
      // Expired but still PENDING. The partial unique index would reject a second
      // live row, so retire this one first, in the same transaction as the insert.
      await this.prisma.vendorInvitation.update({
        where: { id: existing.id },
        data: {
          status: VendorInvitationStatus.REVOKED,
          revokedAt: new Date(),
          revokedBy: actorUserId,
          revokeReason: 'Superseded by a new invitation',
          updatedAt: new Date(),
        },
      });
    }

    const { rawToken, tokenHash } = this.newToken();
    const expiresAt = this.expiryFromNow();

    let created;
    try {
      created = await this.prisma.vendorInvitation.create({
        data: { email, companyName: dto.companyName, tokenHash, expiresAt, invitedBy: actorUserId },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('An invitation to that address is already pending.');
      }
      throw e;
    }

    const emailStatus = await this.dispatch(created, rawToken, await this.inviterName(actorUserId));

    // Audit AFTER the write. AuditService.log() opens its own transaction and
    // takes pg_advisory_xact_lock — nesting it inside one deadlocks.
    await this.audit.log({
      eventType: 'VENDOR_INVITATION_SENT',
      entityType: 'VendorInvitation',
      entityId: created.id,
      actorUserId,
      riskLevel: AuditRiskLevel.MEDIUM,
      afterValue: { email, companyName: dto.companyName, expiresAt, emailStatus },
    });

    return this.toRow(created, null, emailStatus);
  }

  // ---------------------------------------------------------------------------
  // Resend — rotates the token, so the previous link dies immediately.
  // ---------------------------------------------------------------------------
  async resend(id: string, actorUserId: string) {
    const inv = await this.prisma.vendorInvitation.findUnique({ where: { id } });
    if (!inv) throw new NotFoundException('Invitation not found');
    if (inv.status !== VendorInvitationStatus.PENDING) {
      throw new BadRequestException(
        inv.status === VendorInvitationStatus.ACCEPTED
          ? 'That invitation has already been accepted.'
          : 'That invitation has been revoked. Send a new one instead.',
      );
    }
    if (Date.now() - inv.lastSentAt.getTime() < RESEND_COOLDOWN_MS) {
      throw new BadRequestException('That invitation was just sent. Wait a few minutes before resending.');
    }

    const { rawToken, tokenHash } = this.newToken();
    const expiresAt = this.expiryFromNow();
    const updated = await this.prisma.vendorInvitation.update({
      where: { id },
      data: {
        tokenHash,
        expiresAt,
        lastSentAt: new Date(),
        sendCount: { increment: 1 },
        updatedAt: new Date(),
      },
    });

    const emailStatus = await this.dispatch(updated, rawToken, await this.inviterName(actorUserId));

    await this.audit.log({
      eventType: 'VENDOR_INVITATION_RESENT',
      entityType: 'VendorInvitation',
      entityId: id,
      actorUserId,
      riskLevel: AuditRiskLevel.MEDIUM,
      afterValue: {
        email: updated.email,
        sendCount: updated.sendCount,
        expiresAt,
        tokenRotated: true,
        emailStatus,
      },
    });

    return this.toRow(updated, null, emailStatus);
  }

  // ---------------------------------------------------------------------------
  // Revoke
  // ---------------------------------------------------------------------------
  async revoke(id: string, reason: string | undefined, actorUserId: string) {
    const inv = await this.prisma.vendorInvitation.findUnique({ where: { id } });
    if (!inv) throw new NotFoundException('Invitation not found');
    if (inv.status === VendorInvitationStatus.ACCEPTED) {
      throw new BadRequestException('That invitation has already been accepted and cannot be revoked.');
    }
    if (inv.status === VendorInvitationStatus.REVOKED) {
      return this.toRow(inv, null); // idempotent
    }

    const updated = await this.prisma.vendorInvitation.update({
      where: { id },
      data: {
        status: VendorInvitationStatus.REVOKED,
        revokedAt: new Date(),
        revokedBy: actorUserId,
        revokeReason: reason ?? null,
        updatedAt: new Date(),
      },
    });

    await this.audit.log({
      eventType: 'VENDOR_INVITATION_REVOKED',
      entityType: 'VendorInvitation',
      entityId: id,
      actorUserId,
      riskLevel: AuditRiskLevel.MEDIUM,
      beforeValue: { status: 'PENDING' },
      afterValue: { status: 'REVOKED', email: updated.email },
      reason,
    });

    return this.toRow(updated, null);
  }

  // ---------------------------------------------------------------------------
  // List
  // ---------------------------------------------------------------------------
  async list(query: ListVendorInvitationsDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const now = new Date();

    const where: Prisma.VendorInvitationWhereInput = {};
    if (query.status === 'EXPIRED') {
      where.status = VendorInvitationStatus.PENDING;
      where.expiresAt = { lt: now };
    } else if (query.status === 'PENDING') {
      where.status = VendorInvitationStatus.PENDING;
      where.expiresAt = { gte: now };
    } else if (query.status) {
      where.status = query.status as VendorInvitationStatus;
    }
    if (query.search) {
      where.OR = [
        { email: { contains: query.search, mode: 'insensitive' } },
        { companyName: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.vendorInvitation.count({ where }),
      this.prisma.vendorInvitation.findMany({
        where,
        orderBy: { invitedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { invitedByUser: { select: { displayName: true } } },
      }),
    ]);

    return {
      page,
      pageSize,
      total,
      items: rows.map(r => this.toRow(r, r.invitedByUser?.displayName ?? null)),
    };
  }

  private toRow(
    r: {
      id: string;
      email: string;
      companyName: string;
      status: VendorInvitationStatus;
      invitedAt: Date;
      lastSentAt: Date;
      sendCount: number;
      expiresAt: Date;
      acceptedAt: Date | null;
      acceptedVendorId: string | null;
      revokedAt: Date | null;
      revokeReason: string | null;
    },
    invitedByName: string | null,
    emailStatus?: 'SENT' | 'FAILED',
  ) {
    return {
      id: r.id,
      email: r.email,
      companyName: r.companyName,
      status: this.derivedStatus(r),
      invitedByName,
      invitedAt: r.invitedAt,
      lastSentAt: r.lastSentAt,
      sendCount: r.sendCount,
      expiresAt: r.expiresAt,
      acceptedAt: r.acceptedAt,
      acceptedVendorId: r.acceptedVendorId,
      revokedAt: r.revokedAt,
      revokeReason: r.revokeReason,
      ...(emailStatus ? { emailStatus } : {}),
    };
  }

  // ---------------------------------------------------------------------------
  // Public lookup, used by the registration page.
  //
  // Returns ONE indistinguishable shape for not-found / expired / revoked /
  // already-accepted. Mirrors the BUG-151 stance on auth tokens: never tell an
  // anonymous caller WHY a token failed. The detailed reason goes to the log.
  // ---------------------------------------------------------------------------
  async resolveByToken(
    rawToken: string,
  ): Promise<{ valid: false } | { valid: true; email: string; companyName: string }> {
    if (!rawToken || !/^[0-9a-f]{64}$/.test(rawToken)) return { valid: false };

    const inv = await this.prisma.vendorInvitation.findUnique({
      where: { tokenHash: this.hashToken(rawToken) },
    });
    if (!inv) return { valid: false };
    if (inv.status !== VendorInvitationStatus.PENDING) {
      this.logger.warn(`Invitation lookup rejected: ${inv.id} is ${inv.status}`);
      return { valid: false };
    }
    if (inv.expiresAt.getTime() < Date.now()) {
      this.logger.warn(`Invitation lookup rejected: ${inv.id} expired ${inv.expiresAt.toISOString()}`);
      return { valid: false };
    }
    return { valid: true, email: inv.email, companyName: inv.companyName };
  }

  /**
   * Marks an invitation converted, inside the caller's registration transaction.
   *
   * Never throws. A registration must succeed whatever the state of the token —
   * a broken invite link is our problem, not the supplier's. Returns the
   * invitation id when it genuinely converted, otherwise null.
   *
   * The email match is what stops a forwarded link marking an unrelated signup
   * as converted.
   */
  async markAccepted(
    tx: Prisma.TransactionClient,
    rawToken: string,
    vendorId: string,
    vendorUserId: string,
    submittedEmail: string,
  ): Promise<string | null> {
    try {
      if (!rawToken || !/^[0-9a-f]{64}$/.test(rawToken)) return null;
      const inv = await tx.vendorInvitation.findUnique({
        where: { tokenHash: this.hashToken(rawToken) },
      });
      if (!inv) return null;
      if (inv.status !== VendorInvitationStatus.PENDING) return null;
      if (inv.expiresAt.getTime() < Date.now()) return null;
      if (inv.email !== submittedEmail.trim().toLowerCase()) {
        this.logger.warn(`Invitation ${inv.id} not converted: registered email differs from invited address`);
        return null;
      }

      await tx.vendorInvitation.update({
        where: { id: inv.id },
        data: {
          status: VendorInvitationStatus.ACCEPTED,
          acceptedAt: new Date(),
          acceptedVendorId: vendorId,
          acceptedVendorUserId: vendorUserId,
          updatedAt: new Date(),
        },
      });
      return inv.id;
    } catch (err) {
      this.logger.error(`markAccepted failed, registration continues regardless: ${err}`);
      return null;
    }
  }
}
