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

const Statistics = ({ currentUser, stats, setStats, setSidebarOpen }) => {
  const [operation, setOperation] = useState('new');
  const [notification, setNotification] = useState(null);
  
  // 🟢 STATS DOMAIN FILTER: 'DISRUPTIVE' vs 'AGRICULTURAL'
  const [statsDomain, setStatsDomain] = useState('DISRUPTIVE');

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
    return (Array.isArray(stats) ? stats : []).filter(s => {
      if (filterRegion !== 'ALL REGIONS' && s.region !== filterRegion) return false;
      if (filterStation !== 'ALL STATIONS' && s.station !== filterStation) return false;
      return true;
    });
  }, [stats, filterRegion, filterStation]);

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

  const handleFormSubmit = async (e) => { 
    e.preventDefault();
    const token = localStorage.getItem('kmp_authToken');
    if (!token) return setNotification("Error: Security token missing.");
    
    // 🟢 ROUTE TO SEPARATE NEONDB TABLE BASED ON STATS DOMAIN
    const targetEndpoint = statsDomain === 'AGRICULTURAL' ? '/api/v1/agric-stats' : '/api/v1/stats';

    try {
      const response = await authFetch(targetEndpoint, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(formData)
      });
      if (!response.ok) throw new Error("Database rejected entry.");
      setNotification(`✅ ${statsDomain === 'AGRICULTURAL' ? 'Agricultural Crimes' : 'Disruptive OPS'} Statistics recorded successfully!`);
    } catch (err) {
      setNotification(`❌ Error: ${err.message}`);
    }
  };

  return (
    <div className="p-3 sm:p-6 max-w-[1600px] mx-auto space-y-6">
      <div className="text-center mb-6 flex flex-col items-center">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-700 tracking-tight">
          {statsDomain === 'AGRICULTURAL' ? '🌱 Agricultural Crimes Statistics' : '⚡ Disruptive OPS Statistics'}
        </h1>
        
        {/* Domain Toggle */}
        <div className="flex bg-slate-200 p-1 rounded-xl mt-4 border shadow-inner">
          <button type="button" onClick={() => setStatsDomain('DISRUPTIVE')} className={`px-4 py-2 rounded-lg font-bold text-xs transition ${statsDomain === 'DISRUPTIVE' ? 'bg-slate-900 text-white shadow' : 'text-slate-700'}`}>
            Disruptive OPS
          </button>
          <button type="button" onClick={() => setStatsDomain('AGRICULTURAL')} className={`px-4 py-2 rounded-lg font-bold text-xs transition ${statsDomain === 'AGRICULTURAL' ? 'bg-emerald-700 text-white shadow' : 'text-slate-700'}`}>
            🌱 Agricultural Crimes Stats
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 space-y-6">
            <h3 className="font-bold text-slate-800 text-sm">Log {statsDomain === 'AGRICULTURAL' ? 'Agri-Crimes' : 'Disruptive'} Figures</h3>
            {notification && <div className="p-3 bg-blue-50 text-blue-800 text-xs rounded border">{notification}</div>}
            
            <form onSubmit={handleFormSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Station *</label>
                <select name="station" value={formData.station} onChange={handleInputChange} className="w-full text-sm border p-2 rounded bg-white">
                  {(REGIONAL_HIERARCHY[formData.region] || []).map(stat => <option key={stat} value={stat}>{stat}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="text-[10px] font-bold">Arrested</label><input type="number" name="arrested" value={formData.arrested} onChange={handleInputChange} className="w-full border p-1 rounded" /></div>
                <div><label className="text-[10px] font-bold">Given Bond</label><input type="number" name="given_bond" value={formData.given_bond} onChange={handleInputChange} className="w-full border p-1 rounded" /></div>
              </div>
              <button type="submit" className="w-full bg-blue-700 text-white py-3 font-bold rounded-lg shadow">
                💾 Submit 8-Field Data Entry
              </button>
            </form>
          </div>
        </div>
        
        <div className="lg:col-span-8 space-y-4">
          <ExpandableTableCard title={`Weekly Metrics Breakdown Ledger (${statsDomain === 'AGRICULTURAL' ? 'Agricultural Crimes' : 'Disruptive OPS'})`}>
            <div className="overflow-x-auto w-full">
              <table className="min-w-full divide-y divide-gray-200 text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="p-3 text-left">S/N</th><th className="p-3 text-left">Date</th><th className="p-3 text-left">Division</th>
                    <th className="p-3 text-center">Arrested</th><th className="p-3 text-center">Bond</th><th className="p-3 text-center">Remanded</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStats.map((stat, idx) => (
                    <tr key={stat.id || idx} className="hover:bg-slate-50">
                      <td className="p-3">{idx + 1}</td><td className="p-3">{stat.date}</td><td className="p-3">{stat.station}</td>
                      <td className="p-3 text-center font-bold">{stat.arrested}</td><td className="p-3 text-center">{stat.given_bond}</td><td className="p-3 text-center">{stat.remanded}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ExpandableTableCard>
        </div>
      </div>
    </div>
  );
};

export default Statistics;