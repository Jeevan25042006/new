import { useState } from 'react';
import type { User, Notification } from '../../types';
import { getBiometricRegisterOptions, verifyBiometricRegister, getBiometricAuthOptions, verifyBiometricAuth } from '../../api';

// WebAuthn helpers
function bufferToBase64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let str = '';
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function base64urlToBuffer(b64: string): ArrayBuffer {
  const padded = b64.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(padded);
  const buf = new ArrayBuffer(bin.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) view[i] = bin.charCodeAt(i);
  return buf;
}

interface Props {
  mode: 'login' | 'register';
  email?: string;
  onSuccess: (accessToken: string, user: User) => void;
  onBack: () => void;
  notify: (message: string, type: Notification['type']) => void;
}

export default function PasskeyAuth({ mode, email: initialEmail, onSuccess, onBack, notify }: Props) {
  const [email, setEmail] = useState(initialEmail ?? localStorage.getItem('bp_email') ?? '');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'input' | 'prompt' | 'success'>('input');

  const handlePasskeyRegister = async () => {
    if (!email) { notify('Please enter your email address.', 'error'); return; }
    setLoading(true);
    setStep('prompt');
    try {
      const options = await getBiometricRegisterOptions(email);
      const challenge = base64urlToBuffer(options.challenge as string);

      const userOpt = options.user as { id: string; name: string; displayName: string };
      const userId = base64urlToBuffer(userOpt.id);

      const credential = await navigator.credentials.create({
        publicKey: {
          ...(options as unknown as PublicKeyCredentialCreationOptions),
          challenge,
          user: { ...userOpt, id: userId },
          pubKeyCredParams: (options.pubKeyCredParams as PublicKeyCredentialParameters[]) ?? [
            { type: 'public-key', alg: -7 },
            { type: 'public-key', alg: -257 },
          ],
        },
      }) as PublicKeyCredential;

      if (!credential) throw new Error('Credential creation cancelled');
      const res = credential.response as AuthenticatorAttestationResponse;

      await verifyBiometricRegister(email, {
        id: credential.id,
        rawId: bufferToBase64url(credential.rawId),
        type: credential.type,
        response: {
          clientDataJSON: bufferToBase64url(res.clientDataJSON),
          attestationObject: bufferToBase64url(res.attestationObject),
        },
      });

      setStep('success');
      notify('Passkey registered successfully! ✅', 'success');
      setTimeout(() => {
        const firstName = email.split('@')[0];
        onSuccess('', { id: '', email, displayName: firstName });
      }, 1200);
    } catch (err) {
      setStep('input');
      const msg = err instanceof Error ? err.message : 'Passkey registration failed';
      notify(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handlePasskeyLogin = async () => {
    if (!email) { notify('Please enter your email address.', 'error'); return; }
    setLoading(true);
    setStep('prompt');
    try {
      const options = await getBiometricAuthOptions(email);
      const challenge = base64urlToBuffer(options.challenge as string);

      const allowCredentials = ((options.allowCredentials as Array<{ id: string; type: string }>) ?? []).map(c => ({
        id: base64urlToBuffer(c.id),
        type: 'public-key' as const,
      }));

      const credential = await navigator.credentials.get({
        publicKey: {
          challenge,
          allowCredentials,
          userVerification: 'preferred',
          timeout: 60000,
        },
      }) as PublicKeyCredential;

      if (!credential) throw new Error('Authentication cancelled');
      const res = credential.response as AuthenticatorAssertionResponse;

      const tokens = await verifyBiometricAuth({
        id: credential.id,
        rawId: bufferToBase64url(credential.rawId),
        type: credential.type,
        response: {
          clientDataJSON: bufferToBase64url(res.clientDataJSON),
          authenticatorData: bufferToBase64url(res.authenticatorData),
          signature: bufferToBase64url(res.signature),
          userHandle: res.userHandle ? bufferToBase64url(res.userHandle) : null,
        },
      });

      setStep('success');
      notify('Signed in with passkey! 🔐', 'success');
      setTimeout(() => {
        onSuccess(tokens.accessToken, { id: '', email, displayName: email.split('@')[0] });
      }, 800);
    } catch (err) {
      setStep('input');
      const msg = err instanceof Error ? err.message : 'Passkey authentication failed';
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

        {step === 'prompt' && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '4rem', marginBottom: '24px' }}>🔐</div>
            <h2>Waiting for your passkey…</h2>
            <p style={{ color: 'var(--text-secondary)', marginTop: '12px' }}>
              Follow the prompts on your device to authenticate with biometrics or your security key.
            </p>
            <div style={{ marginTop: '32px', display: 'flex', justifyContent: 'center' }}>
              <div className="spinner spinner-large" />
            </div>
          </div>
        )}

        {step === 'success' && (
          <div style={{ textAlign: 'center' }}>
            <div className="checkmark" style={{ margin: '0 auto 24px', width: 64, height: 64, fontSize: '2rem' }}>✓</div>
            <h2>Passkey {mode === 'register' ? 'Registered' : 'Verified'}!</h2>
          </div>
        )}

        {step === 'input' && (
          <>
            <div style={{ marginBottom: '32px' }}>
              <div style={{ fontSize: '3rem', marginBottom: '12px' }}>🔐</div>
              <h2>{mode === 'register' ? 'Register a Passkey' : 'Sign in with Passkey'}</h2>
              <p style={{ color: 'var(--text-secondary)', marginTop: '8px' }}>
                {mode === 'register'
                  ? 'Register your biometric authenticator or security key'
                  : 'Use your fingerprint, face ID, or hardware key'}
              </p>
            </div>

            <div className="input-group">
              <label className="input-label">Email Address</label>
              <input
                className="input"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="username webauthn"
              />
            </div>

            <button
              className="btn btn-primary btn-full btn-large"
              onClick={mode === 'register' ? handlePasskeyRegister : handlePasskeyLogin}
              disabled={loading || !email}
            >
              {loading ? <span className="spinner" /> : mode === 'register' ? '🔐 Register Passkey' : '🔐 Authenticate'}
            </button>

            {!window.PublicKeyCredential && (
              <div className="alert alert-warning" style={{ marginTop: '16px' }}>
                ⚠️ Your browser does not support WebAuthn passkeys. Please try a different sign-in method.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
