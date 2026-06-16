-- Refresh scoring view (0-0 safe: outcome derived from scores, not winner column).
-- Fixes: 0-0 predictions now always earn 1 pt (participation) or 3 pts (exact).
-- Run in Supabase SQL editor on existing projects.

-- Keep winner column aligned with stored scores (legacy rows may have wrong winner for 0-0).
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
  f.result_home_score,
  f.result_away_score,
  case
    when f.status <> 'finished' then null
    when f.result_home_score is not null
      and f.result_away_score is not null
      and f.result_home_score = p.home_score
      and f.result_away_score = p.away_score then 3
    when f.result_home_score is not null
      and f.result_away_score is not null
      and (
        (f.result_home_score > f.result_away_score and p.home_score > p.away_score) or
        (f.result_home_score < f.result_away_score and p.home_score < p.away_score) or
        (f.result_home_score = f.result_away_score and p.home_score = p.away_score)
      ) then 2
    else 1
  end as points
from public.predictions p
join public.fixtures f on f.id = p.fixture_id;

create or replace view public.leaderboard as
select
  u.email,
  u.username,
  u.favorite_team,
  count(pp.fixture_id) as predicted,
  count(*) filter (where pp.fixture_status = 'finished' and pp.points = 3) as correct,
  count(*) filter (where pp.fixture_status = 'finished' and pp.points = 1) as incorrect,
  count(*) filter (where pp.fixture_status = 'finished' and pp.predicted_winner = 'draw') as draw,
  coalesce(sum(pp.points), 0) as points
from public.app_users u
left join public.prediction_points pp on pp.user_id = u.id
group by u.email, u.username, u.favorite_team
order by points desc, correct desc, predicted desc, coalesce(u.username, u.email) asc;
