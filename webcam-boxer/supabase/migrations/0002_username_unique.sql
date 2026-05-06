-- Case-insensitive username type
create extension if not exists citext;

alter table public.players alter column username type citext;

-- Partial unique index: unique only where username is set (allows multiple nulls)
create unique index players_username_unique
  on public.players (username)
  where username is not null;
