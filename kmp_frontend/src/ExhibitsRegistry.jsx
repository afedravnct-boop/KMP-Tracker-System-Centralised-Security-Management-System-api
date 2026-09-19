import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { 
  Shield, PlusCircle, Edit, Search, X, AlertTriangle, CheckCircle, 
  Filter, HardDrive, Save, Truck, Calendar, UserCheck, Loader2, FileSpreadsheet, Lock
} from 'lucide-react';
import { stripHtmlTags } from './App';
import { authFetch, hasValidSession } from './api';

const REGIONAL_HIERARCHY = {
  "KMP NORTH": ["KAWEMPE", "KAKIRI", "KASANGATI", "MATUGGA", "NANSANA", "OLD KAMPALA", "WAKISO", "WANDEGEYA"],
  "KMP EAST": ["JINJA ROAD", "KIRA", "KIRA DIV", "KIRA ROAD", "MUKONO", "NAGGALAMA", "SEETA"],
  "KMP SOUTH": ["NATEETE", "CPS KAMPALA", "PARLIAMENT", "ENTEBBE", "KABALAGALA", "KAJJANSI", "KASENYI", "KATWE", "KYENGERA", "NSANGI"],
  "KMP HEADQUARTERS": ["KMP HEADQUARTERS", "TRAFFIC", "LOGISTICS", "FLYING SQUAD", "CRIME INTELLIGENCE", "PRO"],
  "POLICE HEADQUARTERS": ["NAGURU"]
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

const MetricCard = ({ title, value, colorClass }) => (
  <div className="bg-white dark:bg-slate-800 p-2.5 rounded-xl border border-emerald-200 dark:border-emerald-900 shadow-sm flex flex-col items-center justify-center text-center">
    <h4 className="text-[9px] font-extrabold mb-1 uppercase tracking-wider text-emerald-800 dark:text-emerald-400">{title}</h4>
    <div className={`text-base font-black leading-none ${colorClass}`}>{value}</div>
  </div>
);

const ExpandableTableCard = ({ title, children, onToggle }) => {
  const [expanded, setExpanded] = useState(false);
  return (
    <>
      {expanded && <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[9990] animate-in fade-in" />}
      <div className={expanded ? "fixed inset-4 sm:inset-10 z-[9999] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-emerald-500 flex flex-col animate-in zoom-in-95 duration-200 overflow-hidden" : "bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-emerald-200 dark:border-slate-700 overflow-hidden flex flex-col"}>
        <div className="bg-emerald-900 dark:bg-slate-950 px-5 py-3.5 border-b border-emerald-800 flex justify-between items-center shrink-0 text-white">
          <h3 className="font-extrabold text-xs uppercase tracking-wider flex items-center"><Truck size={16} className="mr-2 text-emerald-400"/> {stripHtmlTags(title)}</h3>
          <button onClick={(e) => { e.stopPropagation(); const nextState = !expanded; setExpanded(nextState); if (onToggle) onToggle(nextState); }} className="text-[11px] text-emerald-300 hover:text-white font-bold transition flex items-center bg-emerald-950 px-3 py-1 rounded-lg border border-emerald-700 cursor-pointer">
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

const ExhibitsRegistry = ({ currentUser, canViewGlobal = false, setSidebarOpen, isReadOnlyObserver = false }) => {
  const [serverExhibits, setServerExhibits] = useState([]);
  const [isFetching, setIsFetching] = useState(false);
  const [operation, setOperation] = useState('new');
  const [notification, setNotification] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [dateFilter, setDateFilter] = useState('ALL TIME');

  const canViewGlobalActive = canViewGlobal || 
    ['SUPER_ADMIN', 'ADMIN', 'RPC', 'Deputy Commander', 'ASSISTANT_SUPER_ADMIN'].includes(currentUser?.role) || 
    currentUser?.permissions?.view_global_roster === true || 
    currentUser?.permissions?.global_observer === true;

  const [filterRegion, setFilterRegion] = useState(canViewGlobalActive ? 'ALL REGIONS' : currentUser?.region || '');
  const [filterStation, setFilterStation] = useState(canViewGlobalActive ? 'ALL STATIONS' : currentUser?.station || '');

  const getTodayString = () => new Date().toLocaleDateString('en-CA').split(',')[0].replace(/\//g, '-');

  const [formData, setFormData] = useState({
    id: null,
    reg_no: '',
    type_make: 'BAJAJI',
    colour: '',
    date_in: getTodayString(),
    case_no: '',
    reason: '',
    status: 'COURT',
    unit_responsible: 'CID',
    assorted_items: 'NIL',
    comment: 'NIL',
    region: stripHtmlTags(currentUser?.region || ''),
    station: stripHtmlTags(currentUser?.station || REGIONAL_HIERARCHY[currentUser?.region]?.[0] || ''),
    date_impounded: getTodayString(),
    impounded_by_fnum: stripHtmlTags(currentUser?.fnum || ''),
    impounded_by_rank: stripHtmlTags(currentUser?.rank || ''),
    impounded_by_name: stripHtmlTags(currentUser?.name || ''),
    date_cleared: '',
    entered_by: `${stripHtmlTags(currentUser?.name || '')} (${stripHtmlTags(currentUser?.fnum || '')})`
  });

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedSearch(searchQuery), 400);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  const fetchExhibits = useCallback(async () => {
    if (!hasValidSession()) return;
    setIsFetching(true);
    try {
      const params = new URLSearchParams();
      if (filterRegion && filterRegion !== 'ALL REGIONS') params.append('region', filterRegion);
      if (filterStation && filterStation !== 'ALL STATIONS') params.append('station', filterStation);
      if (debouncedSearch) params.append('search', debouncedSearch);
      params.append('limit', '300');

      const res = await authFetch(`/api/v1/exhibits?${params.toString()}`);
      if (res && res.ok) {
        const data = await res.json();
        setServerExhibits(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error("Failed to load exhibits:", err);
    } finally {
      setIsFetching(false);
    }
  }, [filterRegion, filterStation, debouncedSearch]);

  useEffect(() => {
    fetchExhibits();
  }, [fetchExhibits]);

  const resetForm = () => {
    setFormData({
      id: null,
      reg_no: '',
      type_make: 'BAJAJI',
      colour: '',
      date_in: getTodayString(),
      case_no: '',
      reason: '',
      status: 'COURT',
      unit_responsible: 'CID',
      assorted_items: 'NIL',
      comment: 'NIL',
      region: stripHtmlTags(currentUser?.region || ''),
      station: stripHtmlTags(currentUser?.station || REGIONAL_HIERARCHY[currentUser?.region]?.[0] || ''),
      date_impounded: getTodayString(),
      impounded_by_fnum: stripHtmlTags(currentUser?.fnum || ''),
      impounded_by_rank: stripHtmlTags(currentUser?.rank || ''),
      impounded_by_name: stripHtmlTags(currentUser?.name || ''),
      date_cleared: '',
      entered_by: `${stripHtmlTags(currentUser?.name || '')} (${stripHtmlTags(currentUser?.fnum || '')})`
    });
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    const clean = stripHtmlTags(value);
    if (name === 'region') {
      setFormData(prev => ({ ...prev, region: clean, station: REGIONAL_HIERARCHY[clean]?.[0] || '' }));
    } else {
      setFormData(prev => ({ ...prev, [name]: clean.toUpperCase() }));
    }
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (isReadOnlyObserver) return alert("SECURITY RESTRICTION: Read-Only mode active.");

    if (!formData.reg_no || !formData.case_no) {
      return setNotification({ type: 'error', text: 'Registration Number and Case Number are required.' });
    }

    const payload = {
      ...formData,
      region: getOfficialRegionForStation(formData.station, formData.region),
      entered_by: `${currentUser.name} (${currentUser.fnum})`,
      timestamp: new Date().toISOString()
    };

    try {
      const endpoint = operation === 'update' && formData.id ? `/api/v1/exhibits/${formData.id}` : `/api/v1/exhibits`;
      const method = operation === 'update' && formData.id ? 'PUT' : 'POST';

      const res = await authFetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Server rejected exhibit record.");
      }

      setNotification({ type: 'success', text: operation === 'update' ? '✅ Exhibit record updated successfully!' : '✅ Exhibit successfully impounded & logged!' });
      fetchExhibits();
      setOperation('new');
      resetForm();
      setTimeout(() => setNotification(null), 4000);
    } catch (err) {
      setNotification({ type: 'error', text: `❌ ${err.message}` });
    }
  };

  const populateEditForm = (item) => {
    if (isReadOnlyObserver) return;
    setOperation('update');
    setFormData({
      ...item,
      id: item.id || item.sn
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const filteredExhibits = useMemo(() => {
    return serverExhibits.filter(item => {
      const diffDays = Math.ceil(Math.abs(new Date() - new Date(item.date_in || item.created_at)) / (1000 * 60 * 60 * 24));
      if (dateFilter === 'TODAY') {
        const todayStr = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0];
        if (item.date_in !== todayStr) return false;
      } else if (dateFilter === 'LAST 7 DAYS' && diffDays > 7) return false;
      else if (dateFilter === 'LAST 30 DAYS' && diffDays > 30) return false;
      else if (dateFilter === 'LAST 90 DAYS' && diffDays > 90) return false;
      return true;
    });
  }, [serverExhibits, dateFilter]);

  const metrics = useMemo(() => {
    return {
      total: filteredExhibits.length,
      court: filteredExhibits.filter(e => (e.status || '').toUpperCase() === 'COURT').length,
      rsa: filteredExhibits.filter(e => (e.status || '').toUpperCase() === 'RSA').length,
      motorcycles: filteredExhibits.filter(e => (e.type_make || '').toUpperCase().includes('BAJAJI') || (e.type_make || '').toUpperCase().includes('M/CYCLE')).length,
      vehicles: filteredExhibits.filter(e => !(e.type_make || '').toUpperCase().includes('BAJAJI')).length
    };
  }, [filteredExhibits]);

  return (
    <div className="p-4 max-w-[1800px] mx-auto space-y-6 relative z-10 font-sans">
      
      <div className="bg-emerald-950 text-white px-6 py-5 rounded-2xl shadow-xl flex flex-col md:flex-row items-center justify-between gap-4 border border-emerald-800">
        <div className="flex items-center space-x-4">
          <img src="/upf_badge.png" alt="UPF Logo" className="w-12 h-12 object-contain contrast-200 brightness-110 drop-shadow-md" onError={(e) => e.target.style.display = 'none'} />
          <div>
            <h1 className="text-xl font-black tracking-wide uppercase flex items-center">
              <Truck className="w-5 h-5 mr-2 text-emerald-400" /> Impounded Fleet & Exhibits Register
            </h1>
            <p className="text-xs text-emerald-300 mt-1 uppercase tracking-wider font-semibold">
              Command accounting and ledger for impounded motor vehicles, motorcycles, and property exhibits.
            </p>
          </div>
        </div>
        {isReadOnlyObserver && (
          <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-black px-3 py-1.5 rounded-lg flex items-center">
            <Lock size={13} className="mr-1.5"/> Read-Only Mode Active
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <MetricCard title="Total Exhibits" value={metrics.total} colorClass="text-emerald-900 dark:text-emerald-100" />
        <MetricCard title="Court Cases" value={metrics.court} colorClass="text-blue-700 dark:text-blue-400" />
        <MetricCard title="RSA Cases" value={metrics.rsa} colorClass="text-purple-700 dark:text-purple-400" />
        <MetricCard title="Motorcycles (Bajaji)" value={metrics.motorcycles} colorClass="text-amber-700 dark:text-amber-400" />
        <MetricCard title="Motor Vehicles" value={metrics.vehicles} colorClass="text-emerald-700 dark:text-emerald-400" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {!isReadOnlyObserver && (
          <div className="lg:col-span-4 space-y-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-emerald-200 dark:border-slate-700 overflow-hidden">
              <div className="bg-emerald-900 text-white px-4 py-3 flex justify-between items-center">
                <h3 className="font-extrabold text-xs uppercase tracking-wider flex items-center">
                  {operation === 'new' ? <PlusCircle size={15} className="mr-1.5 text-emerald-400" /> : <Edit size={15} className="mr-1.5 text-emerald-400" />}
                  {operation === 'new' ? 'Impound New Exhibit' : `Update Record #${formData.id}`}
                </h3>
                {operation === 'update' && (
                  <button type="button" onClick={() => { setOperation('new'); resetForm(); }} className="text-[11px] text-emerald-300 underline font-bold cursor-pointer">Cancel Edit</button>
                )}
              </div>

              {notification && (
                <div className={`m-3 p-2.5 rounded-lg text-xs font-bold flex items-center ${notification.type === 'error' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'}`}>
                  {notification.type === 'error' ? <AlertTriangle size={14} className="mr-2 text-red-500 shrink-0"/> : <CheckCircle size={14} className="mr-2 text-emerald-600 shrink-0"/>}
                  {notification.text}
                </div>
              )}

              <form onSubmit={handleFormSubmit} className="p-4 space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Reg No *</label>
                    <input type="text" name="reg_no" required value={formData.reg_no} onChange={handleInputChange} placeholder="e.g. UGH 190C" className="w-full border rounded p-2 uppercase font-black text-emerald-800 bg-white dark:bg-slate-800 dark:text-slate-100" />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Type (Make) *</label>
                    <input type="text" name="type_make" required value={formData.type_make} onChange={handleInputChange} placeholder="e.g. BAJAJI / NOAH" className="w-full border rounded p-2 uppercase font-bold bg-white dark:bg-slate-800 dark:text-slate-100" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Colour *</label>
                    <input type="text" name="colour" required value={formData.colour} onChange={handleInputChange} placeholder="e.g. RED / BLACK" className="w-full border rounded p-2 uppercase font-bold bg-white dark:bg-slate-800 dark:text-slate-100" />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Date In *</label>
                    <input type="date" name="date_in" required value={formData.date_in} onChange={handleInputChange} className="w-full border rounded p-2 font-bold bg-white dark:bg-slate-800 dark:text-slate-100" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Case No (SD/CRB/TAR) *</label>
                    <input type="text" name="case_no" required value={formData.case_no} onChange={handleInputChange} placeholder="e.g. CRB 030/2025" className="w-full border rounded p-2 uppercase font-bold text-blue-700 bg-white dark:bg-slate-800 dark:text-slate-100" />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Status</label>
                    <select name="status" value={formData.status} onChange={handleInputChange} className="w-full border rounded p-2 font-bold bg-white dark:bg-slate-800 dark:text-slate-100">
                      <option value="COURT">COURT</option>
                      <option value="RSA">RSA</option>
                      <option value="CLEARED">CLEARED</option>
                      <option value="FORFEITED">FORFEITED</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Reason (Offence / Context) *</label>
                  <input type="text" name="reason" required value={formData.reason} onChange={handleInputChange} placeholder="e.g. MURDER BY MOB / MONEY LAUNDERING" className="w-full border rounded p-2 uppercase font-bold bg-white dark:bg-slate-800 dark:text-slate-100" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Unit Responsible</label>
                    <input type="text" name="unit_responsible" value={formData.unit_responsible} onChange={handleInputChange} className="w-full border rounded p-2 uppercase font-bold bg-white dark:bg-slate-800 dark:text-slate-100" />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Assorted Items</label>
                    <input type="text" name="assorted_items" value={formData.assorted_items} onChange={handleInputChange} className="w-full border rounded p-2 uppercase font-bold bg-white dark:bg-slate-800 dark:text-slate-100" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Region *</label>
                    <select name="region" value={formData.region} onChange={handleInputChange} className="w-full border rounded p-2 font-bold bg-white dark:bg-slate-800 dark:text-slate-100">
                      {Object.keys(REGIONAL_HIERARCHY).map(reg => <option key={reg} value={reg}>{reg}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Station *</label>
                    <select name="station" value={formData.station} onChange={handleInputChange} className="w-full border rounded p-2 font-bold bg-white dark:bg-slate-800 dark:text-slate-100">
                      {(REGIONAL_HIERARCHY[formData.region] || []).map(stn => <option key={stn} value={stn}>{stn}</option>)}
                    </select>
                  </div>
                </div>

                <div className="bg-emerald-50 dark:bg-slate-800/60 p-3 rounded-xl border border-emerald-200 dark:border-emerald-900 space-y-2">
                  <h4 className="font-extrabold text-emerald-900 dark:text-emerald-400 uppercase text-[10px]">Command Audit Trail</h4>
                  <div className="grid grid-cols-3 gap-2">
                    <input type="text" name="impounded_by_fnum" value={formData.impounded_by_fnum} onChange={handleInputChange} placeholder="F/No" className="border rounded p-1.5 uppercase font-mono text-[11px] bg-white dark:bg-slate-800 dark:text-slate-100" title="Impounding Officer F/No" />
                    <input type="text" name="impounded_by_rank" value={formData.impounded_by_rank} onChange={handleInputChange} placeholder="Rank" className="border rounded p-1.5 uppercase font-bold text-[11px] bg-white dark:bg-slate-800 dark:text-slate-100" title="Impounding Officer Rank" />
                    <input type="text" name="impounded_by_name" value={formData.impounded_by_name} onChange={handleInputChange} placeholder="Name" className="border rounded p-1.5 uppercase font-bold text-[11px] bg-white dark:bg-slate-800 dark:text-slate-100" title="Impounding Officer Name" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 mb-0.5">Date Cleared (If Applicable)</label>
                    <input type="date" name="date_cleared" value={formData.date_cleared} onChange={handleInputChange} className="w-full border rounded p-1.5 text-xs bg-white dark:bg-slate-800 dark:text-slate-100" />
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Comment</label>
                  <input type="text" name="comment" value={formData.comment} onChange={handleInputChange} className="w-full border rounded p-2 uppercase font-bold bg-white dark:bg-slate-800 dark:text-slate-100" />
                </div>

                <button type="submit" className="w-full bg-emerald-800 hover:bg-emerald-900 text-white font-black py-3 rounded-xl shadow-md transition cursor-pointer uppercase tracking-wider text-xs flex items-center justify-center">
                  <Save size={15} className="mr-1.5"/> {operation === 'new' ? 'Commit Exhibit Record' : 'Save Record Updates'}
                </button>
              </form>
            </div>
          </div>
        )}

        <div className={isReadOnlyObserver ? "lg:col-span-12 space-y-4" : "lg:col-span-8 space-y-4"}>
          
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl shadow-sm border border-emerald-200 dark:border-slate-800 flex flex-col sm:flex-row gap-3 items-center justify-between">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
              <input 
                type="text" 
                value={searchQuery} 
                onChange={(e) => setSearchQuery(e.target.value)} 
                placeholder="Search Reg No, Type, Case No, Reason, Status..." 
                className="w-full pl-9 pr-3 py-2 border dark:border-slate-700 rounded-xl text-xs font-bold outline-none focus:border-emerald-500 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100" 
              />
              {searchQuery && <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">×</button>}
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <select value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className="border dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 outline-none cursor-pointer">
                <option value="ALL TIME">ALL TIME</option>
                <option value="TODAY">TODAY ONLY</option>
                <option value="LAST 7 DAYS">LAST 7 DAYS</option>
                <option value="LAST 30 DAYS">LAST 30 DAYS</option>
                <option value="LAST 90 DAYS">LAST 90 DAYS</option>
              </select>

              <select value={filterRegion} onChange={(e) => { setFilterRegion(stripHtmlTags(e.target.value)); setFilterStation('ALL STATIONS'); }} disabled={!canViewGlobalActive} className="border dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 disabled:opacity-50 outline-none cursor-pointer">
                {canViewGlobalActive ? (<><option value="ALL REGIONS">ALL REGIONS</option>{Object.keys(REGIONAL_HIERARCHY).map(reg => <option key={reg} value={reg}>{reg}</option>)}</>) : <option value={currentUser?.region}>{currentUser?.region}</option>}
              </select>

              <select value={filterStation} onChange={(e) => setFilterStation(stripHtmlTags(e.target.value))} disabled={!canViewGlobalActive} className="border dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 disabled:opacity-50 outline-none cursor-pointer">
                {canViewGlobalActive ? (<><option value="ALL STATIONS">ALL STATIONS</option>{filterRegion !== 'ALL REGIONS' && REGIONAL_HIERARCHY[filterRegion] ? REGIONAL_HIERARCHY[filterRegion].map(stn => <option key={stn} value={stn}>{stn}</option>) : null}</>) : <option value={currentUser?.station}>{currentUser?.station}</option>}
              </select>
            </div>
          </div>

          <ExpandableTableCard title="Impounded Fleet & Property Exhibits Ledger" onToggle={(expanded) => { setSidebarOpen?.(!expanded); }}>
            <div className="overflow-x-auto w-full max-h-[65vh] custom-scrollbar">
              <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700 text-xs whitespace-nowrap">
                <thead className="bg-emerald-900 text-white sticky top-0 z-10 font-black text-[10px]">
                  <tr>
                    <th className="px-3 py-3 text-center w-12">S/NO</th>
                    <th className="px-3 py-3 text-left">REG NO</th>
                    <th className="px-3 py-3 text-left">TYPE (MAKE)</th>
                    <th className="px-3 py-3 text-left">COLOUR</th>
                    <th className="px-3 py-3 text-center">DATE IN</th>
                    <th className="px-3 py-3 text-left">CASE NO.</th>
                    <th className="px-3 py-3 text-left">REASON</th>
                    <th className="px-3 py-3 text-center">STATUS</th>
                    <th className="px-3 py-3 text-center">UNIT RESP</th>
                    <th className="px-3 py-3 text-left">ASSORTED ITEMS</th>
                    <th className="px-3 py-3 text-left">IMPOUNDED BY</th>
                    <th className="px-3 py-3 text-left">ENTERED BY</th>
                    <th className="px-3 py-3 text-left">COMMENT</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700 font-medium">
                  {isFetching ? (
                    <tr><td colSpan="13" className="text-center py-8 text-slate-500 animate-pulse"><Loader2 className="w-6 h-6 mx-auto animate-spin mb-2 text-emerald-600" /> Syncing exhibit records...</td></tr>
                  ) : filteredExhibits.length === 0 ? (
                    <tr><td colSpan="13" className="text-center py-8 text-slate-400 font-bold">No impounded fleet or exhibits found matching your filters.</td></tr>
                  ) : (
                    filteredExhibits.map((item, index) => (
                      <tr key={item.id || item.sn || index} onClick={() => populateEditForm(item)} className="hover:bg-emerald-50/60 dark:hover:bg-slate-800 transition-colors cursor-pointer group">
                        <td className="px-3 py-2.5 text-center font-black">{index + 1}</td>
                        <td className="px-3 py-2.5 font-extrabold text-emerald-800 dark:text-emerald-400">{stripHtmlTags(item.reg_no)}</td>
                        <td className="px-3 py-2.5 font-bold uppercase">{stripHtmlTags(item.type_make)}</td>
                        <td className="px-3 py-2.5 uppercase">{stripHtmlTags(item.colour)}</td>
                        <td className="px-3 py-2.5 text-center font-mono">{stripHtmlTags(item.date_in)}</td>
                        <td className="px-3 py-2.5 font-extrabold text-blue-700 dark:text-blue-400">{stripHtmlTags(item.case_no)}</td>
                        <td className="px-3 py-2.5 uppercase font-semibold">{stripHtmlTags(item.reason)}</td>
                        <td className="px-3 py-2.5 text-center">
                          <span className={`px-2 py-0.5 rounded-full font-extrabold text-[9px] ${
                            (item.status || '').toUpperCase() === 'COURT' ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300' :
                            (item.status || '').toUpperCase() === 'RSA' ? 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300' :
                            'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                          }`}>
                            {stripHtmlTags(item.status)}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-center font-bold">{stripHtmlTags(item.unit_responsible)}</td>
                        <td className="px-3 py-2.5">{stripHtmlTags(item.assorted_items || 'NIL')}</td>
                        <td className="px-3 py-2.5 text-[11px] font-semibold">{item.impounded_by_rank ? `${item.impounded_by_rank} ${item.impounded_by_name} (${item.impounded_by_fnum})` : 'N/A'}</td>
                        <td className="px-3 py-2.5 text-[10px] text-slate-500">{stripHtmlTags(item.entered_by)}</td>
                        <td className="px-3 py-2.5 italic text-slate-600 dark:text-slate-400">{stripHtmlTags(item.comment || 'NIL')}</td>
                      </tr>
                    ))
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

export default ExhibitsRegistry;