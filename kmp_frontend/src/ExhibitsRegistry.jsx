import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Shield, PlusCircle, Edit, Search, X, AlertTriangle, CheckCircle, 
  Filter, Save, Truck, Loader2, Lock, RefreshCw, Box
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

// 🟢 Standardized Dropdowns
const CASE_REF_TYPES = ['SD REF:', 'CRB:', 'TAR:', 'GEF:', 'DEF:'];
const STATUS_OPTIONS = ['UNDER INVESTIGATION', 'PENDING COURT', 'IN COURT', 'UNCLAIMED', 'FORFEITED', 'CLEARED', 'DISPOSED BY COURT', 'CUSTOM'];
const POLICE_UNITS = [
  '1ST DIV', '999 ERU', 'ASTU', 'CI', 'CID', 'CT', 'DIS', 'EPPU', 'FFU', 'FIRE', 'FLYING SQUAD', 'FSU', 
  'G/DUTIES', 'IHP', 'JAT', 'MILITARY POLICE', 'MINERAL POLICE', 'MOTORCYCLE SQUAD', 'PARLIAMENTARY POLICE', 'PPG', 'SFC', 'SHACU', 'TRAFFIC'
].sort();

// 🟢 NEW: Broadened Exhibit Categories
const EXHIBIT_CATEGORIES = [
  'MOTOR VEHICLE', 'MOTORCYCLE', 'BICYCLE', 'WATERCRAFT/BOAT', 
  'ELECTRONICS/COMPUTER', 'CURRENCY/MONEY', 'CLOTHING/APPAREL', 
  'DOCUMENTS/IDs', 'WEAPON/FIREARM', 'CONTRABAND/DRUGS', 'OTHER'
];

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
    <h4 className="text-[9px] font-extrabold mb-1 uppercase tracking-wider text-emerald-800 dark:text-emerald-400 truncate w-full">{title}</h4>
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
          <h3 className="font-extrabold text-xs uppercase tracking-wider flex items-center"><Box size={16} className="mr-2 text-emerald-400"/> {stripHtmlTags(title)}</h3>
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

const ExhibitsRegistry = ({ currentUser, canViewGlobal = false, setSidebarOpen = () => {}, isReadOnlyObserver = false }) => {
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
  
  const [filterCaseType, setFilterCaseType] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [filterUnit, setFilterUnit] = useState('ALL');
  
  const [customStatusInput, setCustomStatusInput] = useState('');

  const getTodayString = () => new Date().toLocaleDateString('en-CA').split(',')[0].replace(/\//g, '-');

  const [formData, setFormData] = useState({
    id: null,
    category: 'MOTOR VEHICLE', // 🟢 New Field
    reg_no: '',
    type_make: '',
    colour: '',
    date_impounded: getTodayString(),
    case_no_prefix: '',
    case_no_value: '',
    reason: '',
    status: 'UNDER INVESTIGATION',
    unit_responsible: 'CID',
    assorted_items: 'NIL',
    comment: 'NIL',
    region: stripHtmlTags(currentUser?.region || ''),
    station: stripHtmlTags(currentUser?.station || REGIONAL_HIERARCHY[currentUser?.region]?.[0] || ''),
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
    setOperation('new');
    setFormData({
      id: null,
      category: 'MOTOR VEHICLE',
      reg_no: '',
      type_make: '',
      colour: '',
      date_impounded: getTodayString(),
      case_no_prefix: '',
      case_no_value: '',
      reason: '',
      status: 'UNDER INVESTIGATION',
      unit_responsible: 'CID',
      assorted_items: 'NIL',
      comment: 'NIL',
      region: stripHtmlTags(currentUser?.region || ''),
      station: stripHtmlTags(currentUser?.station || REGIONAL_HIERARCHY[currentUser?.region]?.[0] || ''),
      impounded_by_fnum: stripHtmlTags(currentUser?.fnum || ''),
      impounded_by_rank: stripHtmlTags(currentUser?.rank || ''),
      impounded_by_name: stripHtmlTags(currentUser?.name || ''),
      date_cleared: '',
      entered_by: `${stripHtmlTags(currentUser?.name || '')} (${stripHtmlTags(currentUser?.fnum || '')})`
    });
    setCustomStatusInput('');
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    const clean = stripHtmlTags(value);
    
    if (name === 'status' && clean === 'CUSTOM') {
      setFormData(prev => ({ ...prev, status: 'CUSTOM' }));
      return;
    }

    if (name === 'region') {
      setFormData(prev => ({ ...prev, region: clean, station: REGIONAL_HIERARCHY[clean]?.[0] || '' }));
    } else {
      setFormData(prev => ({ ...prev, [name]: clean.toUpperCase() }));
    }
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (isReadOnlyObserver) return alert("SECURITY RESTRICTION: Read-Only mode active.");

    const finalCaseNo = formData.case_no_prefix 
      ? `${formData.case_no_prefix} ${formData.case_no_value}`.trim() 
      : formData.case_no_value.trim();

    if (!finalCaseNo || !formData.type_make) {
      return setNotification({ type: 'error', text: 'Item Description and Case Number are required.' });
    }

    const finalStatus = formData.status === 'CUSTOM' ? customStatusInput.toUpperCase() : formData.status;

    const payload = {
      ...formData,
      reg_no: formData.reg_no.trim() || 'NIL', // Default to NIL if blank
      case_no: finalCaseNo,
      status: finalStatus,
      region: getOfficialRegionForStation(formData.station, formData.region),
      entered_by: `${currentUser.name} (${currentUser.fnum})`,
      timestamp: new Date().toISOString(),
      date_cleared: formData.date_cleared === '' ? null : formData.date_cleared
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
      resetForm();
      setTimeout(() => setNotification(null), 4000);
    } catch (err) {
      setNotification({ type: 'error', text: `❌ ${err.message}` });
    }
  };

  const populateEditForm = (item) => {
    if (isReadOnlyObserver) return;
    setOperation('update');
    
    let isStandardStatus = STATUS_OPTIONS.includes((item.status || '').toUpperCase());
    
    let extractedPrefix = '';
    let extractedValue = item.case_no || '';
    
    const basePrefixes = ['SD REF', 'CRB', 'TAR', 'GEF', 'DEF'];
    const matchingBase = basePrefixes.find(p => extractedValue.toUpperCase().startsWith(p));
    
    if (matchingBase) {
      extractedPrefix = matchingBase + ':';
      extractedValue = extractedValue.substring(matchingBase.length).trim();
      if (extractedValue.startsWith(':') || extractedValue.startsWith('-')) {
        extractedValue = extractedValue.substring(1).trim();
      }
    }

    // 🟢 Smart Fallback Parsing: If DB doesn't have a category column, try to split it from type_make
    let extractedCategory = item.category || 'MOTOR VEHICLE';
    let extractedTypeMake = item.type_make || '';
    
    if (!item.category && extractedTypeMake.includes(' - ')) {
      const parts = extractedTypeMake.split(' - ');
      if (EXHIBIT_CATEGORIES.includes(parts[0].trim())) {
        extractedCategory = parts[0].trim();
        extractedTypeMake = parts.slice(1).join(' - ').trim();
      }
    }

    setFormData({
      ...item,
      id: item.id || item.sn,
      category: extractedCategory,
      type_make: extractedTypeMake,
      status: isStandardStatus ? item.status : 'CUSTOM',
      date_cleared: item.date_cleared || '',
      case_no_prefix: extractedPrefix,
      case_no_value: extractedValue
    });
    
    if (!isStandardStatus) {
      setCustomStatusInput(item.status);
    }
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const filteredExhibits = useMemo(() => {
    return serverExhibits.filter(item => {
      const diffDays = Math.ceil(Math.abs(new Date() - new Date(item.date_impounded || item.created_at)) / (1000 * 60 * 60 * 24));
      if (dateFilter === 'TODAY') {
        const todayStr = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0];
        if (item.date_impounded !== todayStr) return false;
      } else if (dateFilter === 'LAST 7 DAYS' && diffDays > 7) return false;
      else if (dateFilter === 'LAST 30 DAYS' && diffDays > 30) return false;
      else if (dateFilter === 'LAST 90 DAYS' && diffDays > 90) return false;

      if (filterCaseType !== 'ALL') {
        const baseCaseType = filterCaseType.replace(':', '');
        if (!(item.case_no || '').toUpperCase().startsWith(baseCaseType)) return false;
      }

      if (filterStatus !== 'ALL') {
        if (filterStatus === 'CUSTOM') {
          if (STATUS_OPTIONS.includes((item.status || '').toUpperCase())) return false;
        } else if ((item.status || '').toUpperCase() !== filterStatus) {
          return false;
        }
      }

      if (filterUnit !== 'ALL' && (item.unit_responsible || '').toUpperCase() !== filterUnit) return false;

      return true;
    });
  }, [serverExhibits, dateFilter, filterCaseType, filterStatus, filterUnit]);

  const metrics = useMemo(() => {
    const getCount = (statusName) => 
      filteredExhibits.filter(e => (e.status || '').toUpperCase() === statusName).length;

    return {
      total: filteredExhibits.length,
      investigating: getCount('UNDER INVESTIGATION'),
      pendingCourt: getCount('PENDING COURT'),
      inCourt: getCount('IN COURT'),
      unclaimed: getCount('UNCLAIMED'),
      forfeited: getCount('FORFEITED'),
      cleared: getCount('CLEARED'),
      disposed: getCount('DISPOSED BY COURT')
    };
  }, [filteredExhibits]);

  // 🟢 Dynamic Placeholders based on category
  const getRegPlaceholder = () => {
    if (['MOTOR VEHICLE', 'MOTORCYCLE'].includes(formData.category)) return "e.g. UGH 190C";
    if (formData.category === 'ELECTRONICS/COMPUTER') return "e.g. SERIAL NUMBER / MAC ADDRESS";
    if (formData.category === 'CURRENCY/MONEY') return "e.g. BATCH NO / TRACE ID (Or type NIL)";
    if (formData.category === 'WATERCRAFT/BOAT') return "e.g. REGISTRATION NO / HULL ID";
    return "e.g. SERIAL NO OR 'NIL'";
  };

  return (
    <div className="p-4 max-w-[1800px] mx-auto space-y-6 relative z-10 font-sans">
      
      <div className="bg-emerald-950 text-white px-6 py-5 rounded-2xl shadow-xl flex flex-col md:flex-row items-center justify-between gap-4 border border-emerald-800">
        <div className="flex items-center space-x-4">
          <img src="/upf_badge.png" alt="UPF Logo" className="w-12 h-12 object-contain contrast-200 brightness-110 drop-shadow-md" onError={(e) => e.target.style.display = 'none'} />
          <div>
            <h1 className="text-xl font-black tracking-wide uppercase flex items-center">
              <Box className="w-5 h-5 mr-2 text-emerald-400" /> Impounded Fleet & Exhibits Register
            </h1>
            <p className="text-xs text-emerald-300 mt-1 uppercase tracking-wider font-semibold">
              Command accounting and ledger for all impounded vehicles, electronics, currency, and property exhibits.
            </p>
          </div>
        </div>
        {isReadOnlyObserver && (
          <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-black px-3 py-1.5 rounded-lg flex items-center">
            <Lock size={13} className="mr-1.5"/> Read-Only Mode Active
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-2.5">
        <MetricCard title="Total Exhibits" value={metrics.total} colorClass="text-emerald-950 dark:text-emerald-100" />
        <MetricCard title="Under Investigation" value={metrics.investigating} colorClass="text-purple-700 dark:text-purple-400" />
        <MetricCard title="Pending Court" value={metrics.pendingCourt} colorClass="text-indigo-700 dark:text-indigo-400" />
        <MetricCard title="In Court" value={metrics.inCourt} colorClass="text-blue-700 dark:text-blue-400" />
        <MetricCard title="Unclaimed" value={metrics.unclaimed} colorClass="text-slate-700 dark:text-slate-300" />
        <MetricCard title="Forfeited" value={metrics.forfeited} colorClass="text-red-700 dark:text-red-400" />
        <MetricCard title="Cleared" value={metrics.cleared} colorClass="text-emerald-700 dark:text-emerald-400" />
        <MetricCard title="Disposed By Court" value={metrics.disposed} colorClass="text-teal-700 dark:text-teal-400" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {!isReadOnlyObserver && (
          <div className="lg:col-span-4 space-y-4">
            <div className={`rounded-2xl shadow-sm border overflow-hidden transition-colors ${operation === 'update' ? 'bg-amber-50 border-amber-300 dark:bg-amber-950/20 dark:border-amber-700/50' : 'bg-white dark:bg-slate-900 border-emerald-200 dark:border-slate-700'}`}>
              <div className={`px-4 py-3 flex justify-between items-center ${operation === 'update' ? 'bg-amber-700 text-white' : 'bg-emerald-900 text-white'}`}>
                <h3 className="font-extrabold text-xs uppercase tracking-wider flex items-center">
                  {operation === 'new' ? <PlusCircle size={15} className="mr-1.5" /> : <Edit size={15} className="mr-1.5" />}
                  {operation === 'new' ? 'Impound New Exhibit' : `Updating Record #${formData.id}`}
                </h3>
                {operation === 'update' && (
                  <button type="button" onClick={resetForm} className="text-[10px] bg-white/20 hover:bg-white/30 text-white px-2 py-1 rounded font-bold cursor-pointer flex items-center transition-colors">
                    <RefreshCw size={12} className="mr-1"/> Switch to New Entry
                  </button>
                )}
              </div>

              {notification && (
                <div className={`m-3 p-2.5 rounded-lg text-xs font-bold flex items-center ${notification.type === 'error' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'}`}>
                  {notification.type === 'error' ? <AlertTriangle size={14} className="mr-2 text-red-500 shrink-0"/> : <CheckCircle size={14} className="mr-2 text-emerald-600 shrink-0"/>}
                  {notification.text}
                </div>
              )}

              <form onSubmit={handleFormSubmit} className="p-4 space-y-3 text-xs">
                
                {/* 🟢 NEW CATEGORY FIELD */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-1">
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Exhibit Category *</label>
                    <select name="category" value={formData.category} onChange={handleInputChange} className="w-full border rounded-lg p-2 font-bold bg-emerald-50 dark:bg-slate-800 text-emerald-900 dark:text-emerald-100 border-emerald-300 dark:border-slate-600 outline-none focus:ring-2 focus:ring-emerald-500">
                      {EXHIBIT_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Date In *</label>
                    <input type="date" name="date_impounded" required value={formData.date_impounded} onChange={handleInputChange} className="w-full border rounded-lg p-2 font-bold bg-white dark:bg-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500" />
                  </div>
                </div>

                {/* 🟢 BROADENED ITEM IDENTIFICATION */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1" title="Leave blank or type NIL if no identifier exists">Identifier (Reg / Serial) </label>
                    <input type="text" name="reg_no" value={formData.reg_no} onChange={handleInputChange} placeholder={getRegPlaceholder()} className="w-full border rounded-lg p-2 uppercase font-black text-emerald-800 bg-white dark:bg-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500" />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Item Desc (Make/Type) *</label>
                    <input type="text" name="type_make" required value={formData.type_make} onChange={handleInputChange} placeholder="e.g. DELL LAPTOP / 50K NOTES" className="w-full border rounded-lg p-2 uppercase font-bold bg-white dark:bg-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500" />
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Colour / Physical Features *</label>
                  <input type="text" name="colour" required value={formData.colour} onChange={handleInputChange} placeholder="e.g. SILVER WITH CRACKED SCREEN / RED" className="w-full border rounded-lg p-2 uppercase font-bold bg-white dark:bg-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Case No (SD/CRB/TAR) *</label>
                    <div className="flex shadow-sm rounded-lg">
                      <select 
                        name="case_no_prefix" 
                        value={formData.case_no_prefix} 
                        onChange={handleInputChange} 
                        className="border border-r-0 rounded-l-lg p-2 bg-slate-100 dark:bg-slate-700 font-bold text-slate-700 dark:text-slate-200 outline-none cursor-pointer"
                      >
                        <option value="">No Prefix</option>
                        {CASE_REF_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
                      </select>
                      <input 
                        type="text" 
                        name="case_no_value" 
                        required 
                        value={formData.case_no_value} 
                        onChange={handleInputChange} 
                        placeholder="e.g. 030/2026" 
                        className="w-full border rounded-r-lg p-2 uppercase font-bold text-blue-700 bg-white dark:bg-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500" 
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Reason (Offence / Context) *</label>
                  <input type="text" name="reason" required value={formData.reason} onChange={handleInputChange} placeholder="e.g. MURDER BY MOB / MONEY LAUNDERING" className="w-full border rounded-lg p-2 uppercase font-bold bg-white dark:bg-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Status</label>
                    <select name="status" value={formData.status} onChange={handleInputChange} className="w-full border rounded-lg p-2 font-bold bg-white dark:bg-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500">
                      {STATUS_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                    {formData.status === 'CUSTOM' && (
                      <input type="text" placeholder="Specify Status" value={customStatusInput} onChange={(e) => setCustomStatusInput(e.target.value)} required className="w-full border rounded-lg p-2 mt-1 uppercase font-bold bg-amber-50 dark:bg-slate-700 outline-none focus:ring-2 focus:ring-amber-500" />
                    )}
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Unit Responsible</label>
                    <select name="unit_responsible" value={formData.unit_responsible} onChange={handleInputChange} className="w-full border rounded-lg p-2 font-bold bg-white dark:bg-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500">
                      <option value="GENERAL">GENERAL POLICE</option>
                      {POLICE_UNITS.map(unit => <option key={unit} value={unit}>{unit}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Assorted Items / Accessories</label>
                  <input type="text" name="assorted_items" value={formData.assorted_items} onChange={handleInputChange} placeholder="e.g. KEYS / CHARGER" className="w-full border rounded-lg p-2 uppercase font-bold bg-white dark:bg-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Region *</label>
                    <select name="region" value={formData.region} onChange={handleInputChange} className="w-full border rounded-lg p-2 font-bold bg-white dark:bg-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500">
                      {Object.keys(REGIONAL_HIERARCHY).map(reg => <option key={reg} value={reg}>{reg}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Station *</label>
                    <select name="station" value={formData.station} onChange={handleInputChange} className="w-full border rounded-lg p-2 font-bold bg-white dark:bg-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500">
                      {(REGIONAL_HIERARCHY[formData.region] || []).map(stn => <option key={stn} value={stn}>{stn}</option>)}
                    </select>
                  </div>
                </div>

                <div className="bg-emerald-50 dark:bg-slate-800/60 p-3 rounded-xl border border-emerald-200 dark:border-emerald-900 space-y-2">
                  <h4 className="font-extrabold text-emerald-900 dark:text-emerald-400 uppercase text-[10px]">Command Audit Trail</h4>
                  <div className="grid grid-cols-3 gap-2">
                    <input type="text" name="impounded_by_fnum" value={formData.impounded_by_fnum} onChange={handleInputChange} placeholder="F/No" className="border rounded p-1.5 uppercase font-mono text-[11px] bg-white dark:bg-slate-800 dark:text-slate-100 outline-none" title="Impounding Officer F/No" />
                    <input type="text" name="impounded_by_rank" value={formData.impounded_by_rank} onChange={handleInputChange} placeholder="Rank" className="border rounded p-1.5 uppercase font-bold text-[11px] bg-white dark:bg-slate-800 dark:text-slate-100 outline-none" title="Impounding Officer Rank" />
                    <input type="text" name="impounded_by_name" value={formData.impounded_by_name} onChange={handleInputChange} placeholder="Name" className="border rounded p-1.5 uppercase font-bold text-[11px] bg-white dark:bg-slate-800 dark:text-slate-100 outline-none" title="Impounding Officer Name" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 mb-0.5">Date Cleared (Update Later)</label>
                    <input type="date" name="date_cleared" value={formData.date_cleared} onChange={handleInputChange} className="w-full border rounded p-1.5 text-xs bg-white dark:bg-slate-800 dark:text-slate-100 outline-none" />
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Comment</label>
                  <input type="text" name="comment" value={formData.comment} onChange={handleInputChange} className="w-full border rounded-lg p-2 uppercase font-bold bg-white dark:bg-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500" />
                </div>

                <button type="submit" className={`w-full text-white font-black py-3 rounded-xl shadow-md transition cursor-pointer uppercase tracking-wider text-xs flex items-center justify-center ${operation === 'update' ? 'bg-amber-700 hover:bg-amber-800' : 'bg-emerald-800 hover:bg-emerald-900'}`}>
                  <Save size={15} className="mr-1.5"/> {operation === 'new' ? 'Commit Exhibit Record' : 'Save Record Updates'}
                </button>
              </form>
            </div>
          </div>
        )}

        <div className={isReadOnlyObserver ? "lg:col-span-12 space-y-4" : "lg:col-span-8 space-y-4"}>
          
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl shadow-sm border border-emerald-200 dark:border-slate-800 flex flex-col gap-3">
            
            <div className="flex flex-col sm:flex-row gap-3 items-center justify-between w-full">
              <div className="relative flex-1 w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                <input 
                  type="text" 
                  value={searchQuery} 
                  onChange={(e) => setSearchQuery(e.target.value)} 
                  placeholder="Search Reg No, Category, Serial, Case No, Reason..." 
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

            <div className="flex flex-wrap items-center gap-2 border-t dark:border-slate-800 pt-3">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider flex items-center"><Filter size={12} className="mr-1"/> Logic Filters:</span>
              
              <select value={filterCaseType} onChange={(e) => setFilterCaseType(e.target.value)} className="border dark:border-slate-700 rounded-lg px-2 py-1.5 text-[11px] font-bold bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 outline-none cursor-pointer shadow-sm">
                <option value="ALL">ANY CASE TYPE</option>
                {CASE_REF_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
              </select>

              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="border dark:border-slate-700 rounded-lg px-2 py-1.5 text-[11px] font-bold bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 outline-none cursor-pointer shadow-sm">
                <option value="ALL">ANY STATUS</option>
                {STATUS_OPTIONS.map(status => <option key={status} value={status}>{status}</option>)}
              </select>

              <select value={filterUnit} onChange={(e) => setFilterUnit(e.target.value)} className="border dark:border-slate-700 rounded-lg px-2 py-1.5 text-[11px] font-bold bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 outline-none cursor-pointer shadow-sm">
                <option value="ALL">ANY UNIT RESPONSIBLE</option>
                {POLICE_UNITS.map(unit => <option key={unit} value={unit}>{unit}</option>)}
              </select>

              {(filterCaseType !== 'ALL' || filterStatus !== 'ALL' || filterUnit !== 'ALL') && (
                <button onClick={() => { setFilterCaseType('ALL'); setFilterStatus('ALL'); setFilterUnit('ALL'); }} className="text-[10px] text-red-500 font-bold hover:underline cursor-pointer ml-auto flex items-center">
                  <X size={10} className="mr-1"/> Clear Advanced
                </button>
              )}
            </div>

          </div>

          <ExpandableTableCard title="Impounded Fleet & Property Exhibits Ledger" onToggle={(expanded) => { setSidebarOpen?.(!expanded); }}>
            <div className="overflow-x-auto w-full max-h-[65vh] custom-scrollbar">
              <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700 text-xs whitespace-nowrap">
                <thead className="bg-emerald-900 text-white sticky top-0 z-10 font-black text-[10px]">
                  <tr>
                    <th className="px-3 py-3 text-center w-12">S/NO</th>
                    {/* 🟢 Updated Table Headers to reflect categories */}
                    <th className="px-3 py-3 text-left">IDENTIFIER (REG/SERIAL)</th>
                    <th className="px-3 py-3 text-left">CATEGORY</th>
                    <th className="px-3 py-3 text-left">DESCRIPTION</th>
                    <th className="px-3 py-3 text-left">COLOUR/FEATURES</th>
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
                    <tr><td colSpan="14" className="text-center py-8 text-slate-500 animate-pulse"><Loader2 className="w-6 h-6 mx-auto animate-spin mb-2 text-emerald-600" /> Syncing exhibit records...</td></tr>
                  ) : filteredExhibits.length === 0 ? (
                    <tr><td colSpan="14" className="text-center py-8 text-slate-400 font-bold">No impounded fleet or exhibits found matching your filters.</td></tr>
                  ) : (
                    filteredExhibits.map((item, index) => {
                      
                      // 🟢 Safe Display parsing for Category & Description
                      let displayCategory = item.category || 'MOTOR VEHICLE';
                      let displayType = stripHtmlTags(item.type_make);
                      if (!item.category && displayType.includes(' - ')) {
                        const parts = displayType.split(' - ');
                        if (EXHIBIT_CATEGORIES.includes(parts[0].trim())) {
                          displayCategory = parts[0].trim();
                          displayType = parts.slice(1).join(' - ').trim();
                        }
                      }

                      return (
                      <tr key={item.id || item.sn || index} onClick={() => populateEditForm(item)} title="Click to edit this record" className="hover:bg-amber-50 dark:hover:bg-slate-800 transition-colors cursor-pointer group">
                        <td className="px-3 py-2.5 text-center font-black">{index + 1}</td>
                        <td className="px-3 py-2.5 font-extrabold text-emerald-800 dark:text-emerald-400 group-hover:text-amber-700">{stripHtmlTags(item.reg_no)}</td>
                        
                        {/* 🟢 Render Category and Description */}
                        <td className="px-3 py-2.5 font-black text-[10px] text-slate-500">{displayCategory}</td>
                        <td className="px-3 py-2.5 font-bold uppercase">{displayType}</td>
                        
                        <td className="px-3 py-2.5 uppercase">{stripHtmlTags(item.colour)}</td>
                        <td className="px-3 py-2.5 text-center font-mono">{stripHtmlTags(item.date_impounded)}</td>
                        <td className="px-3 py-2.5 font-extrabold text-blue-700 dark:text-blue-400">{stripHtmlTags(item.case_no)}</td>
                        <td className="px-3 py-2.5 uppercase font-semibold">{stripHtmlTags(item.reason)}</td>
                        <td className="px-3 py-2.5 text-center">
                          <span className={`px-2 py-0.5 rounded-full font-extrabold text-[9px] ${
                            (item.status || '').toUpperCase() === 'IN COURT' ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300' :
                            (item.status || '').toUpperCase() === 'PENDING COURT' ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300' :
                            (item.status || '').toUpperCase() === 'UNDER INVESTIGATION' ? 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300' :
                            (item.status || '').toUpperCase() === 'CLEARED' || (item.status || '').toUpperCase() === 'DISPOSED BY COURT' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' :
                            (item.status || '').toUpperCase() === 'FORFEITED' ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300' :
                            'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
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
                    )})
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