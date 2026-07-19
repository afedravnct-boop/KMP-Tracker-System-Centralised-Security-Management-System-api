import React, { useState } from 'react';
// 1. Import your API_BASE_URL from the api.js file you created earlier
import { API_BASE_URL } from './api'; 

export default function Login({ onLoginSuccess }) {
  const [fileOrForceNumber, setFileOrForceNumber] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const data = await response.json();
      
      // ADD THIS LINE
      console.log("Server response data:", data); 
      
      if (response.ok) {
        // Verify the key name here: is it 'access_token', 'token', or 'data'?
        console.log("Saving token:", data.access_token); 
        
        localStorage.setItem('kmp_authToken', data.access_token);
        onLoginSuccess(data.user || data);
      }

    // 2. FastAPI OAuth2 requires Form Data, mapping your ID to 'username'
    const formData = new URLSearchParams();
    formData.append('username', fileOrForceNumber); 
    formData.append('password', password);

    try {
      // 3. Add API_BASE_URL so it actually talks to port 8000
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/x-www-form-urlencoded' // Changed from JSON
        }, 
        body: formData
      });

      const data = await response.json();
      
      if (response.ok) {
        // 4. Save the token exactly where your api.js expects to find it!
        localStorage.setItem('kmp_authToken', data.access_token);
        localStorage.setItem('kmp_currentUser_fnum', responseData.fnum);        

        onLoginSuccess(data.user || data); // Pass user data to App.jsx
      } else {
        setError(data.detail || "Login failed");
      }
    } catch (err) {
      console.error("Login fetch error:", err);
      setError("Could not connect to the server.");
    }
  };

  return (
    <form onSubmit={handleLogin}>
      <input 
        type="text" 
        value={fileOrForceNumber} 
        onChange={(e) => setFileOrForceNumber(e.target.value)} 
        placeholder="File or Force Number" 
      />
      <input 
        type="password" 
        value={password} 
        onChange={(e) => setPassword(e.target.value)} 
        placeholder="Security Key" 
      />
      <button type="submit">Login</button>
      {error && <p style={{ color: 'red' }}>{error}</p>}
    </form>
  );
}