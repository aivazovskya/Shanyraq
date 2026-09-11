import { Module } from '@nestjs/common';
import { FinanceService } from './finance.service';
import { FinanceSchedulerService } from './finance-scheduler.service';
import { FinanceController } from './finance.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuditLogModule } from '../audit-log/audit-log.module';

@Module({
  imports: [PrismaModule, AuditLogModule],
  controllers: [FinanceController],
  providers: [FinanceService, FinanceSchedulerService],
  exports: [FinanceService, FinanceSchedulerService],
})
export class FinanceModule {}

