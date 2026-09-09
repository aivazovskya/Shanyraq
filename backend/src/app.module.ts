import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from './modules/auth/auth.module';
import { PropertiesModule } from './modules/properties/properties.module';
import { VotingsModule } from './modules/votings/votings.module';
import { ServiceRequestsModule } from './modules/service-requests/service-requests.module';
import { AccessControlModule } from './modules/access-control/access-control.module';
import { AnnouncementsModule } from './modules/announcements/announcements.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { UploadsModule } from './modules/uploads/uploads.module';
import { FinanceModule } from './modules/finance/finance.module';
import { MetersModule } from './modules/meters/meters.module';
import { BookingsModule } from './modules/bookings/bookings.module';
import { SosModule } from './modules/sos/sos.module';
import { CommunityBoardModule } from './modules/community-board/community-board.module';
import { ChatModule } from './modules/chat/chat.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';

import { EventEmitterModule } from '@nestjs/event-emitter';
import { RealtimeModule } from './modules/realtime/realtime.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../.env'],
    }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 60,
    }]),
    PrismaModule,
    RedisModule,
    NotificationsModule,
    UploadsModule,
    AuthModule,
    PropertiesModule,
    VotingsModule,
    ServiceRequestsModule,
    AccessControlModule,
    AnnouncementsModule,
    FinanceModule,
    MetersModule,
    BookingsModule,
    SosModule,
    CommunityBoardModule,
    ChatModule,
    AnalyticsModule,
    EventEmitterModule.forRoot(),
    RealtimeModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
