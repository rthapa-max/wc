-- Run this in Supabase SQL editor.
-- Option A schema: fixtures in Supabase + admin-entered results + points + leaderboard.
-- Auth is managed by the app (public.app_users with bcrypt password hashes).

create extension if not exists pgcrypto;

create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  created_at timestamptz not null default now()
);

-- If table already existed, ensure admin column exists.
alter table public.app_users
  add column if not exists is_admin boolean not null default false;

alter table public.app_users
  add column if not exists favorite_team text;

alter table public.app_users
  add column if not exists username text;

create unique index if not exists app_users_username_lower_idx
  on public.app_users (lower(username));

alter table public.app_users
  alter column email drop not null;

alter table public.app_users
  drop constraint if exists app_users_email_or_username;

alter table public.app_users
  add constraint app_users_email_or_username
  check (email is not null or username is not null);

-- Keep stored usernames lowercase to match app_users_username_lower_idx lookups.
update public.app_users
set username = lower(username)
where username is not null and username <> lower(username);

create table if not exists public.fixtures (
  id text primary key,
  date_label text not null,
  time text not null,
  home text not null,
  away text not null,
  stage text,
  "group" text,
  stadium text,
  city text,
  -- result fields (null until finished)
  result_home_score int check (result_home_score >= 0),
  result_away_score int check (result_away_score >= 0),
  result_status text not null default 'scheduled' check (result_status in ('scheduled','finished')),
  result_updated_at timestamptz,
  -- scheduled = not open, pending = predictions open, finished = match complete
  status text not null default 'scheduled' check (status in ('scheduled','pending','finished')),
  -- Kickoff instant (parsed from date_label + time as-is)
  kickoff_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.fixtures
  add column if not exists kickoff_at timestamptz;

alter table public.fixtures
  add column if not exists prediction_close_notified_at timestamptz;

alter table public.fixtures
  add column if not exists status text not null default 'scheduled';

alter table public.fixtures
  alter column status set default 'scheduled';

-- Migrate legacy values before applying new constraint.
update public.fixtures set status = 'finished' where result_status = 'finished' and status <> 'finished';
update public.fixtures set status = 'scheduled' where status = 'closed';

alter table public.fixtures
  drop constraint if exists fixtures_status_check;

alter table public.fixtures
  add constraint fixtures_status_check check (status in ('scheduled','pending','finished'));

create table if not exists public.predictions (
  user_id uuid not null references public.app_users (id) on delete cascade,
  fixture_id text not null references public.fixtures (id) on delete cascade,
  winner text not null check (winner in ('home','away','draw')),
  home_score int not null check (home_score >= 0),
  away_score int not null check (away_score >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, fixture_id)
);

-- Migration helper: older versions used predictions.match_key instead of predictions.fixture_id
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'predictions'
      and column_name = 'match_key'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'predictions'
      and column_name = 'fixture_id'
  ) then
    alter table public.predictions add column fixture_id text;

    -- fixtures.id is "date|time|home|away" (first 4 parts of match_key)
    update public.predictions
    set fixture_id =
      split_part(match_key, '|', 1) || '|' ||
      split_part(match_key, '|', 2) || '|' ||
      split_part(match_key, '|', 3) || '|' ||
      split_part(match_key, '|', 4);
  end if;
end $$;

-- Ensure the new column exists even if the table existed before.
alter table public.predictions
  add column if not exists fixture_id text;

-- If predictions table already existed, enforce new PK/FK shape.
alter table public.predictions
  drop constraint if exists predictions_pkey;

alter table public.predictions
  add constraint predictions_pkey primary key (user_id, fixture_id);

alter table public.predictions
  drop constraint if exists predictions_fixture_id_fkey;

alter table public.predictions
  add constraint predictions_fixture_id_fkey
  foreign key (fixture_id) references public.fixtures(id) on delete cascade
  not valid;

-- Validate FK only when fixtures have been seeded (otherwise this will fail).
do $$
begin
  if exists (select 1 from public.fixtures limit 1) then
    -- Only validate if there are no missing fixtures for existing predictions.
    if not exists (
      select 1
      from public.predictions p
      left join public.fixtures f on f.id = p.fixture_id
      where f.id is null
      limit 1
    ) then
      alter table public.predictions validate constraint predictions_fixture_id_fkey;
    end if;
  end if;
end $$;

-- Remove legacy match_key column (app now uses fixture_id only).
alter table public.predictions drop column if exists match_key;

alter table public.predictions
  add column if not exists et_home_score int check (et_home_score is null or et_home_score >= 0),
  add column if not exists et_away_score int check (et_away_score is null or et_away_score >= 0),
  add column if not exists penalty_winner text check (penalty_winner is null or penalty_winner in ('home', 'away')),
  add column if not exists penalty_home_score int check (penalty_home_score is null or penalty_home_score >= 0),
  add column if not exists penalty_away_score int check (penalty_away_score is null or penalty_away_score >= 0);

alter table public.fixtures
  add column if not exists result_et_home_score int check (result_et_home_score is null or result_et_home_score >= 0),
  add column if not exists result_et_away_score int check (result_et_away_score is null or result_et_away_score >= 0),
  add column if not exists result_penalty_winner text check (result_penalty_winner is null or result_penalty_winner in ('home', 'away')),
  add column if not exists result_penalty_home_score int check (result_penalty_home_score is null or result_penalty_home_score >= 0),
  add column if not exists result_penalty_away_score int check (result_penalty_away_score is null or result_penalty_away_score >= 0),
  add column if not exists knockout_scoring_version text
    check (knockout_scoring_version is null or knockout_scoring_version in ('legacy', 'v2'))
    default 'v2';

-- Points: group 3/2/1; knockout legacy 3/2/1 + ET + pens; knockout v2 5/3/0 + penalties.
drop view if exists public.leaderboard;
drop view if exists public.prediction_points;

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

  -- Knockout v2: wrong full-time outcome = 0 (e.g. predict 3-2, actual 2-2 — no penalty points).
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
  count(*) filter (where pp.fixture_status = 'finished' and pp.points = 1) as incorrect,
  count(*) filter (where pp.fixture_status = 'finished' and pp.predicted_winner = 'draw') as draw,
  coalesce(sum(pp.points), 0) as points
from public.app_users u
left join public.prediction_points pp on pp.user_id = u.id
group by u.email, u.username, u.favorite_team
order by points desc, correct desc, predicted desc, coalesce(u.username, u.email) asc;

