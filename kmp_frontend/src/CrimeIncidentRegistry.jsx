import React, { useState, useMemo, useEffect } from 'react';
import { 
  Shield, Users, PlusCircle, Edit, Search, X, AlertTriangle, CheckCircle, Lock, Camera, Filter, HardDrive, Save, Sprout
} from 'lucide-react';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import LockupMatrixLedger from './LockupMatrixLedger';

const REGIONAL_HIERARCHY = {
  "KMP NORTH": ["KAWEMPE", "KAKIRI", "KASANGATI", "MATUGGA", "NANSANA", "OLD KAMPALA", "WAKISO", "WANDEGEYA"],
  "KMP EAST": ["JINJA ROAD", "KIRA", "KIRA ROAD", "MUKONO", "NAGGALAMA", "SEETA"],
  "KMP SOUTH": ["NATEETE", "CPS KAMPALA", "PARLIAMENT", "ENTEBBE", "KABALAGALA", "KAJJANSI", "KASENYI", "KATWE", "KYENGERA", "NSANGI"],
  "KMP HEADQUARTERS": ["KMP HEADQUARTERS", "FLYING SQUAD", "CRIME INTELLIGENCE"],
  "POLICE HEADQUARTERS": ["NAGURU"]
};

// Auto-Capitalization (Ignores HTML tags during typing)
const autoCapitalize = (text) => {
  if (!text) return '';
  return text.replace(/(^\s*(?:<[^>]+>\s*)*|[\.\!\?]\s+(?:<[^>]+>\s*)*|<(?:p|br|div|li|h[1-6])[^>]*>\s*)([a-z])/gi, (match, prefix, letter) => {
    return prefix + letter.toUpperCase();
  });
};

const extractPlainText = (htmlString) => {
  if (!htmlString) return '';
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = htmlString;
  return tempDiv.innerText.trim();
};

const MetricCard = ({ title, value, colorClass }) => {
  const isKMPMaster = title === 'KMP Master Lock-up' || title === 'KMP Master';
  return (
    <div className={`bg-white p-2.5 rounded-lg border border-slate-200 shadow-[0_1px_2px_rgba(0,0,0,0.05)] flex flex-col items-center justify-center text-center hover:bg-slate-50 transition-colors ${isKMPMaster ? 'bg-amber-50/80 border-amber-300 ring-1 ring-amber-300 shadow-md scale-[1.02]' : ''}`}>
      <h4 className={`text-[9px] font-extrabold mb-1 uppercase tracking-wider leading-tight w-full break-words ${isKMPMaster ? 'text-amber-800' : 'text-slate-500'}`}>
        {title}
      </h4>
      <div className={`text-base font-black leading-none flex items-center justify-center ${colorClass}`}>
        {value === "Pending" ? (
          <span className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded border border-red-200 animate-pulse">Pending</span>
        ) : (
          value
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
      <div className={expanded ? "fixed inset-4 sm:inset-10 z-[9999] bg-white rounded-xl shadow-2xl border border-slate-300 flex flex-col animate-in zoom-in-95 duration-200 overflow-hidden" : "bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col"}>
        <div className="bg-slate-900 px-4 py-3 sm:px-6 sm:py-4 border-b border-slate-200 flex justify-between items-center shrink-0">
          <h3 className="font-extrabold text-white text-sm uppercase tracking-wider">{title}</h3>
          <button onClick={() => { const nextState = !expanded; setExpanded(nextState); if (onToggle) onToggle(nextState); }} className="text-xs text-blue-400 hover:text-white font-bold transition flex items-center bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg border border-slate-700 shadow-inner">
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

const authFetch = async (url, options = {}) => {
  const token = localStorage.getItem('kmp_authToken');
  const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
  
  const existingHeaders = options.headers || {};
  
  const response = await fetch(`${API_URL}${url}`, { 
    ...options, 
    headers: { 
      ...existingHeaders, 
      "Authorization": `Bearer ${token}` 
    } 
  });

  if (response.status === 401) {
    console.warn("Session expired. Automatically logging out...");
    localStorage.removeItem('kmp_authToken');
    localStorage.removeItem('kmp_currentUser'); 
    window.location.href = '/'; 
  }

  return response;
};

const CrimeIncidentRegistry = ({ currentUser, reports, setReports, setSidebarOpen }) => {
  const [lockupData, setLockupData] = useState([]);
  const [standalonePopInput, setStandalonePopInput] = useState({ total: '', male: '', female: '', d1: '', d2: '', d3: '' });
  const [isEditingLockup, setIsEditingLockup] = useState(false);
  const [editLockupTarget, setEditLockupTarget] = useState(null);

  const [showAgriculturalOnly, setShowAgriculturalOnly] = useState(false);

  const isGlobalCommand = currentUser?.role === 'SUPER_ADMIN' || currentUser?.permissions?.view_global_roster || ['IGP', 'DIGP', 'DIRECTOR', 'KMP COMMANDER'].some(title => (currentUser?.position || '').toUpperCase().includes(title)) || ['KMP HEADQUARTERS', 'POLICE HEADQUARTERS'].includes((currentUser?.region || '').toUpperCase());
  const isRegionalCommand = isGlobalCommand || ['RPC', 'DEPUTY COMMANDER'].includes((currentUser?.role || '').toUpperCase()) || (currentUser?.position || '').toUpperCase().includes('RPC') || (currentUser?.position || '').toUpperCase().includes('REGIONAL');

  const [operation, setOperation] = useState('new');
  const [notification, setNotification] = useState(null);
  const [selectedCase, setSelectedCase] = useState(null);
  
  const [showHqGrandModal, setShowHqGrandModal] = useState(false);
  const [hqGrandTotalInput, setHqGrandTotalInput] = useState('');
  const [showLockupMatrixModal, setShowLockupMatrixModal] = useState(false);  

  const [filterRegion, setFilterRegion] = useState(isGlobalCommand ? 'ALL REGIONS' : currentUser?.region || '');
  const [filterStation, setFilterStation] = useState(isRegionalCommand ? 'ALL STATIONS' : currentUser?.station || '');

  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState('ALL TIME');
  const [updateSearch, setUpdateSearch] = useState('');
  const [summaryTimeFilter, setSummaryTimeFilter] = useState('ALL');

  const [showLockup, setShowLockup] = useState(false);
  const [newSuspect, setNewSuspect] = useState({ name: '', sex: 'MALE', age: '', tribe: '', nationality: '', residence: '', contact: '', mental_health_status: 'NORMAL', photo_url: '' });

  const getTodayString = () => new Date().toLocaleDateString('en-CA').split(',')[0].replace(/\//g, '-');

  const [formData, setFormData] = useState({
    sn: null, sd_ref: '', ref_type: 'SD Ref:', ref_number: '',
    region: currentUser.region, station: currentUser.station || REGIONAL_HIERARCHY[currentUser?.region]?.[0] || '',
    date: getTodayString(), time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }).replace(':', '') + 'Hrs',
    offence: '', customOffence: '', narrative: '', status: 'ACTIVE INVESTIGATION', suspectDetails: [], updateText: ''
  });

  useEffect(() => {
    const fetchLockupData = async () => {
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

  const resetFormToBlank = () => {
    setFormData({
      sn: null, sd_ref: '', ref_type: 'SD Ref:', ref_number: '',
      region: currentUser.region, station: currentUser.station || REGIONAL_HIERARCHY[currentUser?.region]?.[0] || '',
      date: getTodayString(), time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }).replace(':', '') + 'Hrs',
      offence: '', customOffence: '', narrative: '', status: 'ACTIVE INVESTIGATION', suspectDetails: [], updateText: ''
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
      ...caseData, sd_ref: caseData.sdRef || caseData.sd_ref, offence: caseData.offence || 'Other',
      customOffence: '', suspectDetails: caseData.suspectDetails || [], updateText: ''
    });
  };

const filteredReports = useMemo(() => {
    if (!Array.isArray(reports)) return [];
    const activeRegion = (filterRegion && filterRegion !== 'ALL REGIONS') ? filterRegion.trim().toUpperCase() : null;
    const activeStation = (filterStation && filterStation !== 'ALL STATIONS') ? filterStation.trim().toUpperCase() : null;

    const results = reports.filter(r => {
      if (r.is_hq_general_total || (r.offence || '').toUpperCase().includes("LOCK-UP TOTAL")) return false;

      const dbRegion = (r.region || '').trim().toUpperCase();
      const dbStation = (r.station || '').trim().toUpperCase();
      if (activeRegion && dbRegion !== activeRegion) return false;
      if (activeStation && dbStation !== activeStation) return false;

      // 🟢 PRECISE AGRICULTURAL & LIVESTOCK CRIME FILTERING (Excluding Motorcycle Robberies)
      if (showAgriculturalOnly) {
        const offenceText = (r.offence || '').toLowerCase();
        const narrativeText = extractPlainText(r.narrative || '').toLowerCase();
        const combinedText = `${offenceText} ${narrativeText}`;

        // 1. Explicitly filter out motorcycle/boda-boda transit crimes if accidentally flagged
        const exclusionKeywords = ['motorcycle', 'motor cycle', 'boda', 'boda-boda', 'bodaboda', 'bajaj', 'tvs', 'super-sport', 'motor vehicle', 'car theft'];
        const isExcluded = exclusionKeywords.some(ex => combinedText.includes(ex));
        if (isExcluded) return false;

        // 2. Strict Agricultural, Crop, and Livestock keywords
        const agriKeywords = [
          'agriculture', 'agri-crime', 'crop', 'crops', 'farm', 'farming', 'farmer', 'farmers', 'plant', 'plants', 
          'cattle', 'cow', 'cows', 'bull', 'bulls', 'calf', 'calves', 'ox', 'oxen',
          'goat', 'goats', 'kid', 'kids', 'sheep', 'ram', 'ewe', 'lamb', 'pig', 'pigs', 'swine',
          'chicken', 'chickens', 'poultry', 'duck', 'ducks', 'bird', 'birds', 'egg', 'eggs',
          'produce', 'harvest', 'milk', 'dairy', 'coffee', 'cocoa', 'matooke', 'banana', 'bananas',
          'sugarcane', 'vanilla', 'cassava', 'maize', 'bean', 'beans', 'grain', 'grains',
          'theft of cattle', 'stock theft', 'livestock', 'stray animal', 'grazing', 'orchard', 'garden produce'
        ];

        const isAgriMatch = agriKeywords.some(keyword => combinedText.includes(keyword));
        if (!isAgriMatch) return false;
      }
      
      if (searchQuery) {
        const query = searchQuery.toLowerCase().trim();
        const textMatch = (r.narrative || '').toLowerCase().includes(query) || (r.station || '').toLowerCase().includes(query) || (r.sdRef || r.sd_ref || '').toLowerCase().includes(query);
        if (!textMatch) return false;
      }
      
      if (dateFilter && dateFilter !== 'ALL TIME') {
        if (dateFilter === 'TODAY') {
          const todayStr = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0];
          if (r.date !== todayStr) return false;
        } else if (dateFilter === 'LAST 7 DAYS') {
          if ((Date.now() - new Date(r.date)) / (1000 * 60 * 60 * 24) > 7) return false;
        } else if (dateFilter === 'LAST 30 DAYS') {
          if ((Date.now() - new Date(r.date)) / (1000 * 60 * 60 * 24) > 30) return false;
        } else if (dateFilter === 'LAST 90 DAYS') {
          if ((Date.now() - new Date(r.date)) / (1000 * 60 * 60 * 24) > 90) return false;
        } else if (dateFilter === 'LAST 120 DAYS') {
          if ((Date.now() - new Date(r.date)) / (1000 * 60 * 60 * 24) > 120) return false;
        }
      }
      return true;
    });
    return results.sort((a, b) => (b.id || b.sn || 0) - (a.id || a.sn || 0));
  }, [reports, filterRegion, filterStation, searchQuery, dateFilter, showAgriculturalOnly]);

  const isStationSpecific = filterStation && filterStation !== 'ALL STATIONS';

  const availableUpdateCases = useMemo(() => {
    return filteredReports.filter(r => {
      if (!['ADMIN', 'SUPER_ADMIN'].includes(currentUser.role) && r.region !== currentUser.region) return false;
      if (updateSearch) {
        const query = updateSearch.toLowerCase();
        return (r.sdRef || r.sd_ref || '').toLowerCase().includes(query) || (r.id || r.sn || '').toString().includes(query) || r.narrative.toLowerCase().includes(query);
      }
      return true;
    });
  }, [filteredReports, currentUser, updateSearch]);

  const metrics = useMemo(() => {
    const stationCellPop = {};
    const todayStr = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    
    let hqGrandTotalToday = null;
    let latestHqGrandTotal = null;
    let hasLockupUpdateToday = false;
    
    lockupData.forEach(l => {
      const isHQTotal = l.station === 'HEADQUARTERS GENERAL TOTAL' || l.region === 'KMP HEADQUARTERS';
      if (isHQTotal) {
        if (l.date === todayStr && l.suspects > 0) hqGrandTotalToday = l.suspects;
        if (!latestHqGrandTotal && l.suspects > 0) latestHqGrandTotal = l.suspects;
      } else {
        if (l.date === todayStr) {
          stationCellPop[l.station] = l.suspects;
          if (l.station === filterStation) hasLockupUpdateToday = true;
        }
      }
    });
    
    const calculatedGlobalSum = Object.values(stationCellPop).reduce((sum, pop) => sum + pop, 0);
    const kmpGeneralTotal = hqGrandTotalToday !== null ? hqGrandTotalToday : calculatedGlobalSum > 0 ? calculatedGlobalSum : latestHqGrandTotal;

    let localJurisdictionTotal = 0;
    if (filterStation && filterStation !== 'ALL STATIONS') {
      localJurisdictionTotal = stationCellPop[filterStation] || 0;
    } else if (filterRegion && filterRegion !== 'ALL REGIONS') {
      const regionStations = REGIONAL_HIERARCHY[filterRegion] || [];
      localJurisdictionTotal = regionStations.reduce((sum, stat) => sum + (stationCellPop[stat] || 0), 0);
    } else {
      localJurisdictionTotal = calculatedGlobalSum;
    }

    const totalCaseSuspects = filteredReports.reduce((sum, r) => sum + (r.suspectDetails || r.suspect_details || []).length, 0);

    return {
      localLockup: (hasLockupUpdateToday || localJurisdictionTotal > 0) ? localJurisdictionTotal : "Pending",
      kmpGeneralLockup: kmpGeneralTotal !== null && kmpGeneralTotal !== undefined ? kmpGeneralTotal : "Pending",
      newCases: filteredReports.length,
      active: filteredReports.filter(r => r.status === 'ACTIVE INVESTIGATION').length,
      sanctioned: filteredReports.filter(r => r.status === 'FORWARDED TO COURT').length,
      closed: filteredReports.filter(r => r.status === 'CLOSED / CONVICTED').length,
      adr: filteredReports.filter(r => r.status === 'ADR').length,
      totalSuspects: totalCaseSuspects
    };
  }, [filteredReports, lockupData, filterRegion, filterStation]);

  const { generalCrimes, processedLockups, allTimeLockupTotal, crimeGrandTotal, suspectGrandTotal } = useMemo(() => {
    const crimeMap = {};
    const now = new Date();

    filteredReports.forEach(r => {
      let includeInSummary = true;
      const rDate = new Date(r.date);
      if (summaryTimeFilter === 'TODAY') includeInSummary = rDate.toDateString() === now.toDateString();
      else if (summaryTimeFilter === 'WEEK') includeInSummary = rDate >= new Date(now.setDate(now.getDate() - 7)) && rDate <= new Date();
      else if (summaryTimeFilter === 'MONTH') includeInSummary = rDate.getMonth() === now.getMonth() && rDate.getFullYear() === now.getFullYear();
      else if (summaryTimeFilter === 'YEAR') includeInSummary = rDate.getFullYear() === now.getFullYear();

      if (includeInSummary) {
        const offenceName = (r.offence || 'GENERAL CRIME').toUpperCase();
        if (!crimeMap[offenceName]) crimeMap[offenceName] = { offence: offenceName, cases: 0, suspects: 0 };
        crimeMap[offenceName].cases += 1;
        crimeMap[offenceName].suspects += (r.suspectDetails || r.suspect_details || []).length;
      }
    });
    const crimesArray = Object.values(crimeMap).sort((a, b) => b.cases - a.cases);

    const sortedLockups = [...lockupData].sort((a, b) => new Date(b.date) - new Date(a.date));
    const lockupsWithVar = sortedLockups.map((log, index, arr) => {
      if (index === arr.length - 1) return { ...log, variation: 0, hasPrev: false };
      return { ...log, variation: log.suspects - arr[index + 1].suspects, hasPrev: true };
    });
    
    return {
      generalCrimes: crimesArray,
      processedLockups: lockupsWithVar,
      allTimeLockupTotal: lockupData.reduce((acc, l) => acc + (parseInt(l.suspects) || 0), 0),
      crimeGrandTotal: crimesArray.reduce((acc, curr) => acc + curr.cases, 0),
      suspectGrandTotal: crimesArray.reduce((acc, curr) => acc + curr.suspects, 0)
    };
  }, [filteredReports, lockupData, summaryTimeFilter]);

  const handleInputChange = (e) => {
    const { name, value, type } = e.target;
    if (name === 'region') {
      setFormData(prev => ({ ...prev, region: value, station: REGIONAL_HIERARCHY[value]?.[0] || '' }));
    } else if (['customOffence'].includes(name)) {
      setFormData(prev => ({ ...prev, [name]: value.toUpperCase() }));
    } else {
      setFormData(prev => ({ ...prev, [name]: type === 'number' ? parseInt(value) || 0 : value }));
    }
  };

  const handleAddSuspect = () => {
    if (!newSuspect.name.trim()) return alert("Suspect name is required.");
    setFormData({ ...formData, suspectDetails: [...formData.suspectDetails, { ...newSuspect, id: Date.now() }] });
    setNewSuspect({ name: '', sex: 'MALE', age: '', tribe: '', nationality: '', residence: '', contact: '', mental_health_status: 'NORMAL', photo_url: '' }); 
  };

  const handleRemoveSuspect = (id) => setFormData({ ...formData, suspectDetails: formData.suspectDetails.filter(s => s.id !== id) });

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
        const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
        const response = await fetch(`${API_URL}/api/v1/investigation/upload/`, { method: "POST", headers: { "Authorization": `Bearer ${token}` }, body: uploadData });
        const data = await response.json();
        if (data.full_s3_url || data.cloud_storage_path) {
          setNewSuspect({ ...newSuspect, photo_url: data.full_s3_url || `https://kmp-tracker-system-tu-16-06-26.s3.eu-central-1.amazonaws.com/${data.cloud_storage_path}` });
          setNotification("✅ Mugshot uploaded securely!");
        } else throw new Error("Invalid response");
      } catch (error) {
        setNewSuspect({ ...newSuspect, photo_url: URL.createObjectURL(file) });
        setNotification("⚠️ API unreachable. Using temporary local preview.");
      }
    }
  };

  const handleEditLockupToggle = () => {
    if (isEditingLockup) {
      setIsEditingLockup(false);
      setEditLockupTarget(null);
      setStandalonePopInput({ total: '', male: '', male_juvenile: '', female: '', female_juvenile: '', d1: '', d2: '', d3: '' });
    } else {
      const todayStr = getTodayString();
      const existingEntry = lockupData.find(l => l.station === formData.station && l.date === todayStr);
      
      if (existingEntry) {
        setEditLockupTarget(existingEntry);
        setStandalonePopInput({
          total: existingEntry.suspects.toString(),
          male: (existingEntry.male_count || 0).toString(),
          female: (existingEntry.female_count || 0).toString(),
          d1: (existingEntry.detention_1day || 0).toString(),
          d2: (existingEntry.detention_2days || 0).toString(),
          d3: (existingEntry.detention_3days_over || 0).toString()
        });
        setIsEditingLockup(true);
      } else {
        alert(`No cell population logged for ${formData.station} today yet. Please log a new entry.`);
      }
    }
  };

  const handleStandalonePopSubmit = async () => {
    const totalVal = parseInt(standalonePopInput.total) || 0;
    const maleVal = parseInt(standalonePopInput.male) || 0;
    const femaleVal = parseInt(standalonePopInput.female) || 0;
    const d1Val = parseInt(standalonePopInput.d1) || 0;
    const d2Val = parseInt(standalonePopInput.d2) || 0;
    const d3Val = parseInt(standalonePopInput.d3) || 0;

    if (totalVal === 0 && maleVal === 0 && femaleVal === 0) {
      return setNotification("Error: Please enter valid cell population numbers.");
    }
    
    setNotification(isEditingLockup ? "⏳ Updating Daily Cell Population..." : "⏳ Logging Daily Cell Population to Independent Matrix...");
    
    try {
      if (isEditingLockup && editLockupTarget) {
        const updatePayload = {
          ...editLockupTarget,
          suspects: totalVal,
          male_count: maleVal,
          female_count: femaleVal,
          detention_1day: d1Val,
          detention_2days: d2Val,
          detention_3days_over: d3Val,
          last_updated_by: `${currentUser.name} (${currentUser.fnum})`
        };

        const response = await authFetch(`/api/v1/lockup-matrix/${editLockupTarget.id}`, {
          method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updatePayload)
        });  
        
        if (!response.ok) throw new Error("Database rejected the lockup update.");
        
        setLockupData(lockupData.map(l => l.id === editLockupTarget.id ? updatePayload : l));
        setNotification(`✅ Daily Cell Population updated successfully for ${formData.station}!`);
        setIsEditingLockup(false);
        setEditLockupTarget(null);

      } else {
        const popRef = `POP-${formData.station.substring(0,3).toUpperCase()}-${Date.now().toString().slice(-6)}`;
        const apiPayload = {
          sd_ref: popRef, 
          region: formData.region, 
          station: formData.station,
          date: getTodayString(), 
          time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }).replace(':', '') + 'Hrs',
          suspects: totalVal,
          male_count: maleVal,
          female_count: femaleVal,
          detention_1day: d1Val,
          detention_2days: d2Val,
          detention_3days_over: d3Val,
          last_updated_by: `${currentUser.name} (${currentUser.fnum})`
        };

        const response = await authFetch(`/api/v1/lockup-matrix`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(apiPayload)
        });  
        if (!response.ok) throw new Error("Database rejected the lockup entry. Did you already log one today?");
        
        const newLockup = await response.json();
        setLockupData([newLockup, ...lockupData]);
        setNotification(`✅ Daily Cell Population successfully logged to the Independent Matrix for ${formData.station}!`);
      }
      
      setStandalonePopInput({ total: '', male: '', female: '', d1: '', d2: '', d3: '' }); 
      setTimeout(() => setNotification(null), 5000);
    } catch (err) {
      setNotification(`❌ Error: ${err.message}`);
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
      female_count: 0,
      detention_1day: 0,
      detention_2days: 0,
      detention_3days_over: 0,
      last_updated_by: `${currentUser.name} (${currentUser.fnum})`
    };

    try {
      const response = await authFetch(`/api/v1/lockup-matrix`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(apiPayload)
      });
      if (!response.ok) throw new Error("Database rejected HQ total.");

      const newLockup = await response.json();
      setLockupData([newLockup, ...lockupData]);
      setNotification(`✅ HQ General Total (${hqGrandTotalInput}) successfully posted!`);
      setShowHqGrandModal(false);
      setHqGrandTotalInput('');
      setTimeout(() => setNotification(null), 5000);
    } catch (err) {
      setNotification(`❌ Error: ${err.message}`);
    }
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem('kmp_authToken');
    if (!token) return setNotification("Error: Security token missing.");
    
    let formattedTime = formData.time || '';
    if (formattedTime && !/hrs$/i.test(formattedTime.trim())) formattedTime = `${formattedTime.trim()}Hrs`;

    const plainNarrative = extractPlainText(formData.narrative);
    const plainUpdateText = extractPlainText(formData.updateText);

    if (operation === 'new') {
      const final_reference = `${formData.ref_type} ${formData.ref_number.toUpperCase()}`.trim();
      const isDuplicate = reports.some(r => r.station === formData.station && ((r.sd_ref || r.sdRef || '').trim().toLowerCase() === final_reference.toLowerCase() || (r.narrative || '').trim().toLowerCase() === plainNarrative.toLowerCase()));
      if (isDuplicate) return setNotification(`Error: This specific ${formData.ref_type} entry or identical narrative already exists.`);

      const apiPayload = {
        sd_ref: final_reference, region: formData.region, station: formData.station,
        date: formData.date, time: formattedTime, offence: formData.offence === 'Other' ? formData.customOffence : formData.offence, 
        narrative: plainNarrative, status: formData.status, suspects: formData.suspectDetails.length, 
        last_updated_by: `${currentUser.name} (${currentUser.fnum})`, suspectDetails: formData.suspectDetails,
        daily_lock_up: 0 
      };
      
      try {
        const response = await authFetch(`/api/v1/reports`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(apiPayload) });
        const resData = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(resData.detail || "Database rejected the entry.");
        
        setReports([{ ...apiPayload, id: resData.id, sn: resData.sn }, ...reports]);
        setNotification(`✅ Case SN ${resData.sn} (Ref: ${apiPayload.sd_ref}) successfully registered!`);
        resetFormToBlank();
        setTimeout(() => setNotification(null), 5000);
      } catch (err) { setNotification(`❌ Error: ${err.message}`); }

    } else if (operation === 'update') {
      if (!formData.sn) return setNotification("Error: Please select a case first.");
      
      let updatedNarrative = plainUpdateText 
        ? `${plainNarrative}\n\n[UPDATE ${new Date().toLocaleString()}]:\n${plainUpdateText}` 
        : plainNarrative;
        
      const updatedRecord = { 
        ...formData, time: formattedTime, narrative: updatedNarrative, suspects: (formData.suspects || 0) + formData.suspectDetails.length,
        last_updated_by: `${currentUser.name} (${currentUser.fnum})`, daily_lock_up: 0
      };
      delete updatedRecord.updateText; delete updatedRecord.ref_type; delete updatedRecord.ref_number;
      
      try {
        const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
        const response = await fetch(`${API_URL}/api/v1/reports/${formData.sn}`, { method: "PUT", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }, body: JSON.stringify(updatedRecord) });
        if (!response.ok) throw new Error("Failed to update record in database.");

        setReports(reports.map(r => r.sn === formData.sn ? updatedRecord : r));
        setNotification(`✅ Case SN ${formData.sn} successfully updated!`);
        handleOperationToggle('new');
        setTimeout(() => setNotification(null), 5000);
      } catch (err) { setNotification("❌ Error: Could not update the record."); }
    }
  };
  
  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6 relative z-10">
      
      {showHqGrandModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[150] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-amber-300 animate-in zoom-in-95">
            <div className="bg-amber-600 text-white px-6 py-4 flex justify-between items-center">
              <h3 className="font-extrabold uppercase text-sm tracking-wider flex items-center"><Shield className="mr-2" size={18} /> Command Fallback: General Grand Total</h3>
              <button onClick={() => setShowHqGrandModal(false)} className="hover:bg-amber-700 p-1 rounded transition"><X size={18}/></button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-xs text-slate-600 leading-relaxed font-medium">Use this to log the combined national/regional general grand total if stations fail to submit their cell populations before the deadline.</p>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Enter Master Grand Total Suspects *</label>
                <input type="number" min="0" value={hqGrandTotalInput} onChange={(e) => setHqGrandTotalInput(e.target.value)} placeholder="e.g. 450" className="w-full text-lg font-black text-slate-900 border border-slate-300 rounded-lg p-3 outline-none focus:border-amber-600" />
              </div>
              <div className="flex justify-end space-x-3 pt-2">
                <button type="button" onClick={() => setShowHqGrandModal(false)} className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg font-bold text-xs">Cancel</button>
                <button type="button" onClick={handleHqGrandTotalSubmit} className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold text-xs uppercase shadow">Post Grand Total</button>
              </div>
            </div>
          </div>
        </div>
      )}

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
                    <input type="text" value={newSuspect.name} onChange={e => setNewSuspect({...newSuspect, name: e.target.value})} className="w-full text-sm border-gray-300 rounded border p-2 uppercase" placeholder="e.g. OPIO JOHN"/>
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
                    <label className="block text-xs font-bold text-gray-700 mb-1">Tribe</label>
                    <input type="text" value={newSuspect.tribe} onChange={e => setNewSuspect({...newSuspect, tribe: e.target.value})} className="w-full text-sm border-gray-300 rounded border p-2 uppercase" placeholder="e.g. ACHOLI"/>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Nationality</label>
                    <input type="text" value={newSuspect.nationality} onChange={e => setNewSuspect({...newSuspect, nationality: e.target.value})} className="w-full text-sm border-gray-300 rounded border p-2 uppercase" placeholder="e.g. UGANDAN"/>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Contact/Phone</label>
                    <input type="text" value={newSuspect.contact} onChange={e => setNewSuspect({...newSuspect, contact: e.target.value})} className="w-full text-sm border-gray-300 rounded border p-2"/>
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-gray-700 mb-1">Residence/Location</label>
                    <input type="text" value={newSuspect.residence} onChange={e => setNewSuspect({...newSuspect, residence: e.target.value})} className="w-full text-sm border-gray-300 rounded border p-2" placeholder="e.g. Bwaise Zone 2"/>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Mental Health Status</label>
                    <select value={newSuspect.mental_health_status} onChange={e => setNewSuspect({...newSuspect, mental_health_status: e.target.value})} className="w-full text-sm border-gray-300 rounded border p-2 bg-white font-bold text-slate-800">
                      <option value="NORMAL">NORMAL</option><option value="SUSPECTED PSYCHOLOGICAL CONDITION">SUSPECTED PSYCHOLOGICAL CONDITION</option><option value="UNSTABLE">UNSTABLE</option><option value="UNDER OBSERVATION">UNDER OBSERVATION</option>
                    </select>
                  </div>
                </div>
                <div className="md:col-span-3 bg-red-50 p-3 rounded-lg border border-red-100 mt-3">
                  <label className="block text-xs font-bold text-red-800 mb-2 flex items-center"><Camera size={12} className="mr-1"/> Suspect Mugshot (Optional)</label>
                  <div className="flex items-center space-x-4">
                    {newSuspect.photo_url ? ( <img src={newSuspect.photo_url} alt="Mugshot" className="w-12 h-12 rounded object-cover border-2 border-red-300 shadow-sm" /> ) : ( <div className="w-12 h-12 rounded bg-red-100 flex items-center justify-center text-red-300 border-2 border-dashed border-red-200 text-center p-1">No Photo</div> )}
                    <input type="file" accept="image/*" onChange={handleSuspectPhotoUpload} className="text-xs file:mr-4 file:py-1.5 file:px-4 file:rounded file:border-0 file:text-xs file:font-bold file:bg-red-600 file:text-white hover:file:bg-red-700 w-full cursor-pointer" />
                  </div>
                </div>
                <div className="flex justify-end mt-4">
                  <button type="button" onClick={handleAddSuspect} className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded text-sm transition-colors flex items-center"><PlusCircle size={16} className="mr-1"/> Add to Register</button>
                </div>
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-700 mb-3 border-b pb-2">Currently Logged Suspects ({formData.suspectDetails.length})</h4>
                {formData.suspectDetails.length === 0 ? (
                  <div className="text-center p-6 bg-white border border-dashed border-gray-300 rounded-lg text-gray-400 text-sm font-medium">No suspects added to this report yet.</div>
                ) : (
                  <div className="space-y-2">
                    {formData.suspectDetails.map((suspect, index) => (
                      <div key={suspect.id} className="bg-white border border-red-100 rounded-lg p-3 flex justify-between items-center shadow-sm">
                        <div>
                          <div className="font-bold text-slate-800 text-sm uppercase">{index + 1}. {suspect.name}</div>
                          <div className="text-xs text-slate-500 font-medium mt-1">{suspect.sex} • {suspect.age ? `${suspect.age}yrs` : 'Age Unknown'} • Tribe: {suspect.tribe || 'N/A'} • Nat: {suspect.nationality || 'N/A'} <br/>Res: {suspect.residence || 'N/A'} | Tel: {suspect.contact || 'N/A'}</div>
                        </div>
                        <button type="button" onClick={() => handleRemoveSuspect(suspect.id)} className="text-red-400 hover:text-red-600 hover:bg-red-50 p-2 rounded transition"><X size={18}/></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="bg-white p-4 border-t border-gray-200 flex justify-end shrink-0">
              <button type="button" onClick={() => setShowLockup(false)} className="bg-slate-900 hover:bg-slate-800 text-white font-bold py-2 px-6 rounded transition">Confirm & Return to Report</button>
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
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-2">
          <h4 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">
            📋 {filterRegion === 'ALL REGIONS' && filterStation === 'ALL STATIONS' ? 'Global Command Metrics' : filterStation === 'ALL STATIONS' ? 'Regional Command Metrics' : `${filterStation} Metrics`}
          </h4>
          <select value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className="border-2 border-blue-500 text-blue-700 font-bold rounded-lg px-3 py-1 text-xs shadow-sm bg-white outline-none cursor-pointer w-full sm:w-auto">
            <option value="ALL TIME">ALL TIME</option><option value="TODAY">TODAY ONLY</option><option value="LAST 7 DAYS">LAST 7 DAYS</option>
            <option value="LAST 30 DAYS">LAST 30 DAYS</option><option value="LAST 90 DAYS">LAST 90 DAYS</option><option value="LAST 120 DAYS">LAST 120 DAYS</option>
          </select>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
          <MetricCard title={filterRegion === 'ALL REGIONS' && filterStation === 'ALL STATIONS' ? "Computed Sum (All)" : filterStation === 'ALL STATIONS' ? `${filterRegion} Lock-up` : `${filterStation} Lock-up`} value={metrics.localLockup} colorClass="text-slate-800" />
          <MetricCard title="KMP Master Lock-up" value={metrics.kmpGeneralLockup} colorClass="text-amber-600" />
          <MetricCard title="Total Cases" value={metrics.newCases} colorClass="text-blue-700" />
          <MetricCard title="Suspects (Case)" value={metrics.totalSuspects} colorClass="text-red-600" />
          <MetricCard title="Active" value={metrics.active} colorClass="text-yellow-600" />
          <MetricCard title="Sanctioned" value={metrics.sanctioned} colorClass="text-purple-600" />
          <MetricCard title="Closed" value={metrics.closed} colorClass="text-green-600" />
          <MetricCard title="ADR Cases" value={metrics.adr} colorClass="text-orange-600" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="bg-slate-900 px-4 py-3 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-white font-semibold flex items-center"><Shield className="w-5 h-5 mr-2 text-blue-400" /> ⚙️ File Controls</h3>
            </div>
            
            <div className="p-5 space-y-6">
              <div className="flex space-x-2 bg-gray-100 p-1 rounded-lg">
                <button type="button" onClick={() => handleOperationToggle('new')} className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${operation === 'new' ? 'bg-white shadow text-blue-700' : 'text-gray-600 hover:text-gray-900'}`}><PlusCircle className="w-4 h-4 inline mr-1" /> Register New</button>
                <button type="button" onClick={() => handleOperationToggle('update')} className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${operation === 'update' ? 'bg-white shadow text-blue-700' : 'text-gray-600 hover:text-gray-900'}`}><Edit className="w-4 h-4 inline mr-1" /> Update Existing</button>
              </div>

              {notification && (
                <div className={`border px-4 py-3 rounded-lg flex items-center mb-4 ${notification.includes('Error') || notification.includes('❌') ? 'bg-red-50 border-red-200 text-red-800' : 'bg-green-50 border-green-200 text-green-800'}`}>
                  {notification.includes('Error') || notification.includes('❌') ? <AlertTriangle className="w-5 h-5 mr-2 text-red-500 min-w-[20px]" /> : <CheckCircle className="w-5 h-5 mr-2 text-green-500 min-w-[20px]" />}
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
                        <div key={c.id || c.sn} onClick={() => { populateUpdateCrimeForm(c); setUpdateSearch(c.sdRef || c.sd_ref || ''); }} className={`p-2 text-xs border-b cursor-pointer transition-colors ${formData.sn === (c.id || c.sn) ? 'bg-blue-600 text-white font-bold' : 'hover:bg-blue-50 text-gray-700'}`}>
                          <span className={formData.sn === (c.id || c.sn) ? 'text-blue-200' : 'text-gray-400'}>DB-ID: {c.id || c.sn}</span> | <span className={formData.sn === (c.id || c.sn) ? 'text-white' : 'font-bold text-blue-700'}>{c.sdRef || c.sd_ref}</span> | {c.station}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              <form onSubmit={handleFormSubmit} className="space-y-4">
                {operation === 'update' && formData.sn && <div className="bg-slate-800 text-white text-xs font-bold px-3 py-2 rounded">Currently Editing DB-ID: {formData.sn}</div>}
                
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
                    <select name="region" value={formData.region} onChange={handleInputChange} disabled={!isGlobalCommand || operation === 'update'} required className="w-full text-sm border-gray-300 rounded-md shadow-sm bg-gray-50 border p-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500">
                      {isGlobalCommand ? Object.keys(REGIONAL_HIERARCHY).map(reg => <option key={reg} value={reg}>{reg}</option>) : <option value={currentUser.region}>{currentUser.region}</option>}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Station *</label>
                    <select name="station" value={formData.station} onChange={handleInputChange} disabled={!isRegionalCommand || operation === 'update'} required className="w-full text-sm border-gray-300 rounded-md shadow-sm bg-gray-50 border p-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500">
                      {operation === 'update' ? <option value={formData.station}>{formData.station}</option> : isRegionalCommand ? (REGIONAL_HIERARCHY[formData.region] || []).map(stat => <option key={stat} value={stat}>{stat}</option>) : <option value={currentUser.station}>{currentUser.station}</option>}
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
                    <input type="text" name="customOffence" required value={formData.customOffence || ''} onChange={handleInputChange} placeholder="Type the specific offence here..." className="mt-2 w-full text-sm border-blue-400 rounded-md shadow-sm border p-2 focus:ring-blue-500 bg-blue-50 uppercase" />
                  )}
                </div>

                <div className="pb-8"> 
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    {operation === 'update' ? 'Original Incident Narrative (Read-Only)' : 'Incident Narrative *'}
                  </label>
                  <ReactQuill 
                    theme="snow" 
                    value={formData.narrative} 
                    onChange={(content) => setFormData(prev => ({ ...prev, narrative: content }))} 
                    onBlur={(prevSelection, source, editor) => setFormData(prev => ({ ...prev, narrative: autoCapitalize(editor.getHTML()) }))}
                    readOnly={operation === 'update'} 
                    className={`bg-white rounded-md [&_.ql-editor]:min-h-[100px] ${operation === 'update' ? 'opacity-70 grayscale pointer-events-none' : ''}`}
                    modules={{ toolbar: [['bold', 'italic', 'underline'], [{ 'list': 'ordered'}, { 'list': 'bullet' }], ['clean']] }} 
                  />
                </div>

                {operation === 'update' && (
                  <div className="pb-8 mt-4"> 
                    <label className="block text-xs font-bold text-blue-700 mb-1">Append New Update / Action Taken *</label>
                    <ReactQuill 
                      theme="snow" 
                      value={formData.updateText || ''} 
                      onChange={(content) => setFormData(prev => ({ ...prev, updateText: content }))} 
                      onBlur={(prevSelection, source, editor) => setFormData(prev => ({ ...prev, updateText: autoCapitalize(editor.getHTML()) }))}
                      className="bg-white rounded-md border-blue-300 [&_.ql-editor]:min-h-[100px]" 
                      placeholder="Enter new developments here. Use the toolbar for numbering..." 
                      modules={{ toolbar: [['bold', 'italic', 'underline'], [{ 'list': 'ordered'}, { 'list': 'bullet' }], ['clean']] }} 
                    />
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
                        <Users size={14} className="mr-2"/> Add Suspect Data
                      </button>
                    </div>
                  </div>
                </div>

                <button type="submit" className="w-full bg-blue-700 hover:bg-blue-800 text-white font-bold py-3 px-4 rounded-lg shadow transition-colors flex justify-center items-center mt-4">
                  {operation === 'new' ? '🚨 Submit New Case / Report' : '💾 Save Case Updates'}
                </button>
              </form>
            </div>
          </div>
        </div>

        <div className="lg:col-span-7 space-y-6">
          <div className="flex flex-col sm:flex-row gap-3 items-center">
             <div className="relative flex-1 w-full"> 
               <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
               <input type="text" placeholder="Search Reference, narrative or station..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-9 pr-4 py-2 border rounded-lg text-sm shadow-sm outline-none focus:border-blue-500 bg-white" />
             </div>

             {/* 🟢 AGRICULTURAL CRIMES TOGGLE FILTER BUTTON */}
             <button
               type="button"
               onClick={() => setShowAgriculturalOnly(prev => !prev)}
               className={`px-4 py-2 text-xs font-black rounded-lg border transition-all flex items-center whitespace-nowrap shadow-sm cursor-pointer ${
                 showAgriculturalOnly 
                   ? 'bg-emerald-700 text-white border-emerald-800 ring-2 ring-emerald-500/20' 
                   : 'bg-white text-emerald-800 border-emerald-300 hover:bg-emerald-50'
               }`}
             >
               <Sprout className="w-4 h-4 mr-1.5" />
               {showAgriculturalOnly ? 'Agri-Crimes Filter: ON' : 'Filter Agri-Crimes'}
             </button>

            <select value={filterRegion} onChange={(e) => { setFilterRegion(e.target.value); setFilterStation('ALL STATIONS'); }} disabled={!isGlobalCommand} className="border rounded-lg px-3 py-2 text-sm shadow-sm bg-white disabled:bg-gray-100 disabled:text-gray-500 w-full sm:w-auto outline-none focus:border-blue-500">
              {isGlobalCommand ? <><option value="ALL REGIONS">ALL REGIONS</option>{Object.keys(REGIONAL_HIERARCHY).map(reg => <option key={reg} value={reg}>{reg}</option>)}</> : <option value={currentUser?.region}>{currentUser?.region}</option>}
            </select>
            <select value={filterStation} onChange={(e) => setFilterStation(e.target.value)} disabled={!isRegionalCommand} className="border rounded-lg px-3 py-2 text-sm shadow-sm bg-white disabled:bg-gray-100 disabled:text-gray-500 w-full sm:w-auto outline-none focus:border-blue-500">
              {isRegionalCommand ? <><option value="ALL STATIONS">ALL STATIONS</option>{filterRegion !== 'ALL REGIONS' && REGIONAL_HIERARCHY[filterRegion] ? REGIONAL_HIERARCHY[filterRegion].map(stat => <option key={stat} value={stat}>{stat}</option>) : null}</> : <option value={currentUser?.station}>{currentUser?.station}</option>}
            </select>   
          </div>

          <ExpandableTableCard title="Crime/Incident Registry Ledger" onToggle={(expanded) => { if (typeof setSidebarOpen === 'function') setSidebarOpen(!expanded); }}>
            <div className="overflow-x-hidden overflow-y-auto w-full max-h-[70vh] custom-scrollbar">
              <table className="w-full divide-y divide-gray-200 table-fixed">
                <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider w-[5%]">SN</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider w-[15%]">REFERENCE</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider w-[12%]">Date & Time</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider w-[15%]">Region/Post</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider w-[35%]">Incident Narrative</th>
                    <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider w-[8%]">Suspects</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider w-[10%]">Status</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredReports.map((report, index) => (
                    <tr key={report.id || report.sn || index} className="even:bg-slate-50 hover:bg-blue-50 transition-colors cursor-pointer group" onClick={() => { if (operation === 'update') { populateUpdateCrimeForm(report); } else { setSelectedCase(report); } }}>
                      <td className="px-4 py-4 whitespace-nowrap text-[13px] font-black text-gray-900 align-top group-hover:text-blue-700 transition-colors">{isStationSpecific ? (index + 1) : (report.id || report.sn || '—')}</td>
                      <td className="px-4 py-4 whitespace-nowrap text-xs font-extrabold text-blue-700 align-top break-words">{report.sdRef || report.sd_ref}</td>
                      <td className="px-4 py-4 whitespace-nowrap text-xs text-gray-500 align-top">{report.date}<br/><span className="text-[10px] text-gray-400">{report.time}</span></td>
                      <td className="px-4 py-4 whitespace-nowrap text-xs text-gray-700 align-top font-bold">{report.station} <br/><span className="text-[10px] text-gray-400 font-medium">{report.region}</span></td>
                      <td className="px-4 py-4 text-xs text-gray-700 align-top whitespace-normal break-words">
                        {report.offence && <div className="font-extrabold text-red-600 uppercase mb-1">{report.offence}</div>}
                        <div className="ql-editor p-0 line-clamp-3 text-slate-600 [&_*]:!text-xs [&_*]:!bg-transparent" dangerouslySetInnerHTML={{ __html: report.narrative }} />
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-xs font-extrabold text-red-600 text-center align-top">{(report.suspectDetails || report.suspect_details || []).length}</td>
                      <td className="px-4 py-4 whitespace-normal break-words align-top">
                        <span className={`px-2 py-0.5 inline-flex text-[10px] font-bold rounded-full ${report.status.includes('ACTIVE') ? 'bg-yellow-100 text-yellow-800 border border-yellow-200' : ''} ${report.status.includes('COURT') ? 'bg-purple-100 text-purple-800 border border-purple-200' : ''} ${report.status.includes('CLOSED') ? 'bg-green-100 text-green-800 border border-green-200' : ''} ${report.status.includes('ADR') ? 'bg-orange-100 text-orange-800 border border-orange-200' : ''}`}>{report.status}</span>
                      </td>
                    </tr>
                  ))}
                  {filteredReports.length === 0 && <tr><td colSpan="7" className="text-center py-8 text-gray-500 font-medium text-sm border-b-0">No records found for this jurisdiction.</td></tr>}
                </tbody>
              </table>
            </div>
          </ExpandableTableCard>
        </div>
      </div>

      <div className="mt-8 space-y-6 animate-in fade-in duration-300 max-w-4xl mx-auto">
        
        {/* 🟢 FULL BREAKDOWN INPUTS FOR INDEPENDENT DAILY LOCK-UP */}
        <div className="bg-amber-50 p-6 rounded-2xl border border-amber-200 shadow-md space-y-4">
          <div>
            <h3 className="font-extrabold text-amber-900 uppercase tracking-wider text-sm flex items-center">
              <HardDrive className="w-5 h-5 mr-2 text-amber-600"/> Log Independent Daily Lock-Up
            </h3>
            <p className="text-[11px] font-bold text-amber-700/70 mt-1 leading-relaxed">
              Log your station's total cell population with the required Sex and Detention Duration breakdown directly into the independent Lock-Up Matrix.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-2">
            <div>
              <label className="block text-[10px] font-extrabold text-amber-900 uppercase mb-1">Total Suspects *</label>
              <input 
                type="number" 
                value={standalonePopInput.total} 
                onChange={(e) => setStandalonePopInput(prev => ({ ...prev, total: e.target.value }))} 
                min="0" 
                className="w-full text-base border-amber-300 rounded-lg shadow-sm border p-2.5 bg-white font-black text-amber-900 text-center outline-none focus:ring-2 focus:ring-amber-500" 
                placeholder="0" 
              />
            </div>
            <div>
              <label className="block text-[10px] font-extrabold text-blue-800 uppercase mb-1">Male Count *</label>
              <input 
                type="number" 
                value={standalonePopInput.male} 
                onChange={(e) => setStandalonePopInput(prev => ({ ...prev, male: e.target.value }))} 
                min="0" 
                className="w-full text-base border-blue-300 rounded-lg shadow-sm border p-2.5 bg-white font-black text-blue-900 text-center outline-none focus:ring-2 focus:ring-blue-500" 
                placeholder="0" 
              />
            </div>
            <div>
              <label className="block text-[10px] font-extrabold text-pink-800 uppercase mb-1">Female Count *</label>
              <input 
                type="number" 
                value={standalonePopInput.female} 
                onChange={(e) => setStandalonePopInput(prev => ({ ...prev, female: e.target.value }))} 
                min="0" 
                className="w-full text-base border-pink-300 rounded-lg shadow-sm border p-2.5 bg-white font-black text-pink-900 text-center outline-none focus:ring-2 focus:ring-pink-500" 
                placeholder="0" 
              />
            </div>
            <div>
              <label className="block text-[10px] font-extrabold text-slate-700 uppercase mb-1">1 Day *</label>
              <input 
                type="number" 
                value={standalonePopInput.d1} 
                onChange={(e) => setStandalonePopInput(prev => ({ ...prev, d1: e.target.value }))} 
                min="0" 
                className="w-full text-base border-slate-300 rounded-lg shadow-sm border p-2.5 bg-white font-black text-slate-900 text-center outline-none focus:ring-2 focus:ring-slate-500" 
                placeholder="0" 
              />
            </div>
            <div>
              <label className="block text-[10px] font-extrabold text-slate-700 uppercase mb-1">2 Days *</label>
              <input 
                type="number" 
                value={standalonePopInput.d2} 
                onChange={(e) => setStandalonePopInput(prev => ({ ...prev, d2: e.target.value }))} 
                min="0" 
                className="w-full text-base border-slate-300 rounded-lg shadow-sm border p-2.5 bg-white font-black text-slate-900 text-center outline-none focus:ring-2 focus:ring-slate-500" 
                placeholder="0" 
              />
            </div>
            <div>
              <label className="block text-[10px] font-extrabold text-slate-700 uppercase mb-1">3 Days & Over *</label>
              <input 
                type="number" 
                value={standalonePopInput.d3} 
                onChange={(e) => setStandalonePopInput(prev => ({ ...prev, d3: e.target.value }))} 
                min="0" 
                className="w-full text-base border-slate-300 rounded-lg shadow-sm border p-2.5 bg-white font-black text-slate-900 text-center outline-none focus:ring-2 focus:ring-slate-500" 
                placeholder="0" 
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row justify-between items-center gap-3 pt-2">
            <button 
              type="button"
              onClick={handleEditLockupToggle}
              className={`text-xs font-bold uppercase transition flex items-center ${isEditingLockup ? 'text-red-600 hover:text-red-800' : 'text-amber-700 hover:text-amber-900'}`}
            >
              {isEditingLockup ? <><X className="w-3.5 h-3.5 mr-1"/> Cancel Update</> : <><Edit className="w-3.5 h-3.5 mr-1"/> Correct today's lockup entry</>}
            </button>

            <button
              type="button"
              onClick={handleStandalonePopSubmit}
              className={`w-full sm:w-auto px-8 py-3 text-xs font-black text-white rounded-xl shadow-md transition-all uppercase tracking-wider ${isEditingLockup ? 'bg-blue-600 hover:bg-blue-700' : 'bg-amber-700 hover:bg-amber-800'}`}
            >
              {isEditingLockup ? <><Save className="inline w-4 h-4 mr-1"/> Update Matrix Entry</> : 'Push to Matrix'}
            </button>
          </div>
        </div>

        <button 
          onClick={() => setShowLockupMatrixModal(true)}
          className="w-full bg-slate-900 hover:bg-slate-800 text-white font-extrabold py-4 px-6 rounded-xl shadow-lg transition-all flex items-center justify-center border border-slate-700 group mb-6"
        >
          <Filter className="w-5 h-5 mr-3 text-amber-400 group-hover:scale-110 transition-transform" />
          VIEW INDEPENDENT DAILY SUSPECT LOCK-UP MATRIX
        </button>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
          <div className="bg-slate-900 px-4 py-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <h3 className="text-xs font-extrabold text-white tracking-wider uppercase">General Crime Summary (Excluding Lock-Ups)</h3>
            <div className="flex bg-slate-800 rounded-lg p-1 border border-slate-700 overflow-x-auto w-full sm:w-auto">
              {['TODAY', 'WEEK', 'MONTH', 'YEAR', 'ALL'].map(period => (
                <button key={period} onClick={() => setSummaryTimeFilter(period)} className={`flex-1 sm:flex-none px-3 py-1 text-[10px] font-bold rounded shadow-sm transition-colors ${summaryTimeFilter === period ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-700'}`}>
                  {period}
                </button>
              ))}
            </div>
          </div>
          
          <div className="overflow-y-auto max-h-96 custom-scrollbar">
            <table className="w-full text-left">
              <thead className="bg-slate-50 sticky top-0 border-b border-slate-200 shadow-sm z-10">
                <tr>
                  <th className="px-4 py-2 text-[10px] font-extrabold text-slate-500 uppercase">S/N</th>
                  <th className="px-4 py-2 text-[10px] font-extrabold text-slate-500 uppercase">Offence / Incident</th>
                  <th className="px-4 py-2 text-[10px] font-extrabold text-slate-500 uppercase text-center">Number of Cases</th>
                  <th className="px-4 py-2 text-[10px] font-extrabold text-slate-500 uppercase text-center">Suspects in Custody</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {generalCrimes.length > 0 ? (
                  generalCrimes.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 text-xs font-bold text-slate-400">{idx + 1}</td>
                      <td className="px-4 py-3 text-xs font-bold text-slate-800 uppercase">{item.offence}</td>
                      <td className="px-4 py-3 text-xs font-black text-blue-600 text-center">{item.cases}</td>
                      <td className="px-4 py-3 text-xs font-black text-slate-600 text-center">{item.suspects}</td>
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan="4" className="px-4 py-8 text-center text-xs text-slate-500 font-bold">No crimes recorded for the selected duration.</td></tr>
                )}
              </tbody>
              <tfoot className="bg-emerald-800 sticky bottom-0">
                <tr>
                  <td colSpan="2" className="px-4 py-3 text-right text-xs font-black text-white uppercase tracking-wider">Crime Grand Total:</td>
                  <td className="px-4 py-3 text-center text-sm font-black text-white">{crimeGrandTotal}</td>
                  <td className="px-4 py-3 text-center text-sm font-black text-white">{suspectGrandTotal}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>

      {showLockupMatrixModal && (
        <LockupMatrixLedger lockupEntries={processedLockups} allTimeLockupTotal={allTimeLockupTotal} onClose={() => setShowLockupMatrixModal(false)} />
      )}

      {selectedCase && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 sm:p-6 animate-in fade-in zoom-in-95 duration-200">
          <div className="bg-white shadow-2xl max-w-4xl w-full flex flex-col max-h-[95vh] rounded-xl overflow-hidden border border-slate-300">
            <div className="bg-slate-900 text-white px-6 py-4 flex justify-between items-center shrink-0 shadow-md z-10">
              <h3 className="font-bold flex items-center text-sm uppercase tracking-wider"><Shield className="text-blue-400 mr-2" size={18} /> OFFICIAL CRIME DOSSIER — REF: {selectedCase.sdRef || selectedCase.sd_ref}</h3>
              <button onClick={() => setSelectedCase(null)} className="text-slate-400 hover:text-white hover:bg-slate-700 p-1.5 rounded transition-colors"><X size={20} /></button>
            </div>
            <div className="p-8 overflow-y-auto space-y-8 flex-1 custom-scrollbar bg-slate-50" style={{ backgroundImage: 'radial-gradient(#e5e7eb 1px, transparent 1px)', backgroundSize: '20px 20px' }}>
              <div className="flex flex-col items-center justify-center text-center border-b-2 border-slate-800 pb-6">
                 <img src="/upf_badge.png" alt="UPF Logo" className="w-16 h-16 mb-2 object-contain grayscale contrast-200 brightness-50" onError={(e) => { e.target.style.display = 'none'; }} />
                 <h2 className="text-xl font-extrabold text-slate-900 tracking-widest uppercase">Uganda Police Force</h2>
                 <h3 className="text-sm font-bold text-slate-600 uppercase mt-1 tracking-wider">Crime Incident Matrix Profile</h3>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6 bg-white p-6 border border-slate-200 shadow-sm rounded-lg">
                <div className="border-l-4 border-blue-600 pl-3"><div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1">Database SN (ID)</div><div className="text-sm font-black text-slate-900">{selectedCase.id || selectedCase.sn}</div></div>
                <div className="border-l-4 border-slate-600 pl-3"><div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1">Time & Date Logged</div><div className="text-sm font-bold text-slate-900">{selectedCase.date} <span className="text-slate-500 font-medium">@ {selectedCase.time}</span></div></div>
                <div className="border-l-4 border-slate-600 pl-3"><div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1">Command Jurisdiction</div><div className="text-sm font-bold text-slate-900">{selectedCase.station}</div><div className="text-xs text-slate-500 font-medium">{selectedCase.region}</div></div>
                <div className="border-l-4 border-slate-600 pl-3"><div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1">Investigation Status</div><div className="text-sm font-extrabold text-blue-700 uppercase">{selectedCase.status}</div></div>
              </div>
              <div className="bg-white p-8 border border-slate-200 shadow-sm rounded-lg">
                <div className="mb-6">
                  <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2 mb-3">Primary Offence Matrix</div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="text-lg font-black text-red-600 uppercase">{selectedCase.offence || 'UNSPECIFIED OFFENCE'}</div>
                    <div className="text-sm font-bold text-slate-700 bg-slate-100 px-3 py-1.5 rounded-md border border-slate-200 shadow-sm">REF: {selectedCase.sdRef || selectedCase.sd_ref}</div>
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2 mb-3">Official Incident Narrative</div>
                  <div className="text-sm text-slate-800 leading-normal ql-editor whitespace-normal break-words p-0 min-h-[150px]" dangerouslySetInnerHTML={{ __html: selectedCase.narrative }} />
                </div>
              </div>
              {selectedCase.suspectDetails && selectedCase.suspectDetails.length > 0 && (
                <div className="bg-white p-6 border border-red-200 shadow-sm rounded-lg">
                  <div className="text-[10px] font-extrabold text-red-800 uppercase tracking-widest border-b border-red-100 pb-2 mb-4 flex items-center"><Lock size={14} className="mr-2"/> Suspects Registered in Custody ({selectedCase.suspectDetails.length})</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {selectedCase.suspectDetails.map((s, idx) => (
                      <div key={idx} className="bg-red-50 p-4 rounded-lg border border-red-200 flex items-start space-x-4">
                        <div className="shrink-0">{s.photo_url ? ( <img src={s.photo_url} alt={s.name} className="w-16 h-16 rounded object-cover border-2 border-red-300 shadow-sm" onError={(e) => { e.target.style.display = 'none'; }} /> ) : ( <div className="w-16 h-16 rounded bg-red-100 text-red-400 flex items-center justify-center font-bold text-[10px] border-2 border-dashed border-red-200 text-center p-1">No Photo</div> )}</div>
                        <div className="flex-1 min-w-0">
                          <div className="font-extrabold uppercase text-slate-900 text-sm truncate">{idx + 1}. {s.name}</div>
                          <div className="text-xs text-red-900 font-medium mt-1">{s.sex} • {s.age ? `${s.age} Yrs` : 'Age Unk'} • Tribe: {s.tribe || 'N/A'} • Nat: {s.nationality || 'N/A'}</div>
                          <div className="text-xs text-slate-700 mt-1"><span className="font-bold">Res:</span> {s.residence || 'N/A'} <br/><span className="font-bold">Tel:</span> {s.contact || 'N/A'}</div>
                          {s.mental_health_status && s.mental_health_status !== 'NORMAL' && ( <div className="inline-block mt-2 text-[10px] bg-amber-100 text-amber-800 border border-amber-300 font-bold px-2 py-0.5 rounded-sm">Status: {s.mental_health_status}</div> )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="text-center pt-6 opacity-40"><p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">End of Official Record Extract</p><p className="text-[9px] text-slate-400 mt-1">System Audit ID: {selectedCase.id || selectedCase.sn} • Printed: {new Date().toLocaleString()}</p></div>
            </div>
            <div className="bg-slate-100 p-4 border-t border-slate-300 flex justify-end shrink-0 shadow-inner z-10">
              <button onClick={() => setSelectedCase(null)} className="bg-slate-900 hover:bg-slate-800 text-white font-bold py-2.5 px-6 rounded-lg text-sm transition-all shadow border border-slate-950 flex items-center"><X size={16} className="mr-2"/> Close Dossier</button>
            </div>
          </div>
        </div>
      )}
    </div>  
  );
};

export default CrimeIncidentRegistry;