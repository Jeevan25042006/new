import { useState, useCallback, useEffect } from 'react';
import type { Notification, AppView, User } from './types';
import { setAccessToken } from './api';
import NotificationBanner from './components/NotificationBanner';
import LoginPage from './components/auth/LoginPage';
import RegisterPage from './components/auth/RegisterPage';
import SecuritySetup from './components/setup/SecuritySetup';
import SecurityLayersDashboard from './components/setup/SecurityLayersDashboard';
import Dashboard from './components/dashboard/Dashboard';
import SessionList from './components/dashboard/SessionList';
import AuthorizedApps from './components/dashboard/AuthorizedApps';
import IdentityPanel from './components/identity/IdentityPanel';
import DeveloperConsole from './components/developer/DeveloperConsole';
import AdminPanel from './components/admin/AdminPanel';

let _notifId = 0;

function App() {
  const [view, setView] = useState<AppView>('landing');
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin] = useState(false);

  // Re-hydrate display info from localStorage on mount
  useEffect(() => {
    const email = localStorage.getItem('bp_email');
    const displayName = localStorage.getItem('bp_displayName');
    if (email) {
      setUser({ id: '', email, displayName: displayName ?? undefined });
    }
  }, []);

  const notify = useCallback((message: string, type: Notification['type'] = 'info') => {
    const id = String(++_notifId);
    setNotifications(prev => [...prev, { id, message, type }]);
  }, []);

  const dismissNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const handleSignIn = useCallback((accessToken: string, userData: User) => {
    setAccessToken(accessToken);
    setUser(userData);
    localStorage.setItem('bp_email', userData.email);
    if (userData.displayName) localStorage.setItem('bp_displayName', userData.displayName);
    setView('dashboard');
    notify(`Welcome back, ${userData.displayName ?? userData.email.split('@')[0]}! 👋`, 'success');
  }, [notify]);

  const handleRegister = useCallback((email: string) => {
    localStorage.setItem('bp_email', email);
    const displayName = email.split('@')[0];
    localStorage.setItem('bp_displayName', displayName);
    setUser({ id: '', email, displayName });
    setView('security-setup');
  }, []);

  const handleSignOut = useCallback(() => {
    setAccessToken(null);
    setUser(null);
    localStorage.removeItem('bp_email');
    localStorage.removeItem('bp_displayName');
    setView('landing');
    notify('You have been signed out.', 'info');
  }, [notify]);

  const navigateTo = useCallback((v: AppView) => setView(v), []);

  const isAuthenticated = !!user && view !== 'landing' && view !== 'login' && view !== 'register' && view !== 'security-setup' && view !== 'security-layers';

  const getInitial = () => {
    if (!user) return '?';
    return (user.displayName ?? user.email)[0].toUpperCase();
  };

  const renderView = () => {
    switch (view) {
      case 'landing':
        return <LandingPage onSignIn={() => setView('login')} onSignUp={() => setView('register')} />;
      case 'login':
        return (
          <LoginPage
            onSuccess={handleSignIn}
            onRegister={() => setView('register')}
            onBack={() => setView('landing')}
            notify={notify}
          />
        );
      case 'register':
        return (
          <RegisterPage
            onSuccess={handleRegister}
            onLogin={() => setView('login')}
            onBack={() => setView('landing')}
            notify={notify}
          />
        );
      case 'security-setup':
        return (
          <SecuritySetup
            email={user?.email ?? localStorage.getItem('bp_email') ?? ''}
            onComplete={() => setView('security-layers')}
            notify={notify}
          />
        );
      case 'security-layers':
        return <SecurityLayersDashboard onContinue={() => {
          notify('BlinkPass setup complete! 🎉', 'success');
          // For the demo, we go to login since we don't have a token yet
          setView('login');
        }} />;
      case 'dashboard':
        return <Dashboard user={user!} onNavigate={navigateTo} notify={notify} />;
      case 'identity':
        return <IdentityPanel notify={notify} />;
      case 'authorized-apps':
        return <AuthorizedApps notify={notify} />;
      case 'developer':
        return <DeveloperConsole notify={notify} />;
      case 'admin':
        return <AdminPanel notify={notify} />;
      default:
        return <SessionList notify={notify} />;
    }
  };

  return (
    <div className="app-container">
      <NotificationBanner notifications={notifications} onDismiss={dismissNotification} />

      {/* Top bar (visible when authenticated) */}
      {isAuthenticated && (
        <header className="top-bar">
          <div className="logo-mark">
            <div className="logo-icon">⚡</div>
            BlinkPass
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div className="avatar-circle" title={user?.email}>
              {getInitial()}
            </div>
            <button className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: '0.85rem' }} onClick={handleSignOut}>
              Sign Out
            </button>
          </div>
        </header>
      )}

      <main className={isAuthenticated ? 'main-content' : ''}>
        <div className="page-enter">
          {renderView()}
        </div>
      </main>

      {/* Bottom navigation */}
      {isAuthenticated && (
        <nav className="bottom-nav">
          <button className={`nav-item ${view === 'dashboard' ? 'active' : ''}`} onClick={() => setView('dashboard')}>
            <span className="nav-icon">🏠</span>
            <span>Home</span>
          </button>
          <button className={`nav-item ${view === 'identity' ? 'active' : ''}`} onClick={() => setView('identity')}>
            <span className="nav-icon">🪪</span>
            <span>Identity</span>
          </button>
          <button className={`nav-item ${view === 'authorized-apps' ? 'active' : ''}`} onClick={() => setView('authorized-apps')}>
            <span className="nav-icon">🔗</span>
            <span>Apps</span>
          </button>
          <button className={`nav-item ${view === 'developer' ? 'active' : ''}`} onClick={() => setView('developer')}>
            <span className="nav-icon">⚙️</span>
            <span>Dev</span>
          </button>
          {isAdmin && (
            <button className={`nav-item ${view === 'admin' ? 'active' : ''}`} onClick={() => setView('admin')}>
              <span className="nav-icon">🛡️</span>
              <span>Admin</span>
            </button>
          )}
        </nav>
      )}
    </div>
  );
}

// ─── Landing Page (inline for brevity) ────────────────────────────────────────
function LandingPage({ onSignIn, onSignUp }: { onSignIn: () => void; onSignUp: () => void }) {
  return (
    <div className="landing-container page-enter">
      {/* Background orbs */}
      <div style={{
        position: 'fixed', top: '-20%', left: '-10%', width: '60vw', height: '60vw',
        borderRadius: '50%', background: 'radial-gradient(circle, rgba(0,120,212,0.12) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'fixed', bottom: '-10%', right: '-10%', width: '50vw', height: '50vw',
        borderRadius: '50%', background: 'radial-gradient(circle, rgba(135,100,184,0.12) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <div className="landing-hero">
        <div className="landing-logo">⚡</div>
        <h1 style={{ background: 'linear-gradient(135deg, #ffffff, #a0b4ff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
          BlinkPass
        </h1>
        <p className="landing-tagline">Zero passwords. Zero friction.</p>
        <p style={{ marginTop: '16px', color: 'var(--text-muted)', fontSize: '0.95rem', maxWidth: '400px' }}>
          The passwordless identity provider built for modern applications. Secure, fast, and developer-friendly.
        </p>
      </div>

      <div className="landing-actions">
        <button className="btn btn-primary btn-large btn-full" onClick={onSignIn}>
          Sign In
        </button>
        <button className="btn btn-secondary btn-large btn-full" onClick={onSignUp}>
          Create Account
        </button>
      </div>

      <div style={{ marginTop: '48px', display: 'flex', gap: '32px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
        <span>🔐 Passkeys</span>
        <span>✉️ Magic Links</span>
        <span>📱 SMS OTP</span>
        <span>🪪 DIDs</span>
      </div>
    </div>
  );
}

export default App;
