-- Append-only security event history emitted by the trusted Fusion Discord bot.
create table if not exists public.fusion_security_events (
  id bigint generated always as identity primary key,
  guild_id text not null check (guild_id ~ '^\d{17,20}$'),
  event_type text not null check (event_type in ('anti_raid','anti_nuke','auto_mod','join_gate','lockdown')),
  summary text not null check (char_length(summary) between 1 and 240),
  severity text not null default 'warning' check (severity in ('info','warning','critical')),
  created_at timestamptz not null default now()
);

create index if not exists fusion_security_events_guild_created_idx on public.fusion_security_events (guild_id, created_at desc);
alter table public.fusion_security_events enable row level security;
revoke all on public.fusion_security_events from anon, authenticated;
grant all on public.fusion_security_events to service_role;
grant usage, select on sequence public.fusion_security_events_id_seq to service_role;

comment on table public.fusion_security_events is 'Append-only monitor alerts from Fusion Discord; no member message content or personal identifiers are stored.';
