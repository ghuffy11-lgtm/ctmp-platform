import { IsString, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateClarificationDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  question: string;

  // BUG-147 (2026-06-21): when an admin / engineer asks a vendor a
  // clarification, the admin caller must specify which vendor the question
  // is for. Ignored when the caller is a vendor (their own vendor id is
  // used automatically).
  @ApiPropertyOptional({ description: 'Target vendor id — required when caller is admin' })
  @IsOptional()
  @IsUUID()
  targetVendorId?: string;
}
