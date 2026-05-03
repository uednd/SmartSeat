import { type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import {
  AuthProvider,
  DeviceOnlineStatus,
  PresenceStatus,
  ReservationStatus,
  SeatAvailability,
  SeatStatus,
  SeatUnavailableReason,
  SensorHealthStatus
} from '@prisma/client';
import { ApiErrorCode, UserRole } from '@smartseat/contracts';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../app.module.js';
import { setupApiPlatform } from '../app.setup.js';
import { PrismaService } from '../common/database/prisma.service.js';
import { TokenService } from '../modules/auth/token.service.js';

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

interface FakeBinding {
  bindingId: string;
  deviceId: string;
  seatId: string;
  boundAt: Date;
  unboundAt: Date | null;
  reason: string | null;
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

interface FakeAnomaly {
  eventId: string;
  seatId: string;
  status: string;
}

class FakePrismaService {
  users: FakeUser[] = [];
  seats: FakeSeat[] = [];
  devices: FakeDevice[] = [];
  bindings: FakeBinding[] = [];
  reservations: FakeReservation[] = [];
  anomalies: FakeAnomaly[] = [];

  private seatSequence = 0;
  private deviceSequence = 0;
  private bindingSequence = 0;

  user = {
    findUnique: async ({ where }: { where: { userId: string } }) =>
      this.users.find((user) => user.userId === where.userId) ?? null
  };

  seat = {
    findMany: async (args: {
      where?: { availabilityStatus?: SeatAvailability };
      skip?: number;
      take?: number;
    }) => {
      const filtered = this.seats
        .filter((seat) => matchesValue(seat.availabilityStatus, args.where?.availabilityStatus))
        .sort((left, right) =>
          `${left.area}:${left.seatNo}`.localeCompare(`${right.area}:${right.seatNo}`)
        );

      return filtered.slice(args.skip ?? 0, (args.skip ?? 0) + (args.take ?? filtered.length));
    },
    count: async (args?: { where?: { availabilityStatus?: SeatAvailability } }) =>
      this.seats.filter((seat) =>
        matchesValue(seat.availabilityStatus, args?.where?.availabilityStatus)
      ).length,
    findUnique: async ({ where }: { where: { seatId: string } }) =>
      this.seats.find((seat) => seat.seatId === where.seatId) ?? null,
    create: async ({ data }: { data: Partial<FakeSeat> }) => {
      if (this.seats.some((seat) => seat.seatId === data.seatId || seat.seatNo === data.seatNo)) {
        throw createPrismaConflict();
      }

      this.seatSequence += 1;
      const now = new Date('2026-05-03T08:00:00.000Z');
      const seat: FakeSeat = {
        seatId: data.seatId ?? `seat_created_${this.seatSequence}`,
        seatNo: requiredString(data.seatNo),
        area: requiredString(data.area),
        businessStatus: data.businessStatus ?? SeatStatus.FREE,
        availabilityStatus: data.availabilityStatus ?? SeatAvailability.AVAILABLE,
        unavailableReason: data.unavailableReason ?? null,
        deviceId: data.deviceId ?? null,
        presenceStatus: data.presenceStatus ?? PresenceStatus.UNKNOWN,
        maintenance: data.maintenance ?? false,
        createdAt: data.createdAt ?? now,
        updatedAt: data.updatedAt ?? now
      };

      this.seats.push(seat);
      return seat;
    },
    update: async ({ where, data }: { where: { seatId: string }; data: Partial<FakeSeat> }) => {
      const seat = this.seats.find((candidate) => candidate.seatId === where.seatId);

      if (seat === undefined) {
        throw new Error('Missing fake seat.');
      }

      if (
        data.seatNo !== undefined &&
        this.seats.some(
          (candidate) => candidate.seatId !== where.seatId && candidate.seatNo === data.seatNo
        )
      ) {
        throw createPrismaConflict();
      }

      Object.assign(seat, data, { updatedAt: new Date('2026-05-03T08:10:00.000Z') });
      return seat;
    }
  };

  device = {
    findMany: async (args: {
      where?: { onlineStatus?: DeviceOnlineStatus };
      skip?: number;
      take?: number;
    }) => {
      const filtered = this.devices
        .filter((device) => matchesValue(device.onlineStatus, args.where?.onlineStatus))
        .sort((left, right) => left.deviceId.localeCompare(right.deviceId));

      return filtered.slice(args.skip ?? 0, (args.skip ?? 0) + (args.take ?? filtered.length));
    },
    count: async (args?: { where?: { onlineStatus?: DeviceOnlineStatus } }) =>
      this.devices.filter((device) => matchesValue(device.onlineStatus, args?.where?.onlineStatus))
        .length,
    findUnique: async ({ where }: { where: { deviceId: string } }) =>
      this.devices.find((device) => device.deviceId === where.deviceId) ?? null,
    create: async ({ data }: { data: Partial<FakeDevice> }) => {
      if (
        this.devices.some(
          (device) => device.deviceId === data.deviceId || device.mqttClientId === data.mqttClientId
        )
      ) {
        throw createPrismaConflict();
      }

      this.deviceSequence += 1;
      const now = new Date('2026-05-03T08:00:00.000Z');
      const device: FakeDevice = {
        deviceId: data.deviceId ?? `device_created_${this.deviceSequence}`,
        seatId: data.seatId ?? null,
        mqttClientId: requiredString(data.mqttClientId),
        onlineStatus: data.onlineStatus ?? DeviceOnlineStatus.OFFLINE,
        lastHeartbeatAt: data.lastHeartbeatAt ?? null,
        sensorStatus: data.sensorStatus ?? SensorHealthStatus.UNKNOWN,
        sensorModel: data.sensorModel ?? null,
        firmwareVersion: data.firmwareVersion ?? null,
        hardwareVersion: data.hardwareVersion ?? null,
        networkStatus: data.networkStatus ?? null,
        createdAt: data.createdAt ?? now,
        updatedAt: data.updatedAt ?? now
      };

      this.devices.push(device);
      return device;
    },
    update: async ({ where, data }: { where: { deviceId: string }; data: Partial<FakeDevice> }) => {
      const device = this.devices.find((candidate) => candidate.deviceId === where.deviceId);

      if (device === undefined) {
        throw new Error('Missing fake device.');
      }

      if (
        data.mqttClientId !== undefined &&
        this.devices.some(
          (candidate) =>
            candidate.deviceId !== where.deviceId && candidate.mqttClientId === data.mqttClientId
        )
      ) {
        throw createPrismaConflict();
      }

      Object.assign(device, data, { updatedAt: new Date('2026-05-03T08:10:00.000Z') });
      return device;
    }
  };

  deviceSeatBinding = {
    findFirst: async ({ where }: { where: Partial<FakeBinding> }) =>
      this.bindings.find((binding) => matchesBinding(binding, where)) ?? null,
    create: async ({ data }: { data: Partial<FakeBinding> }) => {
      if (
        this.bindings.some(
          (binding) =>
            binding.unboundAt === null &&
            (binding.deviceId === data.deviceId || binding.seatId === data.seatId)
        )
      ) {
        throw createPrismaConflict();
      }

      this.bindingSequence += 1;
      const binding: FakeBinding = {
        bindingId: data.bindingId ?? `binding_created_${this.bindingSequence}`,
        deviceId: requiredString(data.deviceId),
        seatId: requiredString(data.seatId),
        boundAt: data.boundAt ?? new Date('2026-05-03T08:00:00.000Z'),
        unboundAt: data.unboundAt ?? null,
        reason: data.reason ?? null
      };

      this.bindings.push(binding);
      return binding;
    },
    update: async ({
      where,
      data
    }: {
      where: { bindingId: string };
      data: Partial<FakeBinding>;
    }) => {
      const binding = this.bindings.find((candidate) => candidate.bindingId === where.bindingId);

      if (binding === undefined) {
        throw new Error('Missing fake binding.');
      }

      Object.assign(binding, data);
      return binding;
    }
  };

  reservation = {
    findFirst: async ({
      where
    }: {
      where: { seatId: string; status: { in: readonly ReservationStatus[] } };
    }) =>
      this.reservations
        .filter(
          (reservation) =>
            reservation.seatId === where.seatId && where.status.in.includes(reservation.status)
        )
        .sort((left, right) => left.startTime.getTime() - right.startTime.getTime())[0] ?? null
  };

  anomalyEvent = {
    count: async ({ where }: { where: { seatId: string; status: string } }) =>
      this.anomalies.filter(
        (anomaly) => anomaly.seatId === where.seatId && anomaly.status === where.status
      ).length
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
      seatNo: requiredString(data.seatNo),
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
      mqttClientId: data.mqttClientId ?? `mqtt-${requiredString(data.deviceId)}`,
      onlineStatus: data.onlineStatus ?? DeviceOnlineStatus.ONLINE,
      lastHeartbeatAt: data.lastHeartbeatAt ?? new Date('2026-05-03T07:59:00.000Z'),
      sensorStatus: data.sensorStatus ?? SensorHealthStatus.OK,
      sensorModel: data.sensorModel ?? 'placeholder-mmwave-adapter',
      firmwareVersion: data.firmwareVersion ?? 'demo-firmware-0.1.0',
      hardwareVersion: data.hardwareVersion ?? 'esp32-p4-demo',
      networkStatus: data.networkStatus ?? 'demo-online',
      createdAt: data.createdAt ?? now,
      updatedAt: data.updatedAt ?? now
    };

    this.devices.push(device);
    return device;
  }

  seedBinding(data: Partial<FakeBinding>): FakeBinding {
    const binding: FakeBinding = {
      bindingId: requiredString(data.bindingId),
      deviceId: requiredString(data.deviceId),
      seatId: requiredString(data.seatId),
      boundAt: data.boundAt ?? new Date('2026-05-03T07:55:00.000Z'),
      unboundAt: data.unboundAt ?? null,
      reason: data.reason ?? null
    };

    this.bindings.push(binding);
    return binding;
  }

  seedReservation(data: Partial<FakeReservation>): FakeReservation {
    const startTime = data.startTime ?? new Date('2026-05-03T09:00:00.000Z');
    const reservation: FakeReservation = {
      reservationId: requiredString(data.reservationId),
      userId: data.userId ?? 'user_student',
      seatId: requiredString(data.seatId),
      startTime,
      endTime: data.endTime ?? new Date('2026-05-03T10:00:00.000Z'),
      checkinStartTime: data.checkinStartTime ?? new Date('2026-05-03T08:55:00.000Z'),
      checkinDeadline: data.checkinDeadline ?? new Date('2026-05-03T09:15:00.000Z'),
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
}

describe('API-SEAT-01 seats and devices API', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let prisma: FakePrismaService;
  let tokenService: TokenService;
  let studentToken: string;
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
    studentToken = (
      await tokenService.signUserToken({
        user_id: 'user_student',
        roles: [UserRole.STUDENT]
      })
    ).token;
    adminToken = (
      await tokenService.signUserToken({
        user_id: 'user_admin',
        roles: [UserRole.ADMIN]
      })
    ).token;
  });

  afterEach(async () => {
    await app.close();
    await moduleRef.close();
  });

  it('returns public seat list without administrator device fields', async () => {
    const response = await request(app.getHttpServer()).get('/seats').expect(200);

    expect(response.body).toMatchObject({
      page: 1,
      page_size: 20,
      total: 2
    });
    expect(response.body.items[0]).toMatchObject({
      seat_id: 'seat_demo_001',
      seat_no: 'DEMO-A-001',
      area: '初赛演示区',
      business_status: SeatStatus.RESERVED,
      availability_status: SeatAvailability.AVAILABLE,
      device_id: 'device_demo_esp32p4_001',
      presence_status: PresenceStatus.ABSENT
    });
    expect(JSON.stringify(response.body)).not.toContain('mqtt_client_id');
    expect(JSON.stringify(response.body)).not.toContain('hardware_version');
    expect(JSON.stringify(response.body)).not.toContain('network_status');
  });

  it('returns public seat detail with occupancy and public device summary', async () => {
    const response = await request(app.getHttpServer()).get('/seats/seat_demo_001').expect(200);

    expect(response.body).toMatchObject({
      seat_id: 'seat_demo_001',
      current_occupancy: {
        reservation_id: 'reservation_active_001',
        seat_id: 'seat_demo_001',
        status: ReservationStatus.WAITING_CHECKIN
      },
      device: {
        device_id: 'device_demo_esp32p4_001',
        seat_id: 'seat_demo_001',
        online_status: DeviceOnlineStatus.ONLINE,
        firmware_version: 'demo-firmware-0.1.0'
      }
    });
    expect(response.body.current_occupancy).not.toHaveProperty('user_id');
    expect(response.body.device).not.toHaveProperty('mqtt_client_id');
  });

  it('requires login for device reads and returns device list and detail', async () => {
    const unauthenticated = await request(app.getHttpServer()).get('/devices').expect(401);
    const list = await request(app.getHttpServer())
      .get('/devices')
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200);
    const detail = await request(app.getHttpServer())
      .get('/devices/device_demo_esp32p4_001')
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200);

    expect(unauthenticated.body).toMatchObject({ code: ApiErrorCode.AUTH_REQUIRED });
    expect(list.body.items[0]).toMatchObject({
      device_id: 'device_demo_esp32p4_001',
      seat_id: 'seat_demo_001',
      online_status: DeviceOnlineStatus.ONLINE,
      firmware_version: 'demo-firmware-0.1.0'
    });
    expect(detail.body).toMatchObject({
      device_id: 'device_demo_esp32p4_001',
      seat_id: 'seat_demo_001',
      online_status: DeviceOnlineStatus.ONLINE
    });
    expect(detail.body).not.toHaveProperty('mqtt_client_id');
  });

  it('allows administrators to create, edit, disable, and enable seats', async () => {
    const created = await request(app.getHttpServer())
      .post('/admin/seats')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ seat_id: 'seat_created', seat_no: 'B-001', area: '二楼' })
      .expect(201);
    const updated = await request(app.getHttpServer())
      .patch('/admin/seats/seat_created')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ area: '三楼' })
      .expect(200);
    const disabled = await request(app.getHttpServer())
      .patch('/admin/seats/seat_created/enabled')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ enabled: false, reason: 'maintenance' })
      .expect(200);
    const enabled = await request(app.getHttpServer())
      .patch('/admin/seats/seat_created/enabled')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ enabled: true })
      .expect(200);

    expect(created.body).toMatchObject({
      seat_id: 'seat_created',
      seat_no: 'B-001',
      availability_status: SeatAvailability.AVAILABLE,
      maintenance: false
    });
    expect(updated.body).toMatchObject({ area: '三楼' });
    expect(disabled.body).toMatchObject({
      maintenance: true,
      availability_status: SeatAvailability.UNAVAILABLE,
      unavailable_reason: SeatUnavailableReason.ADMIN_MAINTENANCE
    });
    expect(enabled.body).toMatchObject({
      maintenance: false,
      availability_status: SeatAvailability.AVAILABLE
    });
  });

  it('allows administrators to create, update, bind, and unbind devices', async () => {
    const created = await request(app.getHttpServer())
      .post('/admin/devices')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        device_id: 'device_created',
        mqtt_client_id: 'smartseat-created',
        firmware_version: '0.2.0'
      })
      .expect(201);
    const updated = await request(app.getHttpServer())
      .patch('/admin/devices/device_created')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ firmware_version: '0.2.1', network_status: 'configured' })
      .expect(200);
    const bound = await request(app.getHttpServer())
      .put('/admin/devices/device_created/binding')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ seat_id: 'seat_free_001', reason: 'initial binding' })
      .expect(200);
    const unbound = await request(app.getHttpServer())
      .post('/admin/devices/device_created/unbind')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'replace terminal' })
      .expect(200);

    expect(created.body).toMatchObject({
      device_id: 'device_created',
      mqtt_client_id: 'smartseat-created',
      online_status: DeviceOnlineStatus.OFFLINE,
      firmware_version: '0.2.0'
    });
    expect(updated.body).toMatchObject({
      firmware_version: '0.2.1',
      network_status: 'configured'
    });
    expect(bound.body).toMatchObject({
      device_id: 'device_created',
      seat_id: 'seat_free_001',
      seat: {
        seat_id: 'seat_free_001',
        availability_status: SeatAvailability.UNAVAILABLE,
        unavailable_reason: SeatUnavailableReason.DEVICE_OFFLINE
      }
    });
    expect(unbound.body).not.toHaveProperty('seat_id');
    expect(
      prisma.bindings.find((binding) => binding.deviceId === 'device_created')?.unboundAt
    ).toBeInstanceOf(Date);
  });

  it('rejects student administrator maintenance requests', async () => {
    const response = await request(app.getHttpServer())
      .post('/admin/devices')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ device_id: 'device_forbidden', mqtt_client_id: 'forbidden' })
      .expect(403);

    expect(response.body).toMatchObject({ code: ApiErrorCode.FORBIDDEN });
  });

  it('enforces active device-seat binding uniqueness', async () => {
    await request(app.getHttpServer())
      .put('/admin/devices/device_demo_esp32p4_001/binding')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ seat_id: 'seat_demo_001' })
      .expect(200);

    const deviceConflict = await request(app.getHttpServer())
      .put('/admin/devices/device_demo_esp32p4_001/binding')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ seat_id: 'seat_free_001' })
      .expect(409);
    const seatConflict = await request(app.getHttpServer())
      .put('/admin/devices/device_free_001/binding')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ seat_id: 'seat_demo_001' })
      .expect(409);

    expect(deviceConflict.body).toMatchObject({ code: ApiErrorCode.STATE_CONFLICT });
    expect(seatConflict.body).toMatchObject({ code: ApiErrorCode.STATE_CONFLICT });
  });

  it('returns unified resource not found errors', async () => {
    const missingSeat = await request(app.getHttpServer()).get('/seats/missing-seat').expect(404);
    const missingDevice = await request(app.getHttpServer())
      .get('/devices/missing-device')
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(404);

    expect(missingSeat.body).toMatchObject({ code: ApiErrorCode.RESOURCE_NOT_FOUND });
    expect(missingDevice.body).toMatchObject({ code: ApiErrorCode.RESOURCE_NOT_FOUND });
  });
});

const seedDemoData = (prisma: FakePrismaService): void => {
  prisma.seedUser({
    userId: 'user_student',
    roles: [UserRole.STUDENT],
    anonymousName: '匿名用户 01'
  });
  prisma.seedUser({
    userId: 'user_admin',
    roles: [UserRole.ADMIN],
    anonymousName: '演示管理员'
  });
  prisma.seedSeat({
    seatId: 'seat_demo_001',
    seatNo: 'DEMO-A-001',
    area: '初赛演示区',
    businessStatus: SeatStatus.RESERVED,
    deviceId: 'device_demo_esp32p4_001'
  });
  prisma.seedSeat({
    seatId: 'seat_free_001',
    seatNo: 'DEMO-A-002',
    area: '初赛演示区'
  });
  prisma.seedDevice({
    deviceId: 'device_demo_esp32p4_001',
    seatId: 'seat_demo_001',
    mqttClientId: 'smartseat-demo-esp32p4-001'
  });
  prisma.seedDevice({
    deviceId: 'device_free_001',
    seatId: null,
    mqttClientId: 'smartseat-free-001'
  });
  prisma.seedBinding({
    bindingId: 'binding_demo_001',
    deviceId: 'device_demo_esp32p4_001',
    seatId: 'seat_demo_001'
  });
  prisma.seedReservation({
    reservationId: 'reservation_active_001',
    seatId: 'seat_demo_001',
    status: ReservationStatus.WAITING_CHECKIN
  });
  prisma.anomalies.push({
    eventId: 'anomaly_pending_001',
    seatId: 'seat_demo_001',
    status: 'PENDING'
  });
};

const matchesValue = <T>(actual: T, expected: T | undefined): boolean =>
  expected === undefined || actual === expected;

const matchesBinding = (binding: FakeBinding, where: Partial<FakeBinding>): boolean =>
  Object.entries(where).every(([key, value]) => binding[key as keyof FakeBinding] === value);

const requiredString = (value: string | undefined | null): string => {
  if (value === undefined || value === null) {
    throw new Error('Missing required fake data string.');
  }

  return value;
};

const createPrismaConflict = (): Error & { code: string } =>
  Object.assign(new Error('Fake unique constraint conflict.'), { code: 'P2002' });
