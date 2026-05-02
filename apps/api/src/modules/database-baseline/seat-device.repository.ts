import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../common/database/prisma.service.js';

@Injectable()
export class SeatDeviceRepository {
  constructor(private readonly prisma: PrismaService) {}

  findSeatWithActiveBinding(seatId: string) {
    return this.prisma.seat.findUnique({
      where: { seatId },
      include: {
        bindings: {
          where: { unboundAt: null },
          include: { device: true }
        }
      }
    });
  }

  findActiveBindingByDevice(deviceId: string) {
    return this.prisma.deviceSeatBinding.findFirst({
      where: {
        deviceId,
        unboundAt: null
      },
      include: {
        seat: true,
        device: true
      }
    });
  }
}
