// src/components/SystemAssistant.jsx
import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, Send, Bot, User, Loader2, Minimize2, Maximize2, ChevronDown, Wrench, X } from 'lucide-react';
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

const SystemAssistant = ({ currentUser, limitedMode = false, embedded = false }) => {
  const [isOpen, setIsOpen] = useState(embedded || false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  // High-Command Clearance Check for Technical Glitch Diagnostics
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
      text: limitedMode 
        ? "Greetings, Officer. I am your KMP Access Assistant. Tap a quick query below or type your question regarding credentials and portal access."
        : `**KMP Centralised Security Data Management System (CSDMS) - Intelligence Assistant**\n\nWelcome, ${currentUser?.rank || 'Officer'} ${currentUser?.name || ''}. How may I assist your command jurisdiction today?`,
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

  const quickPrompts = limitedMode ? [
    "How do I request access?",
    "What format is my Force Number?",
    "Password requirements",
    "Account approval status"
  ] : [
    "Regional manpower count",
    "Agricultural crimes summary",
    "What are the data export rules?",
    "How to troubleshoot login lockouts"
  ];

  // 🟢 Local rule-based engine for unauthenticated visitors on the login screen (Zero token, zero server latency)
  const getLocalLoginAnswer = (query) => {
    const lower = query.toLowerCase();

    if (lower.includes('access') || lower.includes('request') || lower.includes('signup') || lower.includes('account')) {
      return "### Access Request Workflow\nTo request access as a new officer:\n• Click **'Sign Up (Request Access)'** on the main login card.\n• Fill out your official **Force Number** and **IPPS** details.\n• Upload your mandatory service identification photograph.\n• Accept the **Terms & Policy** before submitting your application for High Command review.";
    } 
    if (lower.includes('force number') || lower.includes('fnum') || lower.includes('format')) {
      return "### Force Number Formatting\n• Force Numbers must be entered in official uppercase format (e.g., `A/2408` or numeric service IDs like `63034`).\n• Ensure it matches your active deployment records in the HR Nominal Roll.";
    } 
    if (lower.includes('password') || lower.includes('key') || lower.includes('requirement')) {
      return "### Security Key & Password Policy\n• Passwords require a minimum of **8 characters** combining uppercase letters, lowercase letters, and digits.\n• Accounts trigger a temporary **30-second security lockout** after 3 consecutive failed login attempts.";
    } 
    if (lower.includes('reset') || lower.includes('forgot')) {
      return "### Password Recovery\n• Click **'Forgot Security Key?'** on the login form.\n• Enter your registered Force Number and submit a reset request directly to Command review logs.";
    }
    if (lower.includes('status') || lower.includes('approval')) {
      return "### Account Approval Status\n• New account requests are vetted by Super Administrators or Regional Commanders.\n• Once approved, your credentials will authorize successfully against the central database.";
    }
    
    return `### KMP Access Guide\nI received your query regarding "${query}". Because you are accessing the public portal prior to authorization, live database queries are restricted. Please consult the login screen navigation guide above or submit a manual fault ticket.`;
  };

  const executeQuery = async (queryText) => {
    if (!queryText.trim() || loading) return;

    const currentPrompt = queryText.trim();
    setInputPrompt('');
    setMessages(prev => [...prev, { sender: 'user', text: currentPrompt, metadata: null }]);
    setLoading(true);

    try {
      // 🟢 Login screen mode: Answer instantly via local logic without needing tokens or hitting Render backend
      if (limitedMode) {
        await new Promise(resolve => setTimeout(resolve, 300));
        const localAnswer = getLocalLoginAnswer(currentPrompt);
        setMessages(prev => [...prev, { sender: 'ai', text: localAnswer, metadata: { ai_model_used: 'Local Rule Engine' } }]);
        setLoading(false);
        return;
      }

      // Authenticated Dashboard User Query Flow
      const formData = new FormData();
      formData.append('prompt', currentPrompt);
      formData.append('target_region', currentUser?.region || "ALL REGIONS");
      formData.append('target_station', currentUser?.station || "ALL STATIONS");

      const res = await authFetch('/api/v1/ai/query', {
        method: "POST",
        body: formData
      });

      const contentType = res.headers.get("content-type");
      if (!res.ok || !contentType || !contentType.includes("application/json")) {
        throw new Error(`Server returned status ${res.status}`);
      }

      const data = await res.json();
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
          text: `⚠️ **System Intelligence Notice:** Connection to server delayed (${err.message}). Please try your prompt again in a moment.`,
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

  if (embedded) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-300 dark:border-slate-700 overflow-hidden flex flex-col h-full shadow-inner font-sans">
        <div className="bg-slate-950 text-white px-3 py-2 flex justify-between items-center shrink-0 border-b border-slate-800">
          <span className="font-extrabold text-[10px] uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
            <Sparkles size={12} className="text-amber-400 animate-pulse" /> KMP Intelligence Core
          </span>
          <span className="text-[9px] text-emerald-400 font-mono">● Secure Link</span>
        </div>

        <div className="bg-slate-100 dark:bg-slate-800 px-2.5 py-1.5 flex items-center gap-1 overflow-x-auto shrink-0 border-b border-slate-200 dark:border-slate-700">
          <span className="text-[9px] font-bold text-slate-500 uppercase shrink-0">Quick:</span>
          {quickPrompts.map((q, i) => (
            <button key={i} type="button" onClick={() => executeQuery(q)} disabled={loading} className="text-[9.5px] font-medium bg-white dark:bg-slate-900 hover:bg-slate-200 text-slate-700 dark:text-slate-200 px-2 py-0.5 rounded-full border border-slate-300 dark:border-slate-700 transition shrink-0 cursor-pointer disabled:opacity-50">
              {q}
            </button>
          ))}
        </div>

        <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-3 space-y-2.5 bg-slate-50 dark:bg-slate-950 text-[11px] max-h-48">
          {messages.map((m, idx) => (
            <div key={idx} className={`flex flex-col ${m.sender === 'user' ? 'items-end' : 'items-start'}`}>
              <div className={`flex items-start space-x-2 max-w-[92%] ${m.sender === 'user' ? 'flex-row-reverse space-x-reverse' : ''}`}>
                <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                  m.sender === 'user' ? 'bg-[#3a3225] text-white' : 'bg-slate-900 text-amber-400'
                }`}>
                  {m.sender === 'user' ? <User size={10} /> : <Bot size={10} />}
                </div>
                <div className={`p-2.5 rounded-xl ${
                  m.sender === 'user' ? 'bg-[#596E47] text-white rounded-tr-none' : 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-800 rounded-tl-none'
                }`}>
                  <FormattedMessage content={m.text} />
                </div>
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex items-center space-x-1.5 text-slate-500 italic text-[10px] bg-slate-100 p-2 rounded-lg">
              <Loader2 size={12} className="animate-spin text-amber-600" />
              <span>Querying intelligence engine...</span>
            </div>
          )}
        </div>

        <form onSubmit={handleSendMessage} className="p-2 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center space-x-1 shrink-0">
          <input 
            type="text" 
            value={inputPrompt} 
            onChange={(e) => setInputPrompt(e.target.value)} 
            placeholder="Ask questions or type query..." 
            className="flex-1 text-[11px] border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 outline-none focus:border-[#596E47] bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
          />
          <button type="submit" disabled={loading || !inputPrompt.trim()} className="bg-[#3a3225] hover:bg-black text-white p-2 rounded-lg transition cursor-pointer disabled:opacity-40">
            <Send size={11} />
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="fixed bottom-2 right-4 sm:right-18 z-[99990] flex flex-col items-end font-sans select-none">
      {isOpen && (
        <div className={`mb-2 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-300 dark:border-slate-800 overflow-hidden flex flex-col transition-all duration-300 ease-in-out animate-in slide-in-from-bottom-3 ${
          isExpanded ? 'w-[560px] h-[640px] max-w-[95vw] max-h-[85vh]' : 'w-96 h-[490px] max-w-[90vw] max-h-[80vh]'
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
              <button type="button" onClick={() => setIsExpanded(!isExpanded)} className="text-slate-400 hover:text-white p-1 rounded transition cursor-pointer">
                {isExpanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
              </button>
              <button type="button" onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-white p-1 rounded transition cursor-pointer">
                <ChevronDown size={15} />
              </button>
            </div>
          </div>

          <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-3.5 space-y-3 bg-slate-50 dark:bg-slate-950 text-[11px]">
            {messages.map((m, idx) => (
              <div key={idx} className={`flex flex-col ${m.sender === 'user' ? 'items-end' : 'items-start'}`}>
                <div className={`flex items-start space-x-2 max-w-[90%] ${m.sender === 'user' ? 'flex-row-reverse space-x-reverse' : ''}`}>
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                    m.sender === 'user' ? 'bg-[#3a3225] text-white' : 'bg-slate-900 text-amber-400'
                  }`}>
                    {m.sender === 'user' ? <User size={11} /> : <Bot size={11} />}
                  </div>
                  <div className={`p-3 rounded-2xl relative group space-y-2 ${
                    m.sender === 'user' ? 'bg-[#596E47] text-white rounded-tr-none' : 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-800 rounded-tl-none'
                  }`}>
                    <FormattedMessage content={m.text} />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <form onSubmit={handleSendMessage} className="p-2.5 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center space-x-1.5 shrink-0">
            <input 
              type="text" 
              value={inputPrompt} 
              onChange={(e) => setInputPrompt(e.target.value)} 
              placeholder="Ask questions..." 
              className="flex-1 text-[11px] border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 outline-none focus:border-[#596E47] bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
            />
            <button type="submit" disabled={loading || !inputPrompt.trim()} className="bg-[#3a3225] hover:bg-black text-white p-2.5 rounded-xl transition cursor-pointer disabled:opacity-40">
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