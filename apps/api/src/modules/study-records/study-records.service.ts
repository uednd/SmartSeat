import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
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
  LeaderboardTimePeriod,
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

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

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
    const timePeriod = this.parseTimePeriod(request.time_period);
    const { start, end } = getPeriodRange(timePeriod, now);

    const records = (await this.prisma.studyRecord.findMany({
      where: {
        validFlag: true,
        startTime: {
          gte: start,
          lt: end
        }
      },
      include: {
        user: true
      }
    })) as StudyRecordWithUser[];

    const eligibleRecords = records.filter((record) =>
      isLeaderboardEligible(record.user)
    );

    const ranked = this.rankLeaderboard(metric, eligibleRecords, user.user_id);
    const entries = ranked.slice(0, LEADERBOARD_ENTRY_LIMIT).map((entry) => entry.dto);
    const current = ranked.find((entry) => entry.userId === user.user_id);
    const response: LeaderboardResponse = {
      metric,
      time_period: timePeriod,
      period_start: start.toISOString(),
      period_end: end.toISOString(),
      entries
    };

    if (current !== undefined) {
      response.current_user_entry = current.dto;
    }

    this.logIfSlow('leaderboard', startedAt, { metric, time_period: timePeriod });
    return response;
  }

  getAdminMarkedInvalidReason(): string {
    return ADMIN_MARKED_INVALID_REASON;
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
          user_id: entry.user.userId,
          anonymous_name: entry.user.anonymousName,
          avatar_url: entry.user.avatarUrl ?? undefined,
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

  private parseTimePeriod(timePeriod: LeaderboardTimePeriod): LeaderboardTimePeriod {
    if (!Object.values(LeaderboardTimePeriod).includes(timePeriod)) {
      throw new AppHttpException(
        HttpStatus.BAD_REQUEST,
        ApiErrorCode.VALIDATION_FAILED,
        'leaderboard time_period is invalid.',
        { time_period: timePeriod }
      );
    }

    return timePeriod;
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
    case LeaderboardMetric.STUDY_DURATION:
      return sumDurationMinutes(records);
    case LeaderboardMetric.BOOKING_COUNT:
      return records.length;
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

const startOfTodayAsiaShanghai = (date: Date): Date => {
  const local = new Date(date.getTime() + ASIA_SHANGHAI_OFFSET_MS);
  const localMidnightUtcMs = Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate()
  );

  return new Date(localMidnightUtcMs - ASIA_SHANGHAI_OFFSET_MS);
};

const startOfMonthAsiaShanghai = (date: Date): Date => {
  const local = new Date(date.getTime() + ASIA_SHANGHAI_OFFSET_MS);
  const localMidnightUtcMs = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1);

  return new Date(localMidnightUtcMs - ASIA_SHANGHAI_OFFSET_MS);
};

const getPeriodRange = (
  timePeriod: LeaderboardTimePeriod,
  now: Date
): { start: Date; end: Date } => {
  switch (timePeriod) {
    case LeaderboardTimePeriod.TODAY: {
      const start = startOfTodayAsiaShanghai(now);
      return { start, end: new Date(start.getTime() + DAY_MS) };
    }
    case LeaderboardTimePeriod.THIS_WEEK: {
      const start = startOfWeekAsiaShanghai(now);
      return { start, end: new Date(start.getTime() + 7 * DAY_MS) };
    }
    case LeaderboardTimePeriod.THIS_MONTH: {
      const start = startOfMonthAsiaShanghai(now);
      const local = new Date(now.getTime() + ASIA_SHANGHAI_OFFSET_MS);
      const nextMonthFirst = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 1));
      const end = new Date(nextMonthFirst.getTime() - ASIA_SHANGHAI_OFFSET_MS);
      return { start, end };
    }
  }
};

const toAsiaShanghaiDateKey = (date: Date): number => {
  const local = new Date(date.getTime() + ASIA_SHANGHAI_OFFSET_MS);
  return (
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) -
    ASIA_SHANGHAI_OFFSET_MS
  );
};
