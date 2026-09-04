-- schema.sql
-- Run this once in the Supabase SQL editor (Project → SQL Editor → New query)
-- before deploying. It only creates tables; sample data and the coordinator
-- account are added afterwards by `npm run seed` (see scripts/seed.js and
-- the README), so passwords are hashed the same way the app hashes them.

create table if not exists departments (
  id text primary key,
  name text not null,
  color text not null default '#4EA8FF'
);

create table if not exists sports (
  id text primary key,
  name text not null,
  emoji text not null default '🏆',
  team_size int not null default 1
);

create table if not exists users (
  id text primary key,
  role text not null check (role in ('student', 'coordinator')),
  name text not null,
  email text not null unique,
  password_hash text not null,
  student_id text,
  department_id text references departments(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists registrations (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  sport_id text not null references sports(id) on delete cascade,
  department_id text references departments(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  unique (user_id, sport_id)
);

create table if not exists matches (
  id text primary key,
  sport_id text not null references sports(id) on delete cascade,
  department_a text not null references departments(id) on delete cascade,
  department_b text not null references departments(id) on delete cascade,
  score_a int not null default 0,
  score_b int not null default 0,
  venue text default '',
  time text default '',
  status text not null default 'scheduled' check (status in ('scheduled', 'live', 'final')),
  created_at timestamptz not null default now()
);

create index if not exists idx_registrations_sport on registrations(sport_id);
create index if not exists idx_registrations_user on registrations(user_id);
create index if not exists idx_matches_sport on matches(sport_id);

-- Row Level Security stays OFF for these tables on purpose: this app talks
-- to Supabase using the service role key from the server only (never from
-- the browser), and does its own auth/authorization in the Express routes.
-- If you ever call Supabase directly from the frontend, turn RLS on first.
