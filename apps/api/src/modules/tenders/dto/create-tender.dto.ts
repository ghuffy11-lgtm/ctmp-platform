import { IsString, IsNotEmpty, IsDateString, IsOptional, IsUUID, IsNumber, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTenderDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty()
  @IsUUID()
  departmentId: string;

  @ApiProperty()
  @IsDateString()
  submissionDeadline: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  clarificationDeadline?: string;

  @ApiPropertyOptional({ description: 'Free-text category (e.g. "IT Services").' })
  @IsString()
  @IsOptional()
  category?: string;

  @ApiPropertyOptional({ enum: ['Open Tender', 'Restricted', 'Single Source'] })
  @IsString()
  @IsOptional()
  procurementType?: string;

  @ApiPropertyOptional({ description: 'Estimated budget in KWD. Numeric.' })
  @IsNumber()
  @Min(0)
  @IsOptional()
  estimatedBudget?: number;
}
