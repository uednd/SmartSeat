import { Module } from '@nestjs/common';

import { DatabaseModule } from '../common/database/database.module.js';
import { AnomaliesModule } from '../modules/anomalies/anomalies.module.js';
import { DevicesModule } from '../modules/devices/devices.module.js';
import { MqttModule } from '../modules/mqtt/mqtt.module.js';
import { ReservationsModule } from '../modules/reservations/reservations.module.js';
import { SensorsModule } from '../modules/sensors/sensors.module.js';
import { AutoRulesService } from './auto-rules.service.js';

@Module({
  imports: [
    DatabaseModule,
    ReservationsModule,
    DevicesModule,
    SensorsModule,
    AnomaliesModule,
    MqttModule
  ],
  providers: [AutoRulesService],
  exports: [AutoRulesService]
})
export class AutoRulesModule {}
