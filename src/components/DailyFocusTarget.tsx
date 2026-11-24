import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { focusService } from '../services/focusService';
import {
  DEFAULT_DAILY_TARGET_MINUTES,
  dailyTargetLabel,
  dailyTargetProgress,
  todaysFocusMinutes,
} from '../lib/dailyFocus';

const RING_RADIUS = 9;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/**
 * Compact "focus minutes today / target" pill with a progress ring for the app header.
 * Refreshes on route change (a session usually ends right before you navigate away)
 * and once a minute. The pill has a fixed width so numbers changing never shift the nav.
 */
export default function DailyFocusTarget() {
  const { pathname } = useLocation();
  const [minutes, setMinutes] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      focusService.getAllSessions()
        .then(sessions => { if (!cancelled) setMinutes(todaysFocusMinutes(sessions)); })
        .catch(() => { /* keep the last known value */ });
    };
    refresh();
    const id = window.setInterval(refresh, 60_000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [pathname]);

  const target = DEFAULT_DAILY_TARGET_MINUTES;
  const progress = dailyTargetProgress(minutes, target);
  const reached = minutes >= target;
  const label = dailyTargetLabel(minutes, target);
  const accent = reached ? 'var(--color-app-success)' : 'var(--color-app-mission)';

  return (
    <div
      role="img"
      aria-label={label}
      title={label}
      className="hidden sm:flex items-center justify-center gap-1.5 h-8 w-[5.75rem] rounded-full text-[0.7rem] font-semibold tabular-nums"
      style={{
        color: reached ? accent : 'var(--color-app-text-muted)',
        border: `1px solid ${reached ? accent : 'var(--color-app-border)'}`,
        boxShadow: reached ? `0 0 10px color-mix(in srgb, ${accent} 45%, transparent)` : 'none',
        transition: 'box-shadow 0.3s ease, border-color 0.3s ease',
      }}
    >
      <svg className="w-5 h-5 -rotate-90" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r={RING_RADIUS} fill="none" stroke="var(--color-app-border)" strokeWidth="3" />
        <circle
          cx="12" cy="12" r={RING_RADIUS} fill="none" stroke={accent} strokeWidth="3" strokeLinecap="round"
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={RING_CIRCUMFERENCE * (1 - progress)}
          style={{ transition: 'stroke-dashoffset 0.4s ease' }}
        />
      </svg>
      <span>{Math.round(minutes)}/{target}m</span>
    </div>
  );
}
