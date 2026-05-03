import { Buffer } from 'node:buffer';

import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  MQTT_TOPIC_ROOT,
  MQTT_TOPIC_SEGMENTS,
  PresenceStatus,
  SensorHealthStatus,
  type MqttPresencePayload
} from '@smartseat/contracts';

import { SensorsService } from '../sensors/sensors.service.js';
import { MqttBrokerService } from './mqtt-broker.service.js';

@Injectable()
export class MqttPresenceService implements OnModuleInit {
  private readonly logger = new Logger(MqttPresenceService.name);

  constructor(
    @Inject(MqttBrokerService) private readonly broker: MqttBrokerService,
    @Inject(SensorsService) private readonly sensorsService: SensorsService
  ) {}

  onModuleInit(): void {
    this.broker.registerMessageHandler((topic, payload) => this.handleMessage(topic, payload));
    void this.broker.subscribe(`${MQTT_TOPIC_ROOT}/+/${MQTT_TOPIC_SEGMENTS.presence}`, { qos: 1 });
  }

  async handleMessage(topic: string, payload: Buffer): Promise<void> {
    const topicDeviceId = parsePresenceTopicDeviceId(topic);

    if (topicDeviceId === null) {
      return;
    }

    await this.handlePresenceMessage(topicDeviceId, payload, new Date());
  }

  async handlePresenceMessage(
    topicDeviceId: string,
    payloadBuffer: Buffer,
    observedAt: Date
  ): Promise<void> {
    const payload = this.parsePresencePayload(topicDeviceId, payloadBuffer);

    if (payload === null) {
      return;
    }

    const result = await this.sensorsService.recordPresence(topicDeviceId, payload, observedAt);

    if (!result.accepted) {
      this.logger.warn(`Ignored presence for ${payload.device_id}: ${result.reason}.`);
      return;
    }

    if (result.stablePresence !== null) {
      this.logger.log(
        `Stable presence for ${payload.device_id}/${payload.seat_id}: ${result.stablePresence.presenceStatus} after ${result.stablePresence.stableForSeconds}s.`
      );
    }
  }

  private parsePresencePayload(
    topicDeviceId: string,
    payloadBuffer: Buffer
  ): MqttPresencePayload | null {
    let parsed: unknown;

    try {
      parsed = JSON.parse(payloadBuffer.toString('utf8'));
    } catch {
      this.logger.warn(`Ignored presence for ${topicDeviceId}: payload is not valid JSON.`);
      return null;
    }

    if (!isRecord(parsed)) {
      this.logger.warn(`Ignored presence for ${topicDeviceId}: payload is not an object.`);
      return null;
    }

    if (!isNonEmptyString(parsed.device_id)) {
      this.logger.warn(`Ignored presence for ${topicDeviceId}: missing device_id.`);
      return null;
    }

    if (!isNonEmptyString(parsed.seat_id)) {
      this.logger.warn(`Ignored presence for ${topicDeviceId}: missing seat_id.`);
      return null;
    }

    if (!isNonEmptyString(parsed.timestamp)) {
      this.logger.warn(`Ignored presence for ${topicDeviceId}: missing timestamp.`);
      return null;
    }

    if (!isEnumValue(PresenceStatus, parsed.presence_status)) {
      this.logger.warn(`Ignored presence for ${topicDeviceId}: invalid presence_status.`);
      return null;
    }

    if (
      parsed.sensor_status !== undefined &&
      !isEnumValue(SensorHealthStatus, parsed.sensor_status)
    ) {
      this.logger.warn(`Ignored presence for ${topicDeviceId}: invalid sensor_status.`);
      return null;
    }

    const payload: MqttPresencePayload = {
      device_id: parsed.device_id,
      seat_id: parsed.seat_id,
      timestamp: parsed.timestamp,
      presence_status: parsed.presence_status
    };

    if (parsed.raw_value !== undefined) {
      payload.raw_value = parsed.raw_value as NonNullable<MqttPresencePayload['raw_value']>;
    }

    if (parsed.sensor_status !== undefined) {
      payload.sensor_status = parsed.sensor_status;
    }

    return payload;
  }
}

const parsePresenceTopicDeviceId = (topic: string): string | null => {
  const segments = topic.split('/');

  if (
    segments.length !== 3 ||
    segments[0] !== MQTT_TOPIC_ROOT ||
    segments[2] !== MQTT_TOPIC_SEGMENTS.presence ||
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

const isEnumValue = <T extends Record<string, string>>(
  enumObject: T,
  value: unknown
): value is T[keyof T] => typeof value === 'string' && Object.values(enumObject).includes(value);
