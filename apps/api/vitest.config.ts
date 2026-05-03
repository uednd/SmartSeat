import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: {
      MQTT_ENABLED: 'false'
    },
    environment: 'node',
    include: ['src/**/*.spec.ts']
  }
});
