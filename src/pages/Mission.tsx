import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { taskService } from '../services/taskService';
import { missionService } from '../services/missionService';
import { generatePlans, suggestMissionFromPlan } from '../services/aiService';
import type { Task, Mission } from '../types/database';
import type { CreateMissionInput } from '../services/missionService';
import type {
  CaptureContext,
  AIInterpretation,
  AIPlans,
  AIPlan,
  ApproachId,
  AIMission,
} from '../lib/odysseyTypes';

// ─── Status helpers ───────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  planned: 'Planned', active: 'Active', paused: 'Paused',
  completed: 'Completed', abandoned: 'Abandoned',
};

const STATUS_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  planned:   { bg: 'rgba(122,143,166,0.1)',  color: '#7A8FA6', border: 'rgba(122,143,166,0.2)' },
  active:    { bg: 'rgba(184,122,85,0.12)',  color: '#B87A55', border: 'rgba(184,122,85,0.3)'  },
  paused:    { bg: 'rgba(200,136,58,0.1)',   color: '#D6A84F', border: 'rgba(200,136,58,0.25)' },
  completed: { bg: 'rgba(74,140,106,0.1)',   color: '#4A8C6A', border: 'rgba(74,140,106,0.25)' },
  abandoned: { bg: 'rgba(168,59,59,0.08)',   color: '#A83B3B', border: 'rgba(168,59,59,0.2)'   },
};

// ─── Plan Chooser ─────────────────────────────────────────────────────────────

function PlanChooser({
  plans,
  onChosen,
  onDismiss,
}: {
  plans:    AIPlans;
  onChosen: (plan: AIPlan) => void;
  onDismiss: () => void;
}) {
  const [selected, setSelected] = useState<ApproachId | null>(null);

  const confirm = () => {
    const plan = plans.plans.find(p => p.id === selected);
    if (plan) onChosen(plan);
  };

  return (
    <div
      className="rounded-xl overflow-hidden mb-8"
      style={{
        background:  'rgba(5,8,23,0.85)',
        border:      '1px solid rgba(30,60,100,0.5)',
        boxShadow:   '0 4px 40px -8px rgba(3,6,13,0.7)',
      }}
    >
      {/* Header */}
      <div className="px-5 py-4 flex items-center justify-between"
        style={{ borderBottom: '1px solid rgba(30,60,100,0.35)' }}>
        <div className="flex items-center gap-2.5">
          <div className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: 'var(--color-app-mission)', boxShadow: '0 0 6px rgba(184,122,85,0.5)' }} />
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em]"
              style={{ color: 'var(--color-app-mission)' }}>
              Choose your approach
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-app-text-dim)' }}>
              Three strategies — same tasks, different emphasis
              {!plans.aiGenerated && <span className="ml-1 opacity-60">(offline)</span>}
            </p>
          </div>
        </div>
        <button onClick={onDismiss}
          className="text-xs cursor-pointer border-none bg-transparent"
          style={{ color: 'var(--color-app-text-dim)' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-app-text-muted)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-app-text-dim)')}>
          Skip
        </button>
      </div>

      {/* Cards */}
      <div className="p-4 space-y-3">
        {plans.plans.map(plan => (
          <PlanCard
            key={plan.id}
            plan={plan}
            selected={selected === plan.id}
            onSelect={() => setSelected(plan.id)}
          />
        ))}
      </div>

      {/* Footer */}
      <div className="px-5 py-4 flex items-center justify-between gap-3"
        style={{ borderTop: '1px solid rgba(30,60,100,0.35)' }}>
        <p className="text-xs" style={{ color: 'var(--color-app-text-dim)' }}>
          {selected
            ? `${plans.plans.find(p => p.id === selected)?.name} selected.`
            : 'Select an approach to continue.'}
        </p>
        <button
          onClick={confirm}
          disabled={!selected}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold cursor-pointer border-none disabled:opacity-30 transition-all"
          style={{ backgroundColor: 'var(--color-app-mission)', color: '#fff' }}
          onMouseEnter={e => { if (selected) (e.currentTarget as HTMLButtonElement).style.filter = 'brightness(1.1)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.filter = 'brightness(1)'; }}
        >
          Choose this approach
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function PlanCard({
  plan, selected, onSelect,
}: {
  plan:     AIPlan;
  selected: boolean;
  onSelect: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const preview = plan.orderedItems.slice(0, 3);
  const rest    = plan.orderedItems.slice(3);

  return (
    <div
      className="rounded-xl overflow-hidden cursor-pointer transition-all"
      style={{
        background:  selected ? 'rgba(184,122,85,0.1)' : 'rgba(8,19,33,0.85)',
        border:      `1px solid ${selected ? 'rgba(184,122,85,0.5)' : 'rgba(30,60,100,0.45)'}`,
        boxShadow:   selected ? '0 0 0 1px rgba(184,122,85,0.12)' : 'none',
      }}
      onClick={onSelect}
      role="button"
      aria-pressed={selected}
    >
      <div className="px-5 pt-5 pb-3">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex items-center gap-2.5">
            <span className="text-xl leading-none">{plan.emoji}</span>
            <div>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--color-app-text)' }}>
                {plan.name}
              </h3>
              <p className="text-xs mt-0.5" style={{ color: 'var(--color-app-text-muted)' }}>
                {plan.tagline}
              </p>
            </div>
          </div>
          <div
            className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 transition-all"
            style={{
              backgroundColor: selected ? 'var(--color-app-mission)' : 'transparent',
              border: `2px solid ${selected ? 'var(--color-app-mission)' : 'rgba(30,60,100,0.5)'}`,
            }}
          >
            {selected && (
              <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            )}
          </div>
        </div>

        {/* Why this approach */}
        <p className="text-xs leading-relaxed mb-2" style={{ color: 'var(--color-app-text-dim)' }}>
          {plan.whyThisApproach}
        </p>

        {/* Time estimate + tradeoff */}
        <div className="flex flex-wrap gap-3">
          <span className="text-[0.65rem] flex items-center gap-1" style={{ color: 'var(--color-app-mission)' }}>
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <circle cx="12" cy="12" r="10" /><path strokeLinecap="round" d="M12 6v6l4 2" />
            </svg>
            {plan.timeEstimate}
          </span>
          <span className="text-[0.65rem]" style={{ color: 'var(--color-app-text-dim)' }}>
            ↔ {plan.tradeoff}
          </span>
        </div>
      </div>

      <div style={{ borderTop: '1px solid rgba(30,60,100,0.3)' }} />

      {/* Ordered items preview */}
      <div className="px-5 py-3 space-y-2">
        {preview.map((item, i) => (
          <div key={i} className="flex items-center gap-3">
            <span className="text-[0.65rem] font-bold tabular-nums w-4 flex-shrink-0 text-center"
              style={{ color: 'var(--color-app-text-dim)' }}>
              {i + 1}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate" style={{ color: 'var(--color-app-text)' }}>
                {item.text}
              </p>
              <p className="text-[0.63rem] mt-0.5" style={{ color: 'var(--color-app-text-dim)' }}>
                {item.rationale}
                {item.deadlineLabel && (
                  <span style={{ color: 'var(--color-app-mission)' }}> · {item.deadlineLabel}</span>
                )}
              </p>
            </div>
          </div>
        ))}

        {rest.length > 0 && (
          <>
            {expanded && rest.map((item, i) => (
              <div key={`r-${i}`} className="flex items-center gap-3">
                <span className="text-[0.65rem] font-bold tabular-nums w-4 flex-shrink-0 text-center"
                  style={{ color: 'var(--color-app-text-dim)' }}>
                  {preview.length + i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate" style={{ color: 'var(--color-app-text)' }}>
                    {item.text}
                  </p>
                  <p className="text-[0.63rem] mt-0.5" style={{ color: 'var(--color-app-text-dim)' }}>
                    {item.rationale}
                  </p>
                </div>
              </div>
            ))}
            <button
              onClick={e => { e.stopPropagation(); setExpanded(v => !v); }}
              className="text-xs cursor-pointer border-none bg-transparent transition-colors w-full text-left pt-1"
              style={{ color: 'var(--color-app-text-dim)' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-app-text-muted)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-app-text-dim)')}>
              {expanded ? '↑ Show less' : `+ ${rest.length} more`}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Mission creation panel ───────────────────────────────────────────────────

function CreateMissionPanel({
  tasks, prefillTask, prefillInput, aiMission, onCreated, onCancel,
}: {
  tasks:       Task[];
  prefillTask?: Task | null;
  prefillInput?: CreateMissionInput | null;
  aiMission?:  AIMission | null;
  onCreated:   (m: Mission) => void;
  onCancel:    () => void;
}) {
  const initialTaskId  = prefillInput?.task_id ?? prefillTask?.id ?? '';
  const initialTitle   = prefillInput?.title           ?? prefillTask?.title ?? '';
  const initialObj     = prefillInput?.objective       ?? (prefillTask ? (prefillTask.description?.trim() || `Complete: ${prefillTask.title}`) : '');
  const initialAction  = prefillInput?.next_action     ?? (prefillTask ? `Start working on: ${prefillTask.title}` : '');
  const initialMinutes = prefillInput?.planned_minutes
    ? String(prefillInput.planned_minutes)
    : prefillTask?.estimated_minutes ? String(prefillTask.estimated_minutes) : '25';

  const [selectedTaskId,   setSelectedTaskId]   = useState(initialTaskId);
  const [title,            setTitle]            = useState(initialTitle);
  const [objective,        setObjective]        = useState(initialObj);
  const [nextAction,       setNextAction]       = useState(initialAction);
  const [plannedMinutes,   setPlannedMinutes]   = useState(initialMinutes);
  const [currentAiMission, setCurrentAiMission] = useState<AIMission | null>(aiMission ?? null);
  const [saving,           setSaving]           = useState(false);
  const [err,              setErr]              = useState<string | null>(null);

  const activeTasks = tasks.filter(t => t.status !== 'completed' && t.status !== 'archived');

  const handleTaskSelect = (id: string) => {
    setSelectedTaskId(id);
    if (!id) {
      // Switched to "— No linked task —"
      if (!initialTaskId) {
        setTitle(initialTitle);
        setObjective(initialObj);
        setNextAction(initialAction);
        setPlannedMinutes(initialMinutes);
        setCurrentAiMission(aiMission ?? null);
      } else {
        setTitle('');
        setObjective('');
        setNextAction('');
        setPlannedMinutes('25');
        setCurrentAiMission(null);
      }
      return;
    }

    if (id === initialTaskId && prefillInput) {
      // Restored the original prefilled/AI-suggested task
      setTitle(initialTitle);
      setObjective(initialObj);
      setNextAction(initialAction);
      setPlannedMinutes(initialMinutes);
      setCurrentAiMission(aiMission ?? null);
      return;
    }

    // Switched to a different task: derive fresh, synchronized mission content
    const t = tasks.find(x => x.id === id);
    if (t) {
      setTitle(t.title);
      setObjective(t.description?.trim() || `Complete: ${t.title}`);
      setNextAction(`Start working on: ${t.title}`);
      setPlannedMinutes(t.estimated_minutes ? String(t.estimated_minutes) : '25');
      setCurrentAiMission(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true); setErr(null);
    try {
      const m = await missionService.createMission({
        title:           title.trim(),
        task_id:         selectedTaskId || null,
        objective:       objective.trim()  || null,
        next_action:     nextAction.trim() || null,
        planned_minutes: plannedMinutes ? parseInt(plannedMinutes, 10) : null,
      });
      onCreated(m);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed to create mission');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl p-6"
      style={{ backgroundColor: 'var(--color-app-surface)', border: '1px solid var(--color-app-border)' }}>
      <div className="flex items-start justify-between mb-5">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-display text-lg" style={{ color: 'var(--color-app-text)' }}>
              {prefillInput ? 'Your next mission' : 'Define Mission'}
            </h2>
            {currentAiMission?.aiGenerated && (
              <span className="text-[0.6rem] font-bold tracking-wider uppercase px-1.5 py-0.5 rounded"
                style={{ background: 'rgba(184,122,85,0.12)', color: 'var(--color-app-mission)', border: '1px solid rgba(184,122,85,0.3)' }}>
                AI
              </span>
            )}
          </div>
          {prefillInput && (
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-app-text-dim)' }}>
              {currentAiMission?.aiGenerated
                ? 'Suggested by Odyssey · edit anything before launching.'
                : 'Based on your chosen approach · edit anything before launching.'}
            </p>
          )}
          {/* AI reasoning insight */}
          {currentAiMission?.reasoning && (
            <p className="text-xs mt-2 leading-relaxed"
              style={{ color: 'var(--color-app-text-muted)', fontStyle: 'italic' }}>
              "{currentAiMission.reasoning}"
            </p>
          )}
        </div>
        <button onClick={onCancel}
          className="p-1.5 rounded-lg cursor-pointer border-none flex-shrink-0"
          style={{ backgroundColor: 'transparent', color: 'var(--color-app-text-dim)' }}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {err && (
        <div className="rounded-lg p-3 text-sm mb-4"
          style={{ backgroundColor: 'rgba(168,59,59,0.1)', border: '1px solid rgba(168,59,59,0.25)', color: '#E07070' }}>
          {err}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {activeTasks.length > 0 && (
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5"
              style={{ color: 'var(--color-app-text-muted)' }}>
              Link to Task (optional)
            </label>
            <select value={selectedTaskId} onChange={e => handleTaskSelect(e.target.value)}
              className="app-input w-full" style={{ cursor: 'pointer' }}>
              <option value="">— No linked task —</option>
              {activeTasks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
            </select>
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5"
            style={{ color: 'var(--color-app-text-muted)' }}>
            Mission Title <span style={{ color: '#E07070' }}>*</span>
          </label>
          <input type="text" required value={title} onChange={e => setTitle(e.target.value)}
            placeholder="Name this mission…" className="app-input w-full" />
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5"
            style={{ color: 'var(--color-app-text-muted)' }}>
            Objective
          </label>
          <textarea rows={2} value={objective} onChange={e => setObjective(e.target.value)}
            placeholder="What does success look like?" className="app-input w-full resize-none" />
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5"
            style={{ color: 'var(--color-app-text-muted)' }}>
            Next Action
          </label>
          <input type="text" value={nextAction} onChange={e => setNextAction(e.target.value)}
            placeholder="The very first thing you will do…" className="app-input w-full" />
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5"
            style={{ color: 'var(--color-app-text-muted)' }}>
            Planned Time (minutes)
          </label>
          <input type="number" min="1" value={plannedMinutes}
            onChange={e => setPlannedMinutes(e.target.value)} className="app-input w-full" />
        </div>

        <div className="flex justify-end gap-3 pt-1">
          <button type="button" onClick={onCancel}
            className="px-4 py-2 rounded-lg text-sm cursor-pointer border-none"
            style={{ backgroundColor: 'transparent', color: 'var(--color-app-text-muted)', border: '1px solid var(--color-app-border)' }}>
            Cancel
          </button>
          <button type="submit" disabled={saving || !title.trim()}
            className="px-5 py-2 rounded-lg text-sm font-medium cursor-pointer border-none disabled:opacity-50"
            style={{ backgroundColor: 'var(--color-app-mission)', color: '#fff' }}>
            {saving ? 'Launching…' : 'Launch Mission'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Mission card (existing list) ─────────────────────────────────────────────

function MissionCard({
  mission, linkedTask, onDelete, onExecute,
}: {
  mission:     Mission;
  linkedTask?: Task | null;
  onDelete:    (id: string) => void;
  onExecute:   (m: Mission, linkedTask?: Task | null) => void;
}) {
  const sc         = STATUS_COLORS[mission.status] ?? STATUS_COLORS.planned;
  const canExecute = ['planned', 'active', 'paused'].includes(mission.status);

  return (
    <div className="rounded-xl overflow-hidden"
      style={{
        backgroundColor: 'var(--color-app-surface)',
        border:  `1px solid ${mission.status === 'active' ? 'rgba(184,122,85,0.4)' : 'var(--color-app-border)'}`,
        boxShadow: mission.status === 'active' ? '0 0 0 1px rgba(184,122,85,0.08)' : 'none',
      }}>
      <div className="p-5">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <span className="text-[0.65rem] font-bold tracking-wider uppercase px-2 py-0.5 rounded"
            style={{ backgroundColor: sc.bg, color: sc.color, border: `1px solid ${sc.border}` }}>
            {STATUS_LABELS[mission.status]}
          </span>
          {linkedTask && (
            <span className="text-xs truncate max-w-[180px]" style={{ color: 'var(--color-app-text-dim)' }}>
              ↳ {linkedTask.title}
            </span>
          )}
        </div>

        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold" style={{ color: 'var(--color-app-text)' }}>
              {mission.title}
            </h3>
            {mission.objective && (
              <p className="text-sm mt-1" style={{ color: 'var(--color-app-text-muted)' }}>
                {mission.objective}
              </p>
            )}
          </div>
          <button onClick={() => onDelete(mission.id)}
            className="p-1.5 rounded-lg cursor-pointer border-none flex-shrink-0"
            style={{ backgroundColor: 'transparent', color: 'var(--color-app-text-dim)' }}
            title="Delete"
            onMouseEnter={e => (e.currentTarget.style.color = '#E07070')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-app-text-dim)')}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
          </button>
        </div>

        {mission.next_action && (
          <div className="mt-3 px-3 py-2 rounded-lg flex items-start gap-2"
            style={{ backgroundColor: 'var(--color-app-surface-raised)', border: '1px solid var(--color-app-border-subtle)' }}>
            <svg className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24"
              stroke="currentColor" strokeWidth={2} style={{ color: 'var(--color-app-mission)' }}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347c-.75.412-1.667-.13-1.667-.986V5.653z" />
            </svg>
            <span className="text-xs" style={{ color: 'var(--color-app-text-muted)' }}>
              {mission.next_action}
            </span>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-4 mt-3">
          {mission.planned_minutes && (
            <span className="text-xs flex items-center gap-1" style={{ color: 'var(--color-app-text-dim)' }}>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <circle cx="12" cy="12" r="10" /><path strokeLinecap="round" d="M12 6v6l4 2" />
              </svg>
              {mission.planned_minutes}m
            </span>
          )}
          {mission.completed_at && (
            <span className="text-xs" style={{ color: '#4A8C6A' }}>
              Completed {new Date(mission.completed_at).toLocaleDateString()}
            </span>
          )}
        </div>

        {canExecute && (
          <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--color-app-border-subtle)' }}>
            <button
              onClick={() => onExecute(mission, linkedTask)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold cursor-pointer border-none transition-all"
              style={{
                backgroundColor: mission.status === 'active' ? 'var(--color-app-mission)' : 'var(--color-app-mission-light)',
                color:           mission.status === 'active' ? '#fff' : 'var(--color-app-mission)',
                border:          mission.status === 'active' ? 'none' : '1px solid rgba(184,122,85,0.25)',
              }}
              onMouseEnter={e => {
                if (mission.status !== 'active') {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--color-app-mission)';
                  (e.currentTarget as HTMLButtonElement).style.color = '#fff';
                  (e.currentTarget as HTMLButtonElement).style.border = 'none';
                }
              }}
              onMouseLeave={e => {
                if (mission.status !== 'active') {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--color-app-mission-light)';
                  (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-app-mission)';
                  (e.currentTarget as HTMLButtonElement).style.border = '1px solid rgba(184,122,85,0.25)';
                }
              }}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347c-.75.412-1.667-.13-1.667-.986V5.653z" />
              </svg>
              {mission.status === 'paused' ? 'Resume' : mission.status === 'active' ? 'Continue Executing' : 'Start Executing'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Mission page ────────────────────────────────────────────────────────

type PlanScreen = 'loading_plans' | 'choose_plan' | 'loading_mission' | 'create_mission' | 'list';

export default function Mission() {
  const location = useLocation();
  const navigate = useNavigate();

  // Parse state from router — two possible sources:
  // 1. Full flow: captureContext + interpretation (from Home's Capture → Review)
  // 2. Direct: prefillTask (from task row "Plan" button)
  const routerState = (location.state ?? {}) as {
    captureContext?: CaptureContext;
    interpretation?: AIInterpretation;
    prefillTask?:    Task;
  };
  const captureContext   = routerState.captureContext   ?? null;
  const interpretation   = routerState.interpretation  ?? null;
  const prefillTask      = routerState.prefillTask      ?? null;

  const [tasks,    setTasks]    = useState<Task[]>([]);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);

  // Plan flow state
  const [planScreen,    setPlanScreen]    = useState<PlanScreen>(() => {
    if (captureContext && interpretation) return 'loading_plans';
    if (prefillTask) return 'create_mission';
    return 'list';
  });
  const [plans,         setPlans]         = useState<AIPlans | null>(null);
  const [chosenPlan,    setChosenPlan]    = useState<AIPlan | null>(null);
  const [aiMission,     setAiMission]     = useState<AIMission | null>(null);
  const [prefillInput,  setPrefillInput]  = useState<CreateMissionInput | null>(null);

  useEffect(() => { load(); }, []);

  // Kick off plan generation when we arrive with capture context
  useEffect(() => {
    if (!captureContext || !interpretation) return;
    (async () => {
      setPlanScreen('loading_plans');
      const result = await generatePlans(captureContext, interpretation);
      setPlans(result);
      setPlanScreen('choose_plan');
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const [t, m] = await Promise.all([taskService.getTasks(), missionService.getMissions()]);
      setTasks(t); setMissions(m);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  const handlePlanChosen = async (plan: AIPlan) => {
    setChosenPlan(plan);
    setPlanScreen('loading_mission');
    const mission = await suggestMissionFromPlan(captureContext!, plan);
    setAiMission(mission);

    // Link the created task corresponding to the first item in the chosen plan
    const firstItemText = plan.orderedItems[0]?.text?.toLowerCase().trim();
    const matchedTask = tasks.find(t => t.title.toLowerCase().trim() === firstItemText)
      ?? tasks.find(t => firstItemText && (firstItemText.includes(t.title.toLowerCase().trim()) || t.title.toLowerCase().trim().includes(firstItemText)));

    setPrefillInput({
      title:           mission.title,
      task_id:         matchedTask?.id ?? null,
      objective:       mission.objective,
      next_action:     mission.next_action,
      planned_minutes: mission.planned_minutes,
    });
    setPlanScreen('create_mission');
  };

  const handleMissionCreated = (m: Mission) => {
    setMissions(prev => [m, ...prev]);
    setPlanScreen('list');
    setPrefillInput(null);
    setAiMission(null);
    const linked = tasks.find(t => t.id === m.task_id) ?? null;
    if (chosenPlan) navigate('/execute', { state: { mission: m, linkedTask: linked } });
  };

  const handleDeleteMission = async (id: string) => {
    if (!confirm('Delete this mission?')) return;
    try {
      await missionService.deleteMission(id);
      setMissions(prev => prev.filter(x => x.id !== id));
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  const handleExecute = (m: Mission, linkedTask?: Task | null) => {
    navigate('/execute', { state: { mission: m, linkedTask: linkedTask ?? null } });
  };

  const activeMissions = missions.filter(m => ['planned', 'active', 'paused'].includes(m.status));
  const doneMissions   = missions.filter(m => ['completed', 'abandoned'].includes(m.status));

  // Loading spinner (for plans or mission suggestion)
  const loadingMessage = planScreen === 'loading_plans'
    ? { title: 'Building your plans…', sub: 'Analysing tasks, deadlines, and your available time.' }
    : planScreen === 'loading_mission'
    ? { title: 'Crafting your mission…', sub: 'Using your context to suggest a concrete first action.' }
    : null;

  return (
    <div className="max-w-2xl mx-auto">

      {/* Header */}
      <div className="flex items-end justify-between gap-4 mb-8">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] uppercase mb-2"
            style={{ color: 'var(--color-app-mission)' }}>
            Step 2 — Plan
          </p>
          <h1 className="font-display text-3xl" style={{ color: 'var(--color-app-text)' }}>
            Your Next Move
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--color-app-text-muted)' }}>
            {planScreen === 'choose_plan'
              ? 'Odyssey has turned your input into three approaches. Pick the one that fits best.'
              : planScreen === 'create_mission'
              ? 'A Mission is one focused block of work. Review the details and launch it when ready.'
              : 'Each Mission is one focused block of work. Launch one to start executing.'}
          </p>
        </div>
        {planScreen === 'list' && (
          <button
            onClick={() => { setPlanScreen('create_mission'); setPrefillInput(null); setAiMission(null); }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer border-none self-start"
            style={{ backgroundColor: 'var(--color-app-mission)', color: '#fff' }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            New Mission
          </button>
        )}
      </div>

      {/* Loading spinner */}
      {loadingMessage && (
        <div
          className="rounded-xl px-5 py-6 mb-8 flex items-center gap-3"
          style={{ background: 'rgba(8,19,33,0.85)', border: '1px solid rgba(30,60,100,0.45)' }}
        >
          <div className="w-4 h-4 border-2 rounded-full animate-spin flex-shrink-0"
            style={{ borderColor: 'var(--color-app-mission)', borderTopColor: 'transparent' }} />
          <div>
            <p className="text-sm font-medium" style={{ color: 'var(--color-app-text)' }}>
              {loadingMessage.title}
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-app-text-dim)' }}>
              {loadingMessage.sub}
            </p>
          </div>
        </div>
      )}

      {/* Plan chooser */}
      {planScreen === 'choose_plan' && plans && (
        <PlanChooser
          plans={plans}
          onChosen={handlePlanChosen}
          onDismiss={() => setPlanScreen('create_mission')}
        />
      )}

      {/* Mission creation */}
      {planScreen === 'create_mission' && (
        <div className="mb-8">
          <CreateMissionPanel
            tasks={tasks}
            prefillTask={prefillTask}
            prefillInput={prefillInput}
            aiMission={aiMission}
            onCreated={handleMissionCreated}
            onCancel={() => {
              setPlanScreen(plans ? 'choose_plan' : 'list');
              setPrefillInput(null);
              setAiMission(null);
            }}
          />
        </div>
      )}

      {/* Loading / error / list */}
      {loading && planScreen === 'list' ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-8 h-8 border-2 rounded-full animate-spin mb-3"
            style={{ borderColor: 'var(--color-app-mission)', borderTopColor: 'transparent' }} />
          <span className="text-sm" style={{ color: 'var(--color-app-text-muted)' }}>Loading missions…</span>
        </div>
      ) : error ? (
        <div className="rounded-xl p-5 text-center mb-6"
          style={{ backgroundColor: 'rgba(168,59,59,0.08)', border: '1px solid rgba(168,59,59,0.2)' }}>
          <p className="text-sm mb-3" style={{ color: '#E07070' }}>{error}</p>
          <button onClick={load} className="px-4 py-1.5 rounded-lg text-xs font-medium cursor-pointer border-none"
            style={{ backgroundColor: 'rgba(168,59,59,0.2)', color: '#E07070' }}>Retry</button>
        </div>
      ) : planScreen === 'list' && missions.length === 0 ? (
        <div className="rounded-xl p-14 text-center"
          style={{ backgroundColor: 'var(--color-app-surface)', border: '1px solid var(--color-app-border)' }}>
          <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
            style={{ backgroundColor: 'var(--color-app-surface-raised)' }}>
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}
              style={{ color: 'var(--color-app-text-dim)' }}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
            </svg>
          </div>
          <h3 className="font-display text-xl mb-2" style={{ color: 'var(--color-app-text)' }}>No missions yet</h3>
          <p className="text-sm mb-6 max-w-xs mx-auto" style={{ color: 'var(--color-app-text-muted)' }}>
            A Mission is a short, focused block of work. Go back to Capture to let Odyssey suggest one, or create one here.
          </p>
          <button
            onClick={() => { setPlanScreen('create_mission'); setPrefillInput(null); }}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium cursor-pointer border-none"
            style={{ backgroundColor: 'var(--color-app-mission)', color: '#fff' }}>
            Launch First Mission
          </button>
        </div>
      ) : planScreen === 'list' ? (
        <>
          {activeMissions.length > 0 && (
            <div className="space-y-3 mb-8">
              <p className="text-xs font-semibold uppercase tracking-wider mb-3"
                style={{ color: 'var(--color-app-text-dim)' }}>
                Active &amp; Planned
              </p>
              {activeMissions.map(m => (
                <MissionCard key={m.id} mission={m}
                  linkedTask={tasks.find(t => t.id === m.task_id) ?? null}
                  onDelete={handleDeleteMission} onExecute={handleExecute} />
              ))}
            </div>
          )}
          {doneMissions.length > 0 && (
            <details className="group">
              <summary className="text-xs font-semibold uppercase tracking-wider cursor-pointer mb-3 flex items-center gap-2 select-none list-none"
                style={{ color: 'var(--color-app-text-dim)' }}>
                <svg className="w-3.5 h-3.5 transition-transform group-open:rotate-90" fill="none"
                  viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
                Completed &amp; Abandoned ({doneMissions.length})
              </summary>
              <div className="space-y-3 mt-3">
                {doneMissions.map(m => (
                  <MissionCard key={m.id} mission={m}
                    linkedTask={tasks.find(t => t.id === m.task_id) ?? null}
                    onDelete={handleDeleteMission} onExecute={handleExecute} />
                ))}
              </div>
            </details>
          )}
        </>
      ) : null}
    </div>
  );
}
