// src/api.js
const BASE_URL = 'http://127.0.0.1:8000'; 

export async function authFetch(endpoint, options = {}) {
  const url = endpoint.startsWith('http') ? endpoint : `${BASE_URL}${endpoint}`;
  
  // Always grab the freshest token
  const token = localStorage.getItem('kmp_authToken'); 
  const fnum = localStorage.getItem('kmp_currentUser_fnum');
  const headers = { ...options.headers };

  if (fnum) {
    headers['X-User-FNum'] = fnum; 
  }
 
  // --- THE MAGIC LOGIN FIX ---
  if (url.includes('/api/auth/login') && typeof options.body === 'string') {
    try {
      const parsedBody = JSON.parse(options.body);
      const formData = new URLSearchParams();
      formData.append("username", parsedBody.username || parsedBody.email);
      formData.append("password", parsedBody.password);
      options.body = formData; 
    } catch (e) {
      // Ignore if it's not valid JSON
    }
  }

  // --- FIXED CONTENT-TYPE LOGIC (Only add if a body exists) ---
  if (options.body) {
    if (options.body instanceof URLSearchParams) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=utf-8';
    } else if (!(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json; charset=utf-8';
    }
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, { ...options, headers });

  // --- SEPARATE THE SECURITY RESPONSES ---
  
  // 1. Dead Token (Log them out) - EXCEPT on the login screen!
  if (response.status === 401 && !url.includes('/api/auth/login')) {
    console.warn("Unauthorized: Session expired or invalid.");
    localStorage.removeItem('kmp_authToken');
    localStorage.removeItem('kmp_currentUser'); // <--- Kills the Zombie Session
    window.location.reload(); // <--- Kicks you instantly back to the login screen
    throw new Error("UNAUTHORIZED"); 
  }
  
  // 2. Lack of Rank/Clearance (Keep them logged in, just deny the action)
  if (response.status === 403) {
    console.warn("Forbidden: You do not have the required permissions.");
    throw new Error("Clearance Denied"); 
  }
  
  return response;
}