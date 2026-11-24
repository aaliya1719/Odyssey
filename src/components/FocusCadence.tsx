import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { missionService } from '../services/missionService';
import { chime } from '../lib/chime';
import {
  CADENCE_PRESETS,
  IDLE_REST,
  advanceRest,
  getPreset,
  readCadence,
  restProgress,
  restRemainingSeconds,
  startRest,
  writeCadence,
  type CadenceId,
  type RestState,
} from '../lib/cadence';
import type { Mission } from '../types/database';

function clock(seconds: number): string {
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

const panelStyle = {
  border: '1px solid var(--color-app-border)',
  color: 'var(--color-app-text-muted)',
} as const;

/** Preset picker shown before a mission starts. Picking a preset sets the mission's planned minutes. */
export function CadenceSelector({
  mission,
  onMissionChange,
}: {
  mission: Mission;
  onMissionChange: (mission: Mission) => void;
}) {
  const [cadence, setCadence] = useState<CadenceId>(() => readCadence());
  const [error, setError] = useState<string | null>(null);

  const choose = async (id: CadenceId) => {
    setCadence(id);
    writeCadence(id);
    setError(null);
    const { focusMinutes } = getPreset(id);
    if (focusMinutes === null || focusMinutes === mission.planned_minutes) return;
    try {
      onMissionChange(await missionService.updateMission(mission.id, { planned_minutes: focusMinutes }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change the focus length.');
    }
  };

  return (
    <div className="mx-5 mb-4 rounded-lg px-3 py-2.5 text-xs" style={panelStyle}>
      <p className="mb-2 font-semibold uppercase tracking-wider text-[0.65rem]" style={{ color: 'var(--color-app-text-dim)' }}>
        Focus cadence
      </p>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Focus cadence">
        {CADENCE_PRESETS.map(p => (
          <button
            key={p.id}
            type="button"
            aria-pressed={cadence === p.id}
            onClick={() => void choose(p.id)}
            className="cursor-pointer rounded border px-2 py-1 font-semibold"
            style={{
              color: cadence === p.id ? 'var(--color-app-mission)' : 'var(--color-app-text-dim)',
              borderColor: cadence === p.id ? 'color-mix(in srgb, var(--color-app-mission) 40%, transparent)' : 'var(--color-app-border)',
              backgroundColor: cadence === p.id ? 'color-mix(in srgb, var(--color-app-mission) 12%, transparent)' : 'transparent',
            }}
          >
            {p.label}
            {p.focusMinutes !== null && <span className="font-normal"> {p.focusMinutes}m / {p.breakMinutes}m</span>}
          </button>
        ))}
      </div>
      {error && <p role="alert" className="mt-2" style={{ color: 'var(--color-status-urgent)' }}>{error}</p>}
    </div>
  );
}

/** After a mission completes: offer a rest interval with a breathing ring, then a chime. */
export function RestInterval() {
  const navigate = useNavigate();
  const breakMinutes = getPreset(readCadence()).breakMinutes;
  const [rest, setRest] = useState<RestState>(IDLE_REST);
  const [now, setNow] = useState(() => Date.now());

  const resting = rest.phase === 'resting';
  useEffect(() => {
    if (!resting) return;
    const id = window.setInterval(() => {
      const t = Date.now();
      setNow(t);
      setRest(prev => {
        const next = advanceRest(prev, t);
        if (next.phase === 'done' && prev.phase === 'resting') chime.play('restOver');
        return next;
      });
    }, 500);
    return () => window.clearInterval(id);
  }, [resting]);

  const begin = () => {
    chime.unlock();
    const t = Date.now();
    setNow(t);
    setRest(startRest(breakMinutes, t));
  };

  if (rest.phase === 'idle') {
    return (
      <div className="mx-5 mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-xs" style={panelStyle}>
        <span>Nice work. Step away for a bit before the next one?</span>
        <button type="button" onClick={begin}
          className="cursor-pointer rounded border px-2.5 py-1 font-semibold"
          style={{ color: 'var(--color-app-success)', borderColor: 'color-mix(in srgb, var(--color-app-success) 40%, transparent)', background: 'transparent' }}>
          Begin Rest Interval ({breakMinutes} min)
        </button>
      </div>
    );
  }

  const done = rest.phase === 'done';
  const remaining = restRemainingSeconds(rest, now);
  const progress = restProgress(rest, now);
  const radius = 44;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="mx-5 mb-4 flex flex-col items-center gap-3 rounded-xl px-5 py-6 text-center" style={panelStyle}>
      <style>{`
        @keyframes odyssey-breathe { 0%,100% { transform: scale(0.94); opacity: 0.75; } 50% { transform: scale(1.06); opacity: 1; } }
        @media (prefers-reduced-motion: reduce) { .odyssey-breathe { animation: none !important; } }
      `}</style>
      <div className="relative flex h-28 w-28 items-center justify-center">
        <svg viewBox="0 0 100 100" className="odyssey-breathe absolute inset-0 -rotate-90"
          style={{ animation: done ? 'none' : 'odyssey-breathe 8s ease-in-out infinite' }} aria-hidden="true">
          <circle cx="50" cy="50" r={radius} fill="none" stroke="color-mix(in srgb, #6fb6c9 25%, transparent)" strokeWidth="5" />
          <circle cx="50" cy="50" r={radius} fill="none" stroke="#6fb6c9" strokeWidth="5" strokeLinecap="round"
            strokeDasharray={circumference} strokeDashoffset={circumference * (1 - progress)} />
        </svg>
        <span className="font-mono text-lg" style={{ color: 'var(--color-app-text)' }} role="timer" aria-live="off">
          {done ? 'Rested' : clock(remaining)}
        </span>
      </div>
      <p className="text-xs">{done ? 'Break is over. Ready when you are.' : 'Breathe in, breathe out. Rest until the timer ends.'}</p>
      <button type="button" onClick={() => navigate('/mission')}
        className="cursor-pointer rounded border px-3 py-1.5 text-xs font-semibold"
        style={{ color: 'var(--color-app-mission)', borderColor: 'var(--color-app-border)', background: 'transparent' }}>
        Ready for Next Mission
      </button>
    </div>
  );
}
