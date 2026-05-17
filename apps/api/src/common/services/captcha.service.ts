import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';

export interface CaptchaValidationContext {
  token: string;
  action: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface CaptchaValidationResult {
  verified: boolean;
  logId: bigint;
  score?: number | null;
  errorCode?: string | null;
}

@Injectable()
export class CaptchaService {
  private readonly logger = new Logger(CaptchaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async validate(ctx: CaptchaValidationContext): Promise<CaptchaValidationResult> {
    const provider = this.config.get<string>('captcha.provider') ?? 'stub';
    const verified = await this.callProvider(provider, ctx.token);

    const log = await this.prisma.captchaVerificationLog.create({
      data: {
        targetAction: ctx.action,
        provider,
        ipAddress: ctx.ipAddress ?? null,
        userAgent: ctx.userAgent ?? null,
        result: verified ? 'SUCCESS' : 'FAILURE',
        errorCode: verified ? null : 'INVALID_TOKEN',
      },
    });

    return { verified, logId: log.id, errorCode: verified ? null : 'INVALID_TOKEN' };
  }

  private async callProvider(provider: string, token: string): Promise<boolean> {
    if (provider === 'stub') {
      return token !== '' && token !== 'invalid';
    }
    // TODO: hCaptcha / reCAPTCHA HTTP call
    return false;
  }
}
