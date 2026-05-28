import {
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSessionDto {
  @ApiProperty()
  @IsDateString()
  scheduledAt: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  location?: string;

  @ApiProperty({ description: 'Committee member user IDs' })
  @IsArray()
  @IsUUID('all', { each: true })
  memberIds: string[];

  // Phase D quorum config — see committee_sessions.required_quorum_count.
  // Blank/undefined leaves it NULL → award confirm only enforces the required-role
  // (chair) gate; populated value adds a presentCount >= requiredCount check.
  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  requiredQuorumCount?: number;

  @ApiPropertyOptional({ default: 'CHAIR' })
  @IsOptional()
  @IsString()
  requiredRoleCode?: string;
}
