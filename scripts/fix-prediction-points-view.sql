-- Deprecated: this file used the old global 3/2/1 view and would REMOVE knockout scoring.
-- Use scripts/apply-knockout-scoring.sql instead (one file, safe for group-stage points).

-- If you only need the 0-0 winner fix without changing scoring, run just the UPDATE below,
-- then run scripts/apply-knockout-scoring.sql for the full migration.

update public.predictions
set winner = case
  when home_score > away_score then 'home'
  when home_score < away_score then 'away'
  else 'draw'
end
where winner is distinct from case
  when home_score > away_score then 'home'
  when home_score < away_score then 'away'
  else 'draw'
end;
