import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
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
    // TODO: validate AD credentials via ldapts, check user exists in DB, handle MFA
    throw new Error('Not implemented');
  }

  async logout(userId: string) {
    // TODO: invalidate refresh token in DB
    throw new Error('Not implemented');
  }

  async refresh(refreshToken: string) {
    // TODO: verify refresh token, issue new access token
    throw new Error('Not implemented');
  }

  async verifyMfa(dto: MfaVerifyDto) {
    // TODO: verify TOTP code, complete login, issue access token
    throw new Error('Not implemented');
  }

  async validateUser(username: string, password: string) {
    // TODO: AD bind attempt
    return null;
  }
}
