import { Module } from '@nestjs/common';
import { BidsController } from './bids.controller';
import { BidsService } from './bids.service';
import { BidStorageService } from './bid-storage.service';
import { BidSupportingDocumentStorageService } from './bid-supporting-document-storage.service';
import { AuditModule } from '../audit/audit.module';
import { StorageModule } from '../../common/storage/storage.module';

@Module({
  imports: [AuditModule, StorageModule],
  controllers: [BidsController],
  providers: [BidsService, BidStorageService, BidSupportingDocumentStorageService],
  exports: [BidsService],
})
export class BidsModule {}
