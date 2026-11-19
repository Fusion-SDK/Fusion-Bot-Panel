-- Per-server Fusion Security settings. The browser cannot access this table directly.
create table if not exists public.fusion_guild_security (
  guild_id text primary key check (guild_id ~ '^\d{17,20}$'),
  config jsonb not null default '{
    "antiRaid": { "enabled": false, "joinThreshold": 6, "windowSeconds": 10, "alertChannelId": null },
    "antiNuke": { "enabled": false, "eventThreshold": 4, "windowSeconds": 10, "alertChannelId": null },
    "autoMod": { "enabled": false, "messageLimit": 6, "windowSeconds": 8, "mentionLimit": 5, "alertChannelId": null },
    "joinGate": { "enabled": false, "minimumAccountAgeDays": 7, "flagBots": false, "alertChannelId": null },
    "lockdown": { "enabled": false, "logChannelId": null }
  }'::jsonb,
  updated_by uuid,
  updated_at timestamptz not null default now()
);

alter table public.fusion_guild_security enable row level security;
revoke all on public.fusion_guild_security from anon, authenticated;
grant all on public.fusion_guild_security to service_role;

comment on table public.fusion_guild_security is
  'Per-Discord-server Fusion Security configuration, accessible only through the trusted panel-admin Edge Function.';
