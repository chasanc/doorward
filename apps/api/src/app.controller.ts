import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service.js';

@ApiTags('health')
@Controller('health')
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOkResponse({ description: 'Process is up and the database answers SELECT 1.' })
  @ApiServiceUnavailableResponse({ description: 'The database did not answer within 2 seconds.' })
  getHealth(): Promise<{ status: string; name: string; schemaVersion?: number }> {
    return this.appService.getHealth();
  }
}
