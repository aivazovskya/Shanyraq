import { Module } from '@nestjs/common';
import { VotingsService } from './votings.service';
import { VotingsController } from './votings.controller';

import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [VotingsController],
  providers: [VotingsService],
  exports: [VotingsService],
})
export class VotingsModule {}
