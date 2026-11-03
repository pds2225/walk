-- PREPARED ONLY. Apply exclusively to an approved, empty market-only DB.
-- Never run this installation bundle on the existing WALK database.
begin;
do $$ begin
  if to_regclass('public.events') is not null or to_regclass('public.qr_scans') is not null
    or to_regclass('public.deployment_identity') is not null then
    raise exception 'Installation bootstrap requires an approved empty DB; existing tables found';
  end if;
end $$;
create table public.deployment_identity (
  singleton boolean primary key default true check (singleton),
  product_id text not null check (product_id = 'knavi'),
  installation_id text not null check (installation_id = 'mangwon-worldcup-market'),
  unique (product_id, installation_id)
);
insert into public.deployment_identity values (true, 'knavi', 'mangwon-worldcup-market');

create table public.events (
  id bigserial primary key,
  product_id text not null default 'knavi' check (product_id = 'knavi'),
  installation_id text not null default 'mangwon-worldcup-market' check (installation_id = 'mangwon-worldcup-market'),
  app text not null default 'worldcup-market' check (app = 'worldcup-market'),
  created_at timestamptz not null default now(),
  event text not null check (event in ('page_view','store_view','phone_click','map_pin_click','directions',
    'language_change','section_view','store_leave','my_location_click','location_fix',
    'home_view','search','destination_select','nav_start','nav_progress','reroute','arrive','route_error')),
  store_id text, store_no integer, locale text, src text,
  visitor_id text, session_id text, path text, user_agent text,
  dwell_sec integer check (dwell_sec between 0 and 86400),
  lat double precision check (lat between -90 and 90),
  lng double precision check (lng between -180 and 180),
  accuracy_m double precision check (accuracy_m >= 0 and accuracy_m < 'Infinity'::double precision),
  geo_consent boolean not null default false,
  query_len integer check (query_len between 0 and 200), error_type text,
  legacy_source_ref text, legacy_source_id text,
  check ((lat is null) = (lng is null)),
  check (lat is null or geo_consent),
  unique (legacy_source_ref, legacy_source_id),
  foreign key (product_id, installation_id) references public.deployment_identity(product_id, installation_id)
);
create index events_event_time_idx on public.events(event, created_at desc);
create index events_store_time_idx on public.events(store_id, created_at desc);

create table public.qr_scans (
  id bigserial primary key,
  product_id text not null default 'knavi' check (product_id = 'knavi'),
  installation_id text not null default 'mangwon-worldcup-market' check (installation_id = 'mangwon-worldcup-market'),
  scanned_at timestamptz not null default now(), store_id text not null, store_no integer,
  locale text, src text, visitor_id text, is_first_visit boolean, user_agent text, referrer text,
  legacy_source_ref text, legacy_source_id text,
  unique (legacy_source_ref, legacy_source_id),
  foreign key (product_id, installation_id) references public.deployment_identity(product_id, installation_id)
);
create index qr_scans_store_time_idx on public.qr_scans(store_id, scanned_at desc);

alter table public.deployment_identity enable row level security;
alter table public.events enable row level security;
alter table public.qr_scans enable row level security;
revoke all on public.deployment_identity, public.events, public.qr_scans from public, anon, authenticated, service_role;
revoke all on sequence public.events_id_seq, public.qr_scans_id_seq from public, anon, authenticated, service_role;
grant select on public.deployment_identity to service_role;
grant select, insert on public.events, public.qr_scans to service_role;
grant usage, select on sequence public.events_id_seq, public.qr_scans_id_seq to service_role;
commit;
