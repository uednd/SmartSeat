import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import {
  Prisma,
  Reservation,
  StudyRecord,
  StudyRecordSource,
  User,
  UserRole as PrismaUserRole
} from '@prisma/client';
import {
  ApiErrorCode,
  LeaderboardMetric,
  UserRole as ContractUserRole,
  type LeaderboardEntryDto,
  type LeaderboardRequest,
  type LeaderboardResponse,
  type StudyStatsDto
} from '@smartseat/contracts';

import type { RequestUser } from '../../common/auth/request-user.js';
import { PrismaService } from '../../common/database/prisma.service.js';
import { AppHttpException } from '../../common/errors/app-http.exception.js';
import { toStudyRecordDto } from './study-record.mapper.js';

const MIN_VALID_STUDY_MINUTES = 15;
const SHORT_STUDY_INVALID_REASON = 'DURATION_LT_15_MINUTES';
const ADMIN_MARKED_INVALID_REASON = 'ADMIN_MARKED_INVALID';
const ASIA_SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const LEADERBOARD_ENTRY_LIMIT = 20;
const SLOW_QUERY_THRESHOLD_MS = 200;

type StudyRecordClient = PrismaService | Prisma.TransactionClient;
type StudyRecordWithUser = StudyRecord & { user: User };

@Injectable()
export class StudyRecordsService {
  private readonly logger = new Logger(StudyRecordsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async upsertFromReservation(
    tx: StudyRecordClient,
    reservation: Reservation,
    endTime: Date,
    source: StudyRecordSource,
    options: { forceInvalidReason?: string } = {}
  ): Promise<StudyRecord | undefined> {
    if (reservation.checkedInAt === null) {
      return undefined;
    }

    const startTime = reservation.checkedInAt;
    const durationMinutes = Math.max(
      0,
      Math.floor((endTime.getTime() - startTime.getTime()) / 60_000)
    );
    const invalidReason =
      options.forceInvalidReason ??
      (durationMinutes < MIN_VALID_STUDY_MINUTES ? SHORT_STUDY_INVALID_REASON : undefined);
    const validFlag = invalidReason === undefined;

    return await tx.studyRecord.upsert({
      where: {
        reservationId: reservation.reservationId
      },
      update: {},
      create: {
        userId: reservation.userId,
        reservationId: reservation.reservationId,
        seatId: reservation.seatId,
        startTime,
        endTime,
        durationMinutes,
        source,
        validFlag,
        invalidReason: invalidReason ?? null
      }
    });
  }

  async getMyStats(user: RequestUser, now = new Date()): Promise<StudyStatsDto> {
    this.requireStudent(user);
    const startedAt = Date.now();
    const currentUser = await this.prisma.user.findUnique({
      where: {
        userId: user.user_id
      }
    });

    if (currentUser === null) {
      throw this.notFound('User was not found.', { user_id: user.user_id });
    }

    const records = await this.prisma.studyRecord.findMany({
      where: {
        userId: user.user_id,
        validFlag: true,
        startTime: {
          lte: now
        }
      },
      orderBy: [{ startTime: 'desc' }]
    });
    const weekStart = startOfWeekAsiaShanghai(now);
    const weekEnd = new Date(weekStart.getTime() + 7 * DAY_MS);
    const weekRecords = records.filter(
      (record) => record.startTime >= weekStart && record.startTime < weekEnd
    );
    const response: StudyStatsDto = {
      user_id: user.user_id,
      week_visit_count: weekRecords.length,
      week_duration_minutes: sumDurationMinutes(weekRecords),
      total_duration_minutes: sumDurationMinutes(records),
      streak_days: calculateStreakDays(records),
      no_show_count_week: currentUser.noShowCountWeek,
      no_show_count_month: currentUser.noShowCountMonth,
      recent_records: records.slice(0, 5).map(toStudyRecordDto)
    };

    this.logIfSlow('stats_me', startedAt, { user_id: user.user_id });
    return response;
  }

  async getLeaderboard(
    user: RequestUser,
    request: LeaderboardRequest,
    now = new Date()
  ): Promise<LeaderboardResponse> {
    const startedAt = Date.now();
    const metric = this.parseMetric(request.metric);
    const weekStart =
      request.week_start === undefined
        ? startOfWeekAsiaShanghai(now)
        : startOfWeekAsiaShanghai(this.parseDateTime(request.week_start, 'week_start'));
    const weekEnd = new Date(weekStart.getTime() + 7 * DAY_MS);
    const weekRecords = await this.prisma.studyRecord.findMany({
      where: {
        validFlag: true,
        startTime: {
          gte: weekStart,
          lt: weekEnd
        }
      },
      include: {
        user: true
      }
    });
    const eligibleRecords = (weekRecords as StudyRecordWithUser[]).filter((record) =>
      isLeaderboardEligible(record.user)
    );
    const recordsForMetric =
      metric === LeaderboardMetric.STREAK_DAYS
        ? await this.findStreakRecordsForEligibleUsers(eligibleRecords, weekEnd, now)
        : eligibleRecords;
    const ranked = this.rankLeaderboard(metric, recordsForMetric, user.user_id);
    const entries = ranked.slice(0, LEADERBOARD_ENTRY_LIMIT).map((entry) => entry.dto);
    const current = ranked.find((entry) => entry.userId === user.user_id);
    const response: LeaderboardResponse = {
      metric,
      week_start: weekStart.toISOString(),
      entries
    };

    if (current !== undefined) {
      response.current_user_entry = current.dto;
    }

    this.logIfSlow('leaderboard', startedAt, { metric, week_start: response.week_start });
    return response;
  }

  getAdminMarkedInvalidReason(): string {
    return ADMIN_MARKED_INVALID_REASON;
  }

  private async findStreakRecordsForEligibleUsers(
    weekRecords: StudyRecordWithUser[],
    weekEnd: Date,
    now: Date
  ): Promise<StudyRecordWithUser[]> {
    const users = uniqueUsers(weekRecords.map((record) => record.user));

    if (users.length === 0) {
      return [];
    }

    const userIds = users.map((eligibleUser) => eligibleUser.userId);
    const records = (await this.prisma.studyRecord.findMany({
      where: {
        validFlag: true,
        userId: {
          in: userIds
        },
        startTime: {
          lt: new Date(Math.min(weekEnd.getTime(), now.getTime() + 1))
        }
      },
      include: {
        user: true
      }
    })) as StudyRecordWithUser[];

    return records.filter((record) => isLeaderboardEligible(record.user));
  }

  private rankLeaderboard(
    metric: LeaderboardMetric,
    records: StudyRecordWithUser[],
    currentUserId: string
  ): Array<{ userId: string; dto: LeaderboardEntryDto }> {
    const byUser = new Map<string, { user: User; records: StudyRecordWithUser[] }>();

    for (const record of records) {
      const existing = byUser.get(record.userId);

      if (existing === undefined) {
        byUser.set(record.userId, { user: record.user, records: [record] });
      } else {
        existing.records.push(record);
      }
    }

    return [...byUser.values()]
      .map(({ user, records: userRecords }) => ({
        user,
        value: calculateMetricValue(metric, userRecords)
      }))
      .filter((entry) => entry.value > 0)
      .sort(
        (left, right) =>
          right.value - left.value ||
          left.user.anonymousName.localeCompare(right.user.anonymousName) ||
          left.user.userId.localeCompare(right.user.userId)
      )
      .map((entry, index) => ({
        userId: entry.user.userId,
        dto: {
          rank: index + 1,
          anonymous_name: entry.user.anonymousName,
          metric,
          value: entry.value,
          is_current_user: entry.user.userId === currentUserId
        }
      }));
  }

  private parseMetric(metric: LeaderboardMetric): LeaderboardMetric {
    if (!Object.values(LeaderboardMetric).includes(metric)) {
      throw new AppHttpException(
        HttpStatus.BAD_REQUEST,
        ApiErrorCode.VALIDATION_FAILED,
        'leaderboard metric is invalid.',
        { metric }
      );
    }

    return metric;
  }

  private parseDateTime(value: string, field: string): Date {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      throw new AppHttpException(
        HttpStatus.BAD_REQUEST,
        ApiErrorCode.VALIDATION_FAILED,
        `${field} must be an ISO date-time string.`,
        { [field]: value }
      );
    }

    return date;
  }

  private requireStudent(user: RequestUser): void {
    if (!user.roles.includes(ContractUserRole.STUDENT)) {
      throw new AppHttpException(
        HttpStatus.FORBIDDEN,
        ApiErrorCode.FORBIDDEN,
        'Student role is required.'
      );
    }
  }

  private notFound(message: string, details?: Record<string, unknown>): AppHttpException {
    return new AppHttpException(
      HttpStatus.NOT_FOUND,
      ApiErrorCode.RESOURCE_NOT_FOUND,
      message,
      details
    );
  }

  private logIfSlow(category: string, startedAt: number, detail: Record<string, unknown>): void {
    const durationMs = Date.now() - startedAt;

    if (durationMs >= SLOW_QUERY_THRESHOLD_MS) {
      this.logger.warn(
        JSON.stringify({
          category,
          duration_ms: durationMs,
          ...detail
        })
      );
    }
  }
}

const isLeaderboardEligible = (user: User): boolean =>
  user.leaderboardEnabled && user.roles.includes(PrismaUserRole.STUDENT);

const sumDurationMinutes = (records: Pick<StudyRecord, 'durationMinutes'>[]): number =>
  records.reduce((sum, record) => sum + record.durationMinutes, 0);

const calculateMetricValue = (
  metric: LeaderboardMetric,
  records: StudyRecordWithUser[]
): number => {
  switch (metric) {
    case LeaderboardMetric.WEEKLY_DURATION:
      return sumDurationMinutes(records);
    case LeaderboardMetric.WEEKLY_VISITS:
      return records.length;
    case LeaderboardMetric.STREAK_DAYS:
      return calculateStreakDays(records);
  }
};

const calculateStreakDays = (records: Pick<StudyRecord, 'startTime'>[]): number => {
  const dayKeys = new Set(records.map((record) => toAsiaShanghaiDateKey(record.startTime)));
  const sortedDays = [...dayKeys].sort((left, right) => right - left);

  if (sortedDays.length === 0) {
    return 0;
  }

  let streak = 1;
  let previous = sortedDays[0]!;

  for (const day of sortedDays.slice(1)) {
    if (previous - day !== DAY_MS) {
      break;
    }

    streak += 1;
    previous = day;
  }

  return streak;
};

const startOfWeekAsiaShanghai = (date: Date): Date => {
  const local = new Date(date.getTime() + ASIA_SHANGHAI_OFFSET_MS);
  const localDay = local.getUTCDay();
  const daysSinceMonday = (localDay + 6) % 7;
  const localMidnightUtcMs = Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate()
  );

  return new Date(localMidnightUtcMs - daysSinceMonday * DAY_MS - ASIA_SHANGHAI_OFFSET_MS);
};

const toAsiaShanghaiDateKey = (date: Date): number => {
  const local = new Date(date.getTime() + ASIA_SHANGHAI_OFFSET_MS);
  return (
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) -
    ASIA_SHANGHAI_OFFSET_MS
  );
};

const uniqueUsers = (users: User[]): User[] => {
  const byId = new Map<string, User>();

  for (const user of users) {
    byId.set(user.userId, user);
  }

  return [...byId.values()];
};
