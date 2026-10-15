-- my_location_click: "내 위치" button tap. No coordinates are ever sent or stored.
alter table public.events drop constraint if exists events_event_check;
alter table public.events add constraint events_event_check check (event in ('page_view','store_view','phone_click','map_pin_click','directions','language_change','section_view','store_leave','my_location_click'));
