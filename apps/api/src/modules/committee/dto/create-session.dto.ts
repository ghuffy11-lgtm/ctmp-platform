import { IsDateString, IsArray, IsUUID, IsOptional, IsString } from 'class-validator';
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
}
