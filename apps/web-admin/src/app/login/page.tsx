'use client';

import { Suspense, useEffect, useId, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { post, get, assetUrl } from '@/lib/api';
import { setTokens, getHiddenSidebarItems } from '@/lib/auth';

// BUG-106 (2026-06-05): when the user's role hides /dashboard (currently
// EXECUTIVE via roles.hidden_sidebar_items), land them on /executive instead.
// Generic check against the JWT's hiddenSidebarItems list — works for any
// future role that hides Dashboard.
function landingPath(accessToken: string): string {
  const hidden = getHiddenSidebarItems(accessToken);
  return hidden.includes('/dashboard') ? '/executive' : '/dashboard';
}
import { Building2, AtSign, Lock, Eye, EyeOff, ArrowRight, Info } from 'lucide-react';

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  mfaRequired: boolean;
  mfaToken?: string;
}

export default function LoginPage() {
  // BUG-112 (2026-06-07) Piece 4: Suspense wrapper required because the
  // inner component reads `?reason=` via useSearchParams, which Next 15
  // App Router only allows inside a Suspense boundary.
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  );
}

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // BUG-112 (2026-06-07) Piece 4: banner shown when the user was kicked
  // out by the idle-timeout hook (`reason=timeout`) or by the 401
  // interceptor (`reason=expired`).
  const signoutReason = searchParams.get('reason');
  const usernameId = useId();
  const passwordId = useId();
  const mfaCodeId = useId();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaToken, setMfaToken] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  // BUG-107 Piece 2 + BUG-108: admin login renders the dedicated admin_logo
  // (not the vendor logo). Defaults to the Building2 icon if no logo uploaded.
  const [systemName, setSystemName] = useState<string>('CTMP');
  const [hasAdminLogo, setHasAdminLogo] = useState(false);

  useEffect(() => {
    get<{ systemName: string; hasAdminLogo: boolean }>('/public-branding')
      .then((b) => {
        setSystemName(b.systemName || 'CTMP');
        setHasAdminLogo(!!b.hasAdminLogo);
      })
      .catch(() => { /* keep defaults */ });
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await post<LoginResponse>('/auth/login', { username, password });
      if (res.mfaRequired && res.mfaToken) {
        setMfaToken(res.mfaToken);
        setMfaRequired(true);
      } else {
        setTokens(res.accessToken, res.refreshToken);
        router.push(landingPath(res.accessToken));
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleMfa(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await post<LoginResponse>('/auth/mfa/verify', {
        token: mfaToken,
        code: mfaCode,
      });
      setTokens(res.accessToken, res.refreshToken);
      router.push(landingPath(res.accessToken));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'MFA verification failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-primary-container min-h-screen flex items-center justify-center p-6 relative overflow-hidden">
      {/* Subtle background pattern */}
      <div className="absolute inset-0 opacity-10 pointer-events-none">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: 'radial-gradient(circle at 2px 2px, #ffffff 1px, transparent 0)',
            backgroundSize: '40px 40px',
          }}
        />
      </div>

      <div className="relative w-full max-w-[440px] flex flex-col items-center">
        {/* Logo and branding — BUG-107 Piece 2/3 */}
        <div className="flex flex-col items-center mb-6 gap-2 text-center">
          <div className="w-16 h-16 bg-white/10 rounded-xl flex items-center justify-center border border-white/20 backdrop-blur-sm mb-2 overflow-hidden">
            {hasAdminLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={assetUrl('/branding/admin_logo')} alt={systemName} className="w-full h-full object-contain" />
            ) : (
              <Building2 className="w-10 h-10 text-on-primary" />
            )}
          </div>
          <h1 className="text-headline-md text-on-primary tracking-tight font-semibold">{systemName} Admin</h1>
          <p className="text-label-md text-on-primary-container uppercase tracking-widest opacity-80">Enterprise Procurement</p>
        </div>

        {signoutReason && (
          <div className="w-full mb-4 px-4 py-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-body-sm text-center">
            {signoutReason === 'timeout'
              ? 'You were signed out due to inactivity. Please sign in again.'
              : signoutReason === 'expired'
                ? 'Your session has expired. Please sign in again.'
                : 'Please sign in to continue.'}
          </div>
        )}

        {/* Auth card */}
        <div className="w-full bg-white rounded-xl shadow-2xl p-8 md:p-10 border border-outline-variant/30">
          {!mfaRequired ? (
            <>
              <div className="mb-8">
                <h2 className="text-display-lg text-primary mb-2 font-bold">Sign In</h2>
                <p className="text-body-md text-on-surface-variant">Access the Tender Management Portal</p>
              </div>

              <form onSubmit={handleLogin} className="space-y-6">
                {/* Username */}
                <div className="space-y-2">
                  <label htmlFor={usernameId} className="text-label-md text-on-surface-variant block uppercase">Username</label>
                  <div className="relative">
                    <AtSign className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-outline" />
                    <input
                      id={usernameId}
                      aria-label="Username"
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="jsmith@company.local"
                      required
                      className="w-full pl-10 pr-4 py-3 rounded-lg border border-outline-variant bg-surface-container-lowest focus:ring-2 focus:ring-secondary focus:border-secondary transition-all text-body-md text-on-surface outline-none"
                    />
                  </div>
                </div>

                {/* Password */}
                <div className="space-y-2">
                  <label htmlFor={passwordId} className="text-label-md text-on-surface-variant block uppercase">Password</label>
                  <div className="relative">
                    <Lock className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-outline" />
                    <input
                      id={passwordId}
                      aria-label="Password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••••••"
                      required
                      className="w-full pl-10 pr-12 py-3 rounded-lg border border-outline-variant bg-surface-container-lowest focus:ring-2 focus:ring-secondary focus:border-secondary transition-all text-body-md text-on-surface outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-outline hover:text-primary transition-colors"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                {error && <p className="text-error text-body-sm">{error}</p>}

                {/* Sign in button */}
                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-secondary hover:bg-secondary-container text-white text-title-sm py-4 rounded-lg shadow-md transition-all active:scale-[0.98] flex items-center justify-center gap-2 group disabled:opacity-50"
                  >
                    {loading ? 'Signing in…' : 'Sign In'}
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </button>
                </div>
              </form>

              {/* AD note */}
              <div className="mt-8 pt-6 border-t border-outline-variant flex items-start gap-3 bg-surface-container-low/50 p-4 rounded-lg">
                <Info className="w-5 h-5 text-secondary" />
                <p className="text-body-sm text-on-surface-variant leading-relaxed">
                  Use your Active Directory credentials to log in. Contact the IT Service Desk if you experience any authentication issues.
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="mb-8 text-center">
                <h2 className="text-display-lg text-primary mb-2 font-bold">Two-Factor Authentication</h2>
                <p className="text-body-md text-on-surface-variant">Enter the 6-digit code from your authenticator app</p>
              </div>

              <form onSubmit={handleMfa} className="space-y-6">
                <div className="space-y-2">
                  <label htmlFor={mfaCodeId} className="text-label-md text-on-surface-variant block uppercase">Verification Code</label>
                  <input
                    id={mfaCodeId}
                    aria-label="Verification Code"
                    type="text"
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    maxLength={6}
                    required
                    className="w-full px-4 py-3 rounded-lg border border-outline-variant bg-surface-container-lowest focus:ring-2 focus:ring-secondary focus:border-secondary transition-all text-center tracking-widest text-lg font-mono text-on-surface outline-none"
                  />
                </div>

                {error && <p className="text-error text-body-sm">{error}</p>}

                <button
                  type="submit"
                  disabled={loading || mfaCode.length !== 6}
                  className="w-full bg-secondary hover:bg-secondary-container text-white text-title-sm py-4 rounded-lg shadow-md transition-all active:scale-[0.98] disabled:opacity-50"
                >
                  {loading ? 'Verifying…' : 'Verify'}
                </button>

                <button
                  type="button"
                  onClick={() => setMfaRequired(false)}
                  className="w-full text-body-sm text-secondary hover:underline"
                >
                  Back to login
                </button>
              </form>
            </>
          )}
        </div>

        {/* Footer links */}
        <div className="mt-8 flex gap-6">
          <a className="text-label-sm text-on-primary-container hover:text-on-primary transition-colors underline underline-offset-4" href="#">Privacy Policy</a>
          <a className="text-label-sm text-on-primary-container hover:text-on-primary transition-colors underline underline-offset-4" href="#">Terms of Service</a>
          <a className="text-label-sm text-on-primary-container hover:text-on-primary transition-colors underline underline-offset-4" href="#">System Status</a>
        </div>
      </div>

      {/* Decorative blurs */}
      <div className="fixed -bottom-20 -left-20 w-80 h-80 bg-secondary/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="fixed -top-20 -right-20 w-80 h-80 bg-secondary-container/20 rounded-full blur-[100px] pointer-events-none" />
    </div>
  );
}
