-- Knockout progressive scoring (3 / 4 / 5) + group stage 3 / 2 / 1.
-- Prerequisite: scripts/add-knockout-scoring-fields.sql

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
    'Final'
  );
$$;

create or replace function public.prediction_points_for(
  p_stage text,
  p_pred_home int,
  p_pred_away int,
  p_pred_et_home int,
  p_pred_et_away int,
  p_pred_penalty_winner text,
  p_result_home int,
  p_result_away int,
  p_result_et_home int,
  p_result_et_away int,
  p_result_penalty_winner text,
  p_finished boolean
)
returns int
language plpgsql
immutable
as $$
declare
  v_points int;
begin
  if not p_finished then
    return null;
  end if;

  if p_result_home is null or p_result_away is null then
    return 1;
  end if;

  if not public.is_knockout_stage(p_stage) then
    if p_result_home = p_pred_home and p_result_away = p_pred_away then
      return 3;
    end if;
    if (
      (p_result_home > p_result_away and p_pred_home > p_pred_away) or
      (p_result_home < p_result_away and p_pred_home < p_pred_away) or
      (p_result_home = p_result_away and p_pred_home = p_pred_away)
    ) then
      return 2;
    end if;
    return 1;
  end if;

  -- Knockout: 90 minutes uses normal 3/2/1
  if p_result_home <> p_pred_home or p_result_away <> p_pred_away then
    if (
      (p_result_home > p_result_away and p_pred_home > p_pred_away) or
      (p_result_home < p_result_away and p_pred_home < p_pred_away) or
      (p_result_home = p_result_away and p_pred_home = p_pred_away)
    ) then
      return 2;
    end if;
    return 1;
  end if;

  v_points := 3;

  -- Winner in 90 minutes — no extra time bonuses
  if p_result_home <> p_result_away then
    return v_points;
  end if;

  -- Draw at 90 — extra time bonus (+1 for correct ET outcome)
  if p_pred_et_home is null or p_pred_et_away is null then
    return v_points;
  end if;
  if p_result_et_home is null or p_result_et_away is null then
    return v_points;
  end if;

  if not (
    (p_result_et_home > p_result_et_away and p_pred_et_home > p_pred_et_away) or
    (p_result_et_home < p_result_et_away and p_pred_et_home < p_pred_et_away) or
    (p_result_et_home = p_result_et_away and p_pred_et_home = p_pred_et_away)
  ) then
    return v_points;
  end if;

  v_points := v_points + 1;

  -- Winner in extra time — no penalty bonus
  if p_result_et_home <> p_result_et_away then
    return v_points;
  end if;

  -- Penalties bonus (+1)
  if p_result_penalty_winner is null then
    return v_points;
  end if;
  if p_pred_penalty_winner is null then
    return v_points;
  end if;
  if p_pred_penalty_winner = p_result_penalty_winner then
    v_points := v_points + 1;
  end if;

  return v_points;
end;
$$;

drop view if exists public.leaderboard;
drop view if exists public.prediction_points;

create view public.prediction_points as
select
  p.user_id,
  p.fixture_id,
  case
    when p.home_score > p.away_score then 'home'
    when p.home_score < p.away_score then 'away'
    else 'draw'
  end as predicted_winner,
  p.home_score as predicted_home_score,
  p.away_score as predicted_away_score,
  f.status as fixture_status,
  f.stage as fixture_stage,
  f.result_home_score,
  f.result_away_score,
  public.prediction_points_for(
    f.stage,
    p.home_score,
    p.away_score,
    p.et_home_score,
    p.et_away_score,
    p.penalty_winner,
    f.result_home_score,
    f.result_away_score,
    f.result_et_home_score,
    f.result_et_away_score,
    f.result_penalty_winner,
    f.status = 'finished'
  ) as points
from public.predictions p
join public.fixtures f on f.id = p.fixture_id;

create or replace view public.leaderboard as
select
  u.email,
  u.username,
  u.favorite_team,
  count(pp.fixture_id) as predicted,
  count(*) filter (
    where pp.fixture_status = 'finished'
      and pp.result_home_score is not null
      and pp.result_away_score is not null
      and pp.result_home_score = pp.predicted_home_score
      and pp.result_away_score = pp.predicted_away_score
  ) as correct,
  count(*) filter (
    where pp.fixture_status = 'finished' and pp.points = 1
  ) as incorrect,
  count(*) filter (where pp.fixture_status = 'finished' and pp.predicted_winner = 'draw') as draw,
  coalesce(sum(pp.points), 0) as points
from public.app_users u
left join public.prediction_points pp on pp.user_id = u.id
group by u.email, u.username, u.favorite_team
order by points desc, correct desc, predicted desc, coalesce(u.username, u.email) asc;
