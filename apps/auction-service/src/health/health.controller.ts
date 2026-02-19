import { Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  async check(@Res() res: Response): Promise<void> {
    const result = await this.health.check();
    const statusCode = result.status === 'critical' ? 503 : 200;
    res.status(statusCode).json(result);
  }
}
