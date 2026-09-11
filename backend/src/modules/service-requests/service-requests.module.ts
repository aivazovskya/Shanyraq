import { Module } from '@nestjs/common';
import { ServiceRequestsService } from './service-requests.service';
import { ServiceRequestsController } from './service-requests.controller';
import { ServiceRequestsSlaSchedulerService } from './service-requests-sla-scheduler.service';

@Module({
  controllers: [ServiceRequestsController],
  providers: [ServiceRequestsService, ServiceRequestsSlaSchedulerService],
  exports: [ServiceRequestsService, ServiceRequestsSlaSchedulerService],
})
export class ServiceRequestsModule {}
