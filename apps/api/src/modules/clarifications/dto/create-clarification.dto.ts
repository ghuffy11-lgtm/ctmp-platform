import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateClarificationDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  question: string;
}
