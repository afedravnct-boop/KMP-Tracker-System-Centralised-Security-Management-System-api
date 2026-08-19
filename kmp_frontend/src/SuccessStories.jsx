import React, { useState, useMemo } from 'react';
import { PlusCircle, Edit, AlertTriangle, CheckCircle, Image, X, Filter } from 'lucide-react';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';

const REGIONAL_HIERARCHY = {
  "KMP NORTH": ["KAWEMPE", "KAKIRI", "KASANGATI", "MATUGGA", "NANSANA", "OLD KAMPALA", "WAKISO", "WANDEGEYA"],
  "KMP EAST": ["JINJA ROAD", "KIRA", "KIRA ROAD", "MUKONO", "NAGGALAMA", "SEETA"],
  "KMP SOUTH": ["NATEETE", "CPS KAMPALA", "PARLIAMENT", "ENTEBBE", "KABALAGALA", "KAJJANSI", "KASENYI", "KATWE", "KYENGERA", "NSANGI"],
  "KMP HEADQUARTERS": ["KMP HEADQUARTERS", "FLYING SQUAD", "CRIME INTELLIGENCE"],
  "POLICE HEADQUARTERS": ["NAGURU"]
};

const getOfficialRegionForStation = (stationName, dbRegion) => {
  const cleanStation = (stationName || '').trim().toUpperCase();
  const cleanDbRegion = (dbRegion || '').trim().toUpperCase();

  if (REGIONAL_HIERARCHY[cleanDbRegion] && REGIONAL_HIERARCHY[cleanDbRegion].includes(cleanStation)) {
    return cleanDbRegion;
  }

  for (const [regionName, stationsList] of Object.entries(REGIONAL_HIERARCHY)) {
    if (stationsList.includes(cleanStation)) {
      return regionName;
    }
  }

  return cleanDbRegion || 'KMP GENERAL';
};

const ExpandableTableCard = ({ title, children, onToggle }) => {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
      <div className="bg-slate-900 px-4 py-3 flex justify-between items-center">
        <h3 className="font-extrabold text-white text-sm uppercase tracking-wider">{title}</h3>
        <button onClick={() => { const nextState = !expanded; setExpanded(nextState); if (onToggle) onToggle(nextState); }} className="text-xs text-blue-400 hover:text-white font-bold cursor-pointer">
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

const autoCapitalize = (text) => {
  if (!text) return text;
  return text.replace(/(^\s*|>|\.\s+|\n\s*)([a-z])/g, (match, separator, letter) => {
    return separator + letter.toUpperCase();
  });
};

const SuccessStories = ({ currentUser, canViewGlobal = false, stories, setStories, setSidebarOpen, reports, setSelectedCase }) => {
  const [operation, setOperation] = useState('new');
  
  // 🟢 Safely resolve global view active state matching other modules
  const canViewGlobalActive = canViewGlobal || currentUser?.role === 'SUPER_ADMIN' || currentUser?.permissions?.view_global_roster === true || currentUser?.permissions?.global_observer === true;

  const [filterRegion, setFilterRegion] = useState(canViewGlobalActive ? 'ALL REGIONS' : currentUser?.region || '');
  const [filterStation, setFilterStation] = useState(canViewGlobalActive ? 'ALL STATIONS' : currentUser?.station || '');
  
  const [notification, setNotification] = useState(null);
  const [updateSearch, setUpdateSearch] = useState('');
  const [dateFilter, setDateFilter] = useState('ALL TIME');

  if (!stories) return <div className="p-4 text-gray-500">Loading mission logs...</div>;

  const getTodayString = () => new Date().toLocaleDateString('en-CA').split(',')[0].replace(/\//g, '-');

  const [formData, setFormData] = useState({
    sn: null, region: currentUser.region, station: currentUser.station || REGIONAL_HIERARCHY[currentUser?.region]?.[0] || '',
    date: getTodayString(), time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }).replace(':', '') + 'Hrs',
    narrative: '', status: 'COMPLETED / SUCCESS', updateText: '', photo_url: ''
  });

  // 🟢 Flexible helper to detect crime references regardless of case or spacing differences (e.g., sd ref vs SD Ref:)
  const findLinkedCrimeCase = (successStoryNarrative, allReports) => {
    if (!successStoryNarrative || !Array.isArray(allReports)) return null;
    
    const refRegex = /(sd\s*ref|crb|def|gef|tar|cid)\s*:?\s*([A-Z0-9/\-]+)/gi;
    const matches = [...successStoryNarrative.matchAll(refRegex)];
    
    for (const match of matches) {
      const searchNum = match[2].trim().toUpperCase();
      
      const foundCase = allReports.find(r => {
        const dbRef = (r.sdRef || r.sd_ref || '').trim().toUpperCase();
        return dbRef.includes(searchNum);
      });

      if (foundCase) return foundCase;
    }
    
    return null;
  };

  const filteredStories = useMemo(() => {
    return (Array.isArray(stories) ? stories : []).filter(s => {
      const stn = (s.station || '').trim().toUpperCase();
      const reg = getOfficialRegionForStation(stn, s.region);

      // 🟢 Bypass regional/station filtering if global view is active and 'ALL' options are selected
      if (canViewGlobalActive && filterRegion === 'ALL REGIONS' && filterStation === 'ALL STATIONS') {
        // Fall through to date check
      } else {
        if (filterRegion !== 'ALL REGIONS' && reg !== filterRegion.toUpperCase()) return false;
        if (filterStation !== 'ALL STATIONS' && stn !== filterStation.toUpperCase()) return false;
      }

      if (dateFilter === 'TODAY') {
        const todayStr = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0];
        if (s.date !== todayStr) return false;
      } else if (dateFilter === 'LAST 7 DAYS') {
        const diffDays = Math.ceil(Math.abs(new Date() - new Date(s.date)) / (1000 * 60 * 60 * 24)); if (diffDays > 7) return false;
      } else if (dateFilter === 'LAST 30 DAYS') {
        const diffDays = Math.ceil(Math.abs(new Date() - new Date(s.date)) / (1000 * 60 * 60 * 24)); if (diffDays > 30) return false;
      } else if (dateFilter === 'LAST 90 DAYS') {
        const diffDays = Math.ceil(Math.abs(new Date() - new Date(s.date)) / (1000 * 60 * 60 * 24)); if (diffDays > 90) return false;
      } else if (dateFilter === 'LAST 120 DAYS') {
        const diffDays = Math.ceil(Math.abs(new Date() - new Date(s.date)) / (1000 * 60 * 60 * 24)); if (diffDays > 120) return false;
      }
      return true;
    });
  }, [stories, filterRegion, filterStation, dateFilter, canViewGlobalActive]);

  const availableUpdateStories = useMemo(() => {
    return (Array.isArray(stories) ? stories : []).filter(s => {
      const stn = (s.station || '').trim().toUpperCase();
      const reg = getOfficialRegionForStation(stn, s.region);

      if (!['ADMIN', 'SUPER_ADMIN'].includes(currentUser.role) && !canViewGlobalActive && reg !== currentUser.region) return false;
      if (updateSearch) {
        const query = updateSearch.toLowerCase();
        return s.sn.toString().includes(query) || s.narrative.toLowerCase().includes(query);
      }
      return true;
    });
  }, [stories, currentUser, updateSearch, canViewGlobalActive]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    if (name === 'region') setFormData({ ...formData, region: value, station: REGIONAL_HIERARCHY[value][0] });
    else setFormData({ ...formData, [name]: value });
  };

  const handleExhibitUpload = async (e) => {
    const file = e.target.files[0];
    if (file) {
      setNotification("Uploading exhibit to secure S3 bucket...");
      const uploadData = new FormData();
      uploadData.append("file", file);
      uploadData.append("category", "scene");
      uploadData.append("case_id", formData.sn || "NEW_STORY");
      uploadData.append("narrative", formData.narrative || "Exhibit Upload");

      try {
        const response = await authFetch("/api/v1/investigation/upload/", { method: "POST", body: uploadData });
        const data = await response.json();
        if (data.full_s3_url || data.cloud_storage_path) {
          setFormData({ ...formData, photo_url: data.full_s3_url || `https://kmp-tracker-system-tu-16-06-26.s3.eu-central-1.amazonaws.com/${data.cloud_storage_path}` });
          setNotification("Exhibit uploaded to S3 successfully!");
        } else {
           throw new Error("Invalid API Response");
        }
      } catch (error) {
        console.warn("Backend unreachable, falling back to local Blob URL for UI testing.", error);
        setFormData({ ...formData, photo_url: URL.createObjectURL(file) });
        setNotification("Note: API offline. Using temporary local preview.");
      }
    }
  };

  const handleOperationToggle = (op) => {
    setOperation(op); setNotification(null);
    if (op === 'new') {
      setFormData({
        sn: null, region: currentUser.region, station: currentUser.station || REGIONAL_HIERARCHY[currentUser?.region]?.[0] || '',
        date: getTodayString(), time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }).replace(':', '') + 'Hrs',
        narrative: '', status: 'COMPLETED / SUCCESS', updateText: '', photo_url: ''
      });
      setUpdateSearch('');
    }
  };

  const populateUpdateForm = (storyData) => setFormData({ ...storyData, updateText: '' });

  const handleFormSubmit = (e) => {
    e.preventDefault();

    // Respect active toggle region/station if global view is active
    const activeRegion = (canViewGlobalActive && filterRegion !== 'ALL REGIONS') ? filterRegion : formData.region;
    const activeStation = (canViewGlobalActive && filterStation !== 'ALL STATIONS') ? filterStation : formData.station;

    const submissionData = { ...formData, region: activeRegion, station: activeStation };

    if (operation === 'new') {
      const cleanNewText = submissionData.narrative.replace(/<[^>]*>?/gm, '').trim().toLowerCase();
      const isDuplicate = stories.some(s => s.narrative.replace(/<[^>]*>?/gm, '').trim().toLowerCase() === cleanNewText);

      if (isDuplicate) return setNotification("Error: This exact success story has already been submitted to the ledger.");

      const exactNextSN = (stories && stories.length > 0) ? Math.max(...stories.map(s => s.sn)) + 1 : 1;
      const newStory = { ...submissionData, sn: exactNextSN, last_updated_by: `${currentUser.name} (${currentUser.fnum})` };
      delete newStory.updateText;
      
      authFetch("/api/v1/stories", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newStory)
      }).catch(err => console.error("Cloud sync failed:", err));

      setStories([newStory, ...stories]);
      setNotification(`Success story SN ${newStory.sn} logged successfully!`);
      
    } else if (operation === 'update') {
      if (!submissionData.sn) return setNotification("Error: Please select a story from the list to update first.");

      const updatedNarrative = submissionData.updateText 
        ? `${submissionData.narrative}\n<br/><br/><strong>[UPDATE ${new Date().toISOString().slice(0,16).replace('T', ' ')}]:</strong><br/>${submissionData.updateText}` 
        : submissionData.narrative;
        
      const updatedRecord = { ...submissionData, narrative: updatedNarrative, last_updated_by: `${currentUser.name} (${currentUser.fnum})` };
      delete updatedRecord.updateText;

      authFetch(`/api/v1/stories/${submissionData.sn}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updatedRecord)
      }).catch(err => console.error("Cloud sync failed:", err));

      setStories((stories || []).map(s => s.sn === submissionData.sn ? updatedRecord : s));
      setNotification(`Success story SN ${submissionData.sn} successfully updated!`);
    }

    setTimeout(() => setNotification(null), 4000);
    if (operation === 'new') setFormData({ ...formData, time: '', narrative: '', sn: null, updateText: '', photo_url: '' });
  };

  return (
    <div className="p-3 sm:p-6 max-w-[1600px] mx-auto space-y-6 relative z-10">
      <div className="text-center mb-8 flex flex-col items-center">
        <img src="/upf_badge.png" alt="UPF Logo" className="w-16 h-16 mb-3 object-contain contrast-200 brightness-75 drop-shadow-sm" onError={(e) => { e.target.style.display = 'none'; }}/>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-700 tracking-tight">Operational Success Stories</h1>
        <h3 className="text-sm sm:text-lg text-amber-500 mt-2 font-medium">Highlighting UPF Anti-Crime Milestones</h3>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-5 space-y-6">
              <div className="flex space-x-2 bg-gray-100 p-1 rounded-lg">
                <button type="button" onClick={() => handleOperationToggle('new')} className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${operation === 'new' ? 'bg-white shadow text-yellow-600' : 'text-gray-600 hover:text-gray-900'}`}><PlusCircle className="w-4 h-4 inline mr-1" /> Register New</button>
                <button type="button" onClick={() => handleOperationToggle('update')} className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${operation === 'update' ? 'bg-green shadow text-white' : 'text-gray-600 hover:text-gray-900'}`}><Edit className="w-4 h-4 inline mr-1" /> Update Existing</button>
              </div>

              {notification && <div className={`border px-4 py-3 rounded-lg flex items-center mb-4 ${notification.includes('Error') ? 'bg-red-50 border-red-200 text-red-800' : 'bg-green-50 border-green-200 text-green-800'}`}>{notification.includes('Error') ? <AlertTriangle className="w-5 h-5 mr-2 text-red-500 shrink-0" /> : <CheckCircle className="w-5 h-5 mr-2 text-green-500 shrink-0" />}<span className="text-sm font-medium">{notification}</span></div>}

              {operation === 'update' && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                  <label className="block text-xs font-bold text-yellow-800 mb-2">🔍 Search & Select Story to Update</label>
                  <input type="text" placeholder="Search by SN or Narrative..." value={updateSearch} onChange={e => setUpdateSearch(e.target.value)} className="w-full text-sm p-2 mb-2 border border-yellow-200 rounded outline-none focus:ring-2 focus:ring-yellow-400" />
                  <div className="max-h-40 overflow-y-auto bg-white border border-yellow-100 rounded custom-scrollbar">
                    {availableUpdateStories.length === 0 ? <div className="p-3 text-xs text-gray-500 text-center">No success stories found matching your search.</div> : availableUpdateStories?.map(s => (
                        <div key={s.sn} onClick={() => populateUpdateForm(s)} className={`p-2 text-xs border-b cursor-pointer transition-colors ${formData.sn === s.sn ? 'bg-yellow-500 text-white font-bold' : 'hover:bg-yellow-50 text-gray-700'}`}>
                          <span className={formData.sn === s.sn ? 'text-yellow-100' : 'text-gray-400'}>SN: {s.sn}</span> | <span className={formData.sn === s.sn ? 'text-white' : 'font-bold text-yellow-700'}>{s.date}</span> | {s.station}
                        </div>
                      ))}
                  </div>
                </div>
              )}

              <form onSubmit={handleFormSubmit} className="space-y-4">
                {operation === 'update' && formData.sn && <div className="bg-slate-800 text-white text-xs font-bold px-3 py-2 rounded">Currently Editing: SN {formData.sn}</div>}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Select Region *</label>
                    <select name="region" value={formData.region} onChange={handleInputChange} disabled={!canViewGlobalActive || operation === 'update'} required className="w-full text-sm border-gray-300 rounded-md shadow-sm bg-gray-50 border p-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500">
                      {canViewGlobalActive ? Object.keys(REGIONAL_HIERARCHY).map(reg => <option key={reg} value={reg}>{reg}</option>) : <option value={currentUser.region}>{currentUser.region}</option>}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Station *</label>
                    <select name="station" value={formData.station} onChange={handleInputChange} disabled={!canViewGlobalActive || operation === 'update'} required className="w-full text-sm border-gray-300 rounded-md shadow-sm bg-gray-50 border p-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500">
                      {operation === 'update' ? <option value={formData.station}>{formData.station}</option> : canViewGlobalActive ? (REGIONAL_HIERARCHY[formData.region] || []).map(stat => <option key={stat} value={stat}>{stat}</option>) : <option value={currentUser.station}>{currentUser.station}</option>}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Date Accomplished</label>
                    <input type="date" name="date" value={formData.date} onChange={handleInputChange} disabled={operation === 'update'} required className="w-full text-sm border-gray-300 rounded-md shadow-sm border p-2 disabled:bg-gray-100 disabled:text-gray-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Time</label>
                    <input type="text" name="time" value={formData.time} onChange={handleInputChange} disabled={operation === 'update'} placeholder="1400Hrs" className="w-full text-sm border-gray-300 rounded-md shadow-sm border p-2 disabled:bg-gray-100 disabled:text-gray-500" />
                  </div>
                </div>

                <div className="pb-8"> 
                  <label className="block text-xs font-bold text-gray-700 mb-1">{operation === 'update' ? 'Original Narrative (Read-Only)' : 'Success Report Narrative'}</label>
                  <ReactQuill theme="snow" value={formData.narrative} onChange={(content) => setFormData({ ...formData, narrative: autoCapitalize(content) })} readOnly={operation === 'update'} className={`bg-white rounded-md ${operation === 'update' ? 'opacity-70 grayscale pointer-events-none' : ''}`} modules={{ toolbar: [['bold', 'italic', 'underline'], [{ 'list': 'ordered'}, { 'list': 'bullet' }], ['clean']] }} />
                </div>

                {operation === 'new' && (
                  <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                    <label className="block text-xs font-bold text-gray-700 mb-2 flex items-center"><Image size={14} className="mr-1"/> Attach Exhibit / Scene Photo (Optional)</label>
                    <div className="flex items-center space-x-4">
                      <input type="file" accept="image/*" onChange={handleExhibitUpload} className="text-xs w-full text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-xs file:font-bold file:bg-yellow-50 file:text-yellow-700 hover:file:bg-yellow-100 cursor-pointer" />
                    </div>
                    {formData.photo_url && (
                      <div className="mt-3">
                        <img src={formData.photo_url} alt="Exhibit preview" className="h-24 w-auto object-cover rounded-md border border-gray-300 shadow-sm" />
                      </div>
                    )}
                  </div>
                )}

                {operation === 'update' && (
                  <div className="pb-8 mt-4"> 
                    <label className="block text-xs font-bold text-yellow-700 mb-1">Append New Update / Progress *</label>
                    <ReactQuill theme="snow" value={formData.updateText || ''} onChange={(content) => setFormData({ ...formData, updateText: autoCapitalize(content) })} className="bg-white rounded-md border-yellow-300" placeholder="Enter new progress or updates here. Use the toolbar for numbering..." modules={{ toolbar: [['bold', 'italic', 'underline'], [{ 'list': 'ordered'}, { 'list': 'bullet' }], ['clean']] }} />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Status</label>
                  <select name="status" value={formData.status} onChange={handleInputChange} className="w-full text-sm border-gray-300 rounded-md shadow-sm bg-gray-50 border p-2">
                    <option>COMPLETED / SUCCESS</option><option>ONGOING / EXPLOITATION</option><option>IN PROGRESS</option>
                  </select>
                </div>

                <button type="submit" className="w-full bg-slate-900 hover:bg-black text-white font-bold py-3 px-4 rounded-lg shadow transition-colors flex justify-center items-center cursor-pointer">
                   {operation === 'new' ? 'Submit Achievement' : '💾 Save Achievement Updates'}
                </button>
              </form>
            </div>
          </div>
        </div>

        <div className="lg:col-span-7 space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <select value={filterRegion} onChange={(e) => { setFilterRegion(e.target.value); setFilterStation('ALL STATIONS'); }} disabled={!canViewGlobalActive} className="border rounded-lg px-3 py-2 text-sm shadow-sm bg-white disabled:bg-gray-100 disabled:text-gray-500 w-full sm:w-auto outline-none focus:border-blue-500 cursor-pointer">
              {canViewGlobalActive ? (
                <><option value="ALL REGIONS">ALL REGIONS</option>{Object.keys(REGIONAL_HIERARCHY).map(reg => <option key={reg} value={reg}>{reg}</option>)}</>
              ) : <option value={currentUser?.region}>{currentUser?.region}</option>}
            </select>
            <select value={filterStation} onChange={(e) => setFilterStation(e.target.value)} disabled={!canViewGlobalActive} className="border rounded-lg px-3 py-2 text-sm shadow-sm bg-white disabled:bg-gray-100 disabled:text-gray-500 w-full sm:w-auto outline-none focus:border-blue-500 cursor-pointer">
              {canViewGlobalActive ? (
                <><option value="ALL STATIONS">ALL STATIONS</option>{filterRegion !== 'ALL REGIONS' && REGIONAL_HIERARCHY[filterRegion] ? REGIONAL_HIERARCHY[filterRegion].map(stat => <option key={stat} value={stat}>{stat}</option>) : null}</>
              ) : <option value={currentUser?.station}>{currentUser?.station}</option>}
            </select>
            <select value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className="border-2 border-blue-500 text-blue-700 font-bold rounded-lg px-3 py-2 text-sm shadow-sm bg-white outline-none w-full sm:w-auto cursor-pointer">
              <option value="ALL TIME">ALL TIME</option><option value="TODAY">TODAY ONLY</option><option value="LAST 7 DAYS">LAST 7 DAYS</option>
              <option value="LAST 30 DAYS">LAST 30 DAYS</option><option value="LAST 90 DAYS">LAST 90 DAYS</option><option value="LAST 120 DAYS">LAST 120 DAYS</option>
            </select>
          </div>
          
          <ExpandableTableCard title="Achievements Overview Ledger" onToggle={(expanded) => { if (setSidebarOpen) setSidebarOpen(!expanded); }}>
            <div className="overflow-x-auto w-full">
              <table className="w-full divide-y divide-gray-200 min-w-[950px]">
                <thead className="bg-gray-50 sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider w-16">SN</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider w-32">Date & Time</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-800 uppercase tracking-wider w-40">Region/Station</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Narrative / Progress</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider w-36">Last Updated By</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider w-32">Status</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredStories?.map((story) => {
                    const linkedCase = findLinkedCrimeCase(story.narrative, reports);
                    return (
                      <tr key={story.sn} className="hover:bg-yellow-50 transition-colors cursor-pointer" onClick={() => { if(operation === 'update') populateUpdateForm(story); }}>
                        <td className="px-4 py-4 whitespace-nowrap text-sm font-bold text-gray-900 align-top">{story.sn}</td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 align-top">{story.date}<br/><span className="text-xs text-gray-400">{story.time}</span></td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-blue-700 align-top">{story.station}<br/><span className="text-xs text-gray-400">{story.region}</span></td>
                        <td className="px-4 py-4 text-sm text-gray-600 align-top whitespace-pre-wrap break-words overflow-hidden leading-relaxed">
                          <div className="ql-editor p-0" dangerouslySetInnerHTML={{ __html: story.narrative }} />
                          
                          {linkedCase && (
                            <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between" onClick={(e) => e.stopPropagation()}>
                              <div>
                                <span className="text-[10px] font-extrabold text-blue-800 uppercase tracking-wider block">🔗 Traceable Prior Crime Record Found:</span>
                                <span className="text-xs font-black text-blue-900">{linkedCase.sdRef || linkedCase.sd_ref} — {linkedCase.offence}</span>
                              </div>
                              <button 
                                onClick={() => setSelectedCase(linkedCase)}
                                className="px-3 py-1 bg-blue-700 hover:bg-blue-800 text-white rounded font-bold text-xs shadow-xs transition cursor-pointer"
                              >
                                View Dossier
                              </button>
                            </div>
                          )}

                          {story.photo_url && (
                            <div className="mt-4 border rounded-xl overflow-hidden max-w-md bg-slate-50 flex justify-center items-center p-1 shadow-sm">
                              <img 
                                src={story.photo_url} 
                                alt={`Exploit SN ${story.sn}`} 
                                className="w-full h-auto object-contain max-h-96 rounded-lg" 
                                onError={(e) => { e.target.style.display = 'none'; }} 
                              />
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-xs text-slate-500 font-medium align-top">{story.last_updated_by || "System Genesis"}</td>
                        <td className="px-4 py-4 whitespace-nowrap align-top">
                          <span className={`px-2 inline-flex text-xs leading-5 font-bold rounded-full ${story.status?.includes('COMPLETED') ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>{story.status}</span>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredStories.length === 0 && (
                    <tr>
                      <td colSpan="6" className="text-center py-6 text-gray-500">
                        No success stories logged for this jurisdiction.
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

export default SuccessStories;