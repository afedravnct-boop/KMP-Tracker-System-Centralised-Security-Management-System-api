import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  LayoutDashboard, BarChart3, Trophy, UserPlus, LogOut, Menu, 
  Search, PlusCircle, Edit, Download, Shield, CheckCircle, 
  Award, Maximize2, Minimize2, Activity, User, Lock, 
  AlertTriangle, RadioReceiver, Eye, X, Building, Image, 
  Camera, Users, Home, Unlock, Send, Archive, PieChart,
  Bell, MessageSquare, Upload, ArrowLeft, ArrowRight, Globe, WifiOff, Wifi, FileText, Sparkles
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
import Statistics from './Statistics';
import Nominal_Roll from './Nominal_Roll';
import Establishments from './Establishments';
import SuccessStories from './SuccessStories';
import SystemAssistant from './SystemAssistant';
import AICommandConsole from "./AICommandConsole";
import { authFetch, hasValidSession, getAuthToken, setAuthSession, clearAuthSession } from './api';

// ====================================================================
// 1. CONSTANTS & CONFIGURATION
// ====================================================================
const API_URL = import.meta.env.VITE_API_URL || "https://kmp-tracker-system-centralised-security.onrender.com";

const REGIONAL_HIERARCHY = {
  "KMP NORTH": ["KAWEMPE", "KAKIRI", "KASANGATI", "MATUGGA", "NANSANA", "OLD KAMPALA", "WAKISO", "WANDEGEYA"],
  "KMP EAST": ["JINJA ROAD", "KIRA", "KIRA ROAD", "MUKONO", "NAGGALAMA", "SEETA"],
  "KMP SOUTH": ["NATEETE", "CPS KAMPALA", "PARLIAMENT", "ENTEBBE", "KABALAGALA", "KAJJANSI", "KASENYI", "KATWE", "KYENGERA", "NSANGI"],
  "KMP HEADQUARTERS": ["KMP HEADQUARTERS", "FLYING SQUAD", "CRIME INTELLIGENCE"],
  "POLICE HEADQUARTERS": ["NAGURU"]
};

const POSITIONS = {
  ADMIN: [
    "System Manager", "IGP", "DIGP", "Director OPS", "Director CT", "Director CI", 
    "Director CID", "Director HRM & A", "Director logistics & engineering", 
    "KMP Commander", "Deputy KMP Commander",
    "KMP CID Commander", "KMP CI Commander", "KMP Operations Commander", 
    "KMP Traffic & Road Safety Commander", "KMP SOCO", "KMP 999 eru commander", 
    "999 ERU Data Officer", "Regional HR Officer", "KMP SFC Coordinator",
    "Regional Data officer", "Divisional Data Officer", "Station Data Officer", "Regional Data Assistant Officer", "Division Data Assistant Officer", "Station Data Assistant Officer", "Regional Traffic Officer", "Divisional Traffic Officer", "Divisional CID Officer", "Divisional CI Officer", "Regional CFPU Officer", "Divisional CFPU Officer", "Regional Fire Officer", "Divisional Fire Officer", "Regional Logistics Officer", "Divisional Logistics Officer", "Station SOCO", "Divisional SOCO", "Regional SOCO"
  ],
  RPC: [
    "KMP South Commander", "KMP North Commander", "KMP East Commander", "Deputy Commander KMP south", "Deputy Commander KMP North", "Deputy Commander KMP East"
  ]
};

// ====================================================================
// 2. CORE UTILITY FUNCTIONS & ENGINES
// ====================================================================

export const checkClearance = (currentUser, permissionKey, defaultRoleAccess = true) => {
  if (!currentUser) return false;
  if (currentUser.role === 'SUPER_ADMIN') return true;

  const perms = currentUser.permissions || {};
  if (typeof perms[permissionKey] === 'boolean') {
    return perms[permissionKey];
  }
  return Boolean(defaultRoleAccess);
};

export const calculateGrandTotals = (allSubmissions, currentUser, filterRegion, filterStation) => {
  const scopedSubmissions = (Array.isArray(allSubmissions) ? allSubmissions : []).filter(entry => {
    if (filterRegion && filterRegion !== 'ALL REGIONS' && entry.region !== filterRegion) return false;
    if (filterStation && filterStation !== 'ALL STATIONS' && entry.station !== filterStation) return false;
    return true;
  });

  const calculatedStationSum = scopedSubmissions.reduce((sum, entry) => {
    return sum + (Number(entry.total_value || entry.count || entry.amount || entry.daily_lock_up) || 0);
  }, 0);

  const hqEntry = scopedSubmissions.find(entry => entry.is_hq_grand_total || entry.station === 'HQ GENERAL');
  const hqEnteredTotal = hqEntry ? (Number(hqEntry.total_value || hqEntry.count || hqEntry.amount || hqEntry.daily_lock_up) || 0) : null;

  return {
    displayTotal: hqEnteredTotal !== null && currentUser?.role !== 'STATION_ADMIN' ? hqEnteredTotal : calculatedStationSum,
    stationSum: calculatedStationSum,
    hqTotal: hqEnteredTotal,
    isReconciled: hqEnteredTotal === null || hqEnteredTotal === calculatedStationSum
  };
};

export const stripHtmlTags = (str) => {
  if (!str) return '';
  return str.toString().replace(/<[^>]*>?/gm, '');
};

export const canViewGlobalJurisdiction = (user) => {
  if (!user) return false;
  if (['SUPER_ADMIN', 'ADMIN', 'RPC', 'Deputy Commander'].includes(user.role)) return true;
  return user.permissions?.view_global_roster === true || user.permissions?.global_observer === true;
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

const downloadWithAuth = async (url, fallbackFilename) => {
  try {
    const response = await authFetch(url);
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.detail || `Server Error ${response.status}`);
    }

    const blob = await response.blob();
    if (blob.size === 0) throw new Error("Received empty file (0 bytes).");

    // 🟢 THE FIX: Extract the EXACT filename from the backend headers if it exists
    let finalFilename = fallbackFilename;
    const disposition = response.headers.get('content-disposition');
    if (disposition && disposition.indexOf('attachment') !== -1) {
      const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
      const matches = filenameRegex.exec(disposition);
      if (matches != null && matches[1]) {
        finalFilename = matches[1].replace(/['"]/g, '');
      }
    }

    const downloadUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.style.display = 'none';
    link.href = downloadUrl;
    link.download = finalFilename; // Uses the exact backend name (e.g., SECURE_AUDIT_LOGS_20260825.zip)
    
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

// ====================================================================
// 3. CUSTOM HOOKS
// ====================================================================
export function usePersistentState(key, initialValue) {
  const [state, setState] = useState(() => {
    const saved = typeof window !== 'undefined' ? sessionStorage.getItem(key) : null;
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { return initialValue; }
    }
    return initialValue;
  });

  const setPersistentState = (newValue) => {
    setState(prev => {
      const valToSave = typeof newValue === 'function' ? newValue(prev) : newValue;
      sessionStorage.setItem(key, JSON.stringify(valToSave));
      return valToSave;
    });
  };

  return [state, setPersistentState];
}

// ====================================================================
// 4. SHARED UI COMPONENTS
// ====================================================================
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
  const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(currentUser?.role);
  const isRPC = ['ADMIN', 'SUPER_ADMIN', 'RPC', 'Deputy Commander'].includes(currentUser?.role);

  const rawComms = adminCommsData || [];
  const safeComms = Array.isArray(rawComms) ? rawComms : (rawComms.data || rawComms.items || []);

  const canViewCrime = checkClearance(currentUser, 'acc_crime', true);
  const canViewOps = checkClearance(currentUser, 'acc_ops', true);
  const canViewStories = checkClearance(currentUser, 'acc_stories', true);
  const canViewEst = checkClearance(currentUser, 'acc_est', true);
  const canViewAnalytics = checkClearance(currentUser, 'acc_analytics', true);
  const canViewHR = checkClearance(currentUser, 'acc_hr', true);
  const canViewApprovals = checkClearance(currentUser, 'acc_approvals', isAdmin || ['RPC', 'ASSISTANT_SUPER_ADMIN'].includes(currentUser?.role));
  const canViewConsolidated = checkClearance(currentUser, 'acc_consolidated', isAdmin || currentUser?.permissions?.consolidated);
  const canExportData = checkClearance(currentUser, 'export_data', isRPC || currentUser?.permissions?.export_data);

  const today = new Date().getDay();
  const isEndOfWeek = today === 4 || today === 6 || today === 0;

  const userRole = (currentUser?.role || '').toUpperCase();
  const userPosition = (currentUser?.position || '').toUpperCase();
  const userRegion = (currentUser?.region || '').toUpperCase();
  const userStation = (currentUser?.station || '').trim().toUpperCase();

  const isPoliceHQ = userRegion.includes('POLICE HEADQUARTERS') || userStation.includes('POLICE HEADQUARTERS');
  const isSystemManager = userPosition.includes('SYSTEM MANAGER') || userRole === 'SUPER_ADMIN';

  const targetKeywords = ['RPC', 'DEPUTY RPC', 'DPC', 'DEPUTY DPC', 'DATA OFFICER', 'DATA ASSISTANT OFFICER', 'HR OFFICER'];
  const matchesFieldRole = targetKeywords.some(keyword => userPosition.includes(keyword) || userRole.includes(keyword));

  const isTargetOfficer = matchesFieldRole && !isPoliceHQ && !isSystemManager;
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
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto space-y-6 relative z-10 animate-in fade-in duration-300">
      {showComplianceWarning && (
        <div className="fixed bottom-6 right-6 z-[9990]">
          <div
            onMouseEnter={() => setIsBannerFolded(false)}
            onMouseLeave={() => setIsBannerFolded(true)}
            onClick={() => {
              if (isBannerFolded) setIsBannerFolded(false);
              else setCurrentPage('statistics');
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

      <div onClick={onOpenInbox} className="min-h-[4.5rem] bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex items-center cursor-pointer transition-all hover:shadow-md hover:-translate-y-1 hover:border-green-400 group relative overflow-hidden mb-2">
        {hasUnread && (
          <>
            <div className="absolute top-2 right-2 w-2.5 h-2.5 bg-green-500 rounded-full shadow-[0_0_8px_#22c55e] animate-ping"></div>
            <div className="absolute top-2 right-2 w-2.5 h-2.5 bg-green-500 rounded-full"></div>
          </>
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

      {/* 🟢 OPTIMIZED MODULE GRID (Open by Default) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 w-full">
        {canViewCrime && (
          <div onClick={() => setCurrentPage('reports')} className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex items-center cursor-pointer transition-all hover:shadow-md hover:-translate-y-1 hover:border-blue-300 group">
            <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mr-3 group-hover:bg-blue-600 group-hover:text-white transition-colors shrink-0"><LayoutDashboard size={18} /></div>
            <div><h3 className="text-sm font-extrabold text-slate-900 leading-tight">Crime Registry</h3><p className="text-[11px] text-slate-500 font-medium mt-0.5 leading-snug">Log and track daily incidents.</p></div>
          </div>
        )}
        
        {canViewOps && (
          <div onClick={() => setCurrentPage('statistics')} className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex items-center cursor-pointer transition-all hover:shadow-md hover:-translate-y-1 hover:border-blue-300 group">
            <div className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center mr-3 group-hover:bg-indigo-600 group-hover:text-white transition-colors shrink-0"><BarChart3 size={18} /></div>
            <div><h3 className="text-sm font-extrabold text-slate-900 leading-tight">OPS Statistics</h3><p className="text-[11px] text-slate-500 font-medium mt-0.5 leading-snug">Weekly numerical aggregates.</p></div>
          </div>
        )}

        {canViewStories && (
          <div onClick={() => setCurrentPage('success')} className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex items-center cursor-pointer transition-all hover:shadow-md hover:-translate-y-1 hover:border-yellow-400 group">
            <div className="w-10 h-10 rounded-full bg-yellow-50 text-yellow-600 flex items-center justify-center mr-3 group-hover:bg-yellow-500 group-hover:text-white transition-colors shrink-0"><Trophy size={18} /></div>
            <div><h3 className="text-sm font-extrabold text-slate-900 leading-tight">Success Stories</h3><p className="text-[11px] text-slate-500 font-medium mt-0.5 leading-snug">Document tactical milestones.</p></div>
          </div>
        )}

        {canViewEst && (
          <div onClick={() => setCurrentPage('establishments')} className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex items-center cursor-pointer transition-all hover:shadow-md hover:-translate-y-1 hover:border-emerald-300 group">
            <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mr-3 group-hover:bg-emerald-600 group-hover:text-white transition-colors shrink-0"><Building size={18} /></div>
            <div><h3 className="text-sm font-extrabold text-slate-900 leading-tight">Establishments</h3><p className="text-[11px] text-slate-500 font-medium mt-0.5 leading-snug">Map divisions, stations, posts.</p></div>
          </div>
        )}

        {canViewAnalytics && (
          <div onClick={() => setCurrentPage('analytics')} className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex items-center cursor-pointer transition-all hover:shadow-md hover:-translate-y-1 hover:border-cyan-400 group">
            <div className="w-10 h-10 rounded-full bg-cyan-50 text-cyan-600 flex items-center justify-center mr-3 group-hover:bg-cyan-600 group-hover:text-white transition-colors shrink-0"><PieChart size={18} /></div>
            <div><h3 className="text-sm font-extrabold text-slate-900 leading-tight">Analytics Dashboard</h3><p className="text-[11px] text-slate-500 font-medium mt-0.5 leading-snug">Graphs, cross-tabs & reports.</p></div>
          </div>
        )}

        {canViewHR && (
          <div onClick={() => setCurrentPage('nominal-roll')} className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex items-center cursor-pointer transition-all hover:shadow-md hover:-translate-y-1 hover:border-purple-300 group">
            <div className="w-10 h-10 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center mr-3 group-hover:bg-purple-600 group-hover:text-white transition-colors shrink-0"><Users size={18} /></div>
            <div><h3 className="text-sm font-extrabold text-slate-900 leading-tight">Nominal Roll</h3><p className="text-[11px] text-slate-500 font-medium mt-0.5 leading-snug">Personnel deployment registry.</p></div>
          </div>
        )}

        {canViewApprovals && (
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


// 🟢 Official UPF Command Seniority Weighting (Lower index = Higher rank)
const RANK_SENIORITY = {
  "IGP": 1,
  "DIGP": 2,
  "AIGP": 3,
  "SCP": 4,
  "CP": 5,
  "ACP": 6,
  "SSP": 7,
  "SP": 8,
  "SASP": 9,
  "ASP": 10,
  "IP": 11,
  "AIP": 12,
  "HCM": 13,
  "HC": 14,
  "S/SGT": 15,
  "SSGT": 15,
  "SGT": 16,
  "CPL": 17,
  "L/CPL": 18,
  "LCPL": 18,
  "PC": 19,
  "PPC": 20, 
  "SPC": 21
};

const getRankWeight = (rankStr) => {
  if (!rankStr) return 99;
  let cleanRank = rankStr.trim().toUpperCase();
  if (cleanRank.startsWith('D/')) cleanRank = cleanRank.substring(2);
  return RANK_SENIORITY[cleanRank] !== undefined ? RANK_SENIORITY[cleanRank] : 50;
};

const parseEducationLevel = (rawVal) => {
  if (!rawVal) return "UNEDUCATED / NOT SPECIFIED";
  const str = rawVal.toString().trim().toUpperCase();
  
  if (!str || str === 'NONE' || str === 'N/A' || str === 'NIL' || str === 'NO' || str === 'UNEDUCATED') {
    return "UNEDUCATED";
  }

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

  if (str.includes("DIPLOMA") || str.includes("DIP.")) {
    let course = str
      .replace(/DIPLOMA(\s+IN)?/g, '')
      .replace(/DIP\.?/g, '')
      .trim();

    return course ? `DIPLOMA - ${course}` : `DIPLOMA (${str})`;
  }

  if (str.includes("CERTIFICATE") || str.includes("CERT.")) {
    let course = str
      .replace(/CERTIFICATE(\s+IN)?/g, '')
      .replace(/CERT\.?/g, '')
      .trim();

    return course ? `CERTIFICATE - ${course}` : `CERTIFICATE (${str})`;
  }

  if (str.includes("UBTEB") || str.includes("VOCATIONAL") || str.includes("TECHNICAL")) return "UBTEB / TECHNICAL";
  if (str.includes("UACE") || str.includes("A LEVEL") || str.includes("A-LEVEL") || str.includes("S.6") || str.includes("S6") || str.includes("SENIOR 6")) return "UACE (A-LEVEL)";
  if (str.includes("UCE") || str.includes("O LEVEL") || str.includes("O-LEVEL") || str.includes("S.4") || str.includes("S4") || str.includes("SENIOR 4")) return "UCE (O-LEVEL)";
  
  if (str.includes("S.3") || str.includes("S3") || str.includes("SENIOR 3")) return "S.3";
  if (str.includes("S.2") || str.includes("S2") || str.includes("SENIOR 2")) return "S.2";
  if (str.includes("S.1") || str.includes("S1") || str.includes("SENIOR 1")) return "S.1";

  if (str.includes("P.7") || str.includes("P7") || str.includes("PLE") || str.includes("PRIMARY 7")) return "P.7 (PLE)";
  if (str.includes("P.6") || str.includes("P6") || str.includes("PRIMARY 6")) return "P.6";
  if (str.includes("P.5") || str.includes("P5") || str.includes("PRIMARY 5")) return "P.5";
  if (str.includes("P.4") || str.includes("P4") || str.includes("PRIMARY 4")) return "P.4";
  if (str.includes("P.3") || str.includes("P3") || str.includes("PRIMARY 3")) return "P.3";
  if (str.includes("P.2") || str.includes("P2") || str.includes("PRIMARY 2")) return "P.2";
  if (str.includes("P.1") || str.includes("P1") || str.includes("PRIMARY 1")) return "P.1";

  return str;
};

// ====================================================================
// --- PROFILE UPDATE SYSTEM ---
// ====================================================================
const AdminProfile = ({ currentUser, setCurrentUser, setCurrentPage }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [isRequestMode, setIsRequestMode] = useState(false);
  const [notification, setNotification] = useState(null);
  const [viewingImage, setViewingImage] = useState(null);
  
  const [passwordData, setPasswordData] = useState({ old_password: '', new_password: '' });
  
  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setNotification("⏳ Updating security key...");
    try {
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
      const response = await authFetch('/api/v1/requests', {
        method: "POST", 
        headers: { "Content-Type": "application/json" },
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
      const response = await authFetch(`/api/v1/users/profile/update`, {
        method: "PUT", 
        headers: { "Content-Type": "application/json" }, 
        body: JSON.stringify(formData)
      });
      const data = await response.json();

      if (!response.ok) throw new Error(data.detail || "Failed to update database.");
      if (data.new_token) setAuthSession(data.new_token, formData.fnum);

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
      <button onClick={() => setCurrentPage && setCurrentPage('home')} className="flex items-center text-xs font-bold text-slate-500 hover:text-blue-700 transition-colors bg-white hover:bg-blue-50 px-4 py-2 rounded-lg shadow-xs border border-slate-200 w-fit cursor-pointer">
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
          <button onClick={() => { setIsEditing(!isEditing); setIsRequestMode(false); }} className={`z-10 flex items-center px-4 py-2 rounded-lg text-xs font-bold transition-colors shadow-xs cursor-pointer ${isEditing ? 'bg-slate-700 text-white border border-slate-600' : 'bg-blue-600 text-white hover:bg-blue-500'}`}>
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
                    <button type="button" onClick={() => setIsRequestMode(true)} className="text-xs bg-slate-800 hover:bg-slate-700 text-white px-3 py-1.5 rounded font-bold transition flex items-center shadow-xs cursor-pointer"><Shield size={12} className="mr-1"/> Request Modification</button>
                  )}
                  {!canAutoApprove && isRequestMode && (
                    <button type="button" onClick={handleProfileSave} className="text-xs bg-amber-600 hover:bg-amber-500 text-white px-3 py-1.5 rounded font-bold transition flex items-center shadow-xs cursor-pointer"><Send size={12} className="mr-1"/> Send Official Request</button>
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
                  <button type="submit" className="bg-blue-700 hover:bg-blue-800 text-white font-bold py-2 px-6 rounded-lg shadow-xs transition-colors flex items-center text-xs cursor-pointer">💾 Save Profile Changes</button>
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
                  <button type="submit" className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-6 rounded-lg shadow-xs transition-colors text-xs cursor-pointer">Update Security Key</button>
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

      {viewingImage && (
        <div className="fixed inset-0 bg-black/90 z-[300] flex justify-center items-center p-4 animate-in fade-in" onClick={() => setViewingImage(null)}>
          <button className="absolute top-6 right-6 text-white hover:text-red-500 transition-colors bg-white/10 p-2 rounded-full shadow-lg cursor-pointer">
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
// --- SECURE IN-MEMORY LOGIN SCREEN ---
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

  const [isLoginIdle, setIsLoginIdle] = useState(false);
  const idleTimerRef = useRef(null);

  useEffect(() => {
    const IDLE_TIME = 30000;

    const resetIdle = () => {
      setIsLoginIdle(false);
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => {
        setIsLoginIdle(true);
      }, IDLE_TIME);
    };

    resetIdle();

    const events = ['mousemove', 'keydown', 'keyup', 'input', 'click', 'scroll', 'touchstart'];
    events.forEach(event => window.addEventListener(event, resetIdle, true));

    return () => {
      clearTimeout(idleTimerRef.current);
      events.forEach(event => window.removeEventListener(event, resetIdle, true));
    };
  }, []);

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
      const uploadData = new FormData(); 
      uploadData.append("file", file); 
      uploadData.append("fnum", signupData.fnum || "NEW_USER"); 
      uploadData.append("category", "user_profile");
      
      try {
        const response = await authFetch('/api/v1/users/upload-profile', { method: "POST", body: uploadData });
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

      const response = await authFetch('/api/v1/auth/signup', { method: 'POST', body: formData });
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
        const response = await authFetch('/api/auth/login', { 
          method: 'POST', 
          headers: { 'Content-Type': 'application/json' }, 
          body: JSON.stringify({ username: fnum.trim(), password: password.trim() }) 
        });
        const data = await response.json();

        if (response.ok) {
          setAuthSession(data.access_token, data.fnum || fnum.trim());
          onLogin({ 
            fnum: data.fnum || fnum.trim(), 
            rank: data.rank || 'AIP', 
            name: data.name || 'Afedra Vincent', 
            sex: data.sex || 'MALE', 
            ipps: data.ipps || '950010',
            region: data.region || 'KMP HEADQUARTERS', 
            division: data.division || 'KMP HEADQUARTERS', 
            station: data.station || 'KMP HEADQUARTERS',
            position: data.position || 'System Manager', 
            email: data.email || 'afedravnct@gmail.com', 
            phone: data.phone || '0779302872', 
            role: data.role || 'SUPER_ADMIN',
            permissions: data.permissions || {}, 
            profile_photo_path: data.profile_photo_path || ''
          });
        } else {
          setPassword(''); setAuthMessage(data.detail || "Incorrect Force Number or password");
          const newAttempts = attempts + 1; setAttempts(newAttempts);
          if (newAttempts >= 3) setLockoutEnd(Date.now() + 30000);
        }
      } catch (err) { setPassword(''); setAuthMessage("Network error. Could not connect to the server."); }
    } else if (mode === 'forgot') {
      try {
        const formData = new URLSearchParams(); 
        formData.append('fnum', fnum.trim());
        const response = await authFetch('/api/v1/auth/request-reset', { method: 'POST', body: formData });
        const data = await response.json();
        if (response.ok) { setMode('login'); setfnum(''); setAuthMessage("✅ " + (data.message || "Account recovery requested.")); } 
        else { setAuthMessage(`❌ ${data.detail || "Failed to submit request."}`); }
      } catch (err) { setAuthMessage("❌ Network error. Could not connect to the server."); }
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-4 relative overflow-hidden">
      <div 
        className={`security-curtain-overlay fixed inset-0 z-50 bg-slate-900 flex flex-col items-center justify-center transition-opacity duration-700 ease-in-out ${
          isLoginIdle ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="absolute top-0 w-full h-2 bg-[#000000]"></div>
        <div className="absolute top-2 w-full h-2 bg-[#facc15]"></div>
        <div className="absolute top-4 w-full h-2 bg-[#dc2626]"></div>

        <div 
          className="absolute inset-0 opacity-10 bg-center bg-no-repeat bg-cover pointer-events-none" 
          style={{ backgroundImage: `url('/UPF Flag Emblem.png')` }}
        ></div>

        <div className="relative z-10 flex flex-col items-center text-center p-6 max-w-3xl">
          <div className="upf-css-globe mb-6 border border-slate-600/50"></div>
          
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

        <div className="absolute bottom-4 w-full h-2 bg-[#dc2626]"></div> 
        <div className="absolute bottom-2 w-full h-2 bg-[#facc15]"></div> 
        <div className="absolute bottom-0 w-full h-2 bg-[#000000]"></div> 
      </div>

      <div className="max-w-xl w-full bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden relative z-10">
        <div className="bg-slate-900 p-6 text-center relative">
          <img 
            src="/upf_badge.png" 
            alt="UPF Logo" 
            className="w-24 h-24 mx-auto mb-4 object-contain contrast-200 brightness-75 drop-shadow-sm" 
            onError={(e) => { e.target.onerror = null; e.target.style.display = 'none'; }} 
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
                      <option value="System Manager">System Manager</option>
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
                    <button type="submit" className="w-full bg-slate-900 hover:bg-black text-white font-bold py-3 rounded-lg transition-colors text-sm cursor-pointer">Submit Registration Request</button>
                    <button type="button" onClick={() => setMode('login')} className="text-sm text-blue-600 hover:underline font-medium cursor-pointer">Cancel and return to Login</button>
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
                      <input type="text" required value={fnum} onChange={(e) => setfnum(e.target.value)} className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none uppercase text-sm" placeholder="e.g. A/2408 or 63034"/>
                    </div>
                  </div>
                  {mode === 'login' && (
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-1">Security Key (Password)</label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"/>
                        <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm" placeholder="••••••••"/>
                      </div>
                    </div>
                  )}
                  <button type="submit" className="w-full bg-blue-700 hover:bg-blue-800 text-white font-bold py-3 rounded-lg transition-colors cursor-pointer text-xs uppercase tracking-wider">
                    {mode === 'login' ? 'Authorize Access' : 'Request Password Reset'}
                  </button>
                  <div className="text-center mt-4 flex justify-between px-4">
                    <button type="button" onClick={() => {setMode(mode === 'login' ? 'forgot' : 'login'); setAttempts(0);}} className="text-sm text-slate-600 hover:text-blue-600 hover:underline font-medium cursor-pointer">
                      {mode === 'login' ? 'Forgot Security Key?' : 'Back to Login'}
                    </button>
                    {mode === 'login' && (
                      <button type="button" onClick={() => setMode('signup')} className="text-sm text-blue-600 font-bold hover:underline cursor-pointer">
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

  const breakdownTree = {};
  
  (Array.isArray(allSubmissions) ? allSubmissions : []).forEach(entry => {
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
        <div className="bg-slate-900 text-white px-6 py-4 flex justify-between items-center shrink-0">
          <div>
            <h3 className="font-extrabold uppercase text-sm tracking-wider flex items-center">
              <BarChart3 className="mr-2 text-blue-400" size={18} /> Grand Total Jurisdiction Breakdown
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">Hierarchical aggregation of regional and station entries.</p>
          </div>
          <button onClick={onClose} className="hover:bg-slate-800 p-1.5 rounded transition cursor-pointer"><X size={18}/></button>
        </div>

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

        <div className="bg-white p-4 border-t border-slate-200 flex justify-end shrink-0">
          <button onClick={onClose} className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-xs uppercase tracking-wider shadow cursor-pointer">
            Close Breakdown
          </button>
        </div>
      </div>
    </div>
  );
};

// ====================================================================
// --- GLOBAL WORKSPACE SECURITY IDLE CURTAIN & SESSION TIMEOUT ---
// ====================================================================
const WorkspaceSecurityCurtain = () => {
  const [isWorkspaceIdle, setIsWorkspaceIdle] = useState(false);
  const [isReadingMode, setIsReadingMode] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  
  const [showIdleWarning, setShowIdleWarning] = useState(false);
  const [idleCountdown, setIdleCountdown] = useState(60);
  const [isTimedOut, setIsTimedOut] = useState(false);

  const idleTimerRef = useRef(null);
  const sessionTimerRef = useRef(null);
  const lastActionRef = useRef(Date.now()); // 🟢 NEW: Used to throttle mouse events

  // Function to completely reset session timers upon activity or continuation
  const resetSessionTimers = () => {
    if (isTimedOut) return; // Do not reset if already permanently timed out

    setShowIdleWarning(false);
    setIsWorkspaceIdle(false);
    setIdleCountdown(60);

    clearTimeout(idleTimerRef.current);
    clearTimeout(sessionTimerRef.current);

    const IDLE_TIMEOUT_MS = 60000;          // 1 minute for visual idle curtain
    const SESSION_TIMEOUT_MS = 29 * 60 * 1000; // 29 minutes for session expiration warning

    idleTimerRef.current = setTimeout(() => {
      if (!isReadingMode && !showIdleWarning && !isTimedOut) {
        setIsWorkspaceIdle(true);
      }
    }, IDLE_TIMEOUT_MS);

    sessionTimerRef.current = setTimeout(() => {
      if (!isReadingMode && !isTimedOut) {
        setShowIdleWarning(true);
        setIsWorkspaceIdle(true);
      }
    }, SESSION_TIMEOUT_MS);
  };

  useEffect(() => {
    if (isReadingMode || isTimedOut) {
      clearTimeout(idleTimerRef.current);
      clearTimeout(sessionTimerRef.current);
      setIsWorkspaceIdle(false);
      setShowIdleWarning(false);
      return;
    }

    resetSessionTimers();

    // 🟢 NEW FIX: Throttled event listener (max once per second) to stop UI lag
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'input', 'click'];
    const handleActivity = () => {
      const now = Date.now();
      if (now - lastActionRef.current > 1000) { 
        lastActionRef.current = now;
        resetSessionTimers();
      }
    };

    events.forEach(event => window.addEventListener(event, handleActivity, true));

    return () => {
      clearTimeout(idleTimerRef.current);
      clearTimeout(sessionTimerRef.current);
      events.forEach(event => window.removeEventListener(event, handleActivity, true));
    };
  }, [isReadingMode, isTimedOut, showIdleWarning]);

  // Countdown timer effect when warning modal pops up
  useEffect(() => {
    if (isTimedOut || !showIdleWarning) return;

    const countdownInterval = setInterval(() => {
      setIdleCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(countdownInterval);
          setShowIdleWarning(false);
          setIsTimedOut(true); // Triggers final lock screen
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(countdownInterval);
  }, [showIdleWarning, isTimedOut]);

  const handleForceLogout = () => {
    clearAuthSession();
    window.location.replace('/?session_expired=true');
  };

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

  const orbitText = "KAMPALA METROPOLITAN POLICE • CENTRALISED SECURITY DATA MANAGEMENT SYSTEM • ".split('');

  return (
    <div 
      className="fixed inset-0 flex flex-col items-center justify-center overflow-hidden"
      style={{
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        zIndex: 2147483646,
        pointerEvents: 'auto',
        isolation: 'isolate'
      }}
    >
      <style>{`
        @keyframes spin-orbit-y {
          0% { transform: rotateY(0deg); }
          100% { transform: rotateY(360deg); }
        }
        @keyframes continuous-globe-spin {
          0% { background-position-x: 0px; }
          100% { background-position-x: -800px; }
        }
      `}</style>

      <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center pointer-events-none">
        <div className="absolute inset-0 opacity-20 pointer-events-none flex flex-col justify-between z-0">
          <div className="h-1/3 w-full bg-black"></div>
          <div className="h-1/3 w-full bg-[#FCD116]"></div>
          <div className="h-1/3 w-full bg-[#D91B23]"></div>
        </div>

        <div 
          className="relative z-10 flex items-center justify-center w-72 h-72 rounded-full overflow-visible pointer-events-none"
          style={{ perspective: '1200px', transformStyle: 'preserve-3d' }}
        >
          <div 
            className="w-56 h-56 rounded-full shadow-[inset_-25px_-20px_45px_rgba(0,0,0,0.95),0_0_50px_rgba(0,0,0,0.85)] border-2 border-slate-700/60 overflow-hidden flex items-center justify-center bg-slate-900"
            style={{ 
              backgroundImage: `url('/upf_kmp_map.png')`,
              backgroundSize: '200px 100%',
              backgroundRepeat: 'repeat-x',
              animation: 'continuous-globe-spin 28s linear infinite'
            }}
          />
          
          <div 
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            style={{ 
              transformStyle: 'preserve-3d', 
              animation: 'spin-orbit-y 20s linear infinite' 
            }}
          >
            {orbitText.map((char, i, arr) => (
              <span 
                key={i} 
                className="absolute text-sky-400 font-extrabold text-[11px] uppercase tracking-widest drop-shadow-[0_0_6px_rgba(56,189,248,0.9)]"
                style={{ 
                  transform: `rotateY(${i * (360 / arr.length)}deg) translateZ(160px)` 
                }}
              >
                {char === ' ' ? '\u00A0' : char}
              </span>
            ))}
          </div>
        </div>
      </div>

      {(showIdleWarning || isTimedOut) && (
        <div 
          onClick={(e) => e.stopPropagation()}
          className="relative z-[2147483647] bg-white rounded-2xl p-6 sm:p-8 max-w-md w-full mx-4 shadow-2xl border border-slate-200 text-center animate-in zoom-in-95 duration-200 pointer-events-auto"
        >
          {isTimedOut ? (
            <>
              <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-100 shadow-inner">
                <AlertTriangle className="w-8 h-8 text-red-600" />
              </div>
              <h4 className="text-xl font-extrabold text-slate-900 mb-2">
                Session Expired Due to Inactivity
              </h4>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed font-medium mb-6">
                Your security session has expired because the system was left unattended. You have been securely logged out.
              </p>
              <button 
                type="button"
                onClick={handleForceLogout}
                className="w-full py-3.5 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl shadow-md cursor-pointer transition-colors"
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
                onClick={resetSessionTimers}
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

  const [realOnlineUsers, setRealOnlineUsers] = useState([]);

  useEffect(() => {
    if (!hasValidSession()) return;

    const syncHeartbeat = async () => {
      try {
        const hb = await authFetch('/api/v1/users/heartbeat', { method: 'POST' });

        if (hb.status === 401) {
          window.dispatchEvent(new Event('auth-expired'));
          return;
        }

        if (hb.ok) {
          const hbData = await hb.json();
          if (hbData.new_token && currentUser?.fnum) {
            setAuthSession(hbData.new_token, currentUser.fnum);
          }
        }

        const response = await authFetch('/api/v1/users/online');
        if (response.ok) {
          setRealOnlineUsers(await response.json());
        }
      } catch (err) {
        console.warn("Heartbeat sync paused...");
      }
    };

    syncHeartbeat();
    // 🟢 NEW FIX: Reduced heartbeat frequency to 60 seconds to stop network spam
    const heartbeatInterval = setInterval(syncHeartbeat, 60000); 
    return () => clearInterval(heartbeatInterval);
  }, [currentUser?.fnum]);

  const lastLoggedPage = useRef(null);

  useEffect(() => {
    if (!currentUser?.fnum || !currentPage || !hasValidSession()) return;
    if (lastLoggedPage.current === currentPage) return;
    
    lastLoggedPage.current = currentPage;

    authFetch('/api/v1/activity-logs', {
      method: 'POST',
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

  const navItems = [
    checkClearance(currentUser, 'acc_home', true) ? { 
      name: 'Home Dashboard', 
      id: 'home', 
      icon: (
        <div className="relative flex items-center justify-center">
          <Home size={20} />
          {hasUnreadComms && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-green-500 rounded-full shadow-[0_0_8px_#22c55e] animate-ping" />}
          {hasUnreadComms && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-green-500 rounded-full" />}
        </div>
      )
    } : null,
    checkClearance(currentUser, 'acc_comms', true) ? { name: 'Command Communications', id: 'Admin_Communication', icon: <Bell size={20} /> } : null,
    checkClearance(currentUser, 'acc_crime', true) ? { name: 'Crime/Incident Registry', id: 'reports', icon: <LayoutDashboard size={20} /> } : null,
    checkClearance(currentUser, 'acc_ops', true) ? { name: 'Disruptive OPS Statistics', id: 'statistics', icon: <BarChart3 size={20} /> } : null,
    checkClearance(currentUser, 'acc_stories', true) ? { name: 'Success Stories', id: 'success', icon: <Trophy size={20} /> } : null,
    checkClearance(currentUser, 'acc_est', true) ? { name: 'Establishments', id: 'establishments', icon: <Building size={20} /> } : null,
    checkClearance(currentUser, 'acc_analytics', true) ? { name: 'Analytics & Reports', id: 'analytics', icon: <PieChart size={20} /> } : null,
    checkClearance(currentUser, 'acc_hr', true) ? { name: 'Nominal Roll', id: 'nominal-roll', icon: <Users size={20} /> } : null,
    checkClearance(currentUser, 'acc_tripartite', true) ? { name: 'Tripartite Reports', id: 'reports_hub', icon: <FileText size={20} /> } : null,
    checkClearance(currentUser, 'acc_ai', true) ? { 
      name: 'AI Command Console', 
      id: 'ai_console', 
      icon: <Sparkles size={20} className="text-amber-400" /> 
    } : null
  ].filter(Boolean);

const handleExportLogs = async () => {
    try {
      const response = await authFetch('/api/v1/audit-logs/export', {
        method: 'GET'
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || "Security Clearance Denied or Export Failed");
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.style.display = 'none';
      link.href = downloadUrl;
      
      const today = new Date().toISOString().split('T')[0];
      link.download = `SECURE_AUDIT_LOGS_${today}.zip`; 
      
      document.body.appendChild(link);
      link.click();
      
      setTimeout(() => {
         document.body.removeChild(link);
         window.URL.revokeObjectURL(downloadUrl);
      }, 2000);
      
    } catch (error) {
      console.error("Export failed:", error);
      alert(`Failed to export Audit Logs: ${error.message}`);
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
                  onClick={() => setCurrentPage(item.id)}
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

            {sidebarOpen && checkClearance(currentUser, 'acc_approvals', ['ADMIN', 'SUPER_ADMIN', 'RPC', 'ASSISTANT_SUPER_ADMIN'].includes(currentUser?.role) || currentUser?.permissions?.system_admin) && (
              <div className="px-4 space-y-3 min-w-max">
                <div className={`rounded-lg p-3 transition-colors ${currentPage === 'approvals' ? 'bg-slate-700 border border-slate-600' : 'bg-slate-800'}`}>
                  <div className="text-sm font-bold mb-2 flex items-center"><UserPlus size={16} className="mr-2"/> Access & Approvals</div>
                  <button onClick={() => setCurrentPage('approvals')} className={`w-full text-xs py-4 rounded transition font-medium cursor-pointer ${currentPage === 'approvals' ? 'bg-green-600 text-white' : 'bg-slate-300 hover:bg-slate-600 text-slate-900 hover:text-white'}`}>
                    All Access Approvals & Logs
                  </button>
                </div>
              </div>
            )}

            {sidebarOpen && checkClearance(currentUser, 'acc_online', true) && (
              <div className="rounded-lg p-4 bg-slate-800 mx-4 mt-3">
                <button type="button" onClick={() => setShowOnline(!showOnline)} className="w-full flex justify-between items-center text-sm font-bold text-green-400 cursor-pointer">
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
            )}

            {sidebarOpen && checkClearance(currentUser, 'acc_roster', true) && (
              <div className="px-4 mt-3 space-y-3 min-w-max">
                <div className="rounded-lg p-3 bg-slate-800 border border-slate-700">
                  <button onClick={() => setShowAllUsers(!showAllUsers)} className="w-full flex justify-between items-center text-sm font-bold text-blue-400 cursor-pointer">
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

            {sidebarOpen && checkClearance(currentUser, 'acc_ledgers', true) && (
              <div className="px-4 mt-4 space-y-3 min-w-max pb-4">
                <div className="bg-slate-800 rounded-lg p-3 border border-yellow-600/30">
                  <div className="text-sm font-bold text-yellow-500 mb-3 flex items-center"><Shield size={16} className="mr-2"/> ⚙️ Reports & Ledgers</div>
                  <div className="space-y-4">
                    <div>
                      <span className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-1 block">HR & Establishments</span>
                      <div className="flex space-x-2">
                        <button onClick={onViewHRReport} className="flex-1 bg-blue-600 hover:bg-blue-500 text-white text-xs py-2 rounded transition flex items-center justify-center cursor-pointer">
                          <Eye size={14} className="mr-1"/> View
                        </button>
{checkClearance(currentUser, 'export_data', true) && (
  <button 
    onClick={onGenerateHRReport} 
    className="flex-1 flex items-center justify-center text-xs font-bold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded px-3 py-1.5 transition-colors cursor-pointer"
  >
    <Download className="w-3 h-3 mr-2" />
    Export
  </button>
)}
                      </div>
                    </div>
                    {checkClearance(currentUser, 'acc_consolidated', true) && (
                      <button onClick={onViewConsolidated} className="w-full text-xs py-2 rounded transition flex items-center justify-center font-bold mt-3 bg-slate-900 hover:bg-slate-950 text-blue-400 border border-blue-900 cursor-pointer">
                        <Eye size={14} className="mr-2"/> Consolidated Entries
                      </button>
                    )}
                    {checkClearance(currentUser, 'export_logs', ['SUPER_ADMIN'].includes(currentUser?.role)) && (
                      <button onClick={handleExportLogs} className="w-full mt-2 text-xs py-2 rounded transition font-bold bg-slate-900 hover:bg-slate-950 text-slate-300 border border-slate-700 flex items-center justify-center cursor-pointer">
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
            <button onClick={onLogout} className={`flex items-center w-full py-2 text-red-400 hover:bg-slate-800 rounded-lg transition-colors border border-transparent hover:border-red-900 cursor-pointer ${sidebarOpen ? 'px-4 justify-start' : 'px-0 justify-center'}`}>
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
              className={`transition-all duration-300 ease-in-out rounded-full shadow-md flex items-center justify-center border font-bold text-xs cursor-pointer ${isMotionExpanded ? 'px-3.5 py-1.5 gap-2' : 'p-2'} ${isAnimating ? 'bg-amber-600 hover:bg-amber-700 text-white border-amber-500' : 'bg-slate-700 hover:bg-slate-800 text-slate-200 border-slate-600'}`}
              title={isAnimating ? "Pause Background Motion" : "Play Background Motion"}
            >
              <span className="text-sm">{isAnimating ? '⏸' : '▶'}</span>
              {isMotionExpanded && <span className="whitespace-nowrap animate-in fade-in duration-200 font-bold">{isAnimating ? 'Pause Motion' : 'Play Motion'}</span>}
            </button>

            <button onClick={() => setIsFullScreen(!isFullScreen)} className="bg-blue-400 hover:bg-blue-500 text-white px-3 py-1.5 rounded text-xs font-bold shadow-md transition-colors flex items-center gap-2 border border-blue-400 cursor-pointer">
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
              <button onClick={() => setSelectedUserDetail(null)} className="text-slate-400 hover:text-white transition-colors cursor-pointer"><X size={20} /></button>
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
                              const res = await authFetch(`/api/v1/admin/users/${selectedUserDetail.fnum}/force-password`, {
                                method: 'PUT',
                                body: JSON.stringify({ new_password: newForcePassword })
                              });
                              if (!res.ok) throw new Error(await res.text());
                              alert(`Password successfully changed for ${selectedUserDetail.name}.`);
                              setNewForcePassword('');
                            } catch (err) { alert('Error: ' + err.message); }
                          }}
                          className="bg-red-600 hover:bg-red-700 text-white font-bold px-4 py-2 rounded text-xs transition border border-red-800 shrink-0 cursor-pointer"
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
              <button onClick={() => setSelectedUserDetail(null)} className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold text-xs py-2 px-4 rounded-lg shadow-sm transition-colors flex items-center border border-gray-300 cursor-pointer">
                <X size={14} className="mr-1"/> Close Profile
              </button>
              {selectedUserDetail.isSystemUser && (
                currentUser?.role === 'SUPER_ADMIN' || (currentUser?.role?.includes('ADMIN') && selectedUserDetail.role !== 'SUPER_ADMIN' && currentUser?.region === selectedUserDetail.region)
              ) && (
                <button onClick={() => { if (window.confirm(`Are you absolutely sure you want to revoke all system access for ${selectedUserDetail.name}?`)) { onRevokeUser(selectedUserDetail.fnum); setSelectedUserDetail(null); } }} className="text-xs font-bold text-red-600 hover:text-white hover:bg-red-600 py-2 px-4 rounded-lg transition-colors border border-red-200 shadow-sm cursor-pointer">
                  Revoke Access
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {viewingProfileImage && (
        <div className="fixed inset-0 bg-black/90 z-[300] flex justify-center items-center p-4 animate-in fade-in" onClick={() => setViewingProfileImage(null)}>
          <button className="absolute top-6 right-6 text-white hover:text-red-500 transition-colors bg-white/10 p-2 rounded-full shadow-lg cursor-pointer"><X size={24}/></button>
          <img src={viewingProfileImage} alt="Full Profile" className="max-w-full max-h-[90vh] object-contain rounded-xl shadow-2xl border-2 border-slate-700" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </>
  );
};

// ====================================================================
// --- MAIN APP COMPONENT ---
// ====================================================================
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
  const [generalDocs, setGeneralDocs] = useState([]);
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

  const [filterRegion, setFilterRegion] = useState('ALL REGIONS');
  const [filterStation, setFilterStation] = useState('ALL STATIONS');

  const lastActivityRef = useRef(Date.now());

  const grandTotals = useMemo(() => {
    return calculateGrandTotals(reports, currentUser, filterRegion, filterStation);
  }, [reports, currentUser, filterRegion, filterStation]);

  // 🟢 NEW FIX: Master event listener to catch Auth Expiration from anywhere
  useEffect(() => {
    const handleAuthExpiry = () => {
      clearAuthSession();
      setCurrentUser(null);
      window.location.replace('/?session_expired=true');
    };
    
    window.addEventListener('industrial-auth-expired', handleAuthExpiry);
    window.addEventListener('auth-expired', handleAuthExpiry);
    
    return () => {
      window.removeEventListener('industrial-auth-expired', handleAuthExpiry);
      window.removeEventListener('auth-expired', handleAuthExpiry);
    };
  }, [setCurrentUser]);

  useEffect(() => {
    const handleOnlineStatus = async () => {
      if (navigator.onLine) {
        const token = getAuthToken();
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
    const initApp = () => {
      const token = getAuthToken();
      const params = new URLSearchParams(window.location.search);

      if (params.get('session_expired') === 'true' || !token || !currentUser) {
        clearAuthSession();
        setCurrentUser(null);
        if (params.get('session_expired') === 'true') {
          window.history.replaceState({}, document.title, window.location.pathname);
        }
        setIsInitializing(false);
        return;
      }

      setIsInitializing(false);
    };

    initApp();
  }, [setCurrentUser, currentUser]);

  useEffect(() => {
    const markActive = () => {
      lastActivityRef.current = Date.now();
    };

    const events = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    events.forEach(e => window.addEventListener(e, markActive, { passive: true }));

    return () => {
      events.forEach(e => window.removeEventListener(e, markActive));
    };
  }, []);

// 🟢 REAL-TIME LISTENER & SYNC: Fixed Polling interval to 60 seconds (60000ms)
  useEffect(() => {
    if (!currentUser?.fnum || !hasValidSession()) return; 
    const controller = new AbortController();
    
    const fetchAllData = async () => {
      if (document.hidden) return;

      const isUserIdle = (Date.now() - lastActivityRef.current) > 60000;
      if (isUserIdle) return;

      try {
        const [resUsers, resReports, resStats, resStories, resEst, resNom, resArc, resComms, resDocs] = await Promise.all([
          authFetch('/api/v1/users', { signal: controller.signal }),
          authFetch('/api/v1/reports', { signal: controller.signal }),
          authFetch('/api/v1/stats', { signal: controller.signal }),
          authFetch('/api/v1/stories', { signal: controller.signal }),
          authFetch('/api/v1/establishments', { signal: controller.signal }),
          authFetch('/api/v1/nominal-roll', { signal: controller.signal }),
          authFetch('/api/v1/nominal-roll-archive', { signal: controller.signal }), 
          authFetch('/api/v1/communications', { signal: controller.signal }),
          authFetch('/api/v1/general-documents', { signal: controller.signal })
        ]);

        if (resReports && resReports.ok) setReports(await resReports.json());
        if (resStats && resStats.ok) setStats(await resStats.json());
        if (resStories && resStories.ok) setStories(await resStories.json());
        if (resEst && resEst.ok) setEstablishments(await resEst.json());
        if (resNom && resNom.ok) setNominal_Rolls(await resNom.json());
        if (resArc && resArc.ok) setNominal_Roll_archives(await resArc.json());
        if (resComms && resComms.ok) setAdminCommsData(await resComms.json());
        if (resDocs && resDocs.ok) setGeneralDocs(await resDocs.json());

        // Sync dynamic matrix permissions in RAM only
        if (resUsers && resUsers.ok) {
          const allUsers = await resUsers.json();
          setUsers(allUsers);
          
          const myFnum = currentUser?.fnum;
          const me = allUsers.find(u => u.fnum === myFnum);

          if (me) {
            let serverPerms = me.permissions;
            if (typeof serverPerms === 'string') {
              try { serverPerms = JSON.parse(serverPerms); } catch (e) { serverPerms = {}; }
            }
            serverPerms = serverPerms || {};

            setCurrentUser(prev => {
              if (!prev) return prev;

              let prevPerms = prev.permissions;
              if (typeof prevPerms === 'string') {
                try { prevPerms = JSON.parse(prevPerms); } catch (e) { prevPerms = {}; }
              }
              prevPerms = prevPerms || {};

              const isSuperAdmin = prev.role === 'SUPER_ADMIN' || me.role === 'SUPER_ADMIN';
              const hasGlobalRoster = isSuperAdmin || serverPerms.view_global_roster === true || prevPerms.view_global_roster === true;
              const hasGlobalObserver = isSuperAdmin || serverPerms.global_observer === true || prevPerms.global_observer === true;

              const mergedPermissions = {
                ...prevPerms,
                ...serverPerms,
                view_global_roster: hasGlobalRoster,
                global_observer: hasGlobalObserver
              };

              const resolvedRole = isSuperAdmin ? 'SUPER_ADMIN' : (me.role || prev.role);

              // Prevent infinite re-renders by doing a deep comparison
              const permissionsUnchanged = JSON.stringify(mergedPermissions) === JSON.stringify(prevPerms);
              const roleUnchanged = resolvedRole === prev.role;

              if (permissionsUnchanged && roleUnchanged) {
                return prev;
              }

              return {
                ...prev,
                permissions: mergedPermissions,
                role: resolvedRole
              };
            });
          }
        }
      } catch (error) { 
        if (error.name !== 'AbortError' && error.message !== 'UNAUTHORIZED') {
          console.error("Data Sync Error:", error);
        }
      } 
    };   

    fetchAllData();
    // 🟢 NEW FIX: Change API polling interval from 5 seconds to 60 seconds
    const pollingInterval = setInterval(fetchAllData, 60000); 

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        lastActivityRef.current = Date.now();
        fetchAllData();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      controller.abort();
      clearInterval(pollingInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [currentUser?.fnum]);

  const handleMasterExport = async (scope, value) => {
    let url = `/api/v1/reports/export?timeframe=all`; 
    if (scope && value) url += `&scope=${scope}&value=${encodeURIComponent(value)}`;
    downloadWithAuth(url, `KMP_Master_Ledger_${value || "General"}_${new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0]}.zip`);
  };

  const handleAcknowledgeComm = async (commId) => {
    try {
      const response = await authFetch(`/api/v1/communications/${commId}/acknowledge`, { method: 'POST' });
      if (response.ok) setAdminCommsData(prevData => prevData.map(c => c.id === commId ? { ...c, acknowledged: true } : c));
    } catch (err) { console.error("Failed to acknowledge receipt", err); }
  };

  const handlePageChange = (pageId) => { setCurrentPage(pageId); setIsViewingConsolidated(false); setIsViewingHR(false); };

  const renderPage = () => {
    const canViewGlobal = canViewGlobalJurisdiction(currentUser);

    switch (currentPage) {
      case 'home':  
        return checkClearance(currentUser, 'acc_home', true) ? (
          <HomeDashboard 
            currentUser={currentUser} 
            setCurrentPage={handlePageChange} 
            onMasterExport={handleMasterExport} 
            onViewConsolidated={handleViewConsolidated} 
            adminCommsData={adminCommsData} 
            onAcknowledgeComm={handleAcknowledgeComm} 
            onOpenInbox={() => { setCommDefaultTab('INBOX'); handlePageChange('Admin_Communication'); }} 
          />
        ) : null;

      case 'reports':  
        return checkClearance(currentUser, 'acc_crime', true) ? (
          <CrimeIncidentRegistry 
            currentUser={currentUser} 
            canViewGlobal={canViewGlobal} 
            reports={reports} 
            setReports={setReports} 
          />
        ) : (
          <HomeDashboard 
            currentUser={currentUser} 
            setCurrentPage={handlePageChange} 
            onMasterExport={handleMasterExport} 
            onViewConsolidated={handleViewConsolidated} 
            adminCommsData={adminCommsData} 
            onAcknowledgeComm={handleAcknowledgeComm} 
            onOpenInbox={() => { setCommDefaultTab('INBOX'); handlePageChange('Admin_Communication'); }} 
          />
        );

      case 'statistics':  
        return checkClearance(currentUser, 'acc_ops', true) ? (
          <Statistics 
            currentUser={currentUser} 
            canViewGlobal={canViewGlobal} 
            stats={stats} 
            setStats={setStats} 
          />
        ) : (
          <HomeDashboard 
            currentUser={currentUser} 
            setCurrentPage={handlePageChange} 
            onMasterExport={handleMasterExport} 
            onViewConsolidated={handleViewConsolidated} 
            adminCommsData={adminCommsData} 
            onAcknowledgeComm={handleAcknowledgeComm} 
            onOpenInbox={() => { setCommDefaultTab('INBOX'); handlePageChange('Admin_Communication'); }} 
          />
        );

      case 'success':  
        return checkClearance(currentUser, 'acc_stories', true) ? (
          <SuccessStories 
            currentUser={currentUser} 
            canViewGlobal={canViewGlobal} 
            stories={stories} 
            setStories={setStories} 
          />
        ) : (
          <HomeDashboard 
            currentUser={currentUser} 
            setCurrentPage={handlePageChange} 
            onMasterExport={handleMasterExport} 
            onViewConsolidated={handleViewConsolidated} 
            adminCommsData={adminCommsData} 
            onAcknowledgeComm={handleAcknowledgeComm} 
            onOpenInbox={() => { setCommDefaultTab('INBOX'); handlePageChange('Admin_Communication'); }} 
          />
        );

      case 'establishments':  
        return checkClearance(currentUser, 'acc_est', true) ? (
          <Establishments 
            currentUser={currentUser} 
            canViewGlobal={canViewGlobal} 
            establishments={establishments} 
            setEstablishments={setEstablishments} 
          />
        ) : (
          <HomeDashboard 
            currentUser={currentUser} 
            setCurrentPage={handlePageChange} 
            onMasterExport={handleMasterExport} 
            onViewConsolidated={handleViewConsolidated} 
            adminCommsData={adminCommsData} 
            onAcknowledgeComm={handleAcknowledgeComm} 
            onOpenInbox={() => { setCommDefaultTab('INBOX'); handlePageChange('Admin_Communication'); }} 
          />
        );

      case 'analytics':  
        return checkClearance(currentUser, 'acc_analytics', true) ? (
          <AnalyticsDashboard 
            nominalRolls={Nominal_Rolls} 
            crimeRegistry={reports} 
            successStories={stories} 
            operationalStats={stats} 
          />
        ) : (
          <HomeDashboard 
            currentUser={currentUser} 
            setCurrentPage={handlePageChange} 
            onMasterExport={handleMasterExport} 
            onViewConsolidated={handleViewConsolidated} 
            adminCommsData={adminCommsData} 
            onAcknowledgeComm={handleAcknowledgeComm} 
            onOpenInbox={() => { setCommDefaultTab('INBOX'); handlePageChange('Admin_Communication'); }} 
          />
        );

      case 'nominal-roll':  
        return checkClearance(currentUser, 'acc_hr', true) ? (
          <Nominal_Roll 
            currentUser={currentUser} 
            canViewGlobal={canViewGlobal} 
            Nominal_Rolls={Nominal_Rolls} 
            setNominal_Rolls={setNominal_Rolls} 
            Nominal_Roll_archives={Nominal_Roll_archives} 
            setNominal_Roll_archives={setNominal_Roll_archives} 
          />
        ) : (
          <HomeDashboard 
            currentUser={currentUser} 
            setCurrentPage={handlePageChange} 
            onMasterExport={handleMasterExport} 
            onViewConsolidated={handleViewConsolidated} 
            adminCommsData={adminCommsData} 
            onAcknowledgeComm={handleAcknowledgeComm} 
            onOpenInbox={() => { setCommDefaultTab('INBOX'); handlePageChange('Admin_Communication'); }} 
          />
        );

      case 'reports_hub':  
        return checkClearance(currentUser, 'acc_tripartite', true) ? (
          <WordReportUpload 
            currentUser={currentUser} 
            generalDocs={generalDocs}
            setGeneralDocs={setGeneralDocs}
          />
        ) : (
          <HomeDashboard 
            currentUser={currentUser} 
            setCurrentPage={handlePageChange} 
            onMasterExport={handleMasterExport} 
            onViewConsolidated={handleViewConsolidated} 
            adminCommsData={adminCommsData} 
            onAcknowledgeComm={handleAcknowledgeComm} 
            onOpenInbox={() => { setCommDefaultTab('INBOX'); handlePageChange('Admin_Communication'); }} 
          />
        ); 

      case 'ai_console':
        return (
          <AICommandConsole 
            currentUser={currentUser} 
            canViewGlobal={canViewGlobal}
            onBack={() => handlePageChange('home')}
          />
        );

      case 'approvals':  
        return checkClearance(currentUser, 'acc_approvals', ['ADMIN', 'SUPER_ADMIN', 'RPC', 'Deputy Commander', 'ASSISTANT_SUPER_ADMIN'].includes(currentUser.role)) ? (
          <AdminApprovals 
            pendingUsers={pendingUsers} 
            setPendingUsers={setPendingUsers} 
            users={users} 
            setUsers={setUsers} 
            currentUser={currentUser} 
          />
        ) : (
          <HomeDashboard 
            currentUser={currentUser} 
            setCurrentPage={handlePageChange} 
            onMasterExport={handleMasterExport} 
            onViewConsolidated={handleViewConsolidated} 
            adminCommsData={adminCommsData} 
            onAcknowledgeComm={handleAcknowledgeComm} 
            onOpenInbox={() => { setCommDefaultTab('INBOX'); handlePageChange('Admin_Communication'); }} 
          />
        ); 

      case 'profile':  
        return checkClearance(currentUser, 'acc_profile', true) ? (
          <AdminProfile 
            currentUser={currentUser} 
            setCurrentUser={setCurrentUser} 
            setCurrentPage={handlePageChange} 
          />
        ) : (
          <HomeDashboard 
            currentUser={currentUser} 
            setCurrentPage={handlePageChange} 
            onMasterExport={handleMasterExport} 
            onViewConsolidated={handleViewConsolidated} 
            adminCommsData={adminCommsData} 
            onAcknowledgeComm={handleAcknowledgeComm} 
            onOpenInbox={() => { setCommDefaultTab('INBOX'); handlePageChange('Admin_Communication'); }} 
          />
        );

      case 'Admin_Communication':  
        return checkClearance(currentUser, 'acc_comms', true) ? (
          <Admin_Communication 
            currentUser={currentUser} 
            users={users} 
            setCurrentPage={handlePageChange} 
            onAcknowledgeComm={handleAcknowledgeComm} 
            initialTab={commDefaultTab} 
          />
        ) : (
          <HomeDashboard 
            currentUser={currentUser} 
            setCurrentPage={handlePageChange} 
            onMasterExport={handleMasterExport} 
            onViewConsolidated={handleViewConsolidated} 
            adminCommsData={adminCommsData} 
            onAcknowledgeComm={handleAcknowledgeComm} 
            onOpenInbox={() => { setCommDefaultTab('INBOX'); handlePageChange('Admin_Communication'); }} 
          />
        );

      default:  
        return (
          <HomeDashboard 
            currentUser={currentUser} 
            setCurrentPage={handlePageChange} 
            onMasterExport={handleMasterExport} 
            onViewConsolidated={handleViewConsolidated} 
            adminCommsData={adminCommsData} 
            onAcknowledgeComm={handleAcknowledgeComm} 
            onOpenInbox={() => { setCommDefaultTab('INBOX'); handlePageChange('Admin_Communication'); }} 
          />
        );
    }
  };

  const handleViewHRReport = async () => {
    try {
      const res = await authFetch('/api/v1/reports/establishments-json');
      if (!res.ok) throw new Error("Security clearance rejected or server error.");
      const data = await res.json(); 
      setHrLedgerData(data); 
      setIsViewingHR(true);
    } catch (err) { 
      alert("Cannot load HR ledger data. Ensure your session is active and you have network connectivity."); 
    }
  };

  const handleViewConsolidated = async () => {
    setIsViewingHR(false);
    const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0];
    const lastWeek = new Date(); 
    lastWeek.setDate(lastWeek.getDate() - 30);
    const start = lastWeek.toISOString().split('T')[0];

    try {
      const response = await authFetch(`/api/v1/reports/consolidated-ledger?start_date=${start}&end_date=${today}`);
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || `Server status ${response.status}`);
      }
      const data = await response.json(); 
      
      setConsolidatedData({
        crimes: data.crimes || [],
        statistics: data.statistics || [],
        stories: data.stories || [],
        establishments: data.establishments || [],
        nominal_rolls: data.nominal_rolls || []
      });
      setIsViewingConsolidated(true);
    } catch (err) { 
      console.error("Consolidated Ledger load error:", err);
      alert(`Failed to load Consolidated Ledger: ${err.message}`); 
    }
  };

  if (isInitializing) return <h2 style={{ textAlign: 'center', marginTop: '20vh' }}>Verifying Officer Clearance...</h2>;

  if (currentUser && !currentUser.region) {
    clearAuthSession();
    setCurrentUser(null);
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50">
        <h2 className="text-2xl font-bold text-red-600 mb-2">Ghost Session Detected</h2>
        <p className="text-slate-600 mb-6">Corrupted session state detected. Click below to restart safely.</p>
        <button onClick={() => window.location.reload()} className="px-6 py-3 bg-blue-700 text-white font-bold rounded-lg shadow-md hover:bg-blue-800 cursor-pointer">Force Clear & Restart App</button>
      </div>
    );
  }

  if (!currentUser || !hasValidSession()) {
    return (
      <LoginScreen 
        onLogin={(user) => {
          setCurrentPage('home'); 
          setCurrentUser(user);
          authFetch('/api/v1/system/log-session', { 
            method: 'POST', 
            body: JSON.stringify({ fnum: user.fnum }) 
          }).catch(e => console.error(e));
        }} 
        onForgot={() => {}} 
        onSignup={(u) => setPendingUsers([...pendingUsers, u])} 
        pendingUsers={pendingUsers} 
        activeUsers={users} 
      />
    );
  }

  const handleGenerateHRReport = async () => {
    try {
      const response = await authFetch('/api/v1/hr/export-ledger'); 
      
      if (!response.ok) {
        throw new Error("Failed to securely generate the export.");
      }

      const blob = await response.blob();
      
      // Force the browser to download it as a .zip
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'SECURE_HR_LEDGER.zip'); 
      
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      alert("Export successful. Please use your exact Force Number to decrypt the ZIP file.");
      
    } catch (error) {
      console.error("Export Error:", error);
      alert("Command Error: Failed to download the HR Ledger.");
    }
  };

  const handleUpdateUserRole = async (fnum, newRole, newPermissions) => {
    setUsers(users.map(u => u.fnum === fnum ? { ...u, role: newRole, permissions: newPermissions } : u));
    try {
      await authFetch(`/api/v1/users/${fnum}/access`, { 
        method: "PUT", 
        body: JSON.stringify({ role: newRole, permissions: newPermissions }) 
      });
    } catch (err) { 
      console.error("Failed to save permissions to database:", err); 
    }
  };

  const handleRevokeUser = async (fnum) => {
    const reason = window.prompt(`Please state the official reason for revoking access for ${fnum}:`);
    if (reason === null) return; 
    if (reason.trim() === '') return alert("An official reason is mandatory to revoke a user's access.");

    try {
      await authFetch(`/api/v1/users/${encodeURIComponent(fnum)}/revoke?reason=${encodeURIComponent(reason)}`, {
        method: "DELETE"
      });
      setUsers(users.filter(u => u.fnum !== fnum));
      alert(`Access revoked for ${fnum}. Reason logged in Audit Trail.`);
    } catch (err) { 
      console.error("Failed to revoke user:", err); 
    }
  };

  return (
    <>
      <DashboardLayout 
        currentUser={currentUser} 
        currentPage={currentPage} 
        setCurrentPage={handlePageChange} 
        onLogout={() => { 
          clearAuthSession();
          setCurrentUser(null);
          window.location.reload(); 
        }}
        onUpdateUserRole={handleUpdateUserRole} 
        onRevokeUser={handleRevokeUser} 
        users={users} 
        adminCommsData={adminCommsData}
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
            currentUser={currentUser}
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

        {/* 🟢 FLOATING AI INTELLIGENCE ASSISTANT */}
        <SystemAssistant 
          currentUser={currentUser} 
          canViewGlobal={canViewGlobalJurisdiction(currentUser)} 
          onClose={() => {}} 
        />
      </DashboardLayout>

      <WorkspaceSecurityCurtain />
    </>
  );
};

export default App;