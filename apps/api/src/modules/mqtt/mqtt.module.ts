import { Module } from '@nestjs/common';

import { DevicesModule } from '../devices/devices.module.js';
import {
  defaultMqttConnectFactory,
  MQTT_CONNECT_FACTORY,
  MqttBrokerService
} from './mqtt-broker.service.js';
import { MqttCommandBusService } from './mqtt-command-bus.service.js';
import { MqttDeviceStateService } from './mqtt-device-state.service.js';

@Module({
  imports: [DevicesModule],
  providers: [
    MqttBrokerService,
    MqttCommandBusService,
    MqttDeviceStateService,
    {
      provide: MQTT_CONNECT_FACTORY,
      useValue: defaultMqttConnectFactory
    }
  ],
  exports: [MqttBrokerService, MqttCommandBusService, MqttDeviceStateService]
})
export class MqttModule {}
