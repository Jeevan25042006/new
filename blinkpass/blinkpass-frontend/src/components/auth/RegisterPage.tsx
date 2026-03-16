import { useState } from 'react';
import type { Notification } from '../../types';
import PasskeyAuth from './PasskeyAuth';

interface Props {
  onSuccess: (email: string) => void;
  onLogin: () => void;
  onBack: () => void;
  notify: (message: string, type: Notification['type']) => void;
}

export default function RegisterPage({ onSuccess, onLogin, onBack, notify }: Props) {
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [step, setStep] = useState<'form' | 'passkey'>('form');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !displayName) { notify('Please fill in all fields.', 'error'); return; }
    if (!email.includes('@')) { notify('Please enter a valid email address.', 'error'); return; }
    if (!window.PublicKeyCredential) {
      notify('Your browser does not support passkeys. Please use a modern browser.', 'error');
      return;
    }
    setStep('passkey');
  };

  if (step === 'passkey') {
    return (
      <PasskeyAuth
        mode="register"
        email={email}
        onSuccess={(_token, _user) => {
          notify('Registration successful! Setting up security layers…', 'success');
          onSuccess(email);
        }}
        onBack={() => setStep('form')}
        notify={notify}
      />
    );
  }

  return (
    <div className="landing-container page-enter">
      <div style={{ width: '100%', maxWidth: '400px' }}>
        <button className="btn btn-ghost" onClick={onBack} style={{ marginBottom: '24px', padding: '6px 0' }}>
          ← Back
        </button>

        <div style={{ marginBottom: '32px' }}>
          <div className="landing-logo" style={{ width: 56, height: 56, fontSize: '1.75rem', borderRadius: '14px' }}>⚡</div>
          <h2 style={{ marginTop: '16px' }}>Create your account</h2>
          <p style={{ color: 'var(--text-secondary)', marginTop: '8px' }}>No passwords required — ever.</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <label className="input-label">Email Address</label>
            <input
              className="input"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoFocus
            />
          </div>

          <div className="input-group">
            <label className="input-label">Display Name</label>
            <input
              className="input"
              type="text"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="Your Name"
              required
            />
          </div>

          <div className="alert alert-info" style={{ marginBottom: '20px' }}>
            ℹ️ You'll register a passkey (biometric / hardware key) to secure your account — no password needed.
          </div>

          <button className="btn btn-primary btn-full btn-large" type="submit">
            🔐 Continue with Passkey
          </button>
        </form>

        <hr className="divider" />
        <p style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          Already have an account?{' '}
          <button className="btn btn-ghost" style={{ padding: '0', color: 'var(--accent-blue-light)', fontWeight: 600 }} onClick={onLogin}>
            Sign in
          </button>
        </p>
      </div>
    </div>
  );
}
