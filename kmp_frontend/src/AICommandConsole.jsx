import React, { useState, useRef, useEffect } from 'react';
import {  
  Send,  
  Bot,  
  User,  
  Database,  
  FileText,  
  Terminal,  
  ShieldAlert,  
  Sparkles,  
  Loader2,  
  RefreshCw,
  Maximize2,
  Minimize2,
  X,
  Power
} from 'lucide-react';
import { authFetch } from './api';

const AICommandConsole = ({ currentUser, onBack }) => {
  const officerFnum = currentUser?.fnum || 'N/A';
  const officerRank = currentUser?.rank || 'OFFICER';
  const officerName = currentUser?.name || 'OPERATIVE';
  const isSuperAdmin = ['SUPER_ADMIN', 'ADMIN'].includes(currentUser?.role);

  const [messages, setMessages] = useState([
    {
      id: 'init-1',
      sender: 'ai',
      text: `**KMP Centralised Security Intelligence Assistant Active.**\n\nStanding by for commander queries across the **Nominal Roll**, **Live Crime Registry**, **Disruptive Ops Statistics**, **Agricultural Crime Summaries**, as well as system guidelines, policies, user manuals, and technical troubleshooting protocols.\n\n*Clearance Scope:* \`${officerFnum}\` | \`${officerRank}\` | \`${officerName}\`\nRegion: \`${currentUser?.region || 'ALL'}\` | Station: \`${currentUser?.station || 'ALL'}\``,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      metadata: null
    }
  ]);
  const [inputQuery, setInputQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [isDbKillActive, setIsDbKillActive] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

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

  const handleSendQuery = async (e) => {
    e?.preventDefault();
    const cleanPrompt = inputQuery.trim();
    if (!cleanPrompt || isLoading) return;

    const userMessage = {
      id: `usr-${Date.now()}`,
      sender: 'user',
      text: cleanPrompt,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      metadata: null
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputQuery('');
    setIsLoading(true);

    try {
      const response = await authFetch('/api/v1/ai/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: cleanPrompt,
          target_region: currentUser?.region || 'ALL REGIONS',
          target_station: currentUser?.station || 'ALL STATIONS'
        })
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
    "Summarize agricultural thefts and recoveries",
    "What are the rules for data classification and AES-256 exports?",
    "How do I resolve login lockouts or reset my security key?",
    "Where is officer IPPS or Force Number stationed?"
  ];

  return (
    <div className={`flex flex-col bg-[#020617] text-slate-100 rounded-2xl border-2 border-slate-700 shadow-2xl overflow-hidden transition-all duration-300 ${
      isFullScreen ? 'fixed inset-4 z-[9999] h-[calc(100vh-2rem)] max-w-none m-0' : 'h-[calc(100vh-6rem)] max-w-7xl mx-auto my-0 px-2 sm:px-6'
    }`}>
      
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
                Tier-Restricted RAG / SQL
              </span>
            </h3>
            <p className="text-xs text-slate-300">
              Clearance: <span className="text-amber-300 font-bold">{officerFnum} | {officerRank} | {officerName}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
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
              {msg.sender === 'user' ? <User className="w-4 h-4" /> : msg.isError ? <ShieldAlert className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
            </div>

            <div className={`flex flex-col max-w-4xl ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}>
              <div className={`p-4 sm:p-5 rounded-2xl text-xs sm:text-sm leading-relaxed border-2 whitespace-pre-wrap font-medium ${
                msg.sender === 'user' ? 'bg-amber-700 text-white border-amber-500 rounded-tr-none shadow-md' : msg.isError ? 'bg-red-950 text-red-100 border-red-700 rounded-tl-none shadow-md' : 'bg-[#0f172a] text-slate-100 border-slate-700 rounded-tl-none shadow-lg'
              }`}>
                {msg.text}
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
              Processing tier-restricted intelligence metrics...
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

      {/* Input Bar */}
      <form onSubmit={handleSendQuery} className="p-4 sm:px-12 bg-[#0f172a] border-t-2 border-slate-700 flex items-center gap-3 shrink-0">
        <input
          type="text"
          value={inputQuery}
          onChange={(e) => setInputQuery(e.target.value)}
          placeholder="Issue operational query (e.g. 'Summarize livestock thefts in Kawempe')..."
          className="flex-1 bg-[#020617] border-2 border-slate-700 rounded-xl px-4 py-3 text-xs sm:text-sm text-white placeholder-slate-400 font-medium focus:outline-none focus:border-sky-500 transition-colors shadow-inner"
        />
        <button type="submit" disabled={isLoading || !inputQuery.trim()} className="px-6 py-3 bg-sky-600 hover:bg-sky-500 active:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-extrabold text-xs uppercase tracking-wider rounded-xl transition-colors flex items-center gap-2 shrink-0 shadow-lg cursor-pointer border border-sky-400">
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          Execute
        </button>
      </form>
    </div>
  );
};

export default AICommandConsole;