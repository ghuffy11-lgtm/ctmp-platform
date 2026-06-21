const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

// BUG-107 Piece 3 (2026-06-05): full URL for asset paths (logos, etc) so
// <img src> can resolve regardless of the page's own origin.
export function assetUrl(path: string): string {
  return `${API_BASE}/api/v1${path.startsWith('/') ? path : '/' + path}`;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}/api/v1${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
    credentials: 'include',
  });

  // BUG-112 (2026-06-07) Piece 4: when the server reports the JWT is no
  // longer valid (expired / revoked / token-version bump), clear the
  // client tokens and bounce to login so the user isn't stranded in a
  // half-broken UI. Skip on the /login endpoint itself so a bad password
  // surfaces as a 401 message instead of a redirect loop.
  if (res.status === 401 && typeof window !== 'undefined' && !path.startsWith('/auth/login')) {
    const { clearTokens } = await import('./auth');
    clearTokens();
    if (!window.location.pathname.startsWith('/login')) {
      window.location.href = '/login?reason=expired';
    }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    const raw = body.message;
    let message: string;
    if (typeof raw === 'string') {
      message = raw;
    } else if (Array.isArray(raw)) {
      message = raw.join(', ');
    } else if (raw !== null && typeof raw === 'object') {
      const inner = (raw as Record<string, unknown>).message;
      message = Array.isArray(inner)
        ? (inner as string[]).join(', ')
        : typeof inner === 'string'
          ? inner
          : ((raw as Record<string, unknown>).error as string) ?? res.statusText;
    } else {
      message = res.statusText;
    }
    throw new ApiError(res.status, message);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export function get<T>(path: string, token?: string) {
  return request<T>(path, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

export function post<T>(path: string, body: unknown, token?: string) {
  return request<T>(path, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

export function patch<T>(path: string, body: unknown, token?: string) {
  return request<T>(path, {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

export function put<T>(path: string, body: unknown, token?: string) {
  return request<T>(path, {
    method: 'PUT',
    body: JSON.stringify(body),
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

export function del<T>(path: string, token?: string) {
  return request<T>(path, {
    method: 'DELETE',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}
