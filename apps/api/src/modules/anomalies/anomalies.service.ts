import { Injectable, Logger } from '@nestjs/common';
import {
  AnomalySource,
  AnomalyStatus,
  AnomalyType,
  Prisma,
  type AnomalyEvent
} from '@prisma/client';

import { PrismaService } from '../../common/database/prisma.service.js';

export interface CreatePendingAnomalyInput {
  eventType: AnomalyType;
  source: AnomalySource;
  seatId: string;
  userId?: string | null;
  deviceId?: string | null;
  reservationId?: string | null;
  description: string;
  reason?: string | null;
  createdAt?: Date;
}

export interface CreatePendingAnomalyResult {
  event: AnomalyEvent;
  created: boolean;
}

export interface ResolvePendingAnomalyInput {
  eventType: AnomalyType;
  seatId: string;
  deviceId?: string | null;
  reservationId?: string | null;
  resolvedAt?: Date;
  reason: string;
  message: string;
}

@Injectable()
export class AnomaliesService {
  private readonly logger = new Logger(AnomaliesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createPendingOnce(input: CreatePendingAnomalyInput): Promise<CreatePendingAnomalyResult> {
    const existing = await this.findPending(input);

    if (existing !== null) {
      return {
        event: existing,
        created: false
      };
    }

    try {
      const data: Prisma.AnomalyEventUncheckedCreateInput = {
        eventType: input.eventType,
        source: input.source,
        seatId: input.seatId,
        userId: input.userId ?? null,
        deviceId: input.deviceId ?? null,
        reservationId: input.reservationId ?? null,
        description: input.description,
        reason: input.reason ?? null
      };

      if (input.createdAt !== undefined) {
        data.createdAt = input.createdAt;
      }

      const created = await this.prisma.anomalyEvent.create({
        data
      });

      return {
        event: created,
        created: true
      };
    } catch (error) {
      if (!isPrismaConflict(error)) {
        throw error;
      }

      const event = await this.findPending(input);

      if (event !== null) {
        return {
          event,
          created: false
        };
      }

      this.logger.warn(
        `Pending anomaly unique conflict had no readable row for ${input.eventType}/${input.seatId}.`
      );
      throw error;
    }
  }

  async resolvePending(input: ResolvePendingAnomalyInput): Promise<number> {
    const result = await this.prisma.anomalyEvent.updateMany({
      where: this.buildPendingWhere(input),
      data: {
        status: AnomalyStatus.HANDLED,
        resolvedAt: input.resolvedAt ?? new Date(),
        reason: input.reason,
        description: input.message
      }
    });

    return result.count;
  }

  private async findPending(input: {
    eventType: AnomalyType;
    seatId: string;
    deviceId?: string | null;
    reservationId?: string | null;
  }): Promise<AnomalyEvent | null> {
    return await this.prisma.anomalyEvent.findFirst({
      where: this.buildPendingWhere(input),
      orderBy: [{ createdAt: 'asc' }]
    });
  }

  private buildPendingWhere(input: {
    eventType: AnomalyType;
    seatId: string;
    deviceId?: string | null;
    reservationId?: string | null;
  }): Prisma.AnomalyEventWhereInput {
    return {
      eventType: input.eventType,
      seatId: input.seatId,
      deviceId: input.deviceId ?? null,
      reservationId: input.reservationId ?? null,
      status: AnomalyStatus.PENDING
    };
  }
}

const isPrismaConflict = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  (error as { code?: unknown }).code === 'P2002';
