// src/AIcommand_console.jsx
import React, { useState, useRef, useEffect } from 'react';
import {  
  Send,  
  Bot,  
  User,  
  Database,  
  FileText,  
  Terminal,  
  Shield,  
  Sparkles,  
  Loader2,  
  RefreshCw,
  Maximize2,
  Minimize2,
  X,
  Power,
  Wrench,
  CheckCircle2,
  Paperclip,
  Image as ImageIcon
} from 'lucide-react';
import { authFetch } from './api';

// ====================================================================
// EMBEDDED KNOWN ERROR DICTIONARY (KMP-CSDMS SIGNATURE DATABASE)
// ====================================================================
const KNOWN_SYSTEM_ERRORS = [
  {
    pattern: "models/gemini.*is not found|404 NOT FOUND.*generateContent",
    category: "Gemini Model Deprecation / API Version Mismatch",
    module: "routers/ai_router.py",
    source: "Google API model rotation or free-tier restriction affecting older model endpoints (e.g., gemini-1.5-flash).",
    fix: "Update candidate_models array in ai_router.py to target active free-tier models ('gemini-3.5-flash', 'gemini-3.1-flash-lite', 'gemini-2.5-flash')."
  },
  {
    pattern: "Render waking up|503 Service Unavailable|gateway timeout|upstream request timeout",
    category: "Render Free-Tier Cold Start Delay",
    module: "Infrastructure / Render Hosting",
    source: "Render free-tier server instance spinning down due to inactivity, causing initial request latency or temporary gateway timeout.",
    fix: "Implement client-side auto-retry logic with a brief delay or utilize a keep-alive heartbeat ping."
  },
  {
    pattern: "NeonDB|psycopg2\\.OperationalError|connection closed|server closed the connection unexpectedly|pool exhausted",
    category: "NeonDB Database Disconnection / Pool Drop",
    module: "app/database.py",
    source: "NeonDB serverless instance dropping idle socket connections or connection pool exhaustion under concurrent load.",
    fix: "Ensure SQLAlchemy engine is configured with pool_pre_ping=True and verify connection string parameters."
  },
  {
    pattern: "AWS_ACCESS_KEY_ID|botocore\\.exceptions|NoSuchBucket|S3 Upload failed|AccessDenied.*S3",
    category: "AWS S3 Cloud Storage Failure",
    module: "routers/auth.py / upload endpoints",
    source: "Missing, expired, or misconfigured AWS credentials/bucket policies preventing profile photo or document uploads to S3.",
    fix: "Verify AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_BUCKET_NAME environment variables on Render, and check local fallback path logic."
  },
  {
    pattern: "HTTP_402|Payment Required|Quota exceeded|Resource exhausted",
    category: "API Quota / Rate Limit Exceeded",
    module: "routers/ai_router.py / External APIs",
    source: "Google AI Studio free-tier request rate limit or daily token quota exhausted.",
    fix: "Implement model fallback chains or wait for quota window reset; consider upgrading tier if production volume spikes."
  },
  {
    pattern: "Network connectivity interrupted|Failed to fetch|ERR_CONNECTION_REFUSED|NET_DROP",
    category: "Client-Server Network Connection Drop",
    module: "src/api.js / Frontend Login",
    source: "Intermittent local mobile/broadband network drops or CORS/gateway routing blockage between Vercel frontend and Render backend.",
    fix: "Check VITE_API_URL environment variable on Vercel, verify backend health check endpoint, and utilize the local storage telemetry buffer for offline resilience."
  },
  {
    pattern: "500 Internal Server Error",
    category: "Unhandled Backend Exception",
    module: "FastAPI Routers / SQLAlchemy",
    source: "An unhandled Python exception, missing database migration column, or null-pointer reference occurred during a request lifecycle.",
    fix: "Inspect the backend terminal/Render logs or check the Admin Communications table where the automated crash report dispatched the AI Root-Cause Analysis."
  },
  {
    pattern: "Cannot read properties of undefined.*fnum|TypeError.*reading",
    category: "Frontend State Hydration Fault",
    module: "src/Login.jsx / Dashboard Components",
    source: "React component attempting to render user attributes before session state or props have fully resolved.",
    fix: "Apply strict optional chaining (?.) and default null-state checks across component prop bindings."
  },
  {
    pattern: "Signature verification failed|JWTError|Could not validate credentials",
    category: "Expired or Corrupted Session Token",
    module: "app/core/security.py / auth.py",
    source: "Token expiration due to inactivity or server secret key invalidation following a deployment restart.",
    fix: "Trigger clearAuthSession() on the client and redirect user securely to the login portal."
  }
];

const matchKnownError = (logText) => {
  for (const errorDef of KNOWN_SYSTEM_ERRORS) {
    const regex = new RegExp(errorDef.pattern, "i");
    if (regex.test(logText)) {
      return { matched: true, dictionary_match: errorDef };
    }
  }
  return { matched: false };
};

const AICommandConsole = ({ currentUser, onBack }) => {
  const officerFnum = currentUser?.fnum || 'N/A';
  const officerRank = currentUser?.rank || 'OFFICER';
  const officerName = currentUser?.name || 'OPERATIVE';
  const isSuperAdmin = ['SUPER_ADMIN', 'ADMIN'].includes(currentUser?.role);

  // 🟢 High-Command Check for Technical Glitch Verification Clearance
  const hasDiagnosticClearance = 
    ['SUPER_ADMIN', 'ASSISTANT_SUPER_ADMIN'].includes((currentUser?.role || '').toUpperCase()) ||
    (currentUser?.position || '').toUpperCase().includes('KMP COMMANDER') ||
    (currentUser?.position || '').toUpperCase().includes('DEPUTY KMP COMMANDER');

  const [messages, setMessages] = useState([
  {
    id: 'init-1',
    sender: 'ai',
    text: `**KMP Centralised Security Data Management System (CSDMS) - Intelligence Assistant (Gemini 2.5/2.0 Powered)**

Standing by for commander queries across all system modules. Here is an architectural overview of the system's operational interface:

- **Home Dashboard:** Central command hub providing high-level operational summaries, quick-access metrics, and system status indicators.
- **Command Communications:** Secure internal messaging network used to dispatch and track official directives, circulars, and announcements across regions, divisions, and specific stations.
- **Crime / Incident Registry:** Core investigative ledger managing Station Diary (SD) references, offense categories, narratives, suspect demographics, and integrated lock-up population matrices.
- **Disruptive OPS Statistics:** Statistical tracking interface for operational metrics including arrests, police bonds given, cautioned cases, court committals, remands, convictions, and specialized agricultural crime summaries.
- **Success Stories:** Dedicated archive logging high-impact operational breakthroughs, recoveries, and successful public safety missions.
- **Impounded Exhibits:** Secure tracking ledger for confiscated vehicles, motorcycles, currency, and property exhibits. Fully integrated into the AI intelligence engine for automated property searches, status summaries, and jurisdiction-scoped queries.
- **Establishments:** Structural command registry monitoring authorized personnel allocations versus actual deployment numbers across main stations, sub-stations, police posts, and security booths.
- **Nominal Roll & HR Transfers:** Comprehensive personnel database tracking force/file numbers, ranks, IPPS/NIN records, biographical details, archival logs, and strict jurisdictional transfer modification request queues.
- **AI Command Console:** Natural language intelligence engine powered by Gemini 2.5/2.0-flash, allowing authorized commanders to query live database records securely with full multimodal photo and screenshot analysis support.

*Clearance Scope:* \`${officerFnum}\` | \`${officerRank}\` | \`${officerName}\`
Region: \`${currentUser?.region || 'ALL'}\` | Station: \`${currentUser?.station || 'ALL'}\``,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    metadata: null
  }
]);

  const [inputQuery, setInputQuery] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [isDbKillActive, setIsDbKillActive] = useState(false);

  // 🟢 Technical Glitch Verification States (Cleared Hardcoded Defaults)
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [verifyCategory, setVerifyCategory] = useState('');
  const [verifyPage, setVerifyPage] = useState('');
  const [verifyElement, setVerifyElement] = useState('');
  const [verifyLogs, setVerifyLogs] = useState('Initializing live console telemetry...');
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState(null);

  // 🟢 Live Telemetry Buffer Ref
  const capturedLogsRef = useRef({ console: [], network: [] });

  const chatEndRef = useRef(null);
  const fileInputRef = useRef(null);

  // 🟢 Capture Real-Time Browser Console & Network Errors
  useEffect(() => {
    const originalConsoleError = console.error;
    console.error = (...args) => {
      const safeLog = args.map(arg => (typeof arg === 'object' ? JSON.stringify(arg) : String(arg))).join(' ');
      capturedLogsRef.current.console.push(`[CONSOLE_ERR] ${safeLog}`);
      if (capturedLogsRef.current.console.length > 25) capturedLogsRef.current.console.shift();
      originalConsoleError.apply(console, args);
    };

    const handleWindowError = (e) => {
      capturedLogsRef.current.console.push(`[SYS_CRASH] ${e.message} at ${e.filename}:${e.lineno}`);
    };
    window.addEventListener('error', handleWindowError);

    // Read from global telemetry store initialized in api.js
    const globalBuffer = window.__kmp_global_telemetry || { console: [], network: [] };
    if (globalBuffer.network.length > 0) {
      capturedLogsRef.current.network = [...globalBuffer.network];
    }

    return () => {
      console.error = originalConsoleError;
      window.removeEventListener('error', handleWindowError);
    };
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, setIsLoading]);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
      setFilePreview(URL.createObjectURL(file));
    }
  };

  const clearAttachment = () => {
    setSelectedFile(null);
    setFilePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleKillSwitchToggle = async () => {
    try {
      const res = await authFetch('/api/v1/ai/admin/toggle-db-query', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setIsDbKillActive(!data.ai_database_query_enabled);
        alert(data.message);
      }
    } catch (err) {
      alert("Failed to toggle AI database kill switch.");
    }
  };

  // 🟢 Open Modal and Auto-Populate with Live Captured Telemetry
  const openVerificationModal = () => {
    const globalBuffer = window.__kmp_global_telemetry || { console: [], network: [] };
    const allCaptured = [
      ...capturedLogsRef.current.console,
      ...globalBuffer.network,
      ...capturedLogsRef.current.network
    ];

    if (allCaptured.length > 0) {
      setVerifyLogs(allCaptured.join('\n'));
    } else {
      setVerifyLogs("No recent console errors or failed network requests captured in global session buffer.");
    }
    
    // Auto-fill Target Page with current URL path, clear category/element for manual entry
    setVerifyPage(window.location.pathname === '/' ? 'Home Dashboard' : window.location.pathname);
    setVerifyCategory('');
    setVerifyElement('');
    setVerificationResult(null);
    setShowVerificationModal(true);
  };

  // 🟢 Instant Client-Side Dictionary Check with Backend AI Fallback
  const handleVerifyGlitchDiagnosis = async (e) => {
    e.preventDefault();
    setIsVerifying(true);
    setVerificationResult(null);

    const combinedLogText = `${verifyLogs} ${verifyCategory} ${verifyPage} ${verifyElement}`;

    // Step 1: Instant Client-Side Dictionary Match
    const localMatch = matchKnownError(combinedLogText);
    if (localMatch.matched) {
      const matchData = localMatch.dictionary_match;
      const report = (
        `🔍 **DIAGNOSTIC AUDIT REPORT (Local Known Error Match)**\n\n` +
        `• **Category:** ${matchData.category}\n` +
        `• **Affected Module:** ${matchData.module}\n` +
        `• **Root Cause:** ${matchData.source}\n` +
        `• **Required Implementation Fix:** ${matchData.fix}\n`
      );
      setVerificationResult(report);
      setIsVerifying(false);
      return;
    }

    // Step 2: Fallback to Backend AI if unknown
    try {
      const response = await authFetch('/api/v1/ai/verify-diagnosis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          glitch_category: verifyCategory,
          page_name: verifyPage,
          element_point: verifyElement,
          description: "Audited telemetry analysis requested via High Command console with live buffer feed.",
          console_logs: [verifyLogs],
          network_errors: window.__kmp_global_telemetry?.network || ["500 Internal Server Error"]
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || "Diagnosis verification failed.");
      }

      const data = await response.json();
      setVerificationResult(data.verification_report);
    } catch (err) {
      setVerificationResult(`⚠️ **Verification Error**: ${err.message}`);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleSendQuery = async (e) => {
    e?.preventDefault();
    const cleanPrompt = inputQuery.trim();
    if ((!cleanPrompt && !selectedFile) || isLoading) return;

    const userMessage = {
      id: `usr-${Date.now()}`,
      sender: 'user',
      text: cleanPrompt || '[Attached Screenshot/Photo]',
      image: filePreview,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      metadata: null
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputQuery('');
    const currentFile = selectedFile;
    clearAttachment();
    setIsLoading(true);

    try {
      const formData = new FormData();
      formData.append('prompt', cleanPrompt || 'Analyze this attached image/screenshot.');
      formData.append('target_region', currentUser?.region || 'ALL REGIONS');
      formData.append('target_station', currentUser?.station || 'ALL STATIONS');
      if (currentFile) {
        formData.append('file', currentFile);
      }

      const response = await authFetch('/api/v1/ai/query', {
        method: 'POST',
        body: formData 
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `Server responded with ${response.status}`);
      }

      const data = await response.json();

      const aiReply = {
        id: `ai-${Date.now()}`,
        sender: 'ai',
        text: data.response,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        metadata: data.metadata || null
      };

      setMessages((prev) => [...prev, aiReply]);
    } catch (err) {
      const errorReply = {
        id: `err-${Date.now()}`,
        sender: 'ai',
        isError: true,
        text: `⚠️ **Tactical Processing Error**: ${err.message}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        metadata: null
      };
      setMessages((prev) => [...prev, errorReply]);
    } finally {
      setIsLoading(false);
    }
  };

  const quickPrompts = [
    "What is the status of recently impounded vehicles?",
    "Summarize agricultural thefts and recoveries",
    "What are the rules for data classification and AES-256 exports?",
    "How do I resolve login lockouts or reset my security key?",
    "Where is officer IPPS or Force Number stationed?"
  ];

  return (
    <div className={`flex flex-col bg-[#020617] text-slate-100 rounded-2xl border-2 border-slate-700 shadow-2xl overflow-hidden transition-all duration-300 ${
      isFullScreen ? 'fixed inset-4 z-[9999] h-[calc(100vh-2rem)] max-w-none m-0' : 'h-[calc(100vh-6rem)] max-w-7xl mx-auto my-0 px-2 sm:px-6'
    }`}>
      
      {/* 🟢 Technical Glitch Verification Modal (Restricted to High Command) */}
      {showVerificationModal && hasDiagnosticClearance && (
        <div className="fixed inset-0 z-[200] bg-slate-900/80 backdrop-blur-sm flex justify-center items-center p-4">
          <div className="bg-[#0f172a] rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden border-2 border-amber-500/50">
            <div className="bg-[#020617] text-white px-6 py-4 flex justify-between items-center border-b border-slate-700">
               <h3 className="font-extrabold flex items-center text-sm text-amber-400">
                 <Wrench size={18} className="mr-2"/> AI Technical Glitch Diagnosis Auditor (Live Feed & Dictionary Match)
               </h3>
               <button onClick={() => setShowVerificationModal(false)} className="hover:bg-slate-800 p-1.5 rounded-lg text-slate-400 hover:text-white cursor-pointer"><X size={18}/></button>
            </div>
            
            <form onSubmit={handleVerifyGlitchDiagnosis} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-1">Glitch Category</label>
                  <input 
                    type="text" 
                    value={verifyCategory} 
                    onChange={(e) => setVerifyCategory(e.target.value)} 
                    placeholder="E.g., Missing Data, 500 Error, etc."
                    className="w-full p-2.5 bg-[#020617] border border-slate-700 rounded-lg text-xs font-bold text-white outline-none focus:border-amber-500" 
                    required 
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-1">Target Page</label>
                  <input 
                    type="text" 
                    value={verifyPage} 
                    onChange={(e) => setVerifyPage(e.target.value)} 
                    className="w-full p-2.5 bg-[#020617] border border-slate-700 rounded-lg text-xs font-bold text-white outline-none focus:border-amber-500" 
                    required 
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase mb-1">Element / Component Coordinate</label>
                <input 
                  type="text" 
                  value={verifyElement} 
                  onChange={(e) => setVerifyElement(e.target.value)} 
                  placeholder="E.g., Save Button, Dashboard Table, etc."
                  className="w-full p-2.5 bg-[#020617] border border-slate-700 rounded-lg text-xs font-bold text-white outline-none focus:border-amber-500" 
                  required 
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase mb-1">Auto-Fed Live Console & Network Error Log</label>
                <textarea 
                  value={verifyLogs} 
                  onChange={(e) => setVerifyLogs(e.target.value)} 
                  rows={4}
                  className="w-full p-2.5 bg-[#020617] border border-slate-700 rounded-lg font-mono text-xs text-amber-300 outline-none focus:border-amber-500" 
                  required 
                />
              </div>

              {verificationResult && (
                <div className="bg-[#020617] border border-amber-500/40 p-4 rounded-xl text-xs text-slate-200 whitespace-pre-wrap max-h-48 overflow-y-auto custom-scrollbar font-mono">
                  <div className="text-amber-400 font-bold mb-1 flex items-center gap-1.5">
                    <CheckCircle2 size={14}/> Audit Verification Output:
                  </div>
                  {verificationResult}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2 border-t border-slate-700">
                <button 
                  type="button" 
                  onClick={() => setShowVerificationModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  Close
                </button>
                <button 
                  type="submit" 
                  disabled={isVerifying}
                  className="px-6 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-extrabold flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-50 shadow-lg"
                >
                  {isVerifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  Run Audit / Match
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Header Bar */}
      <div className="bg-[#0f172a] border-b-2 border-slate-700 px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-[#020617] border border-sky-500/50 rounded-xl text-sky-400">
            <Sparkles className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h3 className="font-black text-sm uppercase tracking-wider text-white flex items-center gap-2">
              KMP Tactical AI Command Console
              <span className="bg-sky-950 text-sky-300 text-[10px] px-2 py-0.5 rounded-full border border-sky-700 font-bold">
                Gemini Multimodal RAG
              </span>
            </h3>
            <p className="text-xs text-slate-300">
              Clearance: <span className="text-amber-300 font-bold">{officerFnum} | {officerRank} | {officerName}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {hasDiagnosticClearance && (
            <button
              onClick={openVerificationModal}
              className="px-3 py-1.5 bg-amber-950 hover:bg-amber-900 border border-amber-600 text-amber-200 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
              title="Audit Technical Glitch Diagnosis with Live Console Feed"
            >
              <Wrench className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Verify Glitch</span>
            </button>
          )}

          {isSuperAdmin && (
            <button
              onClick={handleKillSwitchToggle}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer border ${
                isDbKillActive 
                  ? 'bg-emerald-950 border-emerald-600 text-emerald-200 hover:bg-emerald-900' 
                  : 'bg-red-950 border-red-600 text-red-200 hover:bg-red-900'
              }`}
              title="Toggle AI Direct Database Querying Access"
            >
              <Power className="w-3.5 h-3.5" />
              <span>{isDbKillActive ? 'Enable AI DB Query' : 'Kill AI DB Query'}</span>
            </button>
          )}

          <button onClick={() => setMessages([messages[0]])} className="p-2 bg-[#020617] hover:bg-slate-800 border border-slate-700 rounded-lg text-slate-300 hover:text-white transition-colors cursor-pointer" title="Reset Stream">
            <RefreshCw className="w-4 h-4" />
          </button>
          
          <button onClick={() => setIsFullScreen(!isFullScreen)} className="p-2 bg-[#020617] hover:bg-slate-800 border border-slate-700 rounded-lg text-slate-300 hover:text-white transition-colors cursor-pointer">
            {isFullScreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          {onBack && (
            <button onClick={onBack} className="p-2 bg-red-950 hover:bg-red-900 border border-red-700 rounded-lg text-red-200 hover:text-white transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-bold">
              <X className="w-4 h-4" />
              <span className="hidden sm:inline">Close</span>
            </button>
          )}
        </div>
      </div>

      {/* Message Stream */}
      <div className="flex-1 overflow-y-auto p-6 sm:px-12 space-y-6 bg-[#020617] custom-scrollbar">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex items-start gap-3.5 ${msg.sender === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border-2 ${
              msg.sender === 'user' ? 'bg-[#0f172a] border-amber-500 text-amber-400' : msg.isError ? 'bg-[#0f172a] border-red-500 text-red-400' : 'bg-[#0f172a] border-sky-500 text-sky-400'
            }`}>
              {msg.sender === 'user' ? <User className="w-4 h-4" /> : msg.isError ? <Shield className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
            </div>

            <div className={`flex flex-col max-w-4xl ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}>
              <div className={`p-4 sm:p-5 rounded-2xl text-xs sm:text-sm leading-relaxed border-2 whitespace-pre-wrap font-medium space-y-3 ${
                msg.sender === 'user' ? 'bg-amber-700 text-white border-amber-500 rounded-tr-none shadow-md' : msg.isError ? 'bg-red-950 text-red-100 border-red-700 rounded-tl-none shadow-md' : 'bg-[#0f172a] text-slate-100 border-slate-700 rounded-tl-none shadow-lg'
              }`}>
                {msg.image && (
                  <div className="rounded-xl overflow-hidden border border-amber-400/40 max-w-xs">
                    <img src={msg.image} alt="User Upload" className="w-full h-auto object-cover" />
                  </div>
                )}
                <div>{msg.text}</div>
              </div>

              {msg.metadata && (
                <div className="flex flex-wrap gap-2 mt-2">
                  <span className="inline-flex items-center gap-1 text-[10px] font-mono bg-[#0f172a] text-sky-200 border border-slate-600 px-2 py-0.5 rounded-md font-bold">
                    <Database className="w-3 h-3 text-sky-400" /> Status: {msg.metadata.database_query_status}
                  </span>
                  {msg.metadata.structured_records_count > 0 && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-mono bg-[#0f172a] text-emerald-200 border border-slate-600 px-2 py-0.5 rounded-md font-bold">
                      <Terminal className="w-3 h-3 text-emerald-400" /> {msg.metadata.structured_records_count} DB Rows Scanned
                    </span>
                  )}
                  {msg.metadata.ai_model_used && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-mono bg-[#0f172a] text-purple-200 border border-slate-600 px-2 py-0.5 rounded-md font-bold">
                      <Sparkles className="w-3 h-3 text-purple-400" /> Model: {msg.metadata.ai_model_used}
                    </span>
                  )}
                </div>
              )}
              <span className="text-[10px] text-slate-400 mt-1 px-1 font-bold">{msg.timestamp}</span>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex items-start gap-3.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-[#0f172a] border-2 border-sky-500 text-sky-400">
              <Loader2 className="w-4 h-4 animate-spin" />
            </div>
            <div className="bg-[#0f172a] border-2 border-slate-700 rounded-2xl rounded-tl-none p-4 text-xs text-slate-200 font-bold flex items-center gap-2 shadow-lg">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-sky-400 animate-ping" />
              Processing Gemini intelligence metrics...
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Suggestion Chips */}
      <div className="px-6 sm:px-12 py-3 bg-[#0f172a] border-t-2 border-slate-700 flex items-center gap-2 overflow-x-auto no-scrollbar shrink-0">
        <span className="text-[11px] text-slate-300 font-extrabold uppercase tracking-wider shrink-0">Suggestions:</span>
        {quickPrompts.map((prompt, i) => (
          <button key={i} onClick={() => setInputQuery(prompt)} className="text-xs bg-[#020617] hover:bg-slate-800 border border-slate-600 text-slate-200 font-bold px-3 py-1.5 rounded-full whitespace-nowrap transition-colors cursor-pointer shadow-sm">
            {prompt}
          </button>
        ))}
      </div>

      {/* File Preview Banner */}
      {filePreview && (
        <div className="px-6 sm:px-12 py-2 bg-[#0b1329] border-t border-slate-700 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg overflow-hidden border border-sky-500">
              <img src={filePreview} alt="Preview" className="w-full h-full object-cover" />
            </div>
            <div className="text-xs text-slate-200 font-bold truncate max-w-xs">
              Attached: <span className="text-sky-400">{selectedFile?.name}</span>
            </div>
          </div>
          <button onClick={clearAttachment} className="text-red-400 hover:text-red-300 text-xs font-bold flex items-center gap-1 cursor-pointer">
            <X size={14} /> Remove
          </button>
        </div>
      )}

      {/* Input Bar */}
      <form onSubmit={handleSendQuery} className="p-4 sm:px-12 bg-[#0f172a] border-t-2 border-slate-700 flex items-center gap-3 shrink-0">
        <input 
          type="file" 
          ref={fileInputRef} 
          onChange={handleFileChange} 
          accept="image/*" 
          className="hidden" 
        />
        <button 
          type="button" 
          onClick={() => fileInputRef.current?.click()} 
          className="p-3 bg-[#020617] hover:bg-slate-800 border-2 border-slate-700 rounded-xl text-slate-300 hover:text-white transition-colors cursor-pointer shrink-0"
          title="Attach Screenshot or Photo"
        >
          <Paperclip className="w-5 h-5" />
        </button>

        <input
          type="text"
          value={inputQuery}
          onChange={(e) => setInputQuery(e.target.value)}
          placeholder="Issue operational query or attach screenshot..."
          className="flex-1 bg-[#020617] border-2 border-slate-700 rounded-xl px-4 py-3 text-xs sm:text-sm text-white placeholder-slate-400 font-medium focus:outline-none focus:border-sky-500 transition-colors shadow-inner"
        />
        <button type="submit" disabled={isLoading || (!inputQuery.trim() && !selectedFile)} className="px-6 py-3 bg-sky-600 hover:bg-sky-500 active:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-extrabold text-xs uppercase tracking-wider rounded-xl transition-colors flex items-center gap-2 shrink-0 shadow-lg cursor-pointer border border-sky-400">
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          Execute
        </button>
      </form>
    </div>
  );
};

export default AICommandConsole;