import { IsString, IsNotEmpty, IsOptional, IsUUID, MaxLength, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateDepartmentDto {
  @ApiProperty({ description: 'Unique short code, alphanumeric/underscore/dash', maxLength: 64 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  @Matches(/^[A-Za-z0-9_-]+$/, { message: 'code may only contain letters, digits, underscore, or dash' })
  code!: string;

  @ApiProperty({ maxLength: 255 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;

  // Migration 054 (2026-08-13): Arabic name for the Arabic management dashboard.
  @ApiPropertyOptional({ description: 'Arabic department name; falls back to name when empty', maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  nameAr?: string;

  @ApiPropertyOptional({ description: 'Parent department ID (for hierarchy)' })
  @IsOptional()
  @IsUUID()
  parentId?: string;
}
