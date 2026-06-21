import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsBoolean, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

// BUG-115 (2026-06-09): launch a new negotiation round.
export class LaunchNegotiationDto {
  @ApiProperty({
    description: 'Bid ids of PASS vendors to invite into this round.',
    type: [String],
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('all', { each: true })
  bidIds!: string[];

  @ApiProperty({ description: 'Reason for launching this round (audit-logged, min 20 chars).' })
  @IsString()
  @MinLength(20)
  @MaxLength(2000)
  reason!: string;

  // BUG-127 (2026-06-11): optional email dispatch on launch. When true, an
  // email is sent to each invited vendor's BCC list (vendor users + extras)
  // via the TENDER_NEGOTIATION_LAUNCHED template. Default false — vendor
  // sees the round on next portal visit either way.
  @ApiPropertyOptional({ description: 'When true, send an invitation email to each newly-invited vendor.' })
  @IsOptional()
  @IsBoolean()
  sendEmail?: boolean;
}
