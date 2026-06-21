import { IsBoolean, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ConfirmAwardDto {
  @ApiProperty({ description: 'Bid id to award. Must be technical PASS.' })
  @IsUUID()
  bidId: string;

  @ApiProperty({ description: 'TRUE if this matches server-computed lowestPassBidId, FALSE for override.' })
  @IsBoolean()
  isLowest: boolean;

  // BUG-149 (2026-06-21): owner reduced the minimum from 100 → 20 chars.
  // (Pre-BUG-149 the UI text said 50 but the DTO enforced 100 — the two
  // are now aligned at 20.)
  @ApiPropertyOptional({ description: 'Written justification — REQUIRED when isLowest=false (min 20 chars).' })
  @IsString()
  @IsOptional()
  @MinLength(20)
  justificationText?: string;

  @ApiPropertyOptional({ description: 'Document id from POST /award/justification-document — REQUIRED when isLowest=false.' })
  @IsString()
  @IsOptional()
  justificationDocumentId?: string;

  @ApiPropertyOptional({ description: 'Send "you have been awarded" notification to the winning vendor. Default OFF.' })
  @IsBoolean()
  @IsOptional()
  notifyWinner?: boolean;

  @ApiPropertyOptional({ description: 'Send "awarded to another vendor" notification to losing vendors. Default OFF.' })
  @IsBoolean()
  @IsOptional()
  notifyLosers?: boolean;
}
