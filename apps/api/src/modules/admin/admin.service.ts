import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AdminActionType,
  AnomalyStatus,
  AnomalyType,
  DeviceOnlineStatus,
  Prisma,
  QRTokenStatus,
  ReservationStatus,
  SeatAvailability,
  SeatStatus,
  SeatUnavailableReason,
  StudyRecordSource,
  type AdminActionLog,
  type AnomalyEvent,
  type Device,
  type Reservation,
  type Seat
} from '@prisma/client';
import {
  ApiErrorCode,
  DeviceCommandType,
  type AdminActionLogDto,
  type AdminDashboardDto,
  type AdminDeviceDto,
  type AdminReleaseSeatRequest,
  type AdminSeatDetailDto,
  type AdminSystemConfigDto,
  type AnomalyEventDto,
  type AnomalyListRequest,
  type HandleAnomalyRequest,
  type NoShowRecordDto,
  type PageRequest,
  type PageResponse,
  type UpdateDeviceMaintenanceRequest,
  type UpdateSeatMaintenanceRequest
} from '@smartseat/contracts';

import type { RequestUser } from '../../common/auth/request-user.js';
import { getConfigBoolean, getConfigNumber } from '../../common/config/config-reader.js';
import { PrismaService } from '../../common/database/prisma.service.js';
import { AppHttpException } from '../../common/errors/app-http.exception.js';
import { AuthConfigService } from '../auth/auth-config.service.js';
import { MqttBrokerService } from '../mqtt/mqtt-broker.service.js';
import { MqttCommandBusService } from '../mqtt/mqtt-command-bus.service.js';
import { toAnomalyEventDto } from '../anomalies/anomaly.mapper.js';
import { toAdminDeviceDto, toAdminSeatDetailDto } from '../seats/seat-device.mapper.js';
import { StudyRecordsService } from '../study-records/study-records.service.js';

const ACTIVE_RESERVATION_STATUSES = [
  ReservationStatus.WAITING_CHECKIN,
  ReservationStatus.CHECKED_IN
] as const;
const ACTIVE_ANOMALY_STATUSES = [AnomalyStatus.PENDING, AnomalyStatus.ACKNOWLEDGED] as const;
const RELEASE_HANDLED_ANOMALY_TYPES = [
  AnomalyType.UNRESERVED_OCCUPANCY,
  AnomalyType.EARLY_LEAVE_SUSPECTED,
  AnomalyType.OVERTIME_OCCUPANCY
] as const;

type AdminClient = PrismaService | Prisma.TransactionClient;

interface LoggedMutationResult<T> {
  data: T;
  logId: string;
  logDetail: Record<string, unknown>;
  deviceId?: string;
  seatId?: string;
}

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ConfigService) private readonly configService: ConfigService,
    @Inject(AuthConfigService) private readonly authConfigService: AuthConfigService,
    @Inject(MqttBrokerService) private readonly mqttBroker: MqttBrokerService,
    @Inject(MqttCommandBusService) private readonly commandBus: MqttCommandBusService,
    private readonly studyRecordsService: StudyRecordsService
  ) {}

  async getDashboard(now = new Date()): Promise<AdminDashboardDto> {
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    const [
      seatCount,
      onlineDeviceCount,
      offlineDeviceCount,
      pendingAnomalyCount,
      reservationCountToday,
      noShowCountToday
    ] = await Promise.all([
      this.prisma.seat.count(),
      this.prisma.device.count({ where: { onlineStatus: DeviceOnlineStatus.ONLINE } }),
      this.prisma.device.count({ where: { onlineStatus: DeviceOnlineStatus.OFFLINE } }),
      this.prisma.anomalyEvent.count({
        where: { status: { in: [...ACTIVE_ANOMALY_STATUSES] } }
      }),
      this.prisma.reservation.count({ where: { createdAt: { gte: todayStart, lte: now } } }),
      this.prisma.reservation.count({
        where: { status: ReservationStatus.NO_SHOW, releasedAt: { gte: todayStart, lte: now } }
      })
    ]);

    return {
      seat_count: seatCount,
      online_device_count: onlineDeviceCount,
      offline_device_count: offlineDeviceCount,
      pending_anomaly_count: pendingAnomalyCount,
      reservation_count_today: reservationCountToday,
      no_show_count_today: noShowCountToday
    };
  }

  async listNoShows(request: PageRequest): Promise<PageResponse<NoShowRecordDto>> {
    const page = normalizePageRequest(request);
    const where: Prisma.ReservationWhereInput = {
      status: ReservationStatus.NO_SHOW
    };
    const [reservations, total] = await Promise.all([
      this.prisma.reservation.findMany({
        where,
        include: { seat: true },
        orderBy: [{ releasedAt: 'desc' }, { startTime: 'desc' }],
        skip: page.skip,
        take: page.pageSize
      }),
      this.prisma.reservation.count({ where })
    ]);

    return {
      items: reservations.map((reservation) => ({
        reservation_id: reservation.reservationId,
        user_id: reservation.userId,
        seat_id: reservation.seatId,
        seat_no: reservation.seat.seatNo,
        start_time: reservation.startTime.toISOString(),
        released_at: (reservation.releasedAt ?? reservation.updatedAt).toISOString()
      })),
      page: page.page,
      page_size: page.pageSize,
      total
    };
  }

  async listAnomalies(request: AnomalyListRequest): Promise<PageResponse<AnomalyEventDto>> {
    const page = normalizePageRequest(request);
    const where: Prisma.AnomalyEventWhereInput = {};

    if (request.status !== undefined) {
      where.status = request.status as AnomalyStatus;
    }

    if (request.event_type !== undefined) {
      where.eventType = request.event_type as AnomalyType;
    }

    if (request.seat_id !== undefined) {
      where.seatId = request.seat_id;
    }

    const [items, total] = await Promise.all([
      this.prisma.anomalyEvent.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        skip: page.skip,
        take: page.pageSize
      }),
      this.prisma.anomalyEvent.count({ where })
    ]);

    return {
      items: items.map(toAnomalyEventDto),
      page: page.page,
      page_size: page.pageSize,
      total
    };
  }

  async getAnomaly(eventId: string): Promise<AnomalyEventDto> {
    const event = await this.findAnomalyOrThrow(eventId);
    return toAnomalyEventDto(event);
  }

  async handleAnomaly(
    user: RequestUser,
    request: HandleAnomalyRequest,
    now = new Date()
  ): Promise<AnomalyEventDto> {
    this.requireNonEmpty(request.event_id, 'event_id');
    this.requireNonEmpty(request.handle_note, 'handle_note');
    this.assertHandleStatus(request.status as AnomalyStatus);

    const event = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.anomalyEvent.findUnique({
        where: { eventId: request.event_id }
      });

      if (existing === null) {
        throw this.notFound('Anomaly event was not found.', { event_id: request.event_id });
      }

      if (existing.status === AnomalyStatus.CLOSED) {
        throw new AppHttpException(
          HttpStatus.CONFLICT,
          ApiErrorCode.STATE_CONFLICT,
          'Closed anomaly events cannot be changed.',
          { event_id: existing.eventId }
        );
      }

      const status = request.status as AnomalyStatus;
      const updated = await tx.anomalyEvent.update({
        where: { eventId: existing.eventId },
        data: {
          status,
          resolvedAt: isFinalAnomalyStatus(status) ? now : null,
          handledById: user.user_id,
          handledAt: now,
          handleNote: request.handle_note
        }
      });

      await tx.adminActionLog.create({
        data: {
          adminId: user.user_id,
          actionType: getAnomalyActionType(status),
          targetType: 'anomaly',
          targetId: existing.eventId,
          reason: request.handle_note,
          detail: {
            previous_status: existing.status,
            status,
            event_type: existing.eventType,
            seat_id: existing.seatId,
            reservation_id: existing.reservationId,
            device_id: existing.deviceId
          }
        }
      });

      return updated;
    });

    return toAnomalyEventDto(event);
  }

  async releaseSeat(
    user: RequestUser,
    request: AdminReleaseSeatRequest,
    now = new Date()
  ): Promise<AdminSeatDetailDto> {
    this.requireNonEmpty(request.seat_id, 'seat_id');
    this.requireNonEmpty(request.reason, 'reason');

    const result = await this.prisma.$transaction(
      async (tx) => {
        const seat = await tx.seat.findUnique({
          where: { seatId: request.seat_id }
        });

        if (seat === null) {
          throw this.notFound('Seat was not found.', { seat_id: request.seat_id });
        }

        const reservation = await this.findReleaseReservation(tx, request);
        const device =
          seat.deviceId === null
            ? null
            : await tx.device.findUnique({ where: { deviceId: seat.deviceId } });
        const reason = request.reason.trim();
        const wasCheckedIn = reservation.status === ReservationStatus.CHECKED_IN;

        await tx.reservation.update({
          where: { reservationId: reservation.reservationId },
          data: {
            status: ReservationStatus.ADMIN_RELEASED,
            releasedAt: now,
            releaseReason: reason
          }
        });
        await this.invalidateUnusedQrTokensForReservation(tx, reservation.reservationId);

        if (wasCheckedIn) {
          await this.studyRecordsService.upsertFromReservation(
            tx,
            reservation,
            now,
            StudyRecordSource.ADMIN_RELEASED,
            request.exclude_study_record === true
              ? {
                  forceInvalidReason: this.studyRecordsService.getAdminMarkedInvalidReason()
                }
              : {}
          );
        }

        await tx.anomalyEvent.updateMany({
          where: {
            status: { in: [...ACTIVE_ANOMALY_STATUSES] },
            eventType: { in: [...RELEASE_HANDLED_ANOMALY_TYPES] },
            OR: [{ reservationId: reservation.reservationId }, { seatId: seat.seatId }]
          },
          data: {
            status: AnomalyStatus.HANDLED,
            resolvedAt: now,
            handledById: user.user_id,
            handledAt: now,
            handleNote: `Admin release: ${reason}`
          }
        });

        const shouldEnterMaintenance = !request.restore_availability;
        const seatAvailability = this.getRestoredSeatAvailability(
          seat,
          device,
          shouldEnterMaintenance ? true : undefined
        );
        const updatedSeat = await tx.seat.update({
          where: { seatId: seat.seatId },
          data: {
            businessStatus: SeatStatus.FREE,
            maintenance: shouldEnterMaintenance ? true : seat.maintenance,
            availabilityStatus: seatAvailability.availabilityStatus,
            unavailableReason: seatAvailability.unavailableReason
          }
        });

        if (shouldEnterMaintenance) {
          await this.ensureOpenMaintenanceRecord(tx, seat.seatId, user.user_id, reason, now, {
            source: 'admin_release'
          });
        }

        const logDetail = {
          seat_id: seat.seatId,
          reservation_id: reservation.reservationId,
          previous_reservation_status: reservation.status,
          reservation_status: ReservationStatus.ADMIN_RELEASED,
          previous_seat_business_status: seat.businessStatus,
          seat_business_status: SeatStatus.FREE,
          restore_availability: request.restore_availability,
          exclude_study_record: request.exclude_study_record === true,
          availability_status: updatedSeat.availabilityStatus,
          unavailable_reason: updatedSeat.unavailableReason,
          mqtt_synced: false
        };
        const log = await tx.adminActionLog.create({
          data: {
            adminId: user.user_id,
            actionType: AdminActionType.RELEASE_SEAT,
            targetType: 'seat',
            targetId: seat.seatId,
            reason,
            detail: logDetail
          }
        });

        const result: LoggedMutationResult<AdminSeatDetailDto> = {
          data: await this.buildAdminSeatDetail(tx, updatedSeat),
          logId: log.logId,
          logDetail,
          seatId: updatedSeat.seatId
        };

        if (updatedSeat.deviceId !== null) {
          result.deviceId = updatedSeat.deviceId;
        }

        return result;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );

    await this.syncDeviceStateAndUpdateLog(result);
    return await this.getSeatDetail(result.data.seat_id);
  }

  async setSeatMaintenance(
    user: RequestUser,
    request: UpdateSeatMaintenanceRequest,
    now = new Date()
  ): Promise<AdminSeatDetailDto> {
    this.requireNonEmpty(request.seat_id, 'seat_id');
    this.requireNonEmpty(request.reason, 'reason');
    const result = await this.setSeatMaintenanceInternal(
      user,
      request.seat_id,
      request.maintenance,
      request.reason.trim(),
      'seat',
      request.seat_id,
      now
    );

    await this.syncDeviceStateAndUpdateLog(result, request.maintenance);
    return await this.getSeatDetail(result.data.seat_id);
  }

  async setDeviceMaintenance(
    user: RequestUser,
    request: UpdateDeviceMaintenanceRequest,
    now = new Date()
  ): Promise<AdminDeviceDto> {
    this.requireNonEmpty(request.device_id, 'device_id');
    this.requireNonEmpty(request.reason, 'reason');

    const device = await this.prisma.device.findUnique({
      where: { deviceId: request.device_id }
    });

    if (device === null) {
      throw this.notFound('Device was not found.', { device_id: request.device_id });
    }

    if (device.seatId === null) {
      throw new AppHttpException(
        HttpStatus.CONFLICT,
        ApiErrorCode.STATE_CONFLICT,
        'Device is not bound to a seat.',
        { device_id: request.device_id }
      );
    }

    const result = await this.setSeatMaintenanceInternal(
      user,
      device.seatId,
      request.maintenance,
      request.reason.trim(),
      'device',
      device.deviceId,
      now
    );

    await this.syncDeviceStateAndUpdateLog(result, request.maintenance);
    const updatedDevice = await this.prisma.device.findUnique({
      where: { deviceId: device.deviceId }
    });

    if (updatedDevice === null) {
      throw this.notFound('Device was not found.', { device_id: request.device_id });
    }

    return await this.buildAdminDeviceDto(this.prisma, updatedDevice);
  }

  async getSystemConfig(): Promise<AdminSystemConfigDto> {
    const auth = await this.authConfigService.getLoginMode();
    const mqtt = this.mqttBroker.getHealth();

    return {
      auth: auth.config,
      mqtt: {
        enabled: mqtt.enabled,
        connected: mqtt.connected,
        heartbeat_offline_threshold_seconds: getConfigNumber(
          this.configService,
          'MQTT_HEARTBEAT_OFFLINE_THRESHOLD_SECONDS'
        )
      },
      presence: {
        evaluation_enabled: getConfigBoolean(this.configService, 'PRESENCE_EVALUATION_ENABLED'),
        present_stable_seconds: getConfigNumber(
          this.configService,
          'PRESENCE_PRESENT_STABLE_SECONDS'
        ),
        absent_stable_seconds: getConfigNumber(
          this.configService,
          'PRESENCE_ABSENT_STABLE_SECONDS'
        ),
        untrusted_stable_seconds: getConfigNumber(
          this.configService,
          'PRESENCE_UNTRUSTED_STABLE_SECONDS'
        )
      },
      auto_rules: {
        enabled: getConfigBoolean(this.configService, 'AUTO_RULES_ENABLED'),
        no_show_enabled: getConfigBoolean(this.configService, 'AUTO_RULES_NO_SHOW_ENABLED'),
        usage_enabled: getConfigBoolean(this.configService, 'AUTO_RULES_USAGE_ENABLED'),
        occupancy_anomalies_enabled: getConfigBoolean(
          this.configService,
          'AUTO_RULES_OCCUPANCY_ANOMALIES_ENABLED'
        ),
        device_reconcile_enabled: getConfigBoolean(
          this.configService,
          'AUTO_RULES_DEVICE_RECONCILE_ENABLED'
        ),
        sensor_error_enabled: getConfigBoolean(
          this.configService,
          'AUTO_RULES_SENSOR_ERROR_ENABLED'
        ),
        no_show_interval_seconds: getConfigNumber(
          this.configService,
          'AUTO_RULES_NO_SHOW_INTERVAL_SECONDS'
        ),
        usage_interval_seconds: getConfigNumber(
          this.configService,
          'AUTO_RULES_USAGE_INTERVAL_SECONDS'
        ),
        occupancy_anomaly_interval_seconds: getConfigNumber(
          this.configService,
          'AUTO_RULES_OCCUPANCY_ANOMALY_INTERVAL_SECONDS'
        ),
        device_reconcile_interval_seconds: getConfigNumber(
          this.configService,
          'AUTO_RULES_DEVICE_RECONCILE_INTERVAL_SECONDS'
        ),
        ending_soon_window_seconds: getConfigNumber(
          this.configService,
          'AUTO_RULES_ENDING_SOON_WINDOW_SECONDS'
        )
      },
      checkin: {
        enabled: getConfigBoolean(this.configService, 'CHECKIN_ENABLED'),
        qr_token_refresh_seconds: getConfigNumber(this.configService, 'QR_TOKEN_REFRESH_SECONDS'),
        qr_token_ttl_seconds: getConfigNumber(this.configService, 'QR_TOKEN_TTL_SECONDS')
      }
    };
  }

  async listActionLogs(request: PageRequest): Promise<PageResponse<AdminActionLogDto>> {
    const page = normalizePageRequest(request);
    const [items, total] = await Promise.all([
      this.prisma.adminActionLog.findMany({
        orderBy: [{ createdAt: 'desc' }],
        skip: page.skip,
        take: page.pageSize
      }),
      this.prisma.adminActionLog.count()
    ]);

    return {
      items: items.map(toAdminActionLogDto),
      page: page.page,
      page_size: page.pageSize,
      total
    };
  }

  private async setSeatMaintenanceInternal(
    user: RequestUser,
    seatId: string,
    maintenance: boolean,
    reason: string,
    targetType: 'seat' | 'device',
    targetId: string,
    now: Date
  ): Promise<LoggedMutationResult<AdminSeatDetailDto>> {
    return await this.prisma.$transaction(
      async (tx) => {
        const seat = await tx.seat.findUnique({ where: { seatId } });

        if (seat === null) {
          throw this.notFound('Seat was not found.', { seat_id: seatId });
        }

        const device =
          seat.deviceId === null
            ? null
            : await tx.device.findUnique({ where: { deviceId: seat.deviceId } });
        const nextAvailability = this.getRestoredSeatAvailability(seat, device, maintenance);
        const updatedSeat = await tx.seat.update({
          where: { seatId },
          data: {
            maintenance,
            availabilityStatus: nextAvailability.availabilityStatus,
            unavailableReason: nextAvailability.unavailableReason
          }
        });

        if (maintenance) {
          await this.ensureOpenMaintenanceRecord(tx, seatId, user.user_id, reason, now, {
            source: targetType,
            target_id: targetId
          });
        } else {
          await this.closeOpenMaintenanceRecord(tx, seatId, user.user_id, now);
        }

        const actionType = maintenance
          ? AdminActionType.SET_MAINTENANCE
          : AdminActionType.RESTORE_AVAILABLE;
        const logDetail = {
          seat_id: seatId,
          device_id: device?.deviceId ?? null,
          previous_maintenance: seat.maintenance,
          maintenance,
          previous_availability_status: seat.availabilityStatus,
          availability_status: updatedSeat.availabilityStatus,
          previous_unavailable_reason: seat.unavailableReason,
          unavailable_reason: updatedSeat.unavailableReason,
          mqtt_synced: false
        };
        const log = await tx.adminActionLog.create({
          data: {
            adminId: user.user_id,
            actionType,
            targetType,
            targetId,
            reason,
            detail: logDetail
          }
        });

        const result: LoggedMutationResult<AdminSeatDetailDto> = {
          data: await this.buildAdminSeatDetail(tx, updatedSeat),
          logId: log.logId,
          logDetail,
          seatId: updatedSeat.seatId
        };

        if (updatedSeat.deviceId !== null) {
          result.deviceId = updatedSeat.deviceId;
        }

        return result;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  }

  private async findReleaseReservation(
    tx: Prisma.TransactionClient,
    request: AdminReleaseSeatRequest
  ): Promise<Reservation> {
    const reservation =
      request.reservation_id === undefined
        ? await tx.reservation.findFirst({
            where: {
              seatId: request.seat_id,
              status: { in: [...ACTIVE_RESERVATION_STATUSES] }
            },
            orderBy: [{ startTime: 'asc' }]
          })
        : await tx.reservation.findUnique({ where: { reservationId: request.reservation_id } });

    if (reservation === null) {
      throw new AppHttpException(
        HttpStatus.CONFLICT,
        ApiErrorCode.RESERVATION_NOT_ACTIVE,
        'No active reservation can be released for this seat.',
        { seat_id: request.seat_id, reservation_id: request.reservation_id }
      );
    }

    if (reservation.seatId !== request.seat_id) {
      throw new AppHttpException(
        HttpStatus.CONFLICT,
        ApiErrorCode.CHECKIN_CONTEXT_MISMATCH,
        'Reservation does not belong to the requested seat.',
        { seat_id: request.seat_id, reservation_id: reservation.reservationId }
      );
    }

    if (!isActiveReservationStatus(reservation.status)) {
      throw new AppHttpException(
        HttpStatus.CONFLICT,
        ApiErrorCode.RESERVATION_NOT_ACTIVE,
        'Only active reservations can be released by administrators.',
        { reservation_id: reservation.reservationId, status: reservation.status }
      );
    }

    return reservation;
  }

  private getRestoredSeatAvailability(
    seat: Seat,
    device: Device | null,
    nextMaintenance: boolean | undefined
  ): {
    availabilityStatus: SeatAvailability;
    unavailableReason: SeatUnavailableReason | null;
  } {
    if (nextMaintenance ?? seat.maintenance) {
      return {
        availabilityStatus: SeatAvailability.UNAVAILABLE,
        unavailableReason: SeatUnavailableReason.ADMIN_MAINTENANCE
      };
    }

    if (device?.onlineStatus === DeviceOnlineStatus.OFFLINE) {
      return {
        availabilityStatus: SeatAvailability.UNAVAILABLE,
        unavailableReason: SeatUnavailableReason.DEVICE_OFFLINE
      };
    }

    if (seat.unavailableReason === SeatUnavailableReason.SENSOR_ERROR) {
      return {
        availabilityStatus: SeatAvailability.UNAVAILABLE,
        unavailableReason: SeatUnavailableReason.SENSOR_ERROR
      };
    }

    return {
      availabilityStatus: SeatAvailability.AVAILABLE,
      unavailableReason: null
    };
  }

  private async ensureOpenMaintenanceRecord(
    tx: Prisma.TransactionClient,
    seatId: string,
    adminId: string,
    reason: string,
    now: Date,
    detail: Record<string, unknown>
  ): Promise<void> {
    const existing = await tx.maintenanceRecord.findFirst({
      where: { seatId, endedAt: null },
      orderBy: [{ startedAt: 'desc' }]
    });

    if (existing !== null) {
      return;
    }

    await tx.maintenanceRecord.create({
      data: {
        seatId,
        startedById: adminId,
        reason,
        startedAt: now,
        detail: detail as Prisma.InputJsonObject
      }
    });
  }

  private async closeOpenMaintenanceRecord(
    tx: Prisma.TransactionClient,
    seatId: string,
    adminId: string,
    now: Date
  ): Promise<void> {
    const existing = await tx.maintenanceRecord.findFirst({
      where: { seatId, endedAt: null },
      orderBy: [{ startedAt: 'desc' }]
    });

    if (existing === null) {
      return;
    }

    await tx.maintenanceRecord.update({
      where: { maintenanceId: existing.maintenanceId },
      data: {
        endedById: adminId,
        endedAt: now
      }
    });
  }

  private async syncDeviceStateAndUpdateLog(
    result: LoggedMutationResult<unknown>,
    maintenance?: boolean
  ): Promise<void> {
    if (result.deviceId === undefined || result.seatId === undefined) {
      return;
    }

    const timestamp = new Date().toISOString();
    let commandPublished: boolean | undefined;
    let stateSynced = false;

    try {
      if (maintenance !== undefined) {
        const commandPayload = {
          device_id: result.deviceId,
          seat_id: result.seatId,
          timestamp,
          command_id: `admin-${result.logId}`,
          command_type: maintenance
            ? DeviceCommandType.ENTER_MAINTENANCE
            : DeviceCommandType.EXIT_MAINTENANCE,
          issued_at: timestamp
        };
        commandPublished = await this.commandBus.publishCommand(commandPayload);
      }

      stateSynced = await this.commandBus.syncLatestDeviceState(result.deviceId);
    } catch (error) {
      this.logger.warn(
        `Admin MQTT sync degraded for device ${result.deviceId}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }

    const mqttSynced =
      commandPublished === undefined ? stateSynced : commandPublished && stateSynced;

    await this.prisma.adminActionLog.update({
      where: { logId: result.logId },
      data: {
        detail: {
          ...result.logDetail,
          mqtt_command_published: commandPublished,
          mqtt_state_synced: stateSynced,
          mqtt_synced: mqttSynced
        }
      }
    });
  }

  private async invalidateUnusedQrTokensForReservation(
    tx: Prisma.TransactionClient,
    reservationId: string
  ): Promise<void> {
    await tx.qRToken.updateMany({
      where: {
        reservationId,
        status: QRTokenStatus.UNUSED
      },
      data: {
        status: QRTokenStatus.INVALIDATED
      }
    });
  }

  private async getSeatDetail(seatId: string): Promise<AdminSeatDetailDto> {
    const seat = await this.prisma.seat.findUnique({ where: { seatId } });

    if (seat === null) {
      throw this.notFound('Seat was not found.', { seat_id: seatId });
    }

    return await this.buildAdminSeatDetail(this.prisma, seat);
  }

  private async buildAdminSeatDetail(client: AdminClient, seat: Seat): Promise<AdminSeatDetailDto> {
    const [device, currentReservation, activeAnomalyCount] = await Promise.all([
      seat.deviceId === null
        ? null
        : client.device.findUnique({ where: { deviceId: seat.deviceId } }),
      client.reservation.findFirst({
        where: {
          seatId: seat.seatId,
          status: { in: [...ACTIVE_RESERVATION_STATUSES] }
        },
        orderBy: [{ startTime: 'asc' }]
      }),
      client.anomalyEvent.count({
        where: {
          seatId: seat.seatId,
          status: { in: [...ACTIVE_ANOMALY_STATUSES] }
        }
      })
    ]);

    const detail = toAdminSeatDetailDto(seat, {
      device,
      currentReservation,
      activeAnomalyCount
    });

    return detail;
  }

  private async buildAdminDeviceDto(client: AdminClient, device: Device): Promise<AdminDeviceDto> {
    const seat =
      device.seatId === null
        ? null
        : await client.seat.findUnique({ where: { seatId: device.seatId } });

    return toAdminDeviceDto(device, seat);
  }

  private async findAnomalyOrThrow(eventId: string): Promise<AnomalyEvent> {
    const event = await this.prisma.anomalyEvent.findUnique({
      where: { eventId }
    });

    if (event === null) {
      throw this.notFound('Anomaly event was not found.', { event_id: eventId });
    }

    return event;
  }

  private assertHandleStatus(status: AnomalyStatus): void {
    const allowed = [
      AnomalyStatus.ACKNOWLEDGED,
      AnomalyStatus.HANDLED,
      AnomalyStatus.IGNORED,
      AnomalyStatus.CLOSED
    ];

    if (!allowed.includes(status as (typeof allowed)[number])) {
      throw new AppHttpException(
        HttpStatus.BAD_REQUEST,
        ApiErrorCode.VALIDATION_FAILED,
        'Invalid anomaly handling status.',
        { status }
      );
    }
  }

  private requireNonEmpty(value: string | undefined, field: string): void {
    if (value === undefined || value.trim().length === 0) {
      throw new AppHttpException(
        HttpStatus.BAD_REQUEST,
        ApiErrorCode.VALIDATION_FAILED,
        `${field} is required.`,
        { field }
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
}

const getAnomalyActionType = (status: AnomalyStatus): AdminActionType => {
  switch (status) {
    case AnomalyStatus.ACKNOWLEDGED:
      return AdminActionType.ACKNOWLEDGE_ANOMALY;
    case AnomalyStatus.HANDLED:
      return AdminActionType.HANDLE_ANOMALY;
    case AnomalyStatus.IGNORED:
      return AdminActionType.IGNORE_ANOMALY;
    case AnomalyStatus.CLOSED:
      return AdminActionType.CLOSE_ANOMALY;
    default:
      return AdminActionType.HANDLE_ANOMALY;
  }
};

const isFinalAnomalyStatus = (status: AnomalyStatus): boolean =>
  status === AnomalyStatus.HANDLED ||
  status === AnomalyStatus.IGNORED ||
  status === AnomalyStatus.CLOSED;

const isActiveReservationStatus = (status: ReservationStatus): boolean =>
  status === ReservationStatus.WAITING_CHECKIN || status === ReservationStatus.CHECKED_IN;

const normalizePageRequest = (
  request: PageRequest
): { page: number; pageSize: number; skip: number } => {
  const page = normalizePositiveInteger(request.page, 1);
  const pageSize = Math.min(normalizePositiveInteger(request.page_size, 20), 100);

  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize
  };
};

const normalizePositiveInteger = (value: number | string | undefined, fallback: number): number => {
  if (value === undefined) {
    return fallback;
  }

  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : fallback;
};

const toAdminActionLogDto = (log: AdminActionLog): AdminActionLogDto => {
  const dto: AdminActionLogDto = {
    log_id: log.logId,
    admin_id: log.adminId,
    action_type: log.actionType as AdminActionLogDto['action_type'],
    target_type: log.targetType as AdminActionLogDto['target_type'],
    target_id: log.targetId,
    created_at: log.createdAt.toISOString()
  };

  if (log.reason !== null) {
    dto.reason = log.reason;
  }

  if (typeof log.detail === 'object' && log.detail !== null && !Array.isArray(log.detail)) {
    dto.detail = log.detail as Record<string, unknown>;
  }

  return dto;
};
