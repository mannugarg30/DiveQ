export const API_BASE_URL =
  import.meta.env.VITE_API_URL || "http://127.0.0.1:5001";

export function getToken() {
  return localStorage.getItem("token");
}

export function getStoredUser() {
  const raw = localStorage.getItem("user");

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setAuth(token, user) {
  localStorage.setItem("token", token);

  if (user) {
    localStorage.setItem("user", JSON.stringify(user));
  }
}

export function clearAuth() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
}

function redirectToLogin() {
  if (window.location.pathname !== "/login") {
    window.location.assign("/login");
  }
}

export async function apiRequest(path, options = {}) {
  const {
    skipAuthRedirect = false,
    headers: customHeaders,
    body,
    ...rest
  } = options;

  const token = getToken();

  const headers = {
    ...(customHeaders || {}),
  };

  if (body !== undefined && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  if (token && !headers.Authorization) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...rest,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let data = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      const parseError = new Error(
        text || `Request failed (${response.status})`
      );
      parseError.status = response.status;
      throw parseError;
    }
  }

  if (response.status === 401 && !skipAuthRedirect) {
    clearAuth();
    redirectToLogin();
  }

  if (!response.ok) {
    const message =
      data?.message || data?.error || `Request failed (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}
