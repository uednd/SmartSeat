import { HttpStatus, Injectable } from '@nestjs/common';
import {
  DeviceOnlineStatus,
  Prisma,
  SeatAvailability as PrismaSeatAvailability,
  SeatUnavailableReason as PrismaSeatUnavailableReason,
  type Device
} from '@prisma/client';
import {
  ApiErrorCode,
  type AdminDeviceDto,
  type BindDeviceSeatRequest,
  type CreateDeviceRequest,
  type DeviceDto,
  type DeviceListRequest,
  type PageResponse,
  type UnbindDeviceSeatRequest,
  type UpdateDeviceRequest
} from '@smartseat/contracts';

import { PrismaService } from '../../common/database/prisma.service.js';
import { AppHttpException } from '../../common/errors/app-http.exception.js';
import { toAdminDeviceDto, toDeviceDto } from '../seats/seat-device.mapper.js';

@Injectable()
export class DevicesService {
  constructor(private readonly prisma: PrismaService) {}

  async listDevices(request: DeviceListRequest): Promise<PageResponse<DeviceDto>> {
    const page = normalizePageRequest(request);
    const where: Prisma.DeviceWhereInput = {};

    if (request.online_status !== undefined) {
      where.onlineStatus = request.online_status as DeviceOnlineStatus;
    }

    const [items, total] = await Promise.all([
      this.prisma.device.findMany({
        where,
        orderBy: [{ deviceId: 'asc' }],
        skip: page.skip,
        take: page.pageSize
      }),
      this.prisma.device.count({ where })
    ]);

    return {
      items: items.map(toDeviceDto),
      page: page.page,
      page_size: page.pageSize,
      total
    };
  }

  async getDevice(deviceId: string): Promise<DeviceDto> {
    const device = await this.findDeviceOrThrow(deviceId);
    return toDeviceDto(device);
  }

  async listAdminDevices(request: DeviceListRequest): Promise<PageResponse<AdminDeviceDto>> {
    const page = normalizePageRequest(request);
    const where: Prisma.DeviceWhereInput = {};

    if (request.online_status !== undefined) {
      where.onlineStatus = request.online_status as DeviceOnlineStatus;
    }

    const [devices, total] = await Promise.all([
      this.prisma.device.findMany({
        where,
        orderBy: [{ deviceId: 'asc' }],
        skip: page.skip,
        take: page.pageSize
      }),
      this.prisma.device.count({ where })
    ]);
    const items = await Promise.all(devices.map((device) => this.toAdminDevice(device)));

    return {
      items,
      page: page.page,
      page_size: page.pageSize,
      total
    };
  }

  async getAdminDevice(deviceId: string): Promise<AdminDeviceDto> {
    const device = await this.findDeviceOrThrow(deviceId);
    return await this.toAdminDevice(device);
  }

  async createDevice(request: CreateDeviceRequest): Promise<AdminDeviceDto> {
    this.requireNonEmpty(request.mqtt_client_id, 'mqtt_client_id');

    try {
      const data: Prisma.DeviceCreateInput = {
        mqttClientId: request.mqtt_client_id
      };

      if (request.device_id !== undefined) {
        data.deviceId = request.device_id;
      }

      if (request.firmware_version !== undefined) {
        data.firmwareVersion = request.firmware_version;
      }

      if (request.hardware_version !== undefined) {
        data.hardwareVersion = request.hardware_version;
      }

      if (request.sensor_model !== undefined) {
        data.sensorModel = request.sensor_model;
      }

      if (request.network_status !== undefined) {
        data.networkStatus = request.network_status;
      }

      const device = await this.prisma.device.create({
        data
      });

      return await this.toAdminDevice(device);
    } catch (error) {
      this.throwMappedPrismaError(error, 'Device already exists.');
      throw error;
    }
  }

  async updateDevice(deviceId: string, request: UpdateDeviceRequest): Promise<AdminDeviceDto> {
    await this.findDeviceOrThrow(deviceId);
    const data: Prisma.DeviceUpdateInput = {};

    if (request.mqtt_client_id !== undefined) {
      this.requireNonEmpty(request.mqtt_client_id, 'mqtt_client_id');
      data.mqttClientId = request.mqtt_client_id;
    }

    if (request.firmware_version !== undefined) {
      data.firmwareVersion = request.firmware_version;
    }

    if (request.hardware_version !== undefined) {
      data.hardwareVersion = request.hardware_version;
    }

    if (request.sensor_model !== undefined) {
      data.sensorModel = request.sensor_model;
    }

    if (request.network_status !== undefined) {
      data.networkStatus = request.network_status;
    }

    try {
      const device = await this.prisma.device.update({
        where: { deviceId },
        data
      });

      return await this.toAdminDevice(device);
    } catch (error) {
      this.throwMappedPrismaError(error, 'Device update conflicts with an existing resource.');
      throw error;
    }
  }

  async bindDeviceSeat(deviceId: string, request: BindDeviceSeatRequest): Promise<AdminDeviceDto> {
    this.requireNonEmpty(request.seat_id, 'seat_id');

    await this.prisma.$transaction(async (tx) => {
      const [device, seat] = await Promise.all([
        tx.device.findUnique({ where: { deviceId } }),
        tx.seat.findUnique({ where: { seatId: request.seat_id } })
      ]);

      if (device === null) {
        throw this.notFound('Device was not found.', { device_id: deviceId });
      }

      if (seat === null) {
        throw this.notFound('Seat was not found.', { seat_id: request.seat_id });
      }

      const [activeDeviceBinding, activeSeatBinding] = await Promise.all([
        tx.deviceSeatBinding.findFirst({
          where: {
            deviceId,
            unboundAt: null
          }
        }),
        tx.deviceSeatBinding.findFirst({
          where: {
            seatId: request.seat_id,
            unboundAt: null
          }
        })
      ]);

      if (activeDeviceBinding !== null && activeDeviceBinding.seatId !== request.seat_id) {
        throw new AppHttpException(
          HttpStatus.CONFLICT,
          ApiErrorCode.STATE_CONFLICT,
          'Device is already bound to another seat.',
          { device_id: deviceId, seat_id: activeDeviceBinding.seatId }
        );
      }

      if (activeSeatBinding !== null && activeSeatBinding.deviceId !== deviceId) {
        throw new AppHttpException(
          HttpStatus.CONFLICT,
          ApiErrorCode.STATE_CONFLICT,
          'Seat is already bound to another device.',
          { seat_id: request.seat_id, device_id: activeSeatBinding.deviceId }
        );
      }

      if (activeDeviceBinding === null) {
        const bindingData: Prisma.DeviceSeatBindingUncheckedCreateInput = {
          deviceId,
          seatId: request.seat_id
        };

        if (request.reason !== undefined) {
          bindingData.reason = request.reason;
        }

        await tx.deviceSeatBinding.create({
          data: bindingData
        });
      }

      await tx.device.update({
        where: { deviceId },
        data: {
          seatId: request.seat_id
        }
      });

      await tx.seat.update({
        where: { seatId: request.seat_id },
        data: {
          deviceId,
          availabilityStatus:
            seat.maintenance || device.onlineStatus === DeviceOnlineStatus.OFFLINE
              ? PrismaSeatAvailability.UNAVAILABLE
              : PrismaSeatAvailability.AVAILABLE,
          unavailableReason: this.getBoundSeatUnavailableReason(
            seat.maintenance,
            device.onlineStatus
          )
        }
      });
    });

    return await this.getAdminDevice(deviceId);
  }

  async unbindDeviceSeat(
    deviceId: string,
    request: UnbindDeviceSeatRequest = {}
  ): Promise<AdminDeviceDto> {
    await this.prisma.$transaction(async (tx) => {
      const device = await tx.device.findUnique({
        where: { deviceId }
      });

      if (device === null) {
        throw this.notFound('Device was not found.', { device_id: deviceId });
      }

      const activeBinding = await tx.deviceSeatBinding.findFirst({
        where: {
          deviceId,
          unboundAt: null
        }
      });

      if (activeBinding === null) {
        return;
      }

      const unbindData: Prisma.DeviceSeatBindingUpdateInput = {
        unboundAt: new Date()
      };

      if (request.reason !== undefined) {
        unbindData.reason = request.reason;
      }

      await tx.deviceSeatBinding.update({
        where: {
          bindingId: activeBinding.bindingId
        },
        data: unbindData
      });

      await tx.device.update({
        where: { deviceId },
        data: {
          seatId: null
        }
      });

      const seat = await tx.seat.findUnique({
        where: { seatId: activeBinding.seatId }
      });

      if (seat !== null && seat.deviceId === deviceId) {
        await tx.seat.update({
          where: { seatId: activeBinding.seatId },
          data: {
            deviceId: null,
            availabilityStatus: seat.maintenance
              ? PrismaSeatAvailability.UNAVAILABLE
              : PrismaSeatAvailability.AVAILABLE,
            unavailableReason: seat.maintenance
              ? PrismaSeatUnavailableReason.ADMIN_MAINTENANCE
              : null
          }
        });
      }
    });

    return await this.getAdminDevice(deviceId);
  }

  async findDeviceOrThrow(deviceId: string) {
    const device = await this.prisma.device.findUnique({
      where: { deviceId }
    });

    if (device === null) {
      throw this.notFound('Device was not found.', { device_id: deviceId });
    }

    return device;
  }

  private async toAdminDevice(device: Device): Promise<AdminDeviceDto> {
    const seat =
      device.seatId === null
        ? null
        : await this.prisma.seat.findUnique({ where: { seatId: device.seatId } });

    return toAdminDeviceDto(device, seat);
  }

  private getBoundSeatUnavailableReason(
    maintenance: boolean,
    onlineStatus: DeviceOnlineStatus
  ): PrismaSeatUnavailableReason | null {
    if (maintenance) {
      return PrismaSeatUnavailableReason.ADMIN_MAINTENANCE;
    }

    if (onlineStatus === DeviceOnlineStatus.OFFLINE) {
      return PrismaSeatUnavailableReason.DEVICE_OFFLINE;
    }

    return null;
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

  private throwMappedPrismaError(error: unknown, message: string): void {
    if (isPrismaErrorCode(error, 'P2002')) {
      throw new AppHttpException(HttpStatus.CONFLICT, ApiErrorCode.STATE_CONFLICT, message);
    }
  }
}

const normalizePageRequest = (
  request: DeviceListRequest
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

const isPrismaErrorCode = (error: unknown, code: string): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  (error as { code?: unknown }).code === code;
