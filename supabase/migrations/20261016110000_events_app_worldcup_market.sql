-- Rename events.app 'ktrip' → 'worldcup-market' (World Cup Market rows). 'walk' unchanged.
alter table public.events drop constraint if exists events_app_check;
update public.events set app = 'worldcup-market' where app = 'ktrip';
alter table public.events alter column app set default 'worldcup-market';
alter table public.events add constraint events_app_check check (app in ('worldcup-market','walk'));
