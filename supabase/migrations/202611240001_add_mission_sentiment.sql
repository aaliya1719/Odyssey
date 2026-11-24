-- Nullable for older missions; existing mission RLS policies still apply.
ALTER TABLE public.missions ADD COLUMN IF NOT EXISTS sentiment TEXT
  CONSTRAINT missions_sentiment_valid CHECK (sentiment IN ('flow', 'focused', 'climb', 'fatigued'));
