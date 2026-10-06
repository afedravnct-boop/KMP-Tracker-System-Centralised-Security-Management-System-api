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
    if (networkError.name === 'AbortError') {
      return new Response(JSON.stringify({ detail: "Request aborted by user navigation" }), { status: 499 });
    }

    console.warn("Network congestion or temporary blip intercepted. Holding execution:", networkError);
    if (retries > 0) {
      await new Promise(resolve => setTimeout(resolve, 1500));
      return authFetch(endpoint, options, retries - 1);
    }
    return new Response(JSON.stringify({ detail: "Network connectivity interrupted" }), { status: 503 });
  }

  // 🛡️ SAFE STREAM GUARD: Applied immediately to prevent body stream exhaustion
  if (response && typeof response.clone === 'function') {
    const originalJson = response.json.bind(response);
    response.json = async () => {
      try {
        return await originalJson();
      } catch (e) {
        return await response.clone().json();
      }
    };
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

  // 🟢 GLOBAL LOCKDOWN INTERCEPTOR WITH GRACE PERIOD & POLICE CORRESPONDENCE
  if (response.status === 403) {
    try {
      const errData = await response.clone().json();
      const detailStr = (errData.detail || "").toUpperCase();
      
      if (detailStr.includes("LOCKDOWN")) {
        console.error("🔒 LOCKDOWN TRIGGERED. Initiating grace period for active sessions...");
        
        const officerFNum = getAuthUserFNum() || "CLASSIFIED";
        clearAuthSession();

        // Create a professional emergency lockdown countdown modal overlay dynamically in the DOM
        const overlay = document.createElement('div');
        overlay.style.cssText = `
          position: fixed; inset: 0; background: rgba(2, 6, 23, 0.95); z-index: 9999999;
          display: flex; align-items: center; justify-content: center; padding: 20px;
          font-family: ui-sans-serif, system-ui, sans-serif; animation: fadeIn 0.2s ease-out;
        `;

        let secondsLeft = 60; // 60 seconds grace period to finish typing

        overlay.innerHTML = `
          <div style="background: #0f172a; border: 2px solid #ef4444; border-radius: 16px; max-width: 550px; width: 100%; padding: 28px; color: #f8fafc; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7);">
            <div style="display: flex; align-items: center; gap: 12px; border-bottom: 1px solid #1e293b; padding-bottom: 14px; margin-bottom: 16px;">
              <span style="font-size: 24px;">🚨</span>
              <div>
                <h3 style="font-size: 14px; font-weight: 900; text-transform: uppercase; color: #ef4444; letter-spacing: 0.05em;">UGANDA POLICE FORCE - EMERGENCY DIRECTIVE</h3>
                <p style="font-size: 11px; color: #94a3b8; font-weight: bold;">OFFICER REF: ${officerFNum}</p>
              </div>
            </div>
            
            <div style="font-size: 12px; line-height: 1.6; color: #cbd5e1; margin-bottom: 20px;">
              <p style="font-weight: bold; color: #f1f5f9; margin-bottom: 8px;">${errData.detail}</p>
              <p>Command has initiated a maintenance or regional security lockdown. <strong>You have been granted a 60-second grace period</strong> to conclude your current typing, save active records, and exit safely.</p>
            </div>

            <div style="background: #1e293b; border: 1px solid #334155; border-radius: 10px; padding: 12px; text-align: center; margin-bottom: 20px;">
              <span style="font-size: 11px; text-transform: uppercase; font-weight: bold; color: #94a3b8; display: block;">Session Forced Termination In:</span>
              <span id="lockdown-timer" style="font-size: 28px; font-weight: 900; font-family: monospace; color: #f87171;">00:60</span>
            </div>

            <div style="display: flex; justify-content: flex-end;">
              <button id="immediate-logout-btn" style="background: #dc2626; color: white; border: none; padding: 10px 20px; border-radius: 8px; font-size: 11px; font-weight: bold; cursor: pointer; text-transform: uppercase;">
                Conclude & Exit Now
              </button>
            </div>
          </div>
        `;

        document.body.appendChild(overlay);

        const timerDisplay = overlay.querySelector('#lockdown-timer');
        const exitBtn = overlay.querySelector('#immediate-logout-btn');

        const executeShutdown = () => {
          document.body.removeChild(overlay);
          window.location.replace('/');
        };

        exitBtn.onclick = executeShutdown;

        const interval = setInterval(() => {
          secondsLeft--;
          if (secondsLeft <= 0) {
            clearInterval(interval);
            executeShutdown();
          } else {
            const formatted = secondsLeft < 10 ? `00:0${secondsLeft}` : `00:${secondsLeft}`;
            timerDisplay.textContent = formatted;
          }
        }, 1000);

        return new Promise(() => {}); 
      }
    } catch (e) {
      // Fallback if parsing fails
    }
    throw new Error("Clearance Denied");
  }

  return response;
}