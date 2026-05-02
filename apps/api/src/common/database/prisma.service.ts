import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

import { getConfigString } from '../config/config-reader.js';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(@Inject(ConfigService) configService: ConfigService) {
    const connectionString = getConfigString(configService, 'DATABASE_URL');

    super({
      adapter: new PrismaPg({ connectionString })
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  async checkConnection(): Promise<boolean> {
    await this.$queryRaw`SELECT 1`;
    return true;
  }
}
