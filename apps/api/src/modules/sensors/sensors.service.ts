import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeviceOnlineStatus,
  PresenceStatus,
  Prisma,
  SeatAvailability,
  SeatUnavailableReason,
  SensorHealthStatus,
  type SensorReading
} from '@prisma/client';
import type { MqttPresencePayload } from '@smartseat/contracts';

import { getConfigBoolean } from '../../common/config/config-reader.js';
import { PrismaService } from '../../common/database/prisma.service.js';
import {
  PresenceEvaluatorService,
  type StablePresenceResult
} from './presence-evaluator.service.js';

export type PresenceRecordRejectReason =
  | 'INVALID_DEVICE_ID'
  | 'INVALID_SEAT_ID'
  | 'INVALID_TIMESTAMP'
  | 'INVALID_PRESENCE_STATUS'
  | 'INVALID_SENSOR_STATUS'
  | 'INVALID_RAW_VALUE'
  | 'TOPIC_DEVICE_MISMATCH'
  | 'UNKNOWN_DEVICE'
  | 'SEAT_MISMATCH';

export interface PresenceRecordAcceptedResult {
  accepted: true;
  reading: SensorReading;
  stablePresence: StablePresenceResult | null;
}

export interface PresenceRecordRejectedResult {
  accepted: false;
  reason: PresenceRecordRejectReason;
}

export type PresenceRecordResult = PresenceRecordAcceptedResult | PresenceRecordRejectedResult;

interface PersistedPresenceResult {
  accepted: true;
  reading: SensorReading;
  deviceOnlineStatus: DeviceOnlineStatus;
  presenceStatus: PresenceStatus;
  reportedAt: Date;
}

@Injectable()
export class SensorsService {
  constructor(
    @Inject(ConfigService) private readonly configService: ConfigService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PresenceEvaluatorService) private readonly evaluator: PresenceEvaluatorService
  ) {}

  async recordPresence(
    topicDeviceId: string,
    payload: MqttPresencePayload,
    _observedAt: Date = new Date()
  ): Promise<PresenceRecordResult> {
    void _observedAt;

    const validation = this.validatePayload(topicDeviceId, payload);

    if (validation.accepted === false) {
      return validation;
    }

    const persisted: PersistedPresenceResult | PresenceRecordRejectedResult =
      await this.prisma.$transaction(
        async (tx): Promise<PersistedPresenceResult | PresenceRecordRejectedResult> => {
          const device = await tx.device.findUnique({
            where: { deviceId: payload.device_id }
          });

          if (device === null) {
            return {
              accepted: false,
              reason: 'UNKNOWN_DEVICE'
            };
          }

          if (device.seatId !== payload.seat_id) {
            return {
              accepted: false,
              reason: 'SEAT_MISMATCH'
            };
          }

          const reportedAt = new Date(payload.timestamp);
          const presenceStatus = payload.presence_status as PresenceStatus;
          const sensorStatus = this.normalizeSensorStatus(payload.sensor_status, presenceStatus);
          const rawValue = normalizeRawValue(payload.raw_value);
          const reading = await tx.sensorReading.create({
            data: {
              deviceId: payload.device_id,
              seatId: payload.seat_id,
              presenceStatus,
              sensorStatus,
              rawValue,
              reportedAt
            }
          });

          await tx.device.update({
            where: { deviceId: payload.device_id },
            data: {
              sensorStatus
            }
          });

          return {
            accepted: true,
            reading,
            deviceOnlineStatus: device.onlineStatus,
            presenceStatus,
            reportedAt
          };
        }
      );

    if (persisted.accepted === false) {
      return persisted;
    }

    if (!getConfigBoolean(this.configService, 'PRESENCE_EVALUATION_ENABLED')) {
      return {
        accepted: true,
        reading: persisted.reading,
        stablePresence: null
      };
    }

    const stablePresence = await this.evaluator.evaluate({
      deviceId: payload.device_id,
      seatId: payload.seat_id,
      presenceStatus: persisted.presenceStatus,
      reportedAt: persisted.reportedAt
    });

    if (stablePresence !== null) {
      await this.prisma.$transaction(async (tx) => {
        await this.applyStablePresence(tx, {
          seatId: payload.seat_id,
          deviceOnlineStatus: persisted.deviceOnlineStatus,
          stablePresence
        });
      });
    }

    return {
      accepted: true,
      reading: persisted.reading,
      stablePresence
    };
  }

  private validatePayload(
    topicDeviceId: string,
    payload: MqttPresencePayload
  ): PresenceRecordRejectedResult | { accepted: true } {
    if (!isValidDeviceId(topicDeviceId) || !isValidDeviceId(payload.device_id)) {
      return { accepted: false, reason: 'INVALID_DEVICE_ID' };
    }

    if (topicDeviceId !== payload.device_id) {
      return { accepted: false, reason: 'TOPIC_DEVICE_MISMATCH' };
    }

    if (!isNonEmptyString(payload.seat_id)) {
      return { accepted: false, reason: 'INVALID_SEAT_ID' };
    }

    if (!isValidDateTime(payload.timestamp)) {
      return { accepted: false, reason: 'INVALID_TIMESTAMP' };
    }

    if (!isEnumValue(PresenceStatus, payload.presence_status)) {
      return { accepted: false, reason: 'INVALID_PRESENCE_STATUS' };
    }

    if (
      payload.sensor_status !== undefined &&
      !isEnumValue(SensorHealthStatus, payload.sensor_status)
    ) {
      return { accepted: false, reason: 'INVALID_SENSOR_STATUS' };
    }

    if (!isSupportedRawValue(payload.raw_value)) {
      return { accepted: false, reason: 'INVALID_RAW_VALUE' };
    }

    return { accepted: true };
  }

  private normalizeSensorStatus(
    sensorStatus: MqttPresencePayload['sensor_status'],
    presenceStatus: PresenceStatus
  ): SensorHealthStatus {
    if (sensorStatus !== undefined) {
      return sensorStatus as SensorHealthStatus;
    }

    if (presenceStatus === PresenceStatus.ERROR) {
      return SensorHealthStatus.ERROR;
    }

    if (presenceStatus === PresenceStatus.UNKNOWN) {
      return SensorHealthStatus.UNKNOWN;
    }

    return SensorHealthStatus.OK;
  }

  private async applyStablePresence(
    tx: Prisma.TransactionClient,
    input: {
      seatId: string;
      deviceOnlineStatus: DeviceOnlineStatus;
      stablePresence: StablePresenceResult;
    }
  ): Promise<void> {
    const seat = await tx.seat.findUnique({
      where: { seatId: input.seatId }
    });

    if (seat === null) {
      return;
    }

    const data: Prisma.SeatUpdateInput = {
      presenceStatus: input.stablePresence.presenceStatus
    };

    if (
      input.stablePresence.presenceStatus === PresenceStatus.UNKNOWN ||
      input.stablePresence.presenceStatus === PresenceStatus.ERROR
    ) {
      if (!seat.maintenance) {
        data.availabilityStatus = SeatAvailability.UNAVAILABLE;
        data.unavailableReason = SeatUnavailableReason.SENSOR_ERROR;
      }
    } else if (
      !seat.maintenance &&
      seat.unavailableReason === SeatUnavailableReason.SENSOR_ERROR &&
      input.deviceOnlineStatus === DeviceOnlineStatus.ONLINE
    ) {
      data.availabilityStatus = SeatAvailability.AVAILABLE;
      data.unavailableReason = null;
    }

    await tx.seat.update({
      where: { seatId: input.seatId },
      data
    });
  }
}

const isValidDeviceId = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(value);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const isValidDateTime = (value: unknown): value is string => {
  if (!isNonEmptyString(value)) {
    return false;
  }

  const timestamp = Date.parse(value);

  return Number.isFinite(timestamp);
};

const isEnumValue = <T extends Record<string, string>>(
  enumObject: T,
  value: unknown
): value is T[keyof T] => typeof value === 'string' && Object.values(enumObject).includes(value);

const isSupportedRawValue = (value: unknown): boolean => {
  if (value === undefined || value === null) {
    return true;
  }

  if (['string', 'number', 'boolean'].includes(typeof value)) {
    return typeof value !== 'number' || Number.isFinite(value);
  }

  return isJsonObject(value);
};

const normalizeRawValue = (value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull => {
  if (value === undefined || value === null) {
    return Prisma.JsonNull;
  }

  return value as Prisma.InputJsonValue;
};

const isJsonObject = (value: unknown): value is Record<string, Prisma.InputJsonValue> => {
  if (!isPlainObject(value)) {
    return false;
  }

  return Object.values(value).every(isJsonValue);
};

const isJsonValue = (value: unknown): value is Prisma.InputJsonValue => {
  if (value === null) {
    return true;
  }

  if (['string', 'boolean'].includes(typeof value)) {
    return true;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value);
  }

  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }

  if (isPlainObject(value)) {
    return Object.values(value as Record<string, unknown>).every(isJsonValue);
  }

  return false;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
};
