// src/api.js
const BASE_URL = import.meta.env.VITE_API_URL || 'https://kmp-tracker-system-centralised-security.onrender.com';

let inMemoryToken = typeof window !== 'undefined' ? sessionStorage.getItem('kmp_authToken') : null;
let inMemoryUserFNum = typeof window !== 'undefined' ? sessionStorage.getItem('kmp_currentUser_fnum') : null;

export const setAuthSession = (token, fnum) => {
  inMemoryToken = token;
  inMemoryUserFNum = fnum;
  if (token) {
    sessionStorage.setItem('kmp_authToken', token);
  } else {
    sessionStorage.removeItem('kmp_authToken');
  }
  if (fnum) {
    sessionStorage.setItem('kmp_currentUser_fnum', fnum);
  } else {
    sessionStorage.removeItem('kmp_currentUser_fnum');
  }
};

export const clearAuthSession = () => {
  inMemoryToken = null;
  inMemoryUserFNum = null;
  sessionStorage.clear();
  localStorage.removeItem('kmp_authToken');
  localStorage.removeItem('kmp_currentUser');
};

export const getAuthToken = () => inMemoryToken || sessionStorage.getItem('kmp_authToken');
export const getAuthUserFNum = () => inMemoryUserFNum || sessionStorage.getItem('kmp_currentUser_fnum');
export const hasValidSession = () => Boolean(getAuthToken());

// 🟢 CONCURRENT REQUEST MANAGEMENT & ATOMIC REVOCATION GUARD
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach(prom => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

export async function authFetch(endpoint, options = {}, retries = 1) {
  const url = (endpoint.startsWith('http://') || endpoint.startsWith('https://'))
    ? endpoint
    : `${BASE_URL}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

  const currentFNum = getAuthUserFNum();
  const currentToken = getAuthToken();

  if (!currentToken && !url.includes('/login') && !url.includes('/signup') && !url.includes('/auth/')) {
    return new Response(JSON.stringify({ detail: "No session token" }), { status: 401 });
  }

  const headers = { ...options.headers };
  if (currentFNum) {
    headers['X-User-FNum'] = currentFNum;
  }

  if (url.includes('/api/auth/login') && typeof options.body === 'string') {
    try {
      const parsedBody = JSON.parse(options.body);
      const formData = new URLSearchParams();
      formData.append("username", parsedBody.username || parsedBody.email || parsedBody.fnum || "");
      formData.append("password", parsedBody.password || "");
      options.body = formData;
    } catch (e) {}
  }

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

  let response;
  try {
    response = await fetch(url, {
      ...options,
      headers,
      credentials: 'include'
    });
  } catch (networkError) {
    console.warn("Network congestion or temporary blip intercepted. Holding execution:", networkError);
    if (retries > 0) {
      await new Promise(resolve => setTimeout(resolve, 1500));
      return authFetch(endpoint, options, retries - 1);
    }
    return new Response(JSON.stringify({ detail: "Network connectivity interrupted" }), { status: 503 });
  }

  // 🛡️ BULLETPROOF 401 INTERCEPTOR WITH HARD REVOCATION CHECK
  if (response.status === 401 && !url.includes('/api/auth/login') && !url.includes('/heartbeat')) {
    
    // 1. If a token verification is already running, queue concurrent requests safely
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      }).then(token => {
        headers['Authorization'] = `Bearer ${token}`;
        return fetch(url, { ...options, headers, credentials: 'include' });
      }).catch(() => {
        return response;
      });
    }

    // 2. If we have retries left, verify if the user has been revoked at the database level
    if (retries > 0) {
      isRefreshing = true;
      try {
        const hbCheck = await fetch(`${BASE_URL}/api/v1/users/heartbeat`, {
          headers: { 'Authorization': `Bearer ${currentToken}` },
          credentials: 'include'
        });

        // 🛑 THE SECURITY FIX: If heartbeat returns 401 or 403, the user is genuinely revoked/expired! Do NOT retry.
        if (hbCheck.status === 401 || hbCheck.status === 403) {
          isRefreshing = false;
          processQueue(new Error("Revoked"));
          console.warn("🔒 Hard Revocation Detected: User access has been terminated by command.");
          clearAuthSession();
          window.dispatchEvent(new CustomEvent('industrial-auth-expired', { detail: { endpoint: url } }));
          return response;
        }

        if (hbCheck.ok) {
          isRefreshing = false;
          processQueue(null, currentToken);
          return fetch(url, { ...options, headers, credentials: 'include' });
        }
      } catch (e) {
        // Network failure during heartbeat
      }
      isRefreshing = false;
    }

    // 3. Fallback: Force secure session expiration modal
    console.warn("🔒 Verified Session Expiration. Routing to secure lock.");
    clearAuthSession();
    window.dispatchEvent(new CustomEvent('industrial-auth-expired', { detail: { endpoint: url } }));
    return response;
  }

  if (response.status === 403) {
    throw new Error("Clearance Denied");
  }

  return response;
}