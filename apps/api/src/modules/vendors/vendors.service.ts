import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { VendorStatus, AuditRiskLevel } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { VendorDocumentStorageService } from './vendor-document-storage.service';
import { UpdateVendorDto } from './dto/update-vendor.dto';

interface ListVendorsArgs {
  status?: string;
  page: number;
  pageSize: number;
}

// External API uses PENDING_APPROVAL; internal schema uses PENDING.
const STATUS_API_TO_DB: Record<string, VendorStatus> = {
  PENDING_APPROVAL: VendorStatus.PENDING,
  APPROVED: VendorStatus.APPROVED,
  REJECTED: VendorStatus.REJECTED,
  SUSPENDED: VendorStatus.SUSPENDED,
  BLACKLISTED: VendorStatus.BLACKLISTED,
};

const STATUS_DB_TO_API: Record<VendorStatus, string> = {
  PENDING: 'PENDING_APPROVAL',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  SUSPENDED: 'SUSPENDED',
  BLACKLISTED: 'BLACKLISTED',
};

@Injectable()
export class VendorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly docStorage: VendorDocumentStorageService,
  ) {}

  async findAll(args: ListVendorsArgs) {
    const where = args.status && STATUS_API_TO_DB[args.status]
      ? { status: STATUS_API_TO_DB[args.status] }
      : {};

    const skip = (args.page - 1) * args.pageSize;
    const [total, vendors] = await this.prisma.$transaction([
      this.prisma.vendor.count({ where }),
      this.prisma.vendor.findMany({
        where,
        skip,
        take: args.pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          vendorUsers: {
            where: { isPrimaryContact: true },
            take: 1,
            select: {
              email: true,
              fullName: true,
              phone: true,
              emailVerifiedAt: true,
              lastLoginAt: true,
            },
          },
          _count: { select: { vendorDocuments: true } },
        },
      }),
    ]);

    return {
      page: args.page,
      pageSize: args.pageSize,
      total,
      items: vendors.map(v => this.mapVendor(v)),
    };
  }

  async findOne(id: string) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { id },
      include: {
        vendorUsers: {
          where: { isPrimaryContact: true },
          take: 1,
          select: {
            email: true,
            fullName: true,
            phone: true,
            emailVerifiedAt: true,
            lastLoginAt: true,
          },
        },
        _count: { select: { vendorDocuments: true } },
      },
    });
    if (!vendor) throw new NotFoundException('Vendor not found');
    return this.mapVendor(vendor);
  }

  async approve(id: string, actorUserId: string) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { id },
      include: {
        vendorUsers: {
          where: { isPrimaryContact: true },
          take: 1,
          select: { emailVerifiedAt: true },
        },
      },
    });
    if (!vendor) throw new NotFoundException('Vendor not found');
    if (vendor.status !== VendorStatus.PENDING) {
      throw new BadRequestException(`Vendor is ${vendor.status}; can only approve from PENDING`);
    }
    const primaryVerified = vendor.vendorUsers[0]?.emailVerifiedAt;
    if (!primaryVerified) {
      throw new BadRequestException('Primary contact email must be verified before approval');
    }

    const updated = await this.prisma.vendor.update({
      where: { id },
      data: {
        status: VendorStatus.APPROVED,
        approvedBy: actorUserId,
        approvedAt: new Date(),
      },
    });

    await this.audit.log({
      eventType: 'VENDOR_APPROVED',
      entityType: 'Vendor',
      entityId: id,
      vendorId: id,
      actorUserId,
      beforeValue: { status: VendorStatus.PENDING },
      afterValue: { status: VendorStatus.APPROVED, approvedAt: updated.approvedAt },
      riskLevel: AuditRiskLevel.MEDIUM,
    });

    return this.findOne(id);
  }

  async reject(id: string, reason: string, actorUserId: string) {
    if (!reason?.trim()) throw new BadRequestException('Rejection reason required for audit');
    const vendor = await this.prisma.vendor.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!vendor) throw new NotFoundException('Vendor not found');
    if (vendor.status !== VendorStatus.PENDING) {
      throw new BadRequestException(`Vendor is ${vendor.status}; can only reject from PENDING`);
    }

    await this.prisma.vendor.update({
      where: { id },
      data: { status: VendorStatus.REJECTED },
    });

    await this.audit.log({
      eventType: 'VENDOR_REJECTED',
      entityType: 'Vendor',
      entityId: id,
      vendorId: id,
      actorUserId,
      beforeValue: { status: VendorStatus.PENDING },
      afterValue: { status: VendorStatus.REJECTED },
      reason,
      riskLevel: AuditRiskLevel.MEDIUM,
    });

    return this.findOne(id);
  }

  async suspend(id: string, reason: string, actorUserId: string) {
    if (!reason?.trim()) throw new BadRequestException('Suspension reason required for audit');
    const vendor = await this.prisma.vendor.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!vendor) throw new NotFoundException('Vendor not found');
    if (vendor.status !== VendorStatus.APPROVED) {
      throw new BadRequestException(`Vendor is ${vendor.status}; can only suspend from APPROVED`);
    }

    // Revoke active vendor user sessions by bumping token version.
    await this.prisma.$transaction([
      this.prisma.vendor.update({
        where: { id },
        data: { status: VendorStatus.SUSPENDED, suspensionReason: reason },
      }),
      this.prisma.vendorUser.updateMany({
        where: { vendorId: id },
        data: { tokenVersion: { increment: 1 } },
      }),
    ]);

    await this.audit.log({
      eventType: 'VENDOR_SUSPENDED',
      entityType: 'Vendor',
      entityId: id,
      vendorId: id,
      actorUserId,
      beforeValue: { status: VendorStatus.APPROVED },
      afterValue: { status: VendorStatus.SUSPENDED, suspensionReason: reason },
      reason,
      riskLevel: AuditRiskLevel.HIGH,
    });

    return this.findOne(id);
  }

  async update(id: string, dto: UpdateVendorDto) {
    // TODO: audit log
    throw new Error('Not implemented');
  }

  // BUG-137 (2026-06-19): vendor registration documents — list, view, download.
  async listDocuments(vendorId: string) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { id: vendorId },
      select: { id: true },
    });
    if (!vendor) throw new NotFoundException('Vendor not found');
    const docs = await this.prisma.vendorDocument.findMany({
      where: { vendorId },
      orderBy: { uploadedAt: 'asc' },
      select: {
        id: true,
        documentType: true,
        originalFilename: true,
        mimeType: true,
        fileSize: true,
        checksumSha256: true,
        expiryDate: true,
        uploadedAt: true,
      },
    });
    return {
      vendorId,
      items: docs.map(d => ({
        id: d.id,
        documentType: d.documentType,
        filename: d.originalFilename,
        mimeType: d.mimeType,
        fileSize: Number(d.fileSize),
        checksumSha256: d.checksumSha256,
        expiryDate: d.expiryDate?.toISOString() ?? null,
        uploadedAt: d.uploadedAt.toISOString(),
      })),
    };
  }

  async getDocument(
    vendorId: string,
    documentId: string,
    user: any,
    mode: 'view' | 'download',
  ) {
    const doc = await this.prisma.vendorDocument.findUnique({
      where: { id: documentId },
      select: {
        id: true,
        vendorId: true,
        documentType: true,
        originalFilename: true,
        storageKey: true,
        mimeType: true,
        fileSize: true,
        checksumSha256: true,
      },
    });
    if (!doc || doc.vendorId !== vendorId) throw new NotFoundException('Document not found');

    // Authorisation: either an admin user with vendor:view OR the vendor's
    // own vendor user.
    const isVendor = !!user?.vendorId;
    if (isVendor) {
      if (user.vendorId !== vendorId) throw new ForbiddenException('Not your document');
    } else {
      const perms: string[] = user?.permissions ?? [];
      if (!perms.includes('vendor:view')) {
        throw new ForbiddenException('vendor:view permission required');
      }
    }

    // Audit BEFORE streaming so a failed stream doesn't drop the audit row.
    // HIGH severity — registration docs may contain PII.
    await this.audit.log({
      eventType: mode === 'view' ? 'VENDOR_DOCUMENT_VIEWED' : 'VENDOR_DOCUMENT_DOWNLOADED',
      entityType: 'VendorDocument',
      entityId: documentId,
      vendorId,
      actorUserId: isVendor ? undefined : (user?.id ?? undefined),
      actorVendorUserId: isVendor ? (user?.id ?? undefined) : undefined,
      afterValue: {
        documentType: doc.documentType,
        filename: doc.originalFilename,
        sha256: doc.checksumSha256,
      },
      riskLevel: AuditRiskLevel.HIGH,
    });

    const { stream, size, mimeType } = await this.docStorage.stream(doc.storageKey);
    return {
      filename: doc.originalFilename,
      mimeType: doc.mimeType || mimeType,
      fileSize: Number(doc.fileSize) || size,
      checksumSha256: doc.checksumSha256,
      stream,
    };
  }

  private mapVendor(v: any) {
    const primary = v.vendorUsers?.[0];
    return {
      id: v.id,
      company: v.companyName,
      email: primary?.email ?? '',
      contactName: primary?.fullName ?? '',
      contactPhone: primary?.phone ?? v.phone ?? undefined,
      country: v.country ?? undefined,
      category: undefined,
      taxId: v.taxNumber ?? undefined,
      registrationStatus: STATUS_DB_TO_API[v.status as VendorStatus],
      emailVerified: !!primary?.emailVerifiedAt,
      registeredAt: v.createdAt.toISOString(),
      approvedAt: v.approvedAt?.toISOString(),
      lastLoginAt: primary?.lastLoginAt?.toISOString(),
      documentCount: v._count?.vendorDocuments ?? 0,
    };
  }
}
