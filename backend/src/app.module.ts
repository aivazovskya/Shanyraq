import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { PropertiesModule } from './modules/properties/properties.module';
import { VotingsModule } from './modules/votings/votings.module';
import { ServiceRequestsModule } from './modules/service-requests/service-requests.module';
import { AccessControlModule } from './modules/access-control/access-control.module';
import { AnnouncementsModule } from './modules/announcements/announcements.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../.env'],
    }),
    PrismaModule,
    AuthModule,
    PropertiesModule,
    VotingsModule,
    ServiceRequestsModule,
    AccessControlModule,
    AnnouncementsModule,
  ],
})
export class AppModule {}
