import { ArrayMinSize, IsArray, IsBoolean, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CriterionInputDto {
  @ApiPropertyOptional({ description: 'Existing criterion id (PATCH semantics). Omit for new criteria.' })
  @IsString()
  @IsOptional()
  id?: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  code: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ description: 'Max raw score for this criterion (e.g. 30).' })
  @IsNumber()
  @Min(1)
  maxScore: number;

  @ApiProperty({ description: 'Weight % (0-100). The full set must sum to 100.' })
  @IsNumber()
  @Min(0)
  @Max(100)
  weight: number;

  @ApiProperty({ description: 'Mandatory-gate flag — failing this criterion fails the whole bid regardless of total score (master plan §C3).' })
  @IsBoolean()
  mandatory: boolean;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  sortOrder?: number;
}

export class ReplaceTenderCriteriaDto {
  @ApiProperty({ type: [CriterionInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CriterionInputDto)
  criteria: CriterionInputDto[];
}
