// src/components/LockupMatrixLedger.jsx
import React, { useState, useMemo, useEffect } from 'react';
import { ChevronDown, ChevronUp, Calendar, Search, Filter, PlusCircle, AlertTriangle, CheckCircle, TrendingUp, TrendingDown, Minus, Shield, Users, Save, HardDrive, Edit, X } from 'lucide-react';
import { authFetch } from './api';
import { stripHtmlTags } from './App';

const REGIONAL_HIERARCHY = {
  "KMP NORTH": ["KMP NORTH HEADQUARTERS", "KAWEMPE", "KAKIRI", "KASANGATI", "MATUGGA", "NANSANA", "OLD KAMPALA", "WAKISO", "WANDEGEYA"],
  "KMP EAST": ["KMP EAST HEADQUARTERS", "JINJA ROAD", "KIRA", "KIRA DIV", "KIRA ROAD", "MUKONO", "NAGGALAMA", "SEETA"],
  "KMP SOUTH": ["KMP SOUTH HEADQUARTERS", "NATEETE", "CPS KAMPALA", "PARLIAMENT", "ENTEBBE", "KABALAGALA", "KAJJANSI", "KASENYI", "KATWE", "KYENGERA", "NSANGI"],
  "KMP HEADQUARTERS": ["KMP HEADQUARTERS", "KMP CID", "KMP TRAFFIC", "KMP ICT", "KMP FLYING SQUAD", "KMP CRIME INTELLIGENCE"],
  "POLICE HEADQUARTERS": ["NAGURU", "OPERATIONS", "CRIME INTELLIGENCE", "CID", "LOGISTICS & ENGINEERING", "ICT", "CT", "FIRE & RESCUE"]
};

const formatOfficerDisplay = (rawSignature) => {
  if (!rawSignature) return 'SYSTEM RECORD';
  return stripHtmlTags(rawSignature);
};

const getOfficialRegionForStation = (stationName, dbRegion) => {
  const cleanStation = stripHtmlTags(stationName || '').trim().toUpperCase();
  const cleanDbRegion = stripHtmlTags(dbRegion || '').trim().toUpperCase();

  if (REGIONAL_HIERARCHY[cleanDbRegion] && REGIONAL_HIERARCHY[cleanDbRegion].includes(cleanStation)) {
    return cleanDbRegion;
  }
  for (const [regionName, stationsList] of Object.entries(REGIONAL_HIERARCHY)) {
    if (stationsList.includes(cleanStation)) return regionName;
  }
  return cleanDbRegion || 'KMP GENERAL';
};

const getTodayString = () => {
  const tzOffset = new Date().getTimezoneOffset() * 60000; 
  const localDate = new Date(Date.now() - tzOffset);
  return localDate.toISOString().split('T')[0];
};

const getYesterdayString = () => {
  const tzOffset = new Date().getTimezoneOffset() * 60000; 
  const localDate = new Date(Date.now() - 86400000 - tzOffset);
  return localDate.toISOString().split('T')[0];
};

const LockupMatrixLedger = ({ lockupEntries, allTimeLockupTotal, onClose, selectedRegion, selectedStation, currentUser, onRefreshData }) => {
  const [activeTab, setActiveTab] = useState('LOG_FORM'); 
  const [notification, setNotification] = useState(null);
  
  // Matrix Ledger States
  const [lockupFilter, setLockupFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [ledgerViewType, setLedgerViewType] = useState('STATIONS'); // 'STATIONS' or 'MASTER'
  
  const userRole = stripHtmlTags(currentUser?.role || '').toUpperCase();
  const userPos = stripHtmlTags(currentUser?.position || '').toUpperCase();
  const userRegClean = stripHtmlTags(currentUser?.region || '').toUpperCase();
  const userStnClean = stripHtmlTags(currentUser?.station || '').toUpperCase();

  // 🟢 Commander KMP Office / Super Admin Strict Checking
  const validMasterPositions = ['KMP COMMANDER', 'KMP COMD', 'KMP COMDR', 'COMMANDER KMP', 'COMD KMP', 'COMDR KMP', 'DEPUTY KMP COMMANDER', 'DEPUTY KMP COMD', 'DEPUTY KMP COMDR', 'DEPUTY COMMANDER KMP', 'DEPUTY COMD KMP', 'DEPUTY COMDR KMP', 'KMP ADMIN OFFICER', 'KMP ADMIN', 'ADMIN. KMP', 'ADMIN'];
  const canManageMasterLockup = ['SUPER_ADMIN', 'ASSISTANT_SUPER_ADMIN', 'ADMIN'].includes(userRole) || validMasterPositions.some(p => userPos.includes(p) || userRole === p);

  // Clearance Tiers matching Admin Approvals standards
  const isAbsoluteGlobal = ['SUPER_ADMIN', 'ADMIN', 'ASSISTANT_SUPER_ADMIN'].includes(userRole) || 
                          currentUser?.permissions?.view_global_roster === true ||
                          ['KMP HEADQUARTERS', 'POLICE HEADQUARTERS'].includes(userRegClean);

  const isRegionalCommandTier = ['RPC', 'DEPUTY_RPC', 'RPC KMP', 'DEPUTY COMMANDER', 'REGIONAL_ADMIN'].includes(userRole) || 
                              userPos.includes('RPC') || 
                              userPos.includes('DEPUTY COMMANDER');

  // Strict jurisdiction locking
  const initialRegion = isAbsoluteGlobal ? (selectedRegion || 'ALL REGIONS') : userRegClean;
  const initialStation = isAbsoluteGlobal ? (selectedStation || 'ALL STATIONS') : (isRegionalCommandTier ? 'ALL STATIONS' : userStnClean);

  const [ledgerFilterRegion, setLedgerFilterRegion] = useState(initialRegion);
  const [ledgerFilterStation, setLedgerFilterStation] = useState(initialStation);
  
  // Real Suspect Register States
  const [suspectRecords, setSuspectRecords] = useState([]);
  const [suspectSearchQuery, setSuspectSearchQuery] = useState('');
  const [registerFilterRegion, setRegisterFilterRegion] = useState(initialRegion);
  const [registerFilterStation, setRegisterFilterStation] = useState(initialStation);

  // Backend Summary State
  const [stationSummary, setStationSummary] = useState({ todaysTotal: null, lastLoggedDate: 'Never', lastLoggedSuspects: 0 });

  // Form Inputs initialized to user's assigned station/region
  const [matrixOperation, setMatrixOperation] = useState('new');
  const [formInput, setFormInput] = useState({
    sn: null,
    station: stripHtmlTags(currentUser?.station || 'CPS KAMPALA'),
    region: stripHtmlTags(currentUser?.region || 'KMP SOUTH'),
    date: getTodayString(),
    time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }).replace(':', '') + 'Hrs',
    suspects: '', male_count: '', male_juvenile_count: '', female_count: '', female_juvenile_count: '',
    detention_1day: '', detention_2days: '', detention_3days_over: ''
  });

  const [registerOperation, setRegisterOperation] = useState('new');
  const [suspectFormInput, setSuspectFormInput] = useState({
    id: null,
    name: '', sex: 'MALE', age: '', tribe: '', nationality: 'UGANDAN', residence: '',
    contact: '', next_of_kin: '', reason_for_detention: '', reference: '',
    date_in: getTodayString(), date_out: '', status: 'IN CUSTODY',
    station: stripHtmlTags(currentUser?.station || ''),
    region: stripHtmlTags(currentUser?.region || '')
  });

  // 🟢 Helper to dynamically inject KMP Master Lockup into station dropdown if clearance allows
  const getDropdownStations = (region) => {
    const base = REGIONAL_HIERARCHY[region] || [];
    if (region === 'KMP HEADQUARTERS' && canManageMasterLockup) {
      if (!base.includes('HEADQUARTERS GENERAL TOTAL')) {
        return ['HEADQUARTERS GENERAL TOTAL', ...base];
      }
    }
    return base;
  };

  useEffect(() => {
    const fetchStationSummary = async () => {
      try {
        const activeStn = ledgerFilterStation !== 'ALL STATIONS' ? ledgerFilterStation : (currentUser?.station || '');
        const res = await authFetch(`/api/v1/lockup-matrix/station-summary?station=${encodeURIComponent(activeStn)}`);
        if (res.ok) {
          const data = await res.json();
          setStationSummary({
            todaysTotal: data.todays_total,
            lastLoggedDate: data.last_logged_date,
            lastLoggedSuspects: data.last_logged_suspects
          });
        }
      } catch (err) {
        console.error("Failed to fetch station summary:", err);
      }
    };
    fetchStationSummary();
  }, [ledgerFilterStation, currentUser?.station]);

  useEffect(() => {
    if (activeTab === 'SUSPECT_REGISTER') fetchSuspectRegister();
  }, [activeTab, registerFilterRegion, registerFilterStation, suspectSearchQuery]);

  const fetchSuspectRegister = async () => {
    try {
      const params = new URLSearchParams();
      if (!isAbsoluteGlobal && registerFilterRegion !== 'ALL REGIONS') params.append('region', registerFilterRegion);
      if (registerFilterStation !== 'ALL STATIONS') params.append('station', registerFilterStation);
      if (suspectSearchQuery) params.append('search', suspectSearchQuery);
      
      const res = await authFetch(`/api/v1/suspect-register?${params.toString()}`);
      if (res.ok) setSuspectRecords(await res.json());
    } catch (err) {
      console.error("Failed to load suspect register", err);
    }
  };

  const handleMatrixFormSubmit = async (e) => {
    e.preventDefault();
    setNotification({ type: 'info', text: "⏳ Processing Census..." });

    const totalVal = parseInt(formInput.suspects) || 0;
    const cleanStationSub = stripHtmlTags(formInput.station).substring(0, 3).toUpperCase();
    const popRef = `POP-${cleanStationSub}-${Date.now().toString().slice(-6)}`;

    const submissionRegion = isAbsoluteGlobal ? formInput.region : userRegClean;
    const submissionStation = (isAbsoluteGlobal || isRegionalCommandTier) ? formInput.station : userStnClean;

    const payload = {
      ...formInput,
      sd_ref: popRef,
      region: stripHtmlTags(submissionRegion).toUpperCase(),
      station: stripHtmlTags(submissionStation).toUpperCase(),
      suspects: totalVal,
      male_count: parseInt(formInput.male_count) || 0,
      male_juvenile_count: parseInt(formInput.male_juvenile_count) || 0,
      female_count: parseInt(formInput.female_count) || 0,
      female_juvenile_count: parseInt(formInput.female_juvenile_count) || 0,
      detention_1day: parseInt(formInput.detention_1day) || 0,
      detention_2days: parseInt(formInput.detention_2days) || 0,
      detention_3days_over: parseInt(formInput.detention_3days_over) || 0
    };

    try {
      const endpoint = matrixOperation === 'update' && formInput.sn ? `/api/v1/lockup-matrix/${formInput.sn}` : '/api/v1/lockup-matrix';
      const method = matrixOperation === 'update' && formInput.sn ? 'PUT' : 'POST';
      
      const response = await authFetch(endpoint, {
        method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || "Database rejected cell population entry.");
      }

      setNotification({ type: 'success', text: "✅ Daily Cell Census successfully saved!" });
      if (onRefreshData) onRefreshData();
      
      setTimeout(() => {
        setNotification(null);
        setMatrixOperation('new');
        setFormInput(prev => ({ ...prev, sn: null }));
        setActiveTab('LEDGER');
      }, 1500);
    } catch (err) {
      setNotification({ type: 'error', text: `❌ ${err.message}` });
    }
  };

  const handleSuspectFormSubmit = async (e) => {
    e.preventDefault();
    setNotification({ type: 'info', text: "⏳ Saving suspect record..." });

    const submissionStation = (isAbsoluteGlobal || isRegionalCommandTier) ? suspectFormInput.station : userStnClean;
    const submissionRegion = isAbsoluteGlobal ? suspectFormInput.region : userRegClean;

    const finalSuspectPayload = {
      ...suspectFormInput,
      station: stripHtmlTags(submissionStation),
      region: stripHtmlTags(submissionRegion)
    };

    try {
      const endpoint = registerOperation === 'update' && suspectFormInput.id ? `/api/v1/suspect-register/${suspectFormInput.id}` : '/api/v1/suspect-register';
      const method = registerOperation === 'update' && suspectFormInput.id ? 'PUT' : 'POST';
      
      const response = await authFetch(endpoint, {
        method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(finalSuspectPayload)
      });
      
      if (!response.ok) throw new Error("Failed to save suspect record.");

      setNotification({ type: 'success', text: "✅ Suspect securely logged into registry!" });
      fetchSuspectRegister();
      
      setTimeout(() => {
        setNotification(null);
        setRegisterOperation('new');
        setSuspectFormInput({
          id: null, name: '', sex: 'MALE', age: '', tribe: '', nationality: 'UGANDAN', residence: '',
          contact: '', next_of_kin: '', reason_for_detention: '', reference: '',
          date_in: getTodayString(), date_out: '', status: 'IN CUSTODY',
          station: userStnClean, region: userRegClean
        });
      }, 1500);
    } catch (err) {
      setNotification({ type: 'error', text: `❌ ${err.message}` });
    }
  };

  const populateMatrixEdit = (record) => {
    setMatrixOperation('update');
    setFormInput({
      ...record,
      suspects: record.suspects || 0,
      male_count: record.male_count || record.male || 0,
      male_juvenile_count: record.male_juvenile_count || record.male_juvenile || 0,
      female_count: record.female_count || record.female || 0,
      female_juvenile_count: record.female_juvenile_count || record.female_juvenile || 0
    });
    setActiveTab('LOG_FORM');
  };

  const populateSuspectEdit = (record) => {
    setRegisterOperation('update');
    setSuspectFormInput({ ...record, id: record.id || record.sn });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleExportSuspectRegister = async () => {
    if (!suspectRecords.length) return alert("No records available to export.");
    setNotification({ type: 'info', text: "⏳ Generating official CSV export..." });
    
    try {
      const params = new URLSearchParams();
      if (!isAbsoluteGlobal && registerFilterRegion !== 'ALL REGIONS') params.append('region', registerFilterRegion);
      if (registerFilterStation !== 'ALL STATIONS') params.append('station', registerFilterStation);

      const response = await authFetch(`/api/v1/suspect-register/export?${params.toString()}`);
      if (!response.ok) throw new Error("Export failed on server.");

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `KMP_SUSPECT_REGISTER_${getTodayString()}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setNotification(null);
    } catch (err) {
      setNotification({ type: 'error', text: "❌ Failed to export CSV." });
    }
  };

  const filteredLockupEntries = useMemo(() => {
    let filtered = Array.isArray(lockupEntries) ? [...lockupEntries] : [];

    // 🟢 View Type Logic: Separate KMP Master General Logs vs Standard Station Logs
    if (ledgerViewType === 'MASTER') {
      filtered = filtered.filter(row => stripHtmlTags(row.station || '').trim().toUpperCase() === 'HEADQUARTERS GENERAL TOTAL');
    } else {
      filtered = filtered.filter(row => stripHtmlTags(row.station || '').trim().toUpperCase() !== 'HEADQUARTERS GENERAL TOTAL');
      
      // Enforce strict jurisdiction bounds for non-globals on Station Logs
      filtered = filtered.filter(row => {
        const stn = stripHtmlTags(row.station || '').trim().toUpperCase();
        const reg = getOfficialRegionForStation(stn, row.region);

        if (!isAbsoluteGlobal && !isRegionalCommandTier) {
          if (!isStationEquivalent(stn, userStnClean)) return false;
        } else if (ledgerFilterRegion && ledgerFilterRegion !== 'ALL REGIONS') {
          const cleanTargetRegion = ledgerFilterRegion.trim().toUpperCase();
          const belongsToRegion = reg === cleanTargetRegion || (REGIONAL_HIERARCHY[cleanTargetRegion] && REGIONAL_HIERARCHY[cleanTargetRegion].includes(stn));
          if (!belongsToRegion) return false;
        }

        if (ledgerFilterStation && ledgerFilterStation !== 'ALL STATIONS') {
          if (!isStationEquivalent(stn, ledgerFilterStation)) return false;
        }
        return true;
      });
    }

    if (searchQuery.trim()) {
      const query = searchQuery.trim().toUpperCase();
      filtered = filtered.filter(row => {
        const stn = stripHtmlTags(row.station || '').trim().toUpperCase();
        const reg = getOfficialRegionForStation(stn, row.region);
        return stn.includes(query) || reg.includes(query) || stripHtmlTags(row.last_updated_by || '').toUpperCase().includes(query) || stripHtmlTags(row.date || '').includes(query);
      });
    }

    // Dynamic Date Filtering (Applies strictly to Master General Logs AND Station Logs)
    if (lockupFilter !== 'ALL') {
      const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000);
      const todayStr = today.toISOString().split('T')[0];
      const getPastDate = (days) => { const d = new Date(today); d.setDate(d.getDate() - days); return d.toISOString().split('T')[0]; };

      filtered = filtered.filter(row => {
        if (!row.date) return false;
        if (lockupFilter === 'TODAY') return row.date >= todayStr;
        if (lockupFilter === 'WEEK') return row.date >= getPastDate(7);
        if (lockupFilter === 'MONTH') return row.date >= getPastDate(30);
        if (lockupFilter === 'YEAR') return row.date >= getPastDate(365);
        return true;
      });
    }

    filtered.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

    return filtered.map((log, index, arr) => {
      if (index === arr.length - 1) return { ...log, variation: 0, hasPrev: false, marginStr: '0' };
      const diff = Number(log?.suspects || 0) - Number(arr[index + 1]?.suspects || 0);
      return { ...log, variation: diff, marginStr: diff > 0 ? `+${diff}` : `${diff}`, hasPrev: true };
    });
  }, [lockupEntries, lockupFilter, ledgerFilterRegion, ledgerFilterStation, searchQuery, isAbsoluteGlobal, isRegionalCommandTier, userStnClean, ledgerViewType]);

  const totals = useMemo(() => {
    return filteredLockupEntries.reduce((acc, row) => {
      acc.suspects += Number(row.suspects || 0);
      acc.male += Number(row.male_count || row.male || 0);
      acc.male_juvenile += Number(row.male_juvenile_count || row.male_juvenile || 0);
      acc.female += Number(row.female_count || row.female || 0);
      acc.female_juvenile += Number(row.female_juvenile_count || row.female_juvenile || 0);
      acc.d1 += Number(row.detention_1day || 0);
      acc.d2 += Number(row.detention_2days || 0);
      acc.d3 += Number(row.detention_3days_over || 0);
      return acc;
    }, { suspects: 0, male: 0, male_juvenile: 0, female: 0, female_juvenile: 0, d1: 0, d2: 0, d3: 0 });
  }, [filteredLockupEntries]);

  const headerBgClass = activeTab === 'LOG_FORM' ? 'bg-emerald-800' : activeTab === 'LEDGER' ? 'bg-amber-800' : 'bg-blue-800';
  const innerNavBg = activeTab === 'LOG_FORM' ? 'bg-emerald-900 border-emerald-700' : activeTab === 'LEDGER' ? 'bg-amber-900 border-amber-700' : 'bg-blue-900 border-blue-700';

  const getBtnClass = (tabId, baseColor) => {
    return `px-3 py-1.5 text-[10px] font-extrabold uppercase rounded transition flex items-center cursor-pointer ${
      activeTab === tabId ? `bg-${baseColor}-500 text-${baseColor}-950 shadow` : `text-${baseColor}-200 hover:text-white`
    }`;
  };

  const todayStr = getTodayString();
  const yesterdayStr = getYesterdayString();

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[99999] flex items-center justify-center p-2 sm:p-4 animate-in fade-in zoom-in-95 duration-200">
      <div className="bg-white dark:bg-slate-900 shadow-2xl max-w-[95vw] w-full flex flex-col max-h-[95vh] rounded-xl overflow-hidden border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-slate-100">
        
        {/* DYNAMIC HEADER */}
        <div className={`${headerBgClass} px-6 py-4 flex flex-col sm:flex-row justify-between items-start sm:items-center shrink-0 shadow-md z-10 gap-3 transition-colors duration-300`}>
          <div>
            <h3 className="text-xs sm:text-sm font-extrabold text-white tracking-wider uppercase flex items-center">
              <Shield className="w-4 h-4 mr-2" />
              {activeTab === 'LOG_FORM' ? 'Daily Cell Census Entry' : activeTab === 'LEDGER' ? 'Suspect Lock-Up Matrix Ledger' : 'Detailed Suspect Register'}
            </h3>
            {/* Backend-Powered Header Data */}
            <div className="flex flex-wrap gap-3 mt-1">
              <span className="text-[10px] text-white/80 font-bold bg-black/20 px-2 py-0.5 rounded">
                Today's Log: <span className={stationSummary.todaysTotal !== null ? "text-green-300" : "text-red-300"}>{stationSummary.todaysTotal !== null ? stationSummary.todaysTotal : 'MISSING'}</span>
              </span>
              <span className="text-[10px] text-white/80 font-bold bg-black/20 px-2 py-0.5 rounded">
                Last Logged Date: <span className="text-amber-300">{stationSummary.lastLoggedDate}</span>
              </span>
              <span className="text-[10px] text-white/80 font-bold bg-black/20 px-2 py-0.5 rounded">
                Number Last Logged: <span className="text-emerald-300">{stationSummary.lastLoggedSuspects} Suspects</span>
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className={`flex ${innerNavBg} rounded-lg p-0.5 border shadow-inner`}>
              <button onClick={() => setActiveTab('LOG_FORM')} className={getBtnClass('LOG_FORM', 'emerald')}>
                <PlusCircle className="w-3 h-3 mr-1" /> Log Census
              </button>
              <button onClick={() => setActiveTab('LEDGER')} className={getBtnClass('LEDGER', 'amber')}>
                Matrix Ledger
              </button>
              <button onClick={() => setActiveTab('SUSPECT_REGISTER')} className={getBtnClass('SUSPECT_REGISTER', 'blue')}>
                <Users className="w-3 h-3 mr-1" /> Suspect Register
              </button>
            </div>
            <button onClick={onClose} className="text-white/80 hover:text-white p-1.5 rounded transition-colors cursor-pointer bg-black/20 hover:bg-black/40">
              <X size={18} />
            </button>
          </div>
        </div>

        {notification && (
          <div className={`mx-6 mt-3 p-3 rounded-lg border text-xs flex items-center shrink-0 ${notification.type === 'error' ? 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900 text-red-800 dark:text-red-300' : notification.type === 'success' ? 'bg-green-50 dark:bg-green-950/40 border-green-200 dark:border-green-900 text-green-800 dark:text-green-300' : 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-900 text-blue-800 dark:text-blue-300'}`}>
            {notification.type === 'error' ? <AlertTriangle className="w-4 h-4 mr-2 shrink-0" /> : notification.type === 'success' ? <CheckCircle className="w-4 h-4 mr-2 shrink-0" /> : <Shield className="w-4 h-4 mr-2 shrink-0" />}
            <span className="font-bold">{notification.text}</span>
          </div>
        )}

        {/* 1. CENSUS SUBMISSION FORM */}
        {activeTab === 'LOG_FORM' && (
          <div className="p-6 overflow-y-auto flex-1 bg-slate-50 dark:bg-slate-950 max-w-3xl mx-auto w-full custom-scrollbar">
            <h4 className="text-sm font-black text-slate-800 dark:text-slate-100 uppercase mb-4 pb-2 border-b border-slate-200 dark:border-slate-800 flex items-center">
              <PlusCircle className="w-4 h-4 mr-2 text-emerald-600 dark:text-emerald-400" /> {matrixOperation === 'update' ? `Editing Census for ${formInput.date}` : 'Log Station Daily Cell Census'}
            </h4>
            <form onSubmit={handleMatrixFormSubmit} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Region *</label>
                  <select 
                    value={isAbsoluteGlobal ? formInput.region : userRegClean} 
                    onChange={e => isAbsoluteGlobal && setFormInput({...formInput, region: e.target.value, station: getDropdownStations(e.target.value)[0] || ''})} 
                    required 
                    disabled={!isAbsoluteGlobal} 
                    className="w-full p-2.5 border border-slate-300 dark:border-slate-700 rounded uppercase bg-white dark:bg-slate-900 font-bold text-slate-800 dark:text-slate-200 outline-none disabled:opacity-90 disabled:cursor-not-allowed"
                  >
                    {isAbsoluteGlobal ? (
                      Object.keys(REGIONAL_HIERARCHY).map(reg => <option key={reg} value={reg}>{reg}</option>)
                    ) : (
                      <option value={userRegClean}>{userRegClean}</option>
                    )}
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Station *</label>
                  <select 
                    value={isAbsoluteGlobal || isRegionalCommandTier ? formInput.station : userStnClean} 
                    onChange={e => (isAbsoluteGlobal || isRegionalCommandTier) && setFormInput({...formInput, station: e.target.value})} 
                    required 
                    disabled={!isAbsoluteGlobal && !isRegionalCommandTier} 
                    className="w-full p-2.5 border border-slate-300 dark:border-slate-700 rounded uppercase bg-white dark:bg-slate-900 font-bold text-slate-800 dark:text-slate-200 outline-none disabled:opacity-90 disabled:cursor-not-allowed"
                  >
                    {(isAbsoluteGlobal || isRegionalCommandTier) ? (
                      getDropdownStations(formInput.region || userRegClean).map(stat => <option key={stat} value={stat}>{stat}</option>)
                    ) : (
                      <option value={userStnClean}>{userStnClean}</option>
                    )}
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-emerald-700 dark:text-emerald-400 mb-1">Date (Allows Backdating) *</label>
                  <input type="date" value={formInput.date} onChange={e => setFormInput({...formInput, date: e.target.value})} required className="w-full p-2.5 border border-emerald-300 dark:border-emerald-700 rounded uppercase bg-emerald-50 dark:bg-emerald-950/40 font-bold text-emerald-900 dark:text-emerald-200 outline-none" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 bg-emerald-50/60 dark:bg-slate-900 p-4 rounded-xl border border-emerald-200 dark:border-slate-800">
                <div className="sm:col-span-1">
                  <label className="block font-black text-emerald-900 dark:text-emerald-300 mb-1">Total Suspects *</label>
                  <input type="number" min="0" value={formInput.suspects} onChange={e => setFormInput({...formInput, suspects: e.target.value})} required className="w-full p-2.5 border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-950 font-black text-emerald-900 dark:text-emerald-300 text-sm outline-none" placeholder="0" />
                </div>
                <div><label className="block font-bold text-blue-800 dark:text-blue-300 mb-1">Male Adults</label><input type="number" min="0" value={formInput.male_count} onChange={e => setFormInput({...formInput, male_count: e.target.value})} className="w-full p-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 dark:text-white rounded outline-none" /></div>
                <div><label className="block font-bold text-indigo-800 dark:text-indigo-300 mb-1">Male Juveniles</label><input type="number" min="0" value={formInput.male_juvenile_count} onChange={e => setFormInput({...formInput, male_juvenile_count: e.target.value})} className="w-full p-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 dark:text-white rounded outline-none" /></div>
                <div><label className="block font-bold text-pink-800 dark:text-pink-300 mb-1">Female Adults</label><input type="number" min="0" value={formInput.female_count} onChange={e => setFormInput({...formInput, female_count: e.target.value})} className="w-full p-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 dark:text-white rounded outline-none" /></div>
                <div><label className="block font-bold text-purple-800 dark:text-purple-300 mb-1">Female Juvs</label><input type="number" min="0" value={formInput.female_juvenile_count} onChange={e => setFormInput({...formInput, female_juvenile_count: e.target.value})} className="w-full p-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 dark:text-white rounded outline-none" /></div>
              </div>

              <div className="grid grid-cols-3 gap-3 bg-slate-100 dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
                <div><label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Detention: 1 Day</label><input type="number" min="0" value={formInput.detention_1day} onChange={e => setFormInput({...formInput, detention_1day: e.target.value})} className="w-full p-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 dark:text-white rounded outline-none" /></div>
                <div><label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Detention: 2 Days</label><input type="number" min="0" value={formInput.detention_2days} onChange={e => setFormInput({...formInput, detention_2days: e.target.value})} className="w-full p-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 dark:text-white rounded outline-none" /></div>
                <div><label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Detention: 3+ Days</label><input type="number" min="0" value={formInput.detention_3days_over} onChange={e => setFormInput({...formInput, detention_3days_over: e.target.value})} className="w-full p-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 dark:text-white rounded outline-none" /></div>
              </div>

              <div className="flex justify-end pt-2">
                <button type="submit" className="px-6 py-3 bg-emerald-700 hover:bg-emerald-800 text-white font-black uppercase rounded-xl shadow cursor-pointer text-xs tracking-wider transition">
                  💾 {matrixOperation === 'update' ? 'Save Changes' : 'Save Census to Ledger'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* 2. MATRIX LEDGER VIEW */}
        {activeTab === 'LEDGER' && (
          <>
            <div className="bg-amber-50 dark:bg-slate-900 px-6 py-3 border-b border-amber-200 dark:border-slate-800 flex flex-col md:flex-row justify-between items-center gap-3 shrink-0">
              <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                <div className="flex items-center space-x-2">
                  <Filter className="w-4 h-4 text-amber-800 dark:text-amber-400 shrink-0" />
                  
                  {/* 🟢 View Type Toggle for Station Logs vs Master Lockup */}
                  <div className="flex bg-amber-200/50 dark:bg-slate-800 rounded-lg p-0.5 shadow-inner border border-amber-300 dark:border-slate-700 mr-2">
                    <button onClick={() => setLedgerViewType('STATIONS')} className={`px-3 py-1.5 text-[10px] font-extrabold uppercase rounded-md transition-colors cursor-pointer ${ledgerViewType === 'STATIONS' ? 'bg-amber-600 text-white shadow' : 'text-amber-800 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-slate-700'}`}>Station Logs</button>
                    <button onClick={() => setLedgerViewType('MASTER')} className={`px-3 py-1.5 text-[10px] font-extrabold uppercase rounded-md transition-colors cursor-pointer ${ledgerViewType === 'MASTER' ? 'bg-amber-600 text-white shadow' : 'text-amber-800 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-slate-700'}`}>Master Lockup</button>
                  </div>
                  
                  {ledgerViewType === 'STATIONS' && (
                    <>
                      {/* Region Selector */}
                      <select 
                        value={isAbsoluteGlobal ? ledgerFilterRegion : userRegClean} 
                        onChange={e => { 
                          if (isAbsoluteGlobal) {
                            setLedgerFilterRegion(e.target.value); 
                            setLedgerFilterStation('ALL STATIONS'); 
                          }
                        }} 
                        disabled={!isAbsoluteGlobal} 
                        className="border border-amber-300 dark:border-slate-700 text-amber-900 dark:text-amber-200 font-bold rounded-lg px-2.5 py-1.5 text-xs bg-white dark:bg-slate-950 outline-none cursor-pointer disabled:opacity-90 disabled:cursor-not-allowed"
                      >
                        {isAbsoluteGlobal && <option value="ALL REGIONS">ALL REGIONS</option>}
                        {isAbsoluteGlobal ? (
                          Object.keys(REGIONAL_HIERARCHY).map(reg => <option key={reg} value={reg}>{reg}</option>)
                        ) : (
                          <option value={userRegClean}>{userRegClean}</option>
                        )}
                      </select>

                      {/* Station Selector */}
                      <select 
                        value={isAbsoluteGlobal || isRegionalCommandTier ? ledgerFilterStation : userStnClean} 
                        onChange={e => (isAbsoluteGlobal || isRegionalCommandTier) && setLedgerFilterStation(e.target.value)} 
                        disabled={!isAbsoluteGlobal && !isRegionalCommandTier}
                        className="border border-amber-300 dark:border-slate-700 text-amber-900 dark:text-amber-200 font-bold rounded-lg px-2.5 py-1.5 text-xs bg-white dark:bg-slate-950 outline-none cursor-pointer disabled:opacity-90 disabled:cursor-not-allowed"
                      >
                        {(isAbsoluteGlobal || isRegionalCommandTier) && <option value="ALL STATIONS">ALL STATIONS ({ledgerFilterRegion})</option>}
                        {(isAbsoluteGlobal || isRegionalCommandTier) && ledgerFilterRegion !== 'ALL REGIONS' && REGIONAL_HIERARCHY[ledgerFilterRegion] ? (
                          getDropdownStations(ledgerFilterRegion).map(stat => <option key={stat} value={stat}>{stat}</option>)
                        ) : (
                          REGIONAL_HIERARCHY[userRegClean] ? (
                            getDropdownStations(userRegClean).map(stat => <option key={stat} value={stat}>{stat}</option>)
                          ) : <option value={userStnClean}>{userStnClean}</option>
                        )}
                      </select>
                    </>
                  )}
                </div>
                <div className="relative flex items-center min-w-[200px]">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 text-amber-700 dark:text-amber-400" />
                  <input type="text" placeholder="Search station, date..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-8 pr-3 py-1.5 bg-white dark:bg-slate-950 border border-amber-300 dark:border-slate-700 rounded-lg text-xs font-semibold text-amber-900 dark:text-amber-200 outline-none focus:ring-1 focus:ring-amber-500" />
                </div>
              </div>
              <div className="flex bg-amber-900 dark:bg-slate-950 rounded-lg p-0.5 shadow-inner border border-amber-700/50 dark:border-slate-800 overflow-x-auto max-w-full custom-scrollbar">
                {['TODAY', 'WEEK', 'MONTH', 'YEAR', 'ALL'].map((f) => (
                  <button key={f} onClick={() => setLockupFilter(f)} className={`px-3 py-1 text-[11px] font-extrabold uppercase rounded-md transition-colors cursor-pointer ${lockupFilter === f ? 'bg-amber-500 text-amber-950 shadow-sm' : 'text-amber-200 hover:text-white'}`}>{f}</button>
                ))}
              </div>
            </div>

            {/* 🟢 History Banner specific to Master Lockup Dropdown */}
            {ledgerViewType === 'MASTER' && (
              <div className="bg-amber-950/80 text-amber-300 px-6 py-2 text-[10px] font-black uppercase flex items-center shadow-inner tracking-widest border-b border-amber-900/50 shrink-0">
                <Calendar className="w-3.5 h-3.5 mr-2" /> KMP Master Lock-up History Log
              </div>
            )}
            
            <div className="overflow-y-auto flex-1 custom-scrollbar bg-slate-50 dark:bg-slate-900">
              <table className="w-full text-left border-collapse table-auto">
                <thead className="bg-amber-100 dark:bg-slate-950 sticky top-0 border-b border-amber-200 dark:border-slate-800 shadow-sm z-20">
                  <tr>
                    <th rowSpan="2" className="px-3 py-3 text-[10px] font-black text-amber-900 dark:text-amber-300 uppercase border-r border-amber-200 dark:border-slate-800 text-center w-[4%]">Act</th>
                    <th rowSpan="2" className="px-3 py-3 text-[10px] font-black text-amber-900 dark:text-amber-300 uppercase border-r border-amber-200 dark:border-slate-800 min-w-[110px]">Date</th>
                    <th rowSpan="2" className="px-3 py-3 text-[10px] font-black text-amber-900 dark:text-amber-300 uppercase border-r border-amber-200 dark:border-slate-800 min-w-[140px]">Station</th>
                    <th rowSpan="2" className="px-3 py-3 text-[10px] font-black text-white uppercase bg-amber-900 dark:bg-slate-950 border-r border-amber-800 dark:border-slate-800 text-center min-w-[90px]">Total Suspects</th>
                    <th colSpan="4" className="px-2 py-2 text-[10px] font-black text-amber-900 dark:text-amber-300 uppercase border-r border-amber-200 dark:border-slate-800 text-center bg-amber-200/50 dark:bg-slate-900">SEX & AGE CATEGORY</th>
                    <th colSpan="3" className="px-2 py-2 text-[10px] font-black text-amber-900 dark:text-amber-300 uppercase border-r border-amber-200 dark:border-slate-800 text-center bg-amber-100 dark:bg-slate-900">DURATION IN DETENTION</th>
                    <th rowSpan="2" className="px-3 py-3 text-[10px] font-black text-amber-900 dark:text-amber-300 uppercase text-center border-r border-amber-200 dark:border-slate-800 min-w-[100px]">Margin</th>
                    <th rowSpan="2" className="px-3 py-3 text-[10px] font-black text-amber-900 dark:text-amber-300 uppercase min-w-[140px]">Last Updated By</th>
                  </tr>
                  <tr className="bg-amber-50 dark:bg-slate-900 border-b-2 border-amber-200 dark:border-slate-800">
                    <th className="px-2 py-2 text-[9px] font-extrabold text-blue-800 dark:text-blue-300 uppercase border-r border-amber-200 dark:border-slate-800 text-center bg-blue-50/50 dark:bg-slate-950 min-w-[75px]">Male Ad</th>
                    <th className="px-2 py-2 text-[9px] font-extrabold text-indigo-800 dark:text-indigo-300 uppercase border-r border-amber-200 dark:border-slate-800 text-center bg-indigo-50/50 dark:bg-slate-950 min-w-[75px]">Male Juv</th>
                    <th className="px-2 py-2 text-[9px] font-extrabold text-pink-800 dark:text-pink-300 uppercase border-r border-amber-200 dark:border-slate-800 text-center bg-pink-50/50 dark:bg-slate-950 min-w-[75px]">Fem Ad</th>
                    <th className="px-2 py-2 text-[9px] font-extrabold text-purple-800 dark:text-purple-300 uppercase border-r border-amber-200 dark:border-slate-800 text-center bg-purple-50/50 dark:bg-slate-950 min-w-[75px]">Fem Juv</th>
                    <th className="px-2 py-2 text-[9px] font-extrabold text-slate-700 dark:text-slate-300 uppercase border-r border-amber-200 dark:border-slate-800 text-center min-w-[60px]">1 Day</th>
                    <th className="px-2 py-2 text-[9px] font-extrabold text-slate-700 dark:text-slate-300 uppercase border-r border-amber-200 dark:border-slate-800 text-center min-w-[60px]">2 Days</th>
                    <th className="px-2 py-2 text-[9px] font-extrabold text-slate-700 dark:text-slate-300 uppercase border-r border-amber-200 dark:border-slate-800 text-center min-w-[80px]">3+ Days</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-amber-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
                  {filteredLockupEntries.length > 0 ? (
                    filteredLockupEntries.map((row, idx) => {
                      const isMasterRow = stripHtmlTags(row.station || '').trim().toUpperCase() === 'HEADQUARTERS GENERAL TOTAL';
                      // 🟢 Enforce 24 Hour Edit Lock AND Master Lockup Role Guard
                      const isTimeValid = row.date === todayStr || row.date === yesterdayStr;
                      const hasRoleRights = !isMasterRow || canManageMasterLockup;
                      const isEditable = isTimeValid && hasRoleRights;

                      return (
                        <tr key={idx} className="hover:bg-amber-50/50 dark:hover:bg-slate-800/50 transition-colors">
                          <td className="px-3 py-3 text-center border-r border-slate-200 dark:border-slate-800">
                            {isEditable ? (
                              <button onClick={() => populateMatrixEdit(row)} className="text-blue-400 hover:text-blue-300 p-1 bg-blue-950/60 rounded border border-blue-800 cursor-pointer" title="Edit Census">
                                <Edit size={14}/>
                              </button>
                            ) : (
                              <span className="text-[9px] font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded cursor-not-allowed border border-slate-300 dark:border-slate-700" title={!hasRoleRights ? "Command Tier Access Only" : "Record locked (Exceeds 24 Hrs)"}>LOCKED</span>
                            )}
                          </td>
                          <td className="px-3 py-3 text-xs font-bold text-slate-800 dark:text-slate-200 border-r border-slate-200 dark:border-slate-800 whitespace-nowrap">{row.date}</td>
                          <td className="px-3 py-3 text-xs font-bold text-slate-700 dark:text-slate-300 uppercase border-r border-slate-200 dark:border-slate-800">{row.station}</td>
                          <td className="px-3 py-3 text-sm font-black text-amber-700 dark:text-amber-400 text-center bg-amber-50/30 dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800">{row.suspects}</td>
                          <td className="px-2 py-3 text-xs font-bold text-blue-700 dark:text-blue-400 text-center border-r border-slate-200 dark:border-slate-800 bg-blue-50/20 dark:bg-slate-950">{row.male_count || row.male || 0}</td>
                          <td className="px-2 py-3 text-xs font-bold text-indigo-700 dark:text-indigo-400 text-center border-r border-slate-200 dark:border-slate-800 bg-indigo-50/20 dark:bg-slate-950">{row.male_juvenile_count || row.male_juvenile || 0}</td>
                          <td className="px-2 py-3 text-xs font-bold text-pink-700 dark:text-pink-400 text-center border-r border-slate-200 dark:border-slate-800 bg-pink-50/20 dark:bg-slate-950">{row.female_count || row.female || 0}</td>
                          <td className="px-2 py-3 text-xs font-bold text-purple-700 dark:text-purple-400 text-center border-r border-slate-200 dark:border-slate-800 bg-purple-50/20 dark:bg-slate-950">{row.female_juvenile_count || row.female_juvenile || 0}</td>
                          <td className="px-2 py-3 text-xs font-medium text-slate-700 dark:text-slate-300 text-center border-r border-slate-200 dark:border-slate-800">{row.detention_1day || 0}</td>
                          <td className="px-2 py-3 text-xs font-medium text-slate-700 dark:text-slate-300 text-center border-r border-slate-200 dark:border-slate-800">{row.detention_2days || 0}</td>
                          <td className="px-2 py-3 text-xs font-medium text-slate-700 dark:text-slate-300 text-center border-r border-slate-200 dark:border-slate-800">{row.detention_3days_over || 0}</td>
                          <td className="px-3 py-3 text-xs font-bold text-center border-r border-slate-200 dark:border-slate-800">
                            {row.marginStr.startsWith('+') ? <span className="text-red-400 bg-red-950/60 px-2 py-0.5 rounded border border-red-800 flex items-center justify-center max-w-max mx-auto"><TrendingUp className="w-3 h-3 mr-1" /> {row.marginStr}</span>
                            : row.marginStr.startsWith('-') ? <span className="text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800 flex items-center justify-center max-w-max mx-auto"><TrendingDown className="w-3 h-3 mr-1" /> {row.marginStr}</span>
                            : <span className="text-slate-400 bg-slate-800 px-2 py-0.5 rounded border border-slate-700 flex items-center justify-center max-w-max mx-auto"><Minus className="w-3 h-3 mr-1" /> 0</span>}
                          </td>
                          <td className="px-3 py-3 text-[11px] font-semibold text-slate-400 uppercase">{formatOfficerDisplay(row.last_updated_by)}</td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr><td colSpan="13" className="px-6 py-12 text-center text-sm text-slate-400 font-bold">No master lockup records found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="bg-slate-900 dark:bg-slate-950 shrink-0 shadow-inner z-10 border-t border-slate-700 dark:border-slate-800 text-amber-300">
              <div className="grid grid-cols-2 md:grid-cols-6 gap-2 px-6 py-3 border-b border-slate-800 text-xs font-black uppercase">
                <div>{lockupFilter} Period Totals:</div>
                <div>Total: <span className="text-white">{totals.suspects}</span></div>
                <div>Male (Ad / Juv): <span className="text-blue-400">{totals.male}</span> / <span className="text-indigo-400">{totals.male_juvenile}</span></div>
                <div>Female (Ad / Juv): <span className="text-pink-400">{totals.female}</span> / <span className="text-purple-400">{totals.female_juvenile}</span></div>
                <div className="col-span-2">Detention (1d/2d/3d+): <span className="text-white">{totals.d1} / {totals.d2} / {totals.d3}</span></div>
              </div>
            </div>
          </>
        )}

        {/* 3. SUSPECT REGISTER VIEW */}
        {activeTab === 'SUSPECT_REGISTER' && (
          <>
            <div className="bg-blue-50 dark:bg-slate-900 px-6 py-3 border-b border-blue-200 dark:border-slate-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shrink-0">
              <div className="w-full flex flex-col gap-3">
                
                <form onSubmit={handleSuspectFormSubmit} className="bg-white dark:bg-slate-950 p-4 rounded-xl border border-blue-200 dark:border-slate-800 shadow-sm text-xs">
                  <div className="flex justify-between items-center mb-3 pb-2 border-b border-blue-100 dark:border-slate-800">
                    <h4 className="font-black text-blue-900 dark:text-blue-300 uppercase flex items-center">
                      <Users className="w-4 h-4 mr-1.5 text-blue-600 dark:text-blue-400" /> 
                      {registerOperation === 'update' ? `Editing Suspect Record #${suspectFormInput.id}` : 'Register Detailed Suspect Data'}
                    </h4>
                    {registerOperation === 'update' && (
                      <button type="button" onClick={() => { setRegisterOperation('new'); setSuspectFormInput({...suspectFormInput, id: null, name: '', reason_for_detention: '', reference: ''}) }} className="text-red-400 font-bold hover:underline">Cancel Edit</button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
                    <div className="col-span-2 md:col-span-2"><label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Full Name *</label><input type="text" value={suspectFormInput.name} onChange={e => setSuspectFormInput({...suspectFormInput, name: e.target.value})} required className="w-full p-2 border border-slate-300 dark:border-slate-700 rounded outline-none uppercase bg-slate-50 dark:bg-slate-900 dark:text-white" /></div>
                    <div><label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Sex</label><select value={suspectFormInput.sex} onChange={e => setSuspectFormInput({...suspectFormInput, sex: e.target.value})} className="w-full p-2 border border-slate-300 dark:border-slate-700 rounded outline-none bg-white dark:bg-slate-900 dark:text-white"><option>MALE</option><option>FEMALE</option></select></div>
                    <div><label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Age</label><input type="number" value={suspectFormInput.age} onChange={e => setSuspectFormInput({...suspectFormInput, age: e.target.value})} className="w-full p-2 border border-slate-300 dark:border-slate-700 rounded outline-none bg-white dark:bg-slate-900 dark:text-white" /></div>
                    <div><label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Tribe</label><input type="text" value={suspectFormInput.tribe} onChange={e => setSuspectFormInput({...suspectFormInput, tribe: e.target.value})} className="w-full p-2 border border-slate-300 dark:border-slate-700 rounded outline-none uppercase bg-white dark:bg-slate-900 dark:text-white" /></div>
                    <div><label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Nationality</label><input type="text" value={suspectFormInput.nationality} onChange={e => setSuspectFormInput({...suspectFormInput, nationality: e.target.value})} className="w-full p-2 border border-slate-300 dark:border-slate-700 rounded outline-none uppercase bg-white dark:bg-slate-900 dark:text-white" /></div>
                    
                    <div className="col-span-2"><label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Residence</label><input type="text" value={suspectFormInput.residence} onChange={e => setSuspectFormInput({...suspectFormInput, residence: e.target.value})} className="w-full p-2 border border-slate-300 dark:border-slate-700 rounded outline-none uppercase bg-white dark:bg-slate-900 dark:text-white" /></div>
                    <div className="col-span-2"><label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Next of Kin / Contact</label><input type="text" value={suspectFormInput.next_of_kin} onChange={e => setSuspectFormInput({...suspectFormInput, next_of_kin: e.target.value})} className="w-full p-2 border border-slate-300 dark:border-slate-700 rounded outline-none uppercase bg-white dark:bg-slate-900 dark:text-white" /></div>
                    <div className="col-span-2"><label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Reference (SD/CRB)</label><input type="text" value={suspectFormInput.reference} onChange={e => setSuspectFormInput({...suspectFormInput, reference: e.target.value})} className="w-full p-2 border border-slate-300 dark:border-slate-700 rounded outline-none uppercase font-bold text-blue-400 bg-white dark:bg-slate-900" /></div>

                    <div className="col-span-4"><label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Reason for Detention *</label><input type="text" value={suspectFormInput.reason_for_detention} onChange={e => setSuspectFormInput({...suspectFormInput, reason_for_detention: e.target.value})} required className="w-full p-2 border border-slate-300 dark:border-slate-700 rounded outline-none uppercase bg-white dark:bg-slate-900 dark:text-white" /></div>
                    
                    <div><label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Date In *</label><input type="date" value={suspectFormInput.date_in} onChange={e => setSuspectFormInput({...suspectFormInput, date_in: e.target.value})} required className="w-full p-2 border border-slate-300 dark:border-slate-700 rounded outline-none bg-white dark:bg-slate-900 dark:text-white" /></div>
                    <div>
  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Status</label>
  {['IN CUSTODY', 'RELEASED ON BOND', 'TO COURT', 'TRANSFERRED', 'ESCAPED', 'DIED IN CUSTODY'].includes(suspectFormInput.status) ? (
    <div className="flex gap-2">
      <select 
        value={suspectFormInput.status} 
        onChange={e => setSuspectFormInput({...suspectFormInput, status: e.target.value})} 
        className="w-full p-2 border border-slate-300 dark:border-slate-700 rounded outline-none font-bold bg-white dark:bg-slate-900 dark:text-white"
      >
        <option>IN CUSTODY</option>
        <option>RELEASED ON BOND</option>
        <option>TO COURT</option>
        <option>TRANSFERRED</option>
        <option>ESCAPED</option>
        <option>DIED IN CUSTODY</option>
      </select>
      <button 
        type="button" 
        onClick={() => setSuspectFormInput({...suspectFormInput, status: ''})} 
        className="px-2.5 py-1 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded text-[10px] font-bold shrink-0 cursor-pointer"
        title="Type custom status"
      >
        Custom
      </button>
    </div>
  ) : (
    <div className="flex gap-2">
      <input 
        type="text" 
        value={suspectFormInput.status} 
        onChange={e => setSuspectFormInput({...suspectFormInput, status: e.target.value.toUpperCase()})} 
        placeholder="Type custom status..." 
        required
        className="w-full p-2 border border-slate-300 dark:border-slate-700 rounded outline-none font-bold uppercase bg-white dark:bg-slate-900 dark:text-white" 
      />
      <button 
        type="button" 
        onClick={() => setSuspectFormInput({...suspectFormInput, status: 'IN CUSTODY'})} 
        className="px-2.5 py-1 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded text-[10px] font-bold shrink-0 cursor-pointer"
      >
        List
      </button>
    </div>
  )}
</div>
</div>
<div className="flex justify-end mt-3">
  <button type="submit" className="px-5 py-2 bg-blue-700 hover:bg-blue-800 text-white font-bold rounded shadow transition flex items-center cursor-pointer">
    <Save className="w-3 h-3 mr-1.5"/> {registerOperation === 'update' ? 'Save Record Updates' : 'Add to Register'}
  </button>
</div>
</form>

                {/* Filters for Register */}
                <div className="flex flex-wrap items-center gap-2">
                  <select 
                    value={isAbsoluteGlobal ? registerFilterRegion : userRegClean} 
                    onChange={e => { 
                      if (isAbsoluteGlobal) {
                        setRegisterFilterRegion(e.target.value); 
                        setRegisterFilterStation('ALL STATIONS'); 
                      }
                    }} 
                    disabled={!isAbsoluteGlobal} 
                    className="border border-blue-300 dark:border-slate-700 text-blue-900 dark:text-blue-200 font-bold rounded-lg px-2.5 py-1.5 text-xs bg-white dark:bg-slate-950 outline-none cursor-pointer disabled:opacity-90 disabled:cursor-not-allowed"
                  >
                    {isAbsoluteGlobal && <option value="ALL REGIONS">ALL REGIONS</option>}
                    {isAbsoluteGlobal ? (
                      Object.keys(REGIONAL_HIERARCHY).map(reg => <option key={reg} value={reg}>{reg}</option>)
                    ) : (
                      <option value={userRegClean}>{userRegClean}</option>
                    )}
                  </select>
                  <select 
                    value={isAbsoluteGlobal || isRegionalCommandTier ? registerFilterStation : userStnClean} 
                    onChange={e => (isAbsoluteGlobal || isRegionalCommandTier) && setRegisterFilterStation(e.target.value)} 
                    disabled={!isAbsoluteGlobal && !isRegionalCommandTier}
                    className="border border-blue-300 dark:border-slate-700 text-blue-900 dark:text-blue-200 font-bold rounded-lg px-2.5 py-1.5 text-xs bg-white dark:bg-slate-950 outline-none cursor-pointer disabled:opacity-90 disabled:cursor-not-allowed"
                  >
                    {(isAbsoluteGlobal || isRegionalCommandTier) && <option value="ALL STATIONS">ALL STATIONS ({registerFilterRegion})</option>}
                    {(isAbsoluteGlobal || isRegionalCommandTier) && registerFilterRegion !== 'ALL REGIONS' && REGIONAL_HIERARCHY[registerFilterRegion] ? (
                      getDropdownStations(registerFilterRegion).map(stat => <option key={stat} value={stat}>{stat}</option>)
                    ) : (
                      REGIONAL_HIERARCHY[userRegClean] ? (
                        getDropdownStations(userRegClean).map(stat => <option key={stat} value={stat}>{stat}</option>)
                      ) : <option value={userStnClean}>{userStnClean}</option>
                    )}
                  </select>
                  <div className="relative flex items-center min-w-[200px] flex-1">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 text-blue-700 dark:text-blue-400" />
                    <input type="text" placeholder="Search name, reference, reason..." value={suspectSearchQuery} onChange={(e) => setSuspectSearchQuery(e.target.value)} className="w-full pl-8 pr-3 py-1.5 bg-white dark:bg-slate-950 border border-blue-300 dark:border-slate-700 rounded-lg text-xs font-semibold text-blue-900 dark:text-blue-200 outline-none focus:ring-1 focus:ring-blue-500" />
                  </div>
                  <button type="button" onClick={handleExportSuspectRegister} className="px-3 py-1.5 bg-blue-900 text-white text-xs font-bold rounded-lg flex items-center shadow hover:bg-black transition cursor-pointer">
                    <HardDrive className="w-3.5 h-3.5 mr-1.5" /> Export CSV
                  </button>
                </div>
              </div>
            </div>

            <div className="overflow-y-auto flex-1 custom-scrollbar bg-white dark:bg-slate-900">
              <table className="min-w-full divide-y divide-blue-200 dark:divide-slate-800">
                <thead className="bg-blue-100 dark:bg-slate-950 sticky top-0 border-b border-blue-300 dark:border-slate-800 z-20">
                  <tr>
                    <th className="px-3 py-3 text-[10px] font-black text-blue-900 dark:text-blue-300 uppercase text-center w-[4%]">Act</th>
                    <th className="px-3 py-3 text-[10px] font-black text-blue-900 dark:text-blue-300 uppercase">Station</th>
                    <th className="px-3 py-3 text-[10px] font-black text-blue-900 dark:text-blue-300 uppercase">Suspect Name</th>
                    <th className="px-2 py-3 text-[10px] font-black text-blue-900 dark:text-blue-300 uppercase text-center">Sex/Age</th>
                    <th className="px-3 py-3 text-[10px] font-black text-blue-900 dark:text-blue-300 uppercase">Demographics</th>
                    <th className="px-3 py-3 text-[10px] font-black text-blue-900 dark:text-blue-300 uppercase">Reference</th>
                    <th className="px-3 py-3 text-[10px] font-black text-blue-900 dark:text-blue-300 uppercase">Reason / Offence</th>
                    <th className="px-3 py-3 text-[10px] font-black text-blue-900 dark:text-blue-300 uppercase">Date In</th>
                    <th className="px-3 py-3 text-[10px] font-black text-blue-900 dark:text-blue-300 uppercase text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-blue-50 dark:divide-slate-800 bg-white dark:bg-slate-900">
                  {suspectRecords.length > 0 ? (
                    suspectRecords.map((row, idx) => (
                      <tr key={idx} className="hover:bg-blue-50/50 dark:hover:bg-slate-800/50 transition-colors">
                        <td className="px-3 py-3 text-center border-r border-slate-100 dark:border-slate-800">
                           <button onClick={() => populateSuspectEdit(row)} className="text-blue-400 hover:text-blue-300 p-1 bg-blue-950/60 rounded border border-blue-800 cursor-pointer"><Edit size={14}/></button>
                        </td>
                        <td className="px-3 py-3 text-[10px] font-bold text-slate-400 uppercase">{stripHtmlTags(row.station)}</td>
                        <td className="px-3 py-3 text-xs font-black text-slate-800 dark:text-slate-100 uppercase">{stripHtmlTags(row.name)}</td>
                        <td className="px-2 py-3 text-xs font-bold text-slate-600 dark:text-slate-300 text-center">{stripHtmlTags(row.sex?.charAt(0))} / {row.age || '-'}</td>
                        <td className="px-3 py-3 text-[10px] text-slate-600 dark:text-slate-400">
                          <span className="font-bold text-slate-800 dark:text-slate-200">{stripHtmlTags(row.nationality)}</span> ({stripHtmlTags(row.tribe)})<br/>
                          Res: {stripHtmlTags(row.residence)}
                        </td>
                        <td className="px-3 py-3 text-xs font-bold text-blue-400 whitespace-nowrap">{stripHtmlTags(row.reference)}</td>
                        <td className="px-3 py-3 text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase max-w-[200px] truncate" title={stripHtmlTags(row.reason_for_detention)}>{stripHtmlTags(row.reason_for_detenthion || row.reason_for_detention)}</td>
                        <td className="px-3 py-3 text-xs font-mono text-slate-400 whitespace-nowrap">{stripHtmlTags(row.date_in)}</td>
                        <td className="px-3 py-3 text-center">
                          <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${row.status === 'IN CUSTODY' ? 'bg-red-950 text-red-300 border border-red-800' : 'bg-emerald-950 text-emerald-300 border border-emerald-800'}`}>
                            {stripHtmlTags(row.status)}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr><td colSpan="9" className="px-6 py-12 text-center text-sm text-slate-400 font-bold">No suspect records found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

      </div>
    </div>
  );
};

export default LockupMatrixLedger;