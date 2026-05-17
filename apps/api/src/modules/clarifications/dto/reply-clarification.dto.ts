import { IsString, IsNotEmpty, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ReplyClarificationDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  reply: string;

  @ApiProperty({ description: 'true = visible to all vendors; false = private to asking vendor only' })
  @IsBoolean()
  isPublic: boolean;
}
