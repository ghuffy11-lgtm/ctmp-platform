import { IsUUID, IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AwardRecommendationDto {
  @ApiProperty()
  @IsUUID()
  recommendedBidId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  justification: string;
}
