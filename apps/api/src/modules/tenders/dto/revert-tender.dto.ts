import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

// BUG-112 (2026-06-07) Piece 1: revert a Published tender. Limited to three
// safe targets — anything before Submission Closed is reachable from
// Published. Reason is mandatory (≥20 chars) for audit + procurement
// compliance, same as the existing Cancel flow.
export class RevertTenderDto {
  @ApiProperty({
    enum: ['Approved', 'Internal Review', 'Draft'],
    description: 'Target status to revert the tender to.',
  })
  @IsString()
  @IsIn(['Approved', 'Internal Review', 'Draft'])
  targetStatus: 'Approved' | 'Internal Review' | 'Draft';

  @ApiProperty({ description: 'Reason for the revert, written to the audit trail.', minLength: 20, maxLength: 1000 })
  @IsString()
  @MinLength(20)
  @MaxLength(1000)
  reason: string;
}
