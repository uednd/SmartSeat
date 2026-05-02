import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { AuthProvider, Prisma, User, UserRole as PrismaUserRole } from '@prisma/client';
import {
  ApiErrorCode,
  AuthMode,
  AuthProvider as ContractAuthProvider,
  UserRole,
  type MeResponse,
  type UserDto
} from '@smartseat/contracts';

import { PrismaService } from '../../common/database/prisma.service.js';
import { AppHttpException } from '../../common/errors/app-http.exception.js';

export interface InitializeUserFromIdentityInput {
  userId?: string;
  authProvider: AuthProvider;
  openid?: string;
  unionid?: string;
  oidcSub?: string;
  externalUserNo?: string;
  anonymousName?: string;
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findById(userId: string): Promise<User | null> {
    return await this.prisma.user.findUnique({
      where: { userId }
    });
  }

  async findByIdOrThrow(userId: string): Promise<User> {
    const user = await this.findById(userId);

    if (user === null) {
      throw new AppHttpException(
        HttpStatus.UNAUTHORIZED,
        ApiErrorCode.AUTH_INVALID_TOKEN,
        'Authentication token is invalid.'
      );
    }

    return user;
  }

  async getMe(userId: string, authMode: AuthMode): Promise<MeResponse> {
    const user = await this.findByIdOrThrow(userId);
    const roles = user.roles as UserRole[];
    const role = this.getPrimaryRole(roles);
    const userDto = this.toUserDto(user);

    return {
      user_id: user.userId,
      role,
      display_name: user.anonymousName,
      anonymous_name: user.anonymousName,
      user: userDto,
      roles,
      auth_mode: authMode,
      next_route: role === UserRole.ADMIN ? 'admin' : 'student'
    };
  }

  async initializeUserFromIdentity(input: InitializeUserFromIdentityInput): Promise<User> {
    const existing = await this.findExistingIdentity(input);

    if (existing !== null) {
      return existing;
    }

    return await this.prisma.$transaction(
      async (tx) => {
        const userCount = await tx.user.count();
        const isFirstUser = userCount === 0;
        const role = isFirstUser ? PrismaUserRole.ADMIN : PrismaUserRole.STUDENT;
        const data: Prisma.UserCreateInput = {
          authProvider: input.authProvider,
          roles: [role],
          anonymousName: input.anonymousName ?? this.createAnonymousName(isFirstUser, userCount + 1)
        };

        if (input.userId !== undefined) {
          data.userId = input.userId;
        }

        if (input.openid !== undefined) {
          data.openid = input.openid;
        }

        if (input.unionid !== undefined) {
          data.unionid = input.unionid;
        }

        if (input.oidcSub !== undefined) {
          data.oidcSub = input.oidcSub;
        }

        if (input.externalUserNo !== undefined) {
          data.externalUserNo = input.externalUserNo;
        }

        const user = await tx.user.create({
          data
        });

        if (isFirstUser) {
          this.logger.log(
            JSON.stringify({
              category: 'first_admin_initialized',
              user_id: user.userId,
              auth_provider: user.authProvider
            })
          );
        }

        return user;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable
      }
    );
  }

  toUserDto(user: User): UserDto {
    return {
      user_id: user.userId,
      auth_provider: user.authProvider as ContractAuthProvider,
      roles: user.roles as UserRole[],
      anonymous_name: user.anonymousName,
      leaderboard_enabled: user.leaderboardEnabled,
      no_show_count_week: user.noShowCountWeek,
      no_show_count_month: user.noShowCountMonth,
      created_at: user.createdAt.toISOString(),
      updated_at: user.updatedAt.toISOString()
    };
  }

  private async findExistingIdentity(input: InitializeUserFromIdentityInput): Promise<User | null> {
    const identityWhere: Prisma.UserWhereInput[] = [];

    if (input.openid !== undefined) {
      identityWhere.push({ openid: input.openid });
    }

    if (input.unionid !== undefined) {
      identityWhere.push({ unionid: input.unionid });
    }

    if (input.oidcSub !== undefined) {
      identityWhere.push({ oidcSub: input.oidcSub });
    }

    if (input.externalUserNo !== undefined) {
      identityWhere.push({ externalUserNo: input.externalUserNo });
    }

    if (identityWhere.length === 0) {
      return null;
    }

    return await this.prisma.user.findFirst({
      where: {
        OR: identityWhere
      }
    });
  }

  private getPrimaryRole(roles: UserRole[]): UserRole {
    return roles.includes(UserRole.ADMIN) ? UserRole.ADMIN : UserRole.STUDENT;
  }

  private createAnonymousName(isFirstUser: boolean, sequence: number): string {
    if (isFirstUser) {
      return '系统管理员';
    }

    return `匿名用户 ${String(sequence).padStart(2, '0')}`;
  }
}
