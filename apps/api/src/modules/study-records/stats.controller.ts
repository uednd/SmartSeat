import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { StudyStatsDto } from '@smartseat/contracts';

import { BearerAuthGuard } from '../../common/auth/bearer-auth.guard.js';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import type { RequestUser } from '../../common/auth/request-user.js';
import { studyStatsSchema } from '../../common/openapi/schemas.js';
import { StudyRecordsService } from './study-records.service.js';

@ApiTags('stats')
@ApiBearerAuth()
@Controller('stats')
@UseGuards(BearerAuthGuard)
export class StatsController {
  constructor(private readonly studyRecordsService: StudyRecordsService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current student study statistics' })
  @ApiOkResponse({ schema: studyStatsSchema })
  async getMyStats(@CurrentUser() user: RequestUser): Promise<StudyStatsDto> {
    return await this.studyRecordsService.getMyStats(user);
  }
}
