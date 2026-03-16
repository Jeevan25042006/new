import { useState } from 'react';
import type { User, Notification } from '../../types';
import { verifyRecoveryCode } from '../../api';

interface Props {
  onSuccess: (accessToken: string, user: User) => void;
  onBack: () => void;
  notify: (message: string, type: Notification['type']) => void;
}

export default function RecoveryCodeAuth({ onSuccess, onBack, notify }: Props) {
  const [identifier, setIdentifier] = useState(localStorage.getItem('bp_email') ?? '');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  const formatCode = (raw: string) => {
    const clean = raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    // Format as XXXX-XXXX-XXXX-XXXX
    return clean.match(/.{1,4}/g)?.join('-') ?? clean;
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier || !code) { notify('Please fill in all fields.', 'error'); return; }
    const plainCode = code.replace(/-/g, '');
    if (plainCode.length < 8) { notify('Recovery code appears too short.', 'error'); return; }

    setLoading(true);
    try {
      const tokens = await verifyRecoveryCode(code, identifier);
      notify('Recovery code accepted. Please re-enroll your biometrics for continued security.', 'warning');
      onSuccess(tokens.accessToken, { id: '', email: identifier, displayName: identifier.split('@')[0] });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Invalid recovery code';
      notify(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="landing-container page-enter">
      <div style={{ width: '100%', maxWidth: '400px' }}>
        <button className="btn btn-ghost" onClick={onBack} style={{ marginBottom: '24px', padding: '6px 0' }}>
          ← Back
        </button>

        <div style={{ marginBottom: '32px' }}>
          <div style={{ fontSize: '3rem', marginBottom: '12px' }}>🔑</div>
          <h2>Recovery Code Sign-in</h2>
          <p style={{ color: 'var(--text-secondary)', marginTop: '8px' }}>
            Use one of your saved recovery codes to regain access to your account.
          </p>
        </div>

        <div className="alert alert-warning" style={{ marginBottom: '24px' }}>
          ⚠️ Recovery codes are single-use. After sign-in, you'll be prompted to re-enroll your biometrics.
        </div>

        <form onSubmit={handleVerify}>
          <div className="input-group">
            <label className="input-label">Email or Phone</label>
            <input
              className="input"
              type="text"
              value={identifier}
              onChange={e => setIdentifier(e.target.value)}
              placeholder="you@example.com or +1 555 000 0000"
              required
              autoFocus
            />
          </div>

          <div className="input-group">
            <label className="input-label">Recovery Code</label>
            <input
              className="input mono"
              type="text"
              value={code}
              onChange={e => setCode(formatCode(e.target.value))}
              placeholder="XXXX-XXXX-XXXX-XXXX"
              required
              spellCheck={false}
              autoCapitalize="characters"
              style={{ letterSpacing: '2px', fontSize: '1.1rem' }}
            />
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
              Enter the code exactly as shown when you saved it
            </span>
          </div>

          <button className="btn btn-primary btn-full btn-large" type="submit" disabled={loading}>
            {loading ? <span className="spinner" /> : '🔑 Verify Recovery Code'}
          </button>
        </form>
      </div>
    </div>
  );
}
