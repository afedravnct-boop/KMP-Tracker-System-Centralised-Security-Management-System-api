// src/components/ErrorBoundary.jsx
import React from 'react';
import { authFetch } from './api';
import { AlertTriangle, Home, RefreshCw, Compass } from 'lucide-react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorDetails: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, errorDetails: error.toString() };
  }

  componentDidCatch(error, errorInfo) {
    const diagnosticPayload = {
      glitch_category: "FRONTEND_UNHANDLED_CRASH_WSOD",
      page_name: window.location.pathname,
      element_point: errorInfo.componentStack ? errorInfo.componentStack.slice(0, 300) : "Unknown Component Tree",
      description: `Automated Error Boundary caught runtime fault: ${error.toString()}`,
      console_logs: [error.toString(), errorInfo.componentStack || ""],
      network_errors: []
    };

    authFetch('/api/v1/ai/report-crash', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(diagnosticPayload)
    }).catch(err => console.error("Crash telemetry transmission failed:", err));
  }

  // 🟢 FORCE RESET: Clears corrupted states and forces navigation away from the fault
  handleForceNavigation = (targetModule = 'home') => {
    try {
      // Purge cached active module / tab states causing the crash loop
      localStorage.removeItem('active_module');
      localStorage.removeItem('active_tab');
      localStorage.setItem('kmp_preferred_module', targetModule);
    } catch (e) {}

    // Reset local error boundary state first
    this.setState({ hasError: false, errorDetails: null }, () => {
      if (typeof this.props.onReset === 'function') {
        this.props.onReset();
      } else {
        // Force hard browser relocation to clear component stack memory
        window.location.replace(window.location.origin + window.location.pathname);
      }
    });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 z-[999999] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="p-6 md:p-10 max-w-xl w-full bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border-2 border-red-500/50 text-center space-y-5">
            <div className="w-16 h-16 bg-red-100 dark:bg-red-950 text-red-600 rounded-full flex items-center justify-center mx-auto border border-red-200 dark:border-red-900 shadow-inner">
              <AlertTriangle size={32} />
            </div>
            
            <div>
              <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white uppercase tracking-wider mb-1">
                Technical Glitch Registered on This Module
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed font-medium">
                This operational module encountered a runtime disturbance and has been isolated. High Command telemetry has been automatically dispatched.
              </p>
            </div>

            <div className="bg-amber-50 dark:bg-slate-800 p-3 rounded-xl border border-amber-200 dark:border-slate-700 text-left">
              <p className="text-[11px] font-bold text-amber-800 dark:text-amber-300 uppercase mb-1 flex items-center">
                <Compass size={13} className="mr-1.5" /> Emergency Navigation Recovery:
              </p>
              <p className="text-[11px] text-slate-600 dark:text-slate-400">
                Clicking the button below will forcefully reset your workspace session and redirect you to a stable dashboard view.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row justify-center gap-2.5 pt-2">
              <button 
                onClick={() => this.handleForceNavigation('home')}
                className="px-4 py-2.5 bg-slate-900 hover:bg-black dark:bg-slate-800 dark:hover:bg-slate-700 text-white rounded-xl font-bold text-xs uppercase tracking-wider shadow cursor-pointer transition flex items-center justify-center gap-2"
              >
                <Home size={14} /> Force Return to Dashboard
              </button>
              
              <button 
                onClick={() => window.location.reload()}
                className="px-4 py-2.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 rounded-xl font-bold text-xs uppercase tracking-wider transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <RefreshCw size={14} /> Retry Module
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;