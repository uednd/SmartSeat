import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get('health')
  getHealth() {
    return {
      status: 'ok',
      service: 'smartseat-api',
      scope: 'initialized only'
    } as const;
  }
}
