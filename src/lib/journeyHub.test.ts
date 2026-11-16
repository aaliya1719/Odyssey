import { describe, expect, it } from 'vitest';
import { HUB_VIEWS, LEGACY_ODYSSEY_REDIRECT, parseHubView, stepHubView } from './journeyHub';

describe('parseHubView', () => {
  it('defaults to the trail', () => {
    expect(parseHubView('')).toBe('trail');
    expect(parseHubView('?view=nonsense')).toBe('trail');
    expect(parseHubView('?other=passport')).toBe('trail');
  });
  it('reads the passport view', () => {
    expect(parseHubView('?view=passport')).toBe('passport');
    expect(parseHubView('view=passport&x=1')).toBe('passport');
  });
});

describe('stepHubView', () => {
  it('wraps around in both directions', () => {
    expect(stepHubView('trail', 1)).toBe('passport');
    expect(stepHubView('passport', 1)).toBe('trail');
    expect(stepHubView('trail', -1)).toBe('passport');
  });
});

describe('legacy /odyssey redirect', () => {
  it('lands on a view the hub understands', () => {
    const search = LEGACY_ODYSSEY_REDIRECT.slice(LEGACY_ODYSSEY_REDIRECT.indexOf('?'));
    expect(LEGACY_ODYSSEY_REDIRECT.startsWith('/journey')).toBe(true);
    expect(HUB_VIEWS).toContain(parseHubView(search));
    expect(parseHubView(search)).toBe('passport');
  });
});
