-- Enforce the account-linking release gate in existing stored configuration.
-- Linking remains disabled until the authenticated in-game flow is implemented and tested.
alter table public.fusion_panel_config
  alter column config set default '{
    "commands": {
      "ping": true,
      "account-verify": false,
      "account-status": false,
      "account-unlink": false
    },
    "verification": {
      "enabled": false,
      "verifiedRoleId": null
    }
  }'::jsonb;

update public.fusion_panel_config
set config = jsonb_set(
  jsonb_set(
    jsonb_set(
      jsonb_set(config, '{commands,account-verify}', 'false'::jsonb, true),
      '{commands,account-status}', 'false'::jsonb, true
    ),
    '{commands,account-unlink}', 'false'::jsonb, true
  ),
  '{verification}', '{"enabled":false,"verifiedRoleId":null}'::jsonb, true
),
updated_at = now()
where id = 1;
