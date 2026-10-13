-- K-Trip World Cup Market funnel events (pre-payment data). No IP stored.
create table if not exists public.events (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  event text not null check (event in ('page_view','store_view','phone_click','map_pin_click','directions','language_change')),
  store_id text,
  store_no int,
  locale text,
  src text,
  visitor_id text,
  session_id text,
  path text,
  user_agent text
);
create index if not exists events_event_created_at_idx on public.events (event, created_at desc);
create index if not exists events_visitor_id_idx on public.events (visitor_id);
alter table public.events enable row level security;
-- No policies: anon/authenticated get nothing. Inserts go through /api/track with the server key.
revoke all on table public.events from anon, authenticated;
revoke all on sequence public.events_id_seq from anon, authenticated;
