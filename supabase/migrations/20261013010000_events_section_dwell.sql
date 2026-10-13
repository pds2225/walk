-- section_view (store detail scroll depth) and store_leave (dwell seconds).
alter table public.events add column if not exists dwell_sec integer check (dwell_sec is null or (dwell_sec >= 0 and dwell_sec <= 86400));
alter table public.events drop constraint if exists events_event_check;
alter table public.events add constraint events_event_check check (event in ('page_view','store_view','phone_click','map_pin_click','directions','language_change','section_view','store_leave'));
