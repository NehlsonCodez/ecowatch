/**
 * EcoWatch frontend application.
 * A small hand-rolled SPA: one HTML shell, views swapped by JS,
 * polling the backend every few seconds for "live" data.
 */

const state = {
  user: null,
  view: "dashboard",
  rooms: [],
  devices: [],
  alerts: [],
  selectedRoomId: null,
  alertsFilter: "unresolved",
  reportTab: "today",
  powerHistory: [], // client-side rolling sparkline of total power
};

const POLL_MS = 5000;
let pollTimer = null;

const DEVICE_ICONS = {
  TV: "📺",
  Fridge: "🧊",
  AC: "❄️",
  Light: "💡",
  Heater: "🔥",
  "Washing Machine": "🧺",
  Dishwasher: "🍽️",
  Microwave: "⏲️",
  Computer: "🖥️",
  "EV Charger": "🔌",
  Other: "⚡",
};
const ROOM_ICONS = {
  sofa: "🛋️", kitchen: "🍳", bed: "🛏️", garage: "🚗", office: "💻", home: "🏠",
};

const DEVICE_TYPES = ["TV", "Fridge", "AC", "Light", "Heater", "Washing Machine", "Dishwasher", "Microwave", "Computer", "EV Charger", "Other"];

// ---------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------
function fmtWatts(w) {
  if (w >= 1000) return (w / 1000).toFixed(2) + " kW";
  return Math.round(w) + " W";
}
function fmtCost(c) {
  return "$" + (c || 0).toFixed(2);
}
function fmtCostPrecise(c) {
  return "$" + (c || 0).toFixed(4);
}
function fmtWh(wh) {
  if (wh >= 1000) return (wh / 1000).toFixed(2) + " kWh";
  return Math.round(wh) + " Wh";
}
function timeAgo(iso) {
  const diff = (Date.now() - new Date(iso + "Z").getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return Math.floor(diff / 60) + "m ago";
  if (diff < 86400) return Math.floor(diff / 3600) + "h ago";
  return Math.floor(diff / 86400) + "d ago";
}
function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s ?? "";
  return div.innerHTML;
}

// ---------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------
function toast(message, type = "default") {
  const container = document.getElementById("toast-container");
  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => el.remove(), 3800);
}

// ---------------------------------------------------------------
// Modal
// ---------------------------------------------------------------
function openModal(html) {
  const backdrop = document.getElementById("modal-backdrop");
  const modal = document.getElementById("modal");
  modal.innerHTML = html;
  backdrop.hidden = false;
  modal.querySelectorAll("[data-close-modal]").forEach((el) => el.addEventListener("click", closeModal));
}
function closeModal() {
  document.getElementById("modal-backdrop").hidden = true;
  document.getElementById("modal").innerHTML = "";
}
document.getElementById("modal-backdrop").addEventListener("click", (e) => {
  if (e.target.id === "modal-backdrop") closeModal();
});

// ---------------------------------------------------------------
// Auth screen
// ---------------------------------------------------------------
function initAuthScreen() {
  document.querySelectorAll(".auth-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".auth-tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      const isLogin = tab.dataset.tab === "login";
      document.getElementById("login-form").hidden = !isLogin;
      document.getElementById("register-form").hidden = isLogin;
    });
  });

  document.getElementById("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const errBox = document.getElementById("login-error");
    errBox.hidden = true;
    const fd = new FormData(e.target);
    try {
      const res = await API.login(fd.get("username"), fd.get("password"));
      API.setToken(res.access_token);
      state.user = res.user;
      await bootApp();
    } catch (err) {
      errBox.textContent = err.message || "Login failed.";
      errBox.hidden = false;
    }
  });

  document.getElementById("register-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const errBox = document.getElementById("register-error");
    errBox.hidden = true;
    const fd = new FormData(e.target);
    try {
      const res = await API.register({
        username: fd.get("username"),
        full_name: fd.get("full_name"),
        password: fd.get("password"),
        role: fd.get("role"),
      });
      API.setToken(res.access_token);
      state.user = res.user;
      await bootApp();
    } catch (err) {
      errBox.textContent = err.message || "Could not create account.";
      errBox.hidden = false;
    }
  });
}

function showAuthScreen() {
  document.getElementById("auth-screen").hidden = false;
  document.getElementById("app-shell").hidden = true;
  if (pollTimer) clearInterval(pollTimer);
}

// ---------------------------------------------------------------
// App shell / navigation
// ---------------------------------------------------------------
function initNav() {
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.addEventListener("click", () => switchView(item.dataset.view));
  });
  document.getElementById("logout-btn").addEventListener("click", () => {
    API.clearToken();
    state.user = null;
    if (pollTimer) clearInterval(pollTimer);
    showAuthScreen();
  });
}

const VIEW_META = {
  dashboard: ["Dashboard", "Live view of your home's electricity use"],
  rooms: ["Rooms", "Consumption broken down by room"],
  devices: ["Devices", "Turn devices on or off and watch their live draw"],
  reports: ["Reports", "Usage and cost over time"],
  alerts: ["Alerts", "Notifications about unusual power draw"],
  admin: ["Admin", "Manage rooms and devices"],
};

async function switchView(view) {
  if (view === "admin" && state.user.role !== "admin") return;
  state.view = view;
  document.querySelectorAll(".nav-item").forEach((el) => el.classList.toggle("active", el.dataset.view === view));
  const [title, sub] = VIEW_META[view];
  document.getElementById("page-title").textContent = title;
  document.getElementById("page-subtitle").textContent = sub;
  await renderView();
}

async function renderView() {
  const container = document.getElementById("view-container");
  container.innerHTML = `<div class="loading-row">Loading…</div>`;
  try {
    if (state.view === "dashboard") await renderDashboard(container);
    else if (state.view === "rooms") await renderRooms(container);
    else if (state.view === "devices") await renderDevices(container);
    else if (state.view === "reports") await renderReports(container);
    else if (state.view === "alerts") await renderAlerts(container);
    else if (state.view === "admin") await renderAdmin(container);
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><h3>Something went wrong</h3><p>${escapeHtml(err.message)}</p></div>`;
  }
}

// ---------------------------------------------------------------
// Dashboard view
// ---------------------------------------------------------------
async function renderDashboard(container) {
  const summary = await API.dashboardSummary();

  state.powerHistory.push(summary.total_power_w);
  if (state.powerHistory.length > 40) state.powerHistory.shift();

  const activeRatio = summary.total_devices ? Math.round((summary.active_devices / summary.total_devices) * 100) : 0;

  container.innerHTML = `
    <div class="grid grid-2 mb-16">
      <div class="hero-card">
        <div class="hero-label">Total power draw right now</div>
        <div class="hero-value">${Math.round(summary.total_power_w).toLocaleString()}<span class="unit">watts</span></div>
        <div class="hero-sub">${summary.active_devices} of ${summary.total_devices} devices active (${activeRatio}%) · $${summary.rate_per_kwh.toFixed(2)}/kWh</div>
        <canvas class="hero-chart" id="hero-sparkline"></canvas>
      </div>

      <div class="grid" style="grid-template-columns: 1fr 1fr; gap: 18px;">
        <div class="card stat-card">
          <span class="stat-label">Estimated cost today</span>
          <span class="stat-value amber">${fmtCost(summary.estimated_cost_today)}</span>
          <span class="stat-foot">since midnight</span>
        </div>
        <div class="card stat-card">
          <span class="stat-label">Active devices</span>
          <span class="stat-value green">${summary.active_devices}</span>
          <span class="stat-foot">of ${summary.total_devices} total</span>
        </div>
        <div class="card stat-card">
          <span class="stat-label">Unresolved alerts</span>
          <span class="stat-value ${summary.unresolved_alerts > 0 ? "red" : ""}">${summary.unresolved_alerts}</span>
          <span class="stat-foot">${summary.unresolved_alerts > 0 ? "needs attention" : "all clear"}</span>
        </div>
        <div class="card stat-card">
          <span class="stat-label">Rooms monitored</span>
          <span class="stat-value">${summary.rooms.length}</span>
          <span class="stat-foot">across your home</span>
        </div>
      </div>
    </div>

    <div class="grid grid-2">
      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">Power by room</div>
            <div class="card-title-sub">Current draw, highest first</div>
          </div>
        </div>
        ${summary.rooms.map((r) => roomBarRow(r, summary.total_power_w)).join("") || `<div class="empty-state"><p>No rooms yet.</p></div>`}
      </div>

      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">Top consumers</div>
            <div class="card-title-sub">Highest draw right now</div>
          </div>
        </div>
        <table class="table">
          <thead><tr><th>Device</th><th>Room</th><th style="text-align:right">Power</th></tr></thead>
          <tbody>
            ${summary.top_consumers.map((d) => `
              <tr>
                <td>${DEVICE_ICONS[d.type] || "⚡"} ${escapeHtml(d.name)}</td>
                <td class="text-muted">${escapeHtml(d.room_name || "")}</td>
                <td class="num">${fmtWatts(d.current_power_w)}</td>
              </tr>`).join("") || `<tr><td colspan="3" class="text-muted">No devices yet.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;

  Charts.sparkline(document.getElementById("hero-sparkline"), state.powerHistory);
}

function roomBarRow(room, totalPower) {
  const pct = totalPower > 0 ? Math.max(2, Math.round((room.current_power_w / totalPower) * 100)) : 0;
  return `
    <div style="margin-bottom:14px;">
      <div class="flex-between" style="margin-bottom:6px;">
        <span style="font-size:13.5px;font-weight:500;">${escapeHtml(room.room_name)}</span>
        <span style="font-size:13px;color:var(--text-1);font-family:var(--font-display);font-weight:600;">${fmtWatts(room.current_power_w)}</span>
      </div>
      <div style="background:var(--bg-2); border-radius:20px; height:7px; overflow:hidden;">
        <div style="width:${pct}%; height:100%; background:linear-gradient(90deg,var(--amber),#c97f1f); border-radius:20px;"></div>
      </div>
    </div>`;
}

// ---------------------------------------------------------------
// Rooms view
// ---------------------------------------------------------------
async function renderRooms(container) {
  const rooms = await API.listRooms();
  state.rooms = rooms;

  container.innerHTML = `
    <div class="grid grid-rooms">
      ${rooms.map((r) => `
        <div class="room-card" data-room-id="${r.id}">
          <div class="room-icon">${ROOM_ICONS[r.icon] || "🏠"}</div>
          <div class="room-name">${escapeHtml(r.name)}</div>
          <div class="room-floor">${escapeHtml(r.floor || "")}</div>
          <div class="room-power">${fmtWatts(r.current_power_w)}</div>
          <div class="room-meta">${r.active_device_count} of ${r.device_count} devices on</div>
        </div>
      `).join("") || `<div class="empty-state"><h3>No rooms yet</h3><p>Ask an admin to add a room.</p></div>`}
    </div>
  `;

  container.querySelectorAll(".room-card").forEach((card) => {
    card.addEventListener("click", async () => {
      state.selectedRoomId = Number(card.dataset.roomId);
      await switchView("devices");
    });
  });
}

// ---------------------------------------------------------------
// Devices view (control page — toggle on/off)
// ---------------------------------------------------------------
async function renderDevices(container) {
  if (!state.rooms.length) state.rooms = await API.listRooms();
  const devices = await API.listDevices(state.selectedRoomId || undefined);
  state.devices = devices;

  const filterPills = [`<button class="pill-tab ${!state.selectedRoomId ? "active" : ""}" data-room="">All rooms</button>`]
    .concat(state.rooms.map((r) => `<button class="pill-tab ${state.selectedRoomId === r.id ? "active" : ""}" data-room="${r.id}">${escapeHtml(r.name)}</button>`))
    .join("");

  container.innerHTML = `
    <div class="tabs-row">${filterPills}</div>
    <div class="grid grid-devices">
      ${devices.map(deviceCardHtml).join("") || `<div class="empty-state"><h3>No devices here</h3><p>Try a different room, or ask an admin to add one.</p></div>`}
    </div>
  `;

  container.querySelectorAll(".pill-tab").forEach((pill) => {
    pill.addEventListener("click", async () => {
      const val = pill.dataset.room;
      state.selectedRoomId = val ? Number(val) : null;
      await renderDevices(container);
    });
  });

  container.querySelectorAll(".device-toggle-input").forEach((input) => {
    input.addEventListener("change", async (e) => {
      const id = Number(e.target.dataset.id);
      const isOn = e.target.checked;
      try {
        await API.toggleDevice(id, isOn);
        toast(`${e.target.dataset.name} turned ${isOn ? "on" : "off"}`, "success");
        await renderDevices(container);
      } catch (err) {
        toast(err.message, "error");
        e.target.checked = !isOn;
      }
    });
  });
}

function deviceCardHtml(d) {
  return `
    <div class="device-card ${d.is_on ? "is-on" : ""}">
      <div class="device-top">
        <div class="flex gap-12">
          <div class="device-type-icon">${DEVICE_ICONS[d.type] || "⚡"}</div>
          <div>
            <div class="device-name">${escapeHtml(d.name)}</div>
            <div class="device-room">${escapeHtml(d.room_name || "")}</div>
          </div>
        </div>
        <label class="switch">
          <input type="checkbox" class="device-toggle-input" data-id="${d.id}" data-name="${escapeHtml(d.name)}" ${d.is_on ? "checked" : ""}>
          <span class="switch-track"></span>
        </label>
      </div>
      <div class="device-bottom">
        <div>
          <div class="device-power">${fmtWatts(d.current_power_w)}</div>
          <div class="device-power-label">rated ${fmtWatts(d.rated_power_w)}</div>
        </div>
        <span class="badge ${d.is_on ? "badge-on" : "badge-off"}">${d.is_on ? "On" : "Off"}</span>
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------
// Reports view
// ---------------------------------------------------------------
async function renderReports(container) {
  container.innerHTML = `
    <div class="tabs-row">
      <button class="pill-tab ${state.reportTab === "today" ? "active" : ""}" data-tab="today">Today (hourly)</button>
      <button class="pill-tab ${state.reportTab === "weekly" ? "active" : ""}" data-tab="weekly">Last 7 days</button>
    </div>
    <div class="card mb-16">
      <div class="card-header">
        <div>
          <div class="card-title" id="report-title">Usage</div>
          <div class="card-title-sub" id="report-sub">—</div>
        </div>
      </div>
      <canvas id="report-chart" style="width:100%; height:220px;"></canvas>
    </div>
    <div class="card">
      <div class="card-header">
        <div>
          <div class="card-title">Usage by room</div>
          <div class="card-title-sub">Last 24 hours</div>
        </div>
      </div>
      <div id="room-share"></div>
    </div>
  `;

  container.querySelectorAll(".pill-tab").forEach((pill) => {
    pill.addEventListener("click", async () => {
      state.reportTab = pill.dataset.tab;
      await renderReports(container);
    });
  });

  const series = state.reportTab === "today" ? await API.reportToday() : await API.reportWeekly();
  document.getElementById("report-title").textContent = state.reportTab === "today" ? "Hour by hour" : "Day by day";
  document.getElementById("report-sub").textContent = `${fmtWh(series.total_wh)} · ${fmtCost(series.total_cost)} total`;

  const canvas = document.getElementById("report-chart");
  canvas.style.width = "100%";
  canvas.style.height = "220px";
  Charts.barChart(canvas, series.points.map((p) => p.label), series.points.map((p) => p.power_wh), { unit: "Wh" });

  const roomSeries = await API.reportRooms(24);
  const palette = ["#F2A93B", "#4FD8A4", "#6FB3E0", "#FF6B6B", "#B693F2", "#F2769B", "#7ED6C1"];
  const segments = roomSeries.points
    .filter((p) => p.power_wh > 0)
    .sort((a, b) => b.power_wh - a.power_wh)
    .map((p, i) => ({ label: p.label, value: p.power_wh, color: palette[i % palette.length] }));

  const shareEl = document.getElementById("room-share");
  if (!segments.length) {
    shareEl.innerHTML = `<div class="empty-state"><p>Not enough data yet — check back in a few minutes.</p></div>`;
  } else {
    shareEl.innerHTML = `
      <canvas id="share-bar" style="width:100%; height:14px; border-radius:8px; overflow:hidden; display:block; margin-bottom:16px;"></canvas>
      ${segments.map((s) => `
        <div class="flex-between" style="padding:8px 0; border-bottom:1px solid var(--border-soft);">
          <div class="flex gap-8"><span style="width:9px;height:9px;border-radius:50%;background:${s.color};display:inline-block;"></span>${escapeHtml(s.label)}</div>
          <div class="text-secondary">${fmtWh(s.value)}</div>
        </div>
      `).join("")}
    `;
    const shareBarCanvas = document.getElementById("share-bar");
    shareBarCanvas.style.width = "100%";
    shareBarCanvas.style.height = "14px";
    Charts.shareBar(shareBarCanvas, segments);
  }
}

// ---------------------------------------------------------------
// Alerts view
// ---------------------------------------------------------------
async function renderAlerts(container) {
  container.innerHTML = `
    <div class="flex-between mb-16">
      <div class="tabs-row" style="margin-bottom:0;">
        <button class="pill-tab ${state.alertsFilter === "unresolved" ? "active" : ""}" data-filter="unresolved">Unresolved</button>
        <button class="pill-tab ${state.alertsFilter === "all" ? "active" : ""}" data-filter="all">All</button>
      </div>
      <button class="btn btn-ghost btn-sm" id="resolve-all-btn">Resolve all</button>
    </div>
    <div id="alerts-list"></div>
  `;

  container.querySelectorAll(".pill-tab").forEach((pill) => {
    pill.addEventListener("click", async () => {
      state.alertsFilter = pill.dataset.filter;
      await renderAlerts(container);
    });
  });
  document.getElementById("resolve-all-btn").addEventListener("click", async () => {
    try {
      await API.resolveAllAlerts();
      toast("All alerts resolved", "success");
      await renderAlerts(container);
      await refreshAlertsBadge();
    } catch (err) {
      toast(err.message, "error");
    }
  });

  const alerts = await API.listAlerts(state.alertsFilter === "unresolved");
  const list = document.getElementById("alerts-list");

  if (!alerts.length) {
    list.innerHTML = `<div class="empty-state"><h3>Nothing to see here</h3><p>${state.alertsFilter === "unresolved" ? "No unresolved alerts right now." : "No alerts recorded yet."}</p></div>`;
    return;
  }

  list.innerHTML = alerts.map((a) => `
    <div class="alert-item sev-${a.severity} ${a.resolved ? "resolved" : ""}">
      <span class="badge badge-${a.severity}">${a.severity}</span>
      <div>
        <div class="alert-message">${escapeHtml(a.message)}</div>
        <div class="alert-time">${a.device_name ? escapeHtml(a.device_name) + " · " : ""}${timeAgo(a.created_at)}</div>
      </div>
      ${!a.resolved ? `<div class="alert-actions"><button class="btn btn-sm" data-resolve="${a.id}">Resolve</button></div>` : ""}
    </div>
  `).join("");

  list.querySelectorAll("[data-resolve]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        await API.resolveAlert(Number(btn.dataset.resolve));
        await renderAlerts(container);
        await refreshAlertsBadge();
      } catch (err) {
        toast(err.message, "error");
      }
    });
  });
}

async function refreshAlertsBadge() {
  try {
    const unresolved = await API.listAlerts(true);
    const badge = document.getElementById("alerts-nav-badge");
    if (unresolved.length > 0) {
      badge.hidden = false;
      badge.textContent = unresolved.length > 99 ? "99+" : unresolved.length;
    } else {
      badge.hidden = true;
    }
  } catch (e) { /* ignore */ }
}

// ---------------------------------------------------------------
// Admin view — manage rooms & devices
// ---------------------------------------------------------------
async function renderAdmin(container) {
  const [rooms, devices] = await Promise.all([API.listRooms(), API.listDevices()]);
  state.rooms = rooms;
  state.devices = devices;

  container.innerHTML = `
    <div class="flex-between mb-16">
      <div class="card-title">Rooms</div>
      <button class="btn btn-primary btn-sm" id="add-room-btn">+ Add room</button>
    </div>
    <div class="card mb-16">
      <table class="table">
        <thead><tr><th>Room</th><th>Floor</th><th>Devices</th><th></th></tr></thead>
        <tbody>
          ${rooms.map((r) => `
            <tr>
              <td>${ROOM_ICONS[r.icon] || "🏠"} ${escapeHtml(r.name)}</td>
              <td class="text-muted">${escapeHtml(r.floor || "")}</td>
              <td class="text-muted">${r.device_count}</td>
              <td style="text-align:right;">
                <button class="btn btn-sm" data-edit-room="${r.id}">Edit</button>
                <button class="btn btn-sm btn-danger" data-del-room="${r.id}">Delete</button>
              </td>
            </tr>`).join("") || `<tr><td colspan="4" class="text-muted">No rooms yet.</td></tr>`}
        </tbody>
      </table>
    </div>

    <div class="flex-between mb-16">
      <div class="card-title">Devices</div>
      <button class="btn btn-primary btn-sm" id="add-device-btn">+ Add device</button>
    </div>
    <div class="card">
      <table class="table">
        <thead><tr><th>Device</th><th>Type</th><th>Room</th><th>Rated</th><th></th></tr></thead>
        <tbody>
          ${devices.map((d) => `
            <tr>
              <td>${DEVICE_ICONS[d.type] || "⚡"} ${escapeHtml(d.name)}</td>
              <td class="text-muted">${d.type}</td>
              <td class="text-muted">${escapeHtml(d.room_name || "")}</td>
              <td class="text-muted">${fmtWatts(d.rated_power_w)}</td>
              <td style="text-align:right;">
                <button class="btn btn-sm" data-edit-device="${d.id}">Edit</button>
                <button class="btn btn-sm btn-danger" data-del-device="${d.id}">Delete</button>
              </td>
            </tr>`).join("") || `<tr><td colspan="5" class="text-muted">No devices yet.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;

  document.getElementById("add-room-btn").addEventListener("click", () => openRoomModal());
  document.getElementById("add-device-btn").addEventListener("click", () => openDeviceModal());

  container.querySelectorAll("[data-edit-room]").forEach((btn) =>
    btn.addEventListener("click", () => openRoomModal(rooms.find((r) => r.id === Number(btn.dataset.editRoom))))
  );
  container.querySelectorAll("[data-del-room]").forEach((btn) =>
    btn.addEventListener("click", () => confirmDeleteRoom(Number(btn.dataset.delRoom)))
  );
  container.querySelectorAll("[data-edit-device]").forEach((btn) =>
    btn.addEventListener("click", () => openDeviceModal(devices.find((d) => d.id === Number(btn.dataset.editDevice))))
  );
  container.querySelectorAll("[data-del-device]").forEach((btn) =>
    btn.addEventListener("click", () => confirmDeleteDevice(Number(btn.dataset.delDevice)))
  );
}

function openRoomModal(room = null) {
  const isEdit = !!room;
  openModal(`
    <div class="modal-header">
      <h3>${isEdit ? "Edit room" : "Add room"}</h3>
      <button class="modal-close" data-close-modal>&times;</button>
    </div>
    <form id="room-form">
      <label class="field"><span>Room name</span><input name="name" required value="${room ? escapeHtml(room.name) : ""}"></label>
      <label class="field"><span>Floor</span><input name="floor" value="${room ? escapeHtml(room.floor || "") : "Ground Floor"}"></label>
      <label class="field"><span>Icon</span>
        <select name="icon">
          ${Object.keys(ROOM_ICONS).map((k) => `<option value="${k}" ${room && room.icon === k ? "selected" : ""}>${ROOM_ICONS[k]} ${k}</option>`).join("")}
        </select>
      </label>
      <div class="modal-actions">
        <button type="button" class="btn" data-close-modal>Cancel</button>
        <button type="submit" class="btn btn-primary">${isEdit ? "Save changes" : "Add room"}</button>
      </div>
    </form>
  `);

  document.getElementById("room-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = { name: fd.get("name"), floor: fd.get("floor"), icon: fd.get("icon") };
    try {
      if (isEdit) await API.updateRoom(room.id, payload);
      else await API.createRoom(payload);
      toast(isEdit ? "Room updated" : "Room added", "success");
      closeModal();
      await renderView();
    } catch (err) {
      toast(err.message, "error");
    }
  });
}

async function confirmDeleteRoom(id) {
  if (!confirm("Delete this room and all its devices? This cannot be undone.")) return;
  try {
    await API.deleteRoom(id);
    toast("Room deleted", "success");
    await renderView();
  } catch (err) {
    toast(err.message, "error");
  }
}

function openDeviceModal(device = null) {
  const isEdit = !!device;
  openModal(`
    <div class="modal-header">
      <h3>${isEdit ? "Edit device" : "Add device"}</h3>
      <button class="modal-close" data-close-modal>&times;</button>
    </div>
    <form id="device-form">
      <label class="field"><span>Device name</span><input name="name" required value="${device ? escapeHtml(device.name) : ""}"></label>
      <div class="field-row">
        <label class="field"><span>Type</span>
          <select name="type">
            ${DEVICE_TYPES.map((t) => `<option value="${t}" ${device && device.type === t ? "selected" : ""}>${DEVICE_ICONS[t]} ${t}</option>`).join("")}
          </select>
        </label>
        <label class="field"><span>Room</span>
          <select name="room_id">
            ${state.rooms.map((r) => `<option value="${r.id}" ${device && device.room_id === r.id ? "selected" : ""}>${escapeHtml(r.name)}</option>`).join("")}
          </select>
        </label>
      </div>
      <div class="field-row">
        <label class="field"><span>Rated power (W)</span><input type="number" min="1" step="1" name="rated_power_w" required value="${device ? device.rated_power_w : 100}"></label>
        <label class="field"><span>Standby power (W)</span><input type="number" min="0" step="0.5" name="standby_power_w" value="${device ? device.standby_power_w : 0}"></label>
      </div>
      <label class="field"><span>Alert threshold (W) — optional</span><input type="number" min="1" step="1" name="threshold_w" value="${device && device.threshold_w ? device.threshold_w : ""}" placeholder="defaults to 135% of rated power"></label>
      <label class="field" style="flex-direction:row; align-items:center; gap:10px;">
        <input type="checkbox" name="is_on" style="width:auto;" ${device && device.is_on ? "checked" : ""}>
        <span>Powered on</span>
      </label>
      <div class="modal-actions">
        <button type="button" class="btn" data-close-modal>Cancel</button>
        <button type="submit" class="btn btn-primary">${isEdit ? "Save changes" : "Add device"}</button>
      </div>
    </form>
  `);

  document.getElementById("device-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = {
      name: fd.get("name"),
      type: fd.get("type"),
      room_id: Number(fd.get("room_id")),
      rated_power_w: Number(fd.get("rated_power_w")),
      standby_power_w: Number(fd.get("standby_power_w") || 0),
      threshold_w: fd.get("threshold_w") ? Number(fd.get("threshold_w")) : null,
      is_on: fd.get("is_on") === "on",
    };
    try {
      if (isEdit) await API.updateDevice(device.id, payload);
      else await API.createDevice(payload);
      toast(isEdit ? "Device updated" : "Device added", "success");
      closeModal();
      await renderView();
    } catch (err) {
      toast(err.message, "error");
    }
  });
}

async function confirmDeleteDevice(id) {
  if (!confirm("Delete this device? This cannot be undone.")) return;
  try {
    await API.deleteDevice(id);
    toast("Device deleted", "success");
    await renderView();
  } catch (err) {
    toast(err.message, "error");
  }
}

// ---------------------------------------------------------------
// Live polling (topbar pill + badge + current view refresh)
// ---------------------------------------------------------------
async function pollLive() {
  try {
    const summary = await API.dashboardSummary();
    document.getElementById("live-power-value").textContent = fmtWatts(summary.total_power_w);
    const badge = document.getElementById("alerts-nav-badge");
    if (summary.unresolved_alerts > 0) {
      badge.hidden = false;
      badge.textContent = summary.unresolved_alerts > 99 ? "99+" : summary.unresolved_alerts;
    } else {
      badge.hidden = true;
    }
    // Keep the currently open view fresh without disrupting user interaction (e.g. open modal)
    const modalOpen = !document.getElementById("modal-backdrop").hidden;
    if (!modalOpen) await renderView();
  } catch (err) {
    if (err.status === 401) {
      API.clearToken();
      showAuthScreen();
    }
  }
}

// ---------------------------------------------------------------
// Boot
// ---------------------------------------------------------------
async function bootApp() {
  document.getElementById("auth-screen").hidden = true;
  document.getElementById("app-shell").hidden = false;

  const initials = (state.user.full_name || state.user.username)
    .split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  document.getElementById("user-avatar").textContent = initials;
  document.getElementById("user-name").textContent = state.user.full_name || state.user.username;
  document.getElementById("user-role").textContent = state.user.role;
  document.getElementById("nav-admin").hidden = state.user.role !== "admin";

  await switchView("dashboard");
  await refreshAlertsBadge();
  await pollLive(); // populate the live pill immediately instead of waiting for the first tick

  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(pollLive, POLL_MS);
}

async function init() {
  initAuthScreen();
  initNav();

  const token = API.getToken();
  if (!token) {
    showAuthScreen();
    return;
  }
  try {
    state.user = await API.me();
    await bootApp();
  } catch (err) {
    API.clearToken();
    showAuthScreen();
  }
}

document.addEventListener("DOMContentLoaded", init);
