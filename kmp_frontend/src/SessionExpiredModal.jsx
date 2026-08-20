import React, { useState, useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';

const SessionExpiredModal = ({ onContinue, onLogout }) => {
  const [timeLeft, setTimeLeft] = useState(60);
  const [phase, setPhase] = useState('WARNING'); 

  useEffect(() => {
    if (phase !== 'WARNING') return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleAutomaticExpiration();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [phase]);

  const handleAutomaticExpiration = () => {
    if (typeof onLogout === 'function') {
      onLogout();
    }
    setPhase('FINAL_LOGOUT');
  };

  const handleForceLogout = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (typeof onLogout === 'function') {
      onLogout();
    } else {
      window.location.replace('/');
    }
  };

  return (
    <div className="fixed inset-0 z-[999999] flex items-center justify-center bg-slate-950/90 backdrop-blur-sm isolate">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 flex flex-col items-center text-center border border-slate-200 relative z-[1000000] transform-gpu">
        
        <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-6 shadow-inner border ${phase === 'WARNING' ? 'bg-amber-50 border-amber-100' : 'bg-red-50 border-red-100'}`}>
          <AlertTriangle className={`w-8 h-8 ${phase === 'WARNING' ? 'text-amber-500' : 'text-red-500'}`} />
        </div>
        
        {phase === 'WARNING' && (
          <div className="w-full">
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
          </div>
        )}

        {phase === 'FINAL_LOGOUT' && (
          <div className="w-full">
            <h2 className="text-xl font-extrabold text-slate-900 mb-2">Session Expired Due to Inactivity</h2>
            <p className="text-sm text-slate-600 mb-8 font-medium leading-relaxed">
              Your secure session has expired because the system was left unattended. You have been securely logged out.
            </p>
            <button
              type="button"
              onClick={handleForceLogout}
              className="w-full bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-extrabold py-4 px-6 rounded-xl shadow-lg uppercase tracking-wider text-sm cursor-pointer"
            >
              Acknowledge & Return to Login
            </button>
          </div>
        )}
        
      </div>
    </div>
  );
};

export default SessionExpiredModal;