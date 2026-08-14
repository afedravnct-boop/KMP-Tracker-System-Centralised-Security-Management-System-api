import React, { useState, useMemo } from 'react';
import { Building, PlusCircle, CheckCircle, AlertTriangle, Loader2, Edit, Search, X } from 'lucide-react';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';

// Expandable Table Card Component (Ensure this is available in your file)
const ExpandableTableCard = ({ title, children, onToggle }) => {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="bg-slate-900 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
        <h3 className="font-extrabold text-white text-sm uppercase tracking-wider">{title}</h3>
        <button 
          onClick={() => {
            const nextState = !expanded;
            setExpanded(nextState);
            if (onToggle) onToggle(nextState);
          }}
          className="text-xs text-blue-400 hover:text-white font-bold transition"
        >
          {expanded ? 'Collapse View ↗' : 'Expand View ↙'}
        </button>
      </div>
      {children}
    </div>
  );
};

// Auto-capitalize helper
const autoCapitalize = (text) => {
  if (!text) return '';
  return text.toUpperCase();
};

const Establishments = ({ currentUser, establishments, setEstablishments, setSidebarOpen, REGIONAL_HIERARCHY }) => {
  const [operation, setOperation] = useState('new');
  const [notification, setNotification] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [filterRegion, setFilterRegion] = useState(currentUser?.role === 'SUPER_ADMIN' ? 'ALL REGIONS' : currentUser?.region || '');
  const [filterStation, setFilterStation] = useState((['SUPER_ADMIN', 'RPC', 'Deputy Commander'].includes(currentUser?.role) || currentUser?.permissions?.view_global_roster) ? 'ALL STATIONS' : currentUser?.station || '');
  const [updateSearch, setUpdateSearch] = useState('');

  const [formData, setFormData] = useState({
    id: null, region: currentUser.region, division: currentUser.division || '', station: currentUser.station || REGIONAL_HIERARCHY[currentUser?.region]?.[0] || '',
    personnel_in_station: 0, sub_station: '', personnel_in_sub_station: 0, post: '', personnel_in_post: 0,
    booths: 0, location: '', personnel_in_booth: 0, installed_by: '', status: 'OPERATIONAL', comment: ''
  });

  // 🟢 1. The data for the MASTER LEDGER TABLE (Driven by Region/Station dropdowns)
  const filteredEstablishments = useMemo(() => {
    return (Array.isArray(establishments) ? establishments : []).filter(e => {
      if (filterRegion !== 'ALL REGIONS' && e.region !== filterRegion) return false;
      if (filterStation !== 'ALL STATIONS' && e.station !== filterStation) return false;
      return true;
    });
  }, [establishments, filterRegion, filterStation]);

  // 🟢 2. The data for the "Update Search" dropdown in the form (Driven by the text input)
  const availableUpdateEstablishments = useMemo(() => {
    return (Array.isArray(establishments) ? establishments : []).filter(e => {
      if (!['ADMIN', 'SUPER_ADMIN'].includes(currentUser.role) && e.region !== currentUser.region) return false;
      if (updateSearch) {
        const query = updateSearch.toLowerCase();
        return e.sn?.toString().includes(query) || (e.sub_station && e.sub_station.toLowerCase().includes(query)) || (e.post && e.post.toLowerCase().includes(query)) || (e.location && e.location.toLowerCase().includes(query)) || (e.station && e.station.toLowerCase().includes(query));
      }
      return true;
    });
  }, [establishments, currentUser, updateSearch]);

  const handleInputChange = (e) => {
    const { name, value, type } = e.target;
    if (name === 'region') setFormData({ ...formData, region: value, division: REGIONAL_HIERARCHY[value]?.[0] || '', station: REGIONAL_HIERARCHY[value]?.[0] || '' });
    else if (name === 'division') setFormData({ ...formData, division: value, station: value });
    else setFormData({ ...formData, [name]: type === 'number' ? parseInt(value) || 0 : value });
  };

  const handleOperationToggle = (op) => {
    setOperation(op); setNotification(null);
    if (op === 'new') {
      setFormData({
        id: null, region: currentUser.region, division: currentUser.division || '', station: currentUser.station || REGIONAL_HIERARCHY[currentUser?.region]?.[0] || '', 
        personnel_in_station: 0, sub_station: '', personnel_in_sub_station: 0, post: '', personnel_in_post: 0, 
        booths: 0, location: '', personnel_in_booth: 0, installed_by: '', status: 'OPERATIONAL', comment: ''
      });
      setUpdateSearch('');
    }
  };

  const populateUpdateForm = (data) => setFormData({ ...data, division: data.division || '' });

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    const requiredFields = ['region', 'division', 'station', 'location'];
    if (requiredFields.some(field => !formData[field] || String(formData[field]).trim() === '')) return setNotification("Error: All required fields must be filled.");

    const isDuplicate = establishments.some(e => e.region === formData.region && e.station === formData.station && e.division === formData.division && e.id !== formData.id);
    if (isDuplicate && operation === 'new') return setNotification("Error: An entry for this station already exists.");

    setIsSubmitting(true); 
    const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
    const token = localStorage.getItem('kmp_authToken');

    if (operation === 'new') {
      const newEntry = { ...formData, last_updated_by: `${currentUser.name} (${currentUser.fnum})` };
      delete newEntry.sn; delete newEntry.id;
      
      try {
        const response = await fetch(`${API_URL}/api/v1/establishments`, {
          method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }, body: JSON.stringify(newEntry)
        });

        if (!response.ok) throw new Error("Failed to post record");
        const savedData = await response.json();
        setEstablishments([savedData, ...establishments]); 
        setNotification(`Establishment recorded for ${formData.station}!`);
        setFormData({ ...formData, division:'', station:'', personnel_in_station:0, sub_station: '', personnel_in_sub_station: 0, post: '', personnel_in_post: 0, booths: 0, location: '', personnel_in_booth: 0, installed_by: '', comment: '', id: null });
      } catch (err) { 
        setNotification("Error: Server rejected the data. Please check connection."); 
      } finally { 
        setIsSubmitting(false); 
      }
      
    } else if (operation === 'update') {
      if (!formData.id) { setNotification("Error: Please select a record from the list to update first."); setIsSubmitting(false); return; }
      const updatedRecord = { ...formData, last_updated_by: `${currentUser.name} (${currentUser.fnum})` };

      try {
        const response = await fetch(`${API_URL}/api/v1/establishments/${formData.id}`, {
          method: "PUT", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }, body: JSON.stringify(updatedRecord)
        });

        if (!response.ok) throw new Error("Failed to update record in database.");
        setEstablishments(establishments.map(e => e.id === formData.id ? updatedRecord : e));
        setNotification(`Establishment ID ${formData.id} successfully updated!`);
        handleOperationToggle('new');
      } catch (err) { 
        setNotification("❌ Error: Could not update the record in the database."); 
      } finally { 
        setIsSubmitting(false); 
      }
    }
    
    setTimeout(() => setNotification(null), 4000);
  };

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6 relative z-10 font-sans">
      <div className="text-center mb-8 flex flex-col items-center">
        <img src="/upf_badge.png" alt="UPF Logo" className="w-16 h-16 mb-3 object-contain contrast-200 brightness-75 drop-shadow-sm" onError={(e) => { e.target.style.display = 'none'; }} />
        <h1 className="text-3xl font-extrabold text-gray-700 tracking-tight">Regional Establishments</h1>
        <h3 className="text-lg text-emerald-600 mt-2 font-medium">Divisions, Stations, Posts, Booths and Man-power Strength</h3>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* ========================================== */}
        {/* LEFT COLUMN: COMPACT FORM                  */}
        {/* ========================================== */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="bg-slate-900 px-4 py-3 border-b border-slate-200 flex justify-between items-center">
              <h3 className="text-white font-semibold flex items-center"><Building className="w-5 h-5 mr-2 text-emerald-400" /> ⚙️ Log Establishment</h3>
            </div>
            
            <div className="p-4 sm:p-5 space-y-5">
              <div className="flex space-x-2 bg-slate-100 p-1 rounded-lg">
                <button type="button" onClick={() => handleOperationToggle('new')} className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${operation === 'new' ? 'bg-white shadow text-emerald-700' : 'text-slate-600 hover:text-slate-900'}`}>
                  <PlusCircle className="w-4 h-4 inline mr-1" /> Register New
                </button>
                <button type="button" onClick={() => handleOperationToggle('update')} className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${operation === 'update' ? 'bg-white shadow text-emerald-700' : 'text-slate-600 hover:text-slate-900'}`}>
                  <Edit className="w-4 h-4 inline mr-1" /> Update Existing
                </button>
              </div>

              {notification && (
                <div className={`border px-4 py-3 rounded-lg flex items-center mb-4 text-xs font-bold ${notification.includes('Error') || notification.includes('❌') ? 'bg-red-50 border-red-200 text-red-800' : 'bg-emerald-50 border-emerald-200 text-emerald-800'}`}>
                  {notification.includes('Error') || notification.includes('❌') ? <AlertTriangle className="w-4 h-4 mr-2 text-red-600 shrink-0" /> : <CheckCircle className="w-4 h-4 mr-2 text-emerald-600 shrink-0" />}
                  {notification}
                </div>
              )}

              {operation === 'update' && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                  <label className="block text-xs font-bold text-emerald-800 mb-2">🔍 Search & Select Record to Update</label>
                  <input type="text" placeholder="Search by SN, Sub-Station, Post..." value={updateSearch} onChange={e => setUpdateSearch(e.target.value)} className="w-full text-sm p-2 mb-2 border border-emerald-200 rounded outline-none focus:ring-2 focus:ring-emerald-400" />
                  <div className="max-h-40 overflow-y-auto bg-white border border-emerald-100 rounded custom-scrollbar">
                    {availableUpdateEstablishments.length === 0 ? (
                      <div className="p-3 text-xs text-slate-500 text-center">No records found matching your search.</div>
                    ) : (
                      availableUpdateEstablishments.map(e => (
                        <div key={e.id} onClick={() => populateUpdateForm(e)} className={`p-2 text-xs border-b cursor-pointer transition-colors ${formData.id === e.id ? 'bg-emerald-600 text-white font-bold' : 'hover:bg-emerald-50 text-slate-700'}`}>
                          <span className={formData.id === e.id ? 'text-emerald-200' : 'text-slate-400'}>SN: {e.id}</span> | <span className={formData.id === e.id ? 'text-white' : 'font-bold text-emerald-700'}>{e.sub_station || e.post || e.station}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
              
              <form onSubmit={handleFormSubmit} className="space-y-4">
                {operation === 'update' && formData.id && (
                   <div className="bg-slate-800 text-white text-xs font-bold px-3 py-2 rounded">
                     Currently Editing Record ID: {formData.id}
                   </div>
                )}
                
                {/* 🟢 COMPACT 2-COLUMN GRID FOR INPUTS */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2 sm:col-span-1">
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Region *</label>
                    <select name="region" value={formData.region} onChange={handleInputChange} disabled={!(['ADMIN', 'SUPER_ADMIN'].includes(currentUser.role))} required className="w-full text-xs border-slate-300 rounded shadow-sm bg-slate-50 border p-2 outline-none focus:border-emerald-500 disabled:bg-slate-100 disabled:text-slate-500 font-bold">
                      {['ADMIN', 'SUPER_ADMIN'].includes(currentUser.role) ? Object.keys(REGIONAL_HIERARCHY).map(reg => <option key={reg} value={reg}>{reg}</option>) : <option value={currentUser.region}>{currentUser.region}</option>}
                    </select>
                  </div>
                  
                  <div className="col-span-2 sm:col-span-1">
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Division (HQ) *</label>
                    <select name="division" value={formData.division} onChange={handleInputChange} disabled={!(['ADMIN', 'SUPER_ADMIN', 'RPC', 'Deputy Commander'].includes(currentUser.role))} required className="w-full text-xs border-slate-300 rounded shadow-sm bg-slate-50 border p-2 outline-none focus:border-emerald-500 disabled:bg-slate-100 disabled:text-slate-500 font-bold">
                      {['ADMIN', 'SUPER_ADMIN', 'RPC', 'Deputy Commander'].includes(currentUser.role) ? (
                        formData.region && REGIONAL_HIERARCHY[formData.region] ? REGIONAL_HIERARCHY[formData.region].map(stat => <option key={stat} value={stat}>{stat}</option>) : <option value="">Select Region First</option>
                      ) : (
                        <option value={currentUser.station || currentUser.division}>{currentUser.station || currentUser.division}</option>
                      )}
                    </select>
                  </div>

                  <div className="col-span-2 sm:col-span-1">
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Station</label>
                    <input type="text" name="station" value={formData.station} onChange={handleInputChange} className="w-full text-xs border-slate-300 rounded shadow-sm border p-2 outline-none focus:border-emerald-500 font-bold text-slate-800" placeholder="Station Name" />
                  </div>
                  
                  <div className="col-span-2 sm:col-span-1"> 
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Pers (Station)</label> 
                    <input type="number" name="personnel_in_station" min="0" value={formData.personnel_in_station} onChange={handleInputChange} className="w-full text-xs border-slate-300 rounded shadow-sm border p-2 outline-none focus:border-emerald-500 font-bold text-emerald-700" />
                  </div>

                  <div className="col-span-2 sm:col-span-1">
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Sub-Station</label>
                    <input type="text" name="sub_station" value={formData.sub_station} onChange={handleInputChange} className="w-full text-xs border-slate-300 rounded shadow-sm border p-2 outline-none focus:border-emerald-500" placeholder="Sub-Station Name" />
                  </div>  
                  
                  <div className="col-span-2 sm:col-span-1">
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Pers (Sub-Stn)</label>
                    <input type="number" name="personnel_in_sub_station" min="0" value={formData.personnel_in_sub_station} onChange={handleInputChange} className="w-full text-xs border-slate-300 rounded shadow-sm border p-2 outline-none focus:border-emerald-500 font-bold text-emerald-700" />
                  </div>

                  <div className="col-span-2 sm:col-span-1">
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Police Post</label>
                    <input type="text" name="post" value={formData.post} onChange={handleInputChange} className="w-full text-xs border-slate-300 rounded shadow-sm border p-2 outline-none focus:border-emerald-500" placeholder="Post Name" />
                  </div>
                  
                  <div className="col-span-2 sm:col-span-1">
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Pers (Post)</label>
                    <input type="number" name="personnel_in_post" min="0" value={formData.personnel_in_post} onChange={handleInputChange} className="w-full text-xs border-slate-300 rounded shadow-sm border p-2 outline-none focus:border-emerald-500 font-bold text-emerald-700" />
                  </div>

                  <div className="col-span-2 sm:col-span-1">
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Booths Count</label>
                    <input type="number" name="booths" min="0" value={formData.booths} onChange={handleInputChange} className="w-full text-xs border-slate-300 rounded shadow-sm border p-2 outline-none focus:border-emerald-500" />
                  </div>
                  
                  <div className="col-span-2 sm:col-span-1">
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Pers (Booth)</label>
                    <input type="number" name="personnel_in_booth" min="0" value={formData.personnel_in_booth} onChange={handleInputChange} className="w-full text-xs border-slate-300 rounded shadow-sm border p-2 outline-none focus:border-emerald-500 font-bold text-emerald-700" />
                  </div>

                  <div className="col-span-2">
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Location / Zone *</label>
                    <input type="text" name="location" value={formData.location} required onChange={handleInputChange} className="w-full text-xs border-slate-300 rounded shadow-sm border p-2 outline-none focus:border-emerald-500 uppercase" placeholder="e.g. Zone 2 Bwaise" />
                  </div>
                  
                  <div className="col-span-2">
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Installed By</label>
                    <input type="text" name="installed_by" value={formData.installed_by} onChange={handleInputChange} className="w-full text-xs border-slate-300 rounded shadow-sm border p-2 outline-none focus:border-emerald-500" placeholder="Organization / Individual" />
                  </div>
                  
                  <div className="col-span-2">
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Operational Status</label>
                    <select name="status" value={formData.status} onChange={handleInputChange} className="w-full text-xs border-slate-300 rounded shadow-sm bg-white border p-2 outline-none focus:border-emerald-500 font-bold">
                      <option value="OPERATIONAL">OPERATIONAL</option>
                      <option value="UNDER MAINTENANCE">UNDER MAINTENANCE</option>
                      <option value="NON-OPERATIONAL">NON-OPERATIONAL</option>
                      <option value="DECOMMISSIONED">DECOMMISSIONED</option>
                      <option value="TO BE COMMISSIONED">TO BE COMMISSIONED</option>  
                    </select>
                  </div>
                  
                  <div className="col-span-2 pb-6">
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Remarks / Comments</label>
                    <ReactQuill 
                      theme="snow" 
                      value={formData.comment || ''} 
                      onChange={(content) => setFormData({ ...formData, comment: autoCapitalize(content) })}
                      className="bg-white rounded-md [&_.ql-editor]:min-h-[60px]"
                      modules={{ toolbar: [['bold', 'italic', 'underline'], [{ 'list': 'ordered'}, { 'list': 'bullet' }], ['clean']] }}
                    />
                  </div>
                </div>

                <button 
                  type="submit" disabled={isSubmitting}
                  className="w-full bg-emerald-700 hover:bg-emerald-800 transition-colors text-white py-3.5 font-bold rounded-lg shadow-md text-sm flex justify-center items-center disabled:bg-slate-400 uppercase tracking-wider mt-2"
                >
                  {isSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <PlusCircle className="w-4 h-4 mr-2" />}
                  {isSubmitting ? 'Processing...' : (operation === 'new' ? 'Log Establishment Record' : 'Save Updates')}
                </button>
              </form>
            </div>
          </div>
        </div>

        {/* ========================================== */}
        {/* RIGHT COLUMN: FILTERS & MASTER TABLE       */}
        {/* ========================================== */}
        <div className="lg:col-span-8 space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Using updateSearch for local table filtering just like the backend logic */}
            <div className="relative flex-1"> 
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
              <input type="text" placeholder="Filter table by station, post, or location..." value={updateSearch} onChange={(e) => setUpdateSearch(e.target.value)} className="w-full pl-9 pr-4 py-2 border rounded-lg text-sm shadow-sm outline-none focus:border-emerald-500" />
            </div>
            <select value={filterRegion} onChange={(e) => { setFilterRegion(e.target.value); setFilterStation('ALL STATIONS'); }} disabled={!(['ADMIN', 'SUPER_ADMIN', 'RPC', 'Deputy Commander'].includes(currentUser?.role) || currentUser?.permissions?.view_global_roster)} className="border rounded-lg px-3 py-2 text-sm shadow-sm bg-white disabled:bg-slate-100 disabled:text-slate-500 w-full sm:w-auto outline-none focus:border-emerald-500">
              {['ADMIN', 'SUPER_ADMIN', 'RPC', 'Deputy Commander'].includes(currentUser?.role) || currentUser?.permissions?.view_global_roster ? (
                <><option value="ALL REGIONS">ALL REGIONS</option>{Object.keys(REGIONAL_HIERARCHY).map(reg => <option key={reg} value={reg}>{reg}</option>)}</>
              ) : <option value={currentUser?.region}>{currentUser?.region}</option>}
            </select>
            <select value={filterStation} onChange={(e) => setFilterStation(e.target.value)} disabled={!(['ADMIN', 'SUPER_ADMIN', 'RPC', 'Deputy Commander'].includes(currentUser?.role) || currentUser?.permissions?.view_global_roster)} className="border rounded-lg px-3 py-2 text-sm shadow-sm bg-white disabled:bg-slate-100 disabled:text-slate-500 w-full sm:w-auto outline-none focus:border-emerald-500">
              {['ADMIN', 'SUPER_ADMIN', 'RPC', 'Deputy Commander'].includes(currentUser?.role) || currentUser?.permissions?.view_global_roster ? (
                <><option value="ALL STATIONS">ALL STATIONS</option>{filterRegion !== 'ALL REGIONS' && REGIONAL_HIERARCHY[filterRegion] ? REGIONAL_HIERARCHY[filterRegion].map(stat => <option key={stat} value={stat}>{stat}</option>) : null}</>
              ) : <option value={currentUser?.station}>{currentUser?.station}</option>}
            </select>
          </div>

          <ExpandableTableCard title="Regional Establishments Master Ledger" onToggle={(expanded) => { if (setSidebarOpen) setSidebarOpen(!expanded); }}>
            <div className="overflow-x-auto w-full custom-scrollbar max-h-[70vh]">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                  <tr>
                    <th className="px-3 py-3 text-left text-[10px] font-extrabold text-slate-500 uppercase tracking-wider leading-tight">DIVISION</th>
                    <th className="px-3 py-3 text-left text-[10px] font-extrabold text-slate-500 uppercase tracking-wider leading-tight">STATION</th>
                    <th className="px-2 py-3 text-center text-[10px] font-extrabold text-slate-500 uppercase tracking-wider leading-tight">PERS<br/>(STN)</th>
                    <th className="px-3 py-3 text-left text-[10px] font-extrabold text-slate-500 uppercase tracking-wider leading-tight">SUB-STATION</th>
                    <th className="px-2 py-3 text-center text-[10px] font-extrabold text-slate-500 uppercase tracking-wider leading-tight">PERS<br/>(SUB-STN)</th>
                    <th className="px-3 py-3 text-left text-[10px] font-extrabold text-slate-500 uppercase tracking-wider leading-tight">POST</th>
                    <th className="px-2 py-3 text-center text-[10px] font-extrabold text-slate-500 uppercase tracking-wider leading-tight">PERS<br/>(POST)</th>
                    <th className="px-2 py-3 text-center text-[10px] font-extrabold text-slate-500 uppercase tracking-wider leading-tight">BOOTHS</th>
                    <th className="px-3 py-3 text-left text-[10px] font-extrabold text-slate-500 uppercase tracking-wider leading-tight">LOCATION</th>
                    <th className="px-2 py-3 text-center text-[10px] font-extrabold text-slate-500 uppercase tracking-wider leading-tight">PERS<br/>(BOOTH)</th>
                    <th className="px-3 py-3 text-left text-[10px] font-extrabold text-slate-500 uppercase tracking-wider leading-tight">INSTALLED BY</th>
                    <th className="px-3 py-3 text-left text-[10px] font-extrabold text-slate-500 uppercase tracking-wider leading-tight">STATUS</th>
                    <th className="px-3 py-3 text-left text-[10px] font-extrabold text-slate-500 uppercase tracking-wider leading-tight">COMMENT</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-100">
                  {/* 🟢 Using filteredEstablishments here ensures the table stays populated and responds to the dropdown filters perfectly */}
                  {filteredEstablishments.map((est) => (
                    <tr key={est.id} className="even:bg-slate-50 hover:bg-emerald-50 transition-colors cursor-pointer" onClick={() => { if(operation === 'update') populateUpdateForm(est); }}>
                      <td className="px-3 py-3 whitespace-nowrap text-xs font-bold text-slate-900">{est.division || 'N/A'}</td>
                      <td className="px-3 py-3 whitespace-nowrap text-xs font-extrabold text-blue-700">{est.station}</td>
                      <td className="px-2 py-3 whitespace-nowrap text-xs text-center font-bold text-emerald-700">{est.personnel_in_station}</td> 
                      <td className="px-3 py-3 whitespace-nowrap text-xs font-semibold text-slate-800">{est.sub_station || '-'}</td>
                      <td className="px-2 py-3 whitespace-nowrap text-xs text-center font-bold text-emerald-700">{est.personnel_in_sub_station}</td>
                      <td className="px-3 py-3 whitespace-nowrap text-xs font-semibold text-slate-800">{est.post || '-'}</td>
                      <td className="px-2 py-3 whitespace-nowrap text-xs text-center font-bold text-emerald-700">{est.personnel_in_post}</td>
                      <td className="px-2 py-3 whitespace-nowrap text-xs text-center font-bold">{est.booths}</td>
                      <td className="px-3 py-3 text-xs text-slate-800 font-medium break-words max-w-[150px] uppercase">{est.location || '-'}</td>
                      <td className="px-2 py-3 whitespace-nowrap text-xs text-center font-bold text-emerald-700">{est.personnel_in_booth}</td>
                      <td className="px-3 py-3 whitespace-nowrap text-xs text-slate-600 font-medium">{est.installed_by || '-'}</td>
                      <td className="px-3 py-3 whitespace-nowrap text-xs font-bold">
                        <span className={`px-2 py-1 rounded-full text-[9px] uppercase tracking-wide ${est.status === 'OPERATIONAL' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : est.status.includes('MAINTENANCE') ? 'bg-amber-100 text-amber-800 border border-amber-200' : 'bg-red-100 text-red-800 border border-red-200'}`}>
                          {est.status}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-500 italic max-w-[150px] break-words">
                         <div className="ql-editor p-0 [&_*]:!text-xs [&_*]:!bg-transparent" dangerouslySetInnerHTML={{ __html: est.comment || '-' }} />
                      </td>
                    </tr>
                  ))}
                  {filteredEstablishments.length === 0 && (
                    <tr>
                      <td colSpan="13" className="text-center py-10 text-slate-500 font-bold text-sm bg-slate-50">
                        No establishments found for this jurisdiction or search query.
                      </td>
                    </tr>
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

export default Establishments;