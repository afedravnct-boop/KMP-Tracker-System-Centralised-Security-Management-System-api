// src/api.js
const BASE_URL = import.meta.env.VITE_API_URL || 'https://kmp-tracker-system-centralised-security.onrender.com';

// 🟢 In-Memory Token with Tab-Scoped Ephemeral Fallback (No permanent disk/localStorage persistence)
let inMemoryToken = typeof window !== 'undefined' ? sessionStorage.getItem('__kmp_sec_token') : null;
let inMemoryUserFNum = typeof window !== 'undefined' ? sessionStorage.getItem('__kmp_sec_fnum') : null;

export const setAuthSession = (token, fnum) => {
  inMemoryToken = token;
  inMemoryUserFNum = fnum;
  if (token) {
    sessionStorage.setItem('__kmp_sec_token', token);
  }
  if (fnum) {
    sessionStorage.setItem('__kmp_sec_fnum', fnum);
  }
};

export const clearAuthSession = () => {
  inMemoryToken = null;
  inMemoryUserFNum = null;
  sessionStorage.removeItem('__kmp_sec_token');
  sessionStorage.removeItem('__kmp_sec_fnum');
};

export const getAuthToken = () => inMemoryToken || sessionStorage.getItem('__kmp_sec_token');
export const getAuthUserFNum = () => inMemoryUserFNum || sessionStorage.getItem('__kmp_sec_fnum');
export const hasValidSession = () => Boolean(getAuthToken());

export async function authFetch(endpoint, options = {}) {
  const url = (endpoint.startsWith('http://') || endpoint.startsWith('https://'))
    ? endpoint
    : `${BASE_URL}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

  const headers = { ...options.headers };
  const currentFNum = getAuthUserFNum();
  const currentToken = getAuthToken();

  if (currentFNum) {
    headers['X-User-FNum'] = currentFNum;
  }

  // --- FASTAPI LOGIN PAYLOAD CONVERSION ---
  if (url.includes('/api/auth/login') && typeof options.body === 'string') {
    try {
      const parsedBody = JSON.parse(options.body);
      const formData = new URLSearchParams();
      formData.append("username", parsedBody.username || parsedBody.email || parsedBody.fnum || "");
      formData.append("password", parsedBody.password || "");
      options.body = formData;
    } catch (e) {
      // Retain original body
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

  if (currentToken) {
    headers['Authorization'] = `Bearer ${currentToken}`;
  }

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include'
  });

  // --- ERROR INTERCEPTORS ---
  if (response.status === 401 && !url.includes('/api/auth/login')) {
    console.warn("🔒 Secure Session Expired. Dispatched auth-expired event.");
    clearAuthSession();
    window.dispatchEvent(new Event('auth-expired'));
    throw new Error("UNAUTHORIZED");
  }

  if (response.status === 403) {
    console.warn("🛡️ Security Restriction: Access Denied.");
    throw new Error("Clearance Denied");
  }

  return response;
}