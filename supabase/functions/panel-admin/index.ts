import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-fusion-bot-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};

const DEFAULT_CONFIG = {
  commands: {
    ping: true,
    "account-verify": false,
    "account-status": true,
    "account-unlink": true
  },
  verification: { enabled: false, verifiedRoleId: null as string | null }
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders });

function safeEqual(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left[i] ^ right[i];
  return difference === 0;
}

function validateConfig(input: unknown) {
  if (!input || typeof input !== "object") throw new Error("Configuration must be an object.");
  const value = input as Record<string, unknown>;
  const commandInput = value.commands as Record<string, unknown> | undefined;
  const verificationInput = value.verification as Record<string, unknown> | undefined;
  const commands: Record<string, boolean> = {};
  for (const name of Object.keys(DEFAULT_CONFIG.commands)) {
    const enabled = commandInput?.[name];
    if (typeof enabled !== "boolean") throw new Error(`Command setting '${name}' must be true or false.`);
    commands[name] = enabled;
  }
  if (!verificationInput || typeof verificationInput.enabled !== "boolean") {
    throw new Error("Verification enabled must be true or false.");
  }
  const role = verificationInput.verifiedRoleId;
  if (role !== null && (typeof role !== "string" || !/^\d{17,20}$/.test(role))) {
    throw new Error("Verified role ID must be a valid Discord snowflake or null.");
  }
  return {
    commands,
    verification: {
      enabled: verificationInput.enabled,
      verifiedRoleId: role as string | null
    }
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > 8192) return json({ error: "Request too large." }, 413);

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
  } catch {
    return json({ error: "Invalid JSON request." }, 400);
  }

  const projectUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const adminUserId = Deno.env.get("FUSION_PANEL_ADMIN_USER_ID");
  const botSecret = Deno.env.get("FUSION_BOT_API_SECRET");
  if (!projectUrl || !anonKey || !serviceKey || !adminUserId || !botSecret) {
    return json({ error: "Panel backend is not fully configured." }, 503);
  }

  const admin = createClient(projectUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  // The bot uses its existing shared secret; it never receives service-role credentials.
  if (body.action === "bot_get_config") {
    const supplied = request.headers.get("x-fusion-bot-secret") ?? "";
    if (!safeEqual(supplied, botSecret)) return json({ error: "Unauthorized." }, 401);
    const { data, error } = await admin.from("fusion_panel_config")
      .select("config, updated_at").eq("id", 1).single();
    if (error) return json({ error: "Could not load bot configuration." }, 500);
    return json({ config: data.config, updatedAt: data.updated_at });
  }

  // Browser actions require a valid Supabase user session and an explicit creator allowlist.
  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) return json({ error: "Sign-in required." }, 401);
  const userClient = createClient(projectUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data: userData, error: userError } = await userClient.auth.getUser(match[1]);
  if (userError || !userData.user || userData.user.id !== adminUserId) {
    return json({ error: "You are not authorized to administer this bot." }, 403);
  }

  if (body.action === "get_dashboard") {
    const { data, error } = await admin.from("fusion_panel_config")
      .select("config, updated_at").eq("id", 1).single();
    if (error) return json({ error: "Could not load dashboard configuration." }, 500);
    const commands = Object.entries((data.config as typeof DEFAULT_CONFIG).commands)
      .map(([name, enabled]) => ({ name, enabled }));
    return json({
      bot: { status: "Configuration connected", guildCount: null },
      commands,
      verification: (data.config as typeof DEFAULT_CONFIG).verification,
      updatedAt: data.updated_at
    });
  }

  if (body.action === "update_config") {
    let config;
    try {
      config = validateConfig(body.config);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "Invalid configuration." }, 400);
    }
    const { error } = await admin.from("fusion_panel_config")
      .update({ config, updated_at: new Date().toISOString() }).eq("id", 1);
    if (error) return json({ error: "Could not save configuration." }, 500);
    await admin.from("fusion_panel_audit").insert({
      actor_user_id: userData.user.id,
      action: "update_config",
      details: { commands: config.commands, verification: config.verification }
    });
    return json({ ok: true, config });
  }

  return json({ error: "Unknown action." }, 400);
});
