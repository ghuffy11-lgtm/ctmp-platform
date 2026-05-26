import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
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

type ProviderResult = { ok: boolean; errorCode?: string };

@Injectable()
export class CaptchaService implements OnModuleInit {
  private readonly logger = new Logger(CaptchaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    const provider = this.providerName();
    const nodeEnv = this.config.get<string>('app.nodeEnv') ?? 'development';
    const allowStubInProd = this.config.get<boolean>('captcha.allowStubInProd') ?? false;

    if (provider === 'stub' && nodeEnv === 'production' && !allowStubInProd) {
      throw new Error(
        'CAPTCHA_PROVIDER=stub is not allowed in production. Set CAPTCHA_PROVIDER=hcaptcha and CAPTCHA_SECRET_KEY, ' +
          'or set CAPTCHA_ALLOW_STUB_IN_PROD=true to opt out of this safety check (NOT recommended).',
      );
    }
    if (provider === 'stub') {
      this.logger.warn('CAPTCHA running in STUB mode — non-empty tokens pass without verification. DEV ONLY.');
    } else if (provider === 'hcaptcha') {
      const hasSecret = (this.config.get<string>('captcha.secretKey') ?? '').length > 0;
      if (!hasSecret) {
        throw new Error('CAPTCHA_PROVIDER=hcaptcha requires CAPTCHA_SECRET_KEY to be set.');
      }
      this.logger.log('CAPTCHA provider: hCaptcha (production)');
    } else {
      this.logger.warn(`Unknown CAPTCHA_PROVIDER='${provider}' — all verifications will fail closed.`);
    }
  }

  async validate(ctx: CaptchaValidationContext): Promise<CaptchaValidationResult> {
    const provider = this.providerName();
    const { ok, errorCode } = await this.callProvider(provider, ctx);

    const log = await this.prisma.captchaVerificationLog.create({
      data: {
        targetAction: ctx.action,
        provider,
        ipAddress: ctx.ipAddress ?? null,
        userAgent: ctx.userAgent ?? null,
        result: ok ? 'SUCCESS' : 'FAILURE',
        errorCode: ok ? null : (errorCode ?? 'INVALID_TOKEN'),
      },
    });

    return { verified: ok, logId: log.id, errorCode: ok ? null : (errorCode ?? 'INVALID_TOKEN') };
  }

  private providerName(): string {
    return (this.config.get<string>('captcha.provider') ?? 'stub').toLowerCase();
  }

  private async callProvider(provider: string, ctx: CaptchaValidationContext): Promise<ProviderResult> {
    if (provider === 'stub') {
      return { ok: ctx.token !== '' && ctx.token !== 'invalid' };
    }
    if (provider === 'hcaptcha') {
      return this.verifyHcaptcha(ctx);
    }
    return { ok: false, errorCode: 'UNKNOWN_PROVIDER' };
  }

  private async verifyHcaptcha(ctx: CaptchaValidationContext): Promise<ProviderResult> {
    if (!ctx.token) return { ok: false, errorCode: 'MISSING_TOKEN' };

    const secret = this.config.get<string>('captcha.secretKey') ?? '';
    const verifyUrl = this.config.get<string>('captcha.verifyUrl') ?? 'https://hcaptcha.com/siteverify';
    const timeoutMs = this.config.get<number>('captcha.timeoutMs') ?? 5000;

    const body = new URLSearchParams({ secret, response: ctx.token });
    if (ctx.ipAddress) body.append('remoteip', ctx.ipAddress);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(verifyUrl, {
        method: 'POST',
        body,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        signal: controller.signal,
      });
      if (!res.ok) {
        this.logger.warn(`hCaptcha verify HTTP ${res.status}`);
        return { ok: false, errorCode: `HTTP_${res.status}` };
      }
      const payload = (await res.json()) as { success?: boolean; 'error-codes'?: string[] };
      if (payload.success === true) return { ok: true };
      const code = payload['error-codes']?.[0] ?? 'VERIFY_FAILED';
      return { ok: false, errorCode: code };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`hCaptcha verify error: ${msg}`);
      return { ok: false, errorCode: controller.signal.aborted ? 'TIMEOUT' : 'NETWORK_ERROR' };
    } finally {
      clearTimeout(timer);
    }
  }
}
