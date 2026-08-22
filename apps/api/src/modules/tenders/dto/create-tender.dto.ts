import { IsString, IsNotEmpty, IsDateString, IsOptional, IsUUID, IsNumber, IsIn, Min, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * The only procurement types the system accepts. Mirrors PROCUREMENT_TYPES in
 * the admin tender forms — keep the two in step.
 */
export const PROCUREMENT_TYPES = ['Open Tender', 'Restricted', 'Single Source'] as const;

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

  // 2026-08-21: the enum was documented for Swagger but only validated as a
  // string, so the API accepted any value while advertising three. Two rows
  // reached the database as 'OPEN' via manual SQL. UpdateTenderDto extends this
  // class, so @IsIn covers create and update alike.
  @ApiPropertyOptional({ enum: PROCUREMENT_TYPES })
  @IsString()
  @IsIn(PROCUREMENT_TYPES, {
    message: `procurementType must be one of: ${PROCUREMENT_TYPES.join(', ')}`,
  })
  @IsOptional()
  procurementType?: string;

  @ApiPropertyOptional({ description: 'Estimated budget in KWD. Numeric.' })
  @IsNumber()
  @Min(0)
  @IsOptional()
  estimatedBudget?: number;

  @ApiPropertyOptional({ enum: ['PUBLIC', 'INVITATION_ONLY'], description: 'Visibility. Locked once tender is created.' })
  @IsString()
  @IsIn(['PUBLIC', 'INVITATION_ONLY'])
  @IsOptional()
  visibility?: 'PUBLIC' | 'INVITATION_ONLY';

  // BUG-137 (2026-06-19): when true, bidders must attach ≥1 supporting
  // document PDF (certificates, letters, etc.) before submitting.
  @ApiPropertyOptional({ description: 'When true, require vendors to upload ≥1 supporting document with their bid.' })
  @IsBoolean()
  @IsOptional()
  requiresSupportingDocuments?: boolean;
}

