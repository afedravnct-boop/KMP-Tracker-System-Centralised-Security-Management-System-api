import React, { useState, useMemo, useEffect } from 'react';
import { authFetch } from './api';
import { 
  LayoutDashboard, BarChart3, Trophy, UserPlus, LogOut, Menu, 
  Search, PlusCircle, Edit, Download, Shield, CheckCircle, 
  Award, Maximize2, Minimize2, Activity, User, Lock, 
  AlertTriangle, RadioReceiver, Eye, X, Building, Image, 
  Camera, Users, Home, Unlock, Send, Archive, PieChart,
  Bell, MessageSquare
} from 'lucide-react';
import * as XLSX from 'xlsx';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import CommandLedger from './CommandLedger';
import ConsolidatedLedger from './ConsolidatedLedger';
import HrEstablishmentsLedger from './HrEstablishmentsLedger';
import Admin_Communication from './Admin_Communication';


const REGIONAL_HIERARCHY = {
  "KMP NORTH": ["KAWEMPE", "KAKIRI", "KASANGATI", "MATUGGA", "NANSANA", "OLD KAMPALA", "WAKISO", "WANDEGEYA"],
  "KMP EAST": ["JINJA ROAD", "KIRA", "KIRA ROAD", "MUKONO", "NAGGALAMA", "SEETA"],
  "KMP SOUTH": ["NATEETE", "CPS KAMPALA", "ENTEBBE", "KABALAGALA", "KAJJANSI", "KASENYI", "KATWE", "KYENGERA", "NSANGI"],
  "KMP HEADQUARTERS": ["KMP HEADQUARTERS", "FLYING SQUAD", "CRIME INTELLIGENCE", "KMP Headquarters", "KAWEMPE", "KAKIRI", "KASANGATI", "MATUGGA", "NANSANA", "OLD KAMPALA", "WAKISO", "WANDEGEYA", "JINJA ROAD", "KIRA", "KIRA ROAD", "MUKONO", "NAGGALAMA", "SEETA", "NATEETE", "CPS KAMPALA", "ENTEBBE", "KABALAGALA", "KAJJANSI", "KASENYI", "KATWE", "KYENGERA", "NSANGI"],
  "POLICE HEADQUARTERS": ["NAGURU", "KMP HEADQUARTERS", "FLYING SQUAD", "CRIME INTELLIGENCE", "KMP Headquarters", "KAWEMPE", "KAKIRI", "KASANGATI", "MATUGGA", "NANSANA", "OLD KAMPALA", "WAKISO", "WANDEGEYA", "JINJA ROAD", "KIRA", "KIRA ROAD", "MUKONO", "NAGGALAMA", "SEETA", "NATEETE", "CPS KAMPALA", "ENTEBBE", "KABALAGALA", "KAJJANSI", "KASENYI", "KATWE", "KYENGERA", "NSANGI"]
};

const autoCapitalize = (text) => {
  if (!text) return text;
  // Capitalizes start of input, after a full stop, or immediately after an HTML tag like <p>
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
    "999 ERU Regional Data Officer", "KMP SFC Coordinator"
  ],
  RPC: [
    "KMP South Commander", "KMP North Commander", "KMP East Commander", "Deputy Commander KMP south", "Deputy Commander KMP North", "Deputy Commander KMP East"
  ]
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
      console.log("Starting secure download:", url);
      const response = await authFetch(url);
      
      if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.detail || `Server Error ${response.status}`);
      }

      // Check if we actually got a file
      const blob = await response.blob();
      console.log("Blob received. Size:", blob.size, "bytes");

      if (blob.size === 0) {
          throw new Error("Received empty file (0 bytes). Check the backend.");
      }

      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = filename;
      
      // Make sure the link is in the DOM before clicking
      document.body.appendChild(link);
      link.click();
      
      // Cleanup
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);
      
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


const HomeDashboard = ({ currentUser, setCurrentPage, onMasterExport, onViewConsolidated, Admin_Communication }) => {
  const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(currentUser.role);
  const isRPC = ['ADMIN', 'SUPER_ADMIN', 'RPC'].includes(currentUser.role);
  
  // Specific permission checks
  const canViewConsolidated = isAdmin || currentUser.permissions?.consolidated;
  const canExportData = isRPC || currentUser.permissions?.export_data;

  // --- COMPLIANCE CHECK LOGIC ---
  const today = new Date().getDay();
  const isEndOfWeek = today === 5 || today === 6 || today === 0;
  const hasSubmittedThisWeek = false; 
  const showComplianceWarning = isEndOfWeek && !hasSubmittedThisWeek && !isAdmin;

  const relevantComms = (Admin_Communication || []).filter(c => {
    if (c.target_audience === 'ALL_USERS') return true;
    if (c.target_audience === 'ADMINS_ONLY' && isAdmin) return true;
    if (c.target_audience === 'RPC_ONLY' && isRPC) return true;
    if (c.target_audience === 'SPECIFIC_REGION' && c.target_region === currentUser.region) return true;
    return false;
  }).slice(0, 5);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8 relative z-10 animate-in fade-in duration-300">
      
      {/* COMPLIANCE WARNING BANNER */}
      {showComplianceWarning && (
        <div className="bg-red-600 text-white font-extrabold p-4 rounded-xl shadow-lg flex flex-col md:flex-row items-center justify-between animate-pulse border-2 border-red-400">
          <div className="flex items-center text-sm mb-3 md:mb-0">
            <AlertTriangle className="mr-3 w-6 h-6 shrink-0 text-yellow-300" />
            <span>COMPLIANCE ALERT: Your weekly Disruptive OPS Statistics are overdue. Please submit them immediately.</span>
          </div>
          <button onClick={() => setCurrentPage('statistics')} className="bg-white text-red-700 px-4 py-2 rounded font-bold shadow text-xs hover:bg-gray-100 transition shrink-0 whitespace-nowrap">
            Go to Statistics
          </button>
        </div>
      )}

      {/* HEADERS */}
      <div className="text-center flex flex-col items-center mt-4">
        <img src="/upf_badge.png" alt="UPF Logo" className="w-24 h-24 mb-1 object-contain drop-shadow-md" />
        <h1 className="text-3xl font-bold text-gray-900 tracking-wide">UGANDA POLICE FORCE</h1>
        <h2 className="text-lg font-bold text-slate-600 mt-1 uppercase tracking-wide">KAMPALA METROPOLITAN POLICE HEADQUARTERS</h2>
        <h3 className="text-sm font-bold text-blue-600 mt-3 uppercase tracking-widest bg-blue-50 px-4 py-1 rounded-full border border-blue-200">Centralised Security Data Management System</h3>
      </div>

      {/* 1. WELCOME BANNER */}
      <div className="w-full">
        <h3 className="text-center text-sm font-bold text-slate-600 bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
           Welcome, <span className="text-blue-700">{currentUser.rank} {currentUser.name}</span>. Select an operational module.
        </h3>   
      </div>

      {/* 2. ADMIN COMMUNICATION PANEL */}
      <div className="w-full">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
          <div className="bg-slate-900 text-white px-4 py-3 flex justify-between items-center shrink-0">
            <h3 className="font-bold text-sm flex items-center tracking-wider"><Bell size={16} className="mr-2 text-yellow-400 animate-pulse"/> Administrative Communication</h3>
          </div>
          
          <div className="p-0 overflow-y-auto max-h-[300px] custom-scrollbar bg-slate-50 flex-1">
            {relevantComms.length === 0 ? (
              <div className="p-6 text-center text-xs font-bold text-slate-400 uppercase">No active directives at this time.</div>
            ) : (
              <div className="divide-y divide-slate-200">
                {relevantComms.map((comm) => (
                  <div key={comm.id} className={`p-4 transition-colors hover:bg-white ${
                    comm.message_type === 'CRITICAL_ALERT' ? 'border-l-4 border-l-red-500 bg-red-50/30' : 
                    comm.message_type === 'ASSIGNMENT' ? 'border-l-4 border-l-yellow-500 bg-yellow-50/30' : 
                    'border-l-4 border-l-blue-500 bg-blue-50/30'
                  }`}>
                    <div className="flex justify-between items-start mb-1">
                      <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-sm uppercase tracking-wider ${
                        comm.message_type === 'CRITICAL_ALERT' ? 'bg-red-100 text-red-700' : 
                        comm.message_type === 'ASSIGNMENT' ? 'bg-yellow-100 text-yellow-700' : 
                        'bg-blue-100 text-blue-700'
                      }`}>{comm.message_type.replace('_', ' ')}</span>
                      <span className="text-[10px] font-bold text-slate-400">{new Date(comm.created_at).toLocaleDateString()}</span>
                    </div>
                    <h4 className="text-sm font-extrabold text-slate-800 leading-tight mb-2 mt-2">{comm.subject}</h4>
                    <div className="text-xs text-slate-600 font-medium line-clamp-3 ql-editor p-0" dangerouslySetInnerHTML={{ __html: comm.message }} />
                    <div className="mt-3 text-[9px] font-bold text-slate-400 uppercase">Dispatched by: {comm.sender_name}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {isAdmin && (
             <div className="bg-white p-1 border-t border-slate-200 shrink-0">
               <button onClick={() => setCurrentPage('Admin_Communication')} className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs py-3 rounded-lg transition-colors flex items-center justify-center">
                 <MessageSquare size={14} className="mr-2"/> Open Dispatch Console
               </button>
             </div>
          )}
        </div>
      </div>

      {/* 3. OPERATIONAL MENUS GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 w-full">
          <div onClick={() => setCurrentPage('reports')} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex items-center cursor-pointer transition-all hover:shadow-lg hover:-translate-y-1 hover:border-blue-300 group">
            <div className="w-14 h-14 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mr-4 group-hover:bg-blue-600 group-hover:text-white transition-colors shrink-0"><LayoutDashboard size={24} /></div>
            <div><h3 className="text-sm font-extrabold text-slate-900 leading-tight">Crime Registry</h3><p className="text-[11px] text-slate-500 font-medium mt-1">Log and track daily active incidents.</p></div>
          </div>
          
          <div onClick={() => setCurrentPage('statistics')} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex items-center cursor-pointer transition-all hover:shadow-lg hover:-translate-y-1 hover:border-blue-300 group">
            <div className="w-14 h-14 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center mr-4 group-hover:bg-indigo-600 group-hover:text-white transition-colors shrink-0"><BarChart3 size={24} /></div>
            <div><h3 className="text-sm font-extrabold text-slate-900 leading-tight">OPS Statistics</h3><p className="text-[11px] text-slate-500 font-medium mt-1">Weekly numerical operational aggregates.</p></div>
          </div>

          <div onClick={() => setCurrentPage('success')} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex items-center cursor-pointer transition-all hover:shadow-lg hover:-translate-y-1 hover:border-yellow-400 group">
            <div className="w-14 h-14 rounded-full bg-yellow-50 text-yellow-600 flex items-center justify-center mr-4 group-hover:bg-yellow-500 group-hover:text-white transition-colors shrink-0"><Trophy size={24} /></div>
            <div><h3 className="text-sm font-extrabold text-slate-900 leading-tight">Success Stories</h3><p className="text-[11px] text-slate-500 font-medium mt-1">Document tactical milestones.</p></div>
          </div>

          <div onClick={() => setCurrentPage('establishments')} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex items-center cursor-pointer transition-all hover:shadow-lg hover:-translate-y-1 hover:border-emerald-300 group">
            <div className="w-14 h-14 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mr-4 group-hover:bg-emerald-600 group-hover:text-white transition-colors shrink-0"><Building size={24} /></div>
            <div><h3 className="text-sm font-extrabold text-slate-900 leading-tight">Establishments</h3><p className="text-[11px] text-slate-500 font-medium mt-1">Map divisions, stations, and booths.</p></div>
          </div>

          <div onClick={() => setCurrentPage('nominal-roll')} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex items-center cursor-pointer transition-all hover:shadow-lg hover:-translate-y-1 hover:border-purple-300 group">
            <div className="w-14 h-14 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center mr-4 group-hover:bg-purple-600 group-hover:text-white transition-colors shrink-0"><Users size={24} /></div>
            <div><h3 className="text-sm font-extrabold text-slate-900 leading-tight">Master Nominal Roll</h3><p className="text-[11px] text-slate-500 font-medium mt-1">Personnel deployment registry.</p></div>
          </div>

          {isAdmin && (
            <div onClick={() => setCurrentPage('approvals')} className="bg-slate-900 rounded-xl shadow-sm border border-slate-700 p-6 flex items-center cursor-pointer transition-all hover:shadow-lg hover:-translate-y-1 hover:border-slate-500 group">
              <div className="w-14 h-14 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center mr-4 group-hover:bg-slate-700 group-hover:text-white transition-colors shrink-0"><UserPlus size={24} /></div>
              <div><h3 className="text-sm font-extrabold text-white leading-tight">Access Approvals</h3><p className="text-[11px] text-slate-400 font-medium mt-1">Review system logs and pending signups.</p></div>
            </div>
          )}
          
          {canViewConsolidated && (
            <div onClick={onViewConsolidated} className="bg-slate-900 rounded-xl shadow-sm border border-slate-700 p-6 flex items-center cursor-pointer transition-all hover:shadow-lg hover:-translate-y-1 hover:border-slate-500 group md:col-span-2 lg:col-span-3">
              <div className="w-14 h-14 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center mr-4 group-hover:bg-slate-700 group-hover:text-white transition-colors shrink-0"><Eye size={24} /></div>
              <div><h3 className="text-sm font-extrabold text-white leading-tight">Consolidated Entries</h3><p className="text-[11px] text-slate-400 font-medium mt-1">Cross-domain master visualization.</p></div>
            </div>
          )}

          {canExportData && (
            <div onClick={() => onMasterExport('all', 'all')} className="bg-blue-900 rounded-xl shadow-sm border border-blue-800 p-6 flex items-center cursor-pointer transition-all hover:shadow-lg hover:-translate-y-1 hover:border-blue-400 group md:col-span-2 lg:col-span-3">
              <div className="w-14 h-14 rounded-full bg-blue-800 text-blue-200 flex items-center justify-center mr-4 group-hover:bg-blue-700 group-hover:text-white transition-colors shrink-0"><Download size={24} /></div>
              <div><h3 className="text-sm font-extrabold text-white leading-tight">Download Master Database</h3><p className="text-[11px] text-blue-200 font-medium mt-1">Export full encrypted .xlsx ledger.</p></div>
            </div>
          )}
      </div>
    </div>
  );
};

const CrimeIncidentRegistry = ({ currentUser, reports, setReports, setSidebarOpen }) => {
  const [operation, setOperation] = useState('new');
  const [notification, setNotification] = useState(null);

  const [filterRegion, setFilterRegion] = useState(['ADMIN', 'SUPER_ADMIN'].includes(currentUser.role) ? 'ALL REGIONS' : currentUser.region);
  const [filterStation, setFilterStation] = useState('ALL STATIONS');
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState('ALL TIME');
  const [updateSearch, setUpdateSearch] = useState('');

  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  const [showLockup, setShowLockup] = useState(false);
  const [newSuspect, setNewSuspect] = useState({ name: '', sex: 'MALE', age: '', tribe: '', residence: '', contact: '', mentalhealthstatus: '' });

  const handleSmartExport = (scope, value) => {
    let url = `http://127.0.0.1:8000/api/v1/reports/export?timeframe=all`;
    if (scope && value) {
        url += `&scope=${scope}&value=${encodeURIComponent(value)}`;
    }
    window.open(url, '_blank');
  };

  const getTodayString = () => new Date().toLocaleDateString('en-CA').split(',')[0].replace(/\//g, '-');

  const [formData, setFormData] = useState({
    sn: null,
    sd_ref: '',
    region: currentUser.region,
    station: currentUser.station || REGIONAL_HIERARCHY[currentUser?.region]?.[0] || '',
    date: getTodayString(),
    time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }).replace(':', '') + 'Hrs',
    offence: '', 
    customOffence: '',
    narrative: '',
    status: 'ACTIVE INVESTIGATION',
    suspectDetails: [],
    updateText: ''
  });

  const filteredReports = useMemo(() => {
    return reports.filter(r => {
      if (filterRegion !== 'ALL REGIONS' && r.region !== filterRegion) return false;
      if (filterStation !== 'ALL STATIONS' && r.station !== filterStation) return false;
      if (searchQuery && !r.narrative.toLowerCase().includes(searchQuery.toLowerCase()) && 
          !r.station.toLowerCase().includes(searchQuery.toLowerCase()) && 
          !(r.sdRef || r.sd_ref || '').toLowerCase().includes(searchQuery.toLowerCase())) return false;
      
      if (dateFilter === 'TODAY') {
        const todayStr = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0];
        if (r.date !== todayStr) return false;
      } else if (dateFilter === 'LAST 7 DAYS') {
        const repDate = new Date(r.date);
        const today = new Date();
        const diffDays = Math.ceil(Math.abs(today - repDate) / (1000 * 60 * 60 * 24));
        if (diffDays > 7) return false;
      } else if (dateFilter === 'CUSTOM') {
        // 🚨 NEW: Checks the start and end dates
        if (customStartDate && r.date < customStartDate) return false;
        if (customEndDate && r.date > customEndDate) return false;
      }
      
        
      return true;
    });
  }, [reports, filterRegion, filterStation, searchQuery, dateFilter, customStartDate, customEndDate]);

  const availableUpdateCases = useMemo(() => {
    return reports.filter(r => {
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
    const autoCapitalize = (text) => {
      if (!text) return text;
      return text.replace(
        /(^\s*[a-z]|[\.\!\?\)]\s+[a-z]|\n\s*(?:[0-9]+[\.\)]\s*|[\-\*]\s*)?[a-z])/g, 
        match => match.toUpperCase()
      );
    };

    if (name === 'region') {
      setFormData({ ...formData, region: value, station: REGIONAL_HIERARCHY[value][0] });
    } else if (name === 'narrative' || name === 'updateText' || name === 'customOffence') {
      setFormData({ ...formData, [name]: autoCapitalize(value) });
    } else {
      setFormData({ ...formData, [name]: type === 'number' ? parseInt(value) || 0 : value });
    }
  };

  const populateUpdateForm = (caseData) => {
    setFormData({ 
      ...caseData, 
      sd_ref: caseData.sdRef || caseData.sd_ref, 
      offence: caseData.offence || 'Other',
      customOffence: '',
      suspectDetails: [],
      updateText: '' 
    });
  };

  const handleAddSuspect = () => {
    if (!newSuspect.name.trim()) return alert("Suspect name is required.");
    setFormData({
      ...formData,
      suspectDetails: [...formData.suspectDetails, { ...newSuspect, id: Date.now() }]
    });
    setNewSuspect({ name: '', sex: 'MALE', age: '', tribe: '', residence: '', contact: '', mentalhealthstatus: '' });
  };

  const handleRemoveSuspect = (id) => {
    setFormData({
      ...formData,
      suspectDetails: formData.suspectDetails.filter(s => s.id !== id)
    });
  };

const handleFormSubmit = async (e) => { // <-- Added 'async'
    e.preventDefault();

    // 1. Grab the exact security token
    const token = localStorage.getItem('kmp_authToken');
    if (!token) {
        setNotification("Error: Security token missing. Please log out and log back in.");
        return;
    }
    
    if (operation === 'new') {
      const isDuplicate = reports.some(r => 
        (r.sd_ref || r.sdRef || '').trim().toLowerCase() === formData.sd_ref.trim().toLowerCase() || 
        r.narrative.trim().toLowerCase() === formData.narrative.trim().toLowerCase()
      );

      if (isDuplicate) {
        setNotification("Error: This SD Reference or identical report narrative has already been entered into the system.");
        return;
      }

      const exactNextSN = reports.length > 0 ? Math.max(...reports.map(r => r.sn)) + 1 : 1;
      const finalOffence = formData.offence === 'Other' ? formData.customOffence : formData.offence;
      
      const apiPayload = {
        sn: exactNextSN,
        sd_ref: formData.sd_ref, 
        region: formData.region,
        station: formData.station,
        date: formData.date,
        time: formData.time,
        offence: finalOffence,
        narrative: formData.narrative,
        status: formData.status,
        suspects: formData.suspectDetails.length, 
        last_updated_by: `${currentUser.name} (${currentUser.fnum})`, 
        suspectDetails: formData.suspectDetails
      };
      
      try {
        // 2. Direct fetch to ensure the token and data penetrate the backend perfectly
        const response = await fetch("http://127.0.0.1:8000/api/v1/reports", {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}` 
          },
          body: JSON.stringify(apiPayload)
        });
        
        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.detail || "Neon Database rejected the entry.");
        }
        
        // 3. ONLY update the screen if the database confirms the save!
        const newReportLocal = { ...apiPayload };
        setReports([newReportLocal, ...reports]);
        setNotification(`Case SN ${newReportLocal.sn} (Ref: ${newReportLocal.sd_ref}) successfully registered!`);

        // Smart Wipe
        setFormData({ 
          ...formData, 
          sd_ref: '', 
          time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }).replace(':', '') + 'Hrs', 
          offence: '', 
          customOffence: '', 
          narrative: '', 
          suspectDetails: [], 
          sn: null, 
          updateText: '' 
        });

      } catch (err) {
        console.error("Save Error:", err);
        setNotification(`❌ Error: ${err.message}`);
      }
      
    } else if (operation === 'update') {
      if (!formData.sn) {
        setNotification("Error: Please select a case from the list to update first.");
        return;
      }

     let updatedNarrative = formData.updateText 
        ? `${formData.narrative}<br/><br/><strong>[UPDATE ${new Date().toLocaleString('sv-SE', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', '')}]:</strong><br/>${formData.updateText}` 
        : formData.narrative;
        
      const updatedRecord = { 
        ...formData, 
        narrative: updatedNarrative,
        sd_ref: formData.sd_ref, 
        suspects: (formData.suspects || 0) + formData.suspectDetails.length,
        last_updated_by: `${currentUser.name} (${currentUser.fnum})`, 
        suspectDetails: formData.suspectDetails
      };
      delete updatedRecord.updateText;
      
      try {
        const response = await fetch(`http://127.0.0.1:8000/api/v1/reports/${formData.sn}`, {
          method: "PUT",
          headers: { 
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}` 
          },
          body: JSON.stringify(updatedRecord)
        });

        if (!response.ok) throw new Error("Failed to update record in database.");

        const updatedReports = reports.map(r => r.sn === formData.sn ? updatedRecord : r);
        setReports(updatedReports);
        setNotification(`Case SN ${formData.sn} successfully updated!`);
        handleOperationToggle('new');

      } catch (err) {
        console.error("Update Error:", err);
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
                    <label className="block text-[10px] font-bold text-gray-700 mb-1">Full Name *</label>
                    <input type="text" value={newSuspect.name} onChange={e => setNewSuspect({...newSuspect, name: e.target.value})} className="w-full text-sm border-gray-300 rounded border p-2 uppercase focus:ring-red-500" placeholder="e.g. OPIO JOHN"/>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-700 mb-1">Sex</label>
                    <select value={newSuspect.sex} onChange={e => setNewSuspect({...newSuspect, sex: e.target.value})} className="w-full text-sm border-gray-300 rounded border p-2 bg-white">
                      <option>MALE</option><option>FEMALE</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-700 mb-1">Age</label>
                    <input type="number" value={newSuspect.age} onChange={e => setNewSuspect({...newSuspect, age: e.target.value})} className="w-full text-sm border-gray-300 rounded border p-2" placeholder="e.g. 24"/>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-700 mb-1">Tribe/Nationality</label>
                    <input type="text" value={newSuspect.tribe} onChange={e => setNewSuspect({...newSuspect, tribe: e.target.value})} className="w-full text-sm border-gray-300 rounded border p-2 uppercase"/>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-700 mb-1">Contact/Phone</label>
                    <input type="text" value={newSuspect.contact} onChange={e => setNewSuspect({...newSuspect, contact: e.target.value})} className="w-full text-sm border-gray-300 rounded border p-2"/>
                  </div>
                  <div className="md:col-span-3">
                    <label className="block text-[10px] font-bold text-gray-700 mb-1">Residence/Location</label>
                    <input type="text" value={newSuspect.residence} onChange={e => setNewSuspect({...newSuspect, residence: e.target.value})} className="w-full text-sm border-gray-300 rounded border p-2" placeholder="e.g. Bwaise Zone 2"/>
                  </div>
                </div>
                <div className="flex justify-end">
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
                          <div className="text-[11px] text-slate-500 font-medium mt-1">
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
        <img src="/upf_badge.png" alt="UPF Logo" className="w-16 h-16 mb-3 object-contain" onError={(e) => { e.target.style.display = 'none'; }} />
        <h1 className="text-4xl text-red-500 mt-1 font-bold">Crime/Incident Registry</h1>
        <h2 className="text-xl text-red-300 mt-1 font-medium">Centralised Crime/Incident Compilation</h2>
      </div>

      <div className="bg-white/80 backdrop-blur p-4 rounded-xl border border-slate-200 shadow-sm relative">
        <div className="absolute top-4 right-4 z-10">
          <select value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className="border-2 border-blue-500 text-blue-700 font-bold rounded-lg px-3 py-1 text-xs shadow-sm bg-white outline-none">
            <option value="ALL TIME">ALL TIME</option>
            <option value="TODAY">TODAY ONLY</option>
            <option value="LAST 7 DAYS">LAST 7 DAYS</option>
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
              <h3 className="text-white font-semibold flex items-center">
                <Shield className="w-5 h-5 mr-2 text-blue-400" /> ⚙️ File Controls
              </h3>
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
                  <input type="text" placeholder="Search by SD Ref, SN, or Narrative..." value={updateSearch} onChange={e => setUpdateSearch(e.target.value)} className="w-full text-sm p-2 mb-2 border border-blue-200 rounded outline-none focus:ring-2 focus:ring-blue-400" />
                  <div className="max-h-40 overflow-y-auto bg-white border border-blue-100 rounded custom-scrollbar">
                    {availableUpdateCases.length === 0 ? (
                      <div className="p-3 text-xs text-gray-500 text-center">No cases found matching your search.</div>
                    ) : (
                      availableUpdateCases.map(c => (
                        <div key={c.sn} onClick={() => populateUpdateForm(c)} className={`p-2 text-xs border-b cursor-pointer transition-colors ${formData.sn === c.sn ? 'bg-blue-600 text-white font-bold' : 'hover:bg-blue-50 text-gray-700'}`}>
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
                    <label className="block text-xs font-bold text-gray-700 mb-1">SD/GEF/DEF Reference *</label>
                    <input type="text" name="sd_ref" value={formData.sd_ref} onChange={handleInputChange} disabled={operation === 'update'} required className="w-full text-sm border-gray-300 rounded-md shadow-sm border p-2 focus:ring-blue-500 font-bold text-blue-700 disabled:bg-gray-100 disabled:text-gray-500" placeholder="e.g. SD 04/27/06/2026" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Select Region *</label>
                    <select name="region" value={formData.region} onChange={handleInputChange} disabled={!['ADMIN', 'SUPER_ADMIN'].includes(currentUser.role) || operation === 'update'} required className="w-full text-sm border-gray-300 rounded-md shadow-sm bg-gray-50 border p-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500">
                      {['ADMIN', 'SUPER_ADMIN'].includes(currentUser.role) ? (
                        Object.keys(REGIONAL_HIERARCHY).map(reg => <option key={reg} value={reg}>{reg}</option>)
                      ) : (
                        <option value={currentUser.region}>{currentUser.region}</option>
                      )}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Station *</label>
                    <select name="station" value={formData.station} onChange={handleInputChange} disabled={operation === 'update'} required className="w-full text-sm border-gray-300 rounded-md shadow-sm bg-gray-50 border p-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500">
                      {(REGIONAL_HIERARCHY[formData.region] || []).map(stat => <option key={stat} value={stat}>{stat}</option>)}
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
                    <option value="Murder">Murder</option>
                    <option value="Aggravated Robbery">Aggravated Robbery</option>
                    <option value="Theft">Theft</option>
                    <option value="Assault">Assault</option>
                    <option value="Burglary">Burglary</option>
                    <option value="Defilement / Rape">Defilement / Rape</option>
                    <option value="Traffic Accident (Fatal)">Traffic Accident (Fatal)</option>
                    <option value="Traffic Accident (Minor)">Traffic Accident (Minor)</option>
                    <option value="Fraud / Forgery">Fraud / Forgery</option>
                    <option value="Drug Offenses">Drug Offenses</option>
                    <option value="Other">Other (Specify Below)</option>
                  </select>
                  {formData.offence === 'Other' && operation === 'new' && (
                    <input type="text" name="customOffence" required value={formData.customOffence} onChange={handleInputChange} placeholder="Type the specific offence here..." className="mt-2 w-full text-sm border-blue-400 rounded-md shadow-sm border p-2 focus:ring-blue-500 bg-blue-50" />
                  )}
                </div>

                <div className="pb-8"> 
                  <label className="block text-xs font-bold text-gray-700 mb-1">{operation === 'update' ? 'Original Incident Narrative (Read-Only)' : 'Incident Narrative'}</label>
                  <ReactQuill 
                    theme="snow" 
                    value={formData.narrative} 
                    onChange={(content) => setFormData({ ...formData, narrative: autoCapitalize(content) })}
                    readOnly={operation === 'update'}
                    className={`bg-white rounded-md ${operation === 'update' ? 'opacity-70 grayscale pointer-events-none' : ''}`}
                    modules={{
                      toolbar: [
                        ['bold', 'italic', 'underline'], 
                        [{ 'list': 'ordered'}, { 'list': 'bullet' }], 
                        ['clean'] 
                      ]
                    }}
                  />
                </div>

                {operation === 'update' && (
                  <div className="pb-8 mt-4"> 
                    <label className="block text-xs font-bold text-blue-700 mb-1">Append New Update / Action Taken *</label>
                    <ReactQuill 
                      theme="snow" 
                      value={formData.updateText || ''} 
                      onChange={(content) => setFormData({ ...formData, updateText: autoCapitalize(content) })}
                      className="bg-white rounded-md border-blue-300"
                      placeholder="Enter new developments here. Use the toolbar for numbering..."
                      modules={{
                        toolbar: [
                          ['bold', 'italic', 'underline'],
                          [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                          ['clean']
                        ]
                      }}
                    />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Status</label>
                    <select name="status" value={formData.status} onChange={handleInputChange} className="w-full text-sm border-gray-300 rounded-md shadow-sm bg-gray-50 border p-2">
                      <option>ACTIVE INVESTIGATION</option>
                      <option>FORWARDED TO COURT</option>
                      <option>CLOSED / CONVICTED</option>
                      <option>ADR</option>
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

        <div className="lg:col-span-7 space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input type="text" placeholder="Search SD Ref, narrative or station..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-9 pr-4 py-2 border rounded-lg text-sm shadow-sm outline-none focus:border-blue-500" />
            </div>
            <select value={filterRegion} onChange={(e) => { setFilterRegion(e.target.value); setFilterStation('ALL STATIONS'); }} disabled={!['ADMIN', 'SUPER_ADMIN'].includes(currentUser.role)} className="border rounded-lg px-3 py-2 text-sm shadow-sm bg-white">
              {['ADMIN', 'SUPER_ADMIN'].includes(currentUser.role) && <option value="ALL REGIONS">ALL REGIONS</option>}
              {['ADMIN', 'SUPER_ADMIN'].includes(currentUser.role) ? (
                Object.keys(REGIONAL_HIERARCHY).map(reg => <option key={reg} value={reg}>{reg}</option>)
              ) : (
                <option value={currentUser.region}>{currentUser.region}</option>
              )}
            </select>
            <select value={filterStation} onChange={(e) => setFilterStation(e.target.value)} className="border rounded-lg px-3 py-2 text-sm shadow-sm bg-white">
              <option value="ALL STATIONS">ALL STATIONS</option>
              {filterRegion !== 'ALL REGIONS' && REGIONAL_HIERARCHY[filterRegion]?.map(stat => <option key={stat} value={stat}>{stat}</option>)}
            </select>
          </div>

          <ExpandableTableCard 
            title="Crime/Incident Registry Ledger"
            onToggle={(expanded) => {
              if (setSidebarOpen) {
                setSidebarOpen(!expanded); 
              }
            }}
          >
            <div className="overflow-x-auto w-full">
              <table className="min-w-full divide-y divide-gray-200 table-fixed w-full">
                <thead className="bg-gray-50 sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider w-16">SN</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider w-32">SD REF</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider w-32">Date & Time</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider w-25">Region/Post</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider w-1/2 max-w-[800px]">Incident Narrative</th>
                    <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider w-24">Suspects</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider w-32">Status</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredReports.map((report) => (
                    <tr key={report.sn} className="hover:bg-blue-50 transition-colors cursor-pointer" onClick={() => { if(operation === 'update') populateUpdateForm(report); }}>
                      <td className="px-4 py-4 whitespace-nowrap text-sm font-bold text-gray-900 align-top">{report.sn}</td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm font-bold text-blue-700 align-top">{report.sdRef || report.sd_ref}</td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 align-top">{report.date}<br/><span className="text-xs text-gray-400">{report.time}</span></td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-700 align-top">{report.station} <br/><span className="text-xs text-gray-400">{report.region}</span></td>
                      <td className="px-4 py-4 text-sm text-gray-700 align-top w-1/3 max-w-[600px] whitespace-pre-wrap break-words overflow-hidden leading-relaxed">
                        {report.offence && <div className="font-bold text-red-600 uppercase mb-1">{report.offence}</div>}
                        <div 
                          className="ql-editor p-0" 
                          dangerouslySetInnerHTML={{ __html: report.narrative }} 
                        />
                        
                        {report.suspectDetails && report.suspectDetails.length > 0 && (
                          <div className="mt-3 bg-red-50 border border-red-100 rounded-lg p-3 shadow-sm">
                            <span className="text-[10px] font-bold text-red-800 uppercase tracking-wider block mb-2 border-b border-red-200 pb-1">
                              Suspects in Custody ({report.suspectDetails.length}):
                            </span>
                            <ul className="space-y-1.5">
                              {report.suspectDetails.map((s, i) => (
                                <li key={i} className="text-xs text-red-900 font-medium flex flex-col sm:flex-row sm:items-center">
                                  <span className="font-bold mr-2">{i + 1}. {s.name}</span>
                                  <span className="text-red-700">
                                    ({s.sex}{s.age ? `, ${s.age}yrs` : ''}{s.tribe ? `, ${s.tribe}` : ''}) 
                                    {s.residence ? ` - Res: ${s.residence}` : ''}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm font-extrabold text-red-600 text-center align-top">{report.suspects || 0}</td>
                      <td className="px-4 py-4 whitespace-nowrap align-top">
                        <span className={`px-2 inline-flex text-[10px] leading-5 font-bold rounded-full 
                          ${report.status.includes('ACTIVE') ? 'bg-yellow-100 text-yellow-800' : ''}
                          ${report.status.includes('COURT') ? 'bg-purple-100 text-purple-800' : ''}
                          ${report.status.includes('CLOSED') ? 'bg-green-100 text-green-800' : ''}
                          ${report.status.includes('ADR') ? 'bg-orange-100 text-orange-800' : ''}
                        `}>
                          {report.status}
                        </span>
                        {report.narrative.includes('[UPDATE') && (
                          <div className="text-[9px] text-gray-400 mt-1 italic break-words max-w-[120px]">
                            {report.narrative.split('[UPDATE').pop().split(']')[0].replace('by ', 'Update: ')}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filteredReports.length === 0 && (
                    <tr><td colSpan="7" className="text-center py-6 text-gray-500">No records found for this jurisdiction.</td></tr>
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

// ====================================================================
// --- PAGE 2: DISRUPTIVE OPS STATISTICS ---
// ====================================================================
const Statistics = ({ currentUser, stats, setStats, setSidebarOpen }) => {
  const [operation, setOperation] = useState('new');
  const [notification, setNotification] = useState(null);

  const [filterRegion, setFilterRegion] = useState(['ADMIN', 'SUPER_ADMIN'].includes(currentUser.role) ? 'ALL REGIONS' : currentUser.region);
  const [filterStation, setFilterStation] = useState('ALL STATIONS');
  const [updateSearch, setUpdateSearch] = useState('');

  const [formData, setFormData] = useState({
    sn: null,
    region: currentUser.region,
    station: currentUser.station || REGIONAL_HIERARCHY[currentUser?.region]?.[0] || '',
    date: new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0],
    arrested: 0,
    given_bond: 0,
    cautioned: 0,
    pending_court: 0,
    taken_to_court: 0,
    released: 0,
    remanded: 0,
    convicted: 0
  });

  const filteredStats = useMemo(() => {
    return stats.filter(s => {
      if (filterRegion !== 'ALL REGIONS' && s.region !== filterRegion) return false;
      if (filterStation !== 'ALL STATIONS' && s.station !== filterStation) return false;
      return true;
    });
  }, [stats, filterRegion, filterStation]);

  const availableUpdateStats = useMemo(() => {
    return stats.filter(s => {
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
      acc.arrested += (parseInt(curr.arrested) || 0);
      acc.given_bond += (parseInt(curr.given_bond) || 0);
      acc.cautioned += (parseInt(curr.cautioned) || 0);
      acc.pending_court += (parseInt(curr.pending_court) || 0);
      acc.taken_to_court += (parseInt(curr.taken_to_court) || 0);
      acc.released += (parseInt(curr.released) || 0);
      acc.remanded += (parseInt(curr.remanded) || 0);
      acc.convicted += (parseInt(curr.convicted) || 0);
      return acc;
    }, { arrested: 0, given_bond: 0, cautioned: 0, pending_court: 0, taken_to_court: 0, released: 0, remanded: 0, convicted: 0 });
  }, [filteredStats]);

  const handleInputChange = (e) => {
    const { name, value, type } = e.target;
    if (name === 'region') {
      setFormData({ ...formData, region: value, station: REGIONAL_HIERARCHY[value][0] });
    } else {
      setFormData({ ...formData, [name]: type === 'number' ? parseInt(value) || 0 : value });
    }
  };

  const handleOperationToggle = (op) => {
    setOperation(op);
    setNotification(null);
    if (op === 'new') {
      setFormData({
        sn: null,
        region: currentUser.region,
        station: currentUser.station || REGIONAL_HIERARCHY[currentUser?.region]?.[0] || '',
        date: new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0],
        arrested: 0, given_bond: 0, cautioned: 0, pending_court: 0, taken_to_court: 0, released: 0, remanded: 0, convicted: 0
      });
      setUpdateSearch('');
    }
  };

  const populateUpdateForm = (statData) => {
    setFormData({ ...statData });
  };

  const handleFormSubmit = async (e) => { 
    e.preventDefault();

    const token = localStorage.getItem('kmp_authToken');
    if (!token) {
        setNotification("Error: Security token missing. Please log out and log back in.");
        return;
    }
    
    if (operation === 'new') {
      const isDuplicate = stats.some(s => 
        s.station === formData.station && 
        s.date === formData.date
      );

      if (isDuplicate) {
        setNotification(`Error: Statistics for ${formData.station} on ${formData.date} are already logged. Please use 'Update Existing'.`);
        return; 
      }

      const exactNextSN = stats.length > 0 ? Math.max(...stats.map(s => s.sn)) + 1 : 1;
      const newStat = { 
        sn: exactNextSN, 
        ...formData,
        last_updated_by: `${currentUser.name} (${currentUser.fnum})`
      };
      
      try {
        const response = await fetch("http://127.0.0.1:8000/api/v1/stats", {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}` 
          },
          body: JSON.stringify(newStat)
        });
        
        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.detail || "Neon Database rejected the entry.");
        }

        setStats([newStat, ...stats]);
        setNotification(`Statistics recorded for ${formData.station}!`);
        
        setFormData({ 
          ...formData, 
          arrested: 0, given_bond: 0, cautioned: 0, pending_court: 0, 
          taken_to_court: 0, released: 0, remanded: 0, convicted: 0, 
          sn: null 
        });

      } catch (err) {
        console.error("Save Error:", err);
        setNotification(`❌ Error: ${err.message}`);
      }
      
} else if (operation === 'update') {
      // 1. Ensure we actually have an ID selected
      if (!formData.id) {
        setNotification("Error: Please select a record from the list to update first.");
        setIsSubmitting(false);
        return;
      }

      const updatedRecord = { ...formData, last_updated_by: `${currentUser.name} (${currentUser.fnum})` };

      try {
        // 🚨 THE FIX: Notice the /${formData.id} dynamically added to the end of the URL
        const response = await authFetch(`http://127.0.0.1:8000/api/v1/establishments/${formData.id}`, {
          method: "PUT",
          headers: { 
            "Content-Type": "application/json"
          },
          body: JSON.stringify(updatedRecord)
        });

        if (!response.ok) throw new Error("Failed to update record in database.");

        const updatedEsts = establishments.map(e => e.id === formData.id ? updatedRecord : e);
        setEstablishments(updatedEsts);
        setNotification(`Establishment ID ${formData.id} successfully updated!`);
        
        handleOperationToggle('new');

      } catch (err) {
        console.error("Update Error:", err);
        setNotification("❌ Error: Could not update the record in the database.");
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6 relative z-10">
      <div className="text-center mb-8 flex flex-col items-center">
        <img src="/upf_badge.png" alt="UPF Logo" className="w-16 h-16 mb-3 object-contain" />
        <h1 className="text-3xl font-extrabold text-gray-700 tracking-tight">Disruptive OPS Statistics</h1>
        <h3 className="text-lg text-blue-700 mt-2 font-medium">Weekly Numerical Aggregates</h3>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="bg-slate-900 px-4 py-3 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-white font-semibold flex items-center"><BarChart3 className="w-5 h-5 mr-2 text-blue-400" /> ⚙️ Log Statistics</h3>
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
                <div className={`border px-4 py-3 rounded-lg flex items-center mb-4 ${notification.includes('Error') || notification.includes('❌') ? 'bg-red-50 border-red-200 text-red-800' : 'bg-green-50 border-green-200 text-green-800'}`}>
                  {notification.includes('Error') || notification.includes('❌') ? <AlertTriangle className="w-5 h-5 mr-2 text-red-500" /> : <CheckCircle className="w-5 h-5 mr-2 text-green-500" />}
                  <span className="text-sm font-medium">{notification}</span>
                </div>
              )}

              {operation === 'update' && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <label className="block text-xs font-bold text-blue-800 mb-2">🔍 Search & Select Record to Update</label>
                  <input type="text" placeholder="Search by SN, Station, or Date..." value={updateSearch} onChange={e => setUpdateSearch(e.target.value)} className="w-full text-sm p-2 mb-2 border border-blue-200 rounded outline-none focus:ring-2 focus:ring-blue-400" />
                  <div className="max-h-40 overflow-y-auto bg-white border border-blue-100 rounded custom-scrollbar">
                    {availableUpdateStats.length === 0 ? (
                      <div className="p-3 text-xs text-gray-500 text-center">No records found matching your search.</div>
                    ) : (
                      availableUpdateStats.map(s => (
                        <div key={s.sn} onClick={() => populateUpdateForm(s)} className={`p-2 text-xs border-b cursor-pointer transition-colors ${formData.sn === s.sn ? 'bg-blue-600 text-white font-bold' : 'hover:bg-blue-50 text-gray-700'}`}>
                          <span className={formData.sn === s.sn ? 'text-blue-200' : 'text-gray-400'}>SN: {s.sn}</span> | <span className={formData.sn === s.sn ? 'text-white' : 'font-bold text-blue-700'}>{s.date}</span> | {s.station}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
              
              <form onSubmit={handleFormSubmit} className="space-y-5">
                {operation === 'update' && formData.sn && (
                   <div className="bg-slate-800 text-white text-xs font-bold px-3 py-2 rounded">
                     Currently Editing Record SN: {formData.sn}
                   </div>
                )}
                
                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 space-y-4">
                  <div className="grid grid-cols-1 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">Select Region *</label>
                      <select name="region" value={formData.region} onChange={handleInputChange} disabled={!['ADMIN', 'SUPER_ADMIN'].includes(currentUser.role) || operation === 'update'} required className="w-full text-sm border-gray-300 rounded-md shadow-sm bg-white border p-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500">
                        {['ADMIN', 'SUPER_ADMIN'].includes(currentUser.role) ? (
                          Object.keys(REGIONAL_HIERARCHY).map(reg => <option key={reg} value={reg}>{reg}</option>)
                        ) : (
                          <option value={currentUser.region}>{currentUser.region}</option>
                        )}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">Station / Division *</label>
                      <select name="station" value={formData.station} onChange={handleInputChange} disabled={operation === 'update'} required className="w-full text-sm border-gray-300 rounded-md shadow-sm bg-white border p-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500">
                        {REGIONAL_HIERARCHY[formData.region].map(stat => <option key={stat} value={stat}>{stat}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">Date of Record *</label>
                      <input type="date" name="date" value={formData.date} onChange={handleInputChange} disabled={operation === 'update'} required className="w-full text-sm border-gray-300 rounded-md shadow-sm border bg-white p-2 disabled:bg-gray-100 disabled:text-gray-500" />
                    </div>
                  </div>
                </div>

                <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                  <h4 className="text-sm font-bold text-blue-900 border-b border-blue-200 pb-2 mb-4 flex items-center">
                    📊 Enter Weekly Metric Aggregates (8 Fields)
                  </h4>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white p-2 rounded border border-gray-200 shadow-sm">
                      <label className="block text-[11px] font-bold text-gray-600 uppercase tracking-wider mb-1">Suspects Arrested</label>
                      <input type="number" name="arrested" min="0" value={formData.arrested} onChange={handleInputChange} className="w-full text-lg font-bold text-blue-700 border-b-2 border-transparent focus:border-blue-500 outline-none p-1 bg-transparent" />
                    </div>
                    
                    <div className="bg-white p-2 rounded border border-gray-200 shadow-sm">
                      <label className="block text-[11px] font-bold text-gray-600 uppercase tracking-wider mb-1">Given Bond</label>
                      <input type="number" name="given_bond" min="0" value={formData.given_bond} onChange={handleInputChange} className="w-full text-lg font-bold text-blue-700 border-b-2 border-transparent focus:border-blue-500 outline-none p-1 bg-transparent" />
                    </div>
                    
                    <div className="bg-white p-2 rounded border border-gray-200 shadow-sm">
                      <label className="block text-[11px] font-bold text-gray-600 uppercase tracking-wider mb-1">Cautioned</label>
                      <input type="number" name="cautioned" min="0" value={formData.cautioned} onChange={handleInputChange} className="w-full text-lg font-bold text-blue-700 border-b-2 border-transparent focus:border-blue-500 outline-none p-1 bg-transparent" />
                    </div>
                    
                    <div className="bg-white p-2 rounded border border-gray-200 shadow-sm">
                      <label className="block text-[11px] font-bold text-gray-600 uppercase tracking-wider mb-1">Pending Court</label>
                      <input type="number" name="pending_court" min="0" value={formData.pending_court} onChange={handleInputChange} className="w-full text-lg font-bold text-yellow-600 border-b-2 border-transparent focus:border-yellow-500 outline-none p-1 bg-transparent" />
                    </div>
                    
                    <div className="bg-white p-2 rounded border border-gray-200 shadow-sm">
                      <label className="block text-[11px] font-bold text-gray-600 uppercase tracking-wider mb-1">Taken to Court</label>
                      <input type="number" name="taken_to_court" min="0" value={formData.taken_to_court} onChange={handleInputChange} className="w-full text-lg font-bold text-blue-600 border-b-2 border-transparent focus:border-blue-500 outline-none p-1 bg-transparent" />
                    </div>
                    
                    <div className="bg-white p-2 rounded border border-gray-200 shadow-sm">
                      <label className="block text-[11px] font-bold text-gray-600 uppercase tracking-wider mb-1">Released by Court</label>
                      <input type="number" name="released" min="0" value={formData.released} onChange={handleInputChange} className="w-full text-lg font-bold text-green-600 border-b-2 border-transparent focus:border-green-500 outline-none p-1 bg-transparent" />
                    </div>
                    
                    <div className="bg-white p-2 rounded border border-gray-200 shadow-sm">
                      <label className="block text-[11px] font-bold text-gray-600 uppercase tracking-wider mb-1">Suspects Remanded</label>
                      <input type="number" name="remanded" min="0" value={formData.remanded} onChange={handleInputChange} className="w-full text-lg font-bold text-red-600 border-b-2 border-transparent focus:border-red-500 outline-none p-1 bg-transparent" />
                    </div>
                    
                    <div className="bg-white p-2 rounded border border-gray-200 shadow-sm">
                      <label className="block text-[11px] font-bold text-gray-600 uppercase tracking-wider mb-1">Suspects Convicted</label>
                      <input type="number" name="convicted" min="0" value={formData.convicted} onChange={handleInputChange} className="w-full text-lg font-bold text-purple-600 border-b-2 border-transparent focus:border-purple-500 outline-none p-1 bg-transparent" />
                    </div>
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
          <div className="flex flex-col sm:flex-row gap-3">
             <select value={filterRegion} onChange={(e) => { setFilterRegion(e.target.value); setFilterStation('ALL STATIONS'); }} disabled={!['ADMIN', 'SUPER_ADMIN'].includes(currentUser.role)} className="border rounded-lg px-3 py-2 text-sm shadow-sm bg-white">
                {['ADMIN', 'SUPER_ADMIN'].includes(currentUser.role) && <option value="ALL REGIONS">ALL REGIONS</option>}
                {['ADMIN', 'SUPER_ADMIN'].includes(currentUser.role) ? (
                  Object.keys(REGIONAL_HIERARCHY).map(reg => <option key={reg} value={reg}>{reg}</option>)
                ) : (
                  <option value={currentUser.region}>{currentUser.region}</option>
                )}
              </select>
              <select value={filterStation} onChange={(e) => setFilterStation(e.target.value)} className="border rounded-lg px-3 py-2 text-sm shadow-sm bg-white">
                <option value="ALL STATIONS">ALL STATIONS</option>
                {filterRegion !== 'ALL REGIONS' && REGIONAL_HIERARCHY[filterRegion].map(stat => <option key={stat} value={stat}>{stat}</option>)}
              </select>
          </div>

          <ExpandableTableCard 
            title="Weekly Metrics Breakdown Ledger"
            onToggle={(expanded) => {
              if (setSidebarOpen) {
                setSidebarOpen(!expanded); 
              }
            }}
          >
            <div className="overflow-x-auto w-full">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider leading-tight">S/N</th>
                    <th className="px-3 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider leading-tight">Date</th>
                    <th className="px-3 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider leading-tight">Division</th>
                    <th className="px-2 py-3 text-center text-[10px] font-bold text-gray-500 uppercase tracking-wider leading-tight">Suspects<br/>arrested</th>
                    <th className="px-2 py-3 text-center text-[10px] font-bold text-gray-500 uppercase tracking-wider leading-tight">Given<br/>Bond</th>
                    <th className="px-2 py-3 text-center text-[10px] font-bold text-gray-500 uppercase tracking-wider leading-tight">Cautioned</th>
                    <th className="px-2 py-3 text-center text-[10px] font-bold text-gray-500 uppercase tracking-wider leading-tight">Pending<br/>Court</th>
                    <th className="px-2 py-3 text-center text-[10px] font-bold text-gray-500 uppercase tracking-wider leading-tight">Taken to<br/>Court</th>
                    <th className="px-2 py-3 text-center text-[10px] font-bold text-gray-500 uppercase tracking-wider leading-tight">Released<br/>by court</th>
                    <th className="px-2 py-3 text-center text-[10px] font-bold text-gray-500 uppercase tracking-wider leading-tight">Suspects<br/>remanded</th>
                    <th className="px-2 py-3 text-center text-[10px] font-bold text-gray-500 uppercase tracking-wider leading-tight">Suspects<br/>convicted</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredStats.map((stat) => (
                    <tr key={stat.sn} className="hover:bg-blue-50 transition-colors cursor-pointer" onClick={() => { if(operation === 'update') populateUpdateForm(stat); }}>
                      <td className="px-3 py-3 whitespace-nowrap text-[11px] font-bold text-gray-900">{stat.sn}</td>
                      <td className="px-3 py-3 whitespace-nowrap text-[11px] text-gray-500">{stat.date}</td>
                      <td className="px-3 py-3 whitespace-nowrap text-[11px] font-medium text-blue-700">{stat.station}</td>
                      <td className="px-2 py-3 whitespace-nowrap text-[11px] text-center font-bold text-gray-700">{stat.arrested}</td>
                      <td className="px-2 py-3 whitespace-nowrap text-[11px] text-center font-bold text-gray-700">{stat.given_bond}</td>
                      <td className="px-2 py-3 whitespace-nowrap text-[11px] text-center font-bold text-gray-700">{stat.cautioned}</td>
                      <td className="px-2 py-3 whitespace-nowrap text-[11px] text-center font-bold text-yellow-600">{stat.pending_court}</td>
                      <td className="px-2 py-3 whitespace-nowrap text-[11px] text-center font-bold text-blue-600">{stat.taken_to_court}</td>
                      <td className="px-2 py-3 whitespace-nowrap text-[11px] text-center font-bold text-green-600">{stat.released}</td>
                      <td className="px-2 py-3 whitespace-nowrap text-[11px] text-center font-bold text-red-600">{stat.remanded}</td>
                      <td className="px-2 py-3 whitespace-nowrap text-[11px] text-center font-bold text-purple-600">{stat.convicted}</td>
                    </tr>
                  ))}
                  {filteredStats.length > 0 && (
                    <tr className="bg-slate-200 font-bold text-gray-900 border-t-2 border-slate-400">
                      <td colSpan="3" className="px-3 py-3 text-right text-xs uppercase tracking-wider">Total</td>
                      <td className="px-2 py-3 text-center text-[11px] text-blue-800">{totals.arrested}</td>
                      <td className="px-2 py-3 text-center text-[11px] text-blue-800">{totals.given_bond}</td>
                      <td className="px-2 py-3 text-center text-[11px] text-blue-800">{totals.cautioned}</td>
                      <td className="px-2 py-3 text-center text-[11px] text-blue-800">{totals.pending_court}</td>
                      <td className="px-2 py-3 text-center text-[11px] text-blue-800">{totals.taken_to_court}</td>
                      <td className="px-2 py-3 text-center text-[11px] text-blue-800">{totals.released}</td>
                      <td className="px-2 py-3 text-center text-[11px] text-blue-800">{totals.remanded}</td>
                      <td className="px-2 py-3 text-center text-[11px] text-blue-800">{totals.convicted}</td>
                    </tr>
                  )}
                  {filteredStats.length === 0 && (
                    <tr><td colSpan="11" className="text-center py-6 text-gray-500">No statistics logged for this jurisdiction.</td></tr>
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

// ====================================================================
// --- PAGE 3: OPERATIONAL SUCCESS STORIES ---
// ====================================================================
const SuccessStories = ({ currentUser, stories, setStories, setSidebarOpen }) => {
  const [operation, setOperation] = useState('new');
  const [filterRegion, setFilterRegion] = useState(['ADMIN', 'SUPER_ADMIN'].includes(currentUser.role) ? 'ALL REGIONS' : currentUser.region);
  const [filterStation, setFilterStation] = useState('ALL STATIONS');
  const [notification, setNotification] = useState(null);
  const [updateSearch, setUpdateSearch] = useState('');

  const safeStories = Array.isArray(stories) ? stories : [];

  if (!stories) {
    return <div className="p-4 text-gray-500">Loading mission logs...</div>;
  }

  const getTodayString = () => new Date().toLocaleDateString('en-CA').split(',')[0].replace(/\//g, '-');

  const [formData, setFormData] = useState({
    sn: null,
    region: currentUser.region,
    station: currentUser.station || REGIONAL_HIERARCHY[currentUser?.region]?.[0] || '',
    date: getTodayString(),
    time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }).replace(':', '') + 'Hrs',
    narrative: '',
    status: 'COMPLETED / SUCCESS',
    updateText: '',
    photo_url: ''
  });

  const filteredStories = useMemo(() => {
    return stories.filter(s => {
      if (filterRegion !== 'ALL REGIONS' && s.region !== filterRegion) return false;
      if (filterStation !== 'ALL STATIONS' && s.station !== filterStation) return false;
      return true;
    });
  }, [stories, filterRegion, filterStation]);

  const availableUpdateStories = useMemo(() => {
    return stories.filter(s => {
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
    if (name === 'region') {
      setFormData({ ...formData, region: value, station: REGIONAL_HIERARCHY[value][0] });
    } else {
      setFormData({ ...formData, [name]: value });
    }
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
        const response = await authFetch("/api/v1/investigation/upload/", {
          method: "POST",
          body: uploadData,
        });
        const data = await response.json();
        if (data.full_s3_url || data.cloud_storage_path) {
          setFormData({ ...formData, photo_url: data.full_s3_url || `https://kmp-tracker-system-tu-16-06-26.s3.eu-central-1.amazonaws.com/${data.cloud_storage_path}` });
          setNotification("Exhibit uploaded to S3 successfully!");
        } else {
           throw new Error("Invalid API Response");
        }
      } catch (error) {
        console.warn("Backend unreachable, falling back to local Blob URL for UI testing.", error);
        const localUrl = URL.createObjectURL(file);
        setFormData({ ...formData, photo_url: localUrl });
        setNotification("Note: API offline. Using temporary local preview.");
      }
    }
  };

  const handleOperationToggle = (op) => {
    setOperation(op);
    setNotification(null);
    if (op === 'new') {
      setFormData({
        sn: null,
        region: currentUser.region,
        station: currentUser.station || REGIONAL_HIERARCHY[currentUser?.region]?.[0] || '',
        date: getTodayString(),
        time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }).replace(':', '') + 'Hrs',
        narrative: '',
        status: 'COMPLETED / SUCCESS',
        updateText: '',
        photo_url: ''
      });
      setUpdateSearch('');
    }
  };

  const populateUpdateForm = (storyData) => {
    setFormData({ ...storyData, updateText: '' });
  };

const handleFormSubmit = (e) => {
    e.preventDefault();

    if (operation === 'new') {
      // 🚨 THE INTERCEPTOR: Prevent Identical Narratives (strips HTML tags to check pure text)
      const cleanNewText = formData.narrative.replace(/<[^>]*>?/gm, '').trim().toLowerCase();
      const isDuplicate = stories.some(s => 
        s.narrative.replace(/<[^>]*>?/gm, '').trim().toLowerCase() === cleanNewText
      );

      if (isDuplicate) {
        setNotification("Error: This exact success story has already been submitted to the ledger.");
        return;
      }

      const exactNextSN = (stories && stories.length > 0) ? Math.max(...stories.map(s => s.sn)) + 1 : 1;
      const newStory = { 
        sn: exactNextSN, 
        ...formData,
        last_updated_by: `${currentUser.name} (${currentUser.fnum})`
      };
      delete newStory.updateText;
      
      authFetch("/api/v1/stories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newStory)
      }).catch(err => console.error("Cloud sync failed:", err));

      setStories([newStory, ...stories]);
      setNotification(`Success story SN ${newStory.sn} logged successfully!`);
      
    } else if (operation === 'update') {
      if (!formData.sn) {
        setNotification("Error: Please select a story from the list to update first.");
        return;
      }

      const updatedNarrative = formData.updateText 
        ? `${formData.narrative}\n<br/><br/><strong>[UPDATE ${new Date().toISOString().slice(0,16).replace('T', ' ')}]:</strong><br/>${formData.updateText}` 
        : formData.narrative;
        
      const updatedRecord = { 
        ...formData, 
        narrative: updatedNarrative,
        last_updated_by: `${currentUser.name} (${currentUser.fnum})`
      };
      delete updatedRecord.updateText;

      authFetch(`/api/v1/stories/${formData.sn}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedRecord)
      }).catch(err => console.error("Cloud sync failed:", err));

      const updatedStories = (stories || []).map(s => s.sn === formData.sn ? updatedRecord : s);
      setStories(updatedStories);
      setNotification(`Success story SN ${formData.sn} successfully updated!`);
    }

    setTimeout(() => setNotification(null), 4000);
    if (operation === 'new') {
      setFormData({ ...formData, time: '', narrative: '', sn: null, updateText: '', photo_url: '' });
    }
  };

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6 relative z-10">
      <div className="text-center mb-8 flex flex-col items-center">
        <img src="/upf_badge.png" alt="UPF Logo" className="w-16 h-16 mb-3 object-contain" onError={(e) => { e.target.style.display = 'none'; }} />
        <h1 className="text-3xl font-extrabold text-gray-700 tracking-tight">Operational Success Stories</h1>
        <h3 className="text-lg text-amber-500 mt-2 font-medium">Highlighting UPF Anti-Crime Milestones</h3>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          
     <div className="p-5 space-y-6">
              <div className="flex space-x-2 bg-gray-100 p-1 rounded-lg">
                <button type="button" onClick={() => handleOperationToggle('new')} className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${operation === 'new' ? 'bg-white shadow text-yellow-600' : 'text-gray-600 hover:text-gray-900'}`}>
                  <PlusCircle className="w-4 h-4 inline mr-1" /> Register New
                </button>
                <button type="button" onClick={() => handleOperationToggle('update')} className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${operation === 'update' ? 'bg-green shadow text-white-600' : 'text-gray-600 hover:text-gray-900'}`}>
                  <Edit className="w-4 h-4 inline mr-1" /> Update Existing
                </button>
              </div>

               {notification && (
                <div className={`border px-4 py-3 rounded-lg flex items-center mb-4 ${notification.includes('Error') ? 'bg-red-50 border-red-200 text-red-800' : 'bg-green-50 border-green-200 text-green-800'}`}>
                  {notification.includes('Error') ? <AlertTriangle className="w-5 h-5 mr-2 text-red-500" /> : <CheckCircle className="w-5 h-5 mr-2 text-green-500" />}
                  <span className="text-sm font-medium">{notification}</span>
                </div>
              )}

              {operation === 'update' && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                  <label className="block text-xs font-bold text-yellow-800 mb-2">🔍 Search & Select Story to Update</label>
                  <input type="text" placeholder="Search by SN or Narrative..." value={updateSearch} onChange={e => setUpdateSearch(e.target.value)} className="w-full text-sm p-2 mb-2 border border-yellow-200 rounded outline-none focus:ring-2 focus:ring-yellow-400" />
                  <div className="max-h-40 overflow-y-auto bg-white border border-yellow-100 rounded custom-scrollbar">
                    {availableUpdateStories.length === 0 ? (
                      <div className="p-3 text-xs text-gray-500 text-center">No success stories found matching your search.</div>
                    ) : (
                      availableUpdateStories?.map(s => (
                        <div key={s.sn} onClick={() => populateUpdateForm(s)} className={`p-2 text-xs border-b cursor-pointer transition-colors ${formData.sn === s.sn ? 'bg-yellow-500 text-white font-bold' : 'hover:bg-yellow-50 text-gray-700'}`}>
                          <span className={formData.sn === s.sn ? 'text-yellow-100' : 'text-gray-400'}>SN: {s.sn}</span> | <span className={formData.sn === s.sn ? 'text-white' : 'font-bold text-yellow-700'}>{s.date}</span> | {s.station}
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
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Select Region *</label>
                    <select name="region" value={formData.region} onChange={handleInputChange} disabled={!['ADMIN', 'SUPER_ADMIN'].includes(currentUser.role) || operation === 'update'} required className="w-full text-sm border-gray-300 rounded-md shadow-sm bg-gray-50 border p-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500">
                      {['ADMIN', 'SUPER_ADMIN'].includes(currentUser.role) ? (
                        Object.keys(REGIONAL_HIERARCHY).map(reg => <option key={reg} value={reg}>{reg}</option>)
                      ) : (
                        <option value={currentUser.region}>{currentUser.region}</option>
                      )}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Station *</label>
                    <select name="station" value={formData.station} onChange={handleInputChange} disabled={operation === 'update'} required className="w-full text-sm border-gray-300 rounded-md shadow-sm bg-gray-50 border p-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500">
                     {(REGIONAL_HIERARCHY[formData.region] || []).map(stat => <option key={stat} value={stat}>{stat}</option>)}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
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
                  <ReactQuill 
                    theme="snow" 
                    value={formData.narrative} 
                    onChange={(content) => setFormData({ ...formData, narrative: autoCapitalize(content) })}
                    readOnly={operation === 'update'}
                    className={`bg-white rounded-md ${operation === 'update' ? 'opacity-70 grayscale pointer-events-none' : ''}`}
                    modules={{
                      toolbar: [
                        ['bold', 'italic', 'underline'],
                        [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                        ['clean'] 
                      ]
                    }}
                  />
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
                    <ReactQuill 
                      theme="snow" 
                      value={formData.updateText || ''} 
                      onChange={(content) => setFormData({ ...formData, updateText: autoCapitalize(content) })}
                      className="bg-white rounded-md border-yellow-300"
                      placeholder="Enter new progress or updates here. Use the toolbar for numbering..."
                      modules={{
                        toolbar: [
                          ['bold', 'italic', 'underline'],
                          [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                          ['clean']
                        ]
                      }}
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Status</label>
                  <select name="status" value={formData.status} onChange={handleInputChange} className="w-full text-sm border-gray-300 rounded-md shadow-sm bg-gray-50 border p-2">
                    <option>COMPLETED / SUCCESS</option>
                    <option>ONGOING / EXPLOITATION</option>
                    <option>IN PROGRESS</option>
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
             <select value={filterRegion} onChange={(e) => { setFilterRegion(e.target.value); setFilterStation('ALL STATIONS'); }} disabled={!['ADMIN', 'SUPER_ADMIN'].includes(currentUser.role)} className="border rounded-lg px-3 py-2 text-sm shadow-sm bg-white">
                {['ADMIN', 'SUPER_ADMIN'].includes(currentUser.role) && <option value="ALL REGIONS">ALL REGIONS</option>}
                {['ADMIN', 'SUPER_ADMIN'].includes(currentUser.role) ? (
                  Object.keys(REGIONAL_HIERARCHY).map(reg => <option key={reg} value={reg}>{reg}</option>)
                ) : (
                  <option value={currentUser.region}>{currentUser.region}</option>
                )}
              </select>
              <select value={filterStation} onChange={(e) => setFilterStation(e.target.value)} className="border rounded-lg px-3 py-2 text-sm shadow-sm bg-white">
                <option value="ALL STATIONS">ALL STATIONS</option>
                {filterRegion !== 'ALL REGIONS' && REGIONAL_HIERARCHY[filterRegion].map(stat => <option key={stat} value={stat}>{stat}</option>)}
              </select>
          </div>
          
          <ExpandableTableCard 
            title="Achievements Overview Ledger"
            onToggle={(expanded) => {
              if (setSidebarOpen) {
                setSidebarOpen(!expanded); 
              }
            }}
          >
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
                        <span className={`px-2 inline-flex text-[10px] leading-5 font-bold rounded-full ${story.status.includes('COMPLETED') ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                          {story.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {filteredStories.length === 0 && (
                    <tr><td colSpan="6" className="text-center py-6 text-gray-500">No success stories logged for this jurisdiction.</td></tr>
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

// ====================================================================
// --- PAGE 4: ESTABLISHMENTS PER REGION ---
// ====================================================================
const Establishments = ({ currentUser, establishments, setEstablishments, setSidebarOpen }) => {
  const [operation, setOperation] = useState('new');
  const [notification, setNotification] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [filterRegion, setFilterRegion] = useState(['ADMIN', 'SUPER_ADMIN'].includes(currentUser.role) ? 'ALL REGIONS' : currentUser.region);
  const [filterStation, setFilterStation] = useState('ALL STATIONS');
  const [updateSearch, setUpdateSearch] = useState('');

  const [Admin_Communication, setAdmin_Communication] = useState([]);
  const [filterDivision, setFilterDivision] = useState('ALL DIVISIONS');
  
  // FIX 1: Removed extra underscore from personnel_in_sub_station
  const [formData, setFormData] = useState({
    id: null,
    region: currentUser.region,
    division: currentUser.division || '',
    station: currentUser.station || REGIONAL_HIERARCHY[currentUser?.region]?.[0] || '',
    personnel_in_station: 0,
    sub_station: '',
    personnel_in_sub_station: 0, 
    post: '',
    personnel_in_post: 0,
    booths: 0,
    location: '',
    personnel_in_booth: 0,
    installed_by: '',
    status: 'OPERATIONAL',
    comment: ''
  });

  const filteredEstablishments = useMemo(() => {
    return establishments.filter(e => {
      if (filterRegion !== 'ALL REGIONS' && e.region !== filterRegion) return false;
      if (filterDivision !== 'ALL DIVISIONS' && e.division !== filterDivision) return false;
      if (filterStation !== 'ALL STATIONS' && e.station !== filterStation) return false;
      return true;
    });
  }, [establishments, filterRegion, filterDivision, filterStation]);

  const availableUpdateEstablishments = useMemo(() => {
    return establishments.filter(e => {
      if (!['ADMIN', 'SUPER_ADMIN'].includes(currentUser.role) && e.region !== currentUser.region) return false;
      if (updateSearch) {
        const query = updateSearch.toLowerCase();
        return e.sn.toString().includes(query) || (e.sub_station && e.sub_station.toLowerCase().includes(query)) || (e.post && e.post.toLowerCase().includes(query)) || (e.location && e.location.toLowerCase().includes(query));
      }
      return true;
    });
  }, [establishments, currentUser, updateSearch]);

const handleInputChange = (e) => {
    const { name, value, type } = e.target;
    
    if (name === 'region') {
      // Automatically reset division and station when region changes
      setFormData({ 
        ...formData, 
        region: value, 
        division: REGIONAL_HIERARCHY[value][0], // Set to first available division
        station: REGIONAL_HIERARCHY[value][0]   // Set to first available station
      });
    } else if (name === 'division') {
      setFormData({ 
        ...formData, 
        division: value,
        station: value // Usually station and division are linked in your logic
      });
    } else {
      setFormData({ ...formData, [name]: type === 'number' ? parseInt(value) || 0 : value });
    }
  };

  const handleOperationToggle = (op) => {
    setOperation(op);
    setNotification(null);
    if (op === 'new') {
      setFormData({
        id: null,
        region: currentUser.region,
        division: currentUser.region,
        station: currentUser.station || REGIONAL_HIERARCHY[currentUser?.region]?.[0] || '', 
        personnel_in_station: 0,
        sub_station: '', 
        personnel_in_sub_station: 0, // FIX: Underscore removed
        post: '', 
        personnel_in_post: 0, 
        booths: 0, 
        location: '', 
        personnel_in_booth: 0, 
        installed_by: '', 
        status: 'OPERATIONAL', 
        comment: ''
      });
      setUpdateSearch('');
    }
  };

const handleFormSubmit = async (e) => {
    e.preventDefault();

    // 1. Validation Block
    const requiredFields = ['region', 'division', 'station', 'location'];
    const isInvalid = requiredFields.some(field => !formData[field] || String(formData[field]).trim() === '');

    if (isInvalid) {
      setNotification("Error: All required fields must be filled.");
      return; 
    }

    // 2. LOGICAL DUPLICATE CHECK
    // This checks if a station with the same name/region exists in your current list
    const isDuplicate = establishments.some(e => 
      e.region === formData.region && 
      e.station === formData.station && 
      e.division === formData.division
    );

    if (isDuplicate) {
      setNotification("Error: An entry for this station already exists.");
      return;
    }

    // 3. Prevent Double-Clicking
    setIsSubmitting(true); 

    if (operation === 'new') {
      const newEntry = { 
        ...formData, 
        last_updated_by: `${currentUser.name} (${currentUser.fnum})`
      };
      delete newEntry.sn; 
      
      try {
        await authFetch("/api/v1/establishments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newEntry)
        });

        setEstablishments([newEntry, ...establishments]);
        setNotification(`Establishment recorded for ${formData.station}!`);
        
        // Reset form
        setFormData({ 
          ...formData, 
          division:'', station:'', personnel_in_station:0, sub_station: '', 
          personnel_in_sub_station: 0, post: '', personnel_in_post: 0, 
          booths: 0, location: '', personnel_in_booth: 0, 
          installed_by: '', comment: '', sn: null 
        });

      } catch (err) {
        console.error("Cloud sync failed:", err);
        setNotification("Error: Server rejected the data. Please check connection.");
      } finally {
        setIsSubmitting(false); // Unlock the button
      }
    } 
    // ... update logic ...
    
    setTimeout(() => setNotification(null), 4000);
  };

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6 relative z-10">
      <div className="text-center mb-8 flex flex-col items-center">
        <img src="/upf_badge.png" alt="UPF Logo" className="w-16 h-16 mb-3 object-contain" onError={(e) => { e.target.style.display = 'none'; }} />
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
                <div className={`border px-4 py-3 rounded-lg flex items-center mb-4 ${notification.includes('Error') ? 'bg-red-50 border-red-200 text-red-800' : 'bg-green-50 border-green-200 text-green-800'}`}>
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
                        <div key={e.sn} onClick={() => populateUpdateForm(e)} className={`p-2 text-xs border-b cursor-pointer transition-colors ${formData.sn === e.sn ? 'bg-blue-600 text-white font-bold' : 'hover:bg-blue-50 text-gray-700'}`}>
                          <span className={formData.sn === e.sn ? 'text-blue-200' : 'text-gray-400'}>SN: {e.sn}</span> | <span className={formData.sn === e.sn ? 'text-white' : 'font-bold text-blue-700'}>{e.sub_station || e.post}</span> | {e.station}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
              
              <form onSubmit={handleFormSubmit} className="space-y-4">
                {operation === 'update' && formData.sn && (
                   <div className="bg-slate-800 text-white text-xs font-bold px-3 py-2 rounded">
                     Currently Editing Record SN: {formData.sn}
                   </div>
                )}
                
                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <label className="block text-xs font-bold text-gray-700 mb-1">Select Region *</label>
                      <select name="region" value={formData.region} onChange={handleInputChange} disabled={!['ADMIN', 'SUPER_ADMIN'].includes(currentUser.role) || operation === 'update'} required className="w-full text-sm border-gray-300 rounded-md shadow-sm bg-white border p-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500">
                        {['ADMIN', 'SUPER_ADMIN'].includes(currentUser.role) ? (
                          Object.keys(REGIONAL_HIERARCHY).map(reg => <option key={reg} value={reg}>{reg}</option>)
                        ) : (
                          <option value={currentUser.region}>{currentUser.region}</option>
                        )}
                      </select>
                    </div>
                    
                    {/* FIXED: The select dropdown now points to name="division" properly */}
                    <div className="col-span-2">
                      <label className="block text-xs font-bold text-gray-700 mb-1">DIVISION (Headquarter) *</label>
                      <select name="division" value={formData.division} onChange={handleInputChange} disabled={operation === 'update'} required className="w-full text-sm border-gray-300 rounded-md shadow-sm bg-white border p-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500">
                        {formData.region && REGIONAL_HIERARCHY[formData.region] ? REGIONAL_HIERARCHY[formData.region].map(stat => <option key={stat} value={stat}>{stat}</option>) : <option value="">Select Region First</option>}
                      </select>
                    </div>
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
                    {/* FIX 3: name corrected to match Python database */}
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
                      modules={{
                        toolbar: [
                          ['bold', 'italic', 'underline'],
                          [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                          ['clean']
                        ]
                      }}
                    />
                  </div>
                </div>

                <button 
  type="submit" 
  disabled={isSubmitting}
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
             <select value={filterRegion} onChange={(e) => { setFilterRegion(e.target.value); setFilterStation('ALL STATIONS'); setFilterDivision('ALL DIVISIONS'); }} disabled={!['ADMIN', 'SUPER_ADMIN'].includes(currentUser.role)} className="border rounded-lg px-3 py-2 text-sm shadow-sm bg-white">
                {['ADMIN', 'SUPER_ADMIN'].includes(currentUser.role) && <option value="ALL REGIONS">ALL REGIONS</option>}
                {['ADMIN', 'SUPER_ADMIN'].includes(currentUser.role) ? (
                  Object.keys(REGIONAL_HIERARCHY).map(reg => <option key={reg} value={reg}>{reg}</option>)
                ) : (
                  <option value={currentUser.region}>{currentUser.region}</option>
                )}
              </select>
              <select value={filterDivision} onChange={(e) => setFilterDivision(e.target.value)} className="border rounded-lg px-3 py-2 text-sm shadow-sm bg-white">
                <option value="ALL DIVISIONS">ALL DIVISIONS</option>
                {filterRegion !== 'ALL REGIONS' && REGIONAL_HIERARCHY[filterRegion] && REGIONAL_HIERARCHY[filterRegion].map(div => <option key={div} value={div}>{div}</option>)}
              </select>
          </div>

          <ExpandableTableCard 
            title="Regional Establishments Master Ledger"
            onToggle={(expanded) => {
              if (setSidebarOpen) {
                setSidebarOpen(!expanded); 
              }
            }}
          >
            <div className="overflow-x-auto w-full">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider leading-tight">DIVISION</th>
                    <th className="px-3 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider leading-tight">STATION</th>
                    <th className="px-2 py-3 text-center text-[10px] font-bold text-gray-500 uppercase tracking-wider leading-tight">PERS<br/>(STN)</th>
                    <th className="px-3 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider leading-tight">SUB-STATION</th>
                    <th className="px-2 py-3 text-center text-[10px] font-bold text-gray-500 uppercase tracking-wider leading-tight">PERS<br/>(SUB-STN)</th>
                    <th className="px-3 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider leading-tight">POST</th>
                    <th className="px-2 py-3 text-center text-[10px] font-bold text-gray-500 uppercase tracking-wider leading-tight">PERS<br/>(POST)</th>
                    <th className="px-2 py-3 text-center text-[10px] font-bold text-gray-500 uppercase tracking-wider leading-tight">BOOTHS</th>
                    <th className="px-3 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider leading-tight">LOCATION</th>
                    <th className="px-2 py-3 text-center text-[10px] font-bold text-gray-500 uppercase tracking-wider leading-tight">PERS<br/>(BOOTH)</th>
                    <th className="px-3 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider leading-tight">INSTALLED BY</th>
                    <th className="px-3 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider leading-tight">STATUS</th>
                    <th className="px-3 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider leading-tight">COMMENT</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredEstablishments.map((est) => (
                    <tr key={est.id} className="hover:bg-blue-50 transition-colors cursor-pointer" onClick={() => { if(operation === 'update') populateUpdateForm(est); }}>
                      {/* FIX 4: Changed est.Division to est.division so it renders! */}
                      <td className="px-3 py-3 whitespace-nowrap text-[11px] font-bold text-blue-800">{est.division}</td>
                      <td className="px-3 py-3 whitespace-nowrap text-[11px] font-bold text-blue-800">{est.station}</td>
                      <td className="px-2 py-3 whitespace-nowrap text-[11px] text-center font-bold">{est.personnel_in_station}</td> 
                      <td className="px-3 py-3 whitespace-nowrap text-[11px] text-gray-800">{est.sub_station || '-'}</td>
                      <td className="px-2 py-3 whitespace-nowrap text-[11px] text-center font-bold">{est.personnel_in_sub_station}</td>
                      <td className="px-3 py-3 whitespace-nowrap text-[11px] text-gray-800">{est.post || '-'}</td>
                      <td className="px-2 py-3 whitespace-nowrap text-[11px] text-center font-bold">{est.personnel_in_post}</td>
                      <td className="px-2 py-3 whitespace-nowrap text-[11px] text-center font-bold">{est.booths}</td>
                      <td className="px-3 py-3 text-[11px] text-gray-800 break-words max-w-[150px]">{est.location || '-'}</td>
                      <td className="px-2 py-3 whitespace-nowrap text-[11px] text-center font-bold">{est.personnel_in_booth}</td>
                      <td className="px-3 py-3 whitespace-nowrap text-[11px] text-gray-600">{est.installed_by || '-'}</td>
                      <td className="px-3 py-3 whitespace-nowrap text-[11px] font-bold">
                        <span className={`px-2 py-1 rounded-full text-[9px] ${est.status === 'OPERATIONAL' ? 'bg-green-100 text-green-800' : est.status.includes('MAINTENANCE') ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}`}>
                          {est.status}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-[10px] text-gray-500 italic max-w-[150px] break-words">
                         <div className="ql-editor p-0" dangerouslySetInnerHTML={{ __html: est.comment || '-' }} />
                      </td>
                    </tr>
                  ))}
                  {filteredEstablishments.length === 0 && (
                    <tr><td colSpan="13" className="text-center py-6 text-gray-500">No establishments logged for this jurisdiction.</td></tr>
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
// ====================================================================
// --- PAGE 5: NOMINAL ROLL ---
// ====================================================================
const Nominal_Roll = ({ currentUser, Nominal_Rolls, setNominal_Rolls, Nominal_Roll_archives, setNominal_Roll_archives, setSidebarOpen }) => {
  const [operation, setOperation] = useState('new');
  const [notification, setNotification] = useState(null);

  const [filterRegion, setFilterRegion] = useState(['ADMIN', 'SUPER_ADMIN'].includes(currentUser.role) ? 'ALL REGIONS' : currentUser.region);
  const [filterStation, setFilterStation] = useState('ALL STATIONS');
  const [updateSearch, setUpdateSearch] = useState('');

  const [viewMode, setViewMode] = useState('active'); 
  const [metricCategory, setMetricCategory] = useState('RANK'); 
  const [archiveReason, setArchiveReason] = useState('TRANSFERRED');

  // FORM DATA INITIALIZED TO PERFECTLY MATCH THE PYTHON MODELS.PY CLASS
  const [formData, setFormData] = useState({
    sn: null, fnum: '', rank: '', name: '', sex: 'MALE', position: '',
    dob: '', doe: '', dopost: '', dopro: '', contact: '', educlevel: '',
    ipps: '', tin: '', nin: '', homedist: '', tribe: '', accno: '', bankbranch: '',
    station: currentUser.station || REGIONAL_HIERARCHY[currentUser?.region]?.[0] || '', 
    district: '', region: currentUser.region, section: '', dir: '', status: 'ACTIVE'
  });

  const filteredRolls = useMemo(() => {
    return (Nominal_Rolls || []).filter(n => {
      if (filterRegion !== 'ALL REGIONS' && n.region !== filterRegion) return false;
      if (filterStation !== 'ALL STATIONS' && n.station !== filterStation) return false;
      return true;
    });
  }, [Nominal_Rolls, filterRegion, filterStation]);

const filteredNominal_Roll_archives = useMemo(() => {
  if (!Array.isArray(Nominal_Roll_archives)) return [];

  // 1. Determine if the user has "Godly" powers
  const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN';

  return Nominal_Roll_archives.filter(n => {
    // 2. SUPER ADMIN bypass: They see everything regardless of filters
    if (isSuperAdmin) return true;

    // 3. REGIONAL/STATION Filtering for standard users
    // If the filter is set to 'ALL', we default to their own assigned area
    const regionToMatch = filterRegion !== 'ALL REGIONS' ? filterRegion : currentUser.region;
    const stationToMatch = filterStation !== 'ALL STATIONS' ? filterStation : currentUser.station;

    // Strict matching for standard users
    if (n.region !== regionToMatch) return false;
    if (n.station !== stationToMatch) return false;
    console.log("Current User Role:", currentUser?.role, "Region:", currentUser?.region);

    return true;
  });
}, [Nominal_Roll_archives, filterRegion, filterStation, currentUser]);
  const availableUpdateRolls = useMemo(() => {
    return (Nominal_Rolls || []).filter(n => {
      if (!['ADMIN', 'SUPER_ADMIN'].includes(currentUser.role) && n.region !== currentUser.region) return false;
      if (updateSearch) {
        const query = updateSearch.toLowerCase();
        return (n.fnum && n.fnum.toLowerCase().includes(query)) || 
               (n.name && n.name.toLowerCase().includes(query)) || 
               (n.ipps && n.ipps.includes(query));
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
              } else {
                  key = 'Age Not Recorded';
              }
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
    if (name === 'region') {
      setFormData({ ...formData, region: value, station: REGIONAL_HIERARCHY[value][0] || '' });
    } else {
      setFormData({ ...formData, [name]: value });
    }
  };

  const handleOperationToggle = (op) => {
    setOperation(op);
    setNotification(null);
    if (op === 'new') {
      setFormData({
        sn: null, fnum: '', rank: '', name: '', sex: 'MALE', position: '',
        dob: '', doe: '', dopost: '', dopro: '', contact: '', educlevel: '',
        ipps: '', tin: '', nin: '', homedist: '', tribe: '', accno: '', bankbranch: '',
        station: currentUser.station || REGIONAL_HIERARCHY[currentUser?.region]?.[0] || '', 
        district: '', region: currentUser.region, section: '', dir: '', status: 'ACTIVE'
      });
      setUpdateSearch('');
    }
  };

  const populateUpdateForm = (data) => {
    setFormData({ 
      ...data,
      // Force React to read the Force Number securely
      fnum: data.fnum || data.f_num 
    });
  };

  const handleArchivePersonnel = async () => {
    // 1. FIXED: We only require the Force Number now!
    if (!formData.fnum) {
      alert("Missing Force Number. Cannot archive this record.");
      return;
    }
    
    const confirmMsg = `Are you sure you want to move ${formData.name} to archives?`;
    if (!window.confirm(confirmMsg)) return;

    try {
      setNotification("Moving record to archive...");
      
      const token = localStorage.getItem('kmp_authToken');

      const response = await authFetch(`/api/v1/nominal-roll/${encodeURIComponent(formData.fnum)}/archive`, {
        method: "PUT", 
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}` 
        },
        body: JSON.stringify({ 
          archive_reason: archiveReason 
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || "Failed to archive");
      }

      const archivedRecord = {
          sn: formData.sn,
          fnum: formData.fnum,      
          rank: formData.rank,
          name: formData.name,
          sex: formData.sex,
          position: formData.position,
          dob: formData.dob,
          doe: formData.doe,
          dopost: formData.dopost,    
          dopro: formData.dopro,      
          contact: formData.contact,
          educlevel: formData.educlevel, 
          ipps: formData.ipps,
          tin: formData.tin,
          nin: formData.nin,
          homedist: formData.homedist,   
          tribe: formData.tribe,
          accno: formData.accno,         
          bankbranch: formData.bankbranch,
          station: formData.station,
          district: formData.district,
          region: formData.region,
          section: formData.section,
          dir: formData.dir,
          status: "ARCHIVED", 
          last_updated_by: `${currentUser.name} (${currentUser.fnum})`,
          archive_reason: archiveReason,
          archive_date: new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0]
      };
      
      setNominal_Roll_archives([archivedRecord, ...(Array.isArray(Nominal_Roll_archives) ? Nominal_Roll_archives : [])]);
      
      // 2. FIXED: Filter them out of the UI using fnum, not sn!
      setNominal_Rolls((Array.isArray(Nominal_Rolls) ? Nominal_Rolls : []).filter(n => (n.fnum || n.f_num) !== formData.fnum));
      
      setNotification(`Officer ${formData.name} archived successfully.`);
      handleOperationToggle('new');
      
    } catch (error) {
      console.error("Archive Error:", error);
      setNotification("Error: Could not move to archive.");
      alert(`Error archiving record: ${error.message}`);
    }
  };

 const handleFormSubmit = async (e) => { 
    e.preventDefault();
    const currentRolls = Array.isArray(Nominal_Rolls) ? Nominal_Rolls : [];
    const token = localStorage.getItem('kmp_authToken');
    
    if (!token) {
        setNotification("Error: Security token missing. Please log out and log back in.");
        return;
    }

    if (operation === 'new') {
      const isDuplicate = currentRolls.some(n => n.fnum && n.fnum.trim().toUpperCase() === formData.fnum.trim().toUpperCase());
      if (isDuplicate) {
        setNotification("Error: An officer with this Force Number already exists.");
        return;
      }

      const exactNextSN = currentRolls.length > 0 ? Math.max(...currentRolls.map(n => n.sn)) + 1 : 1;
      const newEntry = { ...formData, sn: exactNextSN, last_updated_by: `${currentUser.name} (${currentUser.fnum})` };
      
      try {
        const response = await fetch("http://127.0.0.1:8000/api/v1/nominal-roll", {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}` 
          },
          body: JSON.stringify(newEntry)
        });
        
        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.detail || "Database rejected the entry.");
        }
        
        setNominal_Rolls([newEntry, ...currentRolls]);
        setNotification(`Officer ${formData.name} recorded successfully!`);
        handleOperationToggle('new');
        
      } catch (err) {
        console.error("Save Error:", err);
        setNotification(`Error: ${err.message}`);
      }
      
    } else if (operation === 'update') {
      const updatedRecord = { ...formData, last_updated_by: `${currentUser.name} (${currentUser.fnum})` };
      
      try {
          const response = await fetch(`http://127.0.0.1:8000/api/v1/nominal-roll/${formData.sn}`, {
            method: "PUT",
            headers: { 
              "Content-Type": "application/json",
              "Authorization": `Bearer ${token}` 
            },
            body: JSON.stringify(updatedRecord)
          });
    
          if (!response.ok) throw new Error("Failed to update record.");
    
          setNominal_Rolls(currentRolls.map(n => n.sn === formData.sn ? updatedRecord : n));
          setNotification(`Officer SN ${formData.sn} successfully updated!`);
      } catch (err) {
          console.error("Update Error:", err);
          setNotification("Error: Could not update the record.");
      }
    }
  };

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6 relative z-10">
      <div className="text-center mb-8 flex flex-col items-center">
        <img src="/upf_badge.png" alt="UPF Logo" className="w-16 h-16 mb-3 object-contain" onError={(e) => { e.target.style.display = 'none'; }}/>
        <h1 className="text-3xl font-extrabold text-gray-700 tracking-tight">Master Nominal Roll</h1>
        <h3 className="text-lg text-indigo-500 mt-2 font-medium">Man-Power Auditing & Deployment Registry</h3>
      </div>
      
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
        <div className="flex flex-col md:flex-row justify-between items-center mb-4 border-b pb-2">
          <h3 className="font-bold text-slate-800 flex items-center">
            <BarChart3 className="w-5 h-5 mr-2 text-blue-600"/> Personnel Metrics Dashboard
          </h3>
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
             <MetricCard title="Active Stations" value={Object.keys(metricsData.stations).length} colorClass="text-emerald-600" />
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="bg-slate-900 px-4 py-3 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-white font-semibold flex items-center"><Users className="w-5 h-5 mr-2 text-blue-400" /> ⚙️ Log Personnel</h3>
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
                  <label className="block text-xs font-bold text-blue-800 mb-2">🔍 Search & Select Officer to Update</label>
                  <input type="text" placeholder="Search by Force No, Name, IPPS..." value={updateSearch} onChange={e => setUpdateSearch(e.target.value)} className="w-full text-sm p-2 mb-2 border border-blue-200 rounded outline-none focus:ring-2 focus:ring-blue-400" />
                  <div className="max-h-40 overflow-y-auto bg-white border border-blue-100 rounded custom-scrollbar">
                    {availableUpdateRolls.length === 0 ? (
                      <div className="p-3 text-xs text-gray-500 text-center">No personnel found.</div>
                    ) : (
                      availableUpdateRolls.map(n => (
                        <div key={n.sn} onClick={() => populateUpdateForm(n)} className={`p-2 text-xs border-b cursor-pointer transition-colors ${formData.sn === n.sn ? 'bg-blue-600 text-white font-bold' : 'hover:bg-blue-50 text-gray-700'}`}>
                          <span className={formData.sn === n.sn ? 'text-blue-200' : 'text-gray-400'}>F/NO: {n.fnum}</span> | <span className={formData.sn === n.sn ? 'text-white' : 'font-bold text-blue-700'}>{n.name}</span> | {n.station}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
              
              <form onSubmit={handleFormSubmit} className="space-y-6">
                
                {operation === 'update' && (formData.sn || formData.fnum) && (
                   <div className="bg-red-50 p-4 rounded-lg border border-red-200 space-y-3 mb-6 shadow-sm">
                      <h4 className="text-xs font-bold text-red-700 uppercase border-b border-red-200 pb-1 flex items-center">
                         <AlertTriangle size={14} className="mr-2"/> Archive / Remove Personnel
                      </h4>
                      <div className="flex space-x-2">
                         <select value={archiveReason} onChange={(e) => setArchiveReason(e.target.value)} className="flex-1 text-sm border-red-300 rounded shadow-sm border p-2 font-bold text-red-700 outline-none focus:ring-2 focus:ring-red-400">
                            <option value="TRANSFERRED">Transferred</option>
                            <option value="DEATH">Death</option>
                            <option value="DISMISSAL">Dismissal</option>
                            <option value="DESERTION">Desertion</option>
                            <option value="RETIREMENT">Retirement</option>
                         </select>
                         <button type="button" onClick={handleArchivePersonnel} className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded font-bold text-sm shadow transition border border-red-800">
                            Move to Archive
                         </button>
                      </div>
                   </div>
                )}

                {operation === 'update' && (formData.sn || formData.fnum) && (
                   <div className="bg-slate-800 text-white text-xs font-bold px-3 py-2 rounded">
                     Currently Editing Record: {formData.fnum}
                   </div>
                )}

                {operation === 'update' && formData.sn && (
                   <div className="bg-slate-800 text-white text-xs font-bold px-3 py-2 rounded">
                     Currently Editing Record SN: {formData.sn}
                   </div>
                )}
                
                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 space-y-4">
                  <h4 className="text-xs font-bold text-gray-500 uppercase border-b pb-1">1. Primary Identifiers</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-700 mb-1">F/NO. *</label>
                      <input type="text" name="fnum" value={formData.fnum} onChange={handleInputChange} required className="w-full text-sm border-gray-300 rounded shadow-sm border p-2 uppercase" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-700 mb-1">IPPS NO. *</label>
                      <input type="text" name="ipps" value={formData.ipps} onChange={handleInputChange} required className="w-full text-sm border-gray-300 rounded shadow-sm border p-2" />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-[10px] font-bold text-gray-700 mb-1">NAME *</label>
                      <input type="text" name="name" value={formData.name} onChange={handleInputChange} required className="w-full text-sm border-gray-300 rounded shadow-sm border p-2 uppercase" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-700 mb-1">RANK *</label>
                      <input type="text" name="rank" value={formData.rank} onChange={handleInputChange} required className="w-full text-sm border-gray-300 rounded shadow-sm border p-2" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-700 mb-1">SEX</label>
                      <select name="sex" value={formData.sex} onChange={handleInputChange} className="w-full text-sm border-gray-300 rounded shadow-sm border p-2 bg-white">
                        <option>MALE</option><option>FEMALE</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-700 mb-1">TIN NO.</label>
                      <input type="text" name="tin" value={formData.tin} onChange={handleInputChange} className="w-full text-sm border-gray-300 rounded shadow-sm border p-2" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-700 mb-1">NIN</label>
                      <input type="text" name="nin" value={formData.nin} onChange={handleInputChange} className="w-full text-sm border-gray-300 rounded shadow-sm border p-2" />
                    </div>
                  </div>
                </div>

                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 space-y-4">
                  <h4 className="text-xs font-bold text-gray-500 uppercase border-b pb-1">2. Service & Placement</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-700 mb-1">REGION *</label>
                      <select name="region" value={formData.region} onChange={handleInputChange} disabled={!['ADMIN', 'SUPER_ADMIN'].includes(currentUser.role)} required className="w-full text-sm border-gray-300 rounded shadow-sm border p-2 bg-white">
                        {['ADMIN', 'SUPER_ADMIN'].includes(currentUser.role) ? Object.keys(REGIONAL_HIERARCHY).map(reg => <option key={reg} value={reg}>{reg}</option>) : <option value={currentUser.region}>{currentUser.region}</option>}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-700 mb-1">DUTY STATION *</label>
                      <select name="station" value={formData.station} onChange={handleInputChange} required className="w-full text-sm border-gray-300 rounded shadow-sm border p-2 bg-white">
                        {REGIONAL_HIERARCHY[formData.region].map(stat => <option key={stat} value={stat}>{stat}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-700 mb-1">POSITION *</label>
                      <input type="text" name="position" value={formData.position} onChange={handleInputChange} required className="w-full text-sm border-gray-300 rounded shadow-sm border p-2" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-700 mb-1">DISTRICT</label>
                      <input type="text" name="district" value={formData.district} onChange={handleInputChange} className="w-full text-sm border-gray-300 rounded shadow-sm border p-2" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-700 mb-1">SECTION</label>
                      <input type="text" name="section" value={formData.section} onChange={handleInputChange} className="w-full text-sm border-gray-300 rounded shadow-sm border p-2" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-700 mb-1">DIR (Directorate)</label>
                      <input type="text" name="dir" value={formData.dir} onChange={handleInputChange} className="w-full text-sm border-gray-300 rounded shadow-sm border p-2" />
                    </div>
                  </div>
                </div>

                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 space-y-4">
                  <h4 className="text-xs font-bold text-gray-500 uppercase border-b pb-1">3. Dates & Demographics</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-700 mb-1">D.O.B</label>
                      <input type="date" name="dob" value={formData.dob} onChange={handleInputChange} className="w-full text-sm border-gray-300 rounded shadow-sm border p-2" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-700 mb-1">D.O.E</label>
                      <input type="date" name="doe" value={formData.doe} onChange={handleInputChange} className="w-full text-sm border-gray-300 rounded shadow-sm border p-2" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-700 mb-1">D.O. POST</label>
                      <input type="date" name="dopost" value={formData.dopost} onChange={handleInputChange} className="w-full text-sm border-gray-300 rounded shadow-sm border p-2" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-700 mb-1">D.O. PRO</label>
                      <input type="date" name="dopro" value={formData.dopro} onChange={handleInputChange} className="w-full text-sm border-gray-300 rounded shadow-sm border p-2" />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-[10px] font-bold text-gray-700 mb-1">CONTACT</label>
                      <input type="text" name="contact" value={formData.contact} onChange={handleInputChange} className="w-full text-sm border-gray-300 rounded shadow-sm border p-2" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-700 mb-1">EDUC LEVEL</label>
                      <input type="text" name="educlevel" value={formData.educlevel} onChange={handleInputChange} className="w-full text-sm border-gray-300 rounded shadow-sm border p-2" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-700 mb-1">HOME DIST</label>
                      <input type="text" name="homedist" value={formData.homedist} onChange={handleInputChange} className="w-full text-sm border-gray-300 rounded shadow-sm border p-2" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-700 mb-1">TRIBE</label>
                      <input type="text" name="tribe" value={formData.tribe} onChange={handleInputChange} className="w-full text-sm border-gray-300 rounded shadow-sm border p-2" />
                    </div>
                  </div>
                </div>

                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 space-y-4">
                  <h4 className="text-xs font-bold text-gray-500 uppercase border-b pb-1">4. Financial & Status</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-700 mb-1">ACC. NO</label>
                      <input type="text" name="accno" value={formData.accno} onChange={handleInputChange} className="w-full text-sm border-gray-300 rounded shadow-sm border p-2" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-700 mb-1">BANK & BRANCH</label>
                      <input type="text" name="bankbranch" value={formData.bankbranch} onChange={handleInputChange} className="w-full text-sm border-gray-300 rounded shadow-sm border p-2" />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-[10px] font-bold text-gray-700 mb-1">STATUS</label>
                      <select name="status" value={formData.status} onChange={handleInputChange} className="w-full text-sm border-gray-300 rounded shadow-sm border p-2 bg-white font-bold">
                        <option>ACTIVE</option>
                        <option>ON LEAVE</option>
                        <option>SUSPENDED</option>
                      </select>
                    </div>
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
             <select value={filterRegion} onChange={(e) => { setFilterRegion(e.target.value); setFilterStation('ALL STATIONS'); }} disabled={!['ADMIN', 'SUPER_ADMIN'].includes(currentUser.role)} className="border rounded-lg px-3 py-2 text-sm shadow-sm bg-white">
               {['ADMIN', 'SUPER_ADMIN'].includes(currentUser.role) && <option value="ALL REGIONS">ALL REGIONS</option>}
               {['ADMIN', 'SUPER_ADMIN'].includes(currentUser.role) ? (
                 Object.keys(REGIONAL_HIERARCHY).map(reg => <option key={reg} value={reg}>{reg}</option>)
               ) : (
                 <option value={currentUser.region}>{currentUser.region}</option>
               )}
             </select>
             <select value={filterStation} onChange={(e) => setFilterStation(e.target.value)} className="border rounded-lg px-3 py-2 text-sm shadow-sm bg-white">
               <option value="ALL STATIONS">ALL STATIONS</option>
               {filterRegion !== 'ALL REGIONS' && REGIONAL_HIERARCHY[filterRegion].map(stat => <option key={stat} value={stat}>{stat}</option>)}
             </select>
          </div>

          {viewMode === 'metrics' ? (
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm animate-in fade-in zoom-in-95 duration-200">
                <div className="flex justify-between items-center mb-6 border-b pb-4">
                    <h3 className="font-extrabold text-lg text-indigo-900 flex items-center"><PieChart className="mr-2"/> Nominal Roll Analytics</h3>
                    <div className="flex items-center space-x-2 bg-indigo-50 p-2 rounded-lg border border-indigo-100">
                       <label className="text-xs font-bold text-indigo-800 uppercase">Categorize By:</label>
                       <select value={metricCategory} onChange={e => setMetricCategory(e.target.value)} className="border border-indigo-300 rounded p-1 text-sm font-bold text-indigo-700 outline-none bg-white">
                          <option value="RANK">Rank Breakdown</option>
                          <option value="UNIT">Unit / Station Breakdown</option>
                          <option value="AGE">Age Demographics</option>
                          <option value="SEX">Sex Distribution</option>
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
            
            <ExpandableTableCard 
               title={viewMode === 'active' ? "Active Nominal Roll" : "Archived Personnel Ledger"}
               onToggle={(expanded) => {
                 if (setSidebarOpen) {
                   setSidebarOpen(!expanded); 
                 }
               }}
            >
              <div className="overflow-x-auto w-full">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50 sticky top-0 z-10">
                    <tr>
                      <th className="px-3 py-3 text-left text-[10px] font-bold text-gray-500 uppercase whitespace-nowrap">S/No</th>
                      <th className="px-3 py-3 text-left text-[10px] font-bold text-gray-500 uppercase whitespace-nowrap">F/NO.</th>
                      <th className="px-3 py-3 text-left text-[10px] font-bold text-gray-500 uppercase whitespace-nowrap">RANK</th>
                      <th className="px-3 py-3 text-left text-[10px] font-bold text-gray-500 uppercase whitespace-nowrap">NAME</th>
                      <th className="px-3 py-3 text-left text-[10px] font-bold text-gray-500 uppercase whitespace-nowrap">SEX</th>
                      <th className="px-3 py-3 text-left text-[10px] font-bold text-gray-500 uppercase whitespace-nowrap">POSITION</th>
                      <th className="px-3 py-3 text-left text-[10px] font-bold text-gray-500 uppercase whitespace-nowrap">D.O.B</th>
                      <th className="px-3 py-3 text-left text-[10px] font-bold text-gray-500 uppercase whitespace-nowrap">D.O.E</th>
                      <th className="px-3 py-3 text-left text-[10px] font-bold text-gray-500 uppercase whitespace-nowrap">D.O. POST</th>
                      <th className="px-3 py-3 text-left text-[10px] font-bold text-gray-500 uppercase whitespace-nowrap">CONTACT</th>
                      <th className="px-3 py-3 text-left text-[10px] font-bold text-gray-500 uppercase whitespace-nowrap">IPPS NO.</th>
                      <th className="px-3 py-3 text-left text-[10px] font-bold text-gray-500 uppercase whitespace-nowrap">DUTY STATION</th>
                      <th className="px-3 py-3 text-left text-[10px] font-bold text-gray-500 uppercase whitespace-nowrap">STATUS</th>
                      {viewMode === 'archive' && (
                        <>
                          <th className="px-3 py-3 text-left text-[10px] font-bold text-red-600 uppercase whitespace-nowrap bg-red-50">REASON</th>
                          <th className="px-3 py-3 text-left text-[10px] font-bold text-red-600 uppercase whitespace-nowrap bg-red-50">DATE ARCHIVED</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {(viewMode === 'active' ? filteredRolls : filteredNominal_Roll_archives).map((n) => (
                      <tr key={n.sn} className={`${viewMode === 'archive' ? 'bg-slate-50 opacity-80' : 'hover:bg-blue-50'} transition-colors cursor-pointer`} 
                          onClick={() => { 
                             if(viewMode === 'active') {
                                setOperation('update');
                                populateUpdateForm(n); 
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                             }
                          }}>
                        <td className="px-3 py-2 whitespace-nowrap text-[11px] font-bold text-gray-900">{n.sn}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-[11px] font-bold text-blue-800">{n.fnum || n.f_num}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-[11px] font-bold">{n.rank}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-[11px] font-medium">{n.name}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-[11px]">{n.sex}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-[11px] text-gray-700">{n.position}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-[11px] text-gray-500">{n.dob}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-[11px] text-gray-500">{n.doe}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-[11px] text-gray-500">{n.dopost}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-[11px]">{n.contact}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-[11px] font-mono">{n.ipps}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-[11px] font-bold text-blue-700">{n.station}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-[11px] font-bold text-green-700">{n.status}</td>
                        {viewMode === 'archive' && (
                          <>
                            <td className="px-3 py-2 whitespace-nowrap text-[11px] font-bold text-red-700 bg-red-50/50">{n.archive_reason}</td>
                            <td className="px-3 py-2 whitespace-nowrap text-[11px] text-red-500 bg-red-50/50">{n.archive_date}</td>
                          </>
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
  const [activityLogs, setActivityLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  
  // State for real pending users from database
  const [realPendingUsers, setRealPendingUsers] = useState([]);
  const [loadingPending, setLoadingPending] = useState(false);

  // Derive role checks for regional commanders
  const isRPC = currentUser && currentUser.role === 'RPC';
  const isSystemAdmin = currentUser && ['ADMIN', 'SUPER_ADMIN'].includes(currentUser.role);

  // 👇 EXACTLY HERE: This is where that block lives! 👇
  useEffect(() => {
    if (activeTab === 'approvals') {
      setLoadingPending(true);
      authFetch("/api/v1/admin/pending-users")
        .then(res => res.json())
        .then(data => { setRealPendingUsers(Array.isArray(data) ? data : []); setLoadingPending(false); })
        .catch(err => { console.error(err); setLoadingPending(false); });
    } else if (activeTab === 'requests') {
      setLoadingRequests(true);
      authFetch("/api/v1/requests")
        .then(res => res.json())
        .then(data => { 
            const filteredData = Array.isArray(data) ? data.filter(req => {
                if (isSystemAdmin) return true;
                if (isRPC) return req.requested_region === currentUser.region;
                return false;
            }) : [];
            setModRequests(filteredData); 
            setLoadingRequests(false); 
        })
        .catch(err => { console.error(err); setLoadingRequests(false); });

    // 🟢 THIS IS YOUR BLOCK 🟢
    } else if (activeTab === 'logs') {
      setLoadingLogs(true);
      // Make sure this says /audit-logs
      authFetch("/api/v1/audit-logs")
        .then(res => res.json())
        .then(data => { 
            // Safety wrapper to ensure it only sets an array
            setActivityLogs(Array.isArray(data) ? data : []); 
            setLoadingLogs(false); 
        })
        .catch(err => { console.error(err); setLoadingLogs(false); });
    }
  }, [activeTab, currentUser, isRPC, isSystemAdmin]);

  const handleApproveUser = async (fnum) => {
  try {
    const response = await authFetch(`/api/v1/admin/approve-user/${encodeURIComponent(fnum)}`, {
      method: "PATCH"
    });

    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData.detail || "Failed to approve user.");
    }

    // Remove the user from the UI list upon success
    setRealPendingUsers(realPendingUsers.filter(u => u.fnum !== fnum));
    alert(`Officer ${fnum} successfully authorized!`);
    
  } catch (err) {
    console.error(err);
    alert(`Authorization Failed: ${err.message}`);
  }
};

{/* TAB 3: SYSTEM Audit_Logs */}
      {activeTab === 'logs' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden max-w-6xl mx-auto">
           <div className="bg-slate-900 px-4 py-3 border-b border-gray-200 flex items-center text-white font-semibold">
              <Activity className="w-5 h-5 mr-2 text-blue-400" /> System Audit Logs
           </div>
           <div className="overflow-x-auto">
             <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Date & Time</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Event Type</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Target User</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Status/Details</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {loadingLogs ? (
                     <tr><td colSpan="4" className="p-8 text-center text-sm text-gray-500 font-bold animate-pulse">Fetching audit logs from database...</td></tr>
                  ) : activityLogs.length === 0 ? (
                    <tr><td colSpan="4" className="p-4 text-center text-sm text-gray-500">No security events found in the audit_logs table.</td></tr>
                  ) : (
                    activityLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-500 font-mono">
                          {log.created_at ? new Date(log.created_at).toLocaleString() : 'Unknown Time'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-bold text-slate-700">{log.event_type}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-blue-600">{log.user_fnum || log.target_user}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          <span className={`mr-2 px-2 py-0.5 inline-flex text-[10px] leading-5 font-bold rounded-full ${log.status === 'SUCCESS' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                            {log.status}
                          </span> 
                          {log.details}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
        </div>
      )}

return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6 relative z-10 animate-in fade-in duration-300">
      <div className="text-center mb-8 flex flex-col items-center">
        <img src="/upf_badge.png" alt="UPF Logo" className="w-16 h-16 mb-3 object-contain" />
        <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight">Access & Command Approvals</h1>
        <h3 className="text-lg text-gray-500 mt-2 font-medium">Review pending officer signups, HR transfers, and Audit_Logs.</h3>
      </div>

      <div className="flex space-x-2 border-b border-gray-200 mb-6 bg-white/50 backdrop-blur rounded-t-xl px-4 pt-4 overflow-x-auto custom-scrollbar">
        <button onClick={() => setActiveTab('approvals')} className={`pb-3 px-4 text-sm font-bold border-b-2 transition-colors whitespace-nowrap ${activeTab === 'approvals' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
          New Account Authorizations ({loadingPending ? '...' : realPendingUsers.length})
        </button>
        <button onClick={() => setActiveTab('requests')} className={`pb-3 px-4 text-sm font-bold border-b-2 transition-colors whitespace-nowrap ${activeTab === 'requests' ? 'border-yellow-500 text-yellow-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
          HR Modification Requests ({activeTab === 'requests' ? modRequests.length : '?'})
        </button>
        <button onClick={() => setActiveTab('logs')} className={`pb-3 px-4 text-sm font-bold border-b-2 transition-colors whitespace-nowrap ${activeTab === 'logs' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
          Audit_Logs
        </button>
      </div>

      {activeTab === 'approvals' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden max-w-6xl mx-auto">
          {loadingPending ? (
            <div className="p-8 text-center text-gray-500 font-medium animate-pulse">
              Syncing with Command Database...
            </div>
          ) : realPendingUsers.length === 0 ? (
            <div className="p-8 text-center text-gray-500 font-medium">
              No active unapproved access requests pending in queue.
            </div>
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
                  {realPendingUsers.map(u => (
                    <tr key={u.fnum} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-sm flex items-center space-x-3">
                        {u.profile_photo_path && (
                          <img src={u.profile_photo_path} alt="" className="w-10 h-10 rounded-full bg-slate-100 object-cover border border-gray-200" onError={(e) => { e.target.style.display='none'; }} />
                        )}
                        <div>
                          <div className="font-bold text-gray-900">{u.name} ({u.fnum})</div>
                          <div className="text-gray-500 text-xs">Rank: {u.rank} | IPPS: {u.ipps}</div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div className="font-medium text-gray-700">{u.station}</div>
                        <div className="text-gray-500 text-xs">{u.region}</div>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span className={`px-2 py-1 inline-flex text-xs font-bold rounded-full ${u.role === 'ADMIN' || u.role === 'SUPER_ADMIN' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`}>
                          {u.role}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <button onClick={() => handleApproveUser(u.fnum)} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-1 px-3 rounded text-xs transition">
                          Approve Access
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'requests' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden max-w-6xl mx-auto">
          <div className="bg-slate-900 px-4 py-3 border-b border-gray-200 flex items-center text-white font-semibold">
            <Shield className="w-5 h-5 mr-2 text-yellow-400" /> Pending Command Authorization Hub
          </div>
          {loadingRequests ? (
            <div className="p-8 text-center text-gray-500 font-medium animate-pulse">Syncing with Central Database...</div>
          ) : modRequests.length === 0 ? (
            <div className="p-8 text-center text-gray-500 font-medium">No pending modification requests in the ledger.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Req ID</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Officer File No.</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Requested Modifications</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Command Action</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {modRequests.map((req) => (
                    <tr key={req.id} className="hover:bg-yellow-50/50">
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-bold text-gray-500">#{req.id}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-extrabold text-blue-700">{req.fnum}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 space-y-1">
                        {req.requested_name && <div><span className="font-bold text-xs uppercase text-gray-400">Name:</span> <span className="font-medium">{req.requested_name}</span></div>}
                        {req.requested_rank && <div><span className="font-bold text-xs uppercase text-gray-400">Rank:</span> <span className="font-medium bg-blue-100 text-blue-800 px-1 rounded">{req.requested_rank}</span></div>}
                        {req.requested_region && <div><span className="font-bold text-xs uppercase text-gray-400">Region:</span> <span className="font-medium">{req.requested_region}</span></div>}
                        {req.requested_station && <div><span className="font-bold text-xs uppercase text-gray-400">Station:</span> <span className="font-medium bg-yellow-100 text-yellow-800 px-1 rounded">{req.requested_station}</span></div>}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">
                        <div className="flex space-x-2">
                          <button onClick={() => handleReviewRequest(req.id, "APPROVED")} className="bg-green-600 hover:bg-green-700 text-white font-bold py-1.5 px-3 rounded text-xs transition flex items-center shadow-sm">
                            <CheckCircle size={14} className="mr-1" /> Approve
                          </button>
                          <button onClick={() => handleReviewRequest(req.id, "REJECTED")} className="bg-red-100 hover:bg-red-200 text-red-700 border border-red-300 font-bold py-1.5 px-3 rounded text-xs transition flex items-center shadow-sm">
                            <X size={14} className="mr-1" /> Reject
                          </button>
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

      {/* TAB 3: SYSTEM Audit_Logs */}
      {activeTab === 'logs' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden max-w-6xl mx-auto">
           <div className="bg-slate-900 px-4 py-3 border-b border-gray-200 flex items-center text-white font-semibold">
              <Activity className="w-5 h-5 mr-2 text-blue-400" /> System Events Ledger
           </div>
           <div className="overflow-x-auto">
             <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Created_at</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Event Type</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Target User</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Status/Details</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {loadingLogs ? (
                     <tr><td colSpan="4" className="p-8 text-center text-sm text-gray-500 font-bold animate-pulse">Decrypting server logs...</td></tr>
                  ) : activityLogs.length === 0 ? (
                    <tr><td colSpan="4" className="p-4 text-center text-sm text-gray-500">No recent security events logged.</td></tr>
                  ) : (
                    activityLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-500 font-mono">
                          {new Date(log.created_at).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-bold text-slate-700">{log.event_type}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-blue-600">{log.user_fnum}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          <span className={`mr-2 px-2 py-0.5 inline-flex text-[10px] leading-5 font-bold rounded-full ${log.status === 'ALERT TRIGGERED' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
                            {log.status}
                          </span> 
                          {log.details}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
        </div>
      )}
    </div>
  );
};

    
// ====================================================================
// --- PROFILE UPDATE SYSTEM (COMMAND WORKFLOW ENABLED FOR ALL USERS) ---
// ====================================================================
const AdminProfile = ({ currentUser, setCurrentUser }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [isRequestMode, setIsRequestMode] = useState(false);
  const [notification, setNotification] = useState(null);
  
  const canAutoApprove = ['SUPER_ADMIN', 'ADMIN'].includes(currentUser.role);

  const [formData, setFormData] = useState({
    name: currentUser.name || '',
    rank: currentUser.rank || '',
    region: currentUser.region || '',
    station: currentUser.station || '',
    email: currentUser.email || '',
    phone: currentUser.phone || '',
    password: '', 
    profile_photo_path: currentUser.profile_photo_path || ''
  });

  const handleInputChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleRequestSubmit = async (e) => {
    if (e) e.preventDefault();
    setNotification("⏳ Sending official request to Command...");

    try {
      const response = await authFetch("/api/v1/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fnum: currentUser.fnum,
          requested_name: formData.name !== currentUser.name ? formData.name : null,
          requested_rank: formData.rank !== currentUser.rank ? formData.rank : null,
          requested_region: formData.region !== currentUser.region ? formData.region : null,
          requested_station: formData.station !== currentUser.station ? formData.station : null,
        })
      });

      if (!response.ok) throw new Error("Failed to send request.");
      
      setNotification("✅ Request successfully logged for Command review.");
      setIsRequestMode(false);
      
      setFormData({
         ...formData,
         name: currentUser.name, 
         rank: currentUser.rank, 
         region: currentUser.region, 
         station: currentUser.station
      });
      
      setTimeout(() => setNotification(null), 5000);

    } catch (err) {
      console.error(err);
      setNotification("❌ Error: Failed to contact Command.");
    }
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    setNotification("Saving profile details...");

    try {
      const response = await authFetch("/api/v1/users/me", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData)
      });

      if (!response.ok) throw new Error("Failed to update database.");

      setCurrentUser({
        ...currentUser,
        name: canAutoApprove ? formData.name : currentUser.name,
        rank: canAutoApprove ? formData.rank : currentUser.rank,
        region: canAutoApprove ? formData.region : currentUser.region,
        station: canAutoApprove ? formData.station : currentUser.station,
        email: formData.email,
        phone: formData.phone,
        profile_photo_path: formData.profile_photo_path
      });

      setNotification("✅ Profile successfully updated!");
      setIsEditing(false); 
      setIsRequestMode(false);
      setTimeout(() => setNotification(null), 4000);

    } catch (err) {
      console.error(err);
      setNotification("❌ Error: Failed to update profile.");
    }
  };

  // Unified submission handler
  const handleProfileSave = (e) => {
     e.preventDefault();
     if (canAutoApprove) {
         handleSubmit(e);
     } else {
         handleRequestSubmit(e);
     }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6 mt-10 relative z-10 animate-in fade-in duration-300">
      <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
        <div className="bg-slate-900 px-6 py-8 border-b border-gray-200 flex justify-between items-center relative">
          <div className="flex items-center z-10">
            <div className="relative group">
              {formData.profile_photo_path ? (
                <img src={formData.profile_photo_path} alt="" className="w-24 h-24 rounded-full object-cover shadow-2xl border-4 border-slate-700 bg-white" onError={(e) => { e.target.style.display='none'; }} />
              ) : (
                <div className="w-24 h-24 bg-blue-600 rounded-full flex items-center justify-center text-white font-extrabold text-4xl shadow-2xl border-4 border-slate-700">
                  {currentUser.name?.charAt(0) || 'A'}
                </div>
              )}
            </div>
            <div className="ml-6 text-white">
              <h2 className="text-3xl font-extrabold tracking-tight">{currentUser.name}</h2>
              <p className="text-blue-300 font-medium tracking-wide mt-1 uppercase text-sm">
                {currentUser.rank} • {currentUser.station} • {currentUser.region}
              </p>
            </div>
          </div>
          
          <button 
            onClick={() => { setIsEditing(!isEditing); setIsRequestMode(false); }} 
            className={`z-10 flex items-center px-4 py-2 rounded-lg font-bold transition-colors shadow-sm ${isEditing ? 'bg-slate-700 text-white border border-slate-600' : 'bg-blue-600 text-white hover:bg-blue-500'}`}
          >
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
              
              {/* HR ZONE (Dynamic Workflow) */}
              <div className={`p-6 rounded-xl border transition-colors duration-300 ${canAutoApprove ? 'bg-blue-50 border-blue-200' : isRequestMode ? 'bg-yellow-50 border-yellow-300' : 'bg-slate-100 border-slate-200'}`}>
                <div className="flex justify-between items-center mb-4 border-b pb-2 border-slate-200/50">
                  <div className={`flex items-center text-xs font-extrabold uppercase tracking-wider ${canAutoApprove ? 'text-blue-700' : isRequestMode ? 'text-yellow-700' : 'text-slate-500'}`}>
                    {canAutoApprove ? <Unlock size={14} className="mr-2" /> : isRequestMode ? <Edit size={14} className="mr-2" /> : <Lock size={14} className="mr-2" />} 
                    Official Deployment Records {canAutoApprove ? "(Admin Override Active)" : isRequestMode ? "(Drafting Request)" : "(Restricted)"}
                  </div>
                  
                  {!canAutoApprove && !isRequestMode && (
                    <button type="button" onClick={() => setIsRequestMode(true)} className="text-[10px] bg-slate-800 hover:bg-slate-700 text-white px-3 py-1.5 rounded font-bold transition flex items-center shadow-sm">
                      <Shield size={12} className="mr-1"/> Request Modification
                    </button>
                  )}
                  {!canAutoApprove && isRequestMode && (
                    <button type="button" onClick={handleRequestSubmit} className="text-[10px] bg-yellow-600 hover:bg-yellow-500 text-white px-3 py-1.5 rounded font-bold transition flex items-center shadow-sm">
                      <Send size={12} className="mr-1"/> Send Official Request
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Full Name</label>
                    <input type="text" name="name" value={formData.name} onChange={handleInputChange} disabled={!canAutoApprove && !isRequestMode} className={`w-full p-2.5 rounded-lg font-bold border ${canAutoApprove || isRequestMode ? 'bg-white border-blue-300 text-gray-900 focus:ring-2 focus:ring-blue-500' : 'bg-gray-200 border-gray-300 text-gray-600 cursor-not-allowed'}`} />
                  </div>
                  <div className="flex gap-4">
                    <div className="w-1/2">
                      <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Force Number</label>
                      <input type="text" value={currentUser.fnum} disabled className="w-full p-2.5 bg-gray-200 border border-gray-300 rounded-lg font-bold text-gray-600 cursor-not-allowed" />
                    </div>
                    <div className="w-1/2">
                      <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Rank</label>
                      <input type="text" name="rank" value={formData.rank} onChange={handleInputChange} disabled={!canAutoApprove && !isRequestMode} className={`w-full p-2.5 rounded-lg font-bold border ${canAutoApprove || isRequestMode ? 'bg-white border-blue-300 text-gray-900 focus:ring-2 focus:ring-blue-500' : 'bg-gray-200 border-gray-300 text-gray-600 cursor-not-allowed'}`} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Command Region</label>
                    <input type="text" name="region" value={formData.region} onChange={handleInputChange} disabled={!canAutoApprove && !isRequestMode} className={`w-full p-2.5 rounded-lg font-bold border ${canAutoApprove || isRequestMode ? 'bg-white border-blue-300 text-gray-900 focus:ring-2 focus:ring-blue-500' : 'bg-gray-200 border-gray-300 text-gray-600 cursor-not-allowed'}`} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Assigned Station</label>
                    <input type="text" name="station" value={formData.station} onChange={handleInputChange} disabled={!canAutoApprove && !isRequestMode} className={`w-full p-2.5 rounded-lg font-bold border ${canAutoApprove || isRequestMode ? 'bg-white border-blue-300 text-gray-900 focus:ring-2 focus:ring-blue-500' : 'bg-gray-200 border-gray-300 text-gray-600 cursor-not-allowed'}`} />
                  </div>
                </div>
              </div>

              {/* EDITABLE PERSONAL ZONE (Always available via standard save) */}
              <form onSubmit={handleSubmit} className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                <div className="flex items-center text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-4 border-b border-gray-100 pb-2">
                  <Edit size={14} className="mr-2" /> Editable Contact Data
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-700 uppercase tracking-wider mb-1">Official Email</label>
                    <input type="email" name="email" value={formData.email} onChange={handleInputChange} className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-medium text-gray-900" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-700 uppercase tracking-wider mb-1">Contact Number</label>
                    <input type="tel" name="phone" value={formData.phone} onChange={handleInputChange} className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-medium text-gray-900" />
                  </div>
                </div>
                <div className="flex justify-end pt-4 mt-2 border-t border-gray-100">
                  <button type="submit" className="bg-blue-700 hover:bg-blue-800 text-white font-bold py-2 px-6 rounded-lg shadow-md transition-colors flex items-center text-sm">
                    💾 Save Contact Details
                  </button>
                </div>
              </form>
            </div>
          ) : (
             <div className="grid grid-cols-1 sm:grid-cols-4 gap-6">
                <div className="bg-gray-50 p-4 rounded-lg border border-gray-100"><label className="text-[10px] text-gray-500 font-bold uppercase block mb-1">Force Number</label><p className="font-extrabold text-gray-900 text-lg">{currentUser.fnum}</p></div>
                <div className="bg-gray-50 p-4 rounded-lg border border-gray-100"><label className="text-[10px] text-gray-500 font-bold uppercase block mb-1">Role Level</label><p className={`font-extrabold text-lg ${canAutoApprove ? 'text-green-600' : 'text-blue-600'}`}>{currentUser.role}</p></div>
                <div className="bg-gray-50 p-4 rounded-lg border border-gray-100"><label className="text-[10px] text-gray-500 font-bold uppercase block mb-1">Email</label><p className="font-bold text-gray-900 truncate">{currentUser.email || "N/A"}</p></div>
                <div className="bg-gray-50 p-4 rounded-lg border border-gray-100"><label className="text-[10px] text-gray-500 font-bold uppercase block mb-1">Phone</label><p className="font-bold text-gray-900 truncate">{currentUser.phone || "N/A"}</p></div>
             </div>
          )}
        </div>
      </div>
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
    fnum: '', ipps: '', name: '', rank: '', sex: 'MALE', region: 'KMP NORTH', station: 'KAWEMPE', position: '',
    email: '', phone: '', password: '', profile_photo_path: ''
  });

  const availablePositions = [
    ...POSITIONS.ADMIN, 
    ...POSITIONS.RPC, 
    `${signupData.region} Commander`,
    `Divisional Commander ${signupData.station}`,
    `CID Officer ${signupData.station}`,
    `Data Officer ${signupData.station}`
  ];

  const [attempts, setAttempts] = useState(0);
  const [lockoutEnd, setLockoutEnd] = useState(null);
  const [timeLeft, setTimeLeft] = useState(0);

  useEffect(() => {
    if (!lockoutEnd) return;
    const interval = setInterval(() => {
      const remaining = Math.ceil((lockoutEnd - Date.now()) / 1000);
      if (remaining <= 0) {
        setLockoutEnd(null);
        setAttempts(0);
        setTimeLeft(0);
      } else {
        setTimeLeft(remaining);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [lockoutEnd]);

  const handleSignupChange = (e) => {
    const { name, value } = e.target;
    if (name === 'region') {
      setSignupData({ ...signupData, region: value, station: REGIONAL_HIERARCHY[value][0], position: '' });
    } else if (name === 'station') {
      setSignupData({ ...signupData, station: value, position: '' });
    } else {
      setSignupData({ ...signupData, [name]: value });
    }
  };

const handlePhotoUpload = async (e) => {
  const file = e.target.files[0];
  if (file) {
    setAuthMessage("Uploading photo to secure S3 bucket...");
    
    // Create a controller to timeout the upload if it hangs
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15-second limit

    const uploadData = new FormData();
    uploadData.append("file", file);
    uploadData.append("category", "profile"); 
    uploadData.append("case_id", signupData.fnum || "REGISTRATION");
    uploadData.append("narrative", "Profile Photo Upload");

    try {
      const response = await authFetch("/api/v1/investigation/upload/", {
        method: "POST",
        body: uploadData,
        signal: controller.signal // Attaches the timeout controller
      });

      clearTimeout(timeoutId); // Success: stop the timeout timer

      const data = await response.json();
      if (data.full_s3_url || data.cloud_storage_path) {
        setSignupData({ 
          ...signupData, 
          profile_photo_path: data.full_s3_url || `https://kmp-tracker-system-tu-16-06-26.s3.eu-central-1.amazonaws.com/${data.cloud_storage_path}` 
        });
        setAuthMessage("Photo uploaded to S3 successfully!");
      } else {
        throw new Error("Invalid response format");
      }
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError') {
        setAuthMessage("❌ Upload timed out. Please check your connection and try a smaller file.");
        console.error("Upload timeout");
      } else {
        console.warn("Backend unreachable, falling back to local Blob URL for UI testing.", error);
        const localUrl = URL.createObjectURL(file);
        setSignupData({ ...signupData, profile_photo_path: localUrl });
        setAuthMessage("Note: API offline or error occurred. Using temporary local preview.");
      }
    }
  }
};

const handleSignupSubmit = (e) => {
    e.preventDefault();

    // 1. Check if the user is already pending approval
    const isAlreadyPending = pendingUsers.some(u => u.fnum.toUpperCase() === signupData.fnum.toUpperCase());
    if (isAlreadyPending) {
      setAuthMessage("⚠️ Access Request Denied: Your Force Number is already in the queue awaiting Admin approval.");
      return;
    }

    // 2. Check if the user is already an active, approved user
    const isAlreadyActive = activeUsers.some(u => u.fnum.toUpperCase() === signupData.fnum.toUpperCase());
    if (isAlreadyActive) {
      setAuthMessage("⚠️ Error: An account with this Force Number already exists. Please return to the login screen.");
      return;
    }

    // 3. Proceed with determining role and submitting
    let derivedRole = 'USER';
    if (signupData.position === 'System Manager') derivedRole = 'SUPER_ADMIN';
    else if (POSITIONS.ADMIN.includes(signupData.position) || signupData.position.includes('Divisional Commander') || signupData.station === 'KMP HEADQUARTERS' || signupData.station === 'KMP Headquarters' || signupData.region === 'POLICE HEADQUARTERS') derivedRole = 'ADMIN';
    else if (POSITIONS.RPC.includes(signupData.position) || signupData.position.includes(`${signupData.region} Commander`)) derivedRole = 'RPC';

    const pendingUser = { ...signupData, role: derivedRole };
    onSignup(pendingUser);
    
    setAuthMessage(`✅ Account Request Submitted! Pending Admin Approval.`);
    setMode('login');
    setTimeout(() => setAuthMessage(null), 5000);
  };

const handleLoginSubmit = async (e) => { 
  e.preventDefault();
  if (lockoutEnd) return;

  if (mode === 'login') {
    try {
      const formData = new URLSearchParams();
      // .trim() removes any accidental hidden spaces you might have typed!
      formData.append('username', fnum.trim()); 
      formData.append('password', password.trim());

      // 🚨 THE FIX: Use standard 'fetch' here instead of 'authFetch'
      const response = await fetch('http://127.0.0.1:8000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData, 
      });

      const data = await response.json();

      if (response.ok) {
        localStorage.setItem('kmp_authToken', data.access_token);
        onLogin({ 
           fnum: data.fnum || 'A/2408', 
           rank: data.rank || 'AIP',
           name: data.name || 'Afedra Vincent',
           sex: data.sex || 'MALE',
           ipps: data.ipps || '950010',
           region: data.region || 'KMP HEADQUARTERS',
           station: data.station || 'KMP HEADQUARTERS',
           email: data.email || 'afedravnct@gmail.com',
           phone: data.phone || '0779302872',
           role: data.role || 'SUPER_ADMIN',
           profile_photo_path: data.profile_photo_path || ''
        });
      } else {
        console.error("Login failed:", data.detail);
        setPassword(''); 
        // Now this will show the REAL error from Python!
        setAuthMessage(data.detail || "Incorrect Force Number or password");

        const newAttempts = attempts + 1;
        setAttempts(newAttempts);
        if (newAttempts >= 3) {
          setLockoutEnd(Date.now() + 30000);
        }
      }
    } catch (err) {
      console.error("Network error during login:", err);
      setPassword('');
      setAuthMessage("Network error. Could not connect to the server.");
    }
  } else if (mode === 'forgot') {
    onForgot(fnum);
    setMode('login');
    setfnum('');
    setAuthMessage("Account recovery requested. The Admin has been notified.");
    setTimeout(() => setAuthMessage(null), 5000);
  }
};

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-4 relative">
      <div className="max-w-xl w-full bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden relative z-10">
        <div className="bg-slate-900 p-6 text-center relative">
          <img src="/upf_badge.png" alt="UPF Logo" className="w-24 h-24 mx-auto mb-4 object-contain" onError={(e) => { e.target.onerror = null; e.target.style.display = 'none'; e.target.nextSibling.style.display = 'block'; }} />
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
                <div className={`border px-4 py-3 rounded-lg flex items-center mb-4 ${authMessage.includes('Error') ? 'bg-red-50 border-red-200 text-red-800' : 'bg-blue-50 border-blue-200 text-blue-800'}`}>
               <span className="text-sm font-medium">
                  {Array.isArray(authMessage) 
                    ? authMessage.map((err, index) => (
                        <div key={index}>
                          {err.loc && err.loc.length > 1 ? `Error in ${err.loc[1]}: ` : ''} 
                          {err.msg}
                        </div>
                      ))
                    : typeof authMessage === 'object' && authMessage !== null
                      ? JSON.stringify(authMessage)
                      : authMessage}
                </span>
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
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">Full Name *</label>
                      <input type="text" name="name" required value={signupData.name} onChange={handleSignupChange} className="w-full p-2 border border-gray-300 rounded focus:ring-blue-500 text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">Rank *</label>
                      <input type="text" name="rank" required value={signupData.rank} onChange={handleSignupChange} className="w-full p-2 border border-gray-300 rounded focus:ring-blue-500 text-sm" placeholder="e.g. AIP"/>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">Region *</label>
                      <select name="region" value={signupData.region} onChange={handleSignupChange} required className="w-full p-2 border border-gray-300 rounded focus:ring-blue-500 text-sm">
                         {Object.keys(REGIONAL_HIERARCHY).map(reg => <option key={reg} value={reg}>{reg}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">Station *</label>
                      <select name="station" value={signupData.station} onChange={handleSignupChange} required className="w-full p-2 border border-gray-300 rounded focus:ring-blue-500 text-sm">
                         {REGIONAL_HIERARCHY[signupData.region].map(stat => <option key={stat} value={stat}>{stat}</option>)}
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
                      <input type="tel" name="phone" required value={signupData.phone} onChange={handleSignupChange} className="w-full p-2 border border-gray-300 rounded focus:ring-blue-500 text-sm" />
                    </div>
                  </div>

                  {signupData.position && !POSITIONS.ADMIN.includes(signupData.position) && signupData.position !== 'System Manager' && (
                    <div className="mb-4 bg-gray-50 p-3 rounded-lg border border-gray-200 col-span-2">
                      <label className="block text-xs font-bold text-gray-700 mb-2">Officer Identification Photo (Mandatory for Field Officers) *</label>
                      <div className="flex items-center space-x-4">
                        {signupData.profile_photo_path ? (
                          <img src={signupData.profile_photo_path} alt="Profile Preview" className="w-16 h-16 rounded-full object-cover border-2 border-blue-500 shadow-sm" />
                        ) : (
                          <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center text-gray-400 border-2 border-dashed border-gray-300">
                            <Camera size={24} />
                          </div>
                        )}
                        <div className="flex-1">
                          <input type="file" accept="image/*" required onChange={handlePhotoUpload} className="text-xs w-full text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-bold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
                          <p className="text-[10px] text-gray-400 mt-1">Directly uploads to secure S3 bucket</p>
                        </div>
                      </div>
                    </div>
                  )}

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
      <p className="text-xs text-gray-400 mt-6 flex items-center relative z-10"><Lock className="w-3 h-3 mr-1"/> Protected by Central Command Security Protocols</p>
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
  Admin_Communication 
}) => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showOnline, setShowOnline] = useState(false);
  const [showAllUsers, setShowAllUsers] = useState(false);
  const [selectedUserDetail, setSelectedUserDetail] = useState(null);
  const [lastViewedId, setLastViewedId] = usePersistentState('last_viewed_comm_id', 0);
  const latestCommId = (Admin_Communication && Admin_Communication.length > 0) 
    ? Math.max(...Admin_Communication.map(c => c.id)) 
    : 0;
  const hasUnread = latestCommId > lastViewedId;

  const navItems = [
    { name: '🏠 Home Dashboard', id: 'home', icon: <Home size={20} /> },
    { name: '📋 Crime/Incident Registry', id: 'reports', icon: <LayoutDashboard size={20} /> },
    { name: '📊 Disruptive OPS Statistics', id: 'statistics', icon: <BarChart3 size={20} /> },
    { name: '⛓️‍💥 success_stories', id: 'success', icon: <Trophy size={20} /> },
    { name: '🏢 Establishments', id: 'establishments', icon: <Building size={20} /> },
    { name: '👥 Nominal Roll', id: 'nominal-roll', icon: <Users size={20} /> },
    { 
      name: '📢 Admin Dispatch', 
      id: 'Admin_Communication', 
      icon: <Bell size={20} className={hasUnread ? 'animate-pulse text-yellow-400' : ''} /> 
    },
  ];

  const connectionUserProfiles = {
    "AIP System MGR": { fnum: 'A/2408', rank: 'AIP', ipps: '950010', position: 'System Manager', region: 'KMP HEADQUARTERS', station: 'KMP HEADQUARTERS', email: 'afedravnct@gmail.com', phone: '0779302872', profile_photo_path: '' },
    "Standard Officer": { fnum: '63034', rank: 'SGT', ipps: '100432', position: 'Data Officer KAWEMPE', region: 'KMP NORTH', station: 'KAWEMPE', email: 'std.officer@upf.go.ug', phone: '+256772888222', profile_photo_path: 'https://upf-s3-bucket.s3.amazonaws.com/profiles/u1234.jpg' }
  };

  const inspectActiveUser = (alias) => {
    const profile = connectionUserProfiles[alias] || { fnum: 'N/A', rank: 'Officer', ipps: 'N/A', position: alias, region: currentUser.region, station: currentUser.station, email: 'N/A', phone: 'N/A', profile_photo_path: '' };
    setSelectedUserDetail({ name: alias, ...profile, isSystemUser: false });
  };

  const inspectSystemUser = (userObj) => {
    setSelectedUserDetail({
      ...userObj,
      isSystemUser: true 
    });
  };

  // ✅ PERFECT PLACEMENT: The Export Function sits safely inside the component
  const handleExportLogs = async () => {
    try {
      const token = localStorage.getItem('kmp_authToken');
      const response = await fetch("http://127.0.0.1:8000/api/v1/activity-logs", {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) throw new Error("Security Clearance Denied");

      const logs = await response.json();
      const headers = ["ID", "Force Number", "Action", "Module", "Details", "Timestamp (EAT)"];
      const safeDetails = log.details ? log.details.replace(/"/g, '""') : "";
      const csvRows = logs.map(log => [
        log.id, log.fnum, log.action, log.module, `"${log.details}"`, log.created_at
      ]);

      const csvContent = [headers, ...csvRows].map(e => e.join(",")).join("\n");
      const blob = new Blob(['\uFEFF', csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `KMP_Audit_Logs_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error("Download failed:", error);
      alert("Failed to download logs. You may not have Super Admin clearance.");
    }
  };

  return (
    <div className="flex h-screen bg-gray-50 font-sans overflow-hidden">
      <div className={`bg-cyan-900 text-white transition-all duration-300 ${sidebarOpen ? 'w-72' : 'w-15'} flex flex-col h-full shadow-2xl z-20`}>
        <div className="p-4 flex items-center justify-between border-b border-slate-500">
          {sidebarOpen && (
            <div className="flex items-center">
              <img src="/upf_badge.png" alt="UPF Logo" className="w-4 h-4 mr-0.5 object-contain" onError={(e) => { e.target.style.display = 'none'; }} />
              <span className="font-bold text-0.5g tracking-wider">KMP TRACKER SYSTEM</span>
            </div>
          )}
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-1 hover:bg-slate-500 rounded text-slate-150 transition-colors">
            <Menu size={10} />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto py-2 custom-scrollbar">
          {sidebarOpen && <div className="px-6 mb-2 text-xs font-bold text-orange-500 uppercase tracking-wider">📋 Select Domain Category</div>}
          <nav className="space-y-1 mb-8">
            {navItems.map((item) => (
              <button 
                key={item.id} 
                onClick={() => setCurrentPage(item.id)}
                className={`w-full flex items-center px-6 py-3 transition-colors text-left ${
                  currentPage === item.id ? 'bg-blue-600 border-l-4 border-yellow-400 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white border-l-4 border-transparent'
                }`}
              >
                <div className="min-w-[24px]">{item.icon}</div>
                {sidebarOpen && <span className="ml-3 font-medium text-sm">{item.name}</span>}
              </button>
            ))}
          </nav>

          {sidebarOpen && ['ADMIN', 'SUPER_ADMIN'].includes(currentUser.role) && (
            <div className="px-4 space-y-">
              <div className={`rounded-lg p-3 transition-colors ${currentPage === 'approvals' ? 'bg-slate-700 border border-slate-600' : 'bg-slate-800'}`}>
                <div className="text-sm font-bold mb-2 flex items-center"><UserPlus size={16} className="mr-2"/> Access & Approvals</div>
                <button 
                  onClick={() => setCurrentPage('approvals')} 
                  className={`w-full text-xs py-4 rounded transition font-medium ${currentPage === 'approvals' ? 'bg-green-600 text-red' : 'bg-slate-300 hover:bg-slate-600 text-slate-200'}`}
                >
                  Manage Pending Users & Logs
                </button>
                
                {/* ✅ NEW: Secure Super Admin Logs Download Button */}
                {currentUser?.role === 'SUPER_ADMIN' && (
                  <button
                    onClick={handleExportLogs}
                    className="w-full mt-6 text-xs py-4 rounded transition font-bold bg-slate-900 hover:bg-slate-950 text-slate-300 border border-slate-700 flex items-center justify-center"
                  >
                    <Download size={14} className="mr-2 text-blue-400"/> Export Audit_Logs
                  </button>
                )}
              </div>

              <div className="rounded-lg p-4 bg-slate-800">
                 <button onClick={() => setShowOnline(!showOnline)} className="w-full flex justify-between items-center text-sm font-bold text-green-400">
                    <span className="flex items-center"><RadioReceiver size={16} className="mr-3"/> 🟢 Active Connections</span>
                    <span className="bg-slate-900 px-2 py-2 rounded-full text-xs"></span>
                 </button>
                 {showOnline && (
                   <div className="mt-4 space-y-2 border-t border-slate-700 pt-4">
                      <div onClick={() => inspectActiveUser("AIP System MGR")} className="text-xs bg-slate-900 p-2 rounded hover:bg-slate-950 border border-transparent hover:border-green-50 cursor-pointer transition-all">
                        <span className="font-bold text-white block">AIP System MGR</span>
                        <span className="text-slate-400">KMP HEADQUARTERS</span>
                      </div>
                      <div onClick={() => inspectActiveUser("Standard Officer")} className="text-xs bg-slate-900 p-2 rounded hover:bg-slate-950 border border-transparent hover:border-green-500 cursor-pointer transition-all flex items-center justify-between">
                        <div>
                          <span className="font-bold text-white block">Standard Officer</span>
                          <span className="text-slate-400">KAWEMPE</span>
                        </div>
                        {connectionUserProfiles["Standard Officer"].profile_photo_path && (
                          <img src={connectionUserProfiles["Standard Officer"].profile_photo_path} alt="" className="w-6 h-6 rounded-full border border-green-400 object-cover" onError={(e) => { e.target.style.display='none'; }} />
                        )}
                      </div>
                   </div>
                 )}
              </div>

              <div className="rounded-lg p-3 bg-slate-800 border border-slate-700">
                 <button onClick={() => setShowAllUsers(!showAllUsers)} className="w-full flex justify-between items-center text-sm font-bold text-blue-400">
                    <span className="flex items-center"><Users size={16} className="mr-2"/> 👥 System Roster</span>
                    <span className="bg-slate-900 px-2 py-0.5 rounded-full text-xs text-white border border-slate-600">{users?.length || 0}</span>
                 </button>
                 {showAllUsers && (
                   <div className="mt-3 space-y-2 border-t border-slate-700 pt-3 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                      {users?.map(u => (
                         <div key={u.fnum} onClick={() => inspectSystemUser(u)} className="text-xs bg-slate-900 p-2 rounded hover:bg-slate-950 border border-transparent hover:border-blue-500 cursor-pointer transition-all flex items-center justify-between group">
                            <div>
                              <span className="font-bold text-white block truncate w-32">{u.name}</span>
                              <span className="text-slate-400 font-mono">{u.fnum}</span>
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

          {sidebarOpen && ['ADMIN', 'SUPER_ADMIN', 'RPC'].includes(currentUser.role) && (
            <div className="px-4 mt-4 space-y-3">
              <div className="bg-slate-800 rounded-lg p-3 border border-yellow-600/30">
                <div className="text-sm font-bold text-yellow-500 mb-3 flex items-center"><Shield size={16} className="mr-2"/> ⚙️ Reports & Ledgers</div>
                
                <div className="space-y-4">
                  {/* --- HR SPLIT BUTTONS --- */}
                  <div>
                    <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1 block">HR & Establishments</span>
                    <div className="flex space-x-2">
                      <button onClick={onViewHRReport} className="flex-1 bg-blue-600 hover:bg-blue-500 text-white text-xs py-2 rounded transition flex items-center justify-center">
                        <Eye size={14} className="mr-1"/> View
                      </button>
                      <button onClick={onGenerateHRReport} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white text-xs py-2 rounded transition flex items-center justify-center">
                        <Download size={14} className="mr-1"/> Export
                      </button>
                    </div>
                  </div>
                                    
                  {/* --- CONSOLIDATED BUTTON --- */}
                  {['ADMIN', 'SUPER_ADMIN'].includes(currentUser.role) && (
                    <button 
                      onClick={onViewConsolidated}
                      className="w-full text-xs py-2 rounded transition flex items-center justify-center font-bold mt-3 bg-slate-900 hover:bg-slate-950 text-blue-400 border border-blue-900"
                    >
                      <Eye size={14} className="mr-2"/> Consolidated Entries
                    </button>
                  )}
                </div>

              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-slate-700 bg-slate-950">
          <div className="flex items-center mb-4 px-2 cursor-pointer hover:bg-slate-800 p-2 rounded transition-colors" onClick={() => setCurrentPage('profile')}>
             <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold text-sm shadow overflow-hidden">
               {currentUser?.profile_photo_path ? (
                 <img src={currentUser.profile_photo_path} alt="" className="w-full h-full object-cover" onError={(e) => { e.target.style.display='none'; }} />
               ) : null}
               {currentUser?.name?.charAt(0) || 'A'}
             </div>
             {sidebarOpen && (
               <div className="ml-3">
                 <div className="text-sm font-bold leading-tight truncate w-40">{currentUser?.name || 'Guest'}</div>
                 <div className="text-[10px] font-bold text-green-400 uppercase">{currentUser?.role || 'N/A'} • {currentUser?.station || 'N/A'}</div>
               </div>
             )}
          </div>
          <button onClick={onLogout} className="flex items-center w-full px-4 py-2 text-red-400 hover:bg-slate-800 rounded-lg transition-colors border border-transparent hover:border-red-900">
            <LogOut size={18} />
            {sidebarOpen && <span className="ml-3 font-medium text-sm">Secure Logout</span>}
          </button>
        </div>
      </div>

      <main className="flex-1 overflow-y-auto bg-gray-50 w-full relative">
        <div className="fixed inset-0 pointer-events-none z-0 flex items-center justify-center opacity-[0.03]">
          <img src="/upf_badge.png" alt="watermark" className="w-1/2 max-w-2xl grayscale object-contain" onError={(e) => { e.target.style.display = 'none'; }} />
        </div>
        
        {/* THIS LINE MAKES SURE YOUR PAGES OR LEDGERS RENDER CORRECTLY */}
       {React.Children.map(children, child => 
          (React.isValidElement(child) && typeof child.type !== 'string') 
            ? React.cloneElement(child, { setSidebarOpen }) 
            : child
        )}  
      </main>

      {/* UPGRADED: USER ACCESS MANAGEMENT MODAL */}
      {selectedUserDetail && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden flex flex-col">
            
            {/* 1. Modal Header */}
            <div className="bg-slate-900 text-white p-4 flex justify-between items-center">
              <h3 className="font-bold flex items-center text-sm">
                <Shield size={18} className="text-blue-400 mr-2" /> 
                ACCESS CLEARANCE MATRIX
              </h3>
              <button onClick={() => setSelectedUserDetail(null)} className="text-slate-400 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>

            {/* 2. Modal Body */}
            <div className="p-6">
              <div className="flex items-center space-x-4 mb-6 pb-4 border-b border-gray-100">
                <div className="w-12 h-12 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center font-extrabold text-xl">
                  {selectedUserDetail.name?.charAt(0) || 'U'}
                </div>
                <div>
                  <div className="font-extrabold text-slate-800 text-lg leading-tight">{selectedUserDetail.name}</div>
                  <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    {selectedUserDetail.fnum} • {selectedUserDetail.rank} • {selectedUserDetail.station}
                  </div>
                </div>
              </div>

              <h4 className="text-xs font-bold text-slate-800 mb-3 uppercase tracking-wider">Component Admin Clearances</h4>
              
              <div className="space-y-3 bg-slate-50 p-4 rounded-lg border border-slate-200">
                {/* CHECKBOX 1: Approvals & Audit_Logs */}
                <label className="flex items-center space-x-3 cursor-pointer group">
                  <input 
                    type="checkbox" 
                    className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                    defaultChecked={String(selectedUserDetail.role || '').includes('ADMIN')}
                    onChange={(e) => {
                      const newRole = e.target.checked ? 'ADMIN' : 'USER';
                      onUpdateUserRole(selectedUserDetail.fnum, newRole, selectedUserDetail.permissions || {});
                    }}
                  />
                  <div className="flex-1">
                    <div className="text-sm font-bold text-slate-800 group-hover:text-blue-700 transition-colors">System Administrator</div>
                    <div className="text-[10px] text-slate-500 font-medium">Grants access to Approvals, User Roster, and Audit_Logs.</div>
                  </div>
                </label>

{/* CHECKBOX 2: Consolidated Ledgers */}
                <label className="flex items-center space-x-3 cursor-pointer group">
                  <input 
                    type="checkbox" 
                    className="w-4 h-4 text-emerald-600 rounded border-gray-300 focus:ring-emerald-500"
                    checked={Boolean(selectedUserDetail.permissions?.consolidated) || String(selectedUserDetail.role || '').includes('ADMIN')}
                    disabled={String(selectedUserDetail.role || '').includes('ADMIN')}
                    onChange={(e) => {
                      const newPerms = { ...(selectedUserDetail.permissions || {}), consolidated: e.target.checked };
                      setSelectedUserDetail({ ...selectedUserDetail, permissions: newPerms });
                      onUpdateUserRole(selectedUserDetail.fnum, selectedUserDetail.role, newPerms);
                    }}
                  />
                  <div className="flex-1">
                    <div className="text-sm font-bold text-slate-800 group-hover:text-emerald-700 transition-colors">Consolidated Ledger Access</div>
                    <div className="text-[10px] text-slate-500 font-medium">Allows viewing the cross-domain master Excel overlays.</div>
                  </div>
                </label>

                {/* CHECKBOX 3: Master Export */}
                <label className="flex items-center space-x-3 cursor-pointer group">
                  <input 
                    type="checkbox" 
                    className="w-4 h-4 text-purple-600 rounded border-gray-300 focus:ring-purple-500"
                    checked={Boolean(selectedUserDetail.permissions?.export_data) || selectedUserDetail.role === 'RPC' || String(selectedUserDetail.role || '').includes('ADMIN')}
                    disabled={selectedUserDetail.role === 'RPC' || String(selectedUserDetail.role || '').includes('ADMIN')}
                    onChange={(e) => {
                      const newPerms = { ...(selectedUserDetail.permissions || {}), export_data: e.target.checked };
                      setSelectedUserDetail({ ...selectedUserDetail, permissions: newPerms });
                      onUpdateUserRole(selectedUserDetail.fnum, selectedUserDetail.role, newPerms);
                    }}
                  />
                  <div className="flex-1">
                    <div className="text-sm font-bold text-slate-800 group-hover:text-purple-700 transition-colors">Database Export Privilege</div>
                    <div className="text-[10px] text-slate-500 font-medium">Allows downloading raw .xlsx database files to local device.</div>
                  </div>
                </label>
              </div>
            </div>

            {/* 3. Modal Footer */}
            <div className="bg-slate-100 p-4 border-t border-gray-200 flex justify-between items-center">
              <button 
                onClick={() => onRevokeUser(selectedUserDetail.fnum)} 
                className="text-xs font-bold text-red-600 hover:text-red-800 transition-colors"
              >
                Revoke All Access
              </button>
              <button 
                onClick={() => setSelectedUserDetail(null)} 
                className="bg-blue-700 hover:bg-blue-800 text-white font-bold text-xs py-2 px-6 rounded-lg shadow-sm transition-colors"
              >
                Save & Close
              </button>
            </div>
            
          </div>
        </div>
      )}

    </div>
  );
};  

export default function App() {
  const [currentUser, setCurrentUser] = usePersistentState('kmp_currentUser', null);
  const [currentPage, setCurrentPage] = usePersistentState('kmp_currentPage', 'home');
  const [isInitializing, setIsInitializing] = useState(true);

  // States for all the Ledgers
  const [reports, setReports] = useState([]);
  const [stats, setStats] = useState([]);
  const [stories, setStories] = useState([]);
  const [establishments, setEstablishments] = useState([]);
  const [Nominal_Rolls, setNominal_Rolls] = useState([]);
  const [Nominal_Roll_archives, setNominal_Roll_archives] = useState([]);
  const [users, setUsers] = useState([]);
  const [pendingUsers, setPendingUsers] = useState([]);

  // States for Overlays
  const [hrLedgerData, setHrLedgerData] = useState(null);
  const [isViewingHR, setIsViewingHR] = useState(false);
  const [isViewingConsolidated, setIsViewingConsolidated] = useState(false);
  const [consolidatedData, setConsolidatedData] = useState(null);
  const [adminCommsData, setAdmin_Communication] = useState([]);  

  useEffect(() => {
    const checkClearance = () => {
      const token = localStorage.getItem('kmp_authToken');
      const cachedUser = localStorage.getItem('kmp_currentUser');
      
      if (!token || !cachedUser) {
        setIsInitializing(false);
        return;
      }

      try {
        const parsedUser = JSON.parse(cachedUser);
        setCurrentUser(parsedUser);
      } catch (error) {
        console.error("Failed to parse cached user:", error);
        localStorage.removeItem('kmp_authToken');
        localStorage.removeItem('kmp_currentUser');
      }
      
      setIsInitializing(false);
    };

    checkClearance();
  }, []);

  if (currentUser && !currentUser.region) {
    localStorage.removeItem('kmp_currentUser');
    localStorage.removeItem('kmp_authToken');
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50">
        <h2 className="text-2xl font-bold text-red-600 mb-2">Ghost Session Detected</h2>
        <p className="text-slate-600 mb-6">Corrupted local data is blocking the dashboard. Click below to wipe it.</p>
        <button onClick={() => window.location.reload()} className="px-6 py-3 bg-blue-700 text-white font-bold rounded-lg shadow-md hover:bg-blue-800">
          Force Clear & Restart App
        </button>
      </div>
    );
  }

// ==========================================
  // 🛡️ TACTICAL AUTO-LOGOUT (15 MIN INACTIVITY)
  // ==========================================
  useEffect(() => {
    // Only arm the timer if an officer is actively logged in
    if (!currentUser) return;

    let inactivityTimer;
    const INACTIVITY_LIMIT = 15 * 60 * 1000; // 15 minutes in milliseconds

    const executeAutoLogout = () => {
      console.log("Inactivity limit reached. Executing auto-logout.");
      localStorage.removeItem('kmp_authToken');
      localStorage.removeItem('kmp_currentUser');
      setCurrentUser(null);
      alert("Session expired due to inactivity. Please log in again.");
    };

    const resetTimer = () => {
      clearTimeout(inactivityTimer);
      inactivityTimer = setTimeout(executeAutoLogout, INACTIVITY_LIMIT);
    };

    // Array of physical triggers that prove the user is still at the terminal
    const activityEvents = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];

    // Attach sensors to the window
    activityEvents.forEach(event => window.addEventListener(event, resetTimer));

    // Arm the initial timer
    resetTimer();

    // Disarm sensors when component unmounts or user logs out
    return () => {
      clearTimeout(inactivityTimer);
      activityEvents.forEach(event => window.removeEventListener(event, resetTimer));
    };
  }, [currentUser, setCurrentUser]);

  useEffect(() => {
    let link = document.querySelector("link[rel~='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = '/upf_badge.png';
    document.title = "Uganda Police Force - Secure Portal";
  }, []);

useEffect(() => {
    // 1. Guard Clause: Don't run if no user
    if (!currentUser) return;
    
    // 2. Abort Controller: Stops requests if component unmounts
    const controller = new AbortController();
    
const fetchData = async () => {
  const token = localStorage.getItem('kmp_authToken');
  if (!token) return;

  try {
    // 1. ADDED the 7th fetch for nominal-roll-archive
    const [resReports, resStats, resStories, resNom, resComms, resEst, resArchives] = await Promise.all([
      authFetch("/api/v1/reports", { signal: controller.signal }),
      authFetch("/api/v1/stats", { signal: controller.signal }),
      authFetch("/api/v1/stories", { signal: controller.signal }),
      authFetch("/api/v1/nominal-roll", { signal: controller.signal }),
      authFetch("/api/v1/Admin_Communication", { signal: controller.signal }),
      authFetch("/api/v1/establishments", { signal: controller.signal }),
      authFetch("/api/v1/nominal-roll-archive", { signal: controller.signal }) // 👈 NEW
    ]);

    // 2. Parse the 7th item
    const [dataReports, dataStats, dataStories, dataNom, dataComms, dataEst, dataArchives] = await Promise.all([
      resReports.ok ? resReports.json() : [],
      resStats.ok ? resStats.json() : [],
      resStories.ok ? resStories.json() : [],
      resNom.ok ? resNom.json() : [],
      resComms.ok ? resComms.json() : [],
      resEst.ok ? resEst.json() : [],
      resArchives.ok ? resArchives.json() : [] // 👈 NEW
    ]);

    // 3. Set the state for the archives!
    if (!controller.signal.aborted) {
      setReports(dataReports);
      setStats(dataStats);
      setStories(dataStories);
      setNominal_Rolls(dataNom);
      setAdmin_Communication(dataComms);
      setEstablishments(dataEst); 
      setNominal_Roll_archives(dataArchives); // 👈 THIS WAS MISSING
    }
  } catch (err) {
    if (err.name !== 'AbortError') {
      console.warn("Sync failed:", err);
    }
  }
};
    
    fetchData();

    // Cleanup: This runs if the component disappears
    return () => controller.abort();
  }, [currentUser]); 

  const handleMasterExport = async (scope, value) => {
    let url = `/api/v1/reports/export?timeframe=all`;
    if (scope && value) {
        url += `&scope=${scope}&value=${encodeURIComponent(value)}`;
    }
    try {
        const response = await authFetch(url);
        if (!response.ok) {
            if (response.status === 403) throw new Error("Clearance Denied");
            throw new Error("Export failed");
        }
        const blob = await response.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = downloadUrl;
        
        // 👇 THE FIX: Changed .xlsx to .zip at the end of this line 👇
        link.download = `KMP_Master_Ledger_${value || "General"}_${new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0]}.zip`;
        
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(downloadUrl);
    } catch (err) {
        console.error("Export Error:", err);
        alert(err.message === "Clearance Denied" ? "Access Denied: You require Export Clearance." : "Failed to download export file.");
    }
  };


  const renderPage = () => {
    switch (currentPage) {
      case 'home': return <HomeDashboard currentUser={currentUser} setCurrentPage={setCurrentPage} onMasterExport={handleMasterExport} />;
      case 'reports': return <CrimeIncidentRegistry currentUser={currentUser} reports={reports} setReports={setReports} />;
      case 'statistics': return <Statistics currentUser={currentUser} stats={stats} setStats={setStats} />;
      case 'success': return <SuccessStories currentUser={currentUser} stories={stories} setStories={setStories} />;
      case 'establishments': return <Establishments currentUser={currentUser} establishments={establishments} setEstablishments={setEstablishments} />;
      case 'nominal-roll': return <Nominal_Roll currentUser={currentUser} Nominal_Rolls={Nominal_Rolls} setNominal_Rolls={setNominal_Rolls} Nominal_Roll_archives={Nominal_Roll_archives} setNominal_Roll_archives={setNominal_Roll_archives} />; 
      case 'approvals': return ['ADMIN', 'SUPER_ADMIN'].includes(currentUser.role) ? <AdminApprovals pendingUsers={pendingUsers} setPendingUsers={setPendingUsers} users={users} setUsers={setUsers} currentUser={currentUser} /> : <HomeDashboard currentUser={currentUser} setCurrentPage={setCurrentPage} onMasterExport={handleMasterExport} />;
      case 'profile': return <AdminProfile currentUser={currentUser} setCurrentUser={setCurrentUser} />;
      default: return <HomeDashboard currentUser={currentUser} setCurrentPage={setCurrentPage} onMasterExport={handleMasterExport} />;
      case 'Admin_Communication': return ['ADMIN', 'SUPER_ADMIN'].includes(currentUser.role) ? <Admin_Communication currentUser={currentUser} users={users} /> : <HomeDashboard currentUser={currentUser} setCurrentPage={setCurrentPage} onMasterExport={handleMasterExport} onViewConsolidated={handleViewConsolidated} Admin_Communication={Admin_Communication}/>;

      case 'home': return <HomeDashboard currentUser={currentUser} setCurrentPage={setCurrentPage} onMasterExport={handleMasterExport} onViewConsolidated={handleViewConsolidated} Admin_Communication={Admin_Communication}/>;
    }
  };

const handleViewHRReport = async () => {
    try {
      // FIX 1: Pointing back to the correct URL that returns BOTH halves of the data
      const res = await authFetch("/api/v1/reports/establishments-json");
      
      if (!res.ok) {
        throw new Error("Security clearance rejected or server error.");
      }
      
      const data = await res.json();
      setHrLedgerData(data);
      setIsViewingHR(true);
    } catch (err) {
      console.error("HR Fetch Error:", err);
      alert("Cannot load HR ledger data. Ensure your session is active and you have network connectivity.");
    }
  };

  const handleViewConsolidated = async () => {
      setIsViewingHR(false); // Close other view
      const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0];
      const lastWeek = new Date();
      lastWeek.setDate(lastWeek.getDate() - 7);
      const start = lastWeek.toISOString().split('T')[0];

      try {
          const response = await authFetch(`/api/v1/reports/consolidated-ledger?start_date=${start}&end_date=${today}`);
          
          // FIX 2: Check if backend crashed before trying to load a broken page
          if (!response.ok) throw new Error("Backend failed to compile ledger.");

          const data = await response.json();
          setConsolidatedData(data);
          setIsViewingConsolidated(true);
      } catch (err) {
          console.error("Ledger fetch failed:", err);
          alert("Failed to load Consolidated Ledger. Check Python terminal for errors.");
      }
  };

  if (isInitializing) {
    return <h2 style={{ textAlign: 'center', marginTop: '20vh' }}>Verifying Officer Clearance...</h2>;
  }

  if (!currentUser) return <LoginScreen 
    onLogin={setCurrentUser} 
    onForgot={() => {}} 
    onSignup={(u) => setPendingUsers([...pendingUsers, u])} 
    pendingUsers={pendingUsers} 
    activeUsers={users} 
/>;

  const handleSmartExport = (scope, value) => {
      let url = `/api/v1/reports/export?timeframe=all`;
      if (scope && value) url += `&scope=${scope}&value=${encodeURIComponent(value)}`;
      downloadWithAuth(url, "Ops_Ledger.xlsx");
  };

  const handleGenerateHRReport = () => {
    // Removed "hr-" from the URL so it perfectly matches api_backend.py
    downloadWithAuth("/api/v1/export/establishments", "HR_Establishment_Summary.zip");
  };

  const handleUpdateUserRole = async (fnum, newRole, newPermissions) => {
    // 1. Update React UI immediately
    setUsers(users.map(u => u.fnum === fnum ? { ...u, role: newRole, permissions: newPermissions } : u));
    
    // 2. Save JSON permissions to PostgreSQL silently
    try {
      await authFetch(`/api/v1/users/${fnum}/access`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole, permissions: newPermissions })
      });
    } catch (err) {
      console.error("Failed to save permissions to database:", err);
    }
  };


return (
    <DashboardLayout 
      currentUser={currentUser}
      currentPage={currentPage} 
      setCurrentPage={setCurrentPage} 
      onLogout={() => { localStorage.removeItem('kmp_authToken'); setCurrentUser(null); }}
      onGenerateOpsReport={() => handleMasterExport("station", currentUser.station)}
      onViewOpsReport={() => {}} 
      onGenerateHRReport={handleGenerateHRReport}
      onViewHRReport={handleViewHRReport} 
      onViewConsolidated={handleViewConsolidated} 
      users={users}
      onRevokeUser={(fnum) => { setUsers(users.filter(u => u.fnum !== fnum)); }}
      
      onUpdateUserRole={handleUpdateUserRole} // <-- It connects to the engine here!
    >
{/* LAYER 1: Consolidated Ledger */}
      {isViewingConsolidated && (
          
        <ConsolidatedLedger 
           data={consolidatedData} 
           reports={reports} 
           stats={stats} 
           stories={stories} 
           onClose={() => setIsViewingConsolidated(false)} 
        />
      )}

      {/* LAYER 2: HR & Establishments Ledger */}
      {isViewingHR && hrLedgerData && (
        <HrEstablishmentsLedger 
           data={hrLedgerData} 
           onClose={() => setIsViewingHR(false)} 
        />
      )}

      {/* 3. BOTTOM LAYER: Standard Pages (Hidden via CSS instead of destroyed!) */}
      <div className={(isViewingConsolidated || isViewingHR) ? 'hidden' : 'block w-full h-full'}>
        {renderPage()}
      </div>
      
    </DashboardLayout>
  );
}