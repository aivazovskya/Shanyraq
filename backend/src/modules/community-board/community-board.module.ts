import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { CommunityBoardService } from './community-board.service';
import { CommunityBoardController } from './community-board.controller';

@Module({
  imports: [PrismaModule],
  controllers: [CommunityBoardController],
  providers: [CommunityBoardService],
  exports: [CommunityBoardService],
})
export class CommunityBoardModule {}
