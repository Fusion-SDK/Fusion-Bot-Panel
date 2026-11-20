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
    "account-status": false,
    "account-unlink": false
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
    // Account linking remains locked until the authenticated in-game flow is released.
    commands[name] = name.startsWith("account-") ? false : enabled;
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
      enabled: false,
      verifiedRoleId: null
    }
  };
}


const DEFAULT_GUILD_SECURITY = {
  antiRaid: { enabled: false, joinThreshold: 6, windowSeconds: 10, alertChannelId: null },
  antiNuke: { enabled: false, eventThreshold: 4, windowSeconds: 10, alertChannelId: null },
  autoMod: { enabled: false, messageLimit: 6, windowSeconds: 8, mentionLimit: 5, alertChannelId: null },
  joinGate: { enabled: false, minimumAccountAgeDays: 7, flagBots: false, alertChannelId: null },
  lockdown: { enabled: false, logChannelId: null }
};
function validateGuildSecurity(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Security settings must be an object.");
  const value = input as Record<string, any>;
  const channel = (v: unknown) => v === null || (typeof v === "string" && /^\d{17,20}$/.test(v));
  const bounded = (v: unknown, min: number, max: number) => Number.isInteger(v) && Number(v) >= min && Number(v) <= max;
  for (const key of ["antiRaid", "antiNuke", "autoMod", "joinGate", "lockdown"]) {
    if (!value[key] || typeof value[key].enabled !== "boolean") throw new Error(key + " enabled must be true or false.");
  }
  const { antiRaid, antiNuke, autoMod, joinGate, lockdown } = value;
  if (!bounded(antiRaid.joinThreshold, 2, 100) || !bounded(antiRaid.windowSeconds, 3, 300) || !channel(antiRaid.alertChannelId)) throw new Error("Invalid anti-raid settings.");
  if (!bounded(antiNuke.eventThreshold, 2, 100) || !bounded(antiNuke.windowSeconds, 3, 300) || !channel(antiNuke.alertChannelId)) throw new Error("Invalid anti-nuke settings.");
  if (!bounded(autoMod.messageLimit, 3, 50) || !bounded(autoMod.windowSeconds, 3, 120) || !bounded(autoMod.mentionLimit, 2, 50) || !channel(autoMod.alertChannelId)) throw new Error("Invalid AutoMod settings.");
  if (!bounded(joinGate.minimumAccountAgeDays, 0, 365) || typeof joinGate.flagBots !== "boolean" || !channel(joinGate.alertChannelId)) throw new Error("Invalid join-gate settings.");
  if (!channel(lockdown.logChannelId)) throw new Error("Invalid lockdown log channel.");
  return {
    antiRaid: { enabled: antiRaid.enabled, joinThreshold: antiRaid.joinThreshold, windowSeconds: antiRaid.windowSeconds, alertChannelId: antiRaid.alertChannelId },
    antiNuke: { enabled: antiNuke.enabled, eventThreshold: antiNuke.eventThreshold, windowSeconds: antiNuke.windowSeconds, alertChannelId: antiNuke.alertChannelId },
    autoMod: { enabled: autoMod.enabled, messageLimit: autoMod.messageLimit, windowSeconds: autoMod.windowSeconds, mentionLimit: autoMod.mentionLimit, alertChannelId: autoMod.alertChannelId },
    joinGate: { enabled: joinGate.enabled, minimumAccountAgeDays: joinGate.minimumAccountAgeDays, flagBots: joinGate.flagBots, alertChannelId: joinGate.alertChannelId },
    lockdown: { enabled: lockdown.enabled, logChannelId: lockdown.logChannelId }
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > 1_048_576) return json({ error: "Request too large." }, 413);

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

  // Bot-originated security events are accepted only with the dedicated bot secret.
  if (body.action === "bot_log_security_event") {
    const supplied = request.headers.get("x-fusion-bot-secret") ?? "";
    if (!safeEqual(supplied, botSecret)) return json({ error: "Unauthorized." }, 401);
    const event = body.event as Record<string, unknown> | undefined;
    const allowedTypes = new Set(["anti_raid", "anti_nuke", "auto_mod", "join_gate", "lockdown"]);
    if (!event || typeof event.guildId !== "string" || !/^\d{17,20}$/.test(event.guildId) ||
        typeof event.eventType !== "string" || !allowedTypes.has(event.eventType) ||
        typeof event.summary !== "string" || event.summary.trim().length < 1 || event.summary.length > 240 ||
        event.severity !== "warning") return json({ error: "Invalid security event." }, 400);
    const { error } = await admin.from("fusion_security_events").insert({
      guild_id: event.guildId, event_type: event.eventType, summary: event.summary.trim(), severity: "warning"
    });
    if (error) return json({ error: "Could not record the security event." }, 500);
    return json({ ok: true });
  }


  if (body.action === "bot_sync_guilds") {
    const supplied = request.headers.get("x-fusion-bot-secret") ?? "";
    if (!safeEqual(supplied, botSecret)) return json({ error: "Unauthorized." }, 401);
    if (!Array.isArray(body.guilds) || body.guilds.length > 5000) return json({ error: "Invalid server directory payload." }, 400);
    const guilds = [];
    const seen = new Set<string>();
    for (const item of body.guilds) {
      if (!item || typeof item !== "object") return json({ error: "Invalid server entry." }, 400);
      const value = item as Record<string, unknown>;
      if (typeof value.id !== "string" || !/^\d{17,20}$/.test(value.id) || seen.has(value.id)) return json({ error: "Invalid or duplicate server ID." }, 400);
      if (typeof value.name !== "string" || value.name.trim().length < 1 || value.name.length > 100) return json({ error: "Invalid server name." }, 400);
      if (value.memberCount !== null && value.memberCount !== undefined && (!Number.isInteger(value.memberCount) || Number(value.memberCount) < 0)) return json({ error: "Invalid member count." }, 400);
      const iconUrl = value.iconUrl ?? null;
      if (iconUrl !== null && (typeof iconUrl !== "string" || iconUrl.length > 500 || !/^https:\/\/(cdn\.discordapp\.com|media\.discordapp\.net)\//.test(iconUrl))) return json({ error: "Invalid server icon URL." }, 400);
      const joinedAt = value.joinedAt ?? null;
      if (joinedAt !== null && (typeof joinedAt !== "string" || Number.isNaN(Date.parse(joinedAt)))) return json({ error: "Invalid bot join timestamp." }, 400);
      seen.add(value.id);
      guilds.push({
        guild_id: value.id,
        name: value.name.trim(),
        icon_url: iconUrl,
        member_count: value.memberCount ?? null,
        bot_joined_at: joinedAt,
        updated_at: new Date().toISOString()
      });
    }
    if (guilds.length > 0) {
      const { error } = await admin.from("fusion_bot_guilds").upsert(guilds, { onConflict: "guild_id" });
      if (error) return json({ error: "Could not synchronize the server directory." }, 500);
    }
    const { data: existing, error: listError } = await admin.from("fusion_bot_guilds").select("guild_id");
    if (listError) return json({ error: "Could not reconcile the server directory." }, 500);
    const staleIds = (existing ?? []).map((entry) => entry.guild_id).filter((id) => !seen.has(id));
    for (const staleId of staleIds) {
      const { error } = await admin.from("fusion_bot_guilds").delete().eq("guild_id", staleId);
      if (error) return json({ error: "Could not remove a server that the bot has left." }, 500);
    }
    return json({ ok: true, synchronized: guilds.length, removed: staleIds.length });
  }

  if (body.action === "bot_sync_guild_resources") {
    const supplied = request.headers.get("x-fusion-bot-secret") ?? "";
    if (!safeEqual(supplied, botSecret)) return json({ error: "Unauthorized." }, 401);
    if (!Array.isArray(body.guilds) || body.guilds.length > 5000) return json({ error: "Invalid resource directory payload." }, 400);
    const snapshots = [];
    const seen = new Set<string>();
    for (const item of body.guilds) {
      if (!item || typeof item !== "object" || Array.isArray(item)) return json({ error: "Invalid server resource entry." }, 400);
      const value = item as Record<string, unknown>;
      if (typeof value.guildId !== "string" || !/^\d{17,20}$/.test(value.guildId) || seen.has(value.guildId)) return json({ error: "Invalid or duplicate server ID." }, 400);
      if (!Array.isArray(value.roles) || value.roles.length > 250 || !Array.isArray(value.channels) || value.channels.length > 500) return json({ error: "Invalid role or channel collection." }, 400);
      const roles = [];
      for (const role of value.roles) {
        if (!role || typeof role !== "object" || Array.isArray(role)) return json({ error: "Invalid role entry." }, 400);
        const r = role as Record<string, unknown>;
        if (typeof r.id !== "string" || !/^\d{17,20}$/.test(r.id) ||
            typeof r.name !== "string" || r.name.length < 1 || r.name.length > 100 ||
            !Number.isInteger(r.color) || Number(r.color) < 0 || Number(r.color) > 16777215 ||
            !Number.isInteger(r.position) || Number(r.position) < 0 || Number(r.position) > 250 ||
            typeof r.permissions !== "string" || !/^\d{1,30}$/.test(r.permissions) ||
            typeof r.managed !== "boolean" || typeof r.mentionable !== "boolean" || typeof r.hoist !== "boolean") {
          return json({ error: "Invalid role metadata." }, 400);
        }
        roles.push({ id: r.id, name: r.name, color: r.color, position: r.position, permissions: r.permissions, managed: r.managed, mentionable: r.mentionable, hoist: r.hoist });
      }
      const channels = [];
      for (const channel of value.channels) {
        if (!channel || typeof channel !== "object" || Array.isArray(channel)) return json({ error: "Invalid channel entry." }, 400);
        const c = channel as Record<string, unknown>;
        if (typeof c.id !== "string" || !/^\d{17,20}$/.test(c.id) ||
            typeof c.name !== "string" || c.name.length < 1 || c.name.length > 100 ||
            !Number.isInteger(c.type) || Number(c.type) < 0 || Number(c.type) > 16 ||
            (c.parentId !== null && c.parentId !== undefined && (typeof c.parentId !== "string" || !/^\d{17,20}$/.test(c.parentId))) ||
            !Number.isInteger(c.position) || Number(c.position) < -1 || Number(c.position) > 500 ||
            (c.topic !== null && c.topic !== undefined && (typeof c.topic !== "string" || c.topic.length > 1024)) ||
            typeof c.nsfw !== "boolean") {
          return json({ error: "Invalid channel metadata." }, 400);
        }
        channels.push({ id: c.id, name: c.name, type: c.type, parentId: c.parentId ?? null, position: c.position, topic: c.topic ?? null, nsfw: c.nsfw });
      }
      seen.add(value.guildId);
      snapshots.push({ guild_id: value.guildId, roles, channels, updated_at: new Date().toISOString() });
    }
    if (snapshots.length > 0) {
      const { error } = await admin.from("fusion_bot_guild_resources").upsert(snapshots, { onConflict: "guild_id" });
      if (error) return json({ error: "Could not synchronize server resources." }, 500);
    }
    return json({ ok: true, synchronized: snapshots.length });
  }

  if (body.action === "bot_remove_guild") {
    const supplied = request.headers.get("x-fusion-bot-secret") ?? "";
    if (!safeEqual(supplied, botSecret)) return json({ error: "Unauthorized." }, 401);
    const guildId = body.guildId;
    if (typeof guildId !== "string" || !/^\d{17,20}$/.test(guildId)) return json({ error: "Invalid server ID." }, 400);
    const { error } = await admin.from("fusion_bot_guilds").delete().eq("guild_id", guildId);
    if (error) return json({ error: "Could not remove the server from the directory." }, 500);
    return json({ ok: true });
  }

  if (body.action === "bot_get_config") {
    const supplied = request.headers.get("x-fusion-bot-secret") ?? "";
    if (!safeEqual(supplied, botSecret)) return json({ error: "Unauthorized." }, 401);
    const { data, error } = await admin.from("fusion_panel_config")
      .select("config, updated_at").eq("id", 1).single();
    if (error) return json({ error: "Could not load bot configuration." }, 500);
    return json({ config: data.config, updatedAt: data.updated_at });
  }


  if (body.action === "bot_get_guild_security") {
    const supplied = request.headers.get("x-fusion-bot-secret") ?? "";
    if (!safeEqual(supplied, botSecret)) return json({ error: "Unauthorized." }, 401);
    const guildId = body.guildId;
    if (typeof guildId !== "string" || !/^\d{17,20}$/.test(guildId)) return json({ error: "A valid Discord server ID is required." }, 400);
    const { data, error } = await admin.from("fusion_guild_security").select("config, updated_at").eq("guild_id", guildId).maybeSingle();
    if (error) return json({ error: "Could not load server security settings." }, 500);
    return json({ guildId, config: data?.config ?? DEFAULT_GUILD_SECURITY, updatedAt: data?.updated_at ?? null });
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


  if (body.action === "get_security_events") {
    const guildId = body.guildId;
    if (guildId !== undefined && (typeof guildId !== "string" || !/^\d{17,20}$/.test(guildId))) return json({ error: "Invalid server ID." }, 400);
    let query = admin.from("fusion_security_events").select("id, guild_id, event_type, summary, severity, created_at").order("created_at", { ascending: false }).limit(100);
    if (typeof guildId === "string") query = query.eq("guild_id", guildId);
    const { data, error } = await query;
    if (error) return json({ error: "Could not load security events." }, 500);
    return json({ events: data ?? [] });
  }

  if (body.action === "get_guild_resources") {
    const guildId = body.guildId;
    if (typeof guildId !== "string" || !/^\d{17,20}$/.test(guildId)) return json({ error: "A valid Discord server ID is required." }, 400);
    const { data, error } = await admin.from("fusion_bot_guild_resources")
      .select("roles, channels, updated_at").eq("guild_id", guildId).maybeSingle();
    if (error) return json({ error: "Could not load server resources." }, 500);
    return json({ guildId, roles: data?.roles ?? [], channels: data?.channels ?? [], updatedAt: data?.updated_at ?? null });
  }

  if (body.action === "get_guilds") {
    const { data, error } = await admin.from("fusion_bot_guilds")
      .select("guild_id, name, icon_url, member_count, bot_joined_at, updated_at")
      .order("name", { ascending: true });
    if (error) return json({ error: "Could not load the bot server directory." }, 500);
    return json({ guilds: data ?? [] });
  }

  if (body.action === "get_dashboard") {
    const { data, error } = await admin.from("fusion_panel_config")
      .select("config, updated_at").eq("id", 1).single();
    if (error) return json({ error: "Could not load dashboard configuration." }, 500);
    const [{ count: guildCount, error: guildCountError }, { data: latestSync, error: syncError }] = await Promise.all([
      admin.from("fusion_bot_guilds").select("guild_id", { count: "exact", head: true }),
      admin.from("fusion_bot_guilds").select("updated_at").order("updated_at", { ascending: false }).limit(1)
    ]);
    const missingDirectory = guildCountError?.code === "42P01" || syncError?.code === "42P01";
    if ((guildCountError || syncError) && !missingDirectory) return json({ error: "Could not load bot status." }, 500);
    const lastSeenAt = latestSync?.[0]?.updated_at ?? null;
    const syncAge = lastSeenAt ? Date.now() - Date.parse(lastSeenAt) : Number.POSITIVE_INFINITY;
    const status = syncAge <= 150_000 ? "Online" : (guildCount ?? 0) > 0 ? "Last seen" : "Waiting for bot";
    const commands = Object.entries((data.config as typeof DEFAULT_CONFIG).commands)
      .map(([name, enabled]) => ({ name, enabled: name.startsWith("account-") ? false : enabled }));
    return json({
      bot: { status, guildCount: missingDirectory ? 0 : guildCount ?? 0, lastSeenAt },
      commands,
      verification: { enabled: false, verifiedRoleId: null },
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


  if (body.action === "get_guild_security" || body.action === "update_guild_security") {
    const guildId = body.guildId;
    if (typeof guildId !== "string" || !/^\d{17,20}$/.test(guildId)) return json({ error: "Enter a valid Discord server ID." }, 400);
    if (body.action === "get_guild_security") {
      const { data, error } = await admin.from("fusion_guild_security").select("config, updated_at").eq("guild_id", guildId).maybeSingle();
      if (error) return json({ error: "Could not load server security settings." }, 500);
      return json({ guildId, config: data?.config ?? DEFAULT_GUILD_SECURITY, updatedAt: data?.updated_at ?? null });
    }
    let security;
    try { security = validateGuildSecurity(body.config); }
    catch (error) { return json({ error: error instanceof Error ? error.message : "Invalid security settings." }, 400); }
    const { error } = await admin.from("fusion_guild_security").upsert({
      guild_id: guildId, config: security, updated_by: userData.user.id, updated_at: new Date().toISOString()
    }, { onConflict: "guild_id" });
    if (error) return json({ error: "Could not save server security settings." }, 500);
    await admin.from("fusion_panel_audit").insert({
      actor_user_id: userData.user.id, action: "update_guild_security", details: { guildId, config: security }
    });
    return json({ ok: true, guildId, config: security });
  }

  return json({ error: "Unknown action." }, 400);
});
