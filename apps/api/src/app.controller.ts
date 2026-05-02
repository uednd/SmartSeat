import { Controller, Get, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { getConfigString } from './common/config/config-reader.js';
import { HealthResponseDto, type DependencyHealthDto } from './health.dto.js';

@ApiTags('platform')
@Controller()
export class AppController {
  constructor(@Inject(ConfigService) private readonly configService: ConfigService) {}

  @Get('health')
  @ApiOperation({ summary: 'Get API platform health status' })
  @ApiOkResponse({ type: HealthResponseDto })
  getHealth(): HealthResponseDto {
    return {
      status: 'ok',
      service: 'smartseat-api',
      version: process.env.npm_package_version ?? '0.0.0',
      environment: getConfigString(this.configService, 'NODE_ENV'),
      timestamp: new Date().toISOString(),
      dependencies: {
        database: this.getDependencyHealth(this.hasDatabaseConfig()),
        mqtt: this.getDependencyHealth(this.hasMqttConfig())
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

  private getDependencyHealth(configured: boolean): DependencyHealthDto {
    return {
      status: configured ? 'configured' : 'not_configured',
      checked: false,
      message: configured
        ? 'Configuration is present; live connection is not checked in API-PLT-01.'
        : 'Configuration is missing; live connection is not checked in API-PLT-01.'
    };
  }
}
