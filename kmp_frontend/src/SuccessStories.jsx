// src/components/SuccessStories.jsx
import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { PlusCircle, Edit, AlertTriangle, CheckCircle, Image, X, Filter, FileText, ChevronDown, ChevronUp, Shield, Sprout, Search, HardDrive, Loader2 } from 'lucide-react';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import { authFetch, hasValidSession } from './api';
import { stripHtmlTags } from './App';

const REGIONAL_HIERARCHY = {
  "KMP NORTH": ["KMP NORTH HEADQUARTERS", "KMP NORTH", "KAWEMPE", "KAKIRI", "KASANGATI", "MATUGGA", "NANSANA", "OLD KAMPALA", "WAKISO", "WANDEGEYA"],
  "KMP EAST": ["KMP EAST HEADQUARTERS", "KMP EAST", "JINJA ROAD", "KIRA", "KIRA DIV", "KIRA ROAD", "MUKONO", "NAGGALAMA", "SEETA"],
  "KMP SOUTH": ["KMP SOUTH HEADQUARTERS", "KMP SOUTH", "NATEETE", "CPS KAMPALA", "PARLIAMENT", "ENTEBBE", "KABALAGALA", "KAJJANSI", "KASENYI", "KATWE", "KYENGERA", "NSANGI"],
  "KMP HEADQUARTERS": ["KMP HEADQUARTERS", "FLYING SQUAD", "CRIME INTELLIGENCE"],
  "POLICE HEADQUARTERS": ["NAGURU"]
};

const isStationEquivalent = (statA, statB) => {
  const a = stripHtmlTags(statA || '').trim().toUpperCase();
  const b = stripHtmlTags(statB || '').trim().toUpperCase();
  if (!a || !b) return false;
  if (a === b) return true;

  const cleanA = a.replace(/(\s+HEADQUARTERS|\s+HQ)$/, '');
  const cleanB = b.replace(/(\s+HEADQUARTERS|\s+HQ)$/, '');

  return cleanA === cleanB && cleanA.length > 0;
};

const getOfficialRegionForStation = (stationName, dbRegion) => {
  const cleanStation = stripHtmlTags(stationName || '').trim().toUpperCase();
  const cleanDbRegion = stripHtmlTags(dbRegion || '').trim().toUpperCase();

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

const SuccessStories = ({ currentUser, canViewGlobal = false, stories, setStories, setSidebarOpen, reports, setSelectedCase, isReadOnlyObserver }) => {
  const [serverStories, setServerStories] = useState([]);
  const [isFetchingStories, setIsFetchingStories] = useState(false);
  
  const [operation, setOperation] = useState('new');
  const [selectedDossier, setSelectedDossier] = useState(null);
  const [expandedRows, setExpandedRows] = useState({});

  const userRoleClean = stripHtmlTags(currentUser?.role || '').toUpperCase();
  const userPosClean = stripHtmlTags(currentUser?.position || '').toUpperCase();
  const userRegClean = stripHtmlTags(currentUser?.region || '').toUpperCase();
  const userStnClean = stripHtmlTags(currentUser?.station || REGIONAL_HIERARCHY[userRegClean]?.[0] || 'KMP HEADQUARTERS').toUpperCase();

  const isGlobalTier = ['SUPER_ADMIN', 'ADMIN', 'ASSISTANT_SUPER_ADMIN'].includes(userRoleClean) || 
    ['KMP COMMANDER', 'DEPUTY KMP COMMANDER', 'KMP ADMIN OFFICER'].includes(userPosClean) || 
    currentUser?.permissions?.view_global_roster === true;

  const isKmpSystemManager = userRoleClean === 'SYSTEM_MANAGER' && ['KMP HEADQUARTERS', 'POLICE HEADQUARTERS'].includes(userRegClean) && userPosClean.includes('KMP');
  const isKmpSpecialist = userRoleClean === 'ASSISTANT_SYSTEM_MANAGER' && ['KMP HEADQUARTERS', 'POLICE HEADQUARTERS'].includes(userRegClean) && userPosClean.includes('KMP');

  const canViewGlobalLevel = canViewGlobal || isGlobalTier || isKmpSystemManager || isKmpSpecialist;
  const canViewGlobalActive = canViewGlobalLevel;
  
  const isRegionalCommand = ['RPC', 'DEPUTY_RPC', 'SYSTEM_MANAGER', 'ASSISTANT_SYSTEM_MANAGER', 'REGIONAL_ADMIN', 'ASSISTANT_REGIONAL_ADMIN'].includes(userRoleClean) && !canViewGlobalLevel;

  const [filterRegion, setFilterRegion] = useState(canViewGlobalActive ? 'ALL REGIONS' : userRegClean);
  const [filterStation, setFilterStation] = useState((canViewGlobalActive || isRegionalCommand) ? 'ALL STATIONS' : userStnClean);
  const [categoryFilter, setCategoryFilter] = useState('ALL CATEGORIES');
  const [uniqueCategories, setUniqueCategories] = useState([]);

  const isFilterInitialized = useRef(false);
  useEffect(() => {
    if (!isFilterInitialized.current && currentUser?.station) {
      if (canViewGlobalActive) {
        setFilterRegion('ALL REGIONS');
        setFilterStation('ALL STATIONS');
      } else if (isRegionalCommand) {
        setFilterRegion(userRegClean);
        setFilterStation('ALL STATIONS');
      } else {
        setFilterRegion(userRegClean);
        setFilterStation(userStnClean);
      }
      isFilterInitialized.current = true;
    }
  }, [canViewGlobalActive, isRegionalCommand, userRegClean, userStnClean, currentUser?.station]);
  
  const [notification, setNotification] = useState(null);
  const [updateSearch, setUpdateSearch] = useState('');
  const [dateFilter, setDateFilter] = useState('ALL TIME');
  
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 500);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  const getTodayString = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' }).split(',')[0].replace(/\//g, '-');

  const getDateRangeParams = (filterOption) => {
    if (filterOption === 'ALL TIME') return { start: null, end: null };
    const end = new Date();
    const start = new Date();
    if (filterOption === 'LAST 7 DAYS') { start.setDate(start.getDate() - 7); }
    else if (filterOption === 'LAST 14 DAYS') { start.setDate(start.getDate() - 14); }
    else if (filterOption === 'LAST 21 DAYS') { start.setDate(start.getDate() - 21); }
    else if (filterOption === 'LAST 30 DAYS') { start.setDate(start.getDate() - 30); }
    else if (filterOption === 'LAST 60 DAYS') { start.setDate(start.getDate() - 60); }
    else if (filterOption === 'LAST 90 DAYS') { start.setDate(start.getDate() - 90); }
    else if (filterOption === 'LAST 120 DAYS') { start.setDate(start.getDate() - 120); }
    else if (filterOption === 'LAST 180 DAYS') { start.setDate(start.getDate() - 180); }
    const pad = (n) => n.toString().padStart(2, '0');
    const format = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    return { start: format(start), end: format(end) };
  };

  const fetchUniqueCategories = useCallback(async () => {
    if (!hasValidSession()) return;
    try {
      const params = new URLSearchParams();
      if (!canViewGlobalActive && filterRegion && filterRegion !== 'ALL REGIONS') params.append('region', filterRegion);
      if (filterStation && filterStation !== 'ALL STATIONS') params.append('station', filterStation);
      const res = await authFetch(`/api/v1/stories/categories?${params.toString()}`);
      if (res.ok) setUniqueCategories(await res.json());
    } catch (e) {
      console.error(e);
    }
  }, [filterRegion, filterStation, canViewGlobalActive]);

  useEffect(() => {
    fetchUniqueCategories();
  }, [fetchUniqueCategories]);

  const fetchFilteredDatabaseStories = useCallback(async () => {
    if (!hasValidSession()) return;
    setIsFetchingStories(true);
    try {
      const params = new URLSearchParams();
      if (!canViewGlobalActive && filterRegion && filterRegion !== 'ALL REGIONS') params.append('region', filterRegion);
      if (filterStation && filterStation !== 'ALL STATIONS') params.append('station', filterStation);
      if (categoryFilter && categoryFilter !== 'ALL CATEGORIES') params.append('category', categoryFilter);
      if (debouncedSearch) params.append('search', debouncedSearch);
      
      const { start, end } = getDateRangeParams(dateFilter);
      if (start) params.append('start_date', start);
      if (end) params.append('end_date', end);
      
      params.append('limit', '300');

      const response = await authFetch(`/api/v1/stories?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        setServerStories(data);
        if (setStories) setStories(data);
      }
    } catch (err) {
      console.error("Failed to execute SQL fetch:", err);
    } finally {
      setIsFetchingStories(false);
    }
  }, [filterRegion, filterStation, categoryFilter, dateFilter, debouncedSearch, setStories, canViewGlobalActive]);

  useEffect(() => {
    fetchFilteredDatabaseStories();
  }, [fetchFilteredDatabaseStories]);

  const [formData, setFormData] = useState({
    sn: null, 
    region: canViewGlobalActive ? 'KMP NORTH' : userRegClean, 
    station: canViewGlobalActive ? REGIONAL_HIERARCHY['KMP NORTH'][0] : userStnClean,
    date: getTodayString(), 
    time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }).replace(':', '') + 'Hrs',
    headline: '',
    narrative: '', 
    status: 'COMPLETED / SUCCESS', 
    updateText: '', 
    photo_url: '',
    category: 'GENERAL CRIMES'
  });

  const toggleRowExpand = (sn) => {
    setExpandedRows(prev => ({ ...prev, [sn]: !prev[sn] }));
  };

  const filteredStories = useMemo(() => {
    if (!Array.isArray(serverStories)) return [];
    return [...serverStories].sort((a, b) => (b.sn || b.id || 0) - (a.sn || a.id || 0));
  }, [serverStories]);

  const availableUpdateStories = useMemo(() => {
    return (Array.isArray(serverStories) ? serverStories : []).filter(s => {
      const stn = stripHtmlTags(s.station || '').trim().toUpperCase();
      const reg = getOfficialRegionForStation(stn, s.region);

      if (!canViewGlobalActive) {
        const belongsToRegion = reg === userRegClean || 
                                (REGIONAL_HIERARCHY[userRegClean] && REGIONAL_HIERARCHY[userRegClean].some(st => isStationEquivalent(st, stn)));
        if (!belongsToRegion) return false;
      }

      if (updateSearch) {
        const query = stripHtmlTags(updateSearch).toLowerCase();
        return (s.sn || '').toString().includes(query) || (s.narrative || '').toLowerCase().includes(query);
      }
      return true;
    });
  }, [serverStories, updateSearch, canViewGlobalActive, userRegClean]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    const finalValue = name === 'headline' ? value.toUpperCase() : stripHtmlTags(value);
    
    if (name === 'region') {
      const firstStation = REGIONAL_HIERARCHY[finalValue]?.[0] || '';
      setFormData({ ...formData, region: finalValue, station: firstStation });
    } else {
      setFormData({ ...formData, [name]: finalValue });
    }
  };

  const handleExhibitUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
      setNotification(`Uploading ${files.length} exhibit(s) to secure storage...`);
      
      let uploadedUrls = [];
      let hasError = false;

      for (const file of files) {
        const uploadData = new FormData();
        uploadData.append("file", file);
        uploadData.append("category", "scene");
        uploadData.append("case_id", stripHtmlTags(formData.sn || "NEW_STORY"));
        uploadData.append("narrative", stripHtmlTags(formData.headline || formData.narrative || "Exhibit Upload"));

        try {
          const response = await authFetch("/api/v1/investigation/upload/", { method: "POST", body: uploadData });
          const data = await response.json();
          if (data.full_s3_url || data.cloud_storage_path) {
            uploadedUrls.push(stripHtmlTags(data.full_s3_url || data.cloud_storage_path));
          } else {
            hasError = true;
          }
        } catch (error) {
          hasError = true;
          uploadedUrls.push(URL.createObjectURL(file));
        }
      }

      if (uploadedUrls.length > 0) {
        const existingUrls = formData.photo_url ? formData.photo_url.split(',') : [];
        const combinedUrls = [...existingUrls, ...uploadedUrls].join(',');
        setFormData({ ...formData, photo_url: combinedUrls });
        
        if (hasError) {
          setNotification(`Upload complete, but some items are using local previews.`);
        } else {
          setNotification(`${files.length} exhibit(s) uploaded successfully!`);
        }
      }
    }
  };

  const removePhoto = (indexToRemove) => {
    const urls = formData.photo_url.split(',');
    const newUrls = urls.filter((_, idx) => idx !== indexToRemove);
    setFormData({ ...formData, photo_url: newUrls.join(',') });
  };

  const handleOperationToggle = (op) => {
    setOperation(op); setNotification(null);
    if (op === 'new') {
      setFormData({
        sn: null, 
        region: canViewGlobalActive ? 'KMP NORTH' : userRegClean, 
        station: canViewGlobalActive ? REGIONAL_HIERARCHY['KMP NORTH'][0] : userStnClean,
        date: getTodayString(), time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }).replace(':', '') + 'Hrs',
        headline: '', narrative: '', status: 'COMPLETED / SUCCESS', updateText: '', photo_url: '',
        category: 'GENERAL CRIMES'
      });
      setUpdateSearch('');
    }
  };

  const populateUpdateForm = (storyData) => {
    let extractedHeadline = '';
    let extractedNarrative = storyData.narrative || '';

    const match = extractedNarrative.match(/^<strong>(.*?)<\/strong><br\s*\/><br\s*\/>(.*)$/s);
    if (match) {
        extractedHeadline = stripHtmlTags(match[1]).trim();
        extractedNarrative = match[2].trim();
    } else {
        const fallbackMatch = extractedNarrative.match(/^<strong>(.*?)<\/strong>\s*(.*)$/s);
        if (fallbackMatch) {
            extractedHeadline = stripHtmlTags(fallbackMatch[1]).trim();
            extractedNarrative = fallbackMatch[2].trim();
        }
    }

    setFormData({ 
        ...storyData, 
        headline: extractedHeadline,
        narrative: extractedNarrative,
        updateText: '' 
    });
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();

    const cleanedNarrativeBody = formData.narrative
      ? formData.narrative.replace(/color:\s*(white|#fff|#ffffff);?/gi, '')
      : '';

    const finalNarrativeString = formData.headline.trim() 
      ? `<strong>${formData.headline.trim()}</strong><br/><br/>${cleanedNarrativeBody}`
      : cleanedNarrativeBody;

    const submissionData = { ...formData, narrative: finalNarrativeString };
    delete submissionData.headline;

    if (operation === 'new') {
      const cleanNewText = stripHtmlTags(submissionData.narrative).toLowerCase();
      const isDuplicate = serverStories.some(s => stripHtmlTags(s.narrative).toLowerCase() === cleanNewText);

      if (isDuplicate) return setNotification("Error: This exact success story has already been logged.");

      const exactNextSN = (serverStories && serverStories.length > 0) ? Math.max(...serverStories.map(s => s.sn || s.id || 0)) + 1 : 1;
      const newStory = { ...submissionData, sn: exactNextSN, last_updated_by: `${stripHtmlTags(currentUser.name)} (${stripHtmlTags(currentUser.fnum)})` };
      delete newStory.updateText;
      
      try {
        const response = await authFetch("/api/v1/stories", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newStory)
        });
        
        const resData = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(stripHtmlTags(resData.detail) || "Failed to save to database");
        
        if (resData.sn) newStory.sn = resData.sn;
        
        setServerStories([newStory, ...serverStories]);
        if (setStories) setStories([newStory, ...serverStories]);

        setNotification(`Success story SN ${newStory.sn} logged successfully!`);
        setFormData({ ...formData, time: '', headline: '', narrative: '', sn: null, updateText: '', photo_url: '', category: 'GENERAL CRIMES' });

      } catch (err) {
        console.error("Cloud sync failed:", err);
        return setNotification(`Error: ${stripHtmlTags(err.message)}`);
      }

    } else if (operation === 'update') {
      if (!submissionData.sn) return setNotification("Error: Please select a story to update first.");

      const updatedNarrative = submissionData.updateText 
        ? `${submissionData.narrative}<br/><br/><strong>[UPDATE ${new Date().toISOString().slice(0,16).replace('T', ' ')}]:</strong><br/>${submissionData.updateText}` 
        : submissionData.narrative;
        
      const updatedRecord = { ...submissionData, narrative: updatedNarrative, last_updated_by: `${stripHtmlTags(currentUser.name)} (${stripHtmlTags(currentUser.fnum)})` };
      delete updatedRecord.updateText;

      try {
        const response = await authFetch(`/api/v1/stories/${submissionData.sn}`, {
          method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updatedRecord)
        });
        
        const resData = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(stripHtmlTags(resData.detail) || "Failed to update record in database");

        const updatedStories = (serverStories || []).map(s => (s.sn === submissionData.sn || s.id === submissionData.sn) ? updatedRecord : s);
        setServerStories(updatedStories);
        if (setStories) setStories(updatedStories);

        setNotification(`Success story SN ${submissionData.sn} successfully updated!`);

      } catch (err) {
        console.error("Cloud sync failed:", err);
        return setNotification(`Error: ${stripHtmlTags(err.message)}`);
      }
    }

    setTimeout(() => setNotification(null), 4000);
  };

  const handleExportFilteredData = async () => {
    if (!serverStories.length) {
      alert("No records available to export for the selected filters.");
      return;
    }
    
    setNotification("⏳ Generating official CSV export from database. Please wait...");
    
    try {
      const params = new URLSearchParams();
      if (!canViewGlobalActive && filterRegion && filterRegion !== 'ALL REGIONS') params.append('region', filterRegion);
      if (filterStation && filterStation !== 'ALL STATIONS') params.append('station', filterStation);
      if (categoryFilter && categoryFilter !== 'ALL CATEGORIES') params.append('category', categoryFilter);
      if (debouncedSearch) params.append('search', debouncedSearch);
      
      const { start, end } = getDateRangeParams(dateFilter);
      if (start) params.append('start_date', start);
      if (end) params.append('end_date', end);

      const response = await authFetch(`/api/v1/stories/export?${params.toString()}`);
      if (!response.ok) throw new Error("Export failed on server.");
      
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      
      const disposition = response.headers.get('Content-Disposition');
      let filename = 'KMP_SUCCESS_STORIES_EXPORT.csv';
      if (disposition && disposition.indexOf('filename=') !== -1) {
          filename = disposition.split('filename=')[1].replace(/["']/g, '');
      } else {
          const timestamp = new Date().toISOString().split('T')[0];
          const fileLabel = categoryFilter === 'ALL CATEGORIES' ? 'ALL_STORIES' : categoryFilter.replace(/\s+/g, '_');
          filename = `KMP_SUCCESS_STORIES_${fileLabel}_${timestamp}.csv`;
      }

      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setNotification(null);
    } catch (err) {
      console.error("Export error:", err);
      setNotification("❌ Failed to generate export file.");
    }
  };

  return (
    <div className="p-3 sm:p-6 max-w-[1600px] mx-auto space-y-6 relative z-10 dark:text-slate-100">
      <div className="text-center mb-8 flex flex-col items-center">
        <img src="/upf_badge.png" alt="UPF Logo" className="w-16 h-16 mb-3 object-contain contrast-200 brightness-75 drop-shadow-sm" onError={(e) => { e.target.style.display = 'none'; }}/>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-700 dark:text-slate-100 tracking-tight">Operational Success Stories</h1>
        <h3 className="text-sm sm:text-lg text-amber-500 dark:text-amber-400 mt-2 font-medium">Highlighting UPF Anti-Crime & Environmental Milestones</h3>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-200 dark:border-slate-800 overflow-hidden">
            <div className="p-5 space-y-6 dark:bg-slate-900">
              <div className="flex space-x-2 bg-gray-100 dark:bg-slate-800 p-1 rounded-lg">
                <button type="button" onClick={() => handleOperationToggle('new')} className={`flex-1 py-2 text-sm font-medium rounded-md transition-all cursor-pointer ${operation === 'new' ? 'bg-white dark:bg-slate-700 shadow text-yellow-600 dark:text-yellow-400 font-bold' : 'text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200'}`}><PlusCircle className="w-4 h-4 inline mr-1" /> Register New</button>
                <button type="button" onClick={() => handleOperationToggle('update')} className={`flex-1 py-2 text-sm font-medium rounded-md transition-all cursor-pointer ${operation === 'update' ? 'bg-green-600 shadow text-white font-bold' : 'text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200'}`}><Edit className="w-4 h-4 inline mr-1" /> Update Existing</button>
              </div>

              {notification && <div className={`border px-4 py-3 rounded-lg flex items-center mb-4 ${notification.includes('Error') || notification.includes('❌') ? 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900 text-red-800 dark:text-red-300' : 'bg-green-50 dark:bg-green-950/40 border-green-200 dark:border-green-900 text-green-800 dark:text-green-300'}`}>{notification.includes('Error') || notification.includes('❌') ? <AlertTriangle className="w-5 h-5 mr-2 text-red-500 shrink-0" /> : <CheckCircle className="w-5 h-5 mr-2 text-green-500 shrink-0" />}<span className="text-sm font-medium">{stripHtmlTags(notification)}</span></div>}

              {operation === 'update' && (
                <div className="bg-yellow-50 dark:bg-slate-800 border border-yellow-200 dark:border-slate-700 rounded-lg p-3">
                  <label className="block text-xs font-bold text-yellow-800 dark:text-yellow-400 mb-2">🔍 Search & Select Story to Update</label>
                  <input type="text" placeholder="Search by SN or Narrative..." value={updateSearch} onChange={e => setUpdateSearch(stripHtmlTags(e.target.value))} className="w-full text-sm p-2 mb-2 border border-yellow-200 dark:border-slate-700 rounded outline-none focus:ring-2 focus:ring-yellow-400 bg-white dark:bg-slate-900 dark:text-slate-100" />
                  <div className="max-h-40 overflow-y-auto bg-white dark:bg-slate-900 border border-yellow-100 dark:border-slate-800 rounded custom-scrollbar">
                    {availableUpdateStories.length === 0 ? <div className="p-3 text-xs text-gray-500 dark:text-slate-400 text-center">No success stories found matching your search.</div> : availableUpdateStories?.map(s => (
                        <div key={s.sn || s.id} onClick={() => populateUpdateForm(s)} className={`p-2 text-xs border-b dark:border-slate-800 cursor-pointer transition-colors ${formData.sn === (s.sn || s.id) ? 'bg-yellow-500 text-white font-bold' : 'hover:bg-yellow-50 dark:hover:bg-slate-800 text-gray-700 dark:text-slate-300'}`}>
                          <span className={formData.sn === (s.sn || s.id) ? 'text-yellow-100' : 'text-gray-400'}>SN: {s.sn || s.id}</span> | <span className={formData.sn === (s.sn || s.id) ? 'text-white' : 'font-bold text-yellow-700 dark:text-yellow-400'}>{stripHtmlTags(s.date)}</span> | {stripHtmlTags(s.station)}
                        </div>
                      ))}
                  </div>
                </div>
              )}

              <form onSubmit={handleFormSubmit} className="space-y-4">
                {operation === 'update' && formData.sn && <div className="bg-slate-800 dark:bg-slate-950 text-white text-xs font-bold px-3 py-2 rounded">Currently Editing: SN {formData.sn}</div>}

                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 mb-1">Operation Category / Focus *</label>
                  <select name="category" value={formData.category} onChange={handleInputChange} className="w-full text-sm border-gray-300 dark:border-slate-700 rounded-md shadow-sm bg-white dark:bg-slate-800 dark:text-slate-100 border p-2 cursor-pointer font-bold text-amber-600 dark:text-amber-400">
                    <option value="GENERAL CRIMES">GENERAL CRIMES</option>
                    <option value="AGRIC_CRIME">🌾 AGRICULTURAL CRIMES / LIVESTOCK & FARM SECURITY</option>
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 mb-1">Select Region *</label>
                    <select name="region" value={formData.region} onChange={handleInputChange} disabled={!canViewGlobalLevel || operation === 'update'} required className="w-full text-sm border-gray-300 dark:border-slate-700 rounded-md shadow-sm bg-gray-50 dark:bg-slate-800 dark:text-slate-100 border p-2 focus:ring-blue-500 disabled:bg-gray-100 dark:disabled:bg-slate-900 disabled:text-gray-500 cursor-pointer">
                      {canViewGlobalLevel ? Object.keys(REGIONAL_HIERARCHY).map(reg => <option key={reg} value={reg}>{reg}</option>) : <option value={userRegClean}>{userRegClean}</option>}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 mb-1">Station *</label>
                    <select name="station" value={formData.station} onChange={handleInputChange} disabled={operation === 'update'} required className="w-full text-sm border-gray-300 dark:border-slate-700 rounded-md shadow-sm bg-gray-50 dark:bg-slate-800 dark:text-slate-100 border p-2 focus:ring-blue-500 disabled:bg-gray-100 dark:disabled:bg-slate-900 disabled:text-gray-500 cursor-pointer">
                      {operation === 'update' ? (
                        <option value={formData.station}>{stripHtmlTags(formData.station)}</option>
                      ) : (
                        (REGIONAL_HIERARCHY[formData.region] || [formData.station]).map(stat => <option key={stat} value={stat}>{stat}</option>)
                      )}
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

                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 mb-1">Success Headline / Title *</label>
                  <input 
                    type="text" 
                    name="headline" 
                    value={formData.headline} 
                    onChange={handleInputChange} 
                    disabled={operation === 'update'} 
                    required 
                    placeholder="e.g. ARREST OF SUSPECTS IN A SPATE OF ROBBERIES AND RECOVERY OF A PISTOL" 
                    className="w-full text-sm border-gray-300 dark:border-slate-700 rounded-md shadow-sm border p-2 uppercase bg-white dark:bg-slate-800 dark:text-slate-100 disabled:bg-gray-100 dark:disabled:bg-slate-900 font-bold outline-none focus:ring-1 focus:ring-blue-500" 
                  />
                </div>

                <div className="pb-8"> 
                  <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 mb-1">{operation === 'update' ? 'Original Narrative Body (Read-Only)' : 'Success Narrative Body *'}</label>
                  <ReactQuill theme="snow" value={formData.narrative} onChange={(content) => setFormData({ ...formData, narrative: autoCapitalize(content) })} readOnly={operation === 'update'} className={`bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-md ${operation === 'update' ? 'opacity-70 grayscale pointer-events-none' : ''}`} modules={{ toolbar: [['bold', 'italic', 'underline'], [{ 'list': 'ordered'}, { 'list': 'bullet' }], ['clean']] }} />
                </div>

                {operation === 'new' && (
                  <div className="bg-gray-50 dark:bg-slate-800 p-3 rounded-lg border border-gray-200 dark:border-slate-700">
                    <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 mb-2 flex items-center"><Image size={14} className="mr-1"/> Attach Exhibits / Scene Photos (Optional)</label>
                    <div className="flex items-center space-x-4">
                      <input type="file" multiple accept="image/*" onChange={handleExhibitUpload} className="text-xs w-full text-slate-500 dark:text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-xs file:font-bold file:bg-yellow-50 dark:file:bg-slate-700 file:text-yellow-700 dark:file:text-yellow-300 hover:file:bg-yellow-100 dark:hover:file:bg-slate-600 cursor-pointer" />
                    </div>
                    {formData.photo_url && (
                      <div className="mt-3 flex flex-wrap gap-3">
                        {formData.photo_url.split(',').filter(Boolean).map((url, idx) => (
                          <div key={idx} className="relative group border border-gray-300 dark:border-slate-600 rounded-md overflow-hidden bg-white shadow-sm">
                            <img src={url} alt={`Exhibit ${idx + 1}`} className="h-20 w-auto object-cover" />
                            <button 
                              type="button" 
                              onClick={() => removePhoto(idx)} 
                              className="absolute top-1 right-1 bg-red-600/90 text-white rounded p-1 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-700 cursor-pointer"
                              title="Remove Photo"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        ))}
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
          <div className="flex flex-col sm:flex-row gap-2.5 items-center flex-wrap">
            <div className="relative flex-1 w-full min-w-[250px]"> 
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 w-3.5 h-3.5" />
              <input type="text" placeholder="Search narrative, reference, station or category..." value={searchQuery} onChange={(e) => setSearchQuery(stripHtmlTags(e.target.value))} className="w-full pl-8 pr-3 py-2 border dark:border-slate-700 rounded-lg text-sm shadow-sm outline-none focus:border-blue-500 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100" />
            </div>

            <select value={filterRegion} onChange={(e) => { setFilterRegion(stripHtmlTags(e.target.value)); setFilterStation('ALL STATIONS'); }} disabled={!canViewGlobalLevel} className="border dark:border-slate-700 rounded-lg px-3 py-2 text-sm shadow-sm bg-white dark:bg-slate-800 dark:text-slate-100 disabled:bg-gray-100 dark:disabled:bg-slate-900 disabled:text-gray-500 w-full sm:w-auto outline-none focus:border-blue-500 cursor-pointer">
              {canViewGlobalLevel ? (
                <><option value="ALL REGIONS">ALL REGIONS</option>{Object.keys(REGIONAL_HIERARCHY).map(reg => <option key={reg} value={reg}>{reg}</option>)}</>
              ) : <option value={userRegClean}>{userRegClean}</option>}
            </select>
            
            <select value={filterStation} onChange={(e) => setFilterStation(stripHtmlTags(e.target.value))} disabled={!(canViewGlobalLevel || isRegionalCommand)} className="border dark:border-slate-700 rounded-lg px-3 py-2 text-sm shadow-sm bg-white dark:bg-slate-800 dark:text-slate-100 disabled:bg-gray-100 dark:disabled:bg-slate-900 disabled:text-gray-500 w-full sm:w-auto outline-none focus:border-blue-500 cursor-pointer">
              {(canViewGlobalLevel || isRegionalCommand) ? (
                <><option value="ALL STATIONS">ALL STATIONS</option>{filterRegion !== 'ALL REGIONS' && REGIONAL_HIERARCHY[filterRegion] ? REGIONAL_HIERARCHY[filterRegion].map(stat => <option key={stat} value={stat}>{stat}</option>) : null}</>
              ) : <option value={userStnClean}>{userStnClean}</option>}
            </select>
            
            <select 
              value={categoryFilter} 
              onChange={(e) => setCategoryFilter(e.target.value)} 
              className="border dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold rounded-lg px-3 py-2 text-sm shadow-sm bg-white dark:bg-slate-800 outline-none w-full sm:w-auto cursor-pointer max-w-[200px] truncate"
            >
              <option value="ALL CATEGORIES">ALL CATEGORIES</option>
              {uniqueCategories.map((cat, idx) => (
                <option key={idx} value={cat}>{cat}</option>
              ))}
            </select>
            
            <select 
              value={dateFilter} 
              onChange={(e) => setDateFilter(e.target.value)} 
              className="border border-blue-500 dark:border-blue-600 text-blue-700 dark:text-blue-400 font-bold rounded-lg px-3 py-2 text-sm shadow-sm bg-white dark:bg-slate-800 outline-none w-full sm:w-auto cursor-pointer"
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

            <button type="button" onClick={handleExportFilteredData} className="px-4 py-2 text-sm font-black rounded-lg border transition-all flex items-center whitespace-nowrap shadow-sm cursor-pointer bg-blue-700 text-white border-blue-800 hover:bg-blue-800 ring-2 ring-blue-500/20">
              <HardDrive className="w-4 h-4 mr-1.5" />
              Export CSV
            </button>
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
                  {isFetchingStories ? (
                    <tr><td colSpan="6" className="text-center py-8 text-gray-500 dark:text-slate-400 font-medium text-sm border-b-0"><Loader2 className="w-5 h-5 mx-auto animate-spin mb-2" /> Syncing mission logs...</td></tr>
                  ) : filteredStories?.map((story) => {
                    const rowId = story.sn || story.id;
                    const isRowExpanded = Boolean(expandedRows[rowId]);
                    
                    // Retrieve backend-attached case data
                    const linkedCase = story.linked_case || null;
                    const isAgricCrime = (story.category || '').toUpperCase() === 'AGRIC_CRIME';

                    return (
                      <tr 
                        key={rowId} 
                        className="hover:bg-yellow-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer" 
                        onClick={() => setSelectedDossier(story)}
                      >
                        <td className="px-4 py-4 whitespace-nowrap text-sm font-bold text-gray-900 dark:text-slate-100 align-top">{rowId}</td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-slate-400 align-top">{stripHtmlTags(story.date)}<br/><span className="text-xs text-gray-400 dark:text-slate-500">{stripHtmlTags(story.time)}</span></td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-blue-700 dark:text-blue-400 align-top">
                          {stripHtmlTags(story.station)}<br/>
                          <span className="text-xs text-gray-400 dark:text-slate-500">{story.region}</span>
                          {isAgricCrime && (
                            <span className="block mt-1 text-[10px] bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 font-extrabold px-1.5 py-0.5 rounded w-max">🌾 AGRIC CRIME</span>
                          )}
                        </td>
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
                                <span className="text-xs font-black text-blue-900 dark:text-blue-300">{stripHtmlTags(linkedCase.sdRef || linkedCase.sd_ref)} — {stripHtmlTags(linkedCase.offence)}</span>
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
                            <div className="mt-4 flex flex-wrap gap-2">
                              {story.photo_url.split(',').filter(Boolean).map((url, idx) => (
                                <div key={idx} className="border dark:border-slate-700 rounded-lg overflow-hidden bg-slate-50 dark:bg-slate-800 flex justify-center items-center p-1 shadow-sm">
                                  <img 
                                    src={stripHtmlTags(url)} 
                                    alt={`Exhibit ${idx + 1}`} 
                                    className="h-24 w-auto object-contain rounded" 
                                    onError={(e) => { e.target.style.display = 'none'; }} 
                                  />
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-xs text-slate-500 dark:text-slate-400 font-medium align-top">{stripHtmlTags(story.last_updated_by || "System Genesis")}</td>
                        <td className="px-4 py-4 whitespace-nowrap align-top">
                          <span className={`px-2 inline-flex text-xs leading-5 font-bold rounded-full ${story.status?.includes('COMPLETED') ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300' : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300'}`}>{stripHtmlTags(story.status)}</span>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredStories.length === 0 && !isFetchingStories && (
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
                  <span className="font-extrabold text-slate-800 dark:text-slate-200">{stripHtmlTags(selectedDossier.region)}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-bold uppercase block text-[10px]">Police Station / Unit</span>
                  <span className="font-extrabold text-slate-800 dark:text-slate-200">{stripHtmlTags(selectedDossier.station)}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-bold uppercase block text-[10px]">Operation Category</span>
                  <span className="font-extrabold text-amber-600 dark:text-amber-400">{stripHtmlTags(selectedDossier.category || 'GENERAL CRIMES')}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-bold uppercase block text-[10px]">Accomplished Date & Time</span>
                  <span className="font-extrabold text-slate-800 dark:text-slate-200">{stripHtmlTags(selectedDossier.date || 'N/A')} at {stripHtmlTags(selectedDossier.time || 'N/A')}</span>
                </div>
              </div>

              <div>
                <h4 className="font-extrabold text-slate-900 dark:text-slate-100 uppercase tracking-wider mb-1">Operational Status</h4>
                <span className={`px-2.5 py-1 inline-flex text-xs font-bold rounded-full ${selectedDossier.status?.includes('COMPLETED') ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300' : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300'}`}>
                  {stripHtmlTags(selectedDossier.status)}
                </span>
              </div>

              <div>
                <h4 className="font-extrabold text-slate-900 dark:text-slate-100 uppercase tracking-wider mb-1">Complete Narrative Report</h4>
                <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 leading-relaxed font-medium whitespace-pre-wrap break-words overflow-hidden w-full">
                  <div className="ql-editor p-0 dark:text-slate-300 break-words whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: selectedDossier.narrative || 'No detailed narrative logged.' }} />
                </div>
              </div>

              {selectedDossier.photo_url && (
                <div>
                  <h4 className="font-extrabold text-slate-900 dark:text-slate-100 uppercase tracking-wider mb-2">Attached Exhibits / Evidence</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-slate-50 dark:bg-slate-800 p-3 rounded-xl border dark:border-slate-700">
                    {selectedDossier.photo_url.split(',').filter(Boolean).map((url, idx) => (
                      <div key={idx} className="border dark:border-slate-700 rounded-lg overflow-hidden bg-white dark:bg-slate-900 flex justify-center items-center shadow-sm p-1">
                        <img 
                          src={stripHtmlTags(url)} 
                          alt={`Dossier Exhibit ${idx + 1}`} 
                          className="w-full h-40 object-contain rounded cursor-pointer hover:scale-105 transition-transform" 
                          onClick={() => window.open(stripHtmlTags(url), '_blank')}
                        />
                      </div>
                    ))}
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