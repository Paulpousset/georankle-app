-- friends_unique_pair — enforce one friendship row per unordered pair.
-- Applied to GeoGames (exwfggaytrywnfzcqpel) on 2026-07-09 via MCP.
-- Prevents duplicate/phantom rows from crossed friend requests; the client
-- (PlayerProfile.addFriend) reconciles on the unique-constraint hit.
CREATE UNIQUE INDEX IF NOT EXISTS friends_unique_pair
  ON public.friends (LEAST(user_id1, user_id2), GREATEST(user_id1, user_id2));
