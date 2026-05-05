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
  displayName: string | null;
  avatarUrl: string | null;
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

interface FakeOidcAuthState {
  stateId: string;
  stateHash: string;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
}

class FakePrismaService {
  users: FakeUser[] = [];
  authConfigs: FakeAuthConfig[] = [];
  adminActionLogs: FakeAdminActionLog[] = [];
  oidcAuthStates: FakeOidcAuthState[] = [];
  private userSequence = 0;
  private oidcStateSequence = 0;

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
        displayName: data.displayName ?? null,
        avatarUrl: data.avatarUrl ?? null,
        leaderboardEnabled: data.leaderboardEnabled ?? true,
        noShowCountWeek: data.noShowCountWeek ?? 0,
        noShowCountMonth: data.noShowCountMonth ?? 0,
        createdAt: data.createdAt ?? now,
        updatedAt: data.updatedAt ?? now
      };
      this.users.push(user);
      return user;
    },
    update: async ({ where, data }: { where: { userId: string }; data: Partial<FakeUser> }) => {
      const existing = this.users.find((user) => user.userId === where.userId);

      if (existing === undefined) {
        throw new Error('Missing fake user.');
      }

      Object.assign(existing, {
        displayName: this.valueOrExisting(data, 'displayName', existing.displayName),
        avatarUrl: this.valueOrExisting(data, 'avatarUrl', existing.avatarUrl),
        leaderboardEnabled:
          data.leaderboardEnabled === undefined
            ? existing.leaderboardEnabled
            : data.leaderboardEnabled,
        updatedAt: new Date('2026-05-02T08:30:00.000Z')
      });

      return existing;
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

  oidcAuthState = {
    create: async ({ data }: { data: Pick<FakeOidcAuthState, 'stateHash' | 'expiresAt'> }) => {
      this.oidcStateSequence += 1;
      const record: FakeOidcAuthState = {
        stateId: `oidc_state_${this.oidcStateSequence}`,
        stateHash: data.stateHash,
        expiresAt: data.expiresAt,
        consumedAt: null,
        createdAt: new Date('2026-05-02T08:05:00.000Z')
      };

      this.oidcAuthStates.push(record);
      return record;
    },
    updateMany: async ({
      where,
      data
    }: {
      where: {
        stateHash: string;
        consumedAt: null;
        expiresAt: {
          gt: Date;
        };
      };
      data: {
        consumedAt: Date;
      };
    }) => {
      const matched = this.oidcAuthStates.filter(
        (record) =>
          record.stateHash === where.stateHash &&
          record.consumedAt === where.consumedAt &&
          record.expiresAt > where.expiresAt.gt
      );

      for (const record of matched) {
        record.consumedAt = data.consumedAt;
      }

      return { count: matched.length };
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
      displayName: data.displayName ?? null,
      avatarUrl: data.avatarUrl ?? null,
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

  const seedOidcAuthConfig = (): void => {
    prisma.authConfigs.push(
      prisma.createAuthConfig({
        authMode: AuthMode.OIDC,
        oidcIssuer: 'https://idp.example.test',
        oidcClientId: 'smartseat-oidc-client',
        oidcClientSecret: 'oidc-client-secret-plain',
        oidcRedirectUri: 'https://api.example.test/auth/oidc/callback'
      })
    );
  };

  const getOidcState = async (): Promise<string> => {
    const response = await request(app.getHttpServer()).get('/auth/oidc/authorize-url').expect(200);
    return response.body.state as string;
  };

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

  it('allows admins to read masked auth config from admin route', async () => {
    prisma.authConfigs.push(
      prisma.createAuthConfig({
        authMode: AuthMode.OIDC,
        oidcIssuer: 'https://idp.example.test',
        oidcClientId: 'smartseat-oidc-client',
        oidcClientSecret: 'oidc-client-secret-plain',
        wechatSecret: 'wechat-secret-plain'
      })
    );
    const admin = prisma.seedUser({
      userId: 'user_admin_read_auth',
      roles: [UserRole.ADMIN]
    });
    const { token } = await tokenService.signUserToken({
      user_id: admin.userId,
      roles: admin.roles
    });

    const response = await request(app.getHttpServer())
      .get('/admin/auth/mode')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body).toMatchObject({
      auth_mode: AuthMode.OIDC,
      oidc_issuer: 'https://idp.example.test',
      oidc_client_id: 'smartseat-oidc-client',
      oidc_secret_configured: true,
      wechat_secret_configured: true
    });
    expect(JSON.stringify(response.body)).not.toContain('oidc-client-secret-plain');
    expect(JSON.stringify(response.body)).not.toContain('wechat-secret-plain');
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

  it('updates current user leaderboard preference from /me', async () => {
    prisma.authConfigs.push(prisma.createAuthConfig({ authMode: AuthMode.WECHAT }));
    const user = prisma.seedUser({
      userId: 'user_preference',
      roles: [UserRole.STUDENT],
      leaderboardEnabled: true
    });
    const { token } = await tokenService.signUserToken({
      user_id: user.userId,
      roles: user.roles
    });

    const response = await request(app.getHttpServer())
      .patch('/me/leaderboard-preference')
      .set('Authorization', `Bearer ${token}`)
      .send({ leaderboard_enabled: false })
      .expect(200);

    expect(response.body).toMatchObject({
      user_id: 'user_preference',
      user: {
        leaderboard_enabled: false
      }
    });
    expect(prisma.users.find((candidate) => candidate.userId === 'user_preference')).toMatchObject({
      leaderboardEnabled: false
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

  it('logs in with mock WeChat provider and applies first-admin bootstrap once', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/wechat/login')
      .send({
        code: 'mock-code-first',
        displayName: '微信测试用户',
        avatarUrl: 'https://avatar.example.test/u.png'
      })
      .expect(200);
    const secondResponse = await request(app.getHttpServer())
      .post('/auth/wechat/login')
      .send({
        code: 'mock-code-second'
      })
      .expect(200);

    expect(response.body).toMatchObject({
      token: expect.any(String),
      token_type: 'Bearer',
      expires_at: expect.any(String),
      role: UserRole.ADMIN,
      roles: [UserRole.ADMIN],
      next_route: 'admin',
      user: {
        auth_provider: AuthProvider.WECHAT,
        roles: [UserRole.ADMIN],
        anonymous_name: '系统管理员',
        display_name: '微信测试用户',
        avatar_url: 'https://avatar.example.test/u.png'
      }
    });
    expect(secondResponse.body).toMatchObject({
      role: UserRole.STUDENT,
      roles: [UserRole.STUDENT],
      next_route: 'student'
    });
    expect(prisma.users).toHaveLength(2);
    expect(prisma.users[0]).toMatchObject({
      openid: 'mock_openid_first',
      unionid: 'mock_unionid_first',
      anonymousName: '系统管理员',
      displayName: '微信测试用户',
      avatarUrl: 'https://avatar.example.test/u.png'
    });
    expect(prisma.users[1]).toMatchObject({
      openid: 'mock_openid_second',
      roles: [UserRole.STUDENT]
    });
    expect(JSON.stringify(response.body)).not.toContain('mock_openid_first');
    expect(JSON.stringify(response.body)).not.toContain('replace-with-placeholder');
  });

  it('returns the same user for an existing WeChat openid and updates profile fields', async () => {
    const first = await request(app.getHttpServer())
      .post('/auth/wechat/login')
      .send({
        code: 'mock-code-repeat',
        displayName: '第一次昵称'
      })
      .expect(200);
    const second = await request(app.getHttpServer())
      .post('/auth/wechat/login')
      .send({
        code: 'mock-code-repeat',
        displayName: '第二次昵称',
        avatarUrl: 'https://avatar.example.test/second.png'
      })
      .expect(200);

    expect(second.body.user.user_id).toBe(first.body.user.user_id);
    expect(second.body.user).toMatchObject({
      display_name: '第二次昵称',
      avatar_url: 'https://avatar.example.test/second.png',
      anonymous_name: '系统管理员'
    });
    expect(prisma.users).toHaveLength(1);
  });

  it('rejects missing WeChat code with validation error', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/wechat/login')
      .send({})
      .expect(400);

    expect(response.body).toMatchObject({
      code: ApiErrorCode.VALIDATION_FAILED
    });
  });

  it('rejects invalid mock WeChat code without leaking identity details', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/wechat/login')
      .send({ code: 'invalid-code' })
      .expect(401);

    expect(response.body).toMatchObject({
      code: ApiErrorCode.AUTH_PROVIDER_FAILED
    });
    expect(JSON.stringify(response.body)).not.toContain('openid');
    expect(JSON.stringify(response.body)).not.toContain('appid');
    expect(JSON.stringify(response.body)).not.toContain('secret');
    expect(JSON.stringify(response.body)).not.toContain('invalid-code');
  });

  it('maps mock WeChat provider outage to provider failure without raw details', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/wechat/login')
      .send({ code: 'mock-code-error' })
      .expect(502);

    expect(response.body).toMatchObject({
      code: ApiErrorCode.AUTH_PROVIDER_FAILED
    });
    expect(JSON.stringify(response.body)).not.toContain('mock-code-error');
  });

  it('rejects WeChat login when the current auth mode is OIDC', async () => {
    prisma.authConfigs.push(
      prisma.createAuthConfig({
        authMode: AuthMode.OIDC
      })
    );

    const response = await request(app.getHttpServer())
      .post('/auth/wechat/login')
      .send({ code: 'mock-code-oidc-mode' })
      .expect(409);

    expect(response.body).toMatchObject({
      code: ApiErrorCode.AUTH_LOGIN_MODE_MISMATCH
    });
    expect(prisma.users).toHaveLength(0);
  });

  it('returns a mock OIDC authorization URL and state without leaking secrets', async () => {
    seedOidcAuthConfig();

    const response = await request(app.getHttpServer()).get('/auth/oidc/authorize-url').expect(200);
    const authorizationUrl = new URL(response.body.authorization_url as string);

    expect(response.body).toMatchObject({
      authorization_url: expect.any(String),
      state: expect.any(String)
    });
    expect(authorizationUrl.origin).toBe('https://idp.example.test');
    expect(authorizationUrl.searchParams.get('client_id')).toBe('smartseat-oidc-client');
    expect(authorizationUrl.searchParams.get('redirect_uri')).toBe(
      'https://api.example.test/auth/oidc/callback'
    );
    expect(authorizationUrl.searchParams.get('response_type')).toBe('code');
    expect(authorizationUrl.searchParams.get('state')).toBe(response.body.state);
    expect(JSON.stringify(response.body)).not.toContain('oidc-client-secret-plain');
    expect(JSON.stringify(response.body)).not.toContain('mock_subject');
    expect(prisma.oidcAuthStates).toHaveLength(1);
    expect(prisma.oidcAuthStates[0]).toMatchObject({
      consumedAt: null
    });
  });

  it('logs in with mock OIDC provider and keeps /me route data consistent', async () => {
    seedOidcAuthConfig();
    const firstState = await getOidcState();
    const firstResponse = await request(app.getHttpServer())
      .post('/auth/oidc/callback')
      .send({
        code: 'mock-oidc-code-first',
        state: firstState
      })
      .expect(200);
    const meResponse = await request(app.getHttpServer())
      .get('/me')
      .set('Authorization', `Bearer ${firstResponse.body.token}`)
      .expect(200);
    const secondState = await getOidcState();
    const secondResponse = await request(app.getHttpServer())
      .post('/auth/oidc/callback')
      .send({
        code: 'mock-oidc-code-second',
        state: secondState
      })
      .expect(200);

    expect(firstResponse.body).toMatchObject({
      token: expect.any(String),
      token_type: 'Bearer',
      expires_at: expect.any(String),
      role: UserRole.ADMIN,
      roles: [UserRole.ADMIN],
      next_route: 'admin',
      user: {
        auth_provider: AuthProvider.OIDC,
        roles: [UserRole.ADMIN],
        anonymous_name: '系统管理员',
        display_name: 'OIDC 测试用户 first',
        avatar_url: 'https://avatar.example.test/oidc/first.png'
      }
    });
    expect(meResponse.body).toMatchObject({
      user_id: firstResponse.body.user.user_id,
      role: UserRole.ADMIN,
      roles: [UserRole.ADMIN],
      display_name: 'OIDC 测试用户 first',
      anonymous_name: '系统管理员',
      auth_mode: AuthMode.OIDC,
      next_route: 'admin'
    });
    expect(secondResponse.body).toMatchObject({
      role: UserRole.STUDENT,
      roles: [UserRole.STUDENT],
      next_route: 'student'
    });
    expect(prisma.users).toHaveLength(2);
    expect(prisma.users[0]).toMatchObject({
      oidcSub: 'https://idp.example.test#mock_subject_first',
      externalUserNo: 'mock_user_first',
      roles: [UserRole.ADMIN]
    });
    expect(prisma.users[1]).toMatchObject({
      oidcSub: 'https://idp.example.test#mock_subject_second',
      roles: [UserRole.STUDENT]
    });
    expect(JSON.stringify(firstResponse.body)).not.toContain('mock_subject_first');
    expect(JSON.stringify(firstResponse.body)).not.toContain('oidc-client-secret-plain');
  });

  it('returns the same user for an existing mock OIDC subject', async () => {
    seedOidcAuthConfig();
    const firstResponse = await request(app.getHttpServer())
      .post('/auth/oidc/callback')
      .send({
        code: 'mock-oidc-code-repeat',
        state: await getOidcState()
      })
      .expect(200);
    const secondResponse = await request(app.getHttpServer())
      .post('/auth/oidc/callback')
      .send({
        code: 'mock-oidc-code-repeat',
        state: await getOidcState()
      })
      .expect(200);

    expect(secondResponse.body.user.user_id).toBe(firstResponse.body.user.user_id);
    expect(prisma.users).toHaveLength(1);
  });

  it('rejects missing and invalid OIDC state with validation errors', async () => {
    seedOidcAuthConfig();
    const validState = await getOidcState();
    const missingStateResponse = await request(app.getHttpServer())
      .post('/auth/oidc/callback')
      .send({ code: 'mock-oidc-code-state' })
      .expect(400);
    const invalidStateResponse = await request(app.getHttpServer())
      .post('/auth/oidc/callback')
      .send({
        code: 'mock-oidc-code-state',
        state: `${validState.slice(0, -1)}x`
      })
      .expect(400);

    expect(missingStateResponse.body).toMatchObject({
      code: ApiErrorCode.VALIDATION_FAILED
    });
    expect(invalidStateResponse.body).toMatchObject({
      code: ApiErrorCode.VALIDATION_FAILED
    });
    expect(prisma.users).toHaveLength(0);
  });

  it('consumes OIDC state after a successful callback and rejects callback replay', async () => {
    seedOidcAuthConfig();
    const state = await getOidcState();

    await request(app.getHttpServer())
      .post('/auth/oidc/callback')
      .send({
        code: 'mock-oidc-code-replay-once',
        state
      })
      .expect(200);

    const replayResponse = await request(app.getHttpServer())
      .post('/auth/oidc/callback')
      .send({
        code: 'mock-oidc-code-replay-once',
        state
      })
      .expect(400);

    expect(replayResponse.body).toMatchObject({
      code: ApiErrorCode.VALIDATION_FAILED
    });
    expect(prisma.users).toHaveLength(1);
    expect(prisma.oidcAuthStates).toHaveLength(1);
    expect(prisma.oidcAuthStates[0]?.consumedAt).not.toBeNull();
  });

  it('rejects OIDC authorize and callback when the current auth mode is WeChat', async () => {
    const authorizeResponse = await request(app.getHttpServer())
      .get('/auth/oidc/authorize-url')
      .expect(409);
    const callbackResponse = await request(app.getHttpServer())
      .post('/auth/oidc/callback')
      .send({
        code: 'mock-oidc-code-wechat-mode',
        state: 'opaque-state'
      })
      .expect(409);

    expect(authorizeResponse.body).toMatchObject({
      code: ApiErrorCode.AUTH_LOGIN_MODE_MISMATCH
    });
    expect(callbackResponse.body).toMatchObject({
      code: ApiErrorCode.AUTH_LOGIN_MODE_MISMATCH
    });
    expect(prisma.users).toHaveLength(0);
  });

  it('maps mock OIDC provider failures without leaking sensitive details', async () => {
    seedOidcAuthConfig();
    const invalidCodeResponse = await request(app.getHttpServer())
      .post('/auth/oidc/callback')
      .send({
        code: 'invalid-oidc-code',
        state: await getOidcState()
      })
      .expect(401);
    const providerFailureResponse = await request(app.getHttpServer())
      .post('/auth/oidc/callback')
      .send({
        code: 'mock-oidc-code-error',
        state: await getOidcState()
      })
      .expect(502);
    const missingIdentityResponse = await request(app.getHttpServer())
      .post('/auth/oidc/callback')
      .send({
        code: 'mock-oidc-code-no-sub',
        state: await getOidcState()
      })
      .expect(502);

    for (const response of [
      invalidCodeResponse,
      providerFailureResponse,
      missingIdentityResponse
    ]) {
      expect(response.body).toMatchObject({
        code: ApiErrorCode.AUTH_PROVIDER_FAILED
      });
      expect(JSON.stringify(response.body)).not.toContain('mock-oidc-code');
      expect(JSON.stringify(response.body)).not.toContain('mock_subject');
      expect(JSON.stringify(response.body)).not.toContain('oidc-client-secret-plain');
      expect(JSON.stringify(response.body)).not.toContain('invalid-oidc-code');
    }
    expect(prisma.users).toHaveLength(0);
  });
});
