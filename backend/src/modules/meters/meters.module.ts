import { Module } from '@nestjs/common';
import { MetersService } from './meters.service';
import { MetersSchedulerService } from './meters-scheduler.service';
import { MetersController } from './meters.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [MetersController],
  providers: [MetersService, MetersSchedulerService],
  exports: [MetersService, MetersSchedulerService],
})
export class MetersModule {}
