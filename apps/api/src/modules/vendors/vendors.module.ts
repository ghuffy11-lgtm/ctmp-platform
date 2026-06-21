import { Module } from '@nestjs/common';
import { VendorsController } from './vendors.controller';
import { VendorsService } from './vendors.service';
import { VendorDocumentStorageService } from './vendor-document-storage.service';
import { AuditModule } from '../audit/audit.module';
import { StorageModule } from '../../common/storage/storage.module';

@Module({
  imports: [AuditModule, StorageModule],
  controllers: [VendorsController],
  providers: [VendorsService, VendorDocumentStorageService],
  exports: [VendorsService, VendorDocumentStorageService],
})
export class VendorsModule {}
