export type SoundscapeType = 'off' | 'brown' | 'rain';

export const SOUNDSCAPE_VOLUME_KEY = 'odyssey-soundscape-volume';
export const DEFAULT_SOUNDSCAPE_VOLUME = 0.35;
export const SOUNDSCAPE_FADE_SECONDS = 0.6;

interface SoundscapeParam {
  value: number;
  setValueAtTime(value: number, time: number): void;
  linearRampToValueAtTime(value: number, time: number): void;
  cancelScheduledValues(time: number): void;
}

interface SoundscapeNode {
  connect(destination: SoundscapeNode | object): void;
  disconnect(): void;
}

interface SoundscapeGainNode extends SoundscapeNode {
  gain: SoundscapeParam;
}

interface SoundscapeFilterNode extends SoundscapeNode {
  type: string;
  frequency: SoundscapeParam;
  Q: SoundscapeParam;
}

interface SoundscapeBuffer {
  getChannelData(channel: number): Float32Array;
}

interface SoundscapeBufferSource extends SoundscapeNode {
  buffer: SoundscapeBuffer | null;
  loop: boolean;
  onended: ((event: Event) => void) | null;
  start(when?: number): void;
  stop(when?: number): void;
}

export interface SoundscapeAudioContext {
  currentTime: number;
  sampleRate: number;
  state?: string;
  destination: object;
  createBuffer(numberOfChannels: number, length: number, sampleRate: number): SoundscapeBuffer;
  createBufferSource(): SoundscapeBufferSource;
  createGain(): SoundscapeGainNode;
  createBiquadFilter(): SoundscapeFilterNode;
  resume?(): Promise<void>;
  suspend?(): Promise<void>;
  close?(): Promise<void>;
}

export interface SoundscapeControllerOptions {
  createContext?: () => SoundscapeAudioContext;
  random?: () => number;
  fadeSeconds?: number;
}

interface ActiveGraph {
  source: SoundscapeBufferSource;
  gain: SoundscapeGainNode;
  nodes: SoundscapeNode[];
}

function browserAudioContext(): SoundscapeAudioContext {
  const audioWindow = window as typeof window & {
    webkitAudioContext?: new () => SoundscapeAudioContext;
  };
  const AudioContextConstructor = audioWindow.AudioContext ?? audioWindow.webkitAudioContext;
  if (!AudioContextConstructor) throw new Error('Web Audio is unavailable');
  return new AudioContextConstructor();
}

export function clampSoundscapeVolume(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_SOUNDSCAPE_VOLUME;
  return Math.min(1, Math.max(0, value));
}

export function readSoundscapeVolume(storage?: Pick<Storage, 'getItem'>): number {
  try {
    const target = storage ?? (typeof localStorage === 'undefined' ? null : localStorage);
    if (!target) return DEFAULT_SOUNDSCAPE_VOLUME;
    const stored = target.getItem(SOUNDSCAPE_VOLUME_KEY);
    if (stored === null) return DEFAULT_SOUNDSCAPE_VOLUME;
    return clampSoundscapeVolume(Number(stored));
  } catch {
    return DEFAULT_SOUNDSCAPE_VOLUME;
  }
}

export function persistSoundscapeVolume(
  value: number,
  storage?: Pick<Storage, 'setItem'>,
): number {
  const volume = clampSoundscapeVolume(value);
  try {
    const target = storage ?? (typeof localStorage === 'undefined' ? null : localStorage);
    target?.setItem(SOUNDSCAPE_VOLUME_KEY, String(volume));
  } catch {
    // Storage can be unavailable in private or restricted browsing contexts.
  }
  return volume;
}

function createBrownNoiseBuffer(context: SoundscapeAudioContext, random: () => number): SoundscapeBuffer {
  const length = Math.max(1, Math.floor(context.sampleRate * 2));
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let index = 0; index < data.length; index += 1) {
    const white = random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    data[index] = Math.max(-1, Math.min(1, last * 3.5));
  }
  return buffer;
}

function createPinkNoiseBuffer(
  context: SoundscapeAudioContext,
  random: () => number,
  rain: boolean,
): SoundscapeBuffer {
  const length = Math.max(1, Math.floor(context.sampleRate * 2));
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let b4 = 0;
  let b5 = 0;
  let b6 = 0;
  let droplet = 0;

  for (let index = 0; index < data.length; index += 1) {
    const white = random() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.96900 * b2 + white * 0.1538520;
    b3 = 0.86650 * b3 + white * 0.3104856;
    b4 = 0.55000 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.0168980;
    const pink = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
    b6 = white * 0.115926;

    if (rain && random() < 0.00008) droplet = 1;
    droplet *= 0.996;
    data[index] = Math.max(-1, Math.min(1, pink * (rain ? 0.72 + droplet * 2.2 : 1)));
  }
  return buffer;
}

export function createSoundscapeController(options: SoundscapeControllerOptions = {}) {
  const createContext = options.createContext ?? browserAudioContext;
  const random = options.random ?? Math.random;
  const fadeSeconds = options.fadeSeconds ?? SOUNDSCAPE_FADE_SECONDS;
  let context: SoundscapeAudioContext | null = null;
  let master: SoundscapeGainNode | null = null;
  let active: ActiveGraph | null = null;
  let volume = DEFAULT_SOUNDSCAPE_VOLUME;
  let generation = 0;
  let destroyed = false;

  const ensureContext = () => {
    if (destroyed) throw new Error('Soundscape has been destroyed');
    if (context) return context;
    context = createContext();
    master = context.createGain();
    master.gain.value = 1;
    master.connect(context.destination);
    return context;
  };

  const scheduleGain = (gain: SoundscapeParam, target: number, seconds: number) => {
    const now = context?.currentTime ?? 0;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(gain.value, now);
    gain.linearRampToValueAtTime(target, now + seconds);
  };

  const disconnectGraph = (graph: ActiveGraph) => {
    graph.source.onended = null;
    for (const node of graph.nodes) {
      try { node.disconnect(); } catch { /* already disconnected */ }
    }
  };

  const stopActive = (fade: boolean) => {
    const graph = active;
    if (!graph || !context) return;
    const stopAt = context.currentTime + (fade ? fadeSeconds : 0);
    if (fade) scheduleGain(graph.gain.gain, 0, fadeSeconds);
    try { graph.source.stop(stopAt); } catch { /* source was already stopped */ }
    if (!fade) disconnectGraph(graph);
    if (!fade) void context.suspend?.();
  };

  const play = async (type: SoundscapeType): Promise<void> => {
    generation += 1;
    const request = generation;
    if (type === 'off') {
      stopActive(true);
      return;
    }

    stopActive(true);
    const currentContext = ensureContext();
    await currentContext.resume?.();
    if (destroyed || request !== generation || !master) return;

    const source = currentContext.createBufferSource();
    const graphGain = currentContext.createGain();
    const buffer = type === 'brown'
      ? createBrownNoiseBuffer(currentContext, random)
      : createPinkNoiseBuffer(currentContext, random, true);
    source.buffer = buffer;
    source.loop = true;
    graphGain.gain.value = 0;

    graphGain.connect(master);
    const graphNodes: SoundscapeNode[] = [source, graphGain];
    if (type === 'rain') {
      const filter = currentContext.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1800;
      filter.Q.value = 0.8;
      source.disconnect();
      source.connect(filter);
      filter.connect(graphGain);
      graphNodes.push(filter);
    } else {
      source.connect(graphGain);
    }
    active = { source, gain: graphGain, nodes: graphNodes };
    source.onended = () => {
      if (active?.source === source) active = null;
      disconnectGraph({ source, gain: graphGain, nodes: graphNodes });
      if (!active) void currentContext.suspend?.();
    };
    source.start();
    scheduleGain(graphGain.gain, volume, fadeSeconds);
  };

  const setVolume = (nextVolume: number) => {
    volume = clampSoundscapeVolume(nextVolume);
    if (active) active.gain.gain.value = volume;
    return volume;
  };

  const fadeOut = () => {
    generation += 1;
    stopActive(true);
  };

  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    generation += 1;
    stopActive(false);
    master?.disconnect();
    void context?.close?.();
    active = null;
    master = null;
    context = null;
  };

  return { play, setVolume, fadeOut, destroy };
}
