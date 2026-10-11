import { Controller, Get, UseGuards } from '@nestjs/common';
import { RateLimitGuard } from '../rate-limit/rate-limit.guard';

@Controller('api/demo')
@UseGuards(RateLimitGuard)
export class DemoController {
  @Get()
  demo(): { message: string } {
    return { message: 'ok' };
  }
}
