import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Client } from 'ldapts';
import { TOTP } from 'otplib';
import { PrismaService } from '../../database/prisma.service';
import { LoginDto } from './dto/login.dto';
import { MfaVerifyDto } from './dto/mfa-verify.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login(dto: LoginDto) {
    const bound = await this.bindToAd(dto.username, dto.password);
    if (!bound) throw new UnauthorizedException('Invalid credentials');

    const user = await this.prisma.user.findUnique({ where: { adUsername: dto.username } });
    if (!user) throw new UnauthorizedException('User account not found');
    if (user.status !== 'ACTIVE') throw new UnauthorizedException('User account is inactive');

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
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

    const permissions = await this.loadPermissions(user.id);
    const accessToken = this.jwt.sign(
      { sub: user.id, username: user.adUsername ?? user.email, permissions, type: 'internal' },
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
    const permissions = await this.loadPermissions(user.id);

    const accessToken = this.jwt.sign(
      { sub: user.id, username: user.adUsername ?? user.email, permissions, type: 'internal' },
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

  private async bindToAd(username: string, password: string): Promise<boolean> {
    const url = this.config.get<string>('ad.url') ?? '';
    const domain = this.config.get<string>('ad.domain') ?? '';
    const client = new Client({ url });
    try {
      await client.bind(`${username}@${domain}`, password);
      await client.unbind();
      return true;
    } catch {
      return false;
    }
  }
}
