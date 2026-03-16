import { useState } from 'react';
import type { VerifiableCredential, Notification } from '../../types';
import { getCredential, revokeCredential } from '../../api';

interface Props {
  credential: VerifiableCredential;
  onRevoked: () => void;
  notify: (message: string, type: Notification['type']) => void;
}

export default function CredentialCard({ credential, onRevoked, notify }: Props) {
  const [showJson, setShowJson] = useState(false);
  const [jsonData, setJsonData] = useState<Record<string, unknown> | null>(null);
  const [loadingJson, setLoadingJson] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  const formatDate = (d: string) => new Date(d).toLocaleDateString(undefined, { dateStyle: 'medium' });

  const handleViewJson = async () => {
    if (showJson) { setShowJson(false); return; }
    setLoadingJson(true);
    try {
      const data = await getCredential(credential.credentialId ?? credential.id);
      setJsonData(data);
      setShowJson(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load credential';
      notify(msg, 'error');
    } finally {
      setLoadingJson(false);
    }
  };

  const handleRevoke = async () => {
    setRevoking(true);
    setConfirmRevoke(false);
    try {
      await revokeCredential(credential.credentialId ?? credential.id);
      notify('Credential revoked.', 'success');
      onRevoked();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to revoke credential';
      notify(msg, 'error');
    } finally {
      setRevoking(false);
    }
  };

  return (
    <>
      <div
        className="card"
        style={{
          borderColor: credential.revoked ? 'rgba(209,52,56,0.3)' : 'rgba(16,124,16,0.3)',
          background: credential.revoked ? 'rgba(209,52,56,0.05)' : 'rgba(16,124,16,0.05)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
          <span style={{ fontSize: '1.5rem' }}>📜</span>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 600, fontSize: '0.9375rem' }}>
                BlinkPass Credential
              </span>
              <span className={credential.revoked ? 'badge badge-error' : 'badge badge-success'}>
                {credential.revoked ? 'Revoked' : 'Active'}
              </span>
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
              <span className="mono">{(credential.credentialId ?? credential.id).substring(0, 24)}…</span>
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
              Issued: {formatDate(credential.issuedAt)}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
            <button
              className="btn btn-secondary"
              style={{ padding: '6px 12px', fontSize: '0.8rem' }}
              onClick={handleViewJson}
              disabled={loadingJson}
            >
              {loadingJson ? <span className="spinner" style={{ width: 12, height: 12 }} /> : showJson ? 'Hide JSON' : 'View JSON'}
            </button>
            {!credential.revoked && (
              confirmRevoke ? (
                <>
                  <button
                    className="btn btn-danger"
                    style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                    onClick={handleRevoke}
                    disabled={revoking}
                  >
                    {revoking ? <span className="spinner" style={{ width: 12, height: 12 }} /> : 'Confirm Revoke'}
                  </button>
                  <button className="btn btn-ghost" style={{ padding: '6px 8px', fontSize: '0.8rem' }} onClick={() => setConfirmRevoke(false)}>
                    ✕
                  </button>
                </>
              ) : (
                <button
                  className="btn btn-danger"
                  style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                  onClick={() => setConfirmRevoke(true)}
                >
                  Revoke
                </button>
              )
            )}
          </div>
        </div>

        {showJson && jsonData && (
          <div style={{
            marginTop: '16px',
            padding: '16px',
            background: 'rgba(0,0,0,0.3)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border)',
            overflow: 'auto',
            maxHeight: '300px',
          }}>
            <pre className="mono" style={{ fontSize: '0.75rem', color: 'var(--accent-blue-light)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {JSON.stringify(jsonData, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </>
  );
}
