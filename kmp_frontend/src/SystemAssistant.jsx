import React, { useState } from 'react';
import { Sparkles, Send, Bot, User, Loader2, Minimize2, Maximize2, ChevronDown } from 'lucide-react';
import { authFetch } from './api';

const SystemAssistant = ({ currentUser, canViewGlobal }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [messages, setMessages] = useState([
    { sender: 'ai', text: `Hello ${currentUser?.rank || 'Officer'} ${currentUser?.name || ''}. I am your KMP CSDMS Intelligence Assistant. How can I assist with your operational analysis or data queries today?` }
  ]);
  const [inputPrompt, setInputPrompt] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputPrompt.trim() || loading) return;

    const userMsg = inputPrompt;
    setInputPrompt('');
    setMessages(prev => [...prev, { sender: 'user', text: userMsg }]);
    setLoading(true);

    try {
      const res = await authFetch('/api/v1/ai/query', {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: userMsg })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "AI service unreachable.");

      setMessages(prev => [...prev, { sender: 'ai', text: data.response || "Query processed successfully." }]);
    } catch (err) {
      setMessages(prev => [...prev, { sender: 'ai', text: `⚠️ Error: ${err.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed bottom-3 left-16 z-[99990] flex flex-col items-start font-sans select-none">
      {/* Expanded AI Chat Box */}
      {isOpen && (
        <div 
          className={`mb-2 bg-white rounded-2xl shadow-2xl border border-slate-300 overflow-hidden flex flex-col transition-all duration-300 ease-in-out animate-in slide-in-from-bottom-3 ${
            isExpanded ? 'w-[520px] h-[600px] max-w-[95vw]' : 'w-88 h-[440px] max-w-[90vw]'
          }`}
        >
          {/* Header */}
          <div className="bg-slate-900 text-white px-3.5 py-2.5 flex justify-between items-center shrink-0">
            <div className="flex items-center space-x-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
              </span>
              <h3 className="font-extrabold text-[11px] uppercase tracking-wider text-amber-400">
                KMP Intelligence Assistant
              </h3>
            </div>
            
            <div className="flex items-center space-x-1">
              <button 
                onClick={() => setIsExpanded(!isExpanded)} 
                className="text-slate-400 hover:text-white p-1 rounded transition cursor-pointer"
                title={isExpanded ? "Collapse view" : "Expand view"}
              >
                {isExpanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
              </button>
              <button 
                onClick={() => setIsOpen(false)} 
                className="text-slate-400 hover:text-white p-1 rounded transition cursor-pointer"
                title="Minimize AI Assistant"
              >
                <ChevronDown size={15} />
              </button>
            </div>
          </div>

          {/* Message History */}
          <div className="flex-1 overflow-y-auto p-3.5 space-y-2.5 bg-slate-50 custom-scrollbar text-[11px]">
            {messages.map((m, idx) => (
              <div key={idx} className={`flex items-start space-x-2 ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                {m.sender === 'ai' && (
                  <div className="w-5 h-5 rounded-full bg-slate-800 text-amber-400 flex items-center justify-center shrink-0 shadow-xs">
                    <Bot size={11} />
                  </div>
                )}
                <div className={`p-2.5 rounded-xl max-w-[82%] leading-relaxed ${
                  m.sender === 'user' 
                    ? 'bg-[#596E47] text-white rounded-br-none shadow-xs' 
                    : 'bg-white text-slate-800 border border-slate-200 rounded-bl-none shadow-xs'
                }`}>
                  {m.text}
                </div>
                {m.sender === 'user' && (
                  <div className="w-5 h-5 rounded-full bg-[#3a3225] text-white flex items-center justify-center shrink-0 shadow-xs">
                    <User size={11} />
                  </div>
                )}
              </div>
            ))}
            {loading && (
              <div className="flex items-center space-x-2 text-slate-500 italic text-[11px] bg-slate-100 p-2 rounded-lg border border-slate-200 w-fit">
                <Loader2 size={12} className="animate-spin text-amber-600" />
                <span>Processing intelligence matrix query...</span>
              </div>
            )}
          </div>

          {/* Prompt Input Form */}
          <form onSubmit={handleSendMessage} className="p-2.5 bg-white border-t border-slate-200 flex items-center space-x-2 shrink-0">
            <input 
              type="text" 
              value={inputPrompt} 
              onChange={(e) => setInputPrompt(e.target.value)} 
              placeholder="Query matrix, nominal roll, or stats..." 
              className="flex-1 text-[11px] border border-slate-300 rounded-lg px-2.5 py-1.5 outline-none focus:border-[#596E47] bg-slate-50 focus:bg-white transition"
            />
            <button 
              type="submit" 
              disabled={loading || !inputPrompt.trim()} 
              className="bg-[#3a3225] hover:bg-black text-white p-2 rounded-lg transition cursor-pointer disabled:opacity-40"
            >
              <Send size={11} />
            </button>
          </form>
        </div>
      )}

      {/* Compact Micro Floating Trigger Pill */}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={`flex items-center justify-center transition-all duration-300 ease-in-out cursor-pointer shadow-xl rounded-full border ${
          isOpen
            ? 'h-8 px-2.5 bg-amber-500 text-slate-950 border-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.5)]'
            : isHovered
            ? 'h-8 px-2.5 bg-slate-900 text-white border-slate-700'
            : 'w-8 h-8 p-0 bg-slate-900/90 text-amber-400 border-slate-700 hover:bg-slate-800'
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