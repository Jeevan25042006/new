import { useEffect, useState } from 'react';
import type { Notification } from '../types';

interface Props {
  notifications: Notification[];
  onDismiss: (id: string) => void;
}

interface NotifState extends Notification {
  dismissing: boolean;
}

export default function NotificationBanner({ notifications, onDismiss }: Props) {
  const [states, setStates] = useState<NotifState[]>([]);

  useEffect(() => {
    setStates(prev => {
      const existingIds = new Set(prev.map(s => s.id));
      const newOnes = notifications
        .filter(n => !existingIds.has(n.id))
        .map(n => ({ ...n, dismissing: false }));
      // Remove stale states (notifications removed externally)
      const currentIds = new Set(notifications.map(n => n.id));
      const cleaned = prev.filter(s => currentIds.has(s.id));
      return [...cleaned, ...newOnes];
    });
  }, [notifications]);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    states.forEach(s => {
      if (!s.dismissing) {
        const t = setTimeout(() => startDismiss(s.id), 5000);
        timers.push(t);
      }
    });
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [states.length]);

  const startDismiss = (id: string) => {
    setStates(prev => prev.map(s => s.id === id ? { ...s, dismissing: true } : s));
    setTimeout(() => {
      setStates(prev => prev.filter(s => s.id !== id));
      onDismiss(id);
    }, 300);
  };

  const icons: Record<Notification['type'], string> = {
    success: '✅',
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️',
  };

  if (states.length === 0) return null;

  return (
    <div className="notification-container">
      {states.map(n => (
        <div
          key={n.id}
          className={`notification notification-${n.type}${n.dismissing ? ' dismissing' : ''}`}
          role="alert"
        >
          <span>{icons[n.type]}</span>
          <span style={{ flex: 1 }}>{n.message}</span>
          <button className="notification-close" onClick={() => startDismiss(n.id)} aria-label="Dismiss">
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
