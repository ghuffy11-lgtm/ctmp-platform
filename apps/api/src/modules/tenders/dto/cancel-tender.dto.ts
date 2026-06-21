import { IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

// BUG-132 (2026-06-14): formalises the inline body the cancel route used to
// accept. Tightens validation to ≥20 chars (frontend already enforces this).
export class CancelTenderDto {
  @ApiProperty({
    description: 'Reason for cancelling the tender, written to the audit trail.',
    minLength: 20,
    maxLength: 1000,
  })
  @IsString()
  @MinLength(20)
  @MaxLength(1000)
  reason: string;
}
