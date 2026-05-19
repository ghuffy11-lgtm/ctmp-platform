import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateProfileDto {
  @ApiPropertyOptional({ description: 'Company display name' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  companyName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  taxNumber?: string;

  @ApiPropertyOptional({ description: 'ISO-3166 alpha-2 country code' })
  @IsOptional()
  @IsString()
  @MaxLength(2)
  country?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  address?: string;

  @ApiPropertyOptional({ description: 'Primary phone number' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  website?: string;

  @ApiPropertyOptional({ description: 'Primary contact full name' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  contactFullName?: string;

  @ApiPropertyOptional({ description: 'Primary contact phone (separate from company phone)' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  contactPhone?: string;
}
