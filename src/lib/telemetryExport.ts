import type { FocusSession, Mission, Task } from '../types/database';

export const CSV_HEADERS = ['Date', 'Task', 'Mission', 'Duration (min)', 'Started At', 'Completed'] as const;

/** RFC 4180: wrap in quotes when the value has a comma, quote, CR or LF; double inner quotes. */
export function escapeCsvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Local calendar date (YYYY-MM-DD) of an ISO timestamp, or '' if it can't be parsed. */
function localDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

type Row = [date: string, task: string, mission: string, duration: string, startedAt: string, completed: string];

function buildRows(sessions: FocusSession[], missions: Mission[], tasks: Task[]): Row[] {
  const missionById = new Map(missions.map((m) => [m.id, m]));
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  return [...sessions]
    .sort((a, b) => a.started_at.localeCompare(b.started_at))
    .map((s) => {
      const mission = s.mission_id ? missionById.get(s.mission_id) : undefined;
      const task = mission?.task_id ? taskById.get(mission.task_id) : undefined;
      return [
        localDate(s.started_at),
        task?.title ?? '',
        mission?.title ?? '',
        s.duration_minutes == null ? '' : String(s.duration_minutes),
        s.started_at,
        s.completed ? 'Yes' : 'No',
      ];
    });
}

/** One CSV line per focus session, oldest first. Uses CRLF line endings per RFC 4180. */
export function formatSessionsCsv(sessions: FocusSession[], missions: Mission[], tasks: Task[]): string {
  const lines = [CSV_HEADERS.join(',')];
  for (const row of buildRows(sessions, missions, tasks)) {
    lines.push(row.map(escapeCsvField).join(','));
  }
  return lines.join('\r\n') + '\r\n';
}

function escapeMarkdownCell(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

/** GitHub-flavoured Markdown table with padded columns; duration is right-aligned. */
export function formatSessionsMarkdownTable(sessions: FocusSession[], missions: Mission[], tasks: Task[]): string {
  const body = buildRows(sessions, missions, tasks).map((row) => row.map(escapeMarkdownCell));
  const head = [...CSV_HEADERS] as string[];
  const rightAligned = new Set([3]);
  const widths = head.map((h, i) => Math.max(3, h.length, ...body.map((row) => row[i].length)));
  const pad = (text: string, i: number) =>
    rightAligned.has(i) ? text.padStart(widths[i]) : text.padEnd(widths[i]);
  const line = (cells: string[]) => `| ${cells.map(pad).join(' | ')} |`;
  const divider = `| ${widths
    .map((w, i) => (rightAligned.has(i) ? `${'-'.repeat(w - 1)}:` : '-'.repeat(w)))
    .join(' | ')} |`;
  return [line(head), divider, ...body.map(line)].join('\n') + '\n';
}

export function focusSessionsCsvFilename(now: Date = new Date()): string {
  return `odyssey-focus-sessions-${localDate(now.toISOString())}.csv`;
}
