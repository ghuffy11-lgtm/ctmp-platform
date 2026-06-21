import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ReplyClarificationDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  reply: string;

  // BUG-145 (2026-06-19): every reply is private to the asking vendor. The
  // public/general-public visibility option was removed at owner request —
  // see clarifications.service.ts for the simplified visibility model.
}
