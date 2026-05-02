import { Controller, Get, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { getConfigString } from './common/config/config-reader.js';
import { PrismaService } from './common/database/prisma.service.js';
import { HealthResponseDto, type DependencyHealthDto } from './health.dto.js';

@ApiTags('platform')
@Controller()
export class AppController {
  constructor(
    @Inject(ConfigService) private readonly configService: ConfigService,
    @Inject(PrismaService) private readonly prisma: PrismaService
  ) {}

  @Get('health')
  @ApiOperation({ summary: 'Get API platform health status' })
  @ApiOkResponse({ type: HealthResponseDto })
  async getHealth(): Promise<HealthResponseDto> {
    return {
      status: 'ok',
      service: 'smartseat-api',
      version: process.env.npm_package_version ?? '0.0.0',
      environment: getConfigString(this.configService, 'NODE_ENV'),
      timestamp: new Date().toISOString(),
      dependencies: {
        database: await this.getDatabaseHealth(),
        mqtt: this.getConfiguredDependencyHealth(
          this.hasMqttConfig(),
          'Configuration is present; live MQTT connection is not checked in API-DB-01.',
          'Configuration is missing; live MQTT connection is not checked in API-DB-01.'
        )
      }
    };
  }

  private hasDatabaseConfig(): boolean {
    return (
      getConfigString(this.configService, 'DATABASE_URL').length > 0 &&
      getConfigString(this.configService, 'POSTGRES_HOST').length > 0
    );
  }

  private hasMqttConfig(): boolean {
    return (
      getConfigString(this.configService, 'MQTT_HOST').length > 0 &&
      getConfigString(this.configService, 'MQTT_USERNAME').length > 0
    );
  }

  private async getDatabaseHealth(): Promise<DependencyHealthDto> {
    if (!this.hasDatabaseConfig()) {
      return {
        status: 'not_configured',
        checked: false,
        message: 'Database configuration is missing; live connection was not checked.'
      };
    }

    try {
      await this.prisma.checkConnection();

      return {
        status: 'available',
        checked: true,
        message: 'Database connection check succeeded.'
      };
    } catch {
      return {
        status: 'unavailable',
        checked: true,
        message: 'Database configuration is present, but live connection check failed.'
      };
    }
  }

  private getConfiguredDependencyHealth(
    configured: boolean,
    configuredMessage: string,
    missingMessage: string
  ): DependencyHealthDto {
    return {
      status: configured ? 'configured' : 'not_configured',
      checked: false,
      message: configured ? configuredMessage : missingMessage
    };
  }
}
