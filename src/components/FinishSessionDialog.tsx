import { useCallback, useRef } from 'react';
import { useDialogFocus } from '../hooks/useDialogFocus';

interface FinishSessionDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export default function FinishSessionDialog({ open, onClose, onConfirm }: FinishSessionDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => onClose(), [onClose]);
  useDialogFocus(open, dialogRef, close);
  if (!open) return null;

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
        className="w-full max-w-sm rounded-2xl border p-6 shadow-2xl"
        style={{ backgroundColor: 'var(--color-app-bg)', borderColor: 'var(--color-app-border)', color: 'var(--color-app-text)' }}
      >
        <h2 id="finish-session-title" className="font-display text-xl">Finish this mission?</h2>
        <p id="finish-session-description" className="mt-3 text-sm" style={{ color: 'var(--color-app-text-muted)' }}>
          Your focus session will be logged and the mission marked complete. Press Escape to keep working.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={close} className="rounded-lg border px-4 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2" style={{ borderColor: 'var(--color-app-border)' }}>
            Keep working
          </button>
          <button type="button" onClick={onConfirm} className="rounded-lg px-4 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2" style={{ backgroundColor: 'var(--color-app-success)', color: '#050817' }}>
            Finish mission
          </button>
        </div>
      </div>
    </div>
  );
}
