import React from 'react';
import { AlertTriangle } from 'lucide-react';

const SessionExpiredModal = () => {
  
  const handleForceLogout = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    // 1. Clear session storage completely
    localStorage.clear();
    
    // 2. Force hard reload to root login page
    window.location.href = '/';
  };

  return (
    <div className="fixed inset-0 z-[999999] flex items-center justify-center bg-slate-950/90 backdrop-blur-md">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 flex flex-col items-center text-center border border-slate-200 relative z-[1000000]">
        
        <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mb-6 shadow-inner border border-red-100">
          <AlertTriangle className="w-8 h-8 text-red-500" />
        </div>
        
        <h2 className="text-xl font-extrabold text-slate-900 mb-2">Session Expired Due to Inactivity</h2>
        <p className="text-sm text-slate-600 mb-8 font-medium leading-relaxed">
          Your security token has expired because the system was left unattended. You have been securely logged out.
        </p>
        
        <button
          type="button"
          onPointerDown={(e) => {
            // 1. Immediately stop all CSS/React event bubbling
            e.preventDefault();
            e.stopPropagation();
            
            // 2. Obliterate the session
            localStorage.removeItem('kmp_authToken');
            sessionStorage.clear();
            
            // 3. Force instant redirect (bypassing React entirely)
            window.location.replace('/'); 
          }}
          className="w-full bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-extrabold py-4 px-6 rounded-xl transition-none shadow-lg uppercase tracking-wider text-sm cursor-pointer"
          style={{ 
            position: 'relative', 
            zIndex: 2147483647, /* Maximum possible z-index in browsers */
            pointerEvents: 'auto' 
          }}
        >
          Acknowledge & Return to Login
        </button>
        
      </div>
    </div>
  );
};

export default SessionExpiredModal;