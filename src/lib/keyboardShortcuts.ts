export const APP_SHORTCUTS = [
  { key: '1', label: 'Capture', path: '/home' },
  { key: '2', label: 'Plan', path: '/mission' },
  { key: '3', label: 'Execute', path: '/execute' },
  { key: '4', label: 'Journey', path: '/journey' },
] as const;

export function globalShortcutAction(
  key: string,
  blocked: boolean,
): 'help' | (typeof APP_SHORTCUTS)[number]['path'] | null {
  if (blocked) return null;
  if (key === '?') return 'help';
  return APP_SHORTCUTS.find(shortcut => shortcut.key === key)?.path ?? null;
}

export function isTypingShortcutTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest(
    'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]',
  ));
}

export function isEditableShortcutTarget(target: EventTarget | null): boolean {
  return isTypingShortcutTarget(target) || (target instanceof Element && Boolean(target.closest('button, a, [role="button"]')));
}

export function timerShortcutAction(
  key: string,
  code: string,
  state: 'running' | 'paused' | 'inactive',
  blocked: boolean,
  typing: boolean,
  interactive: boolean,
): 'pause' | 'resume' | 'confirmFinish' | null {
  if (blocked || state === 'inactive' || typing) return null;
  if (key === 'Escape') return 'confirmFinish';
  if ((code === 'Space' || key === ' ') && !interactive) {
    return state === 'running' ? 'pause' : 'resume';
  }
  return null;
}
