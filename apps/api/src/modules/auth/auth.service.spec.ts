import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { PrismaService } from '../../database/prisma.service';

// -------------------------------------------------------------------
// Mock ldapts — must be before the import that triggers module load
// -------------------------------------------------------------------
const mockBind = jest.fn();
const mockUnbind = jest.fn().mockResolvedValue(undefined);

jest.mock('ldapts', () => ({
  Client: jest.fn().mockImplementation(() => ({
    bind: mockBind,
    unbind: mockUnbind,
  })),
}));

// -------------------------------------------------------------------
// Mock otplib
// -------------------------------------------------------------------
const mockTotpVerify = jest.fn();
jest.mock('otplib', () => ({
  TOTP: jest.fn().mockImplementation(() => ({ verify: mockTotpVerify })),
}));

// -------------------------------------------------------------------
// Fixtures
// -------------------------------------------------------------------
const baseUser = {
  id: 'user-uuid-1',
  adUsername: 'jdoe',
  email: 'jdoe@company.local',
  displayName: 'John Doe',
  authType: 'AD',
  mfaEnabled: false,
  mfaSecret: null,
  tokenVersion: 0,
  failedLoginCount: 0,
  lockedUntil: null,
  status: 'ACTIVE',
  lastLoginAt: null,
};

const mfaUser = { ...baseUser, id: 'user-uuid-2', adUsername: 'mfauser', mfaEnabled: true, mfaSecret: 'TOTP_BASE32_SECRET' };
const inactiveUser = { ...baseUser, id: 'user-uuid-3', status: 'INACTIVE' };

// -------------------------------------------------------------------
// Mocks
// -------------------------------------------------------------------
const prismaMock = {
  user: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  userRole: {
    findMany: jest.fn(),
  },
};

const jwtMock = {
  sign: jest.fn(),
  verify: jest.fn(),
};

const configMock = {
  get: jest.fn((key: string) => {
    const cfg: Record<string, string> = {
      'ad.url': 'ldap://dc.test.local',
      'ad.domain': 'test.local',
      'jwt.secret': 'test-secret',
      'jwt.expiresIn': '8h',
      'jwt.refreshSecret': 'test-refresh-secret',
      'jwt.refreshExpiresIn': '7d',
      'auth.maxFailedLogins': '5',
      'auth.lockoutMinutes': '15',
    };
    return cfg[key];
  }),
};

// -------------------------------------------------------------------
// Suite
// -------------------------------------------------------------------
describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    jest.clearAllMocks();

    mockBind.mockResolvedValue(undefined);
    mockUnbind.mockResolvedValue(undefined);
    prismaMock.userRole.findMany.mockResolvedValue([]);
    prismaMock.user.update.mockResolvedValue(baseUser);
    jwtMock.sign.mockReturnValue('mock.token');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: JwtService, useValue: jwtMock },
        { provide: ConfigService, useValue: configMock },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  // -----------------------------------------------------------------
  // login
  // -----------------------------------------------------------------
  describe('login', () => {
    it('returns access and refresh tokens when AD credentials valid and MFA disabled', async () => {
      prismaMock.user.findFirst.mockResolvedValue(baseUser);
      jwtMock.sign
        .mockReturnValueOnce('access.token')
        .mockReturnValueOnce('refresh.token');

      const result = await service.login({ username: 'jdoe', password: 'P@ssw0rd' });

      expect(result).toMatchObject({
        accessToken: 'access.token',
        refreshToken: 'refresh.token',
        requiresMfa: false,
      });
      expect(mockBind).toHaveBeenCalledWith('jdoe@test.local', 'P@ssw0rd');
    });

    it('updates lastLoginAt on successful login', async () => {
      prismaMock.user.findUnique.mockResolvedValue(baseUser);

      await service.login({ username: 'jdoe', password: 'P@ssw0rd' });

      expect(prismaMock.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: baseUser.id },
          data: expect.objectContaining({ lastLoginAt: expect.any(Date) }),
        }),
      );
    });

    it('includes user permissions in the access token payload', async () => {
      prismaMock.user.findUnique.mockResolvedValue(baseUser);
      prismaMock.userRole.findMany.mockResolvedValue([
        { role: { rolePermissions: [{ permission: { code: 'tenders:list' } }, { permission: { code: 'tenders:read' } }] } },
      ]);

      await service.login({ username: 'jdoe', password: 'P@ssw0rd' });

      expect(jwtMock.sign).toHaveBeenCalledWith(
        expect.objectContaining({ permissions: ['tenders:list', 'tenders:read'] }),
        expect.anything(),
      );
    });

    it('returns requiresMfa true and tempToken when user has MFA enabled', async () => {
      prismaMock.user.findFirst.mockResolvedValue(mfaUser);
      prismaMock.user.update.mockResolvedValue(mfaUser);
      jwtMock.sign.mockReturnValueOnce('temp.mfa.token');

      const result = await service.login({ username: 'mfauser', password: 'P@ssw0rd' });

      expect(result).toMatchObject({ requiresMfa: true, tempToken: 'temp.mfa.token' });
      expect(result).not.toHaveProperty('accessToken');
    });

    it('throws UnauthorizedException when AD bind fails', async () => {
      mockBind.mockRejectedValue(new Error('InvalidCredentials'));

      await expect(service.login({ username: 'jdoe', password: 'wrong' }))
        .rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when user not found in database', async () => {
      prismaMock.user.findFirst.mockResolvedValue(null);

      await expect(service.login({ username: 'nobody', password: 'P@ssw0rd' }))
        .rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when user account is inactive', async () => {
      prismaMock.user.findFirst.mockResolvedValue(inactiveUser);

      await expect(service.login({ username: 'jdoe', password: 'P@ssw0rd' }))
        .rejects.toThrow(UnauthorizedException);
    });

    // LOCAL auth brute-force protection
    it('allows LOCAL auth user with correct password', async () => {
      const localUser = { ...baseUser, authType: 'LOCAL', passwordHash: await require('bcrypt').hash('password123', 10) };
      prismaMock.user.findFirst.mockResolvedValue(localUser);
      jwtMock.sign.mockReturnValueOnce('access.token').mockReturnValueOnce('refresh.token');

      const result = await service.login({ username: 'localuser', password: 'password123' });

      expect(result).toMatchObject({ accessToken: 'access.token', refreshToken: 'refresh.token' });
      expect(prismaMock.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ failedLoginCount: 0, lockedUntil: null }),
        }),
      );
    });

    it('increments failedLoginCount and throws for LOCAL auth with wrong password', async () => {
      const localUser = { ...baseUser, authType: 'LOCAL', passwordHash: '$2b$10$invalid', failedLoginCount: 0, lockedUntil: null };
      prismaMock.user.findFirst.mockResolvedValue(localUser);

      await expect(service.login({ username: 'localuser', password: 'wrongpassword' }))
        .rejects.toThrow(UnauthorizedException);

      expect(prismaMock.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ failedLoginCount: { increment: 1 } }),
        }),
      );
    });

    it('locks LOCAL auth user after max failed login attempts', async () => {
      const localUser = { ...baseUser, authType: 'LOCAL', passwordHash: '$2b$10$invalid', failedLoginCount: 4, lockedUntil: null };
      prismaMock.user.findFirst.mockResolvedValue(localUser);

      await expect(service.login({ username: 'localuser', password: 'wrongpassword' }))
        .rejects.toThrow(UnauthorizedException);

      expect(prismaMock.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            failedLoginCount: { increment: 1 },
            lockedUntil: expect.any(Date),
          }),
        }),
      );
    });

    it('throws UnauthorizedException when LOCAL auth user is temporarily locked', async () => {
      const futureDate = new Date(Date.now() + 15 * 60 * 1000);
      const lockedUser = { ...baseUser, authType: 'LOCAL', lockedUntil: futureDate };
      prismaMock.user.findFirst.mockResolvedValue(lockedUser);

      await expect(service.login({ username: 'localuser', password: 'password123' }))
        .rejects.toThrow('Account temporarily locked');

      expect(prismaMock.user.update).not.toHaveBeenCalled();
    });

    it('resets failedLoginCount to 0 on successful LOCAL auth login', async () => {
      const localUser = { ...baseUser, authType: 'LOCAL', passwordHash: await require('bcrypt').hash('password123', 10), failedLoginCount: 3, lockedUntil: null };
      prismaMock.user.findFirst.mockResolvedValue(localUser);
      jwtMock.sign.mockReturnValueOnce('access.token').mockReturnValueOnce('refresh.token');

      await service.login({ username: 'localuser', password: 'password123' });

      expect(prismaMock.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ failedLoginCount: 0 }),
        }),
      );
    });
  });

  // -----------------------------------------------------------------
  // logout
  // -----------------------------------------------------------------
  describe('logout', () => {
    it('increments tokenVersion to invalidate all existing refresh tokens', async () => {
      await service.logout('user-uuid-1');

      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: 'user-uuid-1' },
        data: { tokenVersion: { increment: 1 } },
      });
    });
  });

  // -----------------------------------------------------------------
  // refresh
  // -----------------------------------------------------------------
  describe('refresh', () => {
    it('returns a new access token when refresh token is valid and version matches', async () => {
      jwtMock.verify.mockReturnValue({ sub: 'user-uuid-1', type: 'refresh', version: 0 });
      prismaMock.user.findUnique.mockResolvedValue(baseUser); // tokenVersion: 0
      jwtMock.sign.mockReturnValue('new.access.token');

      const result = await service.refresh('valid.refresh.token');

      expect(result).toMatchObject({ accessToken: 'new.access.token' });
    });

    it('throws UnauthorizedException when refresh token signature is invalid', async () => {
      jwtMock.verify.mockImplementation(() => { throw new Error('invalid signature'); });

      await expect(service.refresh('tampered.token')).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when token payload type is not refresh', async () => {
      jwtMock.verify.mockReturnValue({ sub: 'user-uuid-1', type: 'access', version: 0 });

      await expect(service.refresh('access.token.used.as.refresh'))
        .rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when tokenVersion is outdated (user has logged out)', async () => {
      jwtMock.verify.mockReturnValue({ sub: 'user-uuid-1', type: 'refresh', version: 0 });
      // Logout incremented tokenVersion to 1
      prismaMock.user.findUnique.mockResolvedValue({ ...baseUser, tokenVersion: 1 });

      await expect(service.refresh('stale.refresh.token')).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when user no longer exists', async () => {
      jwtMock.verify.mockReturnValue({ sub: 'user-uuid-1', type: 'refresh', version: 0 });
      prismaMock.user.findUnique.mockResolvedValue(null);

      await expect(service.refresh('orphaned.token')).rejects.toThrow(UnauthorizedException);
    });
  });

  // -----------------------------------------------------------------
  // verifyMfa
  // -----------------------------------------------------------------
  describe('verifyMfa', () => {
    it('returns access and refresh tokens when temp token valid and TOTP code correct', async () => {
      jwtMock.verify.mockReturnValue({ sub: mfaUser.id, mfaPending: true });
      prismaMock.user.findUnique.mockResolvedValue(mfaUser);
      mockTotpVerify.mockReturnValue(true);
      jwtMock.sign
        .mockReturnValueOnce('access.token')
        .mockReturnValueOnce('refresh.token');

      const result = await service.verifyMfa({ tempToken: 'valid.temp', code: '123456' });

      expect(result).toMatchObject({ accessToken: 'access.token', refreshToken: 'refresh.token' });
      expect(mockTotpVerify).toHaveBeenCalledWith('123456', { secret: mfaUser.mfaSecret });
    });

    it('throws UnauthorizedException when temp token is invalid or expired', async () => {
      jwtMock.verify.mockImplementation(() => { throw new Error('jwt expired'); });

      await expect(service.verifyMfa({ tempToken: 'expired', code: '123456' }))
        .rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when token is missing mfaPending claim', async () => {
      jwtMock.verify.mockReturnValue({ sub: mfaUser.id }); // no mfaPending

      await expect(service.verifyMfa({ tempToken: 'wrong-type', code: '123456' }))
        .rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when TOTP code is incorrect', async () => {
      jwtMock.verify.mockReturnValue({ sub: mfaUser.id, mfaPending: true });
      prismaMock.user.findUnique.mockResolvedValue(mfaUser);
      mockTotpVerify.mockReturnValue(false);

      await expect(service.verifyMfa({ tempToken: 'valid.temp', code: '000000' }))
        .rejects.toThrow(UnauthorizedException);
    });
  });

  // -----------------------------------------------------------------
  // validateUser
  // -----------------------------------------------------------------
  describe('validateUser', () => {
    it('returns user when AD credentials are valid', async () => {
      prismaMock.user.findUnique.mockResolvedValue(baseUser);

      const result = await service.validateUser('jdoe', 'P@ssw0rd');

      expect(result).toMatchObject({ id: baseUser.id, adUsername: 'jdoe' });
      expect(mockBind).toHaveBeenCalledWith('jdoe@test.local', 'P@ssw0rd');
    });

    it('returns null when AD bind fails', async () => {
      mockBind.mockRejectedValue(new Error('InvalidCredentials'));

      const result = await service.validateUser('jdoe', 'wrong');

      expect(result).toBeNull();
    });

    it('returns null when AD succeeds but user is not in database', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      const result = await service.validateUser('ghost', 'P@ssw0rd');

      expect(result).toBeNull();
    });
  });
});
