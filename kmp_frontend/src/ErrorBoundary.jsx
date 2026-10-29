// src/components/ErrorBoundary.jsx
import React from 'react';
import { authFetch } from './api';
import { AlertTriangle, Home, RefreshCw } from 'lucide-react';

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

    // Silently dispatch telemetry and trigger a private Super Admin communication dispatch
    authFetch('/api/v1/ai/report-crash', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(diagnosticPayload)
    }).catch(err => console.error("Crash telemetry transmission failed:", err));
  }

  // 🟢 Functional handler to clear cached faulty states and navigate to the home dashboard
  handleReturnHome = () => {
    try {
      localStorage.removeItem('active_module');
      localStorage.removeItem('active_tab');
    } catch (e) {}

    this.setState({ hasError: false, errorDetails: null }, () => {
      if (this.props.onReset) {
        this.props.onReset();
      } else {
        window.location.href = '/';
      }
    });
  };

  // 🟢 Functional handler to attempt re-rendering the module
  handleRetry = () => {
    this.setState({ hasError: false, errorDetails: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 md:p-12 max-w-2xl mx-auto mt-12 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border-2 border-red-500/40 text-center animate-in fade-in duration-300">
          <div className="w-16 h-16 bg-red-100 dark:bg-red-950 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-200 dark:border-red-900 shadow-inner">
            <AlertTriangle size={32} />
          </div>
          <h2 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-wider mb-2">
            Technical Glitch Registered on This Page
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed font-medium mb-6">
            This operational module has encountered a temporary runtime disturbance and has been safely isolated. High Command and System Administrators have been automatically notified. 
            <strong className="block text-amber-600 dark:text-amber-400 mt-2">Please proceed with other system modules using the navigation menu.</strong>
          </p>
          <div className="flex justify-center gap-3">
            <button 
              onClick={this.handleReturnHome}
              className="px-5 py-2.5 bg-slate-900 hover:bg-black dark:bg-slate-800 text-white rounded-xl font-bold text-xs uppercase tracking-wider shadow cursor-pointer transition flex items-center gap-2"
            >
              <Home size={14} /> Return to Home Dashboard
            </button>
            <button 
              onClick={this.handleRetry}
              className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl font-bold text-xs uppercase tracking-wider transition flex items-center gap-2 cursor-pointer"
            >
              <RefreshCw size={14} /> Retry Module
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;