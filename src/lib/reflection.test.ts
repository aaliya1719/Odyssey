import { describe, expect, it } from 'vitest';
import type { Mission } from '../types/database';
import { MAX_REFLECTION_LENGTH, missionDebrief, normalizeReflection } from './reflection';

describe('normalizeReflection', () => {
  it('trims the note', () => {
    expect(normalizeReflection('  learned a lot \n')).toBe('learned a lot');
  });

  it('keeps line breaks inside the note', () => {
    expect(normalizeReflection('went well\nblocked on CORS')).toBe('went well\nblocked on CORS');
  });

  it.each([undefined, null, '', '   ', '\n\t', 7, true, {}, []])('treats %j as no note', value => {
    expect(normalizeReflection(value)).toBeNull();
  });

  it('caps the note at the maximum length without leaving trailing space', () => {
    expect(normalizeReflection('a'.repeat(MAX_REFLECTION_LENGTH))).toHaveLength(MAX_REFLECTION_LENGTH);
    expect(normalizeReflection('a'.repeat(MAX_REFLECTION_LENGTH + 1))).toHaveLength(MAX_REFLECTION_LENGTH);
    const edge = `${'a'.repeat(MAX_REFLECTION_LENGTH - 1)} ${'b'.repeat(10)}`;
    expect(normalizeReflection(edge)).toBe('a'.repeat(MAX_REFLECTION_LENGTH - 1));
  });
});

describe('missionDebrief', () => {
  const base = { reflection: undefined, objective: null, next_action: null } as Pick<Mission, 'reflection' | 'objective' | 'next_action'>;

  it('keeps the note apart from the objective and next action', () => {
    expect(missionDebrief({ reflection: ' Shipped it ', objective: ' Ship v1 ', next_action: 'Write tests' }))
      .toEqual({ reflection: 'Shipped it', objective: 'Ship v1', nextAction: 'Write tests' });
  });

  it('falls back to nulls for an older mission with no note and blank planning text', () => {
    expect(missionDebrief(base)).toEqual({ reflection: null, objective: null, nextAction: null });
    expect(missionDebrief({ reflection: null, objective: '  ', next_action: '' }))
      .toEqual({ reflection: null, objective: null, nextAction: null });
  });

  it('never shows planning text as the reflection', () => {
    expect(missionDebrief({ reflection: null, objective: 'Learn trees', next_action: 'Read ch. 4' }).reflection).toBeNull();
  });
});
