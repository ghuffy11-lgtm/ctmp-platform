import { IsOptional, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class RevokeVendorInvitationDto {
  @ApiPropertyOptional({
    description: 'Why the invitation is being withdrawn. Recorded on the audit entry.',
    maxLength: 500,
  })
  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === null ? undefined : String(value).trim()))
  @IsString()
  @MaxLength(500)
  reason?: string;
}
