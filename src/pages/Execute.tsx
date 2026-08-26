import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import FocusTimer from '../components/FocusTimer';
import type { Mission, Task } from '../types/database';

const STATUS_LABELS: Record<string, string> = {
  planned: 'Planned',
  active:  'Active',
  paused:  'Paused',
  completed: 'Completed',
  abandoned: 'Abandoned',
};

const STATUS_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  planned:   { bg: 'rgba(122,143,166,0.1)',  color: '#7A8FA6', border: 'rgba(122,143,166,0.2)' },
  active:    { bg: 'rgba(184,122,85,0.12)',  color: '#B87A55', border: 'rgba(184,122,85,0.3)' },
  paused:    { bg: 'rgba(200,136,58,0.1)',   color: '#D6A84F', border: 'rgba(200,136,58,0.25)' },
  completed: { bg: 'rgba(74,140,106,0.1)',   color: '#4A8C6A', border: 'rgba(74,140,106,0.25)' },
  abandoned: { bg: 'rgba(168,59,59,0.08)',   color: '#A83B3B', border: 'rgba(168,59,59,0.2)' },
};

export default function Execute() {
  const location  = useLocation();
  const navigate  = useNavigate();

  // Mission + optional linked task arrive via navigation state
  const initialMission = (location.state as { mission?: Mission; linkedTask?: Task } | null)?.mission ?? null;
  const linkedTask      = (location.state as { mission?: Mission; linkedTask?: Task } | null)?.linkedTask ?? null;

  const [mission, setMission] = useState<Mission | null>(initialMission);

  // No mission in state — user navigated here directly without choosing one
  if (!mission) {
    return (
      <div className="max-w-md mx-auto mt-24 text-center px-4">
        <div
          className="rounded-xl p-10"
          style={{ backgroundColor: 'var(--color-app-surface)', border: '1px solid var(--color-app-border)' }}
        >
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-5"
            style={{ backgroundColor: 'var(--color-app-surface-raised)' }}
          >
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}
              style={{ color: 'var(--color-app-text-dim)' }}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
            </svg>
          </div>
          <h2 className="font-display text-xl mb-2" style={{ color: 'var(--color-app-text)' }}>
            No mission selected
          </h2>
          <p className="text-sm mb-7" style={{ color: 'var(--color-app-text-muted)' }}>
            Choose a mission from the Plan page to begin executing.
          </p>
          <Link
            to="/mission"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium"
            style={{ backgroundColor: 'var(--color-app-mission)', color: '#fff' }}
          >
            Go to Plan
          </Link>
        </div>
      </div>
    );
  }

  const sc = STATUS_COLORS[mission.status] ?? STATUS_COLORS.planned;
  const isFinished = mission.status === 'completed' || mission.status === 'abandoned';

  const handleMissionUpdate = (updated: Mission) => {
    setMission(updated);
  };

  return (
    <div className="max-w-xl mx-auto px-4">

      {/* ── Breadcrumb ──────────────────────────────────────────── */}
      <nav className="flex items-center gap-2 mb-8 text-xs" style={{ color: 'var(--color-app-text-dim)' }}>
        <Link
          to="/home"
          className="transition-colors hover:underline"
          style={{ color: 'var(--color-app-text-dim)' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-app-text-muted)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-app-text-dim)')}
        >
          Capture
        </Link>
        <span style={{ color: 'var(--color-app-text-dim)', opacity: 0.4 }}>›</span>
        <Link
          to="/mission"
          className="transition-colors hover:underline"
          style={{ color: 'var(--color-app-text-dim)' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-app-text-muted)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-app-text-dim)')}
        >
          Plan
        </Link>
        <span style={{ color: 'var(--color-app-text-dim)', opacity: 0.4 }}>›</span>
        <span style={{ color: 'var(--color-app-mission)' }}>Execute</span>
      </nav>

      {/* ── Mission context ─────────────────────────────────────── */}
      <div className="mb-6">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <span
            className="text-[0.65rem] font-bold tracking-wider uppercase px-2 py-0.5 rounded"
            style={{ backgroundColor: sc.bg, color: sc.color, border: `1px solid ${sc.border}` }}
          >
            {STATUS_LABELS[mission.status]}
          </span>
          {linkedTask && (
            <span className="text-xs truncate max-w-[200px]" style={{ color: 'var(--color-app-text-dim)' }}>
              ↳ {linkedTask.title}
            </span>
          )}
        </div>

        <h1 className="font-display text-2xl leading-snug mb-1" style={{ color: 'var(--color-app-text)' }}>
          {mission.title}
        </h1>

        {mission.objective && (
          <p className="text-sm" style={{ color: 'var(--color-app-text-muted)' }}>
            {mission.objective}
          </p>
        )}

        {mission.next_action && (
          <div
            className="mt-3 px-3 py-2.5 rounded-lg flex items-start gap-2"
            style={{
              backgroundColor: 'var(--color-app-surface-raised)',
              border: '1px solid var(--color-app-border-subtle)',
            }}
          >
            <svg
              className="w-3.5 h-3.5 mt-0.5 flex-shrink-0"
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
              style={{ color: 'var(--color-app-mission)' }}
            >
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347c-.75.412-1.667-.13-1.667-.986V5.653z" />
            </svg>
            <span className="text-xs" style={{ color: 'var(--color-app-text-muted)' }}>
              {mission.next_action}
            </span>
          </div>
        )}
      </div>

      {/* ── Timer ───────────────────────────────────────────────── */}
      <FocusTimer
        mission={mission}
        onMissionUpdate={handleMissionUpdate}
        prominent
      />

      {/* ── Post-complete actions ────────────────────────────────── */}
      {isFinished && (
        <div
          className="mt-5 rounded-xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4"
          style={{
            backgroundColor: 'var(--color-app-surface)',
            border: '1px solid var(--color-app-border)',
          }}
        >
          <div>
            <p className="text-sm font-medium" style={{ color: 'var(--color-app-text)' }}>
              {mission.status === 'completed' ? 'Mission accomplished.' : 'Mission abandoned.'}
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-app-text-muted)' }}>
              {mission.status === 'completed'
                ? 'Your progress has been logged to your Journey.'
                : 'Head back to Plan to regroup.'}
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => navigate('/mission')}
              className="px-4 py-2 rounded-lg text-sm font-medium cursor-pointer border-none transition-all"
              style={{
                backgroundColor: 'transparent',
                color: 'var(--color-app-text-muted)',
                border: '1px solid var(--color-app-border)',
              }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-app-text)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-app-text-muted)')}
            >
              Back to Plan
            </button>
            {mission.status === 'completed' && (
              <button
                onClick={() => navigate('/journey')}
                className="px-4 py-2 rounded-lg text-sm font-medium cursor-pointer border-none transition-all"
                style={{ backgroundColor: 'var(--color-app-mission)', color: '#fff' }}
              >
                View Journey
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
