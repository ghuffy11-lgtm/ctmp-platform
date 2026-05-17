import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import appConfig from './config/app.config';
import databaseConfig from './config/database.config';
import jwtConfig from './config/jwt.config';
import adConfig from './config/ad.config';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { VendorAuthModule } from './modules/vendor-auth/vendor-auth.module';
import { UsersModule } from './modules/users/users.module';
import { RolesModule } from './modules/roles/roles.module';
import { PermissionsModule } from './modules/permissions/permissions.module';
import { VendorsModule } from './modules/vendors/vendors.module';
import { TendersModule } from './modules/tenders/tenders.module';
import { ClarificationsModule } from './modules/clarifications/clarifications.module';
import { BidsModule } from './modules/bids/bids.module';
import { LateSubmissionsModule } from './modules/late-submissions/late-submissions.module';
import { TechnicalEvaluationModule } from './modules/technical-evaluation/technical-evaluation.module';
import { CommitteeModule } from './modules/committee/committee.module';
import { CommercialEvaluationModule } from './modules/commercial-evaluation/commercial-evaluation.module';
import { AwardModule } from './modules/award/award.module';
import { AuditModule } from './modules/audit/audit.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ReportsModule } from './modules/reports/reports.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig, jwtConfig, adConfig],
      envFilePath: ['.env.local', '.env'],
    }),
    ThrottlerModule.forRoot([
      { name: 'short', ttl: 1000, limit: 10 },
      { name: 'long', ttl: 60000, limit: 100 },
    ]),
    DatabaseModule,
    AuthModule,
    VendorAuthModule,
    UsersModule,
    RolesModule,
    PermissionsModule,
    VendorsModule,
    TendersModule,
    ClarificationsModule,
    BidsModule,
    LateSubmissionsModule,
    TechnicalEvaluationModule,
    CommitteeModule,
    CommercialEvaluationModule,
    AwardModule,
    AuditModule,
    NotificationsModule,
    ReportsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
