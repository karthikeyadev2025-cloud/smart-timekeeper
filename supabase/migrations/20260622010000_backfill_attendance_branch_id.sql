-- ============================================================================
-- Backfill branch_id on historical attendance_records.
-- The check-in code wasn't setting branch_id when inserting attendance rows,
-- so every existing record has branch_id = NULL. That makes per-branch
-- reports (attendance CSV by branch, etc) return 0 rows.
--
-- Safe: only updates rows where branch_id IS NULL, and uses the user's
-- current branch from profiles as the source of truth. Going forward the
-- app code sets branch_id at insert time.
-- ============================================================================

UPDATE public.attendance_records ar
SET branch_id = p.branch_id
FROM public.profiles p
WHERE ar.user_id = p.id
  AND ar.branch_id IS NULL
  AND p.branch_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
