import { describe, expect, it } from 'vitest';
import schemaSql from '../../supabase/schema.sql?raw';

// supabase/schema.sql is the file the README tells people to run on a new project,
// so it has to be complete and safe to run twice. These are text checks only; they
// do not execute the SQL.
describe('supabase/schema.sql', () => {
  it('defines the transition_mission_timer function that Pause/Complete call, and grants it', () => {
    expect(schemaSql).toMatch(/CREATE OR REPLACE FUNCTION public\.transition_mission_timer\(/);
    expect(schemaSql).toMatch(/GRANT EXECUTE ON FUNCTION public\.transition_mission_timer\(UUID, UUID, TEXT\) TO authenticated;/);
    expect(schemaSql).toMatch(/REVOKE ALL ON FUNCTION public\.transition_mission_timer\(UUID, UUID, TEXT\) FROM PUBLIC;/);
  });

  it('drops each policy before creating it so the script can be re-run', () => {
    const created = [...schemaSql.matchAll(/CREATE POLICY "([^"]+)"\s+ON (public\.\w+)/g)];
    expect(created.length).toBeGreaterThan(0);
    for (const [, name, table] of created) {
      expect(schemaSql, `${name} on ${table}`).toContain(`DROP POLICY IF EXISTS "${name}" ON ${table};`);
    }
  });

  it('does not use a bare CREATE TABLE or CREATE INDEX that would fail on a second run', () => {
    expect(schemaSql).not.toMatch(/CREATE TABLE (?!IF NOT EXISTS)/);
    expect(schemaSql).not.toMatch(/CREATE (UNIQUE )?INDEX (?!IF NOT EXISTS)/);
  });
});
