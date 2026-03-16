// ─── fx.module.ts ─────────────────────────────────────────────────────────────
import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { FxService } from './fx.service';
import { FxController } from './fx.controller';
import { MockFxProvider } from './mock-fx.provider';
import { FxRefreshService } from './fx-refresh.service';

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [FxController],
  providers: [FxService, MockFxProvider, FxRefreshService],
  exports: [FxService],
})
export class FxModule {}