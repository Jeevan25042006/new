import { useState } from 'react';
import type { User } from '../../types';
import type { Notification } from '../../types';
import PasskeyAuth from './PasskeyAuth';
import MagicLinkAuth from './MagicLinkAuth';
import OtpAuth from './OtpAuth';
import RecoveryCodeAuth from './RecoveryCodeAuth';

type AuthMethod = 'choose' | 'passkey' | 'magic-link' | 'otp' | 'recovery';

interface Props {
  onSuccess: (accessToken: string, user: User) => void;
  onRegister: () => void;
  onBack: () => void;
  notify: (message: string, type: Notification['type']) => void;
}

export default function LoginPage({ onSuccess, onRegister, onBack, notify }: Props) {
  const [method, setMethod] = useState<AuthMethod>('choose');

  if (method === 'passkey') {
    return <PasskeyAuth mode="login" onSuccess={onSuccess} onBack={() => setMethod('choose')} notify={notify} />;
  }
  if (method === 'magic-link') {
    return <MagicLinkAuth onSuccess={onSuccess} onBack={() => setMethod('choose')} notify={notify} />;
  }
  if (method === 'otp') {
    return <OtpAuth onSuccess={onSuccess} onBack={() => setMethod('choose')} notify={notify} />;
  }
  if (method === 'recovery') {
    return <RecoveryCodeAuth onSuccess={onSuccess} onBack={() => setMethod('choose')} notify={notify} />;
  }

  return (
    <div className="landing-container page-enter">
      <div style={{ width: '100%', maxWidth: '420px' }}>
        <button className="btn btn-ghost" onClick={onBack} style={{ marginBottom: '24px', padding: '6px 0' }}>
          ← Back
        </button>

        <div style={{ marginBottom: '32px' }}>
          <div className="landing-logo" style={{ width: 56, height: 56, fontSize: '1.75rem', borderRadius: '14px' }}>⚡</div>
          <h2 style={{ marginTop: '16px' }}>Sign in to BlinkPass</h2>
          <p style={{ color: 'var(--text-secondary)', marginTop: '8px' }}>Choose how you want to sign in</p>
        </div>

        <div className="auth-methods">
          <button className="auth-method-btn primary" onClick={() => setMethod('passkey')}>
            <span className="auth-method-icon">🔐</span>
            <div className="auth-method-info">
              <span className="auth-method-title">Sign in with Passkey</span>
              <span className="auth-method-desc">Use your fingerprint, face, or hardware key</span>
            </div>
          </button>

          <button className="auth-method-btn" onClick={() => setMethod('magic-link')}>
            <span className="auth-method-icon">✉️</span>
            <div className="auth-method-info">
              <span className="auth-method-title">Magic Link</span>
              <span className="auth-method-desc">Get a one-click sign-in link by email</span>
            </div>
          </button>

          <button className="auth-method-btn" onClick={() => setMethod('otp')}>
            <span className="auth-method-icon">📱</span>
            <div className="auth-method-info">
              <span className="auth-method-title">SMS OTP</span>
              <span className="auth-method-desc">Receive a 6-digit code via text message</span>
            </div>
          </button>

          <button className="auth-method-btn" onClick={() => setMethod('recovery')}>
            <span className="auth-method-icon">🔑</span>
            <div className="auth-method-info">
              <span className="auth-method-title">Recovery Code</span>
              <span className="auth-method-desc">Use your saved emergency backup code</span>
            </div>
          </button>
        </div>

        <hr className="divider" />

        <p style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          Don't have an account?{' '}
          <button className="btn btn-ghost" style={{ padding: '0', color: 'var(--accent-blue-light)', fontWeight: 600 }} onClick={onRegister}>
            Sign up
          </button>
        </p>
      </div>
    </div>
  );
}
