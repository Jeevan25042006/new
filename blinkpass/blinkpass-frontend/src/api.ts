import type {
  User,
  Session,
  AuthorizedApp,
  VerifiableCredential,
  OAuthClient,
  AuditLogEntry,
  AuthTokens,
} from './types';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8005';

let _accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  _accessToken = token;
}

export function getAccessToken(): string | null {
  return _accessToken;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  requiresAuth = true,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (requiresAuth && _accessToken) {
    headers['Authorization'] = `Bearer ${_accessToken}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });

  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      message = body.detail ?? body.message ?? message;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  // Handle empty responses (204, 205)
  const contentType = res.headers.get('content-type') ?? '';
  if (res.status === 204 || !contentType.includes('application/json')) {
    return {} as T;
  }

  return res.json() as Promise<T>;
}

// ─── Auth: OTP ────────────────────────────────────────────────────────────────

export async function requestOtp(phone: string): Promise<{ message: string; otp?: string }> {
  return request('/auth/otp/request', {
    method: 'POST',
    body: JSON.stringify({ phone }),
  }, false);
}

export async function verifyOtp(phone: string, code: string): Promise<AuthTokens> {
  const data = await request<{ access_token: string; refresh_token: string; session_id: string }>(
    '/auth/otp/verify',
    { method: 'POST', body: JSON.stringify({ phone, code }) },
    false,
  );
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    sessionId: data.session_id,
  };
}

// ─── Auth: Magic Link ─────────────────────────────────────────────────────────

export async function requestMagicLink(email: string): Promise<{ message: string; poll_token: string }> {
  return request('/auth/magic-link/request', {
    method: 'POST',
    body: JSON.stringify({ email }),
  }, false);
}

export async function pollMagicLink(pollToken: string): Promise<{
  status: 'pending' | 'authenticated';
  access_token?: string;
  refresh_token?: string;
  session_id?: string;
}> {
  return request(`/auth/magic-link/poll/${encodeURIComponent(pollToken)}`, {}, false);
}

// ─── Auth: Biometric / WebAuthn ───────────────────────────────────────────────

export async function getBiometricRegisterOptions(
  email: string,
  deviceName = 'Security Key',
): Promise<Record<string, unknown>> {
  return request('/auth/biometric/register/options', {
    method: 'POST',
    body: JSON.stringify({ email, device_name: deviceName }),
  }, false);
}

export async function verifyBiometricRegister(
  email: string,
  credential: Record<string, unknown>,
  deviceName = 'Security Key',
): Promise<{ message: string }> {
  return request('/auth/biometric/register/verify', {
    method: 'POST',
    body: JSON.stringify({ email, device_name: deviceName, credential }),
  }, false);
}

export async function getBiometricAuthOptions(email: string): Promise<Record<string, unknown>> {
  return request('/auth/biometric/options', {
    method: 'POST',
    body: JSON.stringify({ email }),
  }, false);
}

export async function verifyBiometricAuth(
  credential: Record<string, unknown>,
): Promise<AuthTokens> {
  const data = await request<{ access_token: string; refresh_token: string; session_id: string }>(
    '/auth/biometric/verify',
    { method: 'POST', body: JSON.stringify({ credential }) },
    false,
  );
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    sessionId: data.session_id,
  };
}

// ─── User ─────────────────────────────────────────────────────────────────────

interface RawUser {
  id: string;
  email: string;
  phone?: string;
  display_name?: string;
  avatar_url?: string;
  did?: string;
  created_at?: string;
}

function mapUser(raw: RawUser): User {
  return {
    id: raw.id,
    email: raw.email,
    phone: raw.phone,
    displayName: raw.display_name,
    avatarUrl: raw.avatar_url,
    did: raw.did,
    createdAt: raw.created_at,
  };
}

export async function getMe(): Promise<User> {
  const raw = await request<RawUser>('/user/me');
  return mapUser(raw);
}

export async function updateMe(displayName: string): Promise<{ message: string }> {
  return request('/user/me', {
    method: 'PUT',
    body: JSON.stringify({ display_name: displayName }),
  });
}

export async function getSessions(): Promise<Session[]> {
  const raw = await request<Array<{
    id: string;
    ip_address?: string;
    user_agent?: string;
    auth_method?: string;
    created_at: string;
    last_used?: string;
  }>>('/user/sessions');
  return raw.map(s => ({
    id: s.id,
    ipAddress: s.ip_address,
    userAgent: s.user_agent,
    authMethod: s.auth_method,
    createdAt: s.created_at,
    lastUsed: s.last_used,
    isActive: true,
  }));
}

export async function revokeSession(sessionId: string): Promise<void> {
  await request(`/user/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' });
}

export async function getAuthorizedApps(): Promise<AuthorizedApp[]> {
  const raw = await request<Array<{ client_id: string; name?: string; authorized_at?: string }>>('/user/authorized-apps');
  return raw.map(a => ({
    clientId: a.client_id,
    name: a.name ?? a.client_id,
    authorizedAt: a.authorized_at,
  }));
}

export async function revokeApp(clientId: string): Promise<void> {
  await request(`/user/authorized-apps/${encodeURIComponent(clientId)}`, { method: 'DELETE' });
}

export async function verifyRecoveryCode(
  code: string,
  identifier: string,
): Promise<AuthTokens> {
  const data = await request<{ access_token: string; refresh_token: string; session_id: string }>(
    '/user/recovery/verify',
    { method: 'POST', body: JSON.stringify({ code, identifier }) },
    false,
  );
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    sessionId: data.session_id,
  };
}

export async function generateRecoveryCodes(): Promise<{ recovery_codes: string[]; message: string }> {
  return request('/user/recovery/generate', { method: 'POST' });
}

export async function getAuditLog(): Promise<AuditLogEntry[]> {
  const raw = await request<Array<{
    id: string;
    event_type?: string;
    auth_method?: string;
    ip_address?: string;
    outcome?: string;
    details?: string;
    created_at: string;
  }>>('/user/audit-log');
  return raw.map(e => ({
    id: e.id,
    eventType: e.event_type,
    authMethod: e.auth_method,
    ipAddress: e.ip_address,
    outcome: e.outcome,
    details: e.details,
    createdAt: e.created_at,
  }));
}

// ─── Identity ─────────────────────────────────────────────────────────────────

export async function getDidDocument(): Promise<Record<string, unknown>> {
  return request('/identity/did');
}

// ─── Credentials ─────────────────────────────────────────────────────────────

export async function issueCredential(): Promise<Record<string, unknown>> {
  return request('/credentials/issue', {
    method: 'POST',
    body: JSON.stringify({ auth_method: 'blinkpass' }),
  });
}

export async function listCredentials(): Promise<VerifiableCredential[]> {
  const raw = await request<Array<{
    id: string;
    credential_id?: string;
    issued_at: string;
    revoked: boolean;
  }>>('/credentials/list');
  return raw.map(c => ({
    id: c.id,
    credentialId: c.credential_id,
    issuedAt: c.issued_at,
    revoked: c.revoked,
  }));
}

export async function getCredential(credentialId: string): Promise<Record<string, unknown>> {
  return request(`/credentials/${encodeURIComponent(credentialId)}`);
}

export async function revokeCredential(credentialId: string): Promise<void> {
  await request(`/credentials/${encodeURIComponent(credentialId)}/revoke`, { method: 'POST' });
}

// ─── Developer ────────────────────────────────────────────────────────────────

export async function registerOAuthClient(
  name: string,
  redirectUris: string[],
): Promise<OAuthClient & { message: string }> {
  const raw = await request<{
    client_id: string;
    client_secret: string;
    name: string;
    redirect_uris: string[];
    message: string;
  }>('/developer/register', {
    method: 'POST',
    body: JSON.stringify({ name, redirect_uris: redirectUris }),
  });
  return {
    clientId: raw.client_id,
    clientSecret: raw.client_secret,
    name: raw.name,
    redirectUris: raw.redirect_uris,
    message: raw.message,
  };
}

export async function listOAuthClients(): Promise<OAuthClient[]> {
  const raw = await request<Array<{
    client_id: string;
    name: string;
    redirect_uris: string[];
    created_at?: string;
  }>>('/developer/keys');
  return raw.map(c => ({
    clientId: c.client_id,
    name: c.name,
    redirectUris: c.redirect_uris,
    createdAt: c.created_at,
  }));
}

export async function deleteOAuthClient(clientId: string): Promise<void> {
  await request(`/developer/keys/${encodeURIComponent(clientId)}`, { method: 'DELETE' });
}

// ─── Token Refresh ────────────────────────────────────────────────────────────

export async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
): Promise<{ access_token: string; refresh_token: string }> {
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });
  const res = await fetch(`${BASE_URL}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  if (!res.ok) throw new Error('Token refresh failed');
  return res.json() as Promise<{ access_token: string; refresh_token: string }>;
}
