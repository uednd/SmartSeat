import type {
  DeviceCommandType,
  DisplayLayout,
  LightMode,
  LightStatus,
  MqttDeviceEventType,
  PresenceStatus,
  SeatStatus,
  SensorHealthStatus
} from './enums.js';

export const MQTT_TOPIC_ROOT = 'seat' as const;

export const MQTT_TOPIC_SEGMENTS = {
  heartbeat: 'heartbeat',
  presence: 'presence',
  event: 'event',
  display: 'display',
  light: 'light',
  command: 'command'
} as const;

export type MqttTopicSegment = (typeof MQTT_TOPIC_SEGMENTS)[keyof typeof MQTT_TOPIC_SEGMENTS];

export type MqttTopic<S extends MqttTopicSegment = MqttTopicSegment> =
  `${typeof MQTT_TOPIC_ROOT}/${string}/${S}`;

export const MQTT_TOPIC_PATTERNS = {
  heartbeat: 'seat/{device_id}/heartbeat',
  presence: 'seat/{device_id}/presence',
  event: 'seat/{device_id}/event',
  display: 'seat/{device_id}/display',
  light: 'seat/{device_id}/light',
  command: 'seat/{device_id}/command'
} as const;

export function buildMqttTopic<S extends MqttTopicSegment>(
  device_id: string,
  segment: S
): MqttTopic<S> {
  return `${MQTT_TOPIC_ROOT}/${device_id}/${segment}`;
}

export interface MqttBasePayload {
  device_id: string;
  seat_id: string;
  timestamp: string;
}

export interface MqttHeartbeatPayload extends MqttBasePayload {
  firmware_version: string;
  network_status: string;
  sensor_status: SensorHealthStatus;
  display_status: DisplayLayout;
}

export interface MqttPresencePayload extends MqttBasePayload {
  presence_status: PresenceStatus;
  raw_value?: string | number | boolean | Record<string, unknown>;
  sensor_status?: SensorHealthStatus;
}

export interface MqttEventPayload extends MqttBasePayload {
  event_type: MqttDeviceEventType;
  message?: string;
  details?: Record<string, unknown>;
}

export interface MqttDisplayPayload extends MqttBasePayload {
  seat_status: SeatStatus;
  current_time: string;
  remaining_seconds?: number;
  checkin_deadline?: string;
  qr_token?: string;
  prompt?: string;
  layout: DisplayLayout;
}

export interface MqttLightPayload extends MqttBasePayload {
  light_status: LightStatus;
  color: string;
  mode: LightMode;
  blink_hz?: number;
}

export interface MqttCommandPayload extends MqttBasePayload {
  command_id: string;
  command_type: DeviceCommandType;
  reason?: string;
  issued_at: string;
}

export interface MqttPayloadBySegment {
  heartbeat: MqttHeartbeatPayload;
  presence: MqttPresencePayload;
  event: MqttEventPayload;
  display: MqttDisplayPayload;
  light: MqttLightPayload;
  command: MqttCommandPayload;
}

export type MqttPayload = MqttPayloadBySegment[keyof MqttPayloadBySegment];
