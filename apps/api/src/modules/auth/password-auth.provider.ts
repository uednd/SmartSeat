import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

import { getConfigString } from '../../common/config/config-reader.js';
import { PrismaService } from '../../common/database/prisma.service.js';

const scryptAsync = promisify<string, string, number, Buffer>(scrypt);
const SALT_PREFIX = 'smartseat:';

export interface PasswordAuthIdentity {
  username: string;
}

export class PasswordAuthInvalidCredentialsError extends Error {
  constructor(message = '用户名或密码错误。') {
    super(message);
    this.name = 'PasswordAuthInvalidCredentialsError';
  }
}

export class PasswordAuthNotRegisteredError extends Error {
  constructor(message = '该账号尚未注册，请先注册。') {
    super(message);
    this.name = 'PasswordAuthNotRegisteredError';
  }
}

export interface PasswordAuthProvider {
  authenticate(username: string, password: string): Promise<PasswordAuthIdentity>;
}

@Injectable()
export class MockPasswordAuthProvider implements PasswordAuthProvider {
  async authenticate(username: string, password: string): Promise<PasswordAuthIdentity> {
    if (typeof username !== 'string' || username.trim().length === 0) {
      throw new PasswordAuthInvalidCredentialsError('用户名不能为空。');
    }

    if (typeof password !== 'string' || password.trim().length === 0) {
      throw new PasswordAuthInvalidCredentialsError('密码不能为空。');
    }

    return { username: username.trim() };
  }
}

export async function hashPassword(password: string): Promise<string> {
  const key = await scryptAsync(password, SALT_PREFIX, 64);
  return key.toString('base64');
}

async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  try {
    const key = await scryptAsync(password, SALT_PREFIX, 64);
    const stored = Buffer.from(storedHash, 'base64');
    if (stored.length !== key.length) return false;
    return timingSafeEqual(key, stored);
  } catch {
    return false;
  }
}

@Injectable()
export class RealPasswordAuthProvider implements PasswordAuthProvider {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async authenticate(username: string, password: string): Promise<PasswordAuthIdentity> {
    const normalized = username.trim().toLowerCase();

    if (normalized.length === 0) {
      throw new PasswordAuthInvalidCredentialsError('用户名不能为空。');
    }

    if (typeof password !== 'string' || password.length === 0) {
      throw new PasswordAuthInvalidCredentialsError('密码不能为空。');
    }

    const user = await this.prisma.user.findUnique({
      where: { localSub: normalized }
    });

    if (user === null || user.passwordHash === null) {
      throw new PasswordAuthInvalidCredentialsError('用户名或密码错误。');
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      throw new PasswordAuthInvalidCredentialsError('用户名或密码错误。');
    }

    return { username: normalized };
  }
}

@Injectable()
export class PasswordAuthProviderSelector implements PasswordAuthProvider {
  constructor(
    @Inject(ConfigService) private readonly configService: ConfigService,
    @Inject(MockPasswordAuthProvider) private readonly mockProvider: MockPasswordAuthProvider,
    @Inject(RealPasswordAuthProvider) private readonly realProvider: RealPasswordAuthProvider
  ) {}

  getProvider(): PasswordAuthProvider {
    const providerMode = getConfigString(this.configService, 'PASSWORD_AUTH_PROVIDER_MODE');
    return providerMode === 'real' ? this.realProvider : this.mockProvider;
  }

  async authenticate(username: string, password: string): Promise<PasswordAuthIdentity> {
    return await this.getProvider().authenticate(username, password);
  }
}
