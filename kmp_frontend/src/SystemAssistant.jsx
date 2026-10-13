import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, Send, Bot, User, Loader2, Minimize2, Maximize2, ChevronDown, Database, FileText, Check, Copy, Wrench, X, CheckCircle2 } from 'lucide-react';
import { authFetch } from './api';

const FormattedMessage = ({ content }) => {
  const lines = content.split('\n');
  return (
    <div className="space-y-1.5 leading-relaxed break-words font-sans">
      {lines.map((line, idx) => {
        if (line.startsWith('### ') || (line.startsWith('**') && line.endsWith('**'))) {
          const text = line.replace(/^###\s*/, '').replace(/\*\*/g, '');
          return <div key={idx} className="font-bold text-slate-900 dark:text-slate-100 mt-2 text-[11.5px] tracking-wide border-b border-slate-200 dark:border-slate-800 pb-0.5">{text}</div>;
        }
        if (line.trim().startsWith('•') || line.trim().startsWith('-') || line.trim().startsWith('*')) {
          const text = line.replace(/^[\s•\-\*]+/, '');
          return (
            <div key={idx} className="flex items-start space-x-1.5 pl-1.5">
              <span className="text-amber-600 dark:text-amber-400 font-black shrink-0">•</span>
              <span>{renderInlineStyles(text)}</span>
            </div>
          );
        }
        if (!line.trim()) return <div key={idx} className="h-1" />;
        return <div key={idx}>{renderInlineStyles(line)}</div>;
      })}
    </div>
  );
};

const renderInlineStyles = (text) => {
  const parts = text.split(/(\*\*.*?\*\*|`.*?`)/g);
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index} className="font-bold text-slate-900 dark:text-slate-100">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={index} className="bg-slate-200/80 dark:bg-slate-800 text-amber-800 dark:text-amber-300 px-1 py-0.5 rounded text-[10px] font-mono">{part.slice(1, -1)}</code>;
    }
    return part;
  });
};

const SystemAssistant = ({ currentUser, canViewGlobal }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState(null);

  const officerFnum = currentUser?.fnum || 'AUTH';
  const officerRank = currentUser?.rank || '';
  const officerName = currentUser?.name || '';
  
  // 🟢 High-Command Clearance Check for Technical Glitch Diagnostics
  const hasDiagnosticClearance = 
    ['SUPER_ADMIN', 'ASSISTANT_SUPER_ADMIN'].includes((currentUser?.role || '').toUpperCase()) ||
    (currentUser?.position || '').toUpperCase().includes('KMP COMMANDER') ||
    (currentUser?.position || '').toUpperCase().includes('DEPUTY KMP COMMANDER');

  // Technical Glitch Verification States
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [verifyCategory, setVerifyCategory] = useState('System showing zeros where data should exist');
  const [verifyPage, setVerifyPage] = useState('Command Comms');
  const [verifyElement, setVerifyElement] = useState('Dispatch Button');
  const [verifyLogs, setVerifyLogs] = useState('TypeError: Cannot read properties of undefined (reading \'fnum\')');
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState(null);
  
  const [messages, setMessages] = useState([
    { 
      sender: 'ai', 
      text: `**KMP Centralised Security Data Management System (CSDMS) - Intelligence Assistant**

Welcome to the KMP Tracker System AI assistant. The AI Assistant Responds to your queries across all system modules. Get guidance on how to proceed.
Here is an architectural overview of the system's operational interface:

- **Home Dashboard:** Central command hub providing high-level operational summaries, quick-access metrics, and system status indicators.
- **Command Communications:** Secure internal messaging network used to dispatch and track official directives, circulars, and announcements across regions, divisions, and specific stations.
- **Crime / Incident Registry:** Core investigative ledger managing Station Diary (SD) references, offense categories, narratives, suspect demographics, and integrated lock-up population matrices.
- **Disruptive OPS Statistics:** Statistical tracking interface for operational metrics including arrests, police bonds given, cautioned cases, court committals, remands, convictions, and specialized agricultural crime summaries.
- **Success Stories:** Dedicated archive logging high-impact operational breakthroughs, recoveries, and successful public safety missions.
- **Establishments:** Structural command registry monitoring authorized personnel allocations versus actual deployment numbers across main stations, sub-stations, police posts, and security booths.
- **Nominal Roll & HR Transfers:** Comprehensive personnel database tracking force/file numbers, ranks, IPPS/NIN records, biographical details, archival logs, and strict jurisdictional transfer modification request queues.
  - *Data Ingestion Protocol:* Full-spectrum Excel uploads successfully process and store all **29 columns** of the NeonDB nominal roll schema (including biographical, financial, and identification metrics). No upload fields are restricted or truncated.
  - *AI Search Security:* When answering searches, high-command clearance allows authorized officers to view operational details while sensitive personal identifiers (such as bank accounts, TINs, and NINs) remain protected under data security protocols.
- **Tripartite Reports & Documents:** Secure repository for uploading, storing, and reviewing general documents, secure operational files, and standardized command templates.
- **Access & Approvals (Super Control Panel):** High-command administrative gateway featuring unapproved user authorizations, a granular 20+ module clearance matrix, secure audit logs, password reset requests, and emergency system/regional/station lockdown toggles.
- **AI Command Console:** Natural language intelligence engine allowing authorized commanders to query live database records securely.

*Clearance Scope:* \`${officerFnum}\` | \`${officerRank}\` | \`${officerName}\`
Region: \`${currentUser?.region || 'ALL'}\` | Station: \`${currentUser?.station || 'ALL'}\``,
      metadata: null 
    }
  ]);
  const [inputPrompt, setInputPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const chatScrollRef = useRef(null);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const quickPrompts = [
    "Regional manpower count",
    "Agricultural crimes summary",
    "What are the data export and AES-256 rules?",
    "How to troubleshoot login lockouts"
  ];

  const executeQuery = async (queryText) => {
    if (!queryText.trim() || loading) return;

    setInputPrompt('');
    setMessages(prev => [...prev, { sender: 'user', text: queryText, metadata: null }]);
    setLoading(true);

    try {
      const res = await authFetch('/api/v1/ai/query', {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          prompt: queryText,
          target_region: currentUser?.region || "ALL REGIONS",
          target_station: currentUser?.station || "ALL STATIONS"
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Tactical intelligence engine unreachable.");

      setMessages(prev => [
        ...prev, 
        { 
          sender: 'ai', 
          text: data.response || "Query executed with zero records returned.",
          metadata: data.metadata || null
        }
      ]);
    } catch (err) {
      setMessages(prev => [
        ...prev, 
        { 
          sender: 'ai', 
          text: `⚠️ **System Intelligence Notice:** ${err.message}`,
          metadata: null 
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyGlitchDiagnosis = async (e) => {
    e.preventDefault();
    setIsVerifying(true);
    setVerificationResult(null);

    try {
      const response = await authFetch('/api/v1/ai/verify-diagnosis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          glitch_category: verifyCategory,
          page_name: verifyPage,
          element_point: verifyElement,
          description: "Audited telemetry analysis requested via assistant console.",
          console_logs: [verifyLogs],
          network_errors: ["500 Internal Server Error at /api/v1/communications"]
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

  const handleSendMessage = (e) => {
    e.preventDefault();
    executeQuery(inputPrompt);
  };

  const handleCopy = (text, idx) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(idx);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <div className="fixed bottom-2 right-4 sm:right-18 z-[99990] flex flex-col items-end font-sans select-none">
      
      {/* 🟢 Technical Glitch Verification Modal (Restricted to High Command) */}
      {showVerificationModal && hasDiagnosticClearance && (
        <div className="fixed inset-0 z-[200000] bg-slate-900/80 backdrop-blur-sm flex justify-center items-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border-2 border-amber-500/50">
            <div className="bg-slate-950 text-white px-5 py-3.5 flex justify-between items-center border-b border-slate-800">
               <h3 className="font-extrabold flex items-center text-xs text-amber-400">
                 <Wrench size={15} className="mr-2"/> AI Technical Glitch Diagnosis Auditor
               </h3>
               <button onClick={() => setShowVerificationModal(false)} className="hover:bg-slate-800 p-1 rounded-lg text-slate-400 hover:text-white cursor-pointer"><X size={16}/></button>
            </div>
            
            <form onSubmit={handleVerifyGlitchDiagnosis} className="p-5 space-y-3.5 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">Glitch Category</label>
                  <input 
                    type="text" 
                    value={verifyCategory} 
                    onChange={(e) => setVerifyCategory(e.target.value)} 
                    className="w-full p-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg font-bold text-slate-900 dark:text-white outline-none focus:border-amber-500" 
                    required 
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">Target Page</label>
                  <input 
                    type="text" 
                    value={verifyPage} 
                    onChange={(e) => setVerifyPage(e.target.value)} 
                    className="w-full p-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg font-bold text-slate-900 dark:text-white outline-none focus:border-amber-500" 
                    required 
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">Element / Component Coordinate</label>
                <input 
                  type="text" 
                  value={verifyElement} 
                  onChange={(e) => setVerifyElement(e.target.value)} 
                  className="w-full p-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg font-bold text-slate-900 dark:text-white outline-none focus:border-amber-500" 
                  required 
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">Simulated Console Error Log</label>
                <textarea 
                  value={verifyLogs} 
                  onChange={(e) => setVerifyLogs(e.target.value)} 
                  rows={2}
                  className="w-full p-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg font-mono text-[11px] text-amber-600 dark:text-amber-300 outline-none focus:border-amber-500" 
                  required 
                />
              </div>

              {verificationResult && (
                <div className="bg-slate-100 dark:bg-slate-950 border border-amber-500/40 p-3 rounded-xl text-[11px] text-slate-800 dark:text-slate-200 whitespace-pre-wrap max-h-40 overflow-y-auto custom-scrollbar font-mono">
                  <div className="text-amber-600 dark:text-amber-400 font-bold mb-1 flex items-center gap-1">
                    <CheckCircle2 size={13}/> Audit Verification Output:
                  </div>
                  {verificationResult}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <button 
                  type="button" 
                  onClick={() => setShowVerificationModal(false)}
                  className="px-3.5 py-1.5 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg font-bold transition cursor-pointer"
                >
                  Close
                </button>
                <button 
                  type="submit" 
                  disabled={isVerifying}
                  className="px-4 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-extrabold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50 shadow-md"
                >
                  {isVerifying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  Run AI Audit
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isOpen && (
        <div className={`mb-2 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-300 dark:border-slate-800 overflow-hidden flex flex-col transition-all duration-300 ease-in-out animate-in slide-in-from-bottom-3 ${
          isExpanded ? 'w-[560px] h-[640px] max-w-[95vw] max-h-[85vh]' : 'w-96 h-[470px] max-w-[90vw] max-h-[80vh]'
        }`}>
          <div className="bg-slate-950 text-white px-3.5 py-2.5 flex justify-between items-center shrink-0 border-b border-slate-800">
            <div className="flex items-center space-x-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
              </span>
              <div>
                <h3 className="font-extrabold text-[11px] uppercase tracking-wider text-amber-400">
                  KMP Tracker System Intelligence Assistant
                </h3>
                <p className="text-[9px] text-slate-400 font-mono">
                  {currentUser?.fnum || 'AUTH'} • {currentUser?.station || 'HQ'}
                </p>
              </div>
            </div>
            
            <div className="flex items-center space-x-1">
              {/* 🟢 High-Command Glitch Audit Button */}
              {hasDiagnosticClearance && (
                <button 
                  type="button" 
                  onClick={() => setShowVerificationModal(true)} 
                  className="bg-amber-950 hover:bg-amber-900 border border-amber-600 text-amber-200 px-2 py-1 rounded-md text-[10px] font-bold flex items-center gap-1 transition cursor-pointer"
                  title="Audit Technical Glitch Diagnosis"
                >
                  <Wrench size={11} />
                  <span>Verify Glitch</span>
                </button>
              )}

              <button type="button" onClick={() => setIsExpanded(!isExpanded)} className="text-slate-400 hover:text-white p-1 rounded transition cursor-pointer" title={isExpanded ? "Collapse view" : "Expand view"}>
                {isExpanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
              </button>
              <button type="button" onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-white p-1 rounded transition cursor-pointer" title="Minimize Console">
                <ChevronDown size={15} />
              </button>
            </div>
          </div>

          <div className="bg-slate-100/90 dark:bg-slate-800 px-3 py-1.5 flex items-center gap-1.5 overflow-x-auto shrink-0 border-b border-slate-200 dark:border-slate-700">
            <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider shrink-0">Quick:</span>
            {quickPrompts.map((q, i) => (
              <button key={i} type="button" onClick={() => executeQuery(q)} disabled={loading} className="text-[10px] font-medium bg-white dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 px-2 py-0.5 rounded-full border border-slate-300 dark:border-slate-700 transition shrink-0 cursor-pointer disabled:opacity-50">
                {q}
              </button>
            ))}
          </div>

          <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-3.5 space-y-3 bg-slate-50 dark:bg-slate-950 text-[11px]">
            {messages.map((m, idx) => (
              <div key={idx} className={`flex flex-col ${m.sender === 'user' ? 'items-end' : 'items-start'}`}>
                <div className={`flex items-start space-x-2 max-w-[90%] ${m.sender === 'user' ? 'flex-row-reverse space-x-reverse' : ''}`}>
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 shadow-xs mt-0.5 ${
                    m.sender === 'user' ? 'bg-[#3a3225] text-white' : 'bg-slate-900 text-amber-400'
                  }`}>
                    {m.sender === 'user' ? <User size={11} /> : <Bot size={11} />}
                  </div>

                  <div className={`p-3 rounded-2xl relative group ${
                    m.sender === 'user' ? 'bg-[#596E47] text-white rounded-tr-none shadow-xs' : 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-800 rounded-tl-none shadow-xs'
                  }`}>
                    <FormattedMessage content={m.text} />
                    {m.sender === 'ai' && (
                      <button type="button" onClick={() => handleCopy(m.text, idx)} className="absolute top-2 right-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 opacity-0 group-hover:opacity-100 transition cursor-pointer p-0.5" title="Copy intelligence brief">
                        {copiedIndex === idx ? <Check size={11} className="text-emerald-600" /> : <Copy size={11} />}
                      </button>
                    )}
                  </div>
                </div>

                {m.metadata && (
                  <div className="flex flex-wrap items-center gap-1.5 mt-1 ml-7 text-[9px] text-slate-500 dark:text-slate-400 font-mono">
                    <span className="flex items-center gap-1 bg-slate-200/80 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700">
                      <Database size={9} className="text-sky-600" /> {m.metadata.database_query_status}
                    </span>
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="flex items-center space-x-2 text-slate-600 dark:text-slate-300 italic text-[11px] bg-slate-100/90 dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 w-fit">
                <Loader2 size={13} className="animate-spin text-amber-600" />
                <span>Querying tier-restricted databases and compliance manuals...</span>
              </div>
            )}
          </div>

          <form onSubmit={handleSendMessage} className="p-2.5 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center space-x-2 shrink-0">
            <input 
              type="text" 
              value={inputPrompt} 
              onChange={(e) => setInputPrompt(e.target.value)} 
              placeholder="Ask about deployment stats, policies, or troubleshooting..." 
              className="flex-1 text-[11px] border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 outline-none focus:border-[#596E47] bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:bg-white dark:focus:bg-slate-900 transition placeholder:text-slate-400"
            />
            <button type="submit" disabled={loading || !inputPrompt.trim()} className="bg-[#3a3225] hover:bg-black text-white p-2.5 rounded-xl transition cursor-pointer disabled:opacity-40 shadow-xs" title="Execute Query">
              <Send size={12} />
            </button>
          </form>
        </div>
      )}

      <button 
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={`flex items-center justify-center transition-all duration-300 ease-in-out cursor-pointer shadow-xl rounded-full border ${
          isOpen ? 'h-8 px-3 bg-amber-500 text-slate-950 border-amber-300' : isHovered ? 'h-8 px-3 bg-slate-900 text-white border-slate-700' : 'w-8 h-8 p-0 bg-slate-900/90 text-amber-400 border-slate-700 hover:bg-slate-800'
        }`}
        title="KMP Tracker System Assistant"
      >
        <Sparkles size={14} className={isOpen ? 'text-slate-950' : 'text-amber-400 animate-pulse shrink-0'} />
        {(isOpen || isHovered) && (
          <span className="font-extrabold text-[10px] uppercase tracking-wider ml-1.5 whitespace-nowrap">
            {isOpen ? 'Close AI' : 'AI Assistant'}
          </span>
        )}
      </button>
    </div>
  );
};

export default SystemAssistant;