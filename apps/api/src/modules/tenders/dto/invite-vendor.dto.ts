import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class InviteVendorDto {
  @ApiProperty({ description: 'Vendor id to invite.' })
  @IsUUID()
  vendorId: string;
}
