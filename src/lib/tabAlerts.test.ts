import { describe, expect, it, vi } from 'vitest';
import {
  canAskForPermission,
  canNotify,
  formatClock,
  formatTabTitle,
  notifyTimeUp,
  requestNotificationPermission,
  shouldNotifyTimeUp,
  timeUpNotificationContent,
  type NotificationLike,
} from './tabAlerts';

function fakeApi(permission: NotificationPermission, onCreate = vi.fn()) {
  class FakeNotification {
    static permission = permission;
    static requestPermission = vi.fn(async () => 'granted' as NotificationPermission);
    constructor(title: string, options?: NotificationOptions) { onCreate(title, options); }
  }
  return { api: FakeNotification as unknown as NotificationLike, onCreate };
}

describe('formatClock', () => {
  it('formats minutes and hours', () => {
    expect(formatClock(865)).toBe('14:25');
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(3725)).toBe('1:02:05');
  });
  it('clamps negatives, floors fractions, survives NaN', () => {
    expect(formatClock(-5)).toBe('00:00');
    expect(formatClock(59.9)).toBe('00:59');
    expect(formatClock(Number.NaN)).toBe('00:00');
  });
});

describe('formatTabTitle', () => {
  it('shows the countdown while running', () => {
    expect(formatTabTitle(865, 'Deep Work', true)).toBe('(14:25) Deep Work - Odyssey');
  });
  it('falls back to the plain title when stopped or untitled', () => {
    expect(formatTabTitle(865, 'Deep Work', false)).toBe('Odyssey');
    expect(formatTabTitle(865, '   ', true)).toBe('(14:25) Odyssey');
  });
});

describe('permission guards', () => {
  it('handles a missing API', () => {
    expect(canNotify(null)).toBe(false);
    expect(canAskForPermission(null)).toBe(false);
    expect(shouldNotifyTimeUp({ documentHidden: true, api: null })).toBe(false);
  });
  it('only notifies when granted', () => {
    expect(canNotify(fakeApi('granted').api)).toBe(true);
    expect(canNotify(fakeApi('denied').api)).toBe(false);
    expect(canNotify(fakeApi('default').api)).toBe(false);
  });
  it('only asks while undecided', () => {
    expect(canAskForPermission(fakeApi('default').api)).toBe(true);
    expect(canAskForPermission(fakeApi('denied').api)).toBe(false);
    expect(canAskForPermission(fakeApi('granted').api)).toBe(false);
  });
});

describe('hidden state detection', () => {
  it('stays quiet while the tab is visible', () => {
    const { api, onCreate } = fakeApi('granted');
    expect(notifyTimeUp('Deep Work', { documentHidden: false, api })).toBe(false);
    expect(onCreate).not.toHaveBeenCalled();
  });
  it('notifies with the agreed wording when hidden', () => {
    const { api, onCreate } = fakeApi('granted');
    expect(notifyTimeUp('Deep Work', { documentHidden: true, api })).toBe(true);
    expect(onCreate).toHaveBeenCalledWith('Mission Accomplished!', {
      body: "Your focus interval on 'Deep Work' is complete. Time to debrief or rest.",
    });
  });
  it('does not notify when permission was denied', () => {
    const { api, onCreate } = fakeApi('denied');
    expect(notifyTimeUp('x', { documentHidden: true, api })).toBe(false);
    expect(onCreate).not.toHaveBeenCalled();
  });
  it('swallows errors thrown by the constructor', () => {
    const { api } = fakeApi('granted', vi.fn(() => { throw new Error('illegal constructor'); }));
    expect(notifyTimeUp('x', { documentHidden: true, api })).toBe(false);
  });
});

describe('timeUpNotificationContent', () => {
  it('uses a generic name when the title is empty', () => {
    expect(timeUpNotificationContent('').body).toContain("'your mission'");
  });
});

describe('requestNotificationPermission', () => {
  it('returns null when unsupported', async () => {
    expect(await requestNotificationPermission(null)).toBeNull();
  });
  it('does not re-prompt once decided', async () => {
    const { api } = fakeApi('denied');
    expect(await requestNotificationPermission(api)).toBe('denied');
    expect(api.requestPermission).not.toHaveBeenCalled();
  });
  it('asks when undecided', async () => {
    const { api } = fakeApi('default');
    expect(await requestNotificationPermission(api)).toBe('granted');
  });
});
