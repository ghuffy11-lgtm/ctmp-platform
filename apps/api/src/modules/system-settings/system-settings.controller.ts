import { Body, Controller, Get, Headers, Param, Post, Res, UploadedFile, UseGuards, UseInterceptors, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SystemSettingsService } from './system-settings.service';
import { SecureSettingsService } from './secure-settings.service';
import { BrandingService } from './branding.service';

interface SettingUpdate {
  key: string;
  value: string;
}

@ApiTags('system-settings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('system-settings')
export class SystemSettingsController {
  constructor(
    private readonly service: SystemSettingsService,
    private readonly secure: SecureSettingsService,
    private readonly branding: BrandingService,
  ) {}

  @Get()
  @RequirePermissions('system:configure')
  @ApiOperation({ operationId: 'listSystemSettings', summary: 'List all platform settings grouped by category' })
  list() {
    return this.service.list();
  }

  @Post('batch')
  @RequirePermissions('system:configure')
  @ApiOperation({ operationId: 'updateSystemSettings', summary: 'Batch update plaintext platform settings; atomic + audited' })
  batchUpdate(
    @Body('updates') updates: SettingUpdate[],
    @CurrentUser('id') userId: string,
  ) {
    return this.service.batchUpdate(updates, userId);
  }

  // BUG-107 Piece 5: encrypted-settings write path. Plaintext goes in, AES-GCM
  // ciphertext goes into encrypted_value column, never echoed back via list().
  @Post('secure')
  @RequirePermissions('system:configure')
  @ApiOperation({ operationId: 'updateSecureSetting', summary: 'Set an encrypted-at-rest secret (e.g. smtp.password)' })
  async secureUpdate(
    @Body() body: { key: string; value: string },
    @CurrentUser('id') userId: string,
  ) {
    if (!body?.key) throw new BadRequestException('key required');
    if (typeof body.value !== 'string') throw new BadRequestException('value must be a string (empty string clears)');
    await this.secure.setEncrypted(body.key, body.value, userId);
    return { key: body.key, ok: true };
  }

  // BUG-107 Piece 3: branding logo upload.
  @Post('branding/upload')
  @RequirePermissions('system:configure')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 2_000_000 } }))
  @ApiOperation({ operationId: 'uploadBrandingLogo', summary: 'Upload a branding logo (type: vendor_logo | report_logo)' })
  async uploadLogo(
    @Body('type') type: string,
    @UploadedFile() file: { buffer: Buffer; mimetype: string; size: number } | undefined,
    @CurrentUser('id') userId: string,
  ) {
    if (!file) throw new BadRequestException('file required');
    return this.branding.upload(type, file, userId);
  }

  // BUG-107 Piece 5: send a test email through the *current* SMTP config (DB
  // first, env fallback) to confirm settings before saving.
  @Post('test-smtp')
  @RequirePermissions('system:configure')
  @ApiOperation({ operationId: 'testSmtp', summary: 'Send a one-shot test email through current SMTP config' })
  testSmtp(@Body() body: { to: string }) {
    if (!body?.to) throw new BadRequestException('to required');
    return this.service.testSmtp(body.to);
  }

  // BUG-107 Piece 5: probe LDAP bind with provided creds against the *current*
  // AD config. Doesn't store anything; just exercises the bind+unbind path.
  @Post('test-ad')
  @RequirePermissions('system:configure')
  @ApiOperation({ operationId: 'testAd', summary: 'Probe LDAP bind with the supplied credentials' })
  testAd(@Body() body: { username: string; password: string }) {
    if (!body?.username || !body?.password) throw new BadRequestException('username + password required');
    return this.service.testAd(body.username, body.password);
  }
}

// BUG-107 Pieces 2 + 3: public read paths. No auth — vendor portal renders
// the system name + logo at the login page before any user exists. Browser
// caches via standard HTTP caching headers we set on the logo response.
@ApiTags('public')
@Controller()
export class PublicBrandingController {
  constructor(
    private readonly service: SystemSettingsService,
    private readonly branding: BrandingService,
  ) {}

  @Public()
  @Get('public-branding')
  @ApiOperation({ operationId: 'getPublicBranding', summary: 'Public read of system name + logo availability flags' })
  async getBranding() {
    return this.service.getPublicBranding();
  }

  @Public()
  @Get('branding/:type')
  @ApiOperation({ operationId: 'getBrandingLogo', summary: 'Stream a branding logo image' })
  async getLogo(@Param('type') type: string, @Res() res: Response) {
    const { stream, contentType } = await this.branding.serve(type);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=300'); // 5 min — long enough to be cheap, short enough to pick up new logo
    (stream as any).pipe(res);
  }
}
