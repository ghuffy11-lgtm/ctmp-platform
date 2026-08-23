import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

// 2026-08-24: invite a prospective supplier who has no vendor record yet.
//
// Note on MinLength(20): the house convention for regulated free text (Cancel,
// Suspend, Revert, award justification) does NOT apply here. Those are
// justifications for a regulated state change on a live tender. A company name
// is an email salutation. Forcing 20 characters would just produce padding.
export class CreateVendorInvitationDto {
  @ApiProperty({ example: 'sales@acme.com', maxLength: 255 })
  @Transform(({ value }) => String(value ?? '').trim().toLowerCase())
  @IsEmail({}, { message: 'A valid email address is required.' })
  @MaxLength(255)
  email: string;

  @ApiProperty({
    example: 'ACME Trading Co.',
    description:
      'Used only for the email greeting ("Dear ACME Trading Co. Team"). Creates no vendor record and is never matched against an existing company.',
    minLength: 2,
    maxLength: 255,
  })
  @Transform(({ value }) => String(value ?? '').trim())
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  companyName: string;
}
