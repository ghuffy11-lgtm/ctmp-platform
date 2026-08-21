import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

/**
 * Bid-level commercial terms (migration 052, 2026-08-06). Describe the whole
 * offer, not a BOQ line. Every field is optional — an empty payload is legal
 * and must never block bid submission.
 *
 * `null` clears a stored value; an omitted key also clears it (the endpoint
 * replaces the whole set, matching the atomic-replace style of the BOQ save).
 */
export enum DeliveryUnit {
  WEEKS = 'WEEKS',
  MONTHS = 'MONTHS',
}

export class CommercialTermsDto {
  @ApiPropertyOptional({ example: 'Mindray', maxLength: 255 })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(255)
  brandManufacturer?: string | null;

  @ApiPropertyOptional({ example: 'Japan', maxLength: 120 })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(120)
  countryOfOrigin?: string | null;

  @ApiPropertyOptional({ description: 'Years; decimals allowed (0.5 = 6 months)', example: 3 })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(99)
  warrantyYears?: number | null;

  @ApiPropertyOptional({ description: 'Lower bound of the delivery period', example: 4 })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(1)
  @Max(999)
  deliveryFrom?: number | null;

  @ApiPropertyOptional({ description: 'Optional upper bound; must be >= deliveryFrom', example: 8 })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(1)
  @Max(999)
  deliveryTo?: number | null;

  @ApiPropertyOptional({ enum: DeliveryUnit, example: DeliveryUnit.WEEKS })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsEnum(DeliveryUnit)
  deliveryUnit?: DeliveryUnit | null;

  @ApiPropertyOptional({ description: 'Free text, one milestone per line', maxLength: 4000 })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(4000)
  paymentTerms?: string | null;
}
