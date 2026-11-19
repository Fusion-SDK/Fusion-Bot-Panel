-- Latest synchronized Discord role and channel metadata for each discovered server.
-- This is a read-only snapshot for the creator panel; Discord mutations are not exposed here.
create table if not exists public.fusion_bot_guild_resources (
  guild_id text primary key references public.fusion_bot_guilds(guild_id) on delete cascade,
  roles jsonb not null default '[]'::jsonb check (jsonb_typeof(roles) = 'array'),
  channels jsonb not null default '[]'::jsonb check (jsonb_typeof(channels) = 'array'),
  updated_at timestamptz not null default now()
);

alter table public.fusion_bot_guild_resources enable row level security;
revoke all on public.fusion_bot_guild_resources from anon, authenticated;
grant all on public.fusion_bot_guild_resources to service_role;

comment on table public.fusion_bot_guild_resources is
  'Read-only role and channel metadata snapshots published by the trusted Fusion Discord bot. Browser access is only through panel-admin.';
