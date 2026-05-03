import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../common/database/database.module.js';
import { PresenceEvaluatorService } from './presence-evaluator.service.js';
import { SensorsService } from './sensors.service.js';

@Module({
  imports: [DatabaseModule],
  providers: [PresenceEvaluatorService, SensorsService],
  exports: [PresenceEvaluatorService, SensorsService]
})
export class SensorsModule {}
