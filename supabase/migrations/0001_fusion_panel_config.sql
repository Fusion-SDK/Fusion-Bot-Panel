-- Private configuration and audit storage for Fusion Bot Control Panel.
-- All browser access is mediated by the panel-admin Edge Function.

create table if not exists public.fusion_panel_config (
  id smallint primary key default 1 check (id = 1),
  config jsonb not null default '{
    "commands": {
      "ping": true,
      "account-verify": false,
      "account-status": true,
      "account-unlink": true
    },
    "verification": {
      "enabled": false,
      "verifiedRoleId": null
    }
  }'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.fusion_panel_audit (
  id bigint generated always as identity primary key,
  actor_user_id uuid,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.fusion_panel_config enable row level security;
alter table public.fusion_panel_audit enable row level security;

revoke all on public.fusion_panel_config from anon, authenticated;
revoke all on public.fusion_panel_audit from anon, authenticated;
grant all on public.fusion_panel_config to service_role;
grant all on public.fusion_panel_audit to service_role;
grant usage, select on sequence public.fusion_panel_audit_id_seq to service_role;

insert into public.fusion_panel_config (id)
values (1)
on conflict (id) do nothing;

comment on table public.fusion_panel_config is
  'Private Fusion Discord bot configuration. Access only through trusted Edge Functions.';
comment on table public.fusion_panel_audit is
  'Append-only administrative audit events for Fusion Bot Control Panel.';
