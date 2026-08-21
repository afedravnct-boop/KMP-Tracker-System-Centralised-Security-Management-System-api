// src/api.js
const BASE_URL = import.meta.env.VITE_API_URL || 'https://kmp-tracker-system-centralised-security.onrender.com';

// 🟢 Synchronized with Login.jsx and app expectations
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
  sessionStorage.removeItem('kmp_authToken');
  sessionStorage.removeItem('kmp_currentUser_fnum');
  sessionStorage.removeItem('kmp_currentUser');
  sessionStorage.removeItem('kmp_loginTime');
  localStorage.removeItem('kmp_authToken'); // Just in case remnants exist
  localStorage.removeItem('kmp_currentUser');
};

export const getAuthToken = () => inMemoryToken || sessionStorage.getItem('kmp_authToken');
export const getAuthUserFNum = () => inMemoryUserFNum || sessionStorage.getItem('kmp_currentUser_fnum');
export const hasValidSession = () => Boolean(getAuthToken());

export async function authFetch(endpoint, options = {}) {
  const url = (endpoint.startsWith('http://') || endpoint.startsWith('https://'))
    ? endpoint
    : `${BASE_URL}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

  const currentFNum = getAuthUserFNum();
  const currentToken = getAuthToken();

  // 🛑 1. EMERGENCY BRAKE: Block outgoing requests if there is no token (unless it's an auth route)
  if (!currentToken && !url.includes('/login') && !url.includes('/signup') && !url.includes('/auth/')) {
    console.warn("Missing token. Blocking request to prevent loops:", url);
    return new Response(JSON.stringify({ detail: "No session token" }), { status: 401 });
  }

  const headers = { ...options.headers };

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

  // 🛑 2. ANTI-LOOP INTERCEPTOR: Handle gracefully without throwing a crash error
  if (response.status === 401 && !url.includes('/api/auth/login')) {
    console.warn("🔒 Secure Session Expired. Halting loops and routing to login.");
    clearAuthSession();
    window.dispatchEvent(new Event('auth-expired'));

    // Safely route to root if not already there, using replace so the back button doesn't trigger loops
    if (window.location.pathname !== '/' && window.location.pathname !== '') {
      window.location.replace('/?session_expired=true');
    }
    
    return response; // Return the 401 response gracefully instead of throwing
  }

  if (response.status === 403) {
    console.warn("🛡️ Security Restriction: Access Denied.");
    // We can still throw on 403 because it means they are logged in but lack permission, not an infinite auth loop.
    throw new Error("Clearance Denied");
  }

  return response;
}