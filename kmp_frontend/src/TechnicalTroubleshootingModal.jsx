// src/components/TechnicalTroubleshootingModal.jsx
import React, { useState } from 'react';
import { X, HelpCircle, Wrench, Send } from 'lucide-react';
import SystemAssistant from './SystemAssistant';
import { authFetch, API_BASE_URL } from '../api';

export default function TechnicalTroubleshootingModal({ isOpen, onClose, fileOrForceNumber }) {
  if (!isOpen) return null;

  // Manual Help & Glitch Report States
  const [helpCategory, setHelpCategory] = useState('LOGIN_AUTH_FAILURE');
  const [helpDescription, setHelpDescription] = useState('');
  const [isSubmittingHelp, setIsSubmittingHelp] = useState(false);
  const [helpSuccess, setHelpSuccess] = useState('');

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
        network_errors: ['Authentication Blocked']
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
          onClose();
          setHelpSuccess('');
        }, 3000);
      } else {
        throw new Error("Failed to dispatch ticket to server.");
      }
    } catch (err) {
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
        setTimeout(() => onClose(), 2500);
      } catch (fallbackErr) {
        alert("Failed to transmit support ticket. Check your network connection.");
      }
    } finally {
      setIsSubmittingHelp(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[300] flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-300 flex flex-col max-h-[85vh]">
        
        {/* Header named "help" */}
        <div className="bg-slate-900 text-white px-4 py-3 flex justify-between items-center shrink-0">
          <div className="flex items-center space-x-2">
            <HelpCircle className="w-4 h-4 text-blue-400" />
            <h3 className="font-extrabold uppercase text-xs tracking-wider">
              help
            </h3>
          </div>
          <button onClick={onClose} className="hover:bg-slate-800 p-1 rounded transition cursor-pointer text-slate-300 hover:text-white">
            <X size={16} />
          </button>
        </div>
        
        {/* Content Body */}
        <div className="p-4 overflow-y-auto space-y-3 text-xs text-slate-700 leading-relaxed custom-scrollbar bg-slate-50 flex-1">
          <p className="font-medium text-[11px] text-slate-600">
            Need guidance or troubleshooting support? Consult the interactive assistant below or submit a manual ticket.
          </p>

          {/* Interactive Assistant integrated in limited mode */}
          <div className="border border-slate-200 rounded-lg overflow-hidden bg-white p-1.5 mt-1 shadow-inner">
            <div className="text-[9px] font-extrabold text-slate-400 uppercase px-1.5 py-0.5">Interactive Help Assistant</div>
            <div className="relative h-44 w-full">
              <SystemAssistant limitedMode={true} />
            </div>
          </div>

          <hr className="border-slate-200 my-1" />

          {/* Manual Fault / Help Ticket Form */}
          <form onSubmit={handleSendHelpTicket} className="space-y-2">
            <h4 className="font-extrabold text-slate-800 uppercase tracking-tight text-[10px] flex items-center gap-1">
              <Wrench size={12} className="text-amber-500" /> Manual Fault Ticket
            </h4>

            {helpSuccess && (
              <div className="p-2 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg font-bold text-[10px]">
                {helpSuccess}
              </div>
            )}

            <div>
              <label className="block font-bold text-slate-700 uppercase mb-0.5 text-[10px]">Category</label>
              <select 
                value={helpCategory} 
                onChange={(e) => setHelpCategory(e.target.value)}
                className="w-full p-1.5 bg-slate-50 border border-slate-300 rounded-md font-bold text-slate-900 text-[11px] outline-none focus:border-blue-600"
              >
                <option value="LOGIN_AUTH_FAILURE">Login / Authentication Failure</option>
                <option value="RENDER_SERVER_SLEEP">Server Unresponsive / Cold Start Timeout</option>
                <option value="WHITE_SCREEN_ERROR">White Screen / Frontend Crash (WSOD)</option>
                <option value="ACCOUNT_UNAPPROVED">Account Pending Approval / Unrecognized</option>
              </select>
            </div>

            <div>
              <label className="block font-bold text-slate-700 uppercase mb-0.5 text-[10px]">Description *</label>
              <textarea 
                rows={2}
                required
                value={helpDescription}
                onChange={(e) => setHelpDescription(e.target.value)}
                placeholder="Describe issue..."
                className="w-full p-1.5 bg-slate-50 border border-slate-300 rounded-md text-[11px] text-slate-900 outline-none focus:border-blue-600"
              />
            </div>

            <div className="flex justify-end gap-1.5 pt-1">
              <button 
                type="button" 
                onClick={onClose}
                className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg font-bold text-[11px] transition cursor-pointer"
              >
                Close
              </button>
              <button 
                type="submit" 
                disabled={isSubmittingHelp}
                className="px-3.5 py-1.5 bg-blue-700 hover:bg-blue-800 text-white rounded-lg font-extrabold text-[11px] flex items-center gap-1 transition cursor-pointer shadow disabled:opacity-50"
              >
                {isSubmittingHelp ? 'Sending...' : <><Send size={11} /> Send</>}
              </button>
            </div>
          </form>
        </div>

      </div>
    </div>
  );
}