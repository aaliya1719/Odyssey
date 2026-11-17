import { supabase } from '../lib/supabase';
import { localStore } from '../lib/localStore';
import { taskService } from './taskService';
import { missionService } from './missionService';
import { focusService } from './focusService';
import { validateOdysseyBackup } from './schemaValidation';
import type { Task, Mission, FocusSession } from '../types/database';
import type {
  OdysseyExportData,
  OdysseyExportPackage,
  ValidationResult,
  RestoreStrategy,
  RestoreResult,
} from '../types/portability';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

async function getAuthUser() {
  const { data } = await supabase.auth.getUser();
  return data?.user ?? null;
}

/** Ids that already belong to the importing user, per table (lowercase). */
export interface OwnedIds {
  tasks: ReadonlySet<string>;
  missions: ReadonlySet<string>;
  sessions: ReadonlySet<string>;
}

export interface PrepareOptions {
  strategy: RestoreStrategy;
  /** Merge only: ids the target user already owns, those are kept so the upsert updates them. */
  ownedIds?: OwnedIds;
}

/**
 * Picks the id a row gets in the target account.
 * - replace: always a fresh id (everything is deleted first, and the file's id may
 *   still exist under the account that made the backup, which would hit tasks_pkey).
 * - merge: the file's id only if the target user already owns it (upsert then
 *   updates their own row). Anything else gets a fresh id, because a row we can't
 *   see under RLS may belong to someone else and the upsert would be rejected.
 * A repeated id inside the file is only used once, later copies get a fresh id so
 * a single upsert never touches the same row twice.
 */
function createIdAllocator(opts: PrepareOptions, owned: ReadonlySet<string> | undefined) {
  const used = new Set<string>();
  const idMap = new Map<string, string>();

  return {
    idMap,
    allocate(oldId: string): string {
      const key = typeof oldId === 'string' ? oldId.toLowerCase() : '';
      const reusable =
        opts.strategy === 'merge' &&
        UUID_REGEX.test(oldId) &&
        !!owned?.has(key) &&
        !used.has(key);
      const newId = reusable ? oldId : generateUUID();
      used.add(newId.toLowerCase());
      // Foreign keys point at the first row that carried this id.
      if (!idMap.has(key)) idMap.set(key, newId);
      return newId;
    },
  };
}

function remapRef(ref: string | null, idMap: ReadonlyMap<string, string>): string | null {
  if (!ref || typeof ref !== 'string') return null;
  return idMap.get(ref.toLowerCase()) ?? null;
}

/**
 * Normalizes IDs, foreign keys, and ownership to current user context.
 * Exported for tests.
 */
export function prepareDataForImport(
  raw: OdysseyExportData,
  targetUserId: string,
  opts: PrepareOptions = { strategy: 'replace' },
): OdysseyExportData {
  const taskIds = createIdAllocator(opts, opts.ownedIds?.tasks);
  const missionIds = createIdAllocator(opts, opts.ownedIds?.missions);
  const sessionIds = createIdAllocator(opts, opts.ownedIds?.sessions);

  // 1. Tasks
  const tasks: Task[] = raw.tasks.map((t) => ({
    ...t,
    id: taskIds.allocate(t.id),
    user_id: targetUserId,
  }));

  // 2. Missions (task_id follows the task id map, or becomes null if the task isn't in the file)
  const missions: Mission[] = raw.missions.map((m) => ({
    ...m,
    id: missionIds.allocate(m.id),
    user_id: targetUserId,
    task_id: remapRef(m.task_id, taskIds.idMap),
  }));

  // 3. Sessions (mission_id follows the mission id map)
  const sessions: FocusSession[] = raw.sessions.map((s) => ({
    ...s,
    id: sessionIds.allocate(s.id),
    user_id: targetUserId,
    mission_id: remapRef(s.mission_id, missionIds.idMap),
  }));

  return { tasks, missions, sessions };
}

const OWNED_ID_CHUNK = 100;

/**
 * Which of the given ids already belong to the signed-in user. RLS hides other
 * users' rows, so a plain select on the ids only returns the user's own.
 */
async function fetchOwnedIds(
  table: 'tasks' | 'missions' | 'focus_sessions',
  ids: string[],
): Promise<Set<string>> {
  const owned = new Set<string>();
  const unique = Array.from(new Set(ids.filter((id) => UUID_REGEX.test(id)).map((id) => id.toLowerCase())));
  for (let i = 0; i < unique.length; i += OWNED_ID_CHUNK) {
    const chunk = unique.slice(i, i + OWNED_ID_CHUNK);
    const { data, error } = await supabase.from(table).select('id').in('id', chunk);
    if (error) throw error;
    for (const row of (data as { id: string }[] | null) ?? []) owned.add(row.id.toLowerCase());
  }
  return owned;
}

export const portabilityService = {
  /**
   * Exports full user task, mission, and session history as a structured package.
   */
  async exportUserData(): Promise<OdysseyExportPackage> {
    const [tasks, missions, sessions] = await Promise.all([
      taskService.getTasks(),
      missionService.getMissions(),
      focusService.getAllSessions(),
    ]);

    const pkg: OdysseyExportPackage = {
      version: 1,
      app: 'odyssey',
      exported_at: new Date().toISOString(),
      summary: {
        task_count: tasks.length,
        mission_count: missions.length,
        session_count: sessions.length,
      },
      data: {
        tasks,
        missions,
        sessions,
      },
    };

    return pkg;
  },

  /**
   * Generates a JSON file download in the browser.
   */
  async downloadBackupFile(customPackage?: OdysseyExportPackage): Promise<{ filename: string; package: OdysseyExportPackage }> {
    const pkg = customPackage ?? (await portabilityService.exportUserData());
    const jsonStr = JSON.stringify(pkg, null, 2);

    const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `odyssey-backup-${dateStr}.json`;

    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }

    return { filename, package: pkg };
  },

  /**
   * Parses JSON string and validates it against Odyssey backup schema.
   */
  validateImport(jsonText: string): ValidationResult {
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Invalid JSON format';
      return {
        valid: false,
        errors: [{ path: 'root', message: `The uploaded file is not valid JSON: ${msg}` }],
      };
    }

    return validateOdysseyBackup(parsed);
  },

  /**
   * Restores user data either by merging with existing data or replacing it entirely.
   */
  async restoreUserData(data: OdysseyExportData, strategy: RestoreStrategy): Promise<RestoreResult> {
    const user = await getAuthUser();

    if (!user) {
      // Unauthenticated / Anonymous mode using localStore
      const snapshot = localStore.exportAll();
      const prepared = prepareDataForImport(data, 'local-anon', {
        strategy,
        ownedIds: {
          tasks: new Set(snapshot.tasks.map((t) => t.id.toLowerCase())),
          missions: new Set(snapshot.missions.map((m) => m.id.toLowerCase())),
          sessions: new Set(snapshot.sessions.map((x) => x.id.toLowerCase())),
        },
      });

      try {
        if (strategy === 'replace') {
          localStore.replaceAll(prepared);
        } else {
          localStore.mergeAll(prepared);
        }

        return {
          success: true,
          strategy,
          tasksImported: prepared.tasks.length,
          missionsImported: prepared.missions.length,
          sessionsImported: prepared.sessions.length,
        };
      } catch (err: unknown) {
        if (strategy === 'replace') {
          try {
            localStore.replaceAll(snapshot);
          } catch {
            // Ignore rollback failure
          }
        }
        const message = err instanceof Error ? err.message : 'Local storage restoration failed.';
        return {
          success: false,
          strategy,
          tasksImported: 0,
          missionsImported: 0,
          sessionsImported: 0,
          error: message,
        };
      }
    }

    // Authenticated mode using Supabase
    try {
      // Merge keeps an id only when the account already owns it, so look that up first.
      const ownedIds: OwnedIds | undefined =
        strategy === 'merge'
          ? {
              tasks: await fetchOwnedIds('tasks', data.tasks.map((t) => t.id)),
              missions: await fetchOwnedIds('missions', data.missions.map((m) => m.id)),
              sessions: await fetchOwnedIds('focus_sessions', data.sessions.map((s) => s.id)),
            }
          : undefined;
      const prepared = prepareDataForImport(data, user.id, { strategy, ownedIds });

      if (strategy === 'replace') {
        // 1. Snapshot existing user data before destructive deletion to safeguard against midway failure
        const [tasksSnapRes, missionsSnapRes, sessionsSnapRes] = await Promise.all([
          supabase.from('tasks').select('*').eq('user_id', user.id),
          supabase.from('missions').select('*').eq('user_id', user.id),
          supabase.from('focus_sessions').select('*').eq('user_id', user.id),
        ]);

        if (tasksSnapRes.error) throw tasksSnapRes.error;
        if (missionsSnapRes.error) throw missionsSnapRes.error;
        if (sessionsSnapRes.error) throw sessionsSnapRes.error;

        const snapshot = {
          tasks: (tasksSnapRes.data as Task[]) ?? [],
          missions: (missionsSnapRes.data as Mission[]) ?? [],
          sessions: (sessionsSnapRes.data as FocusSession[]) ?? [],
        };

        // Cache snapshot in sessionStorage if available for disaster recovery
        const snapshotKey = `ody_backup_replace_${user.id}`;
        try {
          if (typeof sessionStorage !== 'undefined') {
            sessionStorage.setItem(snapshotKey, JSON.stringify(snapshot));
          }
        } catch {
          // Ignore storage quota or access issues
        }

        try {
          // Safe delete order to prevent constraint violations
          const { error: sessionDelErr } = await supabase.from('focus_sessions').delete().eq('user_id', user.id);
          if (sessionDelErr) throw sessionDelErr;

          const { error: missionDelErr } = await supabase.from('missions').delete().eq('user_id', user.id);
          if (missionDelErr) throw missionDelErr;

          const { error: taskDelErr } = await supabase.from('tasks').delete().eq('user_id', user.id);
          if (taskDelErr) throw taskDelErr;

          // Insert in order of dependencies (tasks -> missions -> sessions)
          if (prepared.tasks.length > 0) {
            const { error } = await supabase.from('tasks').insert(prepared.tasks);
            if (error) throw error;
          }

          if (prepared.missions.length > 0) {
            const { error } = await supabase.from('missions').insert(prepared.missions);
            if (error) throw error;
          }

          if (prepared.sessions.length > 0) {
            const { error } = await supabase.from('focus_sessions').insert(prepared.sessions);
            if (error) throw error;
          }

          // Clean up emergency snapshot after successful replace
          try {
            if (typeof sessionStorage !== 'undefined') {
              sessionStorage.removeItem(snapshotKey);
            }
          } catch {
            // Ignore
          }
        } catch (replaceErr: unknown) {
          // Insertion or deletion failed midway: attempt rollback from snapshot
          console.error('[portabilityService] Replace failed, attempting snapshot rollback:', replaceErr);
          let rollbackFailed = false;

          try {
            // Clean up any partially inserted records
            await supabase.from('focus_sessions').delete().eq('user_id', user.id);
            await supabase.from('missions').delete().eq('user_id', user.id);
            await supabase.from('tasks').delete().eq('user_id', user.id);

            // Re-insert snapshotted records
            if (snapshot.tasks.length > 0) {
              const { error } = await supabase.from('tasks').insert(snapshot.tasks);
              if (error) throw error;
            }
            if (snapshot.missions.length > 0) {
              const { error } = await supabase.from('missions').insert(snapshot.missions);
              if (error) throw error;
            }
            if (snapshot.sessions.length > 0) {
              const { error } = await supabase.from('focus_sessions').insert(snapshot.sessions);
              if (error) throw error;
            }
          } catch (rollbackErr) {
            rollbackFailed = true;
            console.error('[portabilityService] Failed to complete snapshot rollback:', rollbackErr);
          }

          const cause = replaceErr instanceof Error ? replaceErr.message : 'Database error during replace.';
          if (rollbackFailed) {
            throw new Error(`Replace failed: ${cause}. Rollback also encountered an error. A local snapshot may be preserved in session storage.`);
          }
          throw new Error(`Replace failed: ${cause}. Existing data was safely rolled back and preserved.`);
        }
      } else {
        // Merge strategy (upsert records)
        if (prepared.tasks.length > 0) {
          const { error } = await supabase.from('tasks').upsert(prepared.tasks);
          if (error) throw error;
        }

        if (prepared.missions.length > 0) {
          const { error } = await supabase.from('missions').upsert(prepared.missions);
          if (error) throw error;
        }

        if (prepared.sessions.length > 0) {
          const { error } = await supabase.from('focus_sessions').upsert(prepared.sessions);
          if (error) throw error;
        }
      }

      return {
        success: true,
        strategy,
        tasksImported: prepared.tasks.length,
        missionsImported: prepared.missions.length,
        sessionsImported: prepared.sessions.length,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Database restoration failed.';
      return {
        success: false,
        strategy,
        tasksImported: 0,
        missionsImported: 0,
        sessionsImported: 0,
        error: message,
      };
    }
  },
};
