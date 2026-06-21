import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

// BUG-115 (2026-06-09): close an open negotiation round without launching a
// new one. Tender state moves NEGOTIATION → COMMERCIAL_EVALUATION so
// procurement can re-evaluate. (Award flow also closes rounds automatically.)
export class CloseNegotiationDto {
  @ApiPropertyOptional({ description: 'Optional close reason for audit trail.' })
  @IsOptional()
  @IsString()
  @MinLength(20)
  @MaxLength(2000)
  reason?: string;
}
