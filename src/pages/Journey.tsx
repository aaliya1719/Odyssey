import { useEffect, useState } from 'react';
import { taskService } from '../services/taskService';
import { missionService } from '../services/missionService';
import { focusService } from '../services/focusService';
import type { Task, Mission, FocusSession } from '../types/database';

function formatMinutes(mins: number) {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function StatCard({ label, value, sub, accent = false }: { label: string; value: string | number; sub?: string; accent?: boolean }) {
  return (
    <div
      className="rounded-xl p-5 flex flex-col gap-1"
      style={{
        backgroundColor: 'var(--color-app-surface)',
        border: `1px solid ${accent ? 'rgba(184,122,85,0.3)' : 'var(--color-app-border)'}`,
      }}
    >
      <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-app-text-muted)' }}>{label}</span>
      <span className="text-2xl font-display font-medium" style={{ color: accent ? 'var(--color-app-mission)' : 'var(--color-app-text)' }}>{value}</span>
      {sub && <span className="text-xs" style={{ color: 'var(--color-app-text-dim)' }}>{sub}</span>}
    </div>
  );
}

export default function Journey() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [sessions, setSessions] = useState<FocusSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    setError(null);
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

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh]">
        <div className="w-8 h-8 border-2 rounded-full animate-spin mb-3"
          style={{ borderColor: 'var(--color-app-mission)', borderTopColor: 'transparent' }} />
        <span className="text-sm" style={{ color: 'var(--color-app-text-muted)' }}>Loading journey...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-xl mx-auto mt-16 rounded-xl p-6 text-center"
        style={{ backgroundColor: 'rgba(168,59,59,0.08)', border: '1px solid rgba(168,59,59,0.2)' }}>
        <p className="text-sm mb-3" style={{ color: '#E07070' }}>{error}</p>
        <button onClick={load} className="px-4 py-1.5 rounded-lg text-xs font-medium cursor-pointer border-none"
          style={{ backgroundColor: 'rgba(168,59,59,0.2)', color: '#E07070' }}>Retry</button>
      </div>
    );
  }

  // Compute stats
  const completedTasks = tasks.filter((t) => t.status === 'completed');
  const completedMissions = missions.filter((m) => m.status === 'completed');
  const completedSessions = sessions.filter((s) => s.completed);
  const totalFocusMinutes = sessions.reduce((acc, s) => acc + (s.duration_minutes ?? 0), 0);

  // Daily focus chart — last 14 days
  const dayMap: Record<string, number> = {};
  const today = new Date();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    dayMap[d.toDateString()] = 0;
  }
  sessions.forEach((s) => {
    const d = new Date(s.started_at).toDateString();
    if (d in dayMap) dayMap[d] += s.duration_minutes ?? 0;
  });
  const days = Object.entries(dayMap);
  const maxMins = Math.max(...days.map(([, v]) => v), 1);

  // Recent sessions with mission name
  const missionMap = Object.fromEntries(missions.map((m) => [m.id, m.title]));
  const recentSessions = sessions.slice(0, 10);

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <p className="text-xs font-semibold tracking-[0.18em] uppercase mb-2" style={{ color: 'var(--color-app-mission)' }}>
          Progress Log
        </p>
        <h1 className="font-display text-3xl" style={{ color: 'var(--color-app-text)' }}>Journey</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--color-app-text-muted)' }}>
          A record of your focused work and momentum.
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <StatCard label="Tasks Done" value={completedTasks.length} sub={`of ${tasks.length} total`} accent />
        <StatCard label="Missions" value={completedMissions.length} sub="completed" />
        <StatCard label="Focus Sessions" value={completedSessions.length} sub="completed" />
        <StatCard label="Focus Time" value={formatMinutes(totalFocusMinutes)} sub="all time" />
      </div>

      {/* Focus activity — 14-day bar chart */}
      <div
        className="rounded-xl p-5 mb-8"
        style={{ backgroundColor: 'var(--color-app-surface)', border: '1px solid var(--color-app-border)' }}
      >
        <p className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: 'var(--color-app-text-muted)' }}>
          Focus Activity — Last 14 days
        </p>
        <div className="flex items-end gap-1 h-20">
          {days.map(([day, mins]) => {
            const height = (mins / maxMins) * 100;
            const label = new Date(day);
            return (
              <div key={day} className="flex-1 flex flex-col items-center gap-1 group" title={`${label.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}: ${formatMinutes(mins)}`}>
                <div
                  className="w-full rounded-sm transition-all"
                  style={{
                    height: `${Math.max(height, mins > 0 ? 8 : 2)}%`,
                    backgroundColor: mins > 0 ? 'var(--color-app-mission)' : 'var(--color-app-surface-raised)',
                    opacity: mins > 0 ? 0.85 : 0.3,
                    minHeight: '2px',
                  }}
                />
                <span className="text-[0.5rem] hidden group-hover:block" style={{ color: 'var(--color-app-text-dim)' }}>
                  {label.toLocaleDateString(undefined, { day: 'numeric' })}
                </span>
              </div>
            );
          })}
        </div>
        <div className="flex justify-between mt-2">
          <span className="text-[0.6rem]" style={{ color: 'var(--color-app-text-dim)' }}>
            {new Date(days[0][0]).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          </span>
          <span className="text-[0.6rem]" style={{ color: 'var(--color-app-text-dim)' }}>Today</span>
        </div>
      </div>

      {/* Recent focus sessions */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ backgroundColor: 'var(--color-app-surface)', border: '1px solid var(--color-app-border)' }}
      >
        <div className="px-5 py-4 border-b" style={{ borderColor: 'var(--color-app-border)' }}>
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-app-text-muted)' }}>
            Recent Focus Sessions
          </p>
        </div>

        {recentSessions.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm" style={{ color: 'var(--color-app-text-dim)' }}>
              No focus sessions yet. Start a Mission to log your first session.
            </p>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: 'var(--color-app-border)' }}>
            {recentSessions.map((s) => {
              const missionTitle = s.mission_id ? (missionMap[s.mission_id] ?? 'Unknown mission') : 'No mission';
              const started = new Date(s.started_at);
              return (
                <div key={s.id} className="px-5 py-3 flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate" style={{ color: 'var(--color-app-text)' }}>
                      {missionTitle}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--color-app-text-dim)' }}>
                      {started.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                      {' '}·{' '}
                      {started.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="text-sm font-mono" style={{ color: 'var(--color-app-text-muted)' }}>
                      {s.duration_minutes ? formatMinutes(s.duration_minutes) : '—'}
                    </span>
                    <span
                      className="text-[0.6rem] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                      style={
                        s.completed
                          ? { backgroundColor: 'rgba(74,140,106,0.1)', color: '#4A8C6A', border: '1px solid rgba(74,140,106,0.2)' }
                          : { backgroundColor: 'rgba(122,143,166,0.1)', color: '#7A8FA6', border: '1px solid rgba(122,143,166,0.15)' }
                      }
                    >
                      {s.completed ? 'done' : 'partial'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
