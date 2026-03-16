import { useState, useEffect, useRef } from 'react';
import type { User, Notification } from '../../types';
import { requestMagicLink, pollMagicLink } from '../../api';

interface Props {
  onSuccess: (accessToken: string, user: User) => void;
  onBack: () => void;
  notify: (message: string, type: Notification['type']) => void;
}

export default function MagicLinkAuth({ onSuccess, onBack, notify }: Props) {
  const [email, setEmail] = useState(localStorage.getItem('bp_email') ?? '');
  const [step, setStep] = useState<'input' | 'polling' | 'success'>('input');
  const [loading, setLoading] = useState(false);
  const [pollToken, setPollToken] = useState('');
  const [pollCount, setPollCount] = useState(0);
  const pollInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (pollInterval.current) {
      clearInterval(pollInterval.current);
      pollInterval.current = null;
    }
  };

  useEffect(() => {
    return () => stopPolling();
  }, []);

  const startPolling = (token: string) => {
    stopPolling();
    setPollCount(0);

    pollInterval.current = setInterval(async () => {
      setPollCount(c => c + 1);
      try {
        const result = await pollMagicLink(token);
        if (result.status === 'authenticated' && result.access_token) {
          stopPolling();
          setStep('success');
          notify('Magic link verified! Signing you in… ✉️', 'success');
          setTimeout(() => {
            onSuccess(result.access_token!, {
              id: '',
              email,
              displayName: email.split('@')[0],
            });
          }, 800);
        }
      } catch {
        // Keep polling on network errors
      }
    }, 3000);

    // Stop after 5 minutes
    setTimeout(() => {
      stopPolling();
      if (step === 'polling') {
        setStep('input');
        notify('Magic link expired. Please request a new one.', 'warning');
      }
    }, 300_000);
  };

  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) { notify('Please enter your email address.', 'error'); return; }
    setLoading(true);
    try {
      const res = await requestMagicLink(email);
      setPollToken(res.poll_token);
      setStep('polling');
      startPolling(res.poll_token);
      notify('Magic link sent! Check your inbox.', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to send magic link';
      notify(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    stopPolling();
    setStep('input');
    setPollCount(0);
  };

  return (
    <div className="landing-container page-enter">
      <div style={{ width: '100%', maxWidth: '400px' }}>
        <button className="btn btn-ghost" onClick={onBack} style={{ marginBottom: '24px', padding: '6px 0' }}>
          ← Back
        </button>

        {step === 'input' && (
          <>
            <div style={{ marginBottom: '32px' }}>
              <div style={{ fontSize: '3rem', marginBottom: '12px' }}>✉️</div>
              <h2>Sign in with Magic Link</h2>
              <p style={{ color: 'var(--text-secondary)', marginTop: '8px' }}>
                We'll send you a one-click sign-in link — no password needed.
              </p>
            </div>

            <form onSubmit={handleRequest}>
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

              <button className="btn btn-primary btn-full btn-large" type="submit" disabled={loading}>
                {loading ? <span className="spinner" /> : '✉️ Send Magic Link'}
              </button>
            </form>
          </>
        )}

        {step === 'polling' && (
          <div style={{ textAlign: 'center' }}>
            <div className="envelope-anim">✉️</div>
            <h2 style={{ marginTop: '24px' }}>Check your email</h2>
            <p style={{ color: 'var(--text-secondary)', marginTop: '12px' }}>
              We sent a magic link to <strong style={{ color: 'var(--text-primary)' }}>{email}</strong>.<br />
              Click the link to sign in — the tab will update automatically.
            </p>

            <div style={{ marginTop: '32px', padding: '20px', background: 'var(--surface-card)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
              <div className="polling-indicator" style={{ justifyContent: 'center' }}>
                <div className="polling-dot" />
                <span>Waiting for you to click the link… (check #{pollCount})</span>
              </div>
            </div>

            <div style={{ marginTop: '24px', display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button className="btn btn-secondary" onClick={handleResend}>
                Resend Link
              </button>
              <button className="btn btn-ghost" onClick={() => { stopPolling(); setStep('input'); }}>
                Use Different Email
              </button>
            </div>

            <p style={{ marginTop: '16px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Polling token: <span className="mono">{pollToken.substring(0, 20)}…</span>
            </p>
          </div>
        )}

        {step === 'success' && (
          <div style={{ textAlign: 'center' }}>
            <div className="checkmark" style={{ margin: '0 auto 24px', width: 64, height: 64, fontSize: '2rem' }}>✓</div>
            <h2>Magic link verified!</h2>
            <p style={{ color: 'var(--text-secondary)', marginTop: '8px' }}>Signing you in…</p>
          </div>
        )}
      </div>
    </div>
  );
}
