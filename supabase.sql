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

-- Points:
--   exact score (draw or not) = 3
--   correct outcome, wrong score = 2
--   predicted but wrong outcome = 1
--   no prediction = 0 (no row in predictions)
-- Drop dependent view first (CREATE OR REPLACE cannot rename columns).
drop view if exists public.leaderboard;
drop view if exists public.prediction_points;

create view public.prediction_points as
select
  p.user_id,
  p.fixture_id,
  p.winner as predicted_winner,
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

