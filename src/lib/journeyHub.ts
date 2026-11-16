/** View switching for the unified Journey hub (trail + passport). Pure so it can be tested. */

export const HUB_VIEWS = ['trail', 'passport'] as const;
export type HubView = (typeof HUB_VIEWS)[number];

export const HUB_LABELS: Record<HubView, string> = {
  trail: 'Expedition Trail',
  passport: 'Passport & Achievements',
};

/** Where the retired /odyssey route sends people, so old bookmarks keep working. */
export const LEGACY_ODYSSEY_REDIRECT = '/journey?view=passport';

/** Read the active view from a query string. Anything unknown falls back to the trail. */
export function parseHubView(search: string): HubView {
  const value = new URLSearchParams(search).get('view');
  return (HUB_VIEWS as readonly string[]).includes(value ?? '') ? (value as HubView) : 'trail';
}

/** The next or previous view for arrow-key navigation on the tab list, wrapping at the ends. */
export function stepHubView(current: HubView, direction: 1 | -1): HubView {
  const i = HUB_VIEWS.indexOf(current);
  return HUB_VIEWS[(i + direction + HUB_VIEWS.length) % HUB_VIEWS.length];
}
