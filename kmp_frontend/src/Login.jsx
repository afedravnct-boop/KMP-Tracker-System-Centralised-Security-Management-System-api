// src/Login.jsx
import React, { useState, useEffect, useRef } from 'react';
import { User, Lock, X, HelpCircle, AlertTriangle, Globe, Camera, Bug } from 'lucide-react';
import { setAuthSession, authFetch } from './api';
import SystemAssistant from './SystemAssistant';

// ====================================================================
// 1. CONSTANTS & CONFIGURATION
// ====================================================================
const API_URL = import.meta.env.VITE_API_URL || "https://kmp-ops-data.onrender.com";

const REGIONAL_HIERARCHY = {
  "KMP NORTH": ["KMP NORTH HEADQUARTERS", "KAWEMPE", "KAKIRI", "KASANGATI", "MATUGGA", "NANSANA", "OLD KAMPALA", "WAKISO", "WANDEGEYA"],
  "KMP EAST": ["KMP EAST HEADQUARTERS", "JINJA ROAD", "KIRA", "KIRA ROAD", "MUKONO", "NAGGALAMA", "SEETA"],
  "KMP SOUTH": ["KMP SOUTH HEADQUARTERS", "NATEETE", "CPS KAMPALA", "PARLIAMENT", "ENTEBBE", "KABALAGALA", "KAJJANSI", "KASENYI", "KATWE", "KYENGERA", "NSANGI"],
  "KMP HEADQUARTERS": ["KMP HEADQUARTERS", "KMP CID", "KMP TRAFFIC", "KMP ICT", "KMP FLYING SQUAD", "KMP CRIME INTELLIGENCE"],
  "POLICE HEADQUARTERS": ["NAGURU", "OPERATIONS", "CRIME INTELLIGENCE", "CID", "LOGISTICS & ENGINEERING", "ICT", "CT", "FIRE & RESCUE"]
};

const POSITIONS = {
  ADMIN: [
    "System Manager", "IGP", "DIGP", "Director OPS", "Director CT", "Director CI", 
    "Director CID", "Director HRM & A", "Director logistics & engineering", 
    "KMP Commander", "Deputy KMP Commander",
    "KMP CID Commander", "KMP CI Commander", "KMP Operations Commander", 
    "KMP Traffic & Road Safety Commander", "KMP SOCO", "KMP 999 eru commander", 
    "999 ERU Data Officer", "Regional HR Officer", "KMP SFC Coordinator",
    "Departmental Data Officer", "Regional Data officer", "Divisional Data Officer", "Station Data Officer", "Regional Data Assistant Officer", "Division Data Assistant Officer", "Station Data Assistant Officer", "Regional Traffic Officer", "Divisional Traffic Officer", "Divisional CID Officer", "Divisional CI Officer", "Regional CFPU Officer", "Divisional CFPU Officer", "Regional Fire Officer", "Divisional Fire Officer", "Regional Logistics Officer", "Divisional Logistics Officer", "Station SOCO", "Divisional SOCO", "Regional SOCO"
  ],
  RPC: [
    "KMP South Commander", "KMP North Commander", "KMP East Commander", "Deputy Commander KMP south", "Deputy Commander KMP North", "Deputy Commander KMP East"
  ]
};

export const isStationEquivalent = (statA, statB) => {
  const a = stripHtmlTags(statA || '').trim().toUpperCase();
  const b = stripHtmlTags(statB || '').trim().toUpperCase();
  if (!a || !b) return false;
  if (a === b) return true;

  const cleanA = a.replace(/(\s+HEADQUARTERS|\s+HQ)$/, '');
  const cleanB = b.replace(/(\s+HEADQUARTERS|\s+HQ)$/, '');

  return cleanA === cleanB && cleanA.length > 0;
};

export const stripHtmlTags = (str) => {
  if (!str) return '';
  return str.toString().replace(/<[^>]*>?/gm, '');
};

const LoginScreen = ({ onLogin, onForgot, onSignup, pendingUsers = [], activeUsers = [] }) => {
  const [mode, setMode] = useState('login');
  const [fnum, setfnum] = useState('');
  const [password, setPassword] = useState('');
  const [authMessage, setAuthMessage] = useState(null);
  
  const [showPolicyModal, setShowPolicyModal] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  
  // 🟢 Glitch Reporter State & Secure Telemetry Buffer
  const [showGlitchModal, setShowGlitchModal] = useState(false);
  const [glitchDesc, setGlitchDesc] = useState('');
  const capturedLogs = useRef({ console: [], network: [] });

  const logClientErrorLocally = (errorPayload) => {
    try {
      const existingQueue = JSON.parse(localStorage.getItem('kmp_pending_telemetry') || '[]');
      existingQueue.push(errorPayload);
      if (existingQueue.length > 20) existingQueue.shift();
      localStorage.setItem('kmp_pending_telemetry', JSON.stringify(existingQueue));
    } catch (e) {}
  };

  // 🟢 Secure Automated Diagnostic Sweeper (Captures Console & Network Errors)
  useEffect(() => {
    const originalConsoleError = console.error;
    console.error = (...args) => {
      const safeLog = args.map(arg => (typeof arg === 'object' ? JSON.stringify(arg) : String(arg))).join(' ');
      capturedLogs.current.console.push(`[CONSOLE_ERR] ${safeLog.substring(0, 200)}`);
      originalConsoleError.apply(console, args);
    };

    const handleWindowError = (e) => {
      capturedLogs.current.console.push(`[SYS_CRASH] ${e.message} at ${e.filename}:${e.lineno}`);
    };
    window.addEventListener('error', handleWindowError);

    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      try {
        const response = await originalFetch(...args);
        if (!response.ok) capturedLogs.current.network.push(`[HTTP_${response.status}] ${args[0]}`);
        return response;
      } catch (error) {
        capturedLogs.current.network.push(`[NET_DROP] ${args[0]} - ${error.message}`);
        throw error;
      }
    };

    return () => {
      console.error = originalConsoleError;
      window.removeEventListener('error', handleWindowError);
      window.fetch = originalFetch;
    };
  }, []);

  useEffect(() => {
    const flushPendingTelemetry = async () => {
      try {
        const pending = JSON.parse(localStorage.getItem('kmp_pending_telemetry') || '[]');
        if (pending.length === 0) return;

        for (const payload of pending) {
          await fetch(`${API_URL}/api/v1/ai/report-crash`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
        }
        localStorage.removeItem('kmp_pending_telemetry');
      } catch (e) {}
    };
    flushPendingTelemetry();
  }, []);

  useEffect(() => {
    let animationFrameId;
    const syncGlobesToEpoch = () => {
      const currentTime = Date.now() / 20; 
      const rotationPosition = currentTime % 500; 
      document.documentElement.style.setProperty('--universal-globe-pos', `${rotationPosition}px`);
      animationFrameId = requestAnimationFrame(syncGlobesToEpoch);
    };
    animationFrameId = requestAnimationFrame(syncGlobesToEpoch);
    return () => cancelAnimationFrame(animationFrameId);
  }, []);
  
  const [signupData, setSignupData] = useState({
    fnum: '', ipps: '', nin: '', name: '', rank: '', sex: 'MALE', 
    region: 'KMP NORTH', station: 'KAWEMPE', position: '', email: '', 
    phone: '', password: '', profile_photo_path: '', policy_accepted: false
  });
  const [photoFile, setPhotoFile] = useState(null);

  const availablePositions = [
    ...POSITIONS.ADMIN, 
    ...POSITIONS.RPC, 
    `${signupData.region} Commander`, 
    `Divisional Commander ${signupData.station}`, 
    `CID Officer ${signupData.station}`, 
    `Data Officer ${signupData.station}`, 
    `Data Assistant Officer ${signupData.station}`
  ];

  const [attempts, setAttempts] = useState(0);
  const [lockoutEnd, setLockoutEnd] = useState(null);
  const [timeLeft, setTimeLeft] = useState(0);

  const [isLoginIdle, setIsLoginIdle] = useState(false);
  const idleTimerRef = useRef(null);

  useEffect(() => {
    const IDLE_TIME = 30000;
    const resetIdle = () => {
      setIsLoginIdle(false);
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => setIsLoginIdle(true), IDLE_TIME);
    };
    resetIdle();
    const events = ['mousemove', 'keydown', 'keyup', 'input', 'click', 'scroll', 'touchstart'];
    events.forEach(event => window.addEventListener(event, resetIdle, true));
    return () => {
      clearTimeout(idleTimerRef.current);
      events.forEach(event => window.removeEventListener(event, resetIdle, true));
    };
  }, []);

  useEffect(() => {
    if (!lockoutEnd) return;
    const interval = setInterval(() => {
      const remaining = Math.ceil((lockoutEnd - Date.now()) / 1000);
      if (remaining <= 0) { 
        setLockoutEnd(null); 
        setAttempts(0); 
        setTimeLeft(0); 
      } else { setTimeLeft(remaining); }
    }, 1000);
    return () => clearInterval(interval);
  }, [lockoutEnd]);

  const handleSignupChange = (e) => {
    const { name, value, type, checked } = e.target;
    if (name === 'policy_accepted') {
      setSignupData({ ...signupData, policy_accepted: checked });
    } else if (name === 'region') {
      setSignupData({ ...signupData, region: value, station: REGIONAL_HIERARCHY[value]?.[0] || '', position: '' });
    } else if (name === 'station') {
      setSignupData({ ...signupData, station: value, position: '' });
    } else if (name === 'fnum' || name === 'nin' || name === 'rank') {
      setSignupData({ ...signupData, [name]: value.toUpperCase() });
    } else {
      setSignupData({ ...signupData, [name]: value });
    }
  };

  const handlePhotoUpload = async (e) => {
    const file = e.target.files[0];
    if (file) {
      setAuthMessage("⏳ Uploading photo...");
      const uploadData = new FormData(); 
      uploadData.append("file", file); 
      uploadData.append("fnum", signupData.fnum || "NEW_USER"); 
      uploadData.append("category", "user_profile");
      try {
        const response = await authFetch('/api/v1/users/upload-profile', { method: "POST", body: uploadData });
        if (!response.ok) throw new Error("Upload failed on server.");
        const data = await response.json();
        setSignupData(prev => ({ ...prev, profile_photo_path: data.full_s3_url || data.cloud_storage_path }));
        setAuthMessage("✅ Photo uploaded securely!"); 
        setTimeout(() => setAuthMessage(null), 3000);
      } catch (error) {
        setSignupData(prev => ({ ...prev, profile_photo_path: URL.createObjectURL(file) })); 
        setPhotoFile(file);
        setAuthMessage("⚠️ Network error: Using local preview. Photo will upload on submit.");
      }
    }
  };

  const handleSignupSubmit = async (e) => {
    e.preventDefault();
    if (!signupData.policy_accepted) return setAuthMessage("⚠️ Error: You must accept the Terms & Policy.");
    if (!signupData.profile_photo_path) return setAuthMessage("⚠️ Error: Profile photo upload is mandatory.");
    if (!/^\d{10}$/.test(signupData.phone)) return setAuthMessage("⚠️ Error: Contact number must be 10 digits.");
    if (!signupData.password || signupData.password.length < 8) return setAuthMessage("⚠️ Error: Password must be at least 8 characters.");
    if (!/(?=.*[A-Za-z])(?=.*\d)/.test(signupData.password)) return setAuthMessage("⚠️ Error: Password must contain letters and numbers.");
    
    if (signupData.nin) {
      const cleanNin = signupData.nin.trim().toUpperCase();
      if (!/^C[MF][A-Z0-9]{12}$/.test(cleanNin)) return setAuthMessage("⚠️ Error: NIN must start with CM/CF and be 14 characters.");
    }

    setAuthMessage("⏳ Submitting authorization request...");
    try {
      const formData = new FormData();
      Object.keys(signupData).forEach(key => {
        if (signupData[key] !== null && signupData[key] !== undefined) formData.append(key, signupData[key]);
      });
      
      let derivedRole = 'USER';
      if (signupData.position === 'System Manager') derivedRole = 'SUPER_ADMIN';
      else if (POSITIONS.ADMIN.includes(signupData.position) || signupData.position.includes('Divisional Commander') || signupData.station === 'KMP HEADQUARTERS') derivedRole = 'ADMIN';
      else if (POSITIONS.RPC.includes(signupData.position) || signupData.position.includes(`${signupData.region} Commander`)) derivedRole = 'RPC';
      
      formData.set("role", derivedRole);
      if (photoFile && signupData.profile_photo_path.startsWith('blob:')) formData.set("file", photoFile);

      const response = await authFetch('/api/v1/auth/signup', { method: 'POST', body: formData });
      const data = await response.json();

      if (response.ok) {
        setAuthMessage("✅ Account Request Submitted! Awaiting Admin Approval.");
        if (onSignup) onSignup({ ...signupData, role: derivedRole });
        setTimeout(() => setMode('login'), 2000);
      } else { 
        setAuthMessage(`❌ Registration Failed: ${data.detail || "Server error"}`); 
      }
    } catch (error) { 
      setAuthMessage("❌ Connection error. Could not reach server."); 
    }
  };

  const handleLoginSubmit = async (e) => { 
    e.preventDefault();
    if (lockoutEnd) return;

    if (mode === 'login') {
      try {
        const response = await fetch(`${API_URL}/api/auth/login`, { 
          method: 'POST', 
          headers: { 'Content-Type': 'application/json' }, 
          body: JSON.stringify({ username: fnum.trim(), password: password.trim() }) 
        });

        const data = await response.json().catch(() => ({}));

        if (response.ok) {
          setAuthSession(data.access_token, data.fnum || fnum.trim());
          onLogin({ ...data, fnum: data.fnum || fnum.trim() });
        } else {
          setPassword(''); 
          setAuthMessage(data.detail || "Incorrect Force Number or password");
          const newAttempts = attempts + 1; 
          setAttempts(newAttempts);
          if (newAttempts >= 3) setLockoutEnd(Date.now() + 30000);
        }
      } catch (err) { 
        setPassword(''); 
        setAuthMessage("Network error. Could not connect to the server."); 
      }
    } else if (mode === 'forgot') {
      try {
        const formData = new URLSearchParams(); 
        formData.append('fnum', fnum.trim());
        const response = await authFetch('/api/v1/auth/request-reset', { method: 'POST', body: formData });
        const data = await response.json();
        if (response.ok) { 
          setMode('login'); 
          setfnum(''); 
          setAuthMessage("✅ " + (data.message || "Account recovery requested.")); 
        } else { 
          setAuthMessage(`❌ ${data.detail || "Failed to submit request."}`); 
        }
      } catch (err) { 
        setAuthMessage("❌ Network error. Could not connect to the server."); 
      }
    }
  };

  const submitGlitchReport = async () => {
    setAuthMessage("⏳ Transmitting diagnostic fault report...");
    const payload = {
      console_logs: capturedLogs.current.console.slice(-15),
      network_errors: capturedLogs.current.network.slice(-15),
      current_page: `Login Portal (${mode.toUpperCase()})`,
      glitch_category: "PUBLIC_PORTAL_FAILURE",
      element_point: "User Triggered Diagnostic",
      description: glitchDesc || "No user description provided."
    };
    
    try {
      await fetch(`${API_URL}/api/v1/ai/report-crash`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      setAuthMessage("✅ Diagnostic payload securely dispatched to High Command IT.");
    } catch(e) {
      logClientErrorLocally(payload);
      setAuthMessage("⚠️ Network offline. Fault report saved locally and will auto-sync.");
    }
    setShowGlitchModal(false);
    setGlitchDesc('');
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-4 relative overflow-hidden">
      
      {/* FULL-SCREEN STANDBY CURTAIN */}
      <div 
        className={`security-curtain-overlay fixed inset-0 z-50 bg-slate-900 flex flex-col items-center justify-center transition-opacity duration-700 ease-in-out ${
          isLoginIdle ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="absolute top-0 w-full h-2 bg-[#000000]"></div>
        <div className="absolute top-2 w-full h-2 bg-[#facc15]"></div>
        <div className="absolute top-4 w-full h-2 bg-[#dc2626]"></div>

        <div 
          className="absolute inset-0 opacity-10 bg-center bg-no-repeat bg-cover pointer-events-none" 
          style={{ backgroundImage: `url('/UPF Flag Emblem.png')` }}
        ></div>

        <div className="relative z-10 flex flex-col items-center text-center p-6 max-w-3xl">
          <div className="upf-css-globe mb-6 border border-slate-600/50"></div>
          
          <div className="curtain-title-container">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-center text-white tracking-widest uppercase drop-shadow-lg flex justify-center flex-wrap leading-relaxed">
              {"KMP CENTRALISED SECURITY DATA MANAGEMENT SYSTEM".split("").map((char, index) => {
                const delay = Math.pow(index, 1.2) * 0.025; 
                return (
                  <span
                    key={index}
                    className="animate-sweep-letter"
                    style={{ animationDelay: `${delay}s`, whiteSpace: "pre" }}
                  >
                    {char === " " ? "\u00A0" : char}
                  </span>
                );
              })}
            </h2>
          </div>

          <div className="mt-4 relative z-20 inline-flex items-center space-x-2 bg-[#6b1d2f]/95 px-5 py-2.5 rounded-full border border-emerald-300 shadow-xl backdrop-blur-md">
            <Lock size={16} className="text-amber-300 animate-bounce" />
            <span className="text-xs sm:text-sm font-bold text-blue-400 tracking-wider">
            KMP TRACKER SYSTEM - KMPCSDMS160626 • LOGIN SCREEN STANDBY MODE
            </span>
            <span className="inline-flex items-center justify-center shrink-0 animate-spin" style={{ animationDuration: '12s' }}>
              <Globe size={18} className="text-amber-300" />
            </span>
          </div>

          <p className="text-xs text-slate-300 mt-4 font-medium tracking-wide relative z-20">
            Move your mouse, click, or press any key to return to the login interface.
          </p>
        </div>

        <div className="absolute bottom-4 w-full h-2 bg-[#dc2626]"></div> 
        <div className="absolute bottom-2 w-full h-2 bg-[#facc15]"></div> 
        <div className="absolute bottom-0 w-full h-2 bg-[#000000]"></div> 
      </div>

      {/* MAIN CARD CONTAINER */}
      <div className="max-w-xl w-full bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden relative z-10">
        <div className="bg-slate-900 p-6 text-center relative">
          
          <img 
            src="/upf_badge.png" 
            alt="UPF Logo" 
            className="w-24 h-24 mx-auto mb-4 object-contain contrast-200 brightness-75 drop-shadow-sm" 
            onError={(e) => { e.target.onerror = null; e.target.style.display = 'none'; }} 
          />
          <h1 className="text-2xl font-extrabold text-white tracking-wide">Uganda Police Force</h1>
          <h2 className="text-lg font-bold text-blue-400 mt-1">Kampala Metropolitan Police Headquarters</h2>
          <h3 className="text-sm font-medium text-slate-400 mt-2 uppercase tracking-widest">Centralised Security Data Management System Access Portal</h3>
        </div>
        
        <div className="p-6">
          {lockoutEnd ? (
            <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-lg text-center">
              <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-red-500"/>
              <h3 className="font-bold text-lg">Too Many Attempts</h3>
              <p className="text-sm mt-1">Account locked for security purposes. Please wait <span className="font-bold">{timeLeft} seconds</span> before trying again.</p>
            </div>
          ) : (
            <>
              {mode === 'signup' ? (
                <form onSubmit={handleSignupSubmit} className="space-y-4 max-h-[60vh] overflow-y-auto custom-scrollbar pr-2">
                  <h3 className="text-lg font-bold text-gray-800 border-b pb-2 mb-4">Request Access Authorization</h3>

                  {authMessage && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start space-x-2 text-red-700 mb-4">
                      <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                      <p className="text-xs font-semibold leading-tight">{authMessage}</p>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">File/Force Number *</label>
                      <input 
                        type="text" name="fnum" required value={signupData.fnum} onChange={handleSignupChange} 
                        className="w-full p-2 border border-gray-300 rounded focus:ring-blue-500 uppercase text-sm" 
                        placeholder="e.g. A/2408 or 63034"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">IPPS Number *</label>
                      <input 
                        type="text" name="ipps" required maxLength="6" value={signupData.ipps} onChange={handleSignupChange} 
                        className="w-full p-2 border border-gray-300 rounded focus:ring-blue-500 text-sm" 
                        placeholder="123456"
                      />
                    </div>
                                        
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">National ID (NIN) *</label>
                      <input 
                        type="text" name="nin" required maxLength="14" value={signupData.nin} onChange={handleSignupChange} 
                        className="w-full p-2 border border-gray-300 rounded focus:ring-blue-500 uppercase text-sm font-mono" 
                        placeholder="e.g. CM900000000000"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">Gender / Sex *</label>
                      <select name="sex" value={signupData.sex} onChange={handleSignupChange} required className="w-full p-2 border border-gray-300 rounded focus:ring-blue-500 text-sm">
                        <option value="MALE">MALE</option>
                        <option value="FEMALE">FEMALE</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">Full Name *</label>
                      <input type="text" name="name" required value={signupData.name} onChange={handleSignupChange} className="w-full p-2 border border-gray-300 rounded focus:ring-blue-500 text-sm uppercase" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">Rank *</label>
                      <input type="text" name="rank" required value={signupData.rank} onChange={handleSignupChange} className="w-full p-2 border border-gray-300 rounded focus:ring-blue-500 text-sm uppercase" placeholder="e.g. AIP, IP, ASP, PC" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">Region *</label>
                      <select name="region" value={signupData.region} onChange={handleSignupChange} required className="w-full p-2 border border-gray-300 rounded focus:ring-blue-500 text-sm">
                        {Object.keys(REGIONAL_HIERARCHY).map(reg => <option key={reg} value={reg}>{reg}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">Station *</label>
                      <select name="station" value={signupData.station} onChange={handleSignupChange} required className="w-full p-2 border border-gray-300 rounded focus:ring-blue-500 text-sm">
                        {REGIONAL_HIERARCHY[signupData.region]?.map(stat => <option key={stat} value={stat}>{stat}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Position / Title *</label>
                    <select name="position" value={signupData.position} onChange={handleSignupChange} required className="w-full p-2 border border-gray-300 rounded focus:ring-blue-500 text-sm">
                      <option value="">-- Select Official Title --</option>
                      {availablePositions.map(pos => <option key={pos} value={pos}>{pos}</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">Email *</label>
                      <input type="email" name="email" required value={signupData.email} onChange={handleSignupChange} className="w-full p-2 border border-gray-300 rounded focus:ring-blue-500 text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">Telephone *</label>
                      <input type="tel" name="phone" required maxLength="10" pattern="\d{10}" value={signupData.phone} onChange={handleSignupChange} className="w-full p-2 border border-gray-300 rounded focus:ring-blue-500 text-sm" placeholder="e.g. 0772123456" />
                    </div>
                  </div>
                  
                  <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                    <label className="block text-xs font-bold text-gray-700 mb-2">Officer Identification Photo (Mandatory) *</label>
                    <div className="flex items-center space-x-4">
                      {signupData.profile_photo_path ? (
                        <img src={signupData.profile_photo_path} alt="Preview" className="w-16 h-16 rounded-full object-cover border-2 border-blue-500 shadow-sm" />
                      ) : (
                        <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center text-gray-400 border-2 border-dashed border-gray-300">
                          <Camera size={24} />
                        </div>
                      )}
                      <div className="flex-1">
                        <input type="file" accept="image/*" required onChange={handlePhotoUpload} className="text-xs w-full text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-bold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer" />
                        <p className="text-xs text-gray-400 mt-1">Directly uploads to secure storage</p>
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Create Password *</label>
                    <input type="password" name="password" required value={signupData.password} onChange={handleSignupChange} className="w-full p-2 border border-gray-300 rounded focus:ring-blue-500 text-sm" placeholder="Min. 8 characters (letters & numbers)" />
                    <p className="text-[10px] text-slate-500 mt-1">Must be at least 8 characters long with a mix of letters and numbers.</p>
                  </div>

                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                    <div className="flex items-start space-x-2">
                      <input type="checkbox" id="policyAcceptSignup" name="policy_accepted" required checked={signupData.policy_accepted} onChange={handleSignupChange} className="mt-0.5 w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 cursor-pointer shrink-0" />
                      <label htmlFor="policyAcceptSignup" className="text-xs text-slate-700 font-medium leading-snug cursor-pointer">
                        I agree to the <span className="text-blue-700 font-bold underline cursor-pointer" onClick={(e) => { e.preventDefault(); setShowPolicyModal(true); }}>Terms, Information Security Policy & User Guide</span>. *
                      </label>
                    </div>
                  </div>

                  <div className="pt-4 flex flex-col space-y-3">
                    <button type="submit" disabled={!signupData.policy_accepted} className={`w-full font-bold py-3 rounded-lg transition-colors text-sm ${!signupData.policy_accepted ? 'bg-slate-300 text-slate-500 cursor-not-allowed' : 'bg-slate-900 hover:bg-black text-white cursor-pointer'}`}>
                      Submit Registration Request
                    </button>
                    <button type="button" onClick={() => setMode('login')} className="text-sm text-blue-600 hover:underline font-medium cursor-pointer">
                      Cancel and return to Login
                    </button>
                  </div>
                </form>
              ) : (
                <form onSubmit={handleLoginSubmit} className="space-y-4">
                  {(authMessage || (attempts > 0 && mode === 'login')) && (
                    <div className="text-xs text-red-700 font-bold bg-red-50 p-3 rounded-lg text-center border border-red-200 shadow-sm leading-snug">
                      {authMessage || `Invalid credentials. Attempts remaining: ${3 - attempts}`}
                    </div>
                  )}
                  <div>
                    <label htmlFor="login-fnum" className="block text-sm font-bold text-gray-700 mb-1">Force Number</label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"/>
                      <input id="login-fnum" name="username" type="text" required value={fnum} onChange={(e) => setfnum(e.target.value)} className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none uppercase text-sm" placeholder="e.g. A/2408 or 63034" />
                    </div>
                  </div>
                  {mode === 'login' && (
                    <div>
                      <label htmlFor="login-password" className="block text-sm font-bold text-gray-700 mb-1">Security Key (Password)</label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"/>
                        <input id="login-password" name="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm" placeholder="••••••••" />
                      </div>
                    </div>
                  )}

                  <button type="submit" className="w-full font-bold py-3 rounded-lg transition-colors cursor-pointer text-xs uppercase tracking-wider bg-blue-700 hover:bg-blue-800 text-white">
                    {mode === 'login' ? 'Authorize Access' : 'Request Password Reset'}
                  </button>
                  <div className="text-center mt-4 flex justify-between px-4">
                    <button type="button" onClick={() => { setMode(mode === 'login' ? 'forgot' : 'login'); setAttempts(0); }} className="text-sm text-slate-600 hover:text-blue-600 hover:underline font-medium cursor-pointer">
                      {mode === 'login' ? 'Forgot Security Key?' : 'Back to Login'}
                    </button>
                    {mode === 'login' && (
                      <button type="button" onClick={() => setMode('signup')} className="text-sm text-blue-600 font-bold hover:underline cursor-pointer">
                        Sign Up (Request Access)
                      </button>
                    )}
                  </div>

                  {/* 🟢 TOGGLES FOR PUBLIC GLITCH REPORTING & HELP */}
                  <div className="pt-2 flex justify-center gap-3">
                    <button
                      type="button"
                      onClick={() => setShowHelpModal(true)}
                      className="text-slate-600 hover:text-slate-900 transition-colors cursor-pointer bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg border border-slate-300 shadow-sm flex items-center gap-1.5 text-xs font-bold"
                      title="System Access Help Guide"
                    >
                      <HelpCircle size={16} className="text-blue-600" />
                      <span>Help</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowGlitchModal(true)}
                      className="text-red-700 hover:text-red-900 transition-colors cursor-pointer bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg border border-red-300 shadow-sm flex items-center gap-1.5 text-xs font-bold"
                      title="Report Console/Network Errors"
                    >
                      <Bug size={16} />
                      <span>Report Glitch</span>
                    </button>
                  </div>

                  <div className="text-center mt-6 space-y-1 relative z-10">
                    <p className="text-xs text-gray-400 flex items-center justify-center">
                      <Lock className="w-3 h-3 mr-1"/> Protected by System Security Protocols
                    </p>
                    <p className="text-[10px] text-slate-500 font-mono tracking-wider uppercase">
                      © 2026 Kampala Metropolitan Police (CSDMS) - Uganda Police Force
                    </p>
                  </div>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    
      {/* POLICY & TERMS MODAL FOR SIGNUP */}
      {showPolicyModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[300] flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full overflow-hidden border border-slate-300 flex flex-col max-h-[85vh]">
            <div className="bg-slate-900 text-white px-6 py-4 flex justify-between items-center shrink-0">
              <h3 className="font-extrabold uppercase text-xs tracking-wider">UGANDA POLICE FORCE — KAMPALA METROPOLITAN POLICE (KMP-CSDMS)</h3>
              <button onClick={() => setShowPolicyModal(false)} className="hover:bg-slate-800 p-1.5 rounded transition cursor-pointer text-slate-300 hover:text-white"><X size={18} /></button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-6 text-xs text-slate-700 leading-relaxed custom-scrollbar bg-slate-50 flex-1">
              <div>
                <h4 className="font-black text-sm text-slate-900 uppercase border-b pb-2 mb-3">Part 1: Terms and Conditions of Use</h4>
                <div className="space-y-2">
                  <p><strong>1. Acceptance of Terms:</strong> By accessing, logging into, or utilizing KMP-CSDMS, you formally acknowledge, accept, and agree to be bound by these Terms and Conditions, the User Policy, and all operational directives issued by the Uganda Police Force (UPF) command. If you do not agree to these terms, you must immediately terminate any attempt to access the platform.</p>
                  <p><strong>2. Authorized Use & Eligibility:</strong> The system is a secure, restricted government asset intended solely for authorized personnel of the Uganda Police Force and designated national security stakeholders under active deployment status. Any transfer, suspension, or termination of active police service instantly revokes system access privileges.</p>
                  <p><strong>3. Intellectual Property & System Ownership:</strong> All software architecture, databases, UI designs, AI models, forensic watermarking protocols, and compiled templates within KMP-CSDMS are the exclusive property of the Uganda Police Force. Unauthorized replication, reverse engineering, extraction of source code, or redistribution is strictly prohibited and subject to legal prosecution.</p>
                  <p><strong>4. Limitation of Liability:</strong> The UPF Command and system administrators maintain high-grade security standards, but assume no liability for operational delays, local hardware malfunctions, network interruptions, or unauthorized data access resulting from individual user negligence or credential compromise.</p>
                  <p><strong>5. Modification of Terms:</strong> Command authorities reserve the right to alter, update, or revise these Terms and Conditions at any time to align with evolving national security frameworks or technical enhancements. Continued use following updates constitutes formal acceptance of the revised terms.</p>
                </div>
              </div>

              <div>
                <h4 className="font-black text-sm text-slate-900 uppercase border-b pb-2 mb-3">Part 2: User Policy (Information Security, Data Privacy & Acceptable Use)</h4>
                <div className="space-y-2">
                  <p><strong>1. Purpose & Scope:</strong> Establishes mandatory security standards, operational guardrails, and behavioral protocols for personnel accessing sensitive police records, nominal rolls, crime registers, and intelligence databases to maintain operational security (OPSEC) and public trust.</p>
                  <p><strong>2. Account Security & Credential Integrity:</strong> System access credentials (Force/File Number and Secret Key/Password) are strictly personal and non-transferable. Officers are fully accountable for all activities executed under their assigned credentials. Personnel must never leave active terminals unattended without utilizing the idle curtain or logging out. Credential sharing or secondary operation is a severe disciplinary breach.</p>
                  <p><strong>3. Acceptable Use of System Modules:</strong> All modules (Crime Registry, Disruptive OPS Statistics, Success Stories, Establishments, Analytics Dashboard, Nominal Roll, Documents & Reports, and AI Command Console) must be accessed strictly for official UPF operations and investigations. Unauthorized personal lookups or exposing unverified live tactical positions via AI prompts is prohibited.</p>
                  <p><strong>4. Data Classification & Forensic Watermarking:</strong> All documents and exports (.xlsx, .docx) downloaded or generated via the Universal File Intake Hub or Master Database Export are classified as RESTRICTED / LAW ENFORCEMENT RECORDS. Files are dynamically stamped with cryptographic audit tokens identifying the downloading officer and encrypted via AES-256 password protection keyed to the officer's Force Number. Tampering with or disseminating restricted data to unauthorized external parties results in immediate revocation of access and disciplinary proceedings.</p>
                  <p><strong>5. Audit Logging & Command Oversight:</strong> Every action performed within KMP-CSDMS (page access, record modifications, queries, and AES-encrypted exports) is automatically tracked by audit and activity logging engines. System Administrators, Regional Police Commanders (RPCs), and Super Admins retain the right to review audit logs and investigate suspicious or anomalous activity at any time.</p>
                  <p><strong>6. Compliance & Enforcement:</strong> Failure to comply results in immediate suspension of system privileges, formal investigation by command authorities, and appropriate disciplinary or legal action under the laws of Uganda and UPF standing orders.</p>
                </div>
              </div>
            </div>

            <div className="bg-white p-4 border-t border-slate-200 flex justify-end shrink-0">
              <button 
                type="button"
                onClick={() => { setSignupData(prev => ({ ...prev, policy_accepted: true })); setShowPolicyModal(false); }} 
                className="px-5 py-2.5 bg-blue-700 hover:bg-blue-800 text-white rounded-xl font-black text-xs uppercase tracking-wider shadow cursor-pointer transition"
              >
                I Understand & Accept
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SYSTEM HELP MODAL */}
      {showHelpModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[300] flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full overflow-hidden border border-slate-300 flex flex-col max-h-[90vh]">
            <div className="bg-slate-900 text-white px-6 py-4 flex justify-between items-center shrink-0">
              <h3 className="font-extrabold uppercase text-sm tracking-wider flex items-center gap-2">
                <HelpCircle size={18} className="text-blue-400" /> HELP, LOGIN NAVIGATION & SYSTEM GUIDE
              </h3>
              <button type="button" onClick={() => setShowHelpModal(false)} className="hover:bg-slate-800 p-1.5 rounded-lg transition cursor-pointer text-slate-300 hover:text-white">
                <X size={18} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-6 text-sm text-slate-800 leading-relaxed custom-scrollbar bg-slate-50 flex-1">
              <div className="space-y-4 bg-white p-6 rounded-xl border border-slate-200 shadow-2xs">
                <h4 className="font-black text-slate-950 uppercase text-base border-b border-slate-200 pb-2">Login Screen Navigation & Input Guide</h4>
                <p><strong>1. Main Sign-In Mode (Existing Users):</strong></p>
                <ul className="list-disc pl-6 space-y-2 text-slate-700">
                  <li><strong>Force Number Input:</strong> Enter your official Force or File Number in uppercase format (e.g., <code>A/2408</code> or numeric IDs like <code>63034</code>).</li>
                  <li><strong>Security Key (Password):</strong> Enter your assigned secure password. Note that entering incorrect credentials 3 times triggers a mandatory 30-second security lockout.</li>
                  <li><strong>Authorization Action:</strong> Click the "Authorize Access" button to verify credentials against the central NeonDB database and launch your session.</li>
                </ul>

                <p className="pt-2"><strong>2. Request Access Authorization (New User Signup Mode):</strong></p>
                <ul className="list-disc pl-6 space-y-2 text-slate-700">
                  <li>Switch modes by clicking <strong>"Sign Up (Request Access)"</strong> at the bottom of the login card.</li>
                  <li><strong>File/Force Number & IPPS Number:</strong> Enter your unique service identifiers accurately.</li>
                  <li><strong>National ID (NIN):</strong> Provide your 14-character National Identification Number starting with CM or CF in uppercase font.</li>
                  <li><strong>Gender / Sex, Full Name, & Rank:</strong> Select your gender, type your full name in uppercase, and specify your current active rank (e.g., <code>AIP</code>, <code>IP</code>, <code>ASP</code>, <code>PC</code>).</li>
                  <li><strong>Region & Station Selection:</strong> Choose your assigned KMP command region from the dropdown list. The station options will automatically filter to match that region's hierarchical jurisdiction.</li>
                  <li><strong>Position / Title:</strong> Select your exact official appointment or command role from the filtered position dropdown.</li>
                  <li><strong>Contact Details:</strong> Provide a valid email and a 10-digit telephone number (e.g., <code>0772123456</code>).</li>
                  <li><strong>Officer Identification Photo (Mandatory):</strong> Upload a clear passport-style service photograph which securely syncs to cloud storage.</li>
                  <li><strong>Create Password:</strong> Define a strong password (minimum 8 characters combining letters and numbers).</li>
                  <li><strong>Terms & Policy Checkbox:</strong> You must click and read the Terms, Information Security Policy & User Guide via the modal link, then check the agreement box before the submission button becomes active.</li>
                </ul>
              </div>

              <div className="space-y-3">
                <div className="text-xs font-black text-slate-600 uppercase tracking-wider">Interactive Help Assistant</div>
                <div className="relative h-72 w-full bg-white rounded-xl overflow-hidden border border-slate-300 shadow-inner">
                  <SystemAssistant embedded={true} limitedMode={true} />
                </div>
              </div>
            </div>

            <div className="bg-white p-4 border-t border-slate-200 flex justify-end shrink-0">
              <button type="button" onClick={() => setShowHelpModal(false)} className="px-6 py-2.5 bg-slate-900 hover:bg-black text-white rounded-xl font-bold text-sm uppercase tracking-wider transition cursor-pointer shadow">
                Close Guide
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🟢 PUBLIC GLITCH REPORTING MODAL */}
      {showGlitchModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[300] flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-300 flex flex-col">
            <div className="bg-red-700 text-white px-6 py-4 flex justify-between items-center shrink-0">
              <h3 className="font-extrabold uppercase text-sm tracking-wider flex items-center gap-2">
                <Bug size={18} /> REPORT SYSTEM GLITCH
              </h3>
              <button type="button" onClick={() => setShowGlitchModal(false)} className="hover:bg-red-800 p-1.5 rounded-lg transition cursor-pointer text-white">
                <X size={18} />
              </button>
            </div>
            
            <div className="p-6 space-y-4 text-sm text-slate-800 bg-slate-50">
              <p className="text-xs text-slate-600 font-medium">
                The diagnostic engine has automatically captured the backend console and network trace for this session. Please describe what you were trying to do when the system failed.
              </p>
              
              <textarea 
                value={glitchDesc}
                onChange={(e) => setGlitchDesc(e.target.value)}
                placeholder="E.g., I tried to click Sign Up but the button froze..."
                className="w-full h-24 p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 outline-none text-sm resize-none"
              ></textarea>
              
              <div className="bg-slate-100 p-3 rounded-lg border border-slate-200 flex items-start gap-2">
                <AlertTriangle size={16} className="text-amber-500 mt-0.5 shrink-0" />
                <p className="text-[10px] text-slate-500 font-mono">
                  Payload includes {capturedLogs.current.console.length} console exceptions and {capturedLogs.current.network.length} network trace errors.
                </p>
              </div>
            </div>

            <div className="bg-white p-4 border-t border-slate-200 flex justify-end gap-3 shrink-0">
              <button type="button" onClick={() => setShowGlitchModal(false)} className="px-5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg font-bold text-xs uppercase tracking-wider transition cursor-pointer">
                Cancel
              </button>
              <button type="button" onClick={submitGlitchReport} className="px-5 py-2 bg-red-700 hover:bg-red-800 text-white rounded-lg font-bold text-xs uppercase tracking-wider transition cursor-pointer shadow">
                Transmit Telemetry
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default LoginScreen;