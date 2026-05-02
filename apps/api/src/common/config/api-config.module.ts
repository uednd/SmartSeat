import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { getApiEnvFilePaths, validateApiEnv } from './api-env.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      envFilePath: getApiEnvFilePaths(),
      isGlobal: true,
      validate: validateApiEnv
    })
  ]
})
export class ApiConfigModule {}
