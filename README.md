# Fusion Bot Panel

Private administration dashboard for the Fusion Discord bot.

## Security model

- Keep this repository private.
- The browser uses only the Supabase project URL and anon/publishable key.
- Supabase Auth handles administrator sign-in.
- The `panel-admin` Edge Function checks the authenticated user's immutable Supabase Auth ID against a server-side allowlist on every browser request.
- The dashboard does not write directly to configuration tables.
- The Discord bot authenticates to the configuration endpoint with the existing `FUSION_BOT_API_SECRET`.
- Never put a Supabase service-role key, Discord bot token, or `FUSION_BOT_API_SECRET` in frontend files, Vite variables, or committed files.

**A private repository does not make a deployed website private.** GitHub Pages deployments are public-facing unless the GitHub plan and Pages visibility settings explicitly support private publishing. For a genuinely private dashboard, use a hosting provider with an access gateway (for example, Cloudflare Access) and retain Supabase authorization as a second layer. An unlisted URL is not an access control.

## Local development

Requirements: Node.js 22 or newer.

1. Copy `.env.example` to `.env.local`.
2. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to the public project URL and anon/publishable key.
3. Install and start:

```bash
npm install
npm run dev
```

## Supabase backend setup

The first backend foundation is included in this repository:

- Migration: `supabase/migrations/0001_fusion_panel_config.sql`
- Edge Function: `supabase/functions/panel-admin/index.ts`
- Function config: `supabase/config.toml`

Apply the SQL migration in the Supabase SQL Editor, then deploy the `panel-admin` Edge Function.

Configure these Edge Function secrets in Supabase:

| Secret | Value |
| --- | --- |
| `FUSION_PANEL_ADMIN_USER_ID` | Your own user's UUID from Supabase Authentication → Users |
| `FUSION_BOT_API_SECRET` | The same strong random value already configured for the Fusion Discord bot |

Supabase supplies `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to Edge Functions automatically. Do not copy the service-role key into the dashboard or bot.

Create your own Supabase Auth account before setting the admin UUID. Do not enable public sign-up just for the panel; create the owner account through the Supabase dashboard/invite flow. Only the exact configured UUID is authorized by the Edge Function.

The function currently supports:

- `get_dashboard`: authenticated administrator reads the current settings.
- `update_config`: authenticated administrator saves validated command and verification settings.
- `bot_get_config`: the bot reads settings using `x-fusion-bot-secret`.

The frontend currently provides the login and overview foundation. The command editor and bot-side polling integration are subsequent steps; do not treat the dashboard as fully operational until those are implemented and tested.

## Deployment privacy

Do not deploy this dashboard to a public URL until the access gateway and backend administrator allowlist are configured and tested. The private GitHub repository protects source access, not the deployed site itself.

## Current limitations

- The panel API does not expose Discord bot tokens or Supabase service credentials.
- Bot status and server count are placeholders until a trusted bot heartbeat is implemented.
- Command settings are stored securely, but the bot does not yet fetch and enforce them.
- Account verification remains disabled until the authenticated in-game linking flow is implemented and deployed.
