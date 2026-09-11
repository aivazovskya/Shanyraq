import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { PropertiesService } from './properties.service';
import { PropertiesSchedulerService } from './properties-scheduler.service';
import { PropertiesController } from './properties.controller';

@Module({
  imports: [PrismaModule, AuditLogModule],
  controllers: [PropertiesController],
  providers: [PropertiesService, PropertiesSchedulerService],
  exports: [PropertiesService],
})
export class PropertiesModule {}
