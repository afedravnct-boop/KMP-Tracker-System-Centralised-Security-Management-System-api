import React, { useState } from 'react';
import { Sparkles, Send, X, Bot, User, Loader2, MessageSquare } from 'lucide-react';

const SystemAssistant = ({ currentUser, canViewGlobal }) => {
  const [isOpen, setIsOpen] = useState(false); // 🟢 Toggle state for opening/closing
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
      const token = localStorage.getItem('kmp_authToken');
      const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

      const res = await fetch(`${API_URL}/api/v1/ai/query`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
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

  // If closed, render a floating trigger button at the bottom-right corner
  if (!isOpen) {
    return (
      <button 
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-[99999] bg-slate-900 hover:bg-black text-amber-400 p-4 rounded-full shadow-2xl transition flex items-center space-x-2 cursor-pointer border border-slate-700"
        title="Open KMP Intelligence Assistant"
      >
        <Sparkles size={20} className="animate-pulse" />
        <span className="text-xs font-extrabold uppercase tracking-wider text-white">AI Assistant</span>
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-[99999] w-96 max-w-[90vw] bg-white rounded-2xl shadow-2xl border border-slate-300 overflow-hidden flex flex-col h-[500px] animate-in slide-in-from-bottom-5">
      {/* Header */}
      <div className="bg-slate-900 text-white px-4 py-3 flex justify-between items-center shrink-0">
        <div className="flex items-center space-x-2">
          <Sparkles className="w-4 h-4 text-amber-400" />
          <h3 className="font-extrabold text-xs uppercase tracking-wider">KMP Intelligence Assistant</h3>
        </div>
        <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-white p-1 rounded transition cursor-pointer">
          <X size={18} />
        </button>
      </div>

      {/* Message Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50 custom-scrollbar text-xs">
        {messages.map((m, idx) => (
          <div key={idx} className={`flex items-start space-x-2 ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
            {m.sender === 'ai' && (
              <div className="w-6 h-6 rounded-full bg-slate-800 text-amber-400 flex items-center justify-center shrink-0">
                <Bot size={14} />
              </div>
            )}
            <div className={`p-3 rounded-xl max-w-[80%] leading-relaxed ${m.sender === 'user' ? 'bg-blue-600 text-white rounded-br-none' : 'bg-white text-slate-800 border border-slate-200 rounded-bl-none shadow-xs'}`}>
              {m.text}
            </div>
            {m.sender === 'user' && (
              <div className="w-6 h-6 rounded-full bg-blue-700 text-white flex items-center justify-center shrink-0">
                <User size={14} />
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="flex items-center space-x-2 text-slate-400 italic">
            <Loader2 size={14} className="animate-spin text-amber-500" />
            <span>Analyzing system records...</span>
          </div>
        )}
      </div>

      {/* Input Form */}
      <form onSubmit={handleSendMessage} className="p-3 bg-white border-t border-slate-200 flex items-center space-x-2 shrink-0">
        <input 
          type="text" 
          value={inputPrompt} 
          onChange={(e) => setInputPrompt(e.target.value)}
          placeholder="Ask AI about crimes, personnel, or stats..." 
          className="flex-1 text-xs border border-slate-300 rounded-xl px-3 py-2.5 outline-none focus:border-blue-500"
        />
        <button type="submit" disabled={loading} className="bg-slate-900 hover:bg-black text-white p-2.5 rounded-xl transition cursor-pointer disabled:opacity-50">
          <Send size={14} />
        </button>
      </form>
    </div>
  );
};

export default SystemAssistant;