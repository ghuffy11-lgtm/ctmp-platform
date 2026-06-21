import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Client } from 'ldapts';
import { TOTP } from 'otplib';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../database/prisma.service';
import { LoginDto } from './dto/login.dto';
import { MfaVerifyDto } from './dto/mfa-verify.dto';
import { SystemSettingsService } from '../system-settings/system-settings.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly settings: SystemSettingsService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findFirst({
      where: { OR: [{ adUsername: dto.username }, { email: dto.username }] },
    });
    if (!user) throw new UnauthorizedException('Invalid credentials');
    if (user.status !== 'ACTIVE') throw new UnauthorizedException('User account is inactive');

    // Check lockout for LOCAL auth users
    if (user.authType === 'LOCAL' && user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedException('Account temporarily locked');
    }

    let authenticated = false;
    if (user.authType === 'LOCAL') {
      if (!user.passwordHash) throw new UnauthorizedException('Invalid credentials');
      authenticated = await bcrypt.compare(dto.password, user.passwordHash);
      if (!authenticated) {
        await this.recordFailedLogin(user);
        throw new UnauthorizedException('Invalid credentials');
      }
    } else {
      authenticated = await this.bindToAd(dto.username, dto.password);
      if (!authenticated) throw new UnauthorizedException('Invalid credentials');
    }

    // Reset failed login count on successful auth
    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
    });

    if (user.mfaEnabled) {
      const tempToken = this.jwt.sign(
        { sub: user.id, mfaPending: true },
        { secret: this.config.get<string>('jwt.secret'), expiresIn: '5m' as never },
      );
      return { requiresMfa: true, tempToken };
    }

    return this.issueTokens(user);
  }

  async logout(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { tokenVersion: { increment: 1 } },
    });
  }

  async refresh(refreshToken: string) {
    let payload: { sub: string; type: string; version: number };
    try {
      payload = this.jwt.verify(refreshToken, {
        secret: this.config.get<string>('jwt.refreshSecret'),
      }) as any;
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (payload.type !== 'refresh') throw new UnauthorizedException('Invalid token type');

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) throw new UnauthorizedException('User not found');
    if (payload.version !== user.tokenVersion) throw new UnauthorizedException('Refresh token has been revoked');

    const [permissions, departments, hiddenSidebarItems, sidebarLabelOverrides, idleTimeoutMinutes] = await Promise.all([
      this.loadPermissions(user.id),
      this.loadDepartments(user.id),
      this.loadHiddenSidebarItems(user.id),
      this.loadSidebarLabelOverrides(user.id),
      this.loadIdleTimeoutMinutes(),
    ]);
    const accessToken = this.jwt.sign(
      { sub: user.id, username: user.adUsername ?? user.email, permissions, departments, hiddenSidebarItems, sidebarLabelOverrides, idleTimeoutMinutes, type: 'internal' },
      { secret: this.config.get<string>('jwt.secret'), expiresIn: this.config.get<string>('jwt.expiresIn') as never },
    );
    return { accessToken };
  }

  async verifyMfa(dto: MfaVerifyDto) {
    let payload: { sub: string; mfaPending?: boolean };
    try {
      payload = this.jwt.verify(dto.tempToken, {
        secret: this.config.get<string>('jwt.secret'),
      }) as any;
    } catch {
      throw new UnauthorizedException('Invalid or expired MFA token');
    }

    if (!payload.mfaPending) throw new UnauthorizedException('Invalid token type');

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.mfaSecret) throw new UnauthorizedException('MFA not configured');

    const valid = await new TOTP().verify(dto.code, { secret: user.mfaSecret });
    if (!valid) throw new UnauthorizedException('Invalid MFA code');

    return this.issueTokens(user);
  }

  async validateUser(username: string, password: string) {
    const bound = await this.bindToAd(username, password);
    if (!bound) return null;
    return this.prisma.user.findUnique({ where: { adUsername: username } });
  }

  private async issueTokens(user: { id: string; adUsername: string | null; email: string; tokenVersion: number }) {
    const [permissions, departments, hiddenSidebarItems, sidebarLabelOverrides, idleTimeoutMinutes] = await Promise.all([
      this.loadPermissions(user.id),
      this.loadDepartments(user.id),
      this.loadHiddenSidebarItems(user.id),
      this.loadSidebarLabelOverrides(user.id),
      this.loadIdleTimeoutMinutes(),
    ]);

    const accessToken = this.jwt.sign(
      { sub: user.id, username: user.adUsername ?? user.email, permissions, departments, hiddenSidebarItems, sidebarLabelOverrides, idleTimeoutMinutes, type: 'internal' },
      { secret: this.config.get<string>('jwt.secret'), expiresIn: this.config.get<string>('jwt.expiresIn') as never },
    );

    const refreshToken = this.jwt.sign(
      { sub: user.id, type: 'refresh', version: user.tokenVersion },
      { secret: this.config.get<string>('jwt.refreshSecret'), expiresIn: this.config.get<string>('jwt.refreshExpiresIn') as never },
    );

    return { accessToken, refreshToken, requiresMfa: false };
  }

  private async loadPermissions(userId: string): Promise<string[]> {
    const userRoles = await this.prisma.userRole.findMany({
      where: { userId },
      include: {
        role: {
          include: {
            rolePermissions: { include: { permission: true } },
          },
        },
      },
    });

    return userRoles.flatMap((ur: any) =>
      ur.role.rolePermissions.map((rp: any) => rp.permission.code as string),
    );
  }

  // BUG-093 (2026-06-02): union of every role's `hiddenSidebarItems` for the
  // user. Sidebar entries here are hidden in the UI regardless of permissions.
  // If a user holds multiple roles, any single role saying "hide" hides the
  // entry — owner's intent ("hide for executive users") matches union semantics.
  private async loadHiddenSidebarItems(userId: string): Promise<string[]> {
    const rows = await this.prisma.userRole.findMany({
      where: { userId },
      include: { role: { select: { hiddenSidebarItems: true } } },
    });
    const set = new Set<string>();
    for (const r of rows) {
      for (const h of r.role.hiddenSidebarItems ?? []) set.add(h);
    }
    return Array.from(set);
  }

  // BUG-107 Piece 4 (2026-06-05): merge sidebar label overrides across the
  // user's roles. Key = sidebar href, value = custom label. First non-empty
  // override per href wins (roles ordered by granted_at ascending). Sidebar
  // applies overrides at render with fallback to the hardcoded label.
  private async loadSidebarLabelOverrides(userId: string): Promise<Record<string, string>> {
    const rows = await this.prisma.userRole.findMany({
      where: { userId },
      include: { role: { select: { sidebarLabelOverrides: true, code: true } } },
      orderBy: { grantedAt: 'asc' },
    });
    const merged: Record<string, string> = {};
    for (const r of rows) {
      const overrides = r.role.sidebarLabelOverrides as Record<string, string> | null;
      if (!overrides || typeof overrides !== 'object') continue;
      for (const [href, label] of Object.entries(overrides)) {
        if (typeof label !== 'string' || label.trim() === '') continue;
        if (!(href in merged)) merged[href] = label.trim();
      }
    }
    return merged;
  }

  // BUG-112 (2026-06-07) Piece 4: read configured idle timeout (in minutes)
  // from system_settings. Frontend reads this off the JWT to drive its
  // inactivity timer. Default 30 if unset or unparseable. Reads via prisma
  // directly (the setting is plain, not encrypted, and SystemSettingsService
  // doesn't expose a single-key getter).
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

  private async loadDepartments(userId: string): Promise<string[]> {
    // BUG-028 Part B: carry the caller's department membership on the JWT so
    // downstream services can auto-scope reads. SYSTEM_ADMIN / AUDITOR /
    // PROCUREMENT_ADMIN bypass scoping via `system:view_all_departments`.
    const rows = await this.prisma.userDepartment.findMany({
      where: { userId },
      select: { departmentId: true },
    });
    return rows.map(r => r.departmentId);
  }

  private async recordFailedLogin(user: { id: string; failedLoginCount: number }) {
    const max = Number(this.config.get<string>('auth.maxFailedLogins') ?? 5);
    const lockoutMin = Number(this.config.get<string>('auth.lockoutMinutes') ?? 15);
    const nextCount = user.failedLoginCount + 1;
    const lock = nextCount >= max ? new Date(Date.now() + lockoutMin * 60 * 1000) : null;

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: { increment: 1 },
        lockedUntil: lock,
      },
    });
  }

  private async bindToAd(username: string, password: string): Promise<boolean> {
    // BUG-107 Piece 5: AD config from DB-first, env fallback.
    const cfg = await this.settings.resolveAdConfig();
    if (!cfg.url || !cfg.domain) return false;
    const client = new Client({ url: cfg.url });
    try {
      await client.bind(`${username}@${cfg.domain}`, password);
      await client.unbind();
      return true;
    } catch {
      return false;
    }
  }
}
