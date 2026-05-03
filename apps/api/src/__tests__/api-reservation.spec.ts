import { type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import {
  AuthProvider,
  PresenceStatus,
  ReservationStatus,
  SeatAvailability,
  SeatStatus,
  SeatUnavailableReason
} from '@prisma/client';
import { ApiErrorCode, UserRole } from '@smartseat/contracts';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../app.module.js';
import { setupApiPlatform } from '../app.setup.js';
import { PrismaService } from '../common/database/prisma.service.js';
import { TokenService } from '../modules/auth/token.service.js';
import { ReservationsService } from '../modules/reservations/reservations.service.js';

interface FakeUser {
  userId: string;
  authProvider: AuthProvider;
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

interface FakeSeat {
  seatId: string;
  seatNo: string;
  area: string;
  businessStatus: SeatStatus;
  availabilityStatus: SeatAvailability;
  unavailableReason: SeatUnavailableReason | null;
  deviceId: string | null;
  presenceStatus: PresenceStatus;
  maintenance: boolean;
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

class FakePrismaService {
  users: FakeUser[] = [];
  seats: FakeSeat[] = [];
  reservations: FakeReservation[] = [];

  private reservationSequence = 0;

  user = {
    findUnique: async ({ where }: { where: { userId: string } }) =>
      this.users.find((user) => user.userId === where.userId) ?? null,
    update: async ({
      where,
      data
    }: {
      where: { userId: string };
      data: {
        noShowCountWeek?: { increment: number };
        noShowCountMonth?: { increment: number };
      };
    }) => {
      const user = this.users.find((candidate) => candidate.userId === where.userId);

      if (user === undefined) {
        throw new Error('Missing fake user.');
      }

      user.noShowCountWeek += data.noShowCountWeek?.increment ?? 0;
      user.noShowCountMonth += data.noShowCountMonth?.increment ?? 0;
      user.updatedAt = new Date('2026-05-03T08:20:00.000Z');
      return user;
    }
  };

  seat = {
    findUnique: async ({ where }: { where: { seatId: string } }) =>
      this.seats.find((seat) => seat.seatId === where.seatId) ?? null,
    update: async ({ where, data }: { where: { seatId: string }; data: Partial<FakeSeat> }) => {
      const seat = this.seats.find((candidate) => candidate.seatId === where.seatId);

      if (seat === undefined) {
        throw new Error('Missing fake seat.');
      }

      Object.assign(seat, data, { updatedAt: new Date('2026-05-03T08:20:00.000Z') });
      return seat;
    }
  };

  reservation = {
    findUnique: async ({ where }: { where: { reservationId: string } }) =>
      this.reservations.find((reservation) => reservation.reservationId === where.reservationId) ??
      null,
    findFirst: async ({ where }: { where: ReservationWhere }) =>
      this.sortReservations(
        this.reservations.filter((reservation) => matchesReservation(reservation, where))
      )[0] ?? null,
    findMany: async (args: {
      where?: ReservationWhere;
      orderBy?: unknown;
      skip?: number;
      take?: number;
    }) => {
      const filtered = this.sortReservations(
        this.reservations.filter((reservation) => matchesReservation(reservation, args.where))
      );

      return filtered.slice(args.skip ?? 0, (args.skip ?? 0) + (args.take ?? filtered.length));
    },
    count: async ({ where }: { where?: ReservationWhere }) =>
      this.reservations.filter((reservation) => matchesReservation(reservation, where)).length,
    create: async ({ data }: { data: Partial<FakeReservation> }) => {
      this.assertNoFakeOverlap(
        requiredString(data.userId),
        requiredString(data.seatId),
        requiredDate(data.startTime),
        requiredDate(data.endTime)
      );
      this.reservationSequence += 1;
      const now = new Date('2026-05-03T08:00:00.000Z');
      const reservation: FakeReservation = {
        reservationId: data.reservationId ?? `reservation_created_${this.reservationSequence}`,
        userId: requiredString(data.userId),
        seatId: requiredString(data.seatId),
        startTime: requiredDate(data.startTime),
        endTime: requiredDate(data.endTime),
        checkinStartTime: requiredDate(data.checkinStartTime),
        checkinDeadline: requiredDate(data.checkinDeadline),
        status: data.status ?? ReservationStatus.WAITING_CHECKIN,
        checkedInAt: data.checkedInAt ?? null,
        releasedAt: data.releasedAt ?? null,
        releaseReason: data.releaseReason ?? null,
        createdAt: data.createdAt ?? now,
        updatedAt: data.updatedAt ?? now
      };

      this.reservations.push(reservation);
      return reservation;
    },
    update: async ({
      where,
      data
    }: {
      where: { reservationId: string };
      data: Partial<FakeReservation>;
    }) => {
      const reservation = this.reservations.find(
        (candidate) => candidate.reservationId === where.reservationId
      );

      if (reservation === undefined) {
        throw new Error('Missing fake reservation.');
      }

      Object.assign(reservation, data, { updatedAt: new Date('2026-05-03T08:20:00.000Z') });
      return reservation;
    }
  };

  async $transaction<T>(callback: (tx: this) => Promise<T>): Promise<T> {
    return await callback(this);
  }

  async $disconnect(): Promise<void> {}

  async checkConnection(): Promise<boolean> {
    return true;
  }

  seedUser(data: Partial<FakeUser>): FakeUser {
    const now = new Date('2026-05-03T08:00:00.000Z');
    const user: FakeUser = {
      userId: requiredString(data.userId),
      authProvider: data.authProvider ?? AuthProvider.WECHAT,
      roles: data.roles ?? [UserRole.STUDENT],
      anonymousName: data.anonymousName ?? '匿名用户 01',
      displayName: data.displayName ?? null,
      avatarUrl: data.avatarUrl ?? null,
      leaderboardEnabled: data.leaderboardEnabled ?? true,
      noShowCountWeek: data.noShowCountWeek ?? 0,
      noShowCountMonth: data.noShowCountMonth ?? 0,
      createdAt: data.createdAt ?? now,
      updatedAt: data.updatedAt ?? now
    };

    this.users.push(user);
    return user;
  }

  seedSeat(data: Partial<FakeSeat>): FakeSeat {
    const now = new Date('2026-05-03T08:00:00.000Z');
    const seat: FakeSeat = {
      seatId: requiredString(data.seatId),
      seatNo: data.seatNo ?? requiredString(data.seatId),
      area: data.area ?? '初赛演示区',
      businessStatus: data.businessStatus ?? SeatStatus.FREE,
      availabilityStatus: data.availabilityStatus ?? SeatAvailability.AVAILABLE,
      unavailableReason: data.unavailableReason ?? null,
      deviceId: data.deviceId ?? null,
      presenceStatus: data.presenceStatus ?? PresenceStatus.ABSENT,
      maintenance: data.maintenance ?? false,
      createdAt: data.createdAt ?? now,
      updatedAt: data.updatedAt ?? now
    };

    this.seats.push(seat);
    return seat;
  }

  seedReservation(data: Partial<FakeReservation>): FakeReservation {
    const startTime = data.startTime ?? new Date('2026-05-03T09:00:00.000Z');
    const reservation: FakeReservation = {
      reservationId: requiredString(data.reservationId),
      userId: data.userId ?? 'user_student',
      seatId: requiredString(data.seatId),
      startTime,
      endTime: data.endTime ?? new Date('2026-05-03T10:00:00.000Z'),
      checkinStartTime: data.checkinStartTime ?? new Date(startTime.getTime() - 5 * 60 * 1000),
      checkinDeadline: data.checkinDeadline ?? new Date(startTime.getTime() + 15 * 60 * 1000),
      status: data.status ?? ReservationStatus.WAITING_CHECKIN,
      checkedInAt: data.checkedInAt ?? null,
      releasedAt: data.releasedAt ?? null,
      releaseReason: data.releaseReason ?? null,
      createdAt: data.createdAt ?? new Date('2026-05-03T08:00:00.000Z'),
      updatedAt: data.updatedAt ?? new Date('2026-05-03T08:00:00.000Z')
    };

    this.reservations.push(reservation);
    return reservation;
  }

  private sortReservations(reservations: FakeReservation[]): FakeReservation[] {
    return [...reservations].sort(
      (left, right) => left.startTime.getTime() - right.startTime.getTime()
    );
  }

  private assertNoFakeOverlap(
    userId: string,
    seatId: string,
    startTime: Date,
    endTime: Date
  ): void {
    const conflict = this.reservations.find(
      (reservation) =>
        (
          [ReservationStatus.WAITING_CHECKIN, ReservationStatus.CHECKED_IN] as ReservationStatus[]
        ).includes(reservation.status) &&
        (reservation.userId === userId || reservation.seatId === seatId) &&
        reservation.startTime.getTime() < endTime.getTime() &&
        reservation.endTime.getTime() > startTime.getTime()
    );

    if (conflict !== undefined) {
      throw Object.assign(new Error('Fake reservation overlap.'), { code: 'P2002' });
    }
  }
}

type ReservationWhere = {
  userId?: string;
  seatId?: string;
  status?: ReservationStatus | { in?: readonly ReservationStatus[] };
  startTime?: { lt?: Date };
  endTime?: { gt?: Date };
  checkinDeadline?: { lt?: Date };
};

describe('API-RES-01 reservation state machine and API', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let prisma: FakePrismaService;
  let tokenService: TokenService;
  let reservationsService: ReservationsService;
  let studentToken: string;
  let otherStudentToken: string;
  let adminToken: string;

  beforeEach(async () => {
    prisma = new FakePrismaService();
    seedDemoData(prisma);

    moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    app = moduleRef.createNestApplication();
    setupApiPlatform(app);
    await app.init();

    tokenService = moduleRef.get(TokenService);
    reservationsService = moduleRef.get(ReservationsService);
    studentToken = await signToken(tokenService, 'user_student', [UserRole.STUDENT]);
    otherStudentToken = await signToken(tokenService, 'user_other_student', [UserRole.STUDENT]);
    adminToken = await signToken(tokenService, 'user_admin', [UserRole.ADMIN]);
  });

  afterEach(async () => {
    await app.close();
    await moduleRef.close();
  });

  it('creates a waiting check-in reservation for an available free seat', async () => {
    const response = await request(app.getHttpServer())
      .post('/reservations')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        seat_id: 'seat_free_001',
        start_time: '2026-05-03T09:00:00.000Z',
        end_time: '2026-05-03T10:00:00.000Z'
      })
      .expect(201);

    expect(response.body).toMatchObject({
      user_id: 'user_student',
      seat_id: 'seat_free_001',
      status: ReservationStatus.WAITING_CHECKIN,
      checkin_start_time: '2026-05-03T08:55:00.000Z',
      checkin_deadline: '2026-05-03T09:15:00.000Z'
    });
    expect(prisma.seats.find((seat) => seat.seatId === 'seat_free_001')?.businessStatus).toBe(
      SeatStatus.RESERVED
    );
  });

  it('rejects duplicate overlapping reservations for one student', async () => {
    prisma.seedReservation({
      reservationId: 'reservation_existing_student',
      userId: 'user_student',
      seatId: 'seat_other_001'
    });

    const response = await request(app.getHttpServer())
      .post('/reservations')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        seat_id: 'seat_free_001',
        start_time: '2026-05-03T09:30:00.000Z',
        end_time: '2026-05-03T10:30:00.000Z'
      })
      .expect(409);

    expect(response.body).toMatchObject({ code: ApiErrorCode.RESERVATION_CONFLICT });
  });

  it('rejects overlapping reservations for the same seat', async () => {
    prisma.seedReservation({
      reservationId: 'reservation_existing_seat',
      userId: 'user_other_student',
      seatId: 'seat_free_001'
    });

    const response = await request(app.getHttpServer())
      .post('/reservations')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        seat_id: 'seat_free_001',
        start_time: '2026-05-03T09:30:00.000Z',
        end_time: '2026-05-03T10:30:00.000Z'
      })
      .expect(409);

    expect(response.body).toMatchObject({ code: ApiErrorCode.RESERVATION_CONFLICT });
  });

  it('rejects unavailable, maintenance, offline-derived, and non-free seats', async () => {
    const cases = ['seat_maintenance_001', 'seat_offline_001', 'seat_reserved_001'];

    for (const seatId of cases) {
      const response = await request(app.getHttpServer())
        .post('/reservations')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          seat_id: seatId,
          start_time: '2026-05-03T12:00:00.000Z',
          end_time: '2026-05-03T13:00:00.000Z'
        })
        .expect(409);

      expect(response.body).toMatchObject({ code: ApiErrorCode.SEAT_UNAVAILABLE });
    }
  });

  it('cancels an owned waiting check-in reservation and releases the seat', async () => {
    prisma.seedReservation({
      reservationId: 'reservation_to_cancel',
      userId: 'user_student',
      seatId: 'seat_reserved_001'
    });

    const response = await request(app.getHttpServer())
      .delete('/reservations/reservation_to_cancel')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ reason: 'plan changed' })
      .expect(200);

    expect(response.body).toMatchObject({
      reservation_id: 'reservation_to_cancel',
      status: ReservationStatus.CANCELLED,
      release_reason: 'plan changed'
    });
    expect(prisma.seats.find((seat) => seat.seatId === 'seat_reserved_001')?.businessStatus).toBe(
      SeatStatus.FREE
    );
  });

  it('rejects cancellation by another student and cancellation after check-in', async () => {
    prisma.seedReservation({
      reservationId: 'reservation_other_owner',
      userId: 'user_other_student',
      seatId: 'seat_reserved_001'
    });
    prisma.seedReservation({
      reservationId: 'reservation_checked_in',
      userId: 'user_student',
      seatId: 'seat_free_001',
      status: ReservationStatus.CHECKED_IN,
      checkedInAt: new Date('2026-05-03T09:01:00.000Z')
    });

    const forbidden = await request(app.getHttpServer())
      .delete('/reservations/reservation_other_owner')
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(403);
    const notActive = await request(app.getHttpServer())
      .delete('/reservations/reservation_checked_in')
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(409);

    expect(forbidden.body).toMatchObject({ code: ApiErrorCode.FORBIDDEN });
    expect(notActive.body).toMatchObject({ code: ApiErrorCode.RESERVATION_NOT_ACTIVE });
  });

  it('enforces student and administrator permission boundaries', async () => {
    const adminCreate = await request(app.getHttpServer())
      .post('/reservations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        seat_id: 'seat_free_001',
        start_time: '2026-05-03T14:00:00.000Z',
        end_time: '2026-05-03T15:00:00.000Z'
      })
      .expect(403);
    const studentAdminRead = await request(app.getHttpServer())
      .get('/admin/reservations/current')
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(403);

    expect(adminCreate.body).toMatchObject({ code: ApiErrorCode.FORBIDDEN });
    expect(studentAdminRead.body).toMatchObject({ code: ApiErrorCode.FORBIDDEN });
  });

  it('returns current and historical reservations for students and current reservations for admins', async () => {
    prisma.seedReservation({
      reservationId: 'reservation_active_student',
      userId: 'user_student',
      seatId: 'seat_reserved_001'
    });
    prisma.seedReservation({
      reservationId: 'reservation_cancelled_student',
      userId: 'user_student',
      seatId: 'seat_free_001',
      status: ReservationStatus.CANCELLED,
      releasedAt: new Date('2026-05-03T08:30:00.000Z')
    });

    const current = await request(app.getHttpServer())
      .get('/reservations/current')
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200);
    const history = await request(app.getHttpServer())
      .get('/reservations/history?page=1&page_size=10')
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200);
    const adminList = await request(app.getHttpServer())
      .get('/admin/reservations/current')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const adminSeat = await request(app.getHttpServer())
      .get('/admin/reservations/seats/seat_reserved_001')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(current.body).toMatchObject({ reservation_id: 'reservation_active_student' });
    expect(history.body).toMatchObject({ total: 2 });
    expect(adminList.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ reservation_id: 'reservation_active_student' })
      ])
    );
    expect(adminSeat.body).toMatchObject({ reservation_id: 'reservation_active_student' });
  });

  it('expires waiting check-in reservations as no-show through the testable service method', async () => {
    prisma.seedReservation({
      reservationId: 'reservation_expired',
      userId: 'user_student',
      seatId: 'seat_reserved_001',
      startTime: new Date('2026-05-03T07:00:00.000Z'),
      endTime: new Date('2026-05-03T08:00:00.000Z'),
      checkinStartTime: new Date('2026-05-03T06:55:00.000Z'),
      checkinDeadline: new Date('2026-05-03T07:15:00.000Z')
    });

    const count = await reservationsService.expireNoShowReservations(
      new Date('2026-05-03T07:16:00.000Z')
    );

    expect(count).toBe(1);
    expect(
      prisma.reservations.find((reservation) => reservation.reservationId === 'reservation_expired')
    ).toMatchObject({
      status: ReservationStatus.NO_SHOW,
      releaseReason: 'NO_SHOW'
    });
    expect(prisma.users.find((user) => user.userId === 'user_student')).toMatchObject({
      noShowCountWeek: 1,
      noShowCountMonth: 1
    });
    expect(prisma.seats.find((seat) => seat.seatId === 'seat_reserved_001')?.businessStatus).toBe(
      SeatStatus.FREE
    );
  });

  it('does not create double reservations when two overlapping requests race', async () => {
    const requests = await Promise.allSettled([
      request(app.getHttpServer())
        .post('/reservations')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          seat_id: 'seat_free_001',
          start_time: '2026-05-03T16:00:00.000Z',
          end_time: '2026-05-03T17:00:00.000Z'
        }),
      request(app.getHttpServer())
        .post('/reservations')
        .set('Authorization', `Bearer ${otherStudentToken}`)
        .send({
          seat_id: 'seat_free_001',
          start_time: '2026-05-03T16:00:00.000Z',
          end_time: '2026-05-03T17:00:00.000Z'
        })
    ]);

    const responses = requests.map((result) => {
      if (result.status === 'rejected') {
        throw result.reason;
      }

      return result.value;
    });
    const created = prisma.reservations.filter(
      (reservation) =>
        reservation.seatId === 'seat_free_001' &&
        reservation.startTime.toISOString() === '2026-05-03T16:00:00.000Z'
    );

    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(created).toHaveLength(1);
  });
});

const seedDemoData = (prisma: FakePrismaService): void => {
  prisma.seedUser({ userId: 'user_student', roles: [UserRole.STUDENT] });
  prisma.seedUser({ userId: 'user_other_student', roles: [UserRole.STUDENT] });
  prisma.seedUser({ userId: 'user_admin', roles: [UserRole.ADMIN] });
  prisma.seedSeat({ seatId: 'seat_free_001', seatNo: 'A-001' });
  prisma.seedSeat({ seatId: 'seat_other_001', seatNo: 'A-002' });
  prisma.seedSeat({
    seatId: 'seat_reserved_001',
    seatNo: 'A-003',
    businessStatus: SeatStatus.RESERVED
  });
  prisma.seedSeat({
    seatId: 'seat_maintenance_001',
    seatNo: 'A-004',
    availabilityStatus: SeatAvailability.UNAVAILABLE,
    unavailableReason: SeatUnavailableReason.ADMIN_MAINTENANCE,
    maintenance: true
  });
  prisma.seedSeat({
    seatId: 'seat_offline_001',
    seatNo: 'A-005',
    availabilityStatus: SeatAvailability.UNAVAILABLE,
    unavailableReason: SeatUnavailableReason.DEVICE_OFFLINE
  });
};

const signToken = async (
  tokenService: TokenService,
  userId: string,
  roles: UserRole[]
): Promise<string> =>
  (
    await tokenService.signUserToken({
      user_id: userId,
      roles
    })
  ).token;

const matchesReservation = (
  reservation: FakeReservation,
  where: ReservationWhere | undefined
): boolean => {
  if (where === undefined) {
    return true;
  }

  if (where.userId !== undefined && reservation.userId !== where.userId) {
    return false;
  }

  if (where.seatId !== undefined && reservation.seatId !== where.seatId) {
    return false;
  }

  if (where.status !== undefined) {
    if (typeof where.status === 'object') {
      if (where.status.in !== undefined && !where.status.in.includes(reservation.status)) {
        return false;
      }
    } else if (reservation.status !== where.status) {
      return false;
    }
  }

  if (where.startTime?.lt !== undefined && !(reservation.startTime < where.startTime.lt)) {
    return false;
  }

  if (where.endTime?.gt !== undefined && !(reservation.endTime > where.endTime.gt)) {
    return false;
  }

  if (
    where.checkinDeadline?.lt !== undefined &&
    !(reservation.checkinDeadline < where.checkinDeadline.lt)
  ) {
    return false;
  }

  return true;
};

const requiredString = (value: string | undefined): string => {
  if (value === undefined) {
    throw new Error('Missing required fake string.');
  }

  return value;
};

const requiredDate = (value: Date | undefined): Date => {
  if (value === undefined) {
    throw new Error('Missing required fake date.');
  }

  return value;
};
