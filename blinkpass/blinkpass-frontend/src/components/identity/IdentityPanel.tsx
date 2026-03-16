import { useState, useEffect } from 'react';
import type { VerifiableCredential, Notification } from '../../types';
import { getDidDocument, listCredentials, issueCredential } from '../../api';
import CredentialCard from './CredentialCard';

interface Props {
  notify: (message: string, type: Notification['type']) => void;
}

export default function IdentityPanel({ notify }: Props) {
  const [did, setDid] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<VerifiableCredential[]>([]);
  const [loading, setLoading] = useState(true);
  const [issuing, setIssuing] = useState(false);
  const [didCopied, setDidCopied] = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const [didDoc, creds] = await Promise.all([getDidDocument(), listCredentials()]);
      setDid((didDoc as { id?: string }).id ?? null);
      setCredentials(creds);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load identity data';
      notify(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleIssueCred = async () => {
    setIssuing(true);
    try {
      await issueCredential();
      notify('Verifiable Credential issued! ✅', 'success');
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to issue credential';
      notify(msg, 'error');
    } finally {
      setIssuing(false);
    }
  };

  const handleCopyDid = async () => {
    if (!did) return;
    try {
      await navigator.clipboard.writeText(did);
      setDidCopied(true);
      notify('DID copied to clipboard!', 'success');
      setTimeout(() => setDidCopied(false), 2000);
    } catch {
      notify('Could not copy to clipboard.', 'error');
    }
  };

  return (
    <div className="page-enter">
      <h2 style={{ marginBottom: '20px' }}>🪪 Identity</h2>

      {/* DID Card */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', marginBottom: '16px' }}>
          <div style={{
            width: 48, height: 48, borderRadius: 12,
            background: 'var(--gradient-accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.5rem', flexShrink: 0,
          }}>🪪</div>
          <div style={{ flex: 1 }}>
            <h3>Decentralized Identifier (DID)</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '4px' }}>
              Your self-sovereign identity on the BlinkPass network
            </p>
          </div>
        </div>

        {loading ? (
          <div className="spinner" />
        ) : did ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--surface-input)', borderRadius: 'var(--radius-md)', padding: '12px 16px' }}>
            <span className="mono" style={{ flex: 1, color: 'var(--accent-blue-light)', wordBreak: 'break-all' }}>
              {did}
            </span>
            <button
              className="btn btn-secondary"
              style={{ padding: '6px 14px', fontSize: '0.8rem', flexShrink: 0 }}
              onClick={handleCopyDid}
            >
              {didCopied ? '✓' : '📋 Copy'}
            </button>
          </div>
        ) : (
          <p style={{ color: 'var(--text-muted)' }}>DID not available. Sign in to view your identity.</p>
        )}
      </div>

      {/* Credentials section */}
      <div className="card">
        <div className="section-header" style={{ marginBottom: '16px' }}>
          <span className="section-title">📜 Verifiable Credentials</span>
          <button
            className="btn btn-primary"
            style={{ padding: '8px 16px', fontSize: '0.875rem' }}
            onClick={handleIssueCred}
            disabled={issuing}
          >
            {issuing ? <span className="spinner" /> : '+ Issue Credential'}
          </button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '24px' }}>
            <div className="spinner" style={{ margin: '0 auto' }} />
          </div>
        ) : credentials.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📜</div>
            <p>No credentials issued yet.</p>
            <p style={{ fontSize: '0.875rem', marginTop: '8px' }}>
              Issue a Verifiable Credential to prove your BlinkPass identity to other services.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {credentials.map(cred => (
              <CredentialCard
                key={cred.id}
                credential={cred}
                onRevoked={load}
                notify={notify}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
