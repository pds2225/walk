-- 기존 기록을 보존하고 신규 쓰기에만 동의 제약을 적용한다.
begin;
alter table public.events add column if not exists navigation_id uuid;
alter table public.events add column if not exists ingest_id uuid;
alter table public.events add column if not exists traffic_type text;
alter table public.events add column if not exists traffic_evidence text;
alter table public.qr_scans add column if not exists ingest_id uuid;
alter table public.qr_scans add column if not exists traffic_type text;
alter table public.qr_scans add column if not exists traffic_evidence text;
create unique index if not exists events_ingest_id_idx on public.events(ingest_id) where ingest_id is not null;
create unique index if not exists qr_scans_ingest_id_idx on public.qr_scans(ingest_id) where ingest_id is not null;
create index if not exists events_navigation_id_idx on public.events(navigation_id) where navigation_id is not null;
alter table public.events drop constraint if exists events_event_check;
alter table public.events add constraint events_event_check check (event in (
  'page_view','store_view','phone_click','map_pin_click','directions','language_change','section_view','store_leave','my_location_click','location_fix',
  'home_view','search','destination_select','nav_start','nav_progress','reroute','arrive','route_error','nav_stop')) not valid;
alter table public.events drop constraint if exists events_app_event_check;
alter table public.events add constraint events_app_event_check check (
  app = 'worldcup-market' or (app = 'walk' and event in (
    'home_view','search','destination_select','nav_start','nav_progress','reroute','arrive','route_error','nav_stop'))) not valid;
alter table public.events drop constraint if exists events_coords_check;
alter table public.events add constraint events_coords_check check (
  (lat is null and lng is null and accuracy_m is null)
  or (geo_consent is true and lat is not null and lng is not null and (
    event in ('nav_start','nav_progress','reroute','arrive')
    or (app='worldcup-market' and event in ('location_fix','store_view','map_pin_click'))))) not valid;
alter table public.events add constraint events_traffic_type_check check (traffic_type is null or traffic_type in ('production','test','unknown')) not valid;
alter table public.qr_scans add constraint qr_scans_traffic_type_check check (traffic_type is null or traffic_type in ('production','test','unknown')) not valid;

-- 기존 WCM 365일 작업을 변경하지 않고 WALK 좌표의 같은 기간 파기를 추가한다.
create extension if not exists pg_cron;
select cron.schedule('wcm-geo-retention', '10 19 * * *',
  $$update public.events set lat=null,lng=null,accuracy_m=null
    where app='worldcup-market' and lat is not null and created_at < now()-interval '365 days'$$);
select cron.schedule('walk-geo-retention', '20 19 * * *',
  $$update public.events set lat=null,lng=null,accuracy_m=null
    where app='walk' and lat is not null and created_at < now()-interval '365 days'$$);
commit;
