import { useState, useEffect } from 'react';
import type { AuthorizedApp, Notification } from '../../types';
import { getAuthorizedApps, revokeApp } from '../../api';

interface Props {
  notify: (message: string, type: Notification['type']) => void;
}

export default function AuthorizedApps({ notify }: Props) {
  const [apps, setApps] = useState<AuthorizedApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      setApps(await getAuthorizedApps());
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load authorized apps';
      notify(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleRevoke = async (clientId: string) => {
    setRevoking(clientId);
    setConfirmRevoke(null);
    try {
      await revokeApp(clientId);
      setApps(prev => prev.filter(a => a.clientId !== clientId));
      notify('App access revoked.', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to revoke app access';
      notify(msg, 'error');
    } finally {
      setRevoking(null);
    }
  };

  const formatDate = (d?: string) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString(undefined, { dateStyle: 'medium' });
  };

  return (
    <div className="page-enter">
      <div className="section-header" style={{ marginBottom: '20px' }}>
        <h2>🔗 Authorized Apps</h2>
        <button className="btn btn-secondary" onClick={load} disabled={loading}>
          {loading ? <span className="spinner" /> : '↺ Refresh'}
        </button>
      </div>

      <p style={{ color: 'var(--text-secondary)', marginBottom: '20px', fontSize: '0.9rem' }}>
        These applications have been granted access to your BlinkPass identity. Revoke access from any app you no longer use.
      </p>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '48px' }}>
          <div className="spinner spinner-large" style={{ margin: '0 auto' }} />
        </div>
      ) : apps.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🔗</div>
          <p>No authorized applications found.</p>
          <p style={{ fontSize: '0.875rem', marginTop: '8px' }}>Apps that connect via OAuth will appear here.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '12px' }}>
          {apps.map(app => (
            <div key={app.clientId} className="card" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{
                width: 48, height: 48, borderRadius: 12,
                background: 'var(--gradient-accent)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.5rem', flexShrink: 0,
              }}>
                🔗
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: '1rem' }}>{app.name}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Client ID: <span className="mono">{app.clientId}</span>
                </div>
                {app.authorizedAt && (
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                    Authorized: {formatDate(app.authorizedAt)}
                  </div>
                )}
              </div>

              {confirmRevoke === app.clientId ? (
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Confirm?</span>
                  <button
                    className="btn btn-danger"
                    style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                    onClick={() => handleRevoke(app.clientId)}
                    disabled={revoking === app.clientId}
                  >
                    {revoking === app.clientId ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Yes, Revoke'}
                  </button>
                  <button
                    className="btn btn-ghost"
                    style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                    onClick={() => setConfirmRevoke(null)}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  className="btn btn-danger"
                  style={{ padding: '8px 14px', fontSize: '0.85rem' }}
                  onClick={() => setConfirmRevoke(app.clientId)}
                >
                  Revoke Access
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
