import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { ExpeditionProgress as Progress } from '../lib/progressionEngine';
import { expeditionCardSvg, RANK_PATHS } from '../lib/expeditionCard';

export function RankBadge({ progress, size = 48 }: { progress: Progress; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ color: progress.rank.accent, flexShrink: 0 }}><path d={RANK_PATHS[progress.rankIndex]} /></svg>;
}
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export default function ExpeditionProgress({ progress, name, configureRestDays }: { progress: Progress; name: string; configureRestDays: (days: number[]) => void }) {
  const dialog = useRef<HTMLDialogElement>(null), trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false), [error, setError] = useState('');
  const card = expeditionCardSvg(progress, name);
  useEffect(() => {
    if (!open) return;
    const node = dialog.current!; node.showModal();
    return () => { node.close(); };
  }, [open]);
  function close() {
    // Release native modal inertness before returning focus to its trigger.
    if (dialog.current?.open) dialog.current.close();
    setOpen(false); trigger.current?.focus();
  }
  function trapFocus(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key !== 'Tab') return;
    const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not([disabled])');
    const first = buttons[0], last = buttons[buttons.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
  function download() {
    let url: string | null = null;
    try {
      url = URL.createObjectURL(new Blob([card], { type: 'image/svg+xml;charset=utf-8' }));
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'odyssey-expedition.svg'; document.body.append(anchor); anchor.click(); anchor.remove();
      const owned = url; setTimeout(() => URL.revokeObjectURL(owned), 1000); setError('');
    } catch { if (url) URL.revokeObjectURL(url); setError('Could not download the card. Please try again.'); }
  }
  return <section aria-label="Expedition progression" className="rounded-xl p-5 mb-6" style={{ backgroundColor: 'var(--color-app-surface)', border: `1px solid ${progress.rank.accent}` }}>
    <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-5">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <RankBadge progress={progress} />
        <div className="min-w-0"><p className="text-xs uppercase tracking-wider" style={{ color: 'var(--color-app-text-muted)' }}>Expedition rank</p><h2 className="font-display text-xl break-words" style={{ color: progress.rank.accent }}>{progress.rank.title}</h2></div>
      </div>
      <button ref={trigger} type="button" onClick={() => { setError(''); setOpen(true); }} className="self-start shrink-0 rounded-lg border px-3 py-2 text-xs cursor-pointer" style={{ backgroundColor: 'var(--color-app-surface)', borderColor: 'var(--color-app-border)', color: 'var(--color-app-text)' }}>Share Expedition Card</button>
    </div>
    <div className="flex flex-wrap justify-between gap-2 mb-2 text-xs" style={{ color: 'var(--color-app-text-muted)' }}><span>{progress.xp.toLocaleString()} XP</span><span>{progress.nextRank ? `${Math.ceil(progress.nextRank.xp - progress.xp)} XP to ${progress.nextRank.title}` : 'Highest expedition rank unlocked'}</span></div>
    <div role="progressbar" aria-label="Expedition rank progress" aria-valuenow={Math.round(progress.rankProgress)} aria-valuemin={0} aria-valuemax={100} aria-valuetext={progress.nextRank ? `${Math.round(progress.rankProgress)}% toward ${progress.nextRank.title}` : 'Highest rank unlocked'} className="h-2 rounded-full overflow-hidden mb-5" style={{ backgroundColor: 'var(--color-app-surface-raised)' }}><div className="h-full" style={{ width: `${progress.rankProgress}%`, backgroundColor: progress.rank.accent }} /></div>
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div><div role="meter" aria-label="Momentum velocity" aria-valuenow={Math.round(progress.momentum)} aria-valuemin={0} aria-valuemax={100} className="flex items-center gap-3"><svg width="56" height="56" viewBox="0 0 60 60" aria-hidden="true"><circle cx="30" cy="30" r="25" fill="none" stroke="var(--color-app-border)" strokeWidth="5" /><circle cx="30" cy="30" r="25" fill="none" stroke={progress.rank.accent} strokeWidth="5" pathLength="100" strokeDasharray={`${progress.momentum} 100`} transform="rotate(-90 30 30)" /></svg><div><p className="font-mono text-lg" style={{ color: 'var(--color-app-text)' }}>{Math.round(progress.momentum)}%</p><p className="text-xs" style={{ color: 'var(--color-app-text-muted)' }}>Momentum velocity</p></div></div></div>
      <div><p className="font-mono text-2xl" style={{ color: 'var(--color-app-text)' }}>{progress.streak}</p><p className="text-xs" style={{ color: 'var(--color-app-text-muted)' }}>Active-day streak</p><p className="text-xs mt-1" style={{ color: 'var(--color-app-text-dim)' }}>Best: {progress.longestStreak} active days</p></div>
      <div><p className="font-mono text-2xl" style={{ color: 'var(--color-app-text)' }}>{progress.shields} / 1</p><p className="text-xs" style={{ color: 'var(--color-app-text-muted)' }}>Streak shield available</p><p className="text-xs mt-1" style={{ color: 'var(--color-app-text-dim)' }}>{progress.shields ? 'Protects one missed day' : `${progress.daysToShield} active days to next shield`}</p></div>
    </div>
    <details className="mt-5 text-xs" style={{ color: 'var(--color-app-text-muted)' }}><summary className="cursor-pointer">Rest days and progression rules</summary><fieldset className="mt-3"><legend className="mb-2">Rest days (saved in this browser)</legend><div className="flex flex-wrap gap-3">{DAYS.map((day, index) => <label key={day} className="flex items-center gap-1"><input type="checkbox" checked={progress.restDays.includes(index)} onChange={event => configureRestDays(event.target.checked ? [...progress.restDays, index] : progress.restDays.filter(value => value !== index))} />{day}</label>)}</div></fieldset><p className="mt-3 leading-relaxed">50 XP per completed task, 250 per completed mission and 10 per logged focus minute. Seven active days earn one shield (maximum one). Rest days preserve a streak without adding to it. Today remains open until local midnight. Momentum combines focus depth, missions and active days, halving each contribution every 48 elapsed hours, including rest days. Timezone: {progress.timeZone}.</p>{progress.shieldedDays.length > 0 && <p className="mt-2">Protected missed days: {progress.shieldedDays.slice(-7).join(', ')}</p>}</details>
    {open && <dialog ref={dialog} role="dialog" aria-modal="true" aria-labelledby="expedition-share-title" onCancel={event => { event.preventDefault(); close(); }} onClose={close} onKeyDown={trapFocus} className="m-auto rounded-xl p-5 w-[min(94vw,740px)] max-h-[90dvh] overflow-auto backdrop:bg-black/60" style={{ backgroundColor: 'var(--color-app-bg)', color: 'var(--color-app-text)', border: '1px solid var(--color-app-border)' }}><div className="flex justify-between gap-3 items-center mb-3"><h2 id="expedition-share-title" className="font-display text-xl">Share Expedition Card</h2><button type="button" onClick={close} className="border rounded px-3 py-2 cursor-pointer" style={{ borderColor: 'var(--color-app-border)', backgroundColor: 'var(--color-app-surface)' }}>Close</button></div><p className="text-xs mb-4" style={{ color: 'var(--color-app-text-muted)' }}>Preview your local snapshot before downloading. It includes your explorer name and totals. Email, task titles and mission details stay out of the card.</p><img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(card)}`} alt="Your expedition rank, XP, streak and momentum summary" className="w-full rounded-lg" /><button type="button" onClick={download} className="mt-4 rounded-lg px-4 py-2 border cursor-pointer" style={{ borderColor: 'var(--color-app-border)', backgroundColor: 'var(--color-app-surface)' }}>Download SVG card</button>{error && <p role="alert" className="mt-3 text-sm">{error}</p>}</dialog>}
  </section>;
}
