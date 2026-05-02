import type { INestApplication } from '@nestjs/common';

import { GlobalHttpExceptionFilter } from './common/errors/http-exception.filter.js';
import { setupOpenApi } from './common/openapi/openapi.js';

export const setupApiPlatform = (app: INestApplication): void => {
  app.useGlobalFilters(new GlobalHttpExceptionFilter());
  setupOpenApi(app);
};
