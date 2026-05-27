import { IsBoolean, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateLibraryEntryDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: 'Default weight (0-100). Optional — admins can leave 0 and set per-tender.' })
  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  defaultWeight?: number;

  @ApiPropertyOptional({ description: 'Default max score for the criterion.' })
  @IsNumber()
  @Min(1)
  @IsOptional()
  defaultMaxScore?: number;

  @ApiPropertyOptional({ description: 'Default is_mandatory_gate flag.' })
  @IsBoolean()
  @IsOptional()
  defaultIsGate?: boolean;

  @ApiPropertyOptional({ description: 'Soft-delete via is_active=false.' })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class UpdateLibraryEntryDto extends CreateLibraryEntryDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MinLength(2)
  @MaxLength(200)
  declare name: string;
}
