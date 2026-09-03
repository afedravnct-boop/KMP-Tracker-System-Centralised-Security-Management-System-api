// TechnicalTroubleshootingModal.jsx
import React from 'react';
import { X, Wrench } from 'lucide-react';

export default function TechnicalTroubleshootingModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[300] flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full overflow-hidden border border-slate-300 flex flex-col max-h-[85vh]">
        <div className="bg-slate-900 text-white px-6 py-4 flex justify-between items-center shrink-0">
          <div className="flex items-center space-x-2">
            <Wrench className="w-5 h-5 text-amber-400" />
            <h3 className="font-extrabold uppercase text-xs tracking-wider">
              TECHNICAL TROUBLESHOOTING & ADMIN GUIDE
            </h3>
          </div>
          <button onClick={onClose} className="hover:bg-slate-800 p-1.5 rounded transition cursor-pointer text-slate-300 hover:text-white">
            <X size={18} />
          </button>
        </div>
        
        <div className="p-6 overflow-y-auto space-y-4 text-xs text-slate-700 leading-relaxed custom-scrollbar bg-slate-50 flex-1">
          <h4 className="font-black text-sm text-slate-900 uppercase border-b pb-2">Step-by-Step Diagnostic & Resolution Protocols</h4>
          
          <div className="space-y-3">
            <p><strong>1. Authentication & Access Issues:</strong> Ensure Force Numbers follow uppercase formatting (e.g., $\text{A/2408}$ or $63034$). Accounts trigger a mandatory 30-second lockout after 3 consecutive failed attempts. Pending accounts require manual command clearance verification against the HR Nominal Roll.</p>
            <p><strong>2. Network & Offline Synchronization:</strong> When operating in offline mode, local memory safely queues updates until connection to Render/NeonDB servers is restored. Re-authenticate via the login portal if bearer tokens expire upon reconnection.</p>
            <p><strong>3. Data Entry & Duplicate Errors:</strong> Duplicate checks prevent identical reference numbers (SD Ref, CRB) or exact narrative strings. Switch the file control toggle to "Update Existing" if modifying active cases. Ensure image/mugshot files are standard web formats under 5MB.</p>
            <p><strong>4. Master Export & Decryption:</strong> Ensure browser allows downloads from the domain. When extracting downloaded `.zip` master database exports secured via AES-256 encryption, enter your exact official Force Number as the extraction password.</p>
            <p><strong>5. Session Management & Security Curtains:</strong> Inactivity timeouts enforce a secure logout after 30 minutes of no user interaction, displaying a 60-second warning modal prior to clearing session state.</p>
          </div>
        </div>

        <div className="bg-white p-4 border-t border-slate-200 flex justify-end shrink-0">
          <button 
            type="button"
            onClick={onClose} 
            className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-black text-xs uppercase tracking-wider shadow cursor-pointer transition"
          >
            Close Troubleshooting Guide
          </button>
        </div>
      </div>
    </div>
  );
}