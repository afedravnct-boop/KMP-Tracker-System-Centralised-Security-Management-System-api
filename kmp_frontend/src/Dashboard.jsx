import React from 'react';
import './index.css';

export default function Dashboard({ 
  user, 
  onLogout, 
  activeTab,      // 🚨 NEW: App.jsx now controls this!
  setActiveTab,   // 🚨 NEW: App.jsx now controls this!
  onViewHRReport,
  onGenerateHRReport,
  onViewOpsReport,
  onGenerateOpsReport,
  children 
}) {
  return (
    <div className="dashboard-container">
      {/* SIDEBAR */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <h2>KMP Tracker System</h2>
          <p className="user-badge">Logged in: {user.fnum} ({user.role})</p>
        </div>

        <nav className="sidebar-nav">
          <p className="nav-label">📋 Go To System Register:</p>
          <button className={activeTab === "Page1" ? "active" : ""} onClick={() => setActiveTab("Page1")}>
            Page 1: Live Crime Registry
          </button>
          <button className={activeTab === "Page2" ? "active" : ""} onClick={() => setActiveTab("Page2")}>
            Page 2: Disruptive OPS
          </button>
          <button className={activeTab === "Page3" ? "active" : ""} onClick={() => setActiveTab("Page3")}>
            Page 3: Success Stories
          </button>
          <button className={activeTab === "Page4" ? "active" : ""} onClick={() => setActiveTab("Page4")}>
            Page 4: Regional Establishments
          </button>
          <button className={activeTab === "Page5" ? "active" : ""} onClick={() => setActiveTab("Page5")}>
            Page 5: Nominal Roll
          </button>
          <button className={activeTab === "Page6" ? "active" : ""} onClick={() => setActiveTab("Page6")} style={{ marginTop: "15px", borderTop: "1px solid rgba(255,255,255,0.2)", paddingTop: "15px" }}>
            📊 Page 6: Crime Analytics
          </button>

          {/* REPORTS SECTION */}
          <div style={{ marginTop: "25px", borderTop: "1px solid rgba(255,255,255,0.2)", paddingTop: "15px" }}>
            <p className="nav-label">📥 Reports & Ledgers:</p>
            <div className="flex space-x-2 mb-3">
              <button onClick={onViewHRReport} className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-2 px-2 rounded w-1/2">
                View HR
              </button>
              <button onClick={onGenerateHRReport} className="bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold py-2 px-2 rounded w-1/2">
                Export HR
              </button>
            </div>
            <div className="flex space-x-2">
              <button onClick={onViewOpsReport} className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-2 px-2 rounded w-1/2">
                View Ops
              </button>
              <button onClick={onGenerateOpsReport} className="bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold py-2 px-2 rounded w-1/2">
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