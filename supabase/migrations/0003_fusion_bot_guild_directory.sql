-- Discord servers discovered by the Fusion bot. IDs are internal keys, not user input.
create table if not exists public.fusion_bot_guilds (
  guild_id text primary key check (guild_id ~ '^\d{17,20}$'),
  name text not null check (char_length(name) between 1 and 100),
  icon_url text,
  member_count integer check (member_count is null or member_count >= 0),
  bot_joined_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.fusion_bot_guilds enable row level security;
revoke all on public.fusion_bot_guilds from anon, authenticated;
grant all on public.fusion_bot_guilds to service_role;

comment on table public.fusion_bot_guilds is
  'Server directory automatically synchronized by the trusted Fusion Discord bot. Browser access is only through panel-admin.';
