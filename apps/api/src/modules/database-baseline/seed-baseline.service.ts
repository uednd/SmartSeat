import { Injectable } from '@nestjs/common';
import { UserRole } from '@prisma/client';

import { PrismaService } from '../../common/database/prisma.service.js';
import { ReservationRepository } from './reservation.repository.js';
import { SeatDeviceRepository } from './seat-device.repository.js';
import { UserRepository } from './user.repository.js';

export interface SeedBaselineSnapshot {
  studentCount: number;
  adminCount: number;
  seatCount: number;
  deviceCount: number;
  activeBindingCount: number;
  historicalCheckInCount: number;
  studyRecordCount: number;
}

@Injectable()
export class SeedBaselineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UserRepository,
    private readonly seatsAndDevices: SeatDeviceRepository,
    private readonly reservations: ReservationRepository
  ) {}

  async getSnapshot(): Promise<SeedBaselineSnapshot> {
    const [
      studentCount,
      adminCount,
      seatCount,
      deviceCount,
      activeBindingCount,
      historicalCheckInCount,
      studyRecordCount
    ] = await Promise.all([
      this.users.countByRole(UserRole.STUDENT),
      this.users.countByRole(UserRole.ADMIN),
      this.prisma.seat.count(),
      this.prisma.device.count(),
      this.prisma.deviceSeatBinding.count({ where: { unboundAt: null } }),
      this.reservations.countHistoricalCheckIns(),
      this.prisma.studyRecord.count({ where: { validFlag: true } })
    ]);

    return {
      studentCount,
      adminCount,
      seatCount,
      deviceCount,
      activeBindingCount,
      historicalCheckInCount,
      studyRecordCount
    };
  }

  findDemoSeat() {
    return this.seatsAndDevices.findSeatWithActiveBinding('seat_demo_001');
  }

  findDemoStudentStudyRecords() {
    return this.reservations.findStudyRecordsForUser('user_demo_student_001');
  }
}
