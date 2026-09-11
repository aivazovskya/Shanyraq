import { Module } from '@nestjs/common';
import { VotingsService } from './votings.service';
import { VotingsSchedulerService } from './votings-scheduler.service';
import { VotingsController } from './votings.controller';
import { AuthModule } from '../auth/auth.module';
import { UploadsModule } from '../uploads/uploads.module';

@Module({
  imports: [AuthModule, UploadsModule],
  controllers: [VotingsController],
  providers: [VotingsService, VotingsSchedulerService],
  exports: [VotingsService, VotingsSchedulerService],
})
export class VotingsModule {}
