-- Add the manual moderation command defaults to existing panel configuration.
alter table public.fusion_panel_config
  alter column config set default '{
    "commands": {
      "ping": true,
      "warn": false,
      "timeout": false,
      "kick": false,
      "ban": false,
      "purge": false,
      "account-verify": false,
      "account-status": false,
      "account-unlink": false
    },
    "verification": { "enabled": false, "verifiedRoleId": null }
  }'::jsonb;

update public.fusion_panel_config
set config = jsonb_set(
  jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(config, '{commands,warn}', 'true'::jsonb, true),
        '{commands,timeout}', 'true'::jsonb, true
      ),
      '{commands,kick}', 'true'::jsonb, true
    ),
    '{commands,ban}', 'true'::jsonb, true
  ),
  '{commands,purge}', 'true'::jsonb, true
)
where id = 1;

-- Persistent, private case history for moderator-initiated actions.
create table if not exists public.fusion_moderation_cases (
  id bigint generated always as identity primary key,
  guild_id text not null check (guild_id ~ '^[0-9]{17,20}$'),
  actor_user_id text not null check (actor_user_id ~ '^[0-9]{17,20}$'),
  target_user_id text check (target_user_id is null or target_user_id ~ '^[0-9]{17,20}$'),
  action text not null check (action in ('warn', 'timeout', 'kick', 'ban', 'purge')),
  reason text not null check (char_length(reason) between 1 and 500),
  duration_seconds integer check (duration_seconds is null or duration_seconds between 1 and 2419200),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists fusion_moderation_cases_guild_created_idx
  on public.fusion_moderation_cases (guild_id, created_at desc);
create index if not exists fusion_moderation_cases_target_created_idx
  on public.fusion_moderation_cases (target_user_id, created_at desc);

alter table public.fusion_moderation_cases enable row level security;
revoke all on public.fusion_moderation_cases from anon, authenticated;
grant all on public.fusion_moderation_cases to service_role;

comment on table public.fusion_moderation_cases is
  'Private moderation case history. Bot inserts require the dedicated bot secret; browser reads are mediated by panel-admin.';
