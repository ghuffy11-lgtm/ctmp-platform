import { PartialType } from '@nestjs/swagger';
import { CreateTenderDto } from './create-tender.dto';

export class UpdateTenderDto extends PartialType(CreateTenderDto) {}
