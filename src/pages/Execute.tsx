import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { missionService } from '../services/missionService';
import { focusService } from '../services/focusService';
import { formatDuration } from '../components/FocusTimer';
import type { Mission, Task, FocusSession } from '../types/database';

// XP values mirror Journey.tsx — single source of truth concept
const XP_PER_MISSION = 250;
const XP_PER_TASK    = 50;

export default function Execute() {
  const location = useLocation();
  const navigate  = useNavigate();

  const initialMission = (location.state as { mission?: Mission; linkedTask?: Task } | null)?.mission ?? null;
  const linkedTask      = (location.state as { mission?: Mission; linkedTask?: Task } | null)?.linkedTask ?? null;

  const [mission, setMission] = useState<Mission | null>(initialMission);

  // ── Timer state (mirrors FocusTimer internals, lifted here for layout access) ──
  const [session, setSession]   = useState<FocusSession | null>(null);
  const [elapsed, setElapsed]   = useState(0);
  const [running, setRunning]   = useState(false);
  const [ending, setEnding]     = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => setElapsed(p => p + 1), 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running]);

  const plannedSeconds = (mission?.planned_minutes ?? 25) * 60;
  const progress       = Math.min(elapsed / plannedSeconds, 1);
  const remaining      = Math.max(0, plannedSeconds - elapsed);

  // ── Timer actions ──────────────────────────────────────────────────────────────

  const handleStart = async () => {
    if (!mission) return;
    try {
      let m = mission;
      if (m.status !== 'active') {
        m = await missionService.activateMission(m.id);
        setMission(m);
      }
      const s = await focusService.startSession(m.id);
      setSession(s);
      setElapsed(0);
      setRunning(true);
    } catch (e) { console.error(e); }
  };

  const handlePause = async () => {
    if (!mission) return;
    setRunning(false);
    if (session) {
      await focusService.endSession(session.id, false);
      setSession(null);
    }
    const m = await missionService.pauseMission(mission.id);
    setMission(m);
  };

  const handleResume = async () => {
    if (!mission) return;
    const m = await missionService.activateMission(mission.id);
    setMission(m);
    const s = await focusService.startSession(m.id);
    setSession(s);
    setRunning(true);
  };

  const handleComplete = async () => {
    if (!mission || ending) return;
    setEnding(true);
    setRunning(false);
    try {
      if (session) {
        await focusService.endSession(session.id, true);
        setSession(null);
      }
      const m = await missionService.completeMission(mission.id);
      setMission(m);
    } catch (e) { console.error(e); }
    finally { setEnding(false); }
  };

  // ── Derived display helpers ────────────────────────────────────────────────────

  const isCompleted  = mission?.status === 'completed';
  const isPaused     = mission?.status === 'paused';
  const isAbandoned  = mission?.status === 'abandoned';
  const isFinished   = isCompleted || isAbandoned;

  const xpReward = XP_PER_MISSION + (linkedTask ? XP_PER_TASK : 0);

  // circumference for SVG ring (r=88)
  const RING_R = 88;
  const CIRC   = 2 * Math.PI * RING_R;

  // ── Empty state ────────────────────────────────────────────────────────────────

  if (!mission) {
    return (
      <div className="max-w-md mx-auto mt-24 text-center px-4">
        <div
          className="rounded-2xl p-10"
          style={{
            background: 'radial-gradient(ellipse 90% 80% at 50% 20%, rgba(13,26,48,0.9) 0%, rgba(8,19,33,0.95) 100%)',
            border: '1px solid rgba(49,75,115,0.4)',
          }}
        >
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5"
            style={{ background: 'rgba(184,122,85,0.1)', border: '1px solid rgba(184,122,85,0.2)' }}
          >
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}
              style={{ color: 'var(--color-app-mission)' }}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
            </svg>
          </div>
          <h2 className="font-display text-xl mb-2" style={{ color: 'var(--color-app-text)' }}>
            No mission selected
          </h2>
          <p className="text-sm mb-7" style={{ color: 'var(--color-app-text-muted)' }}>
            Choose a mission from the Plan page to begin your expedition.
          </p>
          <Link
            to="/mission"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium"
            style={{ backgroundColor: 'var(--color-app-mission)', color: '#fff' }}
          >
            Go to Plan →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-0 sm:px-4">

      {/* ── Flow breadcrumb ── */}
      <nav className="flex items-center gap-2 mb-6 text-xs px-4 sm:px-0" style={{ color: 'var(--color-app-text-dim)' }}>
        <Link to="/home" className="hover:underline"
          style={{ color: 'var(--color-app-text-dim)' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-app-text-muted)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-app-text-dim)')}
        >Step 1 — Capture</Link>
        <span style={{ opacity: 0.35 }}>›</span>
        <Link to="/mission" className="hover:underline"
          style={{ color: 'var(--color-app-text-dim)' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-app-text-muted)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-app-text-dim)')}
        >Step 2 — Plan</Link>
        <span style={{ opacity: 0.35 }}>›</span>
        <span style={{ color: 'var(--color-app-mission)' }}>Step 3 — Execute</span>
      </nav>

      {/* ── Mission Control Console ── */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{
          background: 'radial-gradient(ellipse 120% 50% at 50% 0%, rgba(18,32,58,0.97) 0%, rgba(5,8,23,1) 65%)',
          border: running
            ? '1px solid rgba(229,183,106,0.4)'
            : isCompleted
            ? '1px solid rgba(74,140,106,0.4)'
            : '1px solid rgba(49,75,115,0.5)',
          boxShadow: running
            ? '0 0 0 1px rgba(229,183,106,0.08), 0 16px 60px -12px rgba(229,183,106,0.2)'
            : '0 16px 60px -12px rgba(3,6,13,0.9)',
          transition: 'border-color 0.6s ease, box-shadow 0.6s ease',
        }}
      >

        {/* ── Console header ── */}
        <div
          className="flex items-center justify-between px-5 py-3.5 border-b"
          style={{ borderColor: 'rgba(49,75,115,0.25)' }}
        >
          <div className="flex items-center gap-2.5">
            {/* Status beacon */}
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{
                backgroundColor: running ? '#4A8C6A' : isCompleted ? '#4A8C6A' : isPaused ? '#D6A84F' : '#B87A55',
                boxShadow: running ? '0 0 8px rgba(74,140,106,0.8)' : isCompleted ? '0 0 8px rgba(74,140,106,0.6)' : 'none',
                animation: running ? 'pulse 2s infinite' : 'none',
              }}
            />
            <span
              className="text-[0.6rem] font-mono font-bold tracking-[0.2em] uppercase"
              style={{ color: running ? '#4A8C6A' : isCompleted ? '#4A8C6A' : isPaused ? '#D6A84F' : 'var(--color-app-mission)' }}
            >
              {running ? 'MISSION IN PROGRESS' : isCompleted ? 'MISSION COMPLETE' : isPaused ? 'SYSTEMS PAUSED' : isAbandoned ? 'MISSION ABORTED' : 'READY FOR LAUNCH'}
            </span>
          </div>
          <span
            className="text-[0.6rem] font-mono"
            style={{ color: 'var(--color-app-text-dim)' }}
          >
            {Math.round(progress * 100)}% elapsed
          </span>
        </div>

        {/* ── Mission identity ── */}
        <div className="px-5 pt-5 pb-4">
          {linkedTask && (
            <p className="text-[0.65rem] font-mono mb-2" style={{ color: 'var(--color-app-text-dim)' }}>
              ↳ linked task: {linkedTask.title}
            </p>
          )}
          <h1
            className="font-display leading-tight mb-2"
            style={{ color: 'var(--color-app-text)', fontSize: 'clamp(1.25rem, 2.5vw, 1.75rem)' }}
          >
            {mission.title}
          </h1>
          {mission.objective && (
            <p className="text-sm leading-relaxed mb-3" style={{ color: 'var(--color-app-text-muted)' }}>
              {mission.objective}
            </p>
          )}
          {mission.next_action && (
            <div
              className="flex items-start gap-2.5 rounded-lg px-3.5 py-3"
              style={{
                background: 'rgba(184,122,85,0.07)',
                border: '1px solid rgba(184,122,85,0.18)',
              }}
            >
              <svg className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24"
                style={{ color: 'var(--color-app-mission)' }}>
                <path d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347c-.75.412-1.667-.13-1.667-.986V5.653z" />
              </svg>
              <div>
                <p className="text-[0.6rem] font-bold uppercase tracking-wider mb-0.5"
                  style={{ color: 'var(--color-app-mission)' }}>
                  Now doing
                </p>
                <p className="text-sm" style={{ color: 'var(--color-app-text)' }}>
                  {mission.next_action}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* ── MISSION COMPLETE celebration banner ── */}
        {isCompleted && (
          <div
            className="mx-5 mb-4 rounded-xl px-5 py-4 text-center"
            style={{
              background: 'linear-gradient(135deg, rgba(74,140,106,0.12) 0%, rgba(74,140,106,0.06) 100%)',
              border: '1px solid rgba(74,140,106,0.3)',
            }}
          >
            <p className="text-base font-semibold mb-0.5" style={{ color: '#4A8C6A' }}>
              ✓ Mission Accomplished
            </p>
            <p className="text-xs" style={{ color: 'var(--color-app-text-muted)' }}>
              +{xpReward} XP earned — your progress has been logged to your Journey.
            </p>
          </div>
        )}

        {/* ── Central Timer & Trajectory Indicator ── */}
        {!isFinished && (
          <div className="px-5 pb-5">
            <div
              className="rounded-xl px-5 py-6 flex flex-col items-center gap-5"
              style={{
                background: 'rgba(5,8,23,0.6)',
                border: '1px solid rgba(49,75,115,0.3)',
              }}
            >

              {/* Large Countdown Ring */}
              <div className="relative" style={{ width: 200, height: 200 }}>
                <svg width="200" height="200" viewBox="0 0 200 200" className="-rotate-90">
                  <defs>
                    <linearGradient id="mcTimerGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor={isCompleted ? '#4A8C6A' : '#B87A55'} />
                      <stop offset="100%" stopColor={isCompleted ? '#4A8C6A' : '#E5B76A'} />
                    </linearGradient>
                  </defs>

                  {/* Track */}
                  <circle cx="100" cy="100" r={RING_R}
                    fill="none"
                    stroke="rgba(30,60,100,0.3)"
                    strokeWidth="7"
                  />

                  {/* Progress arc */}
                  <circle cx="100" cy="100" r={RING_R}
                    fill="none"
                    stroke="url(#mcTimerGrad)"
                    strokeWidth="7"
                    strokeLinecap="round"
                    strokeDasharray={CIRC}
                    strokeDashoffset={CIRC * (1 - progress)}
                    style={{
                      transition: 'stroke-dashoffset 0.8s ease',
                      filter: running ? 'drop-shadow(0 0 8px rgba(229,183,106,0.6))' : 'none',
                    }}
                  />

                  {/* Marker dot at progress tip */}
                  {progress > 0.02 && (
                    <circle
                      cx={100 + RING_R * Math.cos(2 * Math.PI * progress - Math.PI / 2)}
                      cy={100 + RING_R * Math.sin(2 * Math.PI * progress - Math.PI / 2)}
                      r="5"
                      fill={running ? '#E5B76A' : '#B87A55'}
                      style={{ filter: running ? 'drop-shadow(0 0 6px rgba(229,183,106,0.9))' : 'none' }}
                    />
                  )}
                </svg>

                {/* Center readout */}
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span
                    className="font-mono font-bold tabular-nums"
                    style={{
                      fontSize: '2.4rem',
                      letterSpacing: '0.04em',
                      color: running ? 'var(--color-app-gold)' : 'var(--color-app-text)',
                      transition: 'color 0.4s ease',
                    }}
                  >
                    {formatDuration(elapsed)}
                  </span>
                  <span
                    className="font-mono mt-0.5"
                    style={{ fontSize: '0.7rem', color: 'var(--color-app-text-dim)' }}
                  >
                    {formatDuration(plannedSeconds)}
                  </span>
                </div>
              </div>

              {/* Horizontal mission trajectory bar */}
              <div className="w-full">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-[0.6rem] font-mono uppercase tracking-wider"
                    style={{ color: 'var(--color-app-text-dim)' }}>
                    Mission Trajectory
                  </span>
                  <span className="text-[0.6rem] font-mono"
                    style={{ color: 'var(--color-app-text-dim)' }}>
                    {formatDuration(remaining)} remaining
                  </span>
                </div>
                <div
                  className="relative h-1.5 rounded-full overflow-hidden"
                  style={{ backgroundColor: 'rgba(30,60,100,0.4)' }}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.round(progress * 100)}%`,
                      background: 'linear-gradient(90deg, #B87A55 0%, #E5B76A 100%)',
                      boxShadow: running ? '0 0 8px rgba(229,183,106,0.5)' : 'none',
                      transition: 'width 0.8s ease',
                    }}
                  />
                  {/* Moving marker */}
                  {progress > 0 && progress < 1 && (
                    <div
                      className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2"
                      style={{
                        left: `calc(${Math.round(progress * 100)}% - 6px)`,
                        backgroundColor: '#E5B76A',
                        borderColor: '#050817',
                        boxShadow: running ? '0 0 6px rgba(229,183,106,0.8)' : 'none',
                        transition: 'left 0.8s ease',
                      }}
                    />
                  )}
                </div>
                <div className="flex justify-between mt-1.5">
                  <span className="text-[0.55rem] font-mono" style={{ color: 'var(--color-app-text-dim)' }}>
                    Launch
                  </span>
                  <span className="text-[0.55rem] font-mono" style={{ color: 'var(--color-app-text-dim)' }}>
                    Target
                  </span>
                </div>
              </div>

              {/* Telemetry row: elapsed + XP reward */}
              <div className="w-full flex items-center justify-between pt-1 border-t"
                style={{ borderColor: 'rgba(49,75,115,0.2)' }}>
                <div className="flex items-center gap-1.5">
                  <span className="text-[0.6rem] font-mono uppercase tracking-wider"
                    style={{ color: 'var(--color-app-text-dim)' }}>
                    Elapsed
                  </span>
                  <span className="text-xs font-mono font-bold"
                    style={{ color: 'var(--color-app-text-muted)' }}>
                    {formatDuration(elapsed)}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[0.6rem] font-mono uppercase tracking-wider"
                    style={{ color: 'var(--color-app-text-dim)' }}>
                    Reward
                  </span>
                  <span className="text-xs font-mono font-bold"
                    style={{ color: 'var(--color-app-gold)' }}>
                    +{xpReward} XP
                  </span>
                </div>
              </div>

              {/* Controls */}
              <div className="flex items-center gap-3 w-full">
                {!running && !isPaused ? (
                  <button
                    onClick={handleStart}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold cursor-pointer border-none transition-all active:scale-95"
                    style={{
                      background: 'linear-gradient(135deg, #B87A55 0%, #D6A84F 100%)',
                      color: '#050817',
                      boxShadow: '0 4px 16px rgba(184,122,85,0.35)',
                    }}
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347c-.75.412-1.667-.13-1.667-.986V5.653z" />
                    </svg>
                    Begin Focus Session
                  </button>
                ) : isPaused ? (
                  <>
                    <button
                      onClick={handleResume}
                      className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold cursor-pointer border-none transition-all active:scale-95"
                      style={{
                        background: 'linear-gradient(135deg, #B87A55 0%, #D6A84F 100%)',
                        color: '#050817',
                      }}
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347c-.75.412-1.667-.13-1.667-.986V5.653z" />
                      </svg>
                      Resume
                    </button>
                    <button
                      onClick={handleComplete}
                      disabled={ending}
                      className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-medium cursor-pointer border-none transition-all disabled:opacity-50"
                      style={{
                        backgroundColor: 'rgba(74,140,106,0.15)',
                        color: '#4A8C6A',
                        border: '1px solid rgba(74,140,106,0.3)',
                      }}
                    >
                      {ending ? 'Logging…' : 'Complete'}
                    </button>
                  </>
                ) : running ? (
                  <>
                    <button
                      onClick={handlePause}
                      className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-medium cursor-pointer border-none transition-all"
                      style={{
                        backgroundColor: 'rgba(214,168,79,0.1)',
                        color: '#D6A84F',
                        border: '1px solid rgba(214,168,79,0.25)',
                      }}
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path fillRule="evenodd" d="M6.75 5.25a.75.75 0 01.75-.75H9a.75.75 0 01.75.75v13.5a.75.75 0 01-.75.75H7.5a.75.75 0 01-.75-.75V5.25zm7.5 0A.75.75 0 0115 4.5h1.5a.75.75 0 01.75.75v13.5a.75.75 0 01-.75.75H15a.75.75 0 01-.75-.75V5.25z" clipRule="evenodd" />
                      </svg>
                      Pause
                    </button>
                    <button
                      onClick={handleComplete}
                      disabled={ending}
                      className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold cursor-pointer border-none transition-all disabled:opacity-50 active:scale-95"
                      style={{
                        backgroundColor: 'rgba(74,140,106,0.15)',
                        color: '#4A8C6A',
                        border: '1px solid rgba(74,140,106,0.3)',
                      }}
                    >
                      {ending ? 'Logging…' : '✓ Complete Mission'}
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          </div>
        )}

        {/* ── Post-completion navigation ── */}
        {isFinished && (
          <div
            className="mx-5 mb-5 rounded-xl px-5 py-4 flex flex-col sm:flex-row items-center justify-between gap-4"
            style={{
              background: isCompleted ? 'rgba(74,140,106,0.06)' : 'rgba(168,59,59,0.06)',
              border: `1px solid ${isCompleted ? 'rgba(74,140,106,0.2)' : 'rgba(168,59,59,0.2)'}`,
            }}
          >
            <p className="text-sm" style={{ color: 'var(--color-app-text-muted)' }}>
              {isCompleted
                ? 'Work done. Head to Journey to see how far you’ve come.'
                : 'Return to Plan to regroup.'}
            </p>
            <div className="flex gap-3 flex-shrink-0">
              <button
                onClick={() => navigate('/mission')}
                className="px-4 py-2 rounded-lg text-sm font-medium cursor-pointer border transition-all"
                style={{ color: 'var(--color-app-text-muted)', backgroundColor: 'transparent', borderColor: 'var(--color-app-border)' }}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-app-text)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-app-text-muted)')}
              >
                {isCompleted ? 'New Mission' : 'Back to Plan'}
              </button>
              {isCompleted && (
                <button
                  onClick={() => navigate('/journey')}
                  className="px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer border-none transition-all"
                  style={{
                    background: 'linear-gradient(135deg, #B87A55 0%, #D6A84F 100%)',
                    color: '#050817',
                  }}
                >
                  View My Journey →
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
