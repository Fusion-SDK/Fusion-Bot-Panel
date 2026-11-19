# Fusion Bot Panel

Private administration dashboard for the Fusion Discord bot.

## Security model

- Keep this repository private.
- The browser uses only the Supabase project URL and anon/publishable key.
- Supabase Auth handles administrator sign-in.
- A protected `panel-admin` Edge Function must authorize the signed-in user on every request.
- The dashboard does not write directly to configuration tables.
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

## Backend contract

The dashboard expects a Supabase Edge Function named `panel-admin`. It is not included in this frontend foundation. The function must:

1. Validate the Supabase access token and resolve the authenticated user.
2. Check that the user's immutable Supabase Auth ID is on a server-side administrator allowlist.
3. Reject all other users, even if they can create a normal Supabase account.
4. Support the `get_dashboard` action used by the initial dashboard.
5. Later support narrowly scoped command, verification, permission, and audit-log actions.
6. Use service-role credentials only inside the Edge Function runtime; never return secrets to the browser.

The current UI deliberately shows backend integration as pending until that function exists. It does not pretend that login alone grants bot administration access.

## Deployment

Do not deploy this dashboard to a public URL until the access gateway and the backend administrator allowlist are configured and tested. The private GitHub repository protects source access, not the deployed site itself.
