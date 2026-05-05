import { type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { AuthProvider, ReservationStatus, StudyRecordSource } from '@prisma/client';
import { LeaderboardMetric, UserRole } from '@smartseat/contracts';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../app.module.js';
import { setupApiPlatform } from '../app.setup.js';
import { PrismaService } from '../common/database/prisma.service.js';
import { TokenService } from '../modules/auth/token.service.js';
import { StudyRecordsService } from '../modules/study-records/study-records.service.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const ASIA_SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;

interface FakeUser {
  userId: string;
  authProvider: AuthProvider;
  openid: string | null;
  unionid: string | null;
  oidcSub: string | null;
  externalUserNo: string | null;
  roles: UserRole[];
  anonymousName: string;
  displayName: string | null;
  avatarUrl: string | null;
  leaderboardEnabled: boolean;
  noShowCountWeek: number;
  noShowCountMonth: number;
  createdAt: Date;
  updatedAt: Date;
}

interface FakeReservation {
  reservationId: string;
  userId: string;
  seatId: string;
  startTime: Date;
  endTime: Date;
  checkinStartTime: Date;
  checkinDeadline: Date;
  status: ReservationStatus;
  checkedInAt: Date | null;
  releasedAt: Date | null;
  releaseReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface FakeStudyRecord {
  recordId: string;
  userId: string;
  reservationId: string;
  seatId: string;
  startTime: Date;
  endTime: Date;
  durationMinutes: number;
  source: StudyRecordSource;
  validFlag: boolean;
  invalidReason: string | null;
  createdAt: Date;
}

class FakePrismaService {
  users: FakeUser[] = [];
  studyRecords: FakeStudyRecord[] = [];

  private studyRecordSequence = 0;

  user = {
    findUnique: async ({ where }: { where: { userId: string } }) =>
      this.users.find((user) => user.userId === where.userId) ?? null,
    update: async ({
      where,
      data
    }: {
      where: { userId: string };
      data: { leaderboardEnabled?: boolean };
    }) => {
      const user = required(this.users.find((candidate) => candidate.userId === where.userId));

      if (data.leaderboardEnabled !== undefined) {
        user.leaderboardEnabled = data.leaderboardEnabled;
      }

      return user;
    }
  };

  studyRecord = {
    upsert: async ({
      where,
      create
    }: {
      where: { reservationId: string };
      update: Partial<FakeStudyRecord>;
      create: Omit<FakeStudyRecord, 'recordId' | 'createdAt'>;
    }) => {
      const existing = this.studyRecords.find(
        (record) => record.reservationId === where.reservationId
      );

      if (existing !== undefined) {
        return existing;
      }

      this.studyRecordSequence += 1;
      const record: FakeStudyRecord = {
        recordId: `study_record_${this.studyRecordSequence}`,
        ...create,
        createdAt: new Date('2026-05-05T08:00:00.000Z')
      };
      this.studyRecords.push(record);
      return record;
    },
    findMany: async (args: { where?: StudyRecordWhere; orderBy?: unknown; include?: unknown }) => {
      const records = this.studyRecords.filter((record) => matchesStudyRecord(record, args.where));
      const sorted = args.orderBy === undefined ? records : sortStudyRecords(records);

      if (args.include !== undefined) {
        return sorted.map((record) => ({
          ...record,
          user: required(this.users.find((user) => user.userId === record.userId))
        }));
      }

      return sorted;
    }
  };

  async $transaction<T>(callback: (tx: this) => Promise<T>): Promise<T> {
    return await callback(this);
  }

  async $disconnect(): Promise<void> {}

  async checkConnection(): Promise<boolean> {
    return true;
  }

  seedUser(input: Partial<FakeUser> & { userId: string }): FakeUser {
    const now = new Date('2026-05-05T08:00:00.000Z');
    const user: FakeUser = {
      userId: input.userId,
      authProvider: input.authProvider ?? AuthProvider.WECHAT,
      openid: input.openid ?? null,
      unionid: input.unionid ?? null,
      oidcSub: input.oidcSub ?? null,
      externalUserNo: input.externalUserNo ?? null,
      roles: input.roles ?? [UserRole.STUDENT],
      anonymousName: input.anonymousName ?? '匿名用户 01',
      displayName: input.displayName ?? null,
      avatarUrl: input.avatarUrl ?? null,
      leaderboardEnabled: input.leaderboardEnabled ?? true,
      noShowCountWeek: input.noShowCountWeek ?? 0,
      noShowCountMonth: input.noShowCountMonth ?? 0,
      createdAt: input.createdAt ?? now,
      updatedAt: input.updatedAt ?? now
    };
    this.users.push(user);
    return user;
  }

  seedStudyRecord(input: Partial<FakeStudyRecord> & { userId: string; reservationId: string }) {
    const startTime = input.startTime ?? new Date('2026-05-05T01:00:00.000Z');
    const endTime = input.endTime ?? new Date(startTime.getTime() + 60 * 60_000);
    const record: FakeStudyRecord = {
      recordId: input.recordId ?? `seed_record_${this.studyRecords.length + 1}`,
      userId: input.userId,
      reservationId: input.reservationId,
      seatId: input.seatId ?? 'seat_stat',
      startTime,
      endTime,
      durationMinutes:
        input.durationMinutes ?? Math.floor((endTime.getTime() - startTime.getTime()) / 60_000),
      source: input.source ?? StudyRecordSource.TIME_FINISHED,
      validFlag: input.validFlag ?? true,
      invalidReason: input.invalidReason ?? null,
      createdAt: input.createdAt ?? endTime
    };
    this.studyRecords.push(record);
    return record;
  }
}

type StudyRecordWhere = {
  userId?: string | { in?: string[] };
  validFlag?: boolean;
  startTime?: { gte?: Date; gt?: Date; lte?: Date; lt?: Date };
};

describe('API-STAT-01 study records, personal stats, and anonymous leaderboard', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let prisma: FakePrismaService;
  let service: StudyRecordsService;
  let tokenService: TokenService;
  let studentToken: string;

  beforeEach(async () => {
    prisma = new FakePrismaService();
    seedUsers(prisma);

    moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    app = moduleRef.createNestApplication();
    setupApiPlatform(app);
    await app.init();

    service = moduleRef.get(StudyRecordsService);
    tokenService = moduleRef.get(TokenService);
    studentToken = await signToken(tokenService, 'user_current', [UserRole.STUDENT]);
  });

  afterEach(async () => {
    await app.close();
    await moduleRef.close();
  });

  it('creates invalid short records and source-tagged records for release scenarios', async () => {
    await service.upsertFromReservation(
      prisma as never,
      createReservation({
        reservationId: 'reservation_short',
        checkedInAt: new Date('2026-05-05T01:00:00.000Z')
      }),
      new Date('2026-05-05T01:14:00.000Z'),
      StudyRecordSource.USER_RELEASED
    );
    await service.upsertFromReservation(
      prisma as never,
      createReservation({
        reservationId: 'reservation_finished',
        checkedInAt: new Date('2026-05-05T02:00:00.000Z')
      }),
      new Date('2026-05-05T03:00:00.000Z'),
      StudyRecordSource.TIME_FINISHED
    );
    await service.upsertFromReservation(
      prisma as never,
      createReservation({
        reservationId: 'reservation_admin',
        checkedInAt: new Date('2026-05-05T04:00:00.000Z')
      }),
      new Date('2026-05-05T05:00:00.000Z'),
      StudyRecordSource.ADMIN_RELEASED,
      { forceInvalidReason: service.getAdminMarkedInvalidReason() }
    );

    expect(prisma.studyRecords).toMatchObject([
      {
        reservationId: 'reservation_short',
        durationMinutes: 14,
        source: StudyRecordSource.USER_RELEASED,
        validFlag: false,
        invalidReason: 'DURATION_LT_15_MINUTES'
      },
      {
        reservationId: 'reservation_finished',
        durationMinutes: 60,
        source: StudyRecordSource.TIME_FINISHED,
        validFlag: true
      },
      {
        reservationId: 'reservation_admin',
        source: StudyRecordSource.ADMIN_RELEASED,
        validFlag: false,
        invalidReason: 'ADMIN_MARKED_INVALID'
      }
    ]);
  });

  it('computes personal stats across current week, totals, recent records, and day streaks', async () => {
    const now = new Date('2026-05-08T04:00:00.000Z');
    const weekStart = startOfWeekAsiaShanghai(now);
    seedRecord(prisma, 'user_current', 'current_mon', weekStart, 60);
    seedRecord(prisma, 'user_current', 'current_tue', new Date(weekStart.getTime() + DAY_MS), 45);
    seedRecord(
      prisma,
      'user_current',
      'current_wed',
      new Date(weekStart.getTime() + 2 * DAY_MS),
      20
    );
    seedRecord(
      prisma,
      'user_current',
      'current_wed_short',
      new Date(weekStart.getTime() + 2 * DAY_MS + 2 * 60 * 60_000),
      10,
      false
    );
    seedRecord(
      prisma,
      'user_current',
      'current_thu',
      new Date(weekStart.getTime() + 3 * DAY_MS),
      30
    );
    seedRecord(
      prisma,
      'user_current',
      'current_previous_week',
      new Date(weekStart.getTime() - DAY_MS),
      90
    );

    const stats = await service.getMyStats(
      { user_id: 'user_current', roles: [UserRole.STUDENT] },
      now
    );

    expect(stats).toMatchObject({
      user_id: 'user_current',
      week_visit_count: 4,
      week_duration_minutes: 155,
      total_duration_minutes: 245,
      streak_days: 5,
      no_show_count_week: 1,
      no_show_count_month: 2
    });
    expect(stats.recent_records).toHaveLength(5);
    expect(stats.recent_records[0]).toMatchObject({
      reservation_id: 'current_thu',
      source: StudyRecordSource.TIME_FINISHED
    });
  });

  it('serves /stats/me for the authenticated student', async () => {
    seedRecord(prisma, 'user_current', 'http_stats', new Date(Date.now() - 60 * 60_000), 45);

    const response = await request(app.getHttpServer())
      .get('/stats/me')
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200);

    expect(response.body).toMatchObject({
      user_id: 'user_current',
      week_visit_count: expect.any(Number),
      week_duration_minutes: expect.any(Number),
      total_duration_minutes: 45,
      streak_days: 1
    });
  });

  it('serves anonymous leaderboards, filters opt-out users, and exposes current student position', async () => {
    const now = new Date('2026-05-08T04:00:00.000Z');
    const weekStart = startOfWeekAsiaShanghai(now);
    seedRecord(prisma, 'user_current', 'duration_current', weekStart, 80);
    seedRecord(prisma, 'user_other', 'duration_other', weekStart, 120);
    seedRecord(prisma, 'user_hidden', 'duration_hidden', weekStart, 300);
    seedRecord(
      prisma,
      'user_previous',
      'duration_previous',
      new Date(weekStart.getTime() - DAY_MS),
      500
    );

    const leaderboard = await service.getLeaderboard(
      { user_id: 'user_current', roles: [UserRole.STUDENT] },
      { metric: LeaderboardMetric.WEEKLY_DURATION, week_start: weekStart.toISOString() },
      now
    );

    expect(leaderboard.entries).toEqual([
      {
        rank: 1,
        anonymous_name: '匿名用户 16',
        metric: LeaderboardMetric.WEEKLY_DURATION,
        value: 120,
        is_current_user: false
      },
      {
        rank: 2,
        anonymous_name: '匿名用户 08',
        metric: LeaderboardMetric.WEEKLY_DURATION,
        value: 80,
        is_current_user: true
      }
    ]);
    expect(leaderboard.current_user_entry).toMatchObject({
      rank: 2,
      anonymous_name: '匿名用户 08'
    });
    expect(JSON.stringify(leaderboard)).not.toContain('user_hidden');
    expect(JSON.stringify(leaderboard)).not.toContain('openid');
    expect(JSON.stringify(leaderboard)).not.toContain('school-no');
  });

  it('serves /leaderboard without identity fields in public entries', async () => {
    seedRecord(prisma, 'user_current', 'http_current', new Date(Date.now() - 2 * 60 * 60_000), 30);
    seedRecord(prisma, 'user_other', 'http_other', new Date(Date.now() - 3 * 60 * 60_000), 45);

    const response = await request(app.getHttpServer())
      .get('/leaderboard')
      .query({ metric: LeaderboardMetric.WEEKLY_VISITS })
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200);

    expect(response.body.entries.length).toBeGreaterThan(0);
    expect(response.body.entries[0]).toEqual(
      expect.not.objectContaining({
        user_id: expect.any(String),
        display_name: expect.any(String),
        openid: expect.any(String),
        external_user_no: expect.any(String),
        oidc_sub: expect.any(String)
      })
    );
    expect(response.body.current_user_entry).toMatchObject({
      anonymous_name: '匿名用户 08',
      is_current_user: true
    });
  });

  it('supports visit-count and streak leaderboards across week and day boundaries', async () => {
    const now = new Date('2026-05-08T04:00:00.000Z');
    const weekStart = startOfWeekAsiaShanghai(now);
    seedRecord(prisma, 'user_current', 'visit_current_1', weekStart, 30);
    seedRecord(
      prisma,
      'user_current',
      'visit_current_2',
      new Date(weekStart.getTime() + DAY_MS),
      30
    );
    seedRecord(prisma, 'user_other', 'visit_other_1', weekStart, 30);
    seedRecord(prisma, 'user_other', 'visit_other_2', new Date(weekStart.getTime() + DAY_MS), 30);
    seedRecord(
      prisma,
      'user_other',
      'visit_other_3',
      new Date(weekStart.getTime() + 2 * DAY_MS),
      30
    );
    seedRecord(
      prisma,
      'user_current',
      'streak_previous_week',
      new Date(weekStart.getTime() - DAY_MS),
      30
    );

    const visits = await service.getLeaderboard(
      { user_id: 'user_current', roles: [UserRole.STUDENT] },
      { metric: LeaderboardMetric.WEEKLY_VISITS, week_start: weekStart.toISOString() },
      now
    );
    const streak = await service.getLeaderboard(
      { user_id: 'user_current', roles: [UserRole.STUDENT] },
      { metric: LeaderboardMetric.STREAK_DAYS, week_start: weekStart.toISOString() },
      now
    );

    expect(visits.entries[0]).toMatchObject({
      anonymous_name: '匿名用户 16',
      value: 3
    });
    expect(streak.current_user_entry).toMatchObject({
      anonymous_name: '匿名用户 08',
      value: 3
    });
  });
});

const seedUsers = (prisma: FakePrismaService): void => {
  prisma.seedUser({
    userId: 'user_current',
    anonymousName: '匿名用户 08',
    leaderboardEnabled: true,
    noShowCountWeek: 1,
    noShowCountMonth: 2
  });
  prisma.seedUser({
    userId: 'user_other',
    anonymousName: '匿名用户 16',
    leaderboardEnabled: true,
    displayName: 'Real Name',
    openid: 'openid-other',
    externalUserNo: 'school-no-other'
  });
  prisma.seedUser({
    userId: 'user_hidden',
    anonymousName: '匿名用户 23',
    leaderboardEnabled: false
  });
  prisma.seedUser({
    userId: 'user_previous',
    anonymousName: '匿名用户 42',
    leaderboardEnabled: true
  });
};

const signToken = async (
  tokenService: TokenService,
  userId: string,
  roles: UserRole[]
): Promise<string> => {
  const { token } = await tokenService.signUserToken({ user_id: userId, roles });
  return token;
};

const createReservation = (
  input: Partial<FakeReservation> & { reservationId: string }
): FakeReservation => {
  const startTime = input.startTime ?? new Date('2026-05-05T01:00:00.000Z');
  return {
    reservationId: input.reservationId,
    userId: input.userId ?? 'user_current',
    seatId: input.seatId ?? 'seat_stat',
    startTime,
    endTime: input.endTime ?? new Date(startTime.getTime() + 60 * 60_000),
    checkinStartTime: input.checkinStartTime ?? new Date(startTime.getTime() - 5 * 60_000),
    checkinDeadline: input.checkinDeadline ?? new Date(startTime.getTime() + 15 * 60_000),
    status: input.status ?? ReservationStatus.CHECKED_IN,
    checkedInAt: input.checkedInAt ?? startTime,
    releasedAt: input.releasedAt ?? null,
    releaseReason: input.releaseReason ?? null,
    createdAt: input.createdAt ?? startTime,
    updatedAt: input.updatedAt ?? startTime
  };
};

const seedRecord = (
  prisma: FakePrismaService,
  userId: string,
  reservationId: string,
  dayStart: Date,
  durationMinutes: number,
  validFlag = true
): void => {
  const startTime = new Date(dayStart.getTime() + 60 * 60_000);
  prisma.seedStudyRecord({
    userId,
    reservationId,
    startTime,
    endTime: new Date(startTime.getTime() + durationMinutes * 60_000),
    durationMinutes,
    validFlag,
    invalidReason: validFlag ? null : 'DURATION_LT_15_MINUTES'
  });
};

const matchesStudyRecord = (record: FakeStudyRecord, where?: StudyRecordWhere): boolean => {
  if (where === undefined) {
    return true;
  }

  if (typeof where.userId === 'string' && record.userId !== where.userId) {
    return false;
  }

  if (
    typeof where.userId === 'object' &&
    where.userId.in !== undefined &&
    !where.userId.in.includes(record.userId)
  ) {
    return false;
  }

  if (where.validFlag !== undefined && record.validFlag !== where.validFlag) {
    return false;
  }

  if (where.startTime?.gte !== undefined && record.startTime < where.startTime.gte) {
    return false;
  }

  if (where.startTime?.gt !== undefined && record.startTime <= where.startTime.gt) {
    return false;
  }

  if (where.startTime?.lte !== undefined && record.startTime > where.startTime.lte) {
    return false;
  }

  if (where.startTime?.lt !== undefined && record.startTime >= where.startTime.lt) {
    return false;
  }

  return true;
};

const sortStudyRecords = (records: FakeStudyRecord[]): FakeStudyRecord[] =>
  [...records].sort((left, right) => right.startTime.getTime() - left.startTime.getTime());

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

const required = <T>(value: T | undefined): T => {
  if (value === undefined) {
    throw new Error('Missing fake record.');
  }

  return value;
};
