import { IsOptional, IsString, IsInt, IsISO8601, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class ListTendersDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  departmentId?: string;

  // BUG-090 (2026-06-02): archive-page filters. Owner asked for the Awarded
  // Tenders view to support date-range / category / search. All optional and
  // additive; existing callers unaffected.
  @ApiPropertyOptional({ description: 'Filter by awarded_at >= awardedFrom (ISO date).' })
  @IsOptional()
  @IsISO8601()
  awardedFrom?: string;

  @ApiPropertyOptional({ description: 'Filter by awarded_at < (awardedTo + 1 day).' })
  @IsOptional()
  @IsISO8601()
  awardedTo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ description: 'Free-text search across tender reference + title.' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number = 20;
}
