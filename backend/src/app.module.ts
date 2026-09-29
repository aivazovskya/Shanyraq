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
import { AuditLogModule } from './modules/audit-log/audit-log.module';
import { SearchModule } from './modules/search/search.module';
import { ShiftHandoverModule } from './modules/shift-handover/shift-handover.module';

import { EventEmitterModule } from '@nestjs/event-emitter';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { HealthModule } from './modules/health/health.module';

import { RATE_LIMITS } from './common/constants/rate-limit.constants';
import { RedisThrottlerStorage } from './redis/redis-throttler.storage';
import { AppThrottlerGuard } from './common/guards/app-throttler.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../.env'],
    }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRootAsync({
      imports: [RedisModule],
      inject: [RedisThrottlerStorage],
      useFactory: (storage: RedisThrottlerStorage) => ({
        throttlers: [
          {
            name: 'default',
            ttl: RATE_LIMITS.GLOBAL.TTL,
            limit: RATE_LIMITS.GLOBAL.LIMIT,
          },
        ],
        storage,
        generateKey: (context, tracker, name) => {
          const className = context.getClass().name;
          const handlerName = context.getHandler().name;
          return `${className}:${handlerName}:${name}:${tracker}`;
        },
      }),
    }),
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
    AuditLogModule,
    SearchModule,
    ShiftHandoverModule,
    EventEmitterModule.forRoot(),
    RealtimeModule,
    HealthModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: AppThrottlerGuard,
    },
  ],
})
export class AppModule {}
