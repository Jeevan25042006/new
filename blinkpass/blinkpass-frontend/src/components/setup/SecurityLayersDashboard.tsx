import { useState, useEffect } from 'react';

interface Props {
  onContinue: () => void;
}

const LAYERS = [
  { icon: '🔐', label: 'Hardware Biometric Layer', desc: 'Passkey / FIDO2 authenticator' },
  { icon: '✉️', label: 'Email Magic Link Layer', desc: 'One-click sign-in via email' },
  { icon: '📱', label: 'SMS OTP Layer', desc: '6-digit one-time password via SMS' },
  { icon: '🔑', label: 'Recovery Code Layer', desc: 'Emergency backup access codes' },
];

export default function SecurityLayersDashboard({ onContinue }: Props) {
  const [visibleCount, setVisibleCount] = useState(0);

  // Animate cards in one by one
  useEffect(() => {
    if (visibleCount < LAYERS.length) {
      const t = setTimeout(() => setVisibleCount(c => c + 1), 400);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [visibleCount]);

  const allVisible = visibleCount >= LAYERS.length;

  return (
    <div className="landing-container page-enter" style={{ justifyContent: 'flex-start', paddingTop: '48px' }}>
      <div style={{ width: '100%', maxWidth: '500px' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div className="landing-logo" style={{ width: 64, height: 64, fontSize: '2rem', borderRadius: '16px', margin: '0 auto 16px' }}>⚡</div>
          <h2>Security Layers Active</h2>
          <p style={{ color: 'var(--text-secondary)', marginTop: '8px' }}>
            Your BlinkPass identity is protected by 4 independent security layers.
          </p>
        </div>

        <div className="security-layers-grid">
          {LAYERS.map((layer, i) => (
            <div
              key={layer.label}
              className={`security-layer-card active`}
              style={{
                opacity: i < visibleCount ? 1 : 0,
                transform: i < visibleCount ? 'translateY(0)' : 'translateY(20px)',
                transition: 'opacity 0.4s ease, transform 0.4s ease',
                animationDelay: 'unset',
              }}
            >
              <span className="layer-icon">{layer.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: '0.9375rem' }}>{layer.label}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>{layer.desc}</div>
              </div>
              {i < visibleCount && (
                <span className="badge badge-success">✓ Active</span>
              )}
            </div>
          ))}
        </div>

        {allVisible && (
          <div
            style={{
              marginTop: '32px',
              opacity: 1,
              animation: 'fade-up 0.4s ease both',
            }}
          >
            <div className="alert alert-info" style={{ marginBottom: '24px' }}>
              🎉 All 4 security layers are active. Your account is fully protected.
            </div>
            <button
              className="btn btn-primary btn-large btn-full"
              onClick={onContinue}
            >
              Continue to BlinkPass →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
