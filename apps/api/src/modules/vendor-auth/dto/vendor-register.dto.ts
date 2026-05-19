import { IsString, IsEmail, IsNotEmpty, MinLength, IsOptional, Length } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class VendorRegisterDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  companyName: string;

  @ApiPropertyOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsString()
  @IsOptional()
  registrationNumber?: string;

  @ApiPropertyOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsString()
  @IsOptional()
  taxNumber?: string;

  @ApiPropertyOptional({ description: 'ISO 3166-1 alpha-2 country code (2 characters)' })
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsString()
  @Length(2, 2)
  @IsOptional()
  country?: string;

  @ApiPropertyOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsString()
  @IsOptional()
  address?: string;

  @ApiPropertyOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiProperty()
  @IsEmail()
  email: string;

  @ApiProperty()
  @IsString()
  @MinLength(12)
  password: string;

  @ApiProperty({ description: 'Server-side validated CAPTCHA token' })
  @IsString()
  @IsNotEmpty()
  captchaToken: string;
}
