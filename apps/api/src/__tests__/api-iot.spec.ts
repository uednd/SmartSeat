import { Buffer } from 'node:buffer';

import { ConfigService } from '@nestjs/config';
import {
  DeviceCommandType,
  DeviceOnlineStatus,
  DisplayLayout,
  LightMode,
  LightStatus,
  SeatAvailability,
  SeatStatus,
  SeatUnavailableReason,
  SensorHealthStatus,
  type MqttCommandPayload,
  type MqttDisplayPayload,
  type MqttLightPayload
} from '@smartseat/contracts';
import { describe, expect, it } from 'vitest';

import { DevicesService } from '../modules/devices/devices.service.js';
import { MqttBrokerService } from '../modules/mqtt/mqtt-broker.service.js';
import { MqttCommandBusService } from '../modules/mqtt/mqtt-command-bus.service.js';
import { MqttDeviceStateService } from '../modules/mqtt/mqtt-device-state.service.js';

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

interface PublishedMessage {
  topic: string;
  payload: unknown;
  options: { qos: 0 | 1 | 2; retain: boolean };
}

class FakePrismaService {
  devices: FakeDevice[] = [];
  seats: FakeSeat[] = [];

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
    update: async ({ where, data }: { where: { seatId: string }; data: Partial<FakeSeat> }) => {
      const seat = this.seats.find((candidate) => candidate.seatId === where.seatId);

      if (seat === undefined) {
        throw new Error('Missing fake seat.');
      }

      Object.assign(seat, data, { updatedAt: new Date('2026-05-03T09:00:00.000Z') });
      return seat;
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

const createServices = (
  input: {
    connected?: boolean;
    thresholdSeconds?: number;
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
    MQTT_HEARTBEAT_OFFLINE_THRESHOLD_SECONDS: input.thresholdSeconds ?? 75
  });
  const deviceStateService = new MqttDeviceStateService(
    config,
    broker as unknown as MqttBrokerService,
    devicesService,
    commandBus
  );

  return {
    prisma,
    broker,
    devicesService,
    commandBus,
    deviceStateService
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
  } = {}
) => {
  const now = new Date('2026-05-03T08:00:00.000Z');
  const device: FakeDevice = {
    deviceId: 'device_001',
    seatId: 'seat_001',
    mqttClientId: 'mqtt-device-001',
    onlineStatus: input.onlineStatus ?? DeviceOnlineStatus.OFFLINE,
    lastHeartbeatAt: input.lastHeartbeatAt ?? null,
    sensorStatus: SensorHealthStatus.UNKNOWN,
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
    unavailableReason: input.unavailableReason ?? SeatUnavailableReason.DEVICE_OFFLINE,
    deviceId: 'device_001',
    presenceStatus: 'UNKNOWN',
    maintenance: input.maintenance ?? false,
    createdAt: now,
    updatedAt: now
  };

  prisma.devices.push(device);
  prisma.seats.push(seat);

  return { device, seat };
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
});
