import { useEffect, useMemo, useRef, useState } from 'react';
import { taskService } from '../services/taskService';
import { missionService } from '../services/missionService';
import { focusService } from '../services/focusService';
import type { Task, Mission, FocusSession } from '../types/database';
import { useTheme } from '../hooks/useTheme';

// ─── Journey Checkpoint Definitions ─────────────────────────────────────────
// These correspond visually to landmarks in odyssey-bg.png:
// wp_0 (city lights, lower-left) → wp_1 (mountain range) → wp_2 (horizon arc)
// → wp_3 (atmosphere) → wp_4 (orbital ring midpoint) → wp_5 (deep space apex)
//
// The ROUTE_PATH_D bezier is intentionally aligned with the orbital arc
// already drawn in odyssey-bg.png, so the aircraft appears to travel
// along the existing glowing trail in the image.

interface Checkpoint {
  id: string;
  label: string;
  sublabel: string;
  description: string;
  requiredMissions: number;
  requiredXp: number;
  // SVG coords within the 1000×520 viewBox, mirroring the image arc
  x: number;
  y: number;
  // 0..1 position along the route path
  pathRatio: number;
  status?: 'reached' | 'next' | 'ahead';
}

const CHECKPOINTS: Checkpoint[] = [
  {
    id: 'departure',
    label: 'Departure',
    sublabel: 'City of Origin',
    description: 'Every odyssey starts with a single intention.',
    requiredMissions: 0,
    requiredXp: 0,
    x: 155,
    y: 420,
    pathRatio: 0.04,
  },
  {
    id: 'first_orbit',
    label: 'First Ascent',
    sublabel: 'Mountain Gate',
    description: 'First mission completed — you have left the ground.',
    requiredMissions: 1,
    requiredXp: 200,
    x: 320,
    y: 310,
    pathRatio: 0.22,
  },
  {
    id: 'atmosphere',
    label: 'Horizon Break',
    sublabel: 'Atmosphere Edge',
    description: 'Momentum established. You are moving consistently.',
    requiredMissions: 3,
    requiredXp: 600,
    x: 490,
    y: 235,
    pathRatio: 0.44,
  },
  {
    id: 'orbital_ring',
    label: 'Deep Space',
    sublabel: 'Orbital Arc',
    description: 'Sustained focus and clarity. You are in orbit.',
    requiredMissions: 6,
    requiredXp: 1400,
    x: 660,
    y: 185,
    pathRatio: 0.65,
  },
  {
    id: 'nebula',
    label: 'Final Horizon',
    sublabel: 'Stellar Passage',
    description: 'This is where the journey meets mastery.',
    requiredMissions: 10,
    requiredXp: 3000,
    x: 840,
    y: 140,
    pathRatio: 0.88,
  },
];

// The route path is aligned with the glowing orbital trail in odyssey-bg.png.
// Tuned to run bottom-left → upper-right matching the image's arc.
const ROUTE_PATH = 'M 155 420 C 230 370, 270 320, 320 310 C 400 295, 440 255, 490 235 C 570 210, 610 195, 660 185 C 740 170, 785 155, 840 140';

function formatMinutes(mins: number) {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function easeInOut(x: number): number {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

export default function Journey() {
  const { theme } = useTheme();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [sessions, setSessions] = useState<FocusSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeCheckpoint, setActiveCheckpoint] = useState<Checkpoint | null>(null);
  const [showLog, setShowLog] = useState(false);
  const [logTab, setLogTab] = useState<'stats' | 'activity' | 'history'>('stats');

  const pathRef = useRef<SVGPathElement>(null);
  const shipRef = useRef<SVGGElement>(null);
  const currentRatioRef = useRef(0.04);
  const rafRef = useRef<number | null>(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const [t, m, s] = await Promise.all([
        taskService.getTasks(),
        missionService.getMissions(),
        focusService.getAllSessions(),
      ]);
      setTasks(t);
      setMissions(m);
      setSessions(s);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load journey data');
    } finally {
      setLoading(false);
    }
  };

  // ─── Real Progress Metrics ───────────────────────────────────────────────────

  const completedTasks = useMemo(() => tasks.filter(t => t.status === 'completed'), [tasks]);
  const completedMissions = useMemo(() => missions.filter(m => m.status === 'completed'), [missions]);
  const completedSessions = useMemo(() => sessions.filter(s => s.completed), [sessions]);
  const totalFocusMinutes = useMemo(() => sessions.reduce((a, s) => a + (s.duration_minutes ?? 0), 0), [sessions]);
  const totalXp = useMemo(
    () => completedTasks.length * 50 + completedMissions.length * 250 + totalFocusMinutes * 10,
    [completedTasks.length, completedMissions.length, totalFocusMinutes],
  );

  const rank = useMemo(() => {
    if (totalXp >= 3000) return { title: 'Odyssey Voyager', code: 'STELLAR COMMANDER' };
    if (totalXp >= 1400) return { title: 'Deep Space Navigator', code: 'ORBITAL PILOT' };
    if (totalXp >= 600)  return { title: 'Atmosphere Pilot', code: 'ASCENT SPECIALIST' };
    if (totalXp >= 200)  return { title: 'First Ascent', code: 'EXPEDITION PILOT' };
    return { title: 'Cadet', code: 'DEPARTURE PHASE' };
  }, [totalXp]);

  // Progress 0..1 along route, derived only from real data
  const progressRatio = useMemo(() => {
    if (completedMissions.length === 0 && totalXp < 10) return CHECKPOINTS[0].pathRatio;

    let highestIdx = 0;
    for (let i = 0; i < CHECKPOINTS.length; i++) {
      if (completedMissions.length >= CHECKPOINTS[i].requiredMissions || totalXp >= CHECKPOINTS[i].requiredXp) {
        highestIdx = i;
      }
    }

    if (highestIdx >= CHECKPOINTS.length - 1) return CHECKPOINTS[CHECKPOINTS.length - 1].pathRatio;

    const cur = CHECKPOINTS[highestIdx];
    const nxt = CHECKPOINTS[highestIdx + 1];
    const span = Math.max(1, nxt.requiredXp - cur.requiredXp);
    const into = Math.min(Math.max(0, totalXp - cur.requiredXp), span);
    return cur.pathRatio + (into / span) * (nxt.pathRatio - cur.pathRatio);
  }, [completedMissions.length, totalXp]);

  const checkpointsWithStatus = useMemo(() => CHECKPOINTS.map((cp, i) => {
    const reached = completedMissions.length >= cp.requiredMissions || totalXp >= cp.requiredXp;
    const isNext = !reached && (i === 0 || (completedMissions.length >= CHECKPOINTS[i - 1].requiredMissions || totalXp >= CHECKPOINTS[i - 1].requiredXp));
    return { ...cp, status: reached ? 'reached' as const : isNext ? 'next' as const : 'ahead' as const };
  }), [completedMissions.length, totalXp]);

  // ─── SVG Ship Travel Animation ───────────────────────────────────────────────

  useEffect(() => {
    const path = pathRef.current;
    const ship = shipRef.current;
    if (!path || !ship) return;

    let len = 0;
    try { len = path.getTotalLength(); } catch { return; }
    if (!len) return;

    const from = currentRatioRef.current;
    const to = progressRatio;
    const start = performance.now();
    const dur = 1800;

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const r = from + (to - from) * easeInOut(t);
      currentRatioRef.current = r;

      const pt = path.getPointAtLength(r * len);
      const p1 = path.getPointAtLength(Math.max(0, r * len - 4));
      const p2 = path.getPointAtLength(Math.min(len, r * len + 4));
      const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x) * (180 / Math.PI);

      ship.setAttribute('transform', `translate(${pt.x}, ${pt.y}) rotate(${angle})`);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };

    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);

    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [progressRatio]);

  // ─── 14-day chart data ───────────────────────────────────────────────────────

  const dayMap: Record<string, number> = {};
  const today = new Date();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    dayMap[d.toDateString()] = 0;
  }
  sessions.forEach(s => {
    const d = new Date(s.started_at).toDateString();
    if (d in dayMap) dayMap[d] += s.duration_minutes ?? 0;
  });
  const days = Object.entries(dayMap);
  const maxMins = Math.max(...days.map(([, v]) => v), 1);
  const missionIndex = Object.fromEntries(missions.map(m => [m.id, m.title]));

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="w-8 h-8 border-2 rounded-full animate-spin"
          style={{ borderColor: 'var(--color-app-mission)', borderTopColor: 'transparent' }} />
        <p className="text-xs font-mono tracking-widest uppercase" style={{ color: 'var(--color-app-mission)' }}>
          Loading expedition chart…
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-xl mx-auto mt-16 p-6 text-center rounded-xl"
        style={{ backgroundColor: 'rgba(168,59,59,0.08)', border: '1px solid rgba(168,59,59,0.2)' }}>
        <p className="text-sm mb-3" style={{ color: '#E07070' }}>{error}</p>
        <button onClick={load} className="px-4 py-1.5 rounded text-xs cursor-pointer border-none"
          style={{ backgroundColor: 'rgba(168,59,59,0.2)', color: '#E07070' }}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0" style={{ maxWidth: '1100px', margin: '0 auto' }}>

      {/* ─── Top bar: rank + controls ─────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span
              className="text-[0.6rem] font-bold tracking-[0.18em] uppercase px-2 py-0.5 rounded"
              style={{ backgroundColor: 'rgba(184,122,85,0.12)', color: 'var(--color-app-mission)', border: '1px solid rgba(184,122,85,0.25)' }}
            >
              {rank.code}
            </span>
            <span className="text-[0.65rem] font-mono" style={{ color: 'var(--color-app-text-dim)' }}>
              {totalXp} XP
            </span>
          </div>
          <h1 className="font-display text-2xl md:text-3xl font-semibold" style={{ color: 'var(--color-app-text)' }}>
            Your Journey
          </h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--color-app-text-muted)' }}>
            A map of how far your completed missions have taken you — not a to-do list.
          </p>
        </div>

        <button
          onClick={() => setShowLog(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium cursor-pointer border transition-colors"
          style={{ color: 'var(--color-app-text-muted)', backgroundColor: 'var(--color-app-surface)', borderColor: 'var(--color-app-border)' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-app-text)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-app-text-muted)')}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
          </svg>
          Mission Log
        </button>
      </div>

      {/* ─── Checkpoint pill bar ───────────────────────────────────────────── */}
      {completedMissions.length === 0 && (
        <div className="rounded-xl px-5 py-4 mb-4 flex items-start gap-3"
          style={{ background: 'rgba(184,122,85,0.06)', border: '1px solid rgba(184,122,85,0.18)' }}>
          <span className="text-base mt-0.5" aria-hidden="true">🗺️</span>
          <div>
            <p className="text-sm font-medium mb-0.5" style={{ color: 'var(--color-app-text)' }}>
              Your expedition map starts here.
            </p>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--color-app-text-muted)' }}>
              Complete your first Mission to move the marker along the route. Each mission you finish advances your position.
            </p>
          </div>
        </div>
      )}
      <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1">
        {checkpointsWithStatus.map((cp, i) => (
          <button
            key={cp.id}
            onClick={() => setActiveCheckpoint(cp)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full whitespace-nowrap text-xs font-medium cursor-pointer border transition-all flex-shrink-0"
            style={{
              backgroundColor: cp.status === 'reached'
                ? 'rgba(229,183,106,0.1)'
                : cp.status === 'next'
                ? 'rgba(184,122,85,0.08)'
                : 'rgba(30,60,100,0.08)',
              borderColor: cp.status === 'reached'
                ? 'rgba(229,183,106,0.35)'
                : cp.status === 'next'
                ? 'rgba(184,122,85,0.3)'
                : 'rgba(49,75,115,0.2)',
              color: cp.status === 'reached'
                ? 'var(--color-app-gold)'
                : cp.status === 'next'
                ? 'var(--color-app-mission)'
                : 'var(--color-app-text-dim)',
              opacity: cp.status === 'ahead' ? 0.55 : 1,
            }}
          >
            <span style={{ fontSize: '0.6rem' }}>{i + 1}</span>
            {cp.label}
            {cp.status === 'reached' && <span style={{ fontSize: '0.65rem' }}>✓</span>}
            {cp.status === 'next' && <span className="animate-pulse" style={{ fontSize: '0.6rem' }}>●</span>}
          </button>
        ))}
      </div>

      {/* ─── The Map — Primary visual element ─────────────────────────────── */}
      <div
        className="relative rounded-2xl overflow-hidden"
        style={{
          aspectRatio: '16/7',
          minHeight: '340px',
          backgroundImage: `url(/${theme === 'light' ? 'odyssey2-bg.png' : 'odyssey-bg.png'})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center 40%',
          border: '1px solid rgba(49,75,115,0.5)',
          boxShadow: '0 8px 40px -4px rgba(3,6,13,0.9)',
        }}
      >
        {/* Dark overlay to improve SVG contrast while preserving the scene */}
        <div
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(to top, rgba(3,6,13,0.75) 0%, rgba(3,6,13,0.1) 40%, rgba(3,6,13,0.0) 70%)',
          }}
        />

        {/* Top-left telemetry overlay */}
        <div className="absolute top-3 left-4 flex items-center gap-2 z-10 pointer-events-none">
          <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: 'var(--color-app-mission)' }} />
          <span className="text-[0.6rem] font-mono tracking-widest uppercase" style={{ color: 'rgba(229,183,106,0.7)' }}>
            Expedition Route — {Math.round(progressRatio * 100)}% traversed
          </span>
        </div>

        {/* The SVG overlay — route + checkpoints + ship */}
        <svg
          viewBox="0 0 1000 520"
          className="absolute inset-0 w-full h-full"
          style={{ overflow: 'visible' }}
        >
          <defs>
            <linearGradient id="trailGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#B87A55" stopOpacity="0.3" />
              <stop offset="60%" stopColor="#E5B76A" stopOpacity="0.85" />
              <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.9" />
            </linearGradient>
            <filter id="nodeGlow">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <filter id="shipGlow">
              <feGaussianBlur stdDeviation="6" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          {/* Ghost path (always visible, dimmed) */}
          <path
            d={ROUTE_PATH}
            fill="none"
            stroke="rgba(49,75,115,0.35)"
            strokeWidth="2"
            strokeDasharray="5 8"
          />

          {/* Completed trail — fills according to real progress */}
          <path
            ref={pathRef}
            d={ROUTE_PATH}
            fill="none"
            stroke="url(#trailGrad)"
            strokeWidth="3"
            strokeDasharray="1000"
            strokeDashoffset={1000 * (1 - progressRatio)}
            style={{
              transition: 'stroke-dashoffset 1.8s cubic-bezier(0.22, 1, 0.36, 1)',
              filter: 'drop-shadow(0 0 6px rgba(229,183,106,0.5))',
            }}
          />

          {/* Checkpoint nodes */}
          {checkpointsWithStatus.map((cp) => {
            const isReached = cp.status === 'reached';
            const isNext = cp.status === 'next';
            const isActive = activeCheckpoint?.id === cp.id;

            return (
              <g
                key={cp.id}
                className="cursor-pointer"
                onClick={() => setActiveCheckpoint(activeCheckpoint?.id === cp.id ? null : cp)}
              >
                {/* Pulse ring for next checkpoint */}
                {isNext && (
                  <circle cx={cp.x} cy={cp.y} r="18" fill="none" stroke="rgba(184,122,85,0.5)"
                    strokeWidth="1.5" className="animate-pulse" />
                )}

                {/* Active selection ring */}
                {isActive && (
                  <circle cx={cp.x} cy={cp.y} r="16" fill="none" stroke="rgba(229,183,106,0.8)"
                    strokeWidth="2" />
                )}

                {/* Main node */}
                <circle
                  cx={cp.x}
                  cy={cp.y}
                  r={isActive ? 10 : 8}
                  fill={isReached ? '#0D1C32' : isNext ? '#0A1422' : '#060B15'}
                  stroke={isReached ? '#E5B76A' : isNext ? '#B87A55' : 'rgba(49,75,115,0.4)'}
                  strokeWidth={isReached ? 2.5 : 1.5}
                  filter={isReached || isNext ? 'url(#nodeGlow)' : 'none'}
                />

                {/* Inner dot */}
                <circle
                  cx={cp.x}
                  cy={cp.y}
                  r={isReached ? 4 : 3}
                  fill={isReached ? '#E5B76A' : isNext ? '#B87A55' : 'rgba(49,75,115,0.6)'}
                />

                {/* Label — alternates above/below to avoid overlap */}
              </g>
            );
          })}

          {/* Spacecraft — travels along the route */}
          <g
            ref={shipRef}
            style={{ pointerEvents: 'none', filter: 'drop-shadow(0 0 10px rgba(229,183,106,0.9))' }}
          >
            {/* Exhaust glow */}
            <ellipse cx="-14" cy="0" rx="9" ry="3.5" fill="rgba(229,183,106,0.55)" />
            <ellipse cx="-18" cy="0" rx="4" ry="1.5" fill="rgba(255,255,255,0.7)" />
            {/* Body */}
            <path
              d="M 16 0 L -8 -7 L -4 -2 L -14 -2 L -14 0 L -14 2 L -4 2 L -8 7 Z"
              fill="#FFFFFF"
              stroke="#E5B76A"
              strokeWidth="1.2"
            />
            {/* Cockpit */}
            <circle cx="4" cy="0" r="2.5" fill="#D6A84F" />
          </g>
        </svg>

        {/* Checkpoint detail popup */}
        {activeCheckpoint && (
          <div
            className="absolute bottom-4 left-4 right-4 z-20 rounded-xl px-4 py-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
            style={{
              backgroundColor: 'rgba(5,8,23,0.94)',
              border: '1px solid rgba(184,122,85,0.4)',
              backdropFilter: 'blur(12px)',
            }}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[0.6rem] font-mono uppercase tracking-wider"
                  style={{ color: 'var(--color-app-mission)' }}>
                  {activeCheckpoint.sublabel}
                </span>
                <span
                  className="text-[0.6rem] font-bold px-1.5 py-0.5 rounded uppercase"
                  style={{
                    backgroundColor: activeCheckpoint.status === 'reached' ? 'rgba(74,140,106,0.15)' : 'rgba(122,143,166,0.12)',
                    color: activeCheckpoint.status === 'reached' ? '#4A8C6A' : activeCheckpoint.status === 'next' ? 'var(--color-app-mission)' : '#7A8FA6',
                  }}
                >
                  {activeCheckpoint.status === 'reached' ? 'Reached' : activeCheckpoint.status === 'next' ? 'Destination' : 'Ahead'}
                </span>
              </div>
              <p className="text-sm font-semibold" style={{ color: 'var(--color-app-text)' }}>
                {activeCheckpoint.label}
              </p>
              <p className="text-xs" style={{ color: 'var(--color-app-text-dim)' }}>
                {activeCheckpoint.description}
              </p>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <span className="text-xs font-mono" style={{ color: 'var(--color-app-gold)' }}>
                {activeCheckpoint.requiredMissions > 0
                  ? `${completedMissions.length}/${activeCheckpoint.requiredMissions} missions`
                  : 'Origin'}
              </span>
              <button
                onClick={() => setActiveCheckpoint(null)}
                className="text-xs cursor-pointer bg-transparent border-none"
                style={{ color: 'var(--color-app-text-dim)' }}
              >
                ✕
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ─── Quick Stats row beneath the map ─────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
        {[
          { label: 'Missions Done', value: completedMissions.length, color: 'var(--color-app-mission)' },
          { label: 'Focus Time', value: formatMinutes(totalFocusMinutes), color: 'var(--color-app-gold)' },
          { label: 'Sessions', value: completedSessions.length, color: 'var(--color-app-text)' },
          { label: 'Tasks Cleared', value: `${completedTasks.length}/${tasks.length}`, color: '#4A8C6A' },
        ].map(({ label, value, color }) => (
          <div
            key={label}
            className="rounded-xl p-3.5 flex flex-col gap-0.5"
            style={{ backgroundColor: 'var(--color-app-surface)', border: '1px solid var(--color-app-border)' }}
          >
            <span className="text-[0.65rem] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-app-text-muted)' }}>
              {label}
            </span>
            <span className="text-xl font-bold font-mono" style={{ color }}>
              {value}
            </span>
          </div>
        ))}
      </div>

      {/* ─── Mission Log Side Drawer ───────────────────────────────────────── */}
      {showLog && (
        <div
          className="fixed inset-0 z-50 flex justify-end"
          style={{ backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
          onClick={e => { if (e.target === e.currentTarget) setShowLog(false); }}
        >
          <div
            className="w-full max-w-md h-full flex flex-col overflow-hidden"
            style={{
              backgroundColor: 'var(--color-app-bg)',
              borderLeft: '1px solid var(--color-app-border)',
            }}
          >
            {/* Drawer header */}
            <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--color-app-border)' }}>
              <div>
                <h3 className="font-semibold" style={{ color: 'var(--color-app-text)' }}>Mission Log</h3>
                <p className="text-xs mt-0.5" style={{ color: 'var(--color-app-text-dim)' }}>
                  Your complete expedition record.
                </p>
              </div>
              <button
                onClick={() => setShowLog(false)}
                className="p-1.5 rounded bg-transparent border-none cursor-pointer text-lg leading-none"
                style={{ color: 'var(--color-app-text-dim)' }}
              >
                ✕
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b px-6" style={{ borderColor: 'var(--color-app-border)' }}>
              {(['stats', 'activity', 'history'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setLogTab(tab)}
                  className="px-3 py-3 text-xs font-semibold uppercase tracking-wider bg-transparent border-none cursor-pointer capitalize"
                  style={{
                    color: logTab === tab ? 'var(--color-app-mission)' : 'var(--color-app-text-dim)',
                    borderBottom: logTab === tab ? '2px solid var(--color-app-mission)' : '2px solid transparent',
                  }}
                >
                  {tab === 'stats' ? 'Stats' : tab === 'activity' ? '14-Day' : 'Sessions'}
                </button>
              ))}
            </div>

            {/* Drawer body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              {logTab === 'stats' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: 'Completed Missions', value: completedMissions.length, color: 'var(--color-app-mission)' },
                      { label: 'Total XP', value: totalXp, color: 'var(--color-app-gold)' },
                      { label: 'Focus Time', value: formatMinutes(totalFocusMinutes), color: 'var(--color-app-text)' },
                      { label: 'Tasks Cleared', value: completedTasks.length, color: '#4A8C6A' },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="p-3.5 rounded-xl"
                        style={{ backgroundColor: 'var(--color-app-surface)', border: '1px solid var(--color-app-border)' }}>
                        <p className="text-[0.65rem] font-semibold uppercase tracking-wider mb-1"
                          style={{ color: 'var(--color-app-text-muted)' }}>{label}</p>
                        <p className="text-xl font-bold font-mono" style={{ color }}>{value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Checkpoint progress list */}
                  <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--color-app-border)' }}>
                    {checkpointsWithStatus.map(cp => (
                      <div key={cp.id} className="flex items-center justify-between px-4 py-3 border-b last:border-0"
                        style={{ borderColor: 'var(--color-app-border)', opacity: cp.status === 'ahead' ? 0.5 : 1 }}>
                        <div className="flex items-center gap-3">
                          <span style={{ fontSize: '1rem' }}>
                            {cp.status === 'reached' ? '⭐' : cp.status === 'next' ? '📍' : '🔒'}
                          </span>
                          <div>
                            <p className="text-xs font-medium" style={{ color: 'var(--color-app-text)' }}>{cp.label}</p>
                            <p className="text-[0.65rem]" style={{ color: 'var(--color-app-text-dim)' }}>{cp.sublabel}</p>
                          </div>
                        </div>
                        <span className="text-[0.6rem] font-mono font-bold"
                          style={{ color: cp.status === 'reached' ? '#4A8C6A' : 'var(--color-app-text-dim)' }}>
                          {cp.requiredMissions > 0 ? `${cp.requiredMissions} missions` : 'Start'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {logTab === 'activity' && (
                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wider"
                    style={{ color: 'var(--color-app-text-muted)' }}>
                    Daily Focus — Last 14 days
                  </p>
                  <div className="flex items-end gap-1.5 h-32">
                    {days.map(([day, mins]) => {
                      const h = (mins / maxMins) * 100;
                      return (
                        <div key={day} className="flex-1 flex flex-col items-center gap-1 group"
                          title={`${new Date(day).toLocaleDateString()}: ${formatMinutes(mins)}`}>
                          <div
                            className="w-full rounded-sm transition-opacity"
                            style={{
                              height: `${Math.max(h, mins > 0 ? 10 : 3)}%`,
                              backgroundColor: mins > 0 ? 'var(--color-app-mission)' : 'var(--color-app-surface-raised)',
                              opacity: mins > 0 ? 0.9 : 0.2,
                            }}
                          />
                          <span className="text-[0.5rem] font-mono" style={{ color: 'var(--color-app-text-dim)' }}>
                            {new Date(day).getDate()}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {logTab === 'history' && (
                <div className="divide-y" style={{ borderColor: 'var(--color-app-border)' }}>
                  {sessions.length === 0 && (
                    <p className="text-sm py-6 text-center" style={{ color: 'var(--color-app-text-dim)' }}>
                      No sessions recorded yet.
                    </p>
                  )}
                  {sessions.slice(0, 20).map(s => (
                    <div key={s.id} className="py-3 flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate" style={{ color: 'var(--color-app-text)' }}>
                          {s.mission_id ? (missionIndex[s.mission_id] ?? 'Mission') : 'Focus Session'}
                        </p>
                        <p className="text-[0.65rem] font-mono" style={{ color: 'var(--color-app-text-dim)' }}>
                          {new Date(s.started_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-xs font-mono font-bold" style={{ color: 'var(--color-app-text-muted)' }}>
                          {s.duration_minutes ? formatMinutes(s.duration_minutes) : '—'}
                        </span>
                        <span
                          className="text-[0.6rem] font-bold px-1.5 py-0.5 rounded uppercase"
                          style={s.completed
                            ? { backgroundColor: 'rgba(74,140,106,0.1)', color: '#4A8C6A' }
                            : { backgroundColor: 'rgba(122,143,166,0.1)', color: '#7A8FA6' }
                          }
                        >
                          {s.completed ? 'done' : 'partial'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
