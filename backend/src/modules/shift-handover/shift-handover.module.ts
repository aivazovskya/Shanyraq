import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { ShiftHandoverService } from './shift-handover.service';
import { ShiftHandoverController } from './shift-handover.controller';

@Module({
  imports: [PrismaModule],
  controllers: [ShiftHandoverController],
  providers: [ShiftHandoverService],
  exports: [ShiftHandoverService],
})
export class ShiftHandoverModule {}
