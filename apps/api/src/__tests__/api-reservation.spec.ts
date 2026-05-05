import { type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import {
  AuthProvider,
  DeviceOnlineStatus,
  PresenceStatus,
  QRTokenStatus,
  ReservationStatus,
  SeatAvailability,
  SeatStatus,
  SeatUnavailableReason,
  SensorHealthStatus,
  StudyRecordSource
} from '@prisma/client';
import {
  ApiErrorCode,
  DisplayLayout,
  LightStatus,
  SeatStatus as ContractSeatStatus,
  UserRole
} from '@smartseat/contracts';
import type { MqttDisplayPayload, MqttLightPayload } from '@smartseat/contracts';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../app.module.js';
import { setupApiPlatform } from '../app.setup.js';
import { PrismaService } from '../common/database/prisma.service.js';
import { TokenService } from '../modules/auth/token.service.js';
import { MqttCommandBusService } from '../modules/mqtt/mqtt-command-bus.service.js';
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

interface FakeDevice {
  deviceId: string;
  seatId: string | null;
  mqttClientId: string;
  onlineStatus: DeviceOnlineStatus;
  lastHeartbeatAt: Date | null;
  sensorStatus: SensorHealthStatus;
  sensorModel: string | null;
  firmwareVersion: string | null;
  hardwareVersion: string | null;
  networkStatus: string | null;
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

interface FakeQRToken {
  tokenId: string;
  token: string;
  reservationId: string | null;
  seatId: string;
  deviceId: string;
  generatedAt: Date;
  expiredAt: Date;
  usedAt: Date | null;
  status: QRTokenStatus;
}

interface FakeCheckInRecord {
  checkInId: string;
  reservationId: string;
  userId: string;
  seatId: string;
  deviceId: string;
  qrTokenId: string | null;
  checkedInAt: Date;
  presenceStatus: PresenceStatus | null;
  source: string;
  createdAt: Date;
}

class FakeMqttCommandBusService {
  displayPayloads: MqttDisplayPayload[] = [];
  lightPayloads: MqttLightPayload[] = [];

  async publishDisplay(payload: MqttDisplayPayload): Promise<boolean> {
    this.displayPayloads.push(payload);
    return true;
  }

  async publishLight(payload: MqttLightPayload): Promise<boolean> {
    this.lightPayloads.push(payload);
    return true;
  }
}

class FakePrismaService {
  users: FakeUser[] = [];
  seats: FakeSeat[] = [];
  devices: FakeDevice[] = [];
  reservations: FakeReservation[] = [];
  studyRecords: FakeStudyRecord[] = [];
  qrTokens: FakeQRToken[] = [];
  checkInRecords: FakeCheckInRecord[] = [];

  private reservationSequence = 0;
  private studyRecordSequence = 0;
  private qrTokenSequence = 0;
  private checkInRecordSequence = 0;

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

  device = {
    findUnique: async ({ where }: { where: { deviceId: string } }) =>
      this.devices.find((device) => device.deviceId === where.deviceId) ?? null
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
        createdAt: new Date('2026-05-03T08:20:00.000Z')
      };
      this.studyRecords.push(record);
      return record;
    },
    count: async () => this.studyRecords.length
  };

  qRToken = {
    findUnique: async ({ where }: { where: { token?: string; tokenId?: string } }) =>
      this.qrTokens.find(
        (token) =>
          (where.token !== undefined && token.token === where.token) ||
          (where.tokenId !== undefined && token.tokenId === where.tokenId)
      ) ?? null,
    create: async ({ data }: { data: Partial<FakeQRToken> }) => {
      this.qrTokenSequence += 1;
      const token: FakeQRToken = {
        tokenId: data.tokenId ?? `qr_token_${this.qrTokenSequence}`,
        token: requiredString(data.token),
        reservationId: data.reservationId ?? null,
        seatId: requiredString(data.seatId),
        deviceId: requiredString(data.deviceId),
        generatedAt: requiredDate(data.generatedAt),
        expiredAt: requiredDate(data.expiredAt),
        usedAt: data.usedAt ?? null,
        status: data.status ?? QRTokenStatus.UNUSED
      };

      if (this.qrTokens.some((candidate) => candidate.token === token.token)) {
        throw Object.assign(new Error('Fake QR token conflict.'), { code: 'P2002' });
      }

      this.qrTokens.push(token);
      return token;
    },
    update: async ({ where, data }: { where: { tokenId: string }; data: Partial<FakeQRToken> }) => {
      const token = this.qrTokens.find((candidate) => candidate.tokenId === where.tokenId);

      if (token === undefined) {
        throw new Error('Missing fake QR token.');
      }

      Object.assign(token, data);
      return token;
    },
    updateMany: async ({ where, data }: { where?: QRTokenWhere; data: Partial<FakeQRToken> }) => {
      const tokens = this.qrTokens.filter((token) => matchesQRToken(token, where));

      for (const token of tokens) {
        Object.assign(token, data);
      }

      return { count: tokens.length };
    }
  };

  checkInRecord = {
    create: async ({ data }: { data: Omit<FakeCheckInRecord, 'checkInId' | 'createdAt'> }) => {
      this.checkInRecordSequence += 1;
      const record: FakeCheckInRecord = {
        checkInId: `checkin_${this.checkInRecordSequence}`,
        ...data,
        createdAt: new Date('2026-05-03T09:00:00.000Z')
      };

      if (
        record.qrTokenId !== null &&
        this.checkInRecords.some((candidate) => candidate.qrTokenId === record.qrTokenId)
      ) {
        throw Object.assign(new Error('Fake checkin QR token conflict.'), { code: 'P2002' });
      }

      this.checkInRecords.push(record);
      return record;
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

  seedDevice(data: Partial<FakeDevice>): FakeDevice {
    const now = new Date('2026-05-03T08:00:00.000Z');
    const device: FakeDevice = {
      deviceId: requiredString(data.deviceId),
      seatId: data.seatId ?? null,
      mqttClientId: data.mqttClientId ?? requiredString(data.deviceId),
      onlineStatus: data.onlineStatus ?? DeviceOnlineStatus.ONLINE,
      lastHeartbeatAt: data.lastHeartbeatAt ?? now,
      sensorStatus: data.sensorStatus ?? SensorHealthStatus.OK,
      sensorModel: data.sensorModel ?? null,
      firmwareVersion: data.firmwareVersion ?? null,
      hardwareVersion: data.hardwareVersion ?? null,
      networkStatus: data.networkStatus ?? null,
      createdAt: data.createdAt ?? now,
      updatedAt: data.updatedAt ?? now
    };

    this.devices.push(device);
    return device;
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

  seedQrToken(data: Partial<FakeQRToken>): FakeQRToken {
    const now = new Date('2026-05-03T09:00:00.000Z');
    const token: FakeQRToken = {
      tokenId: requiredString(data.tokenId),
      token: requiredString(data.token),
      reservationId: data.reservationId ?? null,
      seatId: requiredString(data.seatId),
      deviceId: requiredString(data.deviceId),
      generatedAt: data.generatedAt ?? now,
      expiredAt: data.expiredAt ?? new Date(now.getTime() + 30_000),
      usedAt: data.usedAt ?? null,
      status: data.status ?? QRTokenStatus.UNUSED
    };

    this.qrTokens.push(token);
    return token;
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
  reservationId?: string | { not?: string };
  userId?: string;
  seatId?: string;
  status?: ReservationStatus | { in?: readonly ReservationStatus[] };
  startTime?: { lt?: Date };
  endTime?: { gt?: Date };
  checkinStartTime?: { lte?: Date };
  checkinDeadline?: { lt?: Date; gte?: Date };
};

type QRTokenWhere = {
  reservationId?: string;
  status?: QRTokenStatus;
  tokenId?: { not?: string };
  expiredAt?: { lte?: Date };
};

describe('API-RES-01 reservation state machine and API', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let prisma: FakePrismaService;
  let commandBus: FakeMqttCommandBusService;
  let tokenService: TokenService;
  let reservationsService: ReservationsService;
  let studentToken: string;
  let otherStudentToken: string;
  let adminToken: string;

  beforeEach(async () => {
    prisma = new FakePrismaService();
    commandBus = new FakeMqttCommandBusService();
    seedDemoData(prisma);

    moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(MqttCommandBusService)
      .useValue(commandBus)
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
    prisma.seedQrToken({
      tokenId: 'qr_no_show',
      token: 'qr-no-show',
      reservationId: 'reservation_expired',
      seatId: 'seat_reserved_001',
      deviceId: 'device_no_show'
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
    expect(prisma.qrTokens.find((token) => token.tokenId === 'qr_no_show')?.status).toBe(
      QRTokenStatus.INVALIDATED
    );
    expect(prisma.studyRecords).toHaveLength(0);
  });

  it('generates refreshed QR tokens and publishes reserved display payloads', async () => {
    seedCheckinFixture(prisma);
    prisma.seedQrToken({
      tokenId: 'qr_expired_refresh',
      token: 'qr-expired-refresh',
      reservationId: 'reservation_checkin',
      seatId: 'seat_checkin_001',
      deviceId: 'device_checkin_001',
      expiredAt: new Date('2026-05-03T08:59:59.000Z')
    });

    const result = await reservationsService.refreshActiveQrTokens(
      new Date('2026-05-03T09:00:00.000Z')
    );
    const generated = prisma.qrTokens.find((token) => token.tokenId !== 'qr_expired_refresh');

    expect(result).toEqual({ expired: 1, generated: 1, skipped_offline: 0 });
    expect(generated).toMatchObject({
      reservationId: 'reservation_checkin',
      seatId: 'seat_checkin_001',
      deviceId: 'device_checkin_001',
      status: QRTokenStatus.UNUSED,
      expiredAt: new Date('2026-05-03T09:00:30.000Z')
    });
    expect(generated?.token).toHaveLength(43);
    expect(prisma.qrTokens.find((token) => token.tokenId === 'qr_expired_refresh')?.status).toBe(
      QRTokenStatus.EXPIRED
    );
    expect(commandBus.displayPayloads).toHaveLength(1);
    expect(commandBus.displayPayloads[0]).toMatchObject({
      device_id: 'device_checkin_001',
      seat_id: 'seat_checkin_001',
      seat_status: ContractSeatStatus.RESERVED,
      layout: DisplayLayout.RESERVED,
      checkin_deadline: '2026-05-03T09:15:00.000Z',
      qr_token: generated?.token
    });
  });

  it('skips QR generation for offline or unbound devices', async () => {
    seedCheckinFixture(prisma, { deviceOnlineStatus: DeviceOnlineStatus.OFFLINE });

    const result = await reservationsService.refreshActiveQrTokens(
      new Date('2026-05-03T09:00:00.000Z')
    );

    expect(result).toEqual({ expired: 0, generated: 0, skipped_offline: 1 });
    expect(prisma.qrTokens).toHaveLength(0);
    expect(commandBus.displayPayloads).toHaveLength(0);
  });

  it('checks in with a valid QR token and synchronizes terminal state', async () => {
    const { token } = seedCheckinFixture(prisma, { ...liveCheckinWindow(), seedToken: true });

    const response = await request(app.getHttpServer())
      .post('/checkin')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        seat_id: token.seatId,
        device_id: token.deviceId,
        token: token.token,
        timestamp: new Date().toISOString()
      })
      .expect(201);

    expect(response.body).toMatchObject({
      reservation: {
        reservation_id: 'reservation_checkin',
        status: ReservationStatus.CHECKED_IN,
        checked_in_at: expect.any(String)
      },
      seat: {
        seat_id: 'seat_checkin_001',
        business_status: SeatStatus.OCCUPIED
      },
      checked_in_at: expect.any(String)
    });
    expect(
      prisma.reservations.find((reservation) => reservation.reservationId === 'reservation_checkin')
    ).toMatchObject({
      status: ReservationStatus.CHECKED_IN,
      checkedInAt: expect.any(Date)
    });
    expect(prisma.seats.find((seat) => seat.seatId === 'seat_checkin_001')).toMatchObject({
      businessStatus: SeatStatus.OCCUPIED
    });
    expect(prisma.qrTokens.find((candidate) => candidate.tokenId === token.tokenId)).toMatchObject({
      status: QRTokenStatus.USED,
      usedAt: expect.any(Date)
    });
    expect(prisma.checkInRecords).toHaveLength(1);
    expect(prisma.checkInRecords[0]).toMatchObject({
      reservationId: 'reservation_checkin',
      userId: 'user_student',
      seatId: 'seat_checkin_001',
      deviceId: 'device_checkin_001',
      qrTokenId: token.tokenId
    });
    expect(commandBus.displayPayloads).toEqual([
      expect.objectContaining({
        device_id: 'device_checkin_001',
        seat_id: 'seat_checkin_001',
        seat_status: ContractSeatStatus.OCCUPIED,
        layout: DisplayLayout.OCCUPIED
      })
    ]);
    expect(commandBus.displayPayloads[0]?.qr_token).toBeUndefined();
    expect(commandBus.lightPayloads).toEqual([
      expect.objectContaining({
        device_id: 'device_checkin_001',
        seat_id: 'seat_checkin_001',
        light_status: LightStatus.OCCUPIED
      })
    ]);
  });

  it('rejects used, duplicated, invalidated, and expired QR token check-in attempts', async () => {
    const used = seedCheckinFixture(prisma, {
      ...liveCheckinWindow(),
      reservationId: 'reservation_used_token',
      seatId: 'seat_used_token',
      deviceId: 'device_used_token',
      tokenId: 'qr_used_token',
      tokenValue: 'used-token',
      seedToken: true,
      tokenStatus: QRTokenStatus.USED,
      usedAt: new Date('2026-05-03T09:00:00.000Z')
    }).token;
    const duplicated = seedCheckinFixture(prisma, {
      ...liveCheckinWindow(),
      reservationId: 'reservation_duplicated',
      seatId: 'seat_duplicated',
      deviceId: 'device_duplicated',
      tokenId: 'qr_duplicated',
      tokenValue: 'duplicated-token',
      reservationStatus: ReservationStatus.CHECKED_IN,
      checkedInAt: new Date('2026-05-03T09:00:00.000Z'),
      seedToken: true
    }).token;
    const invalidated = seedCheckinFixture(prisma, {
      ...liveCheckinWindow(),
      reservationId: 'reservation_invalidated',
      seatId: 'seat_invalidated',
      deviceId: 'device_invalidated',
      tokenId: 'qr_invalidated',
      tokenValue: 'invalidated-token',
      seedToken: true,
      tokenStatus: QRTokenStatus.INVALIDATED
    }).token;
    const expired = seedCheckinFixture(prisma, {
      ...liveCheckinWindow(),
      reservationId: 'reservation_expired_token',
      seatId: 'seat_expired_token',
      deviceId: 'device_expired_token',
      tokenId: 'qr_expired_token',
      tokenValue: 'expired-token',
      seedToken: true,
      expiredAt: new Date('2026-05-03T08:59:59.000Z')
    }).token;

    const cases = [
      [used, ApiErrorCode.QR_TOKEN_USED],
      [duplicated, ApiErrorCode.CHECKIN_DUPLICATED],
      [invalidated, ApiErrorCode.QR_TOKEN_INVALIDATED],
      [expired, ApiErrorCode.QR_TOKEN_EXPIRED]
    ] as const;

    for (const [token, code] of cases) {
      const response = await request(app.getHttpServer())
        .post('/checkin')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          seat_id: token.seatId,
          device_id: token.deviceId,
          token: token.token,
          timestamp: new Date().toISOString()
        })
        .expect(409);

      expect(response.body).toMatchObject({ code });
    }
    expect(prisma.qrTokens.find((token) => token.tokenId === 'qr_expired_token')?.status).toBe(
      QRTokenStatus.EXPIRED
    );
    expect(prisma.checkInRecords).toHaveLength(0);
  });

  it('rejects non-owner, out-of-window, cancelled, mismatched, and offline check-ins', async () => {
    const otherOwner = seedCheckinFixture(prisma, {
      ...liveCheckinWindow(),
      reservationId: 'reservation_other_owner_checkin',
      seatId: 'seat_other_owner_checkin',
      deviceId: 'device_other_owner_checkin',
      tokenId: 'qr_other_owner_checkin',
      tokenValue: 'other-owner-token',
      userId: 'user_other_student',
      seedToken: true
    }).token;
    const outOfWindow = seedCheckinFixture(prisma, {
      reservationId: 'reservation_out_of_window',
      seatId: 'seat_out_of_window',
      deviceId: 'device_out_of_window',
      tokenId: 'qr_out_of_window',
      tokenValue: 'out-of-window-token',
      checkinStartTime: new Date('2026-05-03T08:00:00.000Z'),
      checkinDeadline: new Date('2026-05-03T08:15:00.000Z'),
      expiredAt: new Date(Date.now() + 30_000),
      seedToken: true
    }).token;
    const cancelled = seedCheckinFixture(prisma, {
      ...liveCheckinWindow(),
      reservationId: 'reservation_cancelled_checkin',
      seatId: 'seat_cancelled_checkin',
      deviceId: 'device_cancelled_checkin',
      tokenId: 'qr_cancelled_checkin',
      tokenValue: 'cancelled-token',
      reservationStatus: ReservationStatus.CANCELLED,
      seedToken: true
    }).token;
    const mismatch = seedCheckinFixture(prisma, {
      ...liveCheckinWindow(),
      reservationId: 'reservation_mismatch',
      seatId: 'seat_mismatch',
      deviceId: 'device_mismatch',
      tokenId: 'qr_mismatch',
      tokenValue: 'mismatch-token',
      seedToken: true
    }).token;
    const offline = seedCheckinFixture(prisma, {
      ...liveCheckinWindow(),
      reservationId: 'reservation_offline_checkin',
      seatId: 'seat_offline_checkin',
      deviceId: 'device_offline_checkin',
      tokenId: 'qr_offline_checkin',
      tokenValue: 'offline-token',
      deviceOnlineStatus: DeviceOnlineStatus.OFFLINE,
      seedToken: true
    }).token;

    const cases = [
      [otherOwner, otherOwner.seatId, otherOwner.deviceId, ApiErrorCode.FORBIDDEN],
      [outOfWindow, outOfWindow.seatId, outOfWindow.deviceId, ApiErrorCode.CHECKIN_WINDOW_CLOSED],
      [cancelled, cancelled.seatId, cancelled.deviceId, ApiErrorCode.RESERVATION_CANCELLED],
      [mismatch, 'seat_wrong', mismatch.deviceId, ApiErrorCode.CHECKIN_CONTEXT_MISMATCH],
      [offline, offline.seatId, offline.deviceId, ApiErrorCode.DEVICE_OFFLINE]
    ] as const;

    for (const [token, seatId, deviceId, code] of cases) {
      const response = await request(app.getHttpServer())
        .post('/checkin')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          seat_id: seatId,
          device_id: deviceId,
          token: token.token,
          timestamp: new Date().toISOString()
        })
        .expect(code === ApiErrorCode.FORBIDDEN ? 403 : 409);

      expect(response.body).toMatchObject({ code });
    }
    expect(prisma.checkInRecords).toHaveLength(0);
  });

  it('can disable check-in without breaking reservation reads', async () => {
    const config = moduleRef.get(ConfigService);
    const { token } = seedCheckinFixture(prisma, { ...liveCheckinWindow(), seedToken: true });

    config.set('CHECKIN_ENABLED', false);

    const rejected = await request(app.getHttpServer())
      .post('/checkin')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        seat_id: token.seatId,
        device_id: token.deviceId,
        token: token.token,
        timestamp: new Date().toISOString()
      })
      .expect(503);
    const current = await request(app.getHttpServer())
      .get('/reservations/current')
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200);

    expect(rejected.body).toMatchObject({ code: ApiErrorCode.CHECKIN_DISABLED });
    expect(current.body).toMatchObject({ reservation_id: 'reservation_checkin' });
  });

  it('returns the current checked-in usage for a student', async () => {
    prisma.seedSeat({
      seatId: 'seat_occupied_usage',
      seatNo: 'B-001',
      businessStatus: SeatStatus.OCCUPIED
    });
    prisma.seedReservation({
      reservationId: 'reservation_usage',
      userId: 'user_student',
      seatId: 'seat_occupied_usage',
      status: ReservationStatus.CHECKED_IN,
      checkedInAt: new Date('2026-05-03T09:02:00.000Z'),
      endTime: new Date('2026-05-03T10:00:00.000Z')
    });

    const response = await request(app.getHttpServer())
      .get('/current-usage')
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200);

    expect(response.body).toMatchObject({
      reservation: {
        reservation_id: 'reservation_usage',
        status: ReservationStatus.CHECKED_IN
      },
      seat: {
        seat_id: 'seat_occupied_usage',
        business_status: SeatStatus.OCCUPIED
      }
    });
    expect(response.body.remaining_seconds).toEqual(expect.any(Number));
  });

  it('extends a checked-in reservation when the following time range has no conflict', async () => {
    const startTime = new Date(Date.now() + 60 * 60_000);
    const endTime = new Date(startTime.getTime() + 60 * 60_000);
    const extendedEndTime = new Date(startTime.getTime() + 90 * 60_000);
    prisma.seedSeat({
      seatId: 'seat_occupied_extend',
      seatNo: 'B-002',
      businessStatus: SeatStatus.ENDING_SOON
    });
    prisma.seedReservation({
      reservationId: 'reservation_extend',
      userId: 'user_student',
      seatId: 'seat_occupied_extend',
      startTime,
      endTime,
      status: ReservationStatus.CHECKED_IN,
      checkedInAt: new Date(startTime.getTime() + 60_000)
    });

    const response = await request(app.getHttpServer())
      .post('/reservations/reservation_extend/extend')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        reservation_id: 'reservation_extend',
        end_time: extendedEndTime.toISOString()
      })
      .expect(201);

    expect(response.body).toMatchObject({
      reservation_id: 'reservation_extend',
      end_time: extendedEndTime.toISOString(),
      status: ReservationStatus.CHECKED_IN
    });
    expect(prisma.seats.find((seat) => seat.seatId === 'seat_occupied_extend')).toMatchObject({
      businessStatus: SeatStatus.OCCUPIED
    });
  });

  it('rejects invalid, conflicting, or unauthorized extension attempts', async () => {
    const startTime = new Date(Date.now() + 60 * 60_000);
    const endTime = new Date(startTime.getTime() + 60 * 60_000);
    const invalidEndTime = new Date(endTime.getTime() - 60_000);
    const extendedEndTime = new Date(startTime.getTime() + 90 * 60_000);
    prisma.seedSeat({
      seatId: 'seat_occupied_extend_reject',
      seatNo: 'B-003',
      businessStatus: SeatStatus.OCCUPIED
    });
    prisma.seedReservation({
      reservationId: 'reservation_extend_reject',
      userId: 'user_student',
      seatId: 'seat_occupied_extend_reject',
      startTime,
      endTime,
      status: ReservationStatus.CHECKED_IN,
      checkedInAt: new Date(startTime.getTime() + 60_000)
    });
    prisma.seedReservation({
      reservationId: 'reservation_following_conflict',
      userId: 'user_other_student',
      seatId: 'seat_occupied_extend_reject',
      startTime: new Date(endTime.getTime() + 10 * 60_000),
      endTime: new Date(endTime.getTime() + 60 * 60_000)
    });
    prisma.seedReservation({
      reservationId: 'reservation_waiting_no_extend',
      userId: 'user_student',
      seatId: 'seat_other_001'
    });

    const forbidden = await request(app.getHttpServer())
      .post('/reservations/reservation_extend_reject/extend')
      .set('Authorization', `Bearer ${otherStudentToken}`)
      .send({
        reservation_id: 'reservation_extend_reject',
        end_time: extendedEndTime.toISOString()
      })
      .expect(403);
    const notActive = await request(app.getHttpServer())
      .post('/reservations/reservation_waiting_no_extend/extend')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        reservation_id: 'reservation_waiting_no_extend',
        end_time: extendedEndTime.toISOString()
      })
      .expect(409);
    const invalidWindow = await request(app.getHttpServer())
      .post('/reservations/reservation_extend_reject/extend')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        reservation_id: 'reservation_extend_reject',
        end_time: invalidEndTime.toISOString()
      })
      .expect(400);
    const conflict = await request(app.getHttpServer())
      .post('/reservations/reservation_extend_reject/extend')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        reservation_id: 'reservation_extend_reject',
        end_time: extendedEndTime.toISOString()
      })
      .expect(409);

    expect(forbidden.body).toMatchObject({ code: ApiErrorCode.FORBIDDEN });
    expect(notActive.body).toMatchObject({ code: ApiErrorCode.RESERVATION_NOT_ACTIVE });
    expect(invalidWindow.body).toMatchObject({ code: ApiErrorCode.VALIDATION_FAILED });
    expect(conflict.body).toMatchObject({ code: ApiErrorCode.RESERVATION_CONFLICT });
  });

  it('releases a checked-in reservation by the owning student and creates one study record', async () => {
    prisma.seedSeat({
      seatId: 'seat_user_release',
      seatNo: 'B-004',
      businessStatus: SeatStatus.OCCUPIED
    });
    prisma.seedReservation({
      reservationId: 'reservation_user_release',
      userId: 'user_student',
      seatId: 'seat_user_release',
      status: ReservationStatus.CHECKED_IN,
      checkedInAt: new Date('2026-05-03T09:00:00.000Z')
    });

    const response = await request(app.getHttpServer())
      .post('/current-usage/release')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        reservation_id: 'reservation_user_release',
        reason: 'leaving now'
      })
      .expect(201);

    expect(response.body).toMatchObject({
      reservation_id: 'reservation_user_release',
      status: ReservationStatus.USER_RELEASED,
      release_reason: 'leaving now'
    });
    expect(prisma.seats.find((seat) => seat.seatId === 'seat_user_release')).toMatchObject({
      businessStatus: SeatStatus.FREE
    });
    expect(prisma.studyRecords).toHaveLength(1);
    expect(prisma.studyRecords[0]).toMatchObject({
      reservationId: 'reservation_user_release',
      userId: 'user_student',
      seatId: 'seat_user_release',
      source: StudyRecordSource.USER_RELEASED
    });
  });

  it('rejects non-owner and repeated current usage release without duplicate study records', async () => {
    prisma.seedSeat({
      seatId: 'seat_user_release_reject',
      seatNo: 'B-005',
      businessStatus: SeatStatus.OCCUPIED
    });
    prisma.seedReservation({
      reservationId: 'reservation_user_release_reject',
      userId: 'user_student',
      seatId: 'seat_user_release_reject',
      status: ReservationStatus.CHECKED_IN,
      checkedInAt: new Date('2026-05-03T09:00:00.000Z')
    });

    const forbidden = await request(app.getHttpServer())
      .post('/current-usage/release')
      .set('Authorization', `Bearer ${otherStudentToken}`)
      .send({ reservation_id: 'reservation_user_release_reject' })
      .expect(403);

    await request(app.getHttpServer())
      .post('/current-usage/release')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ reservation_id: 'reservation_user_release_reject' })
      .expect(201);
    const repeated = await request(app.getHttpServer())
      .post('/current-usage/release')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ reservation_id: 'reservation_user_release_reject' })
      .expect(409);

    expect(forbidden.body).toMatchObject({ code: ApiErrorCode.FORBIDDEN });
    expect(repeated.body).toMatchObject({ code: ApiErrorCode.RESERVATION_NOT_ACTIVE });
    expect(prisma.studyRecords).toHaveLength(1);
  });

  it('advances ending soon, finished, and pending-release usage states idempotently', async () => {
    prisma.seedSeat({
      seatId: 'seat_ending_soon',
      seatNo: 'B-006',
      businessStatus: SeatStatus.OCCUPIED
    });
    prisma.seedSeat({
      seatId: 'seat_finished',
      seatNo: 'B-007',
      businessStatus: SeatStatus.OCCUPIED,
      presenceStatus: PresenceStatus.ABSENT
    });
    prisma.seedSeat({
      seatId: 'seat_pending_release',
      seatNo: 'B-008',
      businessStatus: SeatStatus.OCCUPIED,
      presenceStatus: PresenceStatus.PRESENT
    });
    prisma.seedReservation({
      reservationId: 'reservation_ending_soon',
      userId: 'user_student',
      seatId: 'seat_ending_soon',
      status: ReservationStatus.CHECKED_IN,
      checkedInAt: new Date('2026-05-03T09:00:00.000Z'),
      endTime: new Date('2026-05-03T10:05:00.000Z')
    });
    prisma.seedReservation({
      reservationId: 'reservation_finished',
      userId: 'user_student',
      seatId: 'seat_finished',
      status: ReservationStatus.CHECKED_IN,
      checkedInAt: new Date('2026-05-03T09:05:00.000Z'),
      endTime: new Date('2026-05-03T10:00:00.000Z')
    });
    prisma.seedReservation({
      reservationId: 'reservation_pending_release',
      userId: 'user_other_student',
      seatId: 'seat_pending_release',
      status: ReservationStatus.CHECKED_IN,
      checkedInAt: new Date('2026-05-03T09:00:00.000Z'),
      endTime: new Date('2026-05-03T10:00:00.000Z')
    });

    const first = await reservationsService.advanceUsageReservations(
      new Date('2026-05-03T10:00:00.000Z')
    );
    const second = await reservationsService.advanceUsageReservations(
      new Date('2026-05-03T10:00:00.000Z')
    );

    expect(first).toEqual({ ending_soon: 1, finished: 1, pending_release: 1 });
    expect(second).toEqual({ ending_soon: 0, finished: 0, pending_release: 0 });
    expect(prisma.seats.find((seat) => seat.seatId === 'seat_ending_soon')).toMatchObject({
      businessStatus: SeatStatus.ENDING_SOON
    });
    expect(prisma.seats.find((seat) => seat.seatId === 'seat_finished')).toMatchObject({
      businessStatus: SeatStatus.FREE
    });
    expect(prisma.seats.find((seat) => seat.seatId === 'seat_pending_release')).toMatchObject({
      businessStatus: SeatStatus.PENDING_RELEASE
    });
    expect(
      prisma.reservations.find(
        (reservation) => reservation.reservationId === 'reservation_finished'
      )
    ).toMatchObject({ status: ReservationStatus.FINISHED });
    expect(
      prisma.reservations.find(
        (reservation) => reservation.reservationId === 'reservation_pending_release'
      )
    ).toMatchObject({ status: ReservationStatus.CHECKED_IN });
    expect(prisma.studyRecords).toHaveLength(1);
    expect(prisma.studyRecords[0]).toMatchObject({
      reservationId: 'reservation_finished',
      durationMinutes: 55,
      source: StudyRecordSource.TIME_FINISHED,
      validFlag: true
    });
  });

  it('keeps occupied seats unavailable for new reservations until released or finished', async () => {
    prisma.seedSeat({
      seatId: 'seat_consistency',
      seatNo: 'B-009',
      businessStatus: SeatStatus.OCCUPIED
    });
    prisma.seedReservation({
      reservationId: 'reservation_consistency',
      userId: 'user_student',
      seatId: 'seat_consistency',
      status: ReservationStatus.CHECKED_IN,
      checkedInAt: new Date('2026-05-03T09:00:00.000Z')
    });

    const occupied = await request(app.getHttpServer())
      .post('/reservations')
      .set('Authorization', `Bearer ${otherStudentToken}`)
      .send({
        seat_id: 'seat_consistency',
        start_time: '2026-05-03T11:00:00.000Z',
        end_time: '2026-05-03T12:00:00.000Z'
      })
      .expect(409);

    await request(app.getHttpServer())
      .post('/current-usage/release')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ reservation_id: 'reservation_consistency' })
      .expect(201);
    const released = await request(app.getHttpServer())
      .post('/reservations')
      .set('Authorization', `Bearer ${otherStudentToken}`)
      .send({
        seat_id: 'seat_consistency',
        start_time: '2026-05-03T11:00:00.000Z',
        end_time: '2026-05-03T12:00:00.000Z'
      })
      .expect(201);

    expect(occupied.body).toMatchObject({ code: ApiErrorCode.SEAT_UNAVAILABLE });
    expect(released.body).toMatchObject({
      seat_id: 'seat_consistency',
      status: ReservationStatus.WAITING_CHECKIN
    });
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

const seedCheckinFixture = (
  prisma: FakePrismaService,
  input: {
    userId?: string;
    reservationId?: string;
    seatId?: string;
    deviceId?: string;
    tokenId?: string;
    tokenValue?: string;
    reservationStatus?: ReservationStatus;
    tokenStatus?: QRTokenStatus;
    deviceOnlineStatus?: DeviceOnlineStatus;
    checkinStartTime?: Date;
    checkinDeadline?: Date;
    checkedInAt?: Date | null;
    usedAt?: Date | null;
    expiredAt?: Date;
    seedToken?: boolean;
  } = {}
): { reservation: FakeReservation; seat: FakeSeat; device: FakeDevice; token: FakeQRToken } => {
  const seatId = input.seatId ?? 'seat_checkin_001';
  const deviceId = input.deviceId ?? 'device_checkin_001';
  const reservationId = input.reservationId ?? 'reservation_checkin';
  const tokenId = input.tokenId ?? 'qr_checkin';
  const tokenValue = input.tokenValue ?? 'checkin-token';
  const startTime = new Date('2026-05-03T09:00:00.000Z');
  const seat = prisma.seedSeat({
    seatId,
    seatNo: seatId,
    businessStatus:
      input.reservationStatus === ReservationStatus.CHECKED_IN
        ? SeatStatus.OCCUPIED
        : SeatStatus.RESERVED,
    availabilityStatus:
      input.deviceOnlineStatus === DeviceOnlineStatus.OFFLINE
        ? SeatAvailability.UNAVAILABLE
        : SeatAvailability.AVAILABLE,
    unavailableReason:
      input.deviceOnlineStatus === DeviceOnlineStatus.OFFLINE
        ? SeatUnavailableReason.DEVICE_OFFLINE
        : null,
    deviceId,
    presenceStatus: PresenceStatus.PRESENT
  });
  const device = prisma.seedDevice({
    deviceId,
    seatId,
    onlineStatus: input.deviceOnlineStatus ?? DeviceOnlineStatus.ONLINE
  });
  const reservationInput: Partial<FakeReservation> = {
    reservationId,
    userId: input.userId ?? 'user_student',
    seatId,
    startTime,
    endTime: new Date('2026-05-03T10:00:00.000Z'),
    checkinStartTime: input.checkinStartTime ?? new Date('2026-05-03T08:55:00.000Z'),
    checkinDeadline: input.checkinDeadline ?? new Date('2026-05-03T09:15:00.000Z'),
    status: input.reservationStatus ?? ReservationStatus.WAITING_CHECKIN
  };

  if (input.checkedInAt !== undefined) {
    reservationInput.checkedInAt = input.checkedInAt;
  }

  const reservation = prisma.seedReservation(reservationInput);
  const token =
    input.seedToken === true
      ? prisma.seedQrToken(
          buildQrTokenInput(
            withOptionalQrTokenFields(
              {
                tokenId,
                tokenValue,
                reservationId,
                seatId,
                deviceId
              },
              input
            )
          )
        )
      : {
          tokenId,
          token: tokenValue,
          reservationId,
          seatId,
          deviceId,
          generatedAt: new Date('2026-05-03T09:00:00.000Z'),
          expiredAt: input.expiredAt ?? new Date('2026-05-03T09:00:30.000Z'),
          usedAt: input.usedAt ?? null,
          status: input.tokenStatus ?? QRTokenStatus.UNUSED
        };

  return { reservation, seat, device, token };
};

const liveCheckinWindow = (): {
  checkinStartTime: Date;
  checkinDeadline: Date;
  expiredAt: Date;
} => ({
  checkinStartTime: new Date(Date.now() - 60_000),
  checkinDeadline: new Date(Date.now() + 60_000),
  expiredAt: new Date(Date.now() + 30_000)
});

const withOptionalQrTokenFields = (
  base: {
    tokenId: string;
    tokenValue: string;
    reservationId: string;
    seatId: string;
    deviceId: string;
  },
  input: {
    tokenStatus?: QRTokenStatus;
    usedAt?: Date | null;
    expiredAt?: Date;
  }
): {
  tokenId: string;
  tokenValue: string;
  reservationId: string;
  seatId: string;
  deviceId: string;
  tokenStatus?: QRTokenStatus;
  usedAt?: Date | null;
  expiredAt?: Date;
} => {
  const output: {
    tokenId: string;
    tokenValue: string;
    reservationId: string;
    seatId: string;
    deviceId: string;
    tokenStatus?: QRTokenStatus;
    usedAt?: Date | null;
    expiredAt?: Date;
  } = { ...base };

  if (input.tokenStatus !== undefined) {
    output.tokenStatus = input.tokenStatus;
  }

  if (input.usedAt !== undefined) {
    output.usedAt = input.usedAt;
  }

  if (input.expiredAt !== undefined) {
    output.expiredAt = input.expiredAt;
  }

  return output;
};

const buildQrTokenInput = (input: {
  tokenId: string;
  tokenValue: string;
  reservationId: string;
  seatId: string;
  deviceId: string;
  tokenStatus?: QRTokenStatus;
  usedAt?: Date | null;
  expiredAt?: Date;
}): Partial<FakeQRToken> => {
  const tokenInput: Partial<FakeQRToken> = {
    tokenId: input.tokenId,
    token: input.tokenValue,
    reservationId: input.reservationId,
    seatId: input.seatId,
    deviceId: input.deviceId,
    status: input.tokenStatus ?? QRTokenStatus.UNUSED,
    expiredAt: input.expiredAt ?? new Date('2026-05-03T09:00:30.000Z')
  };

  if (input.usedAt !== undefined) {
    tokenInput.usedAt = input.usedAt;
  }

  return tokenInput;
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

  if (where.reservationId !== undefined) {
    if (typeof where.reservationId === 'object') {
      if (
        where.reservationId.not !== undefined &&
        reservation.reservationId === where.reservationId.not
      ) {
        return false;
      }
    } else if (reservation.reservationId !== where.reservationId) {
      return false;
    }
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
    where.checkinStartTime?.lte !== undefined &&
    !(reservation.checkinStartTime <= where.checkinStartTime.lte)
  ) {
    return false;
  }

  if (
    where.checkinDeadline?.lt !== undefined &&
    !(reservation.checkinDeadline < where.checkinDeadline.lt)
  ) {
    return false;
  }

  if (
    where.checkinDeadline?.gte !== undefined &&
    !(reservation.checkinDeadline >= where.checkinDeadline.gte)
  ) {
    return false;
  }

  return true;
};

const matchesQRToken = (token: FakeQRToken, where: QRTokenWhere | undefined): boolean => {
  if (where === undefined) {
    return true;
  }

  if (where.reservationId !== undefined && token.reservationId !== where.reservationId) {
    return false;
  }

  if (where.status !== undefined && token.status !== where.status) {
    return false;
  }

  if (where.tokenId?.not !== undefined && token.tokenId === where.tokenId.not) {
    return false;
  }

  if (where.expiredAt?.lte !== undefined && !(token.expiredAt <= where.expiredAt.lte)) {
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
