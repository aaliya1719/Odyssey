import { describe, expect, it } from 'vitest';
import type { FocusSession, Mission, Task } from '../types/database';
import {
  escapeCsvField,
  focusSessionsCsvFilename,
  formatSessionsCsv,
  formatSessionsMarkdownTable,
} from './telemetryExport';

const task = { id: 't1', title: 'Write, "review" notes' } as Task;
const mission = { id: 'm1', task_id: 't1', title: 'Draft intro' } as Mission;
const orphanMission = { id: 'm2', task_id: null, title: 'Solo mission' } as Mission;

function session(over: Partial<FocusSession>): FocusSession {
  return {
    id: 's', user_id: 'u', mission_id: 'm1', started_at: '2026-03-05T12:00:00.000Z',
    ended_at: null, duration_minutes: 25, completed: true, created_at: '', ...over,
  };
}

describe('escapeCsvField', () => {
  it('leaves plain values alone', () => {
    expect(escapeCsvField('plain')).toBe('plain');
  });
  it('quotes commas, doubles quotes, and keeps newlines inside quotes', () => {
    expect(escapeCsvField('a,b')).toBe('"a,b"');
    expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvField('line1\nline2')).toBe('"line1\nline2"');
    expect(escapeCsvField('a\r\nb')).toBe('"a\r\nb"');
  });
});

describe('formatSessionsCsv', () => {
  it('writes the header and escapes titles', () => {
    const csv = formatSessionsCsv([session({})], [mission], [task]);
    const [header, row] = csv.split('\r\n');
    expect(header).toBe('Date,Task,Mission,Duration (min),Started At,Completed');
    expect(row).toContain('"Write, ""review"" notes",Draft intro,25,2026-03-05T12:00:00.000Z,Yes');
    expect(csv.endsWith('\r\n')).toBe(true);
  });
  it('handles missing mission, task and duration', () => {
    const csv = formatSessionsCsv(
      [session({ mission_id: 'm2', duration_minutes: null, completed: false }), session({ mission_id: null })],
      [orphanMission],
      [],
    );
    const rows = csv.trim().split('\r\n').slice(1);
    expect(rows[0]).toMatch(/^[\d-]+,,Solo mission,,2026-03-05T12:00:00.000Z,No$/);
    expect(rows[1]).toMatch(/^[\d-]+,,,25,/);
  });
  it('sorts oldest first and returns only a header for no sessions', () => {
    const csv = formatSessionsCsv(
      [session({ id: 'b', started_at: '2026-03-06T10:00:00.000Z' }), session({ id: 'a' })],
      [mission],
      [task],
    );
    const rows = csv.trim().split('\r\n').slice(1);
    expect(rows[0]).toContain('2026-03-05T12');
    expect(rows[1]).toContain('2026-03-06T10');
    expect(formatSessionsCsv([], [], [])).toBe('Date,Task,Mission,Duration (min),Started At,Completed\r\n');
  });
});

describe('formatSessionsMarkdownTable', () => {
  it('pads columns evenly and right-aligns duration', () => {
    const md = formatSessionsMarkdownTable(
      [session({ duration_minutes: 5 }), session({ id: 'x', duration_minutes: 120 })],
      [mission],
      [task],
    );
    const lines = md.trimEnd().split('\n');
    expect(lines).toHaveLength(4);
    expect(new Set(lines.map((l) => l.length)).size).toBe(1);
    expect(lines[1]).toMatch(/-+:/);
    expect(lines[1].startsWith('| ---')).toBe(true);
  });
  it('escapes pipes and flattens newlines inside cells', () => {
    const md = formatSessionsMarkdownTable([session({})], [{ ...mission, title: 'a|b\nc' }], [task]);
    expect(md).toContain('a\\|b c');
  });
  it('still renders a header and divider with no sessions', () => {
    expect(formatSessionsMarkdownTable([], [], []).trimEnd().split('\n')).toHaveLength(2);
  });
});

describe('focusSessionsCsvFilename', () => {
  it('uses the local date', () => {
    expect(focusSessionsCsvFilename(new Date(2026, 0, 9, 12, 0))).toBe('odyssey-focus-sessions-2026-01-09.csv');
  });
});
