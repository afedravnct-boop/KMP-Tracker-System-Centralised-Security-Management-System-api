// src/components/LockupMatrixLedger.jsx
import React, { useState, useMemo, useEffect } from 'react';
import { ChevronDown, ChevronUp, Calendar, Search, Filter, PlusCircle, AlertTriangle, CheckCircle, TrendingUp, TrendingDown, Minus, Shield, Users, Save, HardDrive, Edit, X } from 'lucide-react';
import { authFetch } from './api';
import { stripHtmlTags } from './App';

const REGIONAL_HIERARCHY = {
  "KMP NORTH": ["KMP NORTH HEADQUARTERS", "KMP NORTH", "KAWEMPE", "KAKIRI", "KASANGATI", "MATUGGA", "NANSANA", "OLD KAMPALA", "WAKISO", "WANDEGEYA"],
  "KMP EAST": ["KMP EAST HEADQUARTERS", "KMP EAST", "JINJA ROAD", "KIRA", "KIRA DIV", "KIRA ROAD", "MUKONO", "NAGGALAMA", "SEETA"],
  "KMP SOUTH": ["KMP SOUTH HEADQUARTERS", "KMP SOUTH", "NATEETE", "CPS KAMPALA", "PARLIAMENT", "ENTEBBE", "KABALAGALA", "KAJJANSI", "KASENYI", "KATWE", "KYENGERA", "NSANGI"],
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

const LockupMatrixLedger = ({ lockupEntries, allTimeLockupTotal, onClose, selectedRegion, selectedStation, currentUser, onRefreshData }) => {
  const [activeTab, setActiveTab] = useState('LOG_FORM'); 
  const [notification, setNotification] = useState(null);
  
  // Matrix Ledger States
  const [lockupFilter, setLockupFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [ledgerFilterRegion, setLedgerFilterRegion] = useState(selectedRegion || 'ALL REGIONS');
  const [ledgerFilterStation, setLedgerFilterStation] = useState(selectedStation || 'ALL STATIONS');
  
  // Real Suspect Register States
  const [suspectRecords, setSuspectRecords] = useState([]);
  const [suspectSearchQuery, setSuspectSearchQuery] = useState('');
  const [registerFilterRegion, setRegisterFilterRegion] = useState(selectedRegion || 'ALL REGIONS');
  const [registerFilterStation, setRegisterFilterStation] = useState(selectedStation || 'ALL STATIONS');

  const userRole = stripHtmlTags(currentUser?.role || '').toUpperCase();
  const isGlobalLevel = ['SUPER_ADMIN', 'ADMIN', 'ASSISTANT_SUPER_ADMIN', 'RPC', 'DEPUTY COMMANDER'].includes(userRole) || 
                        currentUser?.permissions?.view_global_roster === true ||
                        ['KMP HEADQUARTERS', 'POLICE HEADQUARTERS'].includes(stripHtmlTags(currentUser?.region || '').toUpperCase());

  // Form Inputs
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

  useEffect(() => {
    if (activeTab === 'SUSPECT_REGISTER') fetchSuspectRegister();
  }, [activeTab, registerFilterRegion, registerFilterStation, suspectSearchQuery]);

  const fetchSuspectRegister = async () => {
    try {
      const params = new URLSearchParams();
      if (!isGlobalLevel && registerFilterRegion !== 'ALL REGIONS') params.append('region', registerFilterRegion);
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

    const payload = {
      ...formInput,
      sd_ref: popRef,
      region: stripHtmlTags(formInput.region).toUpperCase(),
      station: stripHtmlTags(formInput.station).toUpperCase(),
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

    try {
      const endpoint = registerOperation === 'update' && suspectFormInput.id ? `/api/v1/suspect-register/${suspectFormInput.id}` : '/api/v1/suspect-register';
      const method = registerOperation === 'update' && suspectFormInput.id ? 'PUT' : 'POST';
      
      const response = await authFetch(endpoint, {
        method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(suspectFormInput)
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
          station: stripHtmlTags(currentUser?.station || ''), region: stripHtmlTags(currentUser?.region || '')
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
      if (!isGlobalLevel && registerFilterRegion !== 'ALL REGIONS') params.append('region', registerFilterRegion);
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

  const stationDailyStats = useMemo(() => {
    const stn = stripHtmlTags(currentUser?.station || '').trim().toUpperCase();
    const today = getTodayString();
    const stationLogs = lockupEntries.filter(r => stripHtmlTags(r.station || '').trim().toUpperCase() === stn).sort((a, b) => new Date(b.date) - new Date(a.date));
    
    const todaysLog = stationLogs.find(r => r.date === today);
    const lastLog = stationLogs.length > 0 ? stationLogs[0] : null;

    return {
      todaysTotal: todaysLog ? todaysLog.suspects : null,
      lastLoggedDate: lastLog ? lastLog.date : 'Never'
    };
  }, [lockupEntries, currentUser?.station]);

  const filteredLockupEntries = useMemo(() => {
    let filtered = Array.isArray(lockupEntries) ? [...lockupEntries] : [];

    filtered = filtered.filter(row => {
      const stn = stripHtmlTags(row.station || '').trim().toUpperCase();
      const reg = getOfficialRegionForStation(stn, row.region);

      if (ledgerFilterRegion && ledgerFilterRegion !== 'ALL REGIONS') {
        const cleanTargetRegion = ledgerFilterRegion.trim().toUpperCase();
        const belongsToRegion = reg === cleanTargetRegion || (REGIONAL_HIERARCHY[cleanTargetRegion] && REGIONAL_HIERARCHY[cleanTargetRegion].includes(stn));
        if (!belongsToRegion) return false;
      }

      if (ledgerFilterStation && ledgerFilterStation !== 'ALL STATIONS') {
        if (!stn.includes(ledgerFilterStation.trim().toUpperCase())) return false;
      }

      if (searchQuery.trim()) {
        const query = searchQuery.trim().toUpperCase();
        return stn.includes(query) || reg.includes(query) || stripHtmlTags(row.last_updated_by || '').toUpperCase().includes(query) || stripHtmlTags(row.date || '').includes(query);
      }
      return true;
    });

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
  }, [lockupEntries, lockupFilter, ledgerFilterRegion, ledgerFilterStation, searchQuery]);

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

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[99999] flex items-center justify-center p-2 sm:p-4 animate-in fade-in zoom-in-95 duration-200">
      <div className="bg-white shadow-2xl max-w-[95vw] w-full flex flex-col max-h-[95vh] rounded-xl overflow-hidden border border-slate-300">
        
        {/* DYNAMIC HEADER */}
        <div className={`${headerBgClass} px-6 py-4 flex flex-col sm:flex-row justify-between items-start sm:items-center shrink-0 shadow-md z-10 gap-3 transition-colors duration-300`}>
          <div>
            <h3 className="text-xs sm:text-sm font-extrabold text-white tracking-wider uppercase flex items-center">
              <Shield className="w-4 h-4 mr-2" />
              {activeTab === 'LOG_FORM' ? 'Daily Cell Census Entry' : activeTab === 'LEDGER' ? 'Suspect Lock-Up Matrix Ledger' : 'Detailed Suspect Register'}
            </h3>
            <div className="flex gap-4 mt-1">
              <span className="text-[10px] text-white/80 font-bold bg-black/20 px-2 py-0.5 rounded">
                Today's Log: <span className={stationDailyStats.todaysTotal !== null ? "text-green-300" : "text-red-300"}>{stationDailyStats.todaysTotal !== null ? stationDailyStats.todaysTotal : 'MISSING'}</span>
              </span>
              <span className="text-[10px] text-white/80 font-bold bg-black/20 px-2 py-0.5 rounded">
                Last Logged: <span className="text-amber-300">{stationDailyStats.lastLoggedDate}</span>
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
          <div className={`mx-6 mt-3 p-3 rounded-lg border text-xs flex items-center shrink-0 ${notification.type === 'error' ? 'bg-red-50 border-red-200 text-red-800' : notification.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-blue-50 border-blue-200 text-blue-800'}`}>
            {notification.type === 'error' ? <AlertTriangle className="w-4 h-4 mr-2 shrink-0" /> : notification.type === 'success' ? <CheckCircle className="w-4 h-4 mr-2 shrink-0" /> : <Shield className="w-4 h-4 mr-2 shrink-0" />}
            <span className="font-bold">{notification.text}</span>
          </div>
        )}

        {/* 1. CENSUS SUBMISSION FORM */}
        {activeTab === 'LOG_FORM' && (
          <div className="p-6 overflow-y-auto flex-1 bg-slate-50 max-w-3xl mx-auto w-full custom-scrollbar">
            <h4 className="text-sm font-black text-slate-800 uppercase mb-4 pb-2 border-b flex items-center">
              <PlusCircle className="w-4 h-4 mr-2 text-emerald-700" /> {matrixOperation === 'update' ? `Editing Census for ${formInput.date}` : 'Log Station Daily Cell Census'}
            </h4>
            <form onSubmit={handleMatrixFormSubmit} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Region *</label>
                  <select value={formInput.region} onChange={e => setFormInput({...formInput, region: e.target.value, station: REGIONAL_HIERARCHY[e.target.value]?.[0] || ''})} required disabled={!isGlobalLevel && matrixOperation === 'update'} className="w-full p-2.5 border rounded uppercase bg-white font-bold text-slate-800 outline-none">
                    {Object.keys(REGIONAL_HIERARCHY).map(reg => <option key={reg} value={reg}>{reg}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Station *</label>
                  <select value={formInput.station} onChange={e => setFormInput({...formInput, station: e.target.value})} required disabled={!isGlobalLevel && matrixOperation === 'update'} className="w-full p-2.5 border rounded uppercase bg-white font-bold text-slate-800 outline-none">
                    {(REGIONAL_HIERARCHY[formInput.region] || []).map(stat => <option key={stat} value={stat}>{stat}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-emerald-700 mb-1">Date (Allows Backdating) *</label>
                  <input type="date" value={formInput.date} onChange={e => setFormInput({...formInput, date: e.target.value})} required className="w-full p-2.5 border border-emerald-300 rounded uppercase bg-emerald-50 font-bold text-emerald-900 outline-none" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 bg-emerald-50 p-4 rounded-xl border border-emerald-200">
                <div className="sm:col-span-1">
                  <label className="block font-black text-emerald-900 mb-1">Total Suspects *</label>
                  <input type="number" min="0" value={formInput.suspects} onChange={e => setFormInput({...formInput, suspects: e.target.value})} required className="w-full p-2.5 border rounded bg-white font-black text-emerald-900 text-sm outline-none" placeholder="0" />
                </div>
                <div><label className="block font-bold text-blue-800 mb-1">Male Adults</label><input type="number" min="0" value={formInput.male_count} onChange={e => setFormInput({...formInput, male_count: e.target.value})} className="w-full p-2 border rounded outline-none" /></div>
                <div><label className="block font-bold text-indigo-800 mb-1">Male Juveniles</label><input type="number" min="0" value={formInput.male_juvenile_count} onChange={e => setFormInput({...formInput, male_juvenile_count: e.target.value})} className="w-full p-2 border rounded outline-none" /></div>
                <div><label className="block font-bold text-pink-800 mb-1">Female Adults</label><input type="number" min="0" value={formInput.female_count} onChange={e => setFormInput({...formInput, female_count: e.target.value})} className="w-full p-2 border rounded outline-none" /></div>
                <div><label className="block font-bold text-purple-800 mb-1">Female Juvs</label><input type="number" min="0" value={formInput.female_juvenile_count} onChange={e => setFormInput({...formInput, female_juvenile_count: e.target.value})} className="w-full p-2 border rounded outline-none" /></div>
              </div>

              <div className="grid grid-cols-3 gap-3 bg-slate-100 p-4 rounded-xl border border-slate-200">
                <div><label className="block font-bold text-slate-700 mb-1">Detention: 1 Day</label><input type="number" min="0" value={formInput.detention_1day} onChange={e => setFormInput({...formInput, detention_1day: e.target.value})} className="w-full p-2 border rounded outline-none" /></div>
                <div><label className="block font-bold text-slate-700 mb-1">Detention: 2 Days</label><input type="number" min="0" value={formInput.detention_2days} onChange={e => setFormInput({...formInput, detention_2days: e.target.value})} className="w-full p-2 border rounded outline-none" /></div>
                <div><label className="block font-bold text-slate-700 mb-1">Detention: 3+ Days</label><input type="number" min="0" value={formInput.detention_3days_over} onChange={e => setFormInput({...formInput, detention_3days_over: e.target.value})} className="w-full p-2 border rounded outline-none" /></div>
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
            <div className="bg-amber-50 px-6 py-3 border-b border-amber-200 flex flex-col md:flex-row justify-between items-center gap-3 shrink-0">
              <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                <div className="flex items-center space-x-2">
                  <Filter className="w-4 h-4 text-amber-800 shrink-0" />
                  <select value={ledgerFilterRegion} onChange={e => { setLedgerFilterRegion(e.target.value); setLedgerFilterStation('ALL STATIONS'); }} disabled={!isGlobalLevel} className="border border-amber-300 text-amber-900 font-bold rounded-lg px-2.5 py-1.5 text-xs bg-white outline-none cursor-pointer">
                    <option value="ALL REGIONS">ALL REGIONS</option>
                    {Object.keys(REGIONAL_HIERARCHY).map(reg => <option key={reg} value={reg}>{reg}</option>)}
                  </select>
                  <select value={ledgerFilterStation} onChange={e => setLedgerFilterStation(e.target.value)} disabled={!isGlobalLevel} className="border border-amber-300 text-amber-900 font-bold rounded-lg px-2.5 py-1.5 text-xs bg-white outline-none cursor-pointer">
                    <option value="ALL STATIONS">ALL STATIONS</option>
                    {ledgerFilterRegion !== 'ALL REGIONS' && REGIONAL_HIERARCHY[ledgerFilterRegion] ? REGIONAL_HIERARCHY[ledgerFilterRegion].map(stat => <option key={stat} value={stat}>{stat}</option>) : null}
                  </select>
                </div>
                <div className="relative flex items-center min-w-[200px]">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 text-amber-700" />
                  <input type="text" placeholder="Search station, date..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-8 pr-3 py-1.5 bg-white border border-amber-300 rounded-lg text-xs font-semibold text-amber-900 outline-none focus:ring-1 focus:ring-amber-500" />
                </div>
              </div>
              <div className="flex bg-amber-900 rounded-lg p-0.5 shadow-inner border border-amber-700/50 overflow-x-auto max-w-full custom-scrollbar">
                {['TODAY', 'WEEK', 'MONTH', 'YEAR', 'ALL'].map((f) => (
                  <button key={f} onClick={() => setLockupFilter(f)} className={`px-3 py-1 text-[11px] font-extrabold uppercase rounded-md transition-colors cursor-pointer ${lockupFilter === f ? 'bg-amber-500 text-amber-950 shadow-sm' : 'text-amber-200 hover:text-white'}`}>{f}</button>
                ))}
              </div>
            </div>
            
            <div className="overflow-y-auto flex-1 custom-scrollbar bg-slate-50">
              <table className="w-full text-left border-collapse table-auto">
                <thead className="bg-amber-100 sticky top-0 border-b border-amber-200 shadow-sm z-20">
                  <tr>
                    <th rowSpan="2" className="px-3 py-3 text-[10px] font-black text-amber-900 uppercase border-r border-amber-200 text-center w-[4%]">Act</th>
                    <th rowSpan="2" className="px-3 py-3 text-[10px] font-black text-amber-900 uppercase border-r border-amber-200 min-w-[110px]">Date</th>
                    <th rowSpan="2" className="px-3 py-3 text-[10px] font-black text-amber-900 uppercase border-r border-amber-200 min-w-[140px]">Station</th>
                    <th rowSpan="2" className="px-3 py-3 text-[10px] font-black text-white uppercase bg-amber-900 border-r border-amber-800 text-center min-w-[90px]">Total Suspects</th>
                    <th colSpan="4" className="px-2 py-2 text-[10px] font-black text-amber-900 uppercase border-r border-amber-200 text-center bg-amber-200/50">SEX & AGE CATEGORY</th>
                    <th colSpan="3" className="px-2 py-2 text-[10px] font-black text-amber-900 uppercase border-r border-amber-200 text-center bg-amber-100">DURATION IN DETENTION</th>
                    <th rowSpan="2" className="px-3 py-3 text-[10px] font-black text-amber-900 uppercase text-center border-r border-amber-200 min-w-[100px]">Margin</th>
                    <th rowSpan="2" className="px-3 py-3 text-[10px] font-black text-amber-900 uppercase min-w-[140px]">Last Updated By</th>
                  </tr>
                  <tr className="bg-amber-50 border-b-2 border-amber-200">
                    <th className="px-2 py-2 text-[9px] font-extrabold text-blue-800 uppercase border-r border-amber-200 text-center bg-blue-50/50 min-w-[75px]">Male Ad</th>
                    <th className="px-2 py-2 text-[9px] font-extrabold text-indigo-800 uppercase border-r border-amber-200 text-center bg-indigo-50/50 min-w-[75px]">Male Juv</th>
                    <th className="px-2 py-2 text-[9px] font-extrabold text-pink-800 uppercase border-r border-amber-200 text-center bg-pink-50/50 min-w-[75px]">Fem Ad</th>
                    <th className="px-2 py-2 text-[9px] font-extrabold text-purple-800 uppercase border-r border-amber-200 text-center bg-purple-50/50 min-w-[75px]">Fem Juv</th>
                    <th className="px-2 py-2 text-[9px] font-extrabold text-slate-700 uppercase border-r border-amber-200 text-center min-w-[60px]">1 Day</th>
                    <th className="px-2 py-2 text-[9px] font-extrabold text-slate-700 uppercase border-r border-amber-200 text-center min-w-[60px]">2 Days</th>
                    <th className="px-2 py-2 text-[9px] font-extrabold text-slate-700 uppercase border-r border-amber-200 text-center min-w-[80px]">3+ Days</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-amber-100 bg-white">
                  {filteredLockupEntries.length > 0 ? (
                    filteredLockupEntries.map((row, idx) => (
                      <tr key={idx} className="hover:bg-amber-50/50 transition-colors">
                        <td className="px-3 py-3 text-center border-r border-slate-100">
                           <button onClick={() => populateMatrixEdit(row)} className="text-blue-600 hover:text-blue-800 p-1 bg-blue-50 rounded"><Edit size={14}/></button>
                        </td>
                        <td className="px-3 py-3 text-xs font-bold text-slate-800 border-r border-slate-100 whitespace-nowrap">{row.date}</td>
                        <td className="px-3 py-3 text-xs font-bold text-slate-600 uppercase border-r border-slate-100">{row.station}</td>
                        <td className="px-3 py-3 text-sm font-black text-amber-900 text-center bg-amber-50/30 border-r border-slate-100">{row.suspects}</td>
                        <td className="px-2 py-3 text-xs font-bold text-blue-700 text-center border-r border-slate-100 bg-blue-50/20">{row.male_count || row.male || 0}</td>
                        <td className="px-2 py-3 text-xs font-bold text-indigo-700 text-center border-r border-slate-100 bg-indigo-50/20">{row.male_juvenile_count || row.male_juvenile || 0}</td>
                        <td className="px-2 py-3 text-xs font-bold text-pink-700 text-center border-r border-slate-100 bg-pink-50/20">{row.female_count || row.female || 0}</td>
                        <td className="px-2 py-3 text-xs font-bold text-purple-700 text-center border-r border-slate-100 bg-purple-50/20">{row.female_juvenile_count || row.female_juvenile || 0}</td>
                        <td className="px-2 py-3 text-xs font-medium text-slate-700 text-center border-r border-slate-100">{row.detention_1day || 0}</td>
                        <td className="px-2 py-3 text-xs font-medium text-slate-700 text-center border-r border-slate-100">{row.detention_2days || 0}</td>
                        <td className="px-2 py-3 text-xs font-medium text-slate-700 text-center border-r border-slate-100">{row.detention_3days_over || 0}</td>
                        <td className="px-3 py-3 text-xs font-bold text-center border-r border-slate-100">
                          {row.marginStr.startsWith('+') ? <span className="text-red-600 bg-red-50 px-2 py-0.5 rounded border border-red-100 flex items-center justify-center max-w-max mx-auto"><TrendingUp className="w-3 h-3 mr-1" /> {row.marginStr}</span>
                          : row.marginStr.startsWith('-') ? <span className="text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100 flex items-center justify-center max-w-max mx-auto"><TrendingDown className="w-3 h-3 mr-1" /> {row.marginStr}</span>
                          : <span className="text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 flex items-center justify-center max-w-max mx-auto"><Minus className="w-3 h-3 mr-1" /> 0</span>}
                        </td>
                        <td className="px-3 py-3 text-[11px] font-semibold text-slate-500 uppercase">{formatOfficerDisplay(row.last_updated_by)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr><td colSpan="13" className="px-6 py-12 text-center text-sm text-slate-500 font-bold">No independent lock-up records found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="bg-slate-900 shrink-0 shadow-inner z-10 border-t border-slate-700 text-amber-300">
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
            <div className="bg-blue-50 px-6 py-3 border-b border-blue-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shrink-0">
              <div className="w-full flex flex-col gap-3">
                
                <form onSubmit={handleSuspectFormSubmit} className="bg-white p-4 rounded-xl border border-blue-200 shadow-sm text-xs">
                  <div className="flex justify-between items-center mb-3 pb-2 border-b border-blue-100">
                    <h4 className="font-black text-blue-900 uppercase flex items-center">
                      <Users className="w-4 h-4 mr-1.5 text-blue-600" /> 
                      {registerOperation === 'update' ? `Editing Suspect Record #${suspectFormInput.id}` : 'Register Detailed Suspect Data'}
                    </h4>
                    {registerOperation === 'update' && (
                      <button type="button" onClick={() => { setRegisterOperation('new'); setSuspectFormInput({...suspectFormInput, id: null, name: '', reason_for_detention: '', reference: ''}) }} className="text-red-500 font-bold hover:underline">Cancel Edit</button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
                    <div className="col-span-2 md:col-span-2"><label className="block font-bold text-slate-700 mb-1">Full Name *</label><input type="text" value={suspectFormInput.name} onChange={e => setSuspectFormInput({...suspectFormInput, name: e.target.value})} required className="w-full p-2 border rounded outline-none uppercase bg-slate-50" /></div>
                    <div><label className="block font-bold text-slate-700 mb-1">Sex</label><select value={suspectFormInput.sex} onChange={e => setSuspectFormInput({...suspectFormInput, sex: e.target.value})} className="w-full p-2 border rounded outline-none"><option>MALE</option><option>FEMALE</option></select></div>
                    <div><label className="block font-bold text-slate-700 mb-1">Age</label><input type="number" value={suspectFormInput.age} onChange={e => setSuspectFormInput({...suspectFormInput, age: e.target.value})} className="w-full p-2 border rounded outline-none" /></div>
                    <div><label className="block font-bold text-slate-700 mb-1">Tribe</label><input type="text" value={suspectFormInput.tribe} onChange={e => setSuspectFormInput({...suspectFormInput, tribe: e.target.value})} className="w-full p-2 border rounded outline-none uppercase" /></div>
                    <div><label className="block font-bold text-slate-700 mb-1">Nationality</label><input type="text" value={suspectFormInput.nationality} onChange={e => setSuspectFormInput({...suspectFormInput, nationality: e.target.value})} className="w-full p-2 border rounded outline-none uppercase" /></div>
                    
                    <div className="col-span-2"><label className="block font-bold text-slate-700 mb-1">Residence</label><input type="text" value={suspectFormInput.residence} onChange={e => setSuspectFormInput({...suspectFormInput, residence: e.target.value})} className="w-full p-2 border rounded outline-none uppercase" /></div>
                    <div className="col-span-2"><label className="block font-bold text-slate-700 mb-1">Next of Kin / Contact</label><input type="text" value={suspectFormInput.next_of_kin} onChange={e => setSuspectFormInput({...suspectFormInput, next_of_kin: e.target.value})} className="w-full p-2 border rounded outline-none uppercase" /></div>
                    <div className="col-span-2"><label className="block font-bold text-slate-700 mb-1">Reference (SD/CRB)</label><input type="text" value={suspectFormInput.reference} onChange={e => setSuspectFormInput({...suspectFormInput, reference: e.target.value})} className="w-full p-2 border rounded outline-none uppercase font-bold text-blue-700" /></div>

                    <div className="col-span-4"><label className="block font-bold text-slate-700 mb-1">Reason for Detention *</label><input type="text" value={suspectFormInput.reason_for_detention} onChange={e => setSuspectFormInput({...suspectFormInput, reason_for_detention: e.target.value})} required className="w-full p-2 border rounded outline-none uppercase" /></div>
                    
                    <div><label className="block font-bold text-slate-700 mb-1">Date In *</label><input type="date" value={suspectFormInput.date_in} onChange={e => setSuspectFormInput({...suspectFormInput, date_in: e.target.value})} required className="w-full p-2 border rounded outline-none" /></div>
                    <div><label className="block font-bold text-slate-700 mb-1">Status</label><select value={suspectFormInput.status} onChange={e => setSuspectFormInput({...suspectFormInput, status: e.target.value})} className="w-full p-2 border rounded outline-none font-bold"><option>IN CUSTODY</option><option>RELEASED ON BOND</option><option>TO COURT</option><option>TRANSFERRED</option></select></div>
                  </div>
                  <div className="flex justify-end mt-3">
                    <button type="submit" className="px-5 py-2 bg-blue-700 hover:bg-blue-800 text-white font-bold rounded shadow transition flex items-center">
                      <Save className="w-3 h-3 mr-1.5"/> {registerOperation === 'update' ? 'Save Record Updates' : 'Add to Register'}
                    </button>
                  </div>
                </form>

                {/* Filters for Register */}
                <div className="flex flex-wrap items-center gap-2">
                  <select value={registerFilterRegion} onChange={e => { setRegisterFilterRegion(e.target.value); setRegisterFilterStation('ALL STATIONS'); }} disabled={!isGlobalLevel} className="border border-blue-300 text-blue-900 font-bold rounded-lg px-2.5 py-1.5 text-xs bg-white outline-none cursor-pointer">
                    <option value="ALL REGIONS">ALL REGIONS</option>
                    {Object.keys(REGIONAL_HIERARCHY).map(reg => <option key={reg} value={reg}>{reg}</option>)}
                  </select>
                  <select value={registerFilterStation} onChange={e => setRegisterFilterStation(e.target.value)} disabled={!isGlobalLevel} className="border border-blue-300 text-blue-900 font-bold rounded-lg px-2.5 py-1.5 text-xs bg-white outline-none cursor-pointer">
                    <option value="ALL STATIONS">ALL STATIONS</option>
                    {registerFilterRegion !== 'ALL REGIONS' && REGIONAL_HIERARCHY[registerFilterRegion] ? REGIONAL_HIERARCHY[registerFilterRegion].map(stat => <option key={stat} value={stat}>{stat}</option>) : null}
                  </select>
                  <div className="relative flex items-center min-w-[200px] flex-1">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 text-blue-700" />
                    <input type="text" placeholder="Search name, reference, reason..." value={suspectSearchQuery} onChange={(e) => setSuspectSearchQuery(e.target.value)} className="w-full pl-8 pr-3 py-1.5 bg-white border border-blue-300 rounded-lg text-xs font-semibold text-blue-900 outline-none focus:ring-1 focus:ring-blue-500" />
                  </div>
                  <button type="button" onClick={handleExportSuspectRegister} className="px-3 py-1.5 bg-blue-900 text-white text-xs font-bold rounded-lg flex items-center shadow hover:bg-black transition">
                    <HardDrive className="w-3.5 h-3.5 mr-1.5" /> Export CSV
                  </button>
                </div>
              </div>
            </div>

            <div className="overflow-y-auto flex-1 custom-scrollbar bg-white">
              <table className="min-w-full divide-y divide-blue-200">
                <thead className="bg-blue-100 sticky top-0 border-b border-blue-300 z-20">
                  <tr>
                    <th className="px-3 py-3 text-[10px] font-black text-blue-900 uppercase text-center w-[4%]">Act</th>
                    <th className="px-3 py-3 text-[10px] font-black text-blue-900 uppercase">Station</th>
                    <th className="px-3 py-3 text-[10px] font-black text-blue-900 uppercase">Suspect Name</th>
                    <th className="px-2 py-3 text-[10px] font-black text-blue-900 uppercase text-center">Sex/Age</th>
                    <th className="px-3 py-3 text-[10px] font-black text-blue-900 uppercase">Demographics</th>
                    <th className="px-3 py-3 text-[10px] font-black text-blue-900 uppercase">Reference</th>
                    <th className="px-3 py-3 text-[10px] font-black text-blue-900 uppercase">Reason / Offence</th>
                    <th className="px-3 py-3 text-[10px] font-black text-blue-900 uppercase">Date In</th>
                    <th className="px-3 py-3 text-[10px] font-black text-blue-900 uppercase text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-blue-50 bg-white">
                  {suspectRecords.length > 0 ? (
                    suspectRecords.map((row, idx) => (
                      <tr key={idx} className="hover:bg-blue-50/50 transition-colors">
                        <td className="px-3 py-3 text-center border-r border-slate-100">
                           <button onClick={() => populateSuspectEdit(row)} className="text-blue-600 hover:text-blue-800 p-1 bg-blue-100 rounded"><Edit size={14}/></button>
                        </td>
                        <td className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase">{stripHtmlTags(row.station)}</td>
                        <td className="px-3 py-3 text-xs font-black text-slate-800 uppercase">{stripHtmlTags(row.name)}</td>
                        <td className="px-2 py-3 text-xs font-bold text-slate-600 text-center">{stripHtmlTags(row.sex?.charAt(0))} / {row.age || '-'}</td>
                        <td className="px-3 py-3 text-[10px] text-slate-600">
                          <span className="font-bold">{stripHtmlTags(row.nationality)}</span> ({stripHtmlTags(row.tribe)})<br/>
                          Res: {stripHtmlTags(row.residence)}
                        </td>
                        <td className="px-3 py-3 text-xs font-bold text-blue-700 whitespace-nowrap">{stripHtmlTags(row.reference)}</td>
                        <td className="px-3 py-3 text-xs font-semibold text-slate-700 uppercase max-w-[200px] truncate" title={stripHtmlTags(row.reason_for_detention)}>{stripHtmlTags(row.reason_for_detention)}</td>
                        <td className="px-3 py-3 text-xs font-mono text-slate-600 whitespace-nowrap">{stripHtmlTags(row.date_in)}</td>
                        <td className="px-3 py-3 text-center">
                          <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${row.status === 'IN CUSTODY' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
                            {stripHtmlTags(row.status)}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr><td colSpan="9" className="px-6 py-12 text-center text-sm text-slate-500 font-bold">No suspect records found.</td></tr>
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