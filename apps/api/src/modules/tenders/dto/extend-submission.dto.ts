import { IsDateString, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// BUG-141 (2026-06-19): re-open a tender from Submission Closed back to
// Published with a new submission deadline. Reason required (≥20 chars);
// audited at HIGH severity since it reverses a closed state.
export class ExtendSubmissionDto {
  @ApiProperty({ description: 'New submission deadline (ISO timestamp). Must be in the future.' })
  @IsDateString()
  newSubmissionDeadline: string;

  @ApiPropertyOptional({ description: 'Optional new clarification deadline (ISO). Leave undefined to keep the current value.' })
  @IsDateString()
  @IsOptional()
  newClarificationDeadline?: string;

  @ApiProperty({ description: 'Reason for the extension, written to the audit trail.', minLength: 20, maxLength: 1000 })
  @IsString()
  @MinLength(20)
  @MaxLength(1000)
  reason: string;
}
