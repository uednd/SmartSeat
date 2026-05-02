import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../common/database/prisma.service.js';

@Injectable()
export class ReservationRepository {
  constructor(private readonly prisma: PrismaService) {}

  findStudyRecordsForUser(userId: string) {
    return this.prisma.studyRecord.findMany({
      where: {
        userId,
        validFlag: true
      },
      include: {
        reservation: true,
        seat: true
      },
      orderBy: {
        startTime: 'desc'
      }
    });
  }

  countHistoricalCheckIns() {
    return this.prisma.checkInRecord.count();
  }
}
