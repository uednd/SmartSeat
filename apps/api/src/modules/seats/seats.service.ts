import { HttpStatus, Injectable } from '@nestjs/common';
import {
  AnomalyStatus,
  DeviceOnlineStatus,
  Prisma,
  ReservationStatus,
  SeatAvailability as PrismaSeatAvailability,
  SeatUnavailableReason as PrismaSeatUnavailableReason,
  type Seat
} from '@prisma/client';
import {
  ApiErrorCode,
  type AdminSeatDetailDto,
  type AdminSeatOverviewDto,
  type CreateSeatRequest,
  type PageRequest,
  type PageResponse,
  type SeatDetailDto,
  type SeatDto,
  type SeatListRequest,
  type SetSeatEnabledRequest,
  type UpdateSeatRequest
} from '@smartseat/contracts';

import { PrismaService } from '../../common/database/prisma.service.js';
import { AppHttpException } from '../../common/errors/app-http.exception.js';
import { toAdminSeatDetailDto, toSeatDetailDto, toSeatDto } from './seat-device.mapper.js';

const ACTIVE_RESERVATION_STATUSES = [
  ReservationStatus.WAITING_CHECKIN,
  ReservationStatus.CHECKED_IN
] as const;

@Injectable()
export class SeatsService {
  constructor(private readonly prisma: PrismaService) {}

  async listPublicSeats(request: SeatListRequest): Promise<PageResponse<SeatDto>> {
    const page = normalizePageRequest(request);
    const where: Prisma.SeatWhereInput = {};

    if (request.availability_status !== undefined) {
      where.availabilityStatus = request.availability_status as PrismaSeatAvailability;
    }

    const [items, total] = await Promise.all([
      this.prisma.seat.findMany({
        where,
        orderBy: [{ area: 'asc' }, { seatNo: 'asc' }],
        skip: page.skip,
        take: page.pageSize
      }),
      this.prisma.seat.count({ where })
    ]);

    return {
      items: items.map(toSeatDto),
      page: page.page,
      page_size: page.pageSize,
      total
    };
  }

  async getPublicSeat(seatId: string): Promise<SeatDetailDto> {
    const seat = await this.findSeatOrThrow(seatId);
    const [device, currentReservation] = await Promise.all([
      seat.deviceId === null
        ? null
        : this.prisma.device.findUnique({ where: { deviceId: seat.deviceId } }),
      this.findCurrentReservation(seat.seatId)
    ]);

    return toSeatDetailDto(seat, {
      device,
      currentReservation
    });
  }

  async listAdminSeats(request: PageRequest): Promise<PageResponse<AdminSeatOverviewDto>> {
    const page = normalizePageRequest(request);
    const [seats, total] = await Promise.all([
      this.prisma.seat.findMany({
        orderBy: [{ area: 'asc' }, { seatNo: 'asc' }],
        skip: page.skip,
        take: page.pageSize
      }),
      this.prisma.seat.count()
    ]);
    const items = await Promise.all(
      seats.map(async (seat) => {
        const detail = await this.buildAdminSeatDetail(seat);
        return detail satisfies AdminSeatOverviewDto;
      })
    );

    return {
      items,
      page: page.page,
      page_size: page.pageSize,
      total
    };
  }

  async getAdminSeat(seatId: string): Promise<AdminSeatDetailDto> {
    const seat = await this.findSeatOrThrow(seatId);
    return await this.buildAdminSeatDetail(seat);
  }

  async createSeat(request: CreateSeatRequest): Promise<AdminSeatDetailDto> {
    this.requireNonEmpty(request.seat_no, 'seat_no');
    this.requireNonEmpty(request.area, 'area');

    try {
      const data: Prisma.SeatCreateInput = {
        seatNo: request.seat_no,
        area: request.area
      };

      if (request.seat_id !== undefined) {
        data.seatId = request.seat_id;
      }

      const seat = await this.prisma.seat.create({
        data
      });

      return await this.buildAdminSeatDetail(seat);
    } catch (error) {
      this.throwMappedPrismaError(error, 'Seat already exists.');
      throw error;
    }
  }

  async updateSeat(seatId: string, request: UpdateSeatRequest): Promise<AdminSeatDetailDto> {
    const data: Prisma.SeatUpdateInput = {};

    if (request.seat_no !== undefined) {
      this.requireNonEmpty(request.seat_no, 'seat_no');
      data.seatNo = request.seat_no;
    }

    if (request.area !== undefined) {
      this.requireNonEmpty(request.area, 'area');
      data.area = request.area;
    }

    await this.findSeatOrThrow(seatId);

    try {
      const seat = await this.prisma.seat.update({
        where: { seatId },
        data
      });

      return await this.buildAdminSeatDetail(seat);
    } catch (error) {
      this.throwMappedPrismaError(error, 'Seat update conflicts with an existing resource.');
      throw error;
    }
  }

  async setSeatEnabled(
    seatId: string,
    request: SetSeatEnabledRequest
  ): Promise<AdminSeatDetailDto> {
    const seat = await this.findSeatOrThrow(seatId);

    if (!request.enabled) {
      const updated = await this.prisma.seat.update({
        where: { seatId },
        data: {
          maintenance: true,
          availabilityStatus: PrismaSeatAvailability.UNAVAILABLE,
          unavailableReason: PrismaSeatUnavailableReason.ADMIN_MAINTENANCE
        }
      });

      return await this.buildAdminSeatDetail(updated);
    }

    const device =
      seat.deviceId === null
        ? null
        : await this.prisma.device.findUnique({ where: { deviceId: seat.deviceId } });
    const shouldStayOffline = device?.onlineStatus === DeviceOnlineStatus.OFFLINE;
    const updated = await this.prisma.seat.update({
      where: { seatId },
      data: {
        maintenance: false,
        availabilityStatus: shouldStayOffline
          ? PrismaSeatAvailability.UNAVAILABLE
          : PrismaSeatAvailability.AVAILABLE,
        unavailableReason: shouldStayOffline ? PrismaSeatUnavailableReason.DEVICE_OFFLINE : null
      }
    });

    return await this.buildAdminSeatDetail(updated);
  }

  async findSeatOrThrow(seatId: string) {
    const seat = await this.prisma.seat.findUnique({
      where: { seatId }
    });

    if (seat === null) {
      throw new AppHttpException(
        HttpStatus.NOT_FOUND,
        ApiErrorCode.RESOURCE_NOT_FOUND,
        'Seat was not found.',
        { seat_id: seatId }
      );
    }

    return seat;
  }

  private async buildAdminSeatDetail(seat: Seat): Promise<AdminSeatDetailDto> {
    const [device, currentReservation, activeAnomalyCount] = await Promise.all([
      seat.deviceId === null
        ? null
        : this.prisma.device.findUnique({ where: { deviceId: seat.deviceId } }),
      this.findCurrentReservation(seat.seatId),
      this.prisma.anomalyEvent.count({
        where: {
          seatId: seat.seatId,
          status: AnomalyStatus.PENDING
        }
      })
    ]);

    return toAdminSeatDetailDto(seat, {
      device,
      currentReservation,
      activeAnomalyCount
    });
  }

  private async findCurrentReservation(seatId: string) {
    return await this.prisma.reservation.findFirst({
      where: {
        seatId,
        status: {
          in: [...ACTIVE_RESERVATION_STATUSES]
        }
      },
      orderBy: {
        startTime: 'asc'
      }
    });
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

  private throwMappedPrismaError(error: unknown, message: string): void {
    if (isPrismaErrorCode(error, 'P2002')) {
      throw new AppHttpException(HttpStatus.CONFLICT, ApiErrorCode.STATE_CONFLICT, message);
    }
  }
}

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

const isPrismaErrorCode = (error: unknown, code: string): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  (error as { code?: unknown }).code === code;
