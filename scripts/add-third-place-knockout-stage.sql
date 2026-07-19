-- Treat 'Play-off for third place' as a knockout stage (same v2 5/3/0 + penalty scoring).
-- Run in the Supabase SQL editor. Safe to run even after the fixture is finished and
-- scored: prediction_points is a view, so scores recompute automatically once this
-- function is updated — no backfill needed.

create or replace function public.is_knockout_stage(p_stage text)
returns boolean
language sql
immutable
as $$
  select p_stage in (
    'Round of 32',
    'Round of 16',
    'Quarter-final',
    'Semi-final',
    'Final',
    'Play-off for third place'
  );
$$;

-- Sanity check: confirm the fixture isn't stuck on 'legacy' scoring (which would give
-- 3/2/1 + ET + pens instead of the intended 5/3/0 + pens v2 rules). If this returns
-- 'legacy', run: update public.fixtures set knockout_scoring_version = 'v2' where stage = 'Play-off for third place';
select id, stage, status, knockout_scoring_version, result_home_score, result_away_score
from public.fixtures
where stage = 'Play-off for third place';
