import { useState, useEffect } from 'react';
import type { AuditLogEntry, Notification } from '../../types';
import { getAuditLog } from '../../api';

interface Props {
  notify: (message: string, type: Notification['type']) => void;
}

export default function AdminPanel({ notify }: Props) {
  const [log, setLog] = useState<AuditLogEntry[]>([]);
  const [filtered, setFiltered] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterEvent, setFilterEvent] = useState('');
  const [filterOutcome, setFilterOutcome] = useState('');

  useEffect(() => { load(); }, []);

  useEffect(() => {
    let result = log;
    if (filterEvent) result = result.filter(e => e.eventType?.toLowerCase().includes(filterEvent.toLowerCase()));
    if (filterOutcome) result = result.filter(e => e.outcome === filterOutcome);
    setFiltered(result);
  }, [log, filterEvent, filterOutcome]);

  const load = async () => {
    setLoading(true);
    try {
      const entries = await getAuditLog();
      setLog(entries);
      setFiltered(entries);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load audit log';
      notify(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = () => {
    const json = JSON.stringify(filtered, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `blinkpass-audit-log-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    notify('Audit log exported.', 'success');
  };

  const formatDate = (d: string) => new Date(d).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });

  const outcomeClass = (outcome?: string) => {
    if (outcome === 'success') return 'badge-success';
    if (outcome === 'fail' || outcome === 'failure') return 'badge-error';
    return 'badge-info';
  };

  const uniqueOutcomes = [...new Set(log.map(e => e.outcome).filter(Boolean))];

  return (
    <div className="page-enter">
      <div className="section-header" style={{ marginBottom: '20px' }}>
        <h2>🛡️ Audit Log</h2>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-secondary" onClick={load} disabled={loading}>
            {loading ? <span className="spinner" /> : '↺'}
          </button>
          <button className="btn btn-secondary" onClick={handleExport} disabled={filtered.length === 0}>
            ⬇️ Export JSON
          </button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 200px' }}>
          <input
            className="input"
            type="text"
            placeholder="Filter by event type…"
            value={filterEvent}
            onChange={e => setFilterEvent(e.target.value)}
          />
        </div>
        <div style={{ flex: '0 0 160px' }}>
          <select
            className="input"
            value={filterOutcome}
            onChange={e => setFilterOutcome(e.target.value)}
            style={{ cursor: 'pointer' }}
          >
            <option value="">All outcomes</option>
            {uniqueOutcomes.map(o => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </div>
        {(filterEvent || filterOutcome) && (
          <button className="btn btn-ghost" onClick={() => { setFilterEvent(''); setFilterOutcome(''); }}>
            Clear filters
          </button>
        )}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '48px' }}>
          <div className="spinner spinner-large" style={{ margin: '0 auto' }} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🛡️</div>
          <p>{log.length === 0 ? 'No audit log entries found.' : 'No entries match your filters.'}</p>
        </div>
      ) : (
        <>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '12px' }}>
            Showing {filtered.length} of {log.length} entries
          </p>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Event</th>
                  <th>Auth Method</th>
                  <th>IP Address</th>
                  <th>Outcome</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(entry => (
                  <tr key={entry.id}>
                    <td style={{ whiteSpace: 'nowrap', fontSize: '0.8rem' }}>{formatDate(entry.createdAt)}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{entry.eventType ?? '—'}</td>
                    <td>
                      {entry.authMethod
                        ? <span className="badge badge-info">{entry.authMethod}</span>
                        : '—'}
                    </td>
                    <td className="mono" style={{ fontSize: '0.8rem' }}>{entry.ipAddress ?? '—'}</td>
                    <td>
                      {entry.outcome
                        ? <span className={`badge ${outcomeClass(entry.outcome)}`}>{entry.outcome}</span>
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
