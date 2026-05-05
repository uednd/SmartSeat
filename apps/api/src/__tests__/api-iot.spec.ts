import { Buffer } from 'node:buffer';

import { ConfigService } from '@nestjs/config';
import {
  AnomalySource,
  AnomalyStatus,
  AnomalyType,
  DeviceCommandType,
  DeviceOnlineStatus,
  DisplayLayout,
  LightMode,
  LightStatus,
  PresenceStatus,
  QRTokenStatus,
  ReservationStatus,
  SeatAvailability,
  SeatStatus,
  SeatUnavailableReason,
  SensorHealthStatus,
  StudyRecordSource,
  type MqttCommandPayload,
  type MqttDisplayPayload,
  type MqttLightPayload
} from '@smartseat/contracts';
import { describe, expect, it } from 'vitest';

import { AutoRulesService } from '../jobs/auto-rules.service.js';
import { AnomaliesService } from '../modules/anomalies/anomalies.service.js';
import { DevicesService } from '../modules/devices/devices.service.js';
import { MqttBrokerService } from '../modules/mqtt/mqtt-broker.service.js';
import { MqttCommandBusService } from '../modules/mqtt/mqtt-command-bus.service.js';
import { MqttDeviceStateService } from '../modules/mqtt/mqtt-device-state.service.js';
import { MqttPresenceService } from '../modules/mqtt/mqtt-presence.service.js';
import { ReservationsService } from '../modules/reservations/reservations.service.js';
import { PresenceEvaluatorService } from '../modules/sensors/presence-evaluator.service.js';
import { SensorsService } from '../modules/sensors/sensors.service.js';
import { StudyRecordsService } from '../modules/study-records/study-records.service.js';

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

interface FakeSeat {
  seatId: string;
  seatNo: string;
  area: string;
  businessStatus: SeatStatus;
  availabilityStatus: SeatAvailability;
  unavailableReason: SeatUnavailableReason | null;
  deviceId: string | null;
  presenceStatus: string;
  maintenance: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface FakeSensorReading {
  readingId: string;
  deviceId: string;
  seatId: string;
  presenceStatus: PresenceStatus;
  sensorStatus: SensorHealthStatus | null;
  rawValue: unknown;
  reportedAt: Date;
  createdAt: Date;
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

interface FakeUser {
  userId: string;
  noShowCountWeek: number;
  noShowCountMonth: number;
}

interface FakeQRToken {
  tokenId: string;
  reservationId: string | null;
  seatId: string;
  deviceId: string;
  status: QRTokenStatus;
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

interface FakeAnomalyEvent {
  eventId: string;
  eventType: AnomalyType;
  source: AnomalySource;
  seatId: string;
  userId: string | null;
  deviceId: string | null;
  reservationId: string | null;
  description: string;
  reason: string | null;
  status: AnomalyStatus;
  createdAt: Date;
  resolvedAt: Date | null;
  handledById: string | null;
  handledAt: Date | null;
  handleNote: string | null;
}

interface PublishedMessage {
  topic: string;
  payload: unknown;
  options: { qos: 0 | 1 | 2; retain: boolean };
}

type SensorReadingFindArgs = {
  where?: {
    deviceId?: string;
    seatId?: string;
    presenceStatus?: { not: PresenceStatus };
    reportedAt?: {
      gte?: Date;
      gt?: Date;
      lte?: Date;
    };
  };
  orderBy?: Array<{ reportedAt?: 'asc' | 'desc'; createdAt?: 'asc' | 'desc' }>;
  take?: number;
};

type ReservationWhere = {
  seatId?: string;
  status?: ReservationStatus | { in?: readonly ReservationStatus[] };
  checkinDeadline?: { lt?: Date };
};

type AnomalyWhere = {
  eventType?: AnomalyType;
  seatId?: string;
  deviceId?: string | null;
  reservationId?: string | null;
  status?: AnomalyStatus;
};

class FakePrismaService {
  devices: FakeDevice[] = [];
  seats: FakeSeat[] = [];
  sensorReadings: FakeSensorReading[] = [];
  reservations: FakeReservation[] = [];
  users: FakeUser[] = [];
  qrTokens: FakeQRToken[] = [];
  studyRecords: FakeStudyRecord[] = [];
  anomalyEvents: FakeAnomalyEvent[] = [];

  device = {
    findUnique: async ({ where }: { where: { deviceId: string } }) =>
      this.devices.find((device) => device.deviceId === where.deviceId) ?? null,
    findMany: async (args: {
      where?: {
        onlineStatus?: DeviceOnlineStatus;
        OR?: [{ lastHeartbeatAt: null }, { lastHeartbeatAt: { lt: Date } }];
      };
      orderBy?: Array<{ deviceId: 'asc' }>;
    }) => {
      const cutoff = args.where?.OR?.[1].lastHeartbeatAt.lt;
      const devices = this.devices.filter((device) => {
        if (
          args.where?.onlineStatus !== undefined &&
          device.onlineStatus !== args.where.onlineStatus
        ) {
          return false;
        }

        if (cutoff === undefined) {
          return true;
        }

        return device.lastHeartbeatAt === null || device.lastHeartbeatAt < cutoff;
      });

      return devices.sort((left, right) => left.deviceId.localeCompare(right.deviceId));
    },
    update: async ({ where, data }: { where: { deviceId: string }; data: Partial<FakeDevice> }) => {
      const device = this.devices.find((candidate) => candidate.deviceId === where.deviceId);

      if (device === undefined) {
        throw new Error('Missing fake device.');
      }

      Object.assign(device, data, { updatedAt: new Date('2026-05-03T09:00:00.000Z') });
      return device;
    }
  };

  seat = {
    findUnique: async ({ where }: { where: { seatId: string } }) =>
      this.seats.find((seat) => seat.seatId === where.seatId) ?? null,
    findMany: async (args: {
      where?: { deviceId?: { not: null }; maintenance?: boolean };
      orderBy?: Array<{ seatId: 'asc' }>;
    }) => {
      const seats = this.seats.filter((seat) => {
        if (args.where?.deviceId?.not === null && seat.deviceId === null) {
          return false;
        }

        if (args.where?.maintenance !== undefined && seat.maintenance !== args.where.maintenance) {
          return false;
        }

        return true;
      });

      return seats.sort((left, right) => left.seatId.localeCompare(right.seatId));
    },
    update: async ({ where, data }: { where: { seatId: string }; data: Partial<FakeSeat> }) => {
      const seat = this.seats.find((candidate) => candidate.seatId === where.seatId);

      if (seat === undefined) {
        throw new Error('Missing fake seat.');
      }

      Object.assign(seat, data, { updatedAt: new Date('2026-05-03T09:00:00.000Z') });
      return seat;
    }
  };

  user = {
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

      return user;
    }
  };

  reservation = {
    findMany: async (args: { where?: ReservationWhere; orderBy?: unknown }) =>
      this.reservations
        .filter((reservation) => matchesReservation(reservation, args.where))
        .sort((left, right) => left.endTime.getTime() - right.endTime.getTime()),
    findFirst: async (args: { where?: ReservationWhere; orderBy?: unknown }) =>
      this.reservations
        .filter((reservation) => matchesReservation(reservation, args.where))
        .sort((left, right) => left.endTime.getTime() - right.endTime.getTime())[0] ?? null,
    count: async ({ where }: { where?: ReservationWhere }) =>
      this.reservations.filter((reservation) => matchesReservation(reservation, where)).length,
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

      Object.assign(reservation, data, { updatedAt: new Date('2026-05-03T09:00:00.000Z') });

      return reservation;
    }
  };

  qRToken = {
    updateMany: async ({
      where,
      data
    }: {
      where: { reservationId?: string; status?: QRTokenStatus };
      data: Partial<FakeQRToken>;
    }) => {
      const tokens = this.qrTokens.filter(
        (token) =>
          (where.reservationId === undefined || token.reservationId === where.reservationId) &&
          (where.status === undefined || token.status === where.status)
      );

      for (const token of tokens) {
        Object.assign(token, data);
      }

      return { count: tokens.length };
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

      const record: FakeStudyRecord = {
        recordId: `study_record_${this.studyRecords.length + 1}`,
        ...create,
        createdAt: new Date('2026-05-03T09:00:00.000Z')
      };
      this.studyRecords.push(record);

      return record;
    }
  };

  sensorReading = {
    create: async ({
      data
    }: {
      data: {
        deviceId: string;
        seatId: string;
        presenceStatus: PresenceStatus;
        sensorStatus?: SensorHealthStatus | null;
        rawValue?: unknown;
        reportedAt: Date;
      };
    }) => {
      const reading: FakeSensorReading = {
        readingId: `reading_${this.sensorReadings.length + 1}`,
        deviceId: data.deviceId,
        seatId: data.seatId,
        presenceStatus: data.presenceStatus,
        sensorStatus: data.sensorStatus ?? null,
        rawValue: data.rawValue ?? null,
        reportedAt: data.reportedAt,
        createdAt: new Date('2026-05-03T09:00:00.000Z')
      };

      this.sensorReadings.push(reading);

      return reading;
    },
    findFirst: async (args: SensorReadingFindArgs) =>
      (await this.sensorReading.findMany({ ...args, take: 1 }))[0] ?? null,
    findMany: async (args: SensorReadingFindArgs) => {
      const statusNot = args.where?.presenceStatus?.not;
      const ceiling = args.where?.reportedAt?.lte;
      const greaterThan = args.where?.reportedAt?.gt;
      const floor = args.where?.reportedAt?.gte;
      const readings = this.sensorReadings.filter((reading) => {
        if (args.where?.deviceId !== undefined && reading.deviceId !== args.where.deviceId) {
          return false;
        }

        if (args.where?.seatId !== undefined && reading.seatId !== args.where.seatId) {
          return false;
        }

        if (statusNot !== undefined && reading.presenceStatus === statusNot) {
          return false;
        }

        if (ceiling !== undefined && reading.reportedAt > ceiling) {
          return false;
        }

        if (floor !== undefined && reading.reportedAt < floor) {
          return false;
        }

        if (greaterThan !== undefined && reading.reportedAt <= greaterThan) {
          return false;
        }

        return true;
      });

      readings.sort((left, right) => {
        const reportedDelta = right.reportedAt.getTime() - left.reportedAt.getTime();

        if (reportedDelta !== 0) {
          return reportedDelta;
        }

        return right.createdAt.getTime() - left.createdAt.getTime();
      });

      return readings.slice(0, args.take ?? readings.length);
    }
  };

  anomalyEvent = {
    findFirst: async (args: { where?: AnomalyWhere; orderBy?: unknown }) =>
      this.anomalyEvents
        .filter((event) => matchesAnomaly(event, args.where))
        .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())[0] ?? null,
    create: async ({ data }: { data: Partial<FakeAnomalyEvent> }) => {
      const duplicate = this.anomalyEvents.find(
        (event) =>
          event.status === AnomalyStatus.PENDING &&
          event.eventType === data.eventType &&
          event.seatId === data.seatId &&
          event.deviceId === (data.deviceId ?? null) &&
          event.reservationId === (data.reservationId ?? null)
      );

      if (duplicate !== undefined) {
        throw Object.assign(new Error('Fake anomaly conflict.'), { code: 'P2002' });
      }

      const event: FakeAnomalyEvent = {
        eventId: `anomaly_${this.anomalyEvents.length + 1}`,
        eventType: requiredEnum(data.eventType),
        source: data.source ?? AnomalySource.SYSTEM,
        seatId: requiredString(data.seatId),
        userId: data.userId ?? null,
        deviceId: data.deviceId ?? null,
        reservationId: data.reservationId ?? null,
        description: requiredString(data.description),
        reason: data.reason ?? null,
        status: data.status ?? AnomalyStatus.PENDING,
        createdAt: data.createdAt ?? new Date('2026-05-03T09:00:00.000Z'),
        resolvedAt: data.resolvedAt ?? null,
        handledById: data.handledById ?? null,
        handledAt: data.handledAt ?? null,
        handleNote: data.handleNote ?? null
      };

      this.anomalyEvents.push(event);

      return event;
    },
    updateMany: async ({
      where,
      data
    }: {
      where?: AnomalyWhere;
      data: Partial<FakeAnomalyEvent>;
    }) => {
      const events = this.anomalyEvents.filter((event) => matchesAnomaly(event, where));

      for (const event of events) {
        Object.assign(event, data);
      }

      return { count: events.length };
    }
  };

  async $transaction<T>(callback: (tx: this) => Promise<T>): Promise<T> {
    return await callback(this);
  }
}

class FakeBrokerService {
  published: PublishedMessage[] = [];
  subscribed: Array<{ topic: string; options: { qos: 0 | 1 | 2 } }> = [];
  handlers: Array<(topic: string, payload: Buffer) => void | Promise<void>> = [];

  constructor(private readonly connected: boolean = true) {}

  registerMessageHandler(handler: (topic: string, payload: Buffer) => void | Promise<void>): void {
    this.handlers.push(handler);
  }

  async subscribe(topic: string, options: { qos: 0 | 1 | 2 }): Promise<boolean> {
    this.subscribed.push({ topic, options });
    return this.connected;
  }

  async publishJson(
    topic: string,
    payload: unknown,
    options: { qos: 0 | 1 | 2; retain: boolean }
  ): Promise<boolean> {
    if (!this.connected) {
      return false;
    }

    this.published.push({ topic, payload, options });
    return true;
  }
}

const matchesReservation = (
  reservation: FakeReservation,
  where: ReservationWhere = {}
): boolean => {
  if (where.seatId !== undefined && reservation.seatId !== where.seatId) {
    return false;
  }

  if (where.status !== undefined) {
    if (typeof where.status === 'object' && 'in' in where.status) {
      if (!where.status.in?.includes(reservation.status)) {
        return false;
      }
    } else if (reservation.status !== where.status) {
      return false;
    }
  }

  if (
    where.checkinDeadline?.lt !== undefined &&
    reservation.checkinDeadline >= where.checkinDeadline.lt
  ) {
    return false;
  }

  return true;
};

const matchesAnomaly = (event: FakeAnomalyEvent, where: AnomalyWhere = {}): boolean => {
  if (where.eventType !== undefined && event.eventType !== where.eventType) {
    return false;
  }

  if (where.seatId !== undefined && event.seatId !== where.seatId) {
    return false;
  }

  if (where.deviceId !== undefined && event.deviceId !== where.deviceId) {
    return false;
  }

  if (where.reservationId !== undefined && event.reservationId !== where.reservationId) {
    return false;
  }

  if (where.status !== undefined && event.status !== where.status) {
    return false;
  }

  return true;
};

const requiredString = (value: string | null | undefined): string => {
  if (value === null || value === undefined) {
    throw new Error('Missing required fake string.');
  }

  return value;
};

const requiredEnum = <T extends string>(value: T | null | undefined): T => {
  if (value === null || value === undefined) {
    throw new Error('Missing required fake enum.');
  }

  return value;
};

const createServices = (
  input: {
    connected?: boolean;
    thresholdSeconds?: number;
    presentStableSeconds?: number;
    absentStableSeconds?: number;
    untrustedStableSeconds?: number;
    presenceEvaluationEnabled?: boolean;
  } = {}
) => {
  const prisma = new FakePrismaService();
  const devicesService = new DevicesService(prisma as never);
  const broker = new FakeBrokerService(input.connected ?? true);
  const commandBus = new MqttCommandBusService(
    broker as unknown as MqttBrokerService,
    devicesService
  );
  const config = new ConfigService({
    MQTT_HEARTBEAT_OFFLINE_THRESHOLD_SECONDS: input.thresholdSeconds ?? 75,
    PRESENCE_PRESENT_STABLE_SECONDS: input.presentStableSeconds ?? 60,
    PRESENCE_ABSENT_STABLE_SECONDS: input.absentStableSeconds ?? 300,
    PRESENCE_UNTRUSTED_STABLE_SECONDS: input.untrustedStableSeconds ?? 120,
    PRESENCE_EVALUATION_ENABLED: input.presenceEvaluationEnabled ?? true,
    AUTO_RULES_ENABLED: true,
    AUTO_RULES_NO_SHOW_ENABLED: true,
    AUTO_RULES_USAGE_ENABLED: true,
    AUTO_RULES_OCCUPANCY_ANOMALIES_ENABLED: true,
    AUTO_RULES_DEVICE_RECONCILE_ENABLED: true,
    AUTO_RULES_SENSOR_ERROR_ENABLED: true,
    AUTO_RULES_NO_SHOW_INTERVAL_SECONDS: 30,
    AUTO_RULES_USAGE_INTERVAL_SECONDS: 30,
    AUTO_RULES_OCCUPANCY_ANOMALY_INTERVAL_SECONDS: 30,
    AUTO_RULES_DEVICE_RECONCILE_INTERVAL_SECONDS: 15,
    AUTO_RULES_ENDING_SOON_WINDOW_SECONDS: 600,
    ANOMALY_IDLE_PRESENT_STABLE_SECONDS: 60,
    ANOMALY_OCCUPIED_ABSENT_STABLE_SECONDS: 300,
    ANOMALY_OVERTIME_PRESENT_STABLE_SECONDS: 60,
    ANOMALY_SENSOR_ERROR_STABLE_SECONDS: 120
  });
  const anomaliesService = new AnomaliesService(prisma as never);
  const deviceStateService = new MqttDeviceStateService(
    config,
    broker as unknown as MqttBrokerService,
    devicesService,
    commandBus,
    anomaliesService
  );
  const presenceEvaluator = new PresenceEvaluatorService(config, prisma as never);
  const sensorsService = new SensorsService(config, prisma as never, presenceEvaluator);
  const presenceService = new MqttPresenceService(
    broker as unknown as MqttBrokerService,
    sensorsService
  );
  const studyRecordsService = new StudyRecordsService(prisma as never);
  const reservationsService = new ReservationsService(
    prisma as never,
    config,
    commandBus,
    studyRecordsService
  );
  const autoRulesService = new AutoRulesService(
    config,
    prisma as never,
    reservationsService,
    devicesService,
    anomaliesService,
    commandBus
  );

  return {
    prisma,
    broker,
    devicesService,
    commandBus,
    deviceStateService,
    anomaliesService,
    reservationsService,
    autoRulesService,
    sensorsService,
    presenceService
  };
};

const seedBoundDevice = (
  prisma: FakePrismaService,
  input: {
    onlineStatus?: DeviceOnlineStatus;
    lastHeartbeatAt?: Date | null;
    businessStatus?: SeatStatus;
    availabilityStatus?: SeatAvailability;
    unavailableReason?: SeatUnavailableReason | null;
    maintenance?: boolean;
    presenceStatus?: PresenceStatus;
    sensorStatus?: SensorHealthStatus;
  } = {}
) => {
  const now = new Date('2026-05-03T08:00:00.000Z');
  const device: FakeDevice = {
    deviceId: 'device_001',
    seatId: 'seat_001',
    mqttClientId: 'mqtt-device-001',
    onlineStatus: input.onlineStatus ?? DeviceOnlineStatus.OFFLINE,
    lastHeartbeatAt: input.lastHeartbeatAt ?? null,
    sensorStatus: input.sensorStatus ?? SensorHealthStatus.UNKNOWN,
    sensorModel: null,
    firmwareVersion: null,
    hardwareVersion: null,
    networkStatus: null,
    createdAt: now,
    updatedAt: now
  };
  const seat: FakeSeat = {
    seatId: 'seat_001',
    seatNo: 'A-001',
    area: 'A',
    businessStatus: input.businessStatus ?? SeatStatus.FREE,
    availabilityStatus: input.availabilityStatus ?? SeatAvailability.UNAVAILABLE,
    unavailableReason:
      'unavailableReason' in input
        ? (input.unavailableReason ?? null)
        : SeatUnavailableReason.DEVICE_OFFLINE,
    deviceId: 'device_001',
    presenceStatus: input.presenceStatus ?? PresenceStatus.UNKNOWN,
    maintenance: input.maintenance ?? false,
    createdAt: now,
    updatedAt: now
  };

  prisma.devices.push(device);
  prisma.seats.push(seat);

  return { device, seat };
};

const seedRuleUser = (prisma: FakePrismaService, userId = 'user_student'): FakeUser => {
  const user: FakeUser = {
    userId,
    noShowCountWeek: 0,
    noShowCountMonth: 0
  };

  prisma.users.push(user);

  return user;
};

const seedRuleReservation = (
  prisma: FakePrismaService,
  input: Partial<FakeReservation> = {}
): FakeReservation => {
  const startTime = input.startTime ?? new Date('2026-05-03T09:00:00.000Z');
  const reservation: FakeReservation = {
    reservationId: input.reservationId ?? 'reservation_rule_001',
    userId: input.userId ?? 'user_student',
    seatId: input.seatId ?? 'seat_001',
    startTime,
    endTime: input.endTime ?? new Date('2026-05-03T10:00:00.000Z'),
    checkinStartTime: input.checkinStartTime ?? new Date(startTime.getTime() - 5 * 60 * 1000),
    checkinDeadline: input.checkinDeadline ?? new Date(startTime.getTime() + 15 * 60 * 1000),
    status: input.status ?? ReservationStatus.WAITING_CHECKIN,
    checkedInAt: input.checkedInAt ?? null,
    releasedAt: input.releasedAt ?? null,
    releaseReason: input.releaseReason ?? null,
    createdAt: input.createdAt ?? new Date('2026-05-03T08:00:00.000Z'),
    updatedAt: input.updatedAt ?? new Date('2026-05-03T08:00:00.000Z')
  };

  prisma.reservations.push(reservation);

  return reservation;
};

const seedRuleQrToken = (
  prisma: FakePrismaService,
  input: Partial<FakeQRToken> = {}
): FakeQRToken => {
  const token: FakeQRToken = {
    tokenId: input.tokenId ?? 'qr_rule_001',
    reservationId: input.reservationId ?? 'reservation_rule_001',
    seatId: input.seatId ?? 'seat_001',
    deviceId: input.deviceId ?? 'device_001',
    status: input.status ?? QRTokenStatus.UNUSED
  };

  prisma.qrTokens.push(token);

  return token;
};

const seedRuleReading = (
  prisma: FakePrismaService,
  input: {
    presenceStatus: PresenceStatus;
    reportedAt: Date;
    sensorStatus?: SensorHealthStatus;
  }
): FakeSensorReading => {
  const reading: FakeSensorReading = {
    readingId: `rule_reading_${prisma.sensorReadings.length + 1}`,
    deviceId: 'device_001',
    seatId: 'seat_001',
    presenceStatus: input.presenceStatus,
    sensorStatus: input.sensorStatus ?? SensorHealthStatus.OK,
    rawValue: null,
    reportedAt: input.reportedAt,
    createdAt: input.reportedAt
  };

  prisma.sensorReadings.push(reading);

  return reading;
};

const heartbeatPayload = (overrides: Record<string, unknown> = {}) => ({
  device_id: 'device_001',
  seat_id: 'seat_001',
  timestamp: '2026-05-03T08:00:15.000Z',
  firmware_version: 'fw-1.0.0',
  network_status: 'wifi:rssi=-50',
  sensor_status: SensorHealthStatus.OK,
  display_status: DisplayLayout.FREE,
  ...overrides
});

const presencePayload = (overrides: Record<string, unknown> = {}) => ({
  device_id: 'device_001',
  seat_id: 'seat_001',
  timestamp: '2026-05-03T08:00:00.000Z',
  presence_status: PresenceStatus.PRESENT,
  raw_value: { distance_mm: 730, energy: 41 },
  sensor_status: SensorHealthStatus.OK,
  ...overrides
});

describe('API-IOT-01 MQTT device state', () => {
  it('updates device online state from heartbeat and synchronizes display and light', async () => {
    const { prisma, broker, deviceStateService } = createServices();
    const { device, seat } = seedBoundDevice(prisma);
    const observedAt = new Date('2026-05-03T08:00:20.000Z');

    await deviceStateService.handleHeartbeatMessage(
      'device_001',
      Buffer.from(JSON.stringify(heartbeatPayload())),
      observedAt
    );

    expect(device.onlineStatus).toBe(DeviceOnlineStatus.ONLINE);
    expect(device.lastHeartbeatAt).toEqual(observedAt);
    expect(device.firmwareVersion).toBe('fw-1.0.0');
    expect(device.networkStatus).toBe('wifi:rssi=-50');
    expect(device.sensorStatus).toBe(SensorHealthStatus.OK);
    expect(seat.availabilityStatus).toBe(SeatAvailability.AVAILABLE);
    expect(seat.unavailableReason).toBeNull();
    expect(broker.published.map((message) => message.topic)).toEqual([
      'seat/device_001/display',
      'seat/device_001/light'
    ]);
    expect(broker.published.every((message) => message.options.qos === 1)).toBe(true);
    expect(broker.published.every((message) => message.options.retain === false)).toBe(true);
  });

  it('marks devices offline after the default 75 second threshold', async () => {
    const { prisma, devicesService } = createServices();
    const { device, seat } = seedBoundDevice(prisma, {
      onlineStatus: DeviceOnlineStatus.ONLINE,
      lastHeartbeatAt: new Date('2026-05-03T08:00:00.000Z'),
      availabilityStatus: SeatAvailability.AVAILABLE,
      unavailableReason: null
    });

    const offlineCount = await devicesService.markHeartbeatTimedOutDevices(
      new Date('2026-05-03T08:01:16.000Z'),
      75
    );

    expect(offlineCount).toBe(1);
    expect(device.onlineStatus).toBe(DeviceOnlineStatus.OFFLINE);
    expect(seat.availabilityStatus).toBe(SeatAvailability.UNAVAILABLE);
    expect(seat.unavailableReason).toBe(SeatUnavailableReason.DEVICE_OFFLINE);
  });

  it('uses a configured heartbeat threshold for offline detection', async () => {
    const { prisma, devicesService } = createServices();
    const { device } = seedBoundDevice(prisma, {
      onlineStatus: DeviceOnlineStatus.ONLINE,
      lastHeartbeatAt: new Date('2026-05-03T08:00:00.000Z')
    });

    expect(
      await devicesService.markHeartbeatTimedOutDevices(new Date('2026-05-03T08:00:10.000Z'), 15)
    ).toBe(0);
    expect(device.onlineStatus).toBe(DeviceOnlineStatus.ONLINE);

    expect(
      await devicesService.markHeartbeatTimedOutDevices(new Date('2026-05-03T08:00:16.000Z'), 15)
    ).toBe(1);
    expect(device.onlineStatus).toBe(DeviceOnlineStatus.OFFLINE);
  });

  it('ignores unknown devices and invalid heartbeat payloads safely', async () => {
    const { prisma, broker, deviceStateService } = createServices();
    const { device } = seedBoundDevice(prisma);

    await deviceStateService.handleHeartbeatMessage(
      'unknown_device',
      Buffer.from(JSON.stringify(heartbeatPayload({ device_id: 'unknown_device' }))),
      new Date('2026-05-03T08:00:20.000Z')
    );
    await deviceStateService.handleHeartbeatMessage(
      'device_001',
      Buffer.from(JSON.stringify(heartbeatPayload({ timestamp: 'not-a-date' }))),
      new Date('2026-05-03T08:00:21.000Z')
    );
    await deviceStateService.handleHeartbeatMessage(
      'device_001',
      Buffer.from(JSON.stringify(heartbeatPayload({ device_id: 'device_other' }))),
      new Date('2026-05-03T08:00:22.000Z')
    );
    await deviceStateService.handleHeartbeatMessage(
      'device_001',
      Buffer.from('{not-json'),
      new Date('2026-05-03T08:00:23.000Z')
    );

    expect(device.onlineStatus).toBe(DeviceOnlineStatus.OFFLINE);
    expect(device.lastHeartbeatAt).toBeNull();
    expect(broker.published).toEqual([]);
  });

  it('ignores heartbeat payloads for a mismatched bound seat', async () => {
    const { prisma, broker, deviceStateService } = createServices();
    const { device } = seedBoundDevice(prisma);

    await deviceStateService.handleHeartbeatMessage(
      'device_001',
      Buffer.from(JSON.stringify(heartbeatPayload({ seat_id: 'seat_other' }))),
      new Date('2026-05-03T08:00:20.000Z')
    );

    expect(device.onlineStatus).toBe(DeviceOnlineStatus.OFFLINE);
    expect(device.lastHeartbeatAt).toBeNull();
    expect(broker.published).toEqual([]);
  });

  it('publishes display, light, and command payloads to device topics', async () => {
    const { prisma, broker, commandBus } = createServices();
    seedBoundDevice(prisma, { onlineStatus: DeviceOnlineStatus.ONLINE });
    const display: MqttDisplayPayload = {
      device_id: 'device_001',
      seat_id: 'seat_001',
      timestamp: '2026-05-03T08:00:00.000Z',
      current_time: '2026-05-03T08:00:00.000Z',
      seat_status: SeatStatus.FREE,
      layout: DisplayLayout.FREE
    };
    const light: MqttLightPayload = {
      device_id: 'device_001',
      seat_id: 'seat_001',
      timestamp: '2026-05-03T08:00:00.000Z',
      light_status: LightStatus.FREE,
      color: 'green',
      mode: LightMode.SOLID
    };
    const command: MqttCommandPayload = {
      device_id: 'device_001',
      seat_id: 'seat_001',
      timestamp: '2026-05-03T08:00:00.000Z',
      command_id: 'cmd-001',
      command_type: DeviceCommandType.REFRESH_STATE,
      issued_at: '2026-05-03T08:00:00.000Z'
    };

    await expect(commandBus.publishDisplay(display)).resolves.toBe(true);
    await expect(commandBus.publishLight(light)).resolves.toBe(true);
    await expect(commandBus.publishCommand(command)).resolves.toBe(true);

    expect(broker.published.map((message) => message.topic)).toEqual([
      'seat/device_001/display',
      'seat/device_001/light',
      'seat/device_001/command'
    ]);
    expect(broker.published.map((message) => message.payload)).toEqual([display, light, command]);
  });

  it('does not throw when publishing while MQTT is disconnected', async () => {
    const { commandBus } = createServices({ connected: false });
    const display: MqttDisplayPayload = {
      device_id: 'device_001',
      seat_id: 'seat_001',
      timestamp: '2026-05-03T08:00:00.000Z',
      current_time: '2026-05-03T08:00:00.000Z',
      seat_status: SeatStatus.FREE,
      layout: DisplayLayout.FREE
    };

    await expect(commandBus.publishDisplay(display)).resolves.toBe(false);
  });

  it('records presence readings and marks PRESENT stable only after 60 seconds', async () => {
    const { prisma, sensorsService } = createServices();
    const { seat, device } = seedBoundDevice(prisma, {
      onlineStatus: DeviceOnlineStatus.ONLINE,
      availabilityStatus: SeatAvailability.AVAILABLE,
      unavailableReason: null
    });

    await sensorsService.recordPresence(
      'device_001',
      presencePayload({ timestamp: '2026-05-03T08:00:00.000Z' }),
      new Date('2026-05-03T08:00:00.000Z')
    );
    await sensorsService.recordPresence(
      'device_001',
      presencePayload({ timestamp: '2026-05-03T08:00:59.000Z' }),
      new Date('2026-05-03T08:00:59.000Z')
    );

    expect(seat.presenceStatus).toBe(PresenceStatus.UNKNOWN);

    const result = await sensorsService.recordPresence(
      'device_001',
      presencePayload({ timestamp: '2026-05-03T08:01:00.000Z' }),
      new Date('2026-05-03T08:01:00.000Z')
    );

    expect(result.accepted).toBe(true);
    expect(result.accepted ? result.stablePresence?.presenceStatus : null).toBe(
      PresenceStatus.PRESENT
    );
    expect(seat.presenceStatus).toBe(PresenceStatus.PRESENT);
    expect(device.sensorStatus).toBe(SensorHealthStatus.OK);
    expect(prisma.sensorReadings).toHaveLength(3);
  });

  it('marks ABSENT stable only after 5 minutes', async () => {
    const { prisma, sensorsService } = createServices();
    const { seat } = seedBoundDevice(prisma, {
      onlineStatus: DeviceOnlineStatus.ONLINE,
      availabilityStatus: SeatAvailability.AVAILABLE,
      unavailableReason: null
    });

    await sensorsService.recordPresence(
      'device_001',
      presencePayload({
        presence_status: PresenceStatus.ABSENT,
        timestamp: '2026-05-03T08:00:00.000Z'
      })
    );
    await sensorsService.recordPresence(
      'device_001',
      presencePayload({
        presence_status: PresenceStatus.ABSENT,
        timestamp: '2026-05-03T08:04:59.000Z'
      })
    );

    expect(seat.presenceStatus).toBe(PresenceStatus.UNKNOWN);

    const result = await sensorsService.recordPresence(
      'device_001',
      presencePayload({
        presence_status: PresenceStatus.ABSENT,
        timestamp: '2026-05-03T08:05:00.000Z'
      })
    );

    expect(result.accepted ? result.stablePresence?.presenceStatus : null).toBe(
      PresenceStatus.ABSENT
    );
    expect(seat.presenceStatus).toBe(PresenceStatus.ABSENT);
  });

  it.each([PresenceStatus.UNKNOWN, PresenceStatus.ERROR])(
    'marks %s stable as untrusted only after 2 minutes',
    async (presenceStatus) => {
      const { prisma, sensorsService } = createServices();
      const { seat } = seedBoundDevice(prisma, {
        onlineStatus: DeviceOnlineStatus.ONLINE,
        availabilityStatus: SeatAvailability.AVAILABLE,
        unavailableReason: null
      });

      await sensorsService.recordPresence(
        'device_001',
        presencePayload({
          presence_status: presenceStatus,
          sensor_status:
            presenceStatus === PresenceStatus.ERROR
              ? SensorHealthStatus.ERROR
              : SensorHealthStatus.UNKNOWN,
          timestamp: '2026-05-03T08:00:00.000Z'
        })
      );
      await sensorsService.recordPresence(
        'device_001',
        presencePayload({
          presence_status: presenceStatus,
          sensor_status:
            presenceStatus === PresenceStatus.ERROR
              ? SensorHealthStatus.ERROR
              : SensorHealthStatus.UNKNOWN,
          timestamp: '2026-05-03T08:01:59.000Z'
        })
      );

      expect(seat.presenceStatus).toBe(PresenceStatus.UNKNOWN);
      expect(seat.unavailableReason).toBeNull();

      const result = await sensorsService.recordPresence(
        'device_001',
        presencePayload({
          presence_status: presenceStatus,
          sensor_status:
            presenceStatus === PresenceStatus.ERROR
              ? SensorHealthStatus.ERROR
              : SensorHealthStatus.UNKNOWN,
          timestamp: '2026-05-03T08:02:00.000Z'
        })
      );

      expect(result.accepted ? result.stablePresence?.presenceStatus : null).toBe(presenceStatus);
      expect(seat.presenceStatus).toBe(presenceStatus);
      expect(seat.availabilityStatus).toBe(SeatAvailability.UNAVAILABLE);
      expect(seat.unavailableReason).toBe(SeatUnavailableReason.SENSOR_ERROR);
    }
  );

  it('does not let jitter satisfy an earlier stable presence window', async () => {
    const { prisma, sensorsService } = createServices();
    const { seat } = seedBoundDevice(prisma, {
      onlineStatus: DeviceOnlineStatus.ONLINE,
      availabilityStatus: SeatAvailability.AVAILABLE,
      unavailableReason: null
    });

    await sensorsService.recordPresence(
      'device_001',
      presencePayload({ timestamp: '2026-05-03T08:00:00.000Z' })
    );
    await sensorsService.recordPresence(
      'device_001',
      presencePayload({
        presence_status: PresenceStatus.ABSENT,
        timestamp: '2026-05-03T08:00:30.000Z'
      })
    );
    const result = await sensorsService.recordPresence(
      'device_001',
      presencePayload({ timestamp: '2026-05-03T08:01:00.000Z' })
    );

    expect(result.accepted ? result.stablePresence : null).toBeNull();
    expect(seat.presenceStatus).toBe(PresenceStatus.UNKNOWN);
  });

  it('preserves raw_value and persists readings by device, seat, and timestamp', async () => {
    const { prisma, sensorsService } = createServices();
    seedBoundDevice(prisma);
    const rawValue = { distance_mm: 820, debug: { zone: 'near' } };

    const result = await sensorsService.recordPresence(
      'device_001',
      presencePayload({
        presence_status: PresenceStatus.ABSENT,
        raw_value: rawValue,
        timestamp: '2026-05-03T08:10:00.000Z'
      })
    );

    expect(result.accepted).toBe(true);
    expect(prisma.sensorReadings).toEqual([
      expect.objectContaining({
        deviceId: 'device_001',
        seatId: 'seat_001',
        presenceStatus: PresenceStatus.ABSENT,
        rawValue,
        reportedAt: new Date('2026-05-03T08:10:00.000Z')
      })
    ]);
  });

  it('rejects invalid presence payloads safely', async () => {
    const { prisma, sensorsService, presenceService } = createServices();
    const { device } = seedBoundDevice(prisma);

    await presenceService.handlePresenceMessage(
      'device_001',
      Buffer.from('{not-json'),
      new Date('2026-05-03T08:00:00.000Z')
    );
    await presenceService.handlePresenceMessage(
      'device_001',
      Buffer.from(JSON.stringify(presencePayload({ device_id: 'device_other' }))),
      new Date('2026-05-03T08:00:00.000Z')
    );
    await sensorsService.recordPresence(
      'device_001',
      presencePayload({ timestamp: 'not-a-date' }),
      new Date('2026-05-03T08:00:00.000Z')
    );
    await sensorsService.recordPresence(
      'device_001',
      presencePayload({ presence_status: 'MAYBE' }),
      new Date('2026-05-03T08:00:00.000Z')
    );
    await sensorsService.recordPresence(
      'device_001',
      presencePayload({ raw_value: ['unsupported'] }),
      new Date('2026-05-03T08:00:00.000Z')
    );
    await sensorsService.recordPresence(
      'device_001',
      presencePayload({ raw_value: new Date('2026-05-03T08:00:00.000Z') }),
      new Date('2026-05-03T08:00:00.000Z')
    );
    await sensorsService.recordPresence(
      'device_001',
      presencePayload({ seat_id: 'seat_other' }),
      new Date('2026-05-03T08:00:00.000Z')
    );
    await sensorsService.recordPresence(
      'unknown_device',
      presencePayload({ device_id: 'unknown_device' }),
      new Date('2026-05-03T08:00:00.000Z')
    );

    expect(prisma.sensorReadings).toEqual([]);
    expect(device.sensorStatus).toBe(SensorHealthStatus.UNKNOWN);
  });

  it('persists readings without updating derived presence when evaluation is disabled', async () => {
    const { prisma, sensorsService } = createServices({ presenceEvaluationEnabled: false });
    const { seat } = seedBoundDevice(prisma, {
      onlineStatus: DeviceOnlineStatus.ONLINE,
      availabilityStatus: SeatAvailability.AVAILABLE,
      unavailableReason: null
    });

    await sensorsService.recordPresence(
      'device_001',
      presencePayload({ timestamp: '2026-05-03T08:00:00.000Z' })
    );
    await sensorsService.recordPresence(
      'device_001',
      presencePayload({ timestamp: '2026-05-03T08:01:00.000Z' })
    );

    expect(prisma.sensorReadings).toHaveLength(2);
    expect(seat.presenceStatus).toBe(PresenceStatus.UNKNOWN);
  });
});

describe('API-IOT-03 automatic rules and anomaly events', () => {
  it('releases no-show reservations, creates one anomaly, and keeps state consistent', async () => {
    const { prisma, autoRulesService } = createServices();
    const { seat } = seedBoundDevice(prisma, {
      onlineStatus: DeviceOnlineStatus.ONLINE,
      businessStatus: SeatStatus.RESERVED,
      availabilityStatus: SeatAvailability.AVAILABLE,
      unavailableReason: null
    });
    const user = seedRuleUser(prisma);
    const reservation = seedRuleReservation(prisma, {
      checkinDeadline: new Date('2026-05-03T09:15:00.000Z')
    });
    const token = seedRuleQrToken(prisma, { reservationId: reservation.reservationId });

    const first = await autoRulesService.runNoShowScan(new Date('2026-05-03T09:16:00.000Z'));
    const second = await autoRulesService.runNoShowScan(new Date('2026-05-03T09:16:30.000Z'));

    expect(first).toMatchObject({
      changed_count: 1,
      anomaly_created_count: 1,
      sync_failed_count: 0
    });
    expect(second).toMatchObject({ changed_count: 0, anomaly_created_count: 0 });
    expect(reservation).toMatchObject({
      status: ReservationStatus.NO_SHOW,
      releaseReason: 'NO_SHOW',
      releasedAt: new Date('2026-05-03T09:16:00.000Z')
    });
    expect(seat.businessStatus).toBe(SeatStatus.FREE);
    expect(token.status).toBe(QRTokenStatus.INVALIDATED);
    expect(user.noShowCountWeek).toBe(1);
    expect(user.noShowCountMonth).toBe(1);
    expect(prisma.studyRecords).toHaveLength(0);
    expect(prisma.anomalyEvents).toEqual([
      expect.objectContaining({
        eventType: AnomalyType.NO_SHOW,
        status: AnomalyStatus.PENDING,
        source: AnomalySource.SCHEDULER,
        seatId: 'seat_001',
        deviceId: 'device_001',
        reservationId: reservation.reservationId
      })
    ]);
  });

  it('switches checked-in reservations to ENDING_SOON and synchronizes the terminal', async () => {
    const { prisma, autoRulesService, broker } = createServices();
    const { seat } = seedBoundDevice(prisma, {
      onlineStatus: DeviceOnlineStatus.ONLINE,
      businessStatus: SeatStatus.OCCUPIED,
      availabilityStatus: SeatAvailability.AVAILABLE,
      unavailableReason: null
    });
    seedRuleUser(prisma);
    seedRuleReservation(prisma, {
      status: ReservationStatus.CHECKED_IN,
      checkedInAt: new Date('2026-05-03T09:00:00.000Z'),
      endTime: new Date('2026-05-03T10:05:00.000Z')
    });

    const metrics = await autoRulesService.runUsageScan(new Date('2026-05-03T10:00:00.000Z'));

    expect(metrics).toMatchObject({ changed_count: 1, anomaly_created_count: 0 });
    expect(seat.businessStatus).toBe(SeatStatus.ENDING_SOON);
    expect(broker.published.map((message) => message.topic)).toEqual([
      'seat/device_001/display',
      'seat/device_001/light'
    ]);
  });

  it('creates unreserved occupancy and early leave anomalies from stable presence', async () => {
    const { prisma, autoRulesService } = createServices();
    const { seat } = seedBoundDevice(prisma, {
      onlineStatus: DeviceOnlineStatus.ONLINE,
      businessStatus: SeatStatus.FREE,
      availabilityStatus: SeatAvailability.AVAILABLE,
      unavailableReason: null,
      presenceStatus: PresenceStatus.PRESENT
    });
    seedRuleReading(prisma, {
      presenceStatus: PresenceStatus.PRESENT,
      reportedAt: new Date('2026-05-03T09:00:00.000Z')
    });
    seedRuleReading(prisma, {
      presenceStatus: PresenceStatus.PRESENT,
      reportedAt: new Date('2026-05-03T09:01:00.000Z')
    });

    const unreserved = await autoRulesService.runOccupancyAnomalyScan(
      new Date('2026-05-03T09:01:00.000Z')
    );

    seat.businessStatus = SeatStatus.OCCUPIED;
    seat.presenceStatus = PresenceStatus.ABSENT;
    prisma.sensorReadings = [];
    seedRuleUser(prisma);
    const reservation = seedRuleReservation(prisma, {
      status: ReservationStatus.CHECKED_IN,
      checkedInAt: new Date('2026-05-03T09:00:00.000Z')
    });
    seedRuleReading(prisma, {
      presenceStatus: PresenceStatus.ABSENT,
      reportedAt: new Date('2026-05-03T09:01:00.000Z')
    });
    seedRuleReading(prisma, {
      presenceStatus: PresenceStatus.ABSENT,
      reportedAt: new Date('2026-05-03T09:06:00.000Z')
    });

    const earlyLeave = await autoRulesService.runOccupancyAnomalyScan(
      new Date('2026-05-03T09:06:00.000Z')
    );

    expect(unreserved.anomaly_created_count).toBe(1);
    expect(earlyLeave.anomaly_created_count).toBe(1);
    expect(prisma.anomalyEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: AnomalyType.UNRESERVED_OCCUPANCY,
          reservationId: null
        }),
        expect.objectContaining({
          eventType: AnomalyType.EARLY_LEAVE_SUSPECTED,
          reservationId: reservation.reservationId
        })
      ])
    );
  });

  it('moves overtime occupied seats to pending release and creates an idempotent anomaly', async () => {
    const { prisma, autoRulesService } = createServices();
    const { seat } = seedBoundDevice(prisma, {
      onlineStatus: DeviceOnlineStatus.ONLINE,
      businessStatus: SeatStatus.OCCUPIED,
      availabilityStatus: SeatAvailability.AVAILABLE,
      unavailableReason: null,
      presenceStatus: PresenceStatus.PRESENT
    });
    seedRuleUser(prisma);
    const reservation = seedRuleReservation(prisma, {
      status: ReservationStatus.CHECKED_IN,
      checkedInAt: new Date('2026-05-03T09:00:00.000Z'),
      endTime: new Date('2026-05-03T10:00:00.000Z')
    });

    const first = await autoRulesService.runUsageScan(new Date('2026-05-03T10:00:00.000Z'));
    const second = await autoRulesService.runUsageScan(new Date('2026-05-03T10:00:30.000Z'));

    expect(first).toMatchObject({ changed_count: 1, anomaly_created_count: 1 });
    expect(second).toMatchObject({ changed_count: 0, anomaly_created_count: 0 });
    expect(seat.businessStatus).toBe(SeatStatus.PENDING_RELEASE);
    expect(reservation.status).toBe(ReservationStatus.CHECKED_IN);
    expect(prisma.studyRecords).toHaveLength(0);
    expect(prisma.anomalyEvents).toEqual([
      expect.objectContaining({
        eventType: AnomalyType.OVERTIME_OCCUPANCY,
        reservationId: reservation.reservationId
      })
    ]);
  });

  it('finishes expired absent reservations once and keeps seat and study record consistent', async () => {
    const { prisma, autoRulesService } = createServices();
    const { seat } = seedBoundDevice(prisma, {
      onlineStatus: DeviceOnlineStatus.ONLINE,
      businessStatus: SeatStatus.OCCUPIED,
      availabilityStatus: SeatAvailability.AVAILABLE,
      unavailableReason: null,
      presenceStatus: PresenceStatus.ABSENT
    });
    seedRuleUser(prisma);
    const reservation = seedRuleReservation(prisma, {
      status: ReservationStatus.CHECKED_IN,
      checkedInAt: new Date('2026-05-03T09:05:00.000Z'),
      endTime: new Date('2026-05-03T10:00:00.000Z')
    });

    const first = await autoRulesService.runUsageScan(new Date('2026-05-03T10:00:00.000Z'));
    const second = await autoRulesService.runUsageScan(new Date('2026-05-03T10:00:30.000Z'));

    expect(first).toMatchObject({ changed_count: 1, anomaly_created_count: 0 });
    expect(second).toMatchObject({ changed_count: 0 });
    expect(reservation.status).toBe(ReservationStatus.FINISHED);
    expect(seat.businessStatus).toBe(SeatStatus.FREE);
    expect(prisma.studyRecords).toHaveLength(1);
    expect(prisma.studyRecords[0]).toMatchObject({
      reservationId: reservation.reservationId,
      durationMinutes: 55,
      source: StudyRecordSource.TIME_FINISHED,
      validFlag: true
    });
  });

  it('creates device offline anomalies and resolves them when heartbeat recovers', async () => {
    const { prisma, autoRulesService, deviceStateService } = createServices();
    const { device, seat } = seedBoundDevice(prisma, {
      onlineStatus: DeviceOnlineStatus.ONLINE,
      lastHeartbeatAt: new Date('2026-05-03T09:00:00.000Z'),
      availabilityStatus: SeatAvailability.AVAILABLE,
      unavailableReason: null
    });

    const offline = await autoRulesService.runDeviceReconcile(new Date('2026-05-03T09:01:16.000Z'));

    expect(offline).toMatchObject({ changed_count: 1, anomaly_created_count: 1 });
    expect(device.onlineStatus).toBe(DeviceOnlineStatus.OFFLINE);
    expect(seat.unavailableReason).toBe(SeatUnavailableReason.DEVICE_OFFLINE);
    expect(prisma.anomalyEvents[0]).toMatchObject({
      eventType: AnomalyType.DEVICE_OFFLINE,
      status: AnomalyStatus.PENDING
    });

    await deviceStateService.handleHeartbeatMessage(
      'device_001',
      Buffer.from(JSON.stringify(heartbeatPayload())),
      new Date('2026-05-03T09:02:00.000Z')
    );

    expect(device.onlineStatus).toBe(DeviceOnlineStatus.ONLINE);
    expect(seat.unavailableReason).toBeNull();
    expect(prisma.anomalyEvents[0]).toMatchObject({
      status: AnomalyStatus.HANDLED,
      reason: 'DEVICE_HEARTBEAT_RECOVERED',
      resolvedAt: new Date('2026-05-03T09:02:00.000Z')
    });
  });

  it('does not crash automatic usage sync when MQTT is unavailable', async () => {
    const { prisma, autoRulesService } = createServices({ connected: false });
    seedBoundDevice(prisma, {
      onlineStatus: DeviceOnlineStatus.ONLINE,
      businessStatus: SeatStatus.OCCUPIED,
      availabilityStatus: SeatAvailability.AVAILABLE,
      unavailableReason: null
    });
    seedRuleUser(prisma);
    seedRuleReservation(prisma, {
      status: ReservationStatus.CHECKED_IN,
      checkedInAt: new Date('2026-05-03T09:00:00.000Z'),
      endTime: new Date('2026-05-03T10:05:00.000Z')
    });

    const metrics = await autoRulesService.runUsageScan(new Date('2026-05-03T10:00:00.000Z'));

    expect(metrics).toMatchObject({
      changed_count: 1,
      sync_failed_count: 1
    });
  });
});
