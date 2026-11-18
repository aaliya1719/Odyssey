import { describe, expect, it, vi } from 'vitest';
import { createZenModeController, type ZenModeDocument } from './zenMode';

function makeDocument(options: { request?: () => Promise<void>; fullscreen?: boolean } = {}) {
  const classes = new Set<string>();
  const listeners = new Set<() => void>();
  const root = {
    classList: {
      add: (name: string) => classes.add(name),
      remove: (name: string) => classes.delete(name),
    },
    requestFullscreen: options.request,
  };
  const doc: ZenModeDocument = {
    documentElement: root,
    fullscreenElement: options.fullscreen ? root : null,
    exitFullscreen: vi.fn(async () => { doc.fullscreenElement = null; listeners.forEach(listener => listener()); }),
    addEventListener: (_type, listener) => listeners.add(listener),
    removeEventListener: (_type, listener) => listeners.delete(listener),
  };
  return { classes, doc, listeners };
}

describe('Zen Mode controller', () => {
  it('keeps the CSS fallback active when native fullscreen is denied', async () => {
    const { classes, doc } = makeDocument({ request: async () => { throw new Error('denied'); } });
    const changes: boolean[] = [];
    const controller = createZenModeController(doc, active => changes.push(active));
    controller.attach();

    await controller.enter();

    expect(classes.has('zen-mode')).toBe(true);
    expect(changes).toEqual([true]);
  });

  it('exits native fullscreen and removes its class', async () => {
    const { classes, doc } = makeDocument({ request: async () => { doc.fullscreenElement = doc.documentElement; } });
    const controller = createZenModeController(doc, vi.fn());
    controller.attach();
    await controller.enter();
    await controller.exit();

    expect(classes.has('zen-mode')).toBe(false);
    expect(doc.exitFullscreen).toHaveBeenCalledOnce();
  });

  it('cleans up listeners, fallback state, and native fullscreen on unmount', async () => {
    const { classes, doc, listeners } = makeDocument({ request: async () => { doc.fullscreenElement = doc.documentElement; } });
    const controller = createZenModeController(doc, vi.fn());
    controller.attach();
    await controller.enter();
    await controller.cleanup();

    expect(classes.has('zen-mode')).toBe(false);
    expect(listeners.size).toBe(0);
    expect(doc.exitFullscreen).toHaveBeenCalledOnce();
  });

  it('does not let a stale fullscreen request re-enter after exit', async () => {
    let resolveRequest!: () => void;
    const request = () => new Promise<void>(resolve => { resolveRequest = resolve; });
    const { classes, doc } = makeDocument({ request });
    const controller = createZenModeController(doc, vi.fn());
    controller.attach();

    const entering = controller.enter();
    await controller.exit();
    doc.fullscreenElement = doc.documentElement;
    resolveRequest();
    await entering;

    expect(classes.has('zen-mode')).toBe(false);
    expect(doc.exitFullscreen).toHaveBeenCalledOnce();
  });
});
