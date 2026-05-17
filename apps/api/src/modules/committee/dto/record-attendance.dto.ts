import { IsArray, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RecordAttendanceDto {
  @ApiProperty({ description: 'User IDs of members who attended' })
  @IsArray()
  @IsUUID('all', { each: true })
  attendeeIds: string[];
}
