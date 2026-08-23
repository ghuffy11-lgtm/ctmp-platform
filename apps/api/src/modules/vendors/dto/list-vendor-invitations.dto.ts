import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

// 'EXPIRED' is a DERIVED filter, not a stored status — see migration 057.
export const INVITATION_FILTERS = ['PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED'] as const;

export class ListVendorInvitationsDto {
  @ApiPropertyOptional({ enum: INVITATION_FILTERS })
  @IsOptional()
  @IsIn(INVITATION_FILTERS as unknown as string[])
  status?: (typeof INVITATION_FILTERS)[number];

  @ApiPropertyOptional({ description: 'Matches company name or email.' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  search?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 50, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number = 50;
}
