/**
 * Odyssey Local Store
 *
 * localStorage-backed persistence for unauthenticated (anonymous/demo) users.
 * Mirrors the exact same async API shapes used by taskService, missionService,
 * and focusService so all page components can call the same service interface
 * regardless of whether the user is signed in.
 *
 * Storage keys:
 *   ody_tasks          — Task[]
 *   ody_missions       — Mission[]
 *   ody_focus_sessions — FocusSession[]
 */

import type {
  Task,
  TaskStatus,
  TaskPriority,
  Mission,
  MissionStatus,
  FocusSession,
  CreateTaskInput,
  UpdateTaskInput,
} from '../types/database';
import type { CreateMissionInput, UpdateMissionInput } from '../services/missionService';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ANON_USER_ID = 'local-anon';

function uuid(): string {
  // crypto.randomUUID is available in all modern browsers and Node 15+
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older environments
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function now(): string {
  return new Date().toISOString();
}

function load<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T[]) : [];
  } catch {
    return [];
  }
}

function save<T>(key: string, items: T[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(items));
  } catch {
    // localStorage quota exceeded or unavailable — fail silently
  }
}

// Storage key constants
const KEYS = {
  tasks:    'ody_tasks',
  missions: 'ody_missions',
  sessions: 'ody_focus_sessions',
} as const;

// ─── Task operations ──────────────────────────────────────────────────────────

export const localTasks = {
  getAll(filter?: { status?: TaskStatus }): Task[] {
    const tasks = load<Task>(KEYS.tasks);
    if (filter?.status) return tasks.filter(t => t.status === filter.status);
    return tasks.sort((a, b) => b.created_at.localeCompare(a.created_at));
  },

  create(input: CreateTaskInput): Task {
    const task: Task = {
      id:                uuid(),
      user_id:           ANON_USER_ID,
      title:             input.title,
      description:       input.description ?? null,
      status:            (input.status ?? 'todo') as TaskStatus,
      priority:          (input.priority ?? 'medium') as TaskPriority,
      deadline:          input.deadline ?? null,
      estimated_minutes: input.estimated_minutes ?? null,
      source:            input.source ?? null,
      source_id:         input.source_id ?? null,
      created_at:        now(),
      updated_at:        now(),
      completed_at:      null,
    };
    const tasks = load<Task>(KEYS.tasks);
    tasks.unshift(task);
    save(KEYS.tasks, tasks);
    return task;
  },

  update(id: string, updates: UpdateTaskInput): Task {
    const tasks = load<Task>(KEYS.tasks);
    const idx = tasks.findIndex(t => t.id === id);
    if (idx === -1) throw new Error(`Task ${id} not found`);
    const updated: Task = { ...tasks[idx], ...updates, updated_at: now() };
    tasks[idx] = updated;
    save(KEYS.tasks, tasks);
    return updated;
  },

  complete(id: string): Task {
    return localTasks.update(id, {
      status: 'completed',
      completed_at: now(),
    });
  },

  delete(id: string): void {
    const tasks = load<Task>(KEYS.tasks).filter(t => t.id !== id);
    save(KEYS.tasks, tasks);
  },
};

// ─── Mission operations ───────────────────────────────────────────────────────

export const localMissions = {
  getAll(filter?: { status?: MissionStatus }): Mission[] {
    const missions = load<Mission>(KEYS.missions);
    const sorted = missions.sort((a, b) => b.created_at.localeCompare(a.created_at));
    if (filter?.status) return sorted.filter(m => m.status === filter.status);
    return sorted;
  },

  getOne(id: string): Mission {
    const mission = load<Mission>(KEYS.missions).find(m => m.id === id);
    if (!mission) throw new Error(`Mission ${id} not found`);
    return mission;
  },

  create(input: CreateMissionInput): Mission {
    const mission: Mission = {
      id:              uuid(),
      user_id:         ANON_USER_ID,
      task_id:         input.task_id ?? null,
      title:           input.title,
      objective:       input.objective ?? null,
      next_action:     input.next_action ?? null,
      planned_minutes: input.planned_minutes ?? null,
      status:          'planned',
      started_at:      null,
      completed_at:    null,
      created_at:      now(),
    };
    const missions = load<Mission>(KEYS.missions);
    missions.unshift(mission);
    save(KEYS.missions, missions);
    return mission;
  },

  update(id: string, updates: UpdateMissionInput): Mission {
    const missions = load<Mission>(KEYS.missions);
    const idx = missions.findIndex(m => m.id === id);
    if (idx === -1) throw new Error(`Mission ${id} not found`);
    const updated: Mission = { ...missions[idx], ...updates };
    missions[idx] = updated;
    save(KEYS.missions, missions);
    return updated;
  },

  delete(id: string): void {
    const missions = load<Mission>(KEYS.missions).filter(m => m.id !== id);
    save(KEYS.missions, missions);
  },
};

// ─── Focus session operations ──────────────────────────────────────────────────

export const localSessions = {
  getAll(): FocusSession[] {
    return load<FocusSession>(KEYS.sessions)
      .sort((a, b) => b.started_at.localeCompare(a.started_at));
  },

  getForMission(missionId: string): FocusSession[] {
    return load<FocusSession>(KEYS.sessions)
      .filter(s => s.mission_id === missionId)
      .sort((a, b) => b.started_at.localeCompare(a.started_at));
  },

  start(missionId: string): FocusSession {
    const session: FocusSession = {
      id:               uuid(),
      user_id:          ANON_USER_ID,
      mission_id:       missionId,
      started_at:       now(),
      ended_at:         null,
      duration_minutes: null,
      completed:        false,
      created_at:       now(),
    };
    const sessions = load<FocusSession>(KEYS.sessions);
    sessions.unshift(session);
    save(KEYS.sessions, sessions);
    return session;
  },

  end(id: string, completed: boolean): FocusSession {
    const sessions = load<FocusSession>(KEYS.sessions);
    const idx = sessions.findIndex(s => s.id === id);
    if (idx === -1) throw new Error(`Session ${id} not found`);
    const endedAt = now();
    const startedAt = new Date(sessions[idx].started_at).getTime();
    const durationMinutes = Math.round((new Date(endedAt).getTime() - startedAt) / 60000);
    const updated: FocusSession = {
      ...sessions[idx],
      ended_at: endedAt,
      duration_minutes: durationMinutes,
      completed,
    };
    sessions[idx] = updated;
    save(KEYS.sessions, sessions);
    return updated;
  },
};

// ─── Utility: clear all local data (useful for "sign in to save" flow) ────────

export function clearLocalStore(): void {
  localStorage.removeItem(KEYS.tasks);
  localStorage.removeItem(KEYS.missions);
  localStorage.removeItem(KEYS.sessions);
}

/**
 * Returns a snapshot of all local data — used when offering to migrate
 * anonymous data to a newly authenticated account (future feature).
 */
export function exportLocalStore() {
  return {
    tasks:    localTasks.getAll(),
    missions: localMissions.getAll(),
    sessions: localSessions.getAll(),
  };
}
