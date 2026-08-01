import React, { useState, useMemo, useEffect, useRef } from 'react';
import { authFetch } from './api';
import { 
  LayoutDashboard, BarChart3, Trophy, UserPlus, LogOut, Menu, 
  Search, PlusCircle, Edit, Download, Shield, CheckCircle, 
  Award, Maximize2, Minimize2, Activity, User, Lock, 
  AlertTriangle, RadioReceiver, Eye, X, Building, Image, 
  Camera, Users, Home, Unlock, Send, Archive, PieChart,
  Bell, MessageSquare, Upload, ArrowLeft, Globe, WifiOff, Wifi
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

const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

const REGIONAL_HIERARCHY = {
  "KMP NORTH": ["KAWEMPE", "KAKIRI", "KASANGATI", "MATUGGA", "NANSANA", "OLD KAMPALA", "WAKISO", "WANDEGEYA"],
  "KMP EAST": ["JINJA ROAD", "KIRA", "KIRA ROAD", "MUKONO", "NAGGALAMA", "SEETA"],
  "KMP SOUTH": ["NATEETE", "CPS KAMPALA", "ENTEBBE", "KABALAGALA", "KAJJANSI", "KASENYI", "KATWE", "KYENGERA", "NSANGI"],
  "KMP HEADQUARTERS": ["KMP HEADQUARTERS", "FLYING SQUAD", "CRIME INTELLIGENCE", "KMP Headquarters", "KAWEMPE", "KAKIRI", "KASANGATI", "MATUGGA", "NANSANA", "OLD KAMPALA", "WAKISO", "WANDEGEYA", "JINJA ROAD", "KIRA", "KIRA ROAD", "MUKONO", "NAGGALAMA", "SEETA", "NATEETE", "CPS KAMPALA", "ENTEBBE", "KABALAGALA", "KAJJANSI", "KASENYI", "KATWE", "KYENGERA", "NSANGI"],
  "POLICE HEADQUARTERS": ["NAGURU", "KMP HEADQUARTERS", "FLYING SQUAD", "CRIME INTELLIGENCE", "KMP Headquarters", "KAWEMPE", "KAKIRI", "KASANGATI", "MATUGGA", "NANSANA", "OLD KAMPALA", "WAKISO", "WANDEGEYA", "JINJA ROAD", "KIRA", "KIRA ROAD", "MUKONO", "NAGGALAMA", "SEETA", "NATEETE", "CPS KAMPALA", "ENTEBBE", "KABALAGALA", "KAJJANSI", "KASENYI", "KATWE", "KYENGERA", "NSANGI"]
};

const autoCapitalize = (text) => {
  if (!text) return text;
  return text.replace(/(^\s*|>|\.\s+|\n\s*)([a-z])/g, (match, separator, letter) => {
    return separator + letter.toUpperCase();
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
    "Data Officer", "Data Assistant Officer"
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
    
    // Check queue count periodically
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
    if (onToggle) onToggle(true);
  };

  const closeFullScreen = () => {
    setIsExpanded(false);
    if (onToggle) onToggle(false);
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

const HomeDashboard = ({ currentUser, setCurrentPage, reports = [], stats = [], onMasterExport, onViewConsolidated, adminCommsData, onAcknowledgeComm }) => {
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

  const userStation = (currentUser.station || '').trim().toUpperCase();
  const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
  
  const hasSubmittedReport = (Array.isArray(reports) ? reports : []).some(r => 
    (r.station || '').trim().toUpperCase() === userStation && new Date(r.date).getTime() >= sevenDaysAgo
  );
  const hasSubmittedStats = (Array.isArray(stats) ? stats : []).some(s => 
    (s.station || '').trim().toUpperCase() === userStation && new Date(s.date).getTime() >= sevenDaysAgo
  );

  const hasSubmittedThisWeek = hasSubmittedReport || hasSubmittedStats;

  // 🟢 FIX 4: Explicitly target the exact requested officers for compliance alerts
  const userRole = (currentUser.role || '').toUpperCase();
  const userPosition = (currentUser.position || '').toUpperCase();
  const targetRoles = ['RPC', 'DEPUTY RPC', 'DPC', 'HR OFFICER', 'DATA OFFICER', 'DATA ASSISTANT OFFICER'];
  
  const isTargetOfficer = 
    ['ADMIN', 'SUPER_ADMIN'].includes(userRole) || 
    targetRoles.some(pos => userPosition.includes(pos));

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

  const [viewingReceiptsFor, setViewingReceiptsFor] = useState(null);
  const [receiptsData, setReceiptsData] = useState([]);
  const [loadingReceipts, setLoadingReceipts] = useState(false);

  const fetchReceipts = async (commId) => {
    setViewingReceiptsFor(commId);
    setLoadingReceipts(true);
    try {
      const token = localStorage.getItem('kmp_authToken');
      const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
      const res = await fetch(`${API_URL}/api/v1/communications/${commId}/readers`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if(res.ok) setReceiptsData(await res.json());
    } catch(e) { console.error(e); } finally { setLoadingReceipts(false); }
  };

  const relevantComms = safeComms.filter(c => {
    if (currentUser.role === 'SUPER_ADMIN') return true;
    const audience = c.target_audience || c.audience || 'ALL_USERS';
    const region = c.target_region || c.region;
    if (audience === 'ALL_USERS' || audience === 'ALL') return true;
    if (audience === 'ADMINS_ONLY' && isAdmin) return true;
    if (audience === 'RPC_ONLY' && isRPC) return true;
    if (audience === 'SPECIFIC_REGION' && region === currentUser.region) return true;
    if (audience === 'SPECIFIC_USER' && c.target_fnum === currentUser.fnum) return true;
    return false;
  }).slice(0, 5);
  
  const hasUnread = relevantComms.some(c => !c.acknowledged);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8 relative z-10 animate-in fade-in duration-300">
      
      {viewingReceiptsFor && (
        <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-sm flex justify-center items-center p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-300">
                <div className="bg-slate-900 text-white p-4 flex justify-between items-center">
                   <h3 className="font-bold flex items-center text-sm"><CheckCircle size={16} className="mr-2 text-green-400"/> Acknowledgment Receipts</h3>
                   <button onClick={() => setViewingReceiptsFor(null)} className="hover:bg-slate-700 p-1 rounded"><X size={18}/></button>
                </div>
                <div className="p-4 max-h-[60vh] overflow-y-auto custom-scrollbar bg-slate-50">
                   {loadingReceipts ? (
                      <p className="text-xs text-center text-gray-500 font-bold animate-pulse py-4">Fetching ledgers...</p>
                   ) : receiptsData.length === 0 ? (
                      <p className="text-xs text-center text-gray-500 font-medium py-4">No officers have acknowledged this dispatch yet.</p>
                   ) : (
                       <div className="space-y-2">
                          {receiptsData.map((r, i) => (
                             <div key={i} className="flex justify-between items-center text-xs p-3 bg-white rounded shadow-sm border border-slate-100">
                                <div><span className="font-extrabold text-slate-800 block">{r.name}</span><span className="font-mono text-[9px] text-gray-400">{r.fnum}</span></div>
                                <span className="text-xs text-green-600 font-bold bg-green-50 px-2 py-1 rounded border border-green-200">Read: {r.read_at}</span>
                             </div>
                          ))}
                       </div>
                   )}
                </div>
            </div>
        </div>
      )}

      {showComplianceWarning && (
        <div className={`transition-all duration-700 ease-in-out overflow-hidden rounded-xl shadow-lg border-2 ${
          isBannerFolded ? 'bg-red-600 border-red-200 p-3 max-w-xs mx-auto cursor-pointer hover:bg-red-300' : 'bg-red-600 border-red-200 p-4 w-full animate-pulse'
        }`}
        onClick={() => isBannerFolded && setIsBannerFolded(false)}
        >
          {isBannerFolded ? (
            <div className="flex items-left justify-center space-x-2 text-white font-extrabold text-xs tracking-wide uppercase">
              <span className="flex h-3 w-3 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-300 opacity-45"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-yellow-400"></span>
              </span>
              <span>⚠️ Compliance Overdue: Click to View</span>
            </div>
          ) : (
            <div className="flex flex-col md:flex-row items-center justify-between text-white font-extrabold">
              <div className="flex items-center text-sm mb-3 md:mb-0">
                <AlertTriangle className="mr-3 w-6 h-6 shrink-0 text-yellow-300 animate-bounce" />
                <span>COMPLIANCE ALERT: Your weekly entries are overdue for {currentUser.station}. Please submit records immediately.</span>
              </div>
              <div className="flex space-x-2 shrink-0">
                <button onClick={(e) => { e.stopPropagation(); setIsBannerFolded(true); }} className="bg-red-800 text-white px-3 py-2 rounded font-bold shadow text-xs hover:bg-red-900 transition">
                  Fold Now
                </button>
                <button onClick={() => setCurrentPage('statistics')} className="bg-white text-red-700 px-4 py-2 rounded font-bold shadow text-xs hover:bg-gray-100 transition">
                  Go to Statistics
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {showComplianceSuccess && (
        <div className="bg-emerald-600 text-white font-extrabold p-4 rounded-xl shadow-lg flex items-center justify-between border-2 border-emerald-400">
          <div className="flex items-center text-sm">
            <CheckCircle className="mr-3 w-6 h-6 shrink-0 text-emerald-200" />
            <span>COMMAND COMMENDATION: Thank you, {currentUser.rank} {currentUser.name}, for duly filing your weekly returns. Command records reflect full compliance.</span>
          </div>
        </div>
      )}

      <div className="text-center flex flex-col items-center mt-4">
        <img src="/upf_badge.png" alt="UPF Logo" className="w-24 h-24 mb-1 object-contain drop-shadow-md contrast-200 brightness-75" />
        <h1 className="text-3xl font-bold text-gray-900 tracking-wide">UGANDA POLICE FORCE</h1>
        <h2 className="text-lg font-bold text-slate-600 mt-1 uppercase tracking-wide">KAMPALA METROPOLITAN POLICE HEADQUARTERS</h2>
        <h3 className="text-sm font-bold text-blue-600 mt-3 uppercase tracking-widest bg-blue-50 px-4 py-1 rounded-full border border-blue-200">Centralised Security Data Management System</h3>
      </div>

      <div className="w-full">
        <h3 className="text-center text-sm font-bold text-slate-600 bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
            Welcome, <span className="text-blue-700">{currentUser.rank} {currentUser.name}</span>. Select an operational module.
        </h3>   
      </div>

      <div onClick={() => setCurrentPage('Admin_Communication')} className="h-28 bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex items-center cursor-pointer transition-all hover:shadow-lg hover:-translate-y-1 hover:border-green-400 group relative overflow-hidden mb-4">
        {hasUnread && (
          <><div className="absolute top-3 right-3 w-3 h-3 bg-green-500 rounded-full shadow-[0_0_8px_#22c55e] animate-ping"></div>
            <div className="absolute top-3 right-3 w-3 h-3 bg-green-500 rounded-full"></div></>
        )}
        <div className="w-14 h-14 rounded-full bg-slate-900 text-white flex items-center justify-center mr-4 group-hover:bg-slate-800 transition-colors shrink-0">
          <RadioReceiver size={24} className={hasUnread ? "text-green-400 animate-pulse" : "text-slate-400"} />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-extrabold text-slate-900 leading-tight">Command Dispatches & Alerts</h3>
          <p className="text-xs font-medium mt-1 line-clamp-2 transition-colors duration-300 flex items-center">
            {hasUnread ? <span className="text-green-600 font-bold">You have unread Correspondences. Click to view.</span> : <span className="text-slate-500">Secure directives, network alerts, and command communications.</span>}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 w-full">
          <div onClick={() => setCurrentPage('reports')} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex items-center cursor-pointer transition-all hover:shadow-lg hover:-translate-y-1 hover:border-blue-300 group">
            <div className="w-14 h-14 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mr-4 group-hover:bg-blue-600 group-hover:text-white transition-colors shrink-0"><LayoutDashboard size={24} /></div>
            <div><h3 className="text-sm font-extrabold text-slate-900 leading-tight">Crime Registry</h3><p className="text-xs text-slate-500 font-medium mt-1">Log and track daily serious incidents.</p></div>
          </div>
          
          <div onClick={() => setCurrentPage('statistics')} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex items-center cursor-pointer transition-all hover:shadow-lg hover:-translate-y-1 hover:border-blue-300 group">
            <div className="w-14 h-14 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center mr-4 group-hover:bg-indigo-600 group-hover:text-white transition-colors shrink-0"><BarChart3 size={24} /></div>
            <div><h3 className="text-sm font-extrabold text-slate-900 leading-tight">OPS Statistics</h3><p className="text-xs text-slate-500 font-medium mt-1">Weekly numerical aggregates for operations.</p></div>
          </div>

          <div onClick={() => setCurrentPage('success')} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex items-center cursor-pointer transition-all hover:shadow-lg hover:-translate-y-1 hover:border-yellow-400 group">
            <div className="w-14 h-14 rounded-full bg-yellow-50 text-yellow-600 flex items-center justify-center mr-4 group-hover:bg-yellow-500 group-hover:text-white transition-colors shrink-0"><Trophy size={24} /></div>
            <div><h3 className="text-sm font-extrabold text-slate-900 leading-tight">Success Stories</h3><p className="text-xs text-slate-500 font-medium mt-1">Document tactical milestones against Crime.</p></div>
          </div>

          <div onClick={() => setCurrentPage('establishments')} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex items-center cursor-pointer transition-all hover:shadow-lg hover:-translate-y-1 hover:border-emerald-300 group">
            <div className="w-14 h-14 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mr-4 group-hover:bg-emerald-600 group-hover:text-white transition-colors shrink-0"><Building size={24} /></div>
            <div><h3 className="text-sm font-extrabold text-slate-900 leading-tight">Establishments</h3><p className="text-xs text-slate-500 font-medium mt-1">Map divisions, stations, posts and booths.</p></div>
          </div>

          {hasNominalClearance && (
            <div onClick={() => setCurrentPage('nominal-roll')} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex items-center cursor-pointer transition-all hover:shadow-lg hover:-translate-y-1 hover:border-purple-300 group">
              <div className="w-14 h-14 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center mr-4 group-hover:bg-purple-600 group-hover:text-white transition-colors shrink-0"><Users size={24} /></div>
              <div><h3 className="text-sm font-extrabold text-slate-900 leading-tight">Master Nominal Roll</h3><p className="text-xs text-slate-500 font-medium mt-1">Personnel data and deployment registry.</p></div>
            </div>
          )}

          {isAdmin && (
            <div onClick={() => setCurrentPage('approvals')} className="bg-slate-900 rounded-xl shadow-sm border border-slate-700 p-6 flex items-center cursor-pointer transition-all hover:shadow-lg hover:-translate-y-1 hover:border-slate-500 group">
              <div className="w-14 h-14 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center mr-4 group-hover:bg-slate-700 group-hover:text-white transition-colors shrink-0"><UserPlus size={24} /></div>
              <div><h3 className="text-sm font-extrabold text-white leading-tight">Access Approvals</h3><p className="text-xs text-slate-400 font-medium mt-1">Review system logs and pending signups.</p></div>
            </div>
          )}
          
          {canViewConsolidated && (
            <div onClick={onViewConsolidated} className="bg-slate-900 rounded-xl shadow-sm border border-slate-700 p-6 flex items-center cursor-pointer transition-all hover:shadow-lg hover:-translate-y-1 hover:border-slate-500 group md:col-span-2 lg:col-span-3">
              <div className="w-14 h-14 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center mr-4 group-hover:bg-slate-700 group-hover:text-white transition-colors shrink-0"><Eye size={24} /></div>
              <div><h3 className="text-sm font-extrabold text-white leading-tight">Consolidated Entries</h3><p className="text-xs text-slate-400 font-medium mt-1">Cross-domain master visualization.</p></div>
            </div>
          )}

          {canExportData && (
            <div onClick={() => onMasterExport('all', 'all')} className="bg-blue-900 rounded-xl shadow-sm border border-blue-800 p-6 flex items-center cursor-pointer transition-all hover:shadow-lg hover:-translate-y-1 hover:border-blue-400 group md:col-span-2 lg:col-span-3">
              <div className="w-14 h-14 rounded-full bg-blue-800 text-blue-200 flex items-center justify-center mr-4 group-hover:bg-blue-700 group-hover:text-white transition-colors shrink-0"><Download size={24} /></div>
              <div><h3 className="text-sm font-extrabold text-white leading-tight">Download Master Database</h3><p className="text-xs text-blue-200 font-medium mt-1">Export full encrypted .xlsx ledger.</p></div>
            </div>
          )}
      </div>
    </div>
  );
};



const CrimeIncidentRegistry = ({ currentUser, reports, setReports, setSidebarOpen }) => {
  const [operation, setOperation] = useState('new');
  const [notification, setNotification] = useState(null);
  const [selectedRecord, setSelectedRecord] = useState(null);

  const [filterRegion, setFilterRegion] = useState(currentUser?.role === 'SUPER_ADMIN' ? 'ALL REGIONS' : currentUser?.region || '');
  const [filterStation, setFilterStation] = useState((['SUPER_ADMIN', 'RPC', 'Deputy Commander'].includes(currentUser?.role) || currentUser?.permissions?.view_global_roster) ? 'ALL STATIONS' : currentUser?.station || '');

  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState('ALL TIME');
  const [updateSearch, setUpdateSearch] = useState('');

  const [showLockup, setShowLockup] = useState(false);
  const [newSuspect, setNewSuspect] = useState({ name: '', sex: 'MALE', age: '', tribe: '', residence: '', contact: '', mental_health_status: 'NORMAL', photo_url: '' });

  const getTodayString = () => new Date().toLocaleDateString('en-CA').split(',')[0].replace(/\//g, '-');

  const [formData, setFormData] = useState({
    sn: null, sd_ref: '', ref_type: 'SD Ref:', ref_number: '',
    region: currentUser.region, station: currentUser.station || REGIONAL_HIERARCHY[currentUser?.region]?.[0] || '',
    date: getTodayString(), time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }).replace(':', '') + 'Hrs',
    offence: '', customOffence: '', narrative: '', status: 'ACTIVE INVESTIGATION', suspectDetails: [], updateText: ''
  });

  const handleOperationToggle = (mode) => {
    setOperation(mode);
    setNotification(null);
    if (mode === 'new') {
      setFormData({
        sn: null, sd_ref: '', ref_type: 'SD Ref:', ref_number: '',
        region: currentUser.region, station: currentUser.station || REGIONAL_HIERARCHY[currentUser?.region]?.[0] || '',
        date: getTodayString(), time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }).replace(':', '') + 'Hrs',
        offence: '', customOffence: '', narrative: '', status: 'ACTIVE INVESTIGATION', suspectDetails: [], updateText: ''
      });
      setUpdateSearch(''); 
    }
  };

  const populateUpdateCrimeForm = (caseData) => {
    setFormData({ 
      ...caseData, sd_ref: caseData.sdRef || caseData.sd_ref, offence: caseData.offence || 'Other',
      customOffence: '', suspectDetails: caseData.suspectDetails || [], updateText: '' 
    });
  };

  const filteredReports = useMemo(() => {
    if (!Array.isArray(reports)) return [];
    return reports.filter(r => {
      const dbRegion = (r.region || '').trim().toUpperCase();
      const dbStation = (r.station || '').trim().toUpperCase();
      const selectedRegion = (filterRegion || '').trim().toUpperCase();
      const selectedStation = (filterStation || '').trim().toUpperCase();

      if (selectedRegion !== 'ALL REGIONS' && selectedRegion !== '' && dbRegion !== selectedRegion) return false;
      if (selectedStation !== 'ALL STATIONS' && selectedStation !== '' && dbStation !== selectedStation) return false;
      
      if (searchQuery) {
        const query = searchQuery.toLowerCase().trim();
        const textMatch = 
          (r.narrative || '').toLowerCase().includes(query) || 
          (r.station || '').toLowerCase().includes(query) || 
          (r.sdRef || r.sd_ref || '').toLowerCase().includes(query);
        if (!textMatch) return false;
      }
      
      if (dateFilter && dateFilter !== 'ALL TIME') {
        if (dateFilter === 'TODAY') {
          const todayStr = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0];
          if (r.date !== todayStr) return false;
        } else if (dateFilter === 'LAST 7 DAYS') {
          const repDate = new Date(r.date);
          const diffDays = (Date.now() - repDate) / (1000 * 60 * 60 * 24);
          if (diffDays > 7) return false;
        } else if (dateFilter === 'LAST 30 DAYS') {
          const repDate = new Date(r.date);
          const diffDays = (Date.now() - repDate) / (1000 * 60 * 60 * 24);
          if (diffDays > 30) return false;
        } else if (dateFilter === 'LAST 90 DAYS') {
          const repDate = new Date(r.date);
          const diffDays = (Date.now() - repDate) / (1000 * 60 * 60 * 24);
          if (diffDays > 90) return false;
        } else if (dateFilter === 'LAST 120 DAYS') {
          const repDate = new Date(r.date);
          const diffDays = (Date.now() - repDate) / (1000 * 60 * 60 * 24);
          if (diffDays > 120) return false;
        }
      }
      return true;
    });
  }, [reports, filterRegion, filterStation, searchQuery, dateFilter]);

  const availableUpdateCases = useMemo(() => {
    return (Array.isArray(reports) ? reports : []).filter(r => {
      if (!['ADMIN', 'SUPER_ADMIN'].includes(currentUser.role) && r.region !== currentUser.region) return false;
      if (updateSearch) {
        const query = updateSearch.toLowerCase();
        return (r.sdRef || r.sd_ref || '').toLowerCase().includes(query) || r.sn.toString().includes(query) || r.narrative.toLowerCase().includes(query);
      }
      return true;
    });
  }, [reports, currentUser, updateSearch]);

  const metrics = useMemo(() => {
    return {
      newCases: filteredReports.length,
      active: filteredReports.filter(r => r.status === 'ACTIVE INVESTIGATION').length,
      sanctioned: filteredReports.filter(r => r.status === 'FORWARDED TO COURT').length,
      closed: filteredReports.filter(r => r.status === 'CLOSED / CONVICTED').length,
      adr: filteredReports.filter(r => r.status === 'ADR').length,
      totalSuspects: filteredReports.reduce((sum, r) => sum + (parseInt(r.suspects) || 0), 0)
    };
  }, [filteredReports]);

  const handleInputChange = (e) => {
    const { name, value, type } = e.target;
    if (name === 'region') {
      setFormData({ ...formData, region: value, station: REGIONAL_HIERARCHY[value][0] });
    } else if (name === 'narrative' || name === 'updateText' || name === 'customOffence') {
      setFormData({ ...formData, [name]: autoCapitalize(value) });
    } else {
      setFormData({ ...formData, [name]: type === 'number' ? parseInt(value) || 0 : value });
    }
  };

  const handleAddSuspect = () => {
    if (!newSuspect.name.trim()) return alert("Suspect name is required.");
    setFormData({
      ...formData,
      suspectDetails: [...formData.suspectDetails, { ...newSuspect, id: Date.now() }]
    });
    setNewSuspect({ name: '', sex: 'MALE', age: '', tribe: '', residence: '', contact: '', mental_health_status: 'NORMAL', photo_url: '' }); 
  };

  const handleRemoveSuspect = (id) => {
    setFormData({
      ...formData, suspectDetails: formData.suspectDetails.filter(s => s.id !== id)
    });
  };

  const handleSuspectPhotoUpload = async (e) => {
    const file = e.target.files[0];
    if (file) {
      setNotification("⏳ Uploading suspect mugshot...");
      const uploadData = new FormData();
      uploadData.append("file", file);
      uploadData.append("category", "suspect_mugshot");
      uploadData.append("case_id", formData.sd_ref || "NEW_CASE");

      try {
        const token = localStorage.getItem('kmp_authToken');
        const response = await fetch(`${API_URL}/api/v1/investigation/upload/`, {
          method: "POST", headers: { "Authorization": `Bearer ${token}` }, body: uploadData,
        });
        const data = await response.json();
        if (data.full_s3_url || data.cloud_storage_path) {
          setNewSuspect({ ...newSuspect, photo_url: data.full_s3_url || `https://kmp-tracker-system-tu-16-06-26.s3.eu-central-1.amazonaws.com/${data.cloud_storage_path}` });
          setNotification("✅ Mugshot uploaded securely!");
        } else {
          throw new Error("Invalid response");
        }
      } catch (error) {
        console.warn("Backend offline. Using local preview.", error);
        setNewSuspect({ ...newSuspect, photo_url: URL.createObjectURL(file) });
        setNotification("⚠️ API unreachable. Using temporary local preview.");
      }
    }
  };

const handleFormSubmit = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem('kmp_authToken');
    if (!token) return setNotification("Error: Security token missing. Please log out and log back in.");
    
    if (operation === 'new') {
      const final_reference = `${formData.ref_type} ${formData.ref_number.toUpperCase()}`.trim();
      const isDuplicate = reports.some(r => 
        r.station === formData.station && (
          (r.sd_ref || r.sdRef || '').trim().toLowerCase() === final_reference.toLowerCase() || 
          r.narrative.trim().toLowerCase() === formData.narrative.trim().toLowerCase()
        )
      );

      if (isDuplicate) return setNotification(`Error: This specific ${formData.ref_type} entry or identical narrative already exists at ${formData.station}.`);

      const finalOffence = formData.offence === 'Other' ? formData.customOffence : formData.offence;
      
      // 🟢 FIX 2: We no longer send `exactNextSN`. Let the backend DB handle the ID assignment!
      const apiPayload = {
        sd_ref: final_reference, region: formData.region, station: formData.station,
        date: formData.date, time: formData.time, offence: finalOffence, narrative: formData.narrative,
        status: formData.status, suspects: formData.suspectDetails.length, 
        last_updated_by: `${currentUser.name} (${currentUser.fnum})`, suspectDetails: formData.suspectDetails
      };
      
      try {
        const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
        const response = await fetch(`${API_URL}/api/v1/reports`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
          body: JSON.stringify(apiPayload)
        });
        
        const resData = await response.json().catch(() => ({}));
        
        if (!response.ok) {
            throw new Error(resData.detail || "Neon Database rejected the entry.");
        }
        
        // 🟢 FIX 2: Grab the auto-generated SN and ID from the backend response
        const newReportLocal = { ...apiPayload, id: resData.id, sn: resData.sn };
        setReports([newReportLocal, ...reports]);
        setNotification(`Case SN ${newReportLocal.sn} (Ref: ${newReportLocal.sd_ref}) successfully registered!`);
        
        // 🟢 FIX 3: Force complete reset of the form states!
        handleOperationToggle('new');

      } catch (err) {
        setNotification(`❌ Error: ${err.message}`);
      }
    } else if (operation === 'update') {
      if (!formData.sn) return setNotification("Error: Please select a case from the list to update first.");

      let updatedNarrative = formData.updateText 
        ? `${formData.narrative}<br/><br/><strong>[UPDATE ${new Date().toLocaleString('sv-SE', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', '')}]:</strong><br/>${formData.updateText}` 
        : formData.narrative;
        
      const updatedRecord = { 
        ...formData, narrative: updatedNarrative, sd_ref: formData.sd_ref, 
        suspects: (formData.suspects || 0) + formData.suspectDetails.length,
        last_updated_by: `${currentUser.name} (${currentUser.fnum})`, suspectDetails: formData.suspectDetails
      };
      delete updatedRecord.updateText; delete updatedRecord.ref_type; delete updatedRecord.ref_number;
      
      try {
        const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
        const response = await fetch(`${API_URL}/api/v1/reports/${formData.sn}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
          body: JSON.stringify(updatedRecord)
        });

        if (!response.ok) throw new Error("Failed to update record in database.");

        setReports(reports.map(r => r.sn === formData.sn ? updatedRecord : r));
        setNotification(`Case SN ${formData.sn} successfully updated!`);
        handleOperationToggle('new');

      } catch (err) {
        setNotification("❌ Error: Could not update the record in the database.");
      }
    }
  };
  
  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6 relative z-10">
      {showLockup && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[100] flex justify-center items-center p-4 animate-in fade-in">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh] border border-red-200">
            <div className="bg-red-700 text-white px-6 py-4 flex justify-between items-center shrink-0">
              <h3 className="font-extrabold flex items-center tracking-wider"><Users className="mr-2" size={20}/> SUSPECT LOCKUP REGISTER</h3>
              <button onClick={() => setShowLockup(false)} className="hover:bg-red-600 p-1 rounded transition"><X size={20}/></button>
            </div>
            
            <div className="p-6 overflow-y-auto bg-slate-50 space-y-6 flex-1 custom-scrollbar">
              <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
                <h4 className="text-xs font-bold text-slate-500 uppercase mb-3">Add Suspect Details</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-3">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-gray-700 mb-1">Full Name *</label>
                    <input type="text" value={newSuspect.name} onChange={e => setNewSuspect({...newSuspect, name: e.target.value})} className="w-full text-sm border-gray-300 rounded border p-2 uppercase focus:ring-red-500" placeholder="e.g. OPIO JOHN"/>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Sex</label>
                    <select value={newSuspect.sex} onChange={e => setNewSuspect({...newSuspect, sex: e.target.value})} className="w-full text-sm border-gray-300 rounded border p-2 bg-white">
                      <option>MALE</option><option>FEMALE</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Age</label>
                    <input type="number" value={newSuspect.age} onChange={e => setNewSuspect({...newSuspect, age: e.target.value})} className="w-full text-sm border-gray-300 rounded border p-2" placeholder="e.g. 24"/>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Tribe/Nationality</label>
                    <input type="text" value={newSuspect.tribe} onChange={e => setNewSuspect({...newSuspect, tribe: e.target.value})} className="w-full text-sm border-gray-300 rounded border p-2 uppercase"/>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Contact/Phone</label>
                    <input type="text" value={newSuspect.contact} onChange={e => setNewSuspect({...newSuspect, contact: e.target.value})} className="w-full text-sm border-gray-300 rounded border p-2"/>
                  </div>
                  <div className="md:col-span-3">
                    <label className="block text-xs font-bold text-gray-700 mb-1">Residence/Location</label>
                    <input type="text" value={newSuspect.residence} onChange={e => setNewSuspect({...newSuspect, residence: e.target.value})} className="w-full text-sm border-gray-300 rounded border p-2" placeholder="e.g. Bwaise Zone 2"/>
                  </div>
                </div>
                
                <div className="md:col-span-3 bg-red-50 p-3 rounded-lg border border-red-100">
                  <label className="block text-xs font-bold text-red-800 mb-2 flex items-center">
                    <Camera size={12} className="mr-1"/> Suspect Mugshot (Optional)
                  </label>
                  <div className="flex items-center space-x-4">
                    {newSuspect.photo_url ? (
                      <img src={newSuspect.photo_url} alt="Mugshot" className="w-12 h-12 rounded object-cover border-2 border-red-300 shadow-sm" />
                    ) : (
                      <div className="w-12 h-12 rounded bg-red-100 flex items-center justify-center text-red-300 border-2 border-dashed border-red-300">
                        <Camera size={16}/>
                      </div>
                    )}
                    <input 
                      type="file" accept="image/*" onChange={handleSuspectPhotoUpload} 
                      className="text-xs file:mr-4 file:py-1.5 file:px-4 file:rounded file:border-0 file:text-xs file:font-bold file:bg-red-600 file:text-white hover:file:bg-red-700 w-full cursor-pointer" 
                    />
                  </div>
                </div>
                <div className="flex justify-end mt-4">
                  <button type="button" onClick={handleAddSuspect} className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded text-sm transition-colors flex items-center">
                    <PlusCircle size={16} className="mr-1"/> Add to Register
                  </button>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-bold text-slate-700 mb-3 border-b pb-2">Currently Logged Suspects ({formData.suspectDetails.length})</h4>
                {formData.suspectDetails.length === 0 ? (
                  <div className="text-center p-6 bg-white border border-dashed border-gray-300 rounded-lg text-gray-400 text-sm font-medium">
                    No suspects added to this report yet.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {formData.suspectDetails.map((suspect, index) => (
                      <div key={suspect.id} className="bg-white border border-red-100 rounded-lg p-3 flex justify-between items-center shadow-sm">
                        <div>
                          <div className="font-bold text-slate-800 text-sm uppercase">{index + 1}. {suspect.name}</div>
                          <div className="text-xs text-slate-500 font-medium mt-1">
                            {suspect.sex} • {suspect.age ? `${suspect.age}yrs` : 'Age Unknown'} • {suspect.tribe || 'Tribe Unknown'} <br/>
                            Res: {suspect.residence || 'N/A'} | Tel: {suspect.contact || 'N/A'}
                          </div>
                        </div>
                        <button type="button" onClick={() => handleRemoveSuspect(suspect.id)} className="text-red-400 hover:text-red-600 hover:bg-red-50 p-2 rounded transition">
                          <X size={18}/>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            
            <div className="bg-white p-4 border-t border-gray-200 flex justify-end shrink-0">
              <button type="button" onClick={() => setShowLockup(false)} className="bg-slate-900 hover:bg-slate-800 text-white font-bold py-2 px-6 rounded transition">
                Confirm & Return to Report
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="text-center mb-8 flex flex-col items-center">
        <img src="/upf_badge.png" alt="UPF Logo" className="w-16 h-16 mb-3 object-contain contrast-200 brightness-75 drop-shadow-sm" onError={(e) => { e.target.style.display = 'none'; }} />
        <h1 className="text-4xl text-red-500 mt-1 font-bold">Crime/Incident Registry</h1>
        <h2 className="text-xl text-red-300 mt-1 font-medium">Centralised Crime/Incident Compilation</h2>
      </div>

      <div className="bg-white/80 backdrop-blur p-4 rounded-xl border border-slate-200 shadow-sm relative">
        <div className="absolute top-4 right-4 z-10">
          <select value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className="border-2 border-blue-500 text-blue-700 font-bold rounded-lg px-3 py-1 text-xs shadow-sm bg-white outline-none">
            <option value="ALL TIME">ALL TIME</option>
            <option value="TODAY">TODAY ONLY</option>
            <option value="LAST 7 DAYS">LAST 7 DAYS</option>
            <option value="LAST 30 DAYS">LAST 30 DAYS</option>
            <option value="LAST 90 DAYS">LAST 90 DAYS</option>
            <option value="LAST 120 DAYS">LAST 120 DAYS</option>
          </select>
        </div>
        <h4 className="text-sm font-bold text-slate-400 mb-3 uppercase tracking-wider">📋 Area Metrics ({filterRegion} - {dateFilter})</h4>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <MetricCard title="Total Cases" value={metrics.newCases} colorClass="text-blue-700" />
          <MetricCard title="Suspects (Custody)" value={metrics.totalSuspects} colorClass="text-red-600" />
          <MetricCard title="Active" value={metrics.active} colorClass="text-yellow-600" />
          <MetricCard title="Sanctioned" value={metrics.sanctioned} colorClass="text-purple-600" />
          <MetricCard title="Closed" value={metrics.closed} colorClass="text-green-600" />
          <MetricCard title="ADR Cases" value={metrics.adr} colorClass="text-orange-600" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="bg-slate-900 px-4 py-3 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-white font-semibold flex items-center"><Shield className="w-5 h-5 mr-2 text-blue-400" /> ⚙️ File Controls</h3>
            </div>
            
            <div className="p-5 space-y-6">
              <div className="flex space-x-2 bg-gray-100 p-1 rounded-lg">
                <button type="button" onClick={() => handleOperationToggle('new')} className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${operation === 'new' ? 'bg-white shadow text-blue-700' : 'text-gray-600 hover:text-gray-900'}`}>
                  <PlusCircle className="w-4 h-4 inline mr-1" /> Register New
                </button>
                <button type="button" onClick={() => handleOperationToggle('update')} className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${operation === 'update' ? 'bg-white shadow text-blue-700' : 'text-gray-600 hover:text-gray-900'}`}>
                  <Edit className="w-4 h-4 inline mr-1" /> Update Existing
                </button>
              </div>

              {notification && (
                <div className={`border px-4 py-3 rounded-lg flex items-center mb-4 ${notification.includes('Error') ? 'bg-red-50 border-red-200 text-red-800' : 'bg-green-50 border-green-200 text-green-800'}`}>
                  {notification.includes('Error') ? <AlertTriangle className="w-5 h-5 mr-2 text-red-500 min-w-[20px]" /> : <CheckCircle className="w-5 h-5 mr-2 text-green-500 min-w-[20px]" />}
                  <span className="text-sm font-medium">{notification}</span>
                </div>
              )}

              {operation === 'update' && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <label className="block text-xs font-bold text-blue-800 mb-2">🔍 Search & Select Case to Update</label>
                  <input type="text" placeholder="Search by Reference, SN, or Narrative..." value={updateSearch} onChange={e => setUpdateSearch(e.target.value)} className="w-full text-sm p-2 mb-2 border border-blue-200 rounded outline-none focus:ring-2 focus:ring-blue-400" />
                  <div className="max-h-40 overflow-y-auto bg-white border border-blue-100 rounded custom-scrollbar">
                    {availableUpdateCases.length === 0 ? (
                      <div className="p-3 text-xs text-gray-500 text-center">No cases found matching your search.</div>
                    ) : (
                      availableUpdateCases.map(c => (
                        <div key={c.sn} onClick={() => populateUpdateCrimeForm(c)} className={`p-2 text-xs border-b cursor-pointer transition-colors ${formData.sn === c.sn ? 'bg-blue-600 text-white font-bold' : 'hover:bg-blue-50 text-gray-700'}`}>
                          <span className={formData.sn === c.sn ? 'text-blue-200' : 'text-gray-400'}>SN: {c.sn}</span> | <span className={formData.sn === c.sn ? 'text-white' : 'font-bold text-blue-700'}>{c.sdRef || c.sd_ref}</span> | {c.station}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              <form onSubmit={handleFormSubmit} className="space-y-4">
                {operation === 'update' && formData.sn && (
                   <div className="bg-slate-800 text-white text-xs font-bold px-3 py-2 rounded">
                      Currently Editing: SN {formData.sn}
                   </div>
                )}
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-gray-700 mb-1">File Reference Prefix & Number *</label>
                    {operation === 'update' ? (
                      <input type="text" name="sd_ref" value={formData.sd_ref} disabled required className="w-full text-sm border-gray-300 rounded-md shadow-sm border p-2 font-bold text-blue-700 bg-gray-100 disabled:text-gray-500" />
                    ) : (
                      <div className="flex shadow-sm rounded-md w-full">
                        <select name="ref_type" value={formData.ref_type || 'SD Ref:'} onChange={handleInputChange} className="bg-gray-100 border border-gray-300 text-gray-800 text-sm rounded-l-md px-3 py-2 font-bold focus:ring-blue-500 outline-none cursor-pointer">
                          <option value="SD Ref:">SD Ref:</option><option value="CRB:">CRB:</option><option value="DEF:">DEF:</option>
                          <option value="GEF:">GEF:</option><option value="TAR:">TAR:</option><option value="CID:">CID:</option>
                        </select>
                        <input type="text" name="ref_number" value={formData.ref_number || ''} onChange={handleInputChange} required className="flex-1 text-sm border-gray-300 border-y border-r rounded-r-md p-2 focus:ring-blue-500 font-bold text-blue-700 uppercase outline-none" placeholder="e.g. 04/27/06/2026" />
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Select Region *</label>
                    <select name="region" value={formData.region} onChange={handleInputChange} disabled={!(currentUser.role === 'SUPER_ADMIN' || currentUser.permissions?.view_global_roster) || operation === 'update'} required className="w-full text-sm border-gray-300 rounded-md shadow-sm bg-gray-50 border p-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500">
                      {['ADMIN', 'SUPER_ADMIN'].includes(currentUser.role) ? Object.keys(REGIONAL_HIERARCHY).map(reg => <option key={reg} value={reg}>{reg}</option>) : <option value={currentUser.region}>{currentUser.region}</option>}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Station *</label>
                    <select name="station" value={formData.station} onChange={handleInputChange} disabled={!(['SUPER_ADMIN', 'RPC', 'Deputy Commander'].includes(currentUser.role) || currentUser.permissions?.view_global_roster) || operation === 'update'} required className="w-full text-sm border-gray-300 rounded-md shadow-sm bg-gray-50 border p-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500">
                      {operation === 'update' ? <option value={formData.station}>{formData.station}</option> : ['ADMIN', 'SUPER_ADMIN', 'RPC', 'Deputy Commander'].includes(currentUser.role) ? (REGIONAL_HIERARCHY[formData.region] || []).map(stat => <option key={stat} value={stat}>{stat}</option>) : <option value={currentUser.station}>{currentUser.station}</option>}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Date Recorded</label>
                    <input type="date" name="date" value={formData.date} onChange={handleInputChange} disabled={operation === 'update'} required className="w-full text-sm border-gray-300 rounded-md shadow-sm border p-2 disabled:bg-gray-100 disabled:text-gray-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Time of Record</label>
                    <input type="text" name="time" value={formData.time} onChange={handleInputChange} disabled={operation === 'update'} placeholder="0830Hrs" className="w-full text-sm border-gray-300 rounded-md shadow-sm border p-2 disabled:bg-gray-100 disabled:text-gray-500" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Offence / Incident Type *</label>
                  <select name="offence" value={formData.offence} onChange={handleInputChange} required disabled={operation === 'update'} className="w-full text-sm border-gray-300 rounded-md shadow-sm bg-white border p-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500">
                    <option value="" disabled>-- Select Official Offence Category --</option>
                    <option value="Murder">Murder</option><option value="Aggravated Robbery">Aggravated Robbery</option><option value="Theft">Theft</option><option value="Assault">Assault</option><option value="Burglary">Burglary</option><option value="Defilement / Rape">Defilement / Rape</option><option value="Traffic Accident (Fatal)">Traffic Accident (Fatal)</option><option value="Traffic Accident (Minor)">Traffic Accident (Minor)</option><option value="Fraud / Forgery">Fraud / Forgery</option><option value="Drug Offenses">Drug Offenses</option><option value="Other">Other (Specify Below)</option>
                  </select>
                  {formData.offence === 'Other' && operation === 'new' && (
                    <input type="text" name="customOffence" required value={formData.customOffence} onChange={handleInputChange} placeholder="Type the specific offence here..." className="mt-2 w-full text-sm border-blue-400 rounded-md shadow-sm border p-2 focus:ring-blue-500 bg-blue-50" />
                  )}
                </div>

                <div className="pb-8"> 
                  <label className="block text-xs font-bold text-gray-700 mb-1">{operation === 'update' ? 'Original Incident Narrative (Read-Only)' : 'Incident Narrative'}</label>
                  <ReactQuill theme="snow" value={formData.narrative} onChange={(content) => setFormData({ ...formData, narrative: autoCapitalize(content) })} readOnly={operation === 'update'} className={`bg-white rounded-md ${operation === 'update' ? 'opacity-70 grayscale pointer-events-none' : ''}`} modules={{ toolbar: [['bold', 'italic', 'underline'], [{ 'list': 'ordered'}, { 'list': 'bullet' }], ['clean']] }} />
                </div>

                {operation === 'update' && (
                  <div className="pb-8 mt-4"> 
                    <label className="block text-xs font-bold text-blue-700 mb-1">Append New Update / Action Taken *</label>
                    <ReactQuill theme="snow" value={formData.updateText || ''} onChange={(content) => setFormData({ ...formData, updateText: autoCapitalize(content) })} className="bg-white rounded-md border-blue-300" placeholder="Enter new developments here. Use the toolbar for numbering..." modules={{ toolbar: [['bold', 'italic', 'underline'], [{ 'list': 'ordered'}, { 'list': 'bullet' }], ['clean']] }} />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Status</label>
                    <select name="status" value={formData.status} onChange={handleInputChange} className="w-full text-sm border-gray-300 rounded-md shadow-sm bg-gray-50 border p-2">
                      <option>ACTIVE INVESTIGATION</option><option>FORWARDED TO COURT</option><option>CLOSED / CONVICTED</option><option>ADR</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-xs font-bold text-red-600 mb-1 flex items-center"><Lock size={12} className="mr-1"/> Suspects in Custody</label>
                    <div className="flex space-x-2">
                      <div className="w-12 bg-red-100 border border-red-200 text-red-800 font-extrabold rounded-md flex items-center justify-center text-sm shadow-inner">
                        {operation === 'update' ? formData.suspects : formData.suspectDetails.length}
                      </div>
                      <button type="button" onClick={() => setShowLockup(true)} className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-2 rounded shadow text-xs transition flex items-center justify-center">
                        <Users size={14} className="mr-2"/> Manage Lockup
                      </button>
                    </div>
                  </div>
                </div>

                <button type="submit" className="w-full bg-blue-700 hover:bg-blue-800 text-white font-bold py-3 px-4 rounded-lg shadow transition-colors flex justify-center items-center">
                  {operation === 'new' ? '🚨 Submit New Case / Report' : '💾 Save Case Updates'}
                </button>
              </form>
            </div>
          </div>
        </div>

        {selectedRecord && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto shadow-2xl">
              <h3 className="text-xl font-bold text-slate-800 mb-4">{selectedRecord.title || "Record Details"}</h3>
              <div className="space-y-3 text-sm text-slate-600 mb-6">
                <p><strong>Date/Time:</strong> {selectedRecord.date} - {selectedRecord.time}</p>
                <p><strong>Narrative:</strong></p>
                <div className="p-3 bg-slate-50 rounded border border-slate-200 whitespace-pre-wrap">
                  {selectedRecord.narrative || selectedRecord.details}
                </div>
                {selectedRecord.image_url && (
                  <div className="mt-4">
                    <p className="font-semibold mb-2">Attached Exhibit / Evidence:</p>
                    <img src={selectedRecord.image_url} alt="Evidence Exhibit" className="rounded-lg max-h-80 w-object-contain border" />
                  </div>
                )}
              </div>
              <button 
                onClick={() => setSelectedRecord(null)}
                className="w-full py-2 bg-slate-800 text-white rounded-lg font-medium hover:bg-slate-900"
              >
                Close View
              </button>
             </div>
          </div>
        )}  

        <div className="lg:col-span-7 space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input type="text" placeholder="Search Reference, narrative or station..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-9 pr-4 py-2 border rounded-lg text-sm shadow-sm outline-none focus:border-blue-500" />
            </div>
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

          <ExpandableTableCard title="Crime/Incident Registry Ledger" onToggle={(expanded) => { if (setSidebarOpen) setSidebarOpen(!expanded); }}>
            <div className="overflow-x-auto w-full">
              <table className="min-w-full divide-y divide-gray-200 table-fixed w-full">
                <thead className="bg-gray-50 sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider w-16">SN</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider w-32">REFERENCE</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider w-32">Date & Time</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider w-25">Region/Post</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider w-1/2 max-w-[800px]">Incident Narrative</th>
                    <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider w-24">Suspects</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider w-32">Status</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredReports.map((report) => (
                    <tr key={report.id || report.sn} className="even:bg-slate-50 hover:bg-blue-50 transition-colors cursor-pointer" onClick={() => { if(operation === 'update') populateUpdateCrimeForm(report); }}>
                      <td className="px-4 py-4 whitespace-nowrap text-sm font-bold text-gray-900 align-top">{report.id || report.sn}</td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm font-bold text-blue-700 align-top">{report.sdRef || report.sd_ref}</td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 align-top">{report.date}<br/><span className="text-xs text-gray-400">{report.time}</span></td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-700 align-top">{report.station} <br/><span className="text-xs text-gray-400">{report.region}</span></td>
                      <td className="px-4 py-4 text-sm text-gray-700 align-top w-1/3 max-w-[600px] whitespace-pre-wrap break-words overflow-hidden leading-relaxed">
                        {report.offence && <div className="font-bold text-red-600 uppercase mb-1">{report.offence}</div>}
                        <div className="ql-editor p-0" dangerouslySetInnerHTML={{ __html: report.narrative }} />
                        {report.suspectDetails && report.suspectDetails.length > 0 && (
                          <div className="mt-3 bg-red-50 border border-red-100 rounded-lg p-3 shadow-sm">
                            <span className="text-xs font-bold text-red-800 uppercase tracking-wider block mb-2 border-b border-red-200 pb-1">Suspects in Custody ({report.suspectDetails.length}):</span>
                            <ul className="space-y-2.5">
                              {report.suspectDetails.map((s, i) => (
                                <li key={i} className="text-xs text-red-900 font-medium flex items-start space-x-3 bg-white p-2 rounded border border-red-100 shadow-xs">
                                  <div className="shrink-0">
                                    {s.photo_url ? <img src={s.photo_url} alt={s.name} className="w-12 h-12 rounded object-cover border border-red-200 shadow-xs" onError={(e) => { e.target.style.display = 'none'; }} /> : <div className="w-12 h-12 rounded bg-red-100 text-red-400 flex items-center justify-center font-bold text-[9px] border border-red-200 text-center p-0.5">No Photo</div>}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="font-bold text-slate-900 uppercase">{i + 1}. {s.name}</div>
                                    <div className="text-red-700 mt-0.5 space-y-0.5">
                                      <div><span className="font-semibold">Particulars:</span> ({s.sex}{s.age ? `, ${s.age}yrs` : ''}{s.tribe ? `, ${s.tribe}` : ''})</div>
                                      {s.residence && <div><span className="font-semibold">Residence:</span> {s.residence}</div>}
                                      {s.contact && <div><span className="font-semibold">Contact:</span> {s.contact}</div>}
                                      {s.mental_health_status && s.mental_health_status !== 'NORMAL' && <div className="text-amber-800 font-bold bg-amber-50 px-1.5 py-0.5 rounded text-xs inline-block mt-0.5 border border-amber-200">Mental Status: {s.mental_health_status}</div>}
                                    </div>
                                  </div>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm font-extrabold text-red-600 text-center align-top">{report.suspects || 0}</td>
                      <td className="px-4 py-4 whitespace-nowrap align-top">
                        <span className={`px-2 inline-flex text-xs leading-5 font-bold rounded-full ${report.status.includes('ACTIVE') ? 'bg-yellow-100 text-yellow-800' : ''} ${report.status.includes('COURT') ? 'bg-purple-100 text-purple-800' : ''} ${report.status.includes('CLOSED') ? 'bg-green-100 text-green-800' : ''} ${report.status.includes('ADR') ? 'bg-orange-100 text-orange-800' : ''}`}>
                          {report.status}
                        </span>
                        {report.narrative.includes('[UPDATE') && <div className="text-[9px] text-gray-400 mt-1 italic break-words max-w-[120px]">{report.narrative.split('[UPDATE').pop().split(']')[0].replace('by ', 'Update: ')}</div>}
                      </td>
                    </tr>
                  ))}
                  {filteredReports.length === 0 && <tr><td colSpan="7" className="text-center py-6 text-gray-500">No records found for this jurisdiction.</td></tr>}
                </tbody>
              </table>
            </div>
          </ExpandableTableCard>
        </div>
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
        return s.sn.toString().includes(query) || s.station.toLowerCase().includes(query) || s.date.includes(query);
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
        const response = await fetch(`${API_URL}/api/v1/stats`, {
          method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }, body: JSON.stringify(newStat)
        });
        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.detail || "Neon Database rejected the entry.");
        }
        setStats([newStat, ...stats]); setNotification(`Statistics recorded for ${formData.station}!`);
        setFormData({ ...formData, arrested: 0, given_bond: 0, cautioned: 0, pending_court: 0, taken_to_court: 0, released: 0, remanded: 0, convicted: 0, sn: null });
      } catch (err) { setNotification(`❌ Error: ${err.message}`); }
      
    } else if (operation === 'update') {
      if (!formData.sn) return setNotification("Error: Please select a record from the list to update first.");
      const updatedRecord = { ...formData, last_updated_by: `${currentUser.name} (${currentUser.fnum})` };

      try {
        const response = await fetch(`${API_URL}/api/v1/stats/${formData.sn}`, {
          method: "PUT", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }, body: JSON.stringify(updatedRecord)
        });
        if (!response.ok) throw new Error("Failed to update record in database.");
        const updatedStats = stats.map(s => s.sn === formData.sn ? updatedRecord : s);
        setStats(updatedStats); setNotification(`Statistics SN ${formData.sn} successfully updated!`);
        handleOperationToggle('new');
      } catch (err) { setNotification("❌ Error: Could not update the record in the database."); }
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
                        <div key={s.sn} onClick={() => populateUpdateForm(s)} className={`p-2 text-xs border-b cursor-pointer transition-colors ${formData.sn === s.sn ? 'bg-blue-600 text-white font-bold' : 'hover:bg-blue-50 text-gray-700'}`}>
                          <span className={formData.sn === s.sn ? 'text-blue-200' : 'text-gray-400'}>SN: {s.sn}</span> | <span className={formData.sn === s.sn ? 'text-white' : 'font-bold text-blue-700'}>{s.date}</span> | {s.station}
                        </div>
                      ))}
                  </div>
                </div>
              )}
              <form onSubmit={handleFormSubmit} className="space-y-5">
                {operation === 'update' && formData.sn && <div className="bg-slate-800 text-white text-xs font-bold px-3 py-2 rounded">Currently Editing Record SN: {formData.sn}</div>}
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
      </div>
    </div>
  );
};

const SuccessStories = ({ currentUser, stories, setStories, setSidebarOpen }) => {
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
              <table className="min-w-full divide-y divide-gray-200 table-fixed w-full">
                <thead className="bg-gray-50 sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider w-16">SN</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider w-32">Date & Time</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-800 uppercase tracking-wider w-40">Region/Station</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider min-w-[300px]">Narrative / Progress</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider w-32">Last Updated By</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider w-32">Status</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredStories?.map((story) => (
                    <tr key={story.sn} className="hover:bg-yellow-50 transition-colors cursor-pointer" onClick={() => { if(operation === 'update') populateUpdateForm(story); }}>
                      <td className="px-4 py-4 whitespace-nowrap text-sm font-bold text-gray-900 align-top">{story.sn}</td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 align-top">{story.date}<br/><span className="text-xs text-gray-400">{story.time}</span></td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-blue-700 align-top">{story.station}<br/><span className="text-xs text-gray-400">{story.region}</span></td>
                      <td className="px-4 py-4 text-sm text-gray-600 align-top w-1/3 max-w-[600px] whitespace-pre-wrap break-words overflow-hidden leading-relaxed">
                        <div className="ql-editor p-0" dangerouslySetInnerHTML={{ __html: story.narrative }} />
                        {story.photo_url && (
                          <div className="mt-3 border rounded-lg overflow-hidden max-w-xs bg-slate-100">
                            <img src={story.photo_url} alt={`Exploit SN ${story.sn}`} className="w-full h-auto object-cover max-h-40" onError={(e) => { e.target.style.display = 'none'; }} />
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-xs text-slate-500 font-medium align-top">{story.last_updated_by || "System Genesis"}</td>
                      <td className="px-4 py-4 whitespace-nowrap align-top">
                        <span className={`px-2 inline-flex text-xs leading-5 font-bold rounded-full ${story.status.includes('COMPLETED') ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>{story.status}</span>
                      </td>
                    </tr>
                  ))}
                  {filteredStories.length === 0 && <tr><td colSpan="6" className="text-center py-6 text-gray-500">No success stories logged for this jurisdiction.</td></tr>}
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
        const response = await fetch(`${API_URL}/api/v1/establishments/${formData.id}`, {
          method: "PUT", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }, body: JSON.stringify(updatedRecord)
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
      </div>
    </div>
  );
};



const Nominal_Roll = ({ currentUser, Nominal_Rolls, setNominal_Rolls, Nominal_Roll_archives, setNominal_Roll_archives, setSidebarOpen }) => {
  const [operation, setOperation] = useState('new');
  const [notification, setNotification] = useState(null);

  const [filterRegion, setFilterRegion] = useState(currentUser?.role === 'SUPER_ADMIN' ? 'ALL REGIONS' : currentUser?.region || '');
  const [filterStation, setFilterStation] = useState((['SUPER_ADMIN', 'RPC', 'Deputy Commander'].includes(currentUser?.role) || currentUser?.permissions?.view_global_roster) ? 'ALL STATIONS' : currentUser?.station || '');  
  const [updateSearch, setUpdateSearch] = useState('');

  const [viewMode, setViewMode] = useState('active'); 
  const [metricCategory, setMetricCategory] = useState('RANK'); 
  const [archiveReason, setArchiveReason] = useState('TRANSFERRED');

  const [formData, setFormData] = useState({
    sn: null, fnum: '', rank: '', name: '', sex: 'MALE', position: '',
    dob: '', doe: '', dopost: '', dopro: '', contact: '', educlevel: '',
    ipps: '', tin: '', nin: '', homedist: '', tribe: '', accno: '', bankbranch: '',
    station: currentUser.station || REGIONAL_HIERARCHY[currentUser?.region]?.[0] || '', 
    district: '', region: currentUser.region, section: '', dir: '', status: 'ACTIVE'
  });

  const filteredRolls = useMemo(() => {
    return (Array.isArray(Nominal_Rolls) ? Nominal_Rolls : []).filter(n => {
      const dbRegion = (n.region || '').trim().toUpperCase();
      const dbStation = (n.station || '').trim().toUpperCase();
      const selRegion = (filterRegion || '').trim().toUpperCase();
      const selStation = (filterStation || '').trim().toUpperCase();

      if (selRegion !== 'ALL REGIONS' && selRegion !== '' && dbRegion !== selRegion) return false;
      if (selStation !== 'ALL STATIONS' && selStation !== '' && dbStation !== selStation) return false;
      return true;
    });
  }, [Nominal_Rolls, filterRegion, filterStation]);

  const filteredNominal_Roll_archives = useMemo(() => {
    if (!Array.isArray(Nominal_Roll_archives)) return [];
    const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN';

    return Nominal_Roll_archives.filter(n => {
      if (isSuperAdmin) return true;
      const dbRegion = (n.region || '').trim().toUpperCase();
      const dbStation = (n.station || '').trim().toUpperCase();
      const selRegion = (filterRegion !== 'ALL REGIONS' ? filterRegion : currentUser.region || '').trim().toUpperCase();
      const selStation = (filterStation !== 'ALL STATIONS' ? filterStation : currentUser.station || '').trim().toUpperCase();

      if (dbRegion !== selRegion) return false;
      if (dbStation !== selStation) return false;
      return true;
    });
  }, [Nominal_Roll_archives, filterRegion, filterStation, currentUser]);

  const availableUpdateRolls = useMemo(() => {
    return (Array.isArray(Nominal_Rolls) ? Nominal_Rolls : []).filter(n => {
      if (!['ADMIN', 'SUPER_ADMIN'].includes(currentUser.role) && n.region !== currentUser.region) return false;
      if (updateSearch) {
        const query = updateSearch.toLowerCase();
        return (n.fnum && n.fnum.toLowerCase().includes(query)) || (n.name && n.name.toLowerCase().includes(query)) || (n.ipps && n.ipps.includes(query));
      }
      return true;
    });
  }, [Nominal_Rolls, currentUser, updateSearch]);

  const metricsData = useMemo(() => {
    const total = filteredRolls.length;
    const male = filteredRolls.filter(n => n.sex === 'MALE').length;
    const female = filteredRolls.filter(n => n.sex === 'FEMALE').length;
    const stations = {};
    filteredRolls.forEach(n => {
       const s = n.station || 'UNSPECIFIED';
       stations[s] = (stations[s] || 0) + 1;
    });
    return { total, male, female, stations };
  }, [filteredRolls]);

  const calculatedMetrics = useMemo(() => {
      if (viewMode !== 'metrics') return [];
      const grouped = {};
      filteredRolls.forEach(n => {
          let key = 'Unknown';
          if (metricCategory === 'RANK') key = n.rank || 'Unranked';
          else if (metricCategory === 'UNIT') key = `${n.station} ${n.section ? '- '+n.section : ''}`;
          else if (metricCategory === 'AGE') {
              if (n.dob) {
                  const age = new Date().getFullYear() - new Date(n.dob).getFullYear();
                  if (age < 30) key = '18-29 Years';
                  else if (age < 40) key = '30-39 Years';
                  else if (age < 50) key = '40-49 Years';
                  else key = '50+ Years';
              } else key = 'Age Not Recorded';
          }
          else if (metricCategory === 'SEX') key = n.sex || 'Unknown';
          
          if (!grouped[key]) grouped[key] = { category: key, total: 0, male: 0, female: 0 };
          grouped[key].total += 1;
          if (n.sex === 'MALE') grouped[key].male += 1;
          else if (n.sex === 'FEMALE') grouped[key].female += 1;
      });
      return Object.values(grouped).sort((a,b) => b.total - a.total);
  }, [filteredRolls, metricCategory, viewMode]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    if (name === 'region') setFormData({ ...formData, region: value, station: REGIONAL_HIERARCHY[value][0] || '' });
    else setFormData({ ...formData, [name]: value });
  };

  const handleOperationToggle = (op) => {
    setOperation(op); setNotification(null);
    if (op === 'new') {
      setFormData({
        sn: null, fnum: '', rank: '', name: '', sex: 'MALE', position: '', dob: '', doe: '', dopost: '', dopro: '', contact: '', educlevel: '',
        ipps: '', tin: '', nin: '', homedist: '', tribe: '', accno: '', bankbranch: '', station: currentUser.station || REGIONAL_HIERARCHY[currentUser?.region]?.[0] || '', 
        district: '', region: currentUser.region, section: '', dir: '', status: 'ACTIVE'
      });
      setUpdateSearch('');
    }
  };

  const populateUpdateForm = (data) => setFormData({ ...data, fnum: data.fnum || data.f_num });

  const handleArchivePersonnel = async () => {
    if (!formData.fnum) return alert("Missing Force Number. Cannot archive this record.");
    if (!window.confirm(`Are you sure you want to move ${formData.name} to archives?`)) return;

    try {
      setNotification("Moving record to archive...");
      const token = localStorage.getItem('kmp_authToken');
      const response = await authFetch(`/api/v1/nominal-roll/${encodeURIComponent(formData.fnum)}/archive`, {
        method: "PUT", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }, body: JSON.stringify({ archive_reason: archiveReason })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || "Failed to archive");
      }

      const archivedRecord = {
          sn: formData.sn, fnum: formData.fnum, rank: formData.rank, name: formData.name, sex: formData.sex, position: formData.position,
          dob: formData.dob, doe: formData.doe, dopost: formData.dopost, dopro: formData.dopro, contact: formData.contact, educlevel: formData.educlevel, 
          ipps: formData.ipps, tin: formData.tin, nin: formData.nin, homedist: formData.homedist, tribe: formData.tribe, accno: formData.accno,         
          bankbranch: formData.bankbranch, station: formData.station, district: formData.district, region: formData.region, section: formData.section,
          dir: formData.dir, status: "ARCHIVED", last_updated_by: `${currentUser.name} (${currentUser.fnum})`, archive_reason: archiveReason,
          archive_date: new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0]
      };
      
      setNominal_Roll_archives([archivedRecord, ...(Array.isArray(Nominal_Roll_archives) ? Nominal_Roll_archives : [])]);
      setNominal_Rolls((Array.isArray(Nominal_Rolls) ? Nominal_Rolls : []).filter(n => (n.fnum || n.f_num) !== formData.fnum));
      setNotification(`Officer ${formData.name} archived successfully.`);
      handleOperationToggle('new');
    } catch (error) { setNotification("Error: Could not move to archive."); alert(`Error archiving record: ${error.message}`); }
  };

  const handleFormSubmit = async (e) => { 
    e.preventDefault();
    const currentRolls = Array.isArray(Nominal_Rolls) ? Nominal_Rolls : [];
    const token = localStorage.getItem('kmp_authToken');
    
    if (!token) return setNotification("Error: Security token missing. Please log out and log back in.");

    if (formData.nin) {
        const cleanNin = formData.nin.toUpperCase().trim();
        if (!/^C[MF][A-Z0-9]{12}$/.test(cleanNin)) return setNotification("⚠️ Error: National ID must start with CM or CF, be exactly 14 characters, and contain only letters and numbers.");
        formData.nin = cleanNin; 
    }

    if (operation === 'new') {
      const exactNextSN = currentRolls.length > 0 ? Math.max(...currentRolls.map(n => n.sn)) + 1 : 1;
      const newEntry = { ...formData, sn: exactNextSN, last_updated_by: `${currentUser.name} (${currentUser.fnum})` };
      
      try {
        const response = await fetch(`${API_URL}/api/v1/nominal-roll`, {
          method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }, body: JSON.stringify(newEntry)
        });
        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.detail || "Database rejected the entry.");
        }
        setNominal_Rolls([newEntry, ...currentRolls]); setNotification(`Officer ${formData.name} recorded successfully!`); handleOperationToggle('new');
      } catch (err) { setNotification(`Error: ${err.message}`); }
      
    } else if (operation === 'update') {
      const updatedRecord = { ...formData, last_updated_by: `${currentUser.name} (${currentUser.fnum})` };
      try {
          const response = await fetch(`${API_URL}/api/v1/nominal-roll/${formData.sn}`, {
            method: "PUT", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }, body: JSON.stringify(updatedRecord)
          });
          if (!response.ok) throw new Error("Failed to update record.");
          setNominal_Rolls(currentRolls.map(n => n.sn === formData.sn ? updatedRecord : n));
          setNotification(`Officer SN ${formData.sn} successfully updated!`);
      } catch (err) { setNotification("Error: Could not update the record."); }
    }
  };

  // 🟢 CLEANED UP CLEARANCE CHECK: Now safely placed before the return
  const canUploadHR = ['SUPER_ADMIN', 'ADMIN'].includes(currentUser?.role) || 
                      (currentUser?.position || '').toUpperCase().includes('HR') ||
                      currentUser?.permissions?.upload_hr || 
                      currentUser?.permissions?.export_data;

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6 relative z-10">
      <div className="text-center mb-8 flex flex-col items-center">
        <img src="/upf_badge.png" alt="UPF Logo" className="w-16 h-16 mb-3 object-contain contrast-200 brightness-75 drop-shadow-sm" onError={(e) => { e.target.style.display = 'none'; }} />
        <h1 className="text-3xl font-extrabold text-gray-700 tracking-tight">Master Nominal Roll</h1>
        <h3 className="text-lg text-indigo-500 mt-2 font-medium">Man-Power Auditing & Deployment Registry</h3>
      </div>
      
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
        <div className="flex flex-col md:flex-row justify-between items-center mb-4 border-b pb-2">
          <h3 className="font-bold text-slate-800 flex items-center"><BarChart3 className="w-5 h-5 mr-2 text-blue-600"/> Personnel Metrics Dashboard</h3>
          <div className="flex space-x-2 mt-2 md:mt-0">
             <button onClick={() => setViewMode('active')} className={`px-4 py-1.5 text-xs font-bold rounded shadow-sm transition-colors ${viewMode === 'active' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>Active Roll</button>
             <button onClick={() => setViewMode('archive')} className={`px-4 py-1.5 text-xs font-bold rounded shadow-sm transition-colors ${viewMode === 'archive' ? 'bg-red-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>Archived</button>
             <button onClick={() => setViewMode('metrics')} className={`px-4 py-1.5 text-xs font-bold rounded shadow-sm transition-colors ${viewMode === 'metrics' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>Analytics</button>
          </div>
        </div>

        {viewMode !== 'metrics' && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
             <MetricCard title="Total Personnel" value={metricsData.total} colorClass="text-blue-700" />
             <MetricCard title="Male Officers" value={metricsData.male} colorClass="text-indigo-600" />
             <MetricCard title="Female Officers" value={metricsData.female} colorClass="text-pink-600" />
             <MetricCard title="Stations" value={Object.keys(metricsData.stations).length} colorClass="text-emerald-600" />
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-5 space-y-5">

          {canUploadHR && (
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 space-y-3">
              <div>
                <h4 className="font-bold text-gray-800 text-sm flex items-center">
                  <Upload className="w-4 h-4 mr-2 text-blue-600" /> Batch Excel Import Existing Nominal Roll
                </h4>
                <p className="text-xs text-gray-500 mt-0.5">Upload your existing Nominal roll, Ensure your column headers are exactly as below for consistency:</p>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-[11px] font-mono text-slate-700 flex flex-wrap gap-1.5">
                <span className="bg-white px-2 py-0.5 rounded border border-slate-300 shadow-2xs font-bold">sn</span>
                <span className="bg-white px-2 py-0.5 rounded border border-slate-300 shadow-2xs font-bold">fnum</span>
                <span className="bg-white px-2 py-0.5 rounded border border-slate-300 shadow-2xs font-bold">rank</span>
                <span className="bg-white px-2 py-0.5 rounded border border-slate-300 shadow-2xs font-bold">name</span>
                <span className="bg-white px-2 py-0.5 rounded border border-slate-300 shadow-2xs font-bold">sex</span>
                <span className="bg-white px-2 py-0.5 rounded border border-slate-300 shadow-2xs font-bold">position</span>
                <span className="bg-white px-2 py-0.5 rounded border border-slate-300 shadow-2xs font-bold">dob</span>
                <span className="bg-white px-2 py-0.5 rounded border border-slate-300 shadow-2xs font-bold">doe</span>
                <span className="bg-white px-2 py-0.5 rounded border border-slate-300 shadow-2xs font-bold">dopost</span>
                <span className="bg-white px-2 py-0.5 rounded border border-slate-300 shadow-2xs font-bold">dopro</span>
                <span className="bg-white px-2 py-0.5 rounded border border-slate-300 shadow-2xs font-bold">contact</span>
                <span className="bg-white px-2 py-0.5 rounded border border-slate-300 shadow-2xs font-bold">educlevel</span>
                <span className="bg-white px-2 py-0.5 rounded border border-slate-300 shadow-2xs font-bold">ipps</span>
                <span className="bg-white px-2 py-0.5 rounded border border-slate-300 shadow-2xs font-bold">tin</span>
                <span className="bg-white px-2 py-0.5 rounded border border-slate-300 shadow-2xs font-bold">nin</span>
                <span className="bg-white px-2 py-0.5 rounded border border-slate-300 shadow-2xs font-bold">homedist</span>
                <span className="bg-white px-2 py-0.5 rounded border border-slate-300 shadow-2xs font-bold">tribe</span>
                <span className="bg-white px-2 py-0.5 rounded border border-slate-300 shadow-2xs font-bold">accno</span>
                <span className="bg-white px-2 py-0.5 rounded border border-slate-300 shadow-2xs font-bold">bankbranch</span>
                <span className="bg-white px-2 py-0.5 rounded border border-slate-300 shadow-2xs font-bold">station</span>
                <span className="bg-white px-2 py-0.5 rounded border border-slate-300 shadow-2xs font-bold">district</span>
                <span className="bg-white px-2 py-0.5 rounded border border-slate-300 shadow-2xs font-bold">region</span>
                <span className="bg-white px-2 py-0.5 rounded border border-slate-300 shadow-2xs font-bold">section</span>
                <span className="bg-white px-2 py-0.5 rounded border border-slate-300 shadow-2xs font-bold">dir</span>
                <span className="bg-white px-2 py-0.5 rounded border border-slate-300 shadow-2xs font-bold">status</span>
              </div>
              <BulkNominalRollUpload onUploadSuccess={() => window.location.reload()} />
            </div>
          )}

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="bg-slate-900 px-4 py-3 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-white font-semibold flex items-center"><Users className="w-5 h-5 mr-2 text-blue-400" /> ⚙️ Log Personnel</h3>
            </div>
            <div className="p-5 space-y-6">
              <div className="flex space-x-2 bg-gray-100 p-1 rounded-lg">
                <button type="button" onClick={() => handleOperationToggle('new')} className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${operation === 'new' ? 'bg-white shadow text-blue-700' : 'text-gray-600 hover:text-gray-900'}`}><PlusCircle className="w-4 h-4 inline mr-1" /> Register New</button>
                <button type="button" onClick={() => handleOperationToggle('update')} className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${operation === 'update' ? 'bg-white shadow text-blue-700' : 'text-gray-600 hover:text-gray-900'}`}><Edit className="w-4 h-4 inline mr-1" /> Update Existing</button>
              </div>

              {notification && <div className={`border px-4 py-3 rounded-lg flex items-center mb-4 ${notification.includes('Error') ? 'bg-red-50 border-red-200 text-red-800' : 'bg-green-50 border-green-200 text-green-800'}`}>{notification.includes('Error') ? <AlertTriangle className="w-5 h-5 mr-2 text-red-500 min-w-[20px]" /> : <CheckCircle className="w-5 h-5 mr-2 text-green-500 min-w-[20px]" />}<span className="text-sm font-medium">{notification}</span></div>}

              {operation === 'update' && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <label className="block text-xs font-bold text-blue-800 mb-2">🔍 Search & Select Officer to Update</label>
                  <input type="text" placeholder="Search by Force No, Name, IPPS..." value={updateSearch} onChange={e => setUpdateSearch(e.target.value)} className="w-full text-sm p-2 mb-2 border border-blue-200 rounded outline-none focus:ring-2 focus:ring-blue-400" />
                  <div className="max-h-40 overflow-y-auto bg-white border border-blue-100 rounded custom-scrollbar">
                    {availableUpdateRolls.length === 0 ? <div className="p-3 text-xs text-gray-500 text-center">No personnel found.</div> : availableUpdateRolls.map(n => (
                        <div key={n.sn} onClick={() => populateUpdateForm(n)} className={`p-2 text-xs border-b cursor-pointer transition-colors ${formData.sn === n.sn ? 'bg-blue-600 text-white font-bold' : 'hover:bg-blue-50 text-gray-700'}`}>
                          <span className={formData.sn === n.sn ? 'text-blue-200' : 'text-gray-400'}>F/NO: {n.fnum}</span> | <span className={formData.sn === n.sn ? 'text-white' : 'font-bold text-blue-700'}>{n.name}</span> | {n.station}
                        </div>
                      ))}
                  </div>
                </div>
              )}
              
              <form onSubmit={handleFormSubmit} className="space-y-6">
                
                {operation === 'update' && (formData.sn || formData.fnum) && (
                   <div className="bg-red-50 p-4 rounded-lg border border-red-200 space-y-3 mb-6 shadow-sm">
                      <h4 className="text-xs font-bold text-red-700 uppercase border-b border-red-200 pb-1 flex items-center"><AlertTriangle size={14} className="mr-2"/> Archive / Remove Personnel</h4>
                      <div className="flex space-x-2">
                         <select value={archiveReason} onChange={(e) => setArchiveReason(e.target.value)} className="flex-1 text-sm border-red-300 rounded shadow-sm border p-2 font-bold text-red-700 outline-none focus:ring-2 focus:ring-red-400">
                            <option value="TRANSFERRED">Transferred</option><option value="DEATH">Death</option><option value="DISMISSAL">Dismissal</option><option value="DESERTION">Desertion</option><option value="RETIREMENT">Retirement</option>
                         </select>
                         <button type="button" onClick={handleArchivePersonnel} className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded font-bold text-sm shadow transition border border-red-800">Move to Archive</button>
                      </div>
                   </div>
                )}

                {operation === 'update' && (formData.sn || formData.fnum) && <div className="bg-slate-800 text-white text-xs font-bold px-3 py-2 rounded">Currently Editing Record: {formData.fnum}</div>}
                
                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 space-y-4">
                  <h4 className="text-xs font-bold text-gray-500 uppercase border-b pb-1">1. Primary Identifiers</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="block text-xs font-bold text-gray-700 mb-1">F/NO. *</label><input type="text" name="fnum" value={formData.fnum} onChange={handleInputChange} required className="w-full text-sm border-gray-300 rounded shadow-sm border p-2 uppercase" /></div>
                    <div><label className="block text-xs font-bold text-gray-700 mb-1">IPPS NO. *</label><input type="text" name="ipps" value={formData.ipps} onChange={handleInputChange} required className="w-full text-sm border-gray-300 rounded shadow-sm border p-2" /></div>
                    <div className="col-span-2"><label className="block text-xs font-bold text-gray-700 mb-1">NAME *</label><input type="text" name="name" value={formData.name} onChange={handleInputChange} required className="w-full text-sm border-gray-300 rounded shadow-sm border p-2 uppercase" /></div>
                    <div><label className="block text-xs font-bold text-gray-700 mb-1">RANK *</label><input type="text" name="rank" value={formData.rank} onChange={handleInputChange} required className="w-full text-sm border-gray-300 rounded shadow-sm border p-2" /></div>
                    <div><label className="block text-xs font-bold text-gray-700 mb-1">SEX</label><select name="sex" value={formData.sex} onChange={handleInputChange} className="w-full text-sm border-gray-300 rounded shadow-sm border p-2 bg-white"><option>MALE</option><option>FEMALE</option></select></div>
                    <div><label className="block text-xs font-bold text-gray-700 mb-1">TIN NO.</label><input type="text" name="tin" value={formData.tin} onChange={handleInputChange} className="w-full text-sm border-gray-300 rounded shadow-sm border p-2" /></div>
                    <div><label className="block text-xs font-bold text-gray-700 mb-1">NIN</label><input type="text" name="nin" value={formData.nin} onChange={handleInputChange} className="w-full text-sm border-gray-300 rounded shadow-sm border p-2" /></div>
                  </div>
                </div>

                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 space-y-4">
                  <h4 className="text-xs font-bold text-gray-500 uppercase border-b pb-1">2. Service & Placement</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="block text-xs font-bold text-gray-700 mb-1">REGION *</label><select name="region" value={formData.region} onChange={handleInputChange} disabled={!['ADMIN', 'SUPER_ADMIN'].includes(currentUser.role)} required className="w-full text-sm border-gray-300 rounded shadow-sm border p-2 bg-white disabled:bg-gray-100 disabled:text-gray-500">{['ADMIN', 'SUPER_ADMIN'].includes(currentUser.role) ? Object.keys(REGIONAL_HIERARCHY).map(reg => <option key={reg} value={reg}>{reg}</option>) : <option value={currentUser.region}>{currentUser.region}</option>}</select></div>
                    <div><label className="block text-xs font-bold text-gray-700 mb-1">DUTY STATION *</label><select name="station" value={formData.station} onChange={handleInputChange} disabled={!['ADMIN', 'SUPER_ADMIN', 'RPC', 'Deputy Commander'].includes(currentUser.role)} required className="w-full text-sm border-gray-300 rounded shadow-sm border p-2 bg-white disabled:bg-gray-100 disabled:text-gray-500">{['ADMIN', 'SUPER_ADMIN', 'RPC', 'Deputy Commander'].includes(currentUser.role) ? (REGIONAL_HIERARCHY[formData.region] || []).map(stat => <option key={stat} value={stat}>{stat}</option>) : (<option value={currentUser.station}>{currentUser.station}</option>)}</select></div>
                    <div><label className="block text-xs font-bold text-gray-700 mb-1">POSITION *</label><input type="text" name="position" value={formData.position} onChange={handleInputChange} required className="w-full text-sm border-gray-300 rounded shadow-sm border p-2" /></div>
                    <div><label className="block text-xs font-bold text-gray-700 mb-1">DISTRICT</label><input type="text" name="district" value={formData.district} onChange={handleInputChange} className="w-full text-sm border-gray-300 rounded shadow-sm border p-2" /></div>
                    <div><label className="block text-xs font-bold text-gray-700 mb-1">SECTION</label><input type="text" name="section" value={formData.section} onChange={handleInputChange} className="w-full text-sm border-gray-300 rounded shadow-sm border p-2" /></div>
                    <div><label className="block text-xs font-bold text-gray-700 mb-1">DIR (Directorate)</label><input type="text" name="dir" value={formData.dir} onChange={handleInputChange} className="w-full text-sm border-gray-300 rounded shadow-sm border p-2" /></div>
                  </div>
                </div>

                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 space-y-4">
                  <h4 className="text-xs font-bold text-gray-500 uppercase border-b pb-1">3. Dates & Demographics</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="block text-xs font-bold text-gray-700 mb-1">D.O.B</label><input type="date" name="dob" value={formData.dob} onChange={handleInputChange} className="w-full text-sm border-gray-300 rounded shadow-sm border p-2" /></div>
                    <div><label className="block text-xs font-bold text-gray-700 mb-1">D.O.E</label><input type="date" name="doe" value={formData.doe} onChange={handleInputChange} className="w-full text-sm border-gray-300 rounded shadow-sm border p-2" /></div>
                    <div><label className="block text-xs font-bold text-gray-700 mb-1">D.O. POST</label><input type="date" name="dopost" value={formData.dopost} onChange={handleInputChange} className="w-full text-sm border-gray-300 rounded shadow-sm border p-2" /></div>
                    <div><label className="block text-xs font-bold text-gray-700 mb-1">D.O. PRO</label><input type="date" name="dopro" value={formData.dopro} onChange={handleInputChange} className="w-full text-sm border-gray-300 rounded shadow-sm border p-2" /></div>
                    <div className="col-span-2"><label className="block text-xs font-bold text-gray-700 mb-1">CONTACT</label><input type="text" name="contact" value={formData.contact} onChange={handleInputChange} className="w-full text-sm border-gray-300 rounded shadow-sm border p-2" /></div>
                    <div><label className="block text-xs font-bold text-gray-700 mb-1">EDUC LEVEL</label><input type="text" name="educlevel" value={formData.educlevel} onChange={handleInputChange} className="w-full text-sm border-gray-300 rounded shadow-sm border p-2" /></div>
                    <div><label className="block text-xs font-bold text-gray-700 mb-1">HOME DIST</label><input type="text" name="homedist" value={formData.homedist} onChange={handleInputChange} className="w-full text-sm border-gray-300 rounded shadow-sm border p-2" /></div>
                    <div><label className="block text-xs font-bold text-gray-700 mb-1">TRIBE</label><input type="text" name="tribe" value={formData.tribe} onChange={handleInputChange} className="w-full text-sm border-gray-300 rounded shadow-sm border p-2" /></div>
                  </div>
                </div>

                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 space-y-4">
                  <h4 className="text-xs font-bold text-gray-500 uppercase border-b pb-1">4. Financial & Status</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="block text-xs font-bold text-gray-700 mb-1">ACC. NO</label><input type="text" name="accno" value={formData.accno} onChange={handleInputChange} className="w-full text-sm border-gray-300 rounded shadow-sm border p-2" /></div>
                    <div><label className="block text-xs font-bold text-gray-700 mb-1">BANK & BRANCH</label><input type="text" name="bankbranch" value={formData.bankbranch} onChange={handleInputChange} className="w-full text-sm border-gray-300 rounded shadow-sm border p-2" /></div>
                    <div className="col-span-2"><label className="block text-xs font-bold text-gray-700 mb-1">STATUS</label><select name="status" value={formData.status} onChange={handleInputChange} className="w-full text-sm border-gray-300 rounded shadow-sm border p-2 bg-white font-bold"><option>ACTIVE</option><option>ON LEAVE</option><option>SUSPENDED</option></select></div>
                  </div>
                </div>

                <button type="submit" className="w-full bg-blue-700 hover:bg-blue-800 transition-colors text-white py-4 font-bold rounded-lg shadow text-lg flex justify-center items-center">
                  {operation === 'new' ? '💾 Log Personnel Record' : '💾 Save Updates'}
                </button>
              </form>
            </div>
          </div>
        </div>
        
        <div className="lg:col-span-7 space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <select value={filterRegion} onChange={(e) => { setFilterRegion(e.target.value); setFilterStation('ALL STATIONS'); }} disabled={!(['ADMIN', 'SUPER_ADMIN', 'RPC', 'Deputy Commander'].includes(currentUser?.role) || currentUser?.permissions?.view_global_roster)} className="border rounded-lg px-3 py-2 text-sm shadow-sm bg-white disabled:bg-gray-100 disabled:text-gray-500 w-full sm:w-auto outline-none focus:border-blue-500">
              {['ADMIN', 'SUPER_ADMIN', 'RPC', 'Deputy Commander'].includes(currentUser?.role) || currentUser?.permissions?.view_global_roster ? (
                <><option value="ALL REGIONS">ALL REGIONS</option>{Array.from(new Set([...Object.keys(REGIONAL_HIERARCHY), ...(Nominal_Rolls || []).map(n => n.region).filter(Boolean)])).sort().map(reg => <option key={reg} value={reg}>{reg}</option>)}</>
              ) : <option value={currentUser?.region}>{currentUser?.region}</option>}
            </select>
            <select value={filterStation} onChange={(e) => setFilterStation(e.target.value)} disabled={!(['ADMIN', 'SUPER_ADMIN', 'RPC', 'Deputy Commander'].includes(currentUser?.role) || currentUser?.permissions?.view_global_roster)} className="border rounded-lg px-3 py-2 text-sm shadow-sm bg-white disabled:bg-gray-100 disabled:text-gray-500 w-full sm:w-auto outline-none focus:border-blue-500">
              {['ADMIN', 'SUPER_ADMIN', 'RPC', 'Deputy Commander'].includes(currentUser?.role) || currentUser?.permissions?.view_global_roster ? (
                <><option value="ALL STATIONS">ALL STATIONS</option>{Array.from(new Set([...(REGIONAL_HIERARCHY[filterRegion] || []), ...(Nominal_Rolls || []).filter(n => n.region === filterRegion).map(n => n.station).filter(Boolean)])).sort().map(stat => <option key={stat} value={stat}>{stat}</option>)}</>
              ) : <option value={currentUser?.station}>{currentUser?.station}</option>}
            </select>
          </div>

          {viewMode === 'metrics' ? (
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm animate-in fade-in zoom-in-95 duration-200">
                <div className="flex justify-between items-center mb-6 border-b pb-4">
                    <h3 className="font-extrabold text-lg text-indigo-900 flex items-center"><PieChart className="mr-2"/> Nominal Roll Analytics</h3>
                    <div className="flex items-center space-x-2 bg-indigo-50 p-2 rounded-lg border border-indigo-100">
                       <label className="text-xs font-bold text-indigo-800 uppercase">Categorize By:</label>
                       <select value={metricCategory} onChange={e => setMetricCategory(e.target.value)} className="border border-indigo-300 rounded p-1 text-sm font-bold text-indigo-700 outline-none bg-white">
                          <option value="RANK">Rank Breakdown</option><option value="UNIT">Unit / Station Breakdown</option><option value="AGE">Age Demographics Breakdown</option><option value="SEX">Sex Distribution</option>
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
            <ExpandableTableCard title={viewMode === 'active' ? "Active Nominal Roll" : "Archived Personnel Ledger"} onToggle={(expanded) => { if (setSidebarOpen) setSidebarOpen(!expanded); }}>
              <div className="overflow-x-auto w-full">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50 sticky top-0 z-10">
                    <tr>
                      <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase whitespace-nowrap">S/No</th>
                      <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase whitespace-nowrap">F/NO.</th>
                      <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase whitespace-nowrap">RANK</th>
                      <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase whitespace-nowrap">NAME</th>
                      <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase whitespace-nowrap">SEX</th>
                      <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase whitespace-nowrap">POSITION</th>
                      <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase whitespace-nowrap">D.O.B</th>
                      <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase whitespace-nowrap">D.O.E</th>
                      <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase whitespace-nowrap">D.O. POST</th>
                      <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase whitespace-nowrap">CONTACT</th>
                      <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase whitespace-nowrap">IPPS NO.</th>
                      <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase whitespace-nowrap">DUTY STATION</th>
                      <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase whitespace-nowrap">STATUS</th>
                      {viewMode === 'archive' && (
                        <><th className="px-3 py-3 text-left text-xs font-bold text-red-600 uppercase whitespace-nowrap bg-red-50">REASON</th><th className="px-3 py-3 text-left text-xs font-bold text-red-600 uppercase whitespace-nowrap bg-red-50">DATE ARCHIVED</th></>
                      )}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {(viewMode === 'active' ? filteredRolls : filteredNominal_Roll_archives).map((n) => (
                      <tr key={n.sn} className={`${viewMode === 'archive' ? 'bg-slate-50 opacity-80' : 'hover:bg-blue-50'} transition-colors cursor-pointer`} onClick={() => { if(viewMode === 'active') { setOperation('update'); populateUpdateForm(n); window.scrollTo({ top: 0, behavior: 'smooth' }); }}}>
                        <td className="px-3 py-2 whitespace-nowrap text-xs font-bold text-gray-900">{n.sn}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-xs font-bold text-blue-800">{n.fnum || n.f_num}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-xs font-bold">{n.rank}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-xs font-medium">{n.name}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-xs">{n.sex}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-700">{n.position}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500">{n.dob}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500">{n.doe}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500">{n.dopost}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-xs">{n.contact}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-xs font-mono">{n.ipps}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-xs font-bold text-blue-700">{n.station}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-xs font-bold text-green-700">{n.status}</td>
                        {viewMode === 'archive' && (
                          <><td className="px-3 py-2 whitespace-nowrap text-xs font-bold text-red-700 bg-red-50/50">{n.archive_reason}</td><td className="px-3 py-2 whitespace-nowrap text-xs text-red-500 bg-red-50/50">{n.archive_date}</td></>
                        )}
                      </tr>
                    ))}
                    {(viewMode === 'active' ? filteredRolls : filteredNominal_Roll_archives).length === 0 && (
                      <tr><td colSpan={viewMode === 'archive' ? "15" : "13"} className="text-center py-6 text-gray-500 font-medium">No personnel records found in this view.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </ExpandableTableCard>
          )}
        </div>
      </div>
    </div>
  );
};



// ====================================================================
// --- ADMIN COMPONENTS: APPROVALS, LOGS & HR REQUESTS ---
// ====================================================================
const AdminApprovals = ({ currentUser }) => {
  const [activeTab, setActiveTab] = useState('approvals');
  
  const [modRequests, setModRequests] = useState([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  
  const [audit_logs, setaudit_logs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  
  const [realPendingUsers, setRealPendingUsers] = useState([]);
  const [loadingPending, setLoadingPending] = useState(false);

  const [resetRequests, setResetRequests] = useState([]);
  const [loadingResets, setLoadingResets] = useState(false);

  const isRPC = currentUser && ['RPC', 'Deputy Commander'].includes(currentUser.role);
  const isSystemAdmin = currentUser && ['ADMIN', 'SUPER_ADMIN'].includes(currentUser.role);

  useEffect(() => {
    setLoadingRequests(true);
    authFetch("/api/v1/requests")
      .then(res => res.json())
      .then(data => { setModRequests(Array.isArray(data) ? data : []); setLoadingRequests(false); })
      .catch(err => { console.error(err); setLoadingRequests(false); });

    const fetchPendingUsers = async () => {
      setLoadingPending(true);
      try {
        let res = await authFetch("/api/v1/admin/pending-users");
        if (!res.ok) res = await authFetch("/api/v1/users/pending");
        if (!res.ok) res = await authFetch("/api/v1/auth/pending");
        if (!res.ok) res = await authFetch("/api/v1/pending-users");

        if (res.ok) {
          const data = await res.json();
          setRealPendingUsers(Array.isArray(data) ? data : []);
        }
      } catch (err) { console.error("Failed to sync pending users:", err); } finally { setLoadingPending(false); }
    };
    fetchPendingUsers();

    const fetchResets = async () => {
      setLoadingResets(true);
      try {
        let res = await authFetch("/api/v1/admin/reset-requests");
        if (!res.ok) res = await authFetch("/api/v1/auth/reset-requests");

        if (res.ok) {
          const data = await res.json();
          setResetRequests(Array.isArray(data) ? data : []);
        }
      } catch (err) { console.error("Failed to sync password resets:", err); } finally { setLoadingResets(false); }
    };
    fetchResets();

    if (activeTab === 'logs') {
      setLoadingLogs(true);
      authFetch("/api/v1/audit-logs")
        .then(res => res.json())
        .then(data => { setaudit_logs(Array.isArray(data) ? data : []); setLoadingLogs(false); })
        .catch(err => { console.error(err); setLoadingLogs(false); });
    }
  }, [activeTab]);

  const handleApproveUser = async (fnum) => {
    try {
      const token = localStorage.getItem('kmp_authToken');
      const safeFnum = encodeURIComponent(fnum);
      const headers = { "Content-Type": "application/json", "Authorization": `Bearer ${token}` };

      let response = await fetch(`${API_URL}/api/v1/admin/approve/${safeFnum}`, { method: "POST", headers });
      if (response.status === 404) response = await fetch(`${API_URL}/api/v1/auth/approve/${safeFnum}`, { method: "POST", headers });
      if (response.status === 404) response = await fetch(`${API_URL}/api/v1/approve/${safeFnum}`, { method: "POST", headers });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || `Server Error: ${response.status}`);
      }
      
      setRealPendingUsers(realPendingUsers.filter(u => u.fnum !== fnum));
      alert(`Officer ${fnum} successfully authorized!`);
    } catch (err) {
      alert(`Authorization Failed: ${err.message}`);
    }
  };

  const handleReviewRequest = async (reqId, actionStatus) => {
    if (!reqId) return alert("Error: Request ID is undefined. Primary key mismatch.");

    let payload = { status: actionStatus };
    if (actionStatus === "REJECTED") {
       const reason = window.prompt("State the reason for rejecting this HR request:");
       if (reason === null) return; 
       payload.reason = reason;
    }

    try {
      const token = localStorage.getItem('kmp_authToken');
      const response = await fetch(`${API_URL}/api/v1/requests/${reqId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }, body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || `Server Error: ${response.status}`);
      }
      
      setModRequests(modRequests.filter(r => r.id !== reqId && r.sn !== reqId && r.request_id !== reqId));
      alert(`Request ${actionStatus.toLowerCase()} successfully!`);
    } catch (err) {
      alert(`Error processing request: ${err.message}`);
    }
  };

  const handleResetAction = async (reqId, actionStr) => {
    try {
      const formData = new URLSearchParams();
      formData.append('action', actionStr);
      
      const response = await authFetch(`/api/v1/admin/execute-reset/${reqId}`, {
        method: "POST", headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: formData
      });
      
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail);
      
      setResetRequests(resetRequests.filter(r => r.id !== reqId));
      
      if (actionStr === "APPROVE") {
         alert(`Password successfully reset! Give the officer this temporary key: ${data.new_password}`);
      } else {
         alert("Request rejected.");
      }
    } catch (err) { alert(`Error: ${err.message}`); }
  };

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6 relative z-10 animate-in fade-in duration-300">
      <div className="text-center mb-8 flex flex-col items-center">
        <img src="/upf_badge.png" alt="UPF Logo" className="w-16 h-16 mb-3 object-contain contrast-200 brightness-75 drop-shadow-sm" />
        <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight">Access & Command Approvals</h1>
        <h3 className="text-lg text-gray-500 mt-2 font-medium">Review pending officer signups, HR transfers, and Audit Logs.</h3>
      </div>

      <div className="flex space-x-2 border-b border-gray-200 mb-6 bg-white/50 backdrop-blur rounded-t-xl px-4 pt-4 overflow-x-auto custom-scrollbar">
        <button onClick={() => setActiveTab('approvals')} className={`pb-3 px-4 text-sm font-bold border-b-2 transition-colors whitespace-nowrap ${activeTab === 'approvals' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>New Account Authorizations ({loadingPending ? '...' : realPendingUsers.length})</button>
        <button onClick={() => setActiveTab('requests')} className={`pb-3 px-4 text-sm font-bold border-b-2 transition-colors whitespace-nowrap ${activeTab === 'requests' ? 'border-yellow-500 text-yellow-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>HR Modification Requests ({modRequests.length})</button>
        <button onClick={() => setActiveTab('logs')} className={`pb-3 px-4 text-sm font-bold border-b-2 transition-colors whitespace-nowrap ${activeTab === 'logs' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>Audit Logs</button>
        <button onClick={() => setActiveTab('resets')} className={`pb-3 px-4 text-sm font-bold border-b-2 transition-colors whitespace-nowrap ${activeTab === 'resets' ? 'border-red-600 text-red-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>Password Resets ({activeTab === 'resets' ? resetRequests.length : '?'})</button>
      </div>

      {activeTab === 'approvals' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden max-w-6xl mx-auto">
          {loadingPending ? (
            <div className="p-8 text-center text-gray-500 font-medium animate-pulse">Syncing with Command Database...</div>
          ) : realPendingUsers.length === 0 ? (
            <div className="p-8 text-center text-gray-500 font-medium">No active unapproved access requests pending in queue.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Officer Details</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Command Post</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Derived Role</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Action</th>
                  </tr>
                </thead>
<tbody className="bg-white divide-y divide-gray-200">
                {loadingLogs ? (
                   <tr><td colSpan="5" className="p-8 text-center text-sm text-gray-500 font-bold animate-pulse">Decrypting server logs...</td></tr>
                ) : audit_logs.length === 0 ? (
                  <tr><td colSpan="5" className="p-4 text-center text-sm text-gray-500">No recent security events logged in main database.</td></tr>
                ) : (
                  audit_logs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50">
                      {/* 🟢 FIX 5: Force 24-hour time format using en-GB standards */}
                      <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-500 font-mono">
                        {log.created_at ? new Date(log.created_at).toLocaleString('en-GB', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : 'Unknown Time'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-extrabold text-blue-700">
                        {log.user_fnum}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">
                        <span className="font-extrabold text-slate-800 uppercase text-xs">{log.event_type}</span>
                      </td>
                       <td className="px-4 py-3 text-sm text-gray-600 font-medium">
                        {log.target_user || 'N/A'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {log.details}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'requests' && (
        <div className="bg-white rounded-xl shadow-sm border border-yellow-200 overflow-hidden max-w-6xl mx-auto">
          <div className="bg-slate-900 px-4 py-3 border-b border-gray-200 flex items-center text-white font-semibold"><Shield className="w-5 h-5 mr-2 text-yellow-400" /> HR Modification Requests</div>
          {loadingRequests ? (
            <div className="p-8 text-center text-gray-500 font-medium animate-pulse">Loading pending modifications...</div>
          ) : modRequests.length === 0 ? (
            <div className="p-8 text-center text-gray-500 font-medium">No pending profile modification requests.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Officer</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Requested Changes</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Action</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {modRequests.map((req) => (
                    <tr key={req.id} className="hover:bg-yellow-50/50">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="font-extrabold text-blue-700">{req.current_name}</div>
                        <div className="text-xs font-bold text-slate-500">{req.fnum} | {req.current_rank}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {req.requested_name && req.requested_name !== req.current_name && <div className="text-xs"><span className="font-bold text-slate-400">Name:</span> <span className="text-red-500 line-through mr-1">{req.current_name}</span> ➡️ <span className="text-green-600 font-bold">{req.requested_name}</span></div>}
                        {req.requested_rank && req.requested_rank !== req.current_rank && <div className="text-xs"><span className="font-bold text-slate-400">Rank:</span> <span className="text-red-500 line-through mr-1">{req.current_rank}</span> ➡️ <span className="text-green-600 font-bold">{req.requested_rank}</span></div>}
                        {req.requested_station && req.requested_station !== req.current_station && <div className="text-xs"><span className="font-bold text-slate-400">Station:</span> <span className="text-red-500 line-through mr-1">{req.current_station}</span> ➡️ <span className="text-green-600 font-bold">{req.requested_station}</span></div>}
                        {req.requested_region && req.requested_region !== req.current_region && <div className="text-xs"><span className="font-bold text-slate-400">Region:</span> <span className="text-red-500 line-through mr-1">{req.current_region}</span> ➡️ <span className="text-green-600 font-bold">{req.requested_region}</span></div>}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">
                        <div className="flex space-x-2">
                          <button onClick={() => handleReviewRequest(req.id || req.sn || req.request_id, "APPROVED")} className="bg-green-600 hover:bg-green-700 text-white font-bold py-1.5 px-3 rounded text-xs transition flex items-center shadow-sm"><CheckCircle size={14} className="mr-1" /> Approve</button>
                          <button onClick={() => handleReviewRequest(req.id || req.sn || req.request_id, "REJECTED")} className="bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300 font-bold py-1.5 px-3 rounded text-xs transition flex items-center shadow-sm"><X size={14} className="mr-1" /> Reject</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'logs' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden max-w-6xl mx-auto">
          <div className="bg-slate-900 px-4 py-3 border-b border-gray-200 flex items-center text-white font-semibold"><Shield className="w-5 h-5 mr-2 text-blue-400" /> System Audit Logs</div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Timestamp</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">User FNUM</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Event</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Target</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Details</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {loadingLogs ? (
                   <tr><td colSpan="5" className="p-8 text-center text-sm text-gray-500 font-bold animate-pulse">Decrypting server logs...</td></tr>
                ) : audit_logs.length === 0 ? (
                  <tr><td colSpan="5" className="p-4 text-center text-sm text-gray-500">No recent security events logged in main database.</td></tr>
                ) : (
                  audit_logs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-500 font-mono">{log.created_at ? new Date(log.created_at).toLocaleString() : 'Unknown Time'}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-extrabold text-blue-700">{log.user_fnum}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm"><span className="font-extrabold text-slate-800 uppercase text-xs">{log.event_type}</span></td>
                      <td className="px-4 py-3 text-sm text-gray-600 font-medium">{log.target_user || 'N/A'}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{log.details}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'resets' && (        
        <div className="bg-white rounded-xl shadow-sm border border-red-200 overflow-hidden max-w-6xl mx-auto">
          <div className="bg-slate-900 px-4 py-3 border-b border-gray-200 flex items-center text-white font-semibold"><Lock className="w-5 h-5 mr-2 text-red-400" /> Authorized Password Recovery</div>
          {loadingResets ? (
            <div className="p-8 text-center text-gray-500 font-medium animate-pulse">Scanning jurisdiction for requests...</div>
          ) : resetRequests.length === 0 ? (
            <div className="p-8 text-center text-gray-500 font-medium">No pending password reset requests in your command.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Date Requested</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Officer Details</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Station / Division</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Command Action</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {resetRequests.map((req) => (
                    <tr key={req.id} className="hover:bg-red-50/50">
                      <td className="px-4 py-3 whitespace-nowrap text-xs font-bold text-gray-500">{req.request_date}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="text-sm font-extrabold text-blue-700">{req.name}</div>
                        <div className="text-xs font-bold text-slate-500">{req.fnum} | {req.rank}</div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                        <div className="font-bold">{req.station}</div>
                        <div className="text-xs text-gray-500">{req.region}</div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">
                        <div className="flex space-x-2">
                          <button onClick={() => handleResetAction(req.id, "APPROVE")} className="bg-red-600 hover:bg-red-700 text-white font-bold py-1.5 px-3 rounded text-xs transition flex items-center shadow-sm"><Unlock size={14} className="mr-1" /> Authorize Reset</button>
                          <button onClick={() => handleResetAction(req.id, "REJECT")} className="bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300 font-bold py-1.5 px-3 rounded text-xs transition flex items-center shadow-sm"><X size={14} className="mr-1" /> Reject</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ====================================================================
// --- PROFILE UPDATE SYSTEM (COMMAND WORKFLOW ENABLED FOR ALL USERS) ---
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
      const token = localStorage.getItem('kmp_authToken');
      const response = await fetch(`${API_URL}/api/v1/users/change-password`, {
        method: "PUT", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }, body: JSON.stringify(passwordData)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Failed to update password.");
      setNotification(`✅ ${data.message}`);
      setPasswordData({ old_password: '', new_password: '' });
    } catch (err) { setNotification(`❌ Error: ${err.message}`); }
  };

  const canAutoApprove = ['SUPER_ADMIN', 'ADMIN'].includes(currentUser.role);
  const OFFICER_RANKS = ['AIP', 'IP', 'ASP', 'SP', 'SASP', 'SSP', 'ACP', 'CP', 'SCP', 'AIGP', 'DIGP', 'IGP'];

  const [formData, setFormData] = useState({
    fnum: currentUser.fnum || '', name: currentUser.name || '', rank: currentUser.rank || '',
    region: currentUser.region || '', station: currentUser.station || '', email: currentUser.email || '',
    phone: currentUser.phone || '', profile_photo_path: currentUser.profile_photo_path || ''
  });

  const isOfficerRank = OFFICER_RANKS.includes(formData.rank?.toUpperCase().trim());
  const wasNCO = !OFFICER_RANKS.includes(currentUser.rank?.toUpperCase().trim());
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
        const token = localStorage.getItem('kmp_authToken');
        const response = await fetch(`${API_URL}/api/v1/users/upload-profile`, { method: "POST", body: uploadData });
        if (!response.ok) throw new Error("Upload failed on server.");

        const data = await response.json();
        const s3Url = data.full_s3_url || data.cloud_storage_path;

        const securePayload = { ...formData, profile_photo_path: s3Url };
        const updateRes = await fetch(`${API_URL}/api/v1/users/profile/update`, {
          method: "PUT", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }, body: JSON.stringify(securePayload)
        });

        if (!updateRes.ok) throw new Error("Failed to link photo to profile in database.");

        setFormData(prev => ({ ...prev, profile_photo_path: s3Url }));
        setCurrentUser(prev => ({ ...prev, profile_photo_path: s3Url }));
        setNotification("✅ Photo uploaded and permanently saved successfully!");
        setTimeout(() => setNotification(null), 4000);
      } catch (error) { setNotification(`❌ Error: ${error.message}`); }
    }
  };

  const handleRequestSubmit = async (e) => {
    if (e) e.preventDefault();
    setNotification("⏳ Sending official request to Command...");
    try {
      const token = localStorage.getItem('kmp_authToken');
      const response = await fetch(`${API_URL}/api/v1/requests`, {
        method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
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
    } catch (err) { setNotification(`❌ Error: ${err.message}`); }
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    setNotification("⏳ Verifying profile data with HR Nominal Roll...");
    try {
      const token = localStorage.getItem('kmp_authToken');
      const response = await fetch(`${API_URL}/api/v1/users/profile/update`, {
        method: "PUT", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }, body: JSON.stringify(formData)
      });
      const data = await response.json();

      if (!response.ok) throw new Error(data.detail || "Failed to update database.");
      if (data.new_token) localStorage.setItem('kmp_authToken', data.new_token);

      setCurrentUser({ ...currentUser, ...formData });
      setNotification("✅ Profile verified and successfully updated!");
      setIsEditing(false); setIsRequestMode(false);
      setTimeout(() => setNotification(null), 4000);
    } catch (err) { setNotification(`❌ ${err.message}`); }
  };

  const handleContactSubmit = async (e) => {
    if (e) e.preventDefault();
    setNotification("⏳ Saving contact details...");
    try {
      const token = localStorage.getItem('kmp_authToken');
      const securePayload = { ...currentUser, email: formData.email, phone: formData.phone, profile_photo_path: formData.profile_photo_path };

      const response = await fetch(`${API_URL}/api/v1/users/profile/update`, {
        method: "PUT", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }, body: JSON.stringify(securePayload)
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Failed to update database.");

      setCurrentUser({ ...currentUser, email: formData.email, phone: formData.phone, profile_photo_path: formData.profile_photo_path });
      setNotification("✅ Contact info and photo successfully updated!");
      setTimeout(() => setNotification(null), 4000);
    } catch (err) { setNotification(`❌ ${err.message}`); }
  };

  const handleProfileSave = (e) => {
     e.preventDefault();
     if (canAutoApprove || formData.fnum !== currentUser.fnum) handleSubmit(e);
     else handleRequestSubmit(e);
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6 mt-10 relative z-10 animate-in fade-in duration-300">
      <button onClick={() => setCurrentPage && setCurrentPage('home')} className="flex items-center text-sm font-bold text-slate-500 hover:text-blue-700 transition-colors bg-white hover:bg-blue-50 px-4 py-2 rounded-lg shadow-sm border border-slate-200 w-fit">
        <Home size={16} className="mr-2" /> Return to Master Dashboard
      </button>

      <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
        <div className="bg-slate-900 px-6 py-8 border-b border-gray-200 flex justify-between items-center relative">
          <div className="flex items-center z-10">
            <div className="relative group">
              {formData.profile_photo_path ? (
                <img src={formData.profile_photo_path} alt="" className={`w-24 h-24 rounded-full object-cover shadow-2xl border-4 border-slate-700 bg-white transition-transform ${isEditing ? 'opacity-80' : 'cursor-pointer hover:scale-105'}`} onClick={() => !isEditing && setViewingImage(formData.profile_photo_path)} onError={(e) => { e.target.style.display='none'; }} />
              ) : (
                <div className="w-24 h-24 bg-blue-600 rounded-full flex items-center justify-center text-white font-extrabold text-4xl shadow-2xl border-4 border-slate-700">{currentUser.name?.charAt(0) || 'A'}</div>
              )}
              {isEditing && (
                <label className="absolute bottom-0 right-0 bg-blue-600 hover:bg-blue-500 text-white p-2 rounded-full cursor-pointer shadow-lg border-2 border-slate-800 transition-colors transform hover:scale-110">
                  <Camera size={16} /> <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
                </label>
              )}
            </div>
            <div className="ml-6 text-white">
              <h2 className="text-3xl font-extrabold tracking-tight">{currentUser.name}</h2>
              <p className="text-blue-300 font-medium tracking-wide mt-1 uppercase text-sm">{currentUser.rank} • {currentUser.station} • {currentUser.region}</p>
            </div>
          </div>
          <button onClick={() => { setIsEditing(!isEditing); setIsRequestMode(false); }} className={`z-10 flex items-center px-4 py-2 rounded-lg font-bold transition-colors shadow-sm ${isEditing ? 'bg-slate-700 text-white border border-slate-600' : 'bg-blue-600 text-white hover:bg-blue-500'}`}>
            {isEditing ? <><X size={16} className="mr-2"/> Cancel Edit</> : <><Edit size={16} className="mr-2"/> Update Profile</>}
          </button>
        </div>

        <div className="p-8">
          {notification && (
            <div className={`p-4 rounded-lg mb-6 font-medium text-sm flex items-center shadow-sm ${notification.includes('Error') || notification.includes('❌') ? 'bg-red-50 text-red-700 border border-red-200' : notification.includes('⏳') ? 'bg-yellow-50 text-yellow-800 border border-yellow-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
               {notification}
            </div>
          )}

          {isEditing ? (
            <div className="space-y-6">
              <div className={`p-6 rounded-xl border transition-colors duration-300 ${canAutoApprove ? 'bg-blue-50 border-blue-200' : isRequestMode ? 'bg-yellow-50 border-yellow-300' : 'bg-slate-100 border-slate-200'}`}>
                <div className="flex justify-between items-center mb-4 border-b pb-2 border-slate-200/50">
                  <div className={`flex items-center text-xs font-extrabold uppercase tracking-wider ${canAutoApprove ? 'text-blue-700' : isRequestMode ? 'text-yellow-700' : 'text-slate-500'}`}>
                    {canAutoApprove ? <Unlock size={14} className="mr-2" /> : isRequestMode ? <Edit size={14} className="mr-2" /> : <Lock size={14} className="mr-2" />} 
                    Official Deployment Records {canAutoApprove ? "(Admin Override Active)" : isRequestMode ? "(Drafting Request)" : "(Restricted)"}
                  </div>
                  {!canAutoApprove && !isRequestMode && (
                    <button type="button" onClick={() => setIsRequestMode(true)} className="text-xs bg-slate-800 hover:bg-slate-700 text-white px-3 py-1.5 rounded font-bold transition flex items-center shadow-sm"><Shield size={12} className="mr-1"/> Request Modification</button>
                  )}
                  {!canAutoApprove && isRequestMode && (
                    <button type="button" onClick={handleProfileSave} className="text-xs bg-yellow-600 hover:bg-yellow-500 text-white px-3 py-1.5 rounded font-bold transition flex items-center shadow-sm"><Send size={12} className="mr-1"/> Send Official Request</button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Full Name</label>
                    <input type="text" name="name" value={formData.name} onChange={handleInputChange} disabled={!canAutoApprove && !isRequestMode} className={`w-full p-2.5 rounded-lg font-bold border ${canAutoApprove || isRequestMode ? 'bg-white border-blue-300 text-gray-900 focus:ring-2 focus:ring-blue-500' : 'bg-gray-200 border-gray-300 text-gray-600 cursor-not-allowed'}`} />
                  </div>
                  <div className="flex gap-4">
                    <div className="w-1/2">
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Force / File Number</label>
                      <input type="text" name="fnum" value={formData.fnum} onChange={(e) => setFormData({...formData, fnum: e.target.value.toUpperCase()})} disabled={!canEditFnum} className={`w-full p-2.5 border rounded-lg font-bold transition-all ${canEditFnum ? 'bg-yellow-50 border-yellow-400 text-gray-900 focus:ring-2 focus:ring-yellow-500 shadow-inner' : 'bg-gray-200 border-gray-300 text-gray-600 cursor-not-allowed'}`} />
                      {canEditFnum && <p className="text-[9px] text-blue-600 mt-1 font-bold animate-pulse">Unlocked for Promotion Verification</p>}
                    </div>
                    <div className="w-1/2">
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Rank</label>
                      <input type="text" name="rank" value={formData.rank} onChange={(e) => setFormData({...formData, rank: e.target.value.toUpperCase()})} disabled={!canAutoApprove && !isRequestMode && !wasNCO} className={`w-full p-2.5 rounded-lg font-bold border ${(canAutoApprove || isRequestMode || wasNCO) ? 'bg-white border-blue-300 text-gray-900 focus:ring-2 focus:ring-blue-500' : 'bg-gray-200 border-gray-300 text-gray-600 cursor-not-allowed'}`} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Command Region</label>
                    <input type="text" name="region" value={formData.region} onChange={handleInputChange} disabled={!canAutoApprove && !isRequestMode} className={`w-full p-2.5 rounded-lg font-bold border ${canAutoApprove || isRequestMode ? 'bg-white border-blue-300 text-gray-900 focus:ring-2 focus:ring-blue-500' : 'bg-gray-200 border-gray-300 text-gray-600 cursor-not-allowed'}`} />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Assigned Station</label>
                    <input type="text" name="station" value={formData.station} onChange={handleInputChange} disabled={!canAutoApprove && !isRequestMode} className={`w-full p-2.5 rounded-lg font-bold border ${canAutoApprove || isRequestMode ? 'bg-white border-blue-300 text-gray-900 focus:ring-2 focus:ring-blue-500' : 'bg-gray-200 border-gray-300 text-gray-600 cursor-not-allowed'}`} />
                  </div>
                </div>
              </div>

              <form onSubmit={handleContactSubmit} className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-4">
                <div className="flex items-center text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-4 border-b border-gray-100 pb-2">
                  <Edit size={14} className="mr-2" /> Editable Contact Data
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Official Email</label>
                    <input type="email" name="email" value={formData.email} onChange={handleInputChange} className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-medium text-gray-900" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Contact Number</label>
                    <input type="tel" name="phone" value={formData.phone} onChange={handleInputChange} className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-medium text-gray-900" />
                  </div>
                </div>
                <div className="flex justify-end pt-4 mt-2 border-t border-gray-100">
                  <button type="submit" className="bg-blue-700 hover:bg-blue-800 text-white font-bold py-2 px-6 rounded-lg shadow-md transition-colors flex items-center text-sm">💾 Save Profile Changes</button>
                </div>
              </form>

              {/* 🟢 NEW PASSWORD CHANGE FORM */}
              <form onSubmit={handlePasswordChange} className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-4">
                <div className="flex items-center text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-4 border-b border-gray-100 pb-2">
                  <Lock size={14} className="mr-2 text-red-500" /> Security: Change Password
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Current Password</label>
                    <input type="password" required value={passwordData.old_password} onChange={(e) => setPasswordData({...passwordData, old_password: e.target.value})} className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">New Password (Min 6 Chars)</label>
                    <input type="password" required value={passwordData.new_password} onChange={(e) => setPasswordData({...passwordData, new_password: e.target.value})} className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
                <div className="flex justify-end pt-4 mt-2 border-t border-gray-100">
                  <button type="submit" className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-6 rounded-lg shadow-md transition-colors text-sm">Update Security Key</button>
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
                  <div className="text-sm font-extrabold text-slate-900">{currentUser.fnum}</div>
                </div>
                
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">IPPS Number</label>
                  <div className="text-sm font-bold text-slate-800">{currentUser.ipps || 'N/A'}</div>
                </div>
                
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Sex</label>
                  <div className="text-sm font-bold text-slate-800">{currentUser.sex || 'N/A'}</div>
                </div>
                
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">System Role</label>
                  <div className={`text-sm font-extrabold ${canAutoApprove ? 'text-green-600' : 'text-blue-600'}`}>{currentUser.role || 'USER'}</div>
                </div>

                <div className="col-span-2">
                  <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Official Title / Position</label>
                  <div className="text-sm font-bold text-slate-800">{currentUser.position || 'N/A'}</div>
                </div>
                
                <div className="col-span-2">
                  <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Command Chain (Region / Station)</label>
                  <div className="text-sm font-bold text-slate-800">{currentUser.region || 'N/A'} / {currentUser.station || 'N/A'}</div>
                </div>

                <div className="col-span-2">
                  <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Official Email</label>
                  <div className="text-sm font-bold text-slate-800 truncate">{currentUser.email || 'N/A'}</div>
                </div>
                
                <div className="col-span-2">
                  <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Contact Number</label>
                  <div className="text-sm font-bold text-slate-800">{currentUser.phone || 'N/A'}</div>
                </div>

              </div>
            </div>
          )}
        </div>
      </div>

      {/* 🟢 FULL SCREEN IMAGE MODAL FOR MY PROFILE */}
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
// --- LOGIN & AUTHENTICATION GATEWAY ---
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

    // Attach global listeners to window with capture phase
    window.addEventListener('mousemove', resetIdle, true);
    window.addEventListener('keydown', resetIdle, true);
    window.addEventListener('click', resetIdle, true);
    window.addEventListener('scroll', resetIdle, true);
    window.addEventListener('touchstart', resetIdle, true);

    return () => {
      clearTimeout(idleTimerRef.current);
      window.removeEventListener('mousemove', resetIdle, true);
      window.removeEventListener('keydown', resetIdle, true);
      window.removeEventListener('click', resetIdle, true);
      window.removeEventListener('scroll', resetIdle, true);
      window.removeEventListener('touchstart', resetIdle, true);
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
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-4 relative">
      
      {/* MAIN CARD CONTAINER */}
      <div className="max-w-xl w-full bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden relative z-10">
        
        {/* 🟢 THE WAVING POLICE FLAG EMBLEM IDLE CURTAIN */}
        <div 
          className={`absolute inset-0 z-50 flex flex-col items-center justify-center transition-all duration-1000 ease-in-out shadow-2xl ${
            isLoginIdle ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0 pointer-events-none'
          }`}
          style={{ backgroundColor: '#0f172a' }} 
        >
          {/* Top Stripes */}
          <div className="absolute top-0 w-full h-2 bg-[#000000]"></div>
          <div className="absolute top-2 w-full h-2 bg-[#facc15]"></div>
          <div className="absolute top-4 w-full h-2 bg-[#dc2626]"></div>

          {/* Faded Background Pattern */}
          <div 
            className="absolute inset-0 opacity-10 bg-center bg-no-repeat bg-cover mt-10" 
            style={{ backgroundImage: `url('/UPF Flag Emblem.png')` }}
          ></div>

<div className="relative z-10 flex flex-col items-center text-center">
  <img 
    src="/UPF Flag Emblem.png" 
    alt="UPF Waving Flag Emblem" 
    className="w-72 h-44 mb-6 drop-shadow-[0_0_25px_rgba(255,255,255,0.3)] object-contain rounded-xl border border-slate-600 shadow-2xl"
    onError={(e) => { e.target.style.display = 'none'; }}
  />
  
  {/* Sweep-and-Settle Animated Title */}
  <div className="overflow-hidden py-2 w-full max-w-4xl">
    <h2 className="text-3xl font-extrabold text-center text-white tracking-wide uppercase drop-shadow-md animate-sweep-settle">
      KMP SECURITY DATA MANAGEMENT SYSTEM
    </h2>
  </div>

  {/* Sparkling Globe Badge */}
  <p className="text-blue-300 mt-3 text-sm font-bold bg-blue-900/50 px-4 py-1.5 rounded-full border border-blue-500/30 backdrop-blur-sm shadow-inner flex items-center justify-center">
    <Lock size={14} className="mr-2" /> 
    
    <span className="relative inline-flex items-center justify-center mx-2">
      <span className="absolute -inset-1 rounded-full bg-yellow-400/20 blur-xs animate-pulse"></span>
      <Globe size={20} className="relative z-10 animate-diamond-globe" />
      <span className="absolute -top-1 -right-1.5 text-[10px] animate-ping text-yellow-200">✨</span>
    </span>

    KMP-CSDMS Standby Mode
  </p>
</div>

          {/* Bottom Stripes */}
          <div className="absolute bottom-4 w-full h-2 bg-[#dc2626]"></div> 
          <div className="absolute bottom-2 w-full h-2 bg-[#facc15]"></div> 
          <div className="absolute bottom-0 w-full h-2 bg-[#000000]"></div> 
        </div>
        {/* 🟢 END OF CURTAIN */}

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





// ====================================================================
// --- MAIN LAYOUT COMPONENT ---
// ====================================================================
// ====================================================================
// --- GLOBAL WORKSPACE SECURITY IDLE CURTAIN COMPONENT ---
// ====================================================================
const WorkspaceSecurityCurtain = () => {
  const [isWorkspaceIdle, setIsWorkspaceIdle] = useState(false);
  const [isReadingMode, setIsReadingMode] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const idleTimerRef = useRef(null);

  useEffect(() => {
    const IDLE_TIMEOUT_MS = 60000;

    const handleUserActivity = () => {
      if (isReadingMode) return;
      setIsWorkspaceIdle(false);
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => {
        if (!isReadingMode) setIsWorkspaceIdle(true);
      }, IDLE_TIMEOUT_MS);
    };

    handleUserActivity();

    window.addEventListener('mousemove', handleUserActivity, true);
    window.addEventListener('keydown', handleUserActivity, true);
    window.addEventListener('mousedown', handleUserActivity, true);
    window.addEventListener('scroll', handleUserActivity, true);
    window.addEventListener('touchstart', handleUserActivity, true);

    return () => {
      clearTimeout(idleTimerRef.current);
      window.removeEventListener('mousemove', handleUserActivity, true);
      window.removeEventListener('keydown', handleUserActivity, true);
      window.removeEventListener('mousedown', handleUserActivity, true);
      window.removeEventListener('scroll', handleUserActivity, true);
      window.removeEventListener('touchstart', handleUserActivity, true);
    };
  }, [isReadingMode]);

  return (
    <>
      {/* 🟢 COLLAPSIBLE DISCREET IDLE GUARD TOGGLE */}
      <div className="fixed bottom-6 right-6 z-[9990]">
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
          {/* Glowing Indicator Dot / Ping */}
          <span className={`relative flex h-3 w-3 ${isExpanded ? 'mr-2.5' : ''}`}>
            <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${isReadingMode ? 'bg-slate-950 animate-ping' : 'bg-green-400 animate-ping'}`}></span>
            <span className={`relative inline-flex rounded-full h-3 w-3 ${isReadingMode ? 'bg-slate-950' : 'bg-green-500'}`}></span>
          </span>

          {/* Expanded Label Text */}
          {isExpanded && (
            <span className="font-bold text-xs uppercase tracking-wider whitespace-nowrap">
              {isReadingMode ? 'Click to stop curtain' : '🛡️ Standard Idle Guard'}
            </span>
          )}
        </div>
      </div>

      {/* 🟢 FULL-SCREEN STANDBY CURTAIN */}
      <div 
        className={`fixed inset-0 w-screen h-screen z-[99999] flex flex-col items-center justify-center transition-transform duration-700 ease-in-out shadow-2xl overflow-hidden ${
          isWorkspaceIdle && !isReadingMode ? 'translate-y-0 opacity-100 pointer-events-auto' : '-translate-y-full opacity-0 pointer-events-none'
        }`}
        style={{ backgroundColor: '#0f172a' }}
      >
        <div className="absolute top-0 w-full h-2.5 bg-[#000000]"></div>
        <div className="absolute top-2.5 w-full h-2.5 bg-[#facc15]"></div>
        <div className="absolute top-5 w-full h-2.5 bg-[#dc2626]"></div>

        <div className="absolute inset-0 w-full h-full opacity-15 uganda-flag-wave"></div>

        <div className="relative z-10 flex flex-col items-center text-center">
          <div className="w-72 h-44 mb-6 drop-shadow-[0_0_25px_rgba(255,255,255,0.3)] png-flag-wave rounded-xl shadow-2xl border border-slate-600/50"></div>
          
          <h2 className="text-3xl font-extrabold text-center text-white tracking-wide uppercase drop-shadow-md">
            KMP SECURITY DATA MANAGEMENT SYSTEM
          </h2>
          <p className="text-blue-300 mt-3 text-sm font-bold bg-blue-900/50 px-4 py-1.5 rounded-full border border-blue-500/30 backdrop-blur-sm shadow-inner flex items-center justify-center">
            <Lock size={14} className="mr-2" /> 
            
            {/* Sparkling Globe Container */}
            <span className="relative inline-flex items-center justify-center mx-2">
              <span className="absolute -inset-1 rounded-full bg-yellow-400/20 blur-xs animate-pulse"></span>
              <Globe size={20} className="relative z-10 animate-spin text-yellow-400 drop-shadow-[0_0_8px_rgba(250,204,21,0.6)]" style={{ animationDuration: '4s' }} />
              <span className="absolute -top-1 -right-1.5 text-[10px] animate-ping text-yellow-200">✨</span>
            </span>

            KMP-CSDMS Standby Mode 
          </p>
        </div>

        <div className="absolute bottom-5 w-full h-2.5 bg-[#dc2626]"></div> 
        <div className="absolute bottom-2.5 w-full h-2.5 bg-[#facc15]"></div> 
        <div className="absolute bottom-0 w-full h-2.5 bg-[#000000]"></div> 
      </div>
    </>
  );
};

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
  Admin_Communication 
}) => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showOnline, setShowOnline] = useState(false);
  const [showAllUsers, setShowAllUsers] = useState(false);
  const [selectedUserDetail, setSelectedUserDetail] = useState(null);
  const [viewingProfileImage, setViewingProfileImage] = useState(null);
  const [newForcePassword, setNewForcePassword] = useState('');
  const [isFullScreen, setIsFullScreen] = useState(false);

  const [lastViewedId, setLastViewedId] = useState(() => {
    const saved = localStorage.getItem('last_viewed_comm_id');
    return saved ? JSON.parse(saved) : 0;
  });

  // 🟢 LIVE DATABASE HEARTBEAT & ONLINE ROSTER SYNC
  const [realOnlineUsers, setRealOnlineUsers] = useState([]);

  useEffect(() => {
    const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

    const syncHeartbeat = async () => {
      const currentToken = localStorage.getItem('kmp_authToken');
      if (!currentToken) return;

      try {
        await fetch(`${API_URL}/api/v1/users/heartbeat`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${currentToken}` }
        });

        const response = await fetch(`${API_URL}/api/v1/users/online`, {
          headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        
        if (response.ok) {
          setRealOnlineUsers(await response.json());
        }
      } catch (err) {
        console.warn("Heartbeat sync paused...");
      }
    };

    syncHeartbeat();
    const heartbeatInterval = setInterval(syncHeartbeat, 60000);
    return () => clearInterval(heartbeatInterval);
  }, []);

// 🟢 ADVANCED IDLE TIMER & WARNING SCREEN
  const [showIdleWarning, setShowIdleWarning] = useState(false);
  const [idleCountdown, setIdleCountdown] = useState(60);
  
  const isWarningActive = useRef(false);
  const resetIdleTimersRef = useRef(null);

  useEffect(() => {
    let warningTimer;
    let logoutTimer;
    let countdownInterval;
    let activityThrottle;

    const IDLE_LIMIT = 29 * 60 * 1000;  // 29 minutes before warning
    const WARNING_WINDOW = 60 * 1000;   // 1 minute final countdown

    const startTimers = () => {
      clearTimeout(warningTimer);
      clearTimeout(logoutTimer);
      clearInterval(countdownInterval);

      isWarningActive.current = false;
      setShowIdleWarning(false);

      // 1. Set the timer for the warning pop-up (29 mins)
      warningTimer = setTimeout(() => {
        isWarningActive.current = true;
        setShowIdleWarning(true);
        setIdleCountdown(WARNING_WINDOW / 1000);
        
        countdownInterval = setInterval(() => {
          setIdleCountdown(prev => {
            if (prev <= 1) {
              clearInterval(countdownInterval);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      }, IDLE_LIMIT);

      // 2. Set the absolute logout timer (30 mins total)
      logoutTimer = setTimeout(() => {
        clearInterval(countdownInterval);
        isWarningActive.current = false;
        setShowIdleWarning(false);
        
        alert("Session Expired: You have been securely logged out due to inactivity.");
        if (typeof onLogout === 'function') {
            onLogout();
        } else {
            localStorage.removeItem('kmp_authToken'); 
            window.location.reload(); 
        }
      }, IDLE_LIMIT + WARNING_WINDOW);
    };

    // Keep this accessible so the Modal button can reset the timers
    resetIdleTimersRef.current = startTimers;

    // Throttled event listener to prevent performance lagging
    const handleUserActivity = () => {
      if (isWarningActive.current) return;
      
      if (!activityThrottle) {
         activityThrottle = setTimeout(() => {
            startTimers();
            activityThrottle = null;
         }, 2000); 
      }
    };

    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];

    events.forEach(event => {
      window.addEventListener(event, handleUserActivity);
    });

    // Kick off the timers when the component loads
    startTimers();

    return () => {
      clearTimeout(warningTimer);
      clearTimeout(logoutTimer);
      clearInterval(countdownInterval);
      clearTimeout(activityThrottle);
      events.forEach(event => {
        window.removeEventListener(event, handleUserActivity);
      });
    };
  }, [onLogout]); // Fixed dependency array from onSecureLogout to onLogout


// 🟢 AUTOMATIC PAGE ACCESS TRACKER -> ROUTED CORRECTLY TO ACTIVITY_LOGS TABLE
  const lastLoggedPage = useRef(null);

  useEffect(() => {
    if (!currentUser?.fnum || !currentPage) return;
    
    // 🛑 INFINITE LOOP KILL SWITCH: Only fetch if the page actually changed
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
    })
    .then(res => res.json())
    .catch(err => console.error("Activity log error:", err));

  }, [currentPage, currentUser?.fnum]);



  const safeSidebarComms = Array.isArray(Admin_Communication) ? Admin_Communication : (Admin_Communication?.data || Admin_Communication?.items || []);
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
    ...(hasNominalClearance ? [{ name: 'Nominal Roll', id: 'nominal-roll', icon: <Users size={20} /> }] : []),
  ];

  const handleExportLogs = async () => {
    try {
      const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
      const token = localStorage.getItem('kmp_authToken');
      
      const response = await fetch(`${API_URL}/api/v1/audit-logs`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) throw new Error("Security Clearance Denied");

      const logs = await response.json();
      const headers = ["ID", "Event Type", "Target User", "Status", "Details", "Created At", "User FNUM"];
      
      const csvRows = logs.map(log => {
        const safeDetails = log.details ? log.details.replace(/"/g, '""') : "";
        return [
          log.id, 
          log.event_type || "N/A", 
          log.target_user || "N/A",
          log.status || "N/A",
          `"${safeDetails}"`, 
          log.created_at || "Unknown Time",
          log.user_fnum || "SYSTEM"
        ];
      });

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

  const IdleWarningModal = () => showIdleWarning && (
    <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md z-[500] flex justify-center items-center p-4 animate-in zoom-in duration-300">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full text-center border-2 border-red-500">
        <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4 animate-bounce" />
        <h2 className="text-2xl font-extrabold text-slate-900 mb-2">Session Timeout Warning</h2>
        <p className="text-slate-600 font-medium mb-6">Your connection to the KMP network has been idle. For security purposes, you will be logged out in:</p>
        <div className="text-5xl font-mono font-extrabold text-red-600 mb-8">{idleCountdown}s</div>
        <button 
          onClick={() => {
            if (resetIdleTimersRef.current) resetIdleTimersRef.current();
          }} 
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl shadow-lg transition-all text-lg"
        >
          I am still here (Extend Session)
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-gray-50 font-sans overflow-hidden">
      
      <div className={`transition-all duration-300 flex flex-col bg-slate-900 border-r border-slate-700 flex-shrink-0 overflow-hidden ${
        isFullScreen 
          ? 'hidden w-0' 
          : (sidebarOpen ? 'w-64 md:w-72' : 'w-16')
      }`}>
        
        <div className={`p-4 flex items-center border-b border-slate-500 transition-all ${sidebarOpen ? 'justify-between' : 'justify-center'}`}>
          {sidebarOpen && (
            <div className="flex items-center min-w-max">
              <img 
                src="/upf_badge.png" 
                alt="UPF Logo" 
                className="w-4 h-4 mr-0.5 object-contain contrast-200 brightness-75 drop-shadow-sm" 
                onError={(e) => { e.target.style.display = 'none'; }} 
              />
              <span className="font-bold text-0.5g tracking-wider text-white">KMP TRACKER SYSTEM</span>
            </div>
          )}
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-1 hover:bg-slate-500 rounded text-slate-150 transition-colors shrink-0">
            <Menu size={sidebarOpen ? 14 : 20} className="text-yellow-400" />
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
                className={`w-full flex items-center py-3 transition-colors text-left ${sidebarOpen ? 'px-6' : 'px-0 justify-center'} ${
                  currentPage === item.id ? 'bg-blue-600 border-l-4 border-yellow-400 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent'
                }`}
              >
                <div className="min-w-[24px] flex justify-center shrink-0">{item.icon}</div>
                
                {sidebarOpen && (
                  <span className={`ml-3 font-medium text-sm flex items-center justify-between flex-1 min-w-max ${item.id === 'home' && hasUnreadComms ? 'text-green-200 font-extrabold animate-pulse' : ''}`}>
                    {item.name}
                    {item.id === 'home' && hasUnreadComms && (
                      <span className="text-[9px] bg-green-200/20 text-green-200 border border-green-200 px-1.5 py-0.5 rounded uppercase tracking-wider ml-2">New Dispatch</span>
                    )}
                  </span>
                )}
              </button>
            ))}
          </nav>

          {sidebarOpen && (['ADMIN', 'SUPER_ADMIN'].includes(currentUser.role) || currentUser.permissions?.system_admin) && (
            <div className="px-4 space-y-3 min-w-max">
              <div className={`rounded-lg p-3 transition-colors ${currentPage === 'approvals' ? 'bg-slate-700 border border-slate-600' : 'bg-slate-800'}`}>
                <div className="text-sm font-bold mb-2 flex items-center"><UserPlus size={16} className="mr-2"/> Access & Approvals</div>
                <button 
                  onClick={() => setCurrentPage('approvals')} 
                  className={`w-full text-xs py-4 rounded transition font-medium ${currentPage === 'approvals' ? 'bg-green-600 text-white' : 'bg-slate-300 hover:bg-slate-600 text-slate-900 hover:text-white'}`}
                >
                  Manage Pending Users & Logs
                </button>
              </div>

              <div className="rounded-lg p-4 bg-slate-800">
                <button type="button" onClick={() => setShowOnline(!showOnline)} className="w-full flex justify-between items-center text-sm font-bold text-green-400">
                  <span className="flex items-center"><RadioReceiver size={16} className="mr-3"/> 🟢 Active Online ({realOnlineUsers?.length || 0})</span>
                </button>
                
                {showOnline && (
                  <div className="mt-4 space-y-2 border-t border-slate-700 pt-4 max-h-40 overflow-y-auto custom-scrollbar pr-1">
                    {realOnlineUsers.map((user) => (
                      <div key={user.fnum} onClick={() => { setSelectedUserDetail({ ...user, isSystemUser: true, isReadOnly: true }); setNewForcePassword(''); }} className="text-xs bg-slate-800 p-2 rounded hover:bg-slate-950 border border-transparent hover:border-green-500 cursor-pointer transition-all flex items-center justify-between group">
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
            </div> 
          )}

          {sidebarOpen && (['ADMIN', 'SUPER_ADMIN'].includes(currentUser.role) || currentUser.permissions?.view_global_roster) && (
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
                              <div className="w-7 h-7 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center font-bold text-xs border border-slate-600 group-hover:border-blue-400 group-hover:text-blue-300">
                                {u.name?.charAt(0) || 'U'}
                              </div>
                            )}
                            <div>
                              <span className="font-bold text-white block truncate w-28">{u.name}</span>
                              <span className="text-slate-400 font-mono text-[9px]">{u.fnum}</span>
                            </div>
                          </div>
                          <div className="text-[9px] px-1.5 py-0.5 bg-slate-800 rounded text-slate-300 font-bold uppercase border border-slate-700 group-hover:bg-blue-900 group-hover:text-blue-100 transition-colors">
                            {String(u.role || 'USER').replace('_ADMIN', '')}
                          </div>
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
                      {(['ADMIN', 'SUPER_ADMIN', 'RPC'].includes(currentUser.role) || currentUser.permissions?.export_data) && (
                        <button onClick={onGenerateHRReport} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white text-xs py-2 rounded transition flex items-center justify-center">
                          <Download size={14} className="mr-1"/> Export
                        </button>
                      )}
                    </div>
                  </div>
                  {(['ADMIN', 'SUPER_ADMIN'].includes(currentUser.role) || currentUser.permissions?.consolidated) && (
                    <button onClick={onViewConsolidated} className="w-full text-xs py-2 rounded transition flex items-center justify-center font-bold mt-3 bg-slate-900 hover:bg-slate-950 text-blue-400 border border-blue-900">
                      <Eye size={14} className="mr-2"/> Consolidated Entries
                    </button>
                  )}
                  {(['SUPER_ADMIN'].includes(currentUser.role) || currentUser.permissions?.export_data) && (
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
        <IdleWarningModal /> 
        <div className="absolute top-4 right-6 z-50">
          <button 
            onClick={() => setIsFullScreen(!isFullScreen)}
            className="bg-blue-400 hover:bg-blue-450 text-white px-3 py-1.5 rounded text-xs font-bold shadow-md transition-colors flex items-center gap-2 border border-blue-400"
          >
            {isFullScreen ? '🗗' : '⛶'}
          </button>
        </div>

        {/* Uganda Flag Diagonal Wave Watermark */}
        <div className="absolute inset-0 pointer-events-none z-0 uganda-flag-wave-diagonal opacity-[0.10]"></div>

        {/* UPF Badge Watermark */}
        <div className="fixed inset-0 pointer-events-none z-0 flex items-center justify-center opacity-[0.08]">
          <img 
            src="/upf_badge.png" 
            alt="watermark" 
            className="w-1/2 max-w-2xl grayscale object-contain contrast-200 brightness-75 drop-shadow-sm" 
            onError={(e) => { e.target.style.display = 'none'; }} 
          />
        </div>
        
        {React.Children.map(children, child => 
          (React.isValidElement(child) && typeof child.type !== 'string') 
            ? React.cloneElement(child, { setSidebarOpen }) 
            : child
        )}  
      </main>

      {selectedUserDetail && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-in fade-in">
          
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-y-auto max-h-[95vh] custom-scrollbar flex flex-col">
            
            <div className="bg-slate-900 text-white p-4 flex justify-between items-center shrink-0">
              <h3 className="font-bold flex items-center text-sm">
                <Shield size={18} className="text-blue-400 mr-2" /> 
                ACCESS CLEARANCE MATRIX
              </h3>
              <button onClick={() => setSelectedUserDetail(null)} className="text-slate-400 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6">
              <div className="flex items-center space-x-4 mb-6 pb-4 border-b border-gray-100">
                <div className="w-16 h-16 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center font-extrabold text-2xl overflow-hidden shadow-sm border-2 border-blue-500">
                  {selectedUserDetail.profile_photo_path ? (
                     <img 
                       src={selectedUserDetail.profile_photo_path} 
                       alt="Profile" 
                       className="w-full h-full object-cover cursor-pointer hover:scale-110 transition-transform" 
                       onClick={() => setViewingProfileImage(selectedUserDetail.profile_photo_path)} 
                     />
                  ) : (selectedUserDetail.name?.charAt(0) || 'U')}
                </div>
              </div>

              <h4 className="text-xs font-bold text-slate-800 mb-3 uppercase tracking-wider">Comprehensive Profile</h4>
              <div className="grid grid-cols-2 gap-4 mb-6 bg-slate-50 p-4 rounded-lg border border-slate-200 shadow-inner">
                <div>
                  <label className="text-[9px] font-bold text-slate-400 uppercase">IPPS Number</label>
                  <div className="text-xs font-bold text-slate-800">{selectedUserDetail.ipps || 'N/A'}</div>
                </div>
                <div>
                  <label className="text-[9px] font-bold text-slate-400 uppercase">Official Title</label>
                  <div className="text-xs font-bold text-slate-800">{selectedUserDetail.position || 'N/A'}</div>
                </div>
                <div className="col-span-2">
                  <label className="text-[9px] font-bold text-slate-400 uppercase">Command Chain (Region / Division)</label>
                  <div className="text-xs font-bold text-slate-800">{selectedUserDetail.region || 'N/A'} / {selectedUserDetail.division || 'N/A'}</div>
                </div>
                <div>
                  <label className="text-[9px] font-bold text-slate-400 uppercase">Email Contact</label>
                  <div className="text-xs font-bold text-slate-800 break-words">{selectedUserDetail.email || 'N/A'}</div>
                </div>
                <div>
                  <label className="text-[9px] font-bold text-slate-400 uppercase">Phone Number</label>
                  <div className="text-xs font-bold text-slate-800">{selectedUserDetail.phone || 'N/A'}</div>
                </div>
                <div>
                  <label className="text-[9px] font-bold text-slate-400 uppercase">Sex</label>
                  <div className="text-xs font-bold text-slate-800">{selectedUserDetail.sex || 'N/A'}</div>
                </div>
                <div>
                  <label className="text-[9px] font-bold text-slate-400 uppercase">System Role</label>
                  <div className="text-xs font-extrabold text-blue-700">{selectedUserDetail.role || 'USER'}</div>
                </div>
              </div>

              {selectedUserDetail.isSystemUser && !selectedUserDetail.isReadOnly && (
                currentUser.role === 'SUPER_ADMIN' || 
                (currentUser.role?.includes('ADMIN') && selectedUserDetail.role !== 'SUPER_ADMIN' && currentUser.region === selectedUserDetail.region)
              ) && (
                <>
                  <h4 className="font-extrabold text-sm text-gray-900 border-b pb-2 flex items-center mb-4 mt-6">
                    <Shield size={16} className="mr-2 text-red-600"/> 
                    Component Admin Clearances
                  </h4>
                  <div className="space-y-3 bg-white p-4 rounded-lg border border-red-100 shadow-sm">
                    
                    <label className="flex items-center space-x-3 cursor-pointer group">
                      <input type="checkbox" className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500" defaultChecked={String(selectedUserDetail.role || '').includes('ADMIN')} onChange={(e) => { const newRole = e.target.checked ? 'ADMIN' : 'USER'; onUpdateUserRole(selectedUserDetail.fnum, newRole, selectedUserDetail.permissions || {}); }} />
                      <div className="flex-1">
                        <div className="text-sm font-bold text-slate-800 group-hover:text-blue-700 transition-colors">System Administrator</div>
                        <div className="text-xs text-slate-500 font-medium">Grants access to Approvals, User Roster, and Audit Logs.</div>
                      </div>
                    </label>

                    {/* 🟢 NOMINAL ROLL ACCESS CHECKBOX IN MATRIX */}
                    <label className="flex items-center space-x-3 cursor-pointer group">
                      <input type="checkbox" className="w-4 h-4 text-blue-500 rounded border-gray-300 focus:ring-blue-500" 
                        checked={Boolean(selectedUserDetail.permissions?.view_nominal_roll) || String(selectedUserDetail.role || '').includes('ADMIN')} 
                        disabled={String(selectedUserDetail.role || '').includes('ADMIN')} 
                        onChange={(e) => { 
                          const newPerms = { ...(selectedUserDetail.permissions || {}), view_nominal_roll: e.target.checked }; 
                          setSelectedUserDetail({ ...selectedUserDetail, permissions: newPerms }); 
                          onUpdateUserRole(selectedUserDetail.fnum, selectedUserDetail.role, newPerms); 
                        }} 
                      />
                      <div className="flex-1">
                        <div className="text-sm font-bold text-slate-800 group-hover:text-blue-700 transition-colors">Nominal Roll Access</div>
                        <div className="text-xs text-slate-500 font-medium">Grants standard users clearance to view the personnel registry.</div>
                      </div>
                    </label>

                    <label className="flex items-center space-x-3 cursor-pointer group">
                      <input type="checkbox" className="w-4 h-4 text-emerald-600 rounded border-gray-300 focus:ring-emerald-500" checked={Boolean(selectedUserDetail.permissions?.consolidated) || String(selectedUserDetail.role || '').includes('ADMIN')} disabled={String(selectedUserDetail.role || '').includes('ADMIN')} onChange={(e) => { const newPerms = { ...(selectedUserDetail.permissions || {}), consolidated: e.target.checked }; setSelectedUserDetail({ ...selectedUserDetail, permissions: newPerms }); onUpdateUserRole(selectedUserDetail.fnum, selectedUserDetail.role, newPerms); }} />
                      <div className="flex-1">
                        <div className="text-sm font-bold text-slate-800 group-hover:text-emerald-700 transition-colors">Consolidated Ledger Access</div>
                        <div className="text-xs text-slate-500 font-medium">Allows viewing the cross-domain master Excel overlays.</div>
                      </div>
                    </label>

                    <label className="flex items-center space-x-3 cursor-pointer group">
                      <input type="checkbox" className="w-4 h-4 text-purple-600 rounded border-gray-300 focus:ring-purple-500" checked={Boolean(selectedUserDetail.permissions?.export_data) || ['RPC', 'Deputy Commander'].includes(selectedUserDetail.role) || String(selectedUserDetail.role || '').includes('ADMIN')} disabled={['RPC', 'Deputy Commander'].includes(selectedUserDetail.role) || String(selectedUserDetail.role || '').includes('ADMIN')} onChange={(e) => { const newPerms = { ...(selectedUserDetail.permissions || {}), export_data: e.target.checked }; setSelectedUserDetail({ ...selectedUserDetail, permissions: newPerms }); onUpdateUserRole(selectedUserDetail.fnum, selectedUserDetail.role, newPerms); }} />
                      <div className="flex-1">
                        <div className="text-sm font-bold text-slate-800 group-hover:text-purple-700 transition-colors">Database Export Privilege</div>
                        <div className="text-xs text-slate-500 font-medium">Allows downloading raw .xlsx database files to local device.</div>
                      </div>
                    </label>

                    <label className="flex items-center space-x-3 cursor-pointer group">
                      <input type="checkbox" className="w-4 h-4 text-orange-600 rounded border-gray-300 focus:ring-orange-500" checked={Boolean(selectedUserDetail.permissions?.view_global_roster) || ['SUPER_ADMIN'].includes(selectedUserDetail.role) || ['KMP HEADQUARTERS', 'POLICE HEADQUARTERS'].includes(selectedUserDetail.region)} disabled={['SUPER_ADMIN'].includes(selectedUserDetail.role) || ['KMP HEADQUARTERS', 'POLICE HEADQUARTERS'].includes(selectedUserDetail.region)} onChange={(e) => { const newPerms = { ...(selectedUserDetail.permissions || {}), view_global_roster: e.target.checked }; setSelectedUserDetail({ ...selectedUserDetail, permissions: newPerms }); onUpdateUserRole(selectedUserDetail.fnum, selectedUserDetail.role, newPerms); }} />
                      <div className="flex-1">
                        <div className="text-sm font-bold text-slate-800 group-hover:text-orange-700 transition-colors">Global Roster Visibility</div>
                        <div className="text-xs text-slate-500 font-medium">Allows viewing personnel from ALL regions in the System Roster.</div>
                      </div>
                    </label>
                  </div>

                  {currentUser.role === 'SUPER_ADMIN' && (
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
              <button 
                onClick={() => setSelectedUserDetail(null)} 
                className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold text-xs py-2 px-4 rounded-lg shadow-sm transition-colors flex items-center border border-gray-300"
              >
                <X size={14} className="mr-1"/> Close Profile
              </button>
              
              {selectedUserDetail.isSystemUser && (
                currentUser.role === 'SUPER_ADMIN' || 
                (currentUser.role?.includes('ADMIN') && selectedUserDetail.role !== 'SUPER_ADMIN' && currentUser.region === selectedUserDetail.region)
              ) && (
                <button 
                  onClick={() => {
                     if (window.confirm(`Are you absolutely sure you want to revoke all system access for ${selectedUserDetail.name}?`)) {
                        onRevokeUser(selectedUserDetail.fnum);
                        setSelectedUserDetail(null);
                     }
                  }} 
                  className="text-xs font-bold text-red-600 hover:text-white hover:bg-red-600 py-2 px-4 rounded-lg transition-colors border border-red-200 shadow-sm"
                >
                  Revoke Access
                </button>
              )}
            </div>

          </div>
        </div>
      )}

      {viewingProfileImage && (
        <div className="fixed inset-0 bg-black/90 z-[300] flex justify-center items-center p-4 animate-in fade-in" onClick={() => setViewingProfileImage(null)}>
          <button className="absolute top-6 right-6 text-white hover:text-red-500 transition-colors bg-white/10 p-2 rounded-full shadow-lg">
            <X size={24}/>
          </button>
          <img 
            src={viewingProfileImage} 
            alt="Full Profile" 
            className="max-w-full max-h-[90vh] object-contain rounded-xl shadow-2xl border-2 border-slate-700" 
            onClick={(e) => e.stopPropagation()} 
          />
        </div>
      )}

    </div>
  );
};

const App = () => {
  const [currentUser, setCurrentUser] = usePersistentState('kmp_currentUser', null);
  const [currentPage, setCurrentPage] = usePersistentState('kmp_currentPage', 'home');
  const [isInitializing, setIsInitializing] = useState(true);

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
    
    // Periodically check and sync if online
    const syncInterval = setInterval(() => {
      if (navigator.onLine) {
        handleOnlineStatus();
      }
    }, 30000); // Checks every 30 seconds

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
          if (resReports.ok) setReports(await resReports.json());
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
      } catch (error) { if (error.name !== 'AbortError') console.error(error); } 
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
      case 'home': return <HomeDashboard currentUser={currentUser} setCurrentPage={handlePageChange} onMasterExport={handleMasterExport} onViewConsolidated={handleViewConsolidated} adminCommsData={adminCommsData} onAcknowledgeComm={handleAcknowledgeComm} />;
      case 'reports': return <CrimeIncidentRegistry currentUser={currentUser} reports={reports} setReports={setReports} />;
      case 'statistics': return <Statistics currentUser={currentUser} stats={stats} setStats={setStats} />;
      case 'success': return <SuccessStories currentUser={currentUser} stories={stories} setStories={setStories} />;
      case 'establishments': return <Establishments currentUser={currentUser} establishments={establishments} setEstablishments={setEstablishments} />;
      case 'nominal-roll': return <Nominal_Roll currentUser={currentUser} Nominal_Rolls={Nominal_Rolls} setNominal_Rolls={setNominal_Rolls} Nominal_Roll_archives={Nominal_Roll_archives} setNominal_Roll_archives={setNominal_Roll_archives} />; 
      case 'approvals': return ['ADMIN', 'SUPER_ADMIN', 'RPC', 'Deputy Commander'].includes(currentUser.role) ? <AdminApprovals pendingUsers={pendingUsers} setPendingUsers={setPendingUsers} users={users} setUsers={setUsers} currentUser={currentUser} /> : <HomeDashboard currentUser={currentUser} setCurrentPage={handlePageChange} onMasterExport={handleMasterExport} onViewConsolidated={handleViewConsolidated} adminCommsData={adminCommsData} onAcknowledgeComm={handleAcknowledgeComm} />;
      case 'profile': return <AdminProfile currentUser={currentUser} setCurrentUser={setCurrentUser} setCurrentPage={handlePageChange} />;
case 'Admin_Communication': return <Admin_Communication currentUser={currentUser} users={users} setCurrentPage={handlePageChange} />;
      default: return <HomeDashboard currentUser={currentUser} setCurrentPage={handlePageChange} onMasterExport={handleMasterExport} onViewConsolidated={handleViewConsolidated} adminCommsData={adminCommsData} onAcknowledgeComm={handleAcknowledgeComm} />;
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

  if (currentUser && !currentUser.region) {
    localStorage.removeItem('kmp_currentUser'); localStorage.removeItem('kmp_authToken');
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50">
        <h2 className="text-2xl font-bold text-red-600 mb-2">Ghost Session Detected</h2>
        <p className="text-slate-600 mb-6">Corrupted local data is blocking the dashboard. Click below to wipe it.</p>
        <button onClick={() => window.location.reload()} className="px-6 py-3 bg-blue-700 text-white font-bold rounded-lg shadow-md hover:bg-blue-800">Force Clear & Restart App</button>
      </div>
    );
  }

 if (!currentUser) return <LoginScreen 
    onLogin={(user) => {
      localStorage.removeItem('kmp_currentPage'); setCurrentPage('home'); setCurrentUser(user);
      const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
      fetch(`${API_URL}/api/v1/system/log-session`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fnum: user.fnum }) }).catch(e => console.error(e));
    }} 
    onForgot={() => {}} onSignup={(u) => setPendingUsers([...pendingUsers, u])} pendingUsers={pendingUsers} activeUsers={users} 
  />;

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

  return (
    <>
      <DashboardLayout 
        currentUser={currentUser} currentPage={currentPage} setCurrentPage={handlePageChange} 
        onLogout={() => { localStorage.removeItem('kmp_authToken'); localStorage.removeItem('kmp_currentUser'); localStorage.removeItem('kmp_currentPage'); window.location.reload(); }}
        onUpdateUserRole={handleUpdateUserRole} onRevokeUser={handleRevokeUser} users={users} Admin_Communication={adminCommsData}
        onViewConsolidated={handleViewConsolidated} onViewHRReport={handleViewHRReport} onGenerateHRReport={handleGenerateHRReport}
      >
        {isViewingConsolidated && <ConsolidatedLedger data={consolidatedData} reports={reports} stats={stats} stories={stories} onClose={() => setIsViewingConsolidated(false)} />}
        {isViewingHR && hrLedgerData && <HrEstablishmentsLedger data={hrLedgerData} onClose={() => setIsViewingHR(false)} currentUser={currentUser} onUploadSuccess={() => window.location.reload()} />}
        <div className={(isViewingConsolidated || isViewingHR) ? 'hidden' : 'block w-full h-full'}>
          {renderPage()}
        </div>
      </DashboardLayout>

      {/* 🟢 MOVED OUTSIDE of DashboardLayout to guarantee TRUE full-screen over everything */}
      <WorkspaceSecurityCurtain />
    </>
  );
};

export default App;