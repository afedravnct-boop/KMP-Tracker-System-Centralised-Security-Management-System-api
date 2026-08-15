import React, { useState, useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';

const SessionExpiredModal = ({ onContinue }) => {
  const [timeLeft, setTimeLeft] = useState(60);
  // States: 'WARNING' -> 'EXPIRED_IDLE' -> 'RETURNING' -> 'FINAL_LOGOUT'
  const [phase, setPhase] = useState('WARNING'); 

  // 1. Countdown from 60 to 0
  useEffect(() => {
    if (phase === 'WARNING') {
      const timer = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            setPhase('EXPIRED_IDLE');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [phase]);

  // 2. Detect when the user returns (mouse movement, keystroke) AFTER expiration
  useEffect(() => {
    if (phase === 'EXPIRED_IDLE') {
      const handleActivity = () => {
        setPhase('RETURNING');
      };
      
      const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
      events.forEach(e => window.addEventListener(e, handleActivity, { once: true }));
      
      return () => {
        events.forEach(e => window.removeEventListener(e, handleActivity));
      };
    }
  }, [phase]);

  // 3. Give it exactly 5 seconds after detecting activity before showing the final dialogue box
  useEffect(() => {
    if (phase === 'RETURNING') {
      const delayTimer = setTimeout(() => {
        setPhase('FINAL_LOGOUT');
      }, 5000);
      return () => clearTimeout(delayTimer);
    }
  }, [phase]);

  const handleForceLogout = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    // 1. NUCLEAR LOGOUT: Obliterate all system cache so React cannot reconstruct the Dashboard
    localStorage.removeItem('kmp_authToken');
    localStorage.removeItem('kmp_currentUser');
    localStorage.removeItem('kmp_currentPage');
    localStorage.clear();
    sessionStorage.clear();
    
    // 2. Force hard reload to root login page
    window.location.replace('/');
  };

  return (
    <div className="fixed inset-0 z-[999999] flex items-center justify-center bg-slate-950/90 backdrop-blur-md">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 flex flex-col items-center text-center border border-slate-200 relative z-[1000000] animate-in zoom-in-95 duration-300">
        
        {/* Dynamic Icon Colors */}
        <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-6 shadow-inner border ${phase === 'WARNING' ? 'bg-amber-50 border-amber-100' : 'bg-red-50 border-red-100'}`}>
          <AlertTriangle className={`w-8 h-8 ${phase === 'WARNING' ? 'text-amber-500' : 'text-red-500'}`} />
        </div>
        
        {/* PHASE 1: WARNING */}
        {phase === 'WARNING' && (
          <>
            <h2 className="text-xl font-extrabold text-slate-900 mb-2">Session Timeout Warning</h2>
            <p className="text-sm text-slate-600 mb-8 font-medium leading-relaxed">
              Your session will expire in <span className="font-bold text-red-600">{timeLeft}s</span> due to inactivity. Click below to continue working.
            </p>
            <button
              type="button"
              onClick={onContinue}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white font-extrabold py-4 px-6 rounded-xl shadow-lg uppercase tracking-wider text-sm cursor-pointer transition-colors"
            >
              Continue Session
            </button>
          </>
        )}

        {/* PHASE 2 & 3: EXPIRED (AWAITING ACTIVITY & 5-SECOND DELAY) */}
        {(phase === 'EXPIRED_IDLE' || phase === 'RETURNING') && (
          <>
            <h2 className="text-xl font-extrabold text-slate-900 mb-2">Session Expired</h2>
            <p className="text-sm text-slate-600 mb-8 font-medium leading-relaxed">
              Your 60 seconds within which to extend the session equally expired without activity, session has expired.
            </p>
            {/* Subtle visual cue during the 5-second waiting period */}
            {phase === 'RETURNING' && (
              <div className="flex justify-center space-x-2 mt-2">
                <div className="w-2 h-2 bg-red-500 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-red-500 rounded-full animate-bounce delay-75"></div>
                <div className="w-2 h-2 bg-red-500 rounded-full animate-bounce delay-150"></div>
              </div>
            )}
          </>
        )}

        {/* PHASE 4: FINAL LOGOUT PROMPT */}
        {phase === 'FINAL_LOGOUT' && (
          <>
            <h2 className="text-xl font-extrabold text-slate-900 mb-2">Session Expired Due to Inactivity</h2>
            <p className="text-sm text-slate-600 mb-8 font-medium leading-relaxed">
              Your security token has expired because the system was left unattended. You have been securely logged out.
            </p>
            <button
              type="button"
              onPointerDown={handleForceLogout}
              className="w-full bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-extrabold py-4 px-6 rounded-xl transition-none shadow-lg uppercase tracking-wider text-sm cursor-pointer"
              style={{ 
                position: 'relative', 
                zIndex: 2147483647, 
                pointerEvents: 'auto' 
              }}
            >
              Acknowledge & Return to Login
            </button>
          </>
        )}
        
      </div>
    </div>
  );
};

export default SessionExpiredModal;