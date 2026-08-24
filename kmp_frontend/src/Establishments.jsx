import React, { useState, useMemo } from 'react';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';

const REGIONAL_HIERARCHY = {
  "KMP NORTH": ["KAWEMPE", "KAKIRI", "KASANGATI", "MATUGGA", "NANSANA", "OLD KAMPALA", "WAKISO", "WANDEGEYA"],
  "KMP EAST": ["JINJA ROAD", "KIRA", "KIRA ROAD", "MUKONO", "NAGGALAMA", "SEETA"],
  "KMP SOUTH": ["NATEETE", "CPS KAMPALA", "PARLIAMENT", "ENTEBBE", "KABALAGALA", "KAJJANSI", "KASENYI", "KATWE", "KYENGERA", "NSANGI"],
  "KMP HEADQUARTERS": ["KMP HEADQUARTERS", "FLYING SQUAD", "CRIME INTELLIGENCE"],
  "POLICE HEADQUARTERS": ["NAGURU"]
};

const autoCapitalize = (str) => str;

const Establishments = ({ currentUser, canViewGlobal: propCanViewGlobal = false, establishments, setEstablishments, setSidebarOpen }) => {
  const [operation, setOperation] = useState('new');
  const [notification, setNotification] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const canViewGlobal = propCanViewGlobal !== undefined ? propCanViewGlobal : (currentUser?.role === 'SUPER_ADMIN' || currentUser?.permissions?.view_global_roster === true);

  const [filterRegion, setFilterRegion] = useState(canViewGlobal ? 'ALL REGIONS' : currentUser?.region || '');
  const [filterStation, setFilterStation] = useState(canViewGlobal ? 'ALL STATIONS' : currentUser?.station || '');
  const [updateSearch, setUpdateSearch] = useState('');

  const [formData, setFormData] = useState({
    id: null, region: currentUser.region, division: currentUser.division || '', station: currentUser.station || REGIONAL_HIERARCHY[currentUser?.region]?.[0] || '',
    personnel_in_station: 0, sub_station: '', personnel_in_sub_station: 0, post: '', personnel_in_post: 0,
    booths: 0, location: '', personnel_in_booth: 0, installed_by: '', status: 'OPERATIONAL', comment: ''
  });
  
  const filteredEstablishments = useMemo(() => {
    return (Array.isArray(establishments) ? establishments : []).filter(e => {
      if (filterRegion !== 'ALL REGIONS' && e.region !== filterRegion) return false;
      if (filterStation !== 'ALL STATIONS' && e.station !== filterStation) return false;
      return true;
    });
  }, [establishments, filterRegion, filterStation]);

  const availableUpdateEstablishments = useMemo(() => {
    return (Array.isArray(establishments) ? establishments : []).filter(e => {
      if (!['ADMIN', 'SUPER_ADMIN'].includes(currentUser.role) && e.region !== currentUser.region) return false;
      if (updateSearch) {
        const query = updateSearch.toLowerCase();
        const recordId = e.id || e.sn;
        return recordId?.toString().includes(query) || (e.sub_station && e.sub_station.toLowerCase().includes(query)) || (e.post && e.post.toLowerCase().includes(query)) || (e.location && e.location.toLowerCase().includes(query));
      }
      return true;
    });
  }, [establishments, currentUser, updateSearch]);

  const handleInputChange = (e) => {
    const { name, value, type } = e.target;
    if (name === 'region') setFormData({ ...formData, region: value, division: REGIONAL_HIERARCHY[value]?.[0] || '', station: REGIONAL_HIERARCHY[value]?.[0] || '' });
    else if (name === 'division') setFormData({ ...formData, division: value, station: value });
    else setFormData({ ...formData, [name]: type === 'number' ? (value === '' ? 0 : parseInt(value) || 0) : value });
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

  const populateUpdateForm = (data) => setFormData({ ...data, id: data.id || data.sn, division: data.division || '' });

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    const requiredFields = ['region', 'division', 'station', 'location'];
    if (requiredFields.some(field => !formData[field] || String(formData[field]).trim() === '')) return setNotification("Error: All required fields must be filled.");

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

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.detail || "Failed to post record");
        }
        const savedData = await response.json();
        setEstablishments([savedData, ...establishments]); 
        setNotification(`Establishment recorded for ${formData.station}!`);
        setFormData({ 
          id: null, region: currentUser.region, division: currentUser.division || '', station: currentUser.station || REGIONAL_HIERARCHY[currentUser?.region]?.[0] || '', 
          personnel_in_station: 0, sub_station: '', personnel_in_sub_station: 0, post: '', personnel_in_post: 0, 
          booths: 0, location: '', personnel_in_booth: 0, installed_by: '', status: 'OPERATIONAL', comment: '' 
        });
      } catch (err) { 
        setNotification(`Error: ${err.message || "Server rejected the data. Please check connection."}`); 
      } finally { 
        setIsSubmitting(false); 
      }
      
    } else if (operation === 'update') {
      const recordId = formData.id || formData.sn;
      if (!recordId) { setNotification("Error: Please select a record from the list to update first."); setIsSubmitting(false); return; }
      
      const updatedRecord = { ...formData, last_updated_by: `${currentUser.name} (${currentUser.fnum})` };
      delete updatedRecord.id; delete updatedRecord.sn;

      try {
        const response = await fetch(`${API_URL}/api/v1/establishments/${recordId}`, {
          method: "PUT", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }, body: JSON.stringify(updatedRecord)
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.detail || "Failed to update record in database.");
        }
        const savedData = await response.json();
        const finalUpdated = { ...savedData, id: savedData.id || recordId };

        setEstablishments(establishments.map(e => (e.id === recordId || e.sn === recordId) ? finalUpdated : e));
        setNotification(`Establishment ID ${recordId} successfully updated!`);
        handleOperationToggle('new');
      } catch (err) { 
        setNotification(`❌ Error: ${err.message || "Could not update the record."}`); 
      } finally { 
        setIsSubmitting(false); 
      }
    }
    
    setTimeout(() => setNotification(null), 4000);
  };

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6 relative z-10">
      <div className="text-center mb-8 flex flex-col items-center">
        <img src="/upf_badge.png" alt="UPF Logo" className="w-16 h-16 mb-3 object-contain contrast-200 brightness-75 drop-shadow-sm" onError={(e) => { e.target.style.display = 'none'; }} />
        <h1 className="text-3xl font-extrabold text-gray-700 tracking-tight">Regional Establishments</h1>
        <h3 className="text-lg text-green-500 mt-2 font-medium">Divisions, Stations, Posts, Booths and Man-power Strength</h3>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <>
          {/* LEFT COLUMN: FORM & CONTROLS */}
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="bg-slate-900 px-4 py-3 border-b border-gray-200 flex justify-between items-center">
                <h3 className="text-white font-semibold flex items-center">⚙️ Log Establishment</h3>
              </div>
              <div className="p-5 space-y-6">
                <div className="flex space-x-2 bg-gray-100 p-1 rounded-lg">
                  <button type="button" onClick={() => handleOperationToggle('new')} className={`flex-1 py-2 text-sm font-medium rounded-md transition-all cursor-pointer ${operation === 'new' ? 'bg-white shadow text-blue-700 font-bold' : 'text-gray-600 hover:text-gray-900'}`}>
                    Register New
                  </button>
                  <button type="button" onClick={() => handleOperationToggle('update')} className={`flex-1 py-2 text-sm font-medium rounded-md transition-all cursor-pointer ${operation === 'update' ? 'bg-blue-700 shadow text-white font-bold' : 'text-gray-600 hover:text-gray-900'}`}>
                    Update Existing
                  </button>
                </div>

                {notification && (
                  <div className={`border px-4 py-3 rounded-lg flex items-center mb-4 ${notification.includes('Error') || notification.includes('❌') ? 'bg-red-50 border-red-200 text-red-800' : 'bg-green-50 border-green-200 text-green-800'}`}>
                    <span className="text-sm font-medium">{notification}</span>
                  </div>
                )}

                {operation === 'update' && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <label className="block text-xs font-bold text-blue-800 mb-2">🔍 Search & Select Record to Update</label>
                    <input type="text" placeholder="Search by ID, Sub-Station, Post..." value={updateSearch} onChange={e => setUpdateSearch(e.target.value)} className="w-full text-sm p-2 mb-2 border border-blue-200 rounded outline-none focus:ring-2 focus:ring-blue-400 bg-white" />
                    <div className="max-h-40 overflow-y-auto bg-white border border-blue-100 rounded custom-scrollbar">
                      {availableUpdateEstablishments.length === 0 ? (
                        <div className="p-3 text-xs text-gray-500 text-center">No records found matching your search.</div>
                      ) : (
                        availableUpdateEstablishments.map(e => {
                          const recordId = e.id || e.sn;
                          return (
                            <div key={recordId} onClick={() => populateUpdateForm(e)} className={`p-2 text-xs border-b cursor-pointer transition-colors ${formData.id === recordId ? 'bg-blue-600 text-white font-bold' : 'hover:bg-blue-50 text-gray-700'}`}>
                              <span className={formData.id === recordId ? 'text-blue-200' : 'text-gray-400'}>ID: {recordId}</span> | <span className={formData.id === recordId ? 'text-white' : 'font-bold text-blue-700'}>{e.sub_station || e.post || e.station}</span>
                            </div>
                          );
                        })
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
                  
                  <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2">
                        <label className="block text-xs font-bold text-gray-700 mb-1">Select Region *</label>
                        <select name="region" value={formData.region} onChange={handleInputChange} disabled={!canViewGlobal} className="w-full text-sm border-gray-300 rounded-md shadow-sm bg-white border p-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500">
                          {['ADMIN', 'SUPER_ADMIN'].includes(currentUser.role) ? Object.keys(REGIONAL_HIERARCHY).map(reg => <option key={reg} value={reg}>{reg}</option>) : <option value={currentUser.region}>{currentUser.region}</option>}
                        </select>
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs font-bold text-gray-700 mb-1">DIVISION (Headquarter) *</label>
                        <select name="division" value={formData.division} onChange={handleInputChange} disabled={!(['SUPER_ADMIN', 'RPC', 'Deputy Commander'].includes(currentUser.role) || canViewGlobal)} required className="w-full text-sm border-gray-300 rounded-md shadow-sm bg-white border p-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500">
                          {['ADMIN', 'SUPER_ADMIN', 'RPC', 'Deputy Commander'].includes(currentUser.role) ? (
                            formData.region && REGIONAL_HIERARCHY[formData.region] ? REGIONAL_HIERARCHY[formData.region].map(stat => <option key={stat} value={stat}>{stat}</option>) : <option value="">Select Region First</option>
                          ) : (
                            <option value={currentUser.station || currentUser.division}>{currentUser.station || currentUser.division}</option>
                          )}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2">
                        <label className="block text-xs font-bold text-gray-700 mb-1">STATION</label>
                        <input type="text" name="station" value={formData.station} onChange={handleInputChange} className="w-full text-sm border-gray-300 rounded-md shadow-sm border p-2 focus:ring-blue-500 bg-white" placeholder="Name of Station" />
                      </div>
                      <div className="col-span-2"> 
                        <label className="block text-xs font-bold text-gray-700 mb-1">PERSONNEL IN STATION</label> 
                        <input type="number" name="personnel_in_station" min="0" value={formData.personnel_in_station} onChange={handleInputChange} className="w-full text-sm border-gray-300 rounded-md shadow-sm border p-2 focus:ring-blue-500 bg-white" />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs font-bold text-gray-700 mb-1">SUB-STATION</label>
                        <input type="text" name="sub_station" value={formData.sub_station} onChange={handleInputChange} className="w-full text-sm border-gray-300 rounded-md shadow-sm border p-2 focus:ring-blue-500 bg-white" placeholder="Name of Sub-Station" />
                      </div>  
                      <div className="col-span-2">
                        <label className="block text-xs font-bold text-gray-700 mb-1">PERSONNEL IN SUB STATION</label>
                        <input type="number" name="personnel_in_sub_station" min="0" value={formData.personnel_in_sub_station} onChange={handleInputChange} className="w-full text-sm border-gray-300 rounded-md shadow-sm border p-2 focus:ring-blue-500 bg-white" />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">POST</label>
                        <input type="text" name="post" value={formData.post} onChange={handleInputChange} className="w-full text-sm border-gray-300 rounded-md shadow-sm border p-2 focus:ring-blue-500 bg-white" placeholder="Name of Post" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">PERSONNEL (POST)</label>
                        <input type="number" name="personnel_in_post" min="0" value={formData.personnel_in_post} onChange={handleInputChange} className="w-full text-sm border-gray-300 rounded-md shadow-sm border p-2 focus:ring-blue-500 bg-white" />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">BOOTHS</label>
                        <input type="number" name="booths" min="0" value={formData.booths} onChange={handleInputChange} className="w-full text-sm border-gray-300 rounded-md shadow-sm border p-2 focus:ring-blue-500 bg-white" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">PERSONNEL (BOOTH)</label>
                        <input type="number" name="personnel_in_booth" min="0" value={formData.personnel_in_booth} onChange={handleInputChange} className="w-full text-sm border-gray-300 rounded-md shadow-sm border p-2 focus:ring-blue-500 bg-white" />
                      </div>

                      <div className="col-span-2">
                        <label className="block text-xs font-bold text-gray-700 mb-1">LOCATION (Address/Area)</label>
                        <input type="text" name="location" value={formData.location} onChange={handleInputChange} className="w-full text-sm border-gray-300 rounded-md shadow-sm border p-2 focus:ring-blue-500 bg-white" placeholder="Detailed location..." />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs font-bold text-gray-700 mb-1">INSTALLED BY</label>
                        <input type="text" name="installed_by" value={formData.installed_by} onChange={handleInputChange} className="w-full text-sm border-gray-300 rounded-md shadow-sm border p-2 focus:ring-blue-500 bg-white" placeholder="Organization or Individual" />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs font-bold text-gray-700 mb-1">STATUS</label>
                        <select name="status" value={formData.status} onChange={handleInputChange} className="w-full text-sm border-gray-300 rounded-md shadow-sm bg-white border p-2 focus:ring-blue-500">
                          <option value="OPERATIONAL">OPERATIONAL</option>
                          <option value="UNDER MAINTENANCE">UNDER MAINTENANCE</option>
                          <option value="NON-OPERATIONAL">NON-OPERATIONAL</option>
                          <option value="DECOMMISSIONED">DECOMMISSIONED</option>
                          <option value="TO BE COMMISSIONED">TO BE COMMISSIONED</option> 
                        </select>
                      </div>
                      <div className="col-span-2 pb-8">
                        <label className="block text-xs font-bold text-gray-700 mb-1">COMMENT ON STATUS</label>
                        <ReactQuill 
                          theme="snow" 
                          value={formData.comment || ''} 
                          onChange={(content) => setFormData({ ...formData, comment: content })}
                          className="bg-white rounded-md"
                          modules={{ toolbar: [['bold', 'italic', 'underline'], [{ 'list': 'ordered'}, { 'list': 'bullet' }], ['clean']] }}
                        />
                      </div>
                    </div>
                  </div>

                  <button 
                    type="submit" disabled={isSubmitting}
                    className="w-full bg-blue-700 hover:bg-blue-800 transition-colors text-white mt-4 py-4 font-bold rounded-lg shadow text-xs uppercase tracking-wider flex justify-center items-center disabled:bg-gray-400 cursor-pointer"
                  >
                    {isSubmitting ? 'Processing...' : (operation === 'new' ? '💾 Log New Establishment' : '💾 Save Updates')}
                  </button>
                </form>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: FILTERS & TABLE */}
          <div className="lg:col-span-8 space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <select value={filterRegion} onChange={(e) => { setFilterRegion(e.target.value); setFilterStation('ALL STATIONS'); }} disabled={!canViewGlobal} className="border rounded-lg px-3 py-2 text-sm shadow-sm bg-white disabled:bg-gray-100 disabled:text-gray-500 w-full sm:w-auto outline-none focus:border-blue-500 cursor-pointer">
                {canViewGlobal ? (
                  <><option value="ALL REGIONS">ALL REGIONS</option>{Object.keys(REGIONAL_HIERARCHY).map(reg => <option key={reg} value={reg}>{reg}</option>)}</>
                ) : <option value={currentUser?.region}>{currentUser?.region}</option>}
              </select>
              <select value={filterStation} onChange={(e) => setFilterStation(e.target.value)} disabled={!canViewGlobal} className="border rounded-lg px-3 py-2 text-sm shadow-sm bg-white disabled:bg-gray-100 disabled:text-gray-500 w-full sm:w-auto outline-none focus:border-blue-500 cursor-pointer">
                {canViewGlobal ? (
                  <><option value="ALL STATIONS">ALL STATIONS</option>{filterRegion !== 'ALL REGIONS' && REGIONAL_HIERARCHY[filterRegion] ? REGIONAL_HIERARCHY[filterRegion].map(stat => <option key={stat} value={stat}>{stat}</option>) : null}</>
                ) : <option value={currentUser?.station}>{currentUser?.station}</option>}
              </select>
            </div>

            <ExpandableTableCard title="Regional Establishments Master Ledger" onToggle={(expanded) => { if (setSidebarOpen) setSidebarOpen(!expanded); }}>
              <div className="overflow-x-auto w-full">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50 sticky top-0 z-10">
                    <tr>
                      <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider leading-tight">DIVISION</th>
                      <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider leading-tight">STATION</th>
                      <th className="px-2 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider leading-tight">PERS<br/>(STN)</th>
                      <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider leading-tight">SUB-STATION</th>
                      <th className="px-2 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider leading-tight">PERS<br/>(SUB-STN)</th>
                      <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider leading-tight">POST</th>
                      <th className="px-2 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider leading-tight">PERS<br/>(POST)</th>
                      <th className="px-2 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider leading-tight">BOOTHS</th>
                      <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider leading-tight">LOCATION</th>
                      <th className="px-2 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider leading-tight">PERS<br/>(BOOTH)</th>
                      <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider leading-tight">INSTALLED BY</th>
                      <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider leading-tight">STATUS</th>
                      <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider leading-tight">COMMENT</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredEstablishments.map((est) => {
                      const rowKey = est.id || est.sn;
                      return (
                        <tr key={rowKey} className="even:bg-slate-50 hover:bg-blue-50 transition-colors cursor-pointer" onClick={() => { if(operation === 'update') populateUpdateForm(est); }}>
                          <td className="px-3 py-3 whitespace-nowrap text-xs font-bold text-gray-900">{est.division || 'N/A'}</td>
                          <td className="px-3 py-3 whitespace-nowrap text-xs font-bold text-blue-800">{est.station}</td>
                          <td className="px-2 py-3 whitespace-nowrap text-xs text-center font-bold">{est.personnel_in_station}</td> 
                          <td className="px-3 py-3 whitespace-nowrap text-xs text-gray-800">{est.sub_station || '-'}</td>
                          <td className="px-2 py-3 whitespace-nowrap text-xs text-center font-bold">{est.personnel_in_sub_station}</td>
                          <td className="px-3 py-3 whitespace-nowrap text-xs text-gray-800">{est.post || '-'}</td>
                          <td className="px-2 py-3 whitespace-nowrap text-xs text-center font-bold">{est.personnel_in_post}</td>
                          <td className="px-2 py-3 whitespace-nowrap text-xs text-center font-bold">{est.booths}</td>
                          <td className="px-3 py-3 text-xs text-gray-800 break-words max-w-[150px]">{est.location || '-'}</td>
                          <td className="px-2 py-3 whitespace-nowrap text-xs text-center font-bold">{est.personnel_in_booth}</td>
                          <td className="px-3 py-3 whitespace-nowrap text-xs text-gray-600">{est.installed_by || '-'}</td>
                          <td className="px-3 py-3 whitespace-nowrap text-xs font-bold">
                            <span className={`px-2 py-1 rounded-full text-[9px] ${est.status === 'OPERATIONAL' ? 'bg-green-100 text-green-800' : est.status?.includes('MAINTENANCE') ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}`}>
                              {est.status}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-xs text-gray-500 italic max-w-[150px] break-words">
                             <div className="ql-editor p-0" dangerouslySetInnerHTML={{ __html: est.comment || '-' }} />
                          </td>
                        </tr>
                      );
                    })}
                    {filteredEstablishments.length === 0 && <tr><td colSpan="13" className="text-center py-6 text-gray-500">No establishments logged for this jurisdiction.</td></tr>}
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

const ExpandableTableCard = ({ title, children, onToggle }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  return (
    <div className={isExpanded ? "fixed inset-4 z-[9999] bg-white rounded-xl shadow-2xl p-6 overflow-auto flex flex-col" : "bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col"}>
      <div className="bg-slate-50 px-4 py-3 border-b flex justify-between items-center">
        <h3 className="text-gray-800 font-bold text-sm uppercase tracking-wider">{title}</h3>
        <button onClick={() => { const next = !isExpanded; setIsExpanded(next); if (onToggle) onToggle(next); }} className="text-xs font-bold text-blue-600 hover:underline cursor-pointer">
          {isExpanded ? 'Collapse ↙' : 'Expand ↗'}
        </button>
      </div>
      <div className="p-0 overflow-auto flex-1">{children}</div>
    </div>
  );
};

export default Establishments;