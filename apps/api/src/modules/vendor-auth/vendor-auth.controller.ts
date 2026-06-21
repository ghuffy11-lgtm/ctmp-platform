import {
  Controller,
  Post,
  Patch,
  Get,
  Body,
  HttpCode,
  HttpStatus,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { VendorJwtAuthGuard } from '../../common/guards/vendor-jwt.guard';
import { VendorAuthService } from './vendor-auth.service';
import { VendorRegisterDto } from './dto/vendor-register.dto';
import { VendorLoginDto } from './dto/vendor-login.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { MfaVerifyVendorDto } from './dto/mfa-verify-vendor.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

@ApiTags('vendor-auth')
@Controller('vendor-auth')
export class VendorAuthController {
  constructor(private readonly vendorAuthService: VendorAuthService) {}

  @Public()
  // BUG-151 (2026-06-22): per-IP rate-limit for anonymous registration.
  @Throttle({ short: { limit: 2, ttl: 60_000 }, long: { limit: 10, ttl: 3_600_000 } })
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ operationId: 'registerVendor', summary: 'Vendor self-registration with CAPTCHA' })
  register(@Body() dto: VendorRegisterDto, @Req() req: Request) {
    return this.vendorAuthService.register(dto, {
      ipAddress: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
    });
  }

  // BUG-137 (2026-06-19): anonymous registration-document upload. Returns
  // a pending documentId that the vendor then references in POST /register.
  // 10 MB max, PDF-only. CAPTCHA is enforced at submit-register time, not
  // here, so the form can upload incrementally.
  @Public()
  // BUG-151 (2026-06-22): per-IP rate-limit for the anonymous PDF upload.
  // 5/min + 30/hour caps the bot-flood vector identified in the pre-launch
  // security review (the in-memory pending-doc map is bounded by GC at
  // submit-register time, but uncapped upload could otherwise saturate disk).
  @Throttle({ short: { limit: 5, ttl: 60_000 }, long: { limit: 30, ttl: 3_600_000 } })
  @Post('registration-documents/upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    operationId: 'uploadRegistrationDocument',
    summary: 'Vendor uploads a registration document PDF; returns pending documentId valid for 15 minutes',
  })
  uploadRegistrationDocument(@UploadedFile() file: any) {
    return this.vendorAuthService.uploadRegistrationDocument(file);
  }

  @Public()
  // BUG-151 (2026-06-22): per-IP login throttle. Per-account lockout already
  // exists in the service (5/15min) but a single IP rotating across many
  // vendor emails was uncapped pre-fix.
  @Throttle({ short: { limit: 5, ttl: 60_000 }, long: { limit: 30, ttl: 600_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: 'loginVendor', summary: 'Vendor login with email/password' })
  login(@Body() dto: VendorLoginDto) {
    return this.vendorAuthService.login(dto);
  }

  @Public()
  // BUG-151 (2026-06-22): throttle verify-email so token-state probing is
  // expensive when a token leaks via referer / support paste / etc.
  @Throttle({ short: { limit: 5, ttl: 60_000 } })
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: 'verifyVendorEmail', summary: 'Verify vendor email address' })
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.vendorAuthService.verifyEmail(dto);
  }

  @Public()
  // BUG-151 (2026-06-22): aggressive throttle on forgot-password. Per-email
  // cooldown (60s) is enforced inside the service. CAPTCHA on the DTO.
  // Both layers exist so bot flooding hits 429 BEFORE any DB or SMTP work.
  @Throttle({ short: { limit: 3, ttl: 60_000 }, long: { limit: 10, ttl: 3_600_000 } })
  @Post('forgot-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ operationId: 'vendorForgotPassword', summary: 'Request password reset email' })
  forgotPassword(@Body() dto: ForgotPasswordDto, @Req() req: Request) {
    return this.vendorAuthService.forgotPassword(dto, {
      ipAddress: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
    });
  }

  @Public()
  // BUG-151 (2026-06-22): throttle reset-password (token-state probe defence).
  @Throttle({ short: { limit: 5, ttl: 60_000 } })
  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ operationId: 'vendorResetPassword', summary: 'Reset password with token' })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.vendorAuthService.resetPassword(dto);
  }

  @Public()
  // BUG-151 (2026-06-22): aggressive throttle on MFA verify. The 6-digit
  // TOTP is otherwise brute-forcible inside the 5-min temp-token window.
  @Throttle({ short: { limit: 5, ttl: 60_000 }, long: { limit: 20, ttl: 3_600_000 } })
  @Post('mfa/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: 'verifyVendorMfa', summary: 'Verify vendor MFA code' })
  verifyMfa(@Body() dto: MfaVerifyVendorDto) {
    return this.vendorAuthService.verifyMfa(dto);
  }

  @UseGuards(VendorJwtAuthGuard)
  @ApiBearerAuth()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ operationId: 'logoutVendor', summary: 'Vendor logout — invalidates refresh tokens' })
  logout(@CurrentUser() user: { id: string }) {
    return this.vendorAuthService.logout(user.id);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: 'refreshVendorToken', summary: 'Exchange refresh token for new access token' })
  refresh(@Body() body: { refreshToken: string }) {
    return this.vendorAuthService.refresh(body.refreshToken);
  }

  @UseGuards(VendorJwtAuthGuard)
  @ApiBearerAuth()
  @Get('me')
  @ApiOperation({ operationId: 'getVendorProfile', summary: "Get the calling vendor's profile" })
  getMe(@CurrentUser() vendor: any) {
    return this.vendorAuthService.getProfile(vendor.vendorId);
  }

  @UseGuards(VendorJwtAuthGuard)
  @ApiBearerAuth()
  @Patch('me')
  @ApiOperation({ operationId: 'updateVendorProfile', summary: "Update non-sensitive fields on the calling vendor's profile" })
  updateMe(@CurrentUser() vendor: any, @Body() dto: UpdateProfileDto) {
    return this.vendorAuthService.updateProfile(vendor.vendorId, vendor.id, dto);
  }

  @UseGuards(VendorJwtAuthGuard)
  @ApiBearerAuth()
  @Get('me/bids')
  @ApiOperation({ operationId: 'listMyBids', summary: 'List bids submitted by the calling vendor across all tenders' })
  myBids(
    @CurrentUser() vendor: any,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.vendorAuthService.listMyBids(vendor.vendorId, Number(page ?? 1), Number(pageSize ?? 50));
  }
}
