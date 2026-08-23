import {
  Injectable,
  Logger,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { randomBytes, randomUUID, createHash } from 'crypto';
import * as bcrypt from 'bcrypt';
import { TOTP } from 'otplib';
import { AuditRiskLevel, EnvelopeType, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CaptchaService } from '../../common/services/captcha.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';
import { SystemSettingsService } from '../system-settings/system-settings.service';
import { VendorDocumentStorageService } from '../vendors/vendor-document-storage.service';
// 2026-08-24: registry invitations — token lookup + conversion on registration.
import { VendorInvitationsService } from '../vendors/vendor-invitations.service';
import { VENDOR_DOC_TYPES, vendorDocTypeByCode } from './vendor-document-types';
import { VendorRegisterDto } from './dto/vendor-register.dto';
import { VendorLoginDto } from './dto/vendor-login.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { MfaVerifyVendorDto } from './dto/mfa-verify-vendor.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

export interface RequestContext {
  ipAddress?: string | null;
  userAgent?: string | null;
}

// BUG-137 (2026-06-19): pre-registration documents are uploaded anonymously
// (the vendor isn't authenticated yet — they're filling out the form). The
// upload endpoint stashes the raw bytes in storage + a pending entry in this
// in-memory map keyed by documentId. The submit-register call references the
// documentIds; the service moves the storage object into the vendor's tenant
// path + creates a VendorDocument row, then drops the pending entry.
// 15-minute TTL — abandoned uploads are GC'd by gcPending().
//
// Same pattern as BUG-129's NegotiationService.pendingPdfs.
interface PendingVendorDoc {
  documentId: string;
  storageKey: string;       // pending/<docId>-<name>
  originalFilename: string;
  fileSize: number;
  checksumSha256: string;
  uploadedAt: number;       // epoch ms
}
const PENDING_TTL_MS = 15 * 60 * 1000;

@Injectable()
export class VendorAuthService {
  private readonly logger = new Logger(VendorAuthService.name);

  private static readonly pendingDocs = new Map<string, PendingVendorDoc>();

  private static gcPending(): void {
    const cutoff = Date.now() - PENDING_TTL_MS;
    for (const [id, doc] of VendorAuthService.pendingDocs) {
      if (doc.uploadedAt < cutoff) VendorAuthService.pendingDocs.delete(id);
    }
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly captcha: CaptchaService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    private readonly settings: SystemSettingsService,
    // BUG-137: anonymous registration document storage.
    private readonly docStorage: VendorDocumentStorageService,
    private readonly invitations: VendorInvitationsService,
  ) {}

  // ------------------------------------------------- BUG-137 doc upload
  async uploadRegistrationDocument(file: {
    originalname: string;
    mimetype: string;
    size: number;
    buffer: Buffer;
  }): Promise<{ documentId: string; filename: string; sha256: string; fileSize: number }> {
    if (!file) throw new BadRequestException('File is required');
    if (file.mimetype !== 'application/pdf') {
      throw new BadRequestException('Only PDF files are accepted for vendor registration documents.');
    }
    const head = file.buffer?.subarray(0, 5).toString('ascii');
    if (head !== '%PDF-') {
      throw new BadRequestException('File does not appear to be a valid PDF.');
    }
    const MAX = 10 * 1024 * 1024;
    if (file.size > MAX) {
      throw new BadRequestException('File exceeds 10 MB limit.');
    }
    VendorAuthService.gcPending();
    const documentId = randomUUID();
    const result = await this.docStorage.write({
      keyPrefix: 'pending',
      docId: documentId,
      originalFilename: file.originalname,
      payload: file.buffer,
      mimeType: file.mimetype,
    });
    VendorAuthService.pendingDocs.set(documentId, {
      documentId,
      storageKey: result.storageKey,
      originalFilename: file.originalname,
      fileSize: result.fileSize,
      checksumSha256: result.checksumSha256,
      uploadedAt: Date.now(),
    });
    return {
      documentId,
      filename: file.originalname,
      sha256: result.checksumSha256,
      fileSize: result.fileSize,
    };
  }

  // BUG-112 (2026-06-07) Piece 4: mirror of admin auth helper. Read configured
  // idle timeout from system_settings (default 30) so the vendor JWT carries
  // the same `idleTimeoutMinutes` claim the admin JWT does. Reads via prisma
  // directly since SystemSettingsService doesn't expose a single-key getter.
  private async loadIdleTimeoutMinutes(): Promise<number> {
    try {
      const row = await this.prisma.systemSetting.findUnique({
        where: { key: 'session.idle_timeout_minutes' },
      });
      const n = row?.value ? Number(row.value) : NaN;
      return Number.isFinite(n) && n > 0 ? n : 30;
    } catch {
      return 30;
    }
  }

  // ---------------------------------------------------------------- register
  async register(dto: VendorRegisterDto, ctx: RequestContext = {}) {
    const captcha = await this.captcha.validate({
      token: dto.captchaToken,
      action: 'vendor_register',
      ipAddress: ctx.ipAddress ?? null,
      userAgent: ctx.userAgent ?? null,
    });
    if (!captcha.verified) throw new BadRequestException('CAPTCHA verification failed');

    const existing = await this.prisma.vendorUser.findUnique({ where: { email: dto.email } });
    if (existing) throw new BadRequestException('Email already registered');

    // BUG-137 (2026-06-19): validate that every REQUIRED registration document
    // type is present + every referenced documentId resolves to a pending
    // upload. Multi-type ("OTHER") may appear multiple times.
    VendorAuthService.gcPending();
    const docs = dto.documents ?? [];
    const typesPresent = new Set(docs.map(d => d.type));
    for (const t of VENDOR_DOC_TYPES) {
      if (t.required && !typesPresent.has(t.code)) {
        throw new BadRequestException(`Missing required registration document: ${t.label}`);
      }
    }
    const resolvedDocs: Array<{
      type: string;
      pending: PendingVendorDoc;
    }> = [];
    for (const d of docs) {
      const typeDef = vendorDocTypeByCode(d.type);
      if (!typeDef) throw new BadRequestException(`Unknown document type: ${d.type}`);
      const pending = VendorAuthService.pendingDocs.get(d.documentId);
      if (!pending) {
        throw new BadRequestException(
          `Document reference is invalid or expired: re-upload "${typeDef.label}" and try again.`,
        );
      }
      resolvedDocs.push({ type: d.type, pending });
    }

    const rounds = this.bcryptRounds();
    const passwordHash = await bcrypt.hash(dto.password, rounds);

    const { rawToken, tokenHash } = this.newToken();
    const ttlHours = Number(this.config.get<string>('auth.verifyEmailTtlHours') ?? 24);
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

    let acceptedInvitationId: string | null = null;
    const registration = await this.prisma.$transaction(async (tx: any) => {
      const vendor = await tx.vendor.create({
        data: {
          companyName: dto.companyName,
          companyNameAr: dto.companyNameAr?.trim() || null,
          // BUG-101 (2026-06-04): registrationNumber / taxNumber / country no
          // longer collected at registration intake — set later if needed.
          website: dto.website ?? null,
          address: dto.address ?? null,
          phone: dto.phone ?? null,
          status: 'PENDING',
        },
      });

      const vendorUser = await tx.vendorUser.create({
        data: {
          vendorId: vendor.id,
          email: dto.email,
          passwordHash,
          fullName: dto.companyName,
          isPrimaryContact: true,
        },
      });

      // BUG-137 (2026-06-19): persist VendorDocument rows. The pending
      // storage key (under `pending/...`) is reused as-is; the file content
      // is the same. We just record the row with vendor + type. No move
      // between namespaces needed.
      for (const r of resolvedDocs) {
        await tx.vendorDocument.create({
          data: {
            vendorId: vendor.id,
            documentType: r.type,
            originalFilename: r.pending.originalFilename,
            storageKey: r.pending.storageKey,
            mimeType: 'application/pdf',
            fileSize: BigInt(r.pending.fileSize),
            checksumSha256: r.pending.checksumSha256,
            uploadedByVendorUserId: vendorUser.id,
          },
        });
      }

      const req = await tx.vendorRegistrationRequest.create({
        data: {
          vendorId: vendor.id,
          companyName: dto.companyName,
          contactEmail: dto.email,
          captchaVerificationId: captcha.logId,
          submittedIp: ctx.ipAddress ?? null,
          submittedUserAgent: ctx.userAgent ?? null,
          status: 'PENDING_VERIFICATION',
        },
      });

      await tx.vendorEmailVerificationToken.create({
        data: { vendorUserId: vendorUser.id, tokenHash, expiresAt },
      });

      // 2026-08-24: if the registrant arrived from a registry invitation, mark
      // it converted inside THIS transaction, so a conversion can never be
      // recorded against a registration that rolled back. markAccepted never
      // throws — a broken invite link must not block a supplier signing up.
      if (dto.inviteToken) {
        acceptedInvitationId = await this.invitations.markAccepted(
          tx, dto.inviteToken, vendor.id, vendorUser.id, dto.email,
        );
      }

      return req;
    });

    // BUG-137: drop pending references so the in-memory map doesn't grow.
    // The storage objects themselves are now owned by the persisted rows.
    for (const r of resolvedDocs) {
      VendorAuthService.pendingDocs.delete(r.pending.documentId);
    }

    // BUG-144 (2026-06-19): template body references {{verifyUrl}} — compute
    // it server-side from the registered config so the email always carries an
    // absolute link the vendor can click.
    const portalUrl = this.config.get<string>('app.vendorPortalUrl') ?? '';
    const verifyUrl = `${portalUrl}/verify-email?token=${rawToken}`;
    await this.notifications.sendEmail(dto.email, 'vendor-verify-email', {
      token: rawToken,
      verifyUrl,
    });

    // 2026-08-24: record the conversion AFTER the transaction commits —
    // AuditService.log() opens its own transaction and takes an advisory lock,
    // so nesting it inside one deadlocks.
    if (acceptedInvitationId) {
      await this.audit.log({
        eventType: 'VENDOR_INVITATION_ACCEPTED',
        entityType: 'VendorInvitation',
        entityId: acceptedInvitationId,
        riskLevel: AuditRiskLevel.LOW,
        afterValue: { email: dto.email, registrationId: registration.id },
      });
    }

    return { registrationId: registration.id, status: 'PENDING_VERIFICATION' };
  }

  // -------------------------------------------------------- resolveInvite
  // Public lookup for the registration page. Always resolves — an invalid,
  // expired, revoked or already-used token returns { valid: false } rather than
  // an error, so a broken link never blocks a prospective supplier.
  async resolveInvite(rawToken: string) {
    return this.invitations.resolveByToken(rawToken);
  }

  // ------------------------------------------------------------ verifyEmail
  async verifyEmail(dto: VerifyEmailDto) {
    const tokenHash = this.hashToken(dto.token);
    const record = await this.prisma.vendorEmailVerificationToken.findUnique({ where: { tokenHash } });

    // BUG-151 (2026-06-22): collapse 3 distinct rejection messages into 1
    // generic message so an attacker can't use error-type to fingerprint a
    // captured token's state (invalid vs used vs expired). Detailed reason
    // kept in server log for support diagnostics.
    if (!record) {
      this.logger.warn('verifyEmail: token not found');
      throw new BadRequestException('Invalid or expired verification token');
    }
    if (record.usedAt) {
      this.logger.warn(`verifyEmail: token already used (id=${record.id})`);
      throw new BadRequestException('Invalid or expired verification token');
    }
    if (record.expiresAt < new Date()) {
      this.logger.warn(`verifyEmail: token expired (id=${record.id})`);
      throw new BadRequestException('Invalid or expired verification token');
    }

    await this.prisma.vendorEmailVerificationToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    });

    await this.prisma.vendorUser.update({
      where: { id: record.vendorUserId },
      data: { emailVerifiedAt: new Date() },
    });

    return { verified: true };
  }

  // ------------------------------------------------------------------ login
  async login(dto: VendorLoginDto) {
    const user = await this.prisma.vendorUser.findUnique({
      where: { email: dto.email },
      include: { vendor: true },
    });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedException('Account temporarily locked');
    }

    const passwordOk = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordOk) {
      await this.recordFailedLogin(user);
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.emailVerifiedAt) throw new ForbiddenException('Email not verified');
    if ((user as any).vendor.status !== 'APPROVED') throw new ForbiddenException('Vendor account not approved');
    if (user.status !== 'ACTIVE') throw new UnauthorizedException('Account is not active');

    await this.prisma.vendorUser.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
    });

    if (user.mfaEnabled) {
      const tempToken = this.jwt.sign(
        { sub: user.id, vendorMfaPending: true },
        { secret: this.config.get<string>('jwt.vendorSecret'), expiresIn: '5m' as never },
      );
      return { requiresMfa: true, tempToken };
    }

    return this.issueTokens(user);
  }

  // ----------------------------------------------------------------- logout
  async logout(vendorUserId: string) {
    await this.prisma.vendorUser.update({
      where: { id: vendorUserId },
      data: { tokenVersion: { increment: 1 } },
    });
  }

  // ---------------------------------------------------------------- refresh
  async refresh(refreshToken: string) {
    let payload: { sub: string; type: string; version: number };
    try {
      payload = this.jwt.verify(refreshToken, {
        secret: this.config.get<string>('jwt.refreshSecret'),
      }) as any;
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (payload.type !== 'vendor-refresh') throw new UnauthorizedException('Invalid token type');

    const user = await this.prisma.vendorUser.findUnique({ where: { id: payload.sub } });
    if (!user) throw new UnauthorizedException('Vendor user not found');
    if (payload.version !== user.tokenVersion) throw new UnauthorizedException('Refresh token revoked');

    const idleTimeoutMinutes = await this.loadIdleTimeoutMinutes();
    const accessToken = this.jwt.sign(
      { sub: user.id, email: user.email, vendorId: user.vendorId, idleTimeoutMinutes, type: 'vendor' },
      {
        secret: this.config.get<string>('jwt.vendorSecret'),
        expiresIn: this.config.get<string>('jwt.vendorExpiresIn') as never,
      },
    );
    return { accessToken };
  }

  // --------------------------------------------------------- forgotPassword
  // BUG-151 (2026-06-22): bot-flood + abuse hardening pack:
  //   (a) CAPTCHA validated at the top — refuses anonymous bot traffic
  //       cheaply before any DB / SMTP work.
  //   (b) Per-email cooldown — if a real reset was issued for this email in
  //       the last 60s, the request returns 204 without touching DB or SMTP.
  //       Anti-flood for vendors who already have a fresh token.
  //   (c) Audit log every attempt with sha256(email) (not the raw email) so
  //       the audit trail is searchable but isn't itself an enumeration
  //       oracle.
  //   (d) SMTP send is fire-and-forget via setImmediate so the response time
  //       is identical for hit vs miss — kills the timing-based enumeration
  //       oracle the synchronous await previously created.
  //   (e) Controller-level @Throttle({ 3/60s, 10/h }) caps per-IP volume.
  // Response remains 204 in both branches — no body-level enumeration.
  async forgotPassword(dto: ForgotPasswordDto, ctx: RequestContext = {}) {
    // (a) CAPTCHA first — anonymous endpoint.
    const captcha = await this.captcha.validate({
      token: dto.captchaToken,
      action: 'vendor_forgot_password',
      ipAddress: ctx.ipAddress ?? null,
      userAgent: ctx.userAgent ?? null,
    });
    if (!captcha.verified) {
      throw new BadRequestException('CAPTCHA verification failed');
    }

    // (c) Audit attempt — email hashed so audit table isn't an enumeration
    // oracle. Email lowercased before hash so casing doesn't fragment.
    const emailHashFull = createHash('sha256').update(dto.email.toLowerCase()).digest('hex');
    const emailHash = emailHashFull.slice(0, 16);
    await this.audit.log({
      eventType: 'VENDOR_PASSWORD_RESET_REQUESTED',
      entityType: 'VendorUser',
      // entityId intentionally omitted — we audit the request itself, not
      // any specific vendor user (the email hash carries the identifier).
      metadata: { emailHash, captchaLogId: String(captcha.logId ?? '') },
      riskLevel: AuditRiskLevel.LOW,
    });

    const user = await this.prisma.vendorUser.findUnique({ where: { email: dto.email } });
    if (!user) return;

    // (b) Per-email cooldown: if a real token was issued in the last 60s,
    // suppress send + DB write but still return 204 so the response shape
    // is identical (no enumeration channel via "we just sent one").
    const recentToken = await this.prisma.vendorPasswordResetToken.findFirst({
      where: { vendorUserId: user.id, usedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (recentToken && Date.now() - recentToken.createdAt.getTime() < 60_000) {
      return;
    }

    const { rawToken, tokenHash } = this.newToken();
    const ttlMin = Number(this.config.get<string>('auth.resetPasswordTtlMinutes') ?? 60);
    const expiresAt = new Date(Date.now() + ttlMin * 60 * 1000);

    await this.prisma.vendorPasswordResetToken.create({
      data: {
        vendorUserId: user.id,
        tokenHash,
        expiresAt,
        requestIp: ctx.ipAddress ?? null,
        requestUserAgent: ctx.userAgent ?? null,
      },
    });

    // BUG-030: pass the full reset URL so templates can render a clickable link.
    // BUG-144 (2026-06-19): use the registered app.vendorPortalUrl (always
    // present with a hardcoded staging default) so the link is always absolute.
    const portalUrl = this.config.get<string>('app.vendorPortalUrl') ?? '';
    const resetUrl = `${portalUrl}/reset-password?token=${rawToken}`;
    // (d) Fire-and-forget so response time is independent of SMTP latency
    // — kills the wall-clock timing oracle (~5ms miss vs ~200ms hit).
    const userEmail = user.email;
    setImmediate(() => {
      this.notifications
        .sendEmail(userEmail, 'vendor-reset-password', { token: rawToken, resetUrl })
        .catch(err => this.logger.warn(`vendor-reset-password send failed for ${emailHash}: ${(err as Error).message}`));
    });
  }

  // ---------------------------------------------------------- resetPassword
  async resetPassword(dto: ResetPasswordDto) {
    const tokenHash = this.hashToken(dto.token);
    const record = await this.prisma.vendorPasswordResetToken.findUnique({ where: { tokenHash } });

    // BUG-151 (2026-06-22): same generic-message treatment as verifyEmail.
    if (!record) {
      this.logger.warn('resetPassword: token not found');
      throw new BadRequestException('Invalid or expired reset token');
    }
    if (record.usedAt) {
      this.logger.warn(`resetPassword: token already used (id=${record.id})`);
      throw new BadRequestException('Invalid or expired reset token');
    }
    if (record.expiresAt < new Date()) {
      this.logger.warn(`resetPassword: token expired (id=${record.id})`);
      throw new BadRequestException('Invalid or expired reset token');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, this.bcryptRounds());

    await this.prisma.vendorPasswordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    });

    await this.prisma.vendorUser.update({
      where: { id: record.vendorUserId },
      data: {
        passwordHash,
        failedLoginCount: 0,
        lockedUntil: null,
        tokenVersion: { increment: 1 },
      },
    });
  }

  // ------------------------------------------------------------- verifyMfa
  async verifyMfa(dto: MfaVerifyVendorDto) {
    let payload: { sub: string; vendorMfaPending?: boolean };
    try {
      payload = this.jwt.verify(dto.tempToken, {
        secret: this.config.get<string>('jwt.vendorSecret'),
      }) as any;
    } catch {
      throw new UnauthorizedException('Invalid or expired MFA token');
    }
    if (!payload.vendorMfaPending) throw new UnauthorizedException('Invalid token type');

    const user = await this.prisma.vendorUser.findUnique({ where: { id: payload.sub } });
    if (!user || !user.mfaSecret) throw new UnauthorizedException('MFA not configured');

    const valid = await new TOTP().verify(dto.code, { secret: user.mfaSecret });
    if (!valid) throw new UnauthorizedException('Invalid MFA code');

    return this.issueTokens(user);
  }

  // ----------------------------------------------------------------- helpers
  private async recordFailedLogin(user: { id: string; failedLoginCount: number }) {
    const max = Number(this.config.get<string>('auth.maxFailedLogins') ?? 5);
    const lockoutMin = Number(this.config.get<string>('auth.lockoutMinutes') ?? 15);
    const nextCount = user.failedLoginCount + 1;
    const lock = nextCount >= max ? new Date(Date.now() + lockoutMin * 60 * 1000) : null;

    await this.prisma.vendorUser.update({
      where: { id: user.id },
      data: {
        failedLoginCount: { increment: 1 },
        lockedUntil: lock,
      },
    });
  }

  private async issueTokens(user: { id: string; email: string; vendorId: string; tokenVersion: number }) {
    const idleTimeoutMinutes = await this.loadIdleTimeoutMinutes();
    const accessToken = this.jwt.sign(
      { sub: user.id, email: user.email, vendorId: user.vendorId, idleTimeoutMinutes, type: 'vendor' },
      {
        secret: this.config.get<string>('jwt.vendorSecret'),
        expiresIn: this.config.get<string>('jwt.vendorExpiresIn') as never,
      },
    );
    const refreshToken = this.jwt.sign(
      { sub: user.id, type: 'vendor-refresh', version: user.tokenVersion },
      {
        secret: this.config.get<string>('jwt.refreshSecret'),
        expiresIn: this.config.get<string>('jwt.refreshExpiresIn') as never,
      },
    );
    return { accessToken, refreshToken, requiresMfa: false };
  }

  private newToken() {
    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(rawToken);
    return { rawToken, tokenHash };
  }

  private hashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  private bcryptRounds(): number {
    return Number(this.config.get<string>('auth.bcryptRounds') ?? 12);
  }

  // ============================================================================
  // Self-service profile + bid list (vendor JWT scoped)
  // ============================================================================

  async getProfile(vendorId: string) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { id: vendorId },
      include: {
        vendorUsers: {
          where: { isPrimaryContact: true },
          take: 1,
          select: {
            id: true,
            email: true,
            fullName: true,
            phone: true,
            emailVerifiedAt: true,
            lastLoginAt: true,
            mfaEnabled: true,
          },
        },
      },
    });
    if (!vendor) throw new BadRequestException('Vendor not found');
    const primary = vendor.vendorUsers[0];
    return {
      vendor: {
        id: vendor.id,
        companyName: vendor.companyName,
        companyNameAr: vendor.companyNameAr ?? null,
        registrationNumber: vendor.registrationNumber ?? undefined,
        taxNumber: vendor.taxNumber ?? undefined,
        country: vendor.country ?? undefined,
        address: vendor.address ?? undefined,
        phone: vendor.phone ?? undefined,
        website: vendor.website ?? undefined,
        status: vendor.status,
        registeredAt: vendor.createdAt.toISOString(),
        approvedAt: vendor.approvedAt?.toISOString() ?? null,
      },
      primaryContact: primary
        ? {
            id: primary.id,
            email: primary.email,
            fullName: primary.fullName,
            phone: primary.phone ?? undefined,
            emailVerified: !!primary.emailVerifiedAt,
            lastLoginAt: primary.lastLoginAt?.toISOString() ?? null,
            mfaEnabled: primary.mfaEnabled,
          }
        : null,
    };
  }

  async updateProfile(vendorId: string, actorVendorUserId: string, dto: UpdateProfileDto) {
    const vendorPatch: Prisma.VendorUpdateInput = {};
    if (dto.companyName !== undefined) vendorPatch.companyName = dto.companyName;
    // Blank clears it — the dashboard then falls back to companyName.
    if (dto.companyNameAr !== undefined) vendorPatch.companyNameAr = dto.companyNameAr?.trim() || null;
    if (dto.taxNumber !== undefined) vendorPatch.taxNumber = dto.taxNumber;
    if (dto.country !== undefined) vendorPatch.country = dto.country;
    if (dto.address !== undefined) vendorPatch.address = dto.address;
    if (dto.phone !== undefined) vendorPatch.phone = dto.phone;
    if (dto.website !== undefined) vendorPatch.website = dto.website;

    const userPatch: Prisma.VendorUserUpdateInput = {};
    if (dto.contactFullName !== undefined) userPatch.fullName = dto.contactFullName;
    if (dto.contactPhone !== undefined) userPatch.phone = dto.contactPhone;

    if (Object.keys(vendorPatch).length === 0 && Object.keys(userPatch).length === 0) {
      return this.getProfile(vendorId);
    }

    const before = await this.prisma.vendor.findUnique({
      where: { id: vendorId },
      include: {
        vendorUsers: {
          where: { isPrimaryContact: true },
          take: 1,
          select: { id: true, fullName: true, phone: true },
        },
      },
    });
    if (!before) throw new BadRequestException('Vendor not found');

    const ops: Prisma.PrismaPromise<unknown>[] = [];
    if (Object.keys(vendorPatch).length > 0) {
      ops.push(this.prisma.vendor.update({ where: { id: vendorId }, data: vendorPatch }));
    }
    if (Object.keys(userPatch).length > 0 && before.vendorUsers[0]) {
      ops.push(
        this.prisma.vendorUser.update({
          where: { id: before.vendorUsers[0].id },
          data: userPatch,
        }),
      );
    }
    await this.prisma.$transaction(ops);

    await this.audit.log({
      eventType: 'VENDOR_PROFILE_UPDATED',
      entityType: 'Vendor',
      entityId: vendorId,
      vendorId,
      actorVendorUserId,
      beforeValue: {
        companyName: before.companyName,
        taxNumber: before.taxNumber,
        country: before.country,
        address: before.address,
        phone: before.phone,
        website: before.website,
        contactFullName: before.vendorUsers[0]?.fullName,
        contactPhone: before.vendorUsers[0]?.phone,
      },
      afterValue: { ...vendorPatch, ...userPatch },
      riskLevel: AuditRiskLevel.MEDIUM,
    });

    return this.getProfile(vendorId);
  }

  async listMyBids(vendorId: string, page: number, pageSize: number) {
    const skip = (Math.max(1, page) - 1) * pageSize;
    const [total, bids] = await this.prisma.$transaction([
      this.prisma.bid.count({ where: { vendorId } }),
      this.prisma.bid.findMany({
        where: { vendorId },
        skip,
        take: pageSize,
        orderBy: [{ updatedAt: 'desc' }],
        include: {
          tender: { select: { id: true, reference: true, title: true, status: true, submissionCloseAt: true } },
          bidEnvelopes: { select: { envelopeType: true, status: true } },
          bidSubmissionReceipt: { select: { receiptNumber: true, generatedAt: true } },
        },
      }),
    ]);

    return {
      page,
      pageSize,
      total,
      items: bids.map(b => {
        const tech = b.bidEnvelopes.find(e => e.envelopeType === EnvelopeType.TECHNICAL);
        const comm = b.bidEnvelopes.find(e => e.envelopeType === EnvelopeType.COMMERCIAL);
        return {
          id: b.id,
          tenderId: b.tenderId,
          tenderReference: b.tender.reference,
          tenderTitle: b.tender.title,
          tenderStatus: b.tender.status,
          submissionDeadline: b.tender.submissionCloseAt?.toISOString() ?? null,
          status: b.status,
          submittedAt: b.submittedAt?.toISOString() ?? null,
          technicalResult: b.technicalResult === 'PENDING' ? undefined : b.technicalResult,
          technicalEnvelopeStatus: tech?.status ?? 'DRAFT',
          commercialEnvelopeStatus: comm?.status ?? 'DRAFT',
          receiptNumber: b.bidSubmissionReceipt?.receiptNumber ?? undefined,
        };
      }),
    };
  }
}
