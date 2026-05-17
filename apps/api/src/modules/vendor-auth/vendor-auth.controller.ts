import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
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

@ApiTags('vendor-auth')
@Controller('vendor-auth')
export class VendorAuthController {
  constructor(private readonly vendorAuthService: VendorAuthService) {}

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ operationId: 'registerVendor', summary: 'Vendor self-registration with CAPTCHA' })
  register(@Body() dto: VendorRegisterDto, @Req() req: Request) {
    return this.vendorAuthService.register(dto, {
      ipAddress: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
    });
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: 'loginVendor', summary: 'Vendor login with email/password' })
  login(@Body() dto: VendorLoginDto) {
    return this.vendorAuthService.login(dto);
  }

  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: 'verifyVendorEmail', summary: 'Verify vendor email address' })
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.vendorAuthService.verifyEmail(dto);
  }

  @Public()
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
  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ operationId: 'vendorResetPassword', summary: 'Reset password with token' })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.vendorAuthService.resetPassword(dto);
  }

  @Public()
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
}
