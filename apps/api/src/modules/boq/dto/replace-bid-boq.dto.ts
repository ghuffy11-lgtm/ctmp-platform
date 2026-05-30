import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum BidBoqLineStatus {
  BIDDING = 'BIDDING',
  NOT_BIDDING = 'NOT_BIDDING',
}

export class BidBoqLineDto {
  @ApiProperty({ description: 'Reference to a tender_boq_items.id row' })
  @IsString()
  @IsNotEmpty()
  tenderBoqItemId!: string;

  @ApiProperty({ enum: BidBoqLineStatus })
  @IsEnum(BidBoqLineStatus)
  status!: BidBoqLineStatus;

  @ApiPropertyOptional({ description: 'Required when status=BIDDING; must be NULL when NOT_BIDDING. Up to 3 decimal places.' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  unitPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remarks?: string;
}

export class ReplaceBidBoqDto {
  @ApiProperty({ type: [BidBoqLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BidBoqLineDto)
  items!: BidBoqLineDto[];
}
