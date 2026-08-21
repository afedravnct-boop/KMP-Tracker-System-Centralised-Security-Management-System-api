import { authFetch } from './api';
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
  CornerDownLeft 
} from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

const AICommandConsole = ({ currentUser }) => {
  const [messages, setMessages] = useState([
    {
      id: 'init-1',
      sender: 'ai',
      text: `**KMP Centralised Security Intelligence Assistant Active.**\n\nStanding by for commander queries across the **Nominal Roll**, **Live Crime Registry**, **Disruptive Ops Statistics**, and **Archived SITREPs**.\n\n*Clearance Scope:* \`${currentUser?.role || 'OFFICER'}\` | Region: \`${currentUser?.region || 'ALL'}\` | Station: \`${currentUser?.station || 'ALL'}\``,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      metadata: null
    }
  ]);
  const [inputQuery, setInputQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const chatEndRef = useRef(null);

  // Auto-scroll to bottom of conversation
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

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
// 🟢 CORRECTED: Using centralized authFetch to guarantee token delivery
      const response = await authFetch('/api/v1/ai/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
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
        text: `⚠️ **Tactical Processing Error**: ${err.message}\n\nPlease ensure your backend service and OpenAI/pgvector dependencies are online.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        metadata: null
      };
      setMessages((prev) => [...prev, errorReply]);
    } finally {
      setIsLoading(false);
    }
  };

  const quickPrompts = [
    "Show manpower distribution across KMP regions",
    "Where is officer IPPS or Force Number stationed?",
    "Summarize recent aggravated robbery trends this month",
    "How many active female NCOs are on the nominal roll?"
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)] max-w-6xl mx-auto bg-slate-950 text-slate-100 rounded-2xl border border-slate-800 shadow-2xl overflow-hidden">
      
      {/* Header Bar */}
      <div className="bg-slate-900/90 backdrop-blur border-b border-slate-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-sky-500/10 border border-sky-500/30 rounded-xl text-sky-400">
            <Sparkles className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h3 className="font-extrabold text-sm uppercase tracking-wider text-slate-100 flex items-center gap-2">
              KMP Tactical AI Command Console
              <span className="bg-sky-500/20 text-sky-400 text-[10px] px-2 py-0.5 rounded-full border border-sky-500/30">
                Dual-Path RAG / SQL
              </span>
            </h3>
            <p className="text-xs text-slate-400">
              Clearance: <span className="text-amber-400 font-semibold">{currentUser?.rank || 'OFFICER'} {currentUser?.name || ''}</span> ({currentUser?.fnum || 'N/A'})
            </p>
          </div>
        </div>

        <button
          onClick={() => setMessages([messages[0]])}
          className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-200 transition-colors"
          title="Reset Console Stream"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Message Stream */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex items-start gap-3.5 ${msg.sender === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
          >
            {/* Avatar */}
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${
                msg.sender === 'user'
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                  : msg.isError
                  ? 'bg-red-500/10 border-red-500/30 text-red-400'
                  : 'bg-sky-500/10 border-sky-500/30 text-sky-400'
              }`}
            >
              {msg.sender === 'user' ? <User className="w-4 h-4" /> : msg.isError ? <ShieldAlert className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
            </div>

            {/* Bubble */}
            <div className={`flex flex-col max-w-3xl ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}>
              <div
                className={`p-4 rounded-2xl text-xs sm:text-sm leading-relaxed border whitespace-pre-wrap ${
                  msg.sender === 'user'
                    ? 'bg-amber-600 text-white border-amber-500 rounded-tr-none'
                    : msg.isError
                    ? 'bg-red-950/40 text-red-200 border-red-800/60 rounded-tl-none'
                    : 'bg-slate-900/90 text-slate-200 border-slate-800 rounded-tl-none shadow-md'
                }`}
              >
                {msg.text}
              </div>

              {/* Execution Badges / Metadata */}
              {msg.metadata && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {msg.metadata.sql_executed && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-mono bg-slate-800/80 text-sky-300 border border-slate-700 px-2 py-0.5 rounded-md">
                      <Terminal className="w-3 h-3 text-sky-400" /> SQL: {msg.metadata.sql_executed.slice(0, 45)}...
                    </span>
                  )}
                  {msg.metadata.structured_records_count > 0 && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-mono bg-slate-800/80 text-emerald-300 border border-slate-700 px-2 py-0.5 rounded-md">
                      <Database className="w-3 h-3 text-emerald-400" /> {msg.metadata.structured_records_count} DB Rows
                    </span>
                  )}
                  {msg.metadata.semantic_chunks_retrieved > 0 && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-mono bg-slate-800/80 text-purple-300 border border-slate-700 px-2 py-0.5 rounded-md">
                      <FileText className="w-3 h-3 text-purple-400" /> {msg.metadata.semantic_chunks_retrieved} SITREP Chunks
                    </span>
                  )}
                </div>
              )}

              <span className="text-[10px] text-slate-500 mt-1 px-1">{msg.timestamp}</span>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex items-start gap-3.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-sky-500/10 border border-sky-500/30 text-sky-400">
              <Loader2 className="w-4 h-4 animate-spin" />
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl rounded-tl-none p-4 text-xs text-slate-400 flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-sky-400 animate-ping" />
              Synthesizing structured database metrics and semantic records...
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Suggested Quick Prompt Chips */}
      <div className="px-6 py-2 bg-slate-900/40 border-t border-slate-800/60 flex items-center gap-2 overflow-x-auto no-scrollbar">
        <span className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider shrink-0">Suggestions:</span>
        {quickPrompts.map((prompt, i) => (
          <button
            key={i}
            onClick={() => setInputQuery(prompt)}
            className="text-xs bg-slate-800/80 hover:bg-slate-800 border border-slate-700 hover:border-slate-600 text-slate-300 px-3 py-1 rounded-full whitespace-nowrap transition-colors cursor-pointer"
          >
            {prompt}
          </button>
        ))}
      </div>

      {/* Command Input Bar */}
      <form onSubmit={handleSendQuery} className="p-4 bg-slate-900 border-t border-slate-800 flex items-center gap-3">
        <input
          type="text"
          value={inputQuery}
          onChange={(e) => setInputQuery(e.target.value)}
          placeholder="Issue operational query (e.g. 'Where is officer PC Okello deployed?' or 'Summarize Bwaise robbery statistics')..."
          className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-500 transition-colors"
        />

        <button
          type="submit"
          disabled={isLoading || !inputQuery.trim()}
          className="px-5 py-3 bg-sky-600 hover:bg-sky-500 active:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-colors flex items-center gap-2 shrink-0 shadow-lg shadow-sky-950 cursor-pointer"
        >
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          Execute
        </button>
      </form>
    </div>
  );
};

export default AICommandConsole;