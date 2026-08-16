import React, { useState, useMemo } from 'react';
import { BarChart3, PlusCircle, Edit, AlertTriangle, CheckCircle } from 'lucide-react';

const REGIONAL_HIERARCHY = {
  "KMP NORTH": ["KAWEMPE", "KAKIRI", "KASANGATI", "MATUGGA", "NANSANA", "OLD KAMPALA", "WAKISO", "WANDEGEYA"],
  "KMP EAST": ["JINJA ROAD", "KIRA", "KIRA ROAD", "MUKONO", "NAGGALAMA", "SEETA"],
  "KMP SOUTH": ["NATEETE", "CPS KAMPALA", "PARLIAMENT", "ENTEBBE", "KABALAGALA", "KAJJANSI", "KASENYI", "KATWE", "KYENGERA", "NSANGI"],
  "KMP HEADQUARTERS": ["KMP HEADQUARTERS", "FLYING SQUAD", "CRIME INTELLIGENCE"],
  "POLICE HEADQUARTERS": ["NAGURU"]
};

const MetricCard = ({ title, value, colorClass }) => (
  <div className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-sm flex flex-col items-center justify-center text-center">
    <h4 className="text-[9px] font-extrabold mb-1 uppercase tracking-wider text-slate-500">{title}</h4>
    <div className={`text-base font-black leading-none ${colorClass}`}>{value}</div>
  </div>
);

const ExpandableTableCard = ({ title, children, onToggle }) => {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
      <div className="bg-slate-900 px-4 py-3 flex justify-between items-center">
        <h3 className="font-extrabold text-white text-sm uppercase tracking-wider">{title}</h3>
        <button onClick={() => { const nextState = !expanded; setExpanded(nextState); if (onToggle) onToggle(nextState); }} className="text-xs text-blue-400 hover:text-white font-bold">
          {expanded ? 'Collapse ↙' : 'Expand ↗'}
        </button>
      </div>
      <div className="w-full">{children}</div>
    </div>
  );
};

const authFetch = async (url, options = {}) => {
  const token = localStorage.getItem('kmp_authToken');
  const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
  return fetch(`${API_URL}${url}`, { ...options, headers: { ...options.headers, "Authorization": `Bearer ${token}` } });
};

const Statistics = ({ currentUser, stats = [], agricStats = [], setStats, setAgricStats, setSidebarOpen }) => {
  const [operation, setOperation] = useState('new');
  const [notification, setNotification] = useState(null);

  // 🟢 DOMAIN TOGGLE: 'DISRUPTIVE' vs 'AGRICULTURAL'
  const [statsDomain, setStatsDomain] = useState('DISRUPTIVE');

  // 🟢 Active dataset selector based on toggle state
  const currentDomainStats = statsDomain === 'AGRICULTURAL' ? agricStats : stats;
  const activeSetter = statsDomain === 'AGRICULTURAL' ? setAgricStats : setStats;

  const [filterRegion, setFilterRegion] = useState(currentUser?.role === 'SUPER_ADMIN' ? 'ALL REGIONS' : currentUser?.region || '');
  const [filterStation, setFilterStation] = useState((['SUPER_ADMIN', 'RPC', 'Deputy Commander'].includes(currentUser?.role) || currentUser?.permissions?.view_global_roster) ? 'ALL STATIONS' : currentUser?.station || '');
  const [updateSearch, setUpdateSearch] = useState('');
  const [dateFilter, setDateFilter] = useState('ALL TIME');
  
  const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
  
  const [formData, setFormData] = useState({
    sn: null, id: null, region: currentUser.region, station: currentUser.station || REGIONAL_HIERARCHY[currentUser?.region]?.[0] || '',
    date: new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0],
    arrested: 0, given_bond: 0, cautioned: 0, pending_court: 0, taken_to_court: 0, released: 0, remanded: 0, convicted: 0
  });

  const filteredStats = useMemo(() => {
    return (Array.isArray(currentDomainStats) ? currentDomainStats : []).filter(s => {
      if (filterRegion !== 'ALL REGIONS' && s.region !== filterRegion) return false;
      if (filterStation !== 'ALL STATIONS' && s.station !== filterStation) return false;

      if (dateFilter === 'TODAY') {
        const todayStr = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0];
        if (s.date !== todayStr) return false;
      } else if (dateFilter === 'LAST 7 DAYS') {
        const repDate = new Date(s.date); const diffDays = Math.ceil(Math.abs(new Date() - repDate) / (1000 * 60 * 60 * 24)); if (diffDays > 7) return false;
      } else if (dateFilter === 'LAST 30 DAYS') {
        const repDate = new Date(s.date); const diffDays = Math.ceil(Math.abs(new Date() - repDate) / (1000 * 60 * 60 * 24)); if (diffDays > 30) return false;
      } else if (dateFilter === 'LAST 90 DAYS') {
        const repDate = new Date(s.date); const diffDays = Math.ceil(Math.abs(new Date() - repDate) / (1000 * 60 * 60 * 24)); if (diffDays > 90) return false;
      } else if (dateFilter === 'LAST 120 DAYS') {
        const repDate = new Date(s.date); const diffDays = Math.ceil(Math.abs(new Date() - repDate) / (1000 * 60 * 60 * 24)); if (diffDays > 120) return false;
      }
      return true;
    });
  }, [currentDomainStats, filterRegion, filterStation, dateFilter]);

  const availableUpdateStats = useMemo(() => {
    return (Array.isArray(currentDomainStats) ? currentDomainStats : []).filter(s => {
      if (!['ADMIN', 'SUPER_ADMIN'].includes(currentUser.role) && s.region !== currentUser.region) return false;
      if (updateSearch) {
        const query = updateSearch.toLowerCase();
        const idStr = String(s.id || s.sn || '').toLowerCase();
        const stationStr = String(s.station || '').toLowerCase();
        const dateStr = String(s.date || '').toLowerCase();
        return idStr.includes(query) || stationStr.includes(query) || dateStr.includes(query);
      }
      return true;
    });
  }, [currentDomainStats, currentUser, updateSearch]);

  const totals = useMemo(() => {
    return filteredStats.reduce((acc, curr) => {
      acc.arrested += (parseInt(curr.arrested) || 0); acc.given_bond += (parseInt(curr.given_bond) || 0);
      acc.cautioned += (parseInt(curr.cautioned) || 0); acc.pending_court += (parseInt(curr.pending_court) || 0);
      acc.taken_to_court += (parseInt(curr.taken_to_court) || 0); acc.released += (parseInt(curr.released) || 0);
      acc.remanded += (parseInt(curr.remanded) || 0); acc.convicted += (parseInt(curr.convicted) || 0);
      return acc;
    }, { arrested: 0, given_bond: 0, cautioned: 0, pending_court: 0, taken_to_court: 0, released: 0, remanded: 0, convicted: 0 });
  }, [filteredStats]);

  const handleInputChange = (e) => {
    const { name, value, type } = e.target;
    if (name === 'region') setFormData({ ...formData, region: value, station: REGIONAL_HIERARCHY[value][0] });
    else setFormData({ ...formData, [name]: type === 'number' ? parseInt(value) || 0 : value });
  };

  const handleOperationToggle = (op) => {
    setOperation(op); setNotification(null);
    if (op === 'new') {
      setFormData({
        sn: null, id: null, region: currentUser.region, station: currentUser.station || REGIONAL_HIERARCHY[currentUser?.region]?.[0] || '',
        date: new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0],
        arrested: 0, given_bond: 0, cautioned: 0, pending_court: 0, taken_to_court: 0, released: 0, remanded: 0, convicted: 0
      });
      setUpdateSearch('');
    }
  };

  const populateUpdateForm = (statData) => {
    const recordIdentifier = statData.id !== undefined && statData.id !== null ? statData.id : statData.sn;
    setFormData({ ...statData, sn: recordIdentifier, id: recordIdentifier });
  };

  const handleFormSubmit = async (e) => { 
    e.preventDefault();
    const token = localStorage.getItem('kmp_authToken');
    if (!token) return setNotification("Error: Security token missing.");
    
    // 🟢 Dynamic endpoint routing based on active domain
    const targetEndpoint = statsDomain === 'AGRICULTURAL' ? '/api/v1/agric-stats' : '/api/v1/stats';

    if (operation === 'new') {
      const isDuplicate = currentDomainStats.some(s => 
        String(s.station || '').trim().toUpperCase() === String(formData.station || '').trim().toUpperCase() && 
        String(s.date) === String(formData.date)
      );
      
      if (isDuplicate) {
        return setNotification(`❌ Error: Statistics for station '${formData.station}' on date '${formData.date}' have already been logged.`);
      }

      const exactNextSN = currentDomainStats.length > 0 ? Math.max(...currentDomainStats.map(s => s.sn || s.id || 0)) + 1 : 1;
      const newStat = { ...formData, sn: exactNextSN, last_updated_by: `${currentUser.name} (${currentUser.fnum})` };
      
      try {
        const response = await authFetch(targetEndpoint, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newStat)
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.detail || "Database rejected the entry.");
        }
        
        const savedData = await response.json().catch(() => newStat);
        activeSetter([savedData, ...currentDomainStats]); 
        setNotification(`✅ Statistics recorded successfully for ${formData.station}!`);
        setFormData({ 
          ...formData, arrested: 0, given_bond: 0, cautioned: 0, pending_court: 0, 
          taken_to_court: 0, released: 0, remanded: 0, convicted: 0, sn: null, id: null 
        });
      } catch (err) { 
        setNotification(`❌ Error: ${err.message}`); 
      }
      
    } else if (operation === 'update') {
      const recordKey = formData.id || formData.sn;
      if (!recordKey) return setNotification("Error: Please select a record from the list to update first.");

      const isDuplicateConflict = currentDomainStats.some(s => 
        (String(s.station || '').trim().toUpperCase() === String(formData.station || '').trim().toUpperCase() && 
         String(s.date) === String(formData.date)) && 
        (s.id !== recordKey && s.sn !== recordKey)
      );
      
      if (isDuplicateConflict) {
        return setNotification(`❌ Error: Another record for station '${formData.station}' on date '${formData.date}' already exists.`);
      }

      const updatedRecord = { ...formData, last_updated_by: `${currentUser.name} (${currentUser.fnum})` };

      try {
        const response = await fetch(`${API_URL}${targetEndpoint}/${recordKey}`, {
          method: "PUT", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }, body: JSON.stringify(updatedRecord)
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(errText || "Failed to update record in database.");
        }
        
        const updatedStats = currentDomainStats.map(s => (s.id === recordKey || s.sn === recordKey) ? updatedRecord : s);
        activeSetter(updatedStats); 
        setNotification(`✅ Statistics ID ${recordKey} successfully updated!`);
        handleOperationToggle('new');
      } catch (err) { 
        setNotification(`❌ Error: ${err.message}`); 
      }
    }
  };

  return (
    <div className="p-3 sm:p-6 max-w-[1600px] mx-auto space-y-6 relative z-10">
      <div className="text-center mb-8 flex flex-col items-center">
        <img src="/upf_badge.png" alt="UPF Logo" className="w-16 h-16 mb-3 object-contain contrast-200 brightness-75 drop-shadow-sm"/>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-700 tracking-tight">
          {statsDomain === 'AGRICULTURAL' ? '🌱 Agricultural Crimes Statistics' : '⚡ Disruptive OPS Statistics'}
        </h1>
        <h3 className="text-sm sm:text-lg text-blue-700 mt-2 font-medium">Weekly Numerical Aggregates</h3>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <>
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="bg-slate-900 px-4 py-3 border-b border-gray-200 flex justify-between items-center">
                <h3 className="text-white font-semibold flex items-center">
                  <BarChart3 className="w-5 h-5 mr-2 text-blue-400" /> 
                  ⚙️ Log {statsDomain === 'AGRICULTURAL' ? 'Agri-Crimes' : 'Disruptive'} Stats
                </h3>
              </div>
              <div className="p-5 space-y-6">
                <div className="flex space-x-2 bg-gray-100 p-1 rounded-lg">
                  <button type="button" onClick={() => handleOperationToggle('new')} className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${operation === 'new' ? 'bg-white shadow text-blue-700' : 'text-gray-600 hover:text-gray-900'}`}><PlusCircle className="w-4 h-4 inline mr-1" /> Register New</button>
                  <button type="button" onClick={() => handleOperationToggle('update')} className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${operation === 'update' ? 'bg-white shadow text-blue-700' : 'text-gray-600 hover:text-gray-900'}`}><Edit className="w-4 h-4 inline mr-1" /> Update Existing</button>
                </div>
                {notification && <div className={`border px-4 py-3 rounded-lg flex items-center mb-4 ${notification.includes('Error') || notification.includes('❌') ? 'bg-red-50 border-red-200 text-red-800' : 'bg-green-50 border-green-200 text-green-800'}`}>{notification.includes('Error') || notification.includes('❌') ? <AlertTriangle className="w-5 h-5 mr-2 text-red-500 shrink-0" /> : <CheckCircle className="w-5 h-5 mr-2 text-green-500 shrink-0" />}<span className="text-sm font-medium">{notification}</span></div>}
                
                {operation === 'update' && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <label className="block text-xs font-bold text-blue-800 mb-2">🔍 Search & Select Record to Update</label>
                    <input type="text" placeholder="Search by SN, Station, or Date..." value={updateSearch} onChange={e => setUpdateSearch(e.target.value)} className="w-full text-sm p-2 mb-2 border border-blue-200 rounded outline-none focus:ring-2 focus:ring-blue-400" />
                    <div className="max-h-40 overflow-y-auto bg-white border border-blue-100 rounded custom-scrollbar">
                      {availableUpdateStats.length === 0 ? (
                        <div className="p-3 text-xs text-gray-500 text-center">No records found matching your search.</div>
                      ) : (
                        availableUpdateStats.map(s => {
                          const recordKey = s.id !== undefined && s.id !== null ? s.id : s.sn;
                          const isSelected = formData.sn === recordKey || formData.id === recordKey;

                          return (
                            <div 
                              key={recordKey} 
                              onClick={() => {
                                populateUpdateForm(s);
                                setNotification(`Selected Record ID: ${recordKey} (${s.station}) for update.`);
                              }} 
                              className={`p-2.5 text-xs border-b cursor-pointer transition-colors ${isSelected ? 'bg-blue-700 text-white font-bold' : 'hover:bg-blue-100 text-gray-800'}`}
                            >
                              <span className={isSelected ? 'text-blue-200' : 'text-gray-400'}>ID: {recordKey}</span> | <span className={isSelected ? 'text-white' : 'font-bold text-blue-700'}>{s.date}</span> | {s.station}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}

                <form onSubmit={handleFormSubmit} className="space-y-5">
                  {operation === 'update' && (formData.sn || formData.id) && <div className="bg-slate-800 text-white text-xs font-bold px-3 py-2 rounded">Currently Editing Record ID: {formData.id || formData.sn}</div>}
                  <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">Select Region *</label>
                        <select name="region" value={formData.region} onChange={handleInputChange} disabled={!(currentUser.role === 'SUPER_ADMIN' || currentUser.permissions?.view_global_roster) || operation === 'update'} required className="w-full text-sm border-gray-300 rounded-md shadow-sm bg-white border p-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500">
                          {['ADMIN', 'SUPER_ADMIN'].includes(currentUser.role) ? Object.keys(REGIONAL_HIERARCHY).map(reg => <option key={reg} value={reg}>{reg}</option>) : <option value={currentUser.region}>{currentUser.region}</option>}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">Station / Division *</label>
                        <select name="station" value={formData.station} onChange={handleInputChange} disabled={!['ADMIN', 'SUPER_ADMIN', 'RPC', 'Deputy Commander'].includes(currentUser.role) || operation === 'update'} required className="w-full text-sm border-gray-300 rounded-md shadow-sm bg-white border p-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500">
                          {operation === 'update' ? <option value={formData.station}>{formData.station}</option> : ['ADMIN', 'SUPER_ADMIN', 'RPC', 'Deputy Commander'].includes(currentUser.role) ? (REGIONAL_HIERARCHY[formData.region] || []).map(stat => <option key={stat} value={stat}>{stat}</option>) : <option value={currentUser.station}>{currentUser.station}</option>}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">Date of Record *</label>
                        <input type="date" name="date" value={formData.date} onChange={handleInputChange} disabled={operation === 'update'} required className="w-full text-sm border-gray-300 rounded-md shadow-sm border bg-white p-2 disabled:bg-gray-100 disabled:text-gray-500" />
                      </div>
                    </div>
                  </div> 
                  <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                    <h4 className="text-sm font-bold text-blue-900 border-b border-blue-200 pb-2 mb-4 flex items-center">📊 Enter Weekly Metric Aggregates (8 Fields)</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-white p-2 rounded border border-gray-200 shadow-sm"><label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1">Suspects Arrested</label><input type="number" name="arrested" min="0" value={formData.arrested} onChange={handleInputChange} className="w-full text-lg font-bold text-blue-700 border-b-2 border-transparent focus:border-blue-500 outline-none p-1 bg-transparent" /></div>
                      <div className="bg-white p-2 rounded border border-gray-200 shadow-sm"><label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1">Given Bond</label><input type="number" name="given_bond" min="0" value={formData.given_bond} onChange={handleInputChange} className="w-full text-lg font-bold text-blue-700 border-b-2 border-transparent focus:border-blue-500 outline-none p-1 bg-transparent" /></div>
                      <div className="bg-white p-2 rounded border border-gray-200 shadow-sm"><label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1">Cautioned</label><input type="number" name="cautioned" min="0" value={formData.cautioned} onChange={handleInputChange} className="w-full text-lg font-bold text-blue-700 border-b-2 border-transparent focus:border-blue-500 outline-none p-1 bg-transparent" /></div>
                      <div className="bg-white p-2 rounded border border-gray-200 shadow-sm"><label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1">Pending Court</label><input type="number" name="pending_court" min="0" value={formData.pending_court} onChange={handleInputChange} className="w-full text-lg font-bold text-yellow-600 border-b-2 border-transparent focus:border-yellow-500 outline-none p-1 bg-transparent" /></div>
                      <div className="bg-white p-2 rounded border border-gray-200 shadow-sm"><label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1">Taken to Court</label><input type="number" name="taken_to_court" min="0" value={formData.taken_to_court} onChange={handleInputChange} className="w-full text-lg font-bold text-blue-600 border-b-2 border-transparent focus:border-blue-500 outline-none p-1 bg-transparent" /></div>
                      <div className="bg-white p-2 rounded border border-gray-200 shadow-sm"><label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1">Released by Court</label><input type="number" name="released" min="0" value={formData.released} onChange={handleInputChange} className="w-full text-lg font-bold text-green-600 border-b-2 border-transparent focus:border-green-500 outline-none p-1 bg-transparent" /></div>
                      <div className="bg-white p-2 rounded border border-gray-200 shadow-sm"><label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1">Suspects Remanded</label><input type="number" name="remanded" min="0" value={formData.remanded} onChange={handleInputChange} className="w-full text-lg font-bold text-red-600 border-b-2 border-transparent focus:border-red-500 outline-none p-1 bg-transparent" /></div>
                      <div className="bg-white p-2 rounded border border-gray-200 shadow-sm"><label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1">Suspects Convicted</label><input type="number" name="convicted" min="0" value={formData.convicted} onChange={handleInputChange} className="w-full text-lg font-bold text-purple-600 border-b-2 border-transparent focus:border-purple-500 outline-none p-1 bg-transparent" /></div>
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
            <div className="bg-white/80 backdrop-blur p-4 rounded-xl border border-slate-200 shadow-sm relative">
              <div className="absolute top-4 right-4 z-10">
                <select value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className="border-2 border-blue-500 text-blue-700 font-bold rounded-lg px-3 py-1 text-xs shadow-sm bg-white outline-none cursor-pointer">
                  <option value="ALL TIME">ALL TIME</option><option value="TODAY">TODAY ONLY</option><option value="LAST 7 DAYS">LAST 7 DAYS</option>
                  <option value="LAST 30 DAYS">LAST 30 DAYS</option><option value="LAST 90 DAYS">LAST 90 DAYS</option><option value="LAST 120 DAYS">LAST 120 DAYS</option>
                </select>
              </div>
              <h4 className="text-sm font-bold text-slate-400 mb-3 uppercase tracking-wider">📋 Area Metrics ({filterRegion} - {dateFilter})</h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
                <MetricCard title="Arrested" value={totals.arrested} colorClass="text-blue-700" />
                <MetricCard title="Given Bond" value={totals.given_bond} colorClass="text-indigo-600" />
                <MetricCard title="Cautioned" value={totals.cautioned} colorClass="text-gray-600" />
                <MetricCard title="Pending Court" value={totals.pending_court} colorClass="text-yellow-600" />
                <MetricCard title="To Court" value={totals.taken_to_court} colorClass="text-blue-500" />
                <MetricCard title="Released" value={totals.released} colorClass="text-green-600" />
                <MetricCard title="Remanded" value={totals.remanded} colorClass="text-red-600" />
                <MetricCard title="Convicted" value={totals.convicted} colorClass="text-purple-600" />
              </div>
            </div>

            {/* Region/Station filters on the left, Domain Toggle Selector pushed to the right on the same line */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                <select value={filterRegion} onChange={(e) => { setFilterRegion(e.target.value); setFilterStation('ALL STATIONS'); }} disabled={!(['ADMIN', 'SUPER_ADMIN', 'RPC', 'Deputy Commander'].includes(currentUser?.role) || currentUser?.permissions?.view_global_roster)} className="border rounded-lg px-3 py-2 text-sm shadow-sm bg-white disabled:bg-gray-100 disabled:text-gray-500 w-full sm:w-auto outline-none focus:border-blue-500">
                  {['ADMIN', 'SUPER_ADMIN', 'RPC', 'Deputy Commander'].includes(currentUser?.role) || currentUser?.permissions?.view_global_roster ? (
                    <><option value="ALL REGIONS">ALL REGIONS</option>{Object.keys(REGIONAL_HIERARCHY).map(reg => <option key={reg} value={reg}>{reg}</option>)}</>
                  ) : <option value={currentUser?.region}>{currentUser?.region}</option>}
                </select>
                <select value={filterStation} onChange={(e) => setFilterStation(e.target.value)} disabled={!(['ADMIN', 'SUPER_ADMIN', 'RPC', 'Deputy Commander'].includes(currentUser?.role) || currentUser?.permissions?.view_global_roster)} className="border rounded-lg px-3 py-2 text-sm shadow-sm bg-white disabled:bg-gray-100 disabled:text-gray-500 w-full sm:w-auto outline-none focus:border-blue-500">
                  {['ADMIN', 'SUPER_ADMIN', 'RPC', 'Deputy Commander'].includes(currentUser?.role) || currentUser?.permissions?.view_global_roster ? (
                    <><option value="ALL STATIONS">ALL STATIONS</option>{filterRegion !== 'ALL REGIONS' && REGIONAL_HIERARCHY[filterRegion] ? REGIONAL_HIERARCHY[filterRegion].map(stat => <option key={stat} value={stat}>{stat}</option>) : null}</>
                  ) : <option value={currentUser?.station}>{currentUser?.station}</option>}
                </select>
              </div>

              {/* Domain Toggle Selector placed on the right side of the filters line */}
              <div className="inline-flex bg-slate-200 p-1 rounded-xl border shadow-inner shrink-0">
                <button type="button" onClick={() => setStatsDomain('DISRUPTIVE')} className={`px-3 py-1.5 rounded-lg font-bold text-xs transition ${statsDomain === 'DISRUPTIVE' ? 'bg-slate-900 text-white shadow' : 'text-slate-700'}`}>
                  ⚡ Disruptive OPS
                </button>
                <button type="button" onClick={() => setStatsDomain('AGRICULTURAL')} className={`px-3 py-1.5 rounded-lg font-bold text-xs transition ${statsDomain === 'AGRICULTURAL' ? 'bg-emerald-700 text-white shadow' : 'text-slate-700'}`}>
                  🌱 Agricultural Crimes Stats
                </button>
              </div>
            </div>

            <ExpandableTableCard title={`Weekly Metrics Breakdown Ledger (${statsDomain === 'AGRICULTURAL' ? 'Agricultural Crimes' : 'Disruptive OPS'})`} onToggle={(expanded) => { if (setSidebarOpen) setSidebarOpen(!expanded); }}>
              <div className="overflow-x-auto w-full">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider leading-tight">S/N</th>
                      <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider leading-tight">Date</th>
                      <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider leading-tight">Division</th>
                      <th className="px-2 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider leading-tight">Suspects<br/>arrested</th>
                      <th className="px-2 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider leading-tight">Given<br/>Bond</th>
                      <th className="px-2 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider leading-tight">Cautioned</th>
                      <th className="px-2 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider leading-tight">Pending<br/>Court</th>
                      <th className="px-2 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider leading-tight">Taken to<br/>Court</th>
                      <th className="px-2 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider leading-tight">Released<br/>by court</th>
                      <th className="px-2 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider leading-tight">Suspects<br/>remanded</th>
                      <th className="px-2 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider leading-tight">Suspects<br/>convicted</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredStats.map((stat) => (
                      <tr key={stat.id || stat.sn} className="even:bg-slate-50 hover:bg-blue-50 transition-colors cursor-pointer" onClick={() => { if(operation === 'update') populateUpdateForm(stat); }}>
                        <td className="px-3 py-3 whitespace-nowrap text-xs font-bold text-gray-900">{stat.id || stat.sn}</td>
                        <td className="px-3 py-3 whitespace-nowrap text-xs text-gray-500">{stat.date}</td>
                        <td className="px-3 py-3 whitespace-nowrap text-xs font-medium text-blue-700">{stat.station}</td>
                        <td className="px-2 py-3 whitespace-nowrap text-xs text-center font-bold text-gray-700">{stat.arrested}</td>
                        <td className="px-2 py-3 whitespace-nowrap text-xs text-center font-bold text-gray-700">{stat.given_bond}</td>
                        <td className="px-2 py-3 whitespace-nowrap text-xs text-center font-bold text-gray-700">{stat.cautioned}</td>
                        <td className="px-2 py-3 whitespace-nowrap text-xs text-center font-bold text-yellow-600">{stat.pending_court}</td>
                        <td className="px-2 py-3 whitespace-nowrap text-xs text-center font-bold text-blue-600">{stat.taken_to_court}</td>
                        <td className="px-2 py-3 whitespace-nowrap text-xs text-center font-bold text-green-600">{stat.released}</td>
                        <td className="px-2 py-3 whitespace-nowrap text-xs text-center font-bold text-red-600">{stat.remanded}</td>
                        <td className="px-2 py-3 whitespace-nowrap text-xs text-center font-bold text-purple-600">{stat.convicted}</td>
                      </tr>
                    ))}
                    {filteredStats.length > 0 && (
                      <tr className="bg-slate-200 font-bold text-gray-900 border-t-2 border-slate-400">
                        <td colSpan="3" className="px-3 py-3 text-right text-xs uppercase tracking-wider">Total</td>
                        <td className="px-2 py-3 text-center text-xs text-blue-800">{totals.arrested}</td>
                        <td className="px-2 py-3 text-center text-xs text-blue-800">{totals.given_bond}</td>
                        <td className="px-2 py-3 text-center text-xs text-blue-800">{totals.cautioned}</td>
                        <td className="px-2 py-3 text-center text-xs text-blue-800">{totals.pending_court}</td>
                        <td className="px-2 py-3 text-center text-xs text-blue-800">{totals.taken_to_court}</td>
                        <td className="px-2 py-3 text-center text-xs text-blue-800">{totals.released}</td>
                        <td className="px-2 py-3 text-center text-xs text-blue-800">{totals.remanded}</td>
                        <td className="px-2 py-3 text-center text-xs text-blue-800">{totals.convicted}</td>
                      </tr>
                    )}
                    {filteredStats.length === 0 && <tr><td colSpan="11" className="text-center py-6 text-gray-500">No statistics logged for this jurisdiction.</td></tr>}
                  </tbody>
                </table>
              </div>
            </ExpandableTableCard>
          </div>
        </>
      </div>
    </div>
  );
};

export default Statistics;