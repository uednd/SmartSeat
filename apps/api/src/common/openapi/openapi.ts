import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export const OPENAPI_JSON_PATH = '/openapi.json';
export const SWAGGER_UI_PATH = 'docs';

export const setupOpenApi = (app: INestApplication): void => {
  const config = new DocumentBuilder()
    .setTitle('SmartSeat API')
    .setDescription('SmartSeat backend platform API. Business modules are added by later tasks.')
    .setVersion(process.env.npm_package_version ?? '0.0.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);

  SwaggerModule.setup(SWAGGER_UI_PATH, app, document, {
    jsonDocumentUrl: OPENAPI_JSON_PATH
  });
};
