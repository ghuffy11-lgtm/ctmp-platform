import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { LateSubmissionsService } from './late-submissions.service';
import { CreateExceptionDto } from './dto/create-exception.dto';

@ApiTags('late-submissions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('tenders/:tenderId/late-submission-exceptions')
export class LateSubmissionsController {
  constructor(private readonly lateSubmissionsService: LateSubmissionsService) {}

  @Get()
  @RequirePermissions('late_submission:list')
  @ApiOperation({ operationId: 'listLateSubmissionExceptions', summary: 'List late submission exceptions for a tender' })
  findAll(@Param('tenderId') tenderId: string) {
    return this.lateSubmissionsService.findAll(tenderId);
  }

  @Post()
  @RequirePermissions('late_submission:grant')
  @ApiOperation({ operationId: 'grantLateSubmissionException', summary: 'Grant late submission exception — vendor-specific, audited' })
  create(
    @Param('tenderId') tenderId: string,
    @Body() dto: CreateExceptionDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.lateSubmissionsService.create(tenderId, dto, userId);
  }
}
