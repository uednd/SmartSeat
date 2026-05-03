import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PresenceStatus } from '@prisma/client';

import { getConfigNumber } from '../../common/config/config-reader.js';
import { PrismaService } from '../../common/database/prisma.service.js';

export interface StablePresenceResult {
  presenceStatus: PresenceStatus;
  stableSince: Date;
  stableForSeconds: number;
  thresholdSeconds: number;
}

@Injectable()
export class PresenceEvaluatorService {
  constructor(
    @Inject(ConfigService) private readonly configService: ConfigService,
    @Inject(PrismaService) private readonly prisma: PrismaService
  ) {}

  async evaluate(input: {
    deviceId: string;
    seatId: string;
    presenceStatus: PresenceStatus;
    reportedAt: Date;
  }): Promise<StablePresenceResult | null> {
    const thresholdSeconds = this.getThresholdSeconds(input.presenceStatus);
    const thresholdStart = new Date(input.reportedAt.getTime() - thresholdSeconds * 1000);
    const windowReadings = await this.prisma.sensorReading.findMany({
      where: {
        deviceId: input.deviceId,
        seatId: input.seatId,
        reportedAt: {
          gte: thresholdStart,
          lte: input.reportedAt
        }
      },
      orderBy: [{ reportedAt: 'desc' }, { createdAt: 'desc' }]
    });

    if (windowReadings.length === 0) {
      return null;
    }

    for (const reading of windowReadings) {
      if (reading.presenceStatus !== input.presenceStatus) {
        return null;
      }
    }

    const earliestWindowReading = windowReadings.at(-1);

    if (earliestWindowReading === undefined) {
      return null;
    }

    let stableSince = earliestWindowReading.reportedAt;
    const priorReadings = await this.prisma.sensorReading.findMany({
      where: {
        deviceId: input.deviceId,
        seatId: input.seatId,
        reportedAt: {
          lte: thresholdStart
        }
      },
      orderBy: [{ reportedAt: 'desc' }, { createdAt: 'desc' }],
      take: 1
    });
    const priorReading = priorReadings[0];

    if (priorReading?.presenceStatus === input.presenceStatus) {
      stableSince = priorReading.reportedAt;
    } else if (stableSince.getTime() > thresholdStart.getTime()) {
      return null;
    }

    const stableForSeconds = Math.floor(
      (input.reportedAt.getTime() - stableSince.getTime()) / 1000
    );

    if (stableForSeconds < thresholdSeconds) {
      return null;
    }

    return {
      presenceStatus: input.presenceStatus,
      stableSince,
      stableForSeconds,
      thresholdSeconds
    };
  }

  private getThresholdSeconds(presenceStatus: PresenceStatus): number {
    if (presenceStatus === PresenceStatus.PRESENT) {
      return getConfigNumber(this.configService, 'PRESENCE_PRESENT_STABLE_SECONDS');
    }

    if (presenceStatus === PresenceStatus.ABSENT) {
      return getConfigNumber(this.configService, 'PRESENCE_ABSENT_STABLE_SECONDS');
    }

    return getConfigNumber(this.configService, 'PRESENCE_UNTRUSTED_STABLE_SECONDS');
  }
}
