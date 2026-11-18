export interface ZenModeDocument {
  documentElement: {
    classList: {
      add: (name: string) => void;
      remove: (name: string) => void;
    };
    requestFullscreen?: () => Promise<void>;
  };
  fullscreenElement: unknown;
  exitFullscreen?: () => Promise<void>;
  addEventListener?: (type: 'fullscreenchange', listener: () => void) => void;
  removeEventListener?: (type: 'fullscreenchange', listener: () => void) => void;
}

export interface ZenModeController {
  attach: () => void;
  enter: () => Promise<void>;
  exit: () => Promise<void>;
  cleanup: () => Promise<void>;
}

export function createZenModeController(
  doc: ZenModeDocument,
  onChange: (active: boolean) => void,
): ZenModeController {
  let active = false;
  let requestPending = false;
  let generation = 0;
  let attached = false;

  const syncClass = (nextActive: boolean) => {
    if (nextActive) doc.documentElement.classList.add('zen-mode');
    else doc.documentElement.classList.remove('zen-mode');
  };

  const setActive = (nextActive: boolean) => {
    active = nextActive;
    syncClass(nextActive);
    onChange(nextActive);
  };

  const onFullscreenChange = () => {
    const isNativeFullscreen = doc.fullscreenElement === doc.documentElement;
    if (isNativeFullscreen) {
      requestPending = false;
      setActive(true);
      return;
    }

    if (!requestPending && active) setActive(false);
  };

  const attach = () => {
    if (attached) return;
    attached = true;
    doc.addEventListener?.('fullscreenchange', onFullscreenChange);
  };

  const enter = async () => {
    if (active) return;
    const requestGeneration = ++generation;
    requestPending = true;
    setActive(true);

    const requestFullscreen = doc.documentElement.requestFullscreen;
    if (!requestFullscreen) {
      requestPending = false;
      return;
    }

    try {
      await requestFullscreen.call(doc.documentElement);
      if (requestGeneration !== generation) {
        if (doc.fullscreenElement === doc.documentElement) await doc.exitFullscreen?.();
        return;
      }
      requestPending = false;
    } catch {
      if (requestGeneration === generation) {
        requestPending = false;
      }
    }
  };

  const exit = async () => {
    ++generation;
    requestPending = false;
    const shouldExitNativeFullscreen = doc.fullscreenElement === doc.documentElement;
    setActive(false);
    if (shouldExitNativeFullscreen) await doc.exitFullscreen?.();
  };

  const cleanup = async () => {
    ++generation;
    requestPending = false;
    const shouldExitNativeFullscreen = doc.fullscreenElement === doc.documentElement;
    active = false;
    syncClass(false);
    doc.removeEventListener?.('fullscreenchange', onFullscreenChange);
    attached = false;
    if (shouldExitNativeFullscreen) await doc.exitFullscreen?.();
  };

  return { attach, enter, exit, cleanup };
}
