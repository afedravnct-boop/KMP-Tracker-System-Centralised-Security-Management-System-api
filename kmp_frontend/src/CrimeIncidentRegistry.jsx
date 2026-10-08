// src/components/CrimeIncidentRegistry.jsx
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {  
  Shield, Users, PlusCircle, Edit, Search, X, AlertTriangle, CheckCircle, Lock, Camera, Filter, HardDrive, Save, Sprout, Loader2
} from 'lucide-react';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import LockupMatrixLedger from './LockupMatrixLedger';
import { stripHtmlTags } from './App';
import { authFetch, hasValidSession } from './api';

const REGIONAL_HIERARCHY = {
  "KMP NORTH": ["KMP NORTH HEADQUARTERS", "KMP NORTH", "KAWEMPE", "KAKIRI", "KASANGATI", "MATUGGA", "NANSANA", "OLD KAMPALA", "WAKISO", "WANDEGEYA"],
  "KMP EAST": ["KMP EAST HEADQUARTERS", "KMP EAST", "JINJA ROAD", "KIRA", "KIRA DIV", "KIRA ROAD", "MUKONO", "NAGGALAMA", "SEETA"],
  "KMP SOUTH": ["KMP SOUTH HEADQUARTERS", "KMP SOUTH", "NATEETE", "CPS KAMPALA", "PARLIAMENT", "ENTEBBE", "KABALAGALA", "KAJJANSI", "KASENYI", "KATWE", "KYENGERA", "NSANGI"],
  "KMP HEADQUARTERS": ["KMP HEADQUARTERS", "TRAFFIC", "LOGISTICS", "FLYING SQUAD", "CRIME INTELLIGENCE", "PRO"],
  "POLICE HEADQUARTERS": ["NAGURU"]
};

const STANDARD_OFFENCES = ["Murder", "Aggravated Robbery", "Theft", "Assault", "Burglary", "Defilement / Rape", "Traffic Accident (Fatal)", "Traffic Accident (Minor)", "Fraud / Forgery", "Drug Offenses"];

const isStationEquivalent = (statA, statB) => {
  const a = stripHtmlTags(statA || '').trim().toUpperCase();
  const b = stripHtmlTags(statB || '').trim().toUpperCase();
  if (!a || !b) return false;
  if (a === b) return true;

  const cleanA = a.replace(/(\s+HEADQUARTERS|\s+HQ)$/, '');
  const cleanB = b.replace(/(\s+HEADQUARTERS|\s+HQ)$/, '');

  return cleanA === cleanB && cleanA.length > 0;
};

const getOfficialRegionForStation = (stationName, dbRegion) => {
  const cleanStation = stripHtmlTags(stationName || '').trim().toUpperCase();
  const cleanDbRegion = stripHtmlTags(dbRegion || '').trim().toUpperCase();

  if (REGIONAL_HIERARCHY[cleanDbRegion] && REGIONAL_HIERARCHY[cleanDbRegion].some(s => isStationEquivalent(s, cleanStation))) {
    return cleanDbRegion;
  }

  for (const [regionName, stationsList] of Object.entries(REGIONAL_HIERARCHY)) {
    if (stationsList.some(s => isStationEquivalent(s, cleanStation))) {
      return regionName;
    }
  }

  return cleanDbRegion || 'KMP GENERAL';
};

const autoCapitalize = (text) => {
  if (!text) return '';
  return stripHtmlTags(text).replace(/(^\s*(?:<[^>]+>\s*)*|[\.\!\?]\s+(?:<[^>]+>\s*)*|<(?:p|br|div|li|h[1-6])[^>]*>\s*)([a-z])/gi, (match, prefix, letter) => {
    return prefix + letter.toUpperCase();
  });
};

const extractPlainText = (htmlString) => {
  if (!htmlString) return '';
  return stripHtmlTags(htmlString);
};

const MetricCard = ({ title, value, colorClass }) => {
  const isKMPMaster = title === 'KMP Master Lock-up' || title === 'KMP Master';
  return (
    <div className={`bg-white dark:bg-slate-800 p-2 rounded-lg border border-slate-200 dark:border-slate-700 shadow-[0_1px_2px_rgba(0,0,0,0.05)] flex flex-col items-center justify-center text-center hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors ${isKMPMaster ? 'bg-amber-50/80 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800 ring-1 ring-amber-300 dark:ring-amber-800 shadow-md scale-[1.02]' : ''}`}>
      <h4 className={`text-[8px] font-extrabold mb-0.5 uppercase tracking-wider leading-tight w-full break-words ${isKMPMaster ? 'text-amber-800 dark:text-amber-400' : 'text-slate-500 dark:text-slate-400'}`}>
        {stripHtmlTags(title)}
      </h4>
      <div className={`text-sm font-black leading-none flex items-center justify-center ${colorClass}`}>
        {value === "Pending" ? (
          <span className="text-[10px] text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950 px-1.5 py-0.5 rounded border border-red-200 dark:border-red-900 animate-pulse">Pending</span>
        ) : (
          stripHtmlTags(String(value))
        )}
      </div>
    </div>
  );
};

const ExpandableTableCard = ({ title, children, onToggle }) => {
  const [expanded, setExpanded] = useState(false);
  return (
    <>
      {expanded && <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[9990] animate-in fade-in" />}
      <div className={expanded ? "fixed inset-4 sm:inset-10 z-[9999] bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-300 dark:border-slate-700 flex flex-col animate-in zoom-in-95 duration-200 overflow-hidden" : "bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col"}>
        <div className="bg-slate-900 dark:bg-slate-950 px-3.5 py-2.5 sm:px-5 sm:py-3 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center shrink-0">
          <h3 className="font-extrabold text-white text-xs uppercase tracking-wider">{stripHtmlTags(title)}</h3>
          <button onClick={(e) => { e.stopPropagation(); const nextState = !expanded; setExpanded(nextState); if (onToggle) onToggle(nextState); }} className="text-[11px] text-blue-400 hover:text-white font-bold transition flex items-center bg-slate-800 hover:bg-slate-700 px-2.5 py-1 rounded-md border border-slate-700 shadow-inner cursor-pointer">
            {expanded ? 'Collapse View ↙' : 'Expand View ↗'}
          </button>
        </div>
        <div className={`w-full ${expanded ? 'flex-1 overflow-hidden [&>div]:max-h-full [&>div]:h-full' : ''}`}>
          {children}
        </div>
      </div>
    </>
  );
};

const CrimeIncidentRegistry = ({ currentUser, canViewGlobal = false, setReports, setSidebarOpen, isReadOnlyObserver }) => {
  const [serverReports, setServerReports] = useState([]);
  const [isFetchingReports, setIsFetchingReports] = useState(false);
  
  const [lockupData, setLockupData] = useState([]);
  const [showAgriculturalOnly, setShowAgriculturalOnly] = useState(false);

  const userRoleClean = stripHtmlTags(currentUser?.role || '').toUpperCase();
  const userPosClean = stripHtmlTags(currentUser?.position || '').toUpperCase();
  const userRegClean = stripHtmlTags(currentUser?.region || '').toUpperCase();

  const isGlobalTier = ['SUPER_ADMIN', 'ADMIN', 'ASSISTANT_SUPER_ADMIN'].includes(userRoleClean) ||  
    ['KMP COMMANDER', 'DEPUTY KMP COMMANDER', 'KMP ADMIN OFFICER'].includes(userPosClean) ||  
    currentUser?.permissions?.view_global_roster === true;

  const isKmpSystemManager = userRoleClean === 'SYSTEM_MANAGER' && ['KMP HEADQUARTERS', 'POLICE HEADQUARTERS'].includes(userRegClean) && userPosClean.includes('KMP');
  const isKmpSpecialist = userRoleClean === 'ASSISTANT_SYSTEM_MANAGER' && ['KMP HEADQUARTERS', 'POLICE HEADQUARTERS'].includes(userRegClean) && userPosClean.includes('KMP');

  const canViewGlobalLevel = canViewGlobal || isGlobalTier || isKmpSystemManager || isKmpSpecialist;
  const canViewGlobalActive = canViewGlobalLevel;
  
  const isRegionalCommand = ['RPC', 'DEPUTY_RPC', 'SYSTEM_MANAGER', 'ASSISTANT_SYSTEM_MANAGER', 'REGIONAL_ADMIN', 'ASSISTANT_REGIONAL_ADMIN'].includes(userRoleClean) && !canViewGlobalLevel;

  const [filterRegion, setFilterRegion] = useState(canViewGlobalActive ? 'ALL REGIONS' : userRegClean);
  const [filterStation, setFilterStation] = useState((canViewGlobalActive || isRegionalCommand) ? 'ALL STATIONS' : stripHtmlTags(currentUser?.station || '').toUpperCase());

  const isFilterInitialized = useRef(false);
  useEffect(() => {
    if (!isFilterInitialized.current && currentUser?.station) {
      if (canViewGlobalActive) {
        setFilterRegion('ALL REGIONS');
        setFilterStation('ALL STATIONS');
      } else if (isRegionalCommand) {
        setFilterRegion(userRegClean);
        setFilterStation('ALL STATIONS');
      } else {
        setFilterRegion(userRegClean);
        setFilterStation(stripHtmlTags(currentUser?.station || '').toUpperCase());
      }
      isFilterInitialized.current = true;
    }
  }, [canViewGlobalActive, isRegionalCommand, userRegClean, currentUser?.station]);

  const [operation, setOperation] = useState('new');
  const [notification, setNotification] = useState(null);
  const [selectedCase, setSelectedCase] = useState(null);
   
  const [showHqGrandModal, setShowHqGrandModal] = useState(false);
  const [hqGrandTotalInput, setHqGrandTotalInput] = useState('');
  const [showLockupMatrixModal, setShowLockupMatrixModal] = useState(false);  

  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  
  const [dateFilter, setDateFilter] = useState('ALL TIME');
  const [updateSearch, setUpdateSearch] = useState('');

  const [showLockup, setShowLockup] = useState(false);
  const [newSuspect, setNewSuspect] = useState({ name: '', sex: 'MALE', age: '', tribe: '', nationality: '', residence: '', contact: '', mental_health_status: 'NORMAL', photo_url: '' });
  const [editingSuspectId, setEditingSuspectId] = useState(null);

  const handleSelectSuspectToEdit = (suspect) => {
    setNewSuspect({
      name: suspect.name || '',
      sex: suspect.sex || 'MALE',
      age: suspect.age !== null && suspect.age !== undefined ? String(suspect.age) : '',
      tribe: suspect.tribe || '',
      nationality: suspect.nationality || '',
      residence: suspect.residence || '',
      contact: suspect.contact || '',
      mental_health_status: suspect.mental_health_status || 'NORMAL',
      photo_url: suspect.photo_url || ''
    });
    setEditingSuspectId(suspect.id);
  };

  const getTodayString = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' }).split(',')[0].replace(/\//g, '-');

  const [formData, setFormData] = useState({
    sn: null, sd_ref: '', ref_type: 'SD Ref:', ref_number: '',
    region: userRegClean, station: stripHtmlTags(currentUser?.station || REGIONAL_HIERARCHY[currentUser?.region]?.[0] || ''),
    date: getTodayString(), time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }).replace(':', '') + 'Hrs',
    offence: '', customOffence: '', category: 'GENERAL CRIMES', narrative: '', status: 'ACTIVE INVESTIGATION', suspectDetails: [], updateText: ''
  });

  useEffect(() => {
    const fetchLockupData = async () => {
      if (!hasValidSession()) return;
      try {
        const response = await authFetch('/api/v1/lockup-matrix');
        if (response.ok) {
          const data = await response.json();
          setLockupData(data);
        }
      } catch (err) {
        console.error("Failed to load lockup matrix:", err);
      }
    };
    fetchLockupData();
  }, []);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 500);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  const fetchFilteredDatabaseReports = useCallback(async () => {
    if (!hasValidSession()) return;
    setIsFetchingReports(true);
    try {
      const params = new URLSearchParams();
      if (!canViewGlobalActive && filterRegion && filterRegion !== 'ALL REGIONS') {
        params.append('region', filterRegion);
      }
      if (debouncedSearch) params.append('search', debouncedSearch);
      params.append('limit', '300');

      const response = await authFetch(`/api/v1/reports?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        setServerReports(data);
        if (setReports) setReports(data);
      }
    } catch (err) {
      console.error("Failed to execute SQL fetch:", err);
    } finally {
      setIsFetchingReports(false);
    }
  }, [filterRegion, debouncedSearch, setReports, canViewGlobalActive]);

  useEffect(() => {
    fetchFilteredDatabaseReports();
  }, [fetchFilteredDatabaseReports]);

  const resetFormToBlank = () => {
    setFormData({
      sn: null, sd_ref: '', ref_type: 'SD Ref:', ref_number: '',
      region: userRegClean, station: stripHtmlTags(currentUser?.station || REGIONAL_HIERARCHY[currentUser?.region]?.[0] || ''),
      date: getTodayString(), time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }).replace(':', '') + 'Hrs',
      offence: '', customOffence: '', category: 'GENERAL CRIMES', narrative: '', status: 'ACTIVE INVESTIGATION', suspectDetails: [], updateText: ''
    });
    setUpdateSearch('');
  };

  const handleOperationToggle = (mode) => {
    setOperation(mode);
    setNotification(null);
    if (mode === 'new') resetFormToBlank();
  };

  const populateUpdateCrimeForm = (caseData) => {
    setFormData({ 
      ...caseData, 
      sn: caseData.sn || caseData.id, 
      sd_ref: stripHtmlTags(caseData.sdRef || caseData.sd_ref), 
      offence: stripHtmlTags(caseData.offence || 'Other'),
      category: caseData.category || 'GENERAL CRIMES',
      customOffence: '',
      suspectDetails: caseData.suspectDetails || [], 
      updateText: '' 
    });
  };

  const finalFilteredReports = useMemo(() => {
    if (!Array.isArray(serverReports)) return [];
      
    const filtered = serverReports.filter(r => {
      if (r.is_hq_general_total || (r.offence || '').toUpperCase().includes("LOCK-UP TOTAL")) return false;

      const stn = stripHtmlTags(r.station || '').trim().toUpperCase();
      const reg = getOfficialRegionForStation(stn, r.region);

      if (canViewGlobalActive && filterRegion === 'ALL REGIONS' && filterStation === 'ALL STATIONS') {
        // Global viewing allowed
      } else {
        const belongsToRegion = filterRegion === 'ALL REGIONS' ||  
                                reg === filterRegion ||  
                                (REGIONAL_HIERARCHY[filterRegion] && REGIONAL_HIERARCHY[filterRegion].some(s => isStationEquivalent(s, stn)));

        if (!belongsToRegion) return false;

        if (filterStation !== 'ALL STATIONS') {
          if (!isStationEquivalent(stn, filterStation)) return false;
        }
      }

      if (showAgriculturalOnly) {
        const isCatAgri = (r.category || '').toUpperCase() === 'AGRIC_CRIME';
        if (!isCatAgri) return false;
      }
        
      const diffDays = Math.ceil(Math.abs(new Date() - new Date(r.date)) / (1000 * 60 * 60 * 24));
      if (dateFilter === 'TODAY') {
        const todayStr = getTodayString();
        if (r.date !== todayStr) return false;
      } 
      else if (dateFilter === 'LAST 7 DAYS') { if (diffDays > 7) return false; } 
      else if (dateFilter === 'LAST 14 DAYS') { if (diffDays > 14) return false; } 
      else if (dateFilter === 'LAST 21 DAYS') { if (diffDays > 21) return false; } 
      else if (dateFilter === 'LAST 30 DAYS') { if (diffDays > 30) return false; } 
      else if (dateFilter === 'LAST 60 DAYS') { if (diffDays > 60) return false; } 
      else if (dateFilter === 'LAST 90 DAYS') { if (diffDays > 90) return false; } 
      else if (dateFilter === 'LAST 120 DAYS') { if (diffDays > 120) return false; } 
      else if (dateFilter === 'LAST 180 DAYS') { if (diffDays > 180) return false; }
        
      return true;
    });

    return filtered.sort((a, b) => (b.sn || b.id || 0) - (a.sn || a.id || 0));

  }, [serverReports, dateFilter, showAgriculturalOnly, filterRegion, filterStation, canViewGlobalActive]);

  const isStationSpecific = filterStation && filterStation !== 'ALL STATIONS';

  const availableUpdateCases = useMemo(() => {
    return finalFilteredReports.filter(r => {
      const stn = stripHtmlTags(r.station || '').trim().toUpperCase();
      const reg = getOfficialRegionForStation(stn, r.region);

      if (!canViewGlobalActive) {
        const belongsToRegion = reg === userRegClean ||  
                                (REGIONAL_HIERARCHY[userRegClean] && REGIONAL_HIERARCHY[userRegClean].some(s => isStationEquivalent(s, stn)));
        if (!belongsToRegion) return false;
      }

      if (updateSearch) {
        const query = stripHtmlTags(updateSearch).toLowerCase();
        return stripHtmlTags(r.sdRef || r.sd_ref || '').toLowerCase().includes(query) || (r.id || r.sn || '').toString().includes(query) || extractPlainText(r.narrative).toLowerCase().includes(query);
      }
      return true;
    });
  }, [finalFilteredReports, updateSearch, canViewGlobalActive, userRegClean]);

  const metrics = useMemo(() => {
    const stationCellPop = {};
    const todayStr = getTodayString(); 
    
    let hqGrandTotalToday = 0; 
    let hasLockupUpdateToday = false;

    lockupData.forEach(l => {
      const lStation = stripHtmlTags(l.station || '').trim().toUpperCase();
      const lRegion = getOfficialRegionForStation(lStation, l.region);
      
      const isHQTotal = lStation === 'HEADQUARTERS GENERAL TOTAL' ||  
                        lStation.includes('GENERAL TOTAL') ||  
                        lRegion === 'KMP HEADQUARTERS';

      if (l.date === todayStr) {
        if (isHQTotal) {
          hqGrandTotalToday = Number(l.suspects) || 0;
        } else {
          stationCellPop[lStation] = Number(l.suspects) || 0;
          if (isStationEquivalent(lStation, filterStation)) {
            hasLockupUpdateToday = true;
          }
        }
      }
    });

    const calculatedGlobalSum = Object.values(stationCellPop).reduce((sum, pop) => sum + pop, 0);
    const kmpGeneralTotal = hqGrandTotalToday !== 0 ? hqGrandTotalToday : calculatedGlobalSum;

    let localJurisdictionTotal = 0;
    if (filterStation && filterStation !== 'ALL STATIONS') {
      localJurisdictionTotal = Object.keys(stationCellPop)
        .filter(stn => isStationEquivalent(stn, filterStation))
        .reduce((sum, stn) => sum + stationCellPop[stn], 0);
    } else if (filterRegion && filterRegion !== 'ALL REGIONS') {
      const regionStations = REGIONAL_HIERARCHY[filterRegion] || [];
      localJurisdictionTotal = regionStations.reduce((sum, stat) => sum + (stationCellPop[stat] || 0), 0);
    } else {
      localJurisdictionTotal = calculatedGlobalSum;
    }

    const totalCaseSuspects = finalFilteredReports.reduce((sum, r) => sum + (r.suspectDetails || r.suspect_details || []).length, 0);

    return {
      localLockup: (hasLockupUpdateToday || localJurisdictionTotal > 0) ? localJurisdictionTotal : "Pending",
      kmpGeneralLockup: kmpGeneralTotal !== 0 ? kmpGeneralTotal : (calculatedGlobalSum > 0 ? calculatedGlobalSum : "Pending"),
      newCases: finalFilteredReports.length,
      active: finalFilteredReports.filter(r => stripHtmlTags(r.status) === 'ACTIVE INVESTIGATION').length,
      sanctioned: finalFilteredReports.filter(r => stripHtmlTags(r.status) === 'FORWARDED TO COURT').length,
      closed: finalFilteredReports.filter(r => stripHtmlTags(r.status) === 'CLOSED / CONVICTED').length,
      adr: finalFilteredReports.filter(r => stripHtmlTags(r.status) === 'ADR').length,
      totalSuspects: totalCaseSuspects
    };
  }, [finalFilteredReports, lockupData, filterRegion, filterStation]);

  const handleInputChange = (e) => {
    const { name, value, type } = e.target;
    const cleanValue = stripHtmlTags(value);
    if (name === 'region') {
      setFormData(prev => ({ ...prev, region: cleanValue, station: REGIONAL_HIERARCHY[cleanValue]?.[0] || '' }));
    } else if (['customOffence'].includes(name)) {
      setFormData(prev => ({ ...prev, [name]: cleanValue.toUpperCase() }));
    } else {
      setFormData(prev => ({ ...prev, [name]: type === 'number' ? parseInt(cleanValue) || 0 : cleanValue }));
    }
  };

  const handleAddSuspect = () => {
    if (!newSuspect.name.trim()) return alert("Suspect name is required.");
    const sanitizedSuspect = {
      ...newSuspect,
      name: stripHtmlTags(newSuspect.name),
      tribe: stripHtmlTags(newSuspect.tribe),
      nationality: stripHtmlTags(newSuspect.nationality),
      residence: stripHtmlTags(newSuspect.residence),
      contact: stripHtmlTags(newSuspect.contact),
      id: editingSuspectId || Date.now()
    };

    if (editingSuspectId !== null) {
      setFormData({
        ...formData,
        suspectDetails: formData.suspectDetails.map(s => s.id === editingSuspectId ? sanitizedSuspect : s)
      });
      setEditingSuspectId(null);
    } else {
      setFormData({
        ...formData,
        suspectDetails: [...formData.suspectDetails, sanitizedSuspect]
      });
    }

    setNewSuspect({ name: '', sex: 'MALE', age: '', tribe: '', nationality: '', residence: '', contact: '', mental_health_status: 'NORMAL', photo_url: '' }); 
  };

  const handleRemoveSuspect = (id) => {
    setFormData({ ...formData, suspectDetails: formData.suspectDetails.filter(s => s.id !== id) });
    if (editingSuspectId === id) setEditingSuspectId(null);
  };

  const handleSuspectPhotoUpload = async (e) => {
    const file = e.target.files[0];
    if (file) {
      setNotification("⏳ Uploading suspect mugshot...");
      const uploadData = new FormData();
      uploadData.append("file", file);
      uploadData.append("category", "suspect_mugshot");
      uploadData.append("case_id", stripHtmlTags(formData.sd_ref || "NEW_CASE"));

      try {
        const token = localStorage.getItem('kmp_authToken') || sessionStorage.getItem('kmp_authToken');
        const API_URL = import.meta.env?.VITE_API_URL || "https://kmp-tracker-system-centralised-security.onrender.com";
        
        const response = await fetch(`${API_URL}/api/v1/investigation/upload`, { 
            method: "POST", 
            headers: { "Authorization": `Bearer ${token}` }, 
            body: uploadData 
        });
        
        if (!response.ok) throw new Error("Upload failed");
        
        const data = await response.json();
        
        if (data.full_s3_url || data.cloud_storage_path || data.url) {
          setNewSuspect({ 
              ...newSuspect, 
              photo_url: stripHtmlTags(data.url || data.full_s3_url || `https://kmp-tracker-system-tu-16-06-26.s3.eu-central-1.amazonaws.com/${data.cloud_storage_path}`) 
          });
          setNotification("✅ Mugshot uploaded securely!");
        } else {
            throw new Error("Invalid response");
        }
      } catch (error) {
        console.error("Upload error:", error);
        setNewSuspect({ ...newSuspect, photo_url: URL.createObjectURL(file) });
        setNotification("⚠️ API unreachable. Using temporary local preview.");
      }
    }
  };

  const handleHqGrandTotalSubmit = async (e) => {
    e.preventDefault();
    if (!hqGrandTotalInput && hqGrandTotalInput !== 0) return alert("Please enter a valid Grand Total.");
        
    setNotification("⏳ Submitting HQ General Grand Total to Independent Matrix...");
    const hqRef = `HQ-GRAND-${Date.now().toString().slice(-6)}`;

    const apiPayload = {
      sd_ref: hqRef, 
      region: "KMP HEADQUARTERS", 
      station: "HEADQUARTERS GENERAL TOTAL",
      date: getTodayString(),
      time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }).replace(':', '') + 'Hrs',
      suspects: parseInt(hqGrandTotalInput) || 0,
      male_count: 0,
      male_juvenile_count: 0,
      female_count: 0,
      female_juvenile_count: 0,
      detention_1day: 0,
      detention_2days: 0,
      detention_3days_over: 0,
      last_updated_by: `${stripHtmlTags(currentUser.name)} (${stripHtmlTags(currentUser.fnum)})`
    };

    try {
      const response = await authFetch(`/api/v1/lockup-matrix`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(apiPayload)
      });
      const resData = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(stripHtmlTags(resData.detail) || "Database rejected HQ total.");

      const newLockup = resData;
      setLockupData([newLockup, ...lockupData]);
      setNotification(`✅ HQ General Total (${hqGrandTotalInput}) successfully posted!`);
      setShowHqGrandModal(false);
      setHqGrandTotalInput('');
      setTimeout(() => setNotification(null), 5000);
    } catch (err) {
      setNotification(`❌ Action Failed: ${stripHtmlTags(err.message)}`);
    }
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
        
    let formattedTime = stripHtmlTags(formData.time || '');
    if (formattedTime && !/hrs$/i.test(formattedTime.trim())) formattedTime = `${formattedTime.trim()}Hrs`;

    const plainNarrative = formData.narrative;
    const plainTextForDuplicate = extractPlainText(formData.narrative);

    if (operation === 'new') {
      const cleanRefType = stripHtmlTags(formData.ref_type);
      const cleanRefNumber = stripHtmlTags(formData.ref_number).toUpperCase();
      const final_reference = `${cleanRefType} ${cleanRefNumber}`.trim();
        
      const referenceRegex = /^(SD Ref:|CRB:|DEF:|GEF:|TAR:|CID:)\s*\d+(\/\d+)+$/i;
      
      if (!referenceRegex.test(final_reference)) {
        setNotification("⚠️ Invalid Reference Format. Do NOT type station names. The number field must only contain digits and slashes (e.g., 04/2026 or 12/05/11/2026).");
        return; 
      }

      const isDuplicate = serverReports.some(r => stripHtmlTags(r.station) === stripHtmlTags(formData.station) && ((stripHtmlTags(r.sdRef || r.sd_ref || '')).trim().toLowerCase() === final_reference.toLowerCase() || extractPlainText(r.narrative || '').trim().toLowerCase() === plainTextForDuplicate.toLowerCase()));
      if (isDuplicate) return setNotification(`Error: This specific ${cleanRefType} entry or identical narrative already exists.`);

      const activeSubmissionRegion = canViewGlobalActive
        ? getOfficialRegionForStation(formData.station, filterRegion !== 'ALL REGIONS' ? filterRegion : formData.region)
        : getOfficialRegionForStation(formData.station, formData.region);

      const apiPayload = {
        sd_ref: final_reference, 
        region: activeSubmissionRegion, 
        station: stripHtmlTags(formData.station),
        date: stripHtmlTags(formData.date), 
        time: formattedTime, 
        offence: formData.offence === 'Other' ? stripHtmlTags(formData.customOffence).toUpperCase() : stripHtmlTags(formData.offence), 
        category: formData.category || 'GENERAL CRIMES',
        narrative: plainNarrative, 
        status: stripHtmlTags(formData.status), 
        suspects: formData.suspectDetails.length, 
        last_updated_by: `${stripHtmlTags(currentUser.name)} (${stripHtmlTags(currentUser.fnum)})`, 
        suspectDetails: formData.suspectDetails,
        daily_lock_up: 0 
      };
        
      try {
        const response = await authFetch(`/api/v1/reports`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(apiPayload) });
        const resData = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(stripHtmlTags(resData.detail) || "Database rejected the entry.");
          
        fetchFilteredDatabaseReports();
        setNotification(`✅ Case SN ${resData.sn} (Ref: ${apiPayload.sd_ref}) successfully registered!`);
        resetFormToBlank();
        setTimeout(() => setNotification(null), 5000);
      } catch (err) { 
        setNotification(`❌ Action Failed: ${stripHtmlTags(err.message || "Could not register the case.")}`); 
      }

    } else if (operation === 'update') {
      if (!formData.sn) return setNotification("Error: Please select a case first.");
        
      const plainUpdateText = extractPlainText(formData.updateText || '').trim();
      let updatedNarrative = formData.narrative;
      if (plainUpdateText) {
          updatedNarrative = `${formData.narrative}<p><br></p><p><strong style="color: #2563eb;">[UPDATE ${new Date().toLocaleString()}]:</strong></p>${formData.updateText}`;
      }
        
      const finalOffenceValue = formData.offence === 'Other' ? stripHtmlTags(formData.customOffence).toUpperCase() : stripHtmlTags(formData.offence);

      const updatedRecord = { 
        ...formData, 
        region: getOfficialRegionForStation(formData.station, formData.region),
        time: formattedTime, 
        narrative: updatedNarrative, 
        offence: finalOffenceValue, 
        category: formData.category || 'GENERAL CRIMES',
        status: formData.status,
        suspects: formData.suspectDetails.length,
        last_updated_by: `${stripHtmlTags(currentUser.name)} (${stripHtmlTags(currentUser.fnum)})`, 
        daily_lock_up: 0
      };
      
      delete updatedRecord.updateText; 
      delete updatedRecord.ref_type; 
      delete updatedRecord.ref_number;
      delete updatedRecord.customOffence; 
        
      try {
        const response = await authFetch(`/api/v1/reports/${formData.sn}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updatedRecord) });
        const resData = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(stripHtmlTags(resData.detail) || "Failed to update record in database.");

        fetchFilteredDatabaseReports();
        setNotification(`✅ Case SN ${formData.sn} successfully updated!`);
        handleOperationToggle('new');
        setTimeout(() => setNotification(null), 5000);
      } catch (err) { 
        setNotification(`❌ Action Failed: ${stripHtmlTags(err.message || "Could not update the record.")}`); 
      }
    }
  };
   
  return (
    <div className="p-4 max-w-[1600px] mx-auto space-y-4 relative z-10 font-sans">
        
      {showHqGrandModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[150] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl max-w-md w-full overflow-hidden border border-amber-300 dark:border-amber-800 animate-in zoom-in-95">
            <div className="bg-amber-600 dark:bg-amber-700 text-white px-4 py-3 flex justify-between items-center">
              <h3 className="font-extrabold uppercase text-xs tracking-wider flex items-center"><Shield className="mr-1.5" size={16} /> Command Fallback: General Grand Total</h3>
              <button onClick={() => setShowHqGrandModal(false)} className="hover:bg-amber-700 dark:hover:bg-amber-800 p-1 rounded transition"><X size={16}/></button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed font-medium">Use this to log the combined national/regional general grand total if stations fail to submit their cell populations before the deadline.</p>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">Enter Master Grand Total Suspects *</label>
                <input type="number" min="0" value={hqGrandTotalInput} onChange={(e) => setHqGrandTotalInput(stripHtmlTags(e.target.value))} placeholder="e.g. 450" className="w-full text-base font-black text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg p-2.5 outline-none focus:border-amber-600" />
              </div>
              <div className="flex justify-end space-x-2 pt-1">
                <button type="button" onClick={() => setShowHqGrandModal(false)} className="px-3 py-1.5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 rounded-lg font-bold text-[11px]">Cancel</button>
                <button type="button" onClick={handleHqGrandTotalSubmit} className="px-4 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold text-[11px] uppercase shadow">Post Grand Total</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showLockup && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[100] flex justify-center items-center p-4 animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh] border border-red-200 dark:border-red-900">
            <div className="bg-red-700 dark:bg-red-800 text-white px-5 py-3 flex justify-between items-center shrink-0">
              <h3 className="font-extrabold flex items-center text-xs tracking-wider"><Users className="mr-2" size={16}/> SUSPECT LOCKUP REGISTER</h3>
              <button onClick={() => setShowLockup(false)} className="hover:bg-red-600 dark:hover:bg-red-700 p-1 rounded transition"><X size={16}/></button>
            </div>
            <div className="p-5 overflow-y-auto bg-slate-50 dark:bg-slate-800 space-y-4 flex-1 custom-scrollbar">
              <div className="bg-white dark:bg-slate-900 p-3.5 rounded-lg shadow-sm border border-gray-200 dark:border-slate-700">
                <div className="flex justify-between items-center mb-2">
                  <h4 className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                    {editingSuspectId !== null ? '✏️ Editing Selected Suspect' : 'Add Suspect Details'}
                  </h4>
                  {editingSuspectId !== null && (
                    <button type="button" onClick={() => { setEditingSuspectId(null); setNewSuspect({ name: '', sex: 'MALE', age: '', tribe: '', nationality: '', residence: '', contact: '', mental_health_status: 'NORMAL', photo_url: '' }); }} className="text-[10px] text-blue-600 font-bold hover:underline">Cancel Edit</button>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-2.5">
                  <div className="md:col-span-2">
                    <label className="block text-[10px] font-bold text-gray-700 dark:text-slate-300 mb-0.5">Full Name *</label>
                    <input type="text" value={newSuspect.name} onChange={e => setNewSuspect({...newSuspect, name: stripHtmlTags(e.target.value)})} className="w-full text-xs border-gray-300 dark:border-slate-700 rounded border p-1.5 uppercase bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100" placeholder="e.g. OPIO JOHN"/>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-700 dark:text-slate-300 mb-0.5">Sex</label>
                    <select value={newSuspect.sex} onChange={e => setNewSuspect({...newSuspect, sex: stripHtmlTags(e.target.value)})} className="w-full text-xs border-gray-300 dark:border-slate-700 rounded border p-1.5 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">
                      <option>MALE</option><option>FEMALE</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-700 dark:text-slate-300 mb-0.5">Age</label>
                    <input type="number" value={newSuspect.age} onChange={e => setNewSuspect({...newSuspect, age: stripHtmlTags(e.target.value)})} className="w-full text-xs border-gray-300 dark:border-slate-700 rounded border p-1.5 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100" placeholder="e.g. 24"/>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-700 dark:text-slate-300 mb-0.5">Tribe</label>
                    <input type="text" value={newSuspect.tribe} onChange={e => setNewSuspect({...newSuspect, tribe: stripHtmlTags(e.target.value)})} className="w-full text-xs border-gray-300 dark:border-slate-700 rounded border p-1.5 uppercase bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100" placeholder="e.g. ACHOLI"/>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-700 dark:text-slate-300 mb-0.5">Nationality</label>
                    <input type="text" value={newSuspect.nationality} onChange={e => setNewSuspect({...newSuspect, nationality: stripHtmlTags(e.target.value)})} className="w-full text-xs border-gray-300 dark:border-slate-700 rounded border p-1.5 uppercase bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100" placeholder="e.g. UGANDAN"/>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-700 dark:text-slate-300 mb-0.5">Contact/Phone</label>
                    <input type="text" value={newSuspect.contact} onChange={e => setNewSuspect({...newSuspect, contact: stripHtmlTags(e.target.value)})} className="w-full text-xs border-gray-300 dark:border-slate-700 rounded border p-1.5 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"/>
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-[10px] font-bold text-gray-700 dark:text-slate-300 mb-0.5">Residence/Location</label>
                    <input type="text" value={newSuspect.residence} onChange={e => setNewSuspect({...newSuspect, residence: stripHtmlTags(e.target.value)})} className="w-full text-xs border-gray-300 dark:border-slate-700 rounded border p-1.5 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100" placeholder="e.g. Bwaise Zone 2"/>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-700 dark:text-slate-300 mb-0.5">Mental Health Status</label>
                    <select value={newSuspect.mental_health_status} onChange={e => setNewSuspect({...newSuspect, mental_health_status: stripHtmlTags(e.target.value)})} className="w-full text-xs border-gray-300 dark:border-slate-700 rounded border p-1.5 bg-white dark:bg-slate-800 font-bold text-slate-800 dark:text-slate-100">
                      <option value="NORMAL">NORMAL</option><option value="SUSPECTED PSYCHOLOGICAL CONDITION">SUSPECTED PSYCHOLOGICAL CONDITION</option><option value="UNSTABLE">UNSTABLE</option><option value="UNDER OBSERVATION">UNDER OBSERVATION</option>
                    </select>
                  </div>
                </div>
                <div className="md:col-span-3 bg-red-50 dark:bg-red-950/40 p-2.5 rounded-lg border border-red-100 dark:border-red-900 mt-2">
                  <label className="block text-[10px] font-bold text-red-800 dark:text-red-400 mb-1.5 flex items-center"><Camera size={12} className="mr-1"/> Suspect Mugshot (Optional)</label>
                  <div className="flex items-center space-x-3">
                    {newSuspect.photo_url ? ( <img src={newSuspect.photo_url} alt="Mugshot" className="w-10 h-10 rounded object-cover border-2 border-red-300 dark:border-red-800 shadow-sm" /> ) : ( <div className="w-10 h-10 rounded bg-red-100 dark:bg-red-950 flex items-center justify-center text-red-300 border border-dashed border-red-200 dark:border-red-900 text-center p-1 text-[9px]">No Photo</div> )}
                    <input type="file" accept="image/*" onChange={handleSuspectPhotoUpload} className="text-[11px] file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:text-[11px] file:font-bold file:bg-red-600 file:text-white hover:file:bg-red-700 w-full cursor-pointer text-slate-700 dark:text-slate-300" />
                  </div>
                </div>
                <div className="flex justify-end mt-3">
                  <button type="button" onClick={handleAddSuspect} className={`font-bold py-1.5 px-3 rounded text-xs transition-colors flex items-center ${editingSuspectId !== null ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-red-600 hover:bg-red-700 text-white'}`}>
                    <PlusCircle size={14} className="mr-1"/> {editingSuspectId !== null ? 'Update Suspect Details' : 'Add to Register'}
                  </button>
                </div>
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-2 border-b dark:border-slate-700 pb-1.5 flex justify-between items-center">
                  <span>Currently Logged Suspects ({formData.suspectDetails.length})</span>
                  <span className="text-[10px] text-blue-600 dark:text-blue-400 font-medium">💡 Click any entry to edit</span>
                </h4>
                {formData.suspectDetails.length === 0 ? (
                  <div className="text-center p-4 bg-white dark:bg-slate-900 border border-dashed border-gray-300 dark:border-slate-700 rounded-lg text-gray-400 dark:text-slate-500 text-xs font-medium">No suspects added to this report yet.</div>
                ) : (
                  <div className="space-y-2">
                    {formData.suspectDetails.map((suspect, index) => (
                      <div 
                        key={suspect.id} 
                        onClick={() => handleSelectSuspectToEdit(suspect)}
                        className={`bg-white dark:bg-slate-900 border rounded-lg p-2.5 flex justify-between items-center shadow-sm cursor-pointer transition-all ${
                          editingSuspectId === suspect.id ? 'border-blue-600 ring-2 ring-blue-500/20 bg-blue-50/50 dark:bg-slate-800' : 'border-red-100 dark:border-red-950 hover:border-blue-400'
                        }`}
                      >
                        <div>
                          <div className="font-bold text-slate-800 dark:text-slate-100 text-xs uppercase flex items-center">
                            {index + 1}. {stripHtmlTags(suspect.name)}
                            {editingSuspectId === suspect.id && <span className="ml-2 text-[9px] bg-blue-600 text-white px-1.5 py-0.5 rounded font-black">Editing</span>}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                            {stripHtmlTags(suspect.sex)} • {suspect.age ? `${stripHtmlTags(String(suspect.age))}yrs` : 'Age Unknown'} • Tribe: {stripHtmlTags(suspect.tribe || 'N/A')} • Nat: {stripHtmlTags(suspect.nationality || 'N/A')} | Res: {stripHtmlTags(suspect.residence || 'N/A')} | Tel: {stripHtmlTags(suspect.contact || 'N/A')}
                          </div>
                        </div>
                        <button 
                          type="button" 
                          onClick={(e) => { e.stopPropagation(); handleRemoveSuspect(suspect.id); }} 
                          className="text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50 p-1.5 rounded transition"
                        >
                          <X size={16}/>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900 p-3 border-t border-gray-200 dark:border-slate-800 flex justify-end shrink-0">
              <button type="button" onClick={() => setShowLockup(false)} className="bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white font-bold py-1.5 px-4 rounded text-xs transition">Confirm & Return to Report</button>
            </div>
          </div>
        </div>
      )}

      <div className="text-center mb-3 flex flex-col items-center">
        <img src="/upf_badge.png" alt="UPF Logo" className="w-10 h-10 mb-1 object-contain contrast-200 brightness-75 drop-shadow-sm" onError={(e) => { e.target.style.display = 'none'; }} />
        <h1 className="text-xl text-red-500 mt-0.5 font-bold">Crime/Incident Registry</h1>
        <h2 className="text-[11px] text-red-300 mt-0.5 font-medium uppercase tracking-wider">Centralised Crime/Incident Compilation</h2>
     </div>

      <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm relative">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-3 gap-2">
          <h4 className="text-[11px] font-extrabold text-slate-400 dark:text-slate-400 uppercase tracking-wider">
            📋 {filterRegion === 'ALL REGIONS' && filterStation === 'ALL STATIONS' ? 'Global Command Metrics' : filterStation === 'ALL STATIONS' ? `${filterRegion} Lock-up` : `${filterStation} Metrics`}
          </h4>
          <select 
              value={dateFilter} 
              onChange={(e) => setDateFilter(e.target.value)} 
              className="border border-blue-500 dark:border-blue-600 text-blue-700 dark:text-blue-400 font-bold rounded-lg px-2.5 py-1 text-xs shadow-sm bg-white dark:bg-slate-800 outline-none w-full sm:w-auto cursor-pointer"
            >
              <option value="ALL TIME">ALL TIME</option>
              <option value="TODAY">TODAY ONLY</option>
              <option value="LAST 7 DAYS">LAST 7 DAYS</option>
              <option value="LAST 14 DAYS">LAST 14 DAYS</option>
              <option value="LAST 21 DAYS">LAST 21 DAYS</option>
              <option value="LAST 30 DAYS">LAST 30 DAYS</option>
              <option value="LAST 60 DAYS">LAST 60 DAYS</option>
              <option value="LAST 90 DAYS">LAST 90 DAYS</option>
              <option value="LAST 120 DAYS">LAST 120 DAYS</option>
              <option value="LAST 180 DAYS">LAST 180 DAYS</option>
            </select>
        </div>
          
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
          <MetricCard title={filterRegion === 'ALL REGIONS' && filterStation === 'ALL STATIONS' ? "Computed Sum (All)" : filterStation === 'ALL STATIONS' ? `${filterRegion} Lock-up` : `${filterStation} Lock-up`} value={metrics.localLockup} colorClass="text-slate-800 dark:text-slate-100" />
          <MetricCard title="KMP Master Lock-up" value={metrics.kmpGeneralLockup} colorClass="text-amber-600 dark:text-amber-400" />
          <MetricCard title="Total Cases" value={metrics.newCases} colorClass="text-blue-700 dark:text-blue-400" />
          <MetricCard title="Suspects (Arrested in Case)" value={metrics.totalSuspects} colorClass="text-red-600 dark:text-red-400" />
          <MetricCard title="Active" value={metrics.active} colorClass="text-yellow-600 dark:text-yellow-400" />
          <MetricCard title="Sanctioned" value={metrics.sanctioned} colorClass="text-purple-600 dark:text-purple-400" />
          <MetricCard title="Closed" value={metrics.closed} colorClass="text-green-600 dark:text-green-400" />
          <MetricCard title="ADR Cases" value={metrics.adr} colorClass="text-orange-600 dark:text-orange-400" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden">
            <div className="bg-slate-900 dark:bg-slate-950 px-3.5 py-2.5 border-b border-gray-200 dark:border-slate-800 flex justify-between items-center">
              <h3 className="text-white font-semibold text-xs flex items-center"><Shield className="w-4 h-4 mr-1.5 text-blue-400" /> ⚙️ File Controls</h3>
            </div>
              
            <div className="p-4 space-y-4">
              <div className="flex space-x-1.5 bg-gray-100 dark:bg-slate-900 p-0.5 rounded-lg">
                <button type="button" onClick={() => handleOperationToggle('new')} className={`flex-1 py-1.5 text-xs font-medium rounded transition-all ${operation === 'new' ? 'bg-white dark:bg-slate-800 shadow text-blue-700 dark:text-blue-400 font-bold' : 'text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200'}`}><PlusCircle className="w-3.5 h-3.5 inline mr-1" /> Register New</button>
                <button type="button" onClick={() => handleOperationToggle('update')} className={`flex-1 py-1.5 text-xs font-medium rounded transition-all ${operation === 'update' ? 'bg-white dark:bg-slate-800 shadow text-blue-700 dark:text-blue-400 font-bold' : 'text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200'}`}><Edit className="w-3.5 h-3.5 inline mr-1" /> Update Existing</button>
              </div>

              {notification && (
                <div className={`border px-3 py-2 rounded-lg flex items-center mb-3 text-xs ${notification.includes('Error') || notification.includes('❌') ? 'bg-red-50 border-red-200 text-red-800' : 'bg-green-50 border-green-200 text-green-800'}`}>
                  {notification.includes('Error') || notification.includes('❌') ? <AlertTriangle className="w-4 h-4 mr-2 text-red-500 shrink-0" /> : <CheckCircle className="w-4 h-4 mr-2 text-green-500 shrink-0" />}
                  <span className="font-medium">{stripHtmlTags(notification)}</span>
                </div>
              )}

              {operation === 'update' && (
                <div className="bg-blue-50 dark:bg-slate-900 border border-blue-200 dark:border-slate-700 rounded-lg p-2.5">
                  <label className="block text-[11px] font-bold text-blue-800 dark:text-blue-400 mb-1.5">🔍 Search & Select Case to Update</label>
                  <input type="text" placeholder="Search by Reference, SN, or Narrative..." value={updateSearch} onChange={e => setUpdateSearch(stripHtmlTags(e.target.value))} className="w-full text-xs p-1.5 mb-2 border border-blue-200 dark:border-slate-700 rounded outline-none focus:ring-1 focus:ring-blue-400 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100" />
                  <div className="max-h-36 overflow-y-auto bg-white dark:bg-slate-800 border border-blue-100 dark:border-slate-700 rounded custom-scrollbar">
                    {availableUpdateCases.length === 0 ? (
                      <div className="p-2.5 text-[11px] text-gray-500 dark:text-slate-400 text-center">No cases found matching your search.</div>
                    ) : (
                      availableUpdateCases.map(c => (
                        <div key={c.id || c.sn} onClick={() => { populateUpdateCrimeForm(c); setUpdateSearch(stripHtmlTags(c.sdRef || c.sd_ref || '')); }} className={`p-1.5 text-[11px] border-b dark:border-slate-700 cursor-pointer transition-colors ${formData.sn === (c.id || c.sn) ? 'bg-blue-600 text-white font-bold' : 'hover:bg-blue-50 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-200'}`}>
                          <span className={formData.sn === (c.id || c.sn) ? 'text-blue-200' : 'text-gray-400 dark:text-slate-400'}>DB-ID: {c.id || c.sn}</span> | <span className={formData.sn === (c.id || c.sn) ? 'text-white' : 'font-bold text-blue-700 dark:text-blue-400'}>{stripHtmlTags(c.sdRef || c.sd_ref)}</span> | {stripHtmlTags(c.station)}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              <form onSubmit={handleFormSubmit} className="space-y-3 text-xs">
                {operation === 'update' && formData.sn && <div className="bg-slate-800 text-white text-[11px] font-bold px-2.5 py-1.5 rounded">Currently Editing DB-ID: {formData.sn}</div>}
                 
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 dark:text-slate-300 mb-1">Operation Category / Focus *</label>
                  <select name="category" value={formData.category} onChange={handleInputChange} className="w-full text-xs border-gray-300 dark:border-slate-700 rounded-md shadow-sm bg-white dark:bg-slate-800 dark:text-slate-100 border p-2 cursor-pointer font-bold text-amber-600 dark:text-amber-400">
                    <option value="GENERAL CRIMES">GENERAL CRIMES</option>
                    <option value="AGRIC_CRIME">🌾 AGRICULTURAL CRIMES / LIVESTOCK & FARM SECURITY</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="block text-[11px] font-bold text-gray-700 dark:text-slate-300 mb-0.5">File Reference Prefix & Number *</label>
                    {operation === 'update' ? (
                      <input type="text" name="sd_ref" value={stripHtmlTags(formData.sd_ref)} disabled required className="w-full text-xs border-gray-300 dark:border-slate-700 rounded shadow-sm border p-1.5 font-bold text-blue-700 dark:text-blue-400 bg-gray-100 dark:bg-slate-900 disabled:text-gray-500" />
                    ) : (
                      <div className="flex shadow-sm rounded w-full">
                        <select name="ref_type" value={formData.ref_type || 'SD Ref:'} onChange={handleInputChange} className="bg-gray-100 dark:bg-slate-900 border border-gray-300 dark:border-slate-700 text-gray-800 dark:text-slate-200 text-xs rounded-l px-2.5 py-1.5 font-bold focus:ring-blue-500 outline-none cursor-pointer">
                          <option value="SD Ref:">SD Ref:</option><option value="CRB:">CRB:</option><option value="DEF:">DEF:</option>
                          <option value="GEF:">GEF:</option><option value="TAR:">TAR:</option><option value="CID:">CID:</option>
                        </select>
                        <input type="text" name="ref_number" value={stripHtmlTags(formData.ref_number || '')} onChange={handleInputChange} required className="flex-1 text-xs border-gray-300 dark:border-slate-700 border-y border-r rounded-r p-1.5 focus:ring-blue-500 font-bold text-blue-700 dark:text-blue-400 uppercase outline-none bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100" placeholder="e.g. 04/27/06/2026" />
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 dark:text-slate-300 mb-0.5">Select Region *</label>
                    <select name="region" value={formData.region} onChange={handleInputChange} disabled={!canViewGlobalActive || operation === 'update'} required className="w-full text-xs border-gray-300 dark:border-slate-700 rounded shadow-sm bg-gray-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 border p-1.5 focus:ring-blue-500 disabled:bg-gray-100 dark:disabled:bg-slate-900 disabled:text-gray-500">
                      {canViewGlobalActive ? Object.keys(REGIONAL_HIERARCHY).map(reg => <option key={reg} value={reg}>{reg}</option>) : <option value={userRegClean}>{stripHtmlTags(userRegClean)}</option>}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 dark:text-slate-300 mb-0.5">Station *</label>
                    <select name="station" value={formData.station} onChange={handleInputChange} disabled={!(canViewGlobalActive || isRegionalCommand) || operation === 'update'} required className="w-full text-xs border-gray-300 dark:border-slate-700 rounded shadow-sm bg-gray-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 border p-1.5 focus:ring-blue-500 disabled:bg-gray-100 dark:disabled:bg-slate-900 disabled:text-gray-500">
                      {operation === 'update' ? <option value={formData.station}>{stripHtmlTags(formData.station)}</option> : (canViewGlobalActive || isRegionalCommand) ? (REGIONAL_HIERARCHY[formData.region] || []).map(stat => <option key={stat} value={stat}>{stat}</option>) : <option value={currentUser.station}>{stripHtmlTags(currentUser.station)}</option>}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 dark:text-slate-300 mb-0.5">Date Recorded</label>
                    <input type="date" name="date" value={formData.date} onChange={handleInputChange} disabled={operation === 'update'} required className="w-full text-xs border-gray-300 dark:border-slate-700 rounded shadow-sm border p-1.5 disabled:bg-gray-100 dark:disabled:bg-slate-900 disabled:text-gray-500 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 dark:text-slate-300 mb-0.5">Time of Record</label>
                    <input type="text" name="time" value={formData.time} onChange={handleInputChange} disabled={operation === 'update'} placeholder="0830Hrs" className="w-full text-xs border-gray-300 dark:border-slate-700 rounded shadow-sm border p-1.5 disabled:bg-gray-100 dark:disabled:bg-slate-900 disabled:text-gray-500 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100" />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-gray-700 dark:text-slate-300 mb-0.5">Offence / Incident Type *</label>
                  <select name="offence" value={formData.offence} onChange={handleInputChange} required disabled={operation === 'update'} className="w-full text-xs border-gray-300 dark:border-slate-700 rounded shadow-sm bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border p-1.5 focus:ring-blue-500 disabled:bg-gray-100 dark:disabled:bg-slate-900 disabled:text-gray-500">
                    <option value="" disabled>-- Select Official Offence Category --</option>
                    {STANDARD_OFFENCES.map(off => (
                      <option key={off} value={off}>{off}</option>
                    ))}
                    
                    {formData.offence && formData.offence !== 'Other' && !STANDARD_OFFENCES.some(o => o.toUpperCase() === formData.offence.toUpperCase()) && (
                      <option value={formData.offence}>{formData.offence}</option>
                    )}
                    
                    <option value="Other">Other (Specify Below)</option>
                  </select>
                  
                  {formData.offence === 'Other' && operation === 'new' && (
                    <input type="text" name="customOffence" required value={stripHtmlTags(formData.customOffence || '')} onChange={handleInputChange} placeholder="Type the specific offence here..." className="mt-1.5 w-full text-xs border-blue-400 dark:border-slate-700 rounded shadow-sm border p-1.5 focus:ring-blue-500 bg-blue-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 uppercase" />
                  )}
                </div>

                {operation === 'new' ? (
                  <div className="pb-5"> 
                    <label className="block text-[11px] font-bold text-gray-700 dark:text-slate-300 mb-0.5">
                      Incident Narrative *
                    </label>
                    <ReactQuill 
                      theme="snow" 
                      value={formData.narrative} 
                      onChange={(content) => setFormData(prev => ({ ...prev, narrative: content }))} 
                      onBlur={(prevSelection, source, editor) => setFormData(prev => ({ ...prev, narrative: autoCapitalize(editor.getHTML()) }))}
                      className="bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded [&_.ql-editor]:min-h-[80px]"
                      modules={{ toolbar: [['bold', 'italic', 'underline'], [{ 'list': 'ordered'}, { 'list': 'bullet' }], ['clean']] }} 
                    />
                  </div>
                ) : (
                  <div className="pb-5"> 
                    <label className="block text-[11px] font-bold text-gray-700 dark:text-slate-300 mb-0.5">
                      Original Incident Narrative (Read-Only)
                    </label>
                    <div 
                      className="bg-gray-100 dark:bg-slate-900/50 text-slate-700 dark:text-slate-300 p-3 rounded border border-gray-300 dark:border-slate-700 ql-editor min-h-[80px] max-h-[150px] overflow-y-auto cursor-not-allowed text-xs"
                      dangerouslySetInnerHTML={{ __html: formData.narrative }} 
                    />
                  </div>
                )}

                {operation === 'update' && (
                  <div className="pb-5 mt-2"> 
                    <label className="block text-[11px] font-bold text-blue-700 dark:text-blue-400 mb-0.5">Append New Update / Action Taken *</label>
                    <ReactQuill 
                      theme="snow" 
                      value={formData.updateText || ''} 
                      onChange={(content) => setFormData(prev => ({ ...prev, updateText: content }))} 
                      onBlur={(prevSelection, source, editor) => setFormData(prev => ({ ...prev, updateText: autoCapitalize(editor.getHTML()) }))}
                      className="bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded [&_.ql-editor]:min-h-[80px] ring-1 ring-blue-200 dark:ring-blue-900"
                      modules={{ toolbar: [['bold', 'italic', 'underline'], [{ 'list': 'ordered'}, { 'list': 'bullet' }], ['clean']] }} 
                    />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 dark:text-slate-300 mb-0.5">Status</label>
                    <select name="status" value={formData.status} onChange={handleInputChange} className="w-full text-xs border-gray-300 dark:border-slate-700 rounded shadow-sm bg-gray-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 border p-1.5">
                      <option>ACTIVE INVESTIGATION</option>
                      <option>FORWARDED TO COURT</option>
                      <option>BAIL</option>
                      <option>ACQUITTED</option>
                      <option>CLOSED / CONVICTED</option>
                      <option>ADR</option>
                    </select>
                  </div>
                  <div>
                    <div className="block text-[11px] font-bold text-red-600 dark:text-red-400 mb-0.5 flex items-center">
                      <Lock size={10} className="mr-1"/> Suspects in Custody
                    </div>
                    <div className="flex space-x-1.5">
                      <div className="w-10 bg-red-100 dark:bg-red-950 border border-red-200 dark:border-red-900 text-red-800 dark:text-red-200 font-extrabold rounded flex items-center justify-center text-xs shadow-inner">
                        {operation === 'update' ? formData.suspects : formData.suspectDetails.length}
                      </div>
                      <button type="button" onClick={() => setShowLockup(true)} className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-1.5 px-2 rounded shadow text-[11px] transition flex items-center justify-center">
                        <Users size={12} className="mr-1"/> Add Suspects
                      </button>
                    </div>
                  </div>
                </div>

                <button type="submit" className="w-full bg-blue-700 hover:bg-blue-800 text-white font-bold py-2.5 px-3 rounded-lg shadow transition-colors flex justify-center items-center mt-3 text-xs">
                  {operation === 'new' ? '🚨 Submit New Case / Report' : '💾 Save Case Updates'}
                </button>
              </form>
            </div>
          </div>
        </div>

        <div className="lg:col-span-7 space-y-4">
          <div className="flex flex-col sm:flex-row gap-2.5 items-center">
             <div className="relative flex-1 w-full"> 
               <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 w-3.5 h-3.5" />
               <input type="text" placeholder="Search Reference, narrative, station or offence..." value={searchQuery} onChange={(e) => setSearchQuery(stripHtmlTags(e.target.value))} className="w-full pl-8 pr-3 py-1.5 border dark:border-slate-700 rounded-lg text-xs shadow-sm outline-none focus:border-blue-500 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100" />
             </div>

             <button
               type="button"
               onClick={() => setShowAgriculturalOnly(prev => !prev)}
               className={`px-3 py-1.5 text-xs font-black rounded-lg border transition-all flex items-center whitespace-nowrap shadow-sm cursor-pointer ${
                 showAgriculturalOnly 
                   ? 'bg-emerald-700 text-white border-emerald-800 ring-2 ring-emerald-500/20' 
                   : 'bg-white dark:bg-slate-800 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-slate-700 hover:bg-emerald-50 dark:hover:bg-slate-700'
               }`}
             >
               <Sprout className="w-3.5 h-3.5 mr-1" />
               {showAgriculturalOnly ? 'Agri-Crimes: ON' : 'Filter Agri-Crimes'}
             </button>

            <select value={filterRegion} onChange={(e) => { setFilterRegion(stripHtmlTags(e.target.value)); setFilterStation('ALL STATIONS'); }} disabled={!canViewGlobalActive} className="border dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs shadow-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-bold disabled:bg-gray-100 dark:disabled:bg-slate-900 disabled:text-gray-500 w-full sm:w-auto outline-none focus:border-blue-500 cursor-pointer">
              {canViewGlobalActive ? <><option value="ALL REGIONS">ALL REGIONS</option>{Object.keys(REGIONAL_HIERARCHY).map(reg => <option key={reg} value={reg}>{reg}</option>)}</> : <option value={userRegClean}>{stripHtmlTags(userRegClean)}</option>}
            </select>
            <select value={filterStation} onChange={(e) => setFilterStation(stripHtmlTags(e.target.value))} disabled={!(canViewGlobalActive || isRegionalCommand)} className="border dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs shadow-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-bold disabled:bg-gray-100 dark:disabled:bg-slate-900 disabled:text-gray-500 w-full sm:w-auto outline-none focus:border-blue-500 cursor-pointer">
              {(canViewGlobalActive || isRegionalCommand) ? (
                <><option value="ALL STATIONS">ALL STATIONS</option>{filterRegion !== 'ALL REGIONS' && REGIONAL_HIERARCHY[filterRegion] ? REGIONAL_HIERARCHY[filterRegion].map(stat => <option key={stat} value={stat}>{stat}</option>) : null}</>
              ) : (
                <option value={currentUser?.station}>{stripHtmlTags(currentUser?.station)}</option>
              )}
            </select>
          </div>

          <ExpandableTableCard title="Crime/Incident Registry Ledger" onToggle={(expanded) => { if (typeof setSidebarOpen === 'function') setSidebarOpen(!expanded); }}>
            <div className="overflow-x-auto overflow-y-auto w-full max-h-[65vh] custom-scrollbar">
              <table className="min-w-[1100px] w-full divide-y divide-gray-200 dark:divide-slate-700">
                <thead className="bg-gray-50 dark:bg-slate-900 sticky top-0 z-10 shadow-sm">
                  <tr>
                    <th className="px-3.5 py-2.5 text-left text-[11px] font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider w-16">SN</th>
                    <th className="px-3.5 py-2.5 text-left text-[11px] font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider w-40">REFERENCE</th>
                    <th className="px-3.5 py-2.5 text-left text-[11px] font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider w-32">Date & Time</th>
                    <th className="px-3.5 py-2.5 text-left text-[11px] font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider w-44">Region/Post</th>
                    <th className="px-3.5 py-2.5 text-left text-[11px] font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider min-w-[320px]">Incident Narrative</th>
                    <th className="px-3.5 py-2.5 text-center text-[11px] font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider w-24">Suspects</th>
                    <th className="px-3.5 py-2.5 text-left text-[11px] font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider w-40">Status</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-slate-800 divide-y divide-gray-200 dark:divide-slate-700 text-xs">
                  {isFetchingReports ? (
                    <tr><td colSpan="7" className="text-center py-6 text-gray-500 dark:text-slate-400 font-medium text-xs border-b-0"><Loader2 className="w-5 h-5 mx-auto animate-spin mb-2" /> Syncing database records...</td></tr>
                  ) : finalFilteredReports.map((report, index) => {
                    const rRegion = getOfficialRegionForStation(report.station, report.region);
                    const isAgriMatch = (report.category || '').toUpperCase() === 'AGRIC_CRIME';

                    return (
                      <tr key={report.id || report.sn || index} className="even:bg-slate-50 dark:even:bg-slate-900/50 hover:bg-blue-50 dark:hover:bg-slate-700 transition-colors cursor-pointer group" onClick={() => { if (operation === 'update') { populateUpdateCrimeForm(report); } else { setSelectedCase(report); } }}>
  {/* 🟢 Replace report.id/sn with the dynamic array sequence index */}
  <td className="px-3.5 py-3 whitespace-nowrap text-xs font-black text-gray-900 dark:text-slate-100 align-top group-hover:text-blue-700 dark:group-hover:text-blue-400 transition-colors">
    {finalFilteredReports.length - index}
  </td>
  <td className="px-3.5 py-3 whitespace-nowrap text-[11px] font-extrabold text-blue-700 dark:text-blue-400 align-top break-words">{stripHtmlTags(report.sdRef || report.sd_ref)}</td>
                        <td className="px-3.5 py-3 whitespace-nowrap text-[11px] text-gray-500 dark:text-slate-400 align-top">{stripHtmlTags(report.date)}<br/><span className="text-[9px] text-gray-400 dark:text-slate-500">{stripHtmlTags(report.time)}</span></td>
                        <td className="px-3.5 py-3 whitespace-nowrap text-[11px] text-gray-700 dark:text-slate-300 align-top font-bold">{stripHtmlTags(report.station)} <br/><span className="text-[9px] text-gray-400 dark:text-slate-500 font-medium">{rRegion}</span></td>
                        <td className="px-3.5 py-3 text-[11px] text-gray-700 dark:text-slate-300 align-top whitespace-normal break-words overflow-wrap-anywhere">
                          <div className="flex items-center space-x-2 mb-0.5">
                            {report.offence && <div className="font-extrabold text-red-600 dark:text-red-400 uppercase">{stripHtmlTags(report.offence)}</div>}
                            {isAgriMatch && (
                              <span className="bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 font-black text-[9px] px-1.5 py-0.5 rounded border border-emerald-300 dark:border-emerald-800">🌾 AGRI-CRIME</span>
                            )}
                          </div>
                          <div className="ql-editor p-0 line-clamp-3 text-slate-600 dark:text-slate-300 [&_*]:!text-[11px] [&_*]:!bg-transparent whitespace-normal break-words" dangerouslySetInnerHTML={{ __html: report.narrative }} />
                        </td>
                        <td className="px-3.5 py-3 whitespace-nowrap text-[11px] font-extrabold text-red-600 dark:text-red-400 text-center align-top">{(report.suspectDetails || report.suspect_details || []).length}</td>
                        <td className="px-3.5 py-3 whitespace-normal break-words align-top">
                          <span className={`px-2 py-0.5 inline-flex text-[9px] font-bold rounded-full ${
                            report.status.includes('ACTIVE') ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300 border border-yellow-200 dark:border-yellow-900' : ''
                          } ${
                            report.status.includes('COURT') ? 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 border border-purple-200 dark:border-purple-900' : ''
                          } ${
                            report.status.includes('BAIL') ? 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-900' : ''
                          } ${
                            report.status.includes('ACQUITTED') ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800' : ''
                          } ${
                            report.status.includes('CLOSED') ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300 border border-green-200 dark:border-green-900' : ''
                          } ${
                            report.status.includes('ADR') ? 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300 border border-orange-200 dark:border-orange-900' : ''
                          }`}>{stripHtmlTags(report.status)}</span>
                        </td>
                      </tr>
                    );
                  })}
                  {finalFilteredReports.length === 0 && !isFetchingReports && <tr><td colSpan="7" className="text-center py-6 text-gray-500 dark:text-slate-400 font-medium text-xs border-b-0">No records found for this jurisdiction.</td></tr>}
                </tbody>
              </table>
            </div>
          </ExpandableTableCard>
        </div>
      </div>

      {showLockupMatrixModal && (
        <LockupMatrixLedger 
          lockupEntries={lockupData} 
          allTimeLockupTotal={null} 
          onClose={() => setShowLockupMatrixModal(false)} 
          selectedRegion={filterRegion}
          selectedStation={filterStation}
        />
      )}

      {selectedCase && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 sm:p-6 animate-in fade-in zoom-in-95 duration-200">
          <div className="bg-white dark:bg-slate-900 shadow-2xl max-w-3xl w-full flex flex-col max-h-[90vh] rounded-xl overflow-hidden border border-slate-300 dark:border-slate-700">
            <div className="bg-slate-900 dark:bg-slate-950 text-white px-5 py-3 flex justify-between items-center shrink-0 shadow-md z-10">
              <h3 className="font-bold flex items-center text-xs uppercase tracking-wider"><Shield className="text-blue-400 mr-2" size={16} /> OFFICIAL CRIME DOSSIER — REF: {stripHtmlTags(selectedCase.sdRef || selectedCase.sd_ref)}</h3>
              <button onClick={() => setSelectedCase(null)} className="text-slate-400 hover:text-white hover:bg-slate-700 p-1 rounded transition-colors cursor-pointer"><X size={18} /></button>
            </div>
            <div className="p-6 overflow-y-auto space-y-6 flex-1 custom-scrollbar bg-slate-50 dark:bg-slate-900 text-xs" style={{ backgroundImage: 'radial-gradient(#e5e7eb 1px, transparent 1px)', backgroundSize: '20px 20px' }}>
              <div className="flex flex-col items-center justify-center text-center border-b-2 border-slate-800 dark:border-slate-700 pb-4">
                 <img src="/upf_badge.png" alt="UPF Logo" className="w-12 h-12 mb-1.5 object-contain grayscale contrast-200 brightness-50" onError={(e) => { e.target.style.display = 'none'; }} />
                 <h2 className="text-base font-extrabold text-slate-900 dark:text-slate-100 tracking-widest uppercase">Uganda Police Force</h2>
                 <h3 className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase mt-0.5 tracking-wider">Crime Incident Matrix Profile</h3>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-white dark:bg-slate-800 p-4 border border-slate-200 dark:border-slate-700 shadow-sm rounded-lg">
                <div className="border-l-4 border-blue-600 pl-2.5"><div className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest mb-0.5">Database SN (ID)</div><div className="text-xs font-black text-slate-900 dark:text-slate-100">{selectedCase.id || selectedCase.sn}</div></div>
                <div className="border-l-4 border-slate-600 pl-2.5"><div className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest mb-0.5">Time & Date Logged</div><div className="text-xs font-bold text-slate-900 dark:text-slate-100">{stripHtmlTags(selectedCase.date)} <span className="text-slate-500 dark:text-slate-400 font-medium">@ {stripHtmlTags(selectedCase.time)}</span></div></div>
                <div className="border-l-4 border-slate-600 pl-2.5"><div className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest mb-0.5">Command Jurisdiction</div><div className="text-xs font-bold text-slate-900 dark:text-slate-100">{stripHtmlTags(selectedCase.station)}</div><div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">{getOfficialRegionForStation(selectedCase.station, selectedCase.region)}</div></div>
                <div className="border-l-4 border-slate-600 pl-2.5"><div className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest mb-0.5">Investigation Status</div><div className="text-xs font-extrabold text-blue-700 dark:text-blue-400 uppercase">{stripHtmlTags(selectedCase.status)}</div></div>
              </div>
              <div className="bg-white dark:bg-slate-800 p-5 border border-slate-200 dark:border-slate-700 shadow-sm rounded-lg">
                <div className="mb-4">
                  <div className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest border-b border-slate-100 dark:border-slate-700 pb-1.5 mb-2">Primary Offence Matrix</div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="text-sm font-black text-red-600 dark:text-red-400 uppercase">{stripHtmlTags(selectedCase.offence || 'UNSPECIFIED OFFENCE')}</div>
                    <div className="text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-900 px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 shadow-sm">REF: {stripHtmlTags(selectedCase.sdRef || selectedCase.sd_ref)}</div>
                  </div>
                </div>
                <div>
                  <div className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest border-b border-slate-100 dark:border-slate-700 pb-1.5 mb-2">Official Incident Narrative</div>
                  <div className="text-xs text-slate-800 dark:text-slate-200 leading-normal ql-editor whitespace-normal break-words overflow-wrap-anywhere p-0 min-h-[100px]" dangerouslySetInnerHTML={{ __html: selectedCase.narrative }} />
                </div>
              </div>
              {selectedCase.suspectDetails && selectedCase.suspectDetails.length > 0 && (
                <div className="bg-white dark:bg-slate-800 p-4 border border-red-200 dark:border-red-900 shadow-sm rounded-lg">
                  <div className="text-[10px] font-extrabold text-red-800 dark:text-red-400 uppercase tracking-widest border-b border-red-100 dark:border-red-900 pb-2 mb-3 flex items-center">
                    <Lock size={14} className="mr-1.5"/> Suspects Registered in Custody ({selectedCase.suspectDetails.length})
                  </div>
                  
                  <div className="flex flex-col gap-4 w-full">
                    {selectedCase.suspectDetails.map((s, idx) => {
                      const isValidPhoto = s.photo_url && !s.photo_url.startsWith('blob:');

                      return (
                        <div key={idx} className="bg-red-50 dark:bg-red-950/40 p-4 rounded-xl border border-red-200 dark:border-red-900 flex flex-row items-start gap-5 shadow-sm w-full">
                          
                          <div className="shrink-0">
                            {isValidPhoto ? ( 
                              <img src={s.photo_url} alt={s.name} className="w-28 h-28 rounded-lg object-cover border-4 border-red-300 dark:border-red-800 shadow-md bg-white" onError={(e) => { e.target.style.display = 'none'; }} /> 
                            ) : ( 
                              <div className="w-28 h-28 rounded-lg bg-red-100 dark:bg-red-900 text-red-400 dark:text-red-300 flex flex-col items-center justify-center font-bold text-[10px] border-2 border-dashed border-red-300 dark:border-red-800 text-center p-2 uppercase leading-tight shadow-inner">
                                <Camera size={24} className="mb-2 opacity-60"/>
                                No Photo
                              </div> 
                            )}
                          </div>
                          
                          <div className="flex-1 min-w-0 py-1">
                            <div className="font-extrabold uppercase text-slate-900 dark:text-slate-100 text-sm mb-1">{idx + 1}. {stripHtmlTags(s.name)}</div>
                            <div className="text-xs text-red-900 dark:text-red-300 font-bold mb-1.5">{stripHtmlTags(s.sex)} • {s.age ? `${stripHtmlTags(String(s.age))} Yrs` : 'Age Unk'} • Tribe: {stripHtmlTags(s.tribe || 'N/A')} • Nat: {stripHtmlTags(s.nationality || 'N/A')}</div>
                            <div className="text-xs text-slate-700 dark:text-slate-300 mb-2"><span className="font-black text-slate-900 dark:text-slate-100">Res:</span> {stripHtmlTags(s.residence || 'N/A')} &nbsp;|&nbsp; <span className="font-black text-slate-900 dark:text-slate-100">Tel:</span> {stripHtmlTags(s.contact || 'N/A')}</div>
                            
                            {s.mental_health_status && s.mental_health_status !== 'NORMAL' && ( 
                              <div className="inline-flex mt-1 text-[10px] bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800 font-black px-2.5 py-1 rounded shadow-sm uppercase tracking-wider w-max">
                                Status: {stripHtmlTags(s.mental_health_status)}
                              </div> 
                            )}
                          </div>

                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="text-center pt-4 opacity-40"><p className="text-[9px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">End of Official Record Extract</p><p className="text-[8px] text-slate-400 dark:text-slate-500 mt-0.5">System Audit ID: {selectedCase.id || selectedCase.sn} • Printed: {new Date().toLocaleString()}</p></div>
            </div>
            <div className="bg-slate-100 dark:bg-slate-950 p-3 border-t border-slate-300 dark:border-slate-800 flex justify-end shrink-0 shadow-inner z-10">
              <button onClick={() => setSelectedCase(null)} className="bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white font-bold py-2 px-4 rounded-lg text-xs transition-all shadow border border-slate-950 flex items-center cursor-pointer"><X size={14} className="mr-1.5"/> Close Dossier</button>
            </div>
          </div>
        </div>
      )}
    </div>  
  );
};

export default CrimeIncidentRegistry;