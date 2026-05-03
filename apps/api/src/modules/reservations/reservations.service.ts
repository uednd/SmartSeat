import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import {
  Prisma,
  ReservationStatus,
  SeatAvailability,
  SeatStatus,
  type Reservation,
  type Seat
} from '@prisma/client';
import {
  ApiErrorCode,
  UserRole,
  type AdminReservationListRequest,
  type CancelReservationRequest,
  type CreateReservationRequest,
  type PageRequest,
  type PageResponse,
  type ReservationDto
} from '@smartseat/contracts';

import type { RequestUser } from '../../common/auth/request-user.js';
import { PrismaService } from '../../common/database/prisma.service.js';
import { AppHttpException } from '../../common/errors/app-http.exception.js';
import { toReservationDto } from './reservation.mapper.js';

const CHECKIN_START_OFFSET_MS = 5 * 60 * 1000;
const CHECKIN_DEADLINE_OFFSET_MS = 15 * 60 * 1000;
const ACTIVE_RESERVATION_STATUSES = [
  ReservationStatus.WAITING_CHECKIN,
  ReservationStatus.CHECKED_IN
] as const;

type ReservationClient = PrismaService | Prisma.TransactionClient;

@Injectable()
export class ReservationsService {
  private readonly logger = new Logger(ReservationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createReservation(
    user: RequestUser,
    request: CreateReservationRequest
  ): Promise<ReservationDto> {
    this.requireStudent(user);
    this.requireNonEmpty(request.seat_id, 'seat_id');
    const startTime = this.parseDateTime(request.start_time, 'start_time');
    const endTime = this.parseDateTime(request.end_time, 'end_time');

    if (startTime.getTime() >= endTime.getTime()) {
      throw new AppHttpException(
        HttpStatus.BAD_REQUEST,
        ApiErrorCode.VALIDATION_FAILED,
        'Reservation start_time must be before end_time.',
        { start_time: request.start_time, end_time: request.end_time }
      );
    }

    try {
      const reservation = await this.prisma.$transaction(
        async (tx) => {
          const seat = await tx.seat.findUnique({
            where: {
              seatId: request.seat_id
            }
          });

          if (seat === null) {
            throw this.notFound('Seat was not found.', { seat_id: request.seat_id });
          }

          this.assertSeatCanBeReserved(seat);
          await this.assertNoOverlappingReservation(tx, {
            userId: user.user_id,
            seatId: seat.seatId,
            startTime,
            endTime
          });

          const created = await tx.reservation.create({
            data: {
              userId: user.user_id,
              seatId: seat.seatId,
              startTime,
              endTime,
              checkinStartTime: new Date(startTime.getTime() - CHECKIN_START_OFFSET_MS),
              checkinDeadline: new Date(startTime.getTime() + CHECKIN_DEADLINE_OFFSET_MS),
              status: ReservationStatus.WAITING_CHECKIN
            }
          });

          await tx.seat.update({
            where: {
              seatId: seat.seatId
            },
            data: {
              businessStatus: SeatStatus.RESERVED
            }
          });

          return created;
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable
        }
      );

      this.logger.log(
        JSON.stringify({
          category: 'reservation_created',
          reservation_id: reservation.reservationId,
          user_id: reservation.userId,
          seat_id: reservation.seatId
        })
      );

      return toReservationDto(reservation);
    } catch (error) {
      this.throwMappedReservationError(
        error,
        'Reservation conflicts with an existing reservation.'
      );
      throw error;
    }
  }

  async getCurrentReservation(user: RequestUser): Promise<ReservationDto | undefined> {
    this.requireStudent(user);
    const reservation = await this.findCurrentReservationForUser(this.prisma, user.user_id);
    return reservation === null ? undefined : toReservationDto(reservation);
  }

  async listReservationHistory(
    user: RequestUser,
    request: PageRequest
  ): Promise<PageResponse<ReservationDto>> {
    this.requireStudent(user);
    const page = normalizePageRequest(request);
    const where: Prisma.ReservationWhereInput = {
      userId: user.user_id
    };

    const [items, total] = await Promise.all([
      this.prisma.reservation.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        skip: page.skip,
        take: page.pageSize
      }),
      this.prisma.reservation.count({ where })
    ]);

    return {
      items: items.map(toReservationDto),
      page: page.page,
      page_size: page.pageSize,
      total
    };
  }

  async cancelReservation(
    user: RequestUser,
    reservationId: string,
    request: Partial<CancelReservationRequest>
  ): Promise<ReservationDto> {
    this.requireStudent(user);
    this.requireNonEmpty(reservationId, 'reservation_id');

    const reservation = await this.prisma.$transaction(
      async (tx) => {
        const existing = await tx.reservation.findUnique({
          where: {
            reservationId
          }
        });

        if (existing === null) {
          throw this.notFound('Reservation was not found.', { reservation_id: reservationId });
        }

        if (existing.userId !== user.user_id) {
          throw new AppHttpException(
            HttpStatus.FORBIDDEN,
            ApiErrorCode.FORBIDDEN,
            'Reservation does not belong to the current student.',
            { reservation_id: reservationId }
          );
        }

        if (existing.status !== ReservationStatus.WAITING_CHECKIN) {
          throw new AppHttpException(
            HttpStatus.CONFLICT,
            ApiErrorCode.RESERVATION_NOT_ACTIVE,
            'Only waiting check-in reservations can be cancelled.',
            { reservation_id: reservationId, status: existing.status }
          );
        }

        const data: Prisma.ReservationUpdateInput = {
          status: ReservationStatus.CANCELLED,
          releasedAt: new Date()
        };
        const releaseReason = normalizeOptionalString(request.reason);

        if (releaseReason !== undefined) {
          data.releaseReason = releaseReason;
        }

        const updated = await tx.reservation.update({
          where: {
            reservationId
          },
          data
        });

        await this.releaseSeatIfNoActiveReservation(tx, existing.seatId);
        return updated;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable
      }
    );

    this.logger.log(
      JSON.stringify({
        category: 'reservation_cancelled',
        reservation_id: reservation.reservationId,
        user_id: reservation.userId,
        seat_id: reservation.seatId
      })
    );

    return toReservationDto(reservation);
  }

  async expireNoShowReservations(now = new Date()): Promise<number> {
    const expired = await this.prisma.$transaction(
      async (tx) => {
        const reservations = await tx.reservation.findMany({
          where: {
            status: ReservationStatus.WAITING_CHECKIN,
            checkinDeadline: {
              lt: now
            }
          },
          orderBy: [{ checkinDeadline: 'asc' }]
        });

        for (const reservation of reservations) {
          await tx.reservation.update({
            where: {
              reservationId: reservation.reservationId
            },
            data: {
              status: ReservationStatus.NO_SHOW,
              releasedAt: now,
              releaseReason: 'NO_SHOW'
            }
          });
          await tx.user.update({
            where: {
              userId: reservation.userId
            },
            data: {
              noShowCountWeek: {
                increment: 1
              },
              noShowCountMonth: {
                increment: 1
              }
            }
          });
          await this.releaseSeatIfNoActiveReservation(tx, reservation.seatId);
        }

        return reservations.length;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable
      }
    );

    if (expired > 0) {
      this.logger.log(
        JSON.stringify({
          category: 'reservations_expired_no_show',
          count: expired
        })
      );
    }

    return expired;
  }

  async listAdminCurrentReservations(
    request: AdminReservationListRequest
  ): Promise<PageResponse<ReservationDto>> {
    const page = normalizePageRequest(request);
    const where: Prisma.ReservationWhereInput = {
      status: {
        in: [...ACTIVE_RESERVATION_STATUSES]
      }
    };

    if (request.seat_id !== undefined) {
      where.seatId = request.seat_id;
    }

    const [items, total] = await Promise.all([
      this.prisma.reservation.findMany({
        where,
        orderBy: [{ startTime: 'asc' }],
        skip: page.skip,
        take: page.pageSize
      }),
      this.prisma.reservation.count({ where })
    ]);

    return {
      items: items.map(toReservationDto),
      page: page.page,
      page_size: page.pageSize,
      total
    };
  }

  async getAdminSeatReservation(seatId: string): Promise<ReservationDto | undefined> {
    this.requireNonEmpty(seatId, 'seat_id');
    const reservation = await this.findCurrentReservationForSeat(this.prisma, seatId);
    return reservation === null ? undefined : toReservationDto(reservation);
  }

  private async assertNoOverlappingReservation(
    tx: ReservationClient,
    input: {
      userId: string;
      seatId: string;
      startTime: Date;
      endTime: Date;
    }
  ): Promise<void> {
    const overlapWhere = {
      status: {
        in: [...ACTIVE_RESERVATION_STATUSES]
      },
      startTime: {
        lt: input.endTime
      },
      endTime: {
        gt: input.startTime
      }
    } satisfies Prisma.ReservationWhereInput;

    const [userConflict, seatConflict] = await Promise.all([
      tx.reservation.findFirst({
        where: {
          ...overlapWhere,
          userId: input.userId
        }
      }),
      tx.reservation.findFirst({
        where: {
          ...overlapWhere,
          seatId: input.seatId
        }
      })
    ]);

    if (userConflict !== null) {
      throw new AppHttpException(
        HttpStatus.CONFLICT,
        ApiErrorCode.RESERVATION_CONFLICT,
        'Student already has an effective reservation in this time range.',
        { reservation_id: userConflict.reservationId }
      );
    }

    if (seatConflict !== null) {
      throw new AppHttpException(
        HttpStatus.CONFLICT,
        ApiErrorCode.RESERVATION_CONFLICT,
        'Seat already has an effective reservation in this time range.',
        { reservation_id: seatConflict.reservationId }
      );
    }
  }

  private async releaseSeatIfNoActiveReservation(
    tx: ReservationClient,
    seatId: string
  ): Promise<void> {
    const activeCount = await tx.reservation.count({
      where: {
        seatId,
        status: {
          in: [...ACTIVE_RESERVATION_STATUSES]
        }
      }
    });

    if (activeCount > 0) {
      return;
    }

    await tx.seat.update({
      where: {
        seatId
      },
      data: {
        businessStatus: SeatStatus.FREE
      }
    });
  }

  private async findCurrentReservationForUser(
    client: ReservationClient,
    userId: string
  ): Promise<Reservation | null> {
    return await client.reservation.findFirst({
      where: {
        userId,
        status: {
          in: [...ACTIVE_RESERVATION_STATUSES]
        }
      },
      orderBy: {
        startTime: 'asc'
      }
    });
  }

  private async findCurrentReservationForSeat(
    client: ReservationClient,
    seatId: string
  ): Promise<Reservation | null> {
    return await client.reservation.findFirst({
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

  private assertSeatCanBeReserved(seat: Seat): void {
    if (
      seat.availabilityStatus !== SeatAvailability.AVAILABLE ||
      seat.maintenance ||
      seat.businessStatus !== SeatStatus.FREE
    ) {
      throw new AppHttpException(
        HttpStatus.CONFLICT,
        ApiErrorCode.SEAT_UNAVAILABLE,
        'Seat is not available for reservation.',
        {
          seat_id: seat.seatId,
          business_status: seat.businessStatus,
          availability_status: seat.availabilityStatus,
          unavailable_reason: seat.unavailableReason
        }
      );
    }
  }

  private requireStudent(user: RequestUser): void {
    if (!user.roles.includes(UserRole.STUDENT)) {
      throw new AppHttpException(
        HttpStatus.FORBIDDEN,
        ApiErrorCode.FORBIDDEN,
        'Student role is required.'
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

  private parseDateTime(value: string | undefined, field: string): Date {
    this.requireNonEmpty(value, field);
    const date = new Date(value as string);

    if (Number.isNaN(date.getTime())) {
      throw new AppHttpException(
        HttpStatus.BAD_REQUEST,
        ApiErrorCode.VALIDATION_FAILED,
        `${field} must be a valid ISO date-time string.`,
        { field, value }
      );
    }

    return date;
  }

  private notFound(message: string, details: Record<string, unknown>): AppHttpException {
    return new AppHttpException(
      HttpStatus.NOT_FOUND,
      ApiErrorCode.RESOURCE_NOT_FOUND,
      message,
      details
    );
  }

  private throwMappedReservationError(error: unknown, message: string): void {
    if (!isPrismaConflict(error)) {
      return;
    }

    this.logger.warn(
      JSON.stringify({
        category: 'reservation_conflict_rejected',
        code: getPrismaErrorCode(error)
      })
    );

    throw new AppHttpException(HttpStatus.CONFLICT, ApiErrorCode.RESERVATION_CONFLICT, message);
  }
}

const normalizeOptionalString = (value: string | undefined): string | undefined => {
  if (value === undefined) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
};

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

const getPrismaErrorCode = (error: unknown): string | undefined =>
  typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code)
    : undefined;

const isPrismaConflict = (error: unknown): boolean => {
  const code = getPrismaErrorCode(error);

  if (code === 'P2002' || code === 'P2004' || code === 'P2010' || code === 'P2034') {
    return true;
  }

  if (error instanceof Error) {
    return error.message.includes('reservations_active_');
  }

  return false;
};
