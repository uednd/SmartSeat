import { Buffer } from 'node:buffer';

import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QRTokenStatus, ReservationStatus } from '@prisma/client';
import {
  MQTT_TOPIC_ROOT,
  MQTT_TOPIC_SEGMENTS,
  type MqttTokenReportPayload
} from '@smartseat/contracts';

import { getConfigNumber } from '../../common/config/config-reader.js';
import { PrismaService } from '../../common/database/prisma.service.js';
import { MqttBrokerService } from './mqtt-broker.service.js';

const TOKEN_MIN_LENGTH = 4;
const TOKEN_MAX_LENGTH = 6;
const TOKEN_PATTERN = /^[A-Za-z0-9]+$/;

@Injectable()
export class MqttTokenReportService implements OnModuleInit {
  private readonly logger = new Logger(MqttTokenReportService.name);

  constructor(
    @Inject(ConfigService) private readonly configService: ConfigService,
    @Inject(MqttBrokerService) private readonly broker: MqttBrokerService,
    @Inject(PrismaService) private readonly prisma: PrismaService
  ) {}

  onModuleInit(): void {
    this.broker.registerMessageHandler((topic, payload) => this.handleMessage(topic, payload));
    void this.broker.subscribe(
      `${MQTT_TOPIC_ROOT}/+/${MQTT_TOPIC_SEGMENTS.token_report}`,
      { qos: 1 }
    );
    this.logger.log('Subscribed to token_report MQTT topic');
  }

  async handleMessage(topic: string, payload: Buffer): Promise<void> {
    const topicDeviceId = parseTokenReportTopicDeviceId(topic);
    if (topicDeviceId === null) return;

    await this.handleTokenReport(topicDeviceId, payload, new Date());
  }

  async handleTokenReport(
    topicDeviceId: string,
    payloadBuffer: Buffer,
    observedAt: Date
  ): Promise<void> {
    const payload = this.parseTokenReportPayload(topicDeviceId, payloadBuffer);
    if (payload === null) return;

    try {
      await this.prisma.$transaction(async (tx) => {
        // Invalidate all UNUSED tokens for this device
        await tx.qRToken.updateMany({
          where: {
            deviceId: payload.device_id,
            status: QRTokenStatus.UNUSED
          },
          data: {
            status: QRTokenStatus.INVALIDATED
          }
        });

        // Find active WAITING_CHECKIN reservation for this seat
        const reservation = await tx.reservation.findFirst({
          where: {
            seatId: payload.seat_id,
            status: ReservationStatus.WAITING_CHECKIN,
            checkinStartTime: { lte: observedAt },
            checkinDeadline: { gte: observedAt }
          },
          orderBy: [{ checkinDeadline: 'asc' }]
        });

        const ttlSeconds = getConfigNumber(this.configService, 'QR_TOKEN_TTL_SECONDS');

        // Create new QRToken with device-reported token
        await tx.qRToken.create({
          data: {
            token: payload.token,
            reservationId: reservation?.reservationId ?? null,
            seatId: payload.seat_id,
            deviceId: payload.device_id,
            generatedAt: observedAt,
            expiredAt: new Date(observedAt.getTime() + ttlSeconds * 1000),
            status: QRTokenStatus.UNUSED
          }
        });
      });

      this.logger.log(
        JSON.stringify({
          category: 'device_token_reported',
          device_id: payload.device_id,
          seat_id: payload.seat_id,
          token_truncated: payload.token.slice(0, 2) + '**'
        })
      );
    } catch (error) {
      this.logger.warn(
        `Failed to process token report for ${payload.device_id}: ${error instanceof Error ? error.message : 'UNKNOWN_ERROR'}`
      );
    }
  }

  private parseTokenReportPayload(
    topicDeviceId: string,
    payloadBuffer: Buffer
  ): MqttTokenReportPayload | null {
    let parsed: unknown;

    try {
      parsed = JSON.parse(payloadBuffer.toString('utf8'));
    } catch {
      this.logger.warn(`Ignored token_report for ${topicDeviceId}: payload is not valid JSON.`);
      return null;
    }

    if (!isRecord(parsed)) {
      this.logger.warn(`Ignored token_report for ${topicDeviceId}: payload is not an object.`);
      return null;
    }

    const p = parsed;
    const requiredStrings = ['device_id', 'seat_id', 'token', 'timestamp'] as const;

    for (const field of requiredStrings) {
      if (!isNonEmptyString(p[field])) {
        this.logger.warn(`Ignored token_report for ${topicDeviceId}: missing ${field}.`);
        return null;
      }
    }

    const deviceId = p.device_id as string;
    const seatId = p.seat_id as string;
    const timestamp = p.timestamp as string;

    if (!isValidDeviceId(topicDeviceId) || !isValidDeviceId(deviceId)) {
      this.logger.warn(`Ignored token_report for ${topicDeviceId}: invalid device_id.`);
      return null;
    }

    if (deviceId !== topicDeviceId) {
      this.logger.warn(
        `Ignored token_report for ${topicDeviceId}: topic device_id does not match payload.`
      );
      return null;
    }

    if (!isNonEmptyString(seatId)) {
      this.logger.warn(`Ignored token_report for ${topicDeviceId}: seat_id is empty.`);
      return null;
    }

    const token = (p.token as string).toUpperCase();

    if (
      token.length < TOKEN_MIN_LENGTH ||
      token.length > TOKEN_MAX_LENGTH ||
      !TOKEN_PATTERN.test(token)
    ) {
      this.logger.warn(
        `Ignored token_report for ${topicDeviceId}: invalid token format (must be ${TOKEN_MIN_LENGTH}-${TOKEN_MAX_LENGTH} alphanumeric chars).`
      );
      return null;
    }

    if (!isValidDateTime(timestamp)) {
      this.logger.warn(`Ignored token_report for ${topicDeviceId}: invalid timestamp.`);
      return null;
    }

    return {
      device_id: deviceId,
      seat_id: seatId,
      token,
      timestamp
    };
  }
}

const parseTokenReportTopicDeviceId = (topic: string): string | null => {
  const segments = topic.split('/');

  if (
    segments.length !== 3 ||
    segments[0] !== MQTT_TOPIC_ROOT ||
    segments[2] !== MQTT_TOPIC_SEGMENTS.token_report ||
    !isValidDeviceId(segments[1])
  ) {
    return null;
  }

  return segments[1];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const isValidDeviceId = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(value);

const isValidDateTime = (value: string): boolean => {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp);
};
