import { IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

// BUG-132 (2026-06-14): Resume a tender from Hold back to its previousStatus.
// Reason mandatory (≥20 chars) — audit event TENDER_RESUMED at HIGH severity.
export class ResumeTenderDto {
  @ApiProperty({
    description: 'Reason for resuming the tender from hold, written to the audit trail.',
    minLength: 20,
    maxLength: 1000,
  })
  @IsString()
  @MinLength(20)
  @MaxLength(1000)
  reason: string;
}
