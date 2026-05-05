import { randomBytes } from 'node:crypto';

import {
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeviceOnlineStatus,
  Prisma,
  PresenceStatus,
  QRTokenStatus,
  ReservationStatus,
  SeatAvailability,
  SeatStatus,
  StudyRecordSource,
  type Device,
  type QRToken,
  type Reservation,
  type Seat
} from '@prisma/client';
import {
  ApiErrorCode,
  DisplayLayout,
  LightMode,
  LightStatus,
  SeatStatus as ContractSeatStatus,
  UserRole,
  type AdminReservationListRequest,
  type CancelReservationRequest,
  type CheckinRequest,
  type CheckinResponse,
  type CreateReservationRequest,
  type CurrentUsageResponse,
  type ExtendReservationRequest,
  type MqttDisplayPayload,
  type MqttLightPayload,
  type PageRequest,
  type PageResponse,
  type ReservationDto,
  type UserReleaseReservationRequest
} from '@smartseat/contracts';

import type { RequestUser } from '../../common/auth/request-user.js';
import { getConfigBoolean, getConfigNumber } from '../../common/config/config-reader.js';
import { PrismaService } from '../../common/database/prisma.service.js';
import { AppHttpException } from '../../common/errors/app-http.exception.js';
import { toReservationDto } from './reservation.mapper.js';
import { MqttCommandBusService } from '../mqtt/mqtt-command-bus.service.js';
import { toSeatDto } from '../seats/seat-device.mapper.js';
import { StudyRecordsService } from '../study-records/study-records.service.js';

const CHECKIN_START_OFFSET_MS = 5 * 60 * 1000;
const CHECKIN_DEADLINE_OFFSET_MS = 15 * 60 * 1000;
const ACTIVE_RESERVATION_STATUSES = [
  ReservationStatus.WAITING_CHECKIN,
  ReservationStatus.CHECKED_IN
] as const;

type ReservationClient = PrismaService | Prisma.TransactionClient;
type CheckinTransactionResult = {
  reservation: Reservation;
  seat: Seat;
  device: Device;
  checkedInAt: Date;
};

export interface ReservationRuleTransition {
  reservationId: string;
  userId: string;
  seatId: string;
  deviceId: string | null;
}

export interface NoShowReservationScanResult {
  expired: ReservationRuleTransition[];
}

export interface UsageReservationScanResult {
  endingSoon: ReservationRuleTransition[];
  finished: ReservationRuleTransition[];
  pendingRelease: ReservationRuleTransition[];
}

@Injectable()
export class ReservationsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReservationsService.name);
  private qrRefreshTimer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ConfigService) private readonly configService: ConfigService,
    @Inject(MqttCommandBusService) private readonly commandBus: MqttCommandBusService,
    private readonly studyRecordsService: StudyRecordsService
  ) {}

  onModuleInit(): void {
    const refreshMs = getConfigNumber(this.configService, 'QR_TOKEN_REFRESH_SECONDS') * 1000;
    this.qrRefreshTimer = setInterval(() => {
      void this.refreshActiveQrTokens().catch((error) => {
        this.logger.error(
          `QR token refresh failed: ${error instanceof Error ? error.message : String(error)}`
        );
      });
    }, refreshMs);
  }

  onModuleDestroy(): void {
    if (this.qrRefreshTimer !== undefined) {
      clearInterval(this.qrRefreshTimer);
    }
  }

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

  async getCurrentUsage(
    user: RequestUser,
    now = new Date()
  ): Promise<CurrentUsageResponse | undefined> {
    this.requireStudent(user);
    const reservation = await this.findCheckedInReservationForUser(this.prisma, user.user_id);

    if (reservation === null) {
      return undefined;
    }

    const seat = await this.prisma.seat.findUnique({
      where: {
        seatId: reservation.seatId
      }
    });

    if (seat === null) {
      throw this.notFound('Seat was not found.', { seat_id: reservation.seatId });
    }

    return {
      reservation: toReservationDto(reservation),
      seat: toSeatDto(seat),
      remaining_seconds: Math.max(
        0,
        Math.floor((reservation.endTime.getTime() - now.getTime()) / 1000)
      )
    };
  }

  async refreshActiveQrTokens(now = new Date()): Promise<{
    expired: number;
    generated: number;
    skipped_offline: number;
  }> {
    const expired = await this.prisma.qRToken.updateMany({
      where: {
        status: QRTokenStatus.UNUSED,
        expiredAt: {
          lte: now
        }
      },
      data: {
        status: QRTokenStatus.EXPIRED
      }
    });
    const reservations = await this.prisma.reservation.findMany({
      where: {
        status: ReservationStatus.WAITING_CHECKIN,
        checkinStartTime: {
          lte: now
        },
        checkinDeadline: {
          gte: now
        }
      },
      orderBy: [{ checkinDeadline: 'asc' }]
    });
    let generated = 0;
    let skippedOffline = 0;

    for (const reservation of reservations) {
      const result = await this.createQrTokenForReservation(reservation, now);

      if (result === 'OFFLINE_OR_UNBOUND') {
        skippedOffline += 1;
        continue;
      }

      generated += 1;
      await this.publishReservedDeviceState(reservation, result, now);
    }

    if (expired.count > 0 || generated > 0 || skippedOffline > 0) {
      this.logger.log(
        JSON.stringify({
          category: 'qr_tokens_refreshed',
          expired: expired.count,
          generated,
          skipped_offline: skippedOffline
        })
      );
    }

    return {
      expired: expired.count,
      generated,
      skipped_offline: skippedOffline
    };
  }

  async syncReservedCheckinStateForDevice(deviceId: string, now = new Date()): Promise<boolean> {
    const device = await this.prisma.device.findUnique({
      where: {
        deviceId
      }
    });

    if (
      device === null ||
      device.seatId === null ||
      device.onlineStatus !== DeviceOnlineStatus.ONLINE
    ) {
      return false;
    }

    const reservation = await this.prisma.reservation.findFirst({
      where: {
        seatId: device.seatId,
        status: ReservationStatus.WAITING_CHECKIN,
        checkinStartTime: {
          lte: now
        },
        checkinDeadline: {
          gte: now
        }
      },
      orderBy: [{ checkinDeadline: 'asc' }]
    });

    if (reservation === null) {
      return false;
    }

    await this.prisma.qRToken.updateMany({
      where: {
        reservationId: reservation.reservationId,
        status: QRTokenStatus.UNUSED,
        expiredAt: {
          lte: now
        }
      },
      data: {
        status: QRTokenStatus.EXPIRED
      }
    });

    const existing = await this.prisma.qRToken.findFirst({
      where: {
        reservationId: reservation.reservationId,
        seatId: reservation.seatId,
        deviceId,
        status: QRTokenStatus.UNUSED,
        expiredAt: {
          gt: now
        }
      },
      orderBy: [{ generatedAt: 'desc' }]
    });
    const token =
      existing ??
      (await this.createQrTokenForReservation(reservation, now).then((result) =>
        result === 'OFFLINE_OR_UNBOUND' ? null : result
      ));

    if (token === null) {
      return false;
    }

    await this.publishReservedDeviceState(reservation, token, now);
    return true;
  }

  async checkin(
    user: RequestUser,
    request: CheckinRequest,
    now = new Date()
  ): Promise<CheckinResponse> {
    this.requireStudent(user);

    if (!getConfigBoolean(this.configService, 'CHECKIN_ENABLED')) {
      throw new AppHttpException(
        HttpStatus.SERVICE_UNAVAILABLE,
        ApiErrorCode.CHECKIN_DISABLED,
        'QR check-in is currently disabled.'
      );
    }

    this.requireNonEmpty(request.seat_id, 'seat_id');
    this.requireNonEmpty(request.device_id, 'device_id');
    this.requireNonEmpty(request.token, 'token');
    this.parseDateTime(request.timestamp, 'timestamp');

    const result = await this.prisma.$transaction(
      async (tx) => await this.applyQrCheckin(tx, user, request, now),
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable
      }
    );

    await this.publishCheckedInDeviceState(result, now);

    this.logger.log(
      JSON.stringify({
        category: 'reservation_checked_in',
        reservation_id: result.reservation.reservationId,
        user_id: result.reservation.userId,
        seat_id: result.seat.seatId,
        device_id: result.device.deviceId
      })
    );

    return {
      reservation: toReservationDto(result.reservation),
      seat: toSeatDto(result.seat),
      checked_in_at: result.checkedInAt.toISOString()
    };
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

        await this.invalidateUnusedQrTokensForReservation(tx, existing.reservationId);
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

  async extendReservation(
    user: RequestUser,
    reservationId: string,
    request: ExtendReservationRequest,
    now = new Date()
  ): Promise<ReservationDto> {
    this.requireStudent(user);
    this.requireNonEmpty(reservationId, 'reservation_id');
    const requestReservationId = normalizeOptionalString(request.reservation_id);

    if (requestReservationId !== undefined && requestReservationId !== reservationId) {
      throw new AppHttpException(
        HttpStatus.BAD_REQUEST,
        ApiErrorCode.VALIDATION_FAILED,
        'Path reservation_id must match request reservation_id.',
        { reservation_id: reservationId, request_reservation_id: requestReservationId }
      );
    }

    const newEndTime = this.parseDateTime(request.end_time, 'end_time');

    try {
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

          this.assertOwnedCheckedInReservation(existing, user.user_id);

          if (existing.endTime.getTime() <= now.getTime()) {
            throw new AppHttpException(
              HttpStatus.CONFLICT,
              ApiErrorCode.RESERVATION_NOT_ACTIVE,
              'Only unexpired checked-in reservations can be extended.',
              {
                reservation_id: reservationId,
                end_time: existing.endTime.toISOString()
              }
            );
          }

          if (newEndTime.getTime() <= existing.endTime.getTime()) {
            throw new AppHttpException(
              HttpStatus.BAD_REQUEST,
              ApiErrorCode.VALIDATION_FAILED,
              'Reservation extension end_time must be after the current end_time.',
              {
                reservation_id: reservationId,
                current_end_time: existing.endTime.toISOString(),
                end_time: request.end_time
              }
            );
          }

          await this.assertNoOverlappingReservation(tx, {
            userId: existing.userId,
            seatId: existing.seatId,
            startTime: existing.endTime,
            endTime: newEndTime,
            excludeReservationId: existing.reservationId
          });

          const updated = await tx.reservation.update({
            where: {
              reservationId
            },
            data: {
              endTime: newEndTime
            }
          });

          await tx.seat.update({
            where: {
              seatId: existing.seatId
            },
            data: {
              businessStatus: SeatStatus.OCCUPIED
            }
          });

          return updated;
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable
        }
      );

      this.logger.log(
        JSON.stringify({
          category: 'reservation_extended',
          reservation_id: reservation.reservationId,
          user_id: reservation.userId,
          seat_id: reservation.seatId,
          end_time: reservation.endTime.toISOString()
        })
      );

      return toReservationDto(reservation);
    } catch (error) {
      this.throwMappedReservationError(
        error,
        'Reservation extension conflicts with an existing reservation.'
      );
      throw error;
    }
  }

  async releaseCurrentUsage(
    user: RequestUser,
    request: UserReleaseReservationRequest,
    now = new Date()
  ): Promise<ReservationDto> {
    this.requireStudent(user);
    this.requireNonEmpty(request.reservation_id, 'reservation_id');

    const reservation = await this.prisma.$transaction(
      async (tx) => {
        const existing = await tx.reservation.findUnique({
          where: {
            reservationId: request.reservation_id
          }
        });

        if (existing === null) {
          throw this.notFound('Reservation was not found.', {
            reservation_id: request.reservation_id
          });
        }

        this.assertOwnedCheckedInReservation(existing, user.user_id);

        const data: Prisma.ReservationUpdateInput = {
          status: ReservationStatus.USER_RELEASED,
          releasedAt: now
        };
        const releaseReason = normalizeOptionalString(request.reason);

        if (releaseReason !== undefined) {
          data.releaseReason = releaseReason;
        }

        const updated = await tx.reservation.update({
          where: {
            reservationId: existing.reservationId
          },
          data
        });

        await this.studyRecordsService.upsertFromReservation(
          tx,
          existing,
          now,
          StudyRecordSource.USER_RELEASED
        );
        await this.releaseSeatIfNoActiveReservation(tx, existing.seatId);
        return updated;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable
      }
    );

    this.logger.log(
      JSON.stringify({
        category: 'reservation_user_released',
        reservation_id: reservation.reservationId,
        user_id: reservation.userId,
        seat_id: reservation.seatId
      })
    );

    return toReservationDto(reservation);
  }

  async expireNoShowReservations(now = new Date()): Promise<number> {
    const result = await this.expireNoShowReservationsDetailed(now);

    return result.expired.length;
  }

  async expireNoShowReservationsDetailed(now = new Date()): Promise<NoShowReservationScanResult> {
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
        const transitions: ReservationRuleTransition[] = [];

        for (const reservation of reservations) {
          const seat = await tx.seat.findUnique({
            where: {
              seatId: reservation.seatId
            }
          });

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
          await this.invalidateUnusedQrTokensForReservation(tx, reservation.reservationId);
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
          transitions.push({
            reservationId: reservation.reservationId,
            userId: reservation.userId,
            seatId: reservation.seatId,
            deviceId: seat?.deviceId ?? null
          });
        }

        return transitions;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable
      }
    );

    if (expired.length > 0) {
      this.logger.log(
        JSON.stringify({
          category: 'reservations_expired_no_show',
          count: expired.length
        })
      );
    }

    return { expired };
  }

  async advanceUsageReservations(now = new Date()): Promise<{
    ending_soon: number;
    finished: number;
    pending_release: number;
  }> {
    const result = await this.advanceUsageReservationsDetailed(now);

    return {
      ending_soon: result.endingSoon.length,
      finished: result.finished.length,
      pending_release: result.pendingRelease.length
    };
  }

  async advanceUsageReservationsDetailed(
    now = new Date(),
    endingSoonWindowSeconds = getConfigNumber(
      this.configService,
      'AUTO_RULES_ENDING_SOON_WINDOW_SECONDS'
    )
  ): Promise<UsageReservationScanResult> {
    const result = await this.prisma.$transaction(
      async (tx) => {
        const reservations = await tx.reservation.findMany({
          where: {
            status: ReservationStatus.CHECKED_IN
          },
          orderBy: [{ endTime: 'asc' }]
        });
        const transitions: UsageReservationScanResult = {
          endingSoon: [],
          finished: [],
          pendingRelease: []
        };
        const endingSoonWindowMs = endingSoonWindowSeconds * 1000;

        for (const reservation of reservations) {
          const seat = await tx.seat.findUnique({
            where: {
              seatId: reservation.seatId
            }
          });

          if (seat === null) {
            continue;
          }

          if (reservation.endTime.getTime() <= now.getTime()) {
            if (seat.presenceStatus === PresenceStatus.PRESENT) {
              if (seat.businessStatus !== SeatStatus.PENDING_RELEASE) {
                await tx.seat.update({
                  where: {
                    seatId: seat.seatId
                  },
                  data: {
                    businessStatus: SeatStatus.PENDING_RELEASE
                  }
                });
                transitions.pendingRelease.push({
                  reservationId: reservation.reservationId,
                  userId: reservation.userId,
                  seatId: reservation.seatId,
                  deviceId: seat.deviceId
                });
              }
              continue;
            }

            await tx.reservation.update({
              where: {
                reservationId: reservation.reservationId
              },
              data: {
                status: ReservationStatus.FINISHED,
                releasedAt: reservation.endTime,
                releaseReason: 'TIME_FINISHED'
              }
            });
            await this.studyRecordsService.upsertFromReservation(
              tx,
              reservation,
              reservation.endTime,
              StudyRecordSource.TIME_FINISHED
            );
            await this.releaseSeatIfNoActiveReservation(tx, reservation.seatId);
            transitions.finished.push({
              reservationId: reservation.reservationId,
              userId: reservation.userId,
              seatId: reservation.seatId,
              deviceId: seat.deviceId
            });
            continue;
          }

          if (reservation.endTime.getTime() - now.getTime() <= endingSoonWindowMs) {
            if (seat.businessStatus !== SeatStatus.ENDING_SOON) {
              await tx.seat.update({
                where: {
                  seatId: seat.seatId
                },
                data: {
                  businessStatus: SeatStatus.ENDING_SOON
                }
              });
              transitions.endingSoon.push({
                reservationId: reservation.reservationId,
                userId: reservation.userId,
                seatId: reservation.seatId,
                deviceId: seat.deviceId
              });
            }
          }
        }

        return transitions;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable
      }
    );

    if (
      result.endingSoon.length > 0 ||
      result.finished.length > 0 ||
      result.pendingRelease.length > 0
    ) {
      this.logger.log(
        JSON.stringify({
          category: 'usage_reservations_advanced',
          ending_soon: result.endingSoon.length,
          finished: result.finished.length,
          pending_release: result.pendingRelease.length
        })
      );
    }

    return result;
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

  private async createQrTokenForReservation(
    reservation: Reservation,
    now: Date
  ): Promise<QRToken | 'OFFLINE_OR_UNBOUND'> {
    const seat = await this.prisma.seat.findUnique({
      where: {
        seatId: reservation.seatId
      }
    });

    if (seat?.deviceId === null || seat?.deviceId === undefined) {
      return 'OFFLINE_OR_UNBOUND';
    }

    const device = await this.prisma.device.findUnique({
      where: {
        deviceId: seat.deviceId
      }
    });

    if (
      device === null ||
      device.seatId !== seat.seatId ||
      device.onlineStatus !== DeviceOnlineStatus.ONLINE
    ) {
      return 'OFFLINE_OR_UNBOUND';
    }

    return await this.prisma.qRToken.create({
      data: {
        token: randomBytes(32).toString('base64url'),
        reservationId: reservation.reservationId,
        seatId: reservation.seatId,
        deviceId: device.deviceId,
        generatedAt: now,
        expiredAt: new Date(
          now.getTime() + getConfigNumber(this.configService, 'QR_TOKEN_TTL_SECONDS') * 1000
        ),
        status: QRTokenStatus.UNUSED
      }
    });
  }

  private async publishReservedDeviceState(
    reservation: Reservation,
    token: QRToken,
    now: Date
  ): Promise<void> {
    const display: MqttDisplayPayload = {
      device_id: token.deviceId,
      seat_id: token.seatId,
      timestamp: now.toISOString(),
      current_time: now.toISOString(),
      seat_status: ContractSeatStatus.RESERVED,
      layout: DisplayLayout.RESERVED,
      checkin_deadline: reservation.checkinDeadline.toISOString(),
      remaining_seconds: Math.max(
        0,
        Math.floor((reservation.checkinDeadline.getTime() - now.getTime()) / 1000)
      ),
      qr_token: token.token,
      prompt: 'Scan QR code to check in'
    };
    const light: MqttLightPayload = {
      device_id: token.deviceId,
      seat_id: token.seatId,
      timestamp: now.toISOString(),
      light_status: LightStatus.RESERVED,
      color: 'blue',
      mode: LightMode.SOLID
    };

    await Promise.all([
      this.commandBus.publishDisplay(display),
      this.commandBus.publishLight(light)
    ]);
  }

  private async applyQrCheckin(
    tx: ReservationClient,
    user: RequestUser,
    request: CheckinRequest,
    now: Date
  ): Promise<CheckinTransactionResult> {
    const token = await tx.qRToken.findUnique({
      where: {
        token: request.token
      }
    });

    if (token === null) {
      throw new AppHttpException(
        HttpStatus.CONFLICT,
        ApiErrorCode.QR_TOKEN_INVALIDATED,
        'QR token is invalid or has been invalidated.'
      );
    }

    if (token.status === QRTokenStatus.UNUSED && token.expiredAt.getTime() <= now.getTime()) {
      await tx.qRToken.update({
        where: {
          tokenId: token.tokenId
        },
        data: {
          status: QRTokenStatus.EXPIRED
        }
      });
    }

    this.assertQrTokenCanBeUsed(token, request, now);

    const reservation =
      token.reservationId === null
        ? null
        : await tx.reservation.findUnique({
            where: {
              reservationId: token.reservationId
            }
          });

    if (reservation === null) {
      throw new AppHttpException(
        HttpStatus.CONFLICT,
        ApiErrorCode.QR_TOKEN_INVALIDATED,
        'QR token is no longer linked to an active reservation.',
        { token_id: token.tokenId }
      );
    }

    this.assertReservationCanCheckIn(reservation, user.user_id, now);

    const [seat, device] = await Promise.all([
      tx.seat.findUnique({
        where: {
          seatId: token.seatId
        }
      }),
      tx.device.findUnique({
        where: {
          deviceId: token.deviceId
        }
      })
    ]);

    if (seat === null) {
      throw this.notFound('Seat was not found.', { seat_id: token.seatId });
    }

    if (device === null) {
      throw this.notFound('Device was not found.', { device_id: token.deviceId });
    }

    this.assertCheckinContextMatches(reservation, seat, device, token);

    if (device.onlineStatus !== DeviceOnlineStatus.ONLINE) {
      throw new AppHttpException(
        HttpStatus.CONFLICT,
        ApiErrorCode.DEVICE_OFFLINE,
        'Bound check-in device is offline.',
        { device_id: device.deviceId, seat_id: seat.seatId }
      );
    }

    const updatedReservation = await tx.reservation.update({
      where: {
        reservationId: reservation.reservationId
      },
      data: {
        status: ReservationStatus.CHECKED_IN,
        checkedInAt: now
      }
    });
    const updatedSeat = await tx.seat.update({
      where: {
        seatId: seat.seatId
      },
      data: {
        businessStatus: SeatStatus.OCCUPIED
      }
    });

    await tx.qRToken.update({
      where: {
        tokenId: token.tokenId
      },
      data: {
        status: QRTokenStatus.USED,
        usedAt: now
      }
    });
    await tx.qRToken.updateMany({
      where: {
        reservationId: reservation.reservationId,
        status: QRTokenStatus.UNUSED,
        tokenId: {
          not: token.tokenId
        }
      },
      data: {
        status: QRTokenStatus.INVALIDATED
      }
    });
    await tx.checkInRecord.create({
      data: {
        reservationId: reservation.reservationId,
        userId: user.user_id,
        seatId: seat.seatId,
        deviceId: device.deviceId,
        qrTokenId: token.tokenId,
        checkedInAt: now,
        presenceStatus: seat.presenceStatus,
        source: 'qr_token'
      }
    });

    return {
      reservation: updatedReservation,
      seat: updatedSeat,
      device,
      checkedInAt: now
    };
  }

  private assertQrTokenCanBeUsed(token: QRToken, request: CheckinRequest, now: Date): void {
    if (token.seatId !== request.seat_id || token.deviceId !== request.device_id) {
      throw new AppHttpException(
        HttpStatus.CONFLICT,
        ApiErrorCode.CHECKIN_CONTEXT_MISMATCH,
        'QR token does not match the submitted seat or device.',
        { seat_id: request.seat_id, device_id: request.device_id }
      );
    }

    if (token.status === QRTokenStatus.USED) {
      throw new AppHttpException(
        HttpStatus.CONFLICT,
        ApiErrorCode.QR_TOKEN_USED,
        'QR token has already been used.',
        { token_id: token.tokenId }
      );
    }

    if (token.status === QRTokenStatus.INVALIDATED) {
      throw new AppHttpException(
        HttpStatus.CONFLICT,
        ApiErrorCode.QR_TOKEN_INVALIDATED,
        'QR token has been invalidated.',
        { token_id: token.tokenId }
      );
    }

    if (token.status === QRTokenStatus.EXPIRED || token.expiredAt.getTime() <= now.getTime()) {
      throw new AppHttpException(
        HttpStatus.CONFLICT,
        ApiErrorCode.QR_TOKEN_EXPIRED,
        'QR token has expired.',
        { token_id: token.tokenId, expired_at: token.expiredAt.toISOString() }
      );
    }
  }

  private assertReservationCanCheckIn(reservation: Reservation, userId: string, now: Date): void {
    if (reservation.userId !== userId) {
      throw new AppHttpException(
        HttpStatus.FORBIDDEN,
        ApiErrorCode.FORBIDDEN,
        'Reservation does not belong to the current student.',
        { reservation_id: reservation.reservationId }
      );
    }

    if (reservation.status === ReservationStatus.CHECKED_IN) {
      throw new AppHttpException(
        HttpStatus.CONFLICT,
        ApiErrorCode.CHECKIN_DUPLICATED,
        'Reservation has already been checked in.',
        { reservation_id: reservation.reservationId }
      );
    }

    if (reservation.status === ReservationStatus.CANCELLED) {
      throw new AppHttpException(
        HttpStatus.CONFLICT,
        ApiErrorCode.RESERVATION_CANCELLED,
        'Reservation has been cancelled.',
        { reservation_id: reservation.reservationId }
      );
    }

    if (reservation.status !== ReservationStatus.WAITING_CHECKIN) {
      throw new AppHttpException(
        HttpStatus.CONFLICT,
        ApiErrorCode.RESERVATION_NOT_ACTIVE,
        'Only waiting check-in reservations can be checked in.',
        { reservation_id: reservation.reservationId, status: reservation.status }
      );
    }

    if (
      reservation.checkinStartTime.getTime() > now.getTime() ||
      reservation.checkinDeadline.getTime() < now.getTime()
    ) {
      throw new AppHttpException(
        HttpStatus.CONFLICT,
        ApiErrorCode.CHECKIN_WINDOW_CLOSED,
        'Reservation is outside the check-in window.',
        {
          reservation_id: reservation.reservationId,
          checkin_start_time: reservation.checkinStartTime.toISOString(),
          checkin_deadline: reservation.checkinDeadline.toISOString()
        }
      );
    }
  }

  private assertCheckinContextMatches(
    reservation: Reservation,
    seat: Seat,
    device: Device,
    token: QRToken
  ): void {
    if (
      reservation.seatId !== token.seatId ||
      seat.seatId !== token.seatId ||
      seat.deviceId !== token.deviceId ||
      device.deviceId !== token.deviceId ||
      device.seatId !== token.seatId
    ) {
      throw new AppHttpException(
        HttpStatus.CONFLICT,
        ApiErrorCode.CHECKIN_CONTEXT_MISMATCH,
        'QR token, reservation, seat, and device context do not match.',
        {
          reservation_id: reservation.reservationId,
          seat_id: token.seatId,
          device_id: token.deviceId
        }
      );
    }
  }

  private async publishCheckedInDeviceState(
    result: CheckinTransactionResult,
    now: Date
  ): Promise<void> {
    const display: MqttDisplayPayload = {
      device_id: result.device.deviceId,
      seat_id: result.seat.seatId,
      timestamp: now.toISOString(),
      current_time: now.toISOString(),
      seat_status: ContractSeatStatus.OCCUPIED,
      layout: DisplayLayout.OCCUPIED,
      remaining_seconds: Math.max(
        0,
        Math.floor((result.reservation.endTime.getTime() - now.getTime()) / 1000)
      ),
      prompt: 'Checked in'
    };
    const light: MqttLightPayload = {
      device_id: result.device.deviceId,
      seat_id: result.seat.seatId,
      timestamp: now.toISOString(),
      light_status: LightStatus.OCCUPIED,
      color: 'red',
      mode: LightMode.SOLID
    };

    await this.commandBus.publishDisplay(display);
    await this.commandBus.publishLight(light);
  }

  private async assertNoOverlappingReservation(
    tx: ReservationClient,
    input: {
      userId: string;
      seatId: string;
      startTime: Date;
      endTime: Date;
      excludeReservationId?: string;
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
      },
      ...(input.excludeReservationId === undefined
        ? {}
        : {
            reservationId: {
              not: input.excludeReservationId
            }
          })
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

  private assertOwnedCheckedInReservation(reservation: Reservation, userId: string): void {
    if (reservation.userId !== userId) {
      throw new AppHttpException(
        HttpStatus.FORBIDDEN,
        ApiErrorCode.FORBIDDEN,
        'Reservation does not belong to the current student.',
        { reservation_id: reservation.reservationId }
      );
    }

    if (reservation.status !== ReservationStatus.CHECKED_IN) {
      throw new AppHttpException(
        HttpStatus.CONFLICT,
        ApiErrorCode.RESERVATION_NOT_ACTIVE,
        'Only checked-in reservations can be changed as current usage.',
        {
          reservation_id: reservation.reservationId,
          status: reservation.status
        }
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

  private async invalidateUnusedQrTokensForReservation(
    tx: ReservationClient,
    reservationId: string
  ): Promise<void> {
    await tx.qRToken.updateMany({
      where: {
        reservationId,
        status: QRTokenStatus.UNUSED
      },
      data: {
        status: QRTokenStatus.INVALIDATED
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

  private async findCheckedInReservationForUser(
    client: ReservationClient,
    userId: string
  ): Promise<Reservation | null> {
    return await client.reservation.findFirst({
      where: {
        userId,
        status: ReservationStatus.CHECKED_IN
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
