import { PrismaPg } from '@prisma/adapter-pg';
import {
  AdminActionType,
  AnomalyStatus,
  AnomalyType,
  AuthMode,
  AuthProvider,
  DeviceOnlineStatus,
  PresenceStatus,
  PrismaClient,
  QRTokenStatus,
  ReservationStatus,
  SeatAvailability,
  SeatStatus,
  SensorHealthStatus,
  StudyRecordSource,
  UserRole
} from '@prisma/client';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required to run the API database seed.');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl })
});

const demoIds = {
  admin: 'user_demo_admin_001',
  student: 'user_demo_student_001',
  studentTwo: 'user_demo_student_002',
  studentThree: 'user_demo_student_003',
  seats: Array.from({ length: 8 }, (_, i) => `seat_demo_${String(i + 1).padStart(3, '0')}`),
  devices: Array.from({ length: 8 }, (_, i) => `device_demo_esp32p4_${String(i + 1).padStart(3, '0')}`),
  bindings: Array.from({ length: 8 }, (_, i) => `binding_demo_${String(i + 1).padStart(3, '0')}`)
} as const;

const SEAT_AREAS = ['一楼 A 区', '一楼 B 区', '二楼 自习区'] as const;
const SEAT_NOS = ['A-101', 'A-102', 'A-103', 'B-201', 'B-202', 'C-301', 'C-302', 'C-303'] as const;

const date = (value: string): Date => new Date(value);

const leaderboardUsers = [
  {
    userId: demoIds.student,
    anonymousName: '匿名用户 08',
    externalUserNo: 'demo-student-001',
    openid: 'placeholder-openid-demo-student-001'
  },
  {
    userId: demoIds.studentTwo,
    anonymousName: '匿名用户 16',
    externalUserNo: 'demo-student-002',
    openid: 'placeholder-openid-demo-student-002'
  },
  {
    userId: demoIds.studentThree,
    anonymousName: '匿名用户 23',
    externalUserNo: 'demo-student-003',
    openid: 'placeholder-openid-demo-student-003'
  }
] as const;

const historicalStudySeeds = [
  {
    userId: demoIds.student,
    reservationId: 'reservation_demo_finished_001',
    tokenId: 'qr_token_demo_used_001',
    checkInId: 'checkin_demo_001',
    studyRecordId: 'study_record_demo_001',
    token: 'demo-used-token-001',
    startTime: date('2026-04-27T01:00:00.000Z'),
    endTime: date('2026-04-27T03:15:00.000Z'),
    durationMinutes: 135
  },
  {
    userId: demoIds.studentTwo,
    reservationId: 'reservation_demo_finished_002',
    tokenId: 'qr_token_demo_used_002',
    checkInId: 'checkin_demo_002',
    studyRecordId: 'study_record_demo_002',
    token: 'demo-used-token-002',
    startTime: date('2026-04-28T02:00:00.000Z'),
    endTime: date('2026-04-28T04:45:00.000Z'),
    durationMinutes: 165
  },
  {
    userId: demoIds.studentThree,
    reservationId: 'reservation_demo_finished_003',
    tokenId: 'qr_token_demo_used_003',
    checkInId: 'checkin_demo_003',
    studyRecordId: 'study_record_demo_003',
    token: 'demo-used-token-003',
    startTime: date('2026-04-29T00:30:00.000Z'),
    endTime: date('2026-04-29T02:00:00.000Z'),
    durationMinutes: 90
  },
  {
    userId: demoIds.student,
    reservationId: 'reservation_demo_finished_004',
    tokenId: 'qr_token_demo_used_004',
    checkInId: 'checkin_demo_004',
    studyRecordId: 'study_record_demo_004',
    token: 'demo-used-token-004',
    startTime: date('2026-04-30T05:00:00.000Z'),
    endTime: date('2026-04-30T06:40:00.000Z'),
    durationMinutes: 100
  }
] as const;

async function seedUsers(): Promise<void> {
  await prisma.user.upsert({
    where: { userId: demoIds.admin },
    update: {
      authProvider: AuthProvider.OIDC,
      oidcSub: 'placeholder-oidc-sub-demo-admin-001',
      externalUserNo: 'demo-admin-001',
      roles: [UserRole.ADMIN],
      anonymousName: '演示管理员',
      displayName: '演示管理员',
      avatarUrl: null,
      leaderboardEnabled: false
    },
    create: {
      userId: demoIds.admin,
      authProvider: AuthProvider.OIDC,
      oidcSub: 'placeholder-oidc-sub-demo-admin-001',
      externalUserNo: 'demo-admin-001',
      roles: [UserRole.ADMIN],
      anonymousName: '演示管理员',
      displayName: '演示管理员',
      avatarUrl: null,
      leaderboardEnabled: false
    }
  });

  for (const user of leaderboardUsers) {
    await prisma.user.upsert({
      where: { userId: user.userId },
      update: {
        authProvider: AuthProvider.WECHAT,
        openid: user.openid,
        externalUserNo: user.externalUserNo,
        roles: [UserRole.STUDENT],
        anonymousName: user.anonymousName,
        displayName: null,
        avatarUrl: null,
        leaderboardEnabled: true
      },
      create: {
        userId: user.userId,
        authProvider: AuthProvider.WECHAT,
        openid: user.openid,
        externalUserNo: user.externalUserNo,
        roles: [UserRole.STUDENT],
        anonymousName: user.anonymousName,
        displayName: null,
        avatarUrl: null,
        leaderboardEnabled: true
      }
    });
  }
}

async function seedAuthConfig(): Promise<void> {
  await prisma.authConfig.upsert({
    where: { configId: 'auth_config_default' },
    update: {
      authMode: AuthMode.LOCAL,
      oidcIssuer: 'https://placeholder-idp.example.test',
      oidcClientId: 'placeholder-oidc-client-id',
      oidcClientSecret: null,
      oidcRedirectUri: 'https://placeholder-api.example.test/auth/oidc/callback',
      adminMappingRule: 'placeholder-admin-group',
      wechatAppid: 'placeholder-wechat-appid',
      wechatSecret: null,
      updatedById: demoIds.admin
    },
    create: {
      configId: 'auth_config_default',
      authMode: AuthMode.LOCAL,
      oidcIssuer: 'https://placeholder-idp.example.test',
      oidcClientId: 'placeholder-oidc-client-id',
      oidcClientSecret: null,
      oidcRedirectUri: 'https://placeholder-api.example.test/auth/oidc/callback',
      adminMappingRule: 'placeholder-admin-group',
      wechatAppid: 'placeholder-wechat-appid',
      wechatSecret: null,
      updatedById: demoIds.admin
    }
  });
}

async function seedSeatAndDevice(): Promise<void> {
  for (let i = 0; i < 8; i++) {
    const seatId = demoIds.seats[i];
    const deviceId = demoIds.devices[i];
    const bindingId = demoIds.bindings[i];
    const seatNo = SEAT_NOS[i];
    const area = SEAT_AREAS[i < 3 ? 0 : i < 5 ? 1 : 2];
    const mqttClientId = `smartseat-demo-esp32p4-${String(i + 1).padStart(3, '0')}`;

    await prisma.seat.upsert({
      where: { seatId },
      update: {
        seatNo,
        area,
        businessStatus: SeatStatus.FREE,
        availabilityStatus: SeatAvailability.AVAILABLE,
        unavailableReason: null,
        deviceId,
        presenceStatus: PresenceStatus.ABSENT,
        maintenance: false
      },
      create: {
        seatId,
        seatNo,
        area,
        businessStatus: SeatStatus.FREE,
        availabilityStatus: SeatAvailability.AVAILABLE,
        deviceId,
        presenceStatus: PresenceStatus.ABSENT,
        maintenance: false
      }
    });

    await prisma.device.upsert({
      where: { deviceId },
      update: {
        seatId,
        mqttClientId,
        onlineStatus: DeviceOnlineStatus.ONLINE,
        lastHeartbeatAt: date('2026-05-07T00:00:00.000Z'),
        sensorStatus: SensorHealthStatus.OK,
        sensorModel: 'placeholder-mmwave-adapter',
        firmwareVersion: 'demo-firmware-0.2.0',
        hardwareVersion: 'esp32-p4-demo',
        networkStatus: 'demo-seed-online'
      },
      create: {
        deviceId,
        seatId,
        mqttClientId,
        onlineStatus: DeviceOnlineStatus.ONLINE,
        lastHeartbeatAt: date('2026-05-07T00:00:00.000Z'),
        sensorStatus: SensorHealthStatus.OK,
        sensorModel: 'placeholder-mmwave-adapter',
        firmwareVersion: 'demo-firmware-0.2.0',
        hardwareVersion: 'esp32-p4-demo',
        networkStatus: 'demo-seed-online'
      }
    });

    await prisma.deviceSeatBinding.upsert({
      where: { bindingId },
      update: {
        deviceId,
        seatId,
        boundAt: date('2026-05-07T00:00:00.000Z'),
        unboundAt: null,
        reason: 'API-DB-01 demo seed binding'
      },
      create: {
        bindingId,
        deviceId,
        seatId,
        boundAt: date('2026-05-07T00:00:00.000Z'),
        reason: 'API-DB-01 demo seed binding'
      }
    });
  }
}

async function seedHistoricalUsage(): Promise<void> {
  for (const item of historicalStudySeeds) {
    await prisma.reservation.upsert({
      where: { reservationId: item.reservationId },
      update: {
        userId: item.userId,
        seatId: demoIds.seats[0],
        startTime: item.startTime,
        endTime: item.endTime,
        checkinStartTime: new Date(item.startTime.getTime() - 5 * 60 * 1000),
        checkinDeadline: new Date(item.startTime.getTime() + 15 * 60 * 1000),
        status: ReservationStatus.FINISHED,
        checkedInAt: item.startTime,
        releasedAt: item.endTime,
        releaseReason: 'demo finished usage'
      },
      create: {
        reservationId: item.reservationId,
        userId: item.userId,
        seatId: demoIds.seats[0],
        startTime: item.startTime,
        endTime: item.endTime,
        checkinStartTime: new Date(item.startTime.getTime() - 5 * 60 * 1000),
        checkinDeadline: new Date(item.startTime.getTime() + 15 * 60 * 1000),
        status: ReservationStatus.FINISHED,
        checkedInAt: item.startTime,
        releasedAt: item.endTime,
        releaseReason: 'demo finished usage'
      }
    });

    await prisma.qRToken.upsert({
      where: { tokenId: item.tokenId },
      update: {
        token: item.token,
        reservationId: item.reservationId,
        seatId: demoIds.seats[0],
        deviceId: demoIds.devices[0],
        generatedAt: new Date(item.startTime.getTime() - 3 * 60 * 1000),
        expiredAt: new Date(item.startTime.getTime() + 10 * 60 * 1000),
        usedAt: item.startTime,
        status: QRTokenStatus.USED
      },
      create: {
        tokenId: item.tokenId,
        token: item.token,
        reservationId: item.reservationId,
        seatId: demoIds.seats[0],
        deviceId: demoIds.devices[0],
        generatedAt: new Date(item.startTime.getTime() - 3 * 60 * 1000),
        expiredAt: new Date(item.startTime.getTime() + 10 * 60 * 1000),
        usedAt: item.startTime,
        status: QRTokenStatus.USED
      }
    });

    await prisma.checkInRecord.upsert({
      where: { checkInId: item.checkInId },
      update: {
        reservationId: item.reservationId,
        userId: item.userId,
        seatId: demoIds.seats[0],
        deviceId: demoIds.devices[0],
        qrTokenId: item.tokenId,
        checkedInAt: item.startTime,
        presenceStatus: PresenceStatus.PRESENT,
        source: 'qr_token'
      },
      create: {
        checkInId: item.checkInId,
        reservationId: item.reservationId,
        userId: item.userId,
        seatId: demoIds.seats[0],
        deviceId: demoIds.devices[0],
        qrTokenId: item.tokenId,
        checkedInAt: item.startTime,
        presenceStatus: PresenceStatus.PRESENT,
        source: 'qr_token'
      }
    });

    await prisma.studyRecord.upsert({
      where: { recordId: item.studyRecordId },
      update: {
        userId: item.userId,
        reservationId: item.reservationId,
        seatId: demoIds.seats[0],
        startTime: item.startTime,
        endTime: item.endTime,
        durationMinutes: item.durationMinutes,
        source: StudyRecordSource.TIME_FINISHED,
        validFlag: true,
        invalidReason: null
      },
      create: {
        recordId: item.studyRecordId,
        userId: item.userId,
        reservationId: item.reservationId,
        seatId: demoIds.seats[0],
        startTime: item.startTime,
        endTime: item.endTime,
        durationMinutes: item.durationMinutes,
        source: StudyRecordSource.TIME_FINISHED,
        validFlag: true
      }
    });
  }
}

async function seedOperationalRecords(): Promise<void> {
  await prisma.sensorReading.upsert({
    where: { readingId: 'sensor_reading_demo_001' },
    update: {
      deviceId: demoIds.devices[0],
      seatId: demoIds.seats[0],
      presenceStatus: PresenceStatus.ABSENT,
      sensorStatus: SensorHealthStatus.OK,
      rawValue: { source: 'demo-seed', value: 'absent' },
      reportedAt: date('2026-05-02T06:59:00.000Z')
    },
    create: {
      readingId: 'sensor_reading_demo_001',
      deviceId: demoIds.devices[0],
      seatId: demoIds.seats[0],
      presenceStatus: PresenceStatus.ABSENT,
      sensorStatus: SensorHealthStatus.OK,
      rawValue: { source: 'demo-seed', value: 'absent' },
      reportedAt: date('2026-05-02T06:59:00.000Z')
    }
  });

  await prisma.anomalyEvent.upsert({
    where: { eventId: 'anomaly_demo_handled_001' },
    update: {
      eventType: AnomalyType.CHECKIN_FAILED,
      seatId: demoIds.seats[0],
      userId: demoIds.student,
      deviceId: demoIds.devices[0],
      reservationId: null,
      description: 'Demo handled anomaly record for API-DB-01 schema verification.',
      status: AnomalyStatus.HANDLED,
      handledById: demoIds.admin,
      handledAt: date('2026-05-02T06:45:00.000Z'),
      handleNote: 'Seed verification record.'
    },
    create: {
      eventId: 'anomaly_demo_handled_001',
      eventType: AnomalyType.CHECKIN_FAILED,
      seatId: demoIds.seats[0],
      userId: demoIds.student,
      deviceId: demoIds.devices[0],
      description: 'Demo handled anomaly record for API-DB-01 schema verification.',
      status: AnomalyStatus.HANDLED,
      handledById: demoIds.admin,
      handledAt: date('2026-05-02T06:45:00.000Z'),
      handleNote: 'Seed verification record.'
    }
  });

  await prisma.maintenanceRecord.upsert({
    where: { maintenanceId: 'maintenance_demo_closed_001' },
    update: {
      seatId: demoIds.seats[0],
      startedById: demoIds.admin,
      endedById: demoIds.admin,
      reason: 'demo maintenance verification',
      detail: { source: 'API-DB-01 seed' },
      startedAt: date('2026-05-02T05:00:00.000Z'),
      endedAt: date('2026-05-02T05:15:00.000Z')
    },
    create: {
      maintenanceId: 'maintenance_demo_closed_001',
      seatId: demoIds.seats[0],
      startedById: demoIds.admin,
      endedById: demoIds.admin,
      reason: 'demo maintenance verification',
      detail: { source: 'API-DB-01 seed' },
      startedAt: date('2026-05-02T05:00:00.000Z'),
      endedAt: date('2026-05-02T05:15:00.000Z')
    }
  });

  await prisma.adminActionLog.upsert({
    where: { logId: 'admin_action_demo_001' },
    update: {
      adminId: demoIds.admin,
      actionType: AdminActionType.RESTORE_AVAILABLE,
      targetType: 'seat',
      targetId: demoIds.seats[0],
      reason: 'demo seed baseline',
      detail: { maintenance_record_id: 'maintenance_demo_closed_001' },
      createdAt: date('2026-05-02T05:15:00.000Z')
    },
    create: {
      logId: 'admin_action_demo_001',
      adminId: demoIds.admin,
      actionType: AdminActionType.RESTORE_AVAILABLE,
      targetType: 'seat',
      targetId: demoIds.seats[0],
      reason: 'demo seed baseline',
      detail: { maintenance_record_id: 'maintenance_demo_closed_001' },
      createdAt: date('2026-05-02T05:15:00.000Z')
    }
  });
}

async function main(): Promise<void> {
  await seedUsers();
  await seedAuthConfig();
  await seedSeatAndDevice();
  await seedHistoricalUsage();
  await seedOperationalRecords();

  const [userCount, seatCount, deviceCount, studyRecordCount] = await Promise.all([
    prisma.user.count(),
    prisma.seat.count(),
    prisma.device.count(),
    prisma.studyRecord.count()
  ]);

  console.log(
    `API-DB-01 seed complete: users=${userCount}, seats=${seatCount}, devices=${deviceCount}, study_records=${studyRecordCount}`
  );
}

await main()
  .catch((error: unknown) => {
    console.error('API-DB-01 seed failed.');
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
