import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CriterionScoreDto {
  @ApiProperty()
  @IsString()
  criterion: string;

  @ApiProperty({ minimum: 0 })
  @IsNumber()
  @Min(0)
  weight: number;

  @ApiProperty({ minimum: 0 })
  @IsNumber()
  @Min(0)
  score: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  comments?: string;
}

export class EvaluateBidDto {
  // Aggregated 0–100 overall score. Either supplied directly (legacy clients)
  // or computed by the service from criterionScores when provided.
  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  score?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  // Phase B (BUG-046 follow-up): per-criterion scores power the Technical
  // Comparison page's vendor×criterion matrix. When provided, each row is
  // persisted to technical_evaluation_scores and the aggregated `score` is
  // computed by the service as weighted average normalised to 0–100.
  @ApiPropertyOptional({ type: [CriterionScoreDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CriterionScoreDto)
  criterionScores?: CriterionScoreDto[];
}
