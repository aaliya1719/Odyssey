import { useCallback, useRef, useState } from 'react';
import { useDialogFocus } from '../hooks/useDialogFocus';
import { DEFAULT_TASK_OUTCOME, TASK_OUTCOME_OPTIONS } from '../lib/taskFocus';
import { MAX_REFLECTION_LENGTH, normalizeReflection } from '../lib/reflection';
import type { TaskOutcome } from '../lib/taskFocus';

interface FinishSessionDialogProps {
  open: boolean;
  onClose: () => void;
  /** Called with the task outcome (if linked) and the debrief note (or null if skipped/empty). */
  onConfirm: (outcome: TaskOutcome, reflection: string | null) => void;
  /** Whether the mission belongs to a task. Only then is the task choice shown. */
  hasLinkedTask?: boolean;
  /** Title of the linked task, when known. */
  linkedTaskTitle?: string | null;
}

export default function FinishSessionDialog(props: FinishSessionDialogProps) {
  // Mounted only while open, so the choice and debrief start fresh every time.
  return props.open ? <FinishSessionDialogBody {...props} /> : null;
}

function FinishSessionDialogBody({ onClose, onConfirm, hasLinkedTask = false, linkedTaskTitle = null }: FinishSessionDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [outcome, setOutcome] = useState<TaskOutcome>(DEFAULT_TASK_OUTCOME);
  const [note, setNote] = useState('');
  const close = useCallback(() => onClose(), [onClose]);
  useDialogFocus(true, dialogRef, close);

  const finishWith = (reflection: string | null) => {
    onConfirm(hasLinkedTask ? outcome : DEFAULT_TASK_OUTCOME, reflection);
  };

  const finish = () => finishWith(normalizeReflection(note));
  const skip = () => finishWith(null);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4" onMouseDown={event => {
      if (event.target === event.currentTarget) close();
    }}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="finish-session-title"
        aria-describedby="finish-session-description"
        tabIndex={-1}
        className="w-full max-w-md rounded-2xl border p-6 shadow-2xl"
        style={{ backgroundColor: 'var(--color-app-bg)', borderColor: 'var(--color-app-border)', color: 'var(--color-app-text)' }}
      >
        <h2 id="finish-session-title" className="font-display text-xl">Finish this mission?</h2>
        <p id="finish-session-description" className="mt-3 text-sm" style={{ color: 'var(--color-app-text-muted)' }}>
          Your focus session will be logged and the mission marked complete. Press Escape to keep working.
        </p>

        {hasLinkedTask && (
          <fieldset className="mt-4 flex flex-col gap-2 border-0 p-0 m-0">
            <legend className="mb-2 p-0 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-app-text-dim)' }}>
              {linkedTaskTitle ? `Task: ${linkedTaskTitle}` : 'Linked task'}
            </legend>
            {TASK_OUTCOME_OPTIONS.map(option => (
              <label
                key={option.value}
                className="flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2"
                style={{
                  borderColor: outcome === option.value ? 'var(--color-app-mission)' : 'var(--color-app-border)',
                  backgroundColor: outcome === option.value ? 'var(--color-app-mission-glow)' : 'transparent',
                }}
              >
                <input
                  type="radio"
                  name="finish-task-outcome"
                  value={option.value}
                  checked={outcome === option.value}
                  onChange={() => setOutcome(option.value)}
                  className="mt-0.5"
                />
                <span className="flex flex-col">
                  <span className="font-medium">{option.label}</span>
                  <span className="text-xs" style={{ color: 'var(--color-app-text-muted)' }}>{option.hint}</span>
                </span>
              </label>
            ))}
          </fieldset>
        )}

        <div className="mt-4">
          <label htmlFor="finish-debrief" className="flex items-baseline justify-between text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-app-text-dim)' }}>
            <span>Debrief <span className="font-normal normal-case tracking-normal">(optional)</span></span>
            <span className="font-mono font-normal normal-case tracking-normal" aria-hidden="true">{note.length}/{MAX_REFLECTION_LENGTH}</span>
          </label>
          <textarea
            id="finish-debrief"
            value={note}
            onChange={event => setNote(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                finish();
              }
            }}
            maxLength={MAX_REFLECTION_LENGTH}
            rows={3}
            placeholder="What did you learn, or what got in the way?"
            className="mt-1.5 w-full resize-y rounded-lg border bg-transparent px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ borderColor: 'var(--color-app-border)', color: 'var(--color-app-text)' }}
          />
        </div>

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={close} className="rounded-lg border px-4 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2" style={{ borderColor: 'var(--color-app-border)' }}>
            Keep working
          </button>
          <button type="button" onClick={skip} className="rounded-lg border px-4 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2" style={{ borderColor: 'var(--color-app-border)' }}>
            Skip debrief
          </button>
          <button type="button" onClick={finish} className="rounded-lg px-4 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2" style={{ backgroundColor: 'var(--color-app-success)', color: '#050817' }}>
            Finish mission
          </button>
        </div>
      </div>
    </div>
  );
}
