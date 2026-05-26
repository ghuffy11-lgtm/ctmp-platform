import { IsString, IsEmail, IsOptional, IsUUID, IsArray, IsEnum, MinLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export enum UserStatusDto {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  DISABLED = 'DISABLED',
}

export class UpdateUserDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  displayName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  adUsername?: string;

  @ApiPropertyOptional({ description: 'Reset password (LOCAL users only)', minLength: 8 })
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @ApiPropertyOptional({ enum: UserStatusDto })
  @IsOptional()
  @IsEnum(UserStatusDto)
  status?: UserStatusDto;

  @ApiPropertyOptional({ description: 'Replace role assignment (single role)' })
  @IsOptional()
  @IsUUID()
  roleId?: string;

  @ApiPropertyOptional({ type: [String], description: 'Replace department assignments' })
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  departmentIds?: string[];

  @ApiPropertyOptional({ description: 'Primary department ID; must be in departmentIds' })
  @IsOptional()
  @IsUUID()
  primaryDepartmentId?: string;
}
