import { useState, useEffect } from 'react';
import type { Session, Notification } from '../../types';
import { getSessions, revokeSession } from '../../api';

interface Props {
  notify: (message: string, type: Notification['type']) => void;
}

export default function SessionList({ notify }: Props) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      setSessions(await getSessions());
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load sessions';
      notify(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleRevoke = async (id: string) => {
    setRevoking(id);
    try {
      await revokeSession(id);
      setSessions(prev => prev.filter(s => s.id !== id));
      notify('Session revoked successfully.', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to revoke session';
      notify(msg, 'error');
    } finally {
      setRevoking(null);
    }
  };

  const parseDevice = (ua?: string) => {
    if (!ua) return 'Unknown device';
    if (ua.includes('Mobile')) return 'Mobile';
    if (ua.includes('Firefox')) return 'Firefox';
    if (ua.includes('Chrome')) return 'Chrome';
    if (ua.includes('Safari')) return 'Safari';
    return ua.substring(0, 30) + '…';
  };

  const formatDate = (d: string) => new Date(d).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });

  return (
    <div className="page-enter">
      <div className="section-header" style={{ marginBottom: '20px' }}>
        <h2>🖥️ Active Sessions</h2>
        <button className="btn btn-secondary" onClick={load} disabled={loading}>
          {loading ? <span className="spinner" /> : '↺ Refresh'}
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '48px' }}>
          <div className="spinner spinner-large" style={{ margin: '0 auto' }} />
        </div>
      ) : sessions.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🖥️</div>
          <p>No active sessions found.</p>
        </div>
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Device</th>
                <th>IP Address</th>
                <th>Auth Method</th>
                <th>Created</th>
                <th>Last Used</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map(session => (
                <tr key={session.id}>
                  <td>
                    <span title={session.userAgent}>{parseDevice(session.userAgent)}</span>
                  </td>
                  <td className="mono">{session.ipAddress ?? '—'}</td>
                  <td>
                    {session.authMethod
                      ? <span className="badge badge-info">{session.authMethod}</span>
                      : '—'}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>{formatDate(session.createdAt)}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {session.lastUsed ? formatDate(session.lastUsed) : '—'}
                  </td>
                  <td>
                    <button
                      className="btn btn-danger"
                      style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                      onClick={() => handleRevoke(session.id)}
                      disabled={revoking === session.id}
                    >
                      {revoking === session.id ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Revoke'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
