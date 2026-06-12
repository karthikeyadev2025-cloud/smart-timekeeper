ALTER TABLE public.branches
  ADD COLUMN IF NOT EXISTS default_radius_meters integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS checkin_window_start time NULL,
  ADD COLUMN IF NOT EXISTS checkin_window_end time NULL,
  ADD COLUMN IF NOT EXISTS checkout_window_start time NULL,
  ADD COLUMN IF NOT EXISTS checkout_window_end time NULL;