import { IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

// BUG-132 (2026-06-14): Hold a tender mid-lifecycle. Resume returns it to
// the snapshotted previous status. Reason mandatory (≥20 chars) — audit
// event TENDER_SUSPENDED at HIGH severity.
export class SuspendTenderDto {
  @ApiProperty({
    description: 'Reason for putting the tender on hold, written to the audit trail.',
    minLength: 20,
    maxLength: 1000,
  })
  @IsString()
  @MinLength(20)
  @MaxLength(1000)
  reason: string;
}
