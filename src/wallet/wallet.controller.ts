



// ─── wallet.controller.ts ─────────────────────────────────────────────────────
import { Controller, Get, Post, Body, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { WalletService } from './wallet.service';
import { FundWalletDto, ConvertDto, TradeDto } from './wallet.dto';

@ApiTags('wallet')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('wallet')
export class WalletController {
  constructor(private walletService: WalletService) {}

  @Get()
  @ApiOperation({ summary: 'Get user wallet balances by currency' })
  @ApiResponse({ status: 200, description: 'Wallet balances returned' })
  getWallet(@Request() req) {
    return this.walletService.getWallet(req.user.id);
  }

  @Post('fund')
  @ApiOperation({ summary: 'Fund wallet in any supported currency' })
  @ApiResponse({ status: 201, description: 'Wallet funded' })
  fund(@Request() req, @Body() dto: FundWalletDto) {
    return this.walletService.fund(req.user.id, dto);
  }

  @Post('convert')
  @ApiOperation({ summary: 'Convert between currencies using real-time FX rates' })
  @ApiResponse({ status: 201, description: 'Conversion executed' })
  @ApiResponse({ status: 400, description: 'Insufficient balance or same currency' })
  convert(@Request() req, @Body() dto: ConvertDto) {
    return this.walletService.convert(req.user.id, dto);
  }

  @Post('trade')
  @ApiOperation({ summary: 'Trade currencies (market order) using real-time FX rates' })
  @ApiResponse({ status: 201, description: 'Trade executed' })
  @ApiResponse({ status: 400, description: 'Insufficient balance or same currency pair' })
  trade(@Request() req, @Body() dto: TradeDto) {
    return this.walletService.trade(req.user.id, dto);
  }
}
