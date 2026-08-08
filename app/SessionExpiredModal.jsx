import React from 'react';
import { AlertTriangle } from 'lucide-react';

const SessionExpiredModal = ({ onAcknowledge }) => {
  
  const handleAcknowledge = () => {
    // 1. Wipe all secure storage to ensure a clean slate
    localStorage.removeItem('kmp_authToken');
    localStorage.removeItem('kmp_currentUser');
    localStorage.removeItem('kmp_loginTime');
    
    // 2. If a specific handler was passed from App.jsx, use it
    if (typeof onAcknowledge === 'function') {
      onAcknowledge();
    }
    
    // 3. Force a hard browser reload to dump all React state from memory
    // This guarantees the user is routed back to the strict Login gateway
    window.location.href = '/'; 
  };

  return (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[9999] flex items-center justify-center p-4 animate-in fade-in zoom-in-95 duration-300">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 sm:p-8 flex flex-col items-center text-center border border-slate-200">
        
        <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mb-6 shadow-inner border border-red-100">
          <AlertTriangle className="w-8 h-8 text-red-500" />
        </div>
        
        <h2 className="text-xl font-extrabold text-slate-900 mb-2">Session Expired Due to Inactivity</h2>
        <p className="text-sm text-slate-600 mb-8 font-medium leading-relaxed">
          Your security token has expired because the system was left unattended. You have been securely logged out.
        </p>
        
        <button
          onClick={handleAcknowledge}
          className="w-full bg-red-600 hover:bg-red-700 text-white font-extrabold py-3.5 px-6 rounded-xl transition-all shadow-md hover:shadow-lg active:scale-[0.98] uppercase tracking-wider text-sm flex items-center justify-center cursor-pointer"
        >
          Acknowledge & Return to Login
        </button>
        
      </div>
    </div>
  );
};

export default SessionExpiredModal;