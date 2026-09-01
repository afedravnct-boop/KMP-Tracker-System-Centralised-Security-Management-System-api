import React, { useState } from 'react';
import { User, Lock, ShieldAlert } from 'lucide-react';
import { API_BASE_URL, setAuthSession, authFetch } from './api';

export default function Login({ onLoginSuccess, setIsSignUp }) {
  const [fileOrForceNumber, setFileOrForceNumber] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    const cleanFnum = fileOrForceNumber.trim().toUpperCase();

    // FastAPI OAuth2 accepts Form Data mapping Force/File No to 'username'
    const formData = new URLSearchParams();
    formData.append('username', cleanFnum);
    formData.append('password', password);

    try {
      const baseUrl = API_BASE_URL || import.meta.env.VITE_API_URL || "https://kmp-tracker-system-centralised-security.onrender.com";
      const response = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: formData
      });

      const data = await response.json();

      if (response.ok) {
        // Save session using centralized auth helper
        setAuthSession(data.access_token, data.fnum || cleanFnum);

        const userObj = {
          fnum: data.fnum || cleanFnum,
          rank: data.rank || 'PC',
          name: data.name || 'OFFICER',
          sex: data.sex || 'MALE',
          ipps: data.ipps || '',
          nin: data.nin || '',
          region: data.region || 'KMP HEADQUARTERS',
          division: data.division || 'HQ',
          station: data.station || 'HQ',
          position: data.position || 'GENERAL DUTIES',
          email: data.email || '',
          phone: data.phone || '',
          role: data.role || 'USER',
          permissions: data.permissions || {},
          profile_photo_path: data.profile_photo_path || ''
        };

        // Persist user object for session restoration
        sessionStorage.setItem('kmp_currentUser', JSON.stringify(userObj));
        sessionStorage.setItem('kmp_loginTime', Date.now().toString());

        if (typeof onLoginSuccess === 'function') {
          onLoginSuccess(userObj);
        } else {
          window.location.reload();
        }
      } else {
        setError(data.detail || "Authorization failed. Check your Force Number and Security Key.");
      }
    } catch (err) {
      console.error("Login fetch error:", err);
      setError("Could not connect to the command server. Check network connectivity.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = () => {
    alert("Please submit a Password Reset Request to your Regional or Division Command Data Officer.");
  };

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-slate-950 p-4 font-sans relative overflow-hidden">
      
      {/* Background Accent Gradient */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Main Compact Access Card */}
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden border border-slate-800 relative z-10 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Dark High-Command Header */}
        <div className="bg-slate-900 px-6 py-5 text-center border-b border-slate-800">
          <img 
            src="/upf_badge.png" 
            alt="UPF Emblem" 
            className="w-12 h-12 mx-auto mb-2 object-contain contrast-200 brightness-90 drop-shadow"
            onError={(e) => { e.target.style.display = 'none'; }}
          />
          <h2 className="text-base font-black text-white tracking-wider uppercase">
            Uganda Police Force
          </h2>
          <h3 className="text-[11px] font-bold text-blue-400 mt-0.5 tracking-wider uppercase">
            Kampala Metropolitan Police Headquarters
          </h3>
          <p className="text-[9px] text-slate-400 mt-1 font-mono tracking-tight uppercase">
            Centralised Security Data Management System Access Portal
          </p>
        </div>

        {/* Form Body */}
        <form onSubmit={handleLogin} className="p-5 space-y-3.5">
          
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start space-x-2 text-red-700 animate-in fade-in">
              <ShieldAlert className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <p className="text-xs font-semibold leading-tight">{error}</p>
            </div>
          )}

          <div>
            <label className="block text-xs font-extrabold text-slate-700 mb-1 uppercase tracking-wide">
              Force / File Number
            </label>
            <div className="relative">
              <input 
                type="text" 
                placeholder="E.G. A/2408 OR 63034"
                value={fileOrForceNumber} 
                onChange={(e) => setFileOrForceNumber(e.target.value.toUpperCase())} 
                required 
                className="w-full pl-9 pr-3 py-2 text-xs font-medium border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-blue-600 outline-none uppercase transition"
              />
              <User className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-extrabold text-slate-700 mb-1 uppercase tracking-wide">
              Security Key (Password)
            </label>
            <div className="relative">
              <input 
                type="password" 
                placeholder="••••••••"
                value={password} 
                onChange={(e) => setPassword(e.target.value)} 
                required 
                className="w-full pl-9 pr-3 py-2 text-xs font-medium border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-blue-600 outline-none transition"
              />
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            </div>
          </div>

          <button 
            type="submit" 
            disabled={isLoading}
            className="w-full bg-blue-700 hover:bg-blue-800 disabled:bg-blue-400 text-white font-black text-xs py-2.5 rounded-lg uppercase tracking-wider shadow-md hover:shadow-lg transition active:scale-[0.99] cursor-pointer flex items-center justify-center space-x-2 mt-2"
          >
            {isLoading ? (
              <span className="animate-pulse">Verifying Credentials...</span>
            ) : (
              <span>Authorize Access</span>
            )}
          </button>

          <div className="flex items-center justify-between pt-1 text-[11px] font-bold">
            <button 
              type="button" 
              onClick={handleForgotPassword} 
              className="text-slate-500 hover:text-slate-800 transition cursor-pointer"
            >
              Forgot Security Key?
            </button>
            <button 
              type="button" 
              onClick={() => typeof setIsSignUp === 'function' && setIsSignUp(true)} 
              className="text-blue-700 hover:text-blue-900 transition cursor-pointer"
            >
              Sign Up (Request Access)
            </button>
          </div>
        </form>

      </div>

      <p className="text-[10px] text-slate-500 font-bold mt-4 text-center tracking-widest uppercase relative z-10">
        🛡️ Protected by KMP Tracker System - KMPCSDMS160626
      </p>
    </div>
  );
}