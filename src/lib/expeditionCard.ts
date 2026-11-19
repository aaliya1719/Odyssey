import type { ExpeditionProgress } from './progressionEngine';
export const RANK_PATHS = [
  'M8 32 24 6l16 26H8Zm16-14v14m-8 0 8-14 8 14',
  'M7 28c0-11 34-11 34 0S7 39 7 28Zm17-20v24m-7-17 7-7 7 7',
  'M29 7a17 17 0 1 0 12 25A17 17 0 0 1 29 7ZM9 32l8-4 7 5 9-3',
  'M24 5v6m0 26v6M5 24h6m26 0h6M10 10l5 5m18 18 5 5M10 38l5-5m18-18 5-5M24 15a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z',
  'M24 4 29 18 44 24 29 30 24 44 19 30 4 24 19 18 24 4Zm0 11v18M15 24h18',
] as const;
const xml = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]!);
/** Standalone local SVG: no email, record titles, remote images, or embedded script. */
export function expeditionCardSvg(progress: ExpeditionProgress, name: string): string {
  const label = Array.from(name.trim()).filter(char => { const point = char.codePointAt(0)!; return point >= 32 && !(point >= 127 && point < 160); }).slice(0, 24).join('') || 'Explorer';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="600" viewBox="0 0 960 600"><title>Odyssey Expedition Card</title><rect width="960" height="600" rx="24" fill="#10151b"/><path d="M44 480C300 480 560 120 916 120" fill="none" stroke="#344554" stroke-width="2"/><g fill="#dfb566"><circle cx="260" cy="435" r="5"/><circle cx="570" cy="245" r="5"/><circle cx="845" cy="128" r="5"/></g><g font-family="system-ui,sans-serif" fill="#f4f2ec"><text x="56" y="74" font-size="18" letter-spacing="4" fill="#dfb566">ODYSSEY / EXPEDITION CARD</text><text x="56" y="148" font-size="30">${xml(label)}</text><text x="56" y="196" font-size="26">${xml(progress.rank.title)}</text><g transform="translate(812 82) scale(1.5)" stroke="#dfb566" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="${RANK_PATHS[progress.rankIndex]}"/></g><text x="56" y="316" font-size="44">${Math.round(progress.xp).toLocaleString('en-US')} XP</text><text x="56" y="354" font-size="18" fill="#b3bcc6">${progress.completedMissions} missions · ${progress.completedTasks} tasks · ${Math.round(progress.focusMinutes)} focus minutes</text><text x="56" y="448" font-size="24">${progress.streak} active-day streak</text><text x="56" y="490" font-size="24">${Math.round(progress.momentum)}% momentum · ${progress.shields} shield available</text><text x="56" y="554" font-size="15" fill="#b3bcc6">Snapshot in ${xml(progress.timeZone)} · Progress from completed work</text></g></svg>`;
}
