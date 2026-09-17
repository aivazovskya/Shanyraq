import { Module } from '@nestjs/common';
import { SosController } from './sos.controller';
import { SosService } from './sos.service';
import { AuditLogModule } from '../audit-log/audit-log.module';

@Module({
  imports: [AuditLogModule],
  controllers: [SosController],
  providers: [SosService],
  exports: [SosService],
})
export class SosModule {}
