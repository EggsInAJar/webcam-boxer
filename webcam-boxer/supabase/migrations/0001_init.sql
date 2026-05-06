-- Players
create table public.players (
  id uuid primary key default gen_random_uuid(),
  username text null,
  rating int not null default 1200,
  games_played int not null default 0,
  wins int not null default 0,
  losses int not null default 0,
  draws int not null default 0,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

-- Matches (rating_*_after left as before until Phase 3 ELO is wired up)
create table public.matches (
  id uuid primary key default gen_random_uuid(),
  player_a uuid not null references public.players(id),
  player_b uuid not null references public.players(id),
  winner uuid null references public.players(id),
  rounds_a int not null default 0,
  rounds_b int not null default 0,
  rating_a_before int not null,
  rating_b_before int not null,
  rating_a_after int not null,
  rating_b_after int not null,
  ended_reason text not null check (ended_reason in ('ko','timeout','disconnect','forfeit')),
  created_at timestamptz not null default now()
);

-- Indexes
create index players_rating_idx on public.players (rating desc);
create index matches_created_at_idx on public.matches (created_at desc);

-- Public leaderboard view — no PII, no timestamps
create view public.public_players as
  select id, username, rating, games_played, wins, losses, draws
  from public.players;

-- Row-level security
alter table public.players enable row level security;
alter table public.matches enable row level security;

-- Anon can read the leaderboard view only
grant select on public.public_players to anon;

-- No direct client writes — all mutations go through the service-role API or server
