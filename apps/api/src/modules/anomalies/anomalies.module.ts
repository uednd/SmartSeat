import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../common/database/database.module.js';
import { AnomaliesService } from './anomalies.service.js';

@Module({
  imports: [DatabaseModule],
  providers: [AnomaliesService],
  exports: [AnomaliesService]
})
export class AnomaliesModule {}
