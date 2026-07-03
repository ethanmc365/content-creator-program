-- 040_realtime_connections.sql
-- Broadcast connection changes over realtime so the "requests" badge updates
-- live (like the DM badge does) instead of only on reload.
alter publication supabase_realtime add table public.connections;
