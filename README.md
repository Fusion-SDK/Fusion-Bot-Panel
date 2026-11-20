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

## GitHub Pages deployment

The repository includes a GitHub Actions workflow that builds the Vite app and deploys only the generated `dist/` output. Do not configure Pages to publish the repository root or the `main` branch directly.

Before the first deployment:

1. In **Fusion-Bot-Panel → Settings → Secrets and variables → Actions → Variables**, add:
   - `VITE_SUPABASE_URL`: your Supabase project URL.
   - `VITE_SUPABASE_ANON_KEY`: your Supabase anon/publishable key.
2. In **Settings → Pages**, set **Build and deployment → Source** to **GitHub Actions**.
3. Merge the deployment workflow to `main`. The Actions workflow will build and publish the site.
4. Open the Pages URL shown in the successful **Deploy Fusion Control Panel** workflow run.

These two `VITE_*` values are public browser configuration, not secrets. Never add the Supabase service-role key, Discord bot token, or `FUSION_BOT_API_SECRET` as Vite variables.

If either public Supabase value is missing, the page will still display the sign-in screen but sign-in will be disabled with a configuration warning.

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

- Migrations: `supabase/migrations/0001` through `0007` (apply in numeric order).
- Edge Function: `supabase/functions/panel-admin/index.ts`
- Function config: `supabase/config.toml`

Apply all SQL migrations in order through `0007_fusion_moderation_cases.sql`, then deploy the current `panel-admin` Edge Function. Migration `0006` hard-locks account linking in stored configuration. Migration `0007` adds the moderator case table and command settings. The server directory requires `0003`; role and channel snapshots require `0004`; security history requires `0005`.

Configure these Edge Function secrets in Supabase:

| Secret | Value |
| --- | --- |
| `FUSION_PANEL_ADMIN_USER_ID` | Your own user's UUID from Supabase Authentication → Users |
| `FUSION_BOT_API_SECRET` | The same strong random value already configured for the Fusion Discord bot |

Supabase supplies `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to Edge Functions automatically. Do not copy the service-role key into the dashboard or bot.

Create your own Supabase Auth account before setting the admin UUID. Do not enable public sign-up just for the panel; create the owner account through the Supabase dashboard/invite flow. Only the exact configured UUID is authorized by the Edge Function.

The protected function supports authenticated dashboard/configuration reads and writes, server directory/resource reads, per-server security settings, security and administration audit history, and moderation case history. Bot-only synchronization and case/event writes require `x-fusion-bot-secret`; browser requests require the authenticated allowlisted administrator session. The bot polls command configuration and enforces disabled commands at runtime.

## Deployment privacy

Do not deploy this dashboard to a public URL until the access gateway and backend administrator allowlist are configured and tested. The private GitHub repository protects source access, not the deployed site itself.

## Current limitations

- The panel API does not expose Discord bot tokens or Supabase service credentials.
- The dashboard reports bot freshness from the latest server-directory sync; a bot with no connected servers has no directory heartbeat.
- The current administrator allowlist supports one configured Supabase Auth user; additional staff accounts and per-server staff roles are not implemented.
- Discord roles and channels are read-only snapshots in the panel.
- Security monitors remain alert-only. Automatic punishments and emergency lockdown are not enabled.
- Account verification and all three account-linking commands remain hard-disabled until authenticated in-game linking is implemented and tested.

## Fusion Security dashboard

The Server security page stores separate settings for each Discord server ID. Apply `0002_fusion_guild_security.sql` and `0005_fusion_security_events.sql` before using all security features. The owner-only `panel-admin` function validates all numeric ranges and channel IDs; browser clients have no direct table access.

The controls cover anti-raid, anti-nuke, AutoMod, Join Gate, and a reserved emergency-lockdown setting. The Activity log page combines recent security detections, panel configuration changes, and moderator case history. The bot-side security engines in the companion FusionDiscord repository are currently monitor-only. Manual `/warn`, `/timeout`, `/kick`, `/ban`, and `/purge` actions require the corresponding Discord permission and are written to the case table through the bot-secret endpoint. The panel controls do not enable automatic punishments.

Do not enable destructive automatic responses based solely on event-rate heuristics. Anti-nuke and AutoMod detections can have false positives; moderation actions and lockdown must remain permission-checked, auditable, and recoverable.


### Automatic server directory setup

Apply `supabase/migrations/0003_fusion_bot_guild_directory.sql` and redeploy the `panel-admin` Edge Function. The FusionDiscord bot then publishes its current server list on startup and every 60 seconds, and after server joins/leaves. The dashboard's Server security page reads this directory and presents a server selector; no one needs to manually enter server IDs. The bot reconciles the full list, so servers it has left disappear from the panel.


## Shared server resources

Apply `supabase/migrations/0004_fusion_bot_guild_resources.sql` after the server-directory migration. Redeploy the updated `panel-admin` Edge Function. The companion FusionDiscord bot publishes role and channel snapshots using the existing bot secret; no additional credentials are needed.

The creator panel exposes the same discovered server list to the Servers, Roles, Channels, and Server security pages. Role snapshots include role name, color, position, permissions bitfield, and managed/mentionable/hoist flags. Channel snapshots include name, type, category relationship, position, topic, and age-restricted flag.

Resource snapshots are read-only. This avoids giving a browser the ability to change server permissions or delete Discord resources. Any future write controls must call the bot through a server-side action endpoint, verify the actor and the bot's Discord permissions, reject managed roles and protected channels, and write an audit record.


## Security event history

Apply `supabase/migrations/0005_fusion_security_events.sql` and redeploy `panel-admin`. The bot reports monitor detections through the bot-secret-only `bot_log_security_event` action. Authenticated panel administrators can read the latest 100 events through `get_security_events`. Events store only the server ID, detection category, short summary, severity, and timestamp; message contents and member identifiers are not persisted. The Activity log is a detection history, not an enforcement or punishment system.


## Moderation case history

Apply `0007_fusion_moderation_cases.sql` and redeploy `panel-admin` before enabling manual moderation commands in the command editor. The moderation commands start disabled after migration and must be explicitly enabled in the panel. The bot records the moderator ID, target ID (when applicable), action, reason, duration, metadata, and timestamp. The Activity log displays the latest 100 cases. The table is protected by RLS and has no direct browser access; reads are mediated by the authenticated admin function and inserts require the bot secret.
