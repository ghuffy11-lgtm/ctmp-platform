import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    // TODO: paginate, filter by department/role
    throw new Error('Not implemented');
  }

  async findOne(id: string) {
    // TODO: include roles, permissions, departments
    throw new Error('Not implemented');
  }

  async findByUsername(username: string) {
    // TODO: used by auth service for AD login
    throw new Error('Not implemented');
  }

  async create(dto: CreateUserDto) {
    // TODO: create user, assign default role, audit log
    throw new Error('Not implemented');
  }

  async update(id: string, dto: UpdateUserDto) {
    // TODO: audit log on sensitive field changes
    throw new Error('Not implemented');
  }

  async remove(id: string) {
    // TODO: soft-delete (set is_active=false), audit log
    throw new Error('Not implemented');
  }
}
