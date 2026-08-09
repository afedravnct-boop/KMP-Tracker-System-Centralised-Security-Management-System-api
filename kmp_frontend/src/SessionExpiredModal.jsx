import React from 'react';
import { AlertTriangle } from 'lucide-react';

const SessionExpiredModal = ({ onAcknowledge }) => {
  
  const handleAcknowledge = (e) => {
    // 🟢 1. Stop event bubbling/propagation to backdrop overlays on PC
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    // 🟢 2. Wipe all secure storage
    localStorage.removeItem('kmp_authToken');
    localStorage.removeItem('kmp_currentUser');
    localStorage.removeItem('kmp_currentUser_fnum');
    localStorage.removeItem('kmp_loginTime');
    
    // 🟢 3. Trigger React state update if passed
    if (typeof onAcknowledge === 'function') {
      onAcknowledge();
    }
    
    // 🟢 4. Replace location instead of href to prevent history stack loops
    // Use a 50ms timeout so React state updates flush without canceling navigation
    setTimeout(() => {
      window.location.replace('/');
    }, 50);
  };

  return (
    <div 
      className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[9999] flex items-center justify-center p-4 animate-in fade-in zoom-in-95 duration-300 pointer-events-auto"
      onClick={(e) => e.stopPropagation()} // Prevent clicking backdrop from canceling button focus
    >
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 sm:p-8 flex flex-col items-center text-center border border-slate-200 relative z-[10000]">
        
        <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mb-6 shadow-inner border border-red-100">
          <AlertTriangle className="w-8 h-8 text-red-500" />
        </div>
        
        <h2 className="text-xl font-extrabold text-slate-900 mb-2">Session Expired Due to Inactivity</h2>
        <p className="text-sm text-slate-600 mb-8 font-medium leading-relaxed">
          Your security token has expired because the system was left unattended. You have been securely logged out.
        </p>
        
        <button
          type="button" // 🟢 Explicitly set button type so PC browsers don't attempt form submission
          onClick={handleAcknowledge}
          className="w-full bg-red-600 hover:bg-red-700 text-white font-extrabold py-3.5 px-6 rounded-xl transition-all shadow-md hover:shadow-lg active:scale-[0.98] uppercase tracking-wider text-sm flex items-center justify-center cursor-pointer pointer-events-auto relative z-[10001]"
        >
          Acknowledge & Return to Login
        </button>
        
      </div>
    </div>
  );
};

export default SessionExpiredModal;