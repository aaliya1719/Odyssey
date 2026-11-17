import { describe, expect, it } from 'vitest';
import { singleFlight } from './singleFlight';

const tick = () => new Promise(resolve => setTimeout(resolve, 5));

describe('singleFlight', () => {
  it('ignores a second call while the first is still running', async () => {
    let runs = 0;
    const start = singleFlight(async () => { runs += 1; await tick(); return 'ok'; });
    const results = await Promise.all([start(), start(), start()]);
    expect(runs).toBe(1);
    expect(results).toEqual(['ok', undefined, undefined]);
  });

  it('allows a new call once the previous one finished', async () => {
    let runs = 0;
    const start = singleFlight(async () => { runs += 1; await tick(); });
    await start();
    await start();
    expect(runs).toBe(2);
  });

  it('is released when the action throws, and the error still reaches the caller', async () => {
    let runs = 0;
    const start = singleFlight(async () => { runs += 1; await tick(); throw new Error('network'); });
    await expect(start()).rejects.toThrow('network');
    await expect(start()).rejects.toThrow('network');
    expect(runs).toBe(2);
  });

  it('passes arguments through', async () => {
    const run = singleFlight(async (a: number, b: number) => a + b);
    expect(await run(2, 3)).toBe(5);
  });
});
