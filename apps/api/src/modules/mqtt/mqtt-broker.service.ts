import { Buffer } from 'node:buffer';

import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { connect, type IClientOptions, type IClientPublishOptions } from 'mqtt';

import {
  getConfigBoolean,
  getConfigNumber,
  getConfigString
} from '../../common/config/config-reader.js';

export const MQTT_CONNECT_FACTORY = 'SMARTSEAT_MQTT_CONNECT_FACTORY';

export interface MqttClientHandle {
  connected: boolean;
  on(event: 'connect', listener: () => void): this;
  on(event: 'reconnect', listener: () => void): this;
  on(event: 'close', listener: () => void): this;
  on(event: 'offline', listener: () => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
  on(event: 'message', listener: (topic: string, payload: Buffer) => void): this;
  subscribe(
    topic: string,
    options: { qos: 0 | 1 | 2 },
    callback: (error: Error | null) => void
  ): void;
  publish(
    topic: string,
    payload: string | Buffer,
    options: IClientPublishOptions,
    callback: (error?: Error | null) => void
  ): void;
  end(force: boolean, callback: () => void): void;
}

export type MqttConnectFactory = (brokerUrl: string, options: IClientOptions) => MqttClientHandle;
export type MqttMessageHandler = (topic: string, payload: Buffer) => void | Promise<void>;

export interface MqttBrokerHealth {
  enabled: boolean;
  connected: boolean;
  brokerUrl: string;
}

@Injectable()
export class MqttBrokerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MqttBrokerService.name);
  private readonly subscriptions = new Map<string, { qos: 0 | 1 | 2 }>();
  private readonly messageHandlers: MqttMessageHandler[] = [];
  private client: MqttClientHandle | null = null;

  constructor(
    @Inject(ConfigService) private readonly configService: ConfigService,
    @Inject(MQTT_CONNECT_FACTORY) private readonly connectFactory: MqttConnectFactory
  ) {}

  onModuleInit(): void {
    this.connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.close();
  }

  connect(): void {
    if (!this.isEnabled()) {
      this.logger.warn('MQTT is disabled; API will run in device simulation/degraded mode.');
      return;
    }

    const brokerUrl = getConfigString(this.configService, 'MQTT_BROKER_URL');
    const clientId = getConfigString(this.configService, 'MQTT_CLIENT_ID');
    const options = this.buildConnectOptions(clientId);

    this.client = this.connectFactory(brokerUrl, options);
    this.client.on('connect', () => {
      this.logger.log(`Connected to MQTT broker: ${brokerUrl}`);
      void this.resubscribeAll();
    });
    this.client.on('reconnect', () => {
      this.logger.warn(`Reconnecting to MQTT broker: ${brokerUrl}`);
    });
    this.client.on('close', () => {
      this.logger.warn('MQTT connection closed.');
    });
    this.client.on('offline', () => {
      this.logger.warn('MQTT broker is offline; API remains available in degraded mode.');
    });
    this.client.on('error', (error) => {
      this.logger.error(`MQTT client error: ${error.message}`);
    });
    this.client.on('message', (topic, payload) => {
      for (const handler of this.messageHandlers) {
        void handler(topic, payload);
      }
    });
  }

  registerMessageHandler(handler: MqttMessageHandler): void {
    this.messageHandlers.push(handler);
  }

  async subscribe(topic: string, options: { qos: 0 | 1 | 2 }): Promise<boolean> {
    this.subscriptions.set(topic, options);

    if (!this.isEnabled() || this.client === null || !this.client.connected) {
      return false;
    }

    return await this.subscribeClient(topic, options);
  }

  async publishJson(
    topic: string,
    payload: unknown,
    options: { qos: 0 | 1 | 2; retain: boolean }
  ): Promise<boolean> {
    if (!this.isEnabled()) {
      this.logger.warn(`MQTT is disabled; skipped publish to ${topic}.`);
      return false;
    }

    if (this.client === null || !this.client.connected) {
      this.logger.warn(`MQTT is not connected; skipped publish to ${topic}.`);
      return false;
    }

    await new Promise<void>((resolve, reject) => {
      this.client?.publish(topic, JSON.stringify(payload), options, (error) => {
        if (error !== undefined && error !== null) {
          reject(error);
          return;
        }

        resolve();
      });
    });

    return true;
  }

  getHealth(): MqttBrokerHealth {
    return {
      enabled: this.isEnabled(),
      connected: this.client?.connected ?? false,
      brokerUrl: getConfigString(this.configService, 'MQTT_BROKER_URL')
    };
  }

  private async close(): Promise<void> {
    if (this.client === null) {
      return;
    }

    const client = this.client;
    this.client = null;

    await new Promise<void>((resolve) => {
      client.end(true, resolve);
    });
  }

  private async resubscribeAll(): Promise<void> {
    for (const [topic, options] of this.subscriptions) {
      await this.subscribeClient(topic, options);
    }
  }

  private async subscribeClient(topic: string, options: { qos: 0 | 1 | 2 }): Promise<boolean> {
    if (this.client === null) {
      return false;
    }

    try {
      await new Promise<void>((resolve, reject) => {
        this.client?.subscribe(topic, options, (error) => {
          if (error !== null) {
            reject(error);
            return;
          }

          resolve();
        });
      });
      this.logger.log(`Subscribed to MQTT topic: ${topic}`);
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to subscribe to MQTT topic ${topic}: ${error instanceof Error ? error.message : String(error)}`
      );
      return false;
    }
  }

  private isEnabled(): boolean {
    return getConfigBoolean(this.configService, 'MQTT_ENABLED');
  }

  private buildConnectOptions(clientId: string): IClientOptions {
    const options: IClientOptions = {
      clientId,
      clean: true,
      keepalive: 30,
      reconnectPeriod: 5000,
      connectTimeout: 5000,
      resubscribe: false
    };
    const username = getConfigString(this.configService, 'MQTT_USERNAME');
    const password = getConfigString(this.configService, 'MQTT_PASSWORD');

    if (!isPlaceholderCredential(username)) {
      options.username = username;
    }

    if (!isPlaceholderCredential(password)) {
      options.password = password;
    }

    // Keep this value read here so invalid threshold config fails during startup validation paths.
    getConfigNumber(this.configService, 'MQTT_HEARTBEAT_OFFLINE_THRESHOLD_SECONDS');

    return options;
  }
}

export const defaultMqttConnectFactory: MqttConnectFactory = (brokerUrl, options) =>
  connect(brokerUrl, options) as MqttClientHandle;

const isPlaceholderCredential = (value: string): boolean => {
  const normalized = value.toLowerCase();

  return normalized === 'placeholder' || normalized.includes('replace-with-');
};
