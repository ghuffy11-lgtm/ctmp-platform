import { IsNumber, IsString, IsOptional, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class EvaluateCommercialDto {
  @ApiProperty()
  @IsNumber()
  @Min(0)
  totalPrice: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  notes?: string;
}
