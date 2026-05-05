import type { ExecutionContext } from '@nestjs/common';
import {
  AdminActionType,
  AnomalySource,
  AnomalyStatus,
  AnomalyType,
  AuthMode,
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
  AnomalyStatus as ContractAnomalyStatus,
  ApiErrorCode,
  UserRole
} from '@smartseat/contracts';
import { describe, expect, it } from 'vitest';

import { AdminGuard } from '../common/auth/admin.guard.js';
import type { PrismaService } from '../common/database/prisma.service.js';
import { AppHttpException } from '../common/errors/app-http.exception.js';
import { AdminService } from '../modules/admin/admin.service.js';
import type { AuthConfigService } from '../modules/auth/auth-config.service.js';
import type { MqttBrokerService } from '../modules/mqtt/mqtt-broker.service.js';
import type { MqttCommandBusService } from '../modules/mqtt/mqtt-command-bus.service.js';
import { StudyRecordsService } from '../modules/study-records/study-records.service.js';

class FakePrismaService {
  seats = [
    createSeat({
      businessStatus: SeatStatus.OCCUPIED,
      deviceId: 'device_admin',
      presenceStatus: PresenceStatus.PRESENT
    })
  ];
  devices = [createDevice({ seatId: 'seat_admin', onlineStatus: DeviceOnlineStatus.ONLINE })];
  reservations = [createReservation({ status: ReservationStatus.CHECKED_IN })];
  anomalies = [
    createAnomaly({
      eventId: 'anomaly_overtime',
      eventType: AnomalyType.OVERTIME_OCCUPANCY,
      reservationId: 'reservation_admin'
    }),
    createAnomaly({
      eventId: 'anomaly_handle',
      eventType: AnomalyType.SENSOR_ERROR,
      reservationId: null
    })
  ];
  qrTokens = [
    {
      tokenId: 'token_admin',
      reservationId: 'reservation_admin',
      seatId: 'seat_admin',
      deviceId: 'device_admin',
      status: QRTokenStatus.UNUSED
    }
  ];
  studyRecords: Array<Record<string, unknown>> = [];
  maintenanceRecords: Array<Record<string, unknown>> = [];
  adminActionLogs: Array<Record<string, unknown>> = [];

  seat = {
    count: async () => this.seats.length,
    findUnique: async ({ where }: { where: { seatId: string } }) =>
      this.seats.find((seat) => seat.seatId === where.seatId) ?? null,
    update: async ({
      where,
      data
    }: {
      where: { seatId: string };
      data: Record<string, unknown>;
    }) => {
      const seat = requireRecord(this.seats.find((candidate) => candidate.seatId === where.seatId));
      Object.assign(seat, data, { updatedAt: new Date('2026-05-04T09:10:00.000Z') });
      return seat;
    }
  };

  device = {
    count: async ({ where }: { where?: { onlineStatus?: DeviceOnlineStatus } } = {}) =>
      this.devices.filter(
        (device) => where?.onlineStatus === undefined || device.onlineStatus === where.onlineStatus
      ).length,
    findUnique: async ({ where }: { where: { deviceId: string } }) =>
      this.devices.find((device) => device.deviceId === where.deviceId) ?? null
  };

  reservation = {
    count: async ({ where }: { where?: Record<string, unknown> } = {}) =>
      this.reservations.filter((reservation) => matchesReservation(reservation, where)).length,
    findMany: async ({ where }: { where?: Record<string, unknown> } = {}) =>
      this.reservations
        .filter((reservation) => matchesReservation(reservation, where))
        .map((r) => ({
          ...r,
          seat: requireRecord(this.seats.find((seat) => seat.seatId === r.seatId))
        })),
    findFirst: async ({ where }: { where?: Record<string, unknown> } = {}) =>
      this.reservations.find((reservation) => matchesReservation(reservation, where)) ?? null,
    findUnique: async ({ where }: { where: { reservationId: string } }) =>
      this.reservations.find((reservation) => reservation.reservationId === where.reservationId) ??
      null,
    update: async ({
      where,
      data
    }: {
      where: { reservationId: string };
      data: Record<string, unknown>;
    }) => {
      const reservation = requireRecord(
        this.reservations.find((candidate) => candidate.reservationId === where.reservationId)
      );
      Object.assign(reservation, data, { updatedAt: new Date('2026-05-04T09:10:00.000Z') });
      return reservation;
    }
  };

  anomalyEvent = {
    count: async ({ where }: { where?: Record<string, unknown> } = {}) =>
      this.anomalies.filter((event) => matchesAnomaly(event, where)).length,
    findMany: async ({ where }: { where?: Record<string, unknown> } = {}) =>
      this.anomalies.filter((event) => matchesAnomaly(event, where)),
    findUnique: async ({ where }: { where: { eventId: string } }) =>
      this.anomalies.find((event) => event.eventId === where.eventId) ?? null,
    update: async ({
      where,
      data
    }: {
      where: { eventId: string };
      data: Record<string, unknown>;
    }) => {
      const event = requireRecord(
        this.anomalies.find((candidate) => candidate.eventId === where.eventId)
      );
      Object.assign(event, data);
      return event;
    },
    updateMany: async ({
      where,
      data
    }: {
      where?: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => {
      const events = this.anomalies.filter((event) => matchesAnomaly(event, where));

      for (const event of events) {
        Object.assign(event, data);
      }

      return { count: events.length };
    }
  };

  qRToken = {
    updateMany: async ({
      where,
      data
    }: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => {
      const tokens = this.qrTokens.filter(
        (token) =>
          token.reservationId === where.reservationId &&
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
      create: Record<string, unknown>;
    }) => {
      const existing = this.studyRecords.find(
        (record) => record.reservationId === where.reservationId
      );

      if (existing !== undefined) {
        return existing;
      }

      this.studyRecords.push({ recordId: `study_${this.studyRecords.length + 1}`, ...create });
      return this.studyRecords.at(-1);
    }
  };

  maintenanceRecord = {
    findFirst: async ({ where }: { where: { seatId: string; endedAt: null } }) =>
      this.maintenanceRecords.find(
        (record) => record.seatId === where.seatId && record.endedAt === where.endedAt
      ) ?? null,
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const record = {
        maintenanceId: `maintenance_${this.maintenanceRecords.length + 1}`,
        endedAt: null,
        ...data
      };
      this.maintenanceRecords.push(record);
      return record;
    },
    update: async ({
      where,
      data
    }: {
      where: { maintenanceId: string };
      data: Record<string, unknown>;
    }) => {
      const record = requireRecord(
        this.maintenanceRecords.find((candidate) => candidate.maintenanceId === where.maintenanceId)
      );
      Object.assign(record, data);
      return record;
    }
  };

  adminActionLog = {
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const log = {
        logId: `log_${this.adminActionLogs.length + 1}`,
        createdAt: new Date('2026-05-04T09:10:00.000Z'),
        ...data
      };
      this.adminActionLogs.push(log);
      return log;
    },
    update: async ({
      where,
      data
    }: {
      where: { logId: string };
      data: Record<string, unknown>;
    }) => {
      const log = requireRecord(
        this.adminActionLogs.find((candidate) => candidate.logId === where.logId)
      );
      Object.assign(log, data);
      return log;
    },
    findMany: async () => this.adminActionLogs,
    count: async () => this.adminActionLogs.length
  };

  async $transaction<T>(callback: (tx: this) => Promise<T>): Promise<T> {
    return await callback(this);
  }
}

class FakeCommandBus {
  publishedCommands: unknown[] = [];
  syncedDevices: string[] = [];
  syncResult = false;

  async syncLatestDeviceState(deviceId: string): Promise<boolean> {
    this.syncedDevices.push(deviceId);
    return this.syncResult;
  }

  async publishCommand(payload: unknown): Promise<boolean> {
    this.publishedCommands.push(payload);
    return false;
  }
}

const adminUser = {
  user_id: 'admin_user',
  roles: [UserRole.ADMIN]
};

describe('API-ADM-01 administrator service', () => {
  it('rejects student users with the administrator guard', () => {
    const guard = new AdminGuard();
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          user: {
            user_id: 'student_user',
            roles: [UserRole.STUDENT]
          }
        })
      })
    } as unknown as ExecutionContext;

    expect(() => guard.canActivate(context)).toThrow(AppHttpException);
  });

  it('returns dashboard, no-show, anomaly, and desensitized config data', async () => {
    const { service, prisma } = createService();
    prisma.reservations.push(
      createReservation({
        reservationId: 'reservation_no_show',
        status: ReservationStatus.NO_SHOW,
        releasedAt: new Date('2026-05-04T08:00:00.000Z')
      })
    );

    const dashboard = await service.getDashboard(new Date('2026-05-04T09:00:00.000Z'));
    const noShows = await service.listNoShows({ page: 1 });
    const anomalies = await service.listAnomalies({ status: ContractAnomalyStatus.PENDING });
    const config = await service.getSystemConfig();

    expect(dashboard).toMatchObject({
      seat_count: 1,
      online_device_count: 1,
      pending_anomaly_count: 2,
      no_show_count_today: 1
    });
    expect(noShows.items[0]).toMatchObject({
      reservation_id: 'reservation_no_show',
      seat_no: 'A-001'
    });
    expect(anomalies.items).toHaveLength(2);
    expect(JSON.stringify(config)).not.toContain('secret-value');
    expect(JSON.stringify(config).toLowerCase()).not.toContain('client_secret');
    expect(JSON.stringify(config).toLowerCase()).not.toContain('password');
    expect(JSON.stringify(config)).not.toContain('secret-value');
  });

  it('requires a reason and keeps reservation, seat, anomaly, study record, audit, and MQTT sync consistent after release', async () => {
    const { service, prisma, commandBus } = createService();

    await expect(
      service.releaseSeat(adminUser, {
        seat_id: 'seat_admin',
        reason: '',
        restore_availability: true
      })
    ).rejects.toMatchObject({ response: { code: ApiErrorCode.VALIDATION_FAILED } });

    const released = await service.releaseSeat(
      adminUser,
      {
        seat_id: 'seat_admin',
        reservation_id: 'reservation_admin',
        reason: 'manual release',
        restore_availability: true
      },
      new Date('2026-05-04T09:30:00.000Z')
    );

    expect(released).toMatchObject({ seat_id: 'seat_admin', business_status: SeatStatus.FREE });
    expect(prisma.reservations[0]).toMatchObject({
      status: ReservationStatus.ADMIN_RELEASED,
      releaseReason: 'manual release'
    });
    expect(prisma.studyRecords).toHaveLength(1);
    expect(prisma.studyRecords[0]).toMatchObject({
      source: StudyRecordSource.ADMIN_RELEASED,
      validFlag: true
    });
    expect(prisma.qrTokens[0]).toMatchObject({ status: QRTokenStatus.INVALIDATED });
    expect(prisma.anomalies.find((event) => event.eventId === 'anomaly_overtime')).toMatchObject({
      status: AnomalyStatus.HANDLED,
      handledById: 'admin_user'
    });
    expect(prisma.adminActionLogs[0]).toMatchObject({
      adminId: 'admin_user',
      actionType: AdminActionType.RELEASE_SEAT,
      targetType: 'seat',
      targetId: 'seat_admin'
    });
    expect(prisma.adminActionLogs[0]?.detail).toMatchObject({ mqtt_synced: false });
    expect(commandBus.syncedDevices).toEqual(['device_admin']);

    const actionLogs = await service.listActionLogs({ page: 1 });
    expect(actionLogs.items[0]).toMatchObject({
      admin_id: 'admin_user',
      action_type: AdminActionType.RELEASE_SEAT,
      target_type: 'seat',
      target_id: 'seat_admin',
      reason: 'manual release'
    });
  });

  it('releases waiting check-in reservations without creating study records', async () => {
    const { service, prisma } = createService();
    prisma.seats[0]!.businessStatus = SeatStatus.RESERVED;
    prisma.reservations[0]!.status = ReservationStatus.WAITING_CHECKIN;

    await service.releaseSeat(
      adminUser,
      {
        seat_id: 'seat_admin',
        reservation_id: 'reservation_admin',
        reason: 'student absent',
        restore_availability: true
      },
      new Date('2026-05-04T09:30:00.000Z')
    );

    expect(prisma.reservations[0]).toMatchObject({
      status: ReservationStatus.ADMIN_RELEASED,
      releaseReason: 'student absent'
    });
    expect(prisma.studyRecords).toHaveLength(0);
  });

  it('allows administrators to mark a released study record invalid', async () => {
    const { service, prisma } = createService();

    await service.releaseSeat(
      adminUser,
      {
        seat_id: 'seat_admin',
        reservation_id: 'reservation_admin',
        reason: 'invalid study duration',
        restore_availability: true,
        exclude_study_record: true
      },
      new Date('2026-05-04T09:30:00.000Z')
    );

    expect(prisma.studyRecords).toHaveLength(1);
    expect(prisma.studyRecords[0]).toMatchObject({
      source: StudyRecordSource.ADMIN_RELEASED,
      validFlag: false,
      invalidReason: 'ADMIN_MARKED_INVALID'
    });
  });

  it('sets and restores seat and device-derived maintenance with records and audit logs', async () => {
    const { service, prisma, commandBus } = createService();

    await service.setSeatMaintenance(
      adminUser,
      { seat_id: 'seat_admin', maintenance: true, reason: 'inspect terminal' },
      new Date('2026-05-04T10:00:00.000Z')
    );
    expect(prisma.seats[0]).toMatchObject({
      maintenance: true,
      availabilityStatus: SeatAvailability.UNAVAILABLE,
      unavailableReason: SeatUnavailableReason.ADMIN_MAINTENANCE
    });
    expect(prisma.maintenanceRecords).toHaveLength(1);
    expect(prisma.adminActionLogs.at(-1)).toMatchObject({
      actionType: AdminActionType.SET_MAINTENANCE,
      targetType: 'seat'
    });

    const device = await service.setDeviceMaintenance(
      adminUser,
      { device_id: 'device_admin', maintenance: false, reason: 'restored' },
      new Date('2026-05-04T10:20:00.000Z')
    );
    expect(device).toMatchObject({ device_id: 'device_admin', maintenance: false });
    expect(prisma.seats[0]).toMatchObject({
      maintenance: false,
      availabilityStatus: SeatAvailability.AVAILABLE,
      unavailableReason: null
    });
    expect(prisma.maintenanceRecords[0]).toMatchObject({ endedById: 'admin_user' });
    expect(prisma.adminActionLogs.at(-1)).toMatchObject({
      actionType: AdminActionType.RESTORE_AVAILABLE,
      targetType: 'device'
    });
    expect(commandBus.publishedCommands).toHaveLength(2);

    prisma.devices[0]!.seatId = null;
    await expect(
      service.setDeviceMaintenance(adminUser, {
        device_id: 'device_admin',
        maintenance: true,
        reason: 'unbound'
      })
    ).rejects.toMatchObject({ response: { code: ApiErrorCode.STATE_CONFLICT } });
  });

  it('records anomaly handling lifecycle fields and treats CLOSED as terminal', async () => {
    const { service, prisma } = createService();

    const acknowledged = await service.handleAnomaly(
      adminUser,
      {
        event_id: 'anomaly_handle',
        status: ContractAnomalyStatus.ACKNOWLEDGED,
        handle_note: 'confirmed'
      },
      new Date('2026-05-04T11:00:00.000Z')
    );
    expect(acknowledged).toMatchObject({
      status: ContractAnomalyStatus.ACKNOWLEDGED,
      handled_by: 'admin_user'
    });
    expect(acknowledged.resolved_at).toBeUndefined();

    const closed = await service.handleAnomaly(
      adminUser,
      {
        event_id: 'anomaly_handle',
        status: ContractAnomalyStatus.CLOSED,
        handle_note: 'closed'
      },
      new Date('2026-05-04T11:10:00.000Z')
    );
    expect(closed).toMatchObject({
      status: ContractAnomalyStatus.CLOSED,
      resolved_at: '2026-05-04T11:10:00.000Z'
    });
    expect(prisma.adminActionLogs.map((log) => log.actionType)).toEqual([
      AdminActionType.ACKNOWLEDGE_ANOMALY,
      AdminActionType.CLOSE_ANOMALY
    ]);

    await expect(
      service.handleAnomaly(adminUser, {
        event_id: 'anomaly_handle',
        status: ContractAnomalyStatus.HANDLED,
        handle_note: 'too late'
      })
    ).rejects.toMatchObject({ response: { code: ApiErrorCode.STATE_CONFLICT } });
  });
});

const createService = () => {
  const prisma = new FakePrismaService();
  const commandBus = new FakeCommandBus();
  const studyRecordsService = new StudyRecordsService(prisma as unknown as PrismaService);
  const service = new AdminService(
    prisma as unknown as PrismaService,
    createConfigService() as never,
    {
      async getLoginMode() {
        return {
          auth_mode: AuthMode.WECHAT,
          config: {
            auth_mode: AuthMode.WECHAT,
            oidc_client_id: 'school-client',
            oidc_secret_configured: true,
            wechat_appid: 'wx-demo',
            wechat_secret_configured: true
          }
        };
      }
    } as unknown as AuthConfigService,
    {
      getHealth: () => ({ enabled: true, connected: false, brokerUrl: 'mqtt://localhost:1883' })
    } as unknown as MqttBrokerService,
    commandBus as unknown as MqttCommandBusService,
    studyRecordsService
  );

  return { service, prisma, commandBus };
};

const createConfigService = () => {
  const values = new Map<string, unknown>([
    ['MQTT_HEARTBEAT_OFFLINE_THRESHOLD_SECONDS', 30],
    ['PRESENCE_EVALUATION_ENABLED', true],
    ['PRESENCE_PRESENT_STABLE_SECONDS', 3],
    ['PRESENCE_ABSENT_STABLE_SECONDS', 10],
    ['PRESENCE_UNTRUSTED_STABLE_SECONDS', 5],
    ['AUTO_RULES_ENABLED', true],
    ['AUTO_RULES_NO_SHOW_ENABLED', true],
    ['AUTO_RULES_USAGE_ENABLED', true],
    ['AUTO_RULES_OCCUPANCY_ANOMALIES_ENABLED', true],
    ['AUTO_RULES_DEVICE_RECONCILE_ENABLED', true],
    ['AUTO_RULES_SENSOR_ERROR_ENABLED', true],
    ['AUTO_RULES_NO_SHOW_INTERVAL_SECONDS', 30],
    ['AUTO_RULES_USAGE_INTERVAL_SECONDS', 30],
    ['AUTO_RULES_OCCUPANCY_ANOMALY_INTERVAL_SECONDS', 30],
    ['AUTO_RULES_DEVICE_RECONCILE_INTERVAL_SECONDS', 30],
    ['AUTO_RULES_ENDING_SOON_WINDOW_SECONDS', 300],
    ['CHECKIN_ENABLED', true],
    ['QR_TOKEN_REFRESH_SECONDS', 15],
    ['QR_TOKEN_TTL_SECONDS', 30]
  ]);

  return {
    get: (key: string) => values.get(key)
  };
};

const createSeat = (input: Partial<Record<string, unknown>> = {}) => ({
  seatId: input.seatId ?? 'seat_admin',
  seatNo: input.seatNo ?? 'A-001',
  area: input.area ?? 'demo',
  businessStatus: input.businessStatus ?? SeatStatus.FREE,
  availabilityStatus: input.availabilityStatus ?? SeatAvailability.AVAILABLE,
  unavailableReason: input.unavailableReason ?? null,
  deviceId: input.deviceId ?? null,
  presenceStatus: input.presenceStatus ?? PresenceStatus.UNKNOWN,
  maintenance: input.maintenance ?? false,
  createdAt: input.createdAt ?? new Date('2026-05-04T08:00:00.000Z'),
  updatedAt: input.updatedAt ?? new Date('2026-05-04T08:00:00.000Z')
});

const createDevice = (input: Partial<Record<string, unknown>> = {}) => ({
  deviceId: input.deviceId ?? 'device_admin',
  seatId: input.seatId ?? null,
  mqttClientId: input.mqttClientId ?? 'smartseat-device-admin',
  onlineStatus: input.onlineStatus ?? DeviceOnlineStatus.OFFLINE,
  lastHeartbeatAt: input.lastHeartbeatAt ?? new Date('2026-05-04T08:00:00.000Z'),
  sensorStatus: input.sensorStatus ?? SensorHealthStatus.OK,
  sensorModel: input.sensorModel ?? 'demo-mmwave',
  firmwareVersion: input.firmwareVersion ?? '0.0.1',
  hardwareVersion: input.hardwareVersion ?? 'esp32-p4',
  networkStatus: input.networkStatus ?? 'wifi:ok',
  createdAt: input.createdAt ?? new Date('2026-05-04T08:00:00.000Z'),
  updatedAt: input.updatedAt ?? new Date('2026-05-04T08:00:00.000Z')
});

const createReservation = (input: Partial<Record<string, unknown>> = {}) => ({
  reservationId: input.reservationId ?? 'reservation_admin',
  userId: input.userId ?? 'student_user',
  seatId: input.seatId ?? 'seat_admin',
  startTime: input.startTime ?? new Date('2026-05-04T08:00:00.000Z'),
  endTime: input.endTime ?? new Date('2026-05-04T10:00:00.000Z'),
  checkinStartTime: input.checkinStartTime ?? new Date('2026-05-04T07:55:00.000Z'),
  checkinDeadline: input.checkinDeadline ?? new Date('2026-05-04T08:15:00.000Z'),
  status: input.status ?? ReservationStatus.WAITING_CHECKIN,
  checkedInAt: input.checkedInAt ?? new Date('2026-05-04T08:01:00.000Z'),
  releasedAt: input.releasedAt ?? null,
  releaseReason: input.releaseReason ?? null,
  createdAt: input.createdAt ?? new Date('2026-05-04T08:00:00.000Z'),
  updatedAt: input.updatedAt ?? new Date('2026-05-04T08:00:00.000Z'),
  authProvider: AuthProvider.WECHAT
});

const createAnomaly = (input: Partial<Record<string, unknown>> = {}) => ({
  eventId: input.eventId ?? 'anomaly_admin',
  eventType: input.eventType ?? AnomalyType.UNRESERVED_OCCUPANCY,
  seatId: input.seatId ?? 'seat_admin',
  userId: input.userId ?? null,
  deviceId: input.deviceId ?? 'device_admin',
  reservationId: input.reservationId ?? null,
  description: input.description ?? 'Administrator test anomaly.',
  source: input.source ?? AnomalySource.SCHEDULER,
  reason: input.reason ?? null,
  status: input.status ?? AnomalyStatus.PENDING,
  createdAt: input.createdAt ?? new Date('2026-05-04T08:00:00.000Z'),
  resolvedAt: input.resolvedAt ?? null,
  handledById: input.handledById ?? null,
  handledAt: input.handledAt ?? null,
  handleNote: input.handleNote ?? null
});

const matchesReservation = (
  reservation: Record<string, unknown>,
  where?: Record<string, unknown>
): boolean => {
  if (where === undefined) {
    return true;
  }

  if (where.status !== undefined) {
    const status = where.status as { in?: unknown[] } | string;

    if (
      typeof status === 'object' &&
      status.in !== undefined &&
      !status.in.includes(reservation.status)
    ) {
      return false;
    }

    if (typeof status === 'string' && reservation.status !== status) {
      return false;
    }
  }

  if (where.seatId !== undefined && reservation.seatId !== where.seatId) {
    return false;
  }

  return true;
};

const matchesAnomaly = (
  event: Record<string, unknown>,
  where?: Record<string, unknown>
): boolean => {
  if (where === undefined) {
    return true;
  }

  if (where.status !== undefined) {
    const status = where.status as { in?: unknown[] } | string;
    if (
      typeof status === 'object' &&
      status.in !== undefined &&
      !status.in.includes(event.status)
    ) {
      return false;
    }
    if (typeof status === 'string' && event.status !== status) {
      return false;
    }
  }

  if (where.eventType !== undefined) {
    const eventType = where.eventType as { in?: unknown[] } | string;

    if (
      typeof eventType === 'object' &&
      eventType.in !== undefined &&
      !eventType.in.includes(event.eventType)
    ) {
      return false;
    }

    if (typeof eventType === 'string' && event.eventType !== eventType) {
      return false;
    }
  }

  if (where.seatId !== undefined && event.seatId !== where.seatId) {
    return false;
  }

  if (where.reservationId !== undefined && event.reservationId !== where.reservationId) {
    return false;
  }

  const typedWhere = where as { OR?: Array<Record<string, unknown>> };
  if (
    typedWhere.OR !== undefined &&
    !typedWhere.OR.some((clause) => matchesAnomaly(event, clause))
  ) {
    return false;
  }

  return true;
};

const requireRecord = <T>(value: T | undefined | null): T => {
  if (value === undefined || value === null) {
    throw new Error('Missing fake record.');
  }

  return value;
};
