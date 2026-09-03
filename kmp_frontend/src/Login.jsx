import React, { useState } from 'react';
import { User, Lock, ShieldAlert, X } from 'lucide-react';
import { API_BASE_URL, setAuthSession } from './api';

export default function Login({ onLoginSuccess, setIsSignUp }) {
  const [fileOrForceNumber, setFileOrForceNumber] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Policy modal and agreement states
  const [showPolicyModal, setShowPolicyModal] = useState(false);
  const [acceptedPolicy, setAcceptedPolicy] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();

    if (!acceptedPolicy) {
      setError("You must read and accept the Terms, Information Security Policy & User Guide before authorizing access.");
      return;
    }

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

          {/* Mandatory Policy Acceptance Checkbox */}
          <div className="pt-1">
            <div className="flex items-start space-x-2 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
              <input 
                type="checkbox" 
                id="loginPolicyAgree"
                required
                checked={acceptedPolicy}
                onChange={(e) => setAcceptedPolicy(e.target.checked)}
                className="mt-0.5 w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 cursor-pointer shrink-0"
              />
              <label htmlFor="loginPolicyAgree" className="text-[11px] text-slate-700 font-medium leading-snug cursor-pointer">
                I agree to the <span className="text-blue-700 font-bold underline cursor-pointer" onClick={(e) => { e.preventDefault(); setShowPolicyModal(true); }}>Terms, Information Security Policy & User Guide</span>. *
              </label>
            </div>
          </div>

          <button 
            type="submit" 
            disabled={isLoading || !acceptedPolicy}
            className={`w-full font-black text-xs py-2.5 rounded-lg uppercase tracking-wider shadow-md transition flex items-center justify-center space-x-2 mt-2 ${
              acceptedPolicy ? 'bg-blue-700 hover:bg-blue-800 text-white cursor-pointer' : 'bg-slate-300 text-slate-500 cursor-not-allowed'
            }`}
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

      {/* Policy & Terms Modal */}
      {showPolicyModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[300] flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden border border-slate-300 flex flex-col max-h-[85vh]">
            <div className="bg-slate-900 text-white px-6 py-4 flex justify-between items-center shrink-0">
              <h3 className="font-extrabold uppercase text-xs tracking-wider">
                UGANDA POLICE FORCE — KAMPALA METROPOLITAN POLICE (KMP-CSDMS)
              </h3>
              <button onClick={() => setShowPolicyModal(false)} className="hover:bg-slate-800 p-1.5 rounded transition cursor-pointer text-slate-300 hover:text-white">
                <X size={18} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-4 text-xs text-slate-700 leading-relaxed custom-scrollbar bg-slate-50 flex-1">
              <h4 className="font-black text-sm text-slate-900 uppercase border-b pb-2">Terms and Conditions, User Policy, and System User Guide</h4>
              
              <div className="space-y-3">
                <h5 className="font-bold text-slate-900 uppercase">Part 1: Terms and Conditions of Use</h5>
                <p><strong>1. Acceptance of Terms:</strong> By accessing, logging into, or utilizing KMP-CSDMS, you formally acknowledge, accept, and agree to be bound by these Terms and Conditions and operational directives.</p>
                <p><strong>2. Authorized Use & Eligibility:</strong> Restricted strictly to authorized personnel of the Uganda Police Force and designated national security stakeholders under active deployment status.</p>
                <p><strong>3. Intellectual Property:</strong> All software architecture, databases, UI designs, and forensic watermarking protocols are exclusive property of the UPF.</p>
                <p><strong>4. Limitation of Liability:</strong> Command maintains high-grade security standards but assumes no liability for network interruptions or credential compromise resulting from individual user negligence.</p>
              </div>

              <div className="space-y-3 pt-2">
                <h5 className="font-bold text-slate-900 uppercase">Part 2: User Policy (Information Security & Data Privacy)</h5>
                <p><strong>1. Purpose & Scope:</strong> Mandatory security standards for all personnel accessing sensitive police records and nominal rolls to maintain operational security (OPSEC).</p>
                <p><strong>2. Account Security:</strong> Credentials are personal and non-transferable. Leaving active terminals unattended or sharing passwords constitutes a severe disciplinary breach.</p>
                <p><strong>3. Acceptable Use:</strong> Access modules strictly for official UPF operations. Unauthorized personal lookups or exposing tactical positions via AI prompts is prohibited.</p>
                <p><strong>4. Data Classification:</strong> All exports are classified as RESTRICTED / LAW ENFORCEMENT RECORDS, cryptographically stamped and AES-256 encrypted keyed to the officer's Force Number.</p>
              </div>

              <div className="space-y-3 pt-2">
                <h5 className="font-bold text-slate-900 uppercase">Part 3: System User Guide Summary</h5>
                <p>Covers navigation across the Authentication Portal, Home Dashboard, Command Communications, Crime Registry, Disruptive OPS Statistics, Success Stories, Establishments, Analytics Dashboard, Nominal Roll, Tripartite Reports, and AI Command Console.</p>
              </div>
            </div>

            <div className="bg-white p-4 border-t border-slate-200 flex justify-end shrink-0 space-x-3">
              <button 
                type="button"
                onClick={() => { setAcceptedPolicy(true); setShowPolicyModal(false); }} 
                className="px-5 py-2.5 bg-blue-700 hover:bg-blue-800 text-white rounded-xl font-black text-xs uppercase tracking-wider shadow cursor-pointer transition"
              >
                I Understand & Accept
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}