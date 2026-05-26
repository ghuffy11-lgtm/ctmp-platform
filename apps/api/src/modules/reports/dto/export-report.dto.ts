import { IsString, IsOptional, IsDateString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ExportReportDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  format?: string = 'xlsx';

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  fromDate?: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  toDate?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  departmentId?: string;

  @ApiPropertyOptional({ description: 'Scope the report to a single tender (used by commercial_comparison).' })
  @IsString()
  @IsOptional()
  tenderId?: string;
}
