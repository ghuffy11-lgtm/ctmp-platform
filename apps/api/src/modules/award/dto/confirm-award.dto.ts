import { IsBoolean, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ConfirmAwardDto {
  @ApiProperty({ description: 'Bid id to award. Must be technical PASS.' })
  @IsUUID()
  bidId: string;

  @ApiProperty({ description: 'TRUE if this matches server-computed lowestPassBidId, FALSE for override.' })
  @IsBoolean()
  isLowest: boolean;

  @ApiPropertyOptional({ description: 'Written justification — REQUIRED when isLowest=false (min 100 chars).' })
  @IsString()
  @IsOptional()
  @MinLength(100)
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
