-- Preserve normalized hashtag tags on tasks.
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';
