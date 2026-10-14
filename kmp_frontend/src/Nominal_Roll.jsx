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

const REGION_SORT_PRIORITY = {
  "KMP HEADQUARTERS": 1,
  "KMP NORTH HEADQUARTERS": 2,
  "KMP NORTH": 3,
  "KMP EAST HEADQUARTERS": 4,
  "KMP EAST": 5,
  "KMP SOUTH HEADQUARTERS": 6,
  "KMP SOUTH": 7,
  "POLICE HEADQUARTERS": 8
};

const isStationEquivalent = (statA, statB) => {
  const a = cleanStr(statA);
  const b = cleanStr(statB);
  if (!a || !b) return false;
  if (a === b) return true;
  const cleanA = a.replace(/(\s+HEADQUARTERS|\s+HQ)$/, '');
  const cleanB = b.replace(/(\s+HEADQUARTERS|\s+HQ)$/, '');
  return cleanA === cleanB && cleanA.length > 0;
};

const parseStationHierarchy = (rawStation) => {
  const cleaned = cleanStr(rawStation);
  if (!cleaned) return { division: 'UNASSIGNED', station: 'UNASSIGNED', post: '', type: 'POST' };

  if (cleaned.includes('/') || cleaned.includes('\\')) {
    const parts = cleaned.split(/[\/\\]/).map(p => cleanStr(p));
    const parent = parts[0];
    const child = parts[1] || '';
    
    let type = 'POST';
    if (child.includes('SUB-STATION') || child.includes('SUBSTATION')) {
      return { division: parent, station: parent, post: '', type: 'STATION' }; 
    } else if (child.includes('STATION')) {
      type = 'STATION';
    }

    return { division: parent, station: parent, post: type === 'POST' ? child : '', type };
  }

  if (cleaned.endsWith(' P/P') || cleaned.endsWith(' P.P') || cleaned.includes('POLICE POST')) {
    const name = cleaned.replace(/P\/P|P\.P|POLICE POST/g, '').trim();
    return { division: 'GENERAL', station: 'GENERAL', post: name, type: 'POST' };
  }
  if (cleaned.endsWith(' P/S') || cleaned.endsWith(' P.S') || cleaned.includes('POLICE STATION')) {
    const name = cleaned.replace(/P\/S|P\.S|POLICE STATION/g, '').trim();
    return { division: name, station: name, post: '', type: 'STATION' };
  }

  for (const stationsList of Object.values(REGIONAL_HIERARCHY)) {
    if (stationsList.includes(cleaned)) {
      return { division: cleaned, station: cleaned, post: '', type: 'DIVISION' };
    }
  }

  return { division: cleaned, station: cleaned, post: '', type: 'STATION' };
};

const getOfficialRegionForStation = (stationName, dbRegion) => {
  const parsed = parseStationHierarchy(stationName);
  const cleanDbRegion = cleanStr(dbRegion);

  if (REGIONAL_HIERARCHY[cleanDbRegion]) {
    const matches = REGIONAL_HIERARCHY[cleanDbRegion].some(s => isStationEquivalent(s, parsed.division) || isStationEquivalent(s, parsed.station));
    if (matches) return cleanDbRegion;
  }

  for (const [regionName, stationsList] of Object.entries(REGIONAL_HIERARCHY)) {
    if (stationsList.some(s => isStationEquivalent(s, parsed.division) || isStationEquivalent(s, parsed.station))) {
      return regionName;
    }
  }
  return cleanDbRegion || 'KMP GENERAL';
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
      REGIONAL_HIERARCHY[activeReg].forEach(stn => {
        const parsed = parseStationHierarchy(stn);
        if (parsed.station && parsed.station !== 'UNASSIGNED') list.add(parsed.station);
      });
    } else {
      Object.values(REGIONAL_HIERARCHY).forEach(arr => arr.forEach(stn => {
        const parsed = parseStationHierarchy(stn);
        if (parsed.station && parsed.station !== 'UNASSIGNED') list.add(parsed.station);
      }));
    }

    (Array.isArray(Nominal_Rolls) ? Nominal_Rolls : []).forEach(n => {
      if (n.station) {
        const cleaned = cleanStr(n.station);
        const parsed = parseStationHierarchy(cleaned);
        const reg = getOfficialRegionForStation(cleaned, cleanStr(n.region));
        if (cleaned && parsed.station && (activeReg === 'ALL REGIONS' || reg === activeReg)) {
          list.add(parsed.station);
        }
      }
    });

    return Array.from(list).sort();
  }, [Nominal_Rolls, filterRegion]);

  const availablePostsList = useMemo(() => {
    const list = new Set();
    (Array.isArray(Nominal_Rolls) ? Nominal_Rolls : []).forEach(n => {
      if (n.station) {
        const cleaned = cleanStr(n.station);
        const parsed = parseStationHierarchy(cleaned);
        if (parsed.post) list.add(parsed.post);
      }
    });
    return Array.from(list).sort();
  }, [Nominal_Rolls]);

  const populateUpdateForm = (data) => {
    setFormData({
      sn: data.sn !== undefined ? data.sn : null,
      fnum: data.fnum || data.f_num || '',
      rank: data.rank || '',
      name: data.name || '',
      sex: data.sex || 'MALE',
      position: data.position || '',
      dob: data.dob || '',
      doe: data.doe || '',
      dopost: data.dopost || data.do_post || data.dop || '',
      dopro: data.dopro || data.do_pro || '',
      contact: data.contact || '',
      educlevel: data.educlevel || data.educ_level || data.education || '',
      ipps: data.ipps || '',
      tin: data.tin || '',
      nin: data.nin || '',
      homedist: data.homedist || data.home_dist || data.district || '',
      tribe: data.tribe || '',
      accno: data.accno || data.acc_no || '',
      bankbranch: data.bankbranch || data.bank_branch || '',
      station: data.station || '',
      district: data.district || '',
      region: data.region || currentUser?.region || '',
      section: data.section || '',
      dir: data.dir || '',
      status: data.status || 'ACTIVE'
    });
  };

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

  const filteredRolls = useMemo(() => {
    const list = (Array.isArray(Nominal_Rolls) ? Nominal_Rolls : []).filter(n => {
      const statusStr = cleanStr(n.status);
      if (statusStr === 'ARCHIVED' || n.is_archived === true) return false;

      const stn = cleanStr(n.station);
      const reg = getOfficialRegionForStation(stn, cleanStr(n.region));
      const parsedStn = parseStationHierarchy(stn);

      const selRegion = cleanStr(filterRegion);
      const selStation = cleanStr(filterStation);
      const selPost = cleanStr(filterPost);

      if (selRegion && selRegion !== 'ALL REGIONS' && reg !== selRegion) return false;
      
      if (selStation && selStation !== 'ALL STATIONS') {
        if (!isStationEquivalent(parsedStn.station, selStation) && !isStationEquivalent(stn, selStation)) return false;
      }

      if (selPost && selPost !== 'ALL POSTS') {
        if (!isStationEquivalent(parsedStn.post, selPost)) return false;
      }

      if (searchTerm.trim()) {
        const query = searchTerm.trim().toLowerCase();
        const fnum = cleanStr(n.f_num || n.fnum).toLowerCase();
        const name = cleanStr(n.name).toLowerCase();
        const rank = cleanStr(n.rank).toLowerCase();
        const ipps = cleanStr(n.ipps).toLowerCase();
        const station = cleanStr(n.station).toLowerCase();
        const nin = cleanStr(n.nin).toLowerCase();
        
        if (!fnum.includes(query) && !name.includes(query) && !rank.includes(query) && !ipps.includes(query) && !station.includes(query) && !nin.includes(query)) {
          return false;
        }
      }
      return true;
    });

    return list;
  }, [Nominal_Rolls, filterRegion, filterStation, filterPost, searchTerm]);

  const filteredNominal_Roll_archives = useMemo(() => {
    if (!Array.isArray(Nominal_Roll_archives)) return [];

    return Nominal_Roll_archives.filter(n => {
      const stn = cleanStr(n.station);
      const reg = getOfficialRegionForStation(stn, cleanStr(n.region));
      const parsedStn = parseStationHierarchy(stn);

      const selRegion = cleanStr(filterRegion);
      const selStation = cleanStr(filterStation);
      const selPost = cleanStr(filterPost);

      if (selRegion && selRegion !== 'ALL REGIONS' && reg !== selRegion) return false;
      
      if (selStation && selStation !== 'ALL STATIONS') {
        if (!isStationEquivalent(parsedStn.station, selStation) && !isStationEquivalent(stn, selStation)) return false;
      }

      if (selPost && selPost !== 'ALL POSTS') {
        if (!isStationEquivalent(parsedStn.post, selPost)) return false;
      }

      if (searchTerm.trim()) {
        const query = searchTerm.trim().toLowerCase();
        const fnum = cleanStr(n.f_num || n.fnum).toLowerCase();
        const name = cleanStr(n.name).toLowerCase();
        const rank = cleanStr(n.rank).toLowerCase();
        const ipps = cleanStr(n.ipps).toLowerCase();
        const station = cleanStr(n.station).toLowerCase();
        const nin = cleanStr(n.nin).toLowerCase();
        const reason = cleanStr(n.archive_reason).toLowerCase();
        
        if (!fnum.includes(query) && !name.includes(query) && !rank.includes(query) && !ipps.includes(query) && !station.includes(query) && !nin.includes(query) && !reason.includes(query)) {
          return false;
        }
      }
      return true;
    });
  }, [Nominal_Roll_archives, filterRegion, filterStation, filterPost, searchTerm]);

  const currentRollDataset = useMemo(() => {
    return viewMode === 'archive' ? filteredNominal_Roll_archives : filteredRolls;
  }, [viewMode, filteredRolls, filteredNominal_Roll_archives]);

  const analyticsFilteredDataset = useMemo(() => {
  if (analyticsMetricFilterValue === 'ALL') return currentRollDataset;

  return currentRollDataset.filter(n => {
    if (metricCategory === 'RANK') {
      let r = cleanStr(n.rank);
      if (r.includes('DRV')) r = 'PC';
      return r === analyticsMetricFilterValue;
    } else if (metricCategory === 'UNIT') {
      const parsed = parseStationHierarchy(n.station);
      return (parsed.division || parsed.station) === analyticsMetricFilterValue;
    } else if (metricCategory === 'STATUS') {
      const normStatus = n.normalized_status || cleanStr(n.status);
      return normStatus === analyticsMetricFilterValue;
    } else if (metricCategory === 'EDUCATION') {
      return parseEducationLevel(n.educlevel || n.educ_level) === analyticsMetricFilterValue;
    } else if (metricCategory === 'DISTRICT') {
      return cleanStr(n.homedist || n.home_dist || n.district) === analyticsMetricFilterValue;
    } else if (metricCategory === 'BANK') {
      return cleanStr(n.bankbranch || n.bank_branch) === analyticsMetricFilterValue;
    } else if (metricCategory === 'TRIBE') {
      return cleanStr(n.tribe) === analyticsMetricFilterValue;
    } else if (metricCategory === 'SEX') {
      const sexStr = cleanStr(n.sex);
      const isFemale = sexStr === 'F' || sexStr === 'FEMALE';
      return analyticsMetricFilterValue === 'FEMALE' ? isFemale : !isFemale;
    } else if (metricCategory === 'AGE') {
      return (n.age_bracket || 'UNKNOWN / UNRECORDED') === analyticsMetricFilterValue;
    } else if (metricCategory === 'SECTION') {
      return cleanStr(n.normalized_section || n.section || n.dir) === analyticsMetricFilterValue;
    }
    return true;
  });
}, [currentRollDataset, metricCategory, analyticsMetricFilterValue]);

const availableAnalyticsFilterOptions = useMemo(() => {
  const setVals = new Set();
  const dataset = Array.isArray(currentRollDataset) ? currentRollDataset : [];
  
  for (let i = 0; i < dataset.length; i++) {
    const n = dataset[i];
    if (metricCategory === 'RANK') {
      let r = cleanStr(n.rank);
      if (r.includes('DRV')) r = 'PC';
      if (r) setVals.add(r);
    } else if (metricCategory === 'UNIT') {
      const parsed = parseStationHierarchy(n.station);
      if (parsed.division && parsed.division !== 'UNASSIGNED') setVals.add(parsed.division);
    } else if (metricCategory === 'STATUS') {
      setVals.add('ACTIVE (DEPLOYABLE)');
      setVals.add('NON-DEPLOYABLE (HEALTH/LEAVE)');
    } else if (metricCategory === 'EDUCATION') {
      setVals.add(parseEducationLevel(n.educlevel || n.educ_level));
    } else if (metricCategory === 'DISTRICT') {
      const dist = cleanStr(n.homedist || n.home_dist || n.district);
      if (dist) setVals.add(dist);
    } else if (metricCategory === 'BANK') {
      const bank = cleanStr(n.bankbranch || n.bank_branch);
      if (bank) setVals.add(bank);
    } else if (metricCategory === 'TRIBE') {
      const tr = cleanStr(n.tribe);
      if (tr) setVals.add(tr);
    } else if (metricCategory === 'SEX') {
      setVals.add('MALE');
      setVals.add('FEMALE');
    } else if (metricCategory === 'AGE') {
      setVals.add(n.age_bracket || 'UNKNOWN / UNRECORDED');
    } else if (metricCategory === 'SECTION') {
      const sec = cleanStr(n.normalized_section || n.section || n.dir);
      if (sec) setVals.add(sec);
    }
  }
  return Array.from(setVals).sort();
}, [currentRollDataset, metricCategory]);

  const availableUpdateRolls = useMemo(() => {
    return (Array.isArray(Nominal_Rolls) ? Nominal_Rolls : []).filter(n => {
      const fNumVal = cleanStr(n.fnum || n.f_num);
      if (!isGlobalTier && !canViewGlobalLevel && cleanStr(n.region) !== userRegClean) return false;
      if (updateSearch) {
        const query = updateSearch.toLowerCase();
        return fNumVal.toLowerCase().includes(query) || 
               cleanStr(n.name).toLowerCase().includes(query) || 
               cleanStr(n.ipps).toLowerCase().includes(query);
      }
      return true;
    });
  }, [Nominal_Rolls, userRegClean, updateSearch, isGlobalTier, canViewGlobalLevel]);

  const metricsData = useMemo(() => {
    let maleCount = 0;
    let femaleCount = 0;
    const divisionsSet = new Set();
    const stationsSet = new Set();
    const postsSet = new Set();

    currentRollDataset.forEach(n => {
      const sexStr = cleanStr(n.sex);
      const ninStr = cleanStr(n.nin);
        
      if (sexStr === 'F' || sexStr === 'FEMALE' || ninStr.startsWith('CF')) {
        femaleCount++;
      } else if (sexStr === 'M' || sexStr === 'MALE' || ninStr.startsWith('CM')) {
        maleCount++;
      }

      if (n.station) {
        const parsed = parseStationHierarchy(n.station);
        if (parsed.division && parsed.division !== 'UNASSIGNED') divisionsSet.add(parsed.division);
        if (parsed.station && parsed.station !== 'UNASSIGNED') stationsSet.add(parsed.station);
        if (parsed.post) postsSet.add(parsed.post); 
      }
    });

    return {
      total: currentRollDataset.length,
      male: maleCount,
      female: femaleCount,
      unassigned: currentRollDataset.length - (maleCount + femaleCount),
      divisions: divisionsSet.size,
      stations: stationsSet.size,
      posts: postsSet.size
    };
  }, [currentRollDataset]);

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
            <BarChart3 className="w-4 h-4 mr-1.5 text-blue-600 shrink-0"/> 
            Personnel Metrics Dashboard ({viewMode === 'archive' ? 'Archived Records' : 'Active Roll'})
          </h4>
          <div className="flex items-center gap-2">
            {canEditRecords && viewMode === 'active' && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleFetchAuditPreview}
                  disabled={isLoadingAudit}
                  className="bg-amber-600 hover:bg-amber-700 text-white px-3 py-1 text-xs font-bold rounded-md shadow transition-all cursor-pointer flex items-center disabled:opacity-50"
                >
                  <Eye className="w-3.5 h-3.5 mr-1" /> {isLoadingAudit ? 'Loading...' : 'Audit Missing Info'}
                </button>
                <button
                  type="button"
                  onClick={() => { setModalMode('station_list'); setShowModal(true); }}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 text-xs font-bold rounded-md shadow transition-all cursor-pointer flex items-center"
                >
                  <Download className="w-3.5 h-3.5 mr-1" /> Station Nominal List
                </button>
              </div>
            )}
            <div className="inline-flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 shadow-inner shrink-0">
               <button 
                type="button"
                onClick={() => { setViewMode('active'); setShowAnalytics(false); setBulkSelectMode(false); }} 
                className={`px-3 py-1 text-xs font-bold rounded-md transition-all cursor-pointer ${viewMode === 'active' && !showAnalytics ? 'bg-slate-900 text-white shadow' : 'text-slate-600 hover:text-slate-900'}`}
               >
                 Active Roll
               </button>
               <button 
                type="button"
                onClick={() => { setViewMode('archive'); setShowAnalytics(false); setBulkSelectMode(false); }} 
                className={`px-3 py-1 text-xs font-bold rounded-md transition-all cursor-pointer ${viewMode === 'archive' && !showAnalytics ? 'bg-red-700 text-white shadow' : 'text-slate-600 hover:text-slate-900'}`}
               >
                 Archived
               </button>
               <button 
                type="button"
                onClick={() => setShowAnalytics(!showAnalytics)} 
                className={`px-3 py-1 text-xs font-bold rounded-md transition-all cursor-pointer ${showAnalytics ? 'bg-indigo-700 text-white shadow' : 'text-slate-600 hover:text-slate-900'}`}
               >
                 {showAnalytics ? 'Close Analytics' : 'Analytics Breakdown'}
               </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-2">
           <MetricCard title="Total Personnel" value={metricsData.total} colorClass={viewMode === 'archive' ? "text-red-700" : "text-blue-700"} />
           <MetricCard title="Male Officers" value={metricsData.male} colorClass="text-indigo-600" />
           <MetricCard title="Female Officers" value={metricsData.female} colorClass="text-pink-600" />
           <MetricCard title="Unassigned Sex" value={metricsData.unassigned} colorClass="text-slate-400" />
           <MetricCard title="Divisions/CPS" value={metricsData.divisions} colorClass="text-purple-600" />
           <MetricCard title="Stations" value={metricsData.stations} colorClass="text-emerald-600" />
           <MetricCard title="Police Posts" value={metricsData.posts} colorClass="text-amber-600" />
        </div>
      </div>

      {showAuditPreviewModal && (
        <div className="fixed inset-0 z-[999999] bg-black/50 backdrop-blur-xs flex items-center justify-center p-3 animate-in fade-in">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-4xl p-5 space-y-4 flex flex-col max-h-[85vh]">
            <div className="flex justify-between items-center border-b pb-3 shrink-0">
              <h3 className="text-sm font-extrabold text-slate-800 uppercase flex items-center">
                <AlertTriangle className="w-4 h-4 mr-1.5 text-amber-600" /> Manpower Audit: Missing Information ({auditPreviewData.length} Officers Flagged)
              </h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => { setModalMode('audit'); setShowAuditPreviewModal(false); setShowModal(true); }}
                  className="bg-amber-600 hover:bg-amber-700 text-white px-3 py-1.5 text-xs font-bold rounded shadow transition flex items-center cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 mr-1" /> Download Audit Report
                </button>
                <button onClick={() => setShowAuditPreviewModal(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="overflow-y-auto flex-1 custom-scrollbar border border-slate-200 rounded-lg">
              <table className="min-w-full divide-y divide-slate-200 text-xs">
                <thead className="bg-slate-50 sticky top-0 z-10">
                  <tr>
                    <th className="px-3 py-2.5 text-left font-bold text-slate-700 uppercase">S/No</th>
                    <th className="px-3 py-2.5 text-left font-bold text-slate-700 uppercase">Force No</th>
                    <th className="px-3 py-2.5 text-left font-bold text-slate-700 uppercase">Rank & Name</th>
                    <th className="px-3 py-2.5 text-left font-bold text-slate-700 uppercase">Station / Region</th>
                    <th className="px-3 py-2.5 text-left font-bold text-amber-700 uppercase">Missing Fields</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-100">
                  {auditPreviewData.map((row, idx) => (
                    <tr key={row.force_number || idx} className="hover:bg-amber-50/40 transition-colors">
                      <td className="px-3 py-2 font-bold">{idx + 1}</td>
                      <td className="px-3 py-2 font-bold text-blue-700">{row.force_number}</td>
                      <td className="px-3 py-2 uppercase font-medium">{row.rank} {row.name}</td>
                      <td className="px-3 py-2 text-slate-600">{row.station} <span className="text-[10px] text-slate-400">({row.region})</span></td>
                      <td className="px-3 py-2 font-bold text-amber-700 bg-amber-50/50 rounded">{row.missing_fields}</td>
                    </tr>
                  ))}
                  {auditPreviewData.length === 0 && (
                    <tr><td colSpan="5" className="text-center p-8 text-xs text-slate-500 font-medium">✅ Perfect! No missing information found for officers in this scope.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="pt-2 shrink-0 flex justify-end">
              <button 
                type="button" 
                onClick={() => setShowAuditPreviewModal(false)} 
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded text-xs font-bold transition cursor-pointer"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-[99999] bg-black/50 backdrop-blur-xs flex items-center justify-center p-3 animate-in fade-in">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-md p-5 space-y-4">
            <div className="flex justify-between items-center border-b pb-2">
              <h3 className="text-sm font-extrabold text-slate-800 uppercase flex items-center">
                <Filter className="w-4 h-4 mr-1.5 text-blue-600" /> 
                {modalMode === 'audit' ? 'Scoped Missing Info Audit' : 'Station & Post Nominal List Export'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X size={16} />
              </button>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              {modalMode === 'audit' 
                ? 'Inspect or generate an Excel audit report identifying missing personnel information for a specific station or post.' 
                : 'View or download a complete, perfectly formatted nominal list for any selected station, division, or police post.'}
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Target Region</label>
                <select 
                  value={targetRegion} 
                  onChange={(e) => { setTargetRegion(e.target.value); setTargetStation('ALL STATIONS'); }}
                  disabled={!canViewGlobalLevel}
                  className="w-full text-xs border rounded p-2 bg-white font-bold text-slate-800 outline-none disabled:bg-gray-100 disabled:text-gray-500 cursor-pointer"
                >
                  {canViewGlobalLevel ? (
                    <><option value="ALL REGIONS">ALL REGIONS</option>{Object.keys(REGIONAL_HIERARCHY).map(reg => <option key={reg} value={reg}>{reg}</option>)}</>
                  ) : <option value={userRegClean}>{userRegClean}</option>}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Target Station, Division or Post</label>
                <select 
                  value={targetStation} 
                  onChange={(e) => setTargetStation(e.target.value)}
                  disabled={!(canViewGlobalLevel || isRegionalCommand)}
                  className="w-full text-xs border rounded p-2 bg-white font-bold text-slate-800 outline-none disabled:bg-gray-100 disabled:text-gray-500 cursor-pointer"
                >
                  {(canViewGlobalLevel || isRegionalCommand) ? (
                    <>
                      <option value="ALL STATIONS">ALL STATIONS (Full Region / Global)</option>
                      {availableStationsList.map(stn => <option key={stn} value={stn}>{stn}</option>)}
                    </>
                  ) : <option value={currentUser?.station}>{cleanStr(currentUser?.station)}</option>}
                </select>
              </div>
            </div>
            <div className="flex space-x-2 pt-2">
              <button 
                type="button" 
                onClick={() => setShowModal(false)} 
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-2 rounded text-xs font-bold transition cursor-pointer"
              >
                Cancel
              </button>
              {modalMode === 'audit' ? (
                <button 
                  type="button" 
                  onClick={handleFetchAuditPreview}
                  disabled={isLoadingAudit}
                  className="flex-1 bg-amber-600 hover:bg-amber-700 text-white py-2 rounded text-xs font-bold shadow transition cursor-pointer flex items-center justify-center disabled:opacity-50"
                >
                  <Eye className="w-3.5 h-3.5 mr-1" /> {isLoadingAudit ? 'Loading...' : 'View Audit List'}
                </button>
              ) : (
                <div className="flex-1 flex gap-2">
                  <button 
                    type="button" 
                    onClick={() => { 
                      setFilterStation(targetStation); 
                      setFilterRegion(targetRegion); 
                      setFilterPost('ALL POSTS'); 
                      setShowModal(false); 
                      setShowAnalytics(false); 
                      setViewMode('active'); 
                    }} 
                    className="flex-1 bg-slate-800 hover:bg-slate-900 text-white py-2 rounded text-xs font-bold shadow transition cursor-pointer flex items-center justify-center"
                  >
                    <Eye className="w-3.5 h-3.5 mr-1" /> View List
                  </button>
                  <button 
                    type="button" 
                    onClick={handleExecuteExportModal} 
                    className="flex-1 bg-blue-700 hover:bg-blue-800 text-white py-2 rounded text-xs font-bold shadow transition cursor-pointer flex items-center justify-center"
                  >
                    <Download className="w-3.5 h-3.5 mr-1" /> Download
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 space-y-4">
          {canEditRecords && (
            <div className="space-y-4">
              <div className="bg-white p-3.5 rounded-xl shadow-sm border border-slate-200 space-y-2.5 overflow-visible">
                <div className="border-b border-slate-100 pb-1.5 flex justify-between items-center">
                  <h4 className="font-extrabold text-slate-800 text-xs uppercase tracking-wider flex items-center">
                    <Upload className="w-3.5 h-3.5 mr-1.5 text-blue-600 shrink-0" /> Batch Excel / Multi-File Import
                  </h4>
                  <span className="text-[10px] text-amber-600 bg-amber-50 px-2 py-0.5 rounded font-bold border border-amber-200">
                    ⚠️ Ensure valid date formats (YYYY-MM-DD or DD-MM-YYYY)
                  </span>
                </div>
                 
                <div className="relative group inline-block w-full">
                  <div className="w-full">
                    <BulkNominalRollUpload multiple onUploadSuccess={() => window.location.reload()} />
                  </div>

                  <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 hidden group-hover:block z-50 bg-slate-900 text-white p-4 rounded-xl shadow-2xl border border-slate-700 animate-in fade-in zoom-in-95 duration-150 pointer-events-none w-[460px] sm:w-[520px]">
                    <p className="text-xs font-extrabold text-blue-400 uppercase tracking-wider mb-2 border-b border-slate-800 pb-1.5 flex items-center justify-between">
                      <span>📋 Ensure your column headers match these exactly:</span>
                    </p>
                    <div className="flex flex-wrap gap-1.5 text-xs font-mono">
                      <span className="bg-slate-800 px-2 py-1 rounded text-slate-100 border border-slate-700 font-bold">sn</span>
                      <span className="bg-slate-800 px-2 py-1 rounded text-slate-100 border border-slate-700 font-bold">f_num</span>
                      <span className="bg-slate-800 px-2 py-1 rounded text-slate-100 border border-slate-700 font-bold">rank</span>
                      <span className="bg-slate-800 px-2 py-1 rounded text-slate-100 border border-slate-700 font-bold">name</span>
                      <span className="bg-slate-800 px-2 py-1 rounded text-slate-100 border border-slate-700 font-bold">sex</span>
                      <span className="bg-slate-800 px-2 py-1 rounded text-slate-100 border border-slate-700 font-bold">position</span>
                      <span className="bg-slate-800 px-2 py-1 rounded text-slate-100 border border-slate-700 font-bold">dob</span>
                      <span className="bg-slate-800 px-2 py-1 rounded text-slate-100 border border-slate-700 font-bold">doe</span>
                      <span className="bg-slate-800 px-2 py-1 rounded text-slate-100 border border-slate-700 font-bold">do_post</span>
                      <span className="bg-slate-800 px-2 py-1 rounded text-slate-100 border border-slate-700 font-bold">do_pro</span>
                      <span className="bg-slate-800 px-2 py-1 rounded text-slate-100 border border-slate-700 font-bold">contact</span>
                      <span className="bg-slate-800 px-2 py-1 rounded text-slate-100 border border-slate-700 font-bold">educ_level</span>
                      <span className="bg-slate-800 px-2 py-1 rounded text-slate-100 border border-slate-700 font-bold">ipps</span>
                      <span className="bg-slate-800 px-2 py-1 rounded text-slate-100 border border-slate-700 font-bold">tin</span>
                      <span className="bg-slate-800 px-2 py-1 rounded text-slate-100 border border-slate-700 font-bold">nin</span>
                      <span className="bg-slate-800 px-2 py-1 rounded text-slate-100 border border-slate-700 font-bold">home_dist</span>
                      <span className="bg-slate-800 px-2 py-1 rounded text-slate-100 border border-slate-700 font-bold">tribe</span>
                      <span className="bg-slate-800 px-2 py-1 rounded text-slate-100 border border-slate-700 font-bold">acc_no</span>
                      <span className="bg-slate-800 px-2 py-1 rounded text-slate-100 border border-slate-700 font-bold">bank_branch</span>
                      <span className="bg-slate-800 px-2 py-1 rounded text-slate-100 border border-slate-700 font-bold">station</span>
                      <span className="bg-slate-800 px-2 py-1 rounded text-slate-100 border border-slate-700 font-bold">district</span>
                      <span className="bg-slate-800 px-2 py-1 rounded text-slate-100 border border-slate-700 font-bold">region</span>
                      <span className="bg-slate-800 px-2 py-1 rounded text-slate-100 border border-slate-700 font-bold">section</span>
                      <span className="bg-slate-800 px-2 py-1 rounded text-slate-100 border border-slate-700 font-bold">dir</span>
                      <span className="bg-slate-800 px-2 py-1 rounded text-slate-100 border border-slate-700 font-bold">status</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="bg-slate-900 px-4 py-2.5 border-b border-slate-800 flex justify-between items-center">
                  <h3 className="text-white text-xs font-bold uppercase tracking-wider flex items-center">
                    <Users className="w-3.5 h-3.5 mr-1.5 text-blue-400" /> ⚙️ Log Personnel
                  </h3>
                </div>
                <div className="p-3.5 space-y-3.5">
                  <div className="flex space-x-2 bg-gray-100 p-1 rounded-lg">
                    <button type="button" onClick={() => handleOperationToggle('new')} className={`flex-1 py-1.5 text-xs font-bold rounded transition-all cursor-pointer ${operation === 'new' ? 'bg-white shadow text-blue-700' : 'text-gray-600 hover:text-gray-900'}`}><PlusCircle className="w-3.5 h-3.5 inline mr-1" /> Register New</button>
                    <button type="button" onClick={() => handleOperationToggle('update')} className={`flex-1 py-1.5 text-xs font-bold rounded transition-all cursor-pointer ${operation === 'update' ? 'bg-white shadow text-blue-700' : 'text-gray-600 hover:text-gray-900'}`}><Edit className="w-3.5 h-3.5 inline mr-1" /> Update Existing</button>
                  </div>

                  {notification && <div className={`px-3 py-2 rounded-lg flex items-center text-xs ${notification.includes('Error') || notification.includes('❌') ? 'bg-red-50 border border-red-200 text-red-800' : 'bg-green-50 border border-green-200 text-green-800'}`}>{notification.includes('Error') || notification.includes('❌') ? <AlertTriangle className="w-4 h-4 mr-2 text-red-500 shrink-0" /> : <CheckCircle className="w-4 h-4 mr-2 text-green-500 shrink-0" />}<span className="font-medium">{notification}</span></div>}

                  {operation === 'update' && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5">
                      <label className="block text-[11px] font-bold text-blue-800 mb-1.5">🔍 Search & Select Officer to Update</label>
                      <input type="text" placeholder="Search by Force No, Name, IPPS..." value={updateSearch} onChange={e => setUpdateSearch(e.target.value)} className="w-full text-xs p-1.5 mb-1.5 border border-blue-200 rounded outline-none focus:ring-1 focus:ring-blue-400 bg-white text-slate-800" />
                      <div className="max-h-32 overflow-y-auto bg-white border border-blue-100 rounded custom-scrollbar">
                        {availableUpdateRolls.length === 0 ? <div className="p-2 text-[11px] text-gray-500 text-center">No personnel found.</div> : availableUpdateRolls.map(n => (
                            <div key={n.sn || n.fnum} onClick={() => populateUpdateForm(n)} className={`p-1.5 text-[11px] border-b cursor-pointer transition-colors ${formData.sn === n.sn ? 'bg-blue-600 text-white font-bold' : 'hover:bg-blue-50 text-gray-700'}`}>
                              <span className={formData.sn === n.sn ? 'text-blue-200' : 'text-gray-400'}>F/NO: {cleanStr(n.fnum || n.f_num)}</span> | <span className={formData.sn === n.sn ? 'text-white' : 'font-bold text-blue-700'}>{cleanStr(n.name)}</span>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                     
                  <form onSubmit={handleFormSubmit} className="space-y-3">
                    {operation === 'update' && (formData.sn || formData.fnum) && (
                      <div className="bg-red-50 p-3 rounded-lg border border-red-200 space-y-2 mb-3 shadow-xs">
                        <h4 className="text-[11px] font-bold text-red-700 uppercase border-b border-red-200 pb-1 flex items-center"><AlertTriangle size={12} className="mr-1.5"/> Archive / Remove Officer (Optional)</h4>
                         
                        <div className="space-y-2">
                            <div>
                                <label className="block text-[10px] font-bold text-red-800 mb-0.5">Removal Reason</label>
                                <select value={archiveReason} onChange={(e) => setArchiveReason(e.target.value)} className="w-full text-xs border-red-300 rounded shadow-xs border py-1.5 px-2 font-bold text-red-700 outline-none focus:ring-1 focus:ring-red-400 bg-white">
                                    <option value="TRANSFERRED">Transferred</option>
                                    <option value="DEATH">Death</option>
                                    <option value="DISMISSAL">Dismissal</option>
                                    <option value="DESERTION">Desertion</option>
                                    <option value="RETIREMENT">Retirement</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-[10px] font-bold text-red-800 mb-0.5">Destination / Date Context</label>
                                <input 
                                    type="text"
                                    placeholder={archiveReason === 'TRANSFERRED' ? "e.g. CPS Kampala to Arua" : "e.g. 15/08/2026 at Mulago"}
                                    value={archiveDetail}
                                    onChange={(e) => setArchiveDetail(e.target.value)}
                                    className="w-full text-xs border border-red-300 rounded p-1.5 bg-white text-slate-800 outline-none"
                                />
                            </div>

                            <div>
                                <label className="block text-[10px] font-bold text-red-800 mb-0.5">Correspondence Ref (Message / Letter)</label>
                                <input 
                                    type="text"
                                    placeholder="e.g. CR/123/2026 or POL/MSG/89"
                                    value={corrRef}
                                    onChange={(e) => setCorrRef(e.target.value)}
                                    className="w-full text-xs border border-red-300 rounded p-1.5 bg-white text-slate-800 font-mono outline-none"
                                />
                            </div>

                            <button type="button" onClick={handleArchivePersonnel} className="w-full bg-red-600 hover:bg-red-700 text-white py-1.5 rounded font-bold text-xs shadow-xs transition border border-red-800 cursor-pointer mt-1">Move to Archive</button>
                        </div>
                      </div>
                    )}

                    {operation === 'update' && (formData.sn || formData.fnum) && <div className="bg-slate-800 text-white text-[11px] font-bold px-2.5 py-1.5 rounded">Editing: {formData.fnum}</div>}
                         
                    <div className="bg-gray-50 p-2.5 rounded-lg border border-gray-200 space-y-2">
                      <h4 className="text-[10px] font-bold text-gray-500 uppercase border-b pb-0.5">1. Identifiers</h4>
                      <div className="grid grid-cols-2 gap-2">
                        <div><label className="block text-[10px] font-bold text-gray-700 mb-0.5">F/NO. *</label><input type="text" name="fnum" value={formData.fnum} onChange={handleInputChange} required className="w-full text-xs border-gray-300 rounded shadow-xs border py-1.5 px-2 uppercase bg-white text-slate-800" /></div>
                        <div><label className="block text-[10px] font-bold text-gray-700 mb-0.5">IPPS NO. *</label><input type="text" name="ipps" value={formData.ipps} onChange={handleInputChange} required className="w-full text-xs border-gray-300 rounded shadow-xs border py-1.5 px-2 bg-white text-slate-800" /></div>
                        <div className="col-span-2"><label className="block text-[10px] font-bold text-gray-700 mb-0.5">NAME *</label><input type="text" name="name" value={formData.name} onChange={handleInputChange} required className="w-full text-xs border-gray-300 rounded shadow-xs border py-1.5 px-2 uppercase bg-white text-slate-800" /></div>
                        <div><label className="block text-[10px] font-bold text-gray-700 mb-0.5">RANK *</label><input type="text" name="rank" value={formData.rank} onChange={handleInputChange} required className="w-full text-xs border-gray-300 rounded shadow-xs border py-1.5 px-2 bg-white text-slate-800" /></div>
                        <div><label className="block text-[10px] font-bold text-gray-700 mb-0.5">SEX</label><select name="sex" value={formData.sex} onChange={handleInputChange} className="w-full text-xs border-gray-300 rounded shadow-xs border py-1.5 px-2 bg-white text-slate-800"><option>MALE</option><option>FEMALE</option></select></div>
                        <div><label className="block text-[10px] font-bold text-gray-700 mb-0.5">TIN NO.</label><input type="text" name="tin" value={formData.tin} onChange={handleInputChange} className="w-full text-xs border-gray-300 rounded shadow-xs border py-1.5 px-2 bg-white text-slate-800" /></div>
                        <div><label className="block text-[10px] font-bold text-gray-700 mb-0.5">NIN</label><input type="text" name="nin" value={formData.nin} onChange={handleInputChange} className="w-full text-xs border-gray-300 rounded shadow-xs border py-1.5 px-2 bg-white text-slate-800" /></div>
                      </div>
                    </div>

                    <div className="bg-gray-50 p-2.5 rounded-lg border border-gray-200 space-y-2">
                      <h4 className="text-[10px] font-bold text-gray-500 uppercase border-b pb-0.5">2. Service & Placement</h4>
                      <div className="grid grid-cols-2 gap-2">
                        <div><label className="block text-[10px] font-bold text-gray-700 mb-0.5">REGION *</label><select name="region" value={formData.region} onChange={handleInputChange} disabled={!isGlobalTier} required className="w-full text-xs border-gray-300 rounded shadow-xs border py-1.5 px-2 bg-white text-slate-800 disabled:bg-gray-100 disabled:text-gray-500">{isGlobalTier ? Object.keys(REGIONAL_HIERARCHY).map(reg => <option key={reg} value={reg}>{reg}</option>) : <option value={userRegClean}>{userRegClean}</option>}</select></div>
                        <div><label className="block text-[10px] font-bold text-gray-700 mb-0.5">DUTY STATION *</label><select name="station" value={formData.station} onChange={handleInputChange} disabled={!isGlobalTier && !isRegionalCommand} required className="w-full text-xs border-gray-300 rounded shadow-xs border py-1.5 px-2 bg-white text-slate-800 disabled:bg-gray-100 disabled:text-gray-500">{(isGlobalTier || isRegionalCommand) ? (REGIONAL_HIERARCHY[formData.region] || []).map(stat => <option key={stat} value={stat}>{stat}</option>) : (<option value={currentUser.station}>{cleanStr(currentUser.station)}</option>)}</select></div>
                        <div><label className="block text-[10px] font-bold text-gray-700 mb-0.5">POSITION *</label><input type="text" name="position" value={formData.position} onChange={handleInputChange} required className="w-full text-xs border-gray-300 rounded shadow-xs border py-1.5 px-2 bg-white text-slate-800" /></div>
                        <div><label className="block text-[10px] font-bold text-gray-700 mb-0.5">DISTRICT</label><input type="text" name="district" value={formData.district} onChange={handleInputChange} className="w-full text-xs border-gray-300 rounded shadow-xs border py-1.5 px-2 bg-white text-slate-800" /></div>
                        <div><label className="block text-[10px] font-bold text-gray-700 mb-0.5">SECTION</label><input type="text" name="section" value={formData.section} onChange={handleInputChange} className="w-full text-xs border-gray-300 rounded shadow-xs border py-1.5 px-2 bg-white text-slate-800" /></div>
                        <div><label className="block text-[10px] font-bold text-gray-700 mb-0.5">DIR (Directorate)</label><input type="text" name="dir" value={formData.dir} onChange={handleInputChange} className="w-full text-xs border-gray-300 rounded shadow-xs border py-1.5 px-2 bg-white text-slate-800" /></div>
                      </div>
                    </div>

                    <div className="bg-gray-50 p-2.5 rounded-lg border border-gray-200 space-y-2">
                      <h4 className="text-[10px] font-bold text-gray-500 uppercase border-b pb-0.5">3. Demographics</h4>
                      <div className="grid grid-cols-2 gap-2">
                        <div><label className="block text-[10px] font-bold text-gray-700 mb-0.5">D.O.B</label><input type="date" name="dob" min="1940-01-01" max="2035-12-31" value={formData.dob} onChange={handleInputChange} className="w-full text-xs border-gray-300 rounded shadow-xs border py-1.5 px-2 bg-white text-slate-800" /></div>
                        <div><label className="block text-[10px] font-bold text-gray-700 mb-0.5">D.O.E</label><input type="date" name="doe" min="1950-01-01" max="2035-12-31" value={formData.doe} onChange={handleInputChange} className="w-full text-xs border-gray-300 rounded shadow-xs border py-1.5 px-2 bg-white text-slate-800" /></div>
                        <div><label className="block text-[10px] font-bold text-gray-700 mb-0.5">D.O. POST</label><input type="date" name="dopost" min="1950-01-01" max="2035-12-31" value={formData.dopost} onChange={handleInputChange} className="w-full text-xs border-gray-300 rounded shadow-xs border py-1.5 px-2 bg-white text-slate-800" /></div>
                        <div><label className="block text-[10px] font-bold text-gray-700 mb-0.5">D.O. PRO</label><input type="date" name="dopro" min="1950-01-01" max="2035-12-31" value={formData.dopro} onChange={handleInputChange} className="w-full text-xs border-gray-300 rounded shadow-xs border py-1.5 px-2 bg-white text-slate-800" /></div>
                        <div className="col-span-2"><label className="block text-[10px] font-bold text-gray-700 mb-0.5">CONTACT</label><input type="text" name="contact" value={formData.contact} onChange={handleInputChange} className="w-full text-xs border-gray-300 rounded shadow-xs border py-1.5 px-2 bg-white text-slate-800" /></div>
                        <div><label className="block text-[10px] font-bold text-gray-700 mb-0.5">EDUC LEVEL</label><input type="text" name="educlevel" value={formData.educlevel} onChange={handleInputChange} className="w-full text-xs border-gray-300 rounded shadow-xs border py-1.5 px-2 bg-white text-slate-800" /></div>
                        <div><label className="block text-[10px] font-bold text-gray-700 mb-0.5">HOME DIST</label><input type="text" name="homedist" value={formData.homedist} onChange={handleInputChange} className="w-full text-xs border-gray-300 rounded shadow-xs border py-1.5 px-2 bg-white text-slate-800" /></div>
                        <div><label className="block text-[10px] font-bold text-gray-700 mb-0.5">TRIBE</label><input type="text" name="tribe" value={formData.tribe} onChange={handleInputChange} className="w-full text-xs border-gray-300 rounded shadow-xs border py-1.5 px-2 bg-white text-slate-800" /></div>
                      </div>
                    </div>

                    <div className="bg-gray-50 p-2.5 rounded-lg border border-gray-200 space-y-2">
                      <h4 className="text-[10px] font-bold text-gray-500 uppercase border-b pb-0.5">4. Financial & Status</h4>
                      <div className="grid grid-cols-2 gap-2">
                        <div><label className="block text-[10px] font-bold text-gray-700 mb-0.5">ACC. NO</label><input type="text" name="accno" value={formData.accno} onChange={handleInputChange} className="w-full text-xs border-gray-300 rounded shadow-xs border py-1.5 px-2 bg-white text-slate-800" /></div>
                        <div><label className="block text-[10px] font-bold text-gray-700 mb-0.5">BANK & BRANCH</label><input type="text" name="bankbranch" value={formData.bankbranch} onChange={handleInputChange} className="w-full text-xs border-gray-300 rounded shadow-xs border py-1.5 px-2 bg-white text-slate-800" /></div>
                        <div className="col-span-2">
                          <label className="block text-[10px] font-bold text-gray-700 mb-0.5">STATUS</label>
                          <select name="status" value={formData.status} onChange={handleInputChange} className="w-full text-xs border-gray-300 rounded shadow-xs border py-1.5 px-2 bg-white text-slate-800 font-bold">
                            <option>ACTIVE</option>
                            <option>AWOL</option>
                            <option>SICK</option>
                            <option>ON MISSION</option>
                            <option>ON LEAVE</option>
                            <option>ON COURSE</option>
                            <option>DUTY OUT</option>
                            <option>SUSPENDED</option>
                            <option>DISCHARGED</option>
                            <option>DESERTED</option>
                            <option>DISMISSED</option>
                            <option>INTERDICTED</option>
                            <option>MATERNITY LEAVE</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    {operation === 'new' && isArchivedReturnee && archiveDetails && (
                      <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg mt-2.5 animate-in fade-in zoom-in-95 shadow-xs">
                        <div className="flex items-start mb-2">
                          <AlertTriangle className="text-amber-500 w-4 h-4 mr-1.5 mt-0.5 shrink-0" />
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
                         
                        <div className="space-y-2.5 bg-white p-2.5 rounded-md border border-amber-100">
                          <div>
                            <label className="block text-[10px] font-bold text-slate-700 mb-0.5">Re-integration Authority / Reason *</label>
                            <input
                              type="text"
                              required
                              value={customReason}
                              onChange={(e) => setCustomReason(e.target.value)}
                              placeholder="e.g., Deployed from HR HQs back to KMP..."
                              className="w-full text-xs py-1.5 px-2 border border-slate-300 rounded shadow-xs focus:ring-1 focus:ring-amber-500 outline-none bg-white text-slate-800"
                            />
                          </div>
                             
                          <div>
                            <label className="block text-[10px] font-bold text-slate-700 mb-0.5 flex items-center">
                              Previous Force No. <span className="text-slate-400 font-normal ml-1">(If promoted to Gazetted File No.)</span>
                            </label>
                            <div className="flex flex-col sm:flex-row sm:items-center space-y-1 sm:space-y-0 sm:space-x-1.5">
                              <input
                                type="text"
                                value={previousFnum}
                                onChange={(e) => setPreviousFnum(e.target.value)}
                                placeholder="Leave blank if unchanged"
                                className="flex-1 text-xs py-1.5 px-2 border border-slate-300 rounded shadow-xs focus:ring-1 focus:ring-amber-500 outline-none uppercase bg-white text-slate-800"
                              />
                              {previousFnum && (
                                <div className="flex items-center text-[9px] font-bold text-amber-700 bg-amber-100 px-1.5 py-1 rounded border border-amber-200">
                                  <span>{previousFnum}</span>
                                  <ArrowRight className="w-2.5 h-2.5 mx-0.5" />
                                  <span>{formData.fnum}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    <button type="submit" className={`w-full transition-colors text-white py-2.5 font-bold rounded-lg shadow text-xs uppercase flex justify-center items-center cursor-pointer ${isArchivedReturnee ? 'bg-amber-600 hover:bg-amber-700' : 'bg-blue-700 hover:bg-blue-800'}`}>
                      {operation === 'new' 
                        ? (isArchivedReturnee ? '⚠️ Execute Safe Re-integration' : '💾 Log Personnel Record') 
                        : '💾 Save Updates'}
                    </button>
                  </form>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="lg:col-span-7 space-y-3.5">
          {viewMode === 'active' && canEditRecords && (
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 flex flex-col justify-between items-stretch gap-2.5">
              <div className="flex justify-between items-center">
                  <button
                    type="button"
                    onClick={() => { setBulkSelectMode(!bulkSelectMode); setSelectedOfficers([]); }}
                    className={`text-xs font-bold px-3.5 py-1.5 rounded-lg transition-colors border shadow-xs cursor-pointer ${bulkSelectMode ? 'bg-slate-800 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'}`}
                  >
                      {bulkSelectMode ? 'Cancel Bulk Select' : '☑️ Enable Bulk Archive'}
                  </button>
                  {bulkSelectMode && selectedOfficers.length > 0 && (
                      <span className="text-xs font-black text-red-600 bg-red-50 px-2.5 py-0.5 rounded border border-red-200">
                        {selectedOfficers.length} Selected
                      </span>
                  )}
              </div>
                 
              {bulkSelectMode && selectedOfficers.length > 0 && (
                  <div className="flex flex-col sm:flex-row items-center gap-2 animate-in fade-in slide-in-from-left-4 bg-white p-2.5 rounded-lg shadow-xs border border-red-200">
                      <select
                          value={bulkArchiveReason}
                          onChange={(e) => setBulkArchiveReason(e.target.value)}
                          className="w-full sm:w-auto text-xs border border-slate-300 rounded p-1.5 outline-none font-bold text-slate-700 bg-white cursor-pointer"
                      >
                          <option value="TRANSFERRED">Transferred</option>
                          <option value="DEATH">Death</option>
                          <option value="AWOL">Awol</option>
                          <option value="SUSPENDED">Suspended</option>
                          <option value="INTERDICTED">Interdicted</option>
                          <option value="DISMISSAL">Dismissal</option>
                          <option value="DESERTION">Desertion</option>
                          <option value="RETIREMENT">Retirement</option>
                      </select>

                      <input 
                          type="text"
                          placeholder="Bulk destination/date context..."
                          value={bulkArchiveDetail}
                          onChange={(e) => setBulkArchiveDetail(e.target.value)}
                          className="w-full sm:flex-1 text-xs border border-slate-300 rounded p-1.5 bg-white text-slate-800"
                      />

                      <input 
                          type="text"
                          placeholder="Correspondence Ref..."
                          value={bulkCorrRef}
                          onChange={(e) => setBulkCorrRef(e.target.value)}
                          className="w-full sm:w-36 text-xs border border-slate-300 rounded p-1.5 bg-white text-slate-800 font-mono"
                      />

                      <button
                          type="button"
                          onClick={handleBulkArchive}
                          disabled={isBulkArchiving}
                          className="w-full sm:w-auto text-xs font-bold bg-red-600 hover:bg-red-700 text-white px-3.5 py-1.5 rounded transition-colors shadow-xs disabled:opacity-50 cursor-pointer shrink-0"
                      >
                          {isBulkArchiving ? 'Archiving...' : `Archive (${selectedOfficers.length})`}
                      </button>
                  </div>
              )}
            </div>
          )}

          {/* JURISDICTION DROPDOWNS & SEARCH */}
          <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between">
            <div className="flex flex-col sm:flex-row gap-2.5 flex-1">
              <select value={filterRegion} onChange={(e) => { setFilterRegion(e.target.value); setFilterStation('ALL STATIONS'); setFilterPost('ALL POSTS'); }} disabled={!canViewGlobalLevel} className="border rounded-lg px-3 py-1.5 text-xs font-bold shadow-xs bg-white text-slate-800 border-slate-300 disabled:bg-gray-100 disabled:text-gray-500 w-full sm:w-auto outline-none focus:border-blue-500 cursor-pointer">
                {canViewGlobalLevel ? (
                  <><option value="ALL REGIONS">ALL REGIONS</option>{Object.keys(REGIONAL_HIERARCHY).map(reg => <option key={reg} value={reg}>{reg}</option>)}</>
                ) : <option value={userRegClean}>{userRegClean}</option>}
              </select>

              <select value={filterStation} onChange={(e) => { setFilterStation(e.target.value); setFilterPost('ALL POSTS'); }} disabled={!(canViewGlobalLevel || isRegionalCommand)} className="border rounded-lg px-3 py-1.5 text-xs font-bold shadow-xs bg-white text-slate-800 border-slate-300 disabled:bg-gray-100 disabled:text-gray-500 w-full sm:w-auto outline-none focus:border-blue-500 cursor-pointer">
                {(canViewGlobalLevel || isRegionalCommand) ? (
                  <><option value="ALL STATIONS">ALL STATIONS</option>{availableStationsList.map(stat => <option key={stat} value={stat}>{stat}</option>)}</>
                ) : <option value={currentUser?.station}>{cleanStr(currentUser?.station)}</option>}
              </select>

              <select value={filterPost} onChange={(e) => setFilterPost(e.target.value)} className="border rounded-lg px-3 py-1.5 text-xs font-bold shadow-xs bg-white text-slate-800 border-slate-300 w-full sm:w-auto outline-none focus:border-blue-500 cursor-pointer">
                <option value="ALL POSTS">ALL POSTS</option>
                {availablePostsList.map(post => <option key={post} value={post}>{post}</option>)}
              </select>
            </div>

            <div className="relative w-full sm:w-64 shrink-0">
              <input 
                type="text"
                placeholder="Search ledger by name, f/no, rank..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full text-xs border border-slate-300 rounded-lg pl-8 pr-7 py-1.5 bg-white text-slate-800 outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs font-medium"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold cursor-pointer"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          {/* ANALYTICS BREAKDOWN OR TABLE LEDGER VIEW */}
          {showAnalytics ? (
  <ExpandableTableCard title={viewMode === 'archive' ? 'Archived Roll Analytics' : 'Active Roll Analytics'}>
    {(expanded) => (
      <div className={`bg-white p-5 flex flex-col space-y-4 ${expanded ? 'h-full flex-1' : ''}`}>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-gray-200 pb-3 gap-3 shrink-0">
          <h3 className="font-extrabold text-base text-indigo-900 flex items-center">
            <PieChart className="mr-2 w-4 h-4"/> Viewing: {analyticsFilteredDataset.length} Officers Matching [{metricCategory} : {analyticsMetricFilterValue}]
          </h3>
          <div className="flex flex-wrap items-center gap-2 bg-indigo-50 p-2 rounded-lg border border-indigo-100">
              <label className="text-[10px] font-bold text-indigo-800 uppercase">Categorize By:</label>
              <select value={metricCategory} onChange={e => { setMetricCategory(e.target.value); setAnalyticsMetricFilterValue('ALL'); }} className="border border-indigo-300 rounded p-1 text-xs font-bold text-indigo-700 outline-none bg-white cursor-pointer">
                  <option value="RANK">Rank Breakdown</option>
                  <option value="UNIT">Unit / Station Breakdown</option>
                  <option value="STATUS">📋 Personnel Status (Deployable / Non-Deployable)</option>
                  <option value="SEX">Sex Distribution</option>
                  <option value="AGE">Age Demographics</option>
                  <option value="SECTION">Directorate / Section Breakdown</option>
              </select>

              <label className="text-[10px] font-bold text-indigo-800 uppercase ml-2">Filter View:</label>
              <select value={analyticsMetricFilterValue} onChange={e => setAnalyticsMetricFilterValue(e.target.value)} className="border border-indigo-300 rounded p-1 text-xs font-bold text-indigo-700 outline-none bg-white cursor-pointer max-w-[180px]">
                  <option value="ALL">ALL ({metricCategory})</option>
                  {availableAnalyticsFilterOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>

              {/* 🟢 Secure Download Trigger honoring export privileges */}
              {canEditRecords && (
                <button
                    type="button"
                    onClick={handleExecuteAnalyticsExport}
                    className="bg-indigo-700 hover:bg-indigo-800 text-white px-3 py-1.5 text-xs font-bold rounded shadow transition flex items-center cursor-pointer ml-2"
                  >
                    <Download className="w-3.5 h-3.5 mr-1" /> Download Filtered Ledger
                </button>
              )}
          </div>
        </div>

        <div className="overflow-x-auto overflow-y-auto flex-1 custom-scrollbar border border-gray-200 rounded-lg">
          <table className="min-w-full divide-y divide-gray-200 text-xs">
              <thead className="bg-indigo-50 sticky top-0 z-10 shadow-xs">
                  <tr>
                      <th className="px-3 py-2.5 text-left font-bold text-indigo-800 uppercase whitespace-nowrap">S/No</th>
                      <th className="px-3 py-2.5 text-left font-bold text-indigo-800 uppercase whitespace-nowrap">F/NO</th>
                      <th className="px-3 py-2.5 text-left font-bold text-indigo-800 uppercase whitespace-nowrap">Rank</th>
                      <th className="px-3 py-2.5 text-left font-bold text-indigo-800 uppercase whitespace-nowrap">Name</th>
                      <th className="px-3 py-2.5 text-left font-bold text-indigo-800 uppercase whitespace-nowrap">Sex</th>
                      <th className="px-3 py-2.5 text-left font-bold text-indigo-800 uppercase whitespace-nowrap">Position</th>
                      <th className="px-3 py-2.5 text-left font-bold text-indigo-800 uppercase whitespace-nowrap">Station</th>
                      <th className="px-3 py-2.5 text-left font-bold text-indigo-800 uppercase whitespace-nowrap">Region</th>
                      <th className="px-3 py-2.5 text-left font-bold text-indigo-800 uppercase whitespace-nowrap">Status</th>
                  </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                  {analyticsFilteredDataset.map((n, idx) => (
                      <tr key={n.sn || n.fnum} onClick={() => { setAnalyticsSelectedOfficer(n); setShowAnalyticsDossier(true); }} className="hover:bg-indigo-50/50 transition-colors cursor-pointer">
                          <td className="px-3 py-2 whitespace-nowrap font-bold">{idx + 1}</td>
                          <td className="px-3 py-2 whitespace-nowrap font-bold text-blue-700">{cleanStr(n.fnum || n.f_num)}</td>
                          <td className="px-3 py-2 whitespace-nowrap font-bold text-slate-800">{cleanStr(n.rank)}</td>
                          <td className="px-3 py-2 whitespace-nowrap uppercase font-medium text-slate-800">{cleanStr(n.name)}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-slate-700">{cleanStr(n.sex)}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-gray-700">{cleanStr(n.position)}</td>
                          <td className="px-3 py-2 whitespace-nowrap font-bold text-blue-700">{cleanStr(n.station)}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-slate-700">{cleanStr(n.region)}</td>
                          <td className="px-3 py-2 whitespace-nowrap font-bold text-green-700">{cleanStr(n.status) || 'ACTIVE'}</td>
                      </tr>
                  ))}
                  {analyticsFilteredDataset.length === 0 && <tr><td colSpan="9" className="text-center p-6 text-xs text-gray-500 font-medium">No personnel records match this specific filter.</td></tr>}
              </tbody>
          </table>
        </div>
      </div>
    )}
  </ExpandableTableCard>
          ) : (
            <ExpandableTableCard title={viewMode === 'archive' ? "Archived Personnel Ledger" : "Active Nominal Roll Ledger"}>
              {(expanded) => (
                <div className={`overflow-x-auto overflow-y-auto w-full bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 ${expanded ? 'h-full flex-1' : 'max-h-[500px]'} custom-scrollbar`}>
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-800">
                    <thead className="bg-gray-50 dark:bg-slate-950 sticky top-0 z-10 shadow-xs">
                      <tr>
                        {bulkSelectMode && viewMode === 'active' && canEditRecords && (
                          <th className="px-2.5 py-2.5 text-center text-xs font-bold text-gray-500 dark:text-slate-400 uppercase whitespace-nowrap bg-gray-50 dark:bg-slate-950">
                             <input 
                               type="checkbox" 
                               checked={Array.isArray(selectedOfficers) && Array.isArray(filteredRolls) && selectedOfficers.length === filteredRolls.length && filteredRolls.length > 0}
                               onChange={(e) => {
                                   if (e.target.checked) setSelectedOfficers(Array.isArray(filteredRolls) ? filteredRolls.map(n => n.f_num || n.fnum) : []);
                                   else setSelectedOfficers([]);
                               }}
                               className="w-3.5 h-3.5 cursor-pointer accent-red-600"
                             />
                          </th>
                        )}
                        <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-500 dark:text-slate-400 uppercase whitespace-nowrap bg-gray-50 dark:bg-slate-950">S/No</th>
                        <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-500 dark:text-slate-400 uppercase whitespace-nowrap bg-gray-50 dark:bg-slate-950">F/NO</th>
                        <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-500 dark:text-slate-400 uppercase whitespace-nowrap bg-gray-50 dark:bg-slate-950">Rank</th>
                        <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-500 dark:text-slate-400 uppercase whitespace-nowrap bg-gray-50 dark:bg-slate-950">Name</th>
                        <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-500 dark:text-slate-400 uppercase whitespace-nowrap bg-gray-50 dark:bg-slate-950">Sex</th>
                        <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-500 dark:text-slate-400 uppercase whitespace-nowrap bg-gray-50 dark:bg-slate-950">Position</th>
                        <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-500 dark:text-slate-400 uppercase whitespace-nowrap bg-gray-50 dark:bg-slate-950">DOB</th>
                        <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-500 dark:text-slate-400 uppercase whitespace-nowrap bg-gray-50 dark:bg-slate-950">DOE</th>
                        <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-500 dark:text-slate-400 uppercase whitespace-nowrap bg-gray-50 dark:bg-slate-950">D.O. Post</th>
                        <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-500 dark:text-slate-400 uppercase whitespace-nowrap bg-gray-50 dark:bg-slate-950">D.O. Pro</th>
                        <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-500 dark:text-slate-400 uppercase whitespace-nowrap bg-gray-50 dark:bg-slate-950">Contact</th>
                        <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-500 dark:text-slate-400 uppercase whitespace-nowrap bg-gray-50 dark:bg-slate-950">Educ Level</th>
                        <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-500 dark:text-slate-400 uppercase whitespace-nowrap bg-gray-50 dark:bg-slate-950">IPPS</th>
                        <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-500 dark:text-slate-400 uppercase whitespace-nowrap bg-gray-50 dark:bg-slate-950">TIN</th>
                        <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-500 dark:text-slate-400 uppercase whitespace-nowrap bg-gray-50 dark:bg-slate-950">NIN</th>
                        <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-500 dark:text-slate-400 uppercase whitespace-nowrap bg-gray-50 dark:bg-slate-950">Home Dist</th>
                        <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-500 dark:text-slate-400 uppercase whitespace-nowrap bg-gray-50 dark:bg-slate-950">Tribe</th>
                        <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-500 dark:text-slate-400 uppercase whitespace-nowrap bg-gray-50 dark:bg-slate-950">Acc No</th>
                        <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-500 dark:text-slate-400 uppercase whitespace-nowrap bg-gray-50 dark:bg-slate-950">Bank Branch</th>
                        <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-500 dark:text-slate-400 uppercase whitespace-nowrap bg-gray-50 dark:bg-slate-950">Station</th>
                        <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-500 dark:text-slate-400 uppercase whitespace-nowrap bg-gray-50 dark:bg-slate-950">District</th>
                        <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-500 dark:text-slate-400 uppercase whitespace-nowrap bg-gray-50 dark:bg-slate-950">Region</th>
                        <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-500 dark:text-slate-400 uppercase whitespace-nowrap bg-gray-50 dark:bg-slate-950">Section</th>
                        <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-500 dark:text-slate-400 uppercase whitespace-nowrap bg-gray-50 dark:bg-slate-950">Dir</th>
                        <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-500 dark:text-slate-400 uppercase whitespace-nowrap bg-gray-50 dark:bg-slate-950">Status</th>
                        <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-500 dark:text-slate-400 uppercase whitespace-nowrap bg-gray-50 dark:bg-slate-950">Last Updated By</th>
                        {viewMode === 'archive' && (
                          <>
                            <th className="px-3 py-2.5 text-left text-xs font-bold text-red-600 dark:text-red-400 uppercase whitespace-nowrap bg-red-50 dark:bg-red-950/50">Archive Reason</th>
                            <th className="px-3 py-2.5 text-left text-xs font-bold text-red-600 dark:text-red-400 uppercase whitespace-nowrap bg-red-50 dark:bg-red-950/50">Archive Date</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-slate-900 divide-y divide-gray-200 dark:divide-slate-800 text-slate-800 dark:text-slate-200">
                      {(Array.isArray(viewMode === 'active' ? filteredRolls : filteredNominal_Roll_archives) 
                        ? (viewMode === 'active' ? filteredRolls : filteredNominal_Roll_archives) 
                        : []
                      ).map((n, index) => (
                        <tr 
                          key={n.sn || n.id || n.f_num || n.fnum} 
                          className={`${viewMode === 'archive' ? 'bg-slate-50 dark:bg-slate-900/60 opacity-80' : bulkSelectMode && Array.isArray(selectedOfficers) && selectedOfficers.includes(n.f_num || n.fnum) ? 'bg-red-50 dark:bg-red-950/30' : 'hover:bg-blue-50 dark:hover:bg-slate-800'} transition-colors ${canEditRecords ? 'cursor-pointer' : ''}`} 
                          onClick={() => {
                              if (!canEditRecords) return;
                               
                              if (bulkSelectMode && viewMode === 'active') {
                                const target = n.f_num || n.fnum;
                                if (Array.isArray(selectedOfficers) && selectedOfficers.includes(target)) {
                                    setSelectedOfficers(prev => (Array.isArray(prev) ? prev : []).filter(id => id !== target));
                                } else {
                                    setSelectedOfficers(prev => [...(Array.isArray(prev) ? prev : []), target]);
                                }
                              } else {
                                setSelectedOfficer(n);
                              }
                          }}
                        >
                          {bulkSelectMode && viewMode === 'active' && canEditRecords && (
                              <td className="px-2.5 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                                <input 
                                  type="checkbox" 
                                  checked={Array.isArray(selectedOfficers) && selectedOfficers.includes(n.f_num || n.fnum)}
                                  onChange={(e) => {
                                    const target = n.f_num || n.fnum;
                                    if (e.target.checked) setSelectedOfficers(prev => [...(Array.isArray(prev) ? prev : []), target]);
                                    else setSelectedOfficers(prev => (Array.isArray(prev) ? prev : []).filter(id => id !== target));
                                  }}
                                  className="w-3.5 h-3.5 cursor-pointer accent-red-600"
                                />
                              </td>
                          )}
                          <td className="px-3 py-2 whitespace-nowrap text-xs font-bold text-gray-900 dark:text-slate-100">{index + 1}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs font-bold text-blue-800 dark:text-blue-400">{cleanStr(n.f_num || n.fnum)}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs font-bold text-slate-800 dark:text-slate-200">{cleanStr(n.rank)}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs font-medium uppercase text-slate-800 dark:text-slate-200">{cleanStr(n.name)}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-slate-700 dark:text-slate-300">{cleanStr(n.sex)}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-700 dark:text-slate-300">{cleanStr(n.position)}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500 dark:text-slate-400">{n.dob || ''}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500 dark:text-slate-400">{n.doe || ''}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500 dark:text-slate-400">{n.do_post || n.dopost || n.dop || ''}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500 dark:text-slate-400">{n.do_pro || n.dopro || ''}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-slate-700 dark:text-slate-300">{cleanStr(n.contact)}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-slate-700 dark:text-slate-300">{cleanStr(n.educ_level || n.educlevel)}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs font-mono text-slate-700 dark:text-slate-300">{cleanStr(n.ipps)}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-slate-700 dark:text-slate-300">{cleanStr(n.tin)}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-slate-700 dark:text-slate-300">{cleanStr(n.nin)}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-slate-700 dark:text-slate-300">{cleanStr(n.home_dist || n.homedist)}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-slate-700 dark:text-slate-300">{cleanStr(n.tribe)}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-slate-700 dark:text-slate-300">{cleanStr(n.acc_no || n.accno)}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-slate-700 dark:text-slate-300">{cleanStr(n.bank_branch || n.bankbranch)}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs font-bold text-blue-700 dark:text-blue-400">{cleanStr(n.station)}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-slate-700 dark:text-slate-300">{cleanStr(n.district)}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-slate-700 dark:text-slate-300">{cleanStr(n.region)}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-slate-700 dark:text-slate-300">{cleanStr(n.section)}</td>
                          <td className="px-3 py-2 text-xs text-slate-700 dark:text-slate-300 max-w-[130px] truncate" title={cleanStr(n.dir)}>{cleanStr(n.dir)}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs font-bold text-green-700 dark:text-green-400">{cleanStr(n.status) || 'ACTIVE'}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500 dark:text-slate-400">{n.last_updated_by || ''}</td>
                          {viewMode === 'archive' && (
                            <>
                              <td className="px-3 py-2 whitespace-nowrap text-xs font-bold text-red-700 dark:text-red-400 bg-red-50/50 dark:bg-red-950/40">{cleanStr(n.archive_reason)}</td>
                              <td className="px-3 py-2 whitespace-nowrap text-xs text-red-500 dark:text-red-400 bg-red-50/50 dark:bg-red-950/40">{n.archive_date || ''}</td>
                            </>
                          )}
                        </tr>
                      ))}
                      {(Array.isArray(viewMode === 'active' ? filteredRolls : filteredNominal_Roll_archives) 
                        ? (viewMode === 'active' ? filteredRolls : filteredNominal_Roll_archives) 
                        : []
                      ).length === 0 && (
                        <tr><td colSpan={viewMode === 'archive' ? "28" : (bulkSelectMode ? "27" : "26")} className="text-center py-6 text-xs text-gray-500 dark:text-slate-400 font-medium">No personnel records found in this view.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </ExpandableTableCard>
          )}
        </div>
      </div>

      {selectedOfficer && (
        <OfficerDossierModal 
          officer={selectedOfficer} 
          onClose={() => setSelectedOfficer(null)} 
        />
      )}
      
      {showAnalyticsDossier && analyticsSelectedOfficer && (
        <OfficerDossierModal 
          officer={analyticsSelectedOfficer} 
          onClose={() => { setShowAnalyticsDossier(false); setAnalyticsSelectedOfficer(null); }} 
        />
      )}
    </div>  
  );
};

export default Nominal_Roll;