import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { LeaderboardRequest, LeaderboardResponse } from '@smartseat/contracts';
import { LeaderboardMetric, LeaderboardTimePeriod } from '@smartseat/contracts';

import { BearerAuthGuard } from '../../common/auth/bearer-auth.guard.js';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import type { RequestUser } from '../../common/auth/request-user.js';
import { leaderboardResponseSchema } from '../../common/openapi/schemas.js';
import { StudyRecordsService } from '../study-records/study-records.service.js';

@ApiTags('leaderboard')
@ApiBearerAuth()
@Controller('leaderboard')
@UseGuards(BearerAuthGuard)
export class LeaderboardController {
  constructor(@Inject(StudyRecordsService) private readonly studyRecordsService: StudyRecordsService) {}

  @Get()
  @ApiOperation({ summary: 'Get anonymous study leaderboard' })
  @ApiQuery({ name: 'metric', required: true, enum: LeaderboardMetric })
  @ApiQuery({ name: 'time_period', required: true, enum: LeaderboardTimePeriod })
  @ApiOkResponse({ schema: leaderboardResponseSchema })
  async getLeaderboard(
    @CurrentUser() user: RequestUser,
    @Query() request: LeaderboardRequest
  ): Promise<LeaderboardResponse> {
    return await this.studyRecordsService.getLeaderboard(user, request);
  }
}
