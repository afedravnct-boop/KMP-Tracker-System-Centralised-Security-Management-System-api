// src/api.js
const BASE_URL = import.meta.env.VITE_API_URL || 'https://kmp-tracker-system-centralised-security.onrender.com';

// 🟢 Secure In-Memory Session Storage (Zero persistence to localStorage/sessionStorage)
let inMemoryToken = null;
let inMemoryUserFNum = null;

export const setAuthSession = (token, fnum) => {
  inMemoryToken = token;
  inMemoryUserFNum = fnum;
};

export const clearAuthSession = () => {
  inMemoryToken = null;
  inMemoryUserFNum = null;
};

export const getAuthToken = () => inMemoryToken;
export const getAuthUserFNum = () => inMemoryUserFNum;

export async function authFetch(endpoint, options = {}) {
  // 🟢 Defend against double-domain prepending
  const url = (endpoint.startsWith('http://') || endpoint.startsWith('https://'))
    ? endpoint
    : `${BASE_URL}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

  const headers = { ...options.headers };

  // Attach Officer Signature Header from volatile RAM
  if (inMemoryUserFNum) {
    headers['X-User-FNum'] = inMemoryUserFNum;
  }

  // --- FASTAPI OAUTH2 COMPLIANCE INTERCEPTOR ---
  if (url.includes('/api/auth/login') && typeof options.body === 'string') {
    try {
      const parsedBody = JSON.parse(options.body);
      const formData = new URLSearchParams();
      formData.append("username", parsedBody.username || parsedBody.email || parsedBody.fnum || "");
      formData.append("password", parsedBody.password || "");
      options.body = formData;
    } catch (e) {
      // Body is not a JSON string, retain original payload
    }
  }

  // --- CONTENT-TYPE NORMALIZATION ---
  if (options.body) {
    if (options.body instanceof URLSearchParams) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=utf-8';
    } else if (!(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json; charset=utf-8';
    }
  }

  // Attach Bearer Token from in-memory store
  if (inMemoryToken) {
    headers['Authorization'] = `Bearer ${inMemoryToken}`;
  }

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include' // Transmit secure HttpOnly cookies across origins
  });

  // --- SECURITY ENFORCEMENT PROTOCOLS ---

  // 1. Token Expired or Session Terminated
  if (response.status === 401 && !url.includes('/api/auth/login')) {
    console.warn("🔒 Secure In-Memory Session Expired. Purging memory references...");
    clearAuthSession();
    window.dispatchEvent(new Event('auth-expired'));
    throw new Error("UNAUTHORIZED");
  }

  // 2. Privilege Violation / Insufficient Command Rank
  if (response.status === 403) {
    console.warn("🛡️ Security Restriction: Sovereign Clearance Denied.");
    throw new Error("Clearance Denied");
  }

  return response;
}