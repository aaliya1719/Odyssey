-- At most one open (not yet ended) focus session per mission.
-- Without this, two quick Start/Resume clicks (or two tabs) could insert two open
-- sessions; Pause/Complete only closes the one id it is given, so the other stayed open
-- and kept adding time.

-- 1. Clean up existing duplicates so the index can be created. For a mission with several
--    open sessions, keep the newest one open and close each older one at the moment the
--    next one started, so the same minutes are not counted twice.
WITH ranked AS (
  SELECT
    id,
    started_at,
    LEAD(started_at) OVER (PARTITION BY mission_id ORDER BY started_at, id) AS next_started_at
  FROM public.focus_sessions
  WHERE ended_at IS NULL AND mission_id IS NOT NULL
)
UPDATE public.focus_sessions AS fs
SET
  ended_at = ranked.next_started_at,
  duration_minutes = ROUND(EXTRACT(EPOCH FROM (ranked.next_started_at - fs.started_at)) / 60)::INTEGER,
  completed = FALSE
FROM ranked
WHERE fs.id = ranked.id AND ranked.next_started_at IS NOT NULL;

-- 2. Enforce it. Sessions whose mission was deleted (mission_id NULL) are not affected.
CREATE UNIQUE INDEX IF NOT EXISTS focus_sessions_one_open_per_mission
  ON public.focus_sessions (mission_id)
  WHERE ended_at IS NULL;
