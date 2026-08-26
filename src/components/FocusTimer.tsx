import { useEffect, useRef, useState } from 'react';
import { missionService } from '../services/missionService';
import { focusService } from '../services/focusService';
import type { FocusSession, Mission } from '../types/database';

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export interface FocusTimerProps {
  mission: Mission;
  onMissionUpdate: (m: Mission) => void;
  /** When true the timer renders in a larger, more prominent layout for the Execute page */
  prominent?: boolean;
}

export default function FocusTimer({ mission, onMissionUpdate, prominent = false }: FocusTimerProps) {
  const [session, setSession] = useState<FocusSession | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const [ending, setEnding] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const planned = mission.planned_minutes ?? 25;
  const plannedSeconds = planned * 60;

  const start = async () => {
    try {
      let m = mission;
      if (m.status !== 'active') {
        m = await missionService.activateMission(m.id);
        onMissionUpdate(m);
      }
      const s = await focusService.startSession(m.id);
      setSession(s);
      setElapsed(0);
      setRunning(true);
    } catch (err) {
      console.error(err);
    }
  };

  const pause = async () => {
    setRunning(false);
    if (session) {
      await focusService.endSession(session.id, false);
      setSession(null);
    }
    const m = await missionService.pauseMission(mission.id);
    onMissionUpdate(m);
  };

  const resume = async () => {
    const m = await missionService.activateMission(mission.id);
    onMissionUpdate(m);
    const s = await focusService.startSession(m.id);
    setSession(s);
    setRunning(true);
  };

  const complete = async () => {
    setEnding(true);
    setRunning(false);
    try {
      if (session) {
        await focusService.endSession(session.id, true);
        setSession(null);
      }
      const m = await missionService.completeMission(mission.id);
      onMissionUpdate(m);
    } finally {
      setEnding(false);
    }
  };

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => setElapsed((p) => p + 1), 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running]);

  const progress = Math.min(elapsed / plannedSeconds, 1);
  const ringSize  = prominent ? 192 : 128;
  const ringR     = prominent ? 82  : 54;
  const circumference = 2 * Math.PI * ringR;
  const isCompleted = mission.status === 'completed';
  const isPaused    = mission.status === 'paused';

  return (
    <div
      className="rounded-xl flex flex-col items-center gap-6"
      style={{
        padding: prominent ? '2rem' : '1.5rem',
        backgroundColor: 'var(--color-app-surface)',
        border: `1px solid ${running ? 'rgba(184,122,85,0.4)' : 'var(--color-app-border)'}`,
        boxShadow: running ? '0 0 0 1px rgba(184,122,85,0.08)' : 'none',
        transition: 'border-color 0.3s, box-shadow 0.3s',
      }}
    >
      {!prominent && (
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-app-mission)' }}>
          Focus Session
        </p>
      )}

      {/* Ring */}
      <div className="relative" style={{ width: ringSize, height: ringSize }}>
        <svg width={ringSize} height={ringSize} viewBox={`0 0 ${ringSize} ${ringSize}`} className="-rotate-90">
          <circle
            cx={ringSize / 2} cy={ringSize / 2} r={ringR}
            fill="none" stroke="rgba(30,60,100,0.3)"
            strokeWidth={prominent ? 7 : 6}
          />
          <circle
            cx={ringSize / 2} cy={ringSize / 2} r={ringR}
            fill="none"
            stroke={isCompleted ? '#4A8C6A' : '#B87A55'}
            strokeWidth={prominent ? 7 : 6}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - progress)}
            style={{ transition: 'stroke-dashoffset 0.5s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="font-mono font-bold tabular-nums"
            style={{
              fontSize: prominent ? '2.25rem' : '1.5rem',
              color: isCompleted ? '#4A8C6A' : 'var(--color-app-text)',
              letterSpacing: '0.04em',
            }}
          >
            {formatDuration(elapsed)}
          </span>
          <span
            className="mt-0.5"
            style={{
              fontSize: prominent ? '0.8125rem' : '0.75rem',
              color: 'var(--color-app-text-dim)',
            }}
          >
            / {formatDuration(plannedSeconds)}
          </span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex gap-3 flex-wrap justify-center">
        {isCompleted ? (
          <span
            className="text-sm px-5 py-2.5 rounded-lg"
            style={{ backgroundColor: 'rgba(74,140,106,0.1)', color: '#4A8C6A', border: '1px solid rgba(74,140,106,0.25)' }}
          >
            Mission Complete ✓
          </span>
        ) : !running && !isPaused ? (
          <button
            onClick={start}
            className="flex items-center gap-2 rounded-lg font-medium cursor-pointer border-none transition-all focus-pulse"
            style={{
              backgroundColor: 'var(--color-app-mission)',
              color: '#fff',
              padding: prominent ? '0.625rem 1.75rem' : '0.5rem 1.25rem',
              fontSize: prominent ? '0.9375rem' : '0.875rem',
            }}
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347c-.75.412-1.667-.13-1.667-.986V5.653z" />
            </svg>
            Begin Focus
          </button>
        ) : running ? (
          <>
            <button
              onClick={pause}
              className="flex items-center gap-2 rounded-lg font-medium cursor-pointer border-none"
              style={{
                backgroundColor: 'rgba(214,168,79,0.1)',
                color: '#D6A84F',
                border: '1px solid rgba(214,168,79,0.25)',
                padding: prominent ? '0.625rem 1.25rem' : '0.5rem 1rem',
                fontSize: prominent ? '0.9375rem' : '0.875rem',
              }}
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path fillRule="evenodd" d="M6.75 5.25a.75.75 0 01.75-.75H9a.75.75 0 01.75.75v13.5a.75.75 0 01-.75.75H7.5a.75.75 0 01-.75-.75V5.25zm7.5 0A.75.75 0 0115 4.5h1.5a.75.75 0 01.75.75v13.5a.75.75 0 01-.75.75H15a.75.75 0 01-.75-.75V5.25z" clipRule="evenodd" />
              </svg>
              Pause
            </button>
            <button
              onClick={complete}
              disabled={ending}
              className="flex items-center gap-2 rounded-lg font-medium cursor-pointer border-none disabled:opacity-50"
              style={{
                backgroundColor: 'rgba(74,140,106,0.12)',
                color: '#4A8C6A',
                border: '1px solid rgba(74,140,106,0.25)',
                padding: prominent ? '0.625rem 1.25rem' : '0.5rem 1rem',
                fontSize: prominent ? '0.9375rem' : '0.875rem',
              }}
            >
              {ending ? 'Saving…' : 'Complete'}
            </button>
          </>
        ) : isPaused ? (
          <>
            <button
              onClick={resume}
              className="flex items-center gap-2 rounded-lg font-medium cursor-pointer border-none"
              style={{
                backgroundColor: 'var(--color-app-mission)',
                color: '#fff',
                padding: prominent ? '0.625rem 1.75rem' : '0.5rem 1.25rem',
                fontSize: prominent ? '0.9375rem' : '0.875rem',
              }}
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347c-.75.412-1.667-.13-1.667-.986V5.653z" />
              </svg>
              Resume
            </button>
            <button
              onClick={complete}
              disabled={ending}
              className="flex items-center gap-2 rounded-lg font-medium cursor-pointer border-none disabled:opacity-50"
              style={{
                backgroundColor: 'rgba(74,140,106,0.12)',
                color: '#4A8C6A',
                border: '1px solid rgba(74,140,106,0.25)',
                padding: prominent ? '0.625rem 1.25rem' : '0.5rem 1rem',
                fontSize: prominent ? '0.9375rem' : '0.875rem',
              }}
            >
              {ending ? 'Saving…' : 'Complete'}
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
