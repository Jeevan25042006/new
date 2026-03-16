import { useState, useEffect } from 'react';
import type { OAuthClient, Notification } from '../../types';
import { listOAuthClients, registerOAuthClient, deleteOAuthClient } from '../../api';

interface Props {
  notify: (message: string, type: Notification['type']) => void;
}

export default function DeveloperConsole({ notify }: Props) {
  const [clients, setClients] = useState<OAuthClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [redirectUris, setRedirectUris] = useState('');
  const [creating, setCreating] = useState(false);
  const [revealedSecrets, setRevealedSecrets] = useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      setClients(await listOAuthClients());
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load OAuth clients';
      notify(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) { notify('App name is required.', 'error'); return; }
    const uris = redirectUris.split('\n').map(u => u.trim()).filter(Boolean);
    if (uris.length === 0) { notify('At least one redirect URI is required.', 'error'); return; }

    setCreating(true);
    try {
      const client = await registerOAuthClient(name, uris);
      setClients(prev => [...prev, { ...client, clientSecret: undefined }]);
      // Reveal secret once
      if (client.clientSecret) {
        setRevealedSecrets(prev => ({ ...prev, [client.clientId]: client.clientSecret! }));
      }
      notify('OAuth client registered! Save your client secret — it won\'t be shown again.', 'success');
      setShowForm(false);
      setName('');
      setRedirectUris('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to register client';
      notify(msg, 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (clientId: string) => {
    setDeleting(clientId);
    setConfirmDelete(null);
    try {
      await deleteOAuthClient(clientId);
      setClients(prev => prev.filter(c => c.clientId !== clientId));
      notify('OAuth client deleted.', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to delete client';
      notify(msg, 'error');
    } finally {
      setDeleting(null);
    }
  };

  const handleCopy = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      notify('Could not copy to clipboard.', 'error');
    }
  };

  return (
    <div className="page-enter">
      <div className="section-header" style={{ marginBottom: '20px' }}>
        <h2>⚙️ Developer Console</h2>
        <button className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '0.875rem' }} onClick={() => setShowForm(!showForm)}>
          {showForm ? '✕ Cancel' : '+ Register App'}
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: '24px', borderColor: 'rgba(0,120,212,0.3)' }}>
          <h3 style={{ marginBottom: '16px' }}>Register New OAuth2 Application</h3>
          <form onSubmit={handleCreate}>
            <div className="input-group">
              <label className="input-label">Application Name</label>
              <input className="input" type="text" value={name} onChange={e => setName(e.target.value)} placeholder="My App" required autoFocus />
            </div>
            <div className="input-group">
              <label className="input-label">Redirect URIs (one per line)</label>
              <textarea
                className="input"
                value={redirectUris}
                onChange={e => setRedirectUris(e.target.value)}
                placeholder="https://myapp.com/callback&#10;http://localhost:3000/callback"
                rows={3}
                required
                style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: '0.875rem' }}
              />
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button className="btn btn-primary" type="submit" disabled={creating}>
                {creating ? <span className="spinner" /> : '🔐 Register Application'}
              </button>
              <button className="btn btn-ghost" type="button" onClick={() => setShowForm(false)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '48px' }}>
          <div className="spinner spinner-large" style={{ margin: '0 auto' }} />
        </div>
      ) : clients.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">⚙️</div>
          <p>No OAuth applications registered yet.</p>
          <p style={{ fontSize: '0.875rem', marginTop: '8px' }}>Register an app to let users "Continue with BlinkPass".</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {clients.map(client => (
            <div key={client.clientId} className="card">
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '12px' }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 10,
                  background: 'var(--gradient-accent)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '1.25rem', flexShrink: 0,
                }}>⚙️</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: '1rem' }}>{client.name}</div>
                  {client.createdAt && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                      Created: {new Date(client.createdAt).toLocaleDateString()}
                    </div>
                  )}
                </div>
                {confirmDelete === client.clientId ? (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      className="btn btn-danger"
                      style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                      onClick={() => handleDelete(client.clientId)}
                      disabled={deleting === client.clientId}
                    >
                      {deleting === client.clientId ? <span className="spinner" style={{ width: 12, height: 12 }} /> : 'Confirm Delete'}
                    </button>
                    <button className="btn btn-ghost" style={{ padding: '6px 8px' }} onClick={() => setConfirmDelete(null)}>✕</button>
                  </div>
                ) : (
                  <button
                    className="btn btn-danger"
                    style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                    onClick={() => setConfirmDelete(client.clientId)}
                  >
                    Delete
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {/* Client ID */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--surface-input)', borderRadius: 'var(--radius-sm)', padding: '8px 12px' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', minWidth: '90px' }}>Client ID</span>
                  <span className="mono" style={{ flex: 1, fontSize: '0.8rem', color: 'var(--text-primary)', wordBreak: 'break-all' }}>{client.clientId}</span>
                  <button
                    className="btn btn-ghost"
                    style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                    onClick={() => handleCopy(client.clientId, `id-${client.clientId}`)}
                  >
                    {copiedId === `id-${client.clientId}` ? '✓' : '📋'}
                  </button>
                </div>

                {/* Client Secret */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--surface-input)', borderRadius: 'var(--radius-sm)', padding: '8px 12px' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', minWidth: '90px' }}>Client Secret</span>
                  {revealedSecrets[client.clientId] ? (
                    <>
                      <span className="mono" style={{ flex: 1, fontSize: '0.8rem', color: 'var(--accent-blue-light)', wordBreak: 'break-all' }}>
                        {revealedSecrets[client.clientId]}
                      </span>
                      <button
                        className="btn btn-ghost"
                        style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                        onClick={() => handleCopy(revealedSecrets[client.clientId], `secret-${client.clientId}`)}
                      >
                        {copiedId === `secret-${client.clientId}` ? '✓' : '📋'}
                      </button>
                    </>
                  ) : (
                    <span style={{ flex: 1, color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                      ••••••••••••••••••••• (shown once at creation)
                    </span>
                  )}
                </div>

                {/* Redirect URIs */}
                {client.redirectUris.length > 0 && (
                  <div style={{ marginTop: '4px' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Redirect URIs:</span>
                    <div style={{ marginTop: '4px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {client.redirectUris.map(uri => (
                        <span key={uri} className="mono" style={{
                          fontSize: '0.75rem', padding: '3px 8px',
                          background: 'rgba(0,120,212,0.1)', borderRadius: 4,
                          border: '1px solid rgba(0,120,212,0.2)', color: 'var(--accent-blue-light)',
                        }}>
                          {uri}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
