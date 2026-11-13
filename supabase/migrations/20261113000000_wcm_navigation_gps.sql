-- K-Trip Worldcup Market: link consented walking fixes to one navigation attempt.
-- Additive migration. Existing rows, visitor sessions and the 365-day retention job remain unchanged.
begin;

alter table public.events add column if not exists navigation_id uuid;
create index if not exists events_worldcup_navigation_readback_idx
  on public.events (visitor_id, created_at desc)
  where app = 'worldcup-market' and navigation_id is not null;
create index if not exists events_worldcup_navigation_order_idx
  on public.events (navigation_id, created_at, id)
  where app = 'worldcup-market' and navigation_id is not null;

-- Existing app=walk navigation and all existing market funnel events stay permitted.
alter table public.events drop constraint if exists events_app_event_check;
alter table public.events add constraint events_app_event_check check (
  (app = 'walk' and event in (
    'home_view','search','destination_select','nav_start','nav_progress','reroute','arrive','route_error'
  ))
  or
  (app = 'worldcup-market' and event in (
    'page_view','store_view','phone_click','map_pin_click','directions','language_change',
    'section_view','store_leave','my_location_click','location_fix',
    'nav_start','nav_progress','reroute','arrive'
  ))
) not valid;

-- The new K-Trip navigation events require an attempt UUID. No backfill of old rows.
alter table public.events add constraint events_market_navigation_id_check check (
  app <> 'worldcup-market'
  or event not in ('nav_start','nav_progress','reroute','arrive')
  or navigation_id is not null
) not valid;

-- Any K-Trip navigation coordinate MUST have an explicit storage consent flag;
-- WALK's existing coordinate contract remains unchanged.
alter table public.events drop constraint if exists events_coords_check;
alter table public.events add constraint events_coords_check check (
  (lat is null and lng is null and accuracy_m is null)
  or
  (app = 'walk' and event in ('nav_start','nav_progress','reroute','arrive')
    and lat is not null and lng is not null)
  or
  (app = 'worldcup-market' and geo_consent is true
    and event in ('location_fix','store_view','map_pin_click','nav_start','nav_progress','reroute','arrive')
    and lat is not null and lng is not null)
) not valid;

commit;
