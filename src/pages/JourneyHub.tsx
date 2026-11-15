import { useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import Journey from './Journey';
import Odyssey from './Odyssey';
import { HUB_LABELS, HUB_VIEWS, parseHubView, stepHubView, type HubView } from '../lib/journeyHub';

/**
 * One post-mission destination: the expedition trail and the explorer passport (stats,
 * achievements, data export) behind a tab switcher. The active view lives in ?view= so it
 * survives reloads and back/forward, and so the old /odyssey bookmarks can redirect into it.
 */
export default function JourneyHub() {
  const [params, setParams] = useSearchParams();
  const view = parseHubView(params.toString());
  const tabs = useRef<Record<string, HTMLButtonElement | null>>({});

  const select = (next: HubView) => {
    const copy = new URLSearchParams(params);
    if (next === 'trail') copy.delete('view');
    else copy.set('view', next);
    setParams(copy, { replace: true });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const next = stepHubView(view, e.key === 'ArrowRight' ? 1 : -1);
    select(next);
    tabs.current[next]?.focus();
  };

  return (
    <div>
      <div role="tablist" aria-label="Journey views" onKeyDown={onKeyDown}
        className="flex gap-1 mb-6 p-1 rounded-xl w-full sm:w-fit overflow-x-auto"
        style={{ backgroundColor: 'var(--color-app-surface)', border: '1px solid var(--color-app-border)' }}>
        {HUB_VIEWS.map((v) => {
          const active = v === view;
          return (
            <button key={v} type="button" role="tab" id={`hub-tab-${v}`}
              ref={(el) => { tabs.current[v] = el; }}
              aria-selected={active} aria-controls={`hub-panel-${v}`} tabIndex={active ? 0 : -1}
              onClick={() => select(v)}
              className="flex-1 sm:flex-none whitespace-nowrap px-4 py-2 rounded-lg text-sm font-medium cursor-pointer border-none"
              style={{
                backgroundColor: active ? 'color-mix(in srgb, var(--color-app-mission) 20%, transparent)' : 'transparent',
                color: active ? 'var(--color-app-text)' : 'var(--color-app-text-muted)',
              }}>
              {HUB_LABELS[v]}
            </button>
          );
        })}
      </div>
      <div role="tabpanel" id={`hub-panel-${view}`} aria-labelledby={`hub-tab-${view}`}>
        {view === 'trail' ? <Journey /> : <Odyssey />}
      </div>
    </div>
  );
}
