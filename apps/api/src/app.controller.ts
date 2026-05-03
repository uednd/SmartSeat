import { Controller, Get, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { getConfigString } from './common/config/config-reader.js';
import { PrismaService } from './common/database/prisma.service.js';
import { HealthResponseDto, type DependencyHealthDto } from './health.dto.js';
import { MqttBrokerService } from './modules/mqtt/mqtt-broker.service.js';

@ApiTags('platform')
@Controller()
export class AppController {
  constructor(
    @Inject(ConfigService) private readonly configService: ConfigService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(MqttBrokerService) private readonly mqttBroker: MqttBrokerService
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
        mqtt: this.getMqttHealth()
      }
    };
  }

  private hasDatabaseConfig(): boolean {
    return (
      getConfigString(this.configService, 'DATABASE_URL').length > 0 &&
      getConfigString(this.configService, 'POSTGRES_HOST').length > 0
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

  private getMqttHealth(): DependencyHealthDto {
    const health = this.mqttBroker.getHealth();

    if (!health.enabled) {
      return {
        status: 'not_configured',
        checked: false,
        message: 'MQTT is disabled; API is running in device simulation/degraded mode.'
      };
    }

    return {
      status: health.connected ? 'available' : 'unavailable',
      checked: true,
      message: health.connected
        ? `MQTT broker connection is available: ${health.brokerUrl}`
        : `MQTT is enabled, but broker connection is not available: ${health.brokerUrl}`
    };
  }
}
