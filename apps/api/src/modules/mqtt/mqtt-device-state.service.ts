import { Buffer } from 'node:buffer';

import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AnomalyType } from '@prisma/client';
import {
  DisplayLayout,
  MQTT_TOPIC_ROOT,
  MQTT_TOPIC_SEGMENTS,
  SensorHealthStatus,
  type MqttHeartbeatPayload
} from '@smartseat/contracts';

import { getConfigNumber } from '../../common/config/config-reader.js';
import { AnomaliesService } from '../anomalies/anomalies.service.js';
import { DevicesService } from '../devices/devices.service.js';
import { MqttBrokerService } from './mqtt-broker.service.js';
import { MqttCommandBusService } from './mqtt-command-bus.service.js';

@Injectable()
export class MqttDeviceStateService implements OnModuleInit {
  private readonly logger = new Logger(MqttDeviceStateService.name);

  constructor(
    @Inject(ConfigService) private readonly configService: ConfigService,
    @Inject(MqttBrokerService) private readonly broker: MqttBrokerService,
    @Inject(DevicesService) private readonly devicesService: DevicesService,
    @Inject(MqttCommandBusService) private readonly commandBus: MqttCommandBusService,
    @Inject(AnomaliesService) private readonly anomaliesService: AnomaliesService
  ) {}

  onModuleInit(): void {
    this.broker.registerMessageHandler((topic, payload) => this.handleMessage(topic, payload));
    void this.broker.subscribe(`${MQTT_TOPIC_ROOT}/+/${MQTT_TOPIC_SEGMENTS.heartbeat}`, { qos: 1 });
  }

  async handleMessage(topic: string, payload: Buffer): Promise<void> {
    const topicDeviceId = parseHeartbeatTopicDeviceId(topic);

    if (topicDeviceId === null) {
      return;
    }

    await this.handleHeartbeatMessage(topicDeviceId, payload, new Date());
  }

  async handleHeartbeatMessage(
    topicDeviceId: string,
    payloadBuffer: Buffer,
    observedAt: Date
  ): Promise<void> {
    const payload = this.parseHeartbeatPayload(topicDeviceId, payloadBuffer);

    if (payload === null) {
      return;
    }

    const result = await this.devicesService.applyHeartbeat(payload, observedAt);

    if (!result.accepted) {
      this.logger.warn(
        `Ignored heartbeat for ${payload.device_id}: ${result.reason ?? 'INVALID_DEVICE'}`
      );
      return;
    }

    if (result.wasOffline === true) {
      const synced = await this.commandBus.syncLatestDeviceState(payload.device_id);

      if (!synced) {
        this.logger.warn(`MQTT state sync degraded after heartbeat for ${payload.device_id}.`);
      }

      if (result.seat !== null && result.seat !== undefined) {
        const resolved = await this.anomaliesService.resolvePending({
          eventType: AnomalyType.DEVICE_OFFLINE,
          seatId: result.seat.seatId,
          deviceId: payload.device_id,
          resolvedAt: observedAt,
          reason: 'DEVICE_HEARTBEAT_RECOVERED',
          message: `Device ${payload.device_id} heartbeat recovered.`
        });

        if (resolved > 0) {
          this.logger.log(
            JSON.stringify({
              category: 'device_offline_anomaly_resolved',
              device_id: payload.device_id,
              seat_id: result.seat.seatId,
              count: resolved
            })
          );
        }
      }
    }
  }

  async markOfflineDevices(): Promise<void> {
    const thresholdSeconds = getConfigNumber(
      this.configService,
      'MQTT_HEARTBEAT_OFFLINE_THRESHOLD_SECONDS'
    );
    const offlineCount = await this.devicesService.markHeartbeatTimedOutDevices(
      new Date(),
      thresholdSeconds
    );

    if (offlineCount > 0) {
      this.logger.warn(`Marked ${offlineCount} MQTT device(s) offline after heartbeat timeout.`);
    }
  }

  private parseHeartbeatPayload(
    topicDeviceId: string,
    payloadBuffer: Buffer
  ): MqttHeartbeatPayload | null {
    let parsed: unknown;

    try {
      parsed = JSON.parse(payloadBuffer.toString('utf8'));
    } catch {
      this.logger.warn(`Ignored heartbeat for ${topicDeviceId}: payload is not valid JSON.`);
      return null;
    }

    if (!isRecord(parsed)) {
      this.logger.warn(`Ignored heartbeat for ${topicDeviceId}: payload is not an object.`);
      return null;
    }

    const payload = parsed;
    const requiredStrings = [
      'device_id',
      'seat_id',
      'timestamp',
      'firmware_version',
      'network_status'
    ] as const;

    for (const field of requiredStrings) {
      if (!isNonEmptyString(payload[field])) {
        this.logger.warn(`Ignored heartbeat for ${topicDeviceId}: missing ${field}.`);
        return null;
      }
    }

    const deviceId = payload.device_id;
    const seatId = payload.seat_id;
    const timestamp = payload.timestamp;
    const firmwareVersion = payload.firmware_version;
    const networkStatus = payload.network_status;

    if (
      !isValidDeviceId(topicDeviceId) ||
      !isValidDeviceId(deviceId) ||
      !isNonEmptyString(seatId) ||
      !isNonEmptyString(timestamp) ||
      !isNonEmptyString(firmwareVersion) ||
      !isNonEmptyString(networkStatus)
    ) {
      this.logger.warn(`Ignored heartbeat for ${topicDeviceId}: invalid device_id.`);
      return null;
    }

    if (deviceId !== topicDeviceId) {
      this.logger.warn(
        `Ignored heartbeat for ${topicDeviceId}: topic device_id does not match payload.`
      );
      return null;
    }

    if (!isValidDateTime(timestamp)) {
      this.logger.warn(`Ignored heartbeat for ${topicDeviceId}: invalid timestamp.`);
      return null;
    }

    if (!isEnumValue(SensorHealthStatus, payload.sensor_status)) {
      this.logger.warn(`Ignored heartbeat for ${topicDeviceId}: invalid sensor_status.`);
      return null;
    }

    if (!isEnumValue(DisplayLayout, payload.display_status)) {
      this.logger.warn(`Ignored heartbeat for ${topicDeviceId}: invalid display_status.`);
      return null;
    }

    return {
      device_id: deviceId,
      seat_id: seatId,
      timestamp,
      firmware_version: firmwareVersion,
      network_status: networkStatus,
      sensor_status: payload.sensor_status,
      display_status: payload.display_status
    };
  }
}

const parseHeartbeatTopicDeviceId = (topic: string): string | null => {
  const segments = topic.split('/');

  if (
    segments.length !== 3 ||
    segments[0] !== MQTT_TOPIC_ROOT ||
    segments[2] !== MQTT_TOPIC_SEGMENTS.heartbeat ||
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

const isEnumValue = <T extends Record<string, string>>(
  enumObject: T,
  value: unknown
): value is T[keyof T] => typeof value === 'string' && Object.values(enumObject).includes(value);
