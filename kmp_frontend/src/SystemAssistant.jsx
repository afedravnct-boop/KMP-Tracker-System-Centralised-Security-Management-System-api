import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, Send, Bot, User, Loader2, Minimize2, Maximize2, ChevronDown, Database, FileText, Check, Copy } from 'lucide-react';
import { authFetch } from './api';

const FormattedMessage = ({ content }) => {
  const lines = content.split('\n');
  return (
    <div className="space-y-1.5 leading-relaxed break-words font-sans">
      {lines.map((line, idx) => {
        if (line.startsWith('### ') || line.startsWith('**') && line.endsWith('**')) {
          const text = line.replace(/^###\s*/, '').replace(/\*\*/g, '');
          return <div key={idx} className="font-bold text-slate-900 mt-2 text-[11.5px] tracking-wide border-b border-slate-200 pb-0.5">{text}</div>;
        }
        if (line.trim().startsWith('•') || line.trim().startsWith('-') || line.trim().startsWith('*')) {
          const text = line.replace(/^[\s•\-\*]+/, '');
          return (
            <div key={idx} className="flex items-start space-x-1.5 pl-1.5">
              <span className="text-amber-600 font-black shrink-0">•</span>
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
      return <strong key={index} className="font-bold text-slate-900">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={index} className="bg-slate-200/80 text-amber-800 px-1 py-0.5 rounded text-[10px] font-mono">{part.slice(1, -1)}</code>;
    }
    return part;
  });
};

const SystemAssistant = ({ currentUser, canViewGlobal }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState(null);
  
  const [messages, setMessages] = useState([
    { 
      sender: 'ai', 
      text: `Greetings ${currentUser?.rank || 'Officer'} ${currentUser?.name || ''}. I am your KMP CSDMS Tactical Intelligence Assistant. I have tier-restricted clearance to query nominal rolls, crime registers, and summary matrices.`,
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
    "Active lockup status"
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
          text: `⚠️ **Command Intelligence Notice:** ${err.message}`,
          metadata: null 
        }
      ]);
    } finally {
      setLoading(false);
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
    <div className="fixed bottom-3 left-16 z-[99990] flex flex-col items-start font-sans select-none">
      {isOpen && (
        <div className={`mb-2 bg-white rounded-2xl shadow-2xl border border-slate-300 overflow-hidden flex flex-col transition-all duration-300 ease-in-out animate-in slide-in-from-bottom-3 ${
          isExpanded ? 'w-[560px] h-[640px] max-w-[95vw]' : 'w-96 h-[470px] max-w-[90vw]'
        }`}>
          <div className="bg-slate-950 text-white px-3.5 py-2.5 flex justify-between items-center shrink-0 border-b border-slate-800">
            <div className="flex items-center space-x-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
              </span>
              <div>
                <h3 className="font-extrabold text-[11px] uppercase tracking-wider text-amber-400">
                  KMP Intelligence Assistant
                </h3>
                <p className="text-[9px] text-slate-400 font-mono">
                  {currentUser?.fnum || 'AUTH'} • {currentUser?.station || 'HQ'}
                </p>
              </div>
            </div>
            
            <div className="flex items-center space-x-1">
              <button type="button" onClick={() => setIsExpanded(!isExpanded)} className="text-slate-400 hover:text-white p-1 rounded transition cursor-pointer" title={isExpanded ? "Collapse view" : "Expand view"}>
                {isExpanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
              </button>
              <button type="button" onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-white p-1 rounded transition cursor-pointer" title="Minimize Console">
                <ChevronDown size={15} />
              </button>
            </div>
          </div>

          <div className="bg-slate-100/90 px-3 py-1.5 flex items-center gap-1.5 overflow-x-auto shrink-0 border-b border-slate-200">
            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider shrink-0">Quick:</span>
            {quickPrompts.map((q, i) => (
              <button key={i} type="button" onClick={() => executeQuery(q)} disabled={loading} className="text-[10px] font-medium bg-white hover:bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full border border-slate-300 transition shrink-0 cursor-pointer disabled:opacity-50">
                {q}
              </button>
            ))}
          </div>

          <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-3.5 space-y-3 bg-slate-50 text-[11px]">
            {messages.map((m, idx) => (
              <div key={idx} className={`flex flex-col ${m.sender === 'user' ? 'items-end' : 'items-start'}`}>
                <div className={`flex items-start space-x-2 max-w-[90%] ${m.sender === 'user' ? 'flex-row-reverse space-x-reverse' : ''}`}>
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 shadow-xs mt-0.5 ${
                    m.sender === 'user' ? 'bg-[#3a3225] text-white' : 'bg-slate-900 text-amber-400'
                  }`}>
                    {m.sender === 'user' ? <User size={11} /> : <Bot size={11} />}
                  </div>

                  <div className={`p-3 rounded-2xl relative group ${
                    m.sender === 'user' ? 'bg-[#596E47] text-white rounded-tr-none shadow-xs' : 'bg-white text-slate-800 border border-slate-200 rounded-tl-none shadow-xs'
                  }`}>
                    <FormattedMessage content={m.text} />
                    {m.sender === 'ai' && (
                      <button type="button" onClick={() => handleCopy(m.text, idx)} className="absolute top-2 right-2 text-slate-400 hover:text-slate-700 opacity-0 group-hover:opacity-100 transition cursor-pointer p-0.5" title="Copy intelligence brief">
                        {copiedIndex === idx ? <Check size={11} className="text-emerald-600" /> : <Copy size={11} />}
                      </button>
                    )}
                  </div>
                </div>

                {m.metadata && (
                  <div className="flex flex-wrap items-center gap-1.5 mt-1 ml-7 text-[9px] text-slate-500 font-mono">
                    <span className="flex items-center gap-1 bg-slate-200/80 px-1.5 py-0.5 rounded border border-slate-300">
                      <Database size={9} className="text-sky-600" /> {m.metadata.database_query_status}
                    </span>
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="flex items-center space-x-2 text-slate-600 italic text-[11px] bg-slate-100/90 p-2.5 rounded-xl border border-slate-200 w-fit">
                <Loader2 size={13} className="animate-spin text-amber-600" />
                <span>Querying tier-restricted databases...</span>
              </div>
            )}
          </div>

          <form onSubmit={handleSendMessage} className="p-2.5 bg-white border-t border-slate-200 flex items-center space-x-2 shrink-0">
            <input 
              type="text" 
              value={inputPrompt} 
              onChange={(e) => setInputPrompt(e.target.value)} 
              placeholder="Ask for officer deployments or stats..." 
              className="flex-1 text-[11px] border border-slate-300 rounded-xl px-3 py-2 outline-none focus:border-[#596E47] bg-slate-50 focus:bg-white transition placeholder:text-slate-400"
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
        title="KMP Intelligence Assistant"
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