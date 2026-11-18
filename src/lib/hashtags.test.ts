import { describe, expect, it } from 'vitest';
import { extractHashtags, normalizeTags } from './hashtags';

describe('extractHashtags', () => {
  it.each([
    ['#work', '', ['work']],
    ['Study #cs101 and #v2', 'Study and', ['cs101', 'v2']],
    ['Use #my_task and #my-task', 'Use and', ['my_task', 'my-task']],
    ['#Work #work #WORK', '', ['work']],
    ['C# is not a tag and #1 and #2 are not either', 'C# is not a tag and #1 and #2 are not either', []],
    ['Plan #work, then review #cs101.', 'Plan, then review.', ['work', 'cs101']],
  ])('extracts tags from %s', (input, cleanText, tags) => {
    expect(extractHashtags(input)).toEqual({ cleanText, tags });
  });

  it('does not extract a hashtag embedded in a word or another hash', () => {
    expect(extractHashtags('abc#work ##tag')).toEqual({
      cleanText: 'abc#work ##tag',
      tags: [],
    });
  });
});

describe('normalizeTags', () => {
  it('normalizes, validates, and deduplicates stored values', () => {
    expect(normalizeTags(['Work', 'work', 'cs101', '#bad', '1', null])).toEqual(['work', 'cs101']);
  });

  it('returns an empty array for missing or malformed values', () => {
    expect(normalizeTags(undefined)).toEqual([]);
    expect(normalizeTags('work')).toEqual([]);
  });
});
