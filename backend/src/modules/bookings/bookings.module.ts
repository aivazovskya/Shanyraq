import { Module } from '@nestjs/common';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { BookingsSchedulerService } from './bookings-scheduler.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [BookingsController],
  providers: [BookingsService, BookingsSchedulerService],
  exports: [BookingsService, BookingsSchedulerService],
})
export class BookingsModule {}
