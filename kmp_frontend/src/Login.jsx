// src/Login.jsx
import React, { useState } from 'react';
import { User, Lock, ShieldAlert, X, HelpCircle, Wrench, Send, AlertTriangle } from 'lucide-react';
import { API_BASE_URL, setAuthSession, authFetch } from './api';

export default function Login({ onLoginSuccess, setIsSignUp }) {
  const [fileOrForceNumber, setFileOrForceNumber] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isWakingUp, setIsWakingUp] = useState(false);

  // Policy modal and agreement states
  const [showPolicyModal, setShowPolicyModal] = useState(false);
  const [acceptedPolicy, setAcceptedPolicy] = useState(false);

  // 🟢 Help & Glitch Report Modal States
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [helpCategory, setHelpCategory] = useState('LOGIN_AUTH_FAILURE');
  const [helpDescription, setHelpDescription] = useState('');
  const [isSubmittingHelp, setIsSubmittingHelp] = useState(false);
  const [helpSuccess, setHelpSuccess] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();

    if (!acceptedPolicy) {
      setError("You must read and accept the Terms, Information Security Policy & User Guide before authorizing access.");
      return;
    }

    setIsLoading(true);
    setError('');
    setIsWakingUp(false);

    // Render wake-up timer: If server takes more than 3 seconds, inform the user Render might be sleeping
    const wakeUpTimer = setTimeout(() => {
      setIsWakingUp(true);
    }, 3500);

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

      clearTimeout(wakeUpTimer);
      setIsWakingUp(false);

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
        // Instant feedback mapping specific backend rejections
        setError(data.detail || "Authorization failed. Check your Force Number and Security Key.");
      }
    } catch (err) {
      clearTimeout(wakeUpTimer);
      setIsWakingUp(false);
      console.error("Login fetch error:", err);
      setError("Could not connect to the command server. The server instance may be waking up from sleep mode. Please retry in a moment.");
    } finally {
      setIsLoading(false);
    }
  };

  // 🟢 Handler to dispatch login glitches/help tickets straight to Admin Communications
  const handleSendHelpTicket = async (e) => {
    e.preventDefault();
    if (!helpDescription.trim()) return;

    setIsSubmittingHelp(true);
    setHelpSuccess('');

    try {
      const payload = {
        glitch_category: helpCategory,
        page_name: "Login / Authentication Portal",
        element_point: "Sign-In Form / Access Barrier",
        description: `[PUBLIC LOGIN SUPPORT TICKET] User ID/Force No: ${fileOrForceNumber || 'UNKNOWN'}. Details: ${helpDescription}`,
        console_logs: [navigator.userAgent, `Timestamp: ${new Date().toISOString()}`],
        network_errors: [error || 'Authentication Blocked']
      };

      const response = await authFetch('/api/v1/ai/report-crash', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        setHelpSuccess("✅ Ticket successfully routed to High Command IT Support and Admin Communications inbox.");
        setHelpDescription('');
        setTimeout(() => {
          setShowHelpModal(false);
          setHelpSuccess('');
        }, 3000);
      } else {
        throw new Error("Failed to dispatch ticket to server.");
      }
    } catch (err) {
      // Fallback direct dispatch if unauthenticated endpoint route is required
      try {
        const baseUrl = API_BASE_URL || import.meta.env.VITE_API_URL || "https://kmp-tracker-system-centralised-security.onrender.com";
        await fetch(`${baseUrl}/api/v1/ai/report-crash`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            glitch_category: helpCategory,
            page_name: "Login / Authentication Portal",
            element_point: "Sign-In Form / Unauthenticated",
            description: `[PUBLIC LOGIN SUPPORT TICKET] Force No: ${fileOrForceNumber || 'UNKNOWN'}. Details: ${helpDescription}`,
            console_logs: [navigator.userAgent],
            network_errors: []
          })
        });
        setHelpSuccess("✅ Support ticket dispatched successfully.");
        setHelpDescription('');
        setTimeout(() => setShowHelpModal(false), 2500);
      } catch (fallbackErr) {
        alert("Failed to transmit support ticket. Check your network connection.");
      }
    } finally {
      setIsSubmittingHelp(false);
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
        <div className="bg-slate-900 px-6 py-5 text-center border-b border-slate-800 relative">
          {/* Quick Help / Report Issue Button */}
          <button 
            type="button" 
            onClick={() => setShowHelpModal(true)}
            className="absolute right-3 top-3 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white p-1.5 rounded-lg text-[10px] font-bold flex items-center gap-1 transition cursor-pointer"
            title="Report Sign-In Issue or Get Help"
          >
            <HelpCircle size={14} className="text-blue-400" />
            <span className="hidden sm:inline">Help</span>
          </button>

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

          {/* Render server waking up notification */}
          {isWakingUp && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center space-x-2 text-amber-800 animate-pulse text-xs font-bold">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Server is waking up from sleep mode (Render instance). Please hold on...</span>
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
              <span className="animate-pulse">{isWakingUp ? 'Waking Server & Verifying...' : 'Verifying Credentials...'}</span>
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

      {/* 🟢 Report Login Issue / Help Modal */}
      {showHelpModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[300] flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-300 flex flex-col">
            <div className="bg-slate-900 text-white px-5 py-3.5 flex justify-between items-center shrink-0">
              <h3 className="font-extrabold uppercase text-xs tracking-wider flex items-center gap-1.5">
                <Wrench size={15} className="text-amber-400" /> Sign-In Fault & Technical Support
              </h3>
              <button onClick={() => setShowHelpModal(false)} className="hover:bg-slate-800 p-1 rounded transition cursor-pointer text-slate-300 hover:text-white">
                <X size={16} />
              </button>
            </div>
            
            <form onSubmit={handleSendHelpTicket} className="p-5 space-y-3.5 text-xs">
              <p className="text-[11px] text-slate-600 leading-relaxed font-medium">
                Experiencing a white screen, login timeout, or unresponsive authentication? Submit your fault description directly to High Command IT Support.
              </p>

              {helpSuccess && (
                <div className="p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg font-bold text-[11px]">
                  {helpSuccess}
                </div>
              )}

              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">Issue Category</label>
                <select 
                  value={helpCategory} 
                  onChange={(e) => setHelpCategory(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg font-bold text-slate-900 outline-none focus:border-blue-600"
                >
                  <option value="LOGIN_AUTH_FAILURE">Login / Authentication Failure</option>
                  <option value="RENDER_SERVER_SLEEP">Server Unresponsive / Cold Start Timeout</option>
                  <option value="WHITE_SCREEN_ERROR">White Screen / Frontend Crash (WSOD)</option>
                  <option value="ACCOUNT_UNAPPROVED">Account Pending Approval / Unrecognized</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">Describe the Error / Symptoms *</label>
                <textarea 
                  rows={3}
                  required
                  value={helpDescription}
                  onChange={(e) => setHelpDescription(e.target.value)}
                  placeholder="e.g. Clicking Authorize Access results in infinite loading or 500 error..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 outline-none focus:border-blue-600"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <button 
                  type="button" 
                  onClick={() => setShowHelpModal(false)}
                  className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl font-bold transition cursor-pointer"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={isSubmittingHelp}
                  className="px-5 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-xl font-extrabold flex items-center gap-1.5 transition cursor-pointer shadow disabled:opacity-50"
                >
                  {isSubmittingHelp ? 'Dispatches Ticket...' : <><Send size={13} /> Dispatch to Admin</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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