import { useState, useRef, useEffect } from 'react';
import type { User, Notification } from '../../types';
import { requestOtp, verifyOtp } from '../../api';

interface Props {
  onSuccess: (accessToken: string, user: User) => void;
  onBack: () => void;
  notify: (message: string, type: Notification['type']) => void;
}

const OTP_LENGTH = 6;

export default function OtpAuth({ onSuccess, onBack, notify }: Props) {
  const [phone, setPhone] = useState('');
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [loading, setLoading] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(0);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
  }, []);

  const startCountdown = () => {
    setResendCountdown(60);
    countdownRef.current = setInterval(() => {
      setResendCountdown(prev => {
        if (prev <= 1) { clearInterval(countdownRef.current!); return 0; }
        return prev - 1;
      });
    }, 1000);
  };

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone) { notify('Please enter your phone number.', 'error'); return; }
    setLoading(true);
    try {
      await requestOtp(phone);
      setStep('code');
      startCountdown();
      notify('OTP sent! Check your messages.', 'success');
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to send OTP';
      notify(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDigitChange = (idx: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const newDigits = [...digits];
    if (value.length > 1) {
      // Handle paste
      const pasted = value.replace(/\D/g, '').slice(0, OTP_LENGTH);
      const arr = [...pasted.split(''), ...Array(OTP_LENGTH).fill('')].slice(0, OTP_LENGTH);
      setDigits(arr);
      const nextIdx = Math.min(pasted.length, OTP_LENGTH - 1);
      inputRefs.current[nextIdx]?.focus();
      return;
    }
    newDigits[idx] = value;
    setDigits(newDigits);
    if (value && idx < OTP_LENGTH - 1) {
      inputRefs.current[idx + 1]?.focus();
    }
  };

  const handleKeyDown = (idx: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !digits[idx] && idx > 0) {
      inputRefs.current[idx - 1]?.focus();
    }
  };

  const handleVerify = async () => {
    const code = digits.join('');
    if (code.length < OTP_LENGTH) { notify('Please enter the complete 6-digit code.', 'error'); return; }
    setLoading(true);
    try {
      const tokens = await verifyOtp(phone, code);
      notify('OTP verified! Signing you in… 📱', 'success');
      onSuccess(tokens.accessToken, { id: '', email: '', displayName: phone });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Invalid OTP code';
      notify(msg, 'error');
      setDigits(Array(OTP_LENGTH).fill(''));
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendCountdown > 0) return;
    setLoading(true);
    try {
      await requestOtp(phone);
      setDigits(Array(OTP_LENGTH).fill(''));
      startCountdown();
      notify('New OTP sent!', 'success');
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to resend OTP';
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

        {step === 'phone' && (
          <>
            <div style={{ marginBottom: '32px' }}>
              <div style={{ fontSize: '3rem', marginBottom: '12px' }}>📱</div>
              <h2>Sign in with SMS OTP</h2>
              <p style={{ color: 'var(--text-secondary)', marginTop: '8px' }}>
                We'll send a 6-digit verification code to your phone.
              </p>
            </div>

            <form onSubmit={handleRequestOtp}>
              <div className="input-group">
                <label className="input-label">Phone Number</label>
                <input
                  className="input"
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="+1 555 000 0000"
                  required
                  autoFocus
                />
              </div>

              <button className="btn btn-primary btn-full btn-large" type="submit" disabled={loading}>
                {loading ? <span className="spinner" /> : '📱 Send Code'}
              </button>
            </form>
          </>
        )}

        {step === 'code' && (
          <>
            <div style={{ marginBottom: '32px' }}>
              <div style={{ fontSize: '3rem', marginBottom: '12px' }}>📱</div>
              <h2>Enter verification code</h2>
              <p style={{ color: 'var(--text-secondary)', marginTop: '8px' }}>
                We sent a 6-digit code to <strong style={{ color: 'var(--text-primary)' }}>{phone}</strong>
              </p>
            </div>

            <div className="otp-inputs" style={{ marginBottom: '28px' }}>
              {digits.map((d, i) => (
                <input
                  key={i}
                  ref={el => { inputRefs.current[i] = el; }}
                  className="otp-digit"
                  type="text"
                  inputMode="numeric"
                  pattern="\d*"
                  maxLength={OTP_LENGTH}
                  value={d}
                  onChange={e => handleDigitChange(i, e.target.value)}
                  onKeyDown={e => handleKeyDown(i, e)}
                  autoComplete={i === 0 ? 'one-time-code' : 'off'}
                />
              ))}
            </div>

            <button
              className="btn btn-primary btn-full btn-large"
              onClick={handleVerify}
              disabled={loading || digits.join('').length < OTP_LENGTH}
            >
              {loading ? <span className="spinner" /> : '✓ Verify Code'}
            </button>

            <div style={{ marginTop: '20px', textAlign: 'center', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
              {resendCountdown > 0 ? (
                <span>Resend in {resendCountdown}s</span>
              ) : (
                <button className="btn btn-ghost" style={{ fontSize: '0.875rem', padding: '4px 8px' }} onClick={handleResend} disabled={loading}>
                  Resend code
                </button>
              )}
              {' · '}
              <button className="btn btn-ghost" style={{ fontSize: '0.875rem', padding: '4px 8px' }} onClick={() => setStep('phone')}>
                Change number
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
