import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength } from 'class-validator';

// BUG-148 (2026-06-21): authorised admin can amend a committee session
// after the fact — adjust required quorum count, required role code, and/or
// the attendance list. Required reason text drives the HIGH-severity audit
// row. Use case: commercial envelopes were opened with attendance recorded
// against a high quorum target (e.g. 4) but only 3 actually attended; the
// award stage then blocks. Owner needs a lever to either (a) lower the
// required quorum count, or (b) correct an attendance error post-hoc.
export class AmendSessionDto {
  @ApiPropertyOptional({ description: 'New required quorum count (number of members present required).' })
  @IsOptional()
  @IsInt()
  @Min(1)
  requiredQuorumCount?: number;

  @ApiPropertyOptional({ description: 'New required role code (default CHAIR).' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  requiredRoleCode?: string;

  @ApiPropertyOptional({
    description: 'Replace the attendance list with these member user-ids marked present (others marked absent). Omit to leave attendance unchanged.',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  attendeeIds?: string[];

  @ApiProperty({ description: 'Reason for the amendment (audit-logged, min 20 chars).' })
  @IsString()
  @MinLength(20)
  @MaxLength(1000)
  reason: string;
}
