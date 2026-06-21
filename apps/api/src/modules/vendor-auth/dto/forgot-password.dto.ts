import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ForgotPasswordDto {
  @ApiProperty()
  @IsEmail()
  email: string;

  // BUG-151 (2026-06-22): bot-flood defence. CAPTCHA enforced server-side
  // inside `VendorAuthService.forgotPassword`. The vendor portal's
  // /forgot-password page renders an hCaptcha widget and submits the token
  // here. Server-side rate limiting (controller @Throttle), per-email
  // cooldown (in-service), and audit logging combine to make uncaptcha'd
  // bot floods + email-spam abuse infeasible.
  @ApiProperty({ description: 'hCaptcha token from the portal widget' })
  @IsString()
  @IsNotEmpty()
  captchaToken: string;
}
