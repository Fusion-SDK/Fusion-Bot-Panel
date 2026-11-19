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

function renderShell(content = "") {
  const email = currentSession?.user?.email ?? "Administrator";
  app.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="sidebar-brand"><div class="brand-mark small">F</div><div><strong>FUSION</strong><span>CONTROL PANEL</span></div></div>
        <div class="workspace-label">WORKSPACE</div>
        <nav class="nav-list">
          <a class="nav-link active" href="#overview"><span class="nav-icon">▦</span> Overview</a>
          <a class="nav-link" href="#commands"><span class="nav-icon">⌘</span> Commands <span class="nav-count">4</span></a>
          <a class="nav-link" href="#verification"><span class="nav-icon">◈</span> Verification</a>
          <a class="nav-link" href="#permissions"><span class="nav-icon">♙</span> Permissions</a>
          <a class="nav-link" href="#activity"><span class="nav-icon">◷</span> Activity log</a>
        </nav>
        <div class="sidebar-bottom"><div class="secure-label"><span class="status-dot"></span> SECURE SESSION</div><div class="profile-row"><div class="avatar">${escapeHtml(email.slice(0, 1).toUpperCase())}</div><div class="profile-copy"><strong>${escapeHtml(email)}</strong><span>Panel administrator</span></div><button class="icon-button" id="sign-out" aria-label="Sign out" title="Sign out">↗</button></div></div>
      </aside>
      <main class="main-area"><header class="topbar"><div class="breadcrumb">Fusion <span>/</span> <strong>Overview</strong></div><div class="topbar-right"><span class="private-pill"><span></span> PRIVATE PANEL</span><span class="topbar-divider"></span><span class="topbar-caption">ADMIN CONSOLE</span></div></header><section class="page-content">${content}</section></main>
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
    <div class="notice warning">Saving updates the protected configuration. The bot will not enforce these settings until its configuration polling integration is installed.</div>
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

function renderPlaceholder(page) {
  const pages = {
    permissions: ["Permissions", "Review command access and administrator permissions.", "Permission management will be added after command settings are connected."],
    activity: ["Activity log", "Review administrative changes and bot events.", "Audit history will be connected in a later step."]
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
function renderPage(page = "overview") {
  renderShell(page === "overview" ? renderOverview() : page === "commands" ? renderCommands() : page === "verification" ? renderVerification() : renderPlaceholder(page));
  document.querySelector("#refresh")?.addEventListener("click", loadDashboard);
  document.querySelector("#save-commands")?.addEventListener("click", saveCommands);
  document.querySelector("#save-verification")?.addEventListener("click", saveVerification);
  document.querySelectorAll("[data-page]").forEach((button) => button.addEventListener("click", () => renderPage(button.dataset.page)));
}

async function callPanel(action, payload = {}) {
  if (!supabase || !currentSession) throw new Error("You must sign in first.");
  const { data, error } = await supabase.functions.invoke(config.functionName, { body: { action, ...payload } });
  if (error) throw new Error(error.message || "The panel API request failed.");
  if (data?.error) throw new Error(data.error);
  return data;
}

async function loadDashboard() {
  if (busy) return;
  busy = true;
  renderPage("overview");
  const refresh = document.querySelector("#refresh");
  if (refresh) refresh.disabled = true;
  try {
    dashboardData = await callPanel("get_dashboard");
    renderPage("overview");
  } catch (error) {
    dashboardData = null;
    renderPage("overview");
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