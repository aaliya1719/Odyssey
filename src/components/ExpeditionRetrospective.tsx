import { useEffect, useRef, useState } from 'react';
import { aggregateRetrospective, localRetrospective, peakFocusWindow } from '../lib/expeditionRetrospective';
import { generateRetrospective } from '../services/aiService';
import type { FocusSession, Mission, Task } from '../types/database';
import type { RetrospectiveDigest } from '../../supabase/functions/_shared/retrospective.ts';

type Props = {
  missions: Mission[];
  tasks: Task[];
  sessions: FocusSession[];
};

const dateFormat = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const border = { borderColor: 'var(--color-app-border)' };
const buttonClass = 'rounded-lg border px-3 py-2 text-sm cursor-pointer focus-visible:outline-2 disabled:opacity-50';

export default function ExpeditionRetrospective({ missions, tasks, sessions }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const call = useRef<AbortController | null>(null);
  const [summary, setSummary] = useState<ReturnType<typeof aggregateRetrospective> | null>(null);
  const [ai, setAi] = useState<RetrospectiveDigest | null>(null);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState('');
  const [copyNotice, setCopyNotice] = useState('');

  useEffect(() => () => call.current?.abort(), []);

  function open() {
    setSummary(aggregateRetrospective(missions, tasks, sessions));
    setNotice('');
    setCopyNotice('');
    setAi(null);
    dialog.current?.showModal();
  }

  function closed() {
    call.current?.abort();
    call.current = null;
    setPending(false);
    trigger.current?.focus();
  }

  async function generate() {
    if (!summary || call.current) return;
    const controller = new AbortController();
    call.current = controller;
    setPending(true);
    setNotice('');
    setAi(null);
    setCopyNotice('');
    const result = await generateRetrospective(
      summary.metrics, AbortSignal.any([controller.signal, AbortSignal.timeout(12_000)]),
    );
    if (call.current !== controller) return;
    call.current = null;
    setPending(false);
    setAi(result);
    if (!result) setNotice('AI digest unavailable. Your local digest is still here. You can try again.');
  }

  const metrics = summary?.metrics;
  const digest = ai ?? (metrics ? localRetrospective(metrics) : null);
  const peak = metrics ? peakFocusWindow(metrics) : '';
  const minutes = metrics?.focusByWindow.reduce((total, value) => total + value, 0) ?? 0;
  const title = summary ? `${dateFormat.format(summary.start)} – ${dateFormat.format(summary.end)}` : '';
  const items = digest ? [
    ['Primary victory', digest.victory],
    ['Biggest friction point', digest.friction],
    ['Peak focus window', peak],
    ['Strategy for next week', digest.strategy],
  ] : [];

  async function copy() {
    if (!metrics) return;
    const text = [
      'Expedition retrospective', title,
      `${minutes} focus minutes · ${metrics.missionsCompleted}/${metrics.missionsConsidered} missions complete · ${metrics.tasksCompleted} tasks complete`,
      ...items.map(([label, value]) => `${label}: ${value}`),
    ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopyNotice('Digest copied.');
    } catch {
      setCopyNotice('Copy failed. You can select and copy the digest text.');
    }
  }

  return (
    <>
      <button ref={trigger} type="button" className={buttonClass} style={border} onClick={open}>
        Weekly retrospective
      </button>
      <dialog
        ref={dialog}
        aria-labelledby="retrospective-title"
        onClose={closed}
        className="m-auto w-[min(94vw,648px)] max-h-[90dvh] overflow-auto rounded-2xl border p-5 sm:p-7 backdrop:bg-black/60"
        style={{ ...border, color: 'var(--color-app-text)', background: 'var(--color-app-bg)' }}
      >
        <header className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm" style={{ color: 'var(--color-app-mission)' }}>{title}</p>
            <h2 id="retrospective-title" className="font-display text-2xl mt-1">Expedition retrospective</h2>
          </div>
          <button type="button" onClick={() => dialog.current?.close()} className={buttonClass} style={border}>Close</button>
        </header>
        {metrics && digest && (
          <>
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2 my-5">
              {[
                ['Focus minutes', minutes],
                ['Ended sessions', metrics.focusSessions],
                ['Missions completed', `${metrics.missionsCompleted}/${metrics.missionsConsidered}`],
                ['Tasks completed', metrics.tasksCompleted],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border p-3" style={{ ...border, background: 'var(--color-app-surface)' }}>
                  <dt className="text-xs" style={{ color: 'var(--color-app-text-muted)' }}>{label}</dt>
                  <dd className="font-display text-lg mt-1">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="text-xs mb-4" style={{ color: 'var(--color-app-text-muted)' }}>
              Seven local calendar days, including today. Mission totals include missions added or completed in this window.
            </p>
            <p className="text-xs font-semibold mb-2" style={{ color: 'var(--color-app-mission)' }}>
              {ai ? 'Gemini digest' : 'Local digest'}
            </p>
            <dl className="space-y-3 border-l-2 pl-4 break-words" style={{ borderColor: 'var(--color-app-mission)' }}>
              {items.map(([label, value]) => (
                <div key={label}><dt className="text-sm font-semibold">{label}</dt>
                  <dd className="text-sm mt-1" style={{ color: 'var(--color-app-text-muted)' }}>{value}</dd></div>
              ))}
            </dl>
            <p className="mt-5 text-xs" style={{ color: 'var(--color-app-text-muted)' }}>
              Generate with Gemini sends only counts, focus time buckets and predefined obstacle counts. Reflections, names and titles stay out of the request.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className={buttonClass} style={border}
                disabled={pending || metrics.missionsCompleted + metrics.tasksCompleted + metrics.focusSessions === 0}
                onClick={() => void generate()}>{pending ? 'Generating…' : 'Generate with Gemini'}</button>
              <button type="button" className={buttonClass} style={border} onClick={() => void copy()}>Copy Weekly Digest</button>
            </div>
            <p role="status" className="mt-2 text-xs">{notice || (pending ? 'Generating AI digest.' : '')}</p>
            <p role="status" className="text-xs">{copyNotice}</p>
          </>
        )}
      </dialog>
    </>
  );
}
