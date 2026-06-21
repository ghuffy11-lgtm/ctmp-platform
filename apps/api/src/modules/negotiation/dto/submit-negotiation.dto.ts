import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

// BUG-115 (2026-06-09): one revised BoQ line on a negotiation submission.
export class NegotiationBoqLineDto {
  @ApiProperty({ description: 'The tender BoQ template line id this revised price applies to.' })
  @IsUUID()
  tenderBoqItemId!: string;

  @ApiProperty({ description: 'Status flag: BIDDING (with unit price) or NOT_BIDDING.', enum: ['BIDDING', 'NOT_BIDDING'] })
  @IsIn(['BIDDING', 'NOT_BIDDING'])
  status!: 'BIDDING' | 'NOT_BIDDING';

  // unitPrice required when status=BIDDING, must be null/omitted when NOT_BIDDING.
  // Cross-field validation done service-side to match the existing
  // bid_boq_items_status_price_consistent CHECK constraint pattern.
  @ApiPropertyOptional({ description: 'Unit price; required when status is BIDDING.' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @Max(999_999_999.999)
  unitPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  remarks?: string;
}

export class SubmitNegotiationDto {
  @ApiProperty({ description: 'Invitation id from the open negotiation round.' })
  @IsUUID()
  invitationId!: string;

  @ApiProperty({
    description: 'Document id of the uploaded commercial PDF (from /upload-pdf, expires in 15 min).',
  })
  @IsString()
  commercialPdfDocumentId!: string;

  @ApiProperty({ description: 'Revised per-line BoQ entries.', type: [NegotiationBoqLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => NegotiationBoqLineDto)
  boqLines!: NegotiationBoqLineDto[];

  @ApiPropertyOptional({ description: 'Optional remarks at submission level.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  remarks?: string;
}
