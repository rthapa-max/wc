-- Knockout scoring: extra time + penalties on predictions and fixture results.
-- Run in Supabase SQL editor, then run scripts/knockout-prediction-points.sql

alter table public.predictions
  add column if not exists et_home_score int check (et_home_score is null or et_home_score >= 0),
  add column if not exists et_away_score int check (et_away_score is null or et_away_score >= 0),
  add column if not exists penalty_winner text check (penalty_winner is null or penalty_winner in ('home', 'away'));

alter table public.fixtures
  add column if not exists result_et_home_score int check (result_et_home_score is null or result_et_home_score >= 0),
  add column if not exists result_et_away_score int check (result_et_away_score is null or result_et_away_score >= 0),
  add column if not exists result_penalty_winner text check (result_penalty_winner is null or result_penalty_winner in ('home', 'away'));
