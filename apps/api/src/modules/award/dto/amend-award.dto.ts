import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AmendAwardDto {
  @ApiProperty({ description: 'New bid id (must be technical PASS).' })
  @IsUUID()
  newBidId: string;

  // BUG-149 (2026-06-21): owner reduced the minimum from 100 → 20 chars.
  @ApiProperty({ description: 'Written justification (min 20 chars). Always required for amendments.' })
  @IsString()
  @MinLength(20)
  justificationText: string;

  // BUG-114 (2026-06-09): supporting PDF for an amendment is OPTIONAL per
  // owner directive overriding master-plan §F7 "Override always requires
  // text + PDF". Reason text remains mandatory (100-char min). See
  // dated amendment block in IN_APP_COMPARISON_MASTER_PLAN_2026-05-27.md.
  @ApiPropertyOptional({ description: 'Optional document id of the amendment justification PDF.' })
  @IsOptional()
  @IsString()
  justificationDocumentId?: string;
}
