import { forwardRef, Module } from '@nestjs/common';

import { AnomaliesModule } from '../anomalies/anomalies.module.js';
import { DevicesModule } from '../devices/devices.module.js';
import { ReservationsModule } from '../reservations/reservations.module.js';
import { SensorsModule } from '../sensors/sensors.module.js';
import {
  defaultMqttConnectFactory,
  MQTT_CONNECT_FACTORY,
  MqttBrokerService
} from './mqtt-broker.service.js';
import { MqttCommandBusService } from './mqtt-command-bus.service.js';
import { MqttDeviceStateService } from './mqtt-device-state.service.js';
import { MqttPresenceService } from './mqtt-presence.service.js';

@Module({
  imports: [DevicesModule, SensorsModule, AnomaliesModule, forwardRef(() => ReservationsModule)],
  providers: [
    MqttBrokerService,
    MqttCommandBusService,
    MqttDeviceStateService,
    MqttPresenceService,
    {
      provide: MQTT_CONNECT_FACTORY,
      useValue: defaultMqttConnectFactory
    }
  ],
  exports: [MqttBrokerService, MqttCommandBusService, MqttDeviceStateService, MqttPresenceService]
})
export class MqttModule {}
