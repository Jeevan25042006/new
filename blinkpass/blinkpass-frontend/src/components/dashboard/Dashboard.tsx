import { useState, useEffect } from 'react';
import type { User, AuditLogEntry, Notification, AppView } from '../../types';
import { getMe, getAuditLog, getSessions } from '../../api';

interface Props {
  user: User;
  onNavigate: (view: AppView) => void;
  notify: (message: string, type: Notification['type']) => void;
}

export default function Dashboard({ user, onNavigate, notify }: Props) {
  const [fullUser, setFullUser] = useState<User>(user);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const firstName = (fullUser.displayName ?? fullUser.email).split(/[@\s]/)[0];
  const initial = firstName[0]?.toUpperCase() ?? '?';

  useEffect(() => {
    const load = async () => {
      try {
        const [me, log] = await Promise.all([getMe(), getAuditLog()]);
        setFullUser(me);
        setAuditLog(log.slice(0, 5));
        if (me.displayName) localStorage.setItem('bp_displayName', me.displayName);
      } catch {
        // Use cached user data
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const formatDate = (d: string) => new Date(d).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });

  const outcomeColor = (outcome?: string) => {
    if (outcome === 'success') return '#6cc24a';
    if (outcome === 'fail' || outcome === 'failure') return '#e74856';
    return 'var(--text-muted)';
  };

  return (
    <div className="page-enter">
      {/* Welcome banner */}
      <div className="card" style={{ marginBottom: '20px', background: 'linear-gradient(135deg, rgba(0,120,212,0.15), rgba(135,100,184,0.15))', borderColor: 'rgba(0,120,212,0.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div className="avatar-circle" style={{ width: 56, height: 56, fontSize: '1.375rem', flexShrink: 0 }}>
            {initial}
          </div>
          <div>
            <h2 style={{ fontSize: '1.375rem' }}>Welcome back, {firstName}! 👋</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '2px' }}>
              {fullUser.email}
              {fullUser.did && <span style={{ color: 'var(--text-muted)', marginLeft: '8px' }}>· DID active</span>}
            </p>
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="stats-grid" style={{ marginBottom: '20px' }}>
        {[
          { icon: '🖥️', label: 'Sessions', view: 'dashboard' as AppView, desc: 'Manage active sessions', action: () => onNavigate('dashboard') },
          { icon: '🔗', label: 'Authorized Apps', view: 'authorized-apps' as AppView, desc: 'OAuth apps with access', action: () => onNavigate('authorized-apps') },
          { icon: '🪪', label: 'Identity', view: 'identity' as AppView, desc: 'DID & Verifiable Credentials', action: () => onNavigate('identity') },
          { icon: '⚙️', label: 'Developer', view: 'developer' as AppView, desc: 'OAuth client management', action: () => onNavigate('developer') },
        ].map(item => (
          <button
            key={item.label}
            className="stat-card"
            style={{ textAlign: 'left', cursor: 'pointer', border: '1px solid var(--border)', background: 'var(--surface-card)', borderRadius: 'var(--radius-md)', transition: 'var(--transition)', fontFamily: 'inherit' }}
            onClick={item.action}
            onMouseOver={e => (e.currentTarget.style.borderColor = 'var(--accent-blue)')}
            onMouseOut={e => (e.currentTarget.style.borderColor = 'var(--border)')}
          >
            <div style={{ fontSize: '1.75rem', marginBottom: '8px' }}>{item.icon}</div>
            <div style={{ fontWeight: 600, fontSize: '0.9375rem', color: 'var(--text-primary)' }}>{item.label}</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>{item.desc}</div>
          </button>
        ))}
      </div>

      {/* Sessions shortcut */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div className="section-header">
          <span className="section-title">🖥️ Active Sessions</span>
          <button className="btn btn-ghost" style={{ fontSize: '0.85rem', padding: '4px 8px' }} onClick={() => onNavigate('dashboard')}>
            View All →
          </button>
        </div>
        <SessionMini notify={notify} />
      </div>

      {/* Recent audit log */}
      <div className="card">
        <div className="section-header">
          <span className="section-title">📋 Recent Activity</span>
          <button className="btn btn-ghost" style={{ fontSize: '0.85rem', padding: '4px 8px' }} onClick={() => onNavigate('admin')}>
            Full Log →
          </button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '24px' }}>
            <div className="spinner" style={{ margin: '0 auto' }} />
          </div>
        ) : auditLog.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📋</div>
            <p>No recent activity</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Method</th>
                  <th>Outcome</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {auditLog.map(entry => (
                  <tr key={entry.id}>
                    <td>{entry.eventType ?? '—'}</td>
                    <td>
                      <span className="badge badge-info">{entry.authMethod ?? '—'}</span>
                    </td>
                    <td>
                      <span style={{ color: outcomeColor(entry.outcome), fontWeight: 600 }}>
                        {entry.outcome ?? '—'}
                      </span>
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatDate(entry.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// Inline mini session component
function SessionMini({ notify: _notify }: { notify: (m: string, t: Notification['type']) => void }) {
  const [sessions, setSessions] = useState<{ id: string; authMethod?: string; ipAddress?: string; createdAt: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSessions().then(s => { setSessions(s.slice(0, 3)); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ textAlign: 'center', padding: '16px' }}><div className="spinner" style={{ margin: '0 auto' }} /></div>;
  if (sessions.length === 0) return <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>No active sessions found.</p>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {sessions.map(s => (
        <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: '1.25rem' }}>🖥️</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.875rem', fontWeight: 500 }}>
              {s.authMethod ? <span className="badge badge-info">{s.authMethod}</span> : '—'}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
              {s.ipAddress ?? 'Unknown IP'} · {new Date(s.createdAt).toLocaleDateString()}
            </div>
          </div>
          <span className="badge badge-success">Active</span>
        </div>
      ))}
      {void 0}
    </div>
  );
}
