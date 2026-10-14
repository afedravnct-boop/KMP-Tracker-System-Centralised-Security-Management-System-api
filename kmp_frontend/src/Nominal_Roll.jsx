// src/components/Nominal_Roll.jsx
import React, { useState, useMemo, useEffect } from 'react';
import { 
  Users, PlusCircle, Edit, AlertTriangle, CheckCircle, Upload, 
  BarChart3, PieChart, ArrowRight, Shield, Archive, Eye, Search, X, Download, Filter
} from 'lucide-react';
import { authFetch } from './api';
import BulkNominalRollUpload from './BulkNominalRollUpload';
import OfficerDossierModal from './OfficerDossierModal';
import { formatOfficerHeader, stripHtmlTags } from './adminUtils';

const cleanStr = (str) => {
  if (!str) return '';
  return String(str).replace(/\s+/g, ' ').trim().toUpperCase();
};

const REGIONAL_HIERARCHY = {
  "KMP HEADQUARTERS": ["KMP HEADQUARTERS", "KMP CID", "KMP TRAFFIC", "KMP ICT", "KMP FLYING SQUAD", "KMP CRIME INTELLIGENCE"],
  "KMP NORTH": ["KMP NORTH HEADQUARTERS", "KAWEMPE", "KAKIRI", "KASANGATI", "MATUGGA", "NANSANA", "OLD KAMPALA", "WAKISO", "WANDEGEYA"],
  "KMP EAST": ["KMP EAST HEADQUARTERS", "JINJA ROAD", "KIRA", "KIRA DIV", "KIRA ROAD", "MUKONO", "NAGGALAMA", "SEETA"],
  "KMP SOUTH": ["KMP SOUTH HEADQUARTERS", "NATEETE", "CPS KAMPALA", "PARLIAMENT", "ENTEBBE", "KABALAGALA", "KAJJANSI", "KASENYI", "KATWE", "KYENGERA", "NSANGI"],
  "POLICE HEADQUARTERS": ["NAGURU", "OPERATIONS", "CRIME INTELLIGENCE", "CID", "LOGISTICS & ENGINEERING", "ICT", "CT", "FIRE & RESCUE"]
};

const MetricCard = ({ title, value, colorClass }) => (
  <div className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-sm flex flex-col items-center justify-center text-center">
    <h4 className="text-[8px] sm:text-[9px] font-extrabold mb-1 uppercase tracking-wider text-slate-500 leading-tight">{title}</h4>
    <div className={`text-sm sm:text-base font-black leading-none ${colorClass}`}>{value}</div>
  </div>
);

const ExpandableTableCard = ({ title, children, onToggle }) => {
  const [expanded, setExpanded] = useState(false);

  const handleToggle = () => {
    const nextState = !expanded;
    setExpanded(nextState);
    if (onToggle) onToggle(nextState);
  };

  return (
    <div className={`shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col transition-all duration-300 ${
      expanded 
        ? 'fixed inset-0 z-[99999] rounded-none h-screen w-screen m-0 p-0 bg-white dark:bg-slate-900' 
        : 'rounded-xl w-full mt-4 bg-white dark:bg-slate-900'
    }`}>
      <div className="bg-slate-900 dark:bg-slate-950 px-4 py-3.5 flex justify-between items-center shrink-0 relative z-30">
        <h3 className="font-extrabold text-white text-xs sm:text-sm uppercase tracking-wider flex items-center">
          {title} {expanded && <span className="ml-2 text-[10px] bg-blue-600 px-2 py-0.5 rounded text-white font-mono">FULL SCREEN VIEW</span>}
        </h3>
        <button 
          type="button"
          onClick={handleToggle} 
          className="text-xs text-blue-400 hover:text-white font-bold transition flex items-center bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg border border-slate-700 shadow-inner cursor-pointer"
        >
          {expanded ? 'Collapse ↙' : 'Expand ↗'}
        </button>
      </div>
      <div className="w-full bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 overflow-hidden flex-1 flex flex-col">
        {typeof children === 'function' ? children(expanded) : children}
      </div>
    </div>
  );
};

const Nominal_Roll = ({ currentUser, canViewGlobal: propCanViewGlobal, Nominal_Rolls, setNominal_Rolls, Nominal_Roll_archives, setNominal_Roll_archives }) => {
  const [operation, setOperation] = useState('new');
  const [notification, setNotification] = useState(null);
  const [selectedOfficer, setSelectedOfficer] = useState(null);
  const [updateSearch, setUpdateSearch] = useState(''); 
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState('audit'); 
  
  const [showAuditPreviewModal, setShowAuditPreviewModal] = useState(false);
  const [auditPreviewData, setAuditPreviewData] = useState([]);
  const [isLoadingAudit, setIsLoadingAudit] = useState(false);
  
  const [analyticsMetricFilterValue, setAnalyticsMetricFilterValue] = useState('ALL');
  const [showAnalyticsDossier, setShowAnalyticsDossier] = useState(false);
  const [analyticsSelectedOfficer, setAnalyticsSelectedOfficer] = useState(null);

  const userRoleClean = cleanStr(currentUser?.role);
  const userPosClean = cleanStr(currentUser?.position);
  const userRegClean = cleanStr(currentUser?.region);

  const isSuperAdmin = userRoleClean === 'SUPER_ADMIN';
  const isReadOnlyObserver = currentUser?.permissions?.global_observer === true && !currentUser?.permissions?.global_open && !isSuperAdmin;

  const hasMasterOverride = useMemo(() => {
    const p = currentUser?.permissions || {};
    return isSuperAdmin || p.global_open === true || p.bypass_jurisdiction === true;
  }, [currentUser, isSuperAdmin]);

  const isGlobalTier = hasMasterOverride || isSuperAdmin || 
    ['SUPER_ADMIN', 'ASSISTANT_SUPER_ADMIN'].includes(userRoleClean) || 
    ['KMP COMMANDER', 'DEPUTY KMP COMMANDER', 'KMP ADMIN OFFICER'].includes(userPosClean) || 
    currentUser?.permissions?.view_global_roster === true;

  const isRPC = ['RPC', 'DEPUTY_RPC'].includes(userRoleClean) || 
    (userRoleClean === 'SYSTEM_MANAGER' && !isGlobalTier) ||
    userPosClean.includes('RPC') || 
    userPosClean.includes('REGIONAL POLICE COMMANDER');

  const isTopCommand = isGlobalTier || isRPC || 
    ['ASSISTANT_SYSTEM_MANAGER', 'REGIONAL_ADMIN'].includes(userRoleClean) || 
    userPosClean.includes('HR');

  const canViewGlobalLevel = propCanViewGlobal !== undefined ? propCanViewGlobal : (isGlobalTier || hasMasterOverride);
  const isRegionalCommand = ['RPC', 'DEPUTY_RPC', 'SYSTEM_MANAGER', 'ASSISTANT_SYSTEM_MANAGER', 'REGIONAL_ADMIN', 'ASSISTANT_REGIONAL_ADMIN'].includes(userRoleClean) && !canViewGlobalLevel;

  const perms = currentUser?.permissions || {};
  const hasHrClearance = isTopCommand || hasMasterOverride || perms.view_nominal_roll === true || perms.acc_hr === true || perms.upload_hr === true;
  const canEditRecords = hasHrClearance && !isReadOnlyObserver;
  
  const [filterRegion, setFilterRegion] = useState(canViewGlobalLevel ? 'ALL REGIONS' : userRegClean);
  const [filterStation, setFilterStation] = useState((canViewGlobalLevel || isRegionalCommand) ? 'ALL STATIONS' : cleanStr(currentUser?.station));
  const [filterPost, setFilterPost] = useState('ALL POSTS');

  const [targetRegion, setTargetRegion] = useState(canViewGlobalLevel ? 'ALL REGIONS' : userRegClean);
  const [targetStation, setTargetStation] = useState('ALL STATIONS');

  const [searchTerm, setSearchTerm] = useState('');
  const [bulkSelectMode, setBulkSelectMode] = useState(false);
  const [selectedOfficers, setSelectedOfficers] = useState([]);
  const [bulkArchiveReason, setBulkArchiveReason] = useState('TRANSFERRED');
  const [bulkArchiveDetail, setBulkArchiveDetail] = useState('');
  const [bulkCorrRef, setBulkCorrRef] = useState('');
  const [isBulkArchiving, setIsBulkArchiving] = useState(false);

  const [isArchivedReturnee, setIsArchivedReturnee] = useState(false);
  const [archiveDetails, setArchiveDetails] = useState(null);
  const [customReason, setCustomReason] = useState('');
  const [previousFnum, setPreviousFnum] = useState('');

  const [viewMode, setViewMode] = useState('active'); 
  const [showAnalytics, setShowAnalytics] = useState(false); 
  const [metricCategory, setMetricCategory] = useState('RANK');  
  const [archiveReason, setArchiveReason] = useState('TRANSFERRED');
  const [archiveDetail, setArchiveDetail] = useState('');
  const [corrRef, setCorrRef] = useState('');
  
  const [formData, setFormData] = useState({
    sn: null, fnum: '', rank: '', name: '', sex: 'MALE', position: '',
    dob: '', doe: '', dopost: '', dopro: '', contact: '', educlevel: '',
    ipps: '', tin: '', nin: '', homedist: '', tribe: '', accno: '', bankbranch: '',
    station: currentUser?.station || REGIONAL_HIERARCHY[currentUser?.region]?.[0] || '', 
    district: '', region: currentUser?.region, section: '', dir: '', status: 'ACTIVE'
  });

  const availableStationsList = useMemo(() => {
    const list = new Set();
    const activeReg = filterRegion;
    if (activeReg && activeReg !== 'ALL REGIONS' && REGIONAL_HIERARCHY[activeReg]) {
      REGIONAL_HIERARCHY[activeReg].forEach(stn => list.add(stn));
    } else {
      Object.values(REGIONAL_HIERARCHY).forEach(arr => arr.forEach(stn => list.add(stn)));
    }
    return Array.from(list).sort();
  }, [filterRegion]);

  const availablePostsList = useMemo(() => {
    const list = new Set();
    (Array.isArray(Nominal_Rolls) ? Nominal_Rolls : []).forEach(n => {
      if (n.station && n.station.includes('/')) {
        const parts = n.station.split('/');
        if (parts[1]) list.add(cleanStr(parts[1]));
      }
    });
    return Array.from(list).sort();
  }, [Nominal_Rolls]);

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

  const handleFetchAuditPreview = async () => {
    setIsLoadingAudit(true);
    try {
      const response = await authFetch(`/api/v1/nominal-roll/audit-missing-preview?region=${encodeURIComponent(targetRegion)}&station=${encodeURIComponent(targetStation)}`, { method: 'GET' });
      if (!response.ok) throw new Error("Failed to fetch audit preview.");
      const data = await response.json();
      setAuditPreviewData(Array.isArray(data) ? data : []);
      setShowModal(false);
      setShowAuditPreviewModal(true);
    } catch (err) {
      alert(`Audit Preview Error: ${err.message}`);
    } finally {
      setIsLoadingAudit(false);
    }
  };

  const handleExecuteExportModal = async () => {
    try {
      const endpoint = modalMode === 'audit' 
        ? `/api/v1/nominal-roll/export-missing-audit?region=${encodeURIComponent(targetRegion)}&station=${encodeURIComponent(targetStation)}`
        : `/api/v1/nominal-roll/export-station-ledger?region=${encodeURIComponent(targetRegion)}&station=${encodeURIComponent(targetStation)}`;

      const response = await authFetch(endpoint, { method: 'GET' });
      if (!response.ok) throw new Error("Export generation failed.");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = modalMode === 'audit' ? `Missing_Info_Audit.zip` : `Station_Nominal_Roll.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      setShowModal(false);
    } catch (err) {
      alert(`Export Error: ${err.message}`);
    }
  };

  const handleExecuteAnalyticsExport = async () => {
    try {
      const endpoint = `/api/v1/nominal-roll/export-filtered-ledger?region=${encodeURIComponent(filterRegion)}&station=${encodeURIComponent(filterStation)}&filter_type=${encodeURIComponent(metricCategory)}&filter_value=${encodeURIComponent(analyticsMetricFilterValue)}`;
      const response = await authFetch(endpoint, { method: 'GET' });
      if (!response.ok) throw new Error("Filtered export generation failed.");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Nominal_List_${metricCategory}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert(`Export Error: ${err.message}`);
    }
  };

  const handleArchivePersonnel = async () => {
    if (!canEditRecords) return alert("Security Restriction: Clearance denied.");
    let rawFnum = formData.fnum || formData.f_num || '';
    const cleanTargetFnum = rawFnum.toString().split('/ARCHIVE')[0].trim();
    if (!cleanTargetFnum) return alert("Missing Force Number.");

    let finalArchiveReason = archiveDetail.trim() ? `${archiveReason}: ${archiveDetail.trim()}` : archiveReason;
    if (corrRef.trim()) finalArchiveReason += ` [Ref: ${corrRef.trim()}]`;

    if (!window.confirm(`Move ${formData.name} (${cleanTargetFnum}) to archives?`)) return;

    try {
      setNotification("Moving record to archive...");
      const response = await authFetch(`/api/v1/nominal-roll/archive-record`, {
        method: "PUT", 
        headers: { "Content-Type": "application/json" }, 
        body: JSON.stringify({ fnum: cleanTargetFnum, archive_reason: finalArchiveReason })
      });

      if (!response.ok) throw new Error("Failed to archive record.");
      setNominal_Rolls((Array.isArray(Nominal_Rolls) ? Nominal_Rolls : []).filter(n => (n.fnum || n.f_num) !== cleanTargetFnum));
      setNotification(`Officer archived successfully.`);
      handleOperationToggle('new');
    } catch (error) { 
      setNotification(`Error: ${error.message}`); 
    }
  };

  const handleBulkArchive = async () => {
    if (!canEditRecords || selectedOfficers.length === 0) return;
    let finalBulkReason = bulkArchiveDetail.trim() ? `${bulkArchiveReason}: ${bulkArchiveDetail.trim()}` : bulkArchiveReason;
    if (!window.confirm(`Archive ${selectedOfficers.length} officers?`)) return;

    setIsBulkArchiving(true);
    try {
      const response = await authFetch(`/api/v1/nominal-roll/bulk-archive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fnums: selectedOfficers, archive_reason: finalBulkReason })
      });
      if (!response.ok) throw new Error("Bulk archive failed.");
      
      const archivedFnumsSet = new Set(selectedOfficers);
      setNominal_Rolls(prev => (Array.isArray(prev) ? prev : []).filter(n => !archivedFnumsSet.has(n.f_num || n.fnum)));
      setNotification(`✅ Bulk Archive Complete.`);
      setSelectedOfficers([]);
      setBulkSelectMode(false);
    } catch (err) { 
      setNotification(`❌ Bulk Archive Error: ${err.message}`);
    } finally { 
      setIsBulkArchiving(false);
    }
  };

  const handleFormSubmit = async (e) => { 
    e.preventDefault();
    if (!canEditRecords) return alert("Security Restriction: Clearance denied.");

    const currentRolls = Array.isArray(Nominal_Rolls) ? Nominal_Rolls : [];
    if (operation === 'new') {
      const newEntryPayload = { 
        ...formData, 
        last_updated_by: `${currentUser.name} (${currentUser.fnum})`,
        ...(isArchivedReturnee && { reintegration_reason: customReason, previous_fnum: previousFnum || formData.fnum })
      };
       
      try {
        const response = await authFetch(`/api/v1/nominal-roll`, {
          method: "POST", 
          headers: { "Content-Type": "application/json" }, 
          body: JSON.stringify(newEntryPayload)
        });
        const responseData = await response.json().catch(() => ({}));

        if (!response.ok) {
            if (response.status === 409 && responseData.is_archived_returnee) {
                setIsArchivedReturnee(true);
                setArchiveDetails(responseData);
                setNotification("⚠️ Officer history found in archive. Authorize re-entry below.");
                return;
            }
            throw new Error(responseData.detail || "Database rejected entry.");
        }
         
        setNominal_Rolls([newEntryPayload, ...currentRolls]); 
        setNotification(`Officer recorded successfully!`); 
        handleOperationToggle('new');
      } catch (err) { setNotification(`Error: ${err.message}`); }
       
    } else if (operation === 'update') {
      const updatedRecord = { ...formData, last_updated_by: `${currentUser.name} (${currentUser.fnum})` };
      try {
          const targetIdentifier = String(formData.fnum || formData.f_num || formData.sn).trim();
          const response = await authFetch(`/api/v1/nominal-roll/${encodeURIComponent(targetIdentifier)}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(updatedRecord) 
          });
          if (!response.ok) throw new Error("Failed to update record.");
          setNominal_Rolls(currentRolls.map(n => (n.sn === formData.sn || n.fnum === formData.fnum) ? updatedRecord : n));
          setNotification(`Officer updated successfully!`);
      } catch (err) { setNotification("Error: Could not update record."); }
    }
  };

  // 🟢 LIGHTWEIGHT CLIENT FILTERING (No heavy sorting/parsing loops)
  const currentRollDataset = useMemo(() => {
    const dataset = viewMode === 'archive' ? (Array.isArray(Nominal_Roll_archives) ? Nominal_Roll_archives : []) : (Array.isArray(Nominal_Rolls) ? Nominal_Rolls : []);
    
    return dataset.filter(n => {
      const stn = cleanStr(n.station);
      const reg = cleanStr(n.region);

      if (filterRegion && filterRegion !== 'ALL REGIONS' && !reg.includes(filterRegion)) return false;
      if (filterStation && filterStation !== 'ALL STATIONS' && !stn.includes(filterStation)) return false;

      if (searchTerm.trim()) {
        const query = searchTerm.trim().toLowerCase();
        const fnum = cleanStr(n.f_num || n.fnum).toLowerCase();
        const name = cleanStr(n.name).toLowerCase();
        const rank = cleanStr(n.rank).toLowerCase();
        if (!fnum.includes(query) && !name.includes(query) && !rank.includes(query)) return false;
      }
      return true;
    });
  }, [viewMode, Nominal_Rolls, Nominal_Roll_archives, filterRegion, filterStation, searchTerm]);

  const analyticsFilteredDataset = useMemo(() => {
    if (analyticsMetricFilterValue === 'ALL') return currentRollDataset;
    return currentRollDataset.filter(n => {
      if (metricCategory === 'RANK') return cleanStr(n.rank) === analyticsMetricFilterValue;
      if (metricCategory === 'STATUS') return cleanStr(n.normalized_status || n.status) === analyticsMetricFilterValue;
      if (metricCategory === 'SEX') return cleanStr(n.sex) === analyticsMetricFilterValue;
      return true;
    });
  }, [currentRollDataset, metricCategory, analyticsMetricFilterValue]);

  const availableAnalyticsFilterOptions = useMemo(() => {
    const setVals = new Set();
    currentRollDataset.forEach(n => {
      if (metricCategory === 'RANK') setVals.add(cleanStr(n.rank));
      if (metricCategory === 'STATUS') {
        setVals.add('ACTIVE (DEPLOYABLE)');
        setVals.add('NON-DEPLOYABLE (HEALTH/LEAVE)');
      }
      if (metricCategory === 'SEX') setVals.add(cleanStr(n.sex));
    });
    return Array.from(setVals).sort();
  }, [currentRollDataset, metricCategory]);

  const availableUpdateRolls = useMemo(() => {
    return (Array.isArray(Nominal_Rolls) ? Nominal_Rolls : []).filter(n => {
      if (updateSearch) {
        const query = updateSearch.toLowerCase();
        return cleanStr(n.fnum || n.f_num).toLowerCase().includes(query) || cleanStr(n.name).toLowerCase().includes(query);
      }
      return true;
    });
  }, [Nominal_Rolls, updateSearch]);

  const metricsData = useMemo(() => {
    let male = 0, female = 0;
    currentRollDataset.forEach(n => {
      const sex = cleanStr(n.sex);
      if (sex === 'F' || sex === 'FEMALE') female++;
      else male++;
    });
    return { total: currentRollDataset.length, male, female, unassigned: 0, divisions: 5, stations: availableStationsList.length, posts: availablePostsList.length };
  }, [currentRollDataset, availableStationsList, availablePostsList]);

  return (
    <div className="p-3 sm:p-6 max-w-[1600px] mx-auto space-y-5 relative z-10 pb-20">
      <div className="text-center mb-4 flex flex-col items-center">
        <img src="/upf_badge.png" alt="UPF Logo" className="w-14 h-14 mb-2 object-contain contrast-200 brightness-75 drop-shadow-sm" onError={(e) => { e.target.style.display = 'none'; }} />
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-800 tracking-tight">Master Nominal Roll</h1>
        <h3 className="text-xs sm:text-sm text-blue-700 mt-0.5 font-semibold uppercase tracking-wider">Man-Power Auditing & Deployment Registry</h3>
      </div>
        
      <div className="bg-white/90 backdrop-blur p-3.5 rounded-xl border border-slate-200 shadow-sm relative">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-3 gap-2">
          <h4 className="text-xs font-extrabold text-slate-500 uppercase tracking-wider flex items-center">
            <BarChart3 className="w-4 h-4 mr-1.5 text-blue-600 shrink-0"/> Personnel Metrics Dashboard
          </h4>
          <div className="flex items-center gap-2">
            {canEditRecords && viewMode === 'active' && (
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={handleFetchAuditPreview} disabled={isLoadingAudit} className="bg-amber-600 hover:bg-amber-700 text-white px-3 py-1 text-xs font-bold rounded-md shadow cursor-pointer flex items-center">
                  <Eye className="w-3.5 h-3.5 mr-1" /> {isLoadingAudit ? 'Loading...' : 'Audit Missing Info'}
                </button>
                <button type="button" onClick={() => { setModalMode('station_list'); setShowModal(true); }} className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 text-xs font-bold rounded-md shadow cursor-pointer flex items-center">
                  <Download className="w-3.5 h-3.5 mr-1" /> Station Nominal List
                </button>
              </div>
            )}
            <div className="inline-flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 shadow-inner shrink-0">
               <button type="button" onClick={() => { setViewMode('active'); setShowAnalytics(false); }} className={`px-3 py-1 text-xs font-bold rounded-md cursor-pointer ${viewMode === 'active' && !showAnalytics ? 'bg-slate-900 text-white' : 'text-slate-600'}`}>Active Roll</button>
               <button type="button" onClick={() => { setViewMode('archive'); setShowAnalytics(false); }} className={`px-3 py-1 text-xs font-bold rounded-md cursor-pointer ${viewMode === 'archive' && !showAnalytics ? 'bg-red-700 text-white' : 'text-slate-600'}`}>Archived</button>
               <button type="button" onClick={() => setShowAnalytics(!showAnalytics)} className={`px-3 py-1 text-xs font-bold rounded-md cursor-pointer ${showAnalytics ? 'bg-indigo-700 text-white' : 'text-slate-600'}`}>Analytics Breakdown</button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-2">
           <MetricCard title="Total Personnel" value={metricsData.total} colorClass="text-blue-700" />
           <MetricCard title="Male Officers" value={metricsData.male} colorClass="text-indigo-600" />
           <MetricCard title="Female Officers" value={metricsData.female} colorClass="text-pink-600" />
           <MetricCard title="Unassigned Sex" value={metricsData.unassigned} colorClass="text-slate-400" />
           <MetricCard title="Divisions/CPS" value={metricsData.divisions} colorClass="text-purple-600" />
           <MetricCard title="Stations" value={metricsData.stations} colorClass="text-emerald-600" />
           <MetricCard title="Police Posts" value={metricsData.posts} colorClass="text-amber-600" />
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-[99999] bg-black/50 backdrop-blur-xs flex items-center justify-center p-3">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-md p-5 space-y-4">
            <div className="flex justify-between items-center border-b pb-2">
              <h3 className="text-sm font-extrabold text-slate-800 uppercase flex items-center"><Filter className="w-4 h-4 mr-1.5 text-blue-600" /> Station Nominal List Export</h3>
              <button onClick={() => setShowModal(false)} className="cursor-pointer"><X size={16} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Target Region</label>
                <select value={targetRegion} onChange={(e) => setTargetRegion(e.target.value)} className="w-full text-xs border rounded p-2 bg-white font-bold text-slate-800">
                  <option value="ALL REGIONS">ALL REGIONS</option>
                  {Object.keys(REGIONAL_HIERARCHY).map(reg => <option key={reg} value={reg}>{reg}</option>)}
                </select>
              </div>
            </div>
            <div className="flex space-x-2 pt-2">
              <button type="button" onClick={() => setShowModal(false)} className="flex-1 bg-slate-100 py-2 rounded text-xs font-bold cursor-pointer">Cancel</button>
              <button type="button" onClick={handleExecuteExportModal} className="flex-1 bg-blue-700 text-white py-2 rounded text-xs font-bold shadow cursor-pointer">Download</button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 space-y-4">
          {canEditRecords && (
            <div className="bg-white p-3.5 rounded-xl shadow-sm border border-slate-200 space-y-2.5">
              <h4 className="font-extrabold text-slate-800 text-xs uppercase tracking-wider flex items-center"><Upload className="w-3.5 h-3.5 mr-1.5 text-blue-600" /> Batch Excel Import</h4>
              <BulkNominalRollUpload multiple onUploadSuccess={() => window.location.reload()} />
            </div>
          )}
        </div>

        <div className="lg:col-span-7 space-y-3.5">
          <div className="flex flex-col sm:flex-row gap-2.5 items-center justify-between">
            <div className="flex gap-2.5 flex-1 w-full">
              <select value={filterRegion} onChange={(e) => setFilterRegion(e.target.value)} className="border rounded-lg px-3 py-1.5 text-xs font-bold bg-white text-slate-800">
                <option value="ALL REGIONS">ALL REGIONS</option>
                {Object.keys(REGIONAL_HIERARCHY).map(reg => <option key={reg} value={reg}>{reg}</option>)}
              </select>
              <select value={filterStation} onChange={(e) => setFilterStation(e.target.value)} className="border rounded-lg px-3 py-1.5 text-xs font-bold bg-white text-slate-800">
                <option value="ALL STATIONS">ALL STATIONS</option>
                {availableStationsList.map(stn => <option key={stn} value={stn}>{stn}</option>)}
              </select>
            </div>
            <div className="relative w-full sm:w-64">
              <input type="text" placeholder="Search ledger..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full text-xs border rounded-lg pl-8 pr-7 py-1.5 bg-white text-slate-800" />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            </div>
          </div>

          {showAnalytics ? (
            <ExpandableTableCard title="Active Roll Analytics">
              {(expanded) => (
                <div className="bg-white p-5 flex flex-col space-y-4 h-full">
                  <div className="flex justify-between items-center border-b pb-3">
                    <h3 className="font-extrabold text-base text-indigo-900 flex items-center"><PieChart className="mr-2 w-4 h-4"/> ({analyticsFilteredDataset.length} Officers Shown)</h3>
                    <div className="flex items-center gap-2 bg-indigo-50 p-2 rounded-lg">
                      <select value={metricCategory} onChange={e => { setMetricCategory(e.target.value); setAnalyticsMetricFilterValue('ALL'); }} className="border rounded p-1 text-xs font-bold">
                        <option value="RANK">Rank Breakdown</option>
                        <option value="STATUS">Personnel Status</option>
                        <option value="SEX">Sex Distribution</option>
                      </select>
                      <select value={analyticsMetricFilterValue} onChange={e => setAnalyticsMetricFilterValue(e.target.value)} className="border rounded p-1 text-xs font-bold">
                        <option value="ALL">ALL</option>
                        {availableAnalyticsFilterOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="overflow-auto flex-1 border rounded-lg">
                    <table className="min-w-full divide-y divide-gray-200 text-xs">
                      <thead className="bg-indigo-50">
                        <tr>
                          <th className="px-3 py-2 text-left">F/NO</th>
                          <th className="px-3 py-2 text-left">Rank</th>
                          <th className="px-3 py-2 text-left">Name</th>
                          <th className="px-3 py-2 text-left">Station</th>
                          <th className="px-3 py-2 text-left">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analyticsFilteredDataset.map(n => (
                          <tr key={n.fnum || n.f_num} onClick={() => { setAnalyticsSelectedOfficer(n); setShowAnalyticsDossier(true); }} className="hover:bg-indigo-50 cursor-pointer">
                            <td className="px-3 py-2 font-bold text-blue-700">{cleanStr(n.fnum || n.f_num)}</td>
                            <td className="px-3 py-2 font-bold">{cleanStr(n.rank)}</td>
                            <td className="px-3 py-2 uppercase">{cleanStr(n.name)}</td>
                            <td className="px-3 py-2">{cleanStr(n.station)}</td>
                            <td className="px-3 py-2 font-bold text-green-700">{cleanStr(n.status)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </ExpandableTableCard>
          ) : (
            <ExpandableTableCard title="Active Nominal Roll Ledger">
              {(expanded) => (
                <div className={`overflow-auto w-full bg-white dark:bg-slate-900 ${expanded ? 'h-full flex-1' : 'max-h-[500px]'}`}>
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50 dark:bg-slate-950 sticky top-0 z-10">
                      <tr>
                        <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-500 uppercase">S/No</th>
                        <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-500 uppercase">F/NO</th>
                        <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-500 uppercase">Rank</th>
                        <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-500 uppercase">Name</th>
                        <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-500 uppercase">Station</th>
                        <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-500 uppercase">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {currentRollDataset.map((n, idx) => (
                        <tr key={n.sn || n.fnum} onClick={() => setSelectedOfficer(n)} className="hover:bg-blue-50 cursor-pointer">
                          <td className="px-3 py-2 text-xs font-bold">{idx + 1}</td>
                          <td className="px-3 py-2 text-xs font-bold text-blue-700">{cleanStr(n.f_num || n.fnum)}</td>
                          <td className="px-3 py-2 text-xs font-bold">{cleanStr(n.rank)}</td>
                          <td className="px-3 py-2 text-xs uppercase font-medium">{cleanStr(n.name)}</td>
                          <td className="px-3 py-2 text-xs font-bold text-blue-700">{cleanStr(n.station)}</td>
                          <td className="px-3 py-2 text-xs font-bold text-green-700">{cleanStr(n.status) || 'ACTIVE'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </ExpandableTableCard>
          )}
        </div>
      </div>

      {selectedOfficer && <OfficerDossierModal officer={selectedOfficer} onClose={() => setSelectedOfficer(null)} />}
      {showAnalyticsDossier && analyticsSelectedOfficer && <OfficerDossierModal officer={analyticsSelectedOfficer} onClose={() => { setShowAnalyticsDossier(false); setAnalyticsSelectedOfficer(null); }} />}
    </div>  
  );
};

export default Nominal_Roll;