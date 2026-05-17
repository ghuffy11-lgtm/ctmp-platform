import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateClarificationDto } from './dto/create-clarification.dto';
import { ReplyClarificationDto } from './dto/reply-clarification.dto';

@Injectable()
export class ClarificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenderId: string, user: any) {
    // TODO: vendors see only their own + public replies; internal users see all
    throw new Error('Not implemented');
  }

  async create(tenderId: string, dto: CreateClarificationDto, user: any) {
    // TODO: check tender in Clarification Period, create clarification, audit log
    throw new Error('Not implemented');
  }

  async reply(clarificationId: string, dto: ReplyClarificationDto, user: any) {
    // TODO: check permission, set visibility (private vs general), audit log
    throw new Error('Not implemented');
  }
}
