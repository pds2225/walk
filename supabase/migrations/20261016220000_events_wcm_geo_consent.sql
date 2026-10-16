-- Worldcup Market: store coordinates only with explicit user consent (Dasom 2026-10-16). Never IP.
alter table public.events add column if not exists geo_consent boolean;

alter table public.events drop constraint if exists events_event_check;
alter table public.events add constraint events_event_check check (event = any (array[
  'page_view','store_view','phone_click','map_pin_click','directions','language_change','section_view','store_leave','my_location_click','location_fix',
  'home_view','search','destination_select','nav_start','nav_progress','reroute','arrive','route_error']));

alter table public.events drop constraint if exists events_coords_check;
alter table public.events add constraint events_coords_check check (
  (lat is null and lng is null and accuracy_m is null)
  or (app = 'walk' and event = any (array['nav_start','nav_progress','reroute','arrive']) and lat is not null and lng is not null)
  or (app = 'worldcup-market' and geo_consent is true and event = any (array['location_fix','store_view','map_pin_click']) and lat is not null and lng is not null)
);

-- Retention: consented Worldcup Market coordinates are cleared after 1 year (daily, 04:10 KST).
create extension if not exists pg_cron;
select cron.schedule('wcm-geo-retention', '10 19 * * *',
  $$update public.events set lat = null, lng = null, accuracy_m = null
    where app = 'worldcup-market' and lat is not null and created_at < now() - interval '365 days'$$);
