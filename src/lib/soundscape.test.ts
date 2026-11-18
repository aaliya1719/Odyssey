import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clampSoundscapeVolume,
  createSoundscapeController,
  DEFAULT_SOUNDSCAPE_VOLUME,
  persistSoundscapeVolume,
  readSoundscapeVolume,
  type SoundscapeAudioContext,
} from './soundscape';

function parameter(value = 0) {
  return {
    value,
    cancelScheduledValues: vi.fn(),
    setValueAtTime: vi.fn(function (this: { value: number }, next: number) { this.value = next; }),
    linearRampToValueAtTime: vi.fn(function (this: { value: number }, next: number) { this.value = next; }),
  };
}

function fakeAudio() {
  const nodes: Array<Record<string, unknown>> = [];
  const makeNode = (kind: string) => {
    const node: Record<string, unknown> = {
      kind,
      connections: [],
      connect(destination: unknown) { (node.connections as unknown[]).push(destination); },
      disconnect: vi.fn(),
    };
    nodes.push(node);
    return node;
  };
  const context = {
    currentTime: 0,
    sampleRate: 8000,
    state: 'running',
    destination: {},
    nodes,
    createBuffer: vi.fn((_channels: number, length: number) => ({ getChannelData: () => new Float32Array(length) })),
    createGain: vi.fn(() => {
      const node = makeNode('gain');
      node.gain = parameter();
      return node;
    }),
    createBiquadFilter: vi.fn(() => {
      const node = makeNode('filter');
      node.type = '';
      node.frequency = parameter();
      node.Q = parameter();
      return node;
    }),
    createBufferSource: vi.fn(() => {
      const node = makeNode('source');
      node.buffer = null;
      node.loop = false;
      node.onended = null as ((event: Event) => void) | null;
      node.start = vi.fn();
      node.stop = vi.fn();
      return node;
    }),
    resume: vi.fn(async () => undefined),
    suspend: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
  };
  return context as unknown as SoundscapeAudioContext & { nodes: Array<Record<string, unknown>> };
}

describe('soundscape', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('clamps volume and handles malformed persisted values', () => {
    expect(clampSoundscapeVolume(-1)).toBe(0);
    expect(clampSoundscapeVolume(2)).toBe(1);
    expect(clampSoundscapeVolume(Number.NaN)).toBe(DEFAULT_SOUNDSCAPE_VOLUME);
    const storage = { value: null as string | null, getItem: vi.fn(() => storage.value), setItem: vi.fn((_key: string, value: string) => { storage.value = value; }) };
    expect(readSoundscapeVolume(storage)).toBe(DEFAULT_SOUNDSCAPE_VOLUME);
    expect(persistSoundscapeVolume(2, storage)).toBe(1);
    expect(readSoundscapeVolume(storage)).toBe(1);
  });

  it('does not create an AudioContext while Off', async () => {
    const createContext = vi.fn(() => fakeAudio() as SoundscapeAudioContext);
    const controller = createSoundscapeController({ createContext });
    await controller.play('off');
    expect(createContext).not.toHaveBeenCalled();
  });

  it.each(['brown', 'rain'] as const)('creates a looping %s graph with a fade-in', async type => {
    const audio = fakeAudio();
    const controller = createSoundscapeController({ createContext: () => audio as SoundscapeAudioContext, random: () => 0.5 });
    await controller.play(type);
    expect(audio.createBufferSource).toHaveBeenCalledTimes(1);
    expect(audio.nodes.find(node => node.kind === 'source')?.loop).toBe(true);
    expect(audio.nodes.some(node => node.kind === 'filter')).toBe(type === 'rain');
    const gain = audio.nodes.filter(node => node.kind === 'gain').at(-1)?.gain as ReturnType<typeof parameter>;
    expect(gain.linearRampToValueAtTime).toHaveBeenCalled();
  });

  it('fades out, switches without leaving the old source active, and destroys cleanly', async () => {
    const audio = fakeAudio();
    const controller = createSoundscapeController({ createContext: () => audio as SoundscapeAudioContext });
    await controller.play('brown');
    const first = audio.nodes.find(node => node.kind === 'source');
    await controller.play('rain');
    expect((first?.stop as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
    expect(audio.createBufferSource).toHaveBeenCalledTimes(2);
    (first?.onended as ((event: Event) => void) | null)?.(new Event('ended'));
    controller.fadeOut();
    controller.destroy();
    expect(audio.close).toHaveBeenCalledTimes(1);
    expect(audio.nodes.filter(node => node.kind === 'gain').every(node => (node.disconnect as ReturnType<typeof vi.fn>).mock.calls.length > 0)).toBe(true);
  });

  it('ignores a stale async start after a rapid Off toggle', async () => {
    let resolveResume!: () => void;
    const audio = fakeAudio();
    audio.resume = vi.fn(() => new Promise<void>(resolve => { resolveResume = resolve; }));
    const controller = createSoundscapeController({ createContext: () => audio as SoundscapeAudioContext });
    const starting = controller.play('brown');
    await controller.play('off');
    resolveResume();
    await starting;
    expect(audio.createBufferSource).not.toHaveBeenCalled();
  });
});
