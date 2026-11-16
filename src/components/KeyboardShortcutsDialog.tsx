import { useCallback, useRef } from 'react';
import { useDialogFocus } from '../hooks/useDialogFocus';
import { APP_SHORTCUTS } from '../lib/keyboardShortcuts';

interface KeyboardShortcutsDialogProps {
  open: boolean;
  onClose: () => void;
}

export default function KeyboardShortcutsDialog({ open, onClose }: KeyboardShortcutsDialogProps) {
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
        aria-labelledby="keyboard-shortcuts-title"
        tabIndex={-1}
        className="w-full max-w-md rounded-2xl border p-6 shadow-2xl"
        style={{ backgroundColor: 'var(--color-app-bg)', borderColor: 'var(--color-app-border)', color: 'var(--color-app-text)' }}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[0.65rem] font-mono uppercase tracking-[0.2em]" style={{ color: 'var(--color-app-mission)' }}>Quick reference</p>
            <h2 id="keyboard-shortcuts-title" className="mt-1 font-display text-xl">Keyboard shortcuts</h2>
          </div>
          <button type="button" onClick={close} aria-label="Close keyboard shortcuts" className="rounded-lg px-2 py-1 text-xl focus-visible:outline-2 focus-visible:outline-offset-2" style={{ color: 'var(--color-app-text-muted)' }}>×</button>
        </div>
        <p className="mt-3 text-sm" style={{ color: 'var(--color-app-text-muted)' }}>Shortcuts pause while you type or use a dialog.</p>
        <dl className="mt-5 space-y-3">
          {APP_SHORTCUTS.map(shortcut => (
            <div key={shortcut.key} className="flex items-center justify-between gap-4 text-sm">
              <dt>{shortcut.label}</dt>
              <dd><kbd className="rounded border px-2 py-1 font-mono text-xs" style={{ borderColor: 'var(--color-app-border)' }}>{shortcut.key}</kbd></dd>
            </div>
          ))}
          <div className="flex items-center justify-between gap-4 border-t pt-3 text-sm" style={{ borderColor: 'var(--color-app-border)' }}>
            <dt>Open this guide</dt>
            <dd><kbd className="rounded border px-2 py-1 font-mono text-xs" style={{ borderColor: 'var(--color-app-border)' }}>?</kbd></dd>
          </div>
          <div className="flex items-center justify-between gap-4 text-sm">
            <dt>Pause or resume on Execute</dt>
            <dd><kbd className="rounded border px-2 py-1 font-mono text-xs" style={{ borderColor: 'var(--color-app-border)' }}>Space</kbd></dd>
          </div>
          <div className="flex items-center justify-between gap-4 text-sm">
            <dt>Finish confirmation on Execute</dt>
            <dd><kbd className="rounded border px-2 py-1 font-mono text-xs" style={{ borderColor: 'var(--color-app-border)' }}>Esc</kbd></dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
