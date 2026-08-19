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
import Statistics from './Statistics';
import Nominal_Roll from './Nominal_Roll';
import Establishments from './Establishments';
import SuccessStories from './SuccessStories';

// ====================================================================
// 1. CONSTANTS & CONFIGURATION
// ====================================================================
const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

const REGIONAL_HIERARCHY = {
  "KMP NORTH": ["KAWEMPE", "KAKIRI", "KASANGATI", "MATUGGA", "NANSANA", "OLD KAMPALA", "WAKISO", "WANDEGEYA"],
  "KMP EAST": ["JINJA ROAD", "KIRA", "KIRA ROAD", "MUKONO", "NAGGALAMA", "SEETA"],
  "KMP SOUTH": ["NATEETE", "CPS KAMPALA", "ENTEBBE", "KABALAGALA", "KAJJANSI", "KASENYI", "KATWE", "KYENGERA", "NSANGI"],
  "KMP HEADQUARTERS": ["KMP HEADQUARTERS", "FLYING SQUAD", "CRIME INTELLIGENCE", "KMP Headquarters", "KAWEMPE", "KAKIRI", "KASANGATI", "MATUGGA", "NANSANA", "OLD KAMPALA", "WAKISO", "WANDEGEYA", "JINJA ROAD", "KIRA", "KIRA ROAD", "MUKONO", "NAGGALAMA", "SEETA", "NATEETE", "CPS KAMPALA", "PARLIAMENT", "ENTEBBE", "KABALAGALA", "KAJJANSI", "KASENYI", "KATWE", "KYENGERA", "NSANGI"],
  "POLICE HEADQUARTERS": ["NAGURU", "KMP HEADQUARTERS", "FLYING SQUAD", "CRIME INTELLIGENCE", "KMP Headquarters", "KAWEMPE", "KAKIRI", "KASANGATI", "MATUGGA", "NANSANA", "OLD KAMPALA", "WAKISO", "WANDEGEYA", "JINJA ROAD", "KIRA", "KIRA ROAD", "MUKONO", "NAGGALAMA", "SEETA", "NATEETE", "CPS KAMPALA", "ENTEBBE", "KABALAGALA", "KAJJANSI", "KASENYI", "KATWE", "KYENGERA", "NSANGI"]
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

// 🟢 SOVEREIGN OVERRIDE & ENFORCEMENT ENGINE
export const checkClearance = (currentUser, permissionKey, defaultRoleAccess = false) => {
  if (!currentUser) return false;
  
  // Super Admin absolute god-mode override
  if (currentUser.role === 'SUPER_ADMIN') return true;

  const perms = currentUser.permissions || {};

  // 1. SOVEREIGN DENIAL OVERRIDE: If explicitly set to false in matrix, deny instantly
  if (typeof perms[permissionKey] === 'boolean') {
    return perms[permissionKey];
  }

  // 2. Fall back to standard baseline role/position clearance
  return Boolean(defaultRoleAccess);
};

export const calculateGrandTotals = (allSubmissions, currentUser, filterRegion, filterStation) => {
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

// 🟢 MASTER GLOBAL VIEW HELPER (Centralized Control for All Modules)
export const canViewGlobalJurisdiction = (user) => {
  if (!user) return false;
  if (['SUPER_ADMIN', 'ADMIN', 'RPC', 'Deputy Commander'].includes(user.role)) return true;
  return user.permissions?.view_global_roster === true || user.permissions?.global_observer === true;
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

const downloadWithAuth = async (url, filename) => {
    try {
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

// ====================================================================
// 3. CUSTOM HOOKS
// ====================================================================
export function usePersistentState(key, initialValue) {
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
  const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(currentUser.role);
  const isRPC = ['ADMIN', 'SUPER_ADMIN', 'RPC', 'Deputy Commander'].includes(currentUser.role);
  
  const hasNominalClearance = ['ADMIN', 'SUPER_ADMIN', 'RPC', 'Deputy Commander', 'Regional_HR_Officer'].includes(currentUser?.role) ||                        
                            (currentUser?.position || '').toUpperCase().includes('HR') ||
                            currentUser?.permissions?.view_nominal_roll ||                            
                            currentUser?.permissions?.upload_hr;

  const rawComms = adminCommsData || [];
  const safeComms = Array.isArray(rawComms) ? rawComms : (rawComms.data || rawComms.items || []);

  // 🟢 Role baseline + Super Control Panel Override checks
  const canViewCrime = checkClearance(currentUser, 'acc_crime', true);
  const canViewOps = checkClearance(currentUser, 'acc_ops', true);
  const canViewStories = checkClearance(currentUser, 'acc_stories', true);
  const canViewEst = checkClearance(currentUser, 'acc_est', ['ADMIN', 'SUPER_ADMIN', 'RPC', 'STATION_ADMIN'].includes(currentUser?.role));
  const canViewAnalytics = checkClearance(currentUser, 'acc_analytics', ['ADMIN', 'SUPER_ADMIN', 'RPC'].includes(currentUser?.role));
  const canViewHR = checkClearance(currentUser, 'acc_hr', hasNominalClearance);
  const canViewApprovals = checkClearance(currentUser, 'acc_approvals', ['ADMIN', 'SUPER_ADMIN', 'RPC', 'ASSISTANT_SUPER_ADMIN'].includes(currentUser?.role));
  const canViewConsolidated = checkClearance(currentUser, 'acc_consolidated', isAdmin || currentUser?.permissions?.consolidated);
  const canExportData = checkClearance(currentUser, 'export_data', isRPC || currentUser?.permissions?.export_data);

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

      {/* 🟢 OPTIMIZED MODULE GRID (Filtered with Override Engine) */}
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
// --- MAIN APP EXPORT ---
// ====================================================================
export default App;