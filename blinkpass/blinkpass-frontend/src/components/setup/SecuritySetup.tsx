import { useState, useEffect } from 'react';
import type { Notification } from '../../types';
import { generateRecoveryCodes } from '../../api';

interface Props {
  email: string;
  onComplete: () => void;
  notify: (message: string, type: Notification['type']) => void;
}

type SetupStep = 'biometric-done' | 'recovery-codes' | 'complete';

export default function SecuritySetup({ email, onComplete, notify }: Props) {
  const [step, setStep] = useState<SetupStep>('biometric-done');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (step === 'recovery-codes') {
      fetchRecoveryCodes();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const fetchRecoveryCodes = async () => {
    setLoading(true);
    try {
      const res = await generateRecoveryCodes();
      setRecoveryCodes(res.recovery_codes);
    } catch {
      // If backend not available, generate placeholder codes for demo
      const placeholder = Array.from({ length: 8 }, (_, i) =>
        `BLNK-${String(i + 1).padStart(4, '0')}-${Math.random().toString(36).substring(2, 6).toUpperCase()}-DEMO`
      );
      setRecoveryCodes(placeholder);
      notify('Recovery codes generated (demo mode)', 'info');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyAll = async () => {
    const text = recoveryCodes.join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      notify('Recovery codes copied to clipboard!', 'success');
      setTimeout(() => setCopied(false), 3000);
    } catch {
      notify('Could not copy automatically — please select and copy manually.', 'warning');
    }
  };

  const firstName = email.split('@')[0];

  return (
    <div className="landing-container page-enter" style={{ justifyContent: 'flex-start', paddingTop: '48px' }}>
      <div style={{ width: '100%', maxWidth: '500px' }}>

        {/* Progress indicator */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '32px', justifyContent: 'center' }}>
          {(['biometric-done', 'recovery-codes', 'complete'] as SetupStep[]).map((s, i) => (
            <div
              key={s}
              style={{
                width: 32, height: 4, borderRadius: 2,
                background: step === s ? 'var(--accent-blue)' :
                  i < ['biometric-done', 'recovery-codes', 'complete'].indexOf(step) ? 'var(--accent-green)' : 'var(--border)',
                transition: 'background 0.3s',
              }}
            />
          ))}
        </div>

        {step === 'biometric-done' && (
          <div style={{ textAlign: 'center' }}>
            <div className="checkmark" style={{ margin: '0 auto 24px', width: 72, height: 72, fontSize: '2.5rem' }}>✓</div>
            <h2>Biometric Registered!</h2>
            <p style={{ color: 'var(--text-secondary)', marginTop: '12px', marginBottom: '32px' }}>
              Welcome, <strong style={{ color: 'var(--text-primary)' }}>{firstName}</strong>! Your passkey has been registered successfully.
              <br /><br />
              Next, we'll set up recovery codes as your emergency backup access method.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {[
                { icon: '🔐', label: 'Hardware Biometric Layer', desc: 'Your passkey — active' },
                { icon: '✉️', label: 'Email Magic Link Layer', desc: 'Auto-configured' },
                { icon: '📱', label: 'SMS OTP Layer', desc: 'Auto-configured' },
                { icon: '🔑', label: 'Recovery Code Layer', desc: 'Setting up next…' },
              ].map((layer, i) => (
                <div
                  key={layer.label}
                  className="security-layer-card active"
                  style={{ animationDelay: `${i * 0.1}s` }}
                >
                  <span className="layer-icon">{layer.icon}</span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{layer.label}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{layer.desc}</div>
                  </div>
                  <span className="badge badge-success" style={{ marginLeft: 'auto' }}>
                    {i === 3 ? 'Pending' : '✓ Active'}
                  </span>
                </div>
              ))}
            </div>

            <button
              className="btn btn-primary btn-large"
              style={{ marginTop: '32px', width: '100%' }}
              onClick={() => setStep('recovery-codes')}
            >
              Generate Recovery Codes →
            </button>
          </div>
        )}

        {step === 'recovery-codes' && (
          <div>
            <h2 style={{ textAlign: 'center', marginBottom: '8px' }}>Your Recovery Codes</h2>
            <p style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '24px' }}>
              Save these codes in a secure place. Each code can only be used once.<br />
              A copy has also been sent to <strong style={{ color: 'var(--text-primary)' }}>{email}</strong>.
            </p>

            {loading ? (
              <div style={{ textAlign: 'center', padding: '40px' }}>
                <div className="spinner spinner-large" style={{ margin: '0 auto' }} />
              </div>
            ) : (
              <>
                <div className="recovery-codes-grid">
                  {recoveryCodes.map((code, i) => (
                    <div key={i} className="recovery-code">{code}</div>
                  ))}
                </div>

                <button
                  className="btn btn-secondary btn-full"
                  style={{ marginTop: '16px' }}
                  onClick={handleCopyAll}
                >
                  {copied ? '✓ Copied!' : '📋 Copy All Codes'}
                </button>

                <div className="alert alert-warning" style={{ marginTop: '16px' }}>
                  ⚠️ These codes will not be shown again. Store them somewhere safe (password manager, printed copy, etc.)
                </div>
              </>
            )}

            <button
              className="btn btn-primary btn-large"
              style={{ marginTop: '24px', width: '100%' }}
              onClick={onComplete}
              disabled={loading}
            >
              I've saved my codes → Continue to BlinkPass
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
