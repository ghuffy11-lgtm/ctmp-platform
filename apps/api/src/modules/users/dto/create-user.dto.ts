import { IsString, IsEmail, IsNotEmpty, IsUUID, IsOptional, IsEnum, IsArray, MinLength, ValidateIf } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum UserAuthTypeDto {
  AD = 'AD',
  LOCAL = 'LOCAL',
}

export class CreateUserDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty({ description: 'Display name shown in the UI' })
  @IsString()
  @IsNotEmpty()
  displayName!: string;

  @ApiPropertyOptional({ enum: UserAuthTypeDto, default: UserAuthTypeDto.AD })
  @IsOptional()
  @IsEnum(UserAuthTypeDto)
  authType?: UserAuthTypeDto;

  @ApiPropertyOptional({ description: 'AD username; required when authType=AD' })
  @IsOptional()
  @IsString()
  adUsername?: string;

  @ApiPropertyOptional({ description: 'Password; required when authType=LOCAL', minLength: 8 })
  @ValidateIf(o => o.authType === UserAuthTypeDto.LOCAL)
  @IsString()
  @MinLength(8)
  password?: string;

  @ApiPropertyOptional({ description: 'Role ID to assign on create' })
  @IsOptional()
  @IsUUID()
  roleId?: string;

  @ApiPropertyOptional({ type: [String], description: 'Department IDs to assign' })
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  departmentIds?: string[];

  @ApiPropertyOptional({ description: 'Primary department ID; must be in departmentIds' })
  @IsOptional()
  @IsUUID()
  primaryDepartmentId?: string;
}
