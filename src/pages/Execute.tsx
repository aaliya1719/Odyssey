import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useOutletContext } from 'react-router-dom';
import { missionService } from '../services/missionService';
import { taskService } from '../services/taskService';
import { formatDuration } from '../components/FocusTimer';
import { useMissionTimer } from '../hooks/useMissionTimer';
import { safeMissionDuration } from '../lib/missionDuration';
import { isEditableShortcutTarget, isTypingShortcutTarget, timerShortcutAction, zenModeShortcutAction } from '../lib/keyboardShortcuts';
import { createZenModeController } from '../lib/zenMode';
import FinishSessionDialog from '../components/FinishSessionDialog';
import { normalizeReflection } from '../lib/reflection';
import { DEFAULT_TASK_OUTCOME, resolveLinkedTaskId, taskIdToComplete } from '../lib/taskFocus';
import {
  createSoundscapeController,
  persistSoundscapeVolume,
  readSoundscapeVolume,
  type SoundscapeType,
} from '../lib/soundscape';
import type { TaskOutcome } from '../lib/taskFocus';
import type { Mission, Task } from '../types/database';

// XP values mirror Journey.tsx — single source of truth concept
const XP_PER_MISSION = 250;
const XP_PER_TASK    = 50;

export default function Execute() {
  const location = useLocation();
  const navigate  = useNavigate();
  const { shortcutsOpen } = useOutletContext<{ shortcutsOpen: boolean }>();
  const [finishConfirmationOpen, setFinishConfirmationOpen] = useState(false);
  const [debriefError, setDebriefError] = useState(false);
  const closeFinishConfirmation = useCallback(() => setFinishConfirmationOpen(false), []);

  const initialMission = (location.state as { mission?: Mission; linkedTask?: Task } | null)?.mission ?? null;
  const linkedTask      = (location.state as { mission?: Mission; linkedTask?: Task } | null)?.linkedTask ?? null;

  const [mission, setMission] = useState<Mission | null>(initialMission);
  const [zenMode, setZenMode] = useState(false);
  const zenControllerRef = useRef<ReturnType<typeof createZenModeController> | null>(null);

  useEffect(() => {
    const controller = createZenModeController(document, setZenMode);
    zenControllerRef.current = controller;
    controller.attach();
    return () => {
      zenControllerRef.current = null;
      void controller.cleanup();
    };
  }, []);

  // The task this mission belongs to. It arrives in router state when launched from a task,
  // otherwise (a restored mission, say) it is looked up by the mission's task_id.
  const linkedTaskId = resolveLinkedTaskId(linkedTask?.id, mission?.task_id);
  const [fetchedTask, setFetchedTask] = useState<Task | null>(null);
  const parentTask = linkedTask && linkedTask.id === linkedTaskId
    ? linkedTask
    : fetchedTask && fetchedTask.id === linkedTaskId ? fetchedTask : null;
  const [taskClosed, setTaskClosed] = useState(false);

  useEffect(() => {
    if (!linkedTaskId || linkedTask?.id === linkedTaskId) return;
    let cancelled = false;
    taskService.getTasks()
      .then(tasks => { if (!cancelled) setFetchedTask(tasks.find(t => t.id === linkedTaskId) ?? null); })
      .catch(error => console.warn('Could not load the linked task:', error));
    return () => { cancelled = true; };
  }, [linkedTaskId, linkedTask?.id]);

  useEffect(() => {
    if (initialMission) return;
    (async () => {
      try {
        const missions = await missionService.getMissions();
        const resumable = missions.find(item => item.status === 'active' || item.status === 'paused');
        if (resumable) setMission(resumable);
      } catch (error) {
        console.error('Failed to restore active mission:', error);
      }
    })();
  }, [initialMission]);

  const timer = useMissionTimer(mission, updatedMission => setMission(updatedMission));
  const { elapsed, running, ending } = timer;
  const [soundscape, setSoundscape] = useState<SoundscapeType>('off');
  const [soundscapeVolume, setSoundscapeVolume] = useState(readSoundscapeVolume);
  const soundscapeControllerRef = useRef<ReturnType<typeof createSoundscapeController> | null>(null);

  useEffect(() => {
    const controller = createSoundscapeController();
    soundscapeControllerRef.current = controller;
    return () => {
      controller.destroy();
      if (soundscapeControllerRef.current === controller) soundscapeControllerRef.current = null;
    };
  }, []);

  // Next recommendation state for post-completion flow
  const [nextRecommendation, setNextRecommendation] = useState<{
    type: 'mission' | 'task';
    mission?: Mission;
    task?: Task;
  } | null>(null);
  const [loadedNext, setLoadedNext] = useState(false);

  const plannedSeconds = safeMissionDuration(mission?.planned_minutes) * 60;
  const progress       = Math.min(elapsed / plannedSeconds, 1);
  const remaining      = Math.max(0, plannedSeconds - elapsed);

  // ── Helper to find next move after completion ──────────────────────────────────
  const loadNextMove = async (completedMissionId: string, completedTaskId?: string) => {
    try {
      const [allTasks, allMissions] = await Promise.all([
        taskService.getTasks(),
        missionService.getMissions(),
      ]);

      const otherActiveMissions = allMissions.filter(
        m => m.id !== completedMissionId && (m.status === 'planned' || m.status === 'active' || m.status === 'paused')
      );

      if (otherActiveMissions.length > 0) {
        const nextM = otherActiveMissions.find(m => m.status === 'active' || m.status === 'paused') || otherActiveMissions[0];
        setNextRecommendation({ type: 'mission', mission: nextM });
        setLoadedNext(true);
        return;
      }

      const activeTasks = allTasks.filter(
        t => t.id !== completedTaskId && t.status !== 'completed' && t.status !== 'archived'
      );

      if (activeTasks.length > 0) {
        const priorityOrder: Record<string, number> = { urgent: 4, high: 3, medium: 2, low: 1 };
        const sorted = [...activeTasks].sort((a, b) => {
          const pA = priorityOrder[a.priority] ?? 2;
          const pB = priorityOrder[b.priority] ?? 2;
          if (pB !== pA) return pB - pA;
          if (a.deadline && b.deadline) return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
          if (a.deadline) return -1;
          if (b.deadline) return 1;
          return 0;
        });
        setNextRecommendation({ type: 'task', task: sorted[0] });
        setLoadedNext(true);
        return;
      }

      setNextRecommendation(null);
      setLoadedNext(true);
    } catch (err) {
      console.warn('Failed to load next recommendation:', err);
      setLoadedNext(true);
    }
  };

  // ── Timer actions ──────────────────────────────────────────────────────────────
  const startSoundscape = async () => {
    const controller = soundscapeControllerRef.current;
    if (!controller) return;
    try { await controller.play(soundscape); } catch (error) { console.warn('Soundscape unavailable:', error); }
  };
  const stopSoundscape = () => soundscapeControllerRef.current?.fadeOut();
  const handleStart = async () => {
    try { await timer.start(); await startSoundscape(); } catch (e) { console.error(e); }
  };
  const handlePause = async () => {
    try { await timer.pause(); stopSoundscape(); } catch (e) { console.error(e); }
  };
  const handleResume = async () => {
    try { await timer.resume(); await startSoundscape(); } catch (e) { console.error(e); }
  };

  // Finishing a mission always logs the session. The parent task is only closed when the user
  // picked "Mark task completed", so a task can span several missions.
  // The debrief note is optional. It is saved right after the mission is marked complete,
  // and a failed save never undoes the completion.
  const handleComplete = async (outcome: TaskOutcome = DEFAULT_TASK_OUTCOME, reflection: string | null = null) => {
    if (!mission || ending) return;
    setDebriefError(false);
    try {
      await timer.complete();
      stopSoundscape();
      let m = await missionService.getMission(mission.id);
      const note = normalizeReflection(reflection);
      if (note) {
        try {
          m = await missionService.updateMission(m.id, { reflection: note });
          setMission(m);
        } catch (noteErr) {
          console.warn('Could not save the debrief note:', noteErr);
          setDebriefError(true);
        }
      }
      const taskId = resolveLinkedTaskId(linkedTask?.id, m.task_id);
      const closeId = taskIdToComplete(outcome, taskId);
      let closed = false;
      if (closeId) {
        try {
          await taskService.completeTask(closeId);
          closed = true;
        } catch (taskErr) {
          console.warn('Could not mark linked task completed:', taskErr);
        }
      }
      setTaskClosed(closed);
      // a task that is still open can come up as the next move
      await loadNextMove(m.id, closed ? taskId ?? undefined : undefined);
    } catch (e) { console.error(e); }
  };

  // Finishing opens the debrief dialog so the user can write a reflection note and choose what to do with any linked task.
  const requestFinish = () => {
    setFinishConfirmationOpen(true);
  };

  // ── Derived display helpers ────────────────────────────────────────────────────

  const isCompleted  = mission?.status === 'completed';
  const isPaused     = mission?.status === 'paused';
  const isAbandoned  = mission?.status === 'abandoned';
  const isFinished   = isCompleted || isAbandoned;

  useEffect(() => {
    if (isFinished && zenMode) void zenControllerRef.current?.exit();
  }, [isFinished, zenMode]);

  const toggleZenMode = () => {
    const controller = zenControllerRef.current;
    if (!controller) return;
    if (zenMode) void controller.exit();
    else void controller.enter();
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!mission || isFinished) return;
      const dialogOpen = Boolean(document.querySelector('[role="dialog"][aria-modal="true"]'));
      if (zenMode && event.key === 'Escape' && !dialogOpen) {
        event.preventDefault();
        void zenControllerRef.current?.exit();
        return;
      }

      const action = zenModeShortcutAction(
        event.key,
        event.defaultPrevented || event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || dialogOpen,
        isTypingShortcutTarget(event.target),
        isEditableShortcutTarget(event.target),
      );
      if (action !== 'toggleZen') return;
      event.preventDefault();
      if (zenMode) void zenControllerRef.current?.exit();
      else void zenControllerRef.current?.enter();
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isFinished, mission, zenMode]);

  const runTimerShortcut = useEffectEvent((action: 'pause' | 'resume') => {
    if (action === 'pause') void handlePause();
    else void handleResume();
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!mission || isFinished || ending) return;
      const action = timerShortcutAction(
        event.key,
        event.code,
        running ? 'running' : isPaused ? 'paused' : 'inactive',
        shortcutsOpen || finishConfirmationOpen || event.defaultPrevented || event.repeat
          || event.ctrlKey || event.metaKey || event.altKey
          || Boolean(document.querySelector('[role="dialog"][aria-modal="true"]')),
        isTypingShortcutTarget(event.target),
        isEditableShortcutTarget(event.target),
      );
      if (!action) return;
      event.preventDefault();
      if (action === 'confirmFinish') {
        setFinishConfirmationOpen(true);
      } else {
        runTimerShortcut(action);
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [mission, isFinished, ending, shortcutsOpen, finishConfirmationOpen, running, isPaused]);

  const xpReward = XP_PER_MISSION + (taskClosed ? XP_PER_TASK : 0);

  const handleSoundscapeChange = async (next: SoundscapeType) => {
    setSoundscape(next);
    if (next === 'off' || !running) {
      stopSoundscape();
      return;
    }
    const controller = soundscapeControllerRef.current;
    if (!controller) return;
    try { await controller.play(next); } catch (error) { console.warn('Soundscape unavailable:', error); }
  };

  const handleSoundscapeVolume = (value: number) => {
    const next = persistSoundscapeVolume(value);
    setSoundscapeVolume(next);
    soundscapeControllerRef.current?.setVolume(next);
  };

  // circumference for SVG ring (r=88)
  const RING_R = 88;
  const CIRC   = 2 * Math.PI * RING_R;

  // ── Empty state ────────────────────────────────────────────────────────────────

  if (!mission) {
    return (
      <div className="max-w-md mx-auto mt-24 text-center px-4">
        <div
          className="rounded-2xl p-10 app-focus-surface"
          style={{
            border: '1px solid rgba(49,75,115,0.4)',
          }}
        >
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5"
            style={{ background: 'color-mix(in srgb, var(--color-app-mission) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--color-app-mission) 20%, transparent)' }}
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
            Execute starts from a plan. Capture what you want to do next, or pick a mission you already planned.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              to="/home"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium"
              style={{ backgroundColor: 'var(--color-app-mission)', color: '#fff' }}
            >
              Capture your next move →
            </Link>
            <Link
              to="/mission"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium"
              style={{ color: 'var(--color-app-mission)', border: '1px solid rgba(184,122,85,0.35)' }}
            >
              Select a mission
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`zen-mode-page max-w-2xl mx-auto px-0 sm:px-4${zenMode ? ' is-zen-mode' : ''}`}>

      {/* ── Flow breadcrumb ── */}
      <nav className="zen-breadcrumb flex items-center gap-2 mb-6 text-xs px-4 sm:px-0" style={{ color: 'var(--color-app-text-dim)' }}>
        <Link to="/home" className="hover:underline"
          style={{ color: 'var(--color-app-text-dim)' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-app-text-muted)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-app-text-dim)')}
        >Step 1 — Capture</Link>
        <span aria-hidden="true" style={{ opacity: 0.35 }}>›</span>
        <Link to="/mission" className="hover:underline"
          style={{ color: 'var(--color-app-text-dim)' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-app-text-muted)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-app-text-dim)')}
        >Step 2 — Plan</Link>
        <span aria-hidden="true" style={{ opacity: 0.35 }}>›</span>
        <span style={{ color: 'var(--color-app-mission)' }}>Step 3 — Execute</span>
      </nav>

      {/* ── Mission Control Console ── */}
      <div
        className="rounded-2xl overflow-hidden app-console"
        style={{
          border: running
            ? '1px solid color-mix(in srgb, var(--color-ody-gold) 40%, transparent)'
            : isCompleted
            ? '1px solid color-mix(in srgb, var(--color-app-success) 40%, transparent)'
            : '1px solid rgba(49,75,115,0.5)',
          boxShadow: running
            ? '0 0 0 1px color-mix(in srgb, var(--color-ody-gold) 8%, transparent), 0 16px 60px -12px color-mix(in srgb, var(--color-ody-gold) 20%, transparent)'
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
                backgroundColor: running ? 'var(--color-app-success)' : isCompleted ? 'var(--color-app-success)' : isPaused ? 'var(--color-app-gold)' : 'var(--color-app-mission)',
                boxShadow: running ? '0 0 8px color-mix(in srgb, var(--color-app-success) 80%, transparent)' : isCompleted ? '0 0 8px color-mix(in srgb, var(--color-app-success) 60%, transparent)' : 'none',
                animation: running ? 'pulse 2s infinite' : 'none',
              }}
            />
            <span
              className="text-[0.6rem] font-mono font-bold tracking-[0.2em] uppercase"
              style={{ color: running ? 'var(--color-app-success)' : isCompleted ? 'var(--color-app-success)' : isPaused ? 'var(--color-app-gold)' : 'var(--color-app-mission)' }}
            >
              {running ? 'MISSION IN PROGRESS' : isCompleted ? 'MISSION COMPLETE' : isPaused ? 'SYSTEMS PAUSED' : isAbandoned ? 'MISSION ABORTED' : 'READY FOR LAUNCH'}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span
              className="text-[0.6rem] font-mono"
              style={{ color: 'var(--color-app-text-dim)' }}
            >
              {Math.round(progress * 100)}% elapsed
            </span>
            <button
              type="button"
              onClick={toggleZenMode}
              disabled={isFinished}
              aria-label={zenMode ? 'Exit Zen Mode' : 'Enter Zen Mode'}
              aria-pressed={zenMode}
              title={zenMode ? 'Exit Zen Mode (Esc)' : 'Enter Zen Mode (F)'}
              className="zen-mode-toggle inline-flex items-center justify-center rounded-md p-1.5 transition-colors disabled:cursor-not-allowed disabled:opacity-40"
              style={{ color: 'var(--color-app-text-muted)', backgroundColor: 'transparent' }}
            >
              {zenMode ? (
                <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 4.5H4.5V9M15 19.5h4.5V15M4.5 9l5-5M19.5 15l-5 5" />
                </svg>
              ) : (
                <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 9V4.5H9M19.5 15v4.5H15M4.5 4.5l5 5M19.5 19.5l-5-5" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* ── Mission identity ── */}
        <div className="px-5 pt-5 pb-4">
          {parentTask && (
            <p className="text-[0.65rem] font-mono mb-2" style={{ color: 'var(--color-app-text-dim)' }}>
              ↳ linked task: {parentTask.title}
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
                background: 'color-mix(in srgb, var(--color-app-mission) 7%, transparent)',
                border: '1px solid color-mix(in srgb, var(--color-app-mission) 18%, transparent)',
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
              background: 'linear-gradient(135deg, color-mix(in srgb, var(--color-app-success) 12%, transparent) 0%, color-mix(in srgb, var(--color-app-success) 6%, transparent) 100%)',
              border: '1px solid color-mix(in srgb, var(--color-app-success) 30%, transparent)',
            }}
          >
            <p className="text-base font-semibold mb-0.5" style={{ color: 'var(--color-app-success)' }}>
              ✓ Mission Accomplished
            </p>
            <p className="text-xs" style={{ color: 'var(--color-app-text-muted)' }}>
              +{xpReward} XP earned — your progress has been logged to your Journey.
            </p>
            {parentTask && !taskClosed && (
              <p className="text-xs mt-1" style={{ color: 'var(--color-app-text-dim)' }}>
                “{parentTask.title}” stays open for your next session.
              </p>
            )}
            {mission.reflection && (
              <p className="text-xs mt-2 whitespace-pre-wrap break-words" style={{ color: 'var(--color-app-text)' }}>
                <span style={{ color: 'var(--color-app-text-dim)' }}>Your debrief: </span>{mission.reflection}
              </p>
            )}
            {debriefError && (
              <p className="text-xs mt-2" role="status" style={{ color: 'var(--color-status-urgent)' }}>
                The mission is complete, but your debrief note could not be saved.
              </p>
            )}
          </div>
        )}

        {/* ── Central Timer & Trajectory Indicator ── */}
        {!isFinished && (
          <div className="px-5 pb-5">
            <div
              className="rounded-xl px-5 py-6 flex flex-col items-center gap-5 app-panel-inset"
              style={{
                border: '1px solid rgba(49,75,115,0.3)',
              }}
            >

              {/* Large Countdown Ring */}
              <div className="relative" style={{ width: 200, height: 200 }}>
                <svg width="200" height="200" viewBox="0 0 200 200" className="-rotate-90">
                  <defs>
                    <linearGradient id="mcTimerGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" style={{ stopColor: isCompleted ? 'var(--color-app-success)' : 'var(--color-app-mission)' }} />
                      <stop offset="100%" style={{ stopColor: isCompleted ? 'var(--color-app-success)' : 'var(--color-ody-gold)' }} />
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
                      filter: running ? 'drop-shadow(0 0 8px color-mix(in srgb, var(--color-ody-gold) 60%, transparent))' : 'none',
                    }}
                  />

                  {/* Marker dot at progress tip */}
                  {progress > 0.02 && (
                    <circle
                      cx={100 + RING_R * Math.cos(2 * Math.PI * progress - Math.PI / 2)}
                      cy={100 + RING_R * Math.sin(2 * Math.PI * progress - Math.PI / 2)}
                      r="5"
                      style={{ fill: running ? 'var(--color-ody-gold)' : 'var(--color-app-mission)', filter: running ? 'drop-shadow(0 0 6px color-mix(in srgb, var(--color-ody-gold) 90%, transparent))' : 'none' }}
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
              <div className="zen-secondary-panel w-full">
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
                      background: 'linear-gradient(90deg, var(--color-app-mission) 0%, var(--color-ody-gold) 100%)',
                      boxShadow: running ? '0 0 8px color-mix(in srgb, var(--color-ody-gold) 50%, transparent)' : 'none',
                      transition: 'width 0.8s ease',
                    }}
                  />
                  {/* Moving marker */}
                  {progress > 0 && progress < 1 && (
                    <div
                      className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2"
                      style={{
                        left: `calc(${Math.round(progress * 100)}% - 6px)`,
                        backgroundColor: 'var(--color-ody-gold)',
                        borderColor: '#050817',
                        boxShadow: running ? '0 0 6px color-mix(in srgb, var(--color-ody-gold) 80%, transparent)' : 'none',
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
              <div className="zen-secondary-panel w-full flex items-center justify-between pt-1 border-t"
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
              <div className="zen-secondary-panel w-full rounded-lg px-3.5 py-3" style={{ backgroundColor: 'color-mix(in srgb, var(--color-app-mission) 5%, transparent)', border: '1px solid var(--color-app-border)' }}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <label className="text-xs font-semibold" htmlFor="soundscape-select" style={{ color: 'var(--color-app-text-muted)' }}>
                    Focus soundscape
                  </label>
                  <select
                    id="soundscape-select"
                    value={soundscape}
                    onChange={event => { void handleSoundscapeChange(event.target.value as SoundscapeType); }}
                    className="rounded-md px-2 py-1.5 text-xs border"
                    style={{ color: 'var(--color-app-text)', backgroundColor: 'var(--color-app-surface)', borderColor: 'var(--color-app-border)' }}
                  >
                    <option value="off">Off</option>
                    <option value="brown">Brown Noise</option>
                    <option value="rain">Gentle Rain</option>
                  </select>
                </div>
                <label className="flex items-center gap-3 mt-2 text-xs" htmlFor="soundscape-volume" style={{ color: 'var(--color-app-text-muted)' }}>
                  Volume
                  <input
                    id="soundscape-volume"
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={Math.round(soundscapeVolume * 100)}
                    onChange={event => handleSoundscapeVolume(Number(event.target.value) / 100)}
                    disabled={soundscape === 'off'}
                    className="flex-1 accent-[var(--color-app-mission)]"
                    aria-label="Soundscape volume"
                  />
                  <span className="w-8 text-right font-mono">{Math.round(soundscapeVolume * 100)}%</span>
                </label>
              </div>

              <div className="flex items-center gap-3 w-full">
                {!running && !isPaused ? (
                  <button
                    onClick={handleStart}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold cursor-pointer border-none transition-all active:scale-95"
                    style={{
                      background: 'linear-gradient(135deg, var(--color-app-mission) 0%, var(--color-app-gold) 100%)',
                      color: '#050817',
                      boxShadow: '0 4px 16px color-mix(in srgb, var(--color-app-mission) 35%, transparent)',
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
                        background: 'linear-gradient(135deg, var(--color-app-mission) 0%, var(--color-app-gold) 100%)',
                        color: '#050817',
                      }}
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347c-.75.412-1.667-.13-1.667-.986V5.653z" />
                      </svg>
                      Resume
                    </button>
                    <button
                      onClick={requestFinish}
                      disabled={ending}
                      className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-medium cursor-pointer border-none transition-all disabled:opacity-50"
                      style={{
                        backgroundColor: 'color-mix(in srgb, var(--color-app-success) 15%, transparent)',
                        color: 'var(--color-app-success)',
                        border: '1px solid color-mix(in srgb, var(--color-app-success) 30%, transparent)',
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
                        backgroundColor: 'color-mix(in srgb, var(--color-app-gold) 10%, transparent)',
                        color: 'var(--color-app-gold)',
                        border: '1px solid color-mix(in srgb, var(--color-app-gold) 25%, transparent)',
                      }}
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path fillRule="evenodd" d="M6.75 5.25a.75.75 0 01.75-.75H9a.75.75 0 01.75.75v13.5a.75.75 0 01-.75.75H7.5a.75.75 0 01-.75-.75V5.25zm7.5 0A.75.75 0 0115 4.5h1.5a.75.75 0 01.75.75v13.5a.75.75 0 01-.75.75H15a.75.75 0 01-.75-.75V5.25z" clipRule="evenodd" />
                      </svg>
                      Pause
                    </button>
                    <button
                      onClick={requestFinish}
                      disabled={ending}
                      className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold cursor-pointer border-none transition-all disabled:opacity-50 active:scale-95"
                      style={{
                        backgroundColor: 'color-mix(in srgb, var(--color-app-success) 15%, transparent)',
                        color: 'var(--color-app-success)',
                        border: '1px solid color-mix(in srgb, var(--color-app-success) 30%, transparent)',
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

        {/* ── Post-completion Next Move Recommendation ── */}
        {isCompleted && (
          <div
            className="zen-secondary-panel mx-5 mb-5 rounded-xl p-5 app-spotlight"
            style={{
              border: '1px solid color-mix(in srgb, var(--color-app-mission) 40%, transparent)',
              boxShadow: '0 8px 32px -4px rgba(3,6,13,0.6)',
            }}
          >
            {nextRecommendation ? (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className="text-[0.6rem] font-bold tracking-[0.16em] uppercase px-2 py-0.5 rounded"
                    style={{
                      backgroundColor: 'color-mix(in srgb, var(--color-app-mission) 15%, transparent)',
                      color: 'var(--color-app-mission)',
                      border: '1px solid color-mix(in srgb, var(--color-app-mission) 30%, transparent)',
                    }}
                  >
                    YOUR NEXT MOVE
                  </span>
                  <span className="text-xs" style={{ color: 'var(--color-app-text-dim)' }}>
                    {nextRecommendation.type === 'mission' ? 'Next planned mission' : 'Highest-priority remaining task'}
                  </span>
                </div>

                <h3 className="font-display text-lg font-semibold mb-1" style={{ color: 'var(--color-app-text)' }}>
                  {nextRecommendation.type === 'mission'
                    ? nextRecommendation.mission?.title
                    : nextRecommendation.task?.title}
                </h3>

                {nextRecommendation.type === 'mission' && nextRecommendation.mission?.objective && (
                  <p className="text-xs mb-3 line-clamp-2" style={{ color: 'var(--color-app-text-muted)' }}>
                    {nextRecommendation.mission.objective}
                  </p>
                )}

                {nextRecommendation.type === 'task' && nextRecommendation.task?.description && (
                  <p className="text-xs mb-3 line-clamp-2" style={{ color: 'var(--color-app-text-muted)' }}>
                    {nextRecommendation.task.description}
                  </p>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3 mt-4 pt-3 border-t"
                  style={{ borderColor: 'rgba(49,75,115,0.25)' }}>
                  <div className="flex gap-2">
                    <button
                      onClick={() => navigate('/journey')}
                      className="px-3.5 py-2 rounded-lg text-xs font-medium cursor-pointer border transition-all"
                      style={{ color: 'var(--color-app-text-muted)', backgroundColor: 'transparent', borderColor: 'var(--color-app-border)' }}
                    >
                      View Journey
                    </button>
                    <button
                      onClick={() => navigate('/mission')}
                      className="px-3.5 py-2 rounded-lg text-xs font-medium cursor-pointer border transition-all"
                      style={{ color: 'var(--color-app-text-muted)', backgroundColor: 'transparent', borderColor: 'var(--color-app-border)' }}
                    >
                      All Missions
                    </button>
                  </div>

                  <button
                    onClick={() => {
                      if (nextRecommendation.type === 'mission' && nextRecommendation.mission) {
                        navigate('/execute', { state: { mission: nextRecommendation.mission } });
                        setMission(nextRecommendation.mission);
                        setLoadedNext(false);
                      } else if (nextRecommendation.type === 'task' && nextRecommendation.task) {
                        navigate('/mission', { state: { prefillTask: nextRecommendation.task } });
                      }
                    }}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold cursor-pointer border-none transition-all"
                    style={{
                      background: 'linear-gradient(135deg, var(--color-app-mission) 0%, var(--color-app-gold) 100%)',
                      color: '#050817',
                      boxShadow: '0 4px 14px color-mix(in srgb, var(--color-app-mission) 30%, transparent)',
                    }}
                  >
                    <span>Start Next Mission</span>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </button>
                </div>
              </div>
            ) : loadedNext ? (
              <div className="text-center py-2">
                <p className="text-sm font-medium mb-1" style={{ color: 'var(--color-app-text)' }}>
                  🎉 All caught up! All current tasks and missions completed.
                </p>
                <p className="text-xs mb-4" style={{ color: 'var(--color-app-text-muted)' }}>
                  You've cleared all commitments. View your updated progress on Journey or capture what's next.
                </p>
                <div className="flex justify-center gap-3">
                  <button
                    onClick={() => navigate('/home')}
                    className="px-4 py-2 rounded-lg text-xs font-medium cursor-pointer border transition-all"
                    style={{ color: 'var(--color-app-text-muted)', backgroundColor: 'transparent', borderColor: 'var(--color-app-border)' }}
                  >
                    Capture New Thoughts
                  </button>
                  <button
                    onClick={() => navigate('/journey')}
                    className="px-5 py-2 rounded-lg text-xs font-semibold cursor-pointer border-none transition-all"
                    style={{
                      background: 'linear-gradient(135deg, var(--color-app-mission) 0%, var(--color-app-gold) 100%)',
                      color: '#050817',
                    }}
                  >
                    View My Journey →
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-xs text-center py-2" style={{ color: 'var(--color-app-text-dim)' }}>
                Finding your next move…
              </p>
            )}
          </div>
        )}

        {/* ── Post-abandonment navigation ── */}
        {isAbandoned && (
          <div
            className="mx-5 mb-5 rounded-xl px-5 py-4 flex flex-col sm:flex-row items-center justify-between gap-4"
            style={{
              background: 'color-mix(in srgb, var(--color-app-danger) 6%, transparent)',
              border: '1px solid color-mix(in srgb, var(--color-app-danger) 20%, transparent)',
            }}
          >
            <p className="text-sm" style={{ color: 'var(--color-app-text-muted)' }}>
              Mission aborted. Return to Plan to regroup and choose your next focus.
            </p>
            <button
              onClick={() => navigate('/mission')}
              className="px-4 py-2 rounded-lg text-sm font-medium cursor-pointer border transition-all"
              style={{ color: 'var(--color-app-text-muted)', backgroundColor: 'transparent', borderColor: 'var(--color-app-border)' }}
            >
              Back to Plan
            </button>
          </div>
        )}
      </div>
      <FinishSessionDialog
        open={finishConfirmationOpen}
        onClose={closeFinishConfirmation}
        hasLinkedTask={Boolean(linkedTaskId)}
        linkedTaskTitle={parentTask?.title ?? null}
        onConfirm={(outcome, reflection) => {
          closeFinishConfirmation();
          void handleComplete(outcome, reflection);
        }}
      />
    </div>
  );
}
