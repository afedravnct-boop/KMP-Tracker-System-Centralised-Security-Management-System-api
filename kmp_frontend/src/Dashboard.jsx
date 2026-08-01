import React from 'react';
import './index.css';
import { Eye } from 'lucide-react';

export default function Dashboard({ 
  user, 
  onLogout, 
  activeTab,       // Controlled by App.jsx
  setActiveTab,    // Controlled by App.jsx
  onViewHRReport,
  onGenerateHRReport,
  onViewOpsReport,
  onGenerateOpsReport,
  onViewConsolidated,
  children 
}) {
  return (
    <div className="dashboard-container">
      {/* SIDEBAR */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <h2>KMP Tracker System</h2>
          <p className="user-badge">Logged in: {user?.fnum} ({user?.role})</p>
        </div>

        <nav className="sidebar-nav">
          <p className="nav-label">📋 Go To System Register:</p>
          
          <button 
            className={activeTab === "reports" ? "active" : ""} 
            onClick={() => setActiveTab("reports")}
          >
            Page 1: Live Crime Registry
          </button>
          
          <button 
            className={activeTab === "stats" ? "active" : ""} 
            onClick={() => setActiveTab("stats")}
          >
            Page 2: Disruptive OPS
          </button>
          
          <button 
            className={activeTab === "stories" ? "active" : ""} 
            onClick={() => setActiveTab("stories")}
          >
            Page 3: Success Stories
          </button>
          
          <button 
            className={activeTab === "establishments" ? "active" : ""} 
            onClick={() => setActiveTab("establishments")}
          >
            Page 4: Regional Establishments
          </button>
          
          <button 
            className={activeTab === "nominal-roll" ? "active" : ""} 
            onClick={() => setActiveTab("nominal-roll")}
          >
            Page 5: Nominal Roll
          </button>
          
          {/* 🟢 Converted inline style to Tailwind: mt-4 border-t border-white/20 pt-4 */}
          <button 
            className={`mt-4 border-t border-white/20 pt-4 ${activeTab === "analytics" ? "active" : ""}`} 
            onClick={() => setActiveTab("analytics")}
          >
            📊 Page 6: Crime Analytics
          </button>

          {/* REPORTS SECTION */}
          {/* 🟢 Converted inline style to Tailwind: mt-6 border-t border-white/20 pt-4 */}
          <div className="mt-6 border-t border-white/20 pt-4">
            <p className="nav-label mb-3">📥 Reports & Ledgers:</p>
            
            <button 
              onClick={onViewConsolidated} 
              className="flex items-center justify-center bg-slate-800 hover:bg-slate-700 w-full px-4 py-3 rounded mb-3 text-white text-sm font-bold border border-slate-600 transition-all"
            >
               <Eye size={20} className="mr-3" />
               Consolidated Entries
            </button>

            <div className="flex space-x-2 mb-3">
              <button onClick={onViewHRReport} className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-2 px-2 rounded w-1/2 transition-colors">
                View HR
              </button>
              <button onClick={onGenerateHRReport} className="bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold py-2 px-2 rounded w-1/2 transition-colors">
                Export HR
              </button>
            </div>
            
            <div className="flex space-x-2">
              <button onClick={onViewOpsReport} className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-2 px-2 rounded w-1/2 transition-colors">
                View Ops
              </button>
              <button onClick={onGenerateOpsReport} className="bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold py-2 px-2 rounded w-1/2 transition-colors">
                Export Ops
              </button>
            </div>
          </div>
        </nav>

        <div className="sidebar-footer">
          <button onClick={onLogout} className="logout-btn">Logout</button>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="main-content relative">
        <div className="header-title">
          <h1>Uganda Police Force</h1>
          <h2>KMP Headquarters</h2>
          <h3>Centralized Security Data Management System</h3>
        </div>

        {/* 🚨 THE MAGIC: It no longer uses split-layout. It just renders whatever App.jsx hands it! */}
        <div className="w-full h-full p-2 overflow-y-auto custom-scrollbar">
          {children}
        </div>
      </main>
    </div>
  );
}