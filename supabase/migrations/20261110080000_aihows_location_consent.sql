-- AIHows optional third-party location disclosure. Never infer consent from geo_consent.
-- Apply only after verifying recipient legal identity, agreement and privacy notice.
create table if not exists public.aihows_location_consents (
  visitor_id text primary key,
  granted_at timestamptz,
  revoked_at timestamptz,
  notice_version text not null,
  recipient_legal_name text not null,
  updated_at timestamptz not null default now(),
  constraint aihows_consent_state check (granted_at is not null or revoked_at is not null)
);
create table if not exists public.aihows_location_consent_audit (
  id bigint generated always as identity primary key,
  visitor_id text not null,
  action text not null check (action in ('grant','revoke')),
  notice_version text not null,
  recorded_at timestamptz not null default now()
);
alter table public.aihows_location_consents enable row level security;
alter table public.aihows_location_consent_audit enable row level security;
revoke all on public.aihows_location_consents from anon, authenticated;
revoke all on public.aihows_location_consent_audit from anon, authenticated;
grant select, insert, update on public.aihows_location_consents to service_role;
grant select, insert on public.aihows_location_consent_audit to service_role;
grant usage, select on sequence public.aihows_location_consent_audit_id_seq to service_role;

-- A new event is shareable only if it was collected after an explicit consent,
-- consent remains active, and the existing location collection consent was true.
-- This view never exposes older events, revoked visitors or records >365 days old.
create or replace view public.aihows_shareable_location_events
with (security_barrier = true)
as
select e.id, e.created_at, e.event, e.visitor_id, e.session_id, e.store_id,
       e.lat, e.lng, e.accuracy_m, c.recipient_legal_name, c.notice_version
from public.events e
join public.aihows_location_consents c on c.visitor_id = e.visitor_id
where e.app = 'worldcup-market'
  and e.geo_consent is true
  and e.lat is not null and e.lng is not null
  and c.granted_at is not null
  and c.revoked_at is null
  and e.created_at > c.granted_at
  and e.created_at >= now() - interval '365 days';
revoke all on public.aihows_shareable_location_events from public, anon, authenticated;
grant select on public.aihows_shareable_location_events to service_role;
