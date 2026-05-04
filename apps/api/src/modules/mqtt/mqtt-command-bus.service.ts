import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  buildMqttTopic,
  DisplayLayout,
  LightMode,
  LightStatus,
  SeatStatus,
  type MqttCommandPayload,
  type MqttDisplayPayload,
  type MqttLightPayload
} from '@smartseat/contracts';

import { DevicesService } from '../devices/devices.service.js';
import { MqttBrokerService } from './mqtt-broker.service.js';

@Injectable()
export class MqttCommandBusService {
  private readonly logger = new Logger(MqttCommandBusService.name);
  private readonly latestDisplayPayloads = new Map<string, MqttDisplayPayload>();
  private readonly latestLightPayloads = new Map<string, MqttLightPayload>();

  constructor(
    @Inject(MqttBrokerService) private readonly broker: MqttBrokerService,
    @Inject(DevicesService) private readonly devicesService: DevicesService
  ) {}

  async publishDisplay(payload: MqttDisplayPayload): Promise<boolean> {
    this.latestDisplayPayloads.set(payload.device_id, payload);

    return await this.broker.publishJson(buildMqttTopic(payload.device_id, 'display'), payload, {
      qos: 1,
      retain: false
    });
  }

  async publishLight(payload: MqttLightPayload): Promise<boolean> {
    this.latestLightPayloads.set(payload.device_id, payload);

    return await this.broker.publishJson(buildMqttTopic(payload.device_id, 'light'), payload, {
      qos: 1,
      retain: false
    });
  }

  async publishCommand(payload: MqttCommandPayload): Promise<boolean> {
    return await this.broker.publishJson(buildMqttTopic(payload.device_id, 'command'), payload, {
      qos: 1,
      retain: false
    });
  }

  async syncLatestDeviceState(deviceId: string): Promise<boolean> {
    const state = await this.devicesService.getDeviceMqttState(deviceId);

    if (state === null) {
      this.logger.warn(`Skipped MQTT state sync for unknown device: ${deviceId}`);
      return false;
    }

    if (state.seat === null) {
      this.logger.warn(`Skipped MQTT state sync for unbound device: ${deviceId}`);
      return false;
    }

    const displayPayload =
      this.latestDisplayPayloads.get(deviceId) ?? buildDisplayPayloadFromCurrentState(state);
    const lightPayload =
      this.latestLightPayloads.get(deviceId) ?? buildLightPayloadFromCurrentState(state);

    const [displayPublished, lightPublished] = await Promise.all([
      this.publishDisplay(displayPayload),
      this.publishLight(lightPayload)
    ]);

    return displayPublished && lightPublished;
  }
}

const buildDisplayPayloadFromCurrentState = (
  state: NonNullable<Awaited<ReturnType<DevicesService['getDeviceMqttState']>>>
): MqttDisplayPayload => {
  const timestamp = new Date().toISOString();

  return {
    device_id: state.device.deviceId,
    seat_id: state.seat?.seatId ?? '',
    timestamp,
    current_time: timestamp,
    seat_status: state.seat?.businessStatus as SeatStatus,
    layout: getDisplayLayout(state),
    prompt: getDisplayPrompt(state)
  };
};

const buildLightPayloadFromCurrentState = (
  state: NonNullable<Awaited<ReturnType<DevicesService['getDeviceMqttState']>>>
): MqttLightPayload => ({
  device_id: state.device.deviceId,
  seat_id: state.seat?.seatId ?? '',
  timestamp: new Date().toISOString(),
  ...getLightState(state)
});

const getDisplayLayout = (
  state: NonNullable<Awaited<ReturnType<DevicesService['getDeviceMqttState']>>>
): DisplayLayout => {
  if (state.seat?.maintenance === true) {
    return DisplayLayout.MAINTENANCE;
  }

  switch (state.seat?.businessStatus) {
    case SeatStatus.FREE:
      return DisplayLayout.FREE;
    case SeatStatus.RESERVED:
      return DisplayLayout.RESERVED;
    case SeatStatus.OCCUPIED:
      return DisplayLayout.OCCUPIED;
    case SeatStatus.ENDING_SOON:
      return DisplayLayout.ENDING_SOON;
    case SeatStatus.PENDING_RELEASE:
      return DisplayLayout.PENDING_RELEASE;
    default:
      return DisplayLayout.ERROR;
  }
};

const getDisplayPrompt = (
  state: NonNullable<Awaited<ReturnType<DevicesService['getDeviceMqttState']>>>
): string => {
  if (state.seat?.maintenance === true) {
    return 'Seat under maintenance';
  }

  if (state.seat?.businessStatus === SeatStatus.FREE) {
    return 'Seat available';
  }

  return 'Seat status synchronized';
};

const getLightState = (
  state: NonNullable<Awaited<ReturnType<DevicesService['getDeviceMqttState']>>>
): Pick<MqttLightPayload, 'light_status' | 'color' | 'mode'> => {
  if (state.seat?.maintenance === true) {
    return {
      light_status: LightStatus.ERROR,
      color: 'amber',
      mode: LightMode.SLOW_BLINK
    };
  }

  switch (state.seat?.businessStatus) {
    case SeatStatus.FREE:
      return {
        light_status: LightStatus.FREE,
        color: 'green',
        mode: LightMode.SOLID
      };
    case SeatStatus.RESERVED:
      return {
        light_status: LightStatus.RESERVED,
        color: 'blue',
        mode: LightMode.SOLID
      };
    case SeatStatus.OCCUPIED:
      return {
        light_status: LightStatus.OCCUPIED,
        color: 'red',
        mode: LightMode.SOLID
      };
    case SeatStatus.ENDING_SOON:
    case SeatStatus.PENDING_RELEASE:
      return {
        light_status: LightStatus.WARNING,
        color: 'amber',
        mode: LightMode.SLOW_BLINK
      };
    default:
      return {
        light_status: LightStatus.ERROR,
        color: 'red',
        mode: LightMode.FAST_BLINK
      };
  }
};
