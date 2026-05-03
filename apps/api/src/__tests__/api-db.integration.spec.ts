import { type TestingModule, Test } from '@nestjs/testing';
import { ReservationStatus, SeatAvailability, SeatStatus, UserRole } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ApiConfigModule } from '../common/config/api-config.module.js';
import { PrismaService } from '../common/database/prisma.service.js';
import { DatabaseBaselineModule } from '../modules/database-baseline/database-baseline.module.js';
import { SeedBaselineService } from '../modules/database-baseline/seed-baseline.service.js';

const describeDatabase = process.env.RUN_DATABASE_TESTS === '1' ? describe : describe.skip;

const expectPrismaErrorCode = async (
  promise: Promise<unknown>,
  code: string,
  originalCode?: string
): Promise<void> => {
  try {
    await promise;
  } catch (error) {
    const candidate = error as {
      code?: string;
      cause?: {
        originalCode?: string;
      };
    };

    expect([code, originalCode].filter(Boolean)).toContain(
      candidate.code ?? candidate.cause?.originalCode
    );
    return;
  }

  throw new Error(`Expected Prisma error ${code}.`);
};

describeDatabase('API-DB-01 database baseline', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let seedBaseline: SeedBaselineService;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [ApiConfigModule, DatabaseBaselineModule]
    }).compile();

    prisma = moduleRef.get(PrismaService);
    seedBaseline = moduleRef.get(SeedBaselineService);

    await prisma.checkConnection();
    await cleanupOverlapTestData(prisma);
  });

  afterAll(async () => {
    await cleanupOverlapTestData(prisma);
    await moduleRef.close();
  });

  it('reads the seeded one-terminal demo baseline through repositories', async () => {
    const snapshot = await seedBaseline.getSnapshot();
    const demoSeat = await seedBaseline.findDemoSeat();
    const demoStudentRecords = await seedBaseline.findDemoStudentStudyRecords();

    expect(snapshot).toMatchObject({
      studentCount: 3,
      adminCount: 1,
      seatCount: 1,
      deviceCount: 1,
      activeBindingCount: 1,
      historicalCheckInCount: 4,
      studyRecordCount: 4
    });
    expect(demoSeat).toMatchObject({
      seatId: 'seat_demo_001',
      seatNo: 'DEMO-A-001',
      businessStatus: SeatStatus.FREE,
      availabilityStatus: SeatAvailability.AVAILABLE,
      bindings: [
        {
          deviceId: 'device_demo_esp32p4_001'
        }
      ]
    });
    expect(demoStudentRecords).toHaveLength(2);
  });

  it('enforces unique seat, mqtt client, external identity, and active binding constraints', async () => {
    await expectPrismaErrorCode(
      prisma.seat.create({
        data: {
          seatId: 'seat_duplicate_test',
          seatNo: 'DEMO-A-001',
          area: 'constraint-test'
        }
      }),
      'P2002'
    );

    await expectPrismaErrorCode(
      prisma.device.create({
        data: {
          deviceId: 'device_duplicate_mqtt_test',
          mqttClientId: 'smartseat-demo-esp32p4-001'
        }
      }),
      'P2002'
    );

    await expectPrismaErrorCode(
      prisma.user.create({
        data: {
          userId: 'user_duplicate_external_test',
          authProvider: 'WECHAT',
          openid: 'placeholder-openid-duplicate-test',
          externalUserNo: 'demo-student-001',
          roles: [UserRole.STUDENT],
          anonymousName: '匿名测试用户'
        }
      }),
      'P2002'
    );

    await prisma.device.upsert({
      where: { deviceId: 'device_active_binding_test' },
      update: {
        mqttClientId: 'smartseat-active-binding-test'
      },
      create: {
        deviceId: 'device_active_binding_test',
        mqttClientId: 'smartseat-active-binding-test'
      }
    });

    await expectPrismaErrorCode(
      prisma.deviceSeatBinding.create({
        data: {
          bindingId: 'binding_active_duplicate_test',
          deviceId: 'device_active_binding_test',
          seatId: 'seat_demo_001'
        }
      }),
      'P2002'
    );

    await prisma.device.delete({
      where: { deviceId: 'device_active_binding_test' }
    });
  });

  it('enforces foreign keys on reservation and reading tables', async () => {
    await expectPrismaErrorCode(
      prisma.reservation.create({
        data: {
          reservationId: 'reservation_missing_fk_test',
          userId: 'missing-user',
          seatId: 'seat_demo_001',
          startTime: new Date('2026-05-02T08:00:00.000Z'),
          endTime: new Date('2026-05-02T09:00:00.000Z'),
          checkinStartTime: new Date('2026-05-02T07:55:00.000Z'),
          checkinDeadline: new Date('2026-05-02T08:15:00.000Z')
        }
      }),
      'P2003'
    );

    await expectPrismaErrorCode(
      prisma.sensorReading.create({
        data: {
          readingId: 'sensor_missing_fk_test',
          deviceId: 'missing-device',
          seatId: 'seat_demo_001',
          presenceStatus: 'ABSENT',
          reportedAt: new Date('2026-05-02T08:00:00.000Z')
        }
      }),
      'P2003'
    );
  });

  it('enforces effective reservation overlap constraints while allowing released history', async () => {
    await cleanupOverlapTestData(prisma);

    await prisma.user.createMany({
      data: [
        {
          userId: 'user_overlap_test_001',
          authProvider: 'WECHAT',
          openid: 'placeholder-openid-overlap-001',
          roles: [UserRole.STUDENT],
          anonymousName: '匿名重叠测试 1'
        },
        {
          userId: 'user_overlap_test_002',
          authProvider: 'WECHAT',
          openid: 'placeholder-openid-overlap-002',
          roles: [UserRole.STUDENT],
          anonymousName: '匿名重叠测试 2'
        }
      ]
    });
    await prisma.seat.createMany({
      data: [
        {
          seatId: 'seat_overlap_test_001',
          seatNo: 'OVERLAP-001',
          area: 'constraint-test'
        },
        {
          seatId: 'seat_overlap_test_002',
          seatNo: 'OVERLAP-002',
          area: 'constraint-test'
        }
      ]
    });

    const baseReservation = {
      startTime: new Date('2026-05-03T09:00:00.000Z'),
      endTime: new Date('2026-05-03T10:00:00.000Z'),
      checkinStartTime: new Date('2026-05-03T08:55:00.000Z'),
      checkinDeadline: new Date('2026-05-03T09:15:00.000Z')
    };

    await prisma.reservation.create({
      data: {
        reservationId: 'reservation_overlap_test_active',
        userId: 'user_overlap_test_001',
        seatId: 'seat_overlap_test_001',
        ...baseReservation
      }
    });

    await expectPrismaErrorCode(
      prisma.reservation.create({
        data: {
          reservationId: 'reservation_overlap_test_same_seat',
          userId: 'user_overlap_test_002',
          seatId: 'seat_overlap_test_001',
          ...baseReservation
        }
      }),
      'P2004',
      '23P01'
    );

    await expectPrismaErrorCode(
      prisma.reservation.create({
        data: {
          reservationId: 'reservation_overlap_test_same_user',
          userId: 'user_overlap_test_001',
          seatId: 'seat_overlap_test_002',
          ...baseReservation
        }
      }),
      'P2004',
      '23P01'
    );

    await prisma.reservation.create({
      data: {
        reservationId: 'reservation_overlap_test_cancelled',
        userId: 'user_overlap_test_001',
        seatId: 'seat_overlap_test_001',
        status: ReservationStatus.CANCELLED,
        ...baseReservation
      }
    });
    await prisma.reservation.create({
      data: {
        reservationId: 'reservation_overlap_test_no_show',
        userId: 'user_overlap_test_001',
        seatId: 'seat_overlap_test_001',
        status: ReservationStatus.NO_SHOW,
        ...baseReservation
      }
    });
    await cleanupOverlapTestData(prisma);
  });
});

const cleanupOverlapTestData = async (prisma: PrismaService): Promise<void> => {
  await prisma.reservation.deleteMany({
    where: {
      reservationId: {
        startsWith: 'reservation_overlap_test_'
      }
    }
  });
  await prisma.user.deleteMany({
    where: {
      userId: {
        startsWith: 'user_overlap_test_'
      }
    }
  });
  await prisma.seat.deleteMany({
    where: {
      seatId: {
        startsWith: 'seat_overlap_test_'
      }
    }
  });
};
