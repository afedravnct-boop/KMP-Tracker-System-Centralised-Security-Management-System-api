import React, { useState, useMemo } from 'react';
import { PlusCircle, Edit, AlertTriangle, CheckCircle, Image, X, Filter, FileText, ChevronDown, ChevronUp, Shield } from 'lucide-react';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import { authFetch } from './api';

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
  const [isExpanded, setIsExpanded] = useState(false);

  const openFullScreen = () => {
    setIsExpanded(true);
    if (typeof onToggle === 'function') onToggle(true);
  };

  const closeFullScreen = () => {
    setIsExpanded(false);
    if (typeof onToggle === 'function') onToggle(false);
  };

  return (
    <>
      {isExpanded ? (
        <div className="fixed inset-0 z-[250] bg-slate-900/95 backdrop-blur-sm flex flex-col p-4 sm:p-8 animate-in fade-in zoom-in duration-200">
          <div className="bg-slate-900 dark:bg-slate-950 px-6 py-4 flex justify-between items-center rounded-t-xl shadow-2xl shrink-0 border-b border-slate-800">
            <h3 className="font-extrabold text-white text-lg uppercase tracking-wider">
              {title} (FULL SCREEN)
            </h3>
            <button 
              onClick={closeFullScreen} 
              className="text-sm text-blue-400 hover:text-white font-bold cursor-pointer transition-colors bg-slate-800 dark:bg-slate-900 px-4 py-2 rounded-lg border border-slate-700"
            >
              Collapse ↙
            </button>
          </div>
          <div className="bg-white dark:bg-slate-900 dark:text-slate-100 flex-1 overflow-auto rounded-b-xl shadow-2xl p-4 border border-slate-300 dark:border-slate-800 custom-scrollbar">
            {children}
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col h-full relative z-10">
          <div className="bg-slate-900 dark:bg-slate-950 px-4 py-3 flex justify-between items-center shrink-0">
            <h3 className="font-extrabold text-white text-sm uppercase tracking-wider">{title}</h3>
            <button 
              onClick={openFullScreen} 
              className="text-xs text-blue-400 hover:text-white font-bold cursor-pointer transition-colors"
            >
              Expand ↗
            </button>
          </div>
          <div className="w-full overflow-auto max-h-[600px] custom-scrollbar dark:bg-slate-900">
            {children}
          </div>
        </div>
      )}
    </>
  );
};

const autoCapitalize = (text) => {
  if (!text) return text;
  return text.replace(/(^\s*|>|\.\s+|\n\s*)([a-z])/g, (match, separator, letter) => {
    return separator + letter.toUpperCase();
  });
};

const SuccessStories = ({ currentUser, canViewGlobal = false, stories, setStories, setSidebarOpen, reports, setSelectedCase }) => {
  const [operation, setOperation] = useState('new');
  const [selectedDossier, setSelectedDossier] = useState(null);
  const [expandedRows, setExpandedRows] = useState({});

  const canViewGlobalActive = canViewGlobal || currentUser?.role === 'SUPER_ADMIN' || currentUser?.permissions?.view_global_roster === true || currentUser?.permissions?.global_observer === true;

  const [filterRegion, setFilterRegion] = useState(canViewGlobalActive ? 'ALL REGIONS' : currentUser?.region || '');
  const [filterStation, setFilterStation] = useState(canViewGlobalActive ? 'ALL STATIONS' : currentUser?.station || '');
  
  const [notification, setNotification] = useState(null);
  const [updateSearch, setUpdateSearch] = useState('');
  const [dateFilter, setDateFilter] = useState('ALL TIME');

  if (!stories) return <div className="p-4 text-gray-500 dark:text-slate-400">Loading mission logs...</div>;

  const getTodayString = () => new Date().toLocaleDateString('en-CA').split(',')[0].replace(/\//g, '-');

  const [formData, setFormData] = useState({
    sn: null, region: currentUser.region, station: currentUser.station || REGIONAL_HIERARCHY[currentUser?.region]?.[0] || '',
    date: getTodayString(), time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }).replace(':', '') + 'Hrs',
    narrative: '', status: 'COMPLETED / SUCCESS', updateText: '', photo_url: ''
  });

  const toggleRowExpand = (sn) => {
    setExpandedRows(prev => ({ ...prev, [sn]: !prev[sn] }));
  };

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

      if (canViewGlobalActive && filterRegion === 'ALL REGIONS' && filterStation === 'ALL STATIONS') {
        // Fall through
      } else {
        if (filterRegion !== 'ALL REGIONS' && reg !== filterRegion.toUpperCase()) return false;
        if (filterStation !== 'ALL STATIONS' && stn !== filterStation.toUpperCase()) return false;
      }

      const diffDays = Math.ceil(Math.abs(new Date() - new Date(s.date)) / (1000 * 60 * 60 * 24));
      
      if (dateFilter === 'TODAY') {
        const todayStr = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0];
        if (s.date !== todayStr) return false;
      } 
      else if (dateFilter === 'LAST 7 DAYS') { if (diffDays > 7) return false; } 
      else if (dateFilter === 'LAST 14 DAYS') { if (diffDays > 14) return false; } 
      else if (dateFilter === 'LAST 21 DAYS') { if (diffDays > 21) return false; } 
      else if (dateFilter === 'LAST 30 DAYS') { if (diffDays > 30) return false; } 
      else if (dateFilter === 'LAST 60 DAYS') { if (diffDays > 60) return false; } 
      else if (dateFilter === 'LAST 90 DAYS') { if (diffDays > 90) return false; } 
      else if (dateFilter === 'LAST 120 DAYS') { if (diffDays > 120) return false; } 
      else if (dateFilter === 'LAST 180 DAYS') { if (diffDays > 180) return false; }
      
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
      setNotification("Uploading exhibit to secure storage...");
      const uploadData = new FormData();
      uploadData.append("file", file);
      uploadData.append("category", "scene");
      uploadData.append("case_id", formData.sn || "NEW_STORY");
      uploadData.append("narrative", formData.narrative || "Exhibit Upload");

      try {
        const response = await authFetch("/api/v1/investigation/upload/", { method: "POST", body: uploadData });
        const data = await response.json();
        if (data.full_s3_url || data.cloud_storage_path) {
          setFormData({ ...formData, photo_url: data.full_s3_url || data.cloud_storage_path });
          setNotification("Exhibit uploaded successfully!");
        } else {
           throw new Error("Invalid API Response");
        }
      } catch (error) {
        setFormData({ ...formData, photo_url: URL.createObjectURL(file) });
        setNotification("Note: Using local preview URL.");
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

  const handleFormSubmit = async (e) => {
    e.preventDefault();

    const cleanedNarrative = formData.narrative
      ? formData.narrative.replace(/color:\s*(white|#fff|#ffffff);?/gi, '')
      : '';

    const activeRegion = (canViewGlobalActive && filterRegion !== 'ALL REGIONS') ? filterRegion : formData.region;
    const activeStation = (canViewGlobalActive && filterStation !== 'ALL STATIONS') ? filterStation : formData.station;

    const submissionData = { ...formData, region: activeRegion, station: activeStation, narrative: cleanedNarrative };

    if (operation === 'new') {
      const cleanNewText = submissionData.narrative.replace(/<[^>]*>?/gm, '').trim().toLowerCase();
      const isDuplicate = stories.some(s => s.narrative.replace(/<[^>]*>?/gm, '').trim().toLowerCase() === cleanNewText);

      if (isDuplicate) return setNotification("Error: This exact success story has already been logged.");

      const exactNextSN = (stories && stories.length > 0) ? Math.max(...stories.map(s => s.sn || s.id || 0)) + 1 : 1;
      const newStory = { ...submissionData, sn: exactNextSN, last_updated_by: `${currentUser.name} (${currentUser.fnum})` };
      delete newStory.updateText;
      
      try {
        const response = await authFetch("/api/v1/stories", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newStory)
        });
        
        const resData = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(resData.detail || "Failed to save to database");
        
        if (resData.sn) newStory.sn = resData.sn;
        
        setStories([newStory, ...stories]);
        setNotification(`Success story SN ${newStory.sn} logged successfully!`);
        setFormData({ ...formData, time: '', narrative: '', sn: null, updateText: '', photo_url: '' });

      } catch (err) {
        console.error("Cloud sync failed:", err);
        return setNotification(`Error: ${err.message}`);
      }

    } else if (operation === 'update') {
      if (!submissionData.sn) return setNotification("Error: Please select a story to update first.");

      const updatedNarrative = submissionData.updateText 
        ? `${submissionData.narrative}<br/><br/><strong>[UPDATE ${new Date().toISOString().slice(0,16).replace('T', ' ')}]:</strong><br/>${submissionData.updateText}` 
        : submissionData.narrative;
        
      const updatedRecord = { ...submissionData, narrative: updatedNarrative, last_updated_by: `${currentUser.name} (${currentUser.fnum})` };
      delete updatedRecord.updateText;

      try {
        const response = await authFetch(`/api/v1/stories/${submissionData.sn}`, {
          method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updatedRecord)
        });
        
        const resData = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(resData.detail || "Failed to update record in database");

        setStories((stories || []).map(s => (s.sn === submissionData.sn || s.id === submissionData.sn) ? updatedRecord : s));
        setNotification(`Success story SN ${submissionData.sn} successfully updated!`);

      } catch (err) {
        console.error("Cloud sync failed:", err);
        return setNotification(`Error: ${err.message}`);
      }
    }

    setTimeout(() => setNotification(null), 4000);
  };

  return (
    <div className="p-3 sm:p-6 max-w-[1600px] mx-auto space-y-6 relative z-10 dark:text-slate-100">
      <div className="text-center mb-8 flex flex-col items-center">
        <img src="/upf_badge.png" alt="UPF Logo" className="w-16 h-16 mb-3 object-contain contrast-200 brightness-75 drop-shadow-sm" onError={(e) => { e.target.style.display = 'none'; }}/>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-700 dark:text-slate-100 tracking-tight">Operational Success Stories</h1>
        <h3 className="text-sm sm:text-lg text-amber-500 dark:text-amber-400 mt-2 font-medium">Highlighting UPF Anti-Crime Milestones</h3>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-200 dark:border-slate-800 overflow-hidden">
            <div className="p-5 space-y-6 dark:bg-slate-900">
              <div className="flex space-x-2 bg-gray-100 dark:bg-slate-800 p-1 rounded-lg">
                <button type="button" onClick={() => handleOperationToggle('new')} className={`flex-1 py-2 text-sm font-medium rounded-md transition-all cursor-pointer ${operation === 'new' ? 'bg-white dark:bg-slate-700 shadow text-yellow-600 dark:text-yellow-400 font-bold' : 'text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200'}`}><PlusCircle className="w-4 h-4 inline mr-1" /> Register New</button>
                <button type="button" onClick={() => handleOperationToggle('update')} className={`flex-1 py-2 text-sm font-medium rounded-md transition-all cursor-pointer ${operation === 'update' ? 'bg-green-600 shadow text-white font-bold' : 'text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200'}`}><Edit className="w-4 h-4 inline mr-1" /> Update Existing</button>
              </div>

              {notification && <div className={`border px-4 py-3 rounded-lg flex items-center mb-4 ${notification.includes('Error') ? 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900 text-red-800 dark:text-red-300' : 'bg-green-50 dark:bg-green-950/40 border-green-200 dark:border-green-900 text-green-800 dark:text-green-300'}`}>{notification.includes('Error') ? <AlertTriangle className="w-5 h-5 mr-2 text-red-500 shrink-0" /> : <CheckCircle className="w-5 h-5 mr-2 text-green-500 shrink-0" />}<span className="text-sm font-medium">{notification}</span></div>}

              {operation === 'update' && (
                <div className="bg-yellow-50 dark:bg-slate-800 border border-yellow-200 dark:border-slate-700 rounded-lg p-3">
                  <label className="block text-xs font-bold text-yellow-800 dark:text-yellow-400 mb-2">🔍 Search & Select Story to Update</label>
                  <input type="text" placeholder="Search by SN or Narrative..." value={updateSearch} onChange={e => setUpdateSearch(e.target.value)} className="w-full text-sm p-2 mb-2 border border-yellow-200 dark:border-slate-700 rounded outline-none focus:ring-2 focus:ring-yellow-400 bg-white dark:bg-slate-900 dark:text-slate-100" />
                  <div className="max-h-40 overflow-y-auto bg-white dark:bg-slate-900 border border-yellow-100 dark:border-slate-800 rounded custom-scrollbar">
                    {availableUpdateStories.length === 0 ? <div className="p-3 text-xs text-gray-500 dark:text-slate-400 text-center">No success stories found matching your search.</div> : availableUpdateStories?.map(s => (
                        <div key={s.sn || s.id} onClick={() => populateUpdateForm(s)} className={`p-2 text-xs border-b dark:border-slate-800 cursor-pointer transition-colors ${formData.sn === (s.sn || s.id) ? 'bg-yellow-500 text-white font-bold' : 'hover:bg-yellow-50 dark:hover:bg-slate-800 text-gray-700 dark:text-slate-300'}`}>
                          <span className={formData.sn === (s.sn || s.id) ? 'text-yellow-100' : 'text-gray-400'}>SN: {s.sn || s.id}</span> | <span className={formData.sn === (s.sn || s.id) ? 'text-white' : 'font-bold text-yellow-700 dark:text-yellow-400'}>{s.date}</span> | {s.station}
                        </div>
                      ))}
                  </div>
                </div>
              )}

              <form onSubmit={handleFormSubmit} className="space-y-4">
                {operation === 'update' && formData.sn && <div className="bg-slate-800 dark:bg-slate-950 text-white text-xs font-bold px-3 py-2 rounded">Currently Editing: SN {formData.sn}</div>}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 mb-1">Select Region *</label>
                    <select name="region" value={formData.region} onChange={handleInputChange} disabled={!canViewGlobalActive || operation === 'update'} required className="w-full text-sm border-gray-300 dark:border-slate-700 rounded-md shadow-sm bg-gray-50 dark:bg-slate-800 dark:text-slate-100 border p-2 focus:ring-blue-500 disabled:bg-gray-100 dark:disabled:bg-slate-900 disabled:text-gray-500">
                      {canViewGlobalActive ? Object.keys(REGIONAL_HIERARCHY).map(reg => <option key={reg} value={reg}>{reg}</option>) : <option value={currentUser.region}>{currentUser.region}</option>}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 mb-1">Station *</label>
                    <select name="station" value={formData.station} onChange={handleInputChange} disabled={!canViewGlobalActive || operation === 'update'} required className="w-full text-sm border-gray-300 dark:border-slate-700 rounded-md shadow-sm bg-gray-50 dark:bg-slate-800 dark:text-slate-100 border p-2 focus:ring-blue-500 disabled:bg-gray-100 dark:disabled:bg-slate-900 disabled:text-gray-500">
                      {operation === 'update' ? <option value={formData.station}>{formData.station}</option> : canViewGlobalActive ? (REGIONAL_HIERARCHY[formData.region] || []).map(stat => <option key={stat} value={stat}>{stat}</option>) : <option value={currentUser.station}>{currentUser.station}</option>}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 mb-1">Date Accomplished</label>
                    <input type="date" name="date" value={formData.date} onChange={handleInputChange} disabled={operation === 'update'} required className="w-full text-sm border-gray-300 dark:border-slate-700 rounded-md shadow-sm border p-2 disabled:bg-gray-100 dark:disabled:bg-slate-900 disabled:text-gray-500 bg-white dark:bg-slate-800 dark:text-slate-100" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 mb-1">Time</label>
                    <input type="text" name="time" value={formData.time} onChange={handleInputChange} disabled={operation === 'update'} placeholder="1400Hrs" className="w-full text-sm border-gray-300 dark:border-slate-700 rounded-md shadow-sm border p-2 disabled:bg-gray-100 dark:disabled:bg-slate-900 disabled:text-gray-500 bg-white dark:bg-slate-800 dark:text-slate-100" />
                  </div>
                </div>

                <div className="pb-8"> 
                  <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 mb-1">{operation === 'update' ? 'Original Narrative (Read-Only)' : 'Success Report Narrative *'}</label>
                  <ReactQuill theme="snow" value={formData.narrative} onChange={(content) => setFormData({ ...formData, narrative: autoCapitalize(content) })} readOnly={operation === 'update'} className={`bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-md ${operation === 'update' ? 'opacity-70 grayscale pointer-events-none' : ''}`} modules={{ toolbar: [['bold', 'italic', 'underline'], [{ 'list': 'ordered'}, { 'list': 'bullet' }], ['clean']] }} />
                </div>

                {operation === 'new' && (
                  <div className="bg-gray-50 dark:bg-slate-800 p-3 rounded-lg border border-gray-200 dark:border-slate-700">
                    <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 mb-2 flex items-center"><Image size={14} className="mr-1"/> Attach Exhibit / Scene Photo (Optional)</label>
                    <div className="flex items-center space-x-4">
                      <input type="file" accept="image/*" onChange={handleExhibitUpload} className="text-xs w-full text-slate-500 dark:text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-xs file:font-bold file:bg-yellow-50 dark:file:bg-slate-700 file:text-yellow-700 dark:file:text-yellow-300 hover:file:bg-yellow-100 dark:hover:file:bg-slate-600 cursor-pointer" />
                    </div>
                    {formData.photo_url && (
                      <div className="mt-3">
                        <img src={formData.photo_url} alt="Exhibit preview" className="h-24 w-auto object-cover rounded-md border border-gray-300 dark:border-slate-700 shadow-sm" />
                      </div>
                    )}
                  </div>
                )}

                {operation === 'update' && (
                  <div className="pb-8 mt-4"> 
                    <label className="block text-xs font-bold text-yellow-700 dark:text-yellow-400 mb-1">Append New Update / Progress *</label>
                    <ReactQuill theme="snow" value={formData.updateText || ''} onChange={(content) => setFormData({ ...formData, updateText: autoCapitalize(content) })} className="bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-md border-yellow-300 dark:border-slate-700" placeholder="Enter new progress or updates here..." modules={{ toolbar: [['bold', 'italic', 'underline'], [{ 'list': 'ordered'}, { 'list': 'bullet' }], ['clean']] }} />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 mb-1">Status</label>
                  <select name="status" value={formData.status} onChange={handleInputChange} className="w-full text-sm border-gray-300 dark:border-slate-700 rounded-md shadow-sm bg-white dark:bg-slate-800 dark:text-slate-100 border p-2">
                    <option>COMPLETED / SUCCESS</option><option>ONGOING / EXPLOITATION</option><option>IN PROGRESS</option>
                  </select>
                </div>

                <button type="submit" className="w-full bg-slate-900 hover:bg-black dark:bg-slate-800 dark:hover:bg-slate-700 text-white font-bold py-3 px-4 rounded-lg shadow transition-colors flex justify-center items-center cursor-pointer uppercase tracking-wider text-xs">
                   {operation === 'new' ? 'Submit Achievement' : '💾 Save Achievement Updates'}
                </button>
              </form>
            </div>
          </div>
        </div>

        <div className="lg:col-span-7 space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <select value={filterRegion} onChange={(e) => { setFilterRegion(e.target.value); setFilterStation('ALL STATIONS'); }} disabled={!canViewGlobalActive} className="border dark:border-slate-700 rounded-lg px-3 py-2 text-sm shadow-sm bg-white dark:bg-slate-800 dark:text-slate-100 disabled:bg-gray-100 dark:disabled:bg-slate-900 disabled:text-gray-500 w-full sm:w-auto outline-none focus:border-blue-500 cursor-pointer">
              {canViewGlobalActive ? (
                <><option value="ALL REGIONS">ALL REGIONS</option>{Object.keys(REGIONAL_HIERARCHY).map(reg => <option key={reg} value={reg}>{reg}</option>)}</>
              ) : <option value={currentUser?.region}>{currentUser?.region}</option>}
            </select>
            <select value={filterStation} onChange={(e) => setFilterStation(e.target.value)} disabled={!canViewGlobalActive} className="border dark:border-slate-700 rounded-lg px-3 py-2 text-sm shadow-sm bg-white dark:bg-slate-800 dark:text-slate-100 disabled:bg-gray-100 dark:disabled:bg-slate-900 disabled:text-gray-500 w-full sm:w-auto outline-none focus:border-blue-500 cursor-pointer">
              {canViewGlobalActive ? (
                <><option value="ALL STATIONS">ALL STATIONS</option>{filterRegion !== 'ALL REGIONS' && REGIONAL_HIERARCHY[filterRegion] ? REGIONAL_HIERARCHY[filterRegion].map(stat => <option key={stat} value={stat}>{stat}</option>) : null}</>
              ) : <option value={currentUser?.station}>{currentUser?.station}</option>}
            </select>
            <select 
              value={dateFilter} 
              onChange={(e) => setDateFilter(e.target.value)} 
              className="border-2 border-blue-500 dark:border-blue-600 text-blue-700 dark:text-blue-400 font-bold rounded-lg px-3 py-2 text-sm shadow-sm bg-white dark:bg-slate-800 outline-none w-full sm:w-auto cursor-pointer"
            >
              <option value="ALL TIME">ALL TIME</option>
              <option value="TODAY">TODAY ONLY</option>
              <option value="LAST 7 DAYS">LAST 7 DAYS</option>
              <option value="LAST 14 DAYS">LAST 14 DAYS</option>
              <option value="LAST 21 DAYS">LAST 21 DAYS</option>
              <option value="LAST 30 DAYS">LAST 30 DAYS</option>
              <option value="LAST 60 DAYS">LAST 60 DAYS</option>
              <option value="LAST 90 DAYS">LAST 90 DAYS</option>
              <option value="LAST 120 DAYS">LAST 120 DAYS</option>
              <option value="LAST 180 DAYS">LAST 180 DAYS</option>
            </select>
          </div>
          
          <ExpandableTableCard title="Achievements Overview Ledger" onToggle={(expanded) => { if (setSidebarOpen) setSidebarOpen(!expanded); }}>
            <div className="overflow-x-auto w-full dark:bg-slate-900">
              <table className="w-full divide-y divide-gray-200 dark:divide-slate-800 min-w-[950px]">
                <thead className="bg-gray-50 dark:bg-slate-950 sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider w-16">SN</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider w-32">Date & Time</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-800 dark:text-slate-300 uppercase tracking-wider w-40">Region/Station</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Narrative / Progress</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider w-36">Last Updated By</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider w-32">Status</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-slate-900 divide-y divide-gray-200 dark:divide-slate-800">
                  {filteredStories?.map((story) => {
                    const rowId = story.sn || story.id;
                    const isRowExpanded = Boolean(expandedRows[rowId]);
                    const linkedCase = findLinkedCrimeCase(story.narrative, reports);

                    return (
                      <tr 
                        key={rowId} 
                        className="hover:bg-yellow-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer" 
                        onClick={() => setSelectedDossier(story)}
                      >
                        <td className="px-4 py-4 whitespace-nowrap text-sm font-bold text-gray-900 dark:text-slate-100 align-top">{rowId}</td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-slate-400 align-top">{story.date}<br/><span className="text-xs text-gray-400 dark:text-slate-500">{story.time}</span></td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-blue-700 dark:text-blue-400 align-top">{story.station}<br/><span className="text-xs text-gray-400 dark:text-slate-500">{story.region}</span></td>
                        <td className="px-4 py-4 text-sm text-gray-600 dark:text-slate-300 align-top whitespace-pre-wrap break-words overflow-hidden leading-relaxed">
                          
                          <div className={`relative ${!isRowExpanded ? 'max-h-28 overflow-hidden' : ''}`}>
                            <div className="ql-editor p-0 dark:text-slate-300" dangerouslySetInnerHTML={{ __html: story.narrative }} />
                            {!isRowExpanded && (
                              <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-white dark:from-slate-900 to-transparent pointer-events-none" />
                            )}
                          </div>

                          <div className="flex items-center space-x-4 mt-2">
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); toggleRowExpand(rowId); }}
                              className="text-xs font-extrabold text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 flex items-center cursor-pointer"
                            >
                              {isRowExpanded ? <><ChevronUp size={14} className="mr-1" /> Collapse View</> : <><ChevronDown size={14} className="mr-1" /> Expand View</>}
                            </button>
                          </div>
                          
                          {linkedCase && (
                            <div className="mt-3 p-3 bg-blue-50 dark:bg-slate-800 border border-blue-200 dark:border-slate-700 rounded-lg flex items-center justify-between" onClick={(e) => e.stopPropagation()}>
                              <div>
                                <span className="text-[10px] font-extrabold text-blue-800 dark:text-blue-400 uppercase tracking-wider block">🔗 Traceable Prior Crime Record Found:</span>
                                <span className="text-xs font-black text-blue-900 dark:text-blue-300">{linkedCase.sdRef || linkedCase.sd_ref} — {linkedCase.offence}</span>
                              </div>
                              <button 
                                onClick={(e) => { e.stopPropagation(); setSelectedCase(linkedCase); }}
                                className="px-3 py-1 bg-blue-700 hover:bg-blue-800 text-white rounded font-bold text-xs shadow-xs transition cursor-pointer"
                              >
                                View Case Dossier
                              </button>
                            </div>
                          )}

                          {story.photo_url && (
                            <div className="mt-4 border dark:border-slate-700 rounded-xl overflow-hidden max-w-md bg-slate-50 dark:bg-slate-800 flex justify-center items-center p-1 shadow-sm">
                              <img 
                                src={story.photo_url} 
                                alt={`Exploit SN ${rowId}`} 
                                className="w-full h-auto object-contain max-h-96 rounded-lg" 
                                onError={(e) => { e.target.style.display = 'none'; }} 
                              />
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-xs text-slate-500 dark:text-slate-400 font-medium align-top">{story.last_updated_by || "System Genesis"}</td>
                        <td className="px-4 py-4 whitespace-nowrap align-top">
                          <span className={`px-2 inline-flex text-xs leading-5 font-bold rounded-full ${story.status?.includes('COMPLETED') ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300' : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300'}`}>{story.status}</span>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredStories.length === 0 && (
                    <tr>
                      <td colSpan="6" className="text-center py-6 text-gray-500 dark:text-slate-400">
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

      {selectedDossier && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 flex flex-col max-h-[85vh] dark:text-slate-100">
            <div className="bg-slate-900 dark:bg-slate-950 text-white px-6 py-4 flex justify-between items-center shrink-0 border-b border-slate-800">
              <h3 className="font-extrabold text-sm uppercase tracking-wider flex items-center">
                <Shield className="mr-2 text-yellow-400" size={16} /> Achievement Dossier Record #{selectedDossier.sn || selectedDossier.id}
              </h3>
              <button onClick={() => setSelectedDossier(null)} className="hover:bg-slate-800 p-1.5 rounded transition cursor-pointer"><X size={18}/></button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 flex-1 custom-scrollbar text-xs">
              <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 grid grid-cols-2 gap-4">
                <div>
                  <span className="text-slate-400 font-bold uppercase block text-[10px]">Command Region</span>
                  <span className="font-extrabold text-slate-800 dark:text-slate-200">{selectedDossier.region}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-bold uppercase block text-[10px]">Police Station / Unit</span>
                  <span className="font-extrabold text-slate-800 dark:text-slate-200">{selectedDossier.station}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-bold uppercase block text-[10px]">Accomplished Date & Time</span>
                  <span className="font-extrabold text-slate-800 dark:text-slate-200">{selectedDossier.date || 'N/A'} at {selectedDossier.time || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-bold uppercase block text-[10px]">Recording Officer</span>
                  <span className="font-extrabold text-slate-800 dark:text-slate-200">{selectedDossier.last_updated_by || 'CENTRAL COMMAND'}</span>
                </div>
              </div>

              <div>
                <h4 className="font-extrabold text-slate-900 dark:text-slate-100 uppercase tracking-wider mb-1">Operational Status</h4>
                <span className={`px-2.5 py-1 inline-flex text-xs font-bold rounded-full ${selectedDossier.status?.includes('COMPLETED') ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300' : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300'}`}>
                  {selectedDossier.status}
                </span>
              </div>

              <div>
                <h4 className="font-extrabold text-slate-900 dark:text-slate-100 uppercase tracking-wider mb-1">Complete Narrative Report</h4>
                <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 leading-relaxed font-medium whitespace-pre-wrap">
                  <div className="ql-editor p-0 dark:text-slate-300" dangerouslySetInnerHTML={{ __html: selectedDossier.narrative || 'No detailed narrative logged.' }} />
                </div>
              </div>

              {selectedDossier.photo_url && (
                <div>
                  <h4 className="font-extrabold text-slate-900 dark:text-slate-100 uppercase tracking-wider mb-1">Attached Exhibit / Evidence</h4>
                  <div className="border dark:border-slate-700 rounded-xl overflow-hidden bg-slate-50 dark:bg-slate-800 p-1 flex justify-center">
                    <img src={selectedDossier.photo_url} alt="Dossier Exhibit" className="max-h-80 object-contain rounded-lg" />
                  </div>
                </div>
              )}
            </div>

            <div className="bg-slate-100 dark:bg-slate-950 p-4 border-t border-slate-200 dark:border-slate-800 flex justify-end shrink-0">
              <button
                onClick={() => setSelectedDossier(null)}
                className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-xs uppercase tracking-wider shadow cursor-pointer"
              >
                Close Dossier
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SuccessStories;