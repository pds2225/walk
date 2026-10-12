-- K-Trip World Cup Market: one row per QR-originated visit. No IP stored.
create table if not exists public.qr_scans (
  id bigserial primary key,
  scanned_at timestamptz not null default now(),
  store_id text not null,
  store_no int,
  locale text,
  src text,
  user_agent text,
  referrer text,
  visitor_id text,
  is_first_visit boolean
);
create index if not exists qr_scans_store_id_scanned_at_idx on public.qr_scans (store_id, scanned_at desc);
alter table public.qr_scans enable row level security;
-- No policies on purpose: anon/authenticated get nothing. Inserts happen
-- server-side in /api/qr-scan with the service-role (secret) key.
revoke all on table public.qr_scans from anon, authenticated;
revoke all on sequence public.qr_scans_id_seq from anon, authenticated;
