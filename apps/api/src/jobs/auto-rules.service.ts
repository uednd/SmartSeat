import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AnomalySource,
  AnomalyType,
  DeviceOnlineStatus,
  PresenceStatus,
  ReservationStatus,
  SeatStatus,
  SensorHealthStatus,
  type Seat
} from '@prisma/client';

import { getConfigBoolean, getConfigNumber } from '../common/config/config-reader.js';
import { PrismaService } from '../common/database/prisma.service.js';
import { AnomaliesService } from '../modules/anomalies/anomalies.service.js';
import {
  DevicesService,
  type DeviceOfflineTransition
} from '../modules/devices/devices.service.js';
import { MqttCommandBusService } from '../modules/mqtt/mqtt-command-bus.service.js';
import {
  ReservationsService,
  type ReservationRuleTransition
} from '../modules/reservations/reservations.service.js';

const ACTIVE_RESERVATION_STATUSES = [
  ReservationStatus.WAITING_CHECKIN,
  ReservationStatus.CHECKED_IN
] as const;

interface JobMetrics {
  job: string;
  duration_ms: number;
  scanned_count: number;
  changed_count: number;
  anomaly_created_count: number;
  sync_failed_count: number;
}

@Injectable()
export class AutoRulesService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AutoRulesService.name);
  private readonly timers: Array<ReturnType<typeof setInterval>> = [];

  constructor(
    @Inject(ConfigService) private readonly configService: ConfigService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ReservationsService) private readonly reservationsService: ReservationsService,
    @Inject(DevicesService) private readonly devicesService: DevicesService,
    @Inject(AnomaliesService) private readonly anomaliesService: AnomaliesService,
    @Inject(MqttCommandBusService) private readonly commandBus: MqttCommandBusService
  ) {}

  onModuleInit(): void {
    if (!this.isMasterEnabled()) {
      this.logger.warn('Automatic rules are disabled.');
      return;
    }

    this.registerRuleTimer(
      'AUTO_RULES_NO_SHOW_ENABLED',
      'AUTO_RULES_NO_SHOW_INTERVAL_SECONDS',
      () => this.runNoShowScan()
    );
    this.registerRuleTimer('AUTO_RULES_USAGE_ENABLED', 'AUTO_RULES_USAGE_INTERVAL_SECONDS', () =>
      this.runUsageScan()
    );
    this.registerRuleTimer(
      'AUTO_RULES_OCCUPANCY_ANOMALIES_ENABLED',
      'AUTO_RULES_OCCUPANCY_ANOMALY_INTERVAL_SECONDS',
      () => this.runOccupancyAnomalyScan()
    );
    this.registerRuleTimer(
      'AUTO_RULES_DEVICE_RECONCILE_ENABLED',
      'AUTO_RULES_DEVICE_RECONCILE_INTERVAL_SECONDS',
      () => this.runDeviceReconcile()
    );
  }

  onModuleDestroy(): void {
    for (const timer of this.timers) {
      clearInterval(timer);
    }
  }

  async runNoShowScan(now = new Date()): Promise<JobMetrics> {
    return await this.runMeasuredJob('auto_rules_no_show_scan', async () => {
      const result = await this.reservationsService.expireNoShowReservationsDetailed(now);
      let anomalyCreatedCount = 0;

      for (const transition of result.expired) {
        if (await this.createNoShowAnomaly(transition, now)) {
          anomalyCreatedCount += 1;
        }
      }

      const syncFailedCount = await this.syncTransitions(result.expired);

      return {
        scanned_count: result.expired.length,
        changed_count: result.expired.length,
        anomaly_created_count: anomalyCreatedCount,
        sync_failed_count: syncFailedCount
      };
    });
  }

  async runUsageScan(now = new Date()): Promise<JobMetrics> {
    return await this.runMeasuredJob('auto_rules_usage_scan', async () => {
      const result = await this.reservationsService.advanceUsageReservationsDetailed(
        now,
        getConfigNumber(this.configService, 'AUTO_RULES_ENDING_SOON_WINDOW_SECONDS')
      );
      let anomalyCreatedCount = 0;

      for (const transition of result.pendingRelease) {
        if (await this.createOvertimeAnomaly(transition, now)) {
          anomalyCreatedCount += 1;
        }
      }

      const transitions = [...result.endingSoon, ...result.finished, ...result.pendingRelease];
      const syncFailedCount = await this.syncTransitions(transitions);

      return {
        scanned_count: transitions.length,
        changed_count: transitions.length,
        anomaly_created_count: anomalyCreatedCount,
        sync_failed_count: syncFailedCount
      };
    });
  }

  async runOccupancyAnomalyScan(now = new Date()): Promise<JobMetrics> {
    return await this.runMeasuredJob('auto_rules_occupancy_anomaly_scan', async () => {
      const seats = await this.prisma.seat.findMany({
        where: {
          deviceId: {
            not: null
          },
          maintenance: false
        },
        orderBy: [{ seatId: 'asc' }]
      });
      let anomalyCreatedCount = 0;

      for (const seat of seats) {
        anomalyCreatedCount += await this.evaluateSeatAnomalies(seat, now);
      }

      return {
        scanned_count: seats.length,
        changed_count: anomalyCreatedCount,
        anomaly_created_count: anomalyCreatedCount,
        sync_failed_count: 0
      };
    });
  }

  async runDeviceReconcile(now = new Date()): Promise<JobMetrics> {
    return await this.runMeasuredJob('auto_rules_device_reconcile', async () => {
      const thresholdSeconds = getConfigNumber(
        this.configService,
        'MQTT_HEARTBEAT_OFFLINE_THRESHOLD_SECONDS'
      );
      const transitions = await this.devicesService.markHeartbeatTimedOutDevicesDetailed(
        now,
        thresholdSeconds
      );
      let anomalyCreatedCount = 0;

      for (const transition of transitions) {
        if (await this.createDeviceOfflineAnomaly(transition, now)) {
          anomalyCreatedCount += 1;
        }
      }

      const syncFailedCount = await this.syncDeviceTransitions(transitions);

      return {
        scanned_count: transitions.length,
        changed_count: transitions.length,
        anomaly_created_count: anomalyCreatedCount,
        sync_failed_count: syncFailedCount
      };
    });
  }

  private async evaluateSeatAnomalies(seat: Seat, now: Date): Promise<number> {
    const deviceId = seat.deviceId;

    if (deviceId === null) {
      return 0;
    }

    const device = await this.prisma.device.findUnique({
      where: { deviceId }
    });

    if (device === null || device.onlineStatus !== DeviceOnlineStatus.ONLINE) {
      return 0;
    }

    const checkedInReservation = await this.prisma.reservation.findFirst({
      where: {
        seatId: seat.seatId,
        status: ReservationStatus.CHECKED_IN
      },
      orderBy: [{ endTime: 'asc' }]
    });
    let createdCount = 0;

    if (
      seat.businessStatus === SeatStatus.FREE &&
      (await this.hasNoActiveReservation(seat.seatId)) &&
      (await this.hasStablePresence({
        seat,
        deviceId,
        presenceStatus: PresenceStatus.PRESENT,
        now,
        thresholdSeconds: getConfigNumber(this.configService, 'ANOMALY_IDLE_PRESENT_STABLE_SECONDS')
      })) &&
      (await this.createSeatAnomaly({
        eventType: AnomalyType.UNRESERVED_OCCUPANCY,
        seatId: seat.seatId,
        deviceId,
        now,
        reason: 'IDLE_SEAT_PRESENT_STABLE',
        description: `Seat ${seat.seatId} is free but presence is stable PRESENT.`
      }))
    ) {
      createdCount += 1;
    }

    if (
      (seat.businessStatus === SeatStatus.OCCUPIED ||
        seat.businessStatus === SeatStatus.ENDING_SOON) &&
      checkedInReservation !== null &&
      (await this.hasStablePresence({
        seat,
        deviceId,
        presenceStatus: PresenceStatus.ABSENT,
        now,
        thresholdSeconds: getConfigNumber(
          this.configService,
          'ANOMALY_OCCUPIED_ABSENT_STABLE_SECONDS'
        )
      })) &&
      (await this.createSeatAnomaly({
        eventType: AnomalyType.EARLY_LEAVE_SUSPECTED,
        seatId: seat.seatId,
        deviceId,
        reservationId: checkedInReservation.reservationId,
        userId: checkedInReservation.userId,
        now,
        reason: 'OCCUPIED_SEAT_ABSENT_STABLE',
        description: `Seat ${seat.seatId} is occupied but presence is stable ABSENT.`
      }))
    ) {
      createdCount += 1;
    }

    if (
      this.isSensorErrorRuleEnabled() &&
      (seat.presenceStatus === PresenceStatus.UNKNOWN ||
        seat.presenceStatus === PresenceStatus.ERROR ||
        device.sensorStatus === SensorHealthStatus.UNKNOWN ||
        device.sensorStatus === SensorHealthStatus.ERROR) &&
      (await this.hasStableUntrustedPresence({
        seat,
        deviceId,
        now,
        thresholdSeconds: getConfigNumber(this.configService, 'ANOMALY_SENSOR_ERROR_STABLE_SECONDS')
      })) &&
      (await this.createSeatAnomaly({
        eventType: AnomalyType.SENSOR_ERROR,
        seatId: seat.seatId,
        deviceId,
        reservationId: checkedInReservation?.reservationId ?? null,
        userId: checkedInReservation?.userId ?? null,
        now,
        reason: 'SENSOR_UNTRUSTED_STABLE',
        description: `Seat ${seat.seatId} sensor presence is stable untrusted.`
      }))
    ) {
      createdCount += 1;
    }

    return createdCount;
  }

  private async hasNoActiveReservation(seatId: string): Promise<boolean> {
    const count = await this.prisma.reservation.count({
      where: {
        seatId,
        status: {
          in: [...ACTIVE_RESERVATION_STATUSES]
        }
      }
    });

    return count === 0;
  }

  private async hasStableUntrustedPresence(input: {
    seat: Seat;
    deviceId: string;
    now: Date;
    thresholdSeconds: number;
  }): Promise<boolean> {
    if (
      await this.hasStablePresence({
        ...input,
        presenceStatus: PresenceStatus.UNKNOWN
      })
    ) {
      return true;
    }

    return await this.hasStablePresence({
      ...input,
      presenceStatus: PresenceStatus.ERROR
    });
  }

  private async hasStablePresence(input: {
    seat: Seat;
    deviceId: string;
    presenceStatus: PresenceStatus;
    now: Date;
    thresholdSeconds: number;
  }): Promise<boolean> {
    if (input.seat.presenceStatus !== input.presenceStatus) {
      return false;
    }

    const thresholdStart = new Date(input.now.getTime() - input.thresholdSeconds * 1000);
    const boundary = await this.prisma.sensorReading.findFirst({
      where: {
        deviceId: input.deviceId,
        seatId: input.seat.seatId,
        reportedAt: {
          lte: thresholdStart
        }
      },
      orderBy: [{ reportedAt: 'desc' }, { createdAt: 'desc' }]
    });

    if (boundary === null) {
      return true;
    }

    if (boundary.presenceStatus !== input.presenceStatus) {
      return false;
    }

    const jitter = await this.prisma.sensorReading.findFirst({
      where: {
        deviceId: input.deviceId,
        seatId: input.seat.seatId,
        presenceStatus: {
          not: input.presenceStatus
        },
        reportedAt: {
          gt: boundary.reportedAt,
          lte: input.now
        }
      },
      orderBy: [{ reportedAt: 'desc' }, { createdAt: 'desc' }]
    });

    return jitter === null;
  }

  private async createNoShowAnomaly(
    transition: ReservationRuleTransition,
    now: Date
  ): Promise<boolean> {
    const result = await this.anomaliesService.createPendingOnce({
      eventType: AnomalyType.NO_SHOW,
      source: AnomalySource.SCHEDULER,
      seatId: transition.seatId,
      userId: transition.userId,
      deviceId: transition.deviceId,
      reservationId: transition.reservationId,
      createdAt: now,
      reason: 'CHECKIN_DEADLINE_EXPIRED',
      description: `Reservation ${transition.reservationId} missed the check-in deadline.`
    });

    return result.created;
  }

  private async createOvertimeAnomaly(
    transition: ReservationRuleTransition,
    now: Date
  ): Promise<boolean> {
    const result = await this.anomaliesService.createPendingOnce({
      eventType: AnomalyType.OVERTIME_OCCUPANCY,
      source: AnomalySource.SCHEDULER,
      seatId: transition.seatId,
      userId: transition.userId,
      deviceId: transition.deviceId,
      reservationId: transition.reservationId,
      createdAt: now,
      reason: 'RESERVATION_EXPIRED_PRESENT_STABLE',
      description: `Reservation ${transition.reservationId} expired while presence remained PRESENT.`
    });

    return result.created;
  }

  private async createDeviceOfflineAnomaly(
    transition: DeviceOfflineTransition,
    now: Date
  ): Promise<boolean> {
    if (transition.seatId === null) {
      return false;
    }

    const result = await this.anomaliesService.createPendingOnce({
      eventType: AnomalyType.DEVICE_OFFLINE,
      source: AnomalySource.SCHEDULER,
      seatId: transition.seatId,
      deviceId: transition.deviceId,
      createdAt: now,
      reason: 'HEARTBEAT_TIMEOUT',
      description: `Device ${transition.deviceId} heartbeat timed out.`
    });

    return result.created;
  }

  private async createSeatAnomaly(input: {
    eventType: AnomalyType;
    seatId: string;
    deviceId: string | null;
    reservationId?: string | null;
    userId?: string | null;
    now: Date;
    reason: string;
    description: string;
  }): Promise<boolean> {
    const result = await this.anomaliesService.createPendingOnce({
      eventType: input.eventType,
      source: AnomalySource.SCHEDULER,
      seatId: input.seatId,
      userId: input.userId ?? null,
      deviceId: input.deviceId,
      reservationId: input.reservationId ?? null,
      createdAt: input.now,
      reason: input.reason,
      description: input.description
    });

    return result.created;
  }

  private async syncTransitions(transitions: ReservationRuleTransition[]): Promise<number> {
    return await this.syncDeviceIds(transitions.map((transition) => transition.deviceId));
  }

  private async syncDeviceTransitions(transitions: DeviceOfflineTransition[]): Promise<number> {
    return await this.syncDeviceIds(transitions.map((transition) => transition.deviceId));
  }

  private async syncDeviceIds(deviceIds: Array<string | null>): Promise<number> {
    let failedCount = 0;

    for (const deviceId of new Set(deviceIds.filter((value): value is string => value !== null))) {
      try {
        const synced = await this.commandBus.syncLatestDeviceState(deviceId);

        if (!synced) {
          failedCount += 1;
          this.logger.warn(`MQTT state sync degraded for device ${deviceId}.`);
        }
      } catch (error) {
        failedCount += 1;
        this.logger.warn(
          `MQTT state sync failed for device ${deviceId}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }

    return failedCount;
  }

  private async runMeasuredJob(
    job: string,
    callback: () => Promise<Omit<JobMetrics, 'job' | 'duration_ms'>>
  ): Promise<JobMetrics> {
    const startedAt = Date.now();

    try {
      const result = await callback();
      const metrics = {
        job,
        duration_ms: Date.now() - startedAt,
        ...result
      };

      this.logger.log(
        JSON.stringify({
          category: 'auto_rules_job_completed',
          ...metrics
        })
      );

      return metrics;
    } catch (error) {
      const metrics = {
        job,
        duration_ms: Date.now() - startedAt,
        scanned_count: 0,
        changed_count: 0,
        anomaly_created_count: 0,
        sync_failed_count: 0
      };

      this.logger.error(
        JSON.stringify({
          category: 'auto_rules_job_failed',
          ...metrics,
          error: error instanceof Error ? error.message : String(error)
        })
      );
      throw error;
    }
  }

  private registerRuleTimer(
    enabledKey:
      | 'AUTO_RULES_NO_SHOW_ENABLED'
      | 'AUTO_RULES_USAGE_ENABLED'
      | 'AUTO_RULES_OCCUPANCY_ANOMALIES_ENABLED'
      | 'AUTO_RULES_DEVICE_RECONCILE_ENABLED',
    intervalKey:
      | 'AUTO_RULES_NO_SHOW_INTERVAL_SECONDS'
      | 'AUTO_RULES_USAGE_INTERVAL_SECONDS'
      | 'AUTO_RULES_OCCUPANCY_ANOMALY_INTERVAL_SECONDS'
      | 'AUTO_RULES_DEVICE_RECONCILE_INTERVAL_SECONDS',
    callback: () => Promise<unknown>
  ): void {
    if (!getConfigBoolean(this.configService, enabledKey)) {
      this.logger.warn(`${enabledKey} is disabled.`);
      return;
    }

    const intervalMs = getConfigNumber(this.configService, intervalKey) * 1000;
    const timer = setInterval(() => {
      void callback().catch(() => undefined);
    }, intervalMs);

    this.timers.push(timer);
  }

  private isMasterEnabled(): boolean {
    return getConfigBoolean(this.configService, 'AUTO_RULES_ENABLED');
  }

  private isSensorErrorRuleEnabled(): boolean {
    return (
      this.isMasterEnabled() &&
      getConfigBoolean(this.configService, 'AUTO_RULES_SENSOR_ERROR_ENABLED')
    );
  }
}
