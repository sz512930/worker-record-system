(function () {
  "use strict";

  const baseUrl = window.APP_CONFIG && window.APP_CONFIG.API_BASE_URL;
  if (!baseUrl) throw new Error("缺少 APP_CONFIG.API_BASE_URL 配置");

  function apiUrl(path) {
    return `${baseUrl.replace(/\/$/, "")}${path}`;
  }

  async function request(path, options) {
    let response;
    try {
      response = await fetch(apiUrl(path), options);
    } catch {
      throw new Error("无法连接本机后端。请确认 API 已在 127.0.0.1:3000 启动。");
    }

    if (response.status === 204) return null;

    const body = await response.json().catch(() => null);
    if (!response.ok || !body || body.success !== true) {
      throw new Error(body?.error || `请求失败（HTTP ${response.status}）`);
    }
    return body.data;
  }

  function json(method, path, body) {
    return request(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
  }

  function file(path, selectedFile) {
    const body = new FormData();
    body.append("file", selectedFile);
    return request(path, { method: "POST", body });
  }

  window.WorkerApi = Object.freeze({
    apiUrl,
    health: () => request("/health"),
    listStaff(filters) {
      const params = new URLSearchParams();
      Object.entries(filters || {}).forEach(([key, value]) => {
        if (value) params.set(key, value);
      });
      const suffix = params.toString();
      return request(`/api/staff${suffix ? `?${suffix}` : ""}`);
    },
    getStaff: (id) => request(`/api/staff/${encodeURIComponent(id)}`),
    createStaff: (data) => json("POST", "/api/staff", data),
    updateStaff: (id, data) => json("PUT", `/api/staff/${encodeURIComponent(id)}`, data),
    deleteStaff: (id) => request(`/api/staff/${encodeURIComponent(id)}`, { method: "DELETE" }),
    uploadAvatar: (id, selectedFile) => file(`/api/staff/${encodeURIComponent(id)}/avatar`, selectedFile),
    uploadResume: (id, selectedFile) => file(`/api/staff/${encodeURIComponent(id)}/resume`, selectedFile),
    deleteAvatar: (id) => request(`/api/staff/${encodeURIComponent(id)}/avatar`, { method: "DELETE" }),
    deleteResume: (id) => request(`/api/staff/${encodeURIComponent(id)}/resume`, { method: "DELETE" })
  });
})();
