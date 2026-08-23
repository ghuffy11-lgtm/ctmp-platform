import {
  IsString, IsEmail, IsNotEmpty, MinLength, IsOptional, IsUrl,
  IsArray, ValidateNested, ArrayMaxSize, IsUUID, IsIn, MaxLength,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { VENDOR_DOC_TYPE_CODES } from '../vendor-document-types';

// BUG-137 (2026-06-19): vendor uploads registration PDFs first via
// /vendor-auth/registration-documents/upload (returns pending documentIds),
// then references them here when submitting the registration form.
export class VendorRegistrationDocumentRef {
  @ApiProperty({ enum: VENDOR_DOC_TYPE_CODES })
  @IsString()
  @IsIn(VENDOR_DOC_TYPE_CODES)
  type: string;

  @ApiProperty({ description: 'Pending documentId returned by the anonymous upload endpoint.' })
  @IsString()
  @IsNotEmpty()
  documentId: string;
}

// BUG-101 (2026-06-04): vendor self-registration form simplified. Owner
// dropped Registration Number / Tax Number / Country at intake (collected
// later at approval if needed) and added Company Website. registrationNumber
// / taxNumber / country fields are still on the Vendor model and can be
// populated later via admin tools or vendor profile edits.

export class VendorRegisterDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  companyName: string;

  @ApiPropertyOptional({ description: 'Optional Arabic company name (migration 054). Shown on the Arabic management dashboard; falls back to companyName when empty.', maxLength: 255 })
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsString()
  @IsOptional()
  @MaxLength(255)
  companyNameAr?: string;

  @ApiPropertyOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsUrl({ require_protocol: true })
  @IsOptional()
  website?: string;

  @ApiPropertyOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsString()
  @IsOptional()
  address?: string;

  @ApiPropertyOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiProperty()
  @IsEmail()
  email: string;

  @ApiProperty()
  @IsString()
  @MinLength(12)
  password: string;

  @ApiProperty({ description: 'Server-side validated CAPTCHA token' })
  @IsString()
  @IsNotEmpty()
  captchaToken: string;

  // BUG-137 (2026-06-19): registration documents. Service validates required
  // types are present.
  @ApiProperty({
    type: [VendorRegistrationDocumentRef],
    description: 'PDF documents uploaded first via /vendor-auth/registration-documents/upload. Required types (commercial license, authorised representative ID) must be present.',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VendorRegistrationDocumentRef)
  @ArrayMaxSize(20)
  documents: VendorRegistrationDocumentRef[];

  // 2026-08-24: raw token from /register?invite=… when the supplier arrived from
  // a registry invitation.
  //
  // TRANSFORMED, NOT VALIDATED, on purpose. A @Matches() here would turn a
  // mangled or truncated link into a 400 on submit — blocking a registration,
  // which is the one thing this feature must never do. Anything that is not a
  // well-formed token is silently dropped and the registration proceeds as an
  // ordinary self-registration.
  @ApiPropertyOptional({
    description: 'Invitation token. Ignored if unknown, expired, revoked or already used.',
  })
  @Transform(({ value }) => {
    const v = typeof value === 'string' ? value.trim().toLowerCase() : '';
    return /^[0-9a-f]{64}$/.test(v) ? v : undefined;
  })
  @IsOptional()
  @IsString()
  inviteToken?: string;
}
