import { useEffect, useRef, useState } from 'react';
import { focusService } from '../services/focusService';
import { missionService } from '../services/missionService';
import type { FocusSession, Mission } from '../types/database';

function elapsedSeconds(sessions: FocusSession[], now = Date.now()): number {
  return Math.max(0, Math.floor(sessions.reduce((total, session) => {
    const end = session.ended_at ? new Date(session.ended_at).getTime() : now;
    return total + Math.max(0, end - new Date(session.started_at).getTime()) / 1000;
  }, 0)));
}

export function useMissionTimer(mission: Mission | null, onMissionUpdate: (mission: Mission) => void) {
  const [session, setSession] = useState<FocusSession | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const [ending, setEnding] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionsRef = useRef<FocusSession[]>([]);

  const refresh = async () => {
    if (!mission) return;
    const sessions = await focusService.getSessionsForMission(mission.id);
    sessionsRef.current = sessions;
    const openSession = sessions.find(item => !item.ended_at) ?? null;
    setSession(openSession);
    setElapsed(elapsedSeconds(sessions));
    setRunning(mission.status === 'active' && openSession !== null);
  };

  useEffect(() => {
    if (!mission) {
      setSession(null);
      setElapsed(0);
      setRunning(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const sessions = await focusService.getSessionsForMission(mission.id);
        if (cancelled) return;
        sessionsRef.current = sessions;
        const openSession = sessions.find(item => !item.ended_at) ?? null;
        setSession(openSession);
        setElapsed(elapsedSeconds(sessions));
        setRunning(mission.status === 'active' && openSession !== null);
      } catch (error) {
        console.error('Failed to restore mission timer:', error);
      }
    })();
    return () => { cancelled = true; };
  }, [mission?.id, mission?.status]);

  useEffect(() => {
    if (!running) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
      return;
    }
    intervalRef.current = setInterval(() => {
      setElapsed(elapsedSeconds(sessionsRef.current));
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
    };
  }, [running]);

  const start = async () => {
    if (!mission) return;
    let updatedMission = mission;
    if (updatedMission.status !== 'active') {
      updatedMission = await missionService.activateMission(updatedMission.id);
      onMissionUpdate(updatedMission);
    }
    const activeSession = await focusService.startSession(updatedMission.id);
    setSession(activeSession);
    await refresh();
    setRunning(true);
  };

  const pause = async () => {
    if (!mission) return;
    setRunning(false);
    if (session) await focusService.endSession(session.id, false);
    const updatedMission = await missionService.pauseMission(mission.id);
    onMissionUpdate(updatedMission);
    await refresh();
  };

  const resume = async () => {
    if (!mission) return;
    const updatedMission = await missionService.activateMission(mission.id);
    onMissionUpdate(updatedMission);
    const activeSession = await focusService.startSession(updatedMission.id);
    setSession(activeSession);
    await refresh();
    setRunning(true);
  };

  const complete = async () => {
    if (!mission) return;
    setEnding(true);
    setRunning(false);
    try {
      if (session) await focusService.endSession(session.id, true);
      const updatedMission = await missionService.completeMission(mission.id);
      onMissionUpdate(updatedMission);
      await refresh();
    } finally {
      setEnding(false);
    }
  };

  return { elapsed, running, ending, start, pause, resume, complete };
}