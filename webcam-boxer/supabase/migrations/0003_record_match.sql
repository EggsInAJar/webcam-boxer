-- Atomic match recording with pre-computed ELO ratings.
-- Called by the game server (service role) so security definer is safe.
create or replace function record_match(
  p_player_a         uuid,
  p_player_b         uuid,
  p_winner           uuid,      -- null for draw
  p_rounds_a         int,
  p_rounds_b         int,
  p_rating_a_before  int,
  p_rating_b_before  int,
  p_rating_a_after   int,
  p_rating_b_after   int,
  p_ended_reason     text
) returns json
security definer
language plpgsql
as $$
declare
  v_match_id uuid;
begin
  -- Insert match row
  insert into public.matches (
    player_a, player_b, winner,
    rounds_a, rounds_b,
    rating_a_before, rating_b_before,
    rating_a_after,  rating_b_after,
    ended_reason
  ) values (
    p_player_a, p_player_b, p_winner,
    p_rounds_a, p_rounds_b,
    p_rating_a_before, p_rating_b_before,
    p_rating_a_after,  p_rating_b_after,
    p_ended_reason
  )
  returning id into v_match_id;

  -- Update player A: new rating + counters
  update public.players set
    rating       = p_rating_a_after,
    games_played = games_played + 1,
    wins         = wins   + case when p_winner = p_player_a then 1 else 0 end,
    losses       = losses + case when p_winner = p_player_b then 1 else 0 end,
    draws        = draws  + case when p_winner is null      then 1 else 0 end,
    last_seen_at = now()
  where id = p_player_a;

  -- Update player B: new rating + counters
  update public.players set
    rating       = p_rating_b_after,
    games_played = games_played + 1,
    wins         = wins   + case when p_winner = p_player_b then 1 else 0 end,
    losses       = losses + case when p_winner = p_player_a then 1 else 0 end,
    draws        = draws  + case when p_winner is null      then 1 else 0 end,
    last_seen_at = now()
  where id = p_player_b;

  return json_build_object('match_id', v_match_id);
end;
$$;
