import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { VendorAuthService } from './vendor-auth.service';
import { PrismaService } from '../../database/prisma.service';
import { CaptchaService } from '../../common/services/captcha.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';
import { SystemSettingsService } from '../system-settings/system-settings.service';
import { VendorDocumentStorageService } from '../vendors/vendor-document-storage.service';

// ------------------------------------------------------------------
// Mock bcrypt
// ------------------------------------------------------------------
const mockBcryptHash = jest.fn();
const mockBcryptCompare = jest.fn();
jest.mock('bcrypt', () => ({
  hash: (...args: any[]) => mockBcryptHash(...args),
  compare: (...args: any[]) => mockBcryptCompare(...args),
}));

// ------------------------------------------------------------------
// Mock otplib
// ------------------------------------------------------------------
const mockTotpVerify = jest.fn();
jest.mock('otplib', () => ({
  TOTP: jest.fn().mockImplementation(() => ({ verify: mockTotpVerify })),
}));

// ------------------------------------------------------------------
// Fixtures
// ------------------------------------------------------------------
const futureDate = () => new Date(Date.now() + 60 * 60 * 1000);
const pastDate = () => new Date(Date.now() - 60 * 60 * 1000);

const baseVendor = {
  id: 'vendor-uuid-1',
  companyName: 'Acme Co',
  status: 'APPROVED',
};

const pendingVendor = { ...baseVendor, id: 'vendor-uuid-2', status: 'PENDING' };

const baseVendorUser = {
  id: 'vu-uuid-1',
  vendorId: baseVendor.id,
  email: 'buyer@acme.test',
  passwordHash: 'hashed-pw',
  fullName: 'Acme Buyer',
  isPrimaryContact: true,
  mfaEnabled: false,
  mfaSecret: null,
  tokenVersion: 0,
  status: 'ACTIVE',
  emailVerifiedAt: new Date('2026-01-01'),
  lastLoginAt: null,
  failedLoginCount: 0,
  lockedUntil: null,
  vendor: baseVendor,
};

const mfaVendorUser = {
  ...baseVendorUser,
  id: 'vu-uuid-mfa',
  mfaEnabled: true,
  mfaSecret: 'TOTP_BASE32',
};

const unverifiedVendorUser = { ...baseVendorUser, id: 'vu-uuid-unv', emailVerifiedAt: null };
const pendingVendorUser = { ...baseVendorUser, id: 'vu-uuid-pend', vendor: pendingVendor };
const lockedVendorUser = { ...baseVendorUser, id: 'vu-uuid-lock', lockedUntil: futureDate() };

// ------------------------------------------------------------------
// Mocks
// ------------------------------------------------------------------
const prismaMock = {
  vendorUser: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  vendor: { create: jest.fn() },
  vendorRegistrationRequest: { create: jest.fn() },
  vendorEmailVerificationToken: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  vendorPasswordResetToken: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  $transaction: jest.fn(),
};

const jwtMock = { sign: jest.fn(), verify: jest.fn() };

const configMock = {
  get: jest.fn((key: string) => {
    const cfg: Record<string, string> = {
      'jwt.vendorSecret': 'vendor-secret',
      'jwt.vendorExpiresIn': '24h',
      'jwt.refreshSecret': 'refresh-secret',
      'jwt.refreshExpiresIn': '7d',
      'auth.bcryptRounds': '12',
      'auth.maxFailedLogins': '5',
      'auth.lockoutMinutes': '15',
      'auth.verifyEmailTtlHours': '24',
      'auth.resetPasswordTtlMinutes': '60',
    };
    return cfg[key];
  }),
};

const captchaMock = { validate: jest.fn() };
const notificationsMock = { sendEmail: jest.fn() };
const auditMock = { log: jest.fn() };
// BUG-137 added these constructor deps but the test fixture didn't follow.
// BUG-144 unblocks the suite by mocking them.
const settingsMock = { resolveSmtpConfig: jest.fn() };
const docStorageMock = { write: jest.fn() };

// ------------------------------------------------------------------
// Suite
// ------------------------------------------------------------------
describe('VendorAuthService', () => {
  let service: VendorAuthService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockBcryptHash.mockResolvedValue('hashed-pw');
    mockBcryptCompare.mockResolvedValue(true);
    jwtMock.sign.mockReturnValue('mock.token');
    captchaMock.validate.mockResolvedValue({ verified: true, logId: BigInt(42) });
    notificationsMock.sendEmail.mockResolvedValue(undefined);
    auditMock.log.mockResolvedValue(undefined);
    prismaMock.$transaction.mockImplementation(async (cb: any) => cb(prismaMock));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VendorAuthService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: JwtService, useValue: jwtMock },
        { provide: ConfigService, useValue: configMock },
        { provide: CaptchaService, useValue: captchaMock },
        { provide: NotificationsService, useValue: notificationsMock },
        { provide: AuditService, useValue: auditMock },
        { provide: SystemSettingsService, useValue: settingsMock },
        { provide: VendorDocumentStorageService, useValue: docStorageMock },
      ],
    }).compile();

    service = module.get<VendorAuthService>(VendorAuthService);
  });

  // ----------------------------------------------------------------
  // register
  // ----------------------------------------------------------------
  describe('register', () => {
    const dto = {
      companyName: 'Acme Co',
      email: 'new@acme.test',
      password: 'CorrectHorseBatteryStaple',
      captchaToken: 'valid-token',
      // BUG-137 (2026-06-19) + BUG-138 (2026-06-19): only COMMERCIAL_LICENSE
      // is required after the slot-list trim. Test fixture pre-populates the
      // pending-document map (see beforeEach) so it resolves.
      documents: [
        { type: 'COMMERCIAL_LICENSE', documentId: 'doc-cl-id' },
      ],
    };
    const ctx = { ipAddress: '10.0.0.1', userAgent: 'test-agent' };

    beforeEach(() => {
      prismaMock.vendorUser.findUnique.mockResolvedValue(null);
      prismaMock.vendor.create.mockResolvedValue({ ...baseVendor, id: 'new-vendor-id' });
      prismaMock.vendorUser.update.mockResolvedValue(baseVendorUser);
      prismaMock.vendorRegistrationRequest.create.mockResolvedValue({ id: 'reg-id' });
      prismaMock.vendorEmailVerificationToken.create.mockResolvedValue({ id: 'tok-id' });
      (prismaMock as any).vendorUser.create = jest.fn().mockResolvedValue(baseVendorUser);
      (prismaMock as any).vendorDocument = { create: jest.fn().mockResolvedValue({}) };

      // BUG-137: pre-populate the static pending-document map so the docs
      // referenced in `dto.documents` resolve in the register() service.
      const map = (require('./vendor-auth.service').VendorAuthService as any).pendingDocs as Map<string, any>;
      map.clear();
      map.set('doc-cl-id', {
        documentId: 'doc-cl-id', storageKey: 'pending/doc-cl-id-file.pdf',
        originalFilename: 'CL.pdf', fileSize: 1234, checksumSha256: 'a'.repeat(64),
        uploadedAt: Date.now(),
      });
      map.set('doc-id-id', {
        documentId: 'doc-id-id', storageKey: 'pending/doc-id-id-file.pdf',
        originalFilename: 'ID.pdf', fileSize: 5678, checksumSha256: 'b'.repeat(64),
        uploadedAt: Date.now(),
      });
    });

    it('returns registrationId and PENDING_VERIFICATION status on success', async () => {
      const result = await service.register(dto, ctx);

      expect(result).toMatchObject({ registrationId: 'reg-id', status: 'PENDING_VERIFICATION' });
    });

    it('validates CAPTCHA before creating any records', async () => {
      await service.register(dto, ctx);

      expect(captchaMock.validate).toHaveBeenCalledWith({
        token: 'valid-token',
        action: 'vendor_register',
        ipAddress: '10.0.0.1',
        userAgent: 'test-agent',
      });
    });

    it('throws BadRequestException when CAPTCHA fails', async () => {
      captchaMock.validate.mockResolvedValue({ verified: false, logId: BigInt(99), errorCode: 'INVALID_TOKEN' });

      await expect(service.register(dto, ctx)).rejects.toThrow(BadRequestException);
      expect(prismaMock.vendor.create).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when email already registered', async () => {
      prismaMock.vendorUser.findUnique.mockResolvedValue(baseVendorUser);

      await expect(service.register(dto, ctx)).rejects.toThrow(BadRequestException);
      expect(prismaMock.vendor.create).not.toHaveBeenCalled();
    });

    it('hashes password with bcrypt before storing', async () => {
      await service.register(dto, ctx);

      expect(mockBcryptHash).toHaveBeenCalledWith('CorrectHorseBatteryStaple', 12);
      expect((prismaMock as any).vendorUser.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ passwordHash: 'hashed-pw' }),
        }),
      );
    });

    it('links registration request to captcha verification log and sends verification email', async () => {
      await service.register(dto, ctx);

      expect(prismaMock.vendorRegistrationRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ captchaVerificationId: BigInt(42) }),
        }),
      );
      expect(notificationsMock.sendEmail).toHaveBeenCalledWith(
        'new@acme.test',
        'vendor-verify-email',
        expect.objectContaining({ token: expect.any(String) }),
      );
    });
  });

  // ----------------------------------------------------------------
  // verifyEmail
  // ----------------------------------------------------------------
  describe('verifyEmail', () => {
    const tokenRecord = (overrides: any = {}) => ({
      id: 'tok-id',
      vendorUserId: baseVendorUser.id,
      tokenHash: 'hash',
      expiresAt: futureDate(),
      usedAt: null,
      ...overrides,
    });

    it('marks email verified and consumes token on success', async () => {
      prismaMock.vendorEmailVerificationToken.findUnique.mockResolvedValue(tokenRecord());

      const result = await service.verifyEmail({ token: 'raw-token' });

      expect(prismaMock.vendorUser.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: baseVendorUser.id },
          data: expect.objectContaining({ emailVerifiedAt: expect.any(Date) }),
        }),
      );
      expect(prismaMock.vendorEmailVerificationToken.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ usedAt: expect.any(Date) }) }),
      );
      expect(result).toMatchObject({ verified: true });
    });

    it('throws BadRequestException when token not found', async () => {
      prismaMock.vendorEmailVerificationToken.findUnique.mockResolvedValue(null);

      await expect(service.verifyEmail({ token: 'wrong' })).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when token expired', async () => {
      prismaMock.vendorEmailVerificationToken.findUnique.mockResolvedValue(tokenRecord({ expiresAt: pastDate() }));

      await expect(service.verifyEmail({ token: 'expired' })).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when token already used', async () => {
      prismaMock.vendorEmailVerificationToken.findUnique.mockResolvedValue(tokenRecord({ usedAt: new Date() }));

      await expect(service.verifyEmail({ token: 'used' })).rejects.toThrow(BadRequestException);
    });
  });

  // ----------------------------------------------------------------
  // login
  // ----------------------------------------------------------------
  describe('login', () => {
    it('returns access and refresh tokens on valid credentials', async () => {
      prismaMock.vendorUser.findUnique.mockResolvedValue(baseVendorUser);
      jwtMock.sign.mockReturnValueOnce('access.token').mockReturnValueOnce('refresh.token');

      const result = await service.login({ email: baseVendorUser.email, password: 'pw' });

      expect(result).toMatchObject({
        accessToken: 'access.token',
        refreshToken: 'refresh.token',
        requiresMfa: false,
      });
      expect(mockBcryptCompare).toHaveBeenCalledWith('pw', baseVendorUser.passwordHash);
    });

    it('returns tempToken and requiresMfa when MFA enabled', async () => {
      prismaMock.vendorUser.findUnique.mockResolvedValue(mfaVendorUser);
      jwtMock.sign.mockReturnValueOnce('temp.mfa');

      const result = await service.login({ email: mfaVendorUser.email, password: 'pw' });

      expect(result).toMatchObject({ requiresMfa: true, tempToken: 'temp.mfa' });
      expect(result).not.toHaveProperty('accessToken');
    });

    it('throws UnauthorizedException when vendor user not found', async () => {
      prismaMock.vendorUser.findUnique.mockResolvedValue(null);

      await expect(service.login({ email: 'ghost@test', password: 'pw' }))
        .rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when password does not match', async () => {
      prismaMock.vendorUser.findUnique.mockResolvedValue(baseVendorUser);
      mockBcryptCompare.mockResolvedValue(false);

      await expect(service.login({ email: baseVendorUser.email, password: 'wrong' }))
        .rejects.toThrow(UnauthorizedException);
      expect(prismaMock.vendorUser.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ failedLoginCount: { increment: 1 } }),
        }),
      );
    });

    it('throws ForbiddenException when email is not verified', async () => {
      prismaMock.vendorUser.findUnique.mockResolvedValue(unverifiedVendorUser);

      await expect(service.login({ email: unverifiedVendorUser.email, password: 'pw' }))
        .rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException when vendor not APPROVED', async () => {
      prismaMock.vendorUser.findUnique.mockResolvedValue(pendingVendorUser);

      await expect(service.login({ email: pendingVendorUser.email, password: 'pw' }))
        .rejects.toThrow(ForbiddenException);
    });

    it('throws UnauthorizedException when account is locked', async () => {
      prismaMock.vendorUser.findUnique.mockResolvedValue(lockedVendorUser);

      await expect(service.login({ email: lockedVendorUser.email, password: 'pw' }))
        .rejects.toThrow(UnauthorizedException);
    });

    it('resets failedLoginCount and sets lastLoginAt on success', async () => {
      prismaMock.vendorUser.findUnique.mockResolvedValue({ ...baseVendorUser, failedLoginCount: 3 });

      await service.login({ email: baseVendorUser.email, password: 'pw' });

      expect(prismaMock.vendorUser.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            failedLoginCount: 0,
            lockedUntil: null,
            lastLoginAt: expect.any(Date),
          }),
        }),
      );
    });
  });

  // ----------------------------------------------------------------
  // logout
  // ----------------------------------------------------------------
  describe('logout', () => {
    it('increments tokenVersion to invalidate refresh tokens', async () => {
      await service.logout('vu-uuid-1');

      expect(prismaMock.vendorUser.update).toHaveBeenCalledWith({
        where: { id: 'vu-uuid-1' },
        data: { tokenVersion: { increment: 1 } },
      });
    });
  });

  // ----------------------------------------------------------------
  // refresh
  // ----------------------------------------------------------------
  describe('refresh', () => {
    it('returns new access token when refresh token valid and version matches', async () => {
      jwtMock.verify.mockReturnValue({ sub: baseVendorUser.id, type: 'vendor-refresh', version: 0 });
      prismaMock.vendorUser.findUnique.mockResolvedValue(baseVendorUser);
      jwtMock.sign.mockReturnValue('new.access');

      const result = await service.refresh('valid.refresh');

      expect(result).toMatchObject({ accessToken: 'new.access' });
    });

    it('throws UnauthorizedException when token type is not vendor-refresh', async () => {
      jwtMock.verify.mockReturnValue({ sub: baseVendorUser.id, type: 'refresh', version: 0 });

      await expect(service.refresh('wrong.type')).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when tokenVersion stale', async () => {
      jwtMock.verify.mockReturnValue({ sub: baseVendorUser.id, type: 'vendor-refresh', version: 0 });
      prismaMock.vendorUser.findUnique.mockResolvedValue({ ...baseVendorUser, tokenVersion: 1 });

      await expect(service.refresh('stale')).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when signature invalid', async () => {
      jwtMock.verify.mockImplementation(() => { throw new Error('bad sig'); });

      await expect(service.refresh('tampered')).rejects.toThrow(UnauthorizedException);
    });
  });

  // ----------------------------------------------------------------
  // forgotPassword
  // ----------------------------------------------------------------
  describe('forgotPassword', () => {
    const ctx = { ipAddress: '10.0.0.1', userAgent: 'test' };

    it('creates reset token and sends email when vendor user exists', async () => {
      prismaMock.vendorUser.findUnique.mockResolvedValue(baseVendorUser);
      prismaMock.vendorPasswordResetToken.create.mockResolvedValue({ id: 'rst-id' });

      await service.forgotPassword({ email: baseVendorUser.email }, ctx);

      expect(prismaMock.vendorPasswordResetToken.create).toHaveBeenCalled();
      expect(notificationsMock.sendEmail).toHaveBeenCalledWith(
        baseVendorUser.email,
        'vendor-reset-password',
        expect.objectContaining({ token: expect.any(String) }),
      );
    });

    it('returns silently without creating token when vendor user not found', async () => {
      prismaMock.vendorUser.findUnique.mockResolvedValue(null);

      await expect(service.forgotPassword({ email: 'ghost@test' }, ctx)).resolves.toBeUndefined();
      expect(prismaMock.vendorPasswordResetToken.create).not.toHaveBeenCalled();
      expect(notificationsMock.sendEmail).not.toHaveBeenCalled();
    });

    it('stores request IP and user agent on token row', async () => {
      prismaMock.vendorUser.findUnique.mockResolvedValue(baseVendorUser);

      await service.forgotPassword({ email: baseVendorUser.email }, ctx);

      expect(prismaMock.vendorPasswordResetToken.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ requestIp: '10.0.0.1', requestUserAgent: 'test' }),
        }),
      );
    });
  });

  // ----------------------------------------------------------------
  // resetPassword
  // ----------------------------------------------------------------
  describe('resetPassword', () => {
    const tokenRecord = (overrides: any = {}) => ({
      id: 'rst-id',
      vendorUserId: baseVendorUser.id,
      tokenHash: 'hash',
      expiresAt: futureDate(),
      usedAt: null,
      ...overrides,
    });

    it('hashes new password, consumes token, clears lockout on success', async () => {
      prismaMock.vendorPasswordResetToken.findUnique.mockResolvedValue(tokenRecord());

      await service.resetPassword({ token: 'raw', newPassword: 'NewStrongPass123!' });

      expect(mockBcryptHash).toHaveBeenCalledWith('NewStrongPass123!', 12);
      expect(prismaMock.vendorUser.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: baseVendorUser.id },
          data: expect.objectContaining({
            passwordHash: 'hashed-pw',
            failedLoginCount: 0,
            lockedUntil: null,
          }),
        }),
      );
      expect(prismaMock.vendorPasswordResetToken.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ usedAt: expect.any(Date) }) }),
      );
    });

    it('throws BadRequestException when token not found', async () => {
      prismaMock.vendorPasswordResetToken.findUnique.mockResolvedValue(null);

      await expect(service.resetPassword({ token: 'wrong', newPassword: 'NewStrongPass123!' }))
        .rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when token expired', async () => {
      prismaMock.vendorPasswordResetToken.findUnique.mockResolvedValue(tokenRecord({ expiresAt: pastDate() }));

      await expect(service.resetPassword({ token: 'expired', newPassword: 'NewStrongPass123!' }))
        .rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when token already used', async () => {
      prismaMock.vendorPasswordResetToken.findUnique.mockResolvedValue(tokenRecord({ usedAt: new Date() }));

      await expect(service.resetPassword({ token: 'used', newPassword: 'NewStrongPass123!' }))
        .rejects.toThrow(BadRequestException);
    });
  });

  // ----------------------------------------------------------------
  // verifyMfa
  // ----------------------------------------------------------------
  describe('verifyMfa', () => {
    it('returns access and refresh tokens on valid TOTP', async () => {
      jwtMock.verify.mockReturnValue({ sub: mfaVendorUser.id, vendorMfaPending: true });
      prismaMock.vendorUser.findUnique.mockResolvedValue(mfaVendorUser);
      mockTotpVerify.mockReturnValue(true);
      jwtMock.sign.mockReturnValueOnce('access').mockReturnValueOnce('refresh');

      const result = await service.verifyMfa({ tempToken: 'temp', code: '123456' });

      expect(result).toMatchObject({ accessToken: 'access', refreshToken: 'refresh' });
      expect(mockTotpVerify).toHaveBeenCalledWith('123456', { secret: mfaVendorUser.mfaSecret });
    });

    it('throws UnauthorizedException when tempToken invalid', async () => {
      jwtMock.verify.mockImplementation(() => { throw new Error('expired'); });

      await expect(service.verifyMfa({ tempToken: 'bad', code: '123456' }))
        .rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when token missing vendorMfaPending claim', async () => {
      jwtMock.verify.mockReturnValue({ sub: mfaVendorUser.id });

      await expect(service.verifyMfa({ tempToken: 'wrong', code: '123456' }))
        .rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when TOTP code incorrect', async () => {
      jwtMock.verify.mockReturnValue({ sub: mfaVendorUser.id, vendorMfaPending: true });
      prismaMock.vendorUser.findUnique.mockResolvedValue(mfaVendorUser);
      mockTotpVerify.mockReturnValue(false);

      await expect(service.verifyMfa({ tempToken: 'temp', code: '000000' }))
        .rejects.toThrow(UnauthorizedException);
    });
  });
});
