export interface User {
  id: string;
  email: string;
  phone?: string;
  displayName?: string;
  avatarUrl?: string;
  did?: string;
  createdAt?: string;
}

export interface Session {
  id: string;
  ipAddress?: string;
  userAgent?: string;
  authMethod?: string;
  createdAt: string;
  lastUsed?: string;
  isActive?: boolean;
}

export interface AuthorizedApp {
  clientId: string;
  name: string;
  authorizedAt?: string;
}

export interface VerifiableCredential {
  id: string;
  credentialId?: string;
  issuedAt: string;
  revoked: boolean;
  credentialJson?: Record<string, unknown>;
}

export interface OAuthClient {
  clientId: string;
  clientSecret?: string;
  name: string;
  redirectUris: string[];
  createdAt?: string;
}

export interface AuditLogEntry {
  id: string;
  eventType?: string;
  authMethod?: string;
  ipAddress?: string;
  outcome?: string;
  details?: string;
  createdAt: string;
}

export interface Notification {
  id: string;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
}

export type AppView =
  | 'landing'
  | 'login'
  | 'register'
  | 'security-setup'
  | 'security-layers'
  | 'dashboard'
  | 'identity'
  | 'authorized-apps'
  | 'developer'
  | 'admin';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  sessionId?: string;
}
