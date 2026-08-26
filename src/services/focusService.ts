import { supabase } from '../lib/supabase';
import { localSessions } from '../lib/localStore';
import type { FocusSession } from '../types/database';

async function getUser() {
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

export const focusService = {
  async startSession(missionId: string): Promise<FocusSession> {
    const user = await getUser();
    if (!user) return Promise.resolve(localSessions.start(missionId));

    const { data, error } = await supabase
      .from('focus_sessions')
      .insert({
        user_id:    user.id,
        mission_id: missionId,
        started_at: new Date().toISOString(),
        completed:  false,
      })
      .select()
      .single();
    if (error) throw error;
    return data as FocusSession;
  },

  async endSession(id: string, completed: boolean): Promise<FocusSession> {
    const user = await getUser();
    if (!user) return Promise.resolve(localSessions.end(id, completed));

    const now = new Date().toISOString();
    const { data: existing, error: fetchErr } = await supabase
      .from('focus_sessions').select('started_at').eq('id', id).single();
    if (fetchErr) throw fetchErr;

    const durationMinutes = Math.round(
      (new Date(now).getTime() - new Date(existing.started_at).getTime()) / 60000
    );
    const { data, error } = await supabase
      .from('focus_sessions')
      .update({ ended_at: now, duration_minutes: durationMinutes, completed })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as FocusSession;
  },

  async getSessionsForMission(missionId: string): Promise<FocusSession[]> {
    const user = await getUser();
    if (!user) return Promise.resolve(localSessions.getForMission(missionId));

    const { data, error } = await supabase
      .from('focus_sessions').select('*').eq('mission_id', missionId)
      .order('started_at', { ascending: false });
    if (error) throw error;
    return (data as FocusSession[]) || [];
  },

  async getAllSessions(): Promise<FocusSession[]> {
    const user = await getUser();
    if (!user) return Promise.resolve(localSessions.getAll());

    const { data, error } = await supabase
      .from('focus_sessions').select('*').order('started_at', { ascending: false });
    if (error) throw error;
    return (data as FocusSession[]) || [];
  },

  async getRecentSessions(limit = 20): Promise<FocusSession[]> {
    const user = await getUser();
    if (!user) return Promise.resolve(localSessions.getAll().slice(0, limit));

    const { data, error } = await supabase
      .from('focus_sessions').select('*')
      .order('started_at', { ascending: false }).limit(limit);
    if (error) throw error;
    return (data as FocusSession[]) || [];
  },
};
