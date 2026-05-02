import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdminActionType, AuthMode as PrismaAuthMode, Prisma } from '@prisma/client';
import {
  ApiErrorCode,
  AuthMode,
  type AuthConfigPublicDto,
  type LoginModeResponse,
  type UpdateAuthConfigRequest
} from '@smartseat/contracts';

import { getConfigString } from '../../common/config/config-reader.js';
import { PrismaService } from '../../common/database/prisma.service.js';
import { AppHttpException } from '../../common/errors/app-http.exception.js';

const AUTH_CONFIG_ID = 'auth_config_default';
const AUTH_MODES = new Set<string>([AuthMode.WECHAT, AuthMode.OIDC]);

type AuthConfigRecord = Awaited<ReturnType<PrismaService['authConfig']['findUnique']>>;

@Injectable()
export class AuthConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService
  ) {}

  async getLoginMode(): Promise<LoginModeResponse> {
    const config = await this.ensureConfig();

    return {
      auth_mode: config.authMode as AuthMode,
      config: this.toPublicDto(config)
    };
  }

  async updateLoginMode(
    adminUserId: string,
    request: UpdateAuthConfigRequest
  ): Promise<AuthConfigPublicDto> {
    this.assertValidUpdateRequest(request);

    const before = await this.ensureConfig();
    const data = this.toUpdateData(request, adminUserId);

    const updated = await this.prisma.authConfig.update({
      where: { configId: AUTH_CONFIG_ID },
      data
    });

    await this.prisma.adminActionLog.create({
      data: {
        adminId: adminUserId,
        actionType: AdminActionType.UPDATE_AUTH_CONFIG,
        targetType: 'auth_config',
        targetId: AUTH_CONFIG_ID,
        reason: 'API-AUTH-01 login mode update',
        detail: {
          previous_auth_mode: before.authMode,
          auth_mode: updated.authMode,
          oidc_secret_configured: updated.oidcClientSecret !== null,
          wechat_secret_configured: updated.wechatSecret !== null
        }
      }
    });

    return this.toPublicDto(updated);
  }

  async ensureConfig(): Promise<NonNullable<AuthConfigRecord>> {
    const existing = await this.prisma.authConfig.findUnique({
      where: { configId: AUTH_CONFIG_ID }
    });

    if (existing !== null) {
      return existing;
    }

    return await this.prisma.authConfig.create({
      data: {
        configId: AUTH_CONFIG_ID,
        authMode: this.getDefaultAuthMode()
      }
    });
  }

  toPublicDto(config: NonNullable<AuthConfigRecord>): AuthConfigPublicDto {
    const dto: AuthConfigPublicDto = {
      auth_mode: config.authMode as AuthMode,
      oidc_secret_configured: config.oidcClientSecret !== null,
      wechat_secret_configured: config.wechatSecret !== null,
      updated_at: config.updatedAt.toISOString()
    };

    if (config.oidcIssuer !== null) {
      dto.oidc_issuer = config.oidcIssuer;
    }

    if (config.oidcClientId !== null) {
      dto.oidc_client_id = config.oidcClientId;
    }

    if (config.oidcRedirectUri !== null) {
      dto.oidc_redirect_uri = config.oidcRedirectUri;
    }

    if (config.adminMappingRule !== null) {
      dto.admin_mapping_rule = config.adminMappingRule;
    }

    if (config.wechatAppid !== null) {
      dto.wechat_appid = config.wechatAppid;
    }

    if (config.updatedById !== null) {
      dto.updated_by = config.updatedById;
    }

    return dto;
  }

  private getDefaultAuthMode(): PrismaAuthMode {
    return getConfigString(this.configService, 'DEFAULT_AUTH_MODE') as PrismaAuthMode;
  }

  private assertValidUpdateRequest(request: UpdateAuthConfigRequest): void {
    if (typeof request !== 'object' || request === null || Array.isArray(request)) {
      throw new AppHttpException(
        HttpStatus.BAD_REQUEST,
        ApiErrorCode.VALIDATION_FAILED,
        'Auth config update payload must be an object.'
      );
    }

    if (!AUTH_MODES.has(request.auth_mode)) {
      throw new AppHttpException(
        HttpStatus.BAD_REQUEST,
        ApiErrorCode.VALIDATION_FAILED,
        'Invalid auth mode.'
      );
    }

    const optionalStringKeys = [
      'oidc_issuer',
      'oidc_client_id',
      'oidc_client_secret',
      'oidc_redirect_uri',
      'admin_mapping_rule',
      'wechat_appid',
      'wechat_secret'
    ] as const;

    for (const key of optionalStringKeys) {
      const value = request[key];

      if (value !== undefined && typeof value !== 'string') {
        throw new AppHttpException(
          HttpStatus.BAD_REQUEST,
          ApiErrorCode.VALIDATION_FAILED,
          `Invalid auth config field: ${key}.`
        );
      }
    }
  }

  private toUpdateData(
    request: UpdateAuthConfigRequest,
    adminUserId: string
  ): Prisma.AuthConfigUpdateInput {
    const data: Prisma.AuthConfigUpdateInput = {
      authMode: request.auth_mode as PrismaAuthMode,
      updatedBy: {
        connect: {
          userId: adminUserId
        }
      }
    };

    this.assignIfPresent(data, 'oidcIssuer', request, 'oidc_issuer');
    this.assignIfPresent(data, 'oidcClientId', request, 'oidc_client_id');
    this.assignIfPresent(data, 'oidcClientSecret', request, 'oidc_client_secret');
    this.assignIfPresent(data, 'oidcRedirectUri', request, 'oidc_redirect_uri');
    this.assignIfPresent(data, 'adminMappingRule', request, 'admin_mapping_rule');
    this.assignIfPresent(data, 'wechatAppid', request, 'wechat_appid');
    this.assignIfPresent(data, 'wechatSecret', request, 'wechat_secret');

    return data;
  }

  private assignIfPresent(
    data: Prisma.AuthConfigUpdateInput,
    prismaKey:
      | 'oidcIssuer'
      | 'oidcClientId'
      | 'oidcClientSecret'
      | 'oidcRedirectUri'
      | 'adminMappingRule'
      | 'wechatAppid'
      | 'wechatSecret',
    request: UpdateAuthConfigRequest,
    requestKey: keyof UpdateAuthConfigRequest
  ): void {
    if (Object.prototype.hasOwnProperty.call(request, requestKey)) {
      data[prismaKey] = request[requestKey] ?? null;
    }
  }
}
