-- Optional debrief note the user can write when finishing a mission.
-- Nullable with no default, so existing rows and older clients are unaffected;
-- the length cap matches MAX_REFLECTION_LENGTH in src/lib/reflection.ts.
ALTER TABLE public.missions
  ADD COLUMN IF NOT EXISTS reflection TEXT,
  ADD CONSTRAINT missions_reflection_length CHECK (reflection IS NULL OR char_length(reflection) <= 1000);
