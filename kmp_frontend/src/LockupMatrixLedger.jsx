import React, { useState, useMemo } from 'react';
import { X, Filter, TrendingUp, TrendingDown, Minus, PlusCircle, Shield, CheckCircle, AlertTriangle, Search, ChevronDown, ChevronUp, Calendar } from 'lucide-react';
import { authFetch } from './api';

const REGIONAL_HIERARCHY = {
  "KMP NORTH": ["KMP NORTH HEADQUARTERS", "KMP NORTH", "KAWEMPE", "KAKIRI", "KASANGATI", "MATUGGA", "NANSANA", "OLD KAMPALA", "WAKISO", "WANDEGEYA"],
  "KMP EAST": ["KMP EAST HEADQUARTERS", "KMP EAST", "JINJA ROAD", "KIRA", "KIRA DIV", "KIRA ROAD", "MUKONO", "NAGGALAMA", "SEETA"],
  "KMP SOUTH": ["KMP SOUTH HEADQUARTERS", "KMP SOUTH", "NATEETE", "CPS KAMPALA", "PARLIAMENT", "ENTEBBE", "KABALAGALA", "KAJJANSI", "KASENYI", "KATWE", "KYENGERA", "NSANGI"],
  "KMP HEADQUARTERS": ["KMP HEADQUARTERS", "KMP CID", "KMP TRAFFIC", "KMP ICT", "KMP FLYING SQUAD", "KMP CRIME INTELLIGENCE"],
  "POLICE HEADQUARTERS": ["NAGURU", "OPERATIONS", "CRIME INTELLIGENCE", "CID", "LOGISTICS & ENGINEERING", "ICT", "CT", "FIRE & RESCUE"]
};

const stripHtml = (html) => {
  if (!html) return '';
  return String(html).replace(/<[^>]*>?/gm, '').trim();
};

const isStationEquivalent = (statA, statB) => {
  const a = stripHtml(statA || '').trim().toUpperCase();
  const b = stripHtml(statB || '').trim().toUpperCase();
  if (!a || !b) return false;
  if (a === b) return true;

  const cleanA = a.replace(/(\s+HEADQUARTERS|\s+HQ)$/, '');
  const cleanB = b.replace(/(\s+HEADQUARTERS|\s+HQ)$/, '');

  return cleanA === cleanB && cleanA.length > 0;
};

const getOfficialRegionForStation = (stationName, dbRegion) => {
  const cleanStation = stripHtml(stationName || '').trim().toUpperCase();
  const cleanDbRegion = stripHtml(dbRegion || '').trim().toUpperCase();

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

const LockupMatrixLedger = ({ lockupEntries, allTimeLockupTotal, onClose, selectedRegion, selectedStation, currentUser, onRefreshData }) => {
  const [lockupFilter, setLockupFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('LOG_FORM'); 
  const [notification, setNotification] = useState(null);

  // Collapsible dropdown state for historical entries grouped by date/day
  const [expandedDates, setExpandedDates] = useState({});

  const [ledgerFilterRegion, setLedgerFilterRegion] = useState(selectedRegion || 'ALL REGIONS');
  const [ledgerFilterStation, setLedgerFilterStation] = useState(selectedStation || 'ALL STATIONS');

  const [formInput, setFormInput] = useState({
    station: currentUser?.station || 'CPS KAMPALA',
    region: currentUser?.region || 'KMP SOUTH',
    suspects: '',
    male_count: '',
    male_juvenile_count: '',
    female_count: '',
    female_juvenile_count: '',
    detention_1day: '',
    detention_2days: '',
    detention_3days_over: ''
  });

  const formatOfficerDisplay = (str) => {
    if (!str) return 'SYSTEM';
    return String(str).toUpperCase();
  };

  const toggleDateCollapse = (dateStr) => {
    setExpandedDates(prev => ({
      ...prev,
      [dateStr]: !prev[dateStr]
    }));
  };

  const filteredLockupEntries = useMemo(() => {
    let filtered = Array.isArray(lockupEntries) ? [...lockupEntries] : [];

    filtered = filtered.filter(row => {
      const stn = stripHtml(row.station || '').trim().toUpperCase();
      const reg = getOfficialRegionForStation(stn, row.region);

      if (ledgerFilterRegion && ledgerFilterRegion !== 'ALL REGIONS') {
        const cleanTargetRegion = ledgerFilterRegion.trim().toUpperCase();
        const belongsToRegion = reg === cleanTargetRegion || 
                                (REGIONAL_HIERARCHY[cleanTargetRegion] && REGIONAL_HIERARCHY[cleanTargetRegion].some(s => isStationEquivalent(s, stn)));
        if (!belongsToRegion) return false;
      }

      if (ledgerFilterStation && ledgerFilterStation !== 'ALL STATIONS') {
        const cleanTargetStation = ledgerFilterStation.trim().toUpperCase();
        if (!isStationEquivalent(stn, cleanTargetStation)) return false;
      }

      // Back-search query filter across station, region, or updated signature
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toUpperCase();
        const matchStation = stn.includes(query);
        const matchRegion = reg.includes(query);
        const matchSignature = stripHtml(row.last_updated_by || '').toUpperCase().includes(query);
        const matchDate = stripHtml(row.date || '').toUpperCase().includes(query);
        if (!matchStation && !matchRegion && !matchSignature && !matchDate) return false;
      }

      return true;
    });

    if (lockupFilter !== 'ALL') {
      const today = new Date();
      const tzOffset = today.getTimezoneOffset() * 60000; 
      const localToday = new Date(today.getTime() - tzOffset);
      const todayStr = localToday.toISOString().split('T')[0];
      
      const weekAgo = new Date(localToday);
      weekAgo.setDate(weekAgo.getDate() - 7);
      const weekStr = weekAgo.toISOString().split('T')[0];
      
      const monthAgo = new Date(localToday);
      monthAgo.setDate(monthAgo.getDate() - 30);
      const monthStr = monthAgo.toISOString().split('T')[0];
      
      const yearAgo = new Date(localToday);
      yearAgo.setDate(yearAgo.getDate() - 365);
      const yearStr = yearAgo.toISOString().split('T')[0];

      filtered = filtered.filter(row => {
        if (!row.date) return false;
        if (lockupFilter === 'TODAY') return row.date >= todayStr;
        if (lockupFilter === 'WEEK') return row.date >= weekStr;
        if (lockupFilter === 'MONTH') return row.date >= monthStr;
        if (lockupFilter === 'YEAR') return row.date >= yearStr;
        return true;
      });
    }

    filtered.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

    return filtered.map((log, index, arr) => {
      // Calculate increment/decrement margin relative to prior entry
      if (index === arr.length - 1) return { ...log, variation: 0, hasPrev: false, marginStr: '0' };
      const prevSuspects = Number(arr[index + 1]?.suspects || 0);
      const currentSuspects = Number(log?.suspects || 0);
      const diff = currentSuspects - prevSuspects;
      
      let marginStr = '0';
      if (diff > 0) marginStr = `+${diff}`;
      else if (diff < 0) marginStr = `${diff}`;

      return { 
        ...log, 
        variation: diff, 
        marginStr,
        hasPrev: true 
      };
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

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    setNotification("⏳ Logging Daily Census to Database...");

    const totalVal = parseInt(formInput.suspects) || 0;
    const cleanStationSub = stripHtml(formInput.station).substring(0, 3).toUpperCase();
    const popRef = `POP-${cleanStationSub}-${Date.now().toString().slice(-6)}`;

    const payload = {
      sd_ref: popRef,
      region: stripHtml(formInput.region).toUpperCase(),
      station: stripHtml(formInput.station).toUpperCase(),
      date: new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' }),
      time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }).replace(':', '') + 'Hrs',
      suspects: totalVal,
      male_count: parseInt(formInput.male_count) || 0,
      male_juvenile_count: parseInt(formInput.male_juvenile_count) || 0,
      female_count: parseInt(formInput.female_count) || 0,
      female_juvenile_count: parseInt(formInput.female_juvenile_count) || 0,
      detention_1day: parseInt(formInput.detention_1day) || 0,
      detention_2days: parseInt(formInput.detention_2days) || 0,
      detention_3days_over: parseInt(formInput.detention_3days_over) || 0,
      last_updated_by: currentUser ? `${currentUser.name} (${currentUser.fnum})` : 'COMMAND DESK'
    };

    try {
      const response = await authFetch('/api/v1/lockup-matrix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error("Database rejected cell population entry.");

      setNotification("✅ Daily Cell Census successfully logged!");
      if (onRefreshData) onRefreshData();
      setTimeout(() => {
        setNotification(null);
        setActiveTab('LEDGER');
      }, 1500);
    } catch (err) {
      setNotification(`❌ Error: ${err.message}`);
    }
  };

  const headerBgClass = activeTab === 'LOG_FORM' ? 'bg-emerald-800' : 'bg-amber-800';
  const buttonActiveBg = activeTab === 'LOG_FORM' ? 'bg-emerald-500 text-emerald-950' : 'bg-amber-500 text-amber-950';
  const buttonInactiveBg = activeTab === 'LOG_FORM' ? 'text-emerald-200 hover:text-white' : 'text-amber-200 hover:text-white';
  const innerNavBg = activeTab === 'LOG_FORM' ? 'bg-emerald-900 border-emerald-700' : 'bg-amber-900 border-amber-700';

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[99999] flex items-center justify-center p-2 sm:p-4 animate-in fade-in zoom-in-95 duration-200">
      <div className="bg-white shadow-2xl max-w-[95vw] w-full flex flex-col max-h-[92vh] rounded-xl overflow-hidden border border-slate-300">
        
        {/* DYNAMIC HEADER */}
        <div className={`${headerBgClass} px-6 py-4 flex justify-between items-center shrink-0 shadow-md z-10 transition-colors duration-300`}>
          <div>
            <h3 className="text-xs sm:text-sm font-extrabold text-white tracking-wider uppercase flex items-center">
              <Shield className="w-4 h-4 mr-2" />
              {activeTab === 'LOG_FORM' ? 'Station Daily Cell Census & Lock-Up Entry' : 'Independent Daily Suspect Lock-Up Matrix Ledger'}
            </h3>
            <p className="text-[10px] text-white/80 font-medium mt-0.5">
              Active Mode: <span className="text-white font-bold">{activeTab === 'LOG_FORM' ? 'Logging Census' : 'Reviewing Matrix Ledger & Historical Reports'}</span>
            </p>
          </div>
          <div className="flex items-center space-x-3">
            <div className={`flex ${innerNavBg} rounded-lg p-0.5 border shadow-inner`}>
              <button 
                onClick={() => setActiveTab('LOG_FORM')} 
                className={`px-3 py-1 text-[11px] font-extrabold uppercase rounded transition flex items-center cursor-pointer ${activeTab === 'LOG_FORM' ? `${buttonActiveBg} shadow` : buttonInactiveBg}`}
              >
                <PlusCircle className="w-3 h-3 mr-1" /> Log Census
              </button>
              <button 
                onClick={() => setActiveTab('LEDGER')} 
                className={`px-3 py-1 text-[11px] font-extrabold uppercase rounded transition cursor-pointer ${activeTab === 'LEDGER' ? `${buttonActiveBg} shadow` : buttonInactiveBg}`}
              >
                Matrix Ledger
              </button>
            </div>
            <button onClick={onClose} className="text-white/80 hover:text-white p-1.5 rounded transition-colors cursor-pointer">
              <X size={20} />
            </button>
          </div>
        </div>

        {notification && (
          <div className={`mx-6 mt-3 p-3 rounded-lg border text-xs flex items-center shrink-0 ${notification.includes('❌') ? 'bg-red-50 border-red-200 text-red-800' : 'bg-green-50 border-green-200 text-green-800'}`}>
            {notification.includes('❌') ? <AlertTriangle className="w-4 h-4 mr-2 shrink-0 text-red-600" /> : <CheckCircle className="w-4 h-4 mr-2 shrink-0 text-green-600" />}
            <span className="font-bold">{notification}</span>
          </div>
        )}

        {/* CENSUS SUBMISSION FORM */}
        {activeTab === 'LOG_FORM' && (
          <div className="p-6 overflow-y-auto flex-1 bg-slate-50 max-w-3xl mx-auto w-full">
            <h4 className="text-sm font-black text-slate-800 uppercase mb-4 pb-2 border-b flex items-center">
              <PlusCircle className="w-4 h-4 mr-2 text-emerald-700" /> Log Station Daily Cell Census & Breakdown
            </h4>
            <form onSubmit={handleFormSubmit} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Region *</label>
                  <select 
                    value={formInput.region} 
                    onChange={e => setFormInput({...formInput, region: e.target.value, station: REGIONAL_HIERARCHY[e.target.value]?.[0] || ''})} 
                    required 
                    className="w-full p-2.5 border rounded uppercase bg-white font-bold text-slate-800 cursor-pointer"
                  >
                    {Object.keys(REGIONAL_HIERARCHY).map(reg => (
                      <option key={reg} value={reg}>{reg}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Station *</label>
                  <select 
                    value={formInput.station} 
                    onChange={e => setFormInput({...formInput, station: e.target.value})} 
                    required 
                    className="w-full p-2.5 border rounded uppercase bg-white font-bold text-slate-800 cursor-pointer"
                  >
                    {(REGIONAL_HIERARCHY[formInput.region] || []).map(stat => (
                      <option key={stat} value={stat}>{stat}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 bg-emerald-50 p-4 rounded-xl border border-emerald-200">
                <div className="sm:col-span-1">
                  <label className="block font-black text-emerald-900 mb-1">Total Suspects *</label>
                  <input 
                    type="number" 
                    min="0" 
                    value={formInput.suspects} 
                    onChange={e => setFormInput({...formInput, suspects: e.target.value})} 
                    required 
                    className="w-full p-2.5 border rounded bg-white font-black text-emerald-900 text-sm" 
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="block font-bold text-blue-800 mb-1">Male Adults</label>
                  <input type="number" min="0" value={formInput.male_count} onChange={e => setFormInput({...formInput, male_count: e.target.value})} className="w-full p-2.5 border rounded bg-white" placeholder="0" />
                </div>
                <div>
                  <label className="block font-bold text-indigo-800 mb-1">Male Juveniles</label>
                  <input type="number" min="0" value={formInput.male_juvenile_count} onChange={e => setFormInput({...formInput, male_juvenile_count: e.target.value})} className="w-full p-2.5 border rounded bg-white" placeholder="0" />
                </div>
                <div>
                  <label className="block font-bold text-pink-800 mb-1">Female Adults</label>
                  <input type="number" min="0" value={formInput.female_count} onChange={e => setFormInput({...formInput, female_count: e.target.value})} className="w-full p-2.5 border rounded bg-white" placeholder="0" />
                </div>
                <div>
                  <label className="block font-bold text-purple-800 mb-1">Female Juveniles</label>
                  <input type="number" min="0" value={formInput.female_juvenile_count} onChange={e => setFormInput({...formInput, female_juvenile_count: e.target.value})} className="w-full p-2.5 border rounded bg-white" placeholder="0" />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 bg-slate-100 p-4 rounded-xl border border-slate-200">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Detention: 1 Day</label>
                  <input type="number" min="0" value={formInput.detention_1day} onChange={e => setFormInput({...formInput, detention_1day: e.target.value})} className="w-full p-2.5 border rounded bg-white" placeholder="0" />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Detention: 2 Days</label>
                  <input type="number" min="0" value={formInput.detention_2days} onChange={e => setFormInput({...formInput, detention_2days: e.target.value})} className="w-full p-2.5 border rounded bg-white" placeholder="0" />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Detention: 3 Days & Over</label>
                  <input type="number" min="0" value={formInput.detention_3days_over} onChange={e => setFormInput({...formInput, detention_3days_over: e.target.value})} className="w-full p-2.5 border rounded bg-white" placeholder="0" />
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button type="submit" className="px-6 py-3 bg-emerald-700 hover:bg-emerald-800 text-white font-black uppercase rounded-xl shadow cursor-pointer text-xs tracking-wider transition">
                  💾 Save Census to Database Ledger
                </button>
              </div>
            </form>
          </div>
        )}

        {/* MATRIX LEDGER VIEW WITH SEARCH, MARGINS, AND COLLAPSIBLE HISTORICAL DROPDOWNS */}
        {activeTab === 'LEDGER' && (
          <>
            <div className="bg-amber-50 px-6 py-3 border-b border-amber-200 flex flex-col md:flex-row justify-between items-center gap-3 shrink-0">
              
              {/* REGION & STATION FILTER DROPDOWNS */}
              <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                <div className="flex items-center space-x-2">
                  <Filter className="w-4 h-4 text-amber-800 shrink-0" />
                  <select 
                    value={ledgerFilterRegion} 
                    onChange={e => { setLedgerFilterRegion(e.target.value); setLedgerFilterStation('ALL STATIONS'); }}
                    className="border border-amber-300 text-amber-900 font-bold rounded-lg px-2.5 py-1.5 text-xs bg-white outline-none cursor-pointer"
                  >
                    <option value="ALL REGIONS">ALL REGIONS</option>
                    {Object.keys(REGIONAL_HIERARCHY).map(reg => (
                      <option key={reg} value={reg}>{reg}</option>
                    ))}
                  </select>

                  <select 
                    value={ledgerFilterStation} 
                    onChange={e => setLedgerFilterStation(e.target.value)}
                    className="border border-amber-300 text-amber-900 font-bold rounded-lg px-2.5 py-1.5 text-xs bg-white outline-none cursor-pointer"
                  >
                    <option value="ALL STATIONS">ALL STATIONS</option>
                    {ledgerFilterRegion !== 'ALL REGIONS' && REGIONAL_HIERARCHY[ledgerFilterRegion] ? (
                      REGIONAL_HIERARCHY[ledgerFilterRegion].map(stat => (
                        <option key={stat} value={stat}>{stat}</option>
                      ))
                    ) : null}
                  </select>
                </div>

                {/* BACK-SEARCH BOX */}
                <div className="relative flex items-center min-w-[200px]">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 text-amber-700" />
                  <input
                    type="text"
                    placeholder="Back-search station, user..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 bg-white border border-amber-300 rounded-lg text-xs font-semibold text-amber-900 placeholder:text-amber-500/70 outline-none focus:ring-1 focus:ring-amber-500"
                  />
                  {searchQuery && (
                    <button onClick={() => setSearchQuery('')} className="absolute right-2 text-xs font-bold text-amber-700 hover:text-amber-900">
                      ×
                    </button>
                  )}
                </div>
              </div>

              {/* TIMEFRAME FILTERS */}
              <div className="flex bg-amber-900 rounded-lg p-0.5 shadow-inner border border-amber-700/50 overflow-x-auto max-w-full custom-scrollbar">
                {['TODAY', 'WEEK', 'MONTH', 'YEAR', 'ALL'].map((f) => (
                  <button
                    key={f}
                    onClick={() => setLockupFilter(f)}
                    className={`px-3 py-1 text-[11px] font-extrabold uppercase rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                      lockupFilter === f
                        ? 'bg-amber-500 text-amber-950 shadow-sm'
                        : 'text-amber-200 hover:text-white hover:bg-amber-800/80'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>
            
            <div className="overflow-y-auto flex-1 custom-scrollbar bg-slate-50">
              <table className="w-full text-left border-collapse table-auto">
                <thead className="bg-amber-100 sticky top-0 border-b border-amber-200 shadow-sm z-20">
                  <tr>
                    <th rowSpan="2" className="px-3 py-3 text-[10px] font-black text-amber-900 uppercase border-r border-amber-200 text-center w-[4%] whitespace-normal">S/N</th>
                    <th rowSpan="2" className="px-3 py-3 text-[10px] font-black text-amber-900 uppercase border-r border-amber-200 min-w-[110px] whitespace-normal">Date & Day Log</th>
                    <th rowSpan="2" className="px-3 py-3 text-[10px] font-black text-amber-900 uppercase border-r border-amber-200 min-w-[140px] whitespace-normal">Station / Origin</th>
                    <th rowSpan="2" className="px-3 py-3 text-[10px] font-black text-white uppercase bg-amber-900 border-r border-amber-800 text-center min-w-[90px] whitespace-normal">Total Suspects</th>
                    
                    <th colSpan="4" className="px-2 py-2 text-[10px] font-black text-amber-900 uppercase border-r border-amber-200 text-center bg-amber-200/50 whitespace-normal">SEX & AGE CATEGORY</th>
                    <th colSpan="3" className="px-2 py-2 text-[10px] font-black text-amber-900 uppercase border-r border-amber-200 text-center bg-amber-100 whitespace-normal">DURATION IN DETENTION</th>
                    
                    <th rowSpan="2" className="px-3 py-3 text-[10px] font-black text-amber-900 uppercase text-center border-r border-amber-200 min-w-[100px] whitespace-normal">Increment / Margin</th>
                    <th rowSpan="2" className="px-3 py-3 text-[10px] font-black text-amber-900 uppercase min-w-[140px] whitespace-normal">Last Updated By</th>
                  </tr>
                  <tr className="bg-amber-50 border-b-2 border-amber-200">
                    <th className="px-2 py-2 text-[9px] font-extrabold text-blue-800 uppercase border-r border-amber-200 text-center bg-blue-50/50 min-w-[75px] whitespace-normal">Male Adults</th>
                    <th className="px-2 py-2 text-[9px] font-extrabold text-indigo-800 uppercase border-r border-amber-200 text-center bg-indigo-50/50 min-w-[75px] whitespace-normal">Male Juveniles</th>
                    <th className="px-2 py-2 text-[9px] font-extrabold text-pink-800 uppercase border-r border-amber-200 text-center bg-pink-50/50 min-w-[75px] whitespace-normal">Female Adults</th>
                    <th className="px-2 py-2 text-[9px] font-extrabold text-purple-800 uppercase border-r border-amber-200 text-center bg-purple-50/50 min-w-[75px] whitespace-normal">Female Juveniles</th>
                    
                    <th className="px-2 py-2 text-[9px] font-extrabold text-slate-700 uppercase border-r border-amber-200 text-center min-w-[60px] whitespace-normal">1 Day</th>
                    <th className="px-2 py-2 text-[9px] font-extrabold text-slate-700 uppercase border-r border-amber-200 text-center min-w-[60px] whitespace-normal">2 Days</th>
                    <th className="px-2 py-2 text-[9px] font-extrabold text-slate-700 uppercase border-r border-amber-200 text-center min-w-[80px] whitespace-normal">3 Days & Over</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-amber-100 bg-white">
                  {filteredLockupEntries.length > 0 ? (
                    filteredLockupEntries.map((row, idx) => {
                      const isExpanded = !!expandedDates[row.date];
                      const dateObj = row.date ? new Date(row.date) : null;
                      const dayName = dateObj && !isNaN(dateObj) ? dateObj.toLocaleDateString('en-US', { weekday: 'short' }) : 'LOG';

                      return (
                        <React.Fragment key={idx}>
                          <tr className="hover:bg-amber-50/50 transition-colors">
                            <td className="px-3 py-3 text-xs font-bold text-slate-400 text-center border-r border-slate-100">{idx + 1}</td>
                            <td className="px-3 py-3 text-xs font-bold text-slate-800 border-r border-slate-100 whitespace-nowrap">
                              <div className="flex items-center justify-between">
                                <span>{row.date} <span className="text-[10px] text-amber-800 font-semibold">({dayName})</span></span>
                                <button 
                                  onClick={() => toggleDateCollapse(row.date)}
                                  className="ml-2 p-1 rounded bg-amber-100 hover:bg-amber-200 text-amber-900 transition cursor-pointer"
                                  title="Toggle Day Details"
                                >
                                  {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                </button>
                              </div>
                            </td>
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
                              {row.marginStr.startsWith('+') ? (
                                <span className="text-red-600 bg-red-50 px-2 py-0.5 rounded border border-red-100 flex items-center justify-center max-w-max mx-auto">
                                  <TrendingUp className="w-3 h-3 mr-1" /> {row.marginStr}
                                </span>
                              ) : row.marginStr.startsWith('-') ? (
                                <span className="text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100 flex items-center justify-center max-w-max mx-auto">
                                  <TrendingDown className="w-3 h-3 mr-1" /> {row.marginStr}
                                </span>
                              ) : (
                                <span className="text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 flex items-center justify-center max-w-max mx-auto">
                                  <Minus className="w-3 h-3 mr-1" /> 0
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-3 text-[11px] font-semibold text-slate-500 uppercase">{formatOfficerDisplay(row.last_updated_by)}</td>
                          </tr>

                          {/* COLLAPSIBLE HISTORICAL DAY DETAILS DROPDOWN */}
                          {isExpanded && (
                            <tr className="bg-amber-50/80 border-b border-amber-200">
                              <td colSpan="13" className="px-6 py-3">
                                <div className="bg-white p-3 rounded-lg border border-amber-300 shadow-sm text-xs space-y-2">
                                  <div className="font-bold text-amber-900 uppercase flex items-center">
                                    <Calendar className="w-3.5 h-3.5 mr-1.5 text-amber-700" /> Historical Snapshot for {row.date} ({dayName}) - {row.station}
                                  </div>
                                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-slate-700">
                                    <div className="bg-slate-50 p-2 rounded border">
                                      <span className="font-bold text-slate-900">Total Census:</span> {row.suspects}
                                    </div>
                                    <div className="bg-blue-50/50 p-2 rounded border border-blue-100">
                                      <span className="font-bold text-blue-900">Adult Males:</span> {row.male_count || row.male || 0}
                                    </div>
                                    <div className="bg-pink-50/50 p-2 rounded border border-pink-100">
                                      <span className="font-bold text-pink-900">Adult Females:</span> {row.female_count || row.female || 0}
                                    </div>
                                    <div className="bg-purple-50/50 p-2 rounded border border-purple-100">
                                      <span className="font-bold text-purple-900">Juveniles (M/F):</span> {(row.male_juvenile_count || row.male_juvenile || 0) + (row.female_juvenile_count || row.female_juvenile || 0)}
                                    </div>
                                  </div>
                                  <div className="text-[10px] text-slate-500 font-medium">
                                    Recorded Time: <span className="font-bold text-slate-700">{row.time || 'N/A'}</span> | Logged Reference: <span className="font-bold text-slate-700">{row.sd_ref || 'N/A'}</span> | Verified By: <span className="font-bold text-slate-700">{formatOfficerDisplay(row.last_updated_by)}</span>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan="13" className="px-6 py-12 text-center text-sm text-slate-500 font-bold">
                        No independent lock-up records found matching your search or jurisdiction filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="bg-slate-900 shrink-0 shadow-inner z-10 border-t border-slate-700 text-amber-300">
              <div className="grid grid-cols-2 md:grid-cols-6 gap-2 px-6 py-3 border-b border-slate-800 text-xs font-black uppercase">
                <div>{lockupFilter} Period Totals:</div>
                <div>Total: <span className="text-white">{totals.suspects}</span></div>
                <div>Male (Adult / Juv): <span className="text-blue-400">{totals.male}</span> / <span className="text-indigo-400">{totals.male_juvenile}</span></div>
                <div>Female (Adult / Juv): <span className="text-pink-400">{totals.female}</span> / <span className="text-purple-400">{totals.female_juvenile}</span></div>
                <div className="col-span-2">Detention Split (1d / 2d / 3d+): <span className="text-white">{totals.d1} / {totals.d2} / {totals.d3}</span></div>
              </div>
              <div className="flex justify-between items-center px-6 py-4 bg-slate-950">
                <div className="text-xs font-black text-yellow-400 uppercase tracking-wider">
                  Cumulative Matrix Lock-Up Total (All-Time):
                </div>
                <div className="text-xl font-black text-yellow-400">{allTimeLockupTotal}</div>
              </div>
            </div>
          </>
        )}

      </div>
    </div>
  );
};

export default LockupMatrixLedger;