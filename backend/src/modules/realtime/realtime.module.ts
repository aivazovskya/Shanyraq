import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../../prisma/prisma.module';
import { ChatModule } from '../chat/chat.module';
import { SosModule } from '../sos/sos.module';
import { RealtimeGateway } from './realtime.gateway';

@Module({
  imports: [
    ConfigModule,
    JwtModule.register({}),
    PrismaModule,
    ChatModule,
    SosModule,
  ],
  providers: [RealtimeGateway],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
