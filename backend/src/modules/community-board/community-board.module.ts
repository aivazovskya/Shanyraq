import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { CommunityBoardService } from './community-board.service';
import { CommunityBoardController } from './community-board.controller';

@Module({
  imports: [PrismaModule, AuditLogModule],
  controllers: [CommunityBoardController],
  providers: [CommunityBoardService],
  exports: [CommunityBoardService],
})
export class CommunityBoardModule {}
