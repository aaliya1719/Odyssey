import { describe, expect, it } from 'vitest';
import { globalShortcutAction, timerShortcutAction, zenModeShortcutAction } from './keyboardShortcuts';

describe('keyboard shortcut actions', () => {
  it('maps primary navigation and the help key', () => {
    expect(['1', '2', '3', '4'].map(key => globalShortcutAction(key, false)))
      .toEqual(['/home', '/mission', '/execute', '/journey']);
    expect(globalShortcutAction('?', false)).toBe('help');
    expect(globalShortcutAction('?', true)).toBeNull();
    expect(globalShortcutAction('5', false)).toBeNull();
  });

  it('only controls an active timer outside typing and dialog contexts', () => {
    expect(timerShortcutAction(' ', 'Space', 'running', false, false, false)).toBe('pause');
    expect(timerShortcutAction(' ', 'Space', 'paused', false, false, false)).toBe('resume');
    expect(timerShortcutAction('Escape', 'Escape', 'running', false, false, true)).toBe('confirmFinish');
    expect(timerShortcutAction('Escape', 'Escape', 'inactive', false, false, false)).toBeNull();
    expect(timerShortcutAction(' ', 'Space', 'running', false, true, true)).toBeNull();
    expect(timerShortcutAction(' ', 'Space', 'running', false, false, true)).toBeNull();
    expect(timerShortcutAction('Escape', 'Escape', 'running', true, false, false)).toBeNull();
  });

  it('toggles Zen Mode only for an unmodified F key outside controls', () => {
    expect(zenModeShortcutAction('f', false, false, false)).toBe('toggleZen');
    expect(zenModeShortcutAction('F', false, false, false)).toBe('toggleZen');
    expect(zenModeShortcutAction('f', true, false, false)).toBeNull();
    expect(zenModeShortcutAction('f', false, true, false)).toBeNull();
    expect(zenModeShortcutAction('f', false, false, true)).toBeNull();
    expect(zenModeShortcutAction(' ', false, false, false)).toBeNull();
  });
});
