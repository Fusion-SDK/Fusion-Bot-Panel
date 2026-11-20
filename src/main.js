import { createClient } from "@supabase/supabase-js";
import "./style.css";

const app = document.querySelector("#app");
const config = {
  url: import.meta.env.VITE_SUPABASE_URL,
  anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
  functionName: "panel-admin"
};

let supabase = null;
let currentSession = null;
let dashboardData = null;
let busy = false;
let activePanelPage = "overview";
let securityEvents = [];
let securityEventsLoading = false;
let securityEventsLoaded = false;
const configured = Boolean(config.url && config.anonKey);

if (configured) {
  supabase = createClient(config.url, config.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

function renderLogin(message = "") {
  app.innerHTML = `
    <main class="auth-shell">
      <section class="auth-card">
        <div class="brand-lockup"><div class="brand-mark">F</div><div><span class="eyebrow">FUSION SDK</span><h1>Control Panel</h1></div></div>
        <div class="auth-intro"><span class="status-dot"></span><span>PRIVATE ADMINISTRATION</span><h2>Welcome back.</h2><p>Sign in with your authorized Fusion administrator account.</p></div>
        ${!configured ? '<div class="notice warning">Supabase is not configured yet. Add the two VITE_SUPABASE values to your local environment before signing in.</div>' : ""}
        ${message ? `<div class="notice error">${escapeHtml(message)}</div>` : ""}
        <form id="login-form">
          <label for="email">Administrator email</label><input id="email" name="email" type="email" autocomplete="username" placeholder="you@example.com" required />
          <label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" placeholder="Your password" required />
          <button class="button primary full" type="submit" ${!configured || busy ? "disabled" : ""}>Sign in <span>→</span></button>
        </form>
        <p class="auth-footnote"><span class="lock-icon">⌑</span> Access is restricted by the Fusion backend. An account alone does not grant administrator access.</p>
      </section>
      <div class="auth-side"><div class="side-grid"></div><div class="side-content"><div class="side-kicker">FUSION / OPERATIONS</div><h2>One place to<br /><em>manage the bot.</em></h2><p>Command controls, verification settings, and operational visibility — built for the people who maintain Fusion.</p><div class="side-version">PRIVATE CONSOLE <span>•</span> V0.1.0</div></div></div>
    </main>`;
  document.querySelector("#login-form")?.addEventListener("submit", signIn);
}

function renderShell(content = "", currentPage = "overview") {
  const email = currentSession?.user?.email ?? "Administrator";
  app.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="sidebar-brand"><div class="brand-mark small">F</div><div><strong>FUSION</strong><span>CONTROL PANEL</span></div></div>
        <div class="workspace-label">WORKSPACE</div>
        <nav class="nav-list">
          <a class="nav-link ${currentPage === "overview" ? "active" : ""}" href="#overview"><span class="nav-icon">▦</span> Overview</a>
          <a class="nav-link" href="#commands"><span class="nav-icon">⌘</span> Commands <span class="nav-count">4</span></a>
          <a class="nav-link" href="#verification"><span class="nav-icon">◈</span> Verification</a>
          <a class="nav-link ${currentPage === "security" ? "active" : ""}" href="#security"><span class="nav-icon">⬡</span> Server security</a>
          <a class="nav-link ${currentPage === "servers" ? "active" : ""}" href="#servers"><span class="nav-icon">◎</span> Servers</a>
          <a class="nav-link ${currentPage === "roles" ? "active" : ""}" href="#roles"><span class="nav-icon">♙</span> Roles</a>
          <a class="nav-link ${currentPage === "channels" ? "active" : ""}" href="#channels"><span class="nav-icon">▤</span> Channels</a>
          <a class="nav-link ${currentPage === "permissions" ? "active" : ""}" href="#permissions"><span class="nav-icon">♙</span> Permissions</a>
          <a class="nav-link ${currentPage === "activity" ? "active" : ""}" href="#activity"><span class="nav-icon">◷</span> Activity log</a>
        </nav>
        <div class="sidebar-bottom"><div class="secure-label"><span class="status-dot"></span> SECURE SESSION</div><div class="profile-row"><div class="avatar">${escapeHtml(email.slice(0, 1).toUpperCase())}</div><div class="profile-copy"><strong>${escapeHtml(email)}</strong><span>Panel administrator</span></div><button class="icon-button" id="sign-out" aria-label="Sign out" title="Sign out">↗</button></div></div>
      </aside>
      <main class="main-area"><header class="topbar"><div class="breadcrumb">Fusion <span>/</span> <strong>${escapeHtml(currentPage.charAt(0).toUpperCase() + currentPage.slice(1))}</strong></div><div class="topbar-right"><span class="private-pill"><span></span> PRIVATE PANEL</span><span class="topbar-divider"></span><span class="topbar-caption">ADMIN CONSOLE</span></div></header><section class="page-content">${content}</section></main>
    </div>`;
  document.querySelector("#sign-out")?.addEventListener("click", signOut);
  document.querySelectorAll(".nav-link").forEach((link) => link.addEventListener("click", (event) => {
    event.preventDefault();
    const page = link.getAttribute("href").slice(1);
    document.querySelectorAll(".nav-link").forEach((item) => item.classList.toggle("active", item === link));
    renderPage(page);
  }));
}

function renderOverview() {
  const botStatus = dashboardData?.bot?.status ?? "Not connected";
  const guildCount = dashboardData?.bot?.guildCount ?? "—";
  const commands = Array.isArray(dashboardData?.commands) ? dashboardData.commands : [];
  const enabled = commands.filter((item) => item.enabled).length;
  return `
    <div class="page-heading"><div><div class="eyebrow">FUSION DISCORD / CONTROL CENTER</div><h1>Overview</h1><p>Your bot's configuration and operational status at a glance.</p></div><button class="button subtle" id="refresh">↻ <span>Refresh</span></button></div>
    <div class="notice ${dashboardData ? "success" : "warning"}">${dashboardData ? "Connected to the Fusion administration service." : "Dashboard interface is ready. The secure panel-admin backend function still needs to be deployed and configured."}</div>
    <div class="stats-grid">
      <article class="stat-card"><div class="stat-top"><span>BOT STATUS</span><span class="stat-icon">◉</span></div><div class="stat-value">${escapeHtml(botStatus)}</div><div class="stat-note"><span class="muted-dot"></span> Reported by backend</div></article>
      <article class="stat-card"><div class="stat-top"><span>COMMANDS ENABLED</span><span class="stat-icon">⌘</span></div><div class="stat-value">${dashboardData ? enabled + " / " + commands.length : "—"}</div><div class="stat-note">Managed configuration</div></article>
      <article class="stat-card"><div class="stat-top"><span>DISCORD SERVERS</span><span class="stat-icon">◎</span></div><div class="stat-value">${escapeHtml(guildCount)}</div><div class="stat-note">Live bot metric, when available</div></article>
    </div>
    <div class="section-heading"><div><h2>Quick management</h2><p>Common bot configuration areas.</p></div></div>
    <div class="quick-grid">
      <button class="quick-card" data-page="commands"><span class="quick-icon violet">⌘</span><strong>Command controls</strong><span>Enable or disable slash commands.</span><b>Open controls →</b></button>
      <button class="quick-card" data-page="verification"><span class="quick-icon blue">◈</span><strong>Account verification</strong><span>Manage Fusion account-linking settings.</span><b>Configure →</b></button>
      <button class="quick-card" data-page="permissions"><span class="quick-icon amber">♙</span><strong>Permissions</strong><span>Review who can use bot commands.</span><b>Manage access →</b></button>
    </div>
    <div class="section-heading lower"><div><h2>Security status</h2><p>Protection built into the control panel.</p></div></div>
    <div class="security-row"><span class="security-check">✓</span><div><strong>Authenticated session</strong><span>Your Supabase session is active.</span></div><span class="security-state">ACTIVE</span></div>
    <div class="security-row"><span class="security-check">✓</span><div><strong>Backend authorization required</strong><span>Admin access must be confirmed by the Edge Function on every request.</span></div><span class="security-state">ENFORCED BY API</span></div>
    <div class="security-row"><span class="security-check pending">!</span><div><strong>Admin API connection</strong><span>${dashboardData ? "The panel backend responded." : "Waiting for the panel-admin Edge Function."}</span></div><span class="security-state ${dashboardData ? "" : "pending-text"}">${dashboardData ? "CONNECTED" : "PENDING"}</span></div>`;
}

function renderCommands() {
  const commands = Array.isArray(dashboardData?.commands) ? dashboardData.commands : [];
  const rows = commands.map((command) => `
    <label class="setting-row">
      <span class="setting-copy"><strong>/${escapeHtml(command.name)}</strong><span>${command.name === "ping" ? "Basic bot responsiveness check." : command.name === "account-verify" ? "Start the Fusion account-linking process. Keep disabled until the in-game linking flow is ready." : command.name === "account-status" ? "Check the linked Fusion account status." : "Remove the current Fusion account link."}</span></span>
      <input class="setting-toggle" type="checkbox" data-command="${escapeHtml(command.name)}" ${command.enabled ? "checked" : ""} />
      <span class="toggle-ui" aria-hidden="true"></span>
    </label>`).join("");
  return `
    <div class="page-heading"><div><div class="eyebrow">FUSION DISCORD / CONFIGURATION</div><h1>Command controls</h1><p>Choose which slash commands the bot should make available.</p></div><button class="button primary" id="save-commands">Save changes</button></div>
    <div class="notice success">Settings are saved securely. Fusion Discord polls this configuration every 60 seconds, updates slash-command registration when settings change, and rejects disabled commands at runtime.</div>
    <div class="settings-panel"><div class="settings-panel-head"><div><h2>Slash commands</h2><p>Disabled commands should be hidden from the bot's command registration and rejected at execution time.</p></div><span class="settings-count">${commands.filter((item) => item.enabled).length} ENABLED</span></div>
      ${rows || '<p class="empty-copy">No command configuration was returned by the backend.</p>'}
    </div>
    <p class="save-feedback" id="command-feedback" role="status"></p>`;
}

function renderVerification() {
  const verification = dashboardData?.verification ?? { enabled: false, verifiedRoleId: null };
  return `
    <div class="page-heading"><div><div class="eyebrow">FUSION DISCORD / CONFIGURATION</div><h1>Verification settings</h1><p>Manage the Discord role used after a Fusion account is securely linked.</p></div><button class="button primary" id="save-verification">Save changes</button></div>
    <div class="notice warning">Account verification is currently gated off in the bot. Keep this disabled until the authenticated in-game linking flow is implemented and tested.</div>
    <div class="settings-panel">
      <div class="settings-panel-head"><div><h2>Account verification</h2><p>These settings are stored securely, but enabling them here does not bypass the bot's release gate.</p></div></div>
      <label class="setting-row"><span class="setting-copy"><strong>Enable verification</strong><span>Allow the verification feature when the bot implementation is ready.</span></span><input class="setting-toggle" id="verification-enabled" type="checkbox" ${verification.enabled ? "checked" : ""} /><span class="toggle-ui" aria-hidden="true"></span></label>
      <div class="field-setting"><label for="verified-role-id">Verified Discord role ID</label><input id="verified-role-id" inputmode="numeric" autocomplete="off" placeholder="e.g. 123456789012345678" value="${escapeHtml(verification.verifiedRoleId ?? "")}" /><p>Enter a Discord role ID, or leave blank if no role is configured.</p></div>
    </div>
    <p class="save-feedback" id="verification-feedback" role="status"></p>`;
}


let activeGuildSecurity = null;
let activeSecurityGuildId = "";
let guildDirectory = [];
let guildDirectoryLoading = false;
let guildDirectoryLoaded = false;
let guildResources = null;
let guildResourcesLoading = false;

function defaultGuildSecurity() {
  return {
    antiRaid: { enabled: false, joinThreshold: 6, windowSeconds: 10, alertChannelId: null },
    antiNuke: { enabled: false, eventThreshold: 4, windowSeconds: 10, alertChannelId: null },
    autoMod: { enabled: false, messageLimit: 6, windowSeconds: 8, mentionLimit: 5, alertChannelId: null },
    joinGate: { enabled: false, minimumAccountAgeDays: 7, flagBots: false, alertChannelId: null },
    lockdown: { enabled: false, logChannelId: null }
  };
}

function renderSecurity() {
  const security = activeGuildSecurity ?? defaultGuildSecurity();
  const channelInput = (id, label, value) => { const channels = (guildResources?.channels ?? []).filter((channel) => [0, 5].includes(channel.type)); return `<div class="field-setting"><label for="${id}">${label}</label><select id="${id}"><option value="">No channel selected</option>${channels.map((channel) => `<option value="${escapeHtml(channel.id)}" ${channel.id === value ? "selected" : ""}># ${escapeHtml(channel.name)}</option>`).join("")}</select><p>Choose from the automatically synchronized text channels.</p></div>`; };
  const toggle = (id, label, description, checked) => `<label class="setting-row"><span class="setting-copy"><strong>${label}</strong><span>${description}</span></span><input class="setting-toggle" id="${id}" type="checkbox" ${checked ? "checked" : ""} /><span class="toggle-ui" aria-hidden="true"></span></label>`;
  const number = (id, label, value, min, max) => `<div class="field-setting"><label for="${id}">${label}</label><input id="${id}" type="number" min="${min}" max="${max}" value="${value}" /></div>`;
  return `
    <div class="page-heading"><div><div class="eyebrow">FUSION SECURITY / SERVER CONFIGURATION</div><h1>Server security</h1><p>Configure independent protection settings for each Discord server.</p></div><button class="button primary" id="save-security">Save settings</button></div>
    <div class="notice warning">All security engines currently run in monitor-only mode. They report suspicious patterns but do not automatically punish members or change server permissions.</div>
    <div class="settings-panel">
      <div class="settings-panel-head"><div><h2>Your Discord servers</h2><p>Automatically discovered from the servers where Fusion Discord is installed.</p></div><button class="button subtle" id="refresh-guilds">Refresh</button></div>
      <div class="field-setting"><label for="security-guild-select">Select a server</label>
        <select id="security-guild-select" ${guildDirectory.length ? "" : "disabled"}>
          ${guildDirectory.length ? guildDirectory.map((guild) => `<option value="${escapeHtml(guild.guild_id)}" ${guild.guild_id === activeSecurityGuildId ? "selected" : ""}>${escapeHtml(guild.name)} · ${Number(guild.member_count ?? 0).toLocaleString()} members</option>`).join("") : '<option value="">No servers found yet</option>'}
        </select>
      </div>
      ${guildDirectory.length ? "" : '<p class="empty-copy">The bot has not reported any servers yet. Make sure it is online and the server-directory migration and Edge Function are deployed.</p>'}
    </div>
    ${activeGuildSecurity ? `
    <div class="settings-panel"><div class="settings-panel-head"><div><h2>Anti-Raid</h2><p>Detect unusually fast member joins.</p></div></div>
      ${toggle("sec-raid-enabled","Enable anti-raid monitor","Alert when join volume crosses the configured threshold.",security.antiRaid.enabled)}
      ${number("sec-raid-threshold","Join threshold",security.antiRaid.joinThreshold,2,100)}
      ${number("sec-raid-window","Time window (seconds)",security.antiRaid.windowSeconds,3,300)}
      ${channelInput("sec-raid-channel","Alert channel ID",security.antiRaid.alertChannelId)}
    </div>
    <div class="settings-panel"><div class="settings-panel-head"><div><h2>Anti-Nuke</h2><p>Detect bursts of sensitive server changes. Alerts are heuristic, not proof of malicious intent.</p></div></div>
      ${toggle("sec-nuke-enabled","Enable anti-nuke monitor","Watch channel, role, ban, and webhook event spikes.",security.antiNuke.enabled)}
      ${number("sec-nuke-threshold","Event threshold",security.antiNuke.eventThreshold,2,100)}
      ${number("sec-nuke-window","Time window (seconds)",security.antiNuke.windowSeconds,3,300)}
      ${channelInput("sec-nuke-channel","Alert channel ID",security.antiNuke.alertChannelId)}
    </div>
    <div class="settings-panel"><div class="settings-panel-head"><div><h2>AutoMod</h2><p>Identify message bursts, repeated messages, and mention floods.</p></div></div>
      ${toggle("sec-automod-enabled","Enable AutoMod monitor","Flag suspicious message patterns without deleting messages.",security.autoMod.enabled)}
      ${number("sec-automod-limit","Message limit",security.autoMod.messageLimit,3,50)}
      ${number("sec-automod-window","Time window (seconds)",security.autoMod.windowSeconds,3,120)}
      ${number("sec-automod-mentions","Mention limit",security.autoMod.mentionLimit,2,50)}
      ${channelInput("sec-automod-channel","Alert channel ID",security.autoMod.alertChannelId)}
    </div>
    <div class="settings-panel"><div class="settings-panel-head"><div><h2>Join Gate</h2><p>Flag newly created accounts and optionally bot accounts.</p></div></div>
      ${toggle("sec-joingate-enabled","Enable join gate monitor","Check account age when a member joins.",security.joinGate.enabled)}
      ${number("sec-joingate-age","Minimum account age (days)",security.joinGate.minimumAccountAgeDays,0,365)}
      ${toggle("sec-joingate-bots","Flag bot accounts","Include bot accounts in join alerts.",security.joinGate.flagBots)}
      ${channelInput("sec-joingate-channel","Alert channel ID",security.joinGate.alertChannelId)}
    </div>
    <div class="settings-panel"><div class="settings-panel-head"><div><h2>Emergency Lockdown</h2><p>Reserved configuration for a future moderator-confirmed lockdown workflow.</p></div></div>
      ${toggle("sec-lockdown-enabled","Enable lockdown controls","Does not lock anything in this release.",security.lockdown.enabled)}
      ${channelInput("sec-lockdown-channel","Lockdown log channel ID",security.lockdown.logChannelId)}
    </div>
    <p class="save-feedback" id="security-feedback" role="status"></p>` : `<div class="empty-state"><div class="empty-icon">⬡</div><h2>Select a server to begin</h2><p>Load a server ID to view or change its security configuration.</p></div>`}
  `;
}

async function loadGuildDirectory(force = false) {
  if (guildDirectoryLoading || (guildDirectoryLoaded && !force)) return;
  guildDirectoryLoading = true;
  const feedback = document.querySelector("#security-feedback");
  try {
    const result = await callPanel("get_guilds");
    guildDirectory = Array.isArray(result.guilds) ? result.guilds : [];
    guildDirectoryLoaded = true;
    if (!guildDirectory.some((guild) => guild.guild_id === activeSecurityGuildId)) {
      activeSecurityGuildId = guildDirectory[0]?.guild_id ?? "";
      activeGuildSecurity = null;
      guildResources = null;
    }
    renderPage(activePanelPage);
    if (activeSecurityGuildId && activePanelPage === "security" && !activeGuildSecurity) await loadGuildSecurity(activeSecurityGuildId);
    if (activeSecurityGuildId && ["roles", "channels"].includes(activePanelPage)) await loadGuildResources(activeSecurityGuildId);
  } catch (error) {
    if (feedback) feedback.textContent = "Could not load the bot's server list: " + error.message;
    const notice = document.querySelector(".notice");
    if (notice) notice.textContent = "Could not load Discord servers: " + error.message;
  } finally {
    guildDirectoryLoading = false;
  }
}

async function loadGuildSecurity(guildId = document.querySelector("#security-guild-select")?.value) {
  if (!guildId || !guildDirectory.some((guild) => guild.guild_id === guildId)) return;
  if (activeSecurityGuildId !== guildId) guildResources = null;
  activeSecurityGuildId = guildId;
  activeGuildSecurity = null;
  renderPage("security");
  try {
    const result = await callPanel("get_guild_security", { guildId });
    activeGuildSecurity = result.config;
    renderPage("security");
    if (!guildResources || activeSecurityGuildId !== guildId) await loadGuildResources(guildId);
  } catch (error) {
    const notice = document.querySelector(".notice");
    if (notice) notice.textContent = "Could not load server settings: " + error.message;
  }
}

async function saveGuildSecurity() {
  if (!activeGuildSecurity || !activeSecurityGuildId) return;
  const readNumber = (id) => Number(document.querySelector("#" + id)?.value);
  const readToggle = (id) => Boolean(document.querySelector("#" + id)?.checked);
  const readChannel = (id) => document.querySelector("#" + id)?.value.trim() || null;
  const config = {
    antiRaid: { enabled: readToggle("sec-raid-enabled"), joinThreshold: readNumber("sec-raid-threshold"), windowSeconds: readNumber("sec-raid-window"), alertChannelId: readChannel("sec-raid-channel") },
    antiNuke: { enabled: readToggle("sec-nuke-enabled"), eventThreshold: readNumber("sec-nuke-threshold"), windowSeconds: readNumber("sec-nuke-window"), alertChannelId: readChannel("sec-nuke-channel") },
    autoMod: { enabled: readToggle("sec-automod-enabled"), messageLimit: readNumber("sec-automod-limit"), windowSeconds: readNumber("sec-automod-window"), mentionLimit: readNumber("sec-automod-mentions"), alertChannelId: readChannel("sec-automod-channel") },
    joinGate: { enabled: readToggle("sec-joingate-enabled"), minimumAccountAgeDays: readNumber("sec-joingate-age"), flagBots: readToggle("sec-joingate-bots"), alertChannelId: readChannel("sec-joingate-channel") },
    lockdown: { enabled: readToggle("sec-lockdown-enabled"), logChannelId: readChannel("sec-lockdown-channel") }
  };
  const button = document.querySelector("#save-security");
  const feedback = document.querySelector("#security-feedback");
  if (button) button.disabled = true;
  if (feedback) feedback.textContent = "Saving server security settings…";
  try {
    const result = await callPanel("update_guild_security", { guildId: activeSecurityGuildId, config });
    activeGuildSecurity = result.config;
    renderPage("security");
    const status = document.querySelector("#security-feedback");
    if (status) status.textContent = "Server security settings saved.";
  } catch (error) {
    if (feedback) feedback.textContent = "Could not save: " + error.message;
    if (button) button.disabled = false;
  }
}

function renderResourcePage(page) {
  const selected = guildDirectory.find((guild) => guild.guild_id === activeSecurityGuildId);
  const selector = guildDirectory.length ? `
    <div class="field-setting"><label for="resource-guild-select">Select a server</label>
      <select id="resource-guild-select">${guildDirectory.map((guild) => `<option value="${escapeHtml(guild.guild_id)}" ${guild.guild_id === activeSecurityGuildId ? "selected" : ""}>${escapeHtml(guild.name)}</option>`).join("")}</select>
    </div>` : '<p class="empty-copy">No servers have been synchronized yet. Keep Fusion Discord online and confirm the server-directory setup.</p>';
  if (page === "servers") {
    const cards = guildDirectory.map((guild) => `
      <article class="security-row"><span class="security-check">◎</span><div><strong>${escapeHtml(guild.name)}</strong><span>${Number(guild.member_count ?? 0).toLocaleString()} members · Last sync ${escapeHtml(guild.updated_at ?? "unknown")}</span></div><button class="button subtle" data-open-server="${escapeHtml(guild.guild_id)}">View resources</button></article>`).join("");
    return `
      <div class="page-heading"><div><div class="eyebrow">FUSION DISCORD / SERVER DIRECTORY</div><h1>Servers</h1><p>Every Discord server currently connected to Fusion.</p></div><button class="button subtle" id="refresh-guilds">↻ Refresh</button></div>
      <div class="notice success">Server information is synchronized automatically by the bot. Server IDs are used internally.</div>
      <div class="settings-panel"><div class="settings-panel-head"><div><h2>Connected servers</h2><p>${guildDirectory.length} server(s) discovered</p></div></div>${cards || '<p class="empty-copy">Waiting for the bot to publish its server directory.</p>'}</div>`;
  }
  const rows = page === "roles" ? (guildResources?.roles ?? []).slice().sort((a,b) => b.position-a.position).map((role) => `
    <div class="security-row"><span class="security-check" style="background:#${Number(role.color).toString(16).padStart(6,"0")}22;color:#${Number(role.color).toString(16).padStart(6,"0")}">♙</span><div><strong>${escapeHtml(role.name)}</strong><span>Position ${role.position} · Permissions bitfield ${escapeHtml(role.permissions)} · ${role.managed ? "Managed by an integration" : "Standard role"}${role.hoist ? " · Displayed separately" : ""}${role.mentionable ? " · Mentionable" : ""}</span></div></div>`).join("") : (guildResources?.channels ?? []).slice().sort((a,b) => a.position-b.position).map((channel) => {
      const types = {0:"Text",1:"Direct message",2:"Voice",3:"Group direct message",4:"Category",5:"Announcement",10:"Announcement thread",11:"Public thread",12:"Private thread",13:"Stage",14:"Directory",15:"Forum",16:"Media"};
      return `<div class="security-row"><span class="security-check">▤</span><div><strong>${channel.type === 4 ? "▾ " : "# "}${escapeHtml(channel.name)}</strong><span>${escapeHtml(types[channel.type] ?? "Other channel")} · Position ${channel.position}${channel.parentId ? " · Category ID " + escapeHtml(channel.parentId) : ""}${channel.topic ? " · " + escapeHtml(channel.topic) : ""}${channel.nsfw ? " · Age-restricted" : ""}</span></div></div>`;
    }).join("");
  const title = page === "roles" ? "Roles" : "Channels";
  return `
    <div class="page-heading"><div><div class="eyebrow">FUSION DISCORD / SERVER RESOURCES</div><h1>${title}</h1><p>Browse synchronized ${page} for a selected Discord server.</p></div><button class="button subtle" id="refresh-resources">↻ Refresh</button></div>
    <div class="notice warning">Read-only directory in this release. Changes made directly in Discord appear after the next synchronization.</div>
    <div class="settings-panel"><div class="settings-panel-head"><div><h2>Server</h2><p>Choose from the automatically discovered server list.</p></div></div>${selector}</div>
    <div class="settings-panel"><div class="settings-panel-head"><div><h2>${title} ${guildResources ? "(" + (page === "roles" ? guildResources.roles.length : guildResources.channels.length) + ")" : ""}</h2><p>${selected ? "Latest snapshot: " + escapeHtml(guildResources?.updatedAt ?? "not synchronized") : "Select a server to view resources."}</p></div></div>
      ${guildResourcesLoading ? '<p class="empty-copy">Loading server resources…</p>' : rows || '<p class="empty-copy">No resource snapshot is available yet. Refresh after the bot has synchronized this server.</p>'}
    </div>`;
}

async function loadGuildResources(guildId = activeSecurityGuildId) {
  if (!guildId || !guildDirectory.some((guild) => guild.guild_id === guildId)) return;
  activeSecurityGuildId = guildId;
  guildResourcesLoading = true;
  guildResources = null;
  renderPage(activePanelPage);
  try {
    const result = await callPanel("get_guild_resources", { guildId });
    guildResources = {
      roles: Array.isArray(result.roles) ? result.roles : [],
      channels: Array.isArray(result.channels) ? result.channels : [],
      updatedAt: result.updatedAt
    };
  } catch (error) {
    const notice = document.querySelector(".notice");
    if (notice) notice.textContent = "Could not load server resources: " + error.message;
  } finally {
    guildResourcesLoading = false;
    renderPage(activePanelPage);
  }
}

function renderSecurityActivity() {
  const rows = securityEvents.map((event) => {
    const guild = guildDirectory.find((item) => item.guild_id === event.guild_id);
    const label = String(event.event_type ?? "security").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
    const timestamp = event.created_at ? new Date(event.created_at).toLocaleString() : "Unknown time";
    return '<article class="security-row"><span class="security-check pending">!</span><div><strong>' + escapeHtml(label) + " · " + escapeHtml(guild?.name ?? event.guild_id) + '</strong><span>' + escapeHtml(event.summary) + " · " + escapeHtml(timestamp) + '</span></div><span class="security-state pending-text">' + escapeHtml(String(event.severity ?? "warning").toUpperCase()) + '</span></article>';
  }).join("");
  return '<div class="page-heading"><div><div class="eyebrow">FUSION SECURITY / EVENT HISTORY</div><h1>Activity log</h1><p>Recent security detections reported by Fusion Discord across connected servers.</p></div><button class="button subtle" id="refresh-security-events">↻ Refresh</button></div>' +
    '<div class="notice warning">These are detection records, not proof of misconduct. The current protection engines remain monitor-only and do not automatically punish members.</div>' +
    '<div class="settings-panel"><div class="settings-panel-head"><div><h2>Security events</h2><p>Showing up to 100 most recent detections.</p></div></div>' + (securityEventsLoading ? '<p class="empty-copy">Loading security events…</p>' : rows || '<p class="empty-copy">No security events have been recorded yet. Events appear here when a configured monitor detects a pattern.</p>') + '</div>';
}

async function loadSecurityEvents(force = false) {
  if (securityEventsLoading || (securityEventsLoaded && !force)) return;
  securityEventsLoading = true;
  renderPage("activity");
  try { const result = await callPanel("get_security_events"); securityEvents = Array.isArray(result.events) ? result.events : []; }
  catch (error) { const notice = document.querySelector(".notice"); if (notice) notice.textContent = "Could not load security events: " + error.message; }
  finally { securityEventsLoading = false; securityEventsLoaded = true; renderPage("activity"); }
}

function renderPlaceholder(page) {
  const pages = {
    permissions: ["Permissions", "Review command access and administrator permissions.", "Permission management will be added after command settings are connected."],
    activity: ["Activity log", "Review security detections reported by the bot.", "Security event history is loading."]
  };
  const item = pages[page] ?? pages.permissions;
  return `<div class="page-heading"><div><div class="eyebrow">FUSION DISCORD / SETTINGS</div><h1>${item[0]}</h1><p>${item[1]}</p></div></div><div class="empty-state"><div class="empty-icon">◈</div><h2>Next integration step</h2><p>${item[2]}</p><span class="coming-soon">FOUNDATION IN PLACE</span></div>`;
}

async function saveCommands() {
  const feedback = document.querySelector("#command-feedback");
  const commands = Object.fromEntries((dashboardData?.commands ?? []).map((item) => [item.name, item.enabled]));
  document.querySelectorAll("[data-command]").forEach((input) => { commands[input.dataset.command] = input.checked; });
  const verification = dashboardData?.verification ?? { enabled: false, verifiedRoleId: null };
  const button = document.querySelector("#save-commands");
  if (button) button.disabled = true;
  if (feedback) feedback.textContent = "Saving…";
  try {
    const result = await callPanel("update_config", { config: { commands, verification } });
    dashboardData.commands = Object.entries(result.config.commands).map(([name, enabled]) => ({ name, enabled }));
    dashboardData.verification = result.config.verification;
    renderPage("commands");
    const status = document.querySelector("#command-feedback");
    if (status) status.textContent = "Command settings saved.";
  } catch (error) {
    if (feedback) feedback.textContent = `Could not save: ${error.message}`;
    if (button) button.disabled = false;
  }
}

async function saveVerification() {
  const feedback = document.querySelector("#verification-feedback");
  const commands = Object.fromEntries((dashboardData?.commands ?? []).map((item) => [item.name, item.enabled]));
  const enabled = document.querySelector("#verification-enabled")?.checked ?? false;
  const roleText = document.querySelector("#verified-role-id")?.value.trim() ?? "";
  const verification = { enabled, verifiedRoleId: roleText || null };
  const button = document.querySelector("#save-verification");
  if (button) button.disabled = true;
  if (feedback) feedback.textContent = "Saving…";
  try {
    const result = await callPanel("update_config", { config: { commands, verification } });
    dashboardData.commands = Object.entries(result.config.commands).map(([name, value]) => ({ name, enabled: value }));
    dashboardData.verification = result.config.verification;
    renderPage("verification");
    const status = document.querySelector("#verification-feedback");
    if (status) status.textContent = "Verification settings saved.";
  } catch (error) {
    if (feedback) feedback.textContent = `Could not save: ${error.message}`;
    if (button) button.disabled = false;
  }
}
const PANEL_PAGES = new Set(["overview", "commands", "verification", "security", "servers", "roles", "channels", "permissions", "activity"]);

function getRoutePage() {
  const requested = window.location.hash.replace(/^#/, "").trim().toLowerCase();
  return PANEL_PAGES.has(requested) ? requested : "overview";
}

function navigateToPage(page) {
  const nextPage = PANEL_PAGES.has(page) ? page : "overview";
  if (window.location.hash !== "#" + nextPage) {
    window.location.hash = nextPage;
  } else {
    renderPage(nextPage);
  }
}

function renderPage(page = "overview") {
  activePanelPage = page;
  renderShell(page === "overview" ? renderOverview() : page === "commands" ? renderCommands() : page === "verification" ? renderVerification() : page === "security" ? renderSecurity() : page === "activity" ? renderSecurityActivity() : ["servers", "roles", "channels"].includes(page) ? renderResourcePage(page) : renderPlaceholder(page), page);
  document.querySelector("#refresh")?.addEventListener("click", loadDashboard);
  document.querySelector("#save-commands")?.addEventListener("click", saveCommands);
  document.querySelector("#save-verification")?.addEventListener("click", saveVerification);
  document.querySelector("#security-guild-select")?.addEventListener("change", (event) => loadGuildSecurity(event.currentTarget.value));
  document.querySelector("#resource-guild-select")?.addEventListener("change", (event) => loadGuildResources(event.currentTarget.value));
  document.querySelector("#refresh-resources")?.addEventListener("click", () => loadGuildResources(activeSecurityGuildId));
  document.querySelectorAll("[data-open-server]").forEach((button) => button.addEventListener("click", () => { activeSecurityGuildId = button.dataset.openServer; guildResources = null; renderPage("roles"); }));
  document.querySelector("#refresh-guilds")?.addEventListener("click", () => loadGuildDirectory(true));
  document.querySelector("#refresh-security-events")?.addEventListener("click", () => loadSecurityEvents(true));
  document.querySelector("#save-security")?.addEventListener("click", saveGuildSecurity);
  document.querySelectorAll("[data-page]").forEach((button) => button.addEventListener("click", () => navigateToPage(button.dataset.page)));
  if (page === "activity" && currentSession && !securityEventsLoading) void loadSecurityEvents();
  if (["security", "servers", "roles", "channels"].includes(page) && !guildDirectoryLoaded) void loadGuildDirectory();
  if (["roles", "channels", "security"].includes(page) && guildDirectoryLoaded && activeSecurityGuildId && !guildResources && !guildResourcesLoading) void loadGuildResources(activeSecurityGuildId);
}

async function callPanel(action, payload = {}) {
  if (!supabase) throw new Error("Supabase is not configured.");

  // Read the session immediately before the request. The in-memory session can
  // be older than the persisted session after a token refresh in another tab.
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw new Error("Could not read your sign-in session: " + sessionError.message);

  let session = sessionData.session;
  if (!session) throw new Error("Your sign-in session has expired. Please sign in again.");

  // Refresh shortly before expiry so the Edge Function receives a usable JWT.
  if (session.expires_at && session.expires_at * 1000 <= Date.now() + 30_000) {
    const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError || !refreshData.session) {
      throw new Error("Your sign-in session could not be refreshed. Please sign in again.");
    }
    session = refreshData.session;
  }

  currentSession = session;
  const { data, error } = await supabase.functions.invoke(config.functionName, {
    body: { action, ...payload },
    headers: { Authorization: `Bearer ${session.access_token}` }
  });

  if (error) {
    let detail = error.message || "The panel API request failed.";
    const response = error.context;
    if (response && typeof response.clone === "function") {
      const copy = response.clone();
      const status = response.status ? `HTTP ${response.status}: ` : "";
      try {
        const body = await copy.json();
        detail = body?.error || body?.message || detail;
      } catch {
        try {
          const bodyText = await response.clone().text();
          if (bodyText) detail = bodyText.slice(0, 300);
        } catch {
          // Keep the SDK message when the response body is unavailable.
        }
      }
      detail = status + detail;
    }
    throw new Error(detail);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

async function loadDashboard() {
  if (busy) return;
  busy = true;
  const requestedPage = getRoutePage();
  renderPage(requestedPage);
  const refresh = document.querySelector("#refresh");
  if (refresh) refresh.disabled = true;
  try {
    dashboardData = await callPanel("get_dashboard");
    renderPage(getRoutePage());
  } catch (error) {
    dashboardData = null;
    renderPage(getRoutePage());
    const notice = document.querySelector(".notice");
    if (notice) {
      notice.className = "notice warning";
      notice.textContent = `Panel API unavailable: ${error.message}. Deploy the protected panel-admin Edge Function before using dashboard controls.`;
    }
  } finally {
    busy = false;
  }
}

async function signIn(event) {
  event.preventDefault();
  if (!supabase || busy) return;
  busy = true;
  const form = new FormData(event.currentTarget);
  const button = event.currentTarget.querySelector("button");
  button.disabled = true;
  button.textContent = "Signing in…";
  const { data, error } = await supabase.auth.signInWithPassword({
    email: String(form.get("email") || "").trim(),
    password: String(form.get("password") || "")
  });
  busy = false;
  if (error) {
    renderLogin(error.message);
    return;
  }
  currentSession = data.session;
  await loadDashboard();
}

async function signOut() {
  if (!supabase) return;
  await supabase.auth.signOut();
  currentSession = null;
  dashboardData = null;
  renderLogin();
}

async function start() {
  window.addEventListener("hashchange", () => {
    if (currentSession) renderPage(getRoutePage());
  });
  if (!configured) return renderLogin();
  const { data } = await supabase.auth.getSession();
  currentSession = data.session;
  if (currentSession) await loadDashboard();
  else renderLogin();
  supabase.auth.onAuthStateChange((_event, session) => {
    currentSession = session;
    if (!session) {
      dashboardData = null;
      renderLogin();
    }
  });
}

start().catch((error) => {
  console.error("Fusion Control failed to start:", error);
  renderLogin("The panel could not initialize. Check the browser console for details.");
});