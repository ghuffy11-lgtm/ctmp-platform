import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { AuditRiskLevel, BidStatus, EnvelopeStatus, EnvelopeType, Prisma, TenderStatus, TenderVisibility } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { formatDeadline, vendorTenderBidDenial } from '../tenders/vendor-access';
import { AuditService } from '../audit/audit.service';
import { BidStorageService } from './bid-storage.service';
import { BidSupportingDocumentStorageService } from './bid-supporting-document-storage.service';
import { UploadEnvelopeDto } from './dto/upload-envelope.dto';
import { CommercialTermsDto } from './dto/commercial-terms.dto';
import {
  COMMERCIAL_TERMS_SELECT,
  CommercialTermsView,
  normalizeCommercialTerms,
  toCommercialTermsView,
} from './commercial-terms.util';

interface MulterFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@Injectable()
export class BidsService {
  private readonly logger = new Logger(BidsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: BidStorageService,
    private readonly audit: AuditService,
    private readonly supportingStorage: BidSupportingDocumentStorageService,
  ) {}

  async draftBid(tenderId: string, vendor: any) {
    const tender = await this.prisma.tender.findUnique({
      where: { id: tenderId },
      select: { id: true, status: true, visibility: true, submissionCloseAt: true },
    });
    if (!tender) throw new NotFoundException('Tender not found');

    // Owner report 2026-08-07: this used to raise "Cannot draft bid for tender
    // in SUBMISSION_CLOSED" — the internal status name leaked to the supplier
    // and explained nothing. vendorTenderBidDenial says what happened, when,
    // and what the vendor can do about it.
    const invited =
      tender.visibility !== TenderVisibility.INVITATION_ONLY ||
      (await this.prisma.tenderVendor.findUnique({
        where: { tenderId_vendorId: { tenderId, vendorId: vendor.vendorId } },
      })) != null;
    const denial = vendorTenderBidDenial(tender, invited);
    if (denial) throw new ForbiddenException(denial);

    // Reuse existing DRAFT bid if any; otherwise create with both envelopes in DRAFT.
    const existing = await this.prisma.bid.findFirst({
      where: { tenderId, vendorId: vendor.vendorId, isAlternative: false },
      include: { bidEnvelopes: true },
    });
    if (existing) {
      if (existing.status !== BidStatus.DRAFT) {
        throw new ConflictException(
        'You have already submitted a bid for this tender, and submitted bids cannot be changed. ' +
          'Open it under My Bids to review what you sent and your submission receipt.',
      );
      }
      return existing;
    }

    return this.prisma.bid.create({
      data: {
        tenderId,
        vendorId: vendor.vendorId,
        status: BidStatus.DRAFT,
        bidEnvelopes: {
          create: [
            { envelopeType: EnvelopeType.TECHNICAL, status: EnvelopeStatus.DRAFT },
            { envelopeType: EnvelopeType.COMMERCIAL, status: EnvelopeStatus.DRAFT },
          ],
        },
      },
      include: { bidEnvelopes: true },
    });
  }

  async uploadTechnical(bidId: string, dto: UploadEnvelopeDto, vendor: any) {
    return this.attachDocsToEnvelope(bidId, EnvelopeType.TECHNICAL, dto, vendor);
  }

  async uploadCommercial(bidId: string, dto: UploadEnvelopeDto, vendor: any) {
    return this.attachDocsToEnvelope(bidId, EnvelopeType.COMMERCIAL, dto, vendor);
  }

  // ───────────── Commercial terms (migration 052, 2026-08-06) ─────────────
  //
  // Bid-level: brand/manufacturer, country of origin, warranty, delivery
  // period and payment terms describe the whole offer, not a BOQ line. Kept
  // OFF the BOQ endpoint deliberately — ReplaceBidBoqDto requires at least one
  // line and full template coverage, so on a legacy tender with no BOQ
  // template that endpoint cannot be called at all, yet the vendor must still
  // be able to record terms.
  //
  // Every field is optional and NOTHING here may enter a submit precondition.

  /** Loads the bid and enforces "your bid, still a draft". */
  private async loadEditableBid(bidId: string, vendor: any) {
    const bid = await this.prisma.bid.findUnique({
      where: { id: bidId },
      select: { id: true, vendorId: true, tenderId: true, status: true, submittedAt: true },
    });
    if (!bid) throw new NotFoundException('Bid not found');
    if (!vendor?.vendorId || bid.vendorId !== vendor.vendorId) {
      throw new ForbiddenException('This bid belongs to another company.');
    }
    if (bid.status !== BidStatus.DRAFT || bid.submittedAt != null) {
      throw new ForbiddenException(
      'This bid has already been submitted, so it can no longer be edited. Submitted bids are locked and checksummed.',
    );
    }
    return bid;
  }

  async getCommercialTerms(bidId: string, vendor: any): Promise<CommercialTermsView> {
    const bid = await this.prisma.bid.findUnique({
      where: { id: bidId },
      select: { id: true, vendorId: true, ...COMMERCIAL_TERMS_SELECT },
    });
    if (!bid) throw new NotFoundException('Bid not found');
    if (!vendor?.vendorId || bid.vendorId !== vendor.vendorId) {
      throw new ForbiddenException('This bid belongs to another company.');
    }
    return toCommercialTermsView(bid);
  }

  async updateCommercialTerms(
    bidId: string,
    dto: CommercialTermsDto,
    vendor: any,
  ): Promise<CommercialTermsView> {
    const bid = await this.loadEditableBid(bidId, vendor);
    // Replaces the whole set — an omitted or null field clears the column.
    const columns = normalizeCommercialTerms(dto);

    const updated = await this.prisma.bid.update({
      where: { id: bidId },
      data: columns,
      select: COMMERCIAL_TERMS_SELECT,
    });

    await this.audit.log({
      eventType: 'BID_COMMERCIAL_TERMS_UPDATED',
      entityType: 'Bid',
      entityId: bidId,
      tenderId: bid.tenderId,
      bidId,
      actorVendorUserId: vendor.id,
      // Values themselves are commercial data — log which fields were filled,
      // not what they say.
      afterValue: {
        filled: Object.entries(columns)
          .filter(([, value]) => value != null)
          .map(([key]) => key),
      },
      riskLevel: AuditRiskLevel.LOW,
    });

    return toCommercialTermsView(updated);
  }

  async submit(bidId: string, vendor: any) {
    const bid = await this.prisma.bid.findUnique({
      where: { id: bidId },
      include: {
        // BUG-137 (2026-06-19): pull requiresSupportingDocuments from the
        // tender so submit can validate the new gate.
        tender: { select: { id: true, status: true, submissionCloseAt: true, requiresSupportingDocuments: true } },
        bidEnvelopes: { include: { bidDocuments: true } },
        lateException: { select: { status: true, expiresAt: true } },
        supportingDocuments: { select: { id: true } },
      },
    });
    if (!bid) throw new NotFoundException('Bid not found');
    if (bid.vendorId !== vendor.vendorId) throw new ForbiddenException('This bid belongs to another company.');
    if (bid.status !== BidStatus.DRAFT) {
      throw new ConflictException(
        'You have already submitted a bid for this tender, and submitted bids cannot be changed. ' +
          'Open it under My Bids to review what you sent and your submission receipt.',
      );
    }

    // Deadline check unless an exception is GRANTED and not expired.
    const now = new Date();
    const deadline = bid.tender.submissionCloseAt;
    const past = deadline && deadline.getTime() < now.getTime();
    if (past) {
      const exc = bid.lateException;
      if (!exc || exc.status !== 'GRANTED' || (exc.expiresAt && exc.expiresAt < now)) {
        // Owner report 2026-08-07: name the deadline and the way out, rather
        // than "no valid exception", which means nothing to a supplier.
        const when = formatDeadline(deadline);
        throw new BadRequestException(
          `The submission deadline${when ? ` (${when})` : ''} has passed, so this bid can no longer be submitted. ` +
            'Your draft is saved. If you have a genuine reason for a late submission, contact the procurement team — only they can grant an exception.',
        );
      }
    }

    // BUG-068 / Phase F BOQ: when the tender has a real BOQ template (not the
    // legacy placeholder backfill), the bid must cover every BOQ line with an
    // explicit BIDDING (with unit_price) or NOT_BIDDING status. The commercial
    // PDF envelope becomes OPTIONAL per owner decision 2026-05-31 — the BOQ is
    // the legal price record now. Technical envelope still requires ≥1 doc.
    const realBoqTemplate = await this.prisma.tenderBoqItem.findMany({
      where: {
        tenderId: bid.tenderId,
        NOT: { itemNo: '0', description: 'Legacy tender — no BOQ defined' },
      },
      select: { id: true },
    });
    const hasRealBoq = realBoqTemplate.length > 0;
    if (hasRealBoq) {
      const submitted = await this.prisma.bidBoqItem.findMany({
        where: { bidId: bid.id },
        select: { tenderBoqItemId: true },
      });
      const submittedIds = new Set(submitted.map(s => s.tenderBoqItemId));
      const missing = realBoqTemplate.filter(t => !submittedIds.has(t.id));
      if (missing.length > 0) {
        throw new BadRequestException(
          `Commercial BOQ incomplete: ${missing.length} line(s) have no status. Open the bid wizard and confirm every line (BIDDING with unit price OR NOT_BIDDING).`,
        );
      }
    }

    // BUG-137 (2026-06-19): both envelopes always require at least one PDF.
    // The old "skip commercial PDF when BoQ is filled" exception is removed —
    // the commercial PDF is the signed legal record alongside the BoQ.
    for (const env of bid.bidEnvelopes) {
      if (env.bidDocuments.length === 0) {
        const label = env.envelopeType === EnvelopeType.TECHNICAL ? 'Technical' : 'Commercial';
        throw new BadRequestException(`${label} envelope is empty — at least one PDF is required.`);
      }
    }

    // BUG-137 (2026-06-19): supporting documents gate. When the tender flag
    // is on, ≥1 supporting doc must be attached before submit.
    if (bid.tender.requiresSupportingDocuments && (bid as any).supportingDocuments.length === 0) {
      throw new BadRequestException(
        'This tender requires at least one supporting document. Upload one before submitting.',
      );
    }

    // Generate receipt: SHA-256 over canonical snapshot.
    const receiptNumber = `RCPT-${Date.now()}-${randomBytes(3).toString('hex').toUpperCase()}`;
    const documentChecksums = bid.bidEnvelopes.flatMap(env =>
      env.bidDocuments.map(d => ({
        documentId: d.id,
        filename: d.originalFilename,
        checksumSha256: d.checksumSha256,
        envelopeType: env.envelopeType,
      })),
    );
    const snapshot = {
      bidId: bid.id,
      tenderId: bid.tenderId,
      vendorId: bid.vendorId,
      receiptNumber,
      submittedAt: now.toISOString(),
      documents: documentChecksums,
    };
    const receiptHash = createHash('sha256')
      .update(JSON.stringify(snapshot))
      .digest('hex');

    // Atomic: flip bid + envelopes to SUBMITTED, mark docs submittedAt + lockedAt, create receipt.
    await this.prisma.$transaction([
      this.prisma.bid.update({
        where: { id: bid.id },
        data: {
          status: past ? BidStatus.LATE_SUBMITTED : BidStatus.SUBMITTED,
          submittedAt: now,
          submittedByVendorUserId: vendor.id,
        },
      }),
      this.prisma.bidEnvelope.updateMany({
        where: { bidId: bid.id, envelopeType: EnvelopeType.TECHNICAL },
        data: { status: EnvelopeStatus.SUBMITTED, submittedAt: now, lockedAt: now },
      }),
      // Commercial seals immediately on submit; it doesn't go to SEALED until tender
      // moves to Commercial Sealed by technical-evaluation.finalize. For now mark SUBMITTED.
      this.prisma.bidEnvelope.updateMany({
        where: { bidId: bid.id, envelopeType: EnvelopeType.COMMERCIAL },
        data: { status: EnvelopeStatus.SUBMITTED, submittedAt: now, lockedAt: now },
      }),
      this.prisma.bidDocument.updateMany({
        where: { bidEnvelope: { bidId: bid.id } },
        data: { submittedAt: now, lockedAt: now },
      }),
      // BUG-137 (2026-06-19): lock the supporting docs too so they're
      // immutable post-submit.
      this.prisma.bidSupportingDocument.updateMany({
        where: { bidId: bid.id, lockedAt: null },
        data: { lockedAt: now },
      }),
      this.prisma.bidSubmissionReceipt.create({
        data: {
          bidId: bid.id,
          receiptNumber,
          receiptHash,
          snapshot: snapshot as Prisma.InputJsonValue,
          generatedForVendorUserId: vendor.id,
        },
      }),
    ]);

    return {
      bidId: bid.id,
      receiptNumber,
      receiptHash,
      submittedAt: now.toISOString(),
      documentChecksums,
    };
  }

  async getReceipt(bidId: string, vendor: any) {
    const receipt = await this.prisma.bidSubmissionReceipt.findUnique({
      where: { bidId },
      include: { bid: { select: { vendorId: true } } },
    });
    if (!receipt) throw new NotFoundException('Receipt not found');
    if (receipt.bid.vendorId !== vendor.vendorId) throw new ForbiddenException('This bid belongs to another company.');
    return {
      id: receipt.id,
      bidId: receipt.bidId,
      receiptNumber: receipt.receiptNumber,
      receiptHash: receipt.receiptHash,
      submittedAt: receipt.generatedAt.toISOString(),
      snapshot: receipt.snapshot,
    };
  }

  async downloadDocument(bidId: string, documentId: string, user: any) {
    const doc = await this.prisma.bidDocument.findFirst({
      where: {
        id: documentId,
        bidEnvelope: { bidId },
      },
      include: { bidEnvelope: { select: { envelopeType: true, status: true, bid: { select: { vendorId: true } } } } },
    });
    if (!doc) throw new NotFoundException('Document not found');

    const isVendor = !!user?.vendorId;
    if (isVendor) {
      // Vendor can re-download their own DRAFT envelope contents pre-submit.
      if (doc.bidEnvelope.bid.vendorId !== user.vendorId) {
        throw new ForbiddenException('This bid belongs to another company.');
      }
    } else if (doc.bidEnvelope.envelopeType === EnvelopeType.TECHNICAL) {
      if (doc.bidEnvelope.status !== EnvelopeStatus.OPENED) {
        throw new ForbiddenException('Technical envelope not yet opened');
      }
    } else {
      const perms: string[] = user?.permissions ?? [];
      if (!perms.includes('commercial:download')) {
        throw new ForbiddenException('commercial:download permission required');
      }
      if (doc.bidEnvelope.status !== EnvelopeStatus.OPENED) {
        throw new ForbiddenException('Commercial envelope not yet opened by committee');
      }
    }

    const { stream, size, mimeType } = await this.storage.stream(doc.storageKey);
    return {
      id: doc.id,
      filename: doc.originalFilename,
      mimeType: doc.mimeType || mimeType,
      checksumSha256: doc.checksumSha256,
      fileSize: size,
      stream,
    };
  }

  async uploadDocument(bidId: string, envelopeType: EnvelopeType, file: MulterFile, vendor: any) {
    if (!file) throw new BadRequestException('File is required');
    // Master plan rule E1: PDF-only at upload time. Reject mime mismatch AND
    // verify the magic header — a curl client can spoof the multipart mime.
    if (file.mimetype !== 'application/pdf') {
      throw new BadRequestException('Only PDF files are accepted. Other file types are not supported.');
    }
    const head = file.buffer?.subarray(0, 5).toString('ascii');
    if (head !== '%PDF-') {
      throw new BadRequestException('File does not appear to be a valid PDF.');
    }
    const bid = await this.prisma.bid.findUnique({
      where: { id: bidId },
      select: { id: true, vendorId: true, status: true, tenderId: true },
    });
    if (!bid) throw new NotFoundException('Bid not found');
    if (bid.vendorId !== vendor.vendorId) throw new ForbiddenException('This bid belongs to another company.');
    if (bid.status !== BidStatus.DRAFT) {
      throw new ConflictException('Bid is no longer editable');
    }

    const envelope = await this.prisma.bidEnvelope.findFirst({
      where: { bidId, envelopeType },
    });
    if (!envelope) throw new NotFoundException('Envelope not found');
    if (envelope.status !== EnvelopeStatus.DRAFT) {
      throw new ConflictException(`Envelope is ${envelope.status}; only DRAFT envelopes accept uploads`);
    }

    const docId = randomUUID();
    const { storageKey, checksumSha256, fileSize } = await this.storage.write({
      bidId,
      envelopeId: envelope.id,
      docId,
      originalFilename: file.originalname,
      payload: file.buffer,
    });

    const doc = await this.prisma.bidDocument.create({
      data: {
        id: docId,
        bidEnvelopeId: envelope.id,
        originalFilename: file.originalname,
        storageKey,
        mimeType: file.mimetype || 'application/octet-stream',
        fileSize: BigInt(fileSize),
        checksumSha256,
      },
    });

    await this.audit.log({
      eventType: 'BID_DOCUMENT_UPLOADED',
      entityType: 'BidDocument',
      entityId: doc.id,
      tenderId: bid.tenderId,
      bidId,
      vendorId: vendor.vendorId,
      actorVendorUserId: vendor.id,
      afterValue: {
        envelopeType,
        filename: doc.originalFilename,
        fileSize,
        checksumSha256,
      },
      riskLevel: AuditRiskLevel.LOW,
    });

    return {
      id: doc.id,
      bidEnvelopeId: envelope.id,
      envelopeType,
      filename: doc.originalFilename,
      mimeType: doc.mimeType,
      fileSize,
      checksumSha256,
      uploadedAt: doc.uploadedAt.toISOString(),
    };
  }

  async deleteDocument(bidId: string, documentId: string, vendor: any) {
    const doc = await this.prisma.bidDocument.findFirst({
      where: { id: documentId, bidEnvelope: { bidId } },
      include: {
        bidEnvelope: {
          select: {
            id: true,
            envelopeType: true,
            status: true,
            bid: { select: { id: true, vendorId: true, status: true, tenderId: true } },
          },
        },
      },
    });
    if (!doc) throw new NotFoundException('Document not found');
    if (doc.bidEnvelope.bid.vendorId !== vendor.vendorId) {
      throw new ForbiddenException('This bid belongs to another company.');
    }
    if (doc.bidEnvelope.bid.status !== BidStatus.DRAFT) {
      throw new ConflictException('Bid is no longer editable');
    }
    if (doc.bidEnvelope.status !== EnvelopeStatus.DRAFT) {
      throw new ConflictException('Envelope is no longer editable');
    }

    await this.prisma.bidDocument.delete({ where: { id: doc.id } });
    await this.storage.delete(doc.storageKey);

    await this.audit.log({
      eventType: 'BID_DOCUMENT_DELETED',
      entityType: 'BidDocument',
      entityId: doc.id,
      tenderId: doc.bidEnvelope.bid.tenderId,
      bidId,
      vendorId: vendor.vendorId,
      actorVendorUserId: vendor.id,
      beforeValue: {
        envelopeType: doc.bidEnvelope.envelopeType,
        filename: doc.originalFilename,
        checksumSha256: doc.checksumSha256,
      },
      riskLevel: AuditRiskLevel.LOW,
    });

    return { ok: true };
  }

  async listEnvelopeDocuments(bidId: string, envelopeType: EnvelopeType, user: any) {
    const bid = await this.prisma.bid.findUnique({
      where: { id: bidId },
      select: { id: true, vendorId: true },
    });
    if (!bid) throw new NotFoundException('Bid not found');

    const envelope = await this.prisma.bidEnvelope.findFirst({
      where: { bidId, envelopeType },
      include: { bidDocuments: true },
    });
    if (!envelope) throw new NotFoundException('Envelope not found');

    // Access model mirrors downloadDocument(): vendors only see their own bid;
    // admins need the envelope to be OPENED (TECHNICAL) or OPENED + either the
    // legacy `commercial:view` OR the new `comparison:commercial:view`
    // (COMMERCIAL). BUG-052: accept either perm so committee members holding
    // only the new perm can expand cards on the Commercial Comparison page.
    const isVendor = !!user?.vendorId;
    if (isVendor) {
      if (bid.vendorId !== user.vendorId) throw new ForbiddenException('This bid belongs to another company.');
    } else if (envelopeType === EnvelopeType.TECHNICAL) {
      if (envelope.status !== EnvelopeStatus.OPENED) {
        throw new ForbiddenException('Technical envelope not yet opened');
      }
    } else {
      const perms: string[] = user?.permissions ?? [];
      if (!perms.includes('commercial:view') && !perms.includes('comparison:commercial:view')) {
        throw new ForbiddenException('commercial:view permission required');
      }
      if (envelope.status !== EnvelopeStatus.OPENED) {
        throw new ForbiddenException('Commercial envelope not yet opened by committee');
      }
    }

    return {
      envelopeId: envelope.id,
      envelopeType,
      status: envelope.status,
      documents: envelope.bidDocuments.map(d => ({
        id: d.id,
        filename: d.originalFilename,
        mimeType: d.mimeType,
        fileSize: Number(d.fileSize),
        checksumSha256: d.checksumSha256,
        uploadedAt: d.uploadedAt.toISOString(),
      })),
    };
  }

  /**
   * Phase A — BUG-037. Stream a bid document inline for the in-app PDF viewer
   * modal. Access checks mirror downloadDocument(); on success the view is
   * audit-logged BEFORE the stream is returned to the caller (master plan rule:
   * no failing-open on audit). Vendor self-views of their own bid skip the
   * document_view_log write — that table is for non-owner access tracking.
   */
  async viewBidDocument(bidId: string, documentId: string, user: any) {
    const doc = await this.prisma.bidDocument.findFirst({
      where: { id: documentId, bidEnvelope: { bidId } },
      include: {
        bidEnvelope: {
          select: {
            envelopeType: true,
            status: true,
            bid: { select: { vendorId: true, tenderId: true } },
          },
        },
      },
    });
    if (!doc) throw new NotFoundException('Document not found');

    // Master plan A: PDF-only viewer. Non-PDF documents (legacy text/plain etc.
    // from before BUG-037 upload enforcement) are not streamable through the
    // view path — the frontend modal viewer assumes PDF.
    if (doc.mimeType && doc.mimeType !== 'application/pdf') {
      throw new BadRequestException(
        `Viewer accepts application/pdf only; this document is ${doc.mimeType}`,
      );
    }

    const isVendor = !!user?.vendorId;
    if (isVendor) {
      if (doc.bidEnvelope.bid.vendorId !== user.vendorId) {
        throw new ForbiddenException('This bid belongs to another company.');
      }
    } else if (doc.bidEnvelope.envelopeType === EnvelopeType.TECHNICAL) {
      if (doc.bidEnvelope.status !== EnvelopeStatus.OPENED) {
        throw new ForbiddenException('Technical envelope not yet opened');
      }
    } else {
      const perms: string[] = user?.permissions ?? [];
      if (!perms.includes('commercial:view')) {
        throw new ForbiddenException('commercial:view permission required');
      }
      if (doc.bidEnvelope.status !== EnvelopeStatus.OPENED) {
        throw new ForbiddenException('Commercial envelope not yet opened by committee');
      }
    }

    if (!isVendor && user?.id) {
      await this.audit.logDocumentView({
        userId: user.id,
        bidDocumentId: doc.id,
        tenderId: doc.bidEnvelope.bid.tenderId,
        bidId,
        viewContext:
          doc.bidEnvelope.envelopeType === EnvelopeType.TECHNICAL
            ? 'technical-evaluation'
            : 'commercial-comparison',
      });
    }

    const { stream, size, mimeType } = await this.storage.stream(doc.storageKey);
    return {
      id: doc.id,
      filename: doc.originalFilename,
      mimeType: doc.mimeType || mimeType,
      fileSize: size,
      stream,
    };
  }

  async listForTender(tenderId: string, page: number, pageSize: number) {
    const skip = (page - 1) * pageSize;
    const [total, bids] = await this.prisma.$transaction([
      this.prisma.bid.count({ where: { tenderId } }),
      this.prisma.bid.findMany({
        where: { tenderId },
        skip,
        take: pageSize,
        orderBy: { submittedAt: 'desc' },
        include: {
          vendor: { select: { companyName: true } },
          bidEnvelopes: { select: { envelopeType: true, status: true } },
        },
      }),
    ]);

    return {
      total,
      items: bids.map(b => {
        const technical = b.bidEnvelopes.find(e => e.envelopeType === EnvelopeType.TECHNICAL);
        const commercial = b.bidEnvelopes.find(e => e.envelopeType === EnvelopeType.COMMERCIAL);
        return {
          id: b.id,
          vendorId: b.vendorId,
          vendorCompany: b.vendor.companyName,
          submittedAt: b.submittedAt?.toISOString(),
          technicalEnvelopeStatus: technical?.status ?? EnvelopeStatus.DRAFT,
          commercialEnvelopeStatus: commercial?.status ?? EnvelopeStatus.DRAFT,
          technicalResult: b.technicalResult === 'PENDING' ? undefined : b.technicalResult,
          commercialDetailsVisible: false,
        };
      }),
    };
  }

  // -----------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------

  private async attachDocsToEnvelope(
    bidId: string,
    envelopeType: EnvelopeType,
    dto: UploadEnvelopeDto,
    vendor: any,
  ) {
    const bid = await this.prisma.bid.findUnique({
      where: { id: bidId },
      select: { id: true, vendorId: true, status: true },
    });
    if (!bid) throw new NotFoundException('Bid not found');
    if (bid.vendorId !== vendor.vendorId) throw new ForbiddenException('This bid belongs to another company.');
    if (bid.status !== BidStatus.DRAFT) {
      throw new ConflictException('Bid is no longer editable');
    }

    const envelope = await this.prisma.bidEnvelope.findFirst({
      where: { bidId, envelopeType },
    });
    if (!envelope) throw new NotFoundException('Envelope not found');
    if (envelope.status !== EnvelopeStatus.DRAFT) {
      throw new ConflictException(`Envelope is ${envelope.status}; only DRAFT envelopes accept uploads`);
    }

    // Move documents into this envelope. (Real impl: pre-uploaded via separate /uploads
    // endpoint with checksum; here we just verify the docs reference this envelope.)
    const docs = await this.prisma.bidDocument.findMany({
      where: { id: { in: dto.documentIds }, bidEnvelopeId: envelope.id },
    });
    if (docs.length !== dto.documentIds.length) {
      throw new BadRequestException('One or more documentIds not associated with this envelope');
    }

    return { envelopeId: envelope.id, documentCount: docs.length };
  }

  // ----------------------------------------------------------------
  // BUG-137 (2026-06-19): bid supporting documents
  // ----------------------------------------------------------------

  async listSupportingDocuments(bidId: string, user: any) {
    const bid = await this.prisma.bid.findUnique({
      where: { id: bidId },
      select: {
        id: true,
        vendorId: true,
        // BUG-142 (2026-06-19): supporting docs are surfaced inside the
        // Commercial Comparison per-vendor card alongside the priced offer,
        // so the gate follows the commercial envelope only. (Was both-
        // envelopes in BUG-139, when these docs lived on the Bids tab.)
        bidEnvelopes: { select: { envelopeType: true, status: true } },
      },
    });
    if (!bid) throw new NotFoundException('Bid not found');

    // Authorisation: bid's vendor (own data) OR an admin user gated on the
    // commercial-envelope-opening rule below.
    const isVendor = !!user?.vendorId;
    if (isVendor && user.vendorId !== bid.vendorId) {
      throw new ForbiddenException('This bid belongs to another company.');
    }
    if (!isVendor && !BidsService.commercialEnvelopeOpened(bid.bidEnvelopes)) {
      throw new ForbiddenException(
        'Supporting documents become visible once the commercial envelope is opened.',
      );
    }

    const docs = await this.prisma.bidSupportingDocument.findMany({
      where: { bidId },
      orderBy: { uploadedAt: 'asc' },
      select: {
        id: true,
        originalFilename: true,
        mimeType: true,
        fileSize: true,
        checksumSha256: true,
        uploadedAt: true,
        lockedAt: true,
      },
    });
    return {
      bidId,
      items: docs.map(d => ({
        id: d.id,
        filename: d.originalFilename,
        mimeType: d.mimeType,
        fileSize: Number(d.fileSize),
        checksumSha256: d.checksumSha256,
        uploadedAt: d.uploadedAt.toISOString(),
        lockedAt: d.lockedAt?.toISOString() ?? null,
      })),
    };
  }

  // BUG-142 (2026-06-19): commercial-envelope-opened gate for supporting
  // docs. Supersedes BUG-139's both-envelopes gate now that the surface is
  // the Commercial Comparison per-vendor card, not the tender Bids tab.
  // Single source of truth used by listSupportingDocuments + stream.
  private static commercialEnvelopeOpened(
    bidEnvelopes: Array<{ envelopeType: EnvelopeType | string; status: EnvelopeStatus | string }>,
  ): boolean {
    const commercial = bidEnvelopes.find(e => e.envelopeType === EnvelopeType.COMMERCIAL);
    return commercial?.status === EnvelopeStatus.OPENED;
  }

  async uploadSupportingDocument(bidId: string, file: MulterFile, vendor: any) {
    if (!file) throw new BadRequestException('File is required');
    if (file.mimetype !== 'application/pdf') {
      throw new BadRequestException('Only PDF files are accepted for supporting documents.');
    }
    const head = file.buffer?.subarray(0, 5).toString('ascii');
    if (head !== '%PDF-') {
      throw new BadRequestException('File does not appear to be a valid PDF.');
    }
    const MAX = 10 * 1024 * 1024;
    if (file.size > MAX) throw new BadRequestException('File exceeds 10 MB limit.');

    const bid = await this.prisma.bid.findUnique({
      where: { id: bidId },
      select: { id: true, vendorId: true, status: true },
    });
    if (!bid) throw new NotFoundException('Bid not found');
    if (bid.vendorId !== vendor.vendorId) throw new ForbiddenException('This bid belongs to another company.');
    if (bid.status !== BidStatus.DRAFT) {
      throw new ConflictException('Bid already submitted; supporting documents are locked.');
    }

    const docId = randomUUID();
    const { storageKey, checksumSha256, fileSize } = await this.supportingStorage.write({
      bidId,
      docId,
      originalFilename: file.originalname,
      payload: file.buffer,
      mimeType: file.mimetype,
    });

    // BUG-138 (2026-06-19): unique-checksum index removed — vendors can
    // attach the same PDF more than once if they want to.
    const doc = await this.prisma.bidSupportingDocument.create({
      data: {
        id: docId,
        bidId,
        originalFilename: file.originalname,
        storageKey,
        mimeType: file.mimetype,
        fileSize: BigInt(fileSize),
        checksumSha256,
        uploadedByVendorUserId: vendor.id,
      },
    });

    await this.audit.log({
      eventType: 'BID_SUPPORTING_DOCUMENT_UPLOADED',
      entityType: 'BidSupportingDocument',
      entityId: doc.id,
      bidId,
      actorVendorUserId: vendor.id,
      afterValue: { filename: doc.originalFilename, sha256: checksumSha256, fileSize },
      riskLevel: AuditRiskLevel.MEDIUM,
    });

    return {
      id: doc.id,
      filename: doc.originalFilename,
      fileSize,
      checksumSha256,
      uploadedAt: doc.uploadedAt.toISOString(),
    };
  }

  async deleteSupportingDocument(bidId: string, documentId: string, vendor: any) {
    const doc = await this.prisma.bidSupportingDocument.findUnique({
      where: { id: documentId },
      select: { id: true, bidId: true, storageKey: true, lockedAt: true, originalFilename: true,
        bid: { select: { vendorId: true, status: true } } } as any,
    });
    if (!doc || doc.bidId !== bidId) throw new NotFoundException('Document not found');
    const docBid = (doc as any).bid;
    if (!docBid || docBid.vendorId !== vendor.vendorId) {
      throw new ForbiddenException('This bid belongs to another company.');
    }
    if (docBid.status !== BidStatus.DRAFT || doc.lockedAt) {
      throw new ConflictException('Bid already submitted; supporting documents are locked.');
    }

    await this.prisma.bidSupportingDocument.delete({ where: { id: documentId } });
    await this.supportingStorage.delete(doc.storageKey).catch(() => undefined);

    await this.audit.log({
      eventType: 'BID_SUPPORTING_DOCUMENT_DELETED',
      entityType: 'BidSupportingDocument',
      entityId: documentId,
      bidId,
      actorVendorUserId: vendor.id,
      beforeValue: { filename: doc.originalFilename },
      riskLevel: AuditRiskLevel.MEDIUM,
    });
  }

  async streamSupportingDocument(
    bidId: string,
    documentId: string,
    user: any,
    mode: 'view' | 'download',
  ): Promise<{
    filename: string;
    mimeType: string;
    fileSize: number;
    checksumSha256: string;
    stream: import('stream').Readable;
  }> {
    const doc = await this.prisma.bidSupportingDocument.findUnique({
      where: { id: documentId },
      select: {
        id: true, bidId: true, originalFilename: true, storageKey: true,
        mimeType: true, fileSize: true, checksumSha256: true,
        bid: {
          select: {
            vendorId: true,
            status: true,
            // BUG-139 (2026-06-19): need envelope statuses for the gate.
            bidEnvelopes: { select: { envelopeType: true, status: true } },
          },
        },
      } as any,
    });
    if (!doc || doc.bidId !== bidId) throw new NotFoundException('Document not found');
    const docBid = (doc as any).bid;

    const isVendor = !!user?.vendorId;
    if (isVendor) {
      if (docBid.vendorId !== user.vendorId) throw new ForbiddenException('This bid belongs to another company.');
    } else {
      const perms: string[] = user?.permissions ?? [];
      // Admin/evaluator side: gate behind technical:view (same level as
      // technical envelope documents — supporting docs are non-commercial).
      if (!perms.includes('technical:view') && !perms.includes('vendor:view')) {
        throw new ForbiddenException('technical:view or vendor:view permission required');
      }
      // BUG-142 (2026-06-19): commercial envelope must be OPENED before
      // admins can view supporting documents. Surface is the Commercial
      // Comparison per-vendor card; gate follows the commercial side.
      if (!BidsService.commercialEnvelopeOpened(docBid.bidEnvelopes ?? [])) {
        throw new ForbiddenException(
          'Supporting documents become visible once the commercial envelope is opened.',
        );
      }
    }

    await this.audit.log({
      eventType: mode === 'view' ? 'BID_SUPPORTING_DOCUMENT_VIEWED' : 'BID_SUPPORTING_DOCUMENT_DOWNLOADED',
      entityType: 'BidSupportingDocument',
      entityId: documentId,
      bidId,
      actorUserId: isVendor ? undefined : (user?.id ?? undefined),
      actorVendorUserId: isVendor ? (user?.id ?? undefined) : undefined,
      afterValue: { filename: doc.originalFilename, sha256: doc.checksumSha256 },
      riskLevel: AuditRiskLevel.LOW,
    });

    const { stream, size, mimeType } = await this.supportingStorage.stream(doc.storageKey);
    return {
      filename: doc.originalFilename,
      mimeType: doc.mimeType || mimeType,
      fileSize: Number(doc.fileSize) || size,
      checksumSha256: doc.checksumSha256,
      stream,
    };
  }
}
