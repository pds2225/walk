-- WALK walking-nav app (/) step events, kept apart from K-TRIP (/worldcup-market) by the `app` column.
-- Never IP, raw search text or personal data. WALK nav events may carry the visitor's position
-- (lat/lng/accuracy) on nav_start, nav_progress, reroute, arrive; K-TRIP rows never do.
alter table public.events add column if not exists app text not null default 'ktrip';
alter table public.events add column if not exists query_len integer check (query_len is null or (query_len >= 0 and query_len <= 200));
alter table public.events add column if not exists error_type text check (error_type is null or error_type in ('location','route_http','route_network','reroute_http','reroute_network','search_http','search_network'));
alter table public.events drop constraint if exists events_app_check;
alter table public.events add constraint events_app_check check (app in ('ktrip','walk'));
alter table public.events drop constraint if exists events_event_check;
alter table public.events add constraint events_event_check check (event in (
  'page_view','store_view','phone_click','map_pin_click','directions','language_change','section_view','store_leave','my_location_click',
  'home_view','search','destination_select','nav_start','nav_progress','reroute','arrive','route_error'));
-- Each event belongs to exactly one product.
alter table public.events drop constraint if exists events_app_event_check;
alter table public.events add constraint events_app_event_check check (
  (app = 'walk') = (event in ('home_view','search','destination_select','nav_start','nav_progress','reroute','arrive','route_error')));
alter table public.events add column if not exists lat double precision check (lat is null or (lat between -90 and 90));
alter table public.events add column if not exists lng double precision check (lng is null or (lng between -180 and 180));
alter table public.events add column if not exists accuracy_m real check (accuracy_m is null or (accuracy_m >= 0 and accuracy_m <= 100000));
alter table public.events drop constraint if exists events_coords_check;
alter table public.events add constraint events_coords_check check (
  (lat is null and lng is null and accuracy_m is null)
  or (app = 'walk' and event in ('nav_start','nav_progress','reroute','arrive') and lat is not null and lng is not null));
create index if not exists events_app_created_at_idx on public.events (app, created_at desc);
