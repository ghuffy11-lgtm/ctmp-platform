import { IsArray, IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UploadEnvelopeDto {
  @ApiProperty({ description: 'List of document IDs already uploaded via file upload endpoint' })
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  documentIds: string[];
}
