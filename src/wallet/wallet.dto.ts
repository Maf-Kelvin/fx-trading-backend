// ─── wallet.dto.ts ────────────────────────────────────────────────────────────
import { IsEnum, IsPositive, IsNumber, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Currency, OrderType } from '../common/enums';

export class FundWalletDto {
  @ApiProperty({ enum: Currency, example: Currency.NGN })
  @IsEnum(Currency)
  currency: Currency;

  @ApiProperty({ example: 10000 })
  @IsNumber()
  @IsPositive()
  amount: number;

  @ApiPropertyOptional({ example: '8a7f9b2c-1234-5678-abcd-ef0123456789' })
  @IsUUID()
  @IsOptional()
  idempotencyKey?: string;
}

export class ConvertDto {
  @ApiProperty({ enum: Currency, example: Currency.NGN })
  @IsEnum(Currency)
  fromCurrency: Currency;

  @ApiProperty({ enum: Currency, example: Currency.USD })
  @IsEnum(Currency)
  toCurrency: Currency;

  @ApiProperty({ example: 1000 })
  @IsNumber()
  @IsPositive()
  amount: number;

  @ApiPropertyOptional({ example: '8a7f9b2c-1234-5678-abcd-ef0123456789' })
  @IsUUID()
  @IsOptional()
  idempotencyKey?: string;
}

export class TradeDto {
  @ApiProperty({ enum: Currency, example: Currency.NGN })
  @IsEnum(Currency)
  fromCurrency: Currency;

  @ApiProperty({ enum: Currency, example: Currency.USD })
  @IsEnum(Currency)
  toCurrency: Currency;

  @ApiProperty({ example: 10000 })
  @IsNumber()
  @IsPositive()
  amount: number;

  @ApiProperty({ enum: OrderType, example: OrderType.MARKET })
  @IsEnum(OrderType)
  @IsOptional()
  orderType: OrderType = OrderType.MARKET;

  @ApiPropertyOptional({ example: '8a7f9b2c-1234-5678-abcd-ef0123456789' })
  @IsUUID()
  @IsOptional()
  idempotencyKey?: string;
}