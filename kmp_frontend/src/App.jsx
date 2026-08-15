import React, { useState, useMemo, useEffect, useRef } from 'react';
import { authFetch } from './api';
import { 
  LayoutDashboard, BarChart3, Trophy, UserPlus, LogOut, Menu, 
  Search, PlusCircle, Edit, Download, Shield, CheckCircle, 
  Award, Maximize2, Minimize2, Activity, User, Lock, 
  AlertTriangle, RadioReceiver, Eye, X, Building, Image, 
  Camera, Users, Home, Unlock, Send, Archive, PieChart,
  Bell, MessageSquare, Upload, ArrowLeft, ArrowRight, Globe, WifiOff, Wifi, FileText
} from 'lucide-react';
import * as XLSX from 'xlsx';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import CommandLedger from './CommandLedger';
import ConsolidatedLedger from './ConsolidatedLedger';
import HrEstablishmentsLedger from './HrEstablishmentsLedger';
import Admin_Communication from './Admin_Communication';
import BulkNominalRollUpload from './BulkNominalRollUpload';
import { syncOfflineQueue, getOfflineQueueCount } from './utils/offlineSync';
import AnalyticsDashboard from './AnalyticsDashboard';
import OfficerDossierModal from './OfficerDossierModal';
import WordReportUpload from './WordReportUpload';
import './index.css';
import SessionExpiredModal from './SessionExpiredModal';
import AdminApprovals from "./AdminApprovals";
import CrimeIncidentRegistry from './CrimeIncidentRegistry';

const formatOfficerTitle = (officer) => {
  if (!officer) return 'UNKNOWN OFFICER';
  const fnum = (officer.fnum || officer.f_num || '').trim();
  const rank = (officer.rank || '').trim();
  const name = (officer.name || '').trim();
  
  // Formats strictly as: F/No Rank Name (e.g., A/2408 AIP AFEDRA VINCENT)
  return [fnum, rank, name].filter(Boolean).join(' ').toUpperCase();
};

// 🟢 Place this utility function right near the top of src/App.jsx (outside of App)
const calculateGrandTotals = (allSubmissions, currentUser, filterRegion, filterStation) => {
  const scopedSubmissions = allSubmissions.filter(entry => {
    if (filterRegion && filterRegion !== 'ALL REGIONS' && entry.region !== filterRegion) return false;
    if (filterStation && filterStation !== 'ALL STATIONS' && entry.station !== filterStation) return false;
    return true;
  });

  const calculatedStationSum = scopedSubmissions.reduce((sum, entry) => {
    return sum + (Number(entry.total_value || entry.count || entry.amount) || 0);
  }, 0);

  const hqEntry = scopedSubmissions.find(entry => entry.is_hq_grand_total || entry.station === 'HQ GENERAL');
  const hqEnteredTotal = hqEntry ? (Number(hqEntry.total_value || hqEntry.count || hqEntry.amount) || 0) : null;

  return {
    displayTotal: hqEnteredTotal !== null && currentUser?.role !== 'STATION_ADMIN' ? hqEnteredTotal : calculatedStationSum,
    stationSum: calculatedStationSum,
    hqTotal: hqEnteredTotal,
    isReconciled: hqEnteredTotal === null || hqEnteredTotal === calculatedStationSum
  };
};


const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

const REGIONAL_HIERARCHY = {
  "KMP NORTH": ["KAWEMPE", "KAKIRI", "KASANGATI", "MATUGGA", "NANSANA", "OLD KAMPALA", "WAKISO", "WANDEGEYA"],
  "KMP EAST": ["JINJA ROAD", "KIRA", "KIRA ROAD", "MUKONO", "NAGGALAMA", "SEETA"],
  "KMP SOUTH": ["NATEETE", "CPS KAMPALA", "ENTEBBE", "KABALAGALA", "KAJJANSI", "KASENYI", "KATWE", "KYENGERA", "NSANGI"],
  "KMP HEADQUARTERS": ["KMP HEADQUARTERS", "FLYING SQUAD", "CRIME INTELLIGENCE", "KMP Headquarters", "KAWEMPE", "KAKIRI", "KASANGATI", "MATUGGA", "NANSANA", "OLD KAMPALA", "WAKISO", "WANDEGEYA", "JINJA ROAD", "KIRA", "KIRA ROAD", "MUKONO", "NAGGALAMA", "SEETA", "NATEETE", "CPS KAMPALA", "PARLIAMENT", "ENTEBBE", "KABALAGALA", "KAJJANSI", "KASENYI", "KATWE", "KYENGERA", "NSANGI"],
  "POLICE HEADQUARTERS": ["NAGURU", "KMP HEADQUARTERS", "FLYING SQUAD", "CRIME INTELLIGENCE", "KMP Headquarters", "KAWEMPE", "KAKIRI", "KASANGATI", "MATUGGA", "NANSANA", "OLD KAMPALA", "WAKISO", "WANDEGEYA", "JINJA ROAD", "KIRA", "KIRA ROAD", "MUKONO", "NAGGALAMA", "SEETA", "NATEETE", "CPS KAMPALA", "ENTEBBE", "KABALAGALA", "KAJJANSI", "KASENYI", "KATWE", "KYENGERA", "NSANGI"]
};

const autoCapitalize = (text) => {
  if (!text) return text;
  return text.replace(/(^\s*|>|\.\s+|\n\s*)([a-z])/g, (match, separator, letter) => {
    return separator + letter.toUpperCase();
  });
};

export const formatEATDateTime = (dateStr) => {
  if (!dateStr) return 'N/A';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;

  return d.toLocaleString('en-GB', {
    timeZone: 'Africa/Nairobi', 
    hour12: false,              
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
};

const POSITIONS = {
  ADMIN: [
    "System Manager", "IGP", "DIGP", "Director OPS", "Director CT", "Director CI", 
    "Director CID", "Director HRM & A", "Director logistics & engineering", 
    "KMP Commander", "Deputy KMP Commander",
    "KMP CID Commander", "KMP CI Commander", "KMP Operations Commander", 
    "KMP Traffic & Road Safety Commander", "KMP 999 eru commander", 
    "999 ERU Regional Data Officer", "Regional HR Officer", "KMP SFC Coordinator",
    "Regional Data officer", "Divisional Data Officer", "Station Data Officer", "Regional Data Assistant Officer", "Division Data Assistant Officer", "Station Data Assistant Officer", "Regional Traffic Officer", "Divisional Traffic Officer", "Divisional CID Officer", "Divisional CI Officer", "Regional CFPU Officer", "Divisional CFPU Officer", "Regional Fire Officer", "Divisional Fire Officer", "Regional Logistics Officer", "Divisional Logistics Officer"
  ],
  RPC: [
    "KMP South Commander", "KMP North Commander", "KMP East Commander", "Deputy Commander KMP south", "Deputy Commander KMP North", "Deputy Commander KMP East"
  ]
};

const NetworkStatusBadge = () => {
  const [queueCount, setQueueCount] = useState(0);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const updateStatus = () => {
      setIsOnline(navigator.onLine);
      setQueueCount(getOfflineQueueCount());
    };

    updateStatus();

    window.addEventListener('online', updateStatus);
    window.addEventListener('offline', updateStatus);
    
    const interval = setInterval(updateStatus, 5000);

    return () => {
      window.removeEventListener('online', updateStatus);
      window.removeEventListener('offline', updateStatus);
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="flex items-center space-x-2 px-3 py-1 rounded-full text-xs font-bold border shadow-sm">
      {isOnline ? (
        <span className="flex items-center text-green-600 bg-green-50 border-green-200 px-2.5 py-1 rounded-full">
          <Wifi size={14} className="mr-1.5" /> Live Sync Active
        </span>
      ) : (
        <span className="flex items-center text-amber-600 bg-amber-50 border-amber-200 px-2.5 py-1 rounded-full animate-pulse">
          <WifiOff size={14} className="mr-1.5" /> Offline Mode
        </span>
      )}

      {queueCount > 0 && (
        <span className="bg-red-600 text-white px-2 py-0.5 rounded-full text-[10px] shadow">
          {queueCount} Queued
        </span>
      )}
    </div>
  );
};


function usePersistentState(key, initialValue) {
  const [state, setState] = useState(() => {
    const saved = localStorage.getItem(key);
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { return initialValue; }
    }
    return initialValue;
  });

  const setPersistentState = (newValue) => {
    setState(prev => {
      const valToSave = typeof newValue === 'function' ? newValue(prev) : newValue;
      localStorage.setItem(key, JSON.stringify(valToSave));
      return valToSave;
    });
  };

  return [state, setPersistentState];
}

const downloadWithAuth = async (url, filename) => {
    try {
      const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
      const fullUrl = url.startsWith('http') ? url : `${API_URL}${url}`;
      
      console.log("Starting secure download:", fullUrl);
      const response = await fetch(fullUrl, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('kmp_authToken')}` }
      });
      
      if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.detail || `Server Error ${response.status}`);
      }

      const blob = await response.blob();
      console.log("Blob received. Size:", blob.size, "bytes");

      if (blob.size === 0) {
          throw new Error("Received empty file (0 bytes). Check the backend.");
      }

      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.style.display = 'none';
      link.href = downloadUrl;
      link.download = filename;
      
      document.body.appendChild(link);
      link.click();
      
      setTimeout(() => {
          document.body.removeChild(link);
          window.URL.revokeObjectURL(downloadUrl);
      }, 2000);
      
    } catch (error) {
      console.error("Download Error:", error);
      alert(`Export Failed: ${error.message}`); 
    }
};

const MetricCard = ({ title, value, colorClass = "text-slate-800" }) => (
  <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex flex-col justify-center items-center text-center transition-transform hover:scale-105">
    <span className="text-xs text-gray-500 font-bold mb-1 uppercase tracking-wide">{title}</span>
    <span className={`text-3xl font-extrabold ${colorClass}`}>{value}</span>
  </div>
);

const ExpandableTableCard = ({ title, children, onToggle }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const openFullScreen = () => {
    setIsExpanded(true);
    if (typeof onToggle === 'function') onToggle(true);
  };

  const closeFullScreen = () => {
    setIsExpanded(false);
    if (typeof onToggle === 'function') onToggle(false);
  };

  return (
    <>
      {isExpanded ? (
        <div className="fixed inset-0 z-[100] bg-gray-100 flex flex-col p-4 sm:p-8 animate-in fade-in zoom-in duration-200">
          <div className="bg-slate-900 text-white p-4 rounded-t-xl flex justify-between items-center shadow-lg">
            <h3 className="font-bold text-lg flex items-center">
               <Maximize2 className="mr-2 w-5 h-5 text-blue-400"/> {title} (Full Screen Mode)
            </h3>
            <button onClick={closeFullScreen} className="hover:bg-slate-700 p-2 rounded-lg transition-colors flex items-center bg-slate-800 border border-slate-600">
              <Minimize2 size={18} className="mr-2"/> Close Expansion
            </button>
          </div>
          <div className="bg-white flex-1 overflow-auto rounded-b-xl shadow-2xl p-4 border border-gray-300 custom-scrollbar">
            {children}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-full relative z-10">
          <div className="bg-slate-50 px-4 py-3 border-b border-gray-200 flex justify-between items-center">
             <h3 className="text-gray-800 font-bold text-sm uppercase tracking-wider">{title}</h3>
             <button onClick={openFullScreen} className="text-gray-500 hover:text-blue-700 hover:bg-blue-50 p-1.5 rounded transition-colors" title="Expand to Full Screen">
               <Maximize2 size={18}/>
             </button>
          </div>
          <div className="p-0 overflow-auto max-h-[500px] custom-scrollbar w-full">
             {children}
          </div>
        </div>
      )}
    </>
  );
};

const HomeDashboard = ({ currentUser, setCurrentPage, reports = [], stats = [], onMasterExport, onViewConsolidated, adminCommsData, onAcknowledgeComm, onOpenInbox }) => {
  const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(currentUser.role);
  const isRPC = ['ADMIN', 'SUPER_ADMIN', 'RPC', 'Deputy Commander'].includes(currentUser.role);
  
  const hasNominalClearance = ['ADMIN', 'SUPER_ADMIN', 'RPC', 'Deputy Commander', 'Regional_HR_Officer'].includes(currentUser?.role) ||                        
                            (currentUser?.position || '').toUpperCase().includes('HR') ||
                            currentUser?.permissions?.view_nominal_roll ||                            
                            currentUser?.permissions?.upload_hr;

  const rawComms = adminCommsData || [];
  const safeComms = Array.isArray(rawComms) ? rawComms : (rawComms.data || rawComms.items || []);

  const canViewConsolidated = isAdmin || currentUser.permissions?.consolidated;
  const canExportData = isRPC || currentUser.permissions?.export_data;

  const today = new Date().getDay();
  const isEndOfWeek = today === 4 || today === 6 || today === 0;

  const userRole = (currentUser.role || '').toUpperCase();
  const userPosition = (currentUser.position || '').toUpperCase();
  const userRegion = (currentUser.region || '').toUpperCase();
  const userStation = (currentUser.station || '').trim().toUpperCase();

  const isPoliceHQ = userRegion.includes('POLICE HEADQUARTERS') || userStation.includes('POLICE HEADQUARTERS');
  const isSystemManager = userPosition.includes('SYSTEM MANAGER') || userRole === 'SUPER_ADMIN';

  const targetKeywords = ['RPC', 'DEPUTY RPC', 'DPC', 'DEPUTY DPC', 'DATA OFFICER', 'DATA ASSISTANT OFFICER', 'HR OFFICER'];
  const matchesFieldRole = targetKeywords.some(keyword => userPosition.includes(keyword) || userRole.includes(keyword));

  const isTargetOfficer = matchesFieldRole && !isPoliceHQ && !isSystemManager;

  // 🟢 NORMALIZED WEEKLY COMPLIANCE CHECK
  const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);

  const hasSubmittedReport = (Array.isArray(reports) ? reports : []).some(r => {
    if (!r.date) return false;
    const matchesStation = (r.station || '').trim().toUpperCase() === userStation;
    const reportTime = new Date(r.date.toString().split('T')[0]).getTime();
    return matchesStation && reportTime >= oneWeekAgo;
  });

  const hasSubmittedStats = (Array.isArray(stats) ? stats : []).some(s => {
    if (!s.date) return false;
    const matchesStation = (s.station || '').trim().toUpperCase() === userStation;
    const statTime = new Date(s.date.toString().split('T')[0]).getTime();
    return matchesStation && statTime >= oneWeekAgo;
  });

  const hasSubmittedThisWeek = hasSubmittedReport || hasSubmittedStats;

  const showComplianceWarning = isEndOfWeek && !hasSubmittedThisWeek && isTargetOfficer;
  const showComplianceSuccess = isEndOfWeek && hasSubmittedThisWeek && isTargetOfficer;

  const [isBannerFolded, setIsBannerFolded] = useState(false);

  useEffect(() => {
    if (!showComplianceWarning) return;
    let timer;
    const runCycle = () => {
      setIsBannerFolded(false); 
      timer = setTimeout(() => {
        setIsBannerFolded(true); 
        timer = setTimeout(() => { runCycle(); }, 240000); 
      }, 60000); 
    };
    runCycle();
    return () => clearTimeout(timer);
  }, [showComplianceWarning]);

  const hasUnread = safeComms.some(c => !c.acknowledged);

  return (
    // 🟢 OPTIMIZATION: Expanded max-w to 1400px to use side space, reduced padding
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto space-y-6 relative z-10 animate-in fade-in duration-300">
      
      {/* 🟢 FLOATING COMPLIANCE OVERDUE PILL BUTTON (Shrunk slightly) */}
      {showComplianceWarning && (
        <div className="fixed bottom-6 right-6 z-[9990]">
          <div
            onMouseEnter={() => setIsBannerFolded(false)}
            onMouseLeave={() => setIsBannerFolded(true)}
            onClick={() => {
              if (isBannerFolded) {
                setIsBannerFolded(false);
              } else {
                setCurrentPage('statistics');
              }
            }}
            className={`flex items-center transition-all duration-300 ease-in-out cursor-pointer shadow-2xl rounded-full border ${
              !isBannerFolded ? 'px-3 py-2.5' : 'p-2'
            } bg-red-600 text-white border-red-300 shadow-[0_0_20px_rgba(239,68,68,0.6)] animate-pulse`}
          >
            {isBannerFolded ? (
              <div className="flex items-center space-x-2 px-1">
                <span className="flex h-2.5 w-2.5 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-300 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-yellow-400"></span>
                </span>
                <span className="text-[10px] font-extrabold tracking-wide uppercase">⚠️ Overdue</span>
              </div>
            ) : (
              <div className="flex flex-col space-y-2 p-1 max-w-xs text-left" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-start text-[11px] leading-snug font-extrabold">
                  <AlertTriangle className="mr-2 w-4 h-4 shrink-0 text-yellow-300 animate-bounce mt-0.5" />
                  <span>COMPLIANCE ALERT: Your weekly entries are overdue for {currentUser.station}. Please submit records immediately.</span>
                </div>
                <div className="flex space-x-2 justify-end">
                  <button 
                    onClick={(e) => { e.stopPropagation(); setIsBannerFolded(true); }} 
                    className="bg-red-800 text-white px-2.5 py-1 rounded font-bold shadow text-[10px] hover:bg-red-900 transition cursor-pointer"
                  >
                    Minimize
                  </button>
                  <button 
                    onClick={() => setCurrentPage('statistics')} 
                    className="bg-white text-red-700 px-2.5 py-1 rounded font-bold shadow text-[10px] hover:bg-gray-100 transition cursor-pointer"
                  >
                    Go to Statistics
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {showComplianceSuccess && (
        <div className="bg-emerald-600 text-white font-extrabold p-3 rounded-lg shadow-2xl flex items-center border border-emerald-400 max-w-sm fixed bottom-24 right-6 z-[9980]">
          <CheckCircle className="mr-2 w-5 h-5 shrink-0 text-emerald-200" />
          <span className="text-[11px]">COMMENDATION: Thank you, {currentUser.rank} {currentUser.name}, for duly filing your weekly returns.</span>
        </div>
      )}

      {/* 🟢 HEADER (Shrunk sizes) */}
      <div className="text-center flex flex-col items-center mt-2">
        <img src="/upf_badge.png" alt="UPF Logo" className="w-16 h-16 mb-1 object-contain drop-shadow-md contrast-200 brightness-75" />
        <h1 className="text-2xl font-extrabold text-gray-900 tracking-wide">UGANDA POLICE FORCE</h1>
        <h2 className="text-base font-bold text-slate-600 uppercase tracking-wide">KAMPALA METROPOLITAN POLICE HEADQUARTERS</h2>
        <h3 className="text-[11px] font-bold text-blue-600 mt-2 uppercase tracking-widest bg-blue-50 px-3 py-1 rounded-full border border-blue-200">Centralised Security Data Management System</h3>
      </div>

      <div className="w-full">
        <h3 className="text-center text-xs font-bold text-slate-600 bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
            Welcome, <span className="text-blue-700">{currentUser.rank} {currentUser.name}</span>. Select an operational module.
        </h3>   
      </div>

      {/* 🟢 COMMS BANNER (Shrunk padding and height) */}
      <div onClick={onOpenInbox} className="min-h-[4.5rem] bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex items-center cursor-pointer transition-all hover:shadow-md hover:-translate-y-1 hover:border-green-400 group relative overflow-hidden mb-2">
        {hasUnread && (
          <><div className="absolute top-2 right-2 w-2.5 h-2.5 bg-green-500 rounded-full shadow-[0_0_8px_#22c55e] animate-ping"></div>
            <div className="absolute top-2 right-2 w-2.5 h-2.5 bg-green-500 rounded-full"></div></>
        )}
        <div className="w-10 h-10 rounded-full bg-slate-900 text-white flex items-center justify-center mr-3 group-hover:bg-slate-800 transition-colors shrink-0">
          <RadioReceiver size={18} className={hasUnread ? "text-green-400 animate-pulse" : "text-slate-400"} />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-extrabold text-slate-900 leading-tight">Command Dispatches & Alerts</h3>
          <p className="text-[11px] font-medium mt-0.5 line-clamp-2 transition-colors duration-300 flex items-center">
            {hasUnread ? <span className="text-green-600 font-bold">You have unread Correspondences. Click to view.</span> : <span className="text-slate-500">Secure directives, network alerts, and command communications.</span>}
          </p>
        </div>
      </div>

      {/* 🟢 OPTIMIZED MODULE GRID (4 Columns on large screens, shrunk icons/padding) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 w-full">
          <div onClick={() => setCurrentPage('reports')} className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex items-center cursor-pointer transition-all hover:shadow-md hover:-translate-y-1 hover:border-blue-300 group">
            <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mr-3 group-hover:bg-blue-600 group-hover:text-white transition-colors shrink-0"><LayoutDashboard size={18} /></div>
            <div><h3 className="text-sm font-extrabold text-slate-900 leading-tight">Crime Registry</h3><p className="text-[11px] text-slate-500 font-medium mt-0.5 leading-snug">Log and track daily incidents.</p></div>
          </div>
          
          <div onClick={() => setCurrentPage('statistics')} className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex items-center cursor-pointer transition-all hover:shadow-md hover:-translate-y-1 hover:border-blue-300 group">
            <div className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center mr-3 group-hover:bg-indigo-600 group-hover:text-white transition-colors shrink-0"><BarChart3 size={18} /></div>
            <div><h3 className="text-sm font-extrabold text-slate-900 leading-tight">OPS Statistics</h3><p className="text-[11px] text-slate-500 font-medium mt-0.5 leading-snug">Weekly numerical aggregates.</p></div>
          </div>

          <div onClick={() => setCurrentPage('success')} className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex items-center cursor-pointer transition-all hover:shadow-md hover:-translate-y-1 hover:border-yellow-400 group">
            <div className="w-10 h-10 rounded-full bg-yellow-50 text-yellow-600 flex items-center justify-center mr-3 group-hover:bg-yellow-500 group-hover:text-white transition-colors shrink-0"><Trophy size={18} /></div>
            <div><h3 className="text-sm font-extrabold text-slate-900 leading-tight">Success Stories</h3><p className="text-[11px] text-slate-500 font-medium mt-0.5 leading-snug">Document tactical milestones.</p></div>
          </div>

          <div onClick={() => setCurrentPage('establishments')} className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex items-center cursor-pointer transition-all hover:shadow-md hover:-translate-y-1 hover:border-emerald-300 group">
            <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mr-3 group-hover:bg-emerald-600 group-hover:text-white transition-colors shrink-0"><Building size={18} /></div>
            <div><h3 className="text-sm font-extrabold text-slate-900 leading-tight">Establishments</h3><p className="text-[11px] text-slate-500 font-medium mt-0.5 leading-snug">Map divisions, stations, posts.</p></div>
          </div>

          <div onClick={() => setCurrentPage('analytics')} className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex items-center cursor-pointer transition-all hover:shadow-md hover:-translate-y-1 hover:border-cyan-400 group">
            <div className="w-10 h-10 rounded-full bg-cyan-50 text-cyan-600 flex items-center justify-center mr-3 group-hover:bg-cyan-600 group-hover:text-white transition-colors shrink-0"><PieChart size={18} /></div>
            <div><h3 className="text-sm font-extrabold text-slate-900 leading-tight">Analytics Dashboard</h3><p className="text-[11px] text-slate-500 font-medium mt-0.5 leading-snug">Graphs, cross-tabs & reports.</p></div>
          </div>

          {hasNominalClearance && (
            <div onClick={() => setCurrentPage('nominal-roll')} className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex items-center cursor-pointer transition-all hover:shadow-md hover:-translate-y-1 hover:border-purple-300 group">
              <div className="w-10 h-10 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center mr-3 group-hover:bg-purple-600 group-hover:text-white transition-colors shrink-0"><Users size={18} /></div>
              <div><h3 className="text-sm font-extrabold text-slate-900 leading-tight">Nominal Roll</h3><p className="text-[11px] text-slate-500 font-medium mt-0.5 leading-snug">Personnel deployment registry.</p></div>
            </div>
          )}

          {/* 🟢 "WIDE" BUTTONS: These span 2 columns on large screens to stretch cleanly */}
          {isAdmin && (
            <div onClick={() => setCurrentPage('approvals')} className="bg-slate-900 rounded-xl shadow-sm border border-slate-700 p-4 flex items-center cursor-pointer transition-all hover:shadow-md hover:-translate-y-1 hover:border-slate-500 group lg:col-span-2">
              <div className="w-10 h-10 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center mr-3 group-hover:bg-slate-700 group-hover:text-white transition-colors shrink-0"><UserPlus size={18} /></div>
              <div><h3 className="text-sm font-extrabold text-white leading-tight">Access Approvals</h3><p className="text-[11px] text-slate-400 font-medium mt-0.5 leading-snug">Review system logs and pending signups.</p></div>
            </div>
          )}
          
          {canViewConsolidated && (
            <div onClick={onViewConsolidated} className="bg-slate-900 rounded-xl shadow-sm border border-slate-700 p-4 flex items-center cursor-pointer transition-all hover:shadow-md hover:-translate-y-1 hover:border-slate-500 group lg:col-span-2">
              <div className="w-10 h-10 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center mr-3 group-hover:bg-slate-700 group-hover:text-white transition-colors shrink-0"><Eye size={18} /></div>
              <div><h3 className="text-sm font-extrabold text-white leading-tight">Consolidated Entries</h3><p className="text-[11px] text-slate-400 font-medium mt-0.5 leading-snug">Cross-domain master visualization.</p></div>
            </div>
          )}

          {canExportData && (
            <div onClick={() => onMasterExport('all', 'all')} className="bg-blue-900 rounded-xl shadow-sm border border-blue-800 p-4 flex items-center cursor-pointer transition-all hover:shadow-md hover:-translate-y-1 hover:border-blue-400 group lg:col-span-2">
              <div className="w-10 h-10 rounded-full bg-blue-800 text-blue-200 flex items-center justify-center mr-3 group-hover:bg-blue-700 group-hover:text-white transition-colors shrink-0"><Download size={18} /></div>
              <div><h3 className="text-sm font-extrabold text-white leading-tight">Download Master Database</h3><p className="text-[11px] text-blue-200 font-medium mt-0.5 leading-snug">Export full encrypted .xlsx ledger.</p></div>
            </div>
          )}
      </div>
    </div>
  );
};


const Statistics = ({ currentUser, stats, setStats, setSidebarOpen }) => {
  const [operation, setOperation] = useState('new');
  const [notification, setNotification] = useState(null);

  const [filterRegion, setFilterRegion] = useState(currentUser?.role === 'SUPER_ADMIN' ? 'ALL REGIONS' : currentUser?.region || '');
  const [filterStation, setFilterStation] = useState((['SUPER_ADMIN', 'RPC', 'Deputy Commander'].includes(currentUser?.role) || currentUser?.permissions?.view_global_roster) ? 'ALL STATIONS' : currentUser?.station || '');
  const [updateSearch, setUpdateSearch] = useState('');
  const [dateFilter, setDateFilter] = useState('ALL TIME');
    
  const [formData, setFormData] = useState({
    sn: null, region: currentUser.region, station: currentUser.station || REGIONAL_HIERARCHY[currentUser?.region]?.[0] || '',
    date: new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0],
    arrested: 0, given_bond: 0, cautioned: 0, pending_court: 0, taken_to_court: 0, released: 0, remanded: 0, convicted: 0
  });

  const filteredStats = useMemo(() => {
    return (Array.isArray(stats) ? stats : []).filter(s => {
      if (filterRegion !== 'ALL REGIONS' && s.region !== filterRegion) return false;
      if (filterStation !== 'ALL STATIONS' && s.station !== filterStation) return false;

      if (dateFilter === 'TODAY') {
        const todayStr = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0];
        if (s.date !== todayStr) return false;
      } else if (dateFilter === 'LAST 7 DAYS') {
        const repDate = new Date(s.date); const diffDays = Math.ceil(Math.abs(new Date() - repDate) / (1000 * 60 * 60 * 24)); if (diffDays > 7) return false;
      } else if (dateFilter === 'LAST 30 DAYS') {
        const repDate = new Date(s.date); const diffDays = Math.ceil(Math.abs(new Date() - repDate) / (1000 * 60 * 60 * 24)); if (diffDays > 30) return false;
      } else if (dateFilter === 'LAST 90 DAYS') {
        const repDate = new Date(s.date); const diffDays = Math.ceil(Math.abs(new Date() - repDate) / (1000 * 60 * 60 * 24)); if (diffDays > 90) return false;
      } else if (dateFilter === 'LAST 120 DAYS') {
        const repDate = new Date(s.date); const diffDays = Math.ceil(Math.abs(new Date() - repDate) / (1000 * 60 * 60 * 24)); if (diffDays > 120) return false;
      }
      return true;
    });
  }, [stats, filterRegion, filterStation, dateFilter]);

  const availableUpdateStats = useMemo(() => {
    return (Array.isArray(stats) ? stats : []).filter(s => {
      if (!['ADMIN', 'SUPER_ADMIN'].includes(currentUser.role) && s.region !== currentUser.region) return false;
      if (updateSearch) {
        const query = updateSearch.toLowerCase();
        
        // 🟢 SAFEGUARDED WITH String() & Optional Chaining:
        const snStr = String(s.sn || '').toLowerCase();
        const stationStr = String(s.station || '').toLowerCase();
        const dateStr = String(s.date || '').toLowerCase();

        return snStr.includes(query) || stationStr.includes(query) || dateStr.includes(query);
      }
      return true;
    });
  }, [stats, currentUser, updateSearch]);

  const totals = useMemo(() => {
    return filteredStats.reduce((acc, curr) => {
      acc.arrested += (parseInt(curr.arrested) || 0); acc.given_bond += (parseInt(curr.given_bond) || 0);
      acc.cautioned += (parseInt(curr.cautioned) || 0); acc.pending_court += (parseInt(curr.pending_court) || 0);
      acc.taken_to_court += (parseInt(curr.taken_to_court) || 0); acc.released += (parseInt(curr.released) || 0);
      acc.remanded += (parseInt(curr.remanded) || 0); acc.convicted += (parseInt(curr.convicted) || 0);
      return acc;
    }, { arrested: 0, given_bond: 0, cautioned: 0, pending_court: 0, taken_to_court: 0, released: 0, remanded: 0, convicted: 0 });
  }, [filteredStats]);

  const handleInputChange = (e) => {
    const { name, value, type } = e.target;
    if (name === 'region') setFormData({ ...formData, region: value, station: REGIONAL_HIERARCHY[value][0] });
    else setFormData({ ...formData, [name]: type === 'number' ? parseInt(value) || 0 : value });
  };

  const handleOperationToggle = (op) => {
    setOperation(op); setNotification(null);
    if (op === 'new') {
      setFormData({
        sn: null, region: currentUser.region, station: currentUser.station || REGIONAL_HIERARCHY[currentUser?.region]?.[0] || '',
        date: new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0],
        arrested: 0, given_bond: 0, cautioned: 0, pending_court: 0, taken_to_court: 0, released: 0, remanded: 0, convicted: 0
      });
      setUpdateSearch('');
    }
  };

  const populateUpdateForm = (statData) => setFormData({ ...statData });

  const handleFormSubmit = async (e) => { 
    e.preventDefault();
    const token = localStorage.getItem('kmp_authToken');
    if (!token) return setNotification("Error: Security token missing.");
    
    if (operation === 'new') {
      const isDuplicate = stats.some(s => s.station === formData.station && s.date === formData.date);
      if (isDuplicate) return setNotification(`Error: Statistics for ${formData.station} on ${formData.date} are already logged. Please use 'Update Existing'.`);

      const exactNextSN = stats.length > 0 ? Math.max(...stats.map(s => s.sn)) + 1 : 1;
      const newStat = { ...formData, sn: exactNextSN, last_updated_by: `${currentUser.name} (${currentUser.fnum})` };
      
      try {
        const response = await authFetch(`/api/v1/stats`, {
          method: "POST", 
          headers: { "Content-Type": "application/json" }, 
          body: JSON.stringify(newStat)
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.detail || "Database rejected the entry.");
        }
        
        const savedData = await response.json().catch(() => newStat);
        setStats([savedData, ...stats]); 
        setNotification(`Statistics recorded for ${formData.station}!`);
        setFormData({ 
          ...formData, 
          arrested: 0, given_bond: 0, cautioned: 0, pending_court: 0, 
          taken_to_court: 0, released: 0, remanded: 0, convicted: 0, sn: null 
        });
      } catch (err) { 
        setNotification(`❌ Error: ${err.message}`); 
      }
      
    } else if (operation === 'update') {
      if (!formData.sn) return setNotification("Error: Please select a record from the list to update first.");
      const updatedRecord = { ...formData, last_updated_by: `${currentUser.name} (${currentUser.fnum})` };

      try {
        const response = await fetch(`${API_URL}/api/v1/stats/${formData.sn}`, {
          method: "PUT", 
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }, 
          body: JSON.stringify(updatedRecord)
        });
        if (!response.ok) throw new Error("Failed to update record in database.");
        
        const updatedStats = stats.map(s => s.sn === formData.sn ? updatedRecord : s);
        setStats(updatedStats); 
        setNotification(`Statistics SN ${formData.sn} successfully updated!`);
        handleOperationToggle('new');
      } catch (err) { 
        setNotification("❌ Error: Could not update the record in the database."); 
      }
    }
  };

  return (
    <div className="p-3 sm:p-6 max-w-[1600px] mx-auto space-y-6 relative z-10">
      <div className="text-center mb-8 flex flex-col items-center">
        <img src="/upf_badge.png" alt="UPF Logo" className="w-16 h-16 mb-3 object-contain contrast-200 brightness-75 drop-shadow-sm"/>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-700 tracking-tight">Disruptive OPS Statistics</h1>
        <h3 className="text-sm sm:text-lg text-blue-700 mt-2 font-medium">Weekly Numerical Aggregates</h3>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <>
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="bg-slate-900 px-4 py-3 border-b border-gray-200 flex justify-between items-center">
                <h3 className="text-white font-semibold flex items-center"><BarChart3 className="w-5 h-5 mr-2 text-blue-400" /> ⚙️ Log Statistics</h3>
              </div>
              <div className="p-5 space-y-6">
                <div className="flex space-x-2 bg-gray-100 p-1 rounded-lg">
                  <button type="button" onClick={() => handleOperationToggle('new')} className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${operation === 'new' ? 'bg-white shadow text-blue-700' : 'text-gray-600 hover:text-gray-900'}`}><PlusCircle className="w-4 h-4 inline mr-1" /> Register New</button>
                  <button type="button" onClick={() => handleOperationToggle('update')} className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${operation === 'update' ? 'bg-white shadow text-blue-700' : 'text-gray-600 hover:text-gray-900'}`}><Edit className="w-4 h-4 inline mr-1" /> Update Existing</button>
                </div>
                {notification && <div className={`border px-4 py-3 rounded-lg flex items-center mb-4 ${notification.includes('Error') || notification.includes('❌') ? 'bg-red-50 border-red-200 text-red-800' : 'bg-green-50 border-green-200 text-green-800'}`}>{notification.includes('Error') || notification.includes('❌') ? <AlertTriangle className="w-5 h-5 mr-2 text-red-500 shrink-0" /> : <CheckCircle className="w-5 h-5 mr-2 text-green-500 shrink-0" />}<span className="text-sm font-medium">{notification}</span></div>}
{operation === 'update' && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <label className="block text-xs font-bold text-blue-800 mb-2">🔍 Search & Select Record to Update</label>
                    <input type="text" placeholder="Search by SN, Station, or Date..." value={updateSearch} onChange={e => setUpdateSearch(e.target.value)} className="w-full text-sm p-2 mb-2 border border-blue-200 rounded outline-none focus:ring-2 focus:ring-blue-400" />
                    <div className="max-h-40 overflow-y-auto bg-white border border-blue-100 rounded custom-scrollbar">
                      {availableUpdateStats.length === 0 ? <div className="p-3 text-xs text-gray-500 text-center">No records found matching your search.</div> : availableUpdateStats.map(s => (
                        
{/* 🟢 FIXED CLICK HANDLER FOR NEONDB ID & SERIAL NUMBER */}
<div 
                          key={s.id || s.sn} 
                          onClick={() => {
                            populateUpdateForm(s);
                            const activeKey = s.id !== undefined && s.id !== null ? s.id : s.sn;
                            setNotification(`Selected Record ID: ${activeKey} (${s.station}) for update.`);
                          }} 
                          className={`p-2.5 text-xs border-b cursor-pointer transition-colors ${(formData.sn === (s.id || s.sn) || formData.id === (s.id || s.sn)) ? 'bg-blue-700 text-white font-bold' : 'hover:bg-blue-100 text-gray-800'}`}
                        >
                          <span className={(formData.sn === (s.id || s.sn) || formData.id === (s.id || s.sn)) ? 'text-blue-200' : 'text-gray-400'}>ID: {s.id || s.sn}</span> | <span className={(formData.sn === (s.id || s.sn) || formData.id === (s.id || s.sn)) ? 'text-white' : 'font-bold text-blue-700'}>{s.date}</span> | {s.station}
                        </div>

                      ))}
                    </div>
                  </div>
                )}
                <form onSubmit={handleFormSubmit} className="space-y-5">
                  {operation === 'update' && (formData.sn || formData.id) && <div className="bg-slate-800 text-white text-xs font-bold px-3 py-2 rounded">Currently Editing Record ID: {formData.sn || formData.id}</div>}
                  <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">Select Region *</label>
                        <select name="region" value={formData.region} onChange={handleInputChange} disabled={!(currentUser.role === 'SUPER_ADMIN' || currentUser.permissions?.view_global_roster) || operation === 'update'} required className="w-full text-sm border-gray-300 rounded-md shadow-sm bg-white border p-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500">
                          {['ADMIN', 'SUPER_ADMIN'].includes(currentUser.role) ? Object.keys(REGIONAL_HIERARCHY).map(reg => <option key={reg} value={reg}>{reg}</option>) : <option value={currentUser.region}>{currentUser.region}</option>}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">Station / Division *</label>
                        <select name="station" value={formData.station} onChange={handleInputChange} disabled={!['ADMIN', 'SUPER_ADMIN', 'RPC', 'Deputy Commander'].includes(currentUser.role) || operation === 'update'} required className="w-full text-sm border-gray-300 rounded-md shadow-sm bg-white border p-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500">
                          {operation === 'update' ? <option value={formData.station}>{formData.station}</option> : ['ADMIN', 'SUPER_ADMIN', 'RPC', 'Deputy Commander'].includes(currentUser.role) ? (REGIONAL_HIERARCHY[formData.region] || []).map(stat => <option key={stat} value={stat}>{stat}</option>) : <option value={currentUser.station}>{currentUser.station}</option>}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">Date of Record *</label>
                        <input type="date" name="date" value={formData.date} onChange={handleInputChange} disabled={operation === 'update'} required className="w-full text-sm border-gray-300 rounded-md shadow-sm border bg-white p-2 disabled:bg-gray-100 disabled:text-gray-500" />
                      </div>
                    </div>
                  </div> 
                  <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                    <h4 className="text-sm font-bold text-blue-900 border-b border-blue-200 pb-2 mb-4 flex items-center">📊 Enter Weekly Metric Aggregates (8 Fields)</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-white p-2 rounded border border-gray-200 shadow-sm"><label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1">Suspects Arrested</label><input type="number" name="arrested" min="0" value={formData.arrested} onChange={handleInputChange} className="w-full text-lg font-bold text-blue-700 border-b-2 border-transparent focus:border-blue-500 outline-none p-1 bg-transparent" /></div>
                      <div className="bg-white p-2 rounded border border-gray-200 shadow-sm"><label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1">Given Bond</label><input type="number" name="given_bond" min="0" value={formData.given_bond} onChange={handleInputChange} className="w-full text-lg font-bold text-blue-700 border-b-2 border-transparent focus:border-blue-500 outline-none p-1 bg-transparent" /></div>
                      <div className="bg-white p-2 rounded border border-gray-200 shadow-sm"><label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1">Cautioned</label><input type="number" name="cautioned" min="0" value={formData.cautioned} onChange={handleInputChange} className="w-full text-lg font-bold text-blue-700 border-b-2 border-transparent focus:border-blue-500 outline-none p-1 bg-transparent" /></div>
                      <div className="bg-white p-2 rounded border border-gray-200 shadow-sm"><label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1">Pending Court</label><input type="number" name="pending_court" min="0" value={formData.pending_court} onChange={handleInputChange} className="w-full text-lg font-bold text-yellow-600 border-b-2 border-transparent focus:border-yellow-500 outline-none p-1 bg-transparent" /></div>
                      <div className="bg-white p-2 rounded border border-gray-200 shadow-sm"><label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1">Taken to Court</label><input type="number" name="taken_to_court" min="0" value={formData.taken_to_court} onChange={handleInputChange} className="w-full text-lg font-bold text-blue-600 border-b-2 border-transparent focus:border-blue-500 outline-none p-1 bg-transparent" /></div>
                      <div className="bg-white p-2 rounded border border-gray-200 shadow-sm"><label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1">Released by Court</label><input type="number" name="released" min="0" value={formData.released} onChange={handleInputChange} className="w-full text-lg font-bold text-green-600 border-b-2 border-transparent focus:border-green-500 outline-none p-1 bg-transparent" /></div>
                      <div className="bg-white p-2 rounded border border-gray-200 shadow-sm"><label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1">Suspects Remanded</label><input type="number" name="remanded" min="0" value={formData.remanded} onChange={handleInputChange} className="w-full text-lg font-bold text-red-600 border-b-2 border-transparent focus:border-red-500 outline-none p-1 bg-transparent" /></div>
                      <div className="bg-white p-2 rounded border border-gray-200 shadow-sm"><label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1">Suspects Convicted</label><input type="number" name="convicted" min="0" value={formData.convicted} onChange={handleInputChange} className="w-full text-lg font-bold text-purple-600 border-b-2 border-transparent focus:border-purple-500 outline-none p-1 bg-transparent" /></div>
                    </div>
                  </div>
                  <button type="submit" className="w-full bg-blue-700 hover:bg-blue-800 transition-colors text-white mt-4 py-4 font-bold rounded-lg shadow text-lg flex justify-center items-center">
                    {operation === 'new' ? '💾 Submit 8-Field Data Entry' : '💾 Save Updated Figures'}
                  </button>
                </form>
              </div>
            </div>
          </div>
          
          <div className="lg:col-span-8 space-y-4">
            <div className="bg-white/80 backdrop-blur p-4 rounded-xl border border-slate-200 shadow-sm relative">
              <div className="absolute top-4 right-4 z-10">
                <select value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className="border-2 border-blue-500 text-blue-700 font-bold rounded-lg px-3 py-1 text-xs shadow-sm bg-white outline-none cursor-pointer">
                  <option value="ALL TIME">ALL TIME</option><option value="TODAY">TODAY ONLY</option><option value="LAST 7 DAYS">LAST 7 DAYS</option>
                  <option value="LAST 30 DAYS">LAST 30 DAYS</option><option value="LAST 90 DAYS">LAST 90 DAYS</option><option value="LAST 120 DAYS">LAST 120 DAYS</option>
                </select>
              </div>
              <h4 className="text-sm font-bold text-slate-400 mb-3 uppercase tracking-wider">📋 Area Metrics ({filterRegion} - {dateFilter})</h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
                <MetricCard title="Arrested" value={totals.arrested} colorClass="text-blue-700" />
                <MetricCard title="Given Bond" value={totals.given_bond} colorClass="text-indigo-600" />
                <MetricCard title="Cautioned" value={totals.cautioned} colorClass="text-gray-600" />
                <MetricCard title="Pending Court" value={totals.pending_court} colorClass="text-yellow-600" />
                <MetricCard title="To Court" value={totals.taken_to_court} colorClass="text-blue-500" />
                <MetricCard title="Released" value={totals.released} colorClass="text-green-600" />
                <MetricCard title="Remanded" value={totals.remanded} colorClass="text-red-600" />
                <MetricCard title="Convicted" value={totals.convicted} colorClass="text-purple-600" />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <select value={filterRegion} onChange={(e) => { setFilterRegion(e.target.value); setFilterStation('ALL STATIONS'); }} disabled={!(['ADMIN', 'SUPER_ADMIN', 'RPC', 'Deputy Commander'].includes(currentUser?.role) || currentUser?.permissions?.view_global_roster)} className="border rounded-lg px-3 py-2 text-sm shadow-sm bg-white disabled:bg-gray-100 disabled:text-gray-500 w-full sm:w-auto outline-none focus:border-blue-500">
                {['ADMIN', 'SUPER_ADMIN', 'RPC', 'Deputy Commander'].includes(currentUser?.role) || currentUser?.permissions?.view_global_roster ? (
                  <><option value="ALL REGIONS">ALL REGIONS</option>{Object.keys(REGIONAL_HIERARCHY).map(reg => <option key={reg} value={reg}>{reg}</option>)}</>
                ) : <option value={currentUser?.region}>{currentUser?.region}</option>}
              </select>
              <select value={filterStation} onChange={(e) => setFilterStation(e.target.value)} disabled={!(['ADMIN', 'SUPER_ADMIN', 'RPC', 'Deputy Commander'].includes(currentUser?.role) || currentUser?.permissions?.view_global_roster)} className="border rounded-lg px-3 py-2 text-sm shadow-sm bg-white disabled:bg-gray-100 disabled:text-gray-500 w-full sm:w-auto outline-none focus:border-blue-500">
                {['ADMIN', 'SUPER_ADMIN', 'RPC', 'Deputy Commander'].includes(currentUser?.role) || currentUser?.permissions?.view_global_roster ? (
                  <><option value="ALL STATIONS">ALL STATIONS</option>{filterRegion !== 'ALL REGIONS' && REGIONAL_HIERARCHY[filterRegion] ? REGIONAL_HIERARCHY[filterRegion].map(stat => <option key={stat} value={stat}>{stat}</option>) : null}</>
                ) : <option value={currentUser?.station}>{currentUser?.station}</option>}
              </select>
            </div>

            <ExpandableTableCard title="Weekly Metrics Breakdown Ledger" onToggle={(expanded) => { if (setSidebarOpen) setSidebarOpen(!expanded); }}>
              <div className="overflow-x-auto w-full">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider leading-tight">S/N</th>
                      <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider leading-tight">Date</th>
                      <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider leading-tight">Division</th>
                      <th className="px-2 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider leading-tight">Suspects<br/>arrested</th>
                      <th className="px-2 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider leading-tight">Given<br/>Bond</th>
                      <th className="px-2 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider leading-tight">Cautioned</th>
                      <th className="px-2 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider leading-tight">Pending<br/>Court</th>
                      <th className="px-2 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider leading-tight">Taken to<br/>Court</th>
                      <th className="px-2 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider leading-tight">Released<br/>by court</th>
                      <th className="px-2 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider leading-tight">Suspects<br/>remanded</th>
                      <th className="px-2 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider leading-tight">Suspects<br/>convicted</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredStats.map((stat) => (
                      <tr key={stat.id || stat.sn} className="even:bg-slate-50 hover:bg-blue-50 transition-colors cursor-pointer" onClick={() => { if(operation === 'update') populateUpdateForm(stat); }}>
                        <td className="px-3 py-3 whitespace-nowrap text-xs font-bold text-gray-900">{stat.id || stat.sn}</td>
                        <td className="px-3 py-3 whitespace-nowrap text-xs text-gray-500">{stat.date}</td>
                        <td className="px-3 py-3 whitespace-nowrap text-xs font-medium text-blue-700">{stat.station}</td>
                        <td className="px-2 py-3 whitespace-nowrap text-xs text-center font-bold text-gray-700">{stat.arrested}</td>
                        <td className="px-2 py-3 whitespace-nowrap text-xs text-center font-bold text-gray-700">{stat.given_bond}</td>
                        <td className="px-2 py-3 whitespace-nowrap text-xs text-center font-bold text-gray-700">{stat.cautioned}</td>
                        <td className="px-2 py-3 whitespace-nowrap text-xs text-center font-bold text-yellow-600">{stat.pending_court}</td>
                        <td className="px-2 py-3 whitespace-nowrap text-xs text-center font-bold text-blue-600">{stat.taken_to_court}</td>
                        <td className="px-2 py-3 whitespace-nowrap text-xs text-center font-bold text-green-600">{stat.released}</td>
                        <td className="px-2 py-3 whitespace-nowrap text-xs text-center font-bold text-red-600">{stat.remanded}</td>
                        <td className="px-2 py-3 whitespace-nowrap text-xs text-center font-bold text-purple-600">{stat.convicted}</td>
                      </tr>
                    ))}
                    {filteredStats.length > 0 && (
                      <tr className="bg-slate-200 font-bold text-gray-900 border-t-2 border-slate-400">
                        <td colSpan="3" className="px-3 py-3 text-right text-xs uppercase tracking-wider">Total</td>
                        <td className="px-2 py-3 text-center text-xs text-blue-800">{totals.arrested}</td>
                        <td className="px-2 py-3 text-center text-xs text-blue-800">{totals.given_bond}</td>
                        <td className="px-2 py-3 text-center text-xs text-blue-800">{totals.cautioned}</td>
                        <td className="px-2 py-3 text-center text-xs text-blue-800">{totals.pending_court}</td>
                        <td className="px-2 py-3 text-center text-xs text-blue-800">{totals.taken_to_court}</td>
                        <td className="px-2 py-3 text-center text-xs text-blue-800">{totals.released}</td>
                        <td className="px-2 py-3 text-center text-xs text-blue-800">{totals.remanded}</td>
                        <td className="px-2 py-3 text-center text-xs text-blue-800">{totals.convicted}</td>
                      </tr>
                    )}
                    {filteredStats.length === 0 && <tr><td colSpan="11" className="text-center py-6 text-gray-500">No statistics logged for this jurisdiction.</td></tr>}
                  </tbody>
                </table>
              </div>
            </ExpandableTableCard>
          </div>
        </>
      </div>
    </div>
  );
};

const SuccessStories = ({ currentUser, stories, setStories, setSidebarOpen, reports, setSelectedCase }) => {
  const [operation, setOperation] = useState('new');
  const [filterRegion, setFilterRegion] = useState(currentUser?.role === 'SUPER_ADMIN' ? 'ALL REGIONS' : currentUser?.region || '');
  const [filterStation, setFilterStation] = useState((['SUPER_ADMIN', 'RPC', 'Deputy Commander'].includes(currentUser?.role) || currentUser?.permissions?.view_global_roster) ? 'ALL STATIONS' : currentUser?.station || '');   
  const [notification, setNotification] = useState(null);
  const [updateSearch, setUpdateSearch] = useState('');
  const [dateFilter, setDateFilter] = useState('ALL TIME');

  if (!stories) return <div className="p-4 text-gray-500">Loading mission logs...</div>;

  const getTodayString = () => new Date().toLocaleDateString('en-CA').split(',')[0].replace(/\//g, '-');

  const [formData, setFormData] = useState({
    sn: null, region: currentUser.region, station: currentUser.station || REGIONAL_HIERARCHY[currentUser?.region]?.[0] || '',
    date: getTodayString(), time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }).replace(':', '') + 'Hrs',
    narrative: '', status: 'COMPLETED / SUCCESS', updateText: '', photo_url: ''
  });

  // 🟢 Flexible helper to detect crime references regardless of case or spacing differences (e.g., sd ref vs SD Ref:)
  const findLinkedCrimeCase = (successStoryNarrative, allReports) => {
    if (!successStoryNarrative || !Array.isArray(allReports)) return null;
    
    // Matches variations like "SD Ref:", "sd ref", "CRB:", "crb", etc. followed by the reference number
    const refRegex = /(sd\s*ref|crb|def|gef|tar|cid)\s*:?\s*([A-Z0-9/\-]+)/gi;
    const matches = [...successStoryNarrative.matchAll(refRegex)];
    
    for (const match of matches) {
      const searchNum = match[2].trim().toUpperCase();
      
      const foundCase = allReports.find(r => {
        const dbRef = (r.sdRef || r.sd_ref || '').trim().toUpperCase();
        return dbRef.includes(searchNum);
      });

      if (foundCase) return foundCase;
    }
    
    return null;
  };

  const filteredStories = useMemo(() => {
    return (Array.isArray(stories) ? stories : []).filter(s => {
      if (filterRegion !== 'ALL REGIONS' && s.region !== filterRegion) return false;
      if (filterStation !== 'ALL STATIONS' && s.station !== filterStation) return false;

      if (dateFilter === 'TODAY') {
        const todayStr = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0];
        if (s.date !== todayStr) return false;
      } else if (dateFilter === 'LAST 7 DAYS') {
        const diffDays = Math.ceil(Math.abs(new Date() - new Date(s.date)) / (1000 * 60 * 60 * 24)); if (diffDays > 7) return false;
      } else if (dateFilter === 'LAST 30 DAYS') {
        const diffDays = Math.ceil(Math.abs(new Date() - new Date(s.date)) / (1000 * 60 * 60 * 24)); if (diffDays > 30) return false;
      } else if (dateFilter === 'LAST 90 DAYS') {
        const diffDays = Math.ceil(Math.abs(new Date() - new Date(s.date)) / (1000 * 60 * 60 * 24)); if (diffDays > 90) return false;
      } else if (dateFilter === 'LAST 120 DAYS') {
        const diffDays = Math.ceil(Math.abs(new Date() - new Date(s.date)) / (1000 * 60 * 60 * 24)); if (diffDays > 120) return false;
      }
      return true;
    });
  }, [stories, filterRegion, filterStation, dateFilter]);

  const availableUpdateStories = useMemo(() => {
    return (Array.isArray(stories) ? stories : []).filter(s => {
      if (!['ADMIN', 'SUPER_ADMIN'].includes(currentUser.role) && s.region !== currentUser.region) return false;
      if (updateSearch) {
        const query = updateSearch.toLowerCase();
        return s.sn.toString().includes(query) || s.narrative.toLowerCase().includes(query);
      }
      return true;
    });
  }, [stories, currentUser, updateSearch]);


  const handleInputChange = (e) => {
    const { name, value } = e.target;
    if (name === 'region') setFormData({ ...formData, region: value, station: REGIONAL_HIERARCHY[value][0] });
    else setFormData({ ...formData, [name]: value });
  };

  const handleExhibitUpload = async (e) => {
    const file = e.target.files[0];
    if (file) {
      setNotification("Uploading exhibit to secure S3 bucket...");
      const uploadData = new FormData();
      uploadData.append("file", file);
      uploadData.append("category", "scene");
      uploadData.append("case_id", formData.sn || "NEW_STORY");
      uploadData.append("narrative", formData.narrative || "Exhibit Upload");

      try {
        const response = await authFetch("/api/v1/investigation/upload/", { method: "POST", body: uploadData });
        const data = await response.json();
        if (data.full_s3_url || data.cloud_storage_path) {
          setFormData({ ...formData, photo_url: data.full_s3_url || `https://kmp-tracker-system-tu-16-06-26.s3.eu-central-1.amazonaws.com/${data.cloud_storage_path}` });
          setNotification("Exhibit uploaded to S3 successfully!");
        } else {
           throw new Error("Invalid API Response");
        }
      } catch (error) {
        console.warn("Backend unreachable, falling back to local Blob URL for UI testing.", error);
        setFormData({ ...formData, photo_url: URL.createObjectURL(file) });
        setNotification("Note: API offline. Using temporary local preview.");
      }
    }
  };

  const handleOperationToggle = (op) => {
    setOperation(op); setNotification(null);
    if (op === 'new') {
      setFormData({
        sn: null, region: currentUser.region, station: currentUser.station || REGIONAL_HIERARCHY[currentUser?.region]?.[0] || '',
        date: getTodayString(), time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }).replace(':', '') + 'Hrs',
        narrative: '', status: 'COMPLETED / SUCCESS', updateText: '', photo_url: ''
      });
      setUpdateSearch('');
    }
  };

  const populateUpdateForm = (storyData) => setFormData({ ...storyData, updateText: '' });

  const handleFormSubmit = (e) => {
    e.preventDefault();

    if (operation === 'new') {
      const cleanNewText = formData.narrative.replace(/<[^>]*>?/gm, '').trim().toLowerCase();
      const isDuplicate = stories.some(s => s.narrative.replace(/<[^>]*>?/gm, '').trim().toLowerCase() === cleanNewText);

      if (isDuplicate) return setNotification("Error: This exact success story has already been submitted to the ledger.");

      const exactNextSN = (stories && stories.length > 0) ? Math.max(...stories.map(s => s.sn)) + 1 : 1;
      const newStory = { ...formData, sn: exactNextSN, last_updated_by: `${currentUser.name} (${currentUser.fnum})` };
      delete newStory.updateText;
      
      authFetch("/api/v1/stories", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newStory)
      }).catch(err => console.error("Cloud sync failed:", err));

      setStories([newStory, ...stories]);
      setNotification(`Success story SN ${newStory.sn} logged successfully!`);
      
    } else if (operation === 'update') {
      if (!formData.sn) return setNotification("Error: Please select a story from the list to update first.");

      const updatedNarrative = formData.updateText 
        ? `${formData.narrative}\n<br/><br/><strong>[UPDATE ${new Date().toISOString().slice(0,16).replace('T', ' ')}]:</strong><br/>${formData.updateText}` 
        : formData.narrative;
        
      const updatedRecord = { ...formData, narrative: updatedNarrative, last_updated_by: `${currentUser.name} (${currentUser.fnum})` };
      delete updatedRecord.updateText;

      authFetch(`/api/v1/stories/${formData.sn}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updatedRecord)
      }).catch(err => console.error("Cloud sync failed:", err));

      setStories((stories || []).map(s => s.sn === formData.sn ? updatedRecord : s));
      setNotification(`Success story SN ${formData.sn} successfully updated!`);
    }

    setTimeout(() => setNotification(null), 4000);
    if (operation === 'new') setFormData({ ...formData, time: '', narrative: '', sn: null, updateText: '', photo_url: '' });
  };

  return (
    <div className="p-3 sm:p-6 max-w-[1600px] mx-auto space-y-6 relative z-10">
      <div className="text-center mb-8 flex flex-col items-center">
        <img src="/upf_badge.png" alt="UPF Logo" className="w-16 h-16 mb-3 object-contain contrast-200 brightness-75 drop-shadow-sm" onError={(e) => { e.target.style.display = 'none'; }}/>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-700 tracking-tight">Operational Success Stories</h1>
        <h3 className="text-sm sm:text-lg text-amber-500 mt-2 font-medium">Highlighting UPF Anti-Crime Milestones</h3>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-5 space-y-6">
              <div className="flex space-x-2 bg-gray-100 p-1 rounded-lg">
                <button type="button" onClick={() => handleOperationToggle('new')} className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${operation === 'new' ? 'bg-white shadow text-yellow-600' : 'text-gray-600 hover:text-gray-900'}`}><PlusCircle className="w-4 h-4 inline mr-1" /> Register New</button>
                <button type="button" onClick={() => handleOperationToggle('update')} className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${operation === 'update' ? 'bg-green shadow text-white' : 'text-gray-600 hover:text-gray-900'}`}><Edit className="w-4 h-4 inline mr-1" /> Update Existing</button>
              </div>

              {notification && <div className={`border px-4 py-3 rounded-lg flex items-center mb-4 ${notification.includes('Error') ? 'bg-red-50 border-red-200 text-red-800' : 'bg-green-50 border-green-200 text-green-800'}`}>{notification.includes('Error') ? <AlertTriangle className="w-5 h-5 mr-2 text-red-500 shrink-0" /> : <CheckCircle className="w-5 h-5 mr-2 text-green-500 shrink-0" />}<span className="text-sm font-medium">{notification}</span></div>}

              {operation === 'update' && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                  <label className="block text-xs font-bold text-yellow-800 mb-2">🔍 Search & Select Story to Update</label>
                  <input type="text" placeholder="Search by SN or Narrative..." value={updateSearch} onChange={e => setUpdateSearch(e.target.value)} className="w-full text-sm p-2 mb-2 border border-yellow-200 rounded outline-none focus:ring-2 focus:ring-yellow-400" />
                  <div className="max-h-40 overflow-y-auto bg-white border border-yellow-100 rounded custom-scrollbar">
                    {availableUpdateStories.length === 0 ? <div className="p-3 text-xs text-gray-500 text-center">No success stories found matching your search.</div> : availableUpdateStories?.map(s => (
                        <div key={s.sn} onClick={() => populateUpdateForm(s)} className={`p-2 text-xs border-b cursor-pointer transition-colors ${formData.sn === s.sn ? 'bg-yellow-500 text-white font-bold' : 'hover:bg-yellow-50 text-gray-700'}`}>
                          <span className={formData.sn === s.sn ? 'text-yellow-100' : 'text-gray-400'}>SN: {s.sn}</span> | <span className={formData.sn === s.sn ? 'text-white' : 'font-bold text-yellow-700'}>{s.date}</span> | {s.station}
                        </div>
                      ))}
                  </div>
                </div>
              )}

              <form onSubmit={handleFormSubmit} className="space-y-4">
                {operation === 'update' && formData.sn && <div className="bg-slate-800 text-white text-xs font-bold px-3 py-2 rounded">Currently Editing: SN {formData.sn}</div>}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Select Region *</label>
                    <select name="region" value={formData.region} onChange={handleInputChange} disabled={!(currentUser.role === 'SUPER_ADMIN' || currentUser.permissions?.view_global_roster) || operation === 'update'} required className="w-full text-sm border-gray-300 rounded-md shadow-sm bg-gray-50 border p-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500">
                      {['ADMIN', 'SUPER_ADMIN'].includes(currentUser.role) ? Object.keys(REGIONAL_HIERARCHY).map(reg => <option key={reg} value={reg}>{reg}</option>) : <option value={currentUser.region}>{currentUser.region}</option>}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Station *</label>
                    <select name="station" value={formData.station} onChange={handleInputChange}disabled={!(['SUPER_ADMIN', 'RPC', 'Deputy Commander'].includes(currentUser.role) || currentUser.permissions?.view_global_roster) || operation === 'update'} required className="w-full text-sm border-gray-300 rounded-md shadow-sm bg-gray-50 border p-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500">
                      {operation === 'update' ? <option value={formData.station}>{formData.station}</option> : ['ADMIN', 'SUPER_ADMIN', 'RPC', 'Deputy Commander'].includes(currentUser.role) ? (REGIONAL_HIERARCHY[formData.region] || []).map(stat => <option key={stat} value={stat}>{stat}</option>) : <option value={currentUser.station}>{currentUser.station}</option>}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Date Accomplished</label>
                    <input type="date" name="date" value={formData.date} onChange={handleInputChange} disabled={operation === 'update'} required className="w-full text-sm border-gray-300 rounded-md shadow-sm border p-2 disabled:bg-gray-100 disabled:text-gray-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Time</label>
                    <input type="text" name="time" value={formData.time} onChange={handleInputChange} disabled={operation === 'update'} placeholder="1400Hrs" className="w-full text-sm border-gray-300 rounded-md shadow-sm border p-2 disabled:bg-gray-100 disabled:text-gray-500" />
                  </div>
                </div>

                <div className="pb-8"> 
                  <label className="block text-xs font-bold text-gray-700 mb-1">{operation === 'update' ? 'Original Narrative (Read-Only)' : 'Success Report Narrative'}</label>
                  <ReactQuill theme="snow" value={formData.narrative} onChange={(content) => setFormData({ ...formData, narrative: autoCapitalize(content) })} readOnly={operation === 'update'} className={`bg-white rounded-md ${operation === 'update' ? 'opacity-70 grayscale pointer-events-none' : ''}`} modules={{ toolbar: [['bold', 'italic', 'underline'], [{ 'list': 'ordered'}, { 'list': 'bullet' }], ['clean']] }} />
                </div>

                {operation === 'new' && (
                  <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                    <label className="block text-xs font-bold text-gray-700 mb-2 flex items-center"><Image size={14} className="mr-1"/> Attach Exhibit / Scene Photo (Optional)</label>
                    <div className="flex items-center space-x-4">
                      <input type="file" accept="image/*" onChange={handleExhibitUpload} className="text-xs w-full text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-xs file:font-bold file:bg-yellow-50 file:text-yellow-700 hover:file:bg-yellow-100" />
                    </div>
                    {formData.photo_url && (
                      <div className="mt-3">
                        <img src={formData.photo_url} alt="Exhibit preview" className="h-24 w-auto object-cover rounded-md border border-gray-300 shadow-sm" />
                      </div>
                    )}
                  </div>
                )}

                {operation === 'update' && (
                  <div className="pb-8 mt-4"> 
                    <label className="block text-xs font-bold text-yellow-700 mb-1">Append New Update / Progress *</label>
                    <ReactQuill theme="snow" value={formData.updateText || ''} onChange={(content) => setFormData({ ...formData, updateText: autoCapitalize(content) })} className="bg-white rounded-md border-yellow-300" placeholder="Enter new progress or updates here. Use the toolbar for numbering..." modules={{ toolbar: [['bold', 'italic', 'underline'], [{ 'list': 'ordered'}, { 'list': 'bullet' }], ['clean']] }} />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Status</label>
                  <select name="status" value={formData.status} onChange={handleInputChange} className="w-full text-sm border-gray-300 rounded-md shadow-sm bg-gray-50 border p-2">
                    <option>COMPLETED / SUCCESS</option><option>ONGOING / EXPLOITATION</option><option>IN PROGRESS</option>
                  </select>
                </div>

                <button type="submit" className="w-full bg-slate-900 hover:bg-black text-white font-bold py-3 px-4 rounded-lg shadow transition-colors flex justify-center items-center">
                   {operation === 'new' ? 'Submit Achievement' : '💾 Save Achievement Updates'}
                </button>
              </form>
            </div>
          </div>
        </div>

        <div className="lg:col-span-7 space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <select value={filterRegion} onChange={(e) => { setFilterRegion(e.target.value); setFilterStation('ALL STATIONS'); }} disabled={!(['ADMIN', 'SUPER_ADMIN', 'RPC', 'Deputy Commander'].includes(currentUser?.role) || currentUser?.permissions?.view_global_roster)} className="border rounded-lg px-3 py-2 text-sm shadow-sm bg-white disabled:bg-gray-100 disabled:text-gray-500 w-full sm:w-auto outline-none focus:border-blue-500">
              {['ADMIN', 'SUPER_ADMIN', 'RPC', 'Deputy Commander'].includes(currentUser?.role) || currentUser?.permissions?.view_global_roster ? (
                <><option value="ALL REGIONS">ALL REGIONS</option>{Object.keys(REGIONAL_HIERARCHY).map(reg => <option key={reg} value={reg}>{reg}</option>)}</>
              ) : <option value={currentUser?.region}>{currentUser?.region}</option>}
            </select>
            <select value={filterStation} onChange={(e) => setFilterStation(e.target.value)} disabled={!(['ADMIN', 'SUPER_ADMIN', 'RPC', 'Deputy Commander'].includes(currentUser?.role) || currentUser?.permissions?.view_global_roster)} className="border rounded-lg px-3 py-2 text-sm shadow-sm bg-white disabled:bg-gray-100 disabled:text-gray-500 w-full sm:w-auto outline-none focus:border-blue-500">
              {['ADMIN', 'SUPER_ADMIN', 'RPC', 'Deputy Commander'].includes(currentUser?.role) || currentUser?.permissions?.view_global_roster ? (
                <><option value="ALL STATIONS">ALL STATIONS</option>{filterRegion !== 'ALL REGIONS' && REGIONAL_HIERARCHY[filterRegion] ? REGIONAL_HIERARCHY[filterRegion].map(stat => <option key={stat} value={stat}>{stat}</option>) : null}</>
              ) : <option value={currentUser?.station}>{currentUser?.station}</option>}
            </select>
            <select value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className="border-2 border-blue-500 text-blue-700 font-bold rounded-lg px-3 py-2 text-sm shadow-sm bg-white outline-none w-full sm:w-auto">
              <option value="ALL TIME">ALL TIME</option><option value="TODAY">TODAY ONLY</option><option value="LAST 7 DAYS">LAST 7 DAYS</option>
              <option value="LAST 30 DAYS">LAST 30 DAYS</option><option value="LAST 90 DAYS">LAST 90 DAYS</option><option value="LAST 120 DAYS">LAST 120 DAYS</option>
            </select>
          </div>
          
<ExpandableTableCard title="Achievements Overview Ledger" onToggle={(expanded) => { if (setSidebarOpen) setSidebarOpen(!expanded); }}>
            <div className="overflow-x-auto w-full">
              <table className="w-full divide-y divide-gray-200 min-w-[950px]">
                <thead className="bg-gray-50 sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider w-16">SN</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider w-32">Date & Time</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-800 uppercase tracking-wider w-40">Region/Station</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Narrative / Progress</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider w-36">Last Updated By</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider w-32">Status</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredStories?.map((story) => {
                    const linkedCase = findLinkedCrimeCase(story.narrative, reports);
                    return (
                      <tr key={story.sn} className="hover:bg-yellow-50 transition-colors cursor-pointer" onClick={() => { if(operation === 'update') populateUpdateForm(story); }}>
                        <td className="px-4 py-4 whitespace-nowrap text-sm font-bold text-gray-900 align-top">{story.sn}</td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 align-top">{story.date}<br/><span className="text-xs text-gray-400">{story.time}</span></td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-blue-700 align-top">{story.station}<br/><span className="text-xs text-gray-400">{story.region}</span></td>
                        <td className="px-4 py-4 text-sm text-gray-600 align-top whitespace-pre-wrap break-words overflow-hidden leading-relaxed">
                          <div className="ql-editor p-0" dangerouslySetInnerHTML={{ __html: story.narrative }} />
                          
                          {/* 🟢 Render Linked Crime Case Banner if found */}
                          {linkedCase && (
                            <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between" onClick={(e) => e.stopPropagation()}>
                              <div>
                                <span className="text-[10px] font-extrabold text-blue-800 uppercase tracking-wider block">🔗 Traceable Prior Crime Record Found:</span>
                                <span className="text-xs font-black text-blue-900">{linkedCase.sdRef || linkedCase.sd_ref} — {linkedCase.offence}</span>
                              </div>
                              <button 
                                onClick={() => setSelectedCase(linkedCase)}
                                className="px-3 py-1 bg-blue-700 hover:bg-blue-800 text-white rounded font-bold text-xs shadow-xs transition"
                              >
                                View Dossier
                              </button>
                            </div>
                          )}

                          {story.photo_url && (
                            <div className="mt-4 border rounded-xl overflow-hidden max-w-md bg-slate-50 flex justify-center items-center p-1 shadow-sm">
                              <img 
                                src={story.photo_url} 
                                alt={`Exploit SN ${story.sn}`} 
                                className="w-full h-auto object-contain max-h-96 rounded-lg" 
                                onError={(e) => { e.target.style.display = 'none'; }} 
                              />
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-xs text-slate-500 font-medium align-top">{story.last_updated_by || "System Genesis"}</td>
                        <td className="px-4 py-4 whitespace-nowrap align-top">
                          <span className={`px-2 inline-flex text-xs leading-5 font-bold rounded-full ${story.status?.includes('COMPLETED') ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>{story.status}</span>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredStories.length === 0 && (
                    <tr>
                      <td colSpan="6" className="text-center py-6 text-gray-500">
                        No success stories logged for this jurisdiction.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </ExpandableTableCard>
        </div>
      </div>
    </div>
  );
};



const Establishments = ({ currentUser, establishments, setEstablishments, setSidebarOpen }) => {
  const [operation, setOperation] = useState('new');
  const [notification, setNotification] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [filterRegion, setFilterRegion] = useState(currentUser?.role === 'SUPER_ADMIN' ? 'ALL REGIONS' : currentUser?.region || '');
  const [filterStation, setFilterStation] = useState((['SUPER_ADMIN', 'RPC', 'Deputy Commander'].includes(currentUser?.role) || currentUser?.permissions?.view_global_roster) ? 'ALL STATIONS' : currentUser?.station || '');
  const [updateSearch, setUpdateSearch] = useState('');

  const [formData, setFormData] = useState({
    id: null, region: currentUser.region, division: currentUser.division || '', station: currentUser.station || REGIONAL_HIERARCHY[currentUser?.region]?.[0] || '',
    personnel_in_station: 0, sub_station: '', personnel_in_sub_station: 0, post: '', personnel_in_post: 0,
    booths: 0, location: '', personnel_in_booth: 0, installed_by: '', status: 'OPERATIONAL', comment: ''
  });

  const filteredEstablishments = useMemo(() => {
    return (Array.isArray(establishments) ? establishments : []).filter(e => {
      if (filterRegion !== 'ALL REGIONS' && e.region !== filterRegion) return false;
      if (filterStation !== 'ALL STATIONS' && e.station !== filterStation) return false;
      return true;
    });
  }, [establishments, filterRegion, filterStation]);

  const availableUpdateEstablishments = useMemo(() => {
    return (Array.isArray(establishments) ? establishments : []).filter(e => {
      if (!['ADMIN', 'SUPER_ADMIN'].includes(currentUser.role) && e.region !== currentUser.region) return false;
      if (updateSearch) {
        const query = updateSearch.toLowerCase();
        return e.sn?.toString().includes(query) || (e.sub_station && e.sub_station.toLowerCase().includes(query)) || (e.post && e.post.toLowerCase().includes(query)) || (e.location && e.location.toLowerCase().includes(query));
      }
      return true;
    });
  }, [establishments, currentUser, updateSearch]);

  const handleInputChange = (e) => {
    const { name, value, type } = e.target;
    if (name === 'region') setFormData({ ...formData, region: value, division: REGIONAL_HIERARCHY[value]?.[0] || '', station: REGIONAL_HIERARCHY[value]?.[0] || '' });
    else if (name === 'division') setFormData({ ...formData, division: value, station: value });
    else setFormData({ ...formData, [name]: type === 'number' ? parseInt(value) || 0 : value });
  };

  const handleOperationToggle = (op) => {
    setOperation(op); setNotification(null);
    if (op === 'new') {
      setFormData({
        id: null, region: currentUser.region, division: currentUser.division || '', station: currentUser.station || REGIONAL_HIERARCHY[currentUser?.region]?.[0] || '', 
        personnel_in_station: 0, sub_station: '', personnel_in_sub_station: 0, post: '', personnel_in_post: 0, 
        booths: 0, location: '', personnel_in_booth: 0, installed_by: '', status: 'OPERATIONAL', comment: ''
      });
      setUpdateSearch('');
    }
  };

  const populateUpdateForm = (data) => setFormData({ ...data, division: data.division || '' });

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    const requiredFields = ['region', 'division', 'station', 'location'];
    if (requiredFields.some(field => !formData[field] || String(formData[field]).trim() === '')) return setNotification("Error: All required fields must be filled.");

    const isDuplicate = establishments.some(e => e.region === formData.region && e.station === formData.station && e.division === formData.division && e.id !== formData.id);
    if (isDuplicate && operation === 'new') return setNotification("Error: An entry for this station already exists.");

    setIsSubmitting(true); 
    const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
    const token = localStorage.getItem('kmp_authToken');

    if (operation === 'new') {
      const newEntry = { ...formData, last_updated_by: `${currentUser.name} (${currentUser.fnum})` };
      delete newEntry.sn; delete newEntry.id;
      
      try {
        const response = await fetch(`${API_URL}/api/v1/establishments`, {
          method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }, body: JSON.stringify(newEntry)
        });

        if (!response.ok) throw new Error("Failed to post record");
        const savedData = await response.json();
        setEstablishments([savedData, ...establishments]); setNotification(`Establishment recorded for ${formData.station}!`);
        setFormData({ ...formData, division:'', station:'', personnel_in_station:0, sub_station: '', personnel_in_sub_station: 0, post: '', personnel_in_post: 0, booths: 0, location: '', personnel_in_booth: 0, installed_by: '', comment: '', id: null });
      } catch (err) { setNotification("Error: Server rejected the data. Please check connection."); } finally { setIsSubmitting(false); }
      
    } else if (operation === 'update') {
      if (!formData.id) { setNotification("Error: Please select a record from the list to update first."); setIsSubmitting(false); return; }
      const updatedRecord = { ...formData, last_updated_by: `${currentUser.name} (${currentUser.fnum})` };

      try {
        const response = await authFetch(`/api/v1/establishments/${formData.id}`, {
          method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updatedRecord)
        });

        if (!response.ok) throw new Error("Failed to update record in database.");
        setEstablishments(establishments.map(e => e.id === formData.id ? updatedRecord : e));
        setNotification(`Establishment ID ${formData.id} successfully updated!`);
        handleOperationToggle('new');
      } catch (err) { setNotification("❌ Error: Could not update the record in the database."); } finally { setIsSubmitting(false); }
    }
    
    setTimeout(() => setNotification(null), 4000);
  };

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6 relative z-10">
      <div className="text-center mb-8 flex flex-col items-center">
        <img src="/upf_badge.png" alt="UPF Logo" className="w-16 h-16 mb-3 object-contain contrast-200 brightness-75 drop-shadow-sm" onError={(e) => { e.target.style.display = 'none'; }} />
        <h1 className="text-3xl font-extrabold text-gray-700 tracking-tight">Regional Establishments</h1>
        <h3 className="text-lg text-green-500 mt-2 font-medium">Divisions, Stations, Posts, Booths and Man-power Strength</h3>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <>
          {/* LEFT COLUMN: FORM & CONTROLS */}
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="bg-slate-900 px-4 py-3 border-b border-gray-200 flex justify-between items-center">
                <h3 className="text-white font-semibold flex items-center">⚙️ Log Establishment</h3>
              </div>
              <div className="p-5 space-y-6">
                <div className="flex space-x-2 bg-gray-100 p-1 rounded-lg">
                  <button type="button" onClick={() => handleOperationToggle('new')} className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${operation === 'new' ? 'bg-white shadow text-blue-700' : 'text-gray-600 hover:text-gray-900'}`}>
                    Register New
                  </button>
                  <button type="button" onClick={() => handleOperationToggle('update')} className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${operation === 'update' ? 'bg-white shadow text-blue-700' : 'text-gray-600 hover:text-gray-900'}`}>
                    Update Existing
                  </button>
                </div>

                {notification && (
                  <div className={`border px-4 py-3 rounded-lg flex items-center mb-4 ${notification.includes('Error') || notification.includes('❌') ? 'bg-red-50 border-red-200 text-red-800' : 'bg-green-50 border-green-200 text-green-800'}`}>
                    <span className="text-sm font-medium">{notification}</span>
                  </div>
                )}

                {operation === 'update' && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <label className="block text-xs font-bold text-blue-800 mb-2">🔍 Search & Select Record to Update</label>
                    <input type="text" placeholder="Search by SN, Sub-Station, Post..." value={updateSearch} onChange={e => setUpdateSearch(e.target.value)} className="w-full text-sm p-2 mb-2 border border-blue-200 rounded outline-none focus:ring-2 focus:ring-blue-400" />
                    <div className="max-h-40 overflow-y-auto bg-white border border-blue-100 rounded custom-scrollbar">
                      {availableUpdateEstablishments.length === 0 ? (
                        <div className="p-3 text-xs text-gray-500 text-center">No records found matching your search.</div>
                      ) : (
                        availableUpdateEstablishments.map(e => (
                          <div key={e.id} onClick={() => populateUpdateForm(e)} className={`p-2 text-xs border-b cursor-pointer transition-colors ${formData.id === e.id ? 'bg-blue-600 text-white font-bold' : 'hover:bg-blue-50 text-gray-700'}`}>
                            <span className={formData.id === e.id ? 'text-blue-200' : 'text-gray-400'}>SN: {e.id}</span> | <span className={formData.id === e.id ? 'text-white' : 'font-bold text-blue-700'}>{e.sub_station || e.post || e.station}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
                
                <form onSubmit={handleFormSubmit} className="space-y-4">
                  {operation === 'update' && formData.id && (
                     <div className="bg-slate-800 text-white text-xs font-bold px-3 py-2 rounded">
                       Currently Editing Record ID: {formData.id}
                     </div>
                  )}
                  
                  <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2">
                        <label className="block text-xs font-bold text-gray-700 mb-1">Select Region *</label>
                        <select name="region" value={formData.region} onChange={handleInputChange} disabled={!(currentUser.role === 'SUPER_ADMIN' || currentUser.permissions?.view_global_roster)} required className="w-full text-sm border-gray-300 rounded-md shadow-sm bg-white border p-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500">
                          {['ADMIN', 'SUPER_ADMIN'].includes(currentUser.role) ? Object.keys(REGIONAL_HIERARCHY).map(reg => <option key={reg} value={reg}>{reg}</option>) : <option value={currentUser.region}>{currentUser.region}</option>}
                        </select>
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs font-bold text-gray-700 mb-1">DIVISION (Headquarter) *</label>
                        <select name="division" value={formData.division} onChange={handleInputChange} disabled={!(['SUPER_ADMIN', 'RPC', 'Deputy Commander'].includes(currentUser.role) || currentUser.permissions?.view_global_roster)} required className="w-full text-sm border-gray-300 rounded-md shadow-sm bg-white border p-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500">
                          {['ADMIN', 'SUPER_ADMIN', 'RPC', 'Deputy Commander'].includes(currentUser.role) ? (
                            formData.region && REGIONAL_HIERARCHY[formData.region] ? REGIONAL_HIERARCHY[formData.region].map(stat => <option key={stat} value={stat}>{stat}</option>) : <option value="">Select Region First</option>
                          ) : (
                            <option value={currentUser.station || currentUser.division}>{currentUser.station || currentUser.division}</option>
                          )}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2">
                        <label className="block text-xs font-bold text-gray-700 mb-1">STATION</label>
                        <input type="text" name="station" value={formData.station} onChange={handleInputChange} className="w-full text-sm border-gray-300 rounded-md shadow-sm border p-2 focus:ring-blue-500" placeholder="Name of Station" />
                      </div>
                      <div className="col-span-2"> 
                        <label className="block text-xs font-bold text-gray-700 mb-1">PERSONNEL IN STATION</label> 
                        <input type="number" name="personnel_in_station" min="0" value={formData.personnel_in_station} onChange={handleInputChange} className="w-full text-sm border-gray-300 rounded-md shadow-sm border p-2 focus:ring-blue-500" />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs font-bold text-gray-700 mb-1">SUB-STATION</label>
                        <input type="text" name="sub_station" value={formData.sub_station} onChange={handleInputChange} className="w-full text-sm border-gray-300 rounded-md shadow-sm border p-2 focus:ring-blue-500" placeholder="Name of Sub-Station" />
                      </div>  
                      <div className="col-span-2">
                        <label className="block text-xs font-bold text-gray-700 mb-1">PERSONNEL IN SUB STATION</label>
                        <input type="number" name="personnel_in_sub_station" min="0" value={formData.personnel_in_sub_station} onChange={handleInputChange} className="w-full text-sm border-gray-300 rounded-md shadow-sm border p-2 focus:ring-blue-500" />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">POST</label>
                        <input type="text" name="post" value={formData.post} onChange={handleInputChange} className="w-full text-sm border-gray-300 rounded-md shadow-sm border p-2 focus:ring-blue-500" placeholder="Name of Post" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">PERSONNEL (POST)</label>
                        <input type="number" name="personnel_in_post" min="0" value={formData.personnel_in_post} onChange={handleInputChange} className="w-full text-sm border-gray-300 rounded-md shadow-sm border p-2 focus:ring-blue-500" />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">BOOTHS</label>
                        <input type="number" name="booths" min="0" value={formData.booths} onChange={handleInputChange} className="w-full text-sm border-gray-300 rounded-md shadow-sm border p-2 focus:ring-blue-500" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">PERSONNEL (BOOTH)</label>
                        <input type="number" name="personnel_in_booth" min="0" value={formData.personnel_in_booth} onChange={handleInputChange} className="w-full text-sm border-gray-300 rounded-md shadow-sm border p-2 focus:ring-blue-500" />
                      </div>

                      <div className="col-span-2">
                        <label className="block text-xs font-bold text-gray-700 mb-1">LOCATION (Address/Area)</label>
                        <input type="text" name="location" value={formData.location} onChange={handleInputChange} className="w-full text-sm border-gray-300 rounded-md shadow-sm border p-2 focus:ring-blue-500" placeholder="Detailed location..." />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs font-bold text-gray-700 mb-1">INSTALLED BY</label>
                        <input type="text" name="installed_by" value={formData.installed_by} onChange={handleInputChange} className="w-full text-sm border-gray-300 rounded-md shadow-sm border p-2 focus:ring-blue-500" placeholder="Organization or Individual" />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs font-bold text-gray-700 mb-1">STATUS</label>
                        <select name="status" value={formData.status} onChange={handleInputChange} className="w-full text-sm border-gray-300 rounded-md shadow-sm bg-gray-50 border p-2 focus:ring-blue-500">
                          <option value="OPERATIONAL">OPERATIONAL</option>
                          <option value="UNDER MAINTENANCE">UNDER MAINTENANCE</option>
                          <option value="NON-OPERATIONAL">NON-OPERATIONAL</option>
                          <option value="DECOMMISSIONED">DECOMMISSIONED</option>
                          <option value="TO BE COMMISSIONED">TO BE COMMISSIONED</option>  
                        </select>
                      </div>
                      <div className="col-span-2 pb-8">
                        <label className="block text-xs font-bold text-gray-700 mb-1">COMMENT ON STATUS</label>
                        <ReactQuill 
                          theme="snow" 
                          value={formData.comment || ''} 
                          onChange={(content) => setFormData({ ...formData, comment: autoCapitalize(content) })}
                          className="bg-white rounded-md"
                          modules={{ toolbar: [['bold', 'italic', 'underline'], [{ 'list': 'ordered'}, { 'list': 'bullet' }], ['clean']] }}
                        />
                      </div>
                    </div>
                  </div>

                  <button 
                    type="submit" disabled={isSubmitting}
                    className="w-full bg-blue-700 hover:bg-blue-800 transition-colors text-white mt-4 py-4 font-bold rounded-lg shadow text-lg flex justify-center items-center disabled:bg-gray-400"
                  >
                    {isSubmitting ? 'Processing...' : (operation === 'new' ? '💾 Log New Establishment' : '💾 Save Updates')}
                  </button>
                </form>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: FILTERS & TABLE */}
          <div className="lg:col-span-8 space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <select value={filterRegion} onChange={(e) => { setFilterRegion(e.target.value); setFilterStation('ALL STATIONS'); }} disabled={!(['ADMIN', 'SUPER_ADMIN', 'RPC', 'Deputy Commander'].includes(currentUser?.role) || currentUser?.permissions?.view_global_roster)} className="border rounded-lg px-3 py-2 text-sm shadow-sm bg-white disabled:bg-gray-100 disabled:text-gray-500 w-full sm:w-auto outline-none focus:border-blue-500">
                {['ADMIN', 'SUPER_ADMIN', 'RPC', 'Deputy Commander'].includes(currentUser?.role) || currentUser?.permissions?.view_global_roster ? (
                  <><option value="ALL REGIONS">ALL REGIONS</option>{Object.keys(REGIONAL_HIERARCHY).map(reg => <option key={reg} value={reg}>{reg}</option>)}</>
                ) : <option value={currentUser?.region}>{currentUser?.region}</option>}
              </select>
              <select value={filterStation} onChange={(e) => setFilterStation(e.target.value)} disabled={!(['ADMIN', 'SUPER_ADMIN', 'RPC', 'Deputy Commander'].includes(currentUser?.role) || currentUser?.permissions?.view_global_roster)} className="border rounded-lg px-3 py-2 text-sm shadow-sm bg-white disabled:bg-gray-100 disabled:text-gray-500 w-full sm:w-auto outline-none focus:border-blue-500">
                {['ADMIN', 'SUPER_ADMIN', 'RPC', 'Deputy Commander'].includes(currentUser?.role) || currentUser?.permissions?.view_global_roster ? (
                  <><option value="ALL STATIONS">ALL STATIONS</option>{filterRegion !== 'ALL REGIONS' && REGIONAL_HIERARCHY[filterRegion] ? REGIONAL_HIERARCHY[filterRegion].map(stat => <option key={stat} value={stat}>{stat}</option>) : null}</>
                ) : <option value={currentUser?.station}>{currentUser?.station}</option>}
              </select>
            </div>

            <ExpandableTableCard title="Regional Establishments Master Ledger" onToggle={(expanded) => { if (setSidebarOpen) setSidebarOpen(!expanded); }}>
              <div className="overflow-x-auto w-full">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50 sticky top-0 z-10">
                    <tr>
                      <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider leading-tight">DIVISION</th>
                      <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider leading-tight">STATION</th>
                      <th className="px-2 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider leading-tight">PERS<br/>(STN)</th>
                      <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider leading-tight">SUB-STATION</th>
                      <th className="px-2 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider leading-tight">PERS<br/>(SUB-STN)</th>
                      <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider leading-tight">POST</th>
                      <th className="px-2 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider leading-tight">PERS<br/>(POST)</th>
                      <th className="px-2 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider leading-tight">BOOTHS</th>
                      <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider leading-tight">LOCATION</th>
                      <th className="px-2 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider leading-tight">PERS<br/>(BOOTH)</th>
                      <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider leading-tight">INSTALLED BY</th>
                      <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider leading-tight">STATUS</th>
                      <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider leading-tight">COMMENT</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredEstablishments.map((est) => (
                      <tr key={est.id} className="even:bg-slate-50 hover:bg-blue-50 transition-colors cursor-pointer" onClick={() => { if(operation === 'update') populateUpdateForm(est); }}>
                        <td className="px-3 py-3 whitespace-nowrap text-xs font-bold text-gray-900">{est.division || 'N/A'}</td>
                        <td className="px-3 py-3 whitespace-nowrap text-xs font-bold text-blue-800">{est.station}</td>
                        <td className="px-2 py-3 whitespace-nowrap text-xs text-center font-bold">{est.personnel_in_station}</td> 
                        <td className="px-3 py-3 whitespace-nowrap text-xs text-gray-800">{est.sub_station || '-'}</td>
                        <td className="px-2 py-3 whitespace-nowrap text-xs text-center font-bold">{est.personnel_in_sub_station}</td>
                        <td className="px-3 py-3 whitespace-nowrap text-xs text-gray-800">{est.post || '-'}</td>
                        <td className="px-2 py-3 whitespace-nowrap text-xs text-center font-bold">{est.personnel_in_post}</td>
                        <td className="px-2 py-3 whitespace-nowrap text-xs text-center font-bold">{est.booths}</td>
                        <td className="px-3 py-3 text-xs text-gray-800 break-words max-w-[150px]">{est.location || '-'}</td>
                        <td className="px-2 py-3 whitespace-nowrap text-xs text-center font-bold">{est.personnel_in_booth}</td>
                        <td className="px-3 py-3 whitespace-nowrap text-xs text-gray-600">{est.installed_by || '-'}</td>
                        <td className="px-3 py-3 whitespace-nowrap text-xs font-bold">
                          <span className={`px-2 py-1 rounded-full text-[9px] ${est.status === 'OPERATIONAL' ? 'bg-green-100 text-green-800' : est.status.includes('MAINTENANCE') ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}`}>
                            {est.status}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-xs text-gray-500 italic max-w-[150px] break-words">
                           <div className="ql-editor p-0" dangerouslySetInnerHTML={{ __html: est.comment || '-' }} />
                        </td>
                      </tr>
                    ))}
                    {filteredEstablishments.length === 0 && <tr><td colSpan="13" className="text-center py-6 text-gray-500">No establishments logged for this jurisdiction.</td></tr>}
                  </tbody>
                </table>
              </div>
            </ExpandableTableCard>
          </div>
        </>
      </div>
    </div>
  );
};



// 🟢 Official UPF Command Seniority Weighting (Lower index = Higher rank)
const RANK_SENIORITY = {
  // Officers
  "IGP": 1,
  "DIGP": 2,
  "AIGP": 3,
  "SCP": 4,
  "CP": 5,
  "ACP": 6,
  "SSP": 7,
  "SP": 8,
  "ASP": 9,
  "IP": 10,
  "AIP": 11,
  // NCOs & Enlisted Men
  "HCM": 12,
  "HC": 13,
  "S/SGT": 14,
  "SSGT": 14,
  "SGT": 15,
  "CPL": 16,
  "L/CPL": 17,
  "LCPL": 17,
  "PC": 18,
  "SPC": 19
};

// Helper function to get rank weight (strips prefixes like D/ for Detectives)
const getRankWeight = (rankStr) => {
  if (!rankStr) return 99;
  let cleanRank = rankStr.trim().toUpperCase();
  if (cleanRank.startsWith('D/')) cleanRank = cleanRank.substring(2);
  return RANK_SENIORITY[cleanRank] !== undefined ? RANK_SENIORITY[cleanRank] : 50;
};


// 🟢 Helper function to categorize and extract qualifications and specific courses
const parseEducationLevel = (rawVal) => {
  if (!rawVal) return "UNEDUCATED / NOT SPECIFIED";
  const str = rawVal.toString().trim().toUpperCase();
  
  if (!str || str === 'NONE' || str === 'N/A' || str === 'NIL' || str === 'NO' || str === 'UNEDUCATED') {
    return "UNEDUCATED";
  }

  // --- 1. BACHELORS / DEGREES (Qualification + Specific Course) ---
  if (
    str.includes("BACHELOR") || str.includes("DEGREE") || str.includes("B.A") || 
    str.includes("B.SC") || str.includes("BSC") || str.includes("BED") || 
    str.includes("LLB") || str.includes("BIT") || str.includes("BBA")
  ) {
    let course = str
      .replace(/BACHELOR['’]?S?(\s+OF|\s+IN)?/g, '')
      .replace(/DEGREE(\s+IN)?/g, '')
      .replace(/B\.?SC\.?/g, 'SCIENCE')
      .replace(/B\.?A\.?/g, 'ARTS')
      .replace(/B\.?COM\.?/g, 'COMMERCE')
      .replace(/B\.?I\.?T\.?/g, 'INFORMATION TECHNOLOGY')
      .replace(/B\.?B\.?A\.?/g, 'BUSINESS ADMINISTRATION')
      .replace(/L\.?L\.?B\.?/g, 'LAW')
      .trim();

    return course && course !== 'SCIENCE' && course !== 'ARTS'
      ? `BACHELORS - ${course}`
      : `BACHELORS (${str})`;
  }

  // --- 2. DIPLOMAS (Qualification + Specific Course) ---
  if (str.includes("DIPLOMA") || str.includes("DIP.")) {
    let course = str
      .replace(/DIPLOMA(\s+IN)?/g, '')
      .replace(/DIP\.?/g, '')
      .trim();

    return course ? `DIPLOMA - ${course}` : `DIPLOMA (${str})`;
  }

  // --- 3. CERTIFICATES (Qualification + Specific Course) ---
  if (str.includes("CERTIFICATE") || str.includes("CERT.")) {
    let course = str
      .replace(/CERTIFICATE(\s+IN)?/g, '')
      .replace(/CERT\.?/g, '')
      .trim();

    return course ? `CERTIFICATE - ${course}` : `CERTIFICATE (${str})`;
  }

  // --- 4. VOCATIONAL & HIGH SCHOOL STANDARDS ---
  if (str.includes("UBTEB") || str.includes("VOCATIONAL") || str.includes("TECHNICAL")) return "UBTEB / TECHNICAL";
  if (str.includes("UACE") || str.includes("A LEVEL") || str.includes("A-LEVEL") || str.includes("S.6") || str.includes("S6") || str.includes("SENIOR 6")) return "UACE (A-LEVEL)";
  if (str.includes("UCE") || str.includes("O LEVEL") || str.includes("O-LEVEL") || str.includes("S.4") || str.includes("S4") || str.includes("SENIOR 4")) return "UCE (O-LEVEL)";
  
  // --- 5. LOWER SECONDARY LEVELS ---
  if (str.includes("S.3") || str.includes("S3") || str.includes("SENIOR 3")) return "S.3";
  if (str.includes("S.2") || str.includes("S2") || str.includes("SENIOR 2")) return "S.2";
  if (str.includes("S.1") || str.includes("S1") || str.includes("SENIOR 1")) return "S.1";

  // --- 6. PRIMARY SCHOOL LEVELS ---
  if (str.includes("P.7") || str.includes("P7") || str.includes("PLE") || str.includes("PRIMARY 7")) return "P.7 (PLE)";
  if (str.includes("P.6") || str.includes("P6") || str.includes("PRIMARY 6")) return "P.6";
  if (str.includes("P.5") || str.includes("P5") || str.includes("PRIMARY 5")) return "P.5";
  if (str.includes("P.4") || str.includes("P4") || str.includes("PRIMARY 4")) return "P.4";
  if (str.includes("P.3") || str.includes("P3") || str.includes("PRIMARY 3")) return "P.3";
  if (str.includes("P.2") || str.includes("P2") || str.includes("PRIMARY 2")) return "P.2";
  if (str.includes("P.1") || str.includes("P1") || str.includes("PRIMARY 1")) return "P.1";

  // Return formatted raw string for any custom qualifications
  return str;
};


const Nominal_Roll = ({ currentUser, Nominal_Rolls, setNominal_Rolls, Nominal_Roll_archives, setNominal_Roll_archives, setSidebarOpen }) => {
  const [operation, setOperation] = useState('new');
  const [notification, setNotification] = useState(null);
  const [selectedOfficer, setSelectedOfficer] = useState(null);

  // 🟢 STRICT INTERNAL CLEARANCES
  const isCommandOrHR = ['ADMIN', 'SUPER_ADMIN', 'RPC', 'Deputy Commander'].includes(currentUser?.role) || 
                        (currentUser?.position || '').toUpperCase().includes('HR') ||
                        currentUser?.permissions?.system_admin === true;

  // Edit/Upload/Archive is restricted to Command/HR OR users explicitly given "upload_hr" clearance
  const canEditRecords = isCommandOrHR || currentUser?.permissions?.upload_hr === true;
  
  // Global visibility is restricted to Super Admin or those with explicit "view_global_roster" clearance
  const canViewGlobal = currentUser?.role === 'SUPER_ADMIN' || currentUser?.permissions?.view_global_roster === true;

  // 🟢 NEW RE-INTEGRATION STATES
  const [isArchivedReturnee, setIsArchivedReturnee] = useState(false);
  const [archiveDetails, setArchiveDetails] = useState(null);
  const [customReason, setCustomReason] = useState('');
  const [previousFnum, setPreviousFnum] = useState('');

  // 🟢 BULK ARCHIVE STATES
  const [bulkSelectMode, setBulkSelectMode] = useState(false);
  const [selectedOfficers, setSelectedOfficers] = useState([]);
  const [bulkArchiveReason, setBulkArchiveReason] = useState('TRANSFERRED');
  const [isBulkArchiving, setIsBulkArchiving] = useState(false);

  const [filterRegion, setFilterRegion] = useState(canViewGlobal ? 'ALL REGIONS' : currentUser?.region || '');
  const [filterStation, setFilterStation] = useState((isCommandOrHR || canViewGlobal) ? 'ALL STATIONS' : currentUser?.station || '');  
  const [updateSearch, setUpdateSearch] = useState('');

  // 🟢 VIEW STATES: Distinguish between the base dataset and whether we are showing its analytics
  const [viewMode, setViewMode] = useState('active'); // 'active' | 'archive'
  const [showAnalytics, setShowAnalytics] = useState(false); // true | false
  
  const [metricCategory, setMetricCategory] = useState('RANK');  
  const [archiveReason, setArchiveReason] = useState('TRANSFERRED');

  const [formData, setFormData] = useState({
    sn: null, fnum: '', rank: '', name: '', sex: 'MALE', position: '',
    dob: '', doe: '', dopost: '', dopro: '', contact: '', educlevel: '',
    ipps: '', tin: '', nin: '', homedist: '', tribe: '', accno: '', bankbranch: '',
    station: currentUser?.station || REGIONAL_HIERARCHY[currentUser?.region]?.[0] || '', 
    district: '', region: currentUser?.region, section: '', dir: '', status: 'ACTIVE'
  });

  const populateUpdateForm = (data) => setFormData({ ...data, fnum: data.fnum || data.f_num || '' });

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    if (name === 'region') {
      setFormData({ ...formData, region: value, station: REGIONAL_HIERARCHY[value]?.[0] || '' });
    } else {
      setFormData({ ...formData, [name]: value });
    }
  };

  const handleOperationToggle = (mode) => {
    setOperation(mode);
    if (mode === 'new') {
      setFormData({
        sn: null, fnum: '', rank: '', name: '', sex: 'MALE', position: '',
        dob: '', doe: '', dopost: '', dopro: '', contact: '', educlevel: '',
        ipps: '', tin: '', nin: '', homedist: '', tribe: '', accno: '', bankbranch: '',
        station: currentUser?.station || REGIONAL_HIERARCHY[currentUser?.region]?.[0] || '', 
        district: '', region: currentUser?.region, section: '', dir: '', status: 'ACTIVE'
      });
      setUpdateSearch('');
      setIsArchivedReturnee(false);
      setArchiveDetails(null);
      setCustomReason('');
      setPreviousFnum('');
    }
  };

  // 🟢 SINGLE ARCHIVE HANDLER
  const handleArchivePersonnel = async () => {
    if (!canEditRecords) return alert("Security Restriction: You do not have clearance to archive personnel.");
    const targetFnum = formData.fnum || formData.f_num; 
    
    if (!targetFnum) {
      return alert("Missing Force Number. Cannot archive this record.");
    }
    
    if (!window.confirm(`Are you sure you want to move ${formData.name} (${targetFnum}) to archives?`)) {
      return;
    }

    try {
      setNotification("Moving record to archive...");
      const token = localStorage.getItem('kmp_authToken');
      const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
      
      const response = await authFetch(`${API_URL}/api/v1/nominal-roll/${encodeURIComponent(targetFnum)}/archive`, {
        method: "PUT", 
        headers: { "Content-Type": "application/json" }, 
        body: JSON.stringify({ archive_reason: archiveReason })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || "Database failed to locate the record.");
      }

      const archivedRecord = {
          sn: formData.sn, f_num: targetFnum, rank: formData.rank, name: formData.name, sex: formData.sex, position: formData.position,
          dob: formData.dob, doe: formData.doe, do_post: formData.dopost, do_pro: formData.dopro, contact: formData.contact, educ_level: formData.educlevel,         
          ipps: formData.ipps, tin: formData.tin, nin: formData.nin, home_dist: formData.homedist, tribe: formData.tribe, acc_no: formData.accno,         
          bank_branch: formData.bankbranch, station: formData.station, district: formData.district, region: formData.region, section: formData.section,
          dir: formData.dir, status: "ARCHIVED", last_updated_by: `${currentUser.name} (${currentUser.fnum})`, archive_reason: archiveReason,
          archive_date: new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0]
      };
      
      setNominal_Roll_archives([archivedRecord, ...(Array.isArray(Nominal_Roll_archives) ? Nominal_Roll_archives : [])]);
      setNominal_Rolls((Array.isArray(Nominal_Rolls) ? Nominal_Rolls : []).filter(n => (n.fnum || n.f_num) !== targetFnum));
      setNotification(`Officer ${formData.name} archived successfully.`);
      handleOperationToggle('new');
    } catch (error) { 
      setNotification("Error: Could not move to archive."); 
      alert(`Error archiving record: ${error.message}`); 
    }
  };

  // 🟢 BULK ARCHIVE HANDLER
  const handleBulkArchive = async () => {
    if (!canEditRecords) return alert("Security Restriction: You do not have clearance to archive personnel.");
    if (selectedOfficers.length === 0) return;
    if (!window.confirm(`Are you absolutely sure you want to archive ${selectedOfficers.length} officers with the reason: ${bulkArchiveReason}?`)) return;

    setIsBulkArchiving(true);
    setNotification(`Archiving ${selectedOfficers.length} officers. Please wait...`);
    
    const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
    let successCount = 0;
    let failCount = 0;
    const newArchives = [];
    const archivedFnums = new Set();

    // Process all concurrently
    await Promise.all(selectedOfficers.map(async (targetFnum) => {
      try {
        const response = await authFetch(`${API_URL}/api/v1/nominal-roll/${encodeURIComponent(targetFnum)}/archive`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ archive_reason: bulkArchiveReason })
        });
        
        if (response.ok) {
          successCount++;
          archivedFnums.add(targetFnum);
          const officer = Nominal_Rolls.find(n => (n.f_num || n.fnum) === targetFnum);
          if (officer) {
            newArchives.push({
              ...officer,
              status: "ARCHIVED",
              archive_reason: bulkArchiveReason,
              archive_date: new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0],
              last_updated_by: `${currentUser.name} (${currentUser.fnum})`
            });
          }
        } else {
          failCount++;
        }
      } catch (err) {
        failCount++;
      }
    }));

    if (newArchives.length > 0) {
      setNominal_Roll_archives(prev => [...newArchives, ...(Array.isArray(prev) ? prev : [])]);
      setNominal_Rolls(prev => (Array.isArray(prev) ? prev : []).filter(n => !archivedFnums.has(n.f_num || n.fnum)));
    }

    setNotification(`Bulk Archive Complete: ✅ ${successCount} succeeded, ❌ ${failCount} failed.`);
    setSelectedOfficers([]);
    setBulkSelectMode(false);
    setIsBulkArchiving(false);
    setTimeout(() => setNotification(null), 5000);
  };

  const handleFormSubmit = async (e) => { 
    e.preventDefault();
    if (!canEditRecords) return alert("Security Restriction: You do not have clearance to modify the Nominal Roll.");

    const currentRolls = Array.isArray(Nominal_Rolls) ? Nominal_Rolls : [];
    const token = localStorage.getItem('kmp_authToken');
    
    if (!token) return setNotification("Error: Security token missing. Please log out and log back in.");

    if (formData.nin) {
        const cleanNin = formData.nin.toUpperCase().trim();
        if (!/^C[MF][A-Z0-9]{12}$/.test(cleanNin)) return setNotification("⚠️ Error: National ID must start with CM or CF, be exactly 14 characters.");
        formData.nin = cleanNin; 
    }

    if (operation === 'new') {
      const exactNextSN = currentRolls.length > 0 ? Math.max(...currentRolls.map(n => n.sn || 0)) + 1 : 1;
      
      const newEntryPayload = { 
        ...formData, 
        sn: exactNextSN, 
        last_updated_by: `${currentUser.name} (${currentUser.fnum})`,
        ...(isArchivedReturnee && { reintegration_reason: customReason, previous_fnum: previousFnum || formData.fnum })
      };
      
      try {
        const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
        const response = await fetch(`${API_URL}/api/v1/nominal-roll`, {
          method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }, body: JSON.stringify(newEntryPayload)
        });
        
        const responseData = await response.json().catch(() => ({}));

        if (!response.ok) {
            if (response.status === 409 && responseData.is_archived_returnee) {
                setIsArchivedReturnee(true);
                setArchiveDetails(responseData);
                setNotification("⚠️ Officer history found in archive. Please authorize re-entry below.");
                return;
            }
            throw new Error(responseData.detail || "Database rejected the entry.");
        }
        
        setNominal_Rolls([newEntryPayload, ...currentRolls]); 
        setNotification(`Officer ${formData.name} recorded successfully!`); 
        handleOperationToggle('new');
      } catch (err) { setNotification(`Error: ${err.message}`); }
      
    } else if (operation === 'update') {
      const updatedRecord = { ...formData, last_updated_by: `${currentUser.name} (${currentUser.fnum})` };
      try {
          const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
          const response = await authFetch(`${API_URL}/api/v1/nominal-roll/${formData.fnum || formData.f_num || formData.sn}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(updatedRecord) 
          });
          if (!response.ok) throw new Error("Failed to update record.");
          setNominal_Rolls(currentRolls.map(n => (n.sn === formData.sn || n.fnum === formData.fnum || n.f_num === formData.fnum) ? updatedRecord : n));
          setNotification(`Officer ${formData.name} successfully updated!`);
      } catch (err) { setNotification("Error: Could not update the record."); }
    }
  };

  const filteredRolls = useMemo(() => {
    return (Array.isArray(Nominal_Rolls) ? Nominal_Rolls : []).filter(n => {
      const statusStr = (n.status || '').trim().toUpperCase();
      if (statusStr === 'ARCHIVED' || n.is_archived === true) return false;

      const dbRegion = (n.region || '').trim().toUpperCase();
      const dbStation = (n.station || '').trim().toUpperCase();
      const selRegion = (filterRegion || '').trim().toUpperCase();
      const selStation = (filterStation || '').trim().toUpperCase();

      if (selRegion !== 'ALL REGIONS' && selRegion !== '' && dbRegion !== selRegion) return false;
      if (selStation !== 'ALL STATIONS' && selStation !== '' && dbStation !== selStation) return false;
      return true;
    }).sort((a, b) => {
      const weightA = getRankWeight(a.rank);
      const weightB = getRankWeight(b.rank);
      if (weightA !== weightB) {
        return weightA - weightB;
      }
      return (a.name || '').localeCompare(b.name || '');
    });
  }, [Nominal_Rolls, filterRegion, filterStation]);

  const filteredNominal_Roll_archives = useMemo(() => {
    if (!Array.isArray(Nominal_Roll_archives)) return [];

    return Nominal_Roll_archives.filter(n => {
      if (canViewGlobal) return true;
      const dbRegion = (n.region || '').trim().toUpperCase();
      const dbStation = (n.station || '').trim().toUpperCase();
      const selRegion = (filterRegion !== 'ALL REGIONS' ? filterRegion : currentUser.region || '').trim().toUpperCase();
      const selStation = (filterStation !== 'ALL STATIONS' ? filterStation : currentUser.station || '').trim().toUpperCase();

      if (dbRegion !== selRegion) return false;
      if (dbStation !== selStation) return false;
      return true;
    }).sort((a, b) => {
      const weightA = getRankWeight(a.rank);
      const weightB = getRankWeight(b.rank);
      if (weightA !== weightB) {
        return weightA - weightB;
      }
      return (a.name || '').localeCompare(b.name || '');
    });
  }, [Nominal_Roll_archives, filterRegion, filterStation, currentUser, canViewGlobal]);

  // 🟢 CORE LOGIC: Determines exactly WHICH dataset the analytics/tables will read from
  const currentRollDataset = useMemo(() => {
    return viewMode === 'archive' ? filteredNominal_Roll_archives : filteredRolls;
  }, [viewMode, filteredRolls, filteredNominal_Roll_archives]);

  const availableUpdateRolls = useMemo(() => {
    return (Array.isArray(Nominal_Rolls) ? Nominal_Rolls : []).filter(n => {
      const fNumVal = n.fnum || n.f_num || '';
      if (!['ADMIN', 'SUPER_ADMIN'].includes(currentUser.role) && n.region !== currentUser.region) return false;
      if (updateSearch) {
        const query = updateSearch.toLowerCase();
        return (fNumVal && fNumVal.toLowerCase().includes(query)) || 
               (n.name && n.name.toLowerCase().includes(query)) || 
               (n.ipps && String(n.ipps).includes(query));
      }
      return true;
    });
  }, [Nominal_Rolls, currentUser, updateSearch]);

  // 🟢 ANALYTICS CALCULATOR: Dynamically reads from `currentRollDataset` (Active OR Archived)
  const calculatedMetrics = useMemo(() => {
      if (!showAnalytics) return [];
      const grouped = {};
      
      currentRollDataset.forEach(n => {
          let key = 'Unknown';
          const sexStr = (n.sex || '').trim().toUpperCase();
          const ninStr = (n.nin || '').trim().toUpperCase();
          const isFemale = sexStr === 'F' || sexStr === 'FEMALE' || ninStr.startsWith('CF');
          const isMale = sexStr === 'M' || sexStr === 'MALE' || ninStr.startsWith('CM');
          
          const homeDistrict = n.homedist || n.home_dist || '';
          const bankBranch = n.bankbranch || n.bank_branch || '';
          const educLevel = n.educlevel || n.educ_level || '';
          
          if (metricCategory === 'RANK') key = n.rank ? n.rank.trim().toUpperCase() : 'UNRANKED';
          else if (metricCategory === 'UNIT') key = `${n.station || 'UNKNOWN'} ${n.section ? '- ' + n.section : ''}`.trim();
          else if (metricCategory === 'SEX') key = isFemale ? 'FEMALE' : (isMale ? 'MALE' : 'UNSPECIFIED');
          else if (metricCategory === 'BANK') key = bankBranch ? bankBranch.trim().toUpperCase() : 'BANK UNKNOWN';
          else if (metricCategory === 'DISTRICT') key = homeDistrict ? homeDistrict.trim().toUpperCase() : 'DISTRICT UNKNOWN';
          else if (metricCategory === 'TRIBE') key = n.tribe ? n.tribe.trim().toUpperCase() : 'TRIBE UNKNOWN';
          else if (metricCategory === 'EDUCATION') key = parseEducationLevel(educLevel);

          else if (metricCategory === 'AGE') {
              if (n.dob) {
                  const birthYear = new Date(n.dob).getFullYear();
                  if (!isNaN(birthYear)) {
                      const age = new Date().getFullYear() - birthYear;
                      key = age < 30 ? '18-29 Years' : age < 40 ? '30-39 Years' : age < 50 ? '40-49 Years' : '50+ Years';
                  } else {
                      key = 'Age Not Recorded';
                  }
              } else { 
                  key = 'Age Not Recorded'; 
              }
          }
          
          if (!grouped[key]) grouped[key] = { category: key, total: 0, male: 0, female: 0, unknown: 0 };
          grouped[key].total += 1;
          if (isFemale) grouped[key].female += 1;
          else if (isMale) grouped[key].male += 1;
          else grouped[key].unknown += 1;
      });

      const resultsArray = Object.values(grouped);

      if (metricCategory === 'RANK') {
          return resultsArray.sort((a, b) => getRankWeight(a.category) - getRankWeight(b.category));
      } else {
          return resultsArray.sort((a, b) => b.total - a.total);
      }
  }, [currentRollDataset, metricCategory, showAnalytics]);

  const metricsData = useMemo(() => {
    let maleCount = 0;
    let femaleCount = 0;
    const uniqueStations = {};

    currentRollDataset.forEach(n => {
      const sexStr = (n.sex || '').trim().toUpperCase();
      const ninStr = (n.nin || '').trim().toUpperCase();
      
      if (sexStr === 'F' || sexStr === 'FEMALE' || ninStr.startsWith('CF')) {
        femaleCount++;
      } else if (sexStr === 'M' || sexStr === 'MALE' || ninStr.startsWith('CM')) {
        maleCount++;
      }

      if (n.station) {
        uniqueStations[n.station] = true;
      }
    });

    return {
      total: currentRollDataset.length,
      male: maleCount,
      female: femaleCount,
      unassigned: currentRollDataset.length - (maleCount + femaleCount),
      stations: Object.keys(uniqueStations).length
    };
  }, [currentRollDataset]);

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6 relative z-10">
      <div className="text-center mb-8 flex flex-col items-center">
        <img src="/upf_badge.png" alt="UPF Logo" className="w-16 h-16 mb-3 object-contain contrast-200 brightness-75 drop-shadow-sm" onError={(e) => { e.target.style.display = 'none'; }} />
        <h1 className="text-3xl font-extrabold text-gray-700 tracking-tight">Master Nominal Roll</h1>
        <h3 className="text-lg text-indigo-500 mt-2 font-medium">Man-Power Auditing & Deployment Registry</h3>
      </div>
      
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
        <div className="flex flex-col md:flex-row justify-between items-center mb-4 border-b pb-2">
          <h3 className="font-bold text-slate-800 flex items-center">
            <BarChart3 className="w-5 h-5 mr-2 text-blue-600"/> 
            Personnel Metrics Dashboard ({viewMode === 'archive' ? 'Archived Records' : 'Active Roll'})
          </h3>
          <div className="flex space-x-2 mt-2 md:mt-0">
             <button onClick={() => { setViewMode('active'); setShowAnalytics(false); setBulkSelectMode(false); }} className={`px-4 py-1.5 text-xs font-bold rounded shadow-sm transition-colors ${viewMode === 'active' && !showAnalytics ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>Active Roll</button>
             <button onClick={() => { setViewMode('archive'); setShowAnalytics(false); setBulkSelectMode(false); }} className={`px-4 py-1.5 text-xs font-bold rounded shadow-sm transition-colors ${viewMode === 'archive' && !showAnalytics ? 'bg-red-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>Archived</button>
             <button onClick={() => setShowAnalytics(!showAnalytics)} className={`px-4 py-1.5 text-xs font-bold rounded shadow-sm transition-colors ${showAnalytics ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {showAnalytics ? 'Close Analytics' : 'Analytics'}
             </button>
          </div>
        </div>

        {/* Top level stat cards */}
        {!showAnalytics && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
             <MetricCard title={viewMode === 'archive' ? "Total Archived" : "Total Personnel"} value={metricsData.total} colorClass={viewMode === 'archive' ? "text-red-700" : "text-blue-700"} />
             <MetricCard title="Male Officers" value={metricsData.male} colorClass="text-indigo-600" />
             <MetricCard title="Female Officers" value={metricsData.female} colorClass="text-pink-600" />
             <MetricCard title="Unassigned Sex" value={metricsData.unassigned} colorClass="text-slate-400" />
             <MetricCard title="Stations" value={metricsData.stations} colorClass="text-emerald-600" />
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <>
          <div className="lg:col-span-5 space-y-5">
            {/* 🟢 HIDDEN FROM USERS WITHOUT EDITING CLEARANCE */}
            {canEditRecords && (
              <>
                <div className="bg-white p-3 rounded-xl shadow-sm border border-slate-200 space-y-2 overflow-hidden">
                  <div>
                    <h4 className="font-bold text-gray-800 text-sm flex items-center">
                      <Upload className="w-4 h-4 mr-2 text-blue-600 shrink-0" /> Batch Excel Import
                    </h4>
                  </div>
                  
                  <div className="bg-slate-50 p-2 rounded-lg border border-slate-200 text-[10px] font-mono text-slate-700 flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                    <span className="bg-white px-1.5 py-0.5 rounded border border-slate-300 shadow-sm font-bold">sn</span>
                    <span className="bg-white px-1.5 py-0.5 rounded border border-slate-300 shadow-sm font-bold">f_num</span>
                    <span className="bg-white px-1.5 py-0.5 rounded border border-slate-300 shadow-sm font-bold">rank</span>
                    <span className="bg-white px-1.5 py-0.5 rounded border border-slate-300 shadow-sm font-bold">name</span>
                    <span className="bg-white px-1.5 py-0.5 rounded border border-slate-300 shadow-sm font-bold">sex</span>
                    <span className="bg-white px-1.5 py-0.5 rounded border border-slate-300 shadow-sm font-bold">position</span>
                    <span className="bg-white px-1.5 py-0.5 rounded border border-slate-300 shadow-sm font-bold">dob</span>
                    <span className="bg-white px-1.5 py-0.5 rounded border border-slate-300 shadow-sm font-bold">doe</span>
                    <span className="bg-white px-1.5 py-0.5 rounded border border-slate-300 shadow-sm font-bold">do_post</span>
                    <span className="bg-white px-1.5 py-0.5 rounded border border-slate-300 shadow-sm font-bold">do_pro</span>
                    <span className="bg-white px-1.5 py-0.5 rounded border border-slate-300 shadow-sm font-bold">contact</span>
                    <span className="bg-white px-1.5 py-0.5 rounded border border-slate-300 shadow-sm font-bold">educ_level</span>
                    <span className="bg-white px-1.5 py-0.5 rounded border border-slate-300 shadow-sm font-bold">ipps</span>
                    <span className="bg-white px-1.5 py-0.5 rounded border border-slate-300 shadow-sm font-bold">tin</span>
                    <span className="bg-white px-1.5 py-0.5 rounded border border-slate-300 shadow-sm font-bold">nin</span>
                    <span className="bg-white px-1.5 py-0.5 rounded border border-slate-300 shadow-sm font-bold">home_dist</span>
                    <span className="bg-white px-1.5 py-0.5 rounded border border-slate-300 shadow-sm font-bold">tribe</span>
                    <span className="bg-white px-1.5 py-0.5 rounded border border-slate-300 shadow-sm font-bold">acc_no</span>
                    <span className="bg-white px-1.5 py-0.5 rounded border border-slate-300 shadow-sm font-bold">bank_branch</span>
                    <span className="bg-white px-1.5 py-0.5 rounded border border-slate-300 shadow-sm font-bold">station</span>
                    <span className="bg-white px-1.5 py-0.5 rounded border border-slate-300 shadow-sm font-bold">district</span>
                    <span className="bg-white px-1.5 py-0.5 rounded border border-slate-300 shadow-sm font-bold">region</span>
                    <span className="bg-white px-1.5 py-0.5 rounded border border-slate-300 shadow-sm font-bold">section</span>
                    <span className="bg-white px-1.5 py-0.5 rounded border border-slate-300 shadow-sm font-bold">dir</span>
                    <span className="bg-white px-1.5 py-0.5 rounded border border-slate-300 shadow-sm font-bold">status</span>
                  </div>
                  <BulkNominalRollUpload onUploadSuccess={() => window.location.reload()} />
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                  <div className="bg-slate-900 px-4 py-2.5 border-b border-gray-200 flex justify-between items-center">
                    <h3 className="text-white text-sm font-semibold flex items-center"><Users className="w-4 h-4 mr-2 text-blue-400" /> ⚙️ Log Personnel</h3>
                  </div>
                  <div className="p-4 space-y-4">
                    <div className="flex space-x-2 bg-gray-100 p-1 rounded-lg">
                      <button type="button" onClick={() => handleOperationToggle('new')} className={`flex-1 py-1.5 text-xs font-bold rounded transition-all ${operation === 'new' ? 'bg-white shadow text-blue-700' : 'text-gray-600 hover:text-gray-900'}`}><PlusCircle className="w-3.5 h-3.5 inline mr-1" /> Register New</button>
                      <button type="button" onClick={() => handleOperationToggle('update')} className={`flex-1 py-1.5 text-xs font-bold rounded transition-all ${operation === 'update' ? 'bg-white shadow text-blue-700' : 'text-gray-600 hover:text-gray-900'}`}><Edit className="w-3.5 h-3.5 inline mr-1" /> Update Existing</button>
                    </div>

                    {notification && <div className={`px-3 py-2 rounded-lg flex items-center text-xs ${notification.includes('Error') || notification.includes('❌') ? 'bg-red-50 border border-red-200 text-red-800' : 'bg-green-50 border border-green-200 text-green-800'}`}>{notification.includes('Error') || notification.includes('❌') ? <AlertTriangle className="w-4 h-4 mr-2 text-red-500 shrink-0" /> : <CheckCircle className="w-4 h-4 mr-2 text-green-500 shrink-0" />}<span className="font-medium">{notification}</span></div>}

                    {operation === 'update' && (
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5">
                        <label className="block text-[11px] font-bold text-blue-800 mb-1.5">🔍 Search & Select Officer to Update</label>
                        <input type="text" placeholder="Search by Force No, Name, IPPS..." value={updateSearch} onChange={e => setUpdateSearch(e.target.value)} className="w-full text-xs p-1.5 mb-1.5 border border-blue-200 rounded outline-none focus:ring-1 focus:ring-blue-400" />
                        <div className="max-h-32 overflow-y-auto bg-white border border-blue-100 rounded custom-scrollbar">
                          {availableUpdateRolls.length === 0 ? <div className="p-2 text-[11px] text-gray-500 text-center">No personnel found.</div> : availableUpdateRolls.map(n => (
                              <div key={n.sn || n.fnum} onClick={() => populateUpdateForm(n)} className={`p-1.5 text-[11px] border-b cursor-pointer transition-colors ${formData.sn === n.sn ? 'bg-blue-600 text-white font-bold' : 'hover:bg-blue-50 text-gray-700'}`}>
                                <span className={formData.sn === n.sn ? 'text-blue-200' : 'text-gray-400'}>F/NO: {n.fnum || n.f_num}</span> | <span className={formData.sn === n.sn ? 'text-white' : 'font-bold text-blue-700'}>{n.name}</span>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}
                    
                    <form onSubmit={handleFormSubmit} className="space-y-3">
                      
                      {operation === 'update' && (formData.sn || formData.fnum) && (
                        <div className="bg-red-50 p-3 rounded-lg border border-red-200 space-y-2 mb-4 shadow-sm">
                          <h4 className="text-[11px] font-bold text-red-700 uppercase border-b border-red-200 pb-1 flex items-center"><AlertTriangle size={12} className="mr-1.5"/> Archive / Remove</h4>
                          <div className="flex space-x-2">
                              <select value={archiveReason} onChange={(e) => setArchiveReason(e.target.value)} className="flex-1 text-xs border-red-300 rounded shadow-sm border py-1.5 px-2 font-bold text-red-700 outline-none focus:ring-1 focus:ring-red-400">
                                <option value="TRANSFERRED">Transferred</option><option value="DEATH">Death</option><option value="DISMISSAL">Dismissal</option><option value="DESERTION">Desertion</option><option value="RETIREMENT">Retirement</option>
                              </select>
                              <button type="button" onClick={handleArchivePersonnel} className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded font-bold text-[11px] shadow transition border border-red-800">Move to Archive</button>
                          </div>
                        </div>
                      )}

                      {operation === 'update' && (formData.sn || formData.fnum) && <div className="bg-slate-800 text-white text-[11px] font-bold px-2.5 py-1.5 rounded">Editing: {formData.fnum}</div>}
                      
                      <div className="bg-gray-50 p-3 rounded-lg border border-gray-200 space-y-2.5">
                        <h4 className="text-[10px] font-bold text-gray-500 uppercase border-b pb-0.5">1. Identifiers</h4>
                        <div className="grid grid-cols-2 gap-2">
                          <div><label className="block text-[10px] font-bold text-gray-700 mb-0.5">F/NO. *</label><input type="text" name="fnum" value={formData.fnum} onChange={handleInputChange} required className="w-full text-xs border-gray-300 rounded shadow-sm border py-1.5 px-2 uppercase" /></div>
                          <div><label className="block text-[10px] font-bold text-gray-700 mb-0.5">IPPS NO. *</label><input type="text" name="ipps" value={formData.ipps} onChange={handleInputChange} required className="w-full text-xs border-gray-300 rounded shadow-sm border py-1.5 px-2" /></div>
                          <div className="col-span-2"><label className="block text-[10px] font-bold text-gray-700 mb-0.5">NAME *</label><input type="text" name="name" value={formData.name} onChange={handleInputChange} required className="w-full text-xs border-gray-300 rounded shadow-sm border py-1.5 px-2 uppercase" /></div>
                          <div><label className="block text-[10px] font-bold text-gray-700 mb-0.5">RANK *</label><input type="text" name="rank" value={formData.rank} onChange={handleInputChange} required className="w-full text-xs border-gray-300 rounded shadow-sm border py-1.5 px-2" /></div>
                          <div><label className="block text-[10px] font-bold text-gray-700 mb-0.5">SEX</label><select name="sex" value={formData.sex} onChange={handleInputChange} className="w-full text-xs border-gray-300 rounded shadow-sm border py-1.5 px-2 bg-white"><option>MALE</option><option>FEMALE</option></select></div>
                          <div><label className="block text-[10px] font-bold text-gray-700 mb-0.5">TIN NO.</label><input type="text" name="tin" value={formData.tin} onChange={handleInputChange} className="w-full text-xs border-gray-300 rounded shadow-sm border py-1.5 px-2" /></div>
                          <div><label className="block text-[10px] font-bold text-gray-700 mb-0.5">NIN</label><input type="text" name="nin" value={formData.nin} onChange={handleInputChange} className="w-full text-xs border-gray-300 rounded shadow-sm border py-1.5 px-2" /></div>
                        </div>
                      </div>

                      <div className="bg-gray-50 p-3 rounded-lg border border-gray-200 space-y-2.5">
                        <h4 className="text-[10px] font-bold text-gray-500 uppercase border-b pb-0.5">2. Service & Placement</h4>
                        <div className="grid grid-cols-2 gap-2">
                          <div><label className="block text-[10px] font-bold text-gray-700 mb-0.5">REGION *</label><select name="region" value={formData.region} onChange={handleInputChange} disabled={!['ADMIN', 'SUPER_ADMIN'].includes(currentUser.role)} required className="w-full text-xs border-gray-300 rounded shadow-sm border py-1.5 px-2 bg-white disabled:bg-gray-100 disabled:text-gray-500">{['ADMIN', 'SUPER_ADMIN'].includes(currentUser.role) ? Object.keys(REGIONAL_HIERARCHY).map(reg => <option key={reg} value={reg}>{reg}</option>) : <option value={currentUser.region}>{currentUser.region}</option>}</select></div>
                          <div><label className="block text-[10px] font-bold text-gray-700 mb-0.5">DUTY STATION *</label><select name="station" value={formData.station} onChange={handleInputChange} disabled={!['ADMIN', 'SUPER_ADMIN', 'RPC', 'Deputy Commander'].includes(currentUser.role)} required className="w-full text-xs border-gray-300 rounded shadow-sm border py-1.5 px-2 bg-white disabled:bg-gray-100 disabled:text-gray-500">{['ADMIN', 'SUPER_ADMIN', 'RPC', 'Deputy Commander'].includes(currentUser.role) ? (REGIONAL_HIERARCHY[formData.region] || []).map(stat => <option key={stat} value={stat}>{stat}</option>) : (<option value={currentUser.station}>{currentUser.station}</option>)}</select></div>
                          <div><label className="block text-[10px] font-bold text-gray-700 mb-0.5">POSITION *</label><input type="text" name="position" value={formData.position} onChange={handleInputChange} required className="w-full text-xs border-gray-300 rounded shadow-sm border py-1.5 px-2" /></div>
                          <div><label className="block text-[10px] font-bold text-gray-700 mb-0.5">DISTRICT</label><input type="text" name="district" value={formData.district} onChange={handleInputChange} className="w-full text-xs border-gray-300 rounded shadow-sm border py-1.5 px-2" /></div>
                          <div><label className="block text-[10px] font-bold text-gray-700 mb-0.5">SECTION</label><input type="text" name="section" value={formData.section} onChange={handleInputChange} className="w-full text-xs border-gray-300 rounded shadow-sm border py-1.5 px-2" /></div>
                          <div><label className="block text-[10px] font-bold text-gray-700 mb-0.5">DIR (Directorate)</label><input type="text" name="dir" value={formData.dir} onChange={handleInputChange} className="w-full text-xs border-gray-300 rounded shadow-sm border py-1.5 px-2" /></div>
                        </div>
                      </div>

                      <div className="bg-gray-50 p-3 rounded-lg border border-gray-200 space-y-2.5">
                        <h4 className="text-[10px] font-bold text-gray-500 uppercase border-b pb-0.5">3. Demographics</h4>
                        <div className="grid grid-cols-2 gap-2">
                          <div><label className="block text-[10px] font-bold text-gray-700 mb-0.5">D.O.B</label><input type="date" name="dob" value={formData.dob} onChange={handleInputChange} className="w-full text-xs border-gray-300 rounded shadow-sm border py-1.5 px-2" /></div>
                          <div><label className="block text-[10px] font-bold text-gray-700 mb-0.5">D.O.E</label><input type="date" name="doe" value={formData.doe} onChange={handleInputChange} className="w-full text-xs border-gray-300 rounded shadow-sm border py-1.5 px-2" /></div>
                          <div><label className="block text-[10px] font-bold text-gray-700 mb-0.5">D.O. POST</label><input type="date" name="dopost" value={formData.dopost} onChange={handleInputChange} className="w-full text-xs border-gray-300 rounded shadow-sm border py-1.5 px-2" /></div>
                          <div><label className="block text-[10px] font-bold text-gray-700 mb-0.5">D.O. PRO</label><input type="date" name="dopro" value={formData.dopro} onChange={handleInputChange} className="w-full text-xs border-gray-300 rounded shadow-sm border py-1.5 px-2" /></div>
                          <div className="col-span-2"><label className="block text-[10px] font-bold text-gray-700 mb-0.5">CONTACT</label><input type="text" name="contact" value={formData.contact} onChange={handleInputChange} className="w-full text-xs border-gray-300 rounded shadow-sm border py-1.5 px-2" /></div>
                          <div><label className="block text-[10px] font-bold text-gray-700 mb-0.5">EDUC LEVEL</label><input type="text" name="educlevel" value={formData.educlevel} onChange={handleInputChange} className="w-full text-xs border-gray-300 rounded shadow-sm border py-1.5 px-2" /></div>
                          <div><label className="block text-[10px] font-bold text-gray-700 mb-0.5">HOME DIST</label><input type="text" name="homedist" value={formData.homedist} onChange={handleInputChange} className="w-full text-xs border-gray-300 rounded shadow-sm border py-1.5 px-2" /></div>
                          <div><label className="block text-[10px] font-bold text-gray-700 mb-0.5">TRIBE</label><input type="text" name="tribe" value={formData.tribe} onChange={handleInputChange} className="w-full text-xs border-gray-300 rounded shadow-sm border py-1.5 px-2" /></div>
                        </div>
                      </div>

                      <div className="bg-gray-50 p-3 rounded-lg border border-gray-200 space-y-2.5">
                        <h4 className="text-[10px] font-bold text-gray-500 uppercase border-b pb-0.5">4. Financial & Status</h4>
                        <div className="grid grid-cols-2 gap-2">
                          <div><label className="block text-[10px] font-bold text-gray-700 mb-0.5">ACC. NO</label><input type="text" name="accno" value={formData.accno} onChange={handleInputChange} className="w-full text-xs border-gray-300 rounded shadow-sm border py-1.5 px-2" /></div>
                          <div><label className="block text-[10px] font-bold text-gray-700 mb-0.5">BANK & BRANCH</label><input type="text" name="bankbranch" value={formData.bankbranch} onChange={handleInputChange} className="w-full text-xs border-gray-300 rounded shadow-sm border py-1.5 px-2" /></div>
                          <div className="col-span-2"><label className="block text-[10px] font-bold text-gray-700 mb-0.5">STATUS</label><select name="status" value={formData.status} onChange={handleInputChange} className="w-full text-xs border-gray-300 rounded shadow-sm border py-1.5 px-2 bg-white font-bold"><option>ACTIVE</option><option>ON LEAVE</option><option>SUSPENDED</option></select></div>
                        </div>
                      </div>

                      {operation === 'new' && isArchivedReturnee && archiveDetails && (
                        <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg mt-3 animate-in fade-in zoom-in-95 shadow-sm">
                          <div className="flex items-start mb-2">
                            <AlertTriangle className="text-amber-500 w-4 h-4 mr-1.5 mt-0.5" />
                            <div>
                              <h4 className="text-xs font-bold text-amber-900">Historical Record Match</h4>
                              <p className="text-[11px] text-amber-700 mt-0.5">
                                Found in archives: 
                                <span className="font-mono bg-amber-100 px-1 py-0.5 rounded mx-1 font-bold text-amber-900 border border-amber-200">
                                  {archiveDetails.old_rank} {archiveDetails.old_fnum}
                                </span>
                              </p>
                            </div>
                          </div>
                          
                          <div className="space-y-3 bg-white p-3 rounded-md border border-amber-100">
                            <div>
                              <label className="block text-[10px] font-bold text-slate-700 mb-0.5">Re-integration Authority / Reason *</label>
                              <input
                                type="text"
                                required
                                value={customReason}
                                onChange={(e) => setCustomReason(e.target.value)}
                                placeholder="e.g., Deployed from HR HQs back to KMP..."
                                className="w-full text-xs py-1.5 px-2 border border-slate-300 rounded shadow-sm focus:ring-1 focus:ring-amber-500 outline-none"
                              />
                            </div>
                            
                            <div>
                              <label className="block text-[10px] font-bold text-slate-700 mb-0.5 flex items-center">
                                Previous Force No. <span className="text-slate-400 font-normal ml-1">(If promoted to Gazetted File No.)</span>
                              </label>
                              <div className="flex flex-col sm:flex-row sm:items-center space-y-1.5 sm:space-y-0 sm:space-x-1.5">
                                <input
                                  type="text"
                                  value={previousFnum}
                                  onChange={(e) => setPreviousFnum(e.target.value)}
                                  placeholder="Leave blank if unchanged"
                                  className="flex-1 text-xs py-1.5 px-2 border border-slate-300 rounded shadow-sm focus:ring-1 focus:ring-amber-500 outline-none uppercase"
                                />
                                {previousFnum && (
                                  <div className="flex items-center text-[9px] font-bold text-amber-700 bg-amber-100 px-1.5 py-1 rounded border border-amber-200">
                                    {previousFnum} <ArrowRight className="w-2.5 h-2.5 mx-0.5"/> {formData.fnum}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      <button type="submit" className={`w-full transition-colors text-white py-2.5 font-bold rounded-lg shadow text-xs uppercase flex justify-center items-center ${isArchivedReturnee ? 'bg-amber-600 hover:bg-amber-700' : 'bg-blue-700 hover:bg-blue-800'}`}>
                        {operation === 'new' 
                          ? (isArchivedReturnee ? '⚠️ Execute Safe Re-integration' : '💾 Log Personnel Record') 
                          : '💾 Save Updates'}
                      </button>
                    </form>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="lg:col-span-7 space-y-4">
            
            {/* 🟢 BULK ARCHIVE CONTROL BAR (HIDDEN IF NO CLEARANCE) */}
            {viewMode === 'active' && canEditRecords && (
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 flex flex-col md:flex-row justify-between items-center gap-3">
                <button
                    onClick={() => { setBulkSelectMode(!bulkSelectMode); setSelectedOfficers([]); }}
                    className={`text-xs font-bold px-4 py-2 rounded-lg transition-colors border shadow-sm ${bulkSelectMode ? 'bg-slate-800 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'}`}
                >
                    {bulkSelectMode ? 'Cancel Bulk Select' : '☑️ Enable Bulk Archive'}
                </button>
                
                {bulkSelectMode && selectedOfficers.length > 0 && (
                    <div className="flex items-center space-x-2 animate-in fade-in slide-in-from-left-4 bg-white p-1.5 rounded-lg shadow-sm border border-red-200">
                        <span className="text-xs font-bold text-red-600 bg-red-50 px-2 py-1 rounded">{selectedOfficers.length} Selected</span>
                        <select
                            value={bulkArchiveReason}
                            onChange={(e) => setBulkArchiveReason(e.target.value)}
                            className="text-xs border border-slate-300 rounded p-1.5 outline-none font-bold text-slate-700"
                        >
                            <option value="TRANSFERRED">Transferred</option>
                            <option value="DEATH">Death</option>
                            <option value="DISMISSAL">Dismissal</option>
                            <option value="DESERTION">Desertion</option>
                            <option value="RETIREMENT">Retirement</option>
                        </select>
                        <button
                            onClick={handleBulkArchive}
                            disabled={isBulkArchiving}
                            className="text-xs font-bold bg-red-600 hover:bg-red-700 text-white px-4 py-1.5 rounded transition-colors shadow-sm disabled:opacity-50"
                        >
                            {isBulkArchiving ? 'Archiving...' : 'Execute Bulk Archive'}
                        </button>
                    </div>
                )}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3">
              <select value={filterRegion} onChange={(e) => { setFilterRegion(e.target.value); setFilterStation('ALL STATIONS'); }} disabled={!canViewGlobal} className="border rounded-lg px-3 py-2 text-sm shadow-sm bg-white disabled:bg-gray-100 disabled:text-gray-500 w-full sm:w-auto outline-none focus:border-blue-500">
                {canViewGlobal ? (
                  <><option value="ALL REGIONS">ALL REGIONS</option>{Array.from(new Set([...Object.keys(REGIONAL_HIERARCHY), ...(Nominal_Rolls || []).map(n => n.region).filter(Boolean)])).sort().map(reg => <option key={reg} value={reg}>{reg}</option>)}</>
                ) : <option value={currentUser?.region}>{currentUser?.region}</option>}
              </select>
              <select value={filterStation} onChange={(e) => setFilterStation(e.target.value)} disabled={!(isCommandOrHR || canViewGlobal)} className="border rounded-lg px-3 py-2 text-sm shadow-sm bg-white disabled:bg-gray-100 disabled:text-gray-500 w-full sm:w-auto outline-none focus:border-blue-500">
                {(isCommandOrHR || canViewGlobal) ? (
                  <><option value="ALL STATIONS">ALL STATIONS</option>{Array.from(new Set([...(REGIONAL_HIERARCHY[filterRegion] || []), ...(Nominal_Rolls || []).filter(n => n.region === filterRegion).map(n => n.station).filter(Boolean)])).sort().map(stat => <option key={stat} value={stat}>{stat}</option>)}</>
                ) : <option value={currentUser?.station}>{currentUser?.station}</option>}
              </select>
            </div>

            {showAnalytics ? (
              <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm animate-in fade-in zoom-in-95 duration-200">
                  <div className="flex justify-between items-center mb-6 border-b pb-4">
                      <h3 className="font-extrabold text-lg text-indigo-900 flex items-center"><PieChart className="mr-2"/> {viewMode === 'archive' ? 'Archived Roll Analytics' : 'Active Roll Analytics'}</h3>
                      <div className="flex items-center space-x-2 bg-indigo-50 p-2 rounded-lg border border-indigo-100">
                         <label className="text-xs font-bold text-indigo-800 uppercase">Categorize By:</label>
                         <select value={metricCategory} onChange={e => setMetricCategory(e.target.value)} className="border border-indigo-300 rounded p-1 text-sm font-bold text-indigo-700 outline-none bg-white">
                             <option value="RANK">Rank Breakdown</option>
                             <option value="UNIT">Unit / Station Breakdown</option>
                             <option value="SEX">Sex Distribution</option>
                             <option value="DISTRICT">Home District Breakdown</option>
                             <option value="BANK">Bank Branch Breakdown</option>
                             <option value="TRIBE">Tribe Breakdown</option>
                             <option value="EDUCATION">Education Level Breakdown</option>
                             <option value="AGE">Age Demographics Breakdown</option>
                         </select>
                      </div>
                  </div>
                  <table className="min-w-full divide-y divide-gray-200 border border-gray-200 rounded-lg overflow-hidden">
                      <thead className="bg-indigo-50">
                          <tr>
                              <th className="px-4 py-3 text-left text-xs font-bold text-indigo-800 uppercase">{metricCategory}</th>
                              <th className="px-4 py-3 text-center text-xs font-bold text-indigo-800 uppercase">Total Personnel</th>
                              <th className="px-4 py-3 text-center text-xs font-bold text-indigo-800 uppercase">Male</th>
                              <th className="px-4 py-3 text-center text-xs font-bold text-indigo-800 uppercase">Female</th>
                          </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-100">
                          {calculatedMetrics.map(m => (
                              <tr key={m.category} className="hover:bg-indigo-50/30 transition-colors">
                                  <td className="px-4 py-3 text-sm font-bold text-gray-800">{m.category}</td>
                                  <td className="px-4 py-3 text-sm text-center font-extrabold text-indigo-600">{m.total}</td>
                                  <td className="px-4 py-3 text-sm text-center font-medium text-blue-600">{m.male}</td>
                                  <td className="px-4 py-3 text-sm text-center font-medium text-pink-600">{m.female}</td>
                              </tr>
                          ))}
                          {calculatedMetrics.length === 0 && <tr><td colSpan="4" className="text-center p-4 text-gray-500 font-medium">No data available for this filter constraint.</td></tr>}
                      </tbody>
                  </table>
              </div>
            ) : (
              <ExpandableTableCard title={viewMode === 'active' ? "Active Nominal Roll (Full Screen Mode)" : "Archived Personnel Ledger"} onToggle={(expanded) => { if (setSidebarOpen) setSidebarOpen(!expanded); }}>
                <div className="overflow-x-auto w-full">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50 sticky top-0 z-10">
                      <tr>
                        {/* 🟢 BULK SELECT CHECKBOX HEADER (HIDDEN IF NO CLEARANCE) */}
                        {bulkSelectMode && viewMode === 'active' && canEditRecords && (
                          <th className="px-3 py-3 text-center text-xs font-bold text-gray-500 uppercase whitespace-nowrap">
                             <input 
                                type="checkbox" 
                                checked={selectedOfficers.length === filteredRolls.length && filteredRolls.length > 0}
                                onChange={(e) => {
                                   if (e.target.checked) setSelectedOfficers(filteredRolls.map(n => n.f_num || n.fnum));
                                   else setSelectedOfficers([]);
                                }}
                                className="w-4 h-4 cursor-pointer accent-red-600"
                             />
                          </th>
                        )}
                        <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase whitespace-nowrap">S/No</th>
                        <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase whitespace-nowrap">F/NO</th>
                        <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase whitespace-nowrap">Rank</th>
                        <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase whitespace-nowrap">Name</th>
                        <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase whitespace-nowrap">Sex</th>
                        <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase whitespace-nowrap">Position</th>
                        <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase whitespace-nowrap">DOB</th>
                        <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase whitespace-nowrap">DOE</th>
                        <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase whitespace-nowrap">D.O. Post</th>
                        <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase whitespace-nowrap">D.O. Pro</th>
                        <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase whitespace-nowrap">Contact</th>
                        <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase whitespace-nowrap">Educ Level</th>
                        <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase whitespace-nowrap">IPPS</th>
                        <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase whitespace-nowrap">TIN</th>
                        <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase whitespace-nowrap">NIN</th>
                        <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase whitespace-nowrap">Home Dist</th>
                        <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase whitespace-nowrap">Tribe</th>
                        <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase whitespace-nowrap">Acc No</th>
                        <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase whitespace-nowrap">Bank Branch</th>
                        <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase whitespace-nowrap">Station</th>
                        <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase whitespace-nowrap">District</th>
                        <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase whitespace-nowrap">Region</th>
                        <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase whitespace-nowrap">Section</th>
                        <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase whitespace-nowrap">Dir</th>
                        <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase whitespace-nowrap">Status</th>
                        <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase whitespace-nowrap">Last Updated By</th>
                        {viewMode === 'archive' && (
                          <>
                            <th className="px-3 py-3 text-left text-xs font-bold text-red-600 uppercase whitespace-nowrap bg-red-50">Archive Reason</th>
                            <th className="px-3 py-3 text-left text-xs font-bold text-red-600 uppercase whitespace-nowrap bg-red-50">Archive Date</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {(viewMode === 'active' ? filteredRolls : filteredNominal_Roll_archives).map((n, index) => (
                        <tr 
                          key={n.sn || n.id || n.f_num || n.fnum} 
                          className={`${viewMode === 'archive' ? 'bg-slate-50 opacity-80' : bulkSelectMode && selectedOfficers.includes(n.f_num || n.fnum) ? 'bg-red-50' : 'hover:bg-blue-50'} transition-colors ${canEditRecords ? 'cursor-pointer' : ''}`} 
                          onClick={() => {
                             if (!canEditRecords) return; // Ignore clicks if they can't edit
                             
                             if (bulkSelectMode && viewMode === 'active') {
                                const target = n.f_num || n.fnum;
                                if (selectedOfficers.includes(target)) {
                                   setSelectedOfficers(prev => prev.filter(id => id !== target));
                                } else {
                                   setSelectedOfficers(prev => [...prev, target]);
                                }
                             } else {
                                setSelectedOfficer(n);
                             }
                          }}
                        >
                          {/* 🟢 BULK SELECT CHECKBOX ROW (HIDDEN IF NO CLEARANCE) */}
                          {bulkSelectMode && viewMode === 'active' && canEditRecords && (
                             <td className="px-3 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                                <input 
                                   type="checkbox" 
                                   checked={selectedOfficers.includes(n.f_num || n.fnum)}
                                   onChange={(e) => {
                                      const target = n.f_num || n.fnum;
                                      if (e.target.checked) setSelectedOfficers(prev => [...prev, target]);
                                      else setSelectedOfficers(prev => prev.filter(id => id !== target));
                                   }}
                                   className="w-4 h-4 cursor-pointer accent-red-600"
                                />
                             </td>
                          )}
                          <td className="px-3 py-2 whitespace-nowrap text-xs font-bold text-gray-900">{index + 1}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs font-bold text-blue-800">{n.f_num || n.fnum}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs font-bold">{n.rank}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs font-medium">{n.name}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs">{n.sex}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-700">{n.position}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500">{n.dob || '-'}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500">{n.doe || '-'}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500">{n.do_post || n.dopost || n.dop || '-'}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500">{n.do_pro || n.dopro || '-'}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs">{n.contact || '-'}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs">{n.educ_level || n.educlevel || '-'}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs font-mono">{n.ipps || '-'}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs">{n.tin || '-'}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs">{n.nin || '-'}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs">{n.home_dist || n.homedist || '-'}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs">{n.tribe || '-'}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs">{n.acc_no || n.accno || '-'}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs">{n.bank_branch || n.bankbranch || '-'}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs font-bold text-blue-700">{n.station || '-'}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs">{n.district || '-'}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs">{n.region || '-'}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs">{n.section || '-'}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs">{n.dir || '-'}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs font-bold text-green-700">{n.status || 'ACTIVE'}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500">{n.last_updated_by || '-'}</td>
                          {viewMode === 'archive' && (
                            <>
                              <td className="px-3 py-2 whitespace-nowrap text-xs font-bold text-red-700 bg-red-50/50">{n.archive_reason || '-'}</td>
                              <td className="px-3 py-2 whitespace-nowrap text-xs text-red-500 bg-red-50/50">{n.archive_date || '-'}</td>
                            </>
                          )}
                        </tr>
                      ))}
                      {(viewMode === 'active' ? filteredRolls : filteredNominal_Roll_archives).length === 0 && (
                        <tr><td colSpan={viewMode === 'archive' ? "28" : (bulkSelectMode ? "27" : "26")} className="text-center py-6 text-gray-500 font-medium">No personnel records found in this view.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </ExpandableTableCard>
            )}
          </div>
        </>
      </div>

      {selectedOfficer && (
        <OfficerDossierModal 
          officer={selectedOfficer} 
          onClose={() => setSelectedOfficer(null)} 
        />
      )}
    </div>
  );
};


const AdminProfile = ({ currentUser, setCurrentUser, setCurrentPage }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [isRequestMode, setIsRequestMode] = useState(false);
  const [notification, setNotification] = useState(null);
  const [viewingImage, setViewingImage] = useState(null);

  const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
  
  const [passwordData, setPasswordData] = useState({ old_password: '', new_password: '' });
  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setNotification("⏳ Updating security key...");
    try {
      const token = localStorage.getItem('kmp_authToken');
const response = await authFetch(`/api/v1/users/change-password`, {
        method: "PUT", 
        headers: { "Content-Type": "application/json" }, 
        body: JSON.stringify(passwordData)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Failed to update password.");
      setNotification(`✅ ${data.message}`);
      setPasswordData({ old_password: '', new_password: '' });
    } catch (err) { 
      setNotification(`❌ Error: ${err.message}`); 
    }
  };

  const canAutoApprove = ['SUPER_ADMIN', 'ADMIN'].includes(currentUser?.role);
  const OFFICER_RANKS = ['AIP', 'IP', 'ASP', 'SP', 'SASP', 'SSP', 'ACP', 'CP', 'SCP', 'AIGP', 'DIGP', 'IGP'];

  const [formData, setFormData] = useState({
    fnum: currentUser?.fnum || '', name: currentUser?.name || '', rank: currentUser?.rank || '',
    region: currentUser?.region || '', station: currentUser?.station || '', email: currentUser?.email || '',
    phone: currentUser?.phone || '', profile_photo_path: currentUser?.profile_photo_path || ''
  });

  const isOfficerRank = OFFICER_RANKS.includes(formData.rank?.toUpperCase().trim());
  const wasNCO = !OFFICER_RANKS.includes(currentUser?.rank?.toUpperCase().trim());
  const canEditFnum = canAutoApprove || (isOfficerRank && wasNCO);

  const handleInputChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

const handlePhotoUpload = async (e) => {
    const file = e.target.files[0];
    if (file) {
      setNotification("⏳ Uploading and saving new profile photo...");
      const uploadData = new FormData();
      uploadData.append("file", file);
      uploadData.append("fnum", currentUser.fnum);
      uploadData.append("category", "user_profile");

      try {
        // 1. Upload photo via authFetch (automatically attaches Bearer token & API_URL)
        // NOTE: Do not set 'Content-Type' when sending FormData, the browser handles it.
        const response = await authFetch('/api/v1/users/upload-profile', { 
          method: "POST", 
          body: uploadData 
        });
        
        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.detail || "Upload failed on server.");
        }

        const data = await response.json();
        const s3Url = data.full_s3_url || data.cloud_storage_path;

        // 2. Link the uploaded photo URL to the user's profile in the database
        const securePayload = { ...formData, profile_photo_path: s3Url };
        const updateRes = await authFetch('/api/v1/users/profile/update', {
          method: "PUT", 
          headers: { "Content-Type": "application/json" }, 
          body: JSON.stringify(securePayload)
        });

        if (!updateRes.ok) {
          const errData = await updateRes.json().catch(() => ({}));
          throw new Error(errData.detail || "Failed to link photo to profile in database.");
        }

        setFormData(prev => ({ ...prev, profile_photo_path: s3Url }));
        setCurrentUser(prev => ({ ...prev, profile_photo_path: s3Url }));
        setNotification("✅ Photo uploaded and permanently saved successfully!");
        setTimeout(() => setNotification(null), 4000);
      } catch (error) { 
        setNotification(`❌ Error: ${error.message}`); 
      }
    }
  };

  const handleRequestSubmit = async (e) => {
    if (e) e.preventDefault();
    setNotification("⏳ Sending official request to Command...");
    try {
      const token = localStorage.getItem('kmp_authToken');
      const response = await fetch(`${API_URL}/api/v1/requests`, {
        method: "POST", 
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({
          fnum: currentUser.fnum, requested_fnum: formData.fnum !== currentUser.fnum ? formData.fnum : null,
          requested_name: formData.name !== currentUser.name ? formData.name : null, requested_rank: formData.rank !== currentUser.rank ? formData.rank : null,
          requested_region: formData.region !== currentUser.region ? formData.region : null, requested_station: formData.station !== currentUser.station ? formData.station : null,
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || "Failed to send request.");
      }
      
      setNotification("✅ Request successfully logged for Command review.");
      setIsRequestMode(false);
      setFormData({ ...formData, fnum: currentUser.fnum, name: currentUser.name, rank: currentUser.rank, region: currentUser.region, station: currentUser.station });
      setTimeout(() => setNotification(null), 5000);
    } catch (err) { 
      setNotification(`❌ Error: ${err.message}`); 
    }
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    setNotification("⏳ Verifying profile data with HR Nominal Roll...");
    try {
      const token = localStorage.getItem('kmp_authToken');
      const response = await authFetch(`/api/v1/users/profile/update`, {
        method: "PUT", 
        headers: { "Content-Type": "application/json" }, 
        body: JSON.stringify(formData)
      });
      const data = await response.json();

      if (!response.ok) throw new Error(data.detail || "Failed to update database.");
      if (data.new_token) localStorage.setItem('kmp_authToken', data.new_token);

      setCurrentUser({ ...currentUser, ...formData });
      setNotification("✅ Profile verified and successfully updated!");
      setIsEditing(false); 
      setIsRequestMode(false);
      setTimeout(() => setNotification(null), 4000);
    } catch (err) { 
      setNotification(`❌ ${err.message}`); 
    }
  };

  const handleContactSubmit = async (e) => {
    if (e) e.preventDefault();
    setNotification("⏳ Saving contact details...");
    try {
      const token = localStorage.getItem('kmp_authToken');
      const securePayload = { ...currentUser, email: formData.email, phone: formData.phone, profile_photo_path: formData.profile_photo_path };

      const response = await authFetch(`/api/v1/users/profile/update`, {
        method: "PUT", 
        headers: { "Content-Type": "application/json" }, 
        body: JSON.stringify(securePayload)
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Failed to update database.");

      setCurrentUser({ ...currentUser, email: formData.email, phone: formData.phone, profile_photo_path: formData.profile_photo_path });
      setNotification("✅ Contact info and photo successfully updated!");
      setTimeout(() => setNotification(null), 4000);
    } catch (err) { 
      setNotification(`❌ ${err.message}`); 
    }
  };

  const handleProfileSave = (e) => {
    e.preventDefault();
    if (canAutoApprove || formData.fnum !== currentUser.fnum) handleSubmit(e);
    else handleRequestSubmit(e);
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6 mt-10 relative z-10 animate-in fade-in duration-300">
      <button onClick={() => setCurrentPage && setCurrentPage('home')} className="flex items-center text-xs font-bold text-slate-500 hover:text-blue-700 transition-colors bg-white hover:bg-blue-50 px-4 py-2 rounded-lg shadow-xs border border-slate-200 w-fit">
        <Home size={16} className="mr-2" /> Return to Master Dashboard
      </button>

      <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
        <div className="bg-slate-900 px-6 py-8 border-b border-slate-800 flex justify-between items-center relative">
          <div className="flex items-center z-10">
            <div className="relative group">
              {formData.profile_photo_path ? (
                <img src={formData.profile_photo_path} alt="" className={`w-24 h-24 rounded-full object-cover shadow-2xl border-4 border-slate-700 bg-white transition-transform ${isEditing ? 'opacity-80' : 'cursor-pointer hover:scale-105'}`} onClick={() => !isEditing && setViewingImage(formData.profile_photo_path)} onError={(e) => { e.target.style.display='none'; }} />
              ) : (
                <div className="w-24 h-24 bg-blue-600 rounded-full flex items-center justify-center text-white font-extrabold text-4xl shadow-2xl border-4 border-slate-700">{currentUser?.name?.charAt(0) || 'A'}</div>
              )}
              {isEditing && (
                <label className="absolute bottom-0 right-0 bg-blue-600 hover:bg-blue-500 text-white p-2 rounded-full cursor-pointer shadow-lg border-2 border-slate-800 transition-colors transform hover:scale-110">
                  <Camera size={16} /> <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
                </label>
              )}
            </div>
            <div className="ml-6 text-white">
              <h2 className="text-2xl font-extrabold tracking-tight">{currentUser?.name}</h2>
              <p className="text-blue-300 font-medium tracking-wide mt-1 uppercase text-xs">{currentUser?.rank} • {currentUser?.station} • {currentUser?.region}</p>
            </div>
          </div>
          <button onClick={() => { setIsEditing(!isEditing); setIsRequestMode(false); }} className={`z-10 flex items-center px-4 py-2 rounded-lg text-xs font-bold transition-colors shadow-xs ${isEditing ? 'bg-slate-700 text-white border border-slate-600' : 'bg-blue-600 text-white hover:bg-blue-500'}`}>
            {isEditing ? <><X size={16} className="mr-2"/> Cancel Edit</> : <><Edit size={16} className="mr-2"/> Update Profile</>}
          </button>
        </div>

        <div className="p-8">
          {notification && (
            <div className={`p-4 rounded-lg mb-6 font-medium text-xs flex items-center shadow-xs ${notification.includes('Error') || notification.includes('❌') ? 'bg-red-50 text-red-700 border border-red-200' : notification.includes('⏳') ? 'bg-amber-50 text-amber-800 border border-amber-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
               {notification}
            </div>
          )}

          {isEditing ? (
            <div className="space-y-6">
              <div className={`p-6 rounded-xl border transition-colors duration-300 ${canAutoApprove ? 'bg-blue-50 border-blue-200' : isRequestMode ? 'bg-amber-50 border-amber-300' : 'bg-slate-100 border-slate-200'}`}>
                <div className="flex justify-between items-center mb-4 border-b pb-2 border-slate-200/50">
                  <div className={`flex items-center text-xs font-extrabold uppercase tracking-wider ${canAutoApprove ? 'text-blue-700' : isRequestMode ? 'text-amber-700' : 'text-slate-500'}`}>
                    {canAutoApprove ? <Unlock size={14} className="mr-2" /> : isRequestMode ? <Edit size={14} className="mr-2" /> : <Lock size={14} className="mr-2" />} 
                    Official Deployment Records {canAutoApprove ? "(Admin Override Active)" : isRequestMode ? "(Drafting Request)" : "(Restricted)"}
                  </div>
                  {!canAutoApprove && !isRequestMode && (
                    <button type="button" onClick={() => setIsRequestMode(true)} className="text-xs bg-slate-800 hover:bg-slate-700 text-white px-3 py-1.5 rounded font-bold transition flex items-center shadow-xs"><Shield size={12} className="mr-1"/> Request Modification</button>
                  )}
                  {!canAutoApprove && isRequestMode && (
                    <button type="button" onClick={handleProfileSave} className="text-xs bg-amber-600 hover:bg-amber-500 text-white px-3 py-1.5 rounded font-bold transition flex items-center shadow-xs"><Send size={12} className="mr-1"/> Send Official Request</button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Full Name</label>
                    <input type="text" name="name" value={formData.name} onChange={handleInputChange} disabled={!canAutoApprove && !isRequestMode} className={`w-full p-2.5 rounded-lg text-xs font-bold border ${canAutoApprove || isRequestMode ? 'bg-white border-blue-300 text-slate-900 focus:ring-2 focus:ring-blue-500' : 'bg-slate-200 border-slate-300 text-slate-600 cursor-not-allowed'}`} />
                  </div>
                  <div className="flex gap-4">
                    <div className="w-1/2">
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Force / File Number</label>
                      <input type="text" name="fnum" value={formData.fnum} onChange={(e) => setFormData({...formData, fnum: e.target.value.toUpperCase()})} disabled={!canEditFnum} className={`w-full p-2.5 border rounded-lg text-xs font-bold transition-all ${canEditFnum ? 'bg-amber-50 border-amber-400 text-slate-900 focus:ring-2 focus:ring-amber-500 shadow-inner' : 'bg-slate-200 border-slate-300 text-slate-600 cursor-not-allowed'}`} />
                      {canEditFnum && <p className="text-[9px] text-blue-600 mt-1 font-bold animate-pulse">Unlocked for Promotion Verification</p>}
                    </div>
                    <div className="w-1/2">
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Rank</label>
                      <input type="text" name="rank" value={formData.rank} onChange={(e) => setFormData({...formData, rank: e.target.value.toUpperCase()})} disabled={!canAutoApprove && !isRequestMode && !wasNCO} className={`w-full p-2.5 rounded-lg text-xs font-bold border ${(canAutoApprove || isRequestMode || wasNCO) ? 'bg-white border-blue-300 text-slate-900 focus:ring-2 focus:ring-blue-500' : 'bg-slate-200 border-slate-300 text-slate-600 cursor-not-allowed'}`} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Command Region</label>
                    <input type="text" name="region" value={formData.region} onChange={handleInputChange} disabled={!canAutoApprove && !isRequestMode} className={`w-full p-2.5 rounded-lg text-xs font-bold border ${canAutoApprove || isRequestMode ? 'bg-white border-blue-300 text-slate-900 focus:ring-2 focus:ring-blue-500' : 'bg-slate-200 border-slate-300 text-slate-600 cursor-not-allowed'}`} />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Assigned Station</label>
                    <input type="text" name="station" value={formData.station} onChange={handleInputChange} disabled={!canAutoApprove && !isRequestMode} className={`w-full p-2.5 rounded-lg text-xs font-bold border ${canAutoApprove || isRequestMode ? 'bg-white border-blue-300 text-slate-900 focus:ring-2 focus:ring-blue-500' : 'bg-slate-200 border-slate-300 text-slate-600 cursor-not-allowed'}`} />
                  </div>
                </div>
              </div>

              <form onSubmit={handleContactSubmit} className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
                <div className="flex items-center text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-4 border-b border-slate-100 pb-2">
                  <Edit size={14} className="mr-2" /> Editable Contact Data
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Official Email</label>
                    <input type="email" name="email" value={formData.email} onChange={handleInputChange} className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-xs font-medium text-slate-900" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Contact Number</label>
                    <input type="tel" name="phone" value={formData.phone} onChange={handleInputChange} className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-xs font-medium text-slate-900" />
                  </div>
                </div>
                <div className="flex justify-end pt-4 mt-2 border-t border-slate-100">
                  <button type="submit" className="bg-blue-700 hover:bg-blue-800 text-white font-bold py-2 px-6 rounded-lg shadow-xs transition-colors flex items-center text-xs">💾 Save Profile Changes</button>
                </div>
              </form>

              <form onSubmit={handlePasswordChange} className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
                <div className="flex items-center text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-4 border-b border-slate-100 pb-2">
                  <Lock size={14} className="mr-2 text-red-500" /> Security: Change Password
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Current Password</label>
                    <input type="password" required value={passwordData.old_password} onChange={(e) => setPasswordData({...passwordData, old_password: e.target.value})} className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-xs" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">New Password (Min 6 Chars)</label>
                    <input type="password" required value={passwordData.new_password} onChange={(e) => setPasswordData({...passwordData, new_password: e.target.value})} className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-xs" />
                  </div>
                </div>
                <div className="flex justify-end pt-4 mt-2 border-t border-slate-100">
                  <button type="submit" className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-6 rounded-lg shadow-xs transition-colors text-xs">Update Security Key</button>
                </div>
              </form>

            </div>
          ) : (

            <div className="space-y-6">
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider border-b pb-2 flex items-center">
                <Shield size={14} className="mr-2 text-slate-400" /> Comprehensive Officer Profile
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6 bg-slate-50 p-6 rounded-xl border border-slate-200 shadow-inner">
                
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Force/File Number</label>
                  <div className="text-xs font-extrabold text-slate-900">{currentUser?.fnum}</div>
                </div>
                
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">IPPS Number</label>
                  <div className="text-xs font-bold text-slate-800">{currentUser?.ipps || 'N/A'}</div>
                </div>
                
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Sex</label>
                  <div className="text-xs font-bold text-slate-800">{currentUser?.sex || 'N/A'}</div>
                </div>
                
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">System Role</label>
                  <div className={`text-xs font-extrabold ${canAutoApprove ? 'text-emerald-600' : 'text-blue-600'}`}>{currentUser?.role || 'USER'}</div>
                </div>

                <div className="col-span-2">
                  <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Official Title / Position</label>
                  <div className="text-xs font-bold text-slate-800">{currentUser?.position || 'N/A'}</div>
                </div>
                
                <div className="col-span-2">
                  <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Command Chain (Region / Station)</label>
                  <div className="text-xs font-bold text-slate-800">{currentUser?.region || 'N/A'} / {currentUser?.station || 'N/A'}</div>
                </div>

                <div className="col-span-2">
                  <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Official Email</label>
                  <div className="text-xs font-bold text-slate-800 truncate">{currentUser?.email || 'N/A'}</div>
                </div>
                
                <div className="col-span-2">
                  <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Contact Number</label>
                  <div className="text-xs font-bold text-slate-800">{currentUser?.phone || 'N/A'}</div>
                </div>

              </div>
            </div>
          )}
        </div>
      </div>

      {/* FULL SCREEN IMAGE MODAL */}
      {viewingImage && (
        <div className="fixed inset-0 bg-black/90 z-[300] flex justify-center items-center p-4 animate-in fade-in" onClick={() => setViewingImage(null)}>
          <button className="absolute top-6 right-6 text-white hover:text-red-500 transition-colors bg-white/10 p-2 rounded-full shadow-lg">
            <X size={24}/>
          </button>
          <img 
            src={viewingImage} 
            alt="Full Profile" 
            className="max-w-full max-h-[90vh] object-contain rounded-xl shadow-2xl border-2 border-slate-700" 
            onClick={(e) => e.stopPropagation()} 
          />
        </div>
      )}

    </div>
  );
};


// ====================================================================
// --- PROFILE UPDATE SYSTEM (COMMAND WORKFLOW ENABLED FOR ALL USERS) ---
// ====================================================================
    const LoginScreen = ({ onLogin, onForgot, onSignup, pendingUsers = [], activeUsers = [] }) => {
      const [mode, setMode] = useState('login');
      const [fnum, setfnum] = useState('');
      const [password, setPassword] = useState('');
      const [authMessage, setAuthMessage] = useState(null);
      
      const [signupData, setSignupData] = useState({
        fnum: '', ipps: '', name: '', rank: '', sex: 'MALE', region: 'KMP NORTH', station: 'KAWEMPE', position: '', email: '', phone: '', password: '', profile_photo_path: ''
      });
      const [photoFile, setPhotoFile] = useState(null);

      const availablePositions = [
        ...POSITIONS.ADMIN, ...POSITIONS.RPC, `${signupData.region} Commander`, `Divisional Commander ${signupData.station}`, `CID Officer ${signupData.station}`, `Data Officer ${signupData.station}`, `Data Assistant Officer ${signupData.station}`
      ];

      const [attempts, setAttempts] = useState(0);
      const [lockoutEnd, setLockoutEnd] = useState(null);
      const [timeLeft, setTimeLeft] = useState(0);

// 🟢 LOGIN SCREEN IDLE CURTAIN STATE
      const [isLoginIdle, setIsLoginIdle] = useState(false);
      const idleTimerRef = useRef(null);

      useEffect(() => {
        const IDLE_TIME = 30000; // 30 seconds of idle time

        const resetIdle = () => {
          setIsLoginIdle(false);
          clearTimeout(idleTimerRef.current);
          idleTimerRef.current = setTimeout(() => {
            setIsLoginIdle(true);
          }, IDLE_TIME);
        };

        // Start the clock on load
        resetIdle();

        // 🟢 Array includes 'keyup' and 'input' to detect typing
        const events = ['mousemove', 'keydown', 'keyup', 'input', 'click', 'scroll', 'touchstart'];
        
        // Attach all listeners automatically
        events.forEach(event => window.addEventListener(event, resetIdle, true));

        return () => {
          clearTimeout(idleTimerRef.current);
          // Remove all listeners automatically
          events.forEach(event => window.removeEventListener(event, resetIdle, true));
        };
      }, []); // 🟢 Empty array ensures the timer never resets prematurely!

      useEffect(() => {
        if (!lockoutEnd) return;
        const interval = setInterval(() => {
          const remaining = Math.ceil((lockoutEnd - Date.now()) / 1000);
          if (remaining <= 0) { setLockoutEnd(null); setAttempts(0); setTimeLeft(0); } else { setTimeLeft(remaining); }
        }, 1000);
        return () => clearInterval(interval);
      }, [lockoutEnd]);

      const handleSignupChange = (e) => {
        const { name, value } = e.target;
        if (name === 'region') setSignupData({ ...signupData, region: value, station: REGIONAL_HIERARCHY[value][0], position: '' });
        else if (name === 'station') setSignupData({ ...signupData, station: value, position: '' });
        else setSignupData({ ...signupData, [name]: value });
      };

      const handlePhotoUpload = async (e) => {
        const file = e.target.files[0];
        if (file) {
          setAuthMessage("⏳ Uploading photo...");
          const uploadData = new FormData(); uploadData.append("file", file); uploadData.append("fnum", signupData.fnum || "NEW_USER"); uploadData.append("category", "user_profile");
          try {
            const response = await fetch(`${API_URL}/api/v1/users/upload-profile`, { method: "POST", body: uploadData });
            if (!response.ok) throw new Error("Upload failed on server.");
            const data = await response.json();
            setSignupData(prev => ({ ...prev, profile_photo_path: data.full_s3_url || data.cloud_storage_path }));
            setAuthMessage("✅ Photo uploaded securely!"); setTimeout(() => setAuthMessage(null), 3000);
          } catch (error) {
            setSignupData(prev => ({ ...prev, profile_photo_path: URL.createObjectURL(file) })); setPhotoFile(file);
            setAuthMessage("⚠️ Network error: Using local preview. Photo will upload on submit.");
          }
        }
      };

      const handleSignupSubmit = async (e) => {
        e.preventDefault();
        if (!signupData.profile_photo_path) return setAuthMessage("⚠️ Error: Profile photo upload is mandatory.");
        if (!/^\d{10}$/.test(signupData.phone)) return setAuthMessage("⚠️ Error: Contact number must be exactly 10 digits.");

        setAuthMessage("⏳ Submitting authorization request...");
        try {
          const formData = new FormData();
          Object.keys(signupData).forEach(key => formData.append(key, signupData[key]));
          
          let derivedRole = 'USER';
          if (signupData.position === 'System Manager') derivedRole = 'SUPER_ADMIN';
          else if (POSITIONS.ADMIN.includes(signupData.position) || signupData.position.includes('Divisional Commander') || signupData.station === 'KMP HEADQUARTERS' || signupData.station === 'KMP Headquarters' || signupData.region === 'POLICE HEADQUARTERS') derivedRole = 'ADMIN';
          else if (POSITIONS.RPC.includes(signupData.position) || signupData.position.includes(`${signupData.region} Commander`)) derivedRole = 'RPC';
          
          formData.set("role", derivedRole);
          if (photoFile && signupData.profile_photo_path.startsWith('blob:')) formData.set("file", photoFile);

          const response = await fetch(`${API_URL}/api/v1/auth/signup`, { method: 'POST', body: formData });
          const data = await response.json();

          if (response.ok) {
            setAuthMessage("✅ Account Request Submitted! Awaiting Admin Approval.");
            if (onSignup) onSignup({ ...signupData, role: derivedRole });
            setTimeout(() => setMode('login'), 2000);
          } else { setAuthMessage(`❌ Registration Failed: ${data.detail || "Server error"}`); }
        } catch (error) { setAuthMessage("❌ Connection error. Could not reach server."); }
      };

      const handleLoginSubmit = async (e) => { 
        e.preventDefault();
        if (lockoutEnd) return;

        if (mode === 'login') {
          try {
            const formData = new URLSearchParams(); formData.append('username', fnum.trim()); formData.append('password', password.trim());
            const response = await fetch(`${API_URL}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: formData });
            const data = await response.json();

            if (response.ok) {
              localStorage.setItem('kmp_authToken', data.access_token);
              onLogin({ 
                  fnum: data.fnum || 'A/2408', rank: data.rank || 'AIP', name: data.name || 'Afedra Vincent', sex: data.sex || 'MALE', ipps: data.ipps || '950010',
                  region: data.region || 'KMP HEADQUARTERS', division: data.division || 'KMP HEADQUARTERS', station: data.station || 'KMP HEADQUARTERS',
                  position: data.position || 'System Manager', email: data.email || 'afedravnct@gmail.com', phone: data.phone || '0779302872', role: data.role || 'SUPER_ADMIN',
                  permissions: data.permissions || {}, profile_photo_path: data.profile_photo_path || ''
              });
            } else {
              setPassword(''); setAuthMessage(data.detail || "Incorrect Force Number or password");
              const newAttempts = attempts + 1; setAttempts(newAttempts);
              if (newAttempts >= 3) setLockoutEnd(Date.now() + 30000);
            }
          } catch (err) { setPassword(''); setAuthMessage("Network error. Could not connect to the server."); }
        } else if (mode === 'forgot') {
          try {
            const formData = new URLSearchParams(); formData.append('fnum', fnum.trim());
            const response = await fetch(`${API_URL}/api/v1/auth/request-reset`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: formData });
            const data = await response.json();
            if (response.ok) { setMode('login'); setfnum(''); setAuthMessage("✅ " + (data.message || "Account recovery requested.")); } 
            else { setAuthMessage(`❌ ${data.detail || "Failed to submit request."}`); }
          } catch (err) { setAuthMessage("❌ Network error. Could not connect to the server."); }
        }
      };

      return (
        <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-4 relative overflow-hidden">
          
          {/* 🟢 THE FULL-SCREEN LOGIN CURTAIN */}
          <div 
            className={`security-curtain-overlay fixed inset-0 z-50 bg-slate-900 flex flex-col items-center justify-center transition-opacity duration-700 ease-in-out ${
              isLoginIdle ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
            }`}
          >
            {/* Top Flag Stripes */}
            <div className="absolute top-0 w-full h-2 bg-[#000000]"></div>
            <div className="absolute top-2 w-full h-2 bg-[#facc15]"></div>
            <div className="absolute top-4 w-full h-2 bg-[#dc2626]"></div>

            {/* Faded Background Emblem Watermark */}
            <div 
              className="absolute inset-0 opacity-10 bg-center bg-no-repeat bg-cover pointer-events-none" 
              style={{ backgroundImage: `url('/UPF Flag Emblem.png')` }}
            ></div>

            <div className="relative z-10 flex flex-col items-center text-center p-6 max-w-3xl">
              <div className="upf-css-globe mb-6 border border-slate-600/50"></div>
              
              {/* Sweep-and-Settle Animated Title */}
              <div className="curtain-title-container">
                <h2 className="text-2xl sm:text-3xl font-extrabold text-center text-white tracking-widest uppercase drop-shadow-lg flex justify-center flex-wrap leading-relaxed">
                  {"KMP CENTRALISED SECURITY DATA MANAGEMENT SYSTEM".split("").map((char, index) => {
                    const delay = Math.pow(index, 1.2) * 0.025; 
                    return (
                      <span
                        key={index}
                        className="animate-sweep-letter"
                        style={{ 
                          animationDelay: `${delay}s`,
                          whiteSpace: "pre" 
                        }}
                      >
                        {char === " " ? "\u00A0" : char}
                      </span>
                    );
                  })}
                </h2>
              </div>

              {/* Subtitle Badge */}
              <div className="mt-6 inline-flex items-center space-x-2 bg-slate-900/90 px-5 py-2.5 rounded-full border border-cyan-500/30 shadow-xl backdrop-blur-md">
                <Lock size={16} className="text-yellow-400 animate-bounce" />
                <span className="text-xs sm:text-sm font-bold text-blue-200 tracking-wider">
                  KMP TRACKER SYSTEM - KMPCSDMS160626 • IDLE STANDBY MODE
                </span>
                <Globe size={18} className="text-cyan-400 animate-spin-globe" />
              </div>

              <p className="text-xs text-slate-400 mt-4 font-medium tracking-wide">
                Move your mouse, click, or press any key to return to the login interface.
              </p>
            </div>

            {/* Bottom Flag Stripes */}
            <div className="absolute bottom-4 w-full h-2 bg-[#dc2626]"></div> 
            <div className="absolute bottom-2 w-full h-2 bg-[#facc15]"></div> 
            <div className="absolute bottom-0 w-full h-2 bg-[#000000]"></div> 
          </div>

          {/* MAIN CARD CONTAINER */}
          <div className="max-w-xl w-full bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden relative z-10">
            
            {/* 🟢 LOGIN / SIGNUP FORM AREA */}
            <div className="bg-slate-900 p-6 text-center relative">
              <img 
                src="/upf_badge.png" 
                alt="UPF Logo" 
                className="w-24 h-24 mx-auto mb-4 object-contain contrast-200 brightness-75 drop-shadow-sm" 
                onError={(e) => { e.target.onerror = null; e.target.style.display = 'none'; e.target.nextSibling.style.display = 'block'; }} 
              />
              <h1 className="text-2xl font-extrabold text-white tracking-wide">Uganda Police Force</h1>
              <h2 className="text-lg font-bold text-blue-400 mt-1">Kampala Metropolitan Police Headquarters</h2>
              <h3 className="text-sm font-medium text-slate-400 mt-2 uppercase tracking-widest">Centralised Security Data Management System Access Portal</h3>
            </div>
            
            <div className="p-6">
              {lockoutEnd ? (
                <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-lg text-center">
                  <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-red-500"/>
                  <h3 className="font-bold text-lg">Too Many Attempts</h3>
                  <p className="text-sm mt-1">Account locked for security purposes. Please wait <span className="font-bold">{timeLeft} seconds</span> before trying again.</p>
                </div>
              ) : (
                <>
                  {authMessage && (
                    <div className={`border px-4 py-3 rounded-lg flex items-center mb-4 ${authMessage.includes('Error') || authMessage.includes('❌') ? 'bg-red-50 border-red-200 text-red-800' : 'bg-blue-50 border-blue-200 text-blue-800'}`}>
                     <span className="text-sm font-medium">{typeof authMessage === 'string' ? authMessage : JSON.stringify(authMessage)}</span>
                    </div>
                  )}
                  
                  {mode === 'signup' ? (
                    <form onSubmit={handleSignupSubmit} className="space-y-4 max-h-[60vh] overflow-y-auto custom-scrollbar pr-2">
                      <h3 className="text-lg font-bold text-gray-800 border-b pb-2 mb-4">Request Access Authorization</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-1">File/Force Number *</label>
                          <input type="text" name="fnum" required value={signupData.fnum} onChange={handleSignupChange} className="w-full p-2 border border-gray-300 rounded focus:ring-blue-500 uppercase text-sm" placeholder="e.g. A/2408"/>
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-1">IPPS Number *</label>
                          <input type="text" name="ipps" required maxLength="6" value={signupData.ipps} onChange={handleSignupChange} className="w-full p-2 border border-gray-300 rounded focus:ring-blue-500 text-sm" placeholder="123456"/>
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-1">Full Name *</label>
                          <input type="text" name="name" required value={signupData.name} onChange={handleSignupChange} className="w-full p-2 border border-gray-300 rounded focus:ring-blue-500 text-sm" />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-1">Rank *</label>
                          <input type="text" name="rank" required value={signupData.rank} onChange={handleSignupChange} className="w-full p-2 border border-gray-300 rounded focus:ring-blue-500 text-sm" placeholder="e.g. AIP"/>
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-1">Region *</label>
                          <select name="region" value={signupData.region} onChange={handleSignupChange} required className="w-full p-2 border border-gray-300 rounded focus:ring-blue-500 text-sm">
                            {Object.keys(REGIONAL_HIERARCHY).map(reg => <option key={reg} value={reg}>{reg}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-1">Station *</label>
                          <select name="station" value={signupData.station} onChange={handleSignupChange} required className="w-full p-2 border border-gray-300 rounded focus:ring-blue-500 text-sm">
                            {REGIONAL_HIERARCHY[signupData.region]?.map(stat => <option key={stat} value={stat}>{stat}</option>)}
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">Position / Title *</label>
                        <select name="position" value={signupData.position} onChange={handleSignupChange} required className="w-full p-2 border border-gray-300 rounded focus:ring-blue-500 text-sm">
                          <option value="">-- Select Official Title --</option>
                          {availablePositions.map(pos => <option key={pos} value={pos}>{pos}</option>)}
                        </select>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-1">Email *</label>
                          <input type="email" name="email" required value={signupData.email} onChange={handleSignupChange} className="w-full p-2 border border-gray-300 rounded focus:ring-blue-500 text-sm" />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-1">Telephone *</label>
                          <input type="tel" name="phone" required maxLength="10" pattern="\d{10}" value={signupData.phone} onChange={handleSignupChange} className="w-full p-2 border border-gray-300 rounded focus:ring-blue-500 text-sm" placeholder="e.g. 0772123456" />
                        </div>
                      </div>
                      <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                        <label className="block text-xs font-bold text-gray-700 mb-2">Officer Identification Photo (Mandatory) *</label>
                        <div className="flex items-center space-x-4">
                          {signupData.profile_photo_path ? (
                            <img src={signupData.profile_photo_path} alt="Preview" className="w-16 h-16 rounded-full object-cover border-2 border-blue-500 shadow-sm" />
                          ) : (
                            <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center text-gray-400 border-2 border-dashed border-gray-300"><Camera size={24} /></div>
                          )}
                          <div className="flex-1">
                            <input type="file" accept="image/*" required onChange={handlePhotoUpload} className="text-xs w-full text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-bold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer" />
                            <p className="text-xs text-gray-400 mt-1">Directly uploads to secure storage</p>
                          </div>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">Create Password *</label>
                        <input type="password" name="password" required value={signupData.password} onChange={handleSignupChange} className="w-full p-2 border border-gray-300 rounded focus:ring-blue-500 text-sm" />
                      </div>
                      <div className="pt-4 flex flex-col space-y-3">
                        <button type="submit" className="w-full bg-slate-900 hover:bg-black text-white font-bold py-3 rounded-lg transition-colors text-sm">Submit Registration Request</button>
                        <button type="button" onClick={() => setMode('login')} className="text-sm text-blue-600 hover:underline font-medium">Cancel and return to Login</button>
                      </div>
                    </form>
                  ) : (
                    <form onSubmit={handleLoginSubmit} className="space-y-4">
                      {attempts > 0 && mode === 'login' && (
                        <div className="text-xs text-red-600 font-bold bg-red-50 p-2 rounded text-center">
                          Invalid credentials. Attempts remaining: {3 - attempts}
                        </div>
                      )}
                      <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Force Number</label>
                        <div className="relative">
                          <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"/>
                          <input type="text" required value={fnum} onChange={(e) => setfnum(e.target.value)} className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none uppercase" placeholder="e.g. A/2408 or 63034"/>
                        </div>
                      </div>
                      {mode === 'login' && (
                        <div>
                          <label className="block text-sm font-bold text-gray-700 mb-1">Security Key (Password)</label>
                          <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"/>
                            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" placeholder="••••••••"/>
                          </div>
                        </div>
                      )}
                      <button type="submit" className="w-full bg-blue-700 hover:bg-blue-800 text-white font-bold py-3 rounded-lg transition-colors">
                        {mode === 'login' ? 'Authorize Access' : 'Request Password Reset'}
                      </button>
                      <div className="text-center mt-4 flex justify-between px-4">
                        <button type="button" onClick={() => {setMode(mode === 'login' ? 'forgot' : 'login'); setAttempts(0);}} className="text-sm text-slate-600 hover:text-blue-600 hover:underline font-medium">
                          {mode === 'login' ? 'Forgot Security Key?' : 'Back to Login'}
                        </button>
                        {mode === 'login' && (
                          <button type="button" onClick={() => setMode('signup')} className="text-sm text-blue-600 font-bold hover:underline">
                            Sign Up (Request Access)
                          </button>
                        )}
                      </div>
                    </form>
                  )}
                </>
              )}
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-6 flex items-center relative z-10">
            <Lock className="w-3 h-3 mr-1"/> Protected by Central Command Security Protocols
          </p>
        </div>
      );
    };


const GrandTotalBreakdownModal = ({ isOpen, onClose, allSubmissions, grandTotals }) => {
  if (!isOpen) return null;

  // Group submissions by Region and Station to build the drill-down tree
  const breakdownTree = {};
  
  allSubmissions.forEach(entry => {
    if (entry.is_hq_grand_total || (entry.station || '').includes('HEADQUARTERS GENERAL TOTAL')) return;
    
    const region = (entry.region || 'UNKNOWN REGION').trim().toUpperCase();
    const station = (entry.station || 'UNKNOWN STATION').trim().toUpperCase();
    const val = Number(entry.total_value || entry.count || entry.amount || entry.daily_lock_up) || 0;

    if (!breakdownTree[region]) {
      breakdownTree[region] = { total: 0, stations: {} };
    }
    if (!breakdownTree[region].stations[station]) {
      breakdownTree[region].stations[station] = 0;
    }
    
    breakdownTree[region].stations[station] += val;
    breakdownTree[region].total += val;
  });

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden border border-slate-300 animate-in zoom-in-95 flex flex-col max-h-[85vh]">
        
        {/* Header */}
        <div className="bg-slate-900 text-white px-6 py-4 flex justify-between items-center shrink-0">
          <div>
            <h3 className="font-extrabold uppercase text-sm tracking-wider flex items-center">
              <BarChart3 className="mr-2 text-blue-400" size={18} /> Grand Total Jurisdiction Breakdown
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">Hierarchical aggregation of regional and station entries.</p>
          </div>
          <button onClick={onClose} className="hover:bg-slate-800 p-1.5 rounded transition"><X size={18}/></button>
        </div>

        {/* Summary Banner */}
        <div className="bg-blue-50 border-b border-blue-100 p-4 px-6 flex justify-between items-center shrink-0">
          <div>
            <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">Active Master Lockup</span>
            <h2 className="text-2xl font-black text-slate-900">{grandTotals.displayTotal.toLocaleString()}</h2>
          </div>
          <div className="text-right">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Stations Sum</span>
            <div className="text-lg font-extrabold text-slate-800">{grandTotals.stationSum.toLocaleString()}</div>
          </div>
        </div>

        {/* Breakdown Content Tree */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 custom-scrollbar bg-slate-50">
          {Object.keys(breakdownTree).length === 0 ? (
            <p className="text-center text-xs text-slate-500 py-8">No station submissions found to aggregate.</p>
          ) : (
            Object.entries(breakdownTree).map(([regionName, regionData]) => (
              <div key={regionName} className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
                <div className="bg-slate-100 px-4 py-2.5 border-b border-slate-200 flex justify-between items-center">
                  <span className="text-xs font-black text-slate-900 tracking-wider uppercase">{regionName}</span>
                  <span className="text-xs font-extrabold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200">
                    {regionData.total.toLocaleString()} Total
                  </span>
                </div>
                <div className="divide-y divide-slate-100">
                  {Object.entries(regionData.stations).map(([stationName, stationVal]) => (
                    <div key={stationName} className="px-6 py-2.5 flex justify-between items-center text-xs hover:bg-slate-50 transition-colors">
                      <span className="font-semibold text-slate-700 uppercase">{stationName}</span>
                      <span className="font-bold text-slate-900">{stationVal.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="bg-white p-4 border-t border-slate-200 flex justify-end shrink-0">
          <button onClick={onClose} className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-xs uppercase tracking-wider shadow">
            Close Breakdown
          </button>
        </div>

      </div>
    </div>
  );
};

// ====================================================================
// --- GLOBAL WORKSPACE SECURITY IDLE CURTAIN & SESSION TIMEOUT COMPONENT ---
// ====================================================================
const WorkspaceSecurityCurtain = () => {
  const [isWorkspaceIdle, setIsWorkspaceIdle] = React.useState(false);
  const [isReadingMode, setIsReadingMode] = React.useState(false);
  const [isExpanded, setIsExpanded] = React.useState(false);
  
  // Session Timeout States
  const [showIdleWarning, setShowIdleWarning] = React.useState(false);
  const [idleCountdown, setIdleCountdown] = React.useState(60);
  const [isTimedOut, setIsTimedOut] = React.useState(false);

  const idleTimerRef = React.useRef(null);
  const sessionTimerRef = React.useRef(null);
  const countdownTimerRef = React.useRef(null);

  // 🟢 1. ROBUST USER ACTIVITY DETECTOR
  React.useEffect(() => {
    const IDLE_TIMEOUT_MS = 60000;          
    const SESSION_TIMEOUT_MS = 29 * 60 * 1000; 

    const handleUserActivity = () => {
      if (isTimedOut) return;
      
      if (!showIdleWarning) {
        setIsWorkspaceIdle(false);
      }

      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => {
        if (!isReadingMode && !showIdleWarning && !isTimedOut) {
          setIsWorkspaceIdle(true);
        }
      }, IDLE_TIMEOUT_MS);

      if (!showIdleWarning) {
        clearTimeout(sessionTimerRef.current);
        sessionTimerRef.current = setTimeout(() => {
          if (!isReadingMode && !isTimedOut) {
            setShowIdleWarning(true);
            setIsWorkspaceIdle(true);
            setIdleCountdown(60);

            if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
            countdownTimerRef.current = setInterval(() => {
              setIdleCountdown((prev) => {
                if (prev <= 1) {
                  clearInterval(countdownTimerRef.current);
                  setIsTimedOut(true);
                  return 0;
                }
                return prev - 1;
              });
            }, 1000);
          }
        }, SESSION_TIMEOUT_MS);
      }
    };

    handleUserActivity();

    const events = ['mousemove', 'mousedown', 'keydown', 'keyup', 'input', 'scroll', 'touchstart', 'click'];
    events.forEach(event => window.addEventListener(event, handleUserActivity, true));

    return () => {
      clearTimeout(idleTimerRef.current);
      clearTimeout(sessionTimerRef.current);
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
      events.forEach(event => window.removeEventListener(event, handleUserActivity, true));
    };
  }, [isReadingMode, showIdleWarning, isTimedOut]);

  if (!isWorkspaceIdle && !showIdleWarning && !isTimedOut) {
    return (
      <div className="fixed bottom-6 right-6 z-[99990]">
        <div
          onMouseEnter={() => setIsExpanded(true)}
          onMouseLeave={() => setIsExpanded(false)}
          onClick={() => {
            setIsReadingMode(!isReadingMode);
            setIsWorkspaceIdle(false);
          }}
          className={`flex items-center transition-all duration-300 ease-in-out cursor-pointer shadow-2xl rounded-full border ${
            isExpanded ? 'px-4 py-2' : 'p-2'
          } ${
            isReadingMode 
              ? 'bg-amber-500 text-slate-950 border-amber-300 shadow-[0_0_15px_rgba(245,158,11,0.5)]' 
              : 'bg-slate-900/90 text-slate-200 border-slate-700 hover:bg-slate-800'
          }`}
        >
          <span className={`relative flex h-3 w-3 ${isExpanded ? 'mr-2.5' : ''}`}>
            <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${isReadingMode ? 'bg-slate-950 animate-ping' : 'bg-green-400 animate-ping'}`}></span>
            <span className={`relative inline-flex rounded-full h-3 w-3 ${isReadingMode ? 'bg-slate-950' : 'bg-green-500'}`}></span>
          </span>
          {isExpanded && (
            <span className="font-bold text-xs uppercase tracking-wider whitespace-nowrap">
              {isReadingMode ? 'Click to stop curtain' : '🛡️ Standard Idle Guard'}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div 
      className="fixed inset-0 flex flex-col items-center justify-center overflow-hidden"
      style={{
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        zIndex: 2147483647,
        pointerEvents: 'auto',
        isolation: 'isolate'
      }}
    >
      <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-md transition-opacity duration-700 ease-in-out flex flex-col items-center justify-center">
        <div className="absolute inset-0 opacity-15 pointer-events-none flex flex-col justify-between z-0">
          <div className="h-1/3 w-full bg-black"></div>
          <div className="h-1/3 w-full bg-[#FCD116]"></div>
          <div className="h-1/3 w-full bg-[#D91B23]"></div>
        </div>
        <div className="idle-backdrop-emblem z-10 pointer-events-none"></div>

        <div className="idle-center-container relative z-20 flex items-center justify-center mx-auto my-auto" style={{ perspective: '1200px', transformStyle: 'preserve-3d' }}>
          <div className="spinning-map-globe absolute inset-0 w-full h-full" style={{ backgroundImage: `url('/upf_kmp_map.png')`, transform: 'translateZ(0)' }}></div>
          
          <div className="absolute inset-0 z-30 pointer-events-none" style={{ transformStyle: 'preserve-3d', animation: 'spin-orbit-y 20s linear infinite' }}>
            {"KMP CENTRALISED SECURITY DATA MANAGEMENT SYSTEM • KMP CENTRALISED SECURITY DATA MANAGEMENT SYSTEM • ".split('').map((char, i, arr) => (
              <span 
                key={i} 
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white font-black text-xs sm:text-sm tracking-widest drop-shadow-[0_0_5px_rgba(255,255,255,0.8)]"
                style={{ transform: `rotateY(${i * (360 / arr.length)}deg) translateZ(38vmin)` }}
              >
                {char === ' ' ? '\u00A0' : char}
              </span>
            ))}
          </div>
        </div>
      </div>

      {showIdleWarning && (
        <div className="relative z-[2147483647] bg-white rounded-2xl p-6 sm:p-8 max-w-md w-full mx-4 shadow-2xl border border-slate-200 text-center animate-in zoom-in-95 duration-200 pointer-events-auto">
          {isTimedOut ? (
            <>
              <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-100 shadow-inner">
                <AlertTriangle className="w-8 h-8 text-red-600" />
              </div>
              <h4 className="text-xl font-extrabold text-slate-900 mb-2">
                Session Expired Due to Inactivity
              </h4>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed font-medium mb-6">
                Your security token has expired because the system was left unattended. You have been securely logged out.
              </p>
              <button 
                type="button"
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  localStorage.removeItem('kmp_authToken');
                  localStorage.removeItem('kmp_currentUser');
                  localStorage.removeItem('kmp_currentPage');
                  sessionStorage.clear();
                  window.location.replace('/');
                }}
                className="w-full py-3.5 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl shadow-md transition-none cursor-pointer"
                style={{ position: 'relative', zIndex: 2147483647, pointerEvents: 'auto' }}
              >
                Acknowledge & Return to Login
              </button>
            </>
          ) : (
            <>
              <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-amber-200 shadow-inner">
                <AlertTriangle className="w-8 h-8 text-amber-600" />
              </div>
              <h4 className="text-xl font-extrabold text-slate-900 mb-2">
                Session Timeout Warning
              </h4>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed font-medium mb-6">
                Your session will expire in <span className="font-bold text-red-600">{idleCountdown}s</span> due to inactivity. Click below to continue working.
              </p>
              <button 
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setShowIdleWarning(false);
                  setIdleCountdown(60);
                }}
                className="w-full py-3.5 bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl shadow-md transition cursor-pointer"
              >
                Continue Session
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

// ====================================================================
// --- MAIN LAYOUT COMPONENT ---
// ====================================================================
const DashboardLayout = ({ 
  currentUser, 
  currentPage, 
  setCurrentPage, 
  children, 
  onLogout, 
  onGenerateOpsReport, 
  onViewOpsReport,     
  onGenerateHRReport, 
  onViewHRReport,
  onViewConsolidated, 
  users, 
  onRevokeUser, 
  onUpdateUserRole, 
  adminCommsData
}) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showOnline, setShowOnline] = useState(false);
  const [showAllUsers, setShowAllUsers] = useState(false);
  const [selectedUserDetail, setSelectedUserDetail] = useState(null);
  const [viewingProfileImage, setViewingProfileImage] = useState(null);
  const [newForcePassword, setNewForcePassword] = useState('');
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [isAnimating, setIsAnimating] = useState(true);
  const [isMotionExpanded, setIsMotionExpanded] = useState(false);

  const [lastViewedId, setLastViewedId] = useState(() => {
    const saved = localStorage.getItem('last_viewed_comm_id');
    return saved ? JSON.parse(saved) : 0;
  });

  const [realOnlineUsers, setRealOnlineUsers] = useState([]);

  useEffect(() => {
    const handleAuthExpired = () => setIsTimedOut(true);
    window.addEventListener('auth-expired', handleAuthExpired);
    return () => window.removeEventListener('auth-expired', handleAuthExpired);
  }, []);

  useEffect(() => {
    const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

    const syncHeartbeat = async () => {
      const currentToken = localStorage.getItem('kmp_authToken');
      if (!currentToken) return;

      try {
        const hb = await fetch(`${API_URL}/api/v1/users/heartbeat`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${currentToken}` }
        });

        if (hb.status === 401) {
          window.dispatchEvent(new Event('auth-expired'));
          return;
        }

        if (hb.ok) {
          const hbData = await hb.json();
          if (hbData.new_token) {
            localStorage.setItem('kmp_authToken', hbData.new_token);
          }
        }

        const freshToken = localStorage.getItem('kmp_authToken');
        const response = await fetch(`${API_URL}/api/v1/users/online`, {
          headers: { 'Authorization': `Bearer ${freshToken}` }
        });
        
        if (response.ok) {
          setRealOnlineUsers(await response.json());
        }
      } catch (err) {
        console.warn("Heartbeat sync paused...");
      }
    };

    syncHeartbeat();
    const heartbeatInterval = setInterval(syncHeartbeat, 240000);
    return () => clearInterval(heartbeatInterval);
  }, []);

  const [showIdleWarning, setShowIdleWarning] = useState(false);
  const [idleCountdown, setIdleCountdown] = useState(60);
  const [isTimedOut, setIsTimedOut] = useState(false);
  
  const isWarningActive = useRef(false);
  const resetIdleTimersRef = useRef(null);
  const latestOnLogout = useRef(onLogout);

  useEffect(() => {
    latestOnLogout.current = onLogout;
  }, [onLogout]);

  useEffect(() => {
    let warningTimer;
    let logoutTimer;
    let countdownInterval;
    let activityThrottle;

    const IDLE_LIMIT = 29 * 60 * 1000; 
    const WARNING_WINDOW = 60 * 1000;  

    const startTimers = () => {
      if (isTimedOut) return;
      clearTimeout(warningTimer);
      clearTimeout(logoutTimer);
      clearInterval(countdownInterval);

      isWarningActive.current = false;
      setShowIdleWarning(false);

      warningTimer = setTimeout(() => {
        isWarningActive.current = true;
        setShowIdleWarning(true);
        setIdleCountdown(WARNING_WINDOW / 1000);
        
        countdownInterval = setInterval(() => {
          setIdleCountdown(prev => {
            if (prev <= 1) {
              clearInterval(countdownInterval);
              setIsTimedOut(true);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      }, IDLE_LIMIT);

      logoutTimer = setTimeout(() => {
        clearInterval(countdownInterval);
        isWarningActive.current = false;
        setIsTimedOut(true);
      }, IDLE_LIMIT + WARNING_WINDOW);
    };

    resetIdleTimersRef.current = startTimers;

    const handleUserActivity = () => {
      if (isWarningActive.current || isTimedOut) return;
      if (!activityThrottle) {
         activityThrottle = setTimeout(() => {
            startTimers();
            activityThrottle = null;
         }, 2000); 
      }
    };

    const events = ['mousemove', 'keydown', 'keyup', 'input', 'mousedown', 'scroll', 'touchstart', 'click'];
    events.forEach(event => window.addEventListener(event, handleUserActivity, true));
    startTimers();

    return () => {
      clearTimeout(warningTimer);
      clearTimeout(logoutTimer);
      clearInterval(countdownInterval);
      clearTimeout(activityThrottle);
      events.forEach(event => window.removeEventListener(event, handleUserActivity, true));
    };
  }, [isTimedOut]);

  const lastLoggedPage = useRef(null);

  useEffect(() => {
    if (!currentUser?.fnum || !currentPage) return;
    if (lastLoggedPage.current === currentPage) return;
    
    lastLoggedPage.current = currentPage;
    const token = localStorage.getItem('kmp_authToken');
    if (!token) return;

    const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
    fetch(`${API_URL}/api/v1/activity-logs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ 
        fnum: currentUser.fnum, 
        action: 'PAGE_ACCESS', 
        module: currentPage, 
        details: `User accessed ${currentPage}` 
      })
    }).catch(err => console.error("Activity log error:", err));

  }, [currentPage, currentUser?.fnum]);

  const safeSidebarComms = Array.isArray(adminCommsData) ? adminCommsData : (adminCommsData?.data || adminCommsData?.items || []);
  const relevantComms = safeSidebarComms.filter(c => {
    if (currentUser?.role === 'SUPER_ADMIN') return true;
    const audience = c.target_audience || c.audience || 'ALL_USERS';
    const region = c.target_region || c.region;
    if (audience === 'ALL_USERS' || audience === 'ALL') return true;
    if (audience === 'ADMINS_ONLY' && ['ADMIN', 'SUPER_ADMIN'].includes(currentUser?.role)) return true;
    if (audience === 'RPC_ONLY' && ['ADMIN', 'SUPER_ADMIN', 'RPC'].includes(currentUser?.role)) return true;
    if (audience === 'SPECIFIC_REGION' && region === currentUser?.region) return true;
    if (audience === 'SPECIFIC_USER' && c.target_fnum === currentUser?.fnum) return true;
    return false;
  });

  const hasUnreadComms = relevantComms.some(c => !c.acknowledged);

  const hasNominalClearance = ['ADMIN', 'SUPER_ADMIN', 'RPC', 'Deputy Commander'].includes(currentUser?.role) || 
                              (currentUser?.position || '').toUpperCase().includes('HR') ||
                              currentUser?.permissions?.view_nominal_roll || 
                              currentUser?.permissions?.upload_hr || 
                              currentUser?.permissions?.system_admin;

  const navItems = [
    { 
      name: 'Home Dashboard', 
      id: 'home', 
      icon: (
        <div className="relative flex items-center justify-center">
          <Home size={20} />
          {hasUnreadComms && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-green-500 rounded-full shadow-[0_0_8px_#22c55e] animate-ping" />}
          {hasUnreadComms && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-green-500 rounded-full" />}
        </div>
      )
    },
    { name: 'Command Communications', id: 'Admin_Communication', icon: <Bell size={20} /> },
    { name: 'Crime/Incident Registry', id: 'reports', icon: <LayoutDashboard size={20} /> },
    { name: 'Disruptive OPS Statistics', id: 'statistics', icon: <BarChart3 size={20} /> },
    { name: 'Success Stories', id: 'success', icon: <Trophy size={20} /> },
    { name: 'Establishments', id: 'establishments', icon: <Building size={20} /> },
    { name: 'Analytics & Reports', id: 'analytics', icon: <PieChart size={20} /> },
    ...(hasNominalClearance ? [{ name: 'Nominal Roll', id: 'nominal-roll', icon: <Users size={20} /> }] : []),
    { name: 'Tripartite Reports', id: 'reports_hub', icon: <FileText size={20} /> }
  ];

  const handleExportLogs = async () => {
    try {
      const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
      const token = localStorage.getItem('kmp_authToken');
      const response = await fetch(`${API_URL}/api/v1/audit-logs`, { headers: { 'Authorization': `Bearer ${token}` } });
      if (!response.ok) throw new Error("Security Clearance Denied");

      const logs = await response.json();
      const headers = ["ID", "Event Type", "Target User", "Status", "Details", "Created At", "User FNUM"];
      
      const csvRows = logs.map(log => [
          log.id, 
          log.event_type || "N/A", 
          log.target_user || "N/A",
          log.status || "N/A",
          `"${(log.details || "").replace(/"/g, '""')}"`, 
          log.created_at || "Unknown Time",
          log.user_fnum || "SYSTEM"
      ]);

      const csvContent = [headers, ...csvRows].map(e => e.join(",")).join("\n");
      const blob = new Blob(['\uFEFF', csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.style.display = 'none';
      link.setAttribute("href", url);
      link.setAttribute("download", `KMP_Command_Audit_Logs_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      
      setTimeout(() => {
         document.body.removeChild(link);
         window.URL.revokeObjectURL(url);
      }, 2000);
      
    } catch (error) {
      console.error("Download failed:", error);
      alert("Failed to download logs. You may not have Super Admin clearance.");
    }
  };

  return (
    <>
      <div className="flex h-screen bg-gray-50 font-sans overflow-hidden">
        
        {/* 🟢 SIDEBAR */}
        <div className={`transition-all duration-300 flex flex-col bg-slate-900 border-r border-slate-700 flex-shrink-0 overflow-hidden ${
          isFullScreen 
            ? 'hidden w-0' 
            : (sidebarOpen ? 'w-72 md:w-80' : 'w-16')
        }`}>
          <div className={`p-5 flex items-center border-b border-slate-700 bg-slate-900 sticky top-0 z-50 transition-all ${sidebarOpen ? 'justify-between' : 'justify-center'}`}>
            {sidebarOpen && (
              <div className="flex items-center min-w-max">
                <div className="rounded-full bg-cover bg-repeat-x shrink-0 mr-2 border border-slate-700/50" style={{ width: '20px', height: '20px', backgroundImage: "url('/UPF Flag Emblem.png')", animation: "spinFauxGlobe 28s linear infinite", boxShadow: "inset -3px -3px 5px rgba(0, 0, 0, 0.8), inset 1px 1px 2px rgba(255, 255, 255, 0.5), 0 0 3px rgba(255, 255, 255, 0.2)" }}></div>
                <span className="font-bold text-[10px] tracking-wider text-white">KMP TRACKER SYSTEM</span>
              </div>
            )}
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2.5 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 rounded-lg text-slate-100 transition-colors shrink-0 shadow-md border border-slate-600 cursor-pointer flex items-center justify-center" aria-label="Toggle Sidebar">
              {sidebarOpen ? <X size={22} className="text-yellow-400 animate-in spin-in-90 duration-200" /> : <Menu size={22} className="text-yellow-400 animate-in spin-in-[-90deg] duration-200" />}
            </button>
          </div>
              
          <div className="flex-1 overflow-y-auto py-2 custom-scrollbar overflow-x-hidden">
            {sidebarOpen && <div className="px-6 mb-2 text-xs font-bold text-orange-500 uppercase tracking-wider min-w-max">📋 Select Domain Category</div>}
            
            <nav className="space-y-1 mb-8">
              {navItems.map((item) => (
                <button 
                  key={item.id} 
                  onClick={() => {
                    setCurrentPage(item.id);
                    if (item.id === 'Admin_Communication') {
                      const safeId = typeof latestCommId !== 'undefined' ? latestCommId : Date.now();
                      setLastViewedId(safeId);
                      localStorage.setItem('last_viewed_comm_id', JSON.stringify(safeId));
                    }
                  }}
                  className={`w-full flex items-center py-3 transition-colors text-left ${sidebarOpen ? 'px-6' : 'px-0 justify-center'} ${currentPage === item.id ? 'bg-blue-600 border-l-4 border-yellow-400 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent'}`}
                >
                  <div className="min-w-[24px] flex justify-center shrink-0">{item.icon}</div>
                  {sidebarOpen && (
                    <span className={`ml-3 font-medium text-sm flex items-center justify-between flex-1 min-w-max ${item.id === 'home' && hasUnreadComms ? 'text-green-200 font-extrabold animate-pulse' : ''}`}>
                      {item.name}
                      {item.id === 'home' && hasUnreadComms && <span className="text-[9px] bg-green-200/20 text-green-200 border border-green-200 px-1.5 py-0.5 rounded uppercase tracking-wider ml-2">New Dispatch</span>}
                    </span>
                  )}
                </button>
              ))}
            </nav>

            {sidebarOpen && (['ADMIN', 'SUPER_ADMIN'].includes(currentUser?.role) || currentUser?.permissions?.system_admin || ['KMP COMMANDER', 'DEPUTY KMP COMMANDER', 'STAFF OFFICER ADMIN', 'SO ADMIN'].some(title => (currentUser?.position || '').toUpperCase().includes(title))) && (
              <>
                <div className="px-4 space-y-3 min-w-max">
                  <div className={`rounded-lg p-3 transition-colors ${currentPage === 'approvals' ? 'bg-slate-700 border border-slate-600' : 'bg-slate-800'}`}>
                    <div className="text-sm font-bold mb-2 flex items-center"><UserPlus size={16} className="mr-2"/> Access & Approvals</div>
                    <button onClick={() => setCurrentPage('approvals')} className={`w-full text-xs py-4 rounded transition font-medium ${currentPage === 'approvals' ? 'bg-green-600 text-white' : 'bg-slate-300 hover:bg-slate-600 text-slate-900 hover:text-white'}`}>
                      Manage Pending Users & Logs
                    </button>
                  </div>
                </div>
                <div className="rounded-lg p-4 bg-slate-800 mx-4 mt-3">
                  <button type="button" onClick={() => setShowOnline(!showOnline)} className="w-full flex justify-between items-center text-sm font-bold text-green-400">
                    <span className="flex items-center"><RadioReceiver size={16} className="mr-3"/> 🟢 Active Online ({realOnlineUsers?.length || 0})</span>
                  </button>
                  {showOnline && (
                    <div className="mt-4 space-y-2 border-t border-slate-700 pt-4 max-h-40 overflow-y-auto custom-scrollbar pr-1">
                      {realOnlineUsers.map((user) => (
                        <div key={user.fnum} onClick={() => { setSelectedUserDetail({ ...user, isSystemUser: true, isReadOnly: true }); setNewForcePassword(''); }} className="text-xs bg-slate-800 p-2 rounded-lg hover:bg-slate-950 border border-transparent hover:border-green-500 cursor-pointer transition-all flex items-center justify-between group">
                          <div className="flex items-center space-x-3">
                            {user.profile_photo_path ? (
                              <img src={user.profile_photo_path} alt="" className="w-7 h-7 rounded-full border border-green-400 object-cover shadow-sm group-hover:border-green-300 transition-colors" onError={(e) => { e.target.style.display='none'; }} />
                            ) : (
                              <div className="w-7 h-7 bg-green-600 rounded-full flex items-center justify-center text-white font-bold shadow-sm">{user.name?.charAt(0) || 'U'}</div>
                            )}
                            <div>
                              <span className="font-bold text-white block truncate w-32">{user.name} {user.fnum === currentUser.fnum ? '(You)' : ''}</span>
                              <span className="text-slate-400 text-[9px] uppercase tracking-wider">{user.station}</span>
                            </div>
                          </div>
                          <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_5px_#22c55e] animate-pulse"></div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {sidebarOpen && (['ADMIN', 'SUPER_ADMIN'].includes(currentUser?.role) || currentUser?.permissions?.view_global_roster) && (
              <div className="px-4 mt-3 space-y-3 min-w-max">
                <div className="rounded-lg p-3 bg-slate-800 border border-slate-700">
                  <button onClick={() => setShowAllUsers(!showAllUsers)} className="w-full flex justify-between items-center text-sm font-bold text-blue-400">
                    <span className="flex items-center"><Users size={16} className="mr-2"/> 👥 System Roster</span>
                    <span className="bg-slate-900 px-2 py-0.5 rounded-full text-xs text-white border border-slate-600">{users?.length || 0}</span>
                  </button>
                  {showAllUsers && (
                   <div className="mt-3 space-y-2 border-t border-slate-700 pt-3 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                      {users?.map(u => (
                         <div key={u.fnum} onClick={() => { setSelectedUserDetail({ ...u, isSystemUser: true, isReadOnly: false }); setNewForcePassword(''); }} className="text-xs bg-slate-900 p-2 rounded hover:bg-slate-950 border border-transparent hover:border-blue-500 cursor-pointer transition-all flex items-center justify-between group">
                            <div className="flex items-center space-x-2">
                              {u.profile_photo_path ? (
                                <img src={u.profile_photo_path} alt="" className="w-7 h-7 rounded-full object-cover border border-slate-600 group-hover:border-blue-400" onError={(e) => { e.target.style.display='none'; }} />
                              ) : (
                                <div className="w-7 h-7 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center font-bold text-xs border border-slate-600 group-hover:border-blue-400 group-hover:text-blue-300">{u.name?.charAt(0) || 'U'}</div>
                              )}
                              <div>
                                <span className="font-bold text-white block truncate w-28">{u.name}</span>
                                <span className="text-slate-400 font-mono text-[9px]">{u.fnum}</span>
                              </div>
                            </div>
                            <div className="text-[9px] px-1.5 py-0.5 bg-slate-800 rounded text-slate-300 font-bold uppercase border border-slate-700 group-hover:bg-blue-900 group-hover:text-blue-100 transition-colors">{String(u.role || 'USER').replace('_ADMIN', '')}</div>
                         </div>
                      ))}
                   </div>
                  )}
                </div>
              </div>
            )}

            {sidebarOpen && (
              <div className="px-4 mt-4 space-y-3 min-w-max pb-4">
                <div className="bg-slate-800 rounded-lg p-3 border border-yellow-600/30">
                  <div className="text-sm font-bold text-yellow-500 mb-3 flex items-center"><Shield size={16} className="mr-2"/> ⚙️ Reports & Ledgers</div>
                  <div className="space-y-4">
                    <div>
                      <span className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-1 block">HR & Establishments</span>
                      <div className="flex space-x-2">
                        <button onClick={onViewHRReport} className="flex-1 bg-blue-600 hover:bg-blue-500 text-white text-xs py-2 rounded transition flex items-center justify-center">
                          <Eye size={14} className="mr-1"/> View
                        </button>
                        {(['ADMIN', 'SUPER_ADMIN', 'RPC'].includes(currentUser?.role) || currentUser?.permissions?.export_data) && (
                          <button onClick={onGenerateHRReport} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white text-xs py-2 rounded transition flex items-center justify-center">
                            <Download size={14} className="mr-1"/> Export
                          </button>
                        )}
                      </div>
                    </div>
                    {(['ADMIN', 'SUPER_ADMIN'].includes(currentUser?.role) || currentUser?.permissions?.consolidated) && (
                      <button onClick={onViewConsolidated} className="w-full text-xs py-2 rounded transition flex items-center justify-center font-bold mt-3 bg-slate-900 hover:bg-slate-950 text-blue-400 border border-blue-900">
                        <Eye size={14} className="mr-2"/> Consolidated Entries
                      </button>
                    )}
                    {(['SUPER_ADMIN'].includes(currentUser?.role) || currentUser?.permissions?.export_data) && (
                      <button onClick={handleExportLogs} className="w-full mt-2 text-xs py-2 rounded transition font-bold bg-slate-900 hover:bg-slate-950 text-slate-300 border border-slate-700 flex items-center justify-center">
                        <Download size={14} className="mr-2 text-blue-400"/> Export Audit Logs
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className={`p-4 border-t border-slate-700 bg-slate-950 shrink-0 flex flex-col transition-all ${sidebarOpen ? '' : 'items-center'}`}>
            <div className={`flex items-center cursor-pointer hover:bg-slate-800 rounded transition-colors ${sidebarOpen ? 'mb-4 px-2 p-2' : 'justify-center p-2 mb-3'}`} onClick={() => setCurrentPage('profile')}>
               <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold text-sm shadow overflow-hidden shrink-0">
                 {currentUser?.profile_photo_path ? (
                   <img src={currentUser.profile_photo_path} alt="" className="w-full h-full object-cover" onError={(e) => { e.target.style.display='none'; }} />
                 ) : (currentUser?.name?.charAt(0) || 'A')}
               </div>
               {sidebarOpen && (
                 <div className="ml-3 flex-1 overflow-hidden min-w-max">
                   <div className="text-sm font-bold leading-tight truncate">{currentUser?.name || 'Guest'}</div>
                   <div className="text-xs font-bold text-green-400 uppercase truncate">{currentUser?.role || 'N/A'} • {currentUser?.station || 'N/A'}</div>
                 </div>
               )}
            </div>
            <button onClick={onLogout} className={`flex items-center w-full py-2 text-red-400 hover:bg-slate-800 rounded-lg transition-colors border border-transparent hover:border-red-900 ${sidebarOpen ? 'px-4 justify-start' : 'px-0 justify-center'}`}>
               <LogOut size={18} />
               {sidebarOpen && <span className="ml-3 font-medium text-sm min-w-max">Secure Logout</span>}
            </button>
          </div>
        </div>

        <main className="flex-1 overflow-y-auto bg-gray-50 w-full relative flex flex-col">
          
          <div className="absolute top-4 right-6 z-50 flex items-center space-x-2">
            <button 
              onMouseEnter={() => setIsMotionExpanded(true)}
              onMouseLeave={() => setIsMotionExpanded(false)}
              onClick={() => setIsAnimating(!isAnimating)}
              className={`transition-all duration-300 ease-in-out rounded-full shadow-md flex items-center justify-center border font-bold text-xs ${isMotionExpanded ? 'px-3.5 py-1.5 gap-2' : 'p-2'} ${isAnimating ? 'bg-amber-600 hover:bg-amber-700 text-white border-amber-500' : 'bg-slate-700 hover:bg-slate-800 text-slate-200 border-slate-600'}`}
              title={isAnimating ? "Pause Background Motion" : "Play Background Motion"}
            >
              <span className="text-sm">{isAnimating ? '⏸' : '▶'}</span>
              {isMotionExpanded && <span className="whitespace-nowrap animate-in fade-in duration-200 font-bold">{isAnimating ? 'Pause Motion' : 'Play Motion'}</span>}
            </button>

            <button onClick={() => setIsFullScreen(!isFullScreen)} className="bg-blue-400 hover:bg-blue-450 text-white px-3 py-1.5 rounded text-xs font-bold shadow-md transition-colors flex items-center gap-2 border border-blue-400">
              {isFullScreen ? '🗗' : '⛶'}
            </button>
          </div>

          <div className="absolute inset-0 pointer-events-none z-0 uganda-flag-wave-diagonal opacity-[0.10]" style={{ animationPlayState: isAnimating ? 'running' : 'paused' }}></div>
          <div className="fixed inset-0 pointer-events-none z-0 flex items-center justify-center opacity-[0.08]">
            <img src="/upf_badge.png" alt="watermark" className="w-1/2 max-w-2xl grayscale object-contain contrast-200 brightness-75 drop-shadow-sm" onError={(e) => { e.target.style.display = 'none'; }} />
          </div>
          
          {React.Children.map(children, child => 
            (React.isValidElement(child) && typeof child.type !== 'string') 
              ? React.cloneElement(child, { setSidebarOpen: setSidebarOpen }) 
              : child
          )}  
        </main>
      </div>

      {selectedUserDetail && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-y-auto max-h-[95vh] custom-scrollbar flex flex-col">
            <div className="bg-slate-900 text-white p-4 flex justify-between items-center shrink-0">
              <h3 className="font-bold flex items-center text-sm"><Shield size={18} className="text-blue-400 mr-2" /> ACCESS CLEARANCE MATRIX</h3>
              <button onClick={() => setSelectedUserDetail(null)} className="text-slate-400 hover:text-white transition-colors"><X size={20} /></button>
            </div>
            
            <div className="p-6">
              <div className="flex items-center space-x-4 mb-6 pb-4 border-b border-gray-100">
                <div className="w-16 h-16 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center font-extrabold text-2xl overflow-hidden shadow-sm border-2 border-blue-500">
                  {selectedUserDetail.profile_photo_path ? (
                     <img src={selectedUserDetail.profile_photo_path} alt="Profile" className="w-full h-full object-cover cursor-pointer hover:scale-110 transition-transform" onClick={() => setViewingProfileImage(selectedUserDetail.profile_photo_path)} />
                  ) : (selectedUserDetail.name?.charAt(0) || 'U')}
                </div>
              </div>

              <h4 className="text-xs font-bold text-slate-800 mb-3 uppercase tracking-wider">Comprehensive Profile</h4>
              <div className="grid grid-cols-2 gap-4 mb-6 bg-slate-50 p-4 rounded-lg border border-slate-200 shadow-inner">
                <div><label className="text-[9px] font-bold text-slate-400 uppercase">IPPS Number</label><div className="text-xs font-bold text-slate-800">{selectedUserDetail.ipps || 'N/A'}</div></div>
                <div><label className="text-[9px] font-bold text-slate-400 uppercase">Official Title</label><div className="text-xs font-bold text-slate-800">{selectedUserDetail.position || 'N/A'}</div></div>
                <div className="col-span-2"><label className="text-[9px] font-bold text-slate-400 uppercase">Command Chain (Region / Division)</label><div className="text-xs font-bold text-slate-800">{selectedUserDetail.region || 'N/A'} / {selectedUserDetail.division || 'N/A'}</div></div>
                <div><label className="text-[9px] font-bold text-slate-400 uppercase">Email Contact</label><div className="text-xs font-bold text-slate-800 break-words">{selectedUserDetail.email || 'N/A'}</div></div>
                <div><label className="text-[9px] font-bold text-slate-400 uppercase">Phone Number</label><div className="text-xs font-bold text-slate-800">{selectedUserDetail.phone || 'N/A'}</div></div>
                <div><label className="text-[9px] font-bold text-slate-400 uppercase">Sex</label><div className="text-xs font-bold text-slate-800">{selectedUserDetail.sex || 'N/A'}</div></div>
                <div><label className="text-[9px] font-bold text-slate-400 uppercase">System Role</label><div className="text-xs font-extrabold text-blue-700">{selectedUserDetail.role || 'USER'}</div></div>
              </div>

              {selectedUserDetail.isSystemUser && !selectedUserDetail.isReadOnly && (
                currentUser?.role === 'SUPER_ADMIN' || (currentUser?.role?.includes('ADMIN') && selectedUserDetail.role !== 'SUPER_ADMIN' && currentUser?.region === selectedUserDetail.region)
              ) && (
                <>
                  <h4 className="font-extrabold text-sm text-gray-900 border-b pb-2 flex items-center mb-4 mt-6"><Shield size={16} className="mr-2 text-red-600"/> Component Admin Clearances</h4>
                  <div className="space-y-3 bg-white p-4 rounded-lg border border-red-100 shadow-sm">
                     <label className="flex items-center space-x-3 cursor-pointer group">
                      <input type="checkbox" className="w-4 h-4 text-blue-500 rounded border-gray-300 focus:ring-blue-500" defaultChecked={String(selectedUserDetail.role || '').includes('ADMIN')} onChange={(e) => { const newRole = e.target.checked ? 'ADMIN' : 'USER'; onUpdateUserRole(selectedUserDetail.fnum, newRole, selectedUserDetail.permissions || {}); }} />
                      <div className="flex-1"><div className="text-sm font-bold text-slate-800 group-hover:text-blue-700 transition-colors">System Administrator</div><div className="text-xs text-slate-500 font-medium">Grants access to Approvals, User Roster, and Audit Logs.</div></div>
                    </label>
                    <label className="flex items-center space-x-3 cursor-pointer group">
                      <input type="checkbox" className="w-4 h-4 text-blue-500 rounded border-gray-300 focus:ring-blue-500" checked={Boolean(selectedUserDetail.permissions?.view_nominal_roll) || String(selectedUserDetail.role || '').includes('ADMIN')} disabled={String(selectedUserDetail.role || '').includes('ADMIN')} onChange={(e) => { const newPerms = { ...(selectedUserDetail.permissions || {}), view_nominal_roll: e.target.checked }; setSelectedUserDetail({ ...selectedUserDetail, permissions: newPerms }); onUpdateUserRole(selectedUserDetail.fnum, selectedUserDetail.role, newPerms); }} />
                      <div className="flex-1"><div className="text-sm font-bold text-slate-800 group-hover:text-blue-700 transition-colors">Nominal Roll Access</div><div className="text-xs text-slate-500 font-medium">Grants standard users clearance to view the personnel registry.</div></div>
                    </label>
                    <label className="flex items-center space-x-3 cursor-pointer group">
                      <input type="checkbox" className="w-4 h-4 text-emerald-600 rounded border-gray-300 focus:ring-emerald-500" checked={Boolean(selectedUserDetail.permissions?.consolidated) || String(selectedUserDetail.role || '').includes('ADMIN')} disabled={String(selectedUserDetail.role || '').includes('ADMIN')} onChange={(e) => { const newPerms = { ...(selectedUserDetail.permissions || {}), consolidated: e.target.checked }; setSelectedUserDetail({ ...selectedUserDetail, permissions: newPerms }); onUpdateUserRole(selectedUserDetail.fnum, selectedUserDetail.role, newPerms); }} />
                      <div className="flex-1"><div className="text-sm font-bold text-slate-800 group-hover:text-emerald-700 transition-colors">Consolidated Ledger Access</div><div className="text-xs text-slate-500 font-medium">Allows viewing the cross-domain master Excel overlays.</div></div>
                    </label>
                    <label className="flex items-center space-x-3 cursor-pointer group">
                      <input type="checkbox" className="w-4 h-4 text-purple-600 rounded border-gray-300 focus:ring-purple-500" checked={Boolean(selectedUserDetail.permissions?.export_data) || ['RPC', 'Deputy Commander'].includes(selectedUserDetail.role) || String(selectedUserDetail.role || '').includes('ADMIN')} disabled={['RPC', 'Deputy Commander'].includes(selectedUserDetail.role) || String(selectedUserDetail.role || '').includes('ADMIN')} onChange={(e) => { const newPerms = { ...(selectedUserDetail.permissions || {}), export_data: e.target.checked }; setSelectedUserDetail({ ...selectedUserDetail, permissions: newPerms }); onUpdateUserRole(selectedUserDetail.fnum, selectedUserDetail.role, newPerms); }} />
                      <div className="flex-1"><div className="text-sm font-bold text-slate-800 group-hover:text-purple-700 transition-colors">Database Export Privilege</div><div className="text-xs text-slate-500 font-medium">Allows downloading raw .xlsx database files to local device.</div></div>
                    </label>
                    <label className="flex items-center space-x-3 cursor-pointer group">
                      <input type="checkbox" className="w-4 h-4 text-orange-600 rounded border-gray-300 focus:ring-orange-500" checked={Boolean(selectedUserDetail.permissions?.view_global_roster) || ['SUPER_ADMIN'].includes(selectedUserDetail.role) || ['KMP HEADQUARTERS', 'POLICE HEADQUARTERS'].includes(selectedUserDetail.region)} disabled={['SUPER_ADMIN'].includes(selectedUserDetail.role) || ['KMP HEADQUARTERS', 'POLICE HEADQUARTERS'].includes(selectedUserDetail.region)} onChange={(e) => { const newPerms = { ...(selectedUserDetail.permissions || {}), view_global_roster: e.target.checked }; setSelectedUserDetail({ ...selectedUserDetail, permissions: newPerms }); onUpdateUserRole(selectedUserDetail.fnum, selectedUserDetail.role, newPerms); }} />
                      <div className="flex-1"><div className="text-sm font-bold text-slate-800 group-hover:text-orange-700 transition-colors">Global Roster Visibility</div><div className="text-xs text-slate-500 font-medium">Allows viewing personnel from ALL regions in the System Roster.</div></div>
                    </label>
                  </div>

                  {currentUser?.role === 'SUPER_ADMIN' && (
                    <div className="mt-6 bg-red-50 p-4 rounded-lg border border-red-200 shadow-sm">
                      <h4 className="font-extrabold text-xs text-red-800 border-b border-red-200 pb-2 mb-3 flex items-center">
                        <Lock size={14} className="mr-2" /> Super Admin: Issue New Password
                      </h4>
                      <div className="flex space-x-2">
                        <input type="text" placeholder="Type new password (min 6 chars)" value={newForcePassword} onChange={(e) => setNewForcePassword(e.target.value)} className="flex-1 text-sm border-red-300 rounded shadow-sm p-2 outline-none focus:ring-2 focus:ring-red-500 font-mono" />
                        <button onClick={async () => {
                            if (newForcePassword.length < 6) return alert('Password must be at least 6 characters.');
                            try {
                              const token = localStorage.getItem('kmp_authToken');
                              const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
                              const res = await fetch(`${API_URL}/api/v1/admin/users/${selectedUserDetail.fnum}/force-password`, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                                body: JSON.stringify({ new_password: newForcePassword })
                              });
                              if (!res.ok) throw new Error(await res.text());
                              alert(`Password successfully changed for ${selectedUserDetail.name}.`);
                              setNewForcePassword('');
                            } catch (err) { alert('Error: ' + err.message); }
                          }}
                          className="bg-red-600 hover:bg-red-700 text-white font-bold px-4 py-2 rounded text-xs transition border border-red-800 shrink-0"
                        >
                          Set Password
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="bg-slate-100 p-4 border-t border-gray-200 flex justify-between items-center rounded-b-xl shrink-0">
              <button onClick={() => setSelectedUserDetail(null)} className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold text-xs py-2 px-4 rounded-lg shadow-sm transition-colors flex items-center border border-gray-300">
                <X size={14} className="mr-1"/> Close Profile
              </button>
              {selectedUserDetail.isSystemUser && (
                currentUser?.role === 'SUPER_ADMIN' || (currentUser?.role?.includes('ADMIN') && selectedUserDetail.role !== 'SUPER_ADMIN' && currentUser?.region === selectedUserDetail.region)
              ) && (
                <button onClick={() => { if (window.confirm(`Are you absolutely sure you want to revoke all system access for ${selectedUserDetail.name}?`)) { onRevokeUser(selectedUserDetail.fnum); setSelectedUserDetail(null); } }} className="text-xs font-bold text-red-600 hover:text-white hover:bg-red-600 py-2 px-4 rounded-lg transition-colors border border-red-200 shadow-sm">
                  Revoke Access
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {viewingProfileImage && (
        <div className="fixed inset-0 bg-black/90 z-[300] flex justify-center items-center p-4 animate-in fade-in" onClick={() => setViewingProfileImage(null)}>
          <button className="absolute top-6 right-6 text-white hover:text-red-500 transition-colors bg-white/10 p-2 rounded-full shadow-lg"><X size={24}/></button>
          <img src={viewingProfileImage} alt="Full Profile" className="max-w-full max-h-[90vh] object-contain rounded-xl shadow-2xl border-2 border-slate-700" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </>
  );
};

const App = () => {
  const [activeComponent, setActiveComponent] = useState('DASHBOARD');
  const [targetCommTab, setTargetCommTab] = useState('INBOX');
  const [commDefaultTab, setCommDefaultTab] = useState('INBOX');

  const [currentUser, setCurrentUser] = usePersistentState('kmp_currentUser', null);
  const [currentPage, setCurrentPage] = usePersistentState('kmp_currentPage', 'home');
  const [isInitializing, setIsInitializing] = useState(true);
  const [targetRegion, setTargetRegion] = useState('KMP HEADQUARTERS');
  const [targetStation, setTargetStation] = useState('KMP HEADQUARTERS');
  const [overrideRegion, setOverrideRegion] = useState(currentUser?.region || 'KMP HEADQUARTERS');
  const [overrideStation, setOverrideStation] = useState(currentUser?.station || 'KMP HEADQUARTERS');

  const [reports, setReports] = useState([]);
  const [stats, setStats] = useState([]);
  const [stories, setStories] = useState([]);
  const [establishments, setEstablishments] = useState([]);
  const [Nominal_Rolls, setNominal_Rolls] = useState([]);
  const [Nominal_Roll_archives, setNominal_Roll_archives] = useState([]);
  const [users, setUsers] = useState([]);
  const [pendingUsers, setPendingUsers] = useState([]);

  const [hrLedgerData, setHrLedgerData] = useState(null);
  const [isViewingHR, setIsViewingHR] = useState(false);
  const [isViewingConsolidated, setIsViewingConsolidated] = useState(false);
  const [consolidatedData, setConsolidatedData] = useState(null);
  const [adminCommsData, setAdminCommsData] = useState([]);  

  // Regional/Station filters for Grand Totals computation
  const [filterRegion, setFilterRegion] = useState('ALL REGIONS');
  const [filterStation, setFilterStation] = useState('ALL STATIONS');

  // 🟢 COMPUTE GRAND TOTALS MEMOIZED HOOK
  const grandTotals = useMemo(() => {
    return calculateGrandTotals(reports, currentUser, filterRegion, filterStation);
  }, [reports, currentUser, filterRegion, filterStation]);

  // 🟢 BACKGROUND AUTO-SYNC LISTENER
  useEffect(() => {
    const handleOnlineStatus = async () => {
      if (navigator.onLine) {
        const token = localStorage.getItem('kmp_authToken');
        if (token) {
          const remaining = await syncOfflineQueue(token);
          if (remaining === 0 && getOfflineQueueCount() === 0) {
            console.log('All offline queue records successfully synced with central database.');
          }
        }
      }
    };

    window.addEventListener('online', handleOnlineStatus);
    
    const syncInterval = setInterval(() => {
      if (navigator.onLine) {
        handleOnlineStatus();
      }
    }, 30000); 

    return () => {
      window.removeEventListener('online', handleOnlineStatus);
      clearInterval(syncInterval);
    };
  }, []);

  useEffect(() => {
    const checkClearance = () => {
      const token = localStorage.getItem('kmp_authToken');
      const cachedUser = localStorage.getItem('kmp_currentUser');
      if (!token || !cachedUser) { setIsInitializing(false); return; }
      try { setCurrentUser(JSON.parse(cachedUser)); } catch (error) { localStorage.removeItem('kmp_authToken'); localStorage.removeItem('kmp_currentUser'); }
      setIsInitializing(false);
    };
    checkClearance();
  }, [setCurrentUser]);

  useEffect(() => {
    if (!currentUser?.fnum) return; 
    const controller = new AbortController();
    const fetchAllData = async () => {
      const token = localStorage.getItem('kmp_authToken');
      if (!token) return;
      try {
        const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
        const [resReports, resStats, resStories, resNom, resComms, resEst, resArchives, resUsers] = await Promise.all([
          authFetch(`${API_URL}/api/v1/reports`, { signal: controller.signal }), 
          authFetch(`${API_URL}/api/v1/stats`, { signal: controller.signal }),
          authFetch(`${API_URL}/api/v1/stories`, { signal: controller.signal }), 
          authFetch(`${API_URL}/api/v1/nominal-roll`, { signal: controller.signal }),
          authFetch(`${API_URL}/api/v1/Admin_Communication`, { signal: controller.signal }), 
          authFetch(`${API_URL}/api/v1/establishments`, { signal: controller.signal }),
          authFetch(`${API_URL}/api/v1/nominal-roll-archive`, { signal: controller.signal }), 
          authFetch(`${API_URL}/api/v1/users`, { signal: controller.signal })
        ]);

        if (!controller.signal.aborted) {
          if (resReports.status === 401) {
             window.dispatchEvent(new Event('auth-expired'));
             return;
          }

          if (!resReports.ok) {
             const errorText = await resReports.text();
             console.error("🚨 COMMAND BACKEND ERROR:", resReports.status, errorText);
          } else {
             setReports(await resReports.json());
          }

          if (resStats.ok) setStats(await resStats.json());
          if (resStories.ok) setStories(await resStories.json());
          if (resNom.ok) setNominal_Rolls(await resNom.json());
          if (resComms.ok) setAdminCommsData(await resComms.json());
          if (resEst.ok) setEstablishments(await resEst.json());
          if (resArchives.ok) setNominal_Roll_archives(await resArchives.json());
          
          if (resUsers.ok) {
            const allUsers = await resUsers.json();
            setUsers(allUsers);
            const me = allUsers.find(u => u.fnum === currentUser.fnum);
            if (me && (JSON.stringify(me.permissions) !== JSON.stringify(currentUser.permissions) || me.role !== currentUser.role)) {
                setCurrentUser(prev => ({ ...prev, permissions: me.permissions, role: me.role }));
            }
          }
        }
      } catch (error) { 
        if (error.name !== 'AbortError') {
          console.error("Network/Fetch Error:", error);
        }
      } 
    };    
    fetchAllData();
    return () => controller.abort();
  }, [currentUser?.fnum]); 

  const handleMasterExport = async (scope, value) => {
    let url = `/api/v1/reports/export?timeframe=all`; 
    if (scope && value) url += `&scope=${scope}&value=${encodeURIComponent(value)}`;
    downloadWithAuth(url, `KMP_Master_Ledger_${value || "General"}_${new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0]}.zip`);
  };

  const handleAcknowledgeComm = async (commId) => {
    try {
      const token = localStorage.getItem('kmp_authToken');
      const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
      const response = await fetch(`${API_URL}/api/v1/communications/${commId}/acknowledge`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` } });
      if (response.ok) setAdminCommsData(prevData => prevData.map(c => c.id === commId ? { ...c, acknowledged: true } : c));
    } catch (err) { console.error("Failed to acknowledge receipt", err); }
  };

  const handlePageChange = (pageId) => { setCurrentPage(pageId); setIsViewingConsolidated(false); setIsViewingHR(false); };

  const renderPage = () => {
    switch (currentPage) {
      case 'home': 
        return <HomeDashboard currentUser={currentUser} setCurrentPage={handlePageChange} onMasterExport={handleMasterExport} onViewConsolidated={handleViewConsolidated} adminCommsData={adminCommsData} onAcknowledgeComm={handleAcknowledgeComm} onOpenInbox={() => { setCommDefaultTab('INBOX'); handlePageChange('Admin_Communication'); }} />;
      case 'reports': 
        return <CrimeIncidentRegistry currentUser={currentUser} reports={reports} setReports={setReports} />;
      case 'statistics': 
        return <Statistics currentUser={currentUser} stats={stats} setStats={setStats} />;
      case 'success': 
        return <SuccessStories currentUser={currentUser} stories={stories} setStories={setStories} />;
      case 'establishments': 
        return <Establishments currentUser={currentUser} establishments={establishments} setEstablishments={setEstablishments} />;
      case 'analytics': 
        return (
        <AnalyticsDashboard 
          nominalRolls={Nominal_Rolls} 
          crimeRegistry={reports} 
          successStories={stories} 
          operationalStats={stats} 
        />
      );
      case 'nominal-roll': 
        return <Nominal_Roll currentUser={currentUser} Nominal_Rolls={Nominal_Rolls} setNominal_Rolls={setNominal_Rolls} Nominal_Roll_archives={Nominal_Roll_archives} setNominal_Roll_archives={setNominal_Roll_archives} />;
      case 'reports_hub': 
        return <WordReportUpload currentUser={currentUser} />; 
      case 'approvals': 
        return ['ADMIN', 'SUPER_ADMIN', 'RPC', 'Deputy Commander', 'ASSISTANT_SUPER_ADMIN'].includes(currentUser.role) ? <AdminApprovals pendingUsers={pendingUsers} setPendingUsers={setPendingUsers} users={users} setUsers={setUsers} currentUser={currentUser} /> : <HomeDashboard currentUser={currentUser} setCurrentPage={handlePageChange} onMasterExport={handleMasterExport} onViewConsolidated={handleViewConsolidated} adminCommsData={adminCommsData} onAcknowledgeComm={handleAcknowledgeComm} onOpenInbox={() => { setCommDefaultTab('INBOX'); handlePageChange('Admin_Communication'); }} />; 
      case 'profile': 
        return <AdminProfile currentUser={currentUser} setCurrentUser={setCurrentUser} setCurrentPage={handlePageChange} />;
      case 'Admin_Communication': 
        return <Admin_Communication currentUser={currentUser} users={users} setCurrentPage={handlePageChange} onAcknowledgeComm={handleAcknowledgeComm} initialTab={commDefaultTab} />;
      default: 
        return <HomeDashboard currentUser={currentUser} setCurrentPage={handlePageChange} onMasterExport={handleMasterExport} onViewConsolidated={handleViewConsolidated} adminCommsData={adminCommsData} onAcknowledgeComm={handleAcknowledgeComm} onOpenInbox={() => { setCommDefaultTab('INBOX'); handlePageChange('Admin_Communication'); }} />;
    }
  };

  const handleViewHRReport = async () => {
    try {
      const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
      const res = await authFetch(`${API_URL}/api/v1/reports/establishments-json`);
      if (!res.ok) throw new Error("Security clearance rejected or server error.");
      const data = await res.json(); setHrLedgerData(data); setIsViewingHR(true);
    } catch (err) { alert("Cannot load HR ledger data. Ensure your session is active and you have network connectivity."); }
  };

  const handleViewConsolidated = async () => {
      setIsViewingHR(false);
      const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0];
      const lastWeek = new Date(); lastWeek.setDate(lastWeek.getDate() - 7);
      const start = lastWeek.toISOString().split('T')[0];

      try {
          const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
          const response = await authFetch(`${API_URL}/api/v1/reports/consolidated-ledger?start_date=${start}&end_date=${today}`);
          if (!response.ok) throw new Error("Backend failed to compile ledger.");
          const data = await response.json(); setConsolidatedData(data); setIsViewingConsolidated(true);
      } catch (err) { alert("Failed to load Consolidated Ledger. Check Python terminal for errors."); }
  };

if (isInitializing) return <h2 style={{ textAlign: 'center', marginTop: '20vh' }}>Verifying Officer Clearance...</h2>;

  // 🟢 1. PROPERLY CLOSED GHOST SESSION CHECK
  if (currentUser && !currentUser.region) {
    localStorage.removeItem('kmp_currentUser'); 
    localStorage.removeItem('kmp_authToken');
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50">
        <h2 className="text-2xl font-bold text-red-600 mb-2">Ghost Session Detected</h2>
        <p className="text-slate-600 mb-6">Corrupted local data is blocking the dashboard. Click below to wipe it.</p>
        <button onClick={() => window.location.reload()} className="px-6 py-3 bg-blue-700 text-white font-bold rounded-lg shadow-md hover:bg-blue-800">Force Clear & Restart App</button>
      </div>
    );
  }

  // 🟢 2. RESTORED LOGIN SCREEN
  if (!currentUser) return <LoginScreen 
    onLogin={(user) => {
      localStorage.removeItem('kmp_currentPage'); setCurrentPage('home'); setCurrentUser(user);
      const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
      fetch(`${API_URL}/api/v1/system/log-session`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fnum: user.fnum }) }).catch(e => console.error(e));
    }} 
    onForgot={() => {}} onSignup={(u) => setPendingUsers([...pendingUsers, u])} pendingUsers={pendingUsers} activeUsers={users} 
  />;

  // 🟢 3. RESTORED USER MANAGEMENT HANDLERS
  const handleGenerateHRReport = () => downloadWithAuth("/api/v1/export/establishments", "HR_Establishment_Summary.zip");

  const handleUpdateUserRole = async (fnum, newRole, newPermissions) => {
    setUsers(users.map(u => u.fnum === fnum ? { ...u, role: newRole, permissions: newPermissions } : u));
    try {
      const token = localStorage.getItem('kmp_authToken');
      const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
      await fetch(`${API_URL}/api/v1/users/${fnum}/access`, { method: "PUT", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }, body: JSON.stringify({ role: newRole, permissions: newPermissions }) });
    } catch (err) { console.error("Failed to save permissions to database:", err); }
  };

  const handleRevokeUser = async (fnum) => {
    const reason = window.prompt(`Please state the official reason for revoking access for ${fnum}:`);
    if (reason === null) return; 
    if (reason.trim() === '') return alert("An official reason is mandatory to revoke a user's access.");

    try {
      const token = localStorage.getItem('kmp_authToken');
      const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
      await fetch(`${API_URL}/api/v1/users/${encodeURIComponent(fnum)}/revoke?reason=${encodeURIComponent(reason)}`, {
        method: "DELETE", headers: { "Authorization": `Bearer ${token}` }
      });
      setUsers(users.filter(u => u.fnum !== fnum));
      alert(`Access revoked for ${fnum}. Reason logged in Audit Trail.`);
    } catch (err) { console.error("Failed to revoke user:", err); }
  };

// 🟢 4. MAIN APPLICATION RETURN
  return (
    <>
      <DashboardLayout 
        currentUser={currentUser} 
        currentPage={currentPage} 
        setCurrentPage={handlePageChange} 
        onLogout={() => { 
          localStorage.removeItem('kmp_authToken'); 
          localStorage.removeItem('kmp_currentUser'); 
          localStorage.removeItem('kmp_currentPage'); 
          window.location.reload(); 
        }}
        onUpdateUserRole={handleUpdateUserRole} 
        onRevokeUser={handleRevokeUser} 
        users={users} 
        Admin_Communication={adminCommsData}
        onViewConsolidated={handleViewConsolidated} 
        onViewHRReport={handleViewHRReport} 
        onGenerateHRReport={handleGenerateHRReport}
      >
        {isViewingConsolidated && (
          <ConsolidatedLedger 
            data={consolidatedData} 
            reports={reports} 
            stats={stats} 
            stories={stories} 
            onClose={() => setIsViewingConsolidated(false)} 
          />
        )}
        
        {isViewingHR && hrLedgerData && (
          <HrEstablishmentsLedger 
            data={hrLedgerData} 
            onClose={() => setIsViewingHR(false)} 
            currentUser={currentUser} 
            onUploadSuccess={() => window.location.reload()} 
          />
        )}
        
        <div className={(isViewingConsolidated || isViewingHR) ? 'hidden' : 'block w-full h-full'}>
          {renderPage()}
        </div>
      </DashboardLayout>

      <WorkspaceSecurityCurtain />
    </>
  );
};

export default App;