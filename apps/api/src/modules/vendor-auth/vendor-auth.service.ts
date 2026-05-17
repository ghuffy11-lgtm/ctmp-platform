import {
  Injectable,
  Logger,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { randomBytes, createHash } from 'crypto';
import * as bcrypt from 'bcrypt';
import { TOTP } from 'otplib';
import { PrismaService } from '../../database/prisma.service';
import { CaptchaService } from '../../common/services/captcha.service';
import { NotificationsService } from '../notifications/notifications.service';
import { VendorRegisterDto } from './dto/vendor-register.dto';
import { VendorLoginDto } from './dto/vendor-login.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { MfaVerifyVendorDto } from './dto/mfa-verify-vendor.dto';

export interface RequestContext {
  ipAddress?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class VendorAuthService {
  private readonly logger = new Logger(VendorAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly captcha: CaptchaService,
    private readonly notifications: NotificationsService,
  ) {}

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

    const rounds = this.bcryptRounds();
    const passwordHash = await bcrypt.hash(dto.password, rounds);

    const { rawToken, tokenHash } = this.newToken();
    const ttlHours = Number(this.config.get<string>('auth.verifyEmailTtlHours') ?? 24);
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

    const registration = await this.prisma.$transaction(async (tx: any) => {
      const vendor = await tx.vendor.create({
        data: { companyName: dto.companyName, status: 'PENDING' },
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

      return req;
    });

    await this.notifications.sendEmail(dto.email, 'vendor-verify-email', { token: rawToken });

    return { registrationId: registration.id, status: 'PENDING_VERIFICATION' };
  }

  // ------------------------------------------------------------ verifyEmail
  async verifyEmail(dto: VerifyEmailDto) {
    const tokenHash = this.hashToken(dto.token);
    const record = await this.prisma.vendorEmailVerificationToken.findUnique({ where: { tokenHash } });

    if (!record) throw new BadRequestException('Invalid verification token');
    if (record.usedAt) throw new BadRequestException('Verification token already used');
    if (record.expiresAt < new Date()) throw new BadRequestException('Verification token expired');

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

    const accessToken = this.jwt.sign(
      { sub: user.id, email: user.email, vendorId: user.vendorId, type: 'vendor' },
      {
        secret: this.config.get<string>('jwt.vendorSecret'),
        expiresIn: this.config.get<string>('jwt.vendorExpiresIn') as never,
      },
    );
    return { accessToken };
  }

  // --------------------------------------------------------- forgotPassword
  async forgotPassword(dto: ForgotPasswordDto, ctx: RequestContext = {}) {
    const user = await this.prisma.vendorUser.findUnique({ where: { email: dto.email } });
    if (!user) return;

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

    await this.notifications.sendEmail(user.email, 'vendor-reset-password', { token: rawToken });
  }

  // ---------------------------------------------------------- resetPassword
  async resetPassword(dto: ResetPasswordDto) {
    const tokenHash = this.hashToken(dto.token);
    const record = await this.prisma.vendorPasswordResetToken.findUnique({ where: { tokenHash } });

    if (!record) throw new BadRequestException('Invalid reset token');
    if (record.usedAt) throw new BadRequestException('Reset token already used');
    if (record.expiresAt < new Date()) throw new BadRequestException('Reset token expired');

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

  private issueTokens(user: { id: string; email: string; vendorId: string; tokenVersion: number }) {
    const accessToken = this.jwt.sign(
      { sub: user.id, email: user.email, vendorId: user.vendorId, type: 'vendor' },
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
}
