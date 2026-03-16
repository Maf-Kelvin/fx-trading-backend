// ─── fx.controller.ts ─────────────────────────────────────────────────────────
import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { FxService } from './fx.service';

@ApiTags('fx')
@Controller('fx')
export class FxController {
  constructor(private fxService: FxService) {}

  @Get('rates')
  @ApiOperation({ summary: 'Get current FX rates (public endpoint)' })
  @ApiQuery({ name: 'base', required: false, example: 'NGN', description: 'Base currency' })
  @ApiResponse({ status: 200, description: 'FX rates retrieved' })
  getRates(@Query('base') base: string = 'NGN') {
    return this.fxService.getRates(base);
  }
}