// ─── admin.controller.ts ───────────────────────────────────────────────────────
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(private adminService: AdminService) {}

  @Get('users')
  @ApiOperation({ summary: '[ADMIN] All users — cursor paginated' })
  @ApiQuery({ name: 'cursor', required: false })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  getUsers(@Query('cursor') cursor?: string, @Query('limit') limit?: number) {
    return this.adminService.getUsers(cursor, +limit || 20);
  }

  @Get('transactions')
  @ApiOperation({ summary: '[ADMIN] All transactions — cursor paginated' })
  @ApiQuery({ name: 'cursor', required: false })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  getTransactions(@Query('cursor') cursor?: string, @Query('limit') limit?: number) {
    return this.adminService.getTransactions(cursor, +limit || 20);
  }

  @Get('stats')
  @ApiOperation({ summary: '[ADMIN] Platform stats and volume metrics' })
  getStats() {
    return this.adminService.getStats();
  }
}