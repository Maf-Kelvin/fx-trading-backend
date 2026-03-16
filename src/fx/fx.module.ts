// ─── fx.module.ts ─────────────────────────────────────────────────────────────
import { Module } from '@nestjs/common';
import { FxService } from './fx.service';
import { FxController } from './fx.controller';
import { MockFxProvider } from './mock-fx.provider';

@Module({
  controllers: [FxController],
  providers: [FxService, MockFxProvider],
  exports: [FxService],
})
export class FxModule {}