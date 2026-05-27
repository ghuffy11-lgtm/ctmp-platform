import { IsString, IsUUID, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AmendAwardDto {
  @ApiProperty({ description: 'New bid id (must be technical PASS).' })
  @IsUUID()
  newBidId: string;

  @ApiProperty({ description: 'Written justification (min 100 chars). Always required for amendments.' })
  @IsString()
  @MinLength(100)
  justificationText: string;

  @ApiProperty({ description: 'Document id of the amendment justification PDF.' })
  @IsString()
  justificationDocumentId: string;
}
