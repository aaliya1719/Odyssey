import { describe, expect, it } from 'vitest';
import {
  breakLength, checkSchedule, clipToWindow, energyAt, findOverlaps, formatTime, generateSchedule,
  moveBlock, parseTime, swapBlocks, type BlockInput, type TimeBlock,
} from './timeBlockEngine';

const WIN = { start: 9 * 60, end: 17 * 60 };
const item = (id: string, minutes: number, energy: BlockInput['energy']): BlockInput =>
  ({ id, title: id, minutes, energy });

describe('time helpers', () => {
  it('parses and formats', () => {
    expect(parseTime('09:30')).toBe(570);
    expect(parseTime('24:00')).toBeNull();
    expect(parseTime('9:75')).toBeNull();
    expect(parseTime('nope')).toBeNull();
    expect(formatTime(570)).toBe('09:30');
    expect(formatTime(0)).toBe('00:00');
  });
});

describe('energyAt', () => {
  it('follows each curve', () => {
    expect(energyAt('morning', 9 * 60)).toBe('high');
    expect(energyAt('morning', 14 * 60)).toBe('low');
    expect(energyAt('balanced', 16 * 60)).toBe('high');
    expect(energyAt('night', 20 * 60)).toBe('high');
    expect(energyAt('night', 8 * 60)).toBe('low');
    expect(energyAt('morning', 3 * 60)).toBe('medium');
  });
});

describe('breakLength', () => {
  it('is 5 for short work and 10 for long', () => {
    expect(breakLength(25)).toBe(5);
    expect(breakLength(30)).toBe(5);
    expect(breakLength(31)).toBe(10);
  });
});

describe('generateSchedule', () => {
  it('puts deep work in the morning peak and quick wins in the slump', () => {
    const { blocks } = generateSchedule(
      [item('quick', 15, 'low'), item('deep', 90, 'high'), item('mid', 45, 'medium')],
      WIN, 'morning',
    );
    const work = blocks.filter(b => b.kind === 'work');
    expect(work[0].id).toBe('deep');
    expect(work[0].start).toBe(9 * 60);
    expect(work.map(b => b.id)).toContain('quick');
  });

  it('is deterministic', () => {
    const items = [item('a', 60, 'high'), item('b', 30, 'low'), item('c', 45, 'medium')];
    expect(generateSchedule(items, WIN, 'balanced')).toEqual(generateSchedule([...items], WIN, 'balanced'));
  });

  it('inserts a recovery pause after each block and never overlaps', () => {
    const s = generateSchedule([item('a', 25, 'high'), item('b', 50, 'medium')], WIN, 'morning');
    expect(s.blocks.filter(b => b.kind === 'break').map(b => b.end - b.start)).toEqual([5, 10]);
    expect(findOverlaps(s.blocks)).toEqual([]);
  });

  it('moves missions that do not fit into overflow and keeps blocks inside the window', () => {
    const s = generateSchedule([item('a', 240, 'high'), item('b', 240, 'high'), item('c', 120, 'low')], WIN, 'morning');
    expect(s.overflow.length).toBeGreaterThan(0);
    for (const b of s.blocks) {
      expect(b.start).toBeGreaterThanOrEqual(WIN.start);
      expect(b.end).toBeLessThanOrEqual(WIN.end);
    }
  });

  it('fits a shorter mission when the preferred one is too long', () => {
    const s = generateSchedule([item('long', 600, 'high'), item('short', 20, 'low')], WIN, 'morning');
    expect(s.blocks.some(b => b.id === 'short')).toBe(true);
    expect(s.overflow.map(o => o.id)).toEqual(['long']);
  });

  it('ignores zero and invalid durations', () => {
    expect(generateSchedule([item('z', 0, 'low'), item('n', NaN, 'low')], WIN, 'balanced').blocks).toEqual([]);
  });

  it('drops the trailing break when it would not fit', () => {
    const s = generateSchedule([item('a', 480, 'high')], WIN, 'morning');
    expect(s.blocks).toHaveLength(1);
    expect(s.blocks[0].end).toBe(WIN.end);
  });
});

describe('clipToWindow', () => {
  it('clips both ends and drops fully outside blocks', () => {
    expect(clipToWindow({ start: 500, end: 600 }, WIN)).toEqual({ start: 540, end: 600 });
    expect(clipToWindow({ start: 1000, end: 1100 }, WIN)).toEqual({ start: 1000, end: 1020 });
    expect(clipToWindow({ start: 0, end: 100 }, WIN)).toBeNull();
    expect(clipToWindow({ start: 1100, end: 1200 }, WIN)).toBeNull();
  });
});

describe('findOverlaps', () => {
  const b = (id: string, start: number, end: number): TimeBlock =>
    ({ id, title: id, start, end, energy: 'low', kind: 'work' });
  it('reports overlaps but not touching blocks', () => {
    expect(findOverlaps([b('a', 0, 60), b('b', 60, 90)])).toEqual([]);
    expect(findOverlaps([b('a', 0, 60), b('b', 59, 90)])).toEqual([['a', 'b']]);
  });
});

describe('moveBlock', () => {
  const blocks: TimeBlock[] = [{ id: 'a', title: 'a', start: 540, end: 600, energy: 'high', kind: 'work' }];
  it('keeps length and clamps to the window', () => {
    expect(moveBlock(blocks, 'a', 600, WIN)[0]).toMatchObject({ start: 600, end: 660 });
    expect(moveBlock(blocks, 'a', 0, WIN)[0]).toMatchObject({ start: 540, end: 600 });
    expect(moveBlock(blocks, 'a', 2000, WIN)[0]).toMatchObject({ start: 960, end: 1020 });
  });
});

describe('swapBlocks', () => {
  const blocks: TimeBlock[] = [
    { id: 'a', title: 'a', start: 540, end: 600, energy: 'high', kind: 'work' },
    { id: 'break-a', title: 'r', start: 600, end: 610, energy: 'low', kind: 'break' },
    { id: 'b', title: 'b', start: 610, end: 640, energy: 'low', kind: 'work' },
  ];
  it('swaps order, keeps lengths and the break between', () => {
    const out = swapBlocks(blocks, 'a', 'b');
    const get = (id: string) => out.find(x => x.id === id)!;
    expect(get('b')).toMatchObject({ start: 540, end: 570 });
    expect(get('a')).toMatchObject({ start: 580, end: 640 });
    expect(findOverlaps(out)).toEqual([]);
  });
  it('is a no-op for unknown or identical ids', () => {
    expect(swapBlocks(blocks, 'a', 'a')).toBe(blocks);
    expect(swapBlocks(blocks, 'a', 'zzz')).toBe(blocks);
  });
});

describe('checkSchedule', () => {
  it('warns on overflow, overlap and blocks outside the window', () => {
    const w = checkSchedule({
      blocks: [
        { id: 'a', title: 'a', start: 530, end: 600, energy: 'high', kind: 'work' },
        { id: 'b', title: 'b', start: 590, end: 620, energy: 'low', kind: 'work' },
      ],
      overflow: [item('c', 30, 'low')],
    }, WIN);
    expect(w.map(x => x.kind).sort()).toEqual(['outside-window', 'overflow', 'overlap']);
  });
  it('is quiet for a clean schedule', () => {
    expect(checkSchedule(generateSchedule([item('a', 30, 'high')], WIN, 'morning'), WIN)).toEqual([]);
  });
});
