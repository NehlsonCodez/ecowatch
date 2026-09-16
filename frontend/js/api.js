/**
 * EcoWatch API client.
 * All backend calls go through window.API. Token is kept in localStorage
 * so the session survives a page reload.
 */
const API = (() => {
  const BASE = ""; // same-origin: FastAPI serves this frontend directly

  function getToken() {
    return localStorage.getItem("ecowatch_token");
  }
  function setToken(token) {
    localStorage.setItem("ecowatch_token", token);
  }
  function clearToken() {
    localStorage.removeItem("ecowatch_token");
  }

  async function request(path, { method = "GET", body, form = false, auth = true } = {}) {
    const headers = {};
    if (auth) {
      const token = getToken();
      if (token) headers["Authorization"] = `Bearer ${token}`;
    }

    let payload = body;
    if (body && !form) {
      headers["Content-Type"] = "application/json";
      payload = JSON.stringify(body);
    }

    const res = await fetch(BASE + path, { method, headers, body: payload });

    if (res.status === 204) return null;

    let data = null;
    try {
      data = await res.json();
    } catch (e) {
      data = null;
    }

    if (!res.ok) {
      const detail = (data && data.detail) || res.statusText || "Request failed";
      const err = new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
      err.status = res.status;
      throw err;
    }
    return data;
  }

  return {
    getToken,
    setToken,
    clearToken,

    // --- Auth ---
    login(username, password) {
      const form = new URLSearchParams();
      form.append("username", username);
      form.append("password", password);
      return request("/api/auth/login", {
        method: "POST",
        body: form,
        form: true,
        auth: false,
      });
    },
    register(payload) {
      return request("/api/auth/register", { method: "POST", body: payload, auth: false });
    },
    me() {
      return request("/api/auth/me");
    },

    // --- Dashboard ---
    dashboardSummary() {
      return request("/api/dashboard/summary");
    },

    // --- Rooms ---
    listRooms() {
      return request("/api/rooms");
    },
    createRoom(payload) {
      return request("/api/rooms", { method: "POST", body: payload });
    },
    updateRoom(id, payload) {
      return request(`/api/rooms/${id}`, { method: "PUT", body: payload });
    },
    deleteRoom(id) {
      return request(`/api/rooms/${id}`, { method: "DELETE" });
    },

    // --- Devices ---
    listDevices(roomId) {
      const q = roomId ? `?room_id=${roomId}` : "";
      return request(`/api/devices${q}`);
    },
    createDevice(payload) {
      return request("/api/devices", { method: "POST", body: payload });
    },
    updateDevice(id, payload) {
      return request(`/api/devices/${id}`, { method: "PUT", body: payload });
    },
    deleteDevice(id) {
      return request(`/api/devices/${id}`, { method: "DELETE" });
    },
    toggleDevice(id, isOn) {
      return request(`/api/devices/${id}/toggle`, { method: "POST", body: { is_on: isOn } });
    },
    deviceReadings(id, limit = 60) {
      return request(`/api/devices/${id}/readings?limit=${limit}`);
    },

    // --- Alerts ---
    listAlerts(unresolvedOnly = false) {
      return request(`/api/alerts?unresolved_only=${unresolvedOnly}`);
    },
    resolveAlert(id) {
      return request(`/api/alerts/${id}/resolve`, { method: "POST" });
    },
    resolveAllAlerts() {
      return request(`/api/alerts/resolve-all`, { method: "POST" });
    },

    // --- Reports ---
    reportToday() {
      return request("/api/reports/today");
    },
    reportWeekly() {
      return request("/api/reports/weekly");
    },
    reportRooms(hours = 24) {
      return request(`/api/reports/rooms?hours=${hours}`);
    },
  };
})();
