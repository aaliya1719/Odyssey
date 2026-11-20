import { useMemo, useState } from 'react';
import type { Task } from '../types/database';
import { deriveMissionFromTask } from '../lib/missionDerivation';
import {
  checkSchedule, formatTime, generateSchedule, moveBlock, parseTime, swapBlocks,
  type BlockInput, type Energy, type EnergyCurve, type Schedule, type TimeBlock,
} from '../lib/timeBlockEngine';

const STEP = 15;
const CURVE_LABEL: Record<EnergyCurve, string> = {
  morning: 'Morning peak', balanced: 'Balanced', night: 'Night owl',
};
const ENERGY_STYLE: Record<Energy, { bg: string; label: string }> = {
  high:   { bg: 'rgba(214,168,79,0.22)',  label: 'High energy' },
  medium: { bg: 'rgba(184,122,85,0.2)',   label: 'Medium energy' },
  low:    { bg: 'rgba(90,140,200,0.2)',   label: 'Light work' },
};

function energyFor(task: Task, minutes: number): Energy {
  if (task.priority === 'urgent' || task.priority === 'high' || minutes >= 45) return 'high';
  if (minutes <= 20) return 'low';
  return 'medium';
}

interface Props {
  tasks: Task[];
  /** Called with the task and the scheduled length when the user starts a block. */
  onStart: (task: Task, minutes: number) => void;
}

/**
 * Energy-aware day planner. Lays open tasks on a timeline using the engine in
 * lib/timeBlockEngine and lets the user nudge or reorder blocks. Works as a
 * vertical list on small screens and an hourly grid from md up.
 */
export default function TimeBlockCanvas({ tasks, onStart }: Props) {
  const [from, setFrom] = useState('09:00');
  const [to, setTo] = useState('17:00');
  const [curve, setCurve] = useState<EnergyCurve>('morning');
  const [edited, setEdited] = useState<TimeBlock[] | null>(null);

  const win = useMemo(() => {
    const start = parseTime(from);
    const end = parseTime(to);
    return start !== null && end !== null && end > start ? { start, end } : null;
  }, [from, to]);

  const byId = useMemo(() => new Map(tasks.map(t => [t.id, t])), [tasks]);

  const generated = useMemo<Schedule | null>(() => {
    if (!win) return null;
    const items: BlockInput[] = tasks.map(t => {
      const minutes = deriveMissionFromTask(t).planned_minutes;
      return { id: t.id, title: t.title, minutes, energy: energyFor(t, minutes) };
    });
    return generateSchedule(items, win, curve);
  }, [tasks, win, curve]);

  const schedule: Schedule | null = generated && { ...generated, blocks: edited ?? generated.blocks };
  const warnings = schedule && win ? checkSchedule(schedule, win) : [];

  const reset = () => setEdited(null);
  const change = (fn: (b: TimeBlock[]) => TimeBlock[]) => {
    if (schedule) setEdited(fn(schedule.blocks));
  };

  if (tasks.length === 0) return null;

  const work = schedule?.blocks.filter(b => b.kind === 'work') ?? [];
  const hours = win ? Array.from({ length: Math.ceil((win.end - win.start) / 60) }, (_, i) => win.start + i * 60) : [];
  const PX = 1.1; // px per minute in the grid

  return (
    <section
      aria-label="Daily time-block planner"
      className="mb-8 rounded-xl p-4"
      style={{ backgroundColor: 'var(--color-app-surface)', border: '1px solid var(--color-app-border)' }}
    >
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <h2 className="text-xs font-bold uppercase tracking-[0.16em] mr-auto" style={{ color: 'var(--color-app-text-dim)' }}>
          Plan your day
        </h2>
        <label className="text-xs flex flex-col gap-1" style={{ color: 'var(--color-app-text-dim)' }}>
          From
          <input type="time" value={from} onChange={e => { setFrom(e.target.value); reset(); }} className="rounded px-2 py-1 text-sm bg-transparent border" style={{ borderColor: 'var(--color-app-border)', color: 'var(--color-app-text)' }} />
        </label>
        <label className="text-xs flex flex-col gap-1" style={{ color: 'var(--color-app-text-dim)' }}>
          To
          <input type="time" value={to} onChange={e => { setTo(e.target.value); reset(); }} className="rounded px-2 py-1 text-sm bg-transparent border" style={{ borderColor: 'var(--color-app-border)', color: 'var(--color-app-text)' }} />
        </label>
        <label className="text-xs flex flex-col gap-1" style={{ color: 'var(--color-app-text-dim)' }}>
          Energy curve
          <select value={curve} onChange={e => { setCurve(e.target.value as EnergyCurve); reset(); }} className="rounded px-2 py-1 text-sm border" style={{ borderColor: 'var(--color-app-border)', backgroundColor: 'var(--color-app-surface)', color: 'var(--color-app-text)' }}>
            {(Object.keys(CURVE_LABEL) as EnergyCurve[]).map(c => <option key={c} value={c}>{CURVE_LABEL[c]}</option>)}
          </select>
        </label>
        {edited && (
          <button type="button" onClick={reset} className="text-xs underline cursor-pointer border-none bg-transparent" style={{ color: 'var(--color-app-mission)' }}>
            Reset layout
          </button>
        )}
      </div>

      {!win && <p role="alert" className="text-sm" style={{ color: '#e5a0a0' }}>The end time needs to be after the start time.</p>}

      {warnings.length > 0 && (
        <ul role="alert" className="mb-3 text-xs space-y-1" style={{ color: '#e5c07b' }}>
          {warnings.map((w, i) => <li key={i}>{w.message}</li>)}
        </ul>
      )}

      {win && schedule && (
        <>
          {/* Hourly grid, md and up */}
          <div className="hidden md:block relative ml-12 border-l" style={{ height: (win.end - win.start) * PX, borderColor: 'var(--color-app-border)' }} aria-hidden="true">
            {hours.map(h => (
              <div key={h} className="absolute left-0 right-0 border-t text-[0.65rem]" style={{ top: (h - win.start) * PX, borderColor: 'var(--color-app-border)', color: 'var(--color-app-text-dim)' }}>
                <span className="absolute -left-12 -top-2">{formatTime(h)}</span>
              </div>
            ))}
            {schedule.blocks.map(b => (
              <div
                key={b.id}
                className="absolute left-2 right-2 rounded-md px-2 text-xs overflow-hidden flex items-center"
                style={{
                  top: (Math.max(b.start, win.start) - win.start) * PX,
                  height: Math.max((b.end - b.start) * PX - 2, 14),
                  backgroundColor: ENERGY_STYLE[b.energy].bg,
                  border: b.kind === 'break' ? '1px dashed var(--color-app-border)' : '1px solid var(--color-app-border)',
                  color: 'var(--color-app-text)',
                }}
              >
                <span className="truncate">{b.kind === 'break' ? 'Recovery' : b.title}</span>
              </div>
            ))}
          </div>

          {/* Accessible list: the only view on mobile, the controls on desktop */}
          <ol className="space-y-2 md:mt-4">
            {schedule.blocks.map((b, i) => {
              const task = byId.get(b.id);
              const nextWork = schedule.blocks.slice(i + 1).find(x => x.kind === 'work');
              return (
                <li key={b.id} className="rounded-lg px-3 py-2 flex flex-wrap items-center gap-2 text-sm" style={{ backgroundColor: ENERGY_STYLE[b.energy].bg, border: b.kind === 'break' ? '1px dashed var(--color-app-border)' : '1px solid var(--color-app-border)', color: 'var(--color-app-text)' }}>
                  <span className="font-mono text-xs" style={{ color: 'var(--color-app-text-dim)' }}>
                    {formatTime(b.start)}&ndash;{formatTime(b.end)}
                  </span>
                  <span className="truncate mr-auto">
                    {b.kind === 'break' ? 'Recovery pause' : b.title}
                    {b.kind === 'work' && <span className="sr-only"> ({ENERGY_STYLE[b.energy].label})</span>}
                  </span>
                  {b.kind === 'work' && (
                    <>
                      <button type="button" aria-label={`Move ${b.title} 15 minutes earlier`} onClick={() => change(bs => moveBlock(bs, b.id, b.start - STEP, win))} className="px-2 py-0.5 text-xs rounded cursor-pointer border" style={{ borderColor: 'var(--color-app-border)', background: 'transparent', color: 'inherit' }}>&minus;15m</button>
                      <button type="button" aria-label={`Move ${b.title} 15 minutes later`} onClick={() => change(bs => moveBlock(bs, b.id, b.start + STEP, win))} className="px-2 py-0.5 text-xs rounded cursor-pointer border" style={{ borderColor: 'var(--color-app-border)', background: 'transparent', color: 'inherit' }}>+15m</button>
                      {nextWork && (
                        <button type="button" aria-label={`Swap ${b.title} with ${nextWork.title}`} onClick={() => change(bs => swapBlocks(bs, b.id, nextWork.id))} className="px-2 py-0.5 text-xs rounded cursor-pointer border" style={{ borderColor: 'var(--color-app-border)', background: 'transparent', color: 'inherit' }}>Swap with next</button>
                      )}
                      {task && (
                        <button type="button" onClick={() => onStart(task, b.end - b.start)} className="px-3 py-1 text-xs font-semibold rounded-lg cursor-pointer border-none" style={{ background: 'linear-gradient(135deg, #B87A55 0%, #D6A84F 100%)', color: '#050817' }}>
                          Start Scheduled Mission
                        </button>
                      )}
                    </>
                  )}
                </li>
              );
            })}
          </ol>

          {work.length === 0 && <p className="text-sm" style={{ color: 'var(--color-app-text-dim)' }}>Nothing fits in this window.</p>}
          {schedule.overflow.length > 0 && (
            <p className="mt-3 text-xs" style={{ color: 'var(--color-app-text-dim)' }}>
              Not scheduled: {schedule.overflow.map(o => o.title).join(', ')}
            </p>
          )}
        </>
      )}
    </section>
  );
}
