import { Module } from '@nestjs/common';
import { VendorsController } from './vendors.controller';
import { VendorsService } from './vendors.service';
import { VendorDocumentStorageService } from './vendor-document-storage.service';
import { VendorInvitationsController } from './vendor-invitations.controller';
import { VendorInvitationsService } from './vendor-invitations.service';
import { AuditModule } from '../audit/audit.module';
import { StorageModule } from '../../common/storage/storage.module';
// 2026-08-24: registry invitations send email. NotificationsModule imports only
// AuditModule + SystemSettingsModule, so this adds no cycle.
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [AuditModule, StorageModule, NotificationsModule],
  controllers: [VendorsController, VendorInvitationsController],
  providers: [VendorsService, VendorDocumentStorageService, VendorInvitationsService],
  // VendorInvitationsService is exported so VendorAuthModule (which already
  // imports VendorsModule) can resolve an invite token during registration.
  exports: [VendorsService, VendorDocumentStorageService, VendorInvitationsService],
})
export class VendorsModule {}
