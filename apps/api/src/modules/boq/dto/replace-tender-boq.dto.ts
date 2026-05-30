import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TenderBoqItemDto {
  @ApiPropertyOptional({ description: 'Existing row id (omit for new rows)' })
  @IsOptional()
  @IsString()
  id?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  itemNo!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  description!: string;

  @ApiProperty({ description: 'Positive quantity. Up to 3 decimal places.' })
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  qty!: number;

  @ApiProperty({ description: 'Unit of measure: EA, M, KG, LS, set, hour, …' })
  @IsString()
  @IsNotEmpty()
  unit!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class ReplaceTenderBoqDto {
  @ApiProperty({ type: [TenderBoqItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TenderBoqItemDto)
  items!: TenderBoqItemDto[];
}
