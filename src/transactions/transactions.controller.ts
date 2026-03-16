

// ─── transactions.controller.ts ───────────────────────────────────────────────
import { Controller, Get, Query, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { TransactionsService } from './transactions.service';

@ApiTags('transactions')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('transactions')
export class TransactionsController {
  constructor(private txService: TransactionsService) {}

  @Get()
  @ApiOperation({ summary: 'Cursor-paginated transaction history' })
  @ApiQuery({ name: 'cursor', required: false, description: 'Cursor from previous response for next page' })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiResponse({ status: 200, description: 'Paginated transaction history with cursor' })
  getAll(
    @Request() req,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: number,
  ) {
    return this.txService.findByUser(req.user.id, { cursor, limit: +limit });
  }
}
