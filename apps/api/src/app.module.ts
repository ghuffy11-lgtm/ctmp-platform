import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { RequestContextModule } from './common/request-context/request-context.module';
import { RequestContextMiddleware } from './common/request-context/request-context.middleware';
import appConfig from './config/app.config';
import databaseConfig from './config/database.config';
import jwtConfig from './config/jwt.config';
import adConfig from './config/ad.config';
import reportsConfig from './config/reports.config';
import storageConfig from './config/storage.config';
import auditConfig from './config/audit.config';
import captchaConfig from './config/captcha.config';
import { StorageModule } from './common/storage/storage.module';
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
import { ComparisonModule } from './modules/comparison/comparison.module';
import { EvaluationCriteriaModule } from './modules/evaluation-criteria/evaluation-criteria.module';
import { AwardModule } from './modules/award/award.module';
import { AuditModule } from './modules/audit/audit.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ReportsModule } from './modules/reports/reports.module';
import { DepartmentsModule } from './modules/departments/departments.module';
import { SystemSettingsModule } from './modules/system-settings/system-settings.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig, jwtConfig, adConfig, reportsConfig, storageConfig, auditConfig, captchaConfig],
      envFilePath: ['.env.local', '.env'],
    }),
    ThrottlerModule.forRoot([
      { name: 'short', ttl: 1000, limit: 10 },
      { name: 'long', ttl: 60000, limit: 100 },
    ]),
    DatabaseModule,
    StorageModule,
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
    ComparisonModule,
    EvaluationCriteriaModule,
    AwardModule,
    AuditModule,
    NotificationsModule,
    ReportsModule,
    SystemSettingsModule,
    DepartmentsModule,
    RequestContextModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Apply globally — every HTTP request runs inside the AsyncLocalStorage
    // scope so audit.log() can attribute it to a client IP / User-Agent.
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
