import { type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { AuthMode, AuthProvider } from '@prisma/client';
import { ApiErrorCode, UserRole } from '@smartseat/contracts';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../app.module.js';
import { setupApiPlatform } from '../app.setup.js';
import { PrismaService } from '../common/database/prisma.service.js';
import { TokenService } from '../modules/auth/token.service.js';
import { UsersService } from '../modules/users/users.service.js';

interface FakeUser {
  userId: string;
  authProvider: AuthProvider;
  openid: string | null;
  unionid: string | null;
  oidcSub: string | null;
  externalUserNo: string | null;
  roles: UserRole[];
  anonymousName: string;
  leaderboardEnabled: boolean;
  noShowCountWeek: number;
  noShowCountMonth: number;
  createdAt: Date;
  updatedAt: Date;
}

interface FakeAuthConfig {
  configId: string;
  authMode: AuthMode;
  oidcIssuer: string | null;
  oidcClientId: string | null;
  oidcClientSecret: string | null;
  oidcRedirectUri: string | null;
  adminMappingRule: string | null;
  wechatAppid: string | null;
  wechatSecret: string | null;
  updatedById: string | null;
  updatedAt: Date;
}

interface FakeAdminActionLog {
  adminId: string;
  actionType: string;
  targetType: string;
  targetId: string;
  reason?: string;
  detail?: unknown;
}

class FakePrismaService {
  users: FakeUser[] = [];
  authConfigs: FakeAuthConfig[] = [];
  adminActionLogs: FakeAdminActionLog[] = [];
  private userSequence = 0;

  user = {
    findUnique: async ({ where }: { where: { userId: string } }) =>
      this.users.find((user) => user.userId === where.userId) ?? null,
    findFirst: async ({ where }: { where: { OR: Array<Partial<FakeUser>> } }) =>
      this.users.find((user) =>
        where.OR.some((condition) =>
          Object.entries(condition).every(([key, value]) => user[key as keyof FakeUser] === value)
        )
      ) ?? null,
    count: async () => this.users.length,
    create: async ({ data }: { data: Partial<FakeUser> }) => {
      this.userSequence += 1;
      const now = new Date('2026-05-02T08:00:00.000Z');
      const user: FakeUser = {
        userId: data.userId ?? `user_test_${this.userSequence}`,
        authProvider: data.authProvider ?? AuthProvider.WECHAT,
        openid: data.openid ?? null,
        unionid: data.unionid ?? null,
        oidcSub: data.oidcSub ?? null,
        externalUserNo: data.externalUserNo ?? null,
        roles: data.roles ?? [UserRole.STUDENT],
        anonymousName: data.anonymousName ?? `匿名用户 ${this.userSequence}`,
        leaderboardEnabled: data.leaderboardEnabled ?? true,
        noShowCountWeek: data.noShowCountWeek ?? 0,
        noShowCountMonth: data.noShowCountMonth ?? 0,
        createdAt: data.createdAt ?? now,
        updatedAt: data.updatedAt ?? now
      };
      this.users.push(user);
      return user;
    }
  };

  authConfig = {
    findUnique: async ({ where }: { where: { configId: string } }) =>
      this.authConfigs.find((config) => config.configId === where.configId) ?? null,
    create: async ({ data }: { data: Partial<FakeAuthConfig> }) => {
      const config = this.createAuthConfig(data);
      this.authConfigs.push(config);
      return config;
    },
    update: async ({
      where,
      data
    }: {
      where: { configId: string };
      data: Record<string, unknown>;
    }) => {
      const existing = this.authConfigs.find((config) => config.configId === where.configId);

      if (existing === undefined) {
        throw new Error('Missing fake auth config.');
      }

      const updatedBy = data.updatedBy as { connect?: { userId?: string } } | undefined;

      Object.assign(existing, {
        authMode: data.authMode ?? existing.authMode,
        oidcIssuer: this.valueOrExisting(data, 'oidcIssuer', existing.oidcIssuer),
        oidcClientId: this.valueOrExisting(data, 'oidcClientId', existing.oidcClientId),
        oidcClientSecret: this.valueOrExisting(data, 'oidcClientSecret', existing.oidcClientSecret),
        oidcRedirectUri: this.valueOrExisting(data, 'oidcRedirectUri', existing.oidcRedirectUri),
        adminMappingRule: this.valueOrExisting(data, 'adminMappingRule', existing.adminMappingRule),
        wechatAppid: this.valueOrExisting(data, 'wechatAppid', existing.wechatAppid),
        wechatSecret: this.valueOrExisting(data, 'wechatSecret', existing.wechatSecret),
        updatedById: updatedBy?.connect?.userId ?? existing.updatedById,
        updatedAt: new Date('2026-05-02T08:10:00.000Z')
      });

      return existing;
    }
  };

  adminActionLog = {
    create: async ({ data }: { data: FakeAdminActionLog }) => {
      this.adminActionLogs.push(data);
      return {
        logId: `log_${this.adminActionLogs.length}`,
        createdAt: new Date('2026-05-02T08:20:00.000Z'),
        ...data
      };
    }
  };

  async $transaction<T>(callback: (tx: this) => Promise<T>): Promise<T> {
    return await callback(this);
  }

  async $disconnect(): Promise<void> {}

  async checkConnection(): Promise<boolean> {
    return true;
  }

  createAuthConfig(data: Partial<FakeAuthConfig> = {}): FakeAuthConfig {
    return {
      configId: data.configId ?? 'auth_config_default',
      authMode: data.authMode ?? AuthMode.WECHAT,
      oidcIssuer: data.oidcIssuer ?? null,
      oidcClientId: data.oidcClientId ?? null,
      oidcClientSecret: data.oidcClientSecret ?? null,
      oidcRedirectUri: data.oidcRedirectUri ?? null,
      adminMappingRule: data.adminMappingRule ?? null,
      wechatAppid: data.wechatAppid ?? null,
      wechatSecret: data.wechatSecret ?? null,
      updatedById: data.updatedById ?? null,
      updatedAt: data.updatedAt ?? new Date('2026-05-02T08:00:00.000Z')
    };
  }

  seedUser(data: Partial<FakeUser> = {}): FakeUser {
    const user: FakeUser = {
      userId: data.userId ?? `user_seed_${this.users.length + 1}`,
      authProvider: data.authProvider ?? AuthProvider.WECHAT,
      openid: data.openid ?? null,
      unionid: data.unionid ?? null,
      oidcSub: data.oidcSub ?? null,
      externalUserNo: data.externalUserNo ?? null,
      roles: data.roles ?? [UserRole.STUDENT],
      anonymousName: data.anonymousName ?? '匿名用户 01',
      leaderboardEnabled: data.leaderboardEnabled ?? true,
      noShowCountWeek: data.noShowCountWeek ?? 0,
      noShowCountMonth: data.noShowCountMonth ?? 0,
      createdAt: data.createdAt ?? new Date('2026-05-02T08:00:00.000Z'),
      updatedAt: data.updatedAt ?? new Date('2026-05-02T08:00:00.000Z')
    };

    this.users.push(user);
    return user;
  }

  private valueOrExisting(
    data: Record<string, unknown>,
    key: string,
    existing: string | null
  ): string | null {
    return Object.prototype.hasOwnProperty.call(data, key)
      ? (data[key] as string | null)
      : existing;
  }
}

describe('API-AUTH-01 auth and users module', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let prisma: FakePrismaService;
  let tokenService: TokenService;
  let usersService: UsersService;

  beforeEach(async () => {
    prisma = new FakePrismaService();

    moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    app = moduleRef.createNestApplication();
    setupApiPlatform(app);
    await app.init();

    tokenService = moduleRef.get(TokenService);
    usersService = moduleRef.get(UsersService);
  });

  afterEach(async () => {
    await app.close();
    await moduleRef.close();
  });

  it('returns default login mode and masked auth config', async () => {
    const response = await request(app.getHttpServer()).get('/auth/mode').expect(200);

    expect(response.body).toMatchObject({
      auth_mode: AuthMode.WECHAT,
      config: {
        auth_mode: AuthMode.WECHAT,
        oidc_secret_configured: false,
        wechat_secret_configured: false
      }
    });
    expect(JSON.stringify(response.body)).not.toContain('oidc-secret-plain');
    expect(JSON.stringify(response.body)).not.toContain('wechat-secret-plain');
    expect(prisma.authConfigs).toHaveLength(1);
  });

  it('rejects login mode updates from student users', async () => {
    const student = prisma.seedUser({
      userId: 'user_student',
      roles: [UserRole.STUDENT]
    });
    const { token } = await tokenService.signUserToken({
      user_id: student.userId,
      roles: student.roles
    });

    const response = await request(app.getHttpServer())
      .put('/admin/auth/mode')
      .set('Authorization', `Bearer ${token}`)
      .send({ auth_mode: AuthMode.OIDC })
      .expect(403);

    expect(response.body).toMatchObject({
      code: ApiErrorCode.FORBIDDEN
    });
  });

  it('allows admins to update login mode without returning or logging secrets', async () => {
    const admin = prisma.seedUser({
      userId: 'user_admin',
      roles: [UserRole.ADMIN],
      anonymousName: '演示管理员'
    });
    const { token } = await tokenService.signUserToken({
      user_id: admin.userId,
      roles: admin.roles
    });

    const response = await request(app.getHttpServer())
      .put('/admin/auth/mode')
      .set('Authorization', `Bearer ${token}`)
      .send({
        auth_mode: AuthMode.OIDC,
        oidc_client_secret: 'oidc-secret-plain',
        wechat_secret: 'wechat-secret-plain',
        oidc_client_id: 'smartseat-oidc-client'
      })
      .expect(200);

    expect(response.body).toMatchObject({
      auth_mode: AuthMode.OIDC,
      oidc_client_id: 'smartseat-oidc-client',
      oidc_secret_configured: true,
      wechat_secret_configured: true,
      updated_by: admin.userId
    });
    expect(JSON.stringify(response.body)).not.toContain('oidc-secret-plain');
    expect(JSON.stringify(response.body)).not.toContain('wechat-secret-plain');
    expect(JSON.stringify(prisma.adminActionLogs)).not.toContain('oidc-secret-plain');
    expect(JSON.stringify(prisma.adminActionLogs)).not.toContain('wechat-secret-plain');
  });

  it('initializes the first user as admin only once', async () => {
    const first = await usersService.initializeUserFromIdentity({
      userId: 'user_first',
      authProvider: AuthProvider.WECHAT,
      openid: 'openid-first'
    });
    const second = await usersService.initializeUserFromIdentity({
      userId: 'user_second',
      authProvider: AuthProvider.WECHAT,
      openid: 'openid-second'
    });

    expect(first.roles).toEqual([UserRole.ADMIN]);
    expect(second.roles).toEqual([UserRole.STUDENT]);
  });

  it('returns route-ready current user information from /me', async () => {
    const admin = prisma.seedUser({
      userId: 'user_admin_me',
      roles: [UserRole.ADMIN],
      anonymousName: '演示管理员'
    });
    const { token } = await tokenService.signUserToken({
      user_id: admin.userId,
      roles: admin.roles
    });

    const response = await request(app.getHttpServer())
      .get('/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body).toMatchObject({
      user_id: admin.userId,
      role: UserRole.ADMIN,
      roles: [UserRole.ADMIN],
      display_name: '演示管理员',
      anonymous_name: '演示管理员',
      auth_mode: AuthMode.WECHAT,
      next_route: 'admin',
      user: {
        user_id: admin.userId,
        roles: [UserRole.ADMIN],
        anonymous_name: '演示管理员'
      }
    });
  });

  it('rejects expired and malformed bearer tokens', async () => {
    const student = prisma.seedUser({
      userId: 'user_expired',
      roles: [UserRole.STUDENT]
    });
    const { token } = await tokenService.signUserToken(
      {
        user_id: student.userId,
        roles: student.roles
      },
      {
        ttlSeconds: -60
      }
    );

    const expiredResponse = await request(app.getHttpServer())
      .get('/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
    const malformedResponse = await request(app.getHttpServer())
      .get('/me')
      .set('Authorization', 'Bearer not-a-token')
      .expect(401);

    expect(expiredResponse.body).toMatchObject({
      code: ApiErrorCode.AUTH_INVALID_TOKEN
    });
    expect(malformedResponse.body).toMatchObject({
      code: ApiErrorCode.AUTH_INVALID_TOKEN
    });
  });
});
