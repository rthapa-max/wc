-- Knockout v2 scoring: 5/3/0 regular time + penalty bonuses. Finished knockouts keep legacy rules.
-- Run in the Supabase SQL editor on existing projects.

alter table public.predictions
  add column if not exists penalty_home_score int check (penalty_home_score is null or penalty_home_score >= 0),
  add column if not exists penalty_away_score int check (penalty_away_score is null or penalty_away_score >= 0);

alter table public.fixtures
  add column if not exists result_penalty_home_score int check (result_penalty_home_score is null or result_penalty_home_score >= 0),
  add column if not exists result_penalty_away_score int check (result_penalty_away_score is null or result_penalty_away_score >= 0),
  add column if not exists knockout_scoring_version text
    check (knockout_scoring_version is null or knockout_scoring_version in ('legacy', 'v2'))
    default 'v2';

-- Preserve points for knockout fixtures already marked finished.
update public.fixtures
set knockout_scoring_version = 'legacy'
where public.is_knockout_stage(stage)
  and status = 'finished'
  and (knockout_scoring_version is null or knockout_scoring_version = 'v2');

create or replace function public.prediction_points_for(
  p_knockout_scoring_version text,
  p_stage text,
  p_pred_home int,
  p_pred_away int,
  p_pred_et_home int,
  p_pred_et_away int,
  p_pred_penalty_winner text,
  p_pred_penalty_home int,
  p_pred_penalty_away int,
  p_result_home int,
  p_result_away int,
  p_result_et_home int,
  p_result_et_away int,
  p_result_penalty_winner text,
  p_result_penalty_home int,
  p_result_penalty_away int,
  p_finished boolean
)
returns int
language plpgsql
immutable
as $$
declare
  v_points int;
  v_pred_pen_winner text;
  v_result_pen_winner text;
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

  if p_knockout_scoring_version = 'legacy' then
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

    if p_result_home <> p_result_away then
      return v_points;
    end if;

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

    if p_result_et_home <> p_result_et_away then
      return v_points;
    end if;

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
  end if;

  -- Knockout v2: 5/3/0 regular time, no participation points.
  -- Wrong outcome = 0 (e.g. predict 3-2, actual 2-2 — no penalty points even if shootout winner is correct).
  if p_result_home = p_pred_home and p_result_away = p_pred_away then
    v_points := 5;
  elsif (
    (p_result_home > p_result_away and p_pred_home > p_pred_away) or
    (p_result_home < p_result_away and p_pred_home < p_pred_away) or
    (p_result_home = p_result_away and p_pred_home = p_pred_away)
  ) then
    v_points := 3;
  else
    return 0;
  end if;

  if p_result_home <> p_result_away then
    return v_points;
  end if;

  if p_pred_home <> p_pred_away then
    return v_points;
  end if;

  v_result_pen_winner := p_result_penalty_winner;
  if v_result_pen_winner is null and p_result_penalty_home is not null and p_result_penalty_away is not null then
    if p_result_penalty_home > p_result_penalty_away then
      v_result_pen_winner := 'home';
    elsif p_result_penalty_home < p_result_penalty_away then
      v_result_pen_winner := 'away';
    end if;
  end if;

  if v_result_pen_winner is null then
    return v_points;
  end if;

  v_pred_pen_winner := p_pred_penalty_winner;
  if v_pred_pen_winner is null and p_pred_penalty_home is not null and p_pred_penalty_away is not null then
    if p_pred_penalty_home > p_pred_penalty_away then
      v_pred_pen_winner := 'home';
    elsif p_pred_penalty_home < p_pred_penalty_away then
      v_pred_pen_winner := 'away';
    end if;
  end if;

  if v_pred_pen_winner is null then
    return v_points;
  end if;

  if p_pred_penalty_home is not null and p_pred_penalty_away is not null
     and p_result_penalty_home is not null and p_result_penalty_away is not null
     and p_pred_penalty_home = p_result_penalty_home
     and p_pred_penalty_away = p_result_penalty_away then
    return v_points + 3;
  end if;

  if v_pred_pen_winner = v_result_pen_winner then
    return v_points + 2;
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
    f.knockout_scoring_version,
    f.stage,
    p.home_score,
    p.away_score,
    p.et_home_score,
    p.et_away_score,
    p.penalty_winner,
    p.penalty_home_score,
    p.penalty_away_score,
    f.result_home_score,
    f.result_away_score,
    f.result_et_home_score,
    f.result_et_away_score,
    f.result_penalty_winner,
    f.result_penalty_home_score,
    f.result_penalty_away_score,
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
