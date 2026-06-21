import { ArrayMaxSize, IsArray, IsEmail, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class InviteVendorDto {
  @ApiProperty({ description: 'Vendor id to invite.' })
  @IsUUID()
  vendorId: string;

  // BUG-120 (2026-06-10): ad-hoc extra recipient emails BCC'd alongside the
  // vendor's registered vendor_users on the invitation email. Max 20 entries
  // to keep the BCC list sane.
  @ApiPropertyOptional({
    description: 'Optional extra emails to BCC on the invitation message (e.g. additional contacts not registered as vendor users).',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsEmail({}, { each: true })
  extraEmails?: string[];
}
