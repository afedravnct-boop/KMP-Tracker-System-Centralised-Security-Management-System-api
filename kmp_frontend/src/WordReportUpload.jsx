import React, { useState, useEffect, useMemo, useRef } from 'react';
import {  
  UploadCloud, FileText, Download, CheckCircle, AlertTriangle,  
  Loader2, FolderOpen, Clock, FileArchive, Lock, Server, Trash2, Filter, ExternalLink, Search, X, ArrowLeft, Home
} from 'lucide-react';
import { authFetch } from './api';

const REGIONAL_HIERARCHY = {
  "KMP NORTH": ["KAWEMPE", "KAKIRI", "KASANGATI", "MATUGGA", "NANSANA", "OLD KAMPALA", "WAKISO", "WANDEGEYA"],
  "KMP EAST": ["JINJA ROAD", "KIRA", "KIRA DIV", "KIRA ROAD", "MUKONO", "NAGGALAMA", "SEETA"],
  "KMP SOUTH": ["NATEETE", "CPS KAMPALA", "PARLIAMENT", "ENTEBBE", "KABALAGALA", "KAJJANSI", "KASENYI", "KATWE", "KYENGERA", "NSANGI"],
  "KMP HEADQUARTERS": ["KMP HEADQUARTERS", "FLYING SQUAD", "CRIME INTELLIGENCE"],
  "POLICE HEADQUARTERS": ["NAGURU"]
};

const getOfficialRegionForStation = (stationName, dbRegion) => {
  const cleanStation = (stationName || '').trim().toUpperCase();
  const cleanDbRegion = (dbRegion || '').trim().toUpperCase();

  if (REGIONAL_HIERARCHY[cleanDbRegion] && REGIONAL_HIERARCHY[cleanDbRegion].includes(cleanStation)) return cleanDbRegion;

  for (const [regionName, stationsList] of Object.entries(REGIONAL_HIERARCHY)) {
    if (stationsList.includes(cleanStation)) return regionName;
  }
  return cleanDbRegion || 'KMP GENERAL';
};

const WordReportUpload = ({ currentUser, overrideRegion, overrideStation, canViewGlobal = false, isReadOnlyObserver, onBack, setCurrentPage }) => {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [activeCategory, setActiveCategory] = useState('weekly_report'); 
  const [documents, setDocuments] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const [templateCustomName, setTemplateCustomName] = useState('');
  
  // 🟢 Added search state
  const [searchQuery, setSearchQuery] = useState('');

  const canViewGlobalActive = canViewGlobal || 
    ['SUPER_ADMIN', 'ADMIN', 'RPC', 'Deputy Commander'].includes(currentUser?.role) || 
    currentUser?.permissions?.view_global_roster === true || 
    currentUser?.permissions?.global_observer === true;

  const [filterRegion, setFilterRegion] = useState(canViewGlobalActive ? 'ALL REGIONS' : currentUser?.region || '');
  const [filterStation, setFilterStation] = useState(canViewGlobalActive ? 'ALL STATIONS' : currentUser?.station || '');

  const isFilterInitialized = useRef(false);
  useEffect(() => {
    if (!isFilterInitialized.current && currentUser?.station) {
      if (canViewGlobalActive) {
        setFilterRegion('ALL REGIONS');
        setFilterStation('ALL STATIONS');
      } else {
        setFilterRegion(currentUser.region || '');
        setFilterStation(currentUser.station || '');
      }
      isFilterInitialized.current = true;
    }
  }, [canViewGlobalActive, currentUser?.station, currentUser?.region]);

  const canUploadByRole = ['SUPER_ADMIN', 'ADMIN', 'RPC', 'Deputy Commander', 'STATION_ADMIN'].includes(currentUser?.role?.toUpperCase());
  const canDownloadByRole = ['SUPER_ADMIN', 'ADMIN', 'RPC', 'Deputy Commander', 'STATION_ADMIN', 'USER'].includes(currentUser?.role?.toUpperCase());

  const hasUploadClearance = canViewGlobalActive || currentUser?.role === 'SUPER_ADMIN' || (currentUser?.permissions?.acc_documents !== false && (canUploadByRole || currentUser?.permissions?.acc_documents === true));
  const hasDownloadClearance = canViewGlobalActive || currentUser?.role === 'SUPER_ADMIN' || (currentUser?.permissions?.acc_documents_download !== false && (canDownloadByRole || currentUser?.permissions?.acc_documents_download === true));

  const fetchArchiveList = async () => {
    setLoadingDocs(true);
    try {
      const [archiveRes, generalRes, templateRes] = await Promise.all([
        authFetch('/api/v1/reports/archive').catch(() => null),
        authFetch('/api/v1/general-docs/list').catch(() => null),
        authFetch('/api/v1/templates/list').catch(() => null)
      ]);

      const archiveData = archiveRes && archiveRes.ok ? await archiveRes.json() : [];
      const generalData = generalRes && generalRes.ok ? await generalRes.json() : [];
      const templateData = templateRes && templateRes.ok ? await templateRes.json() : [];

      const taggedArchive = archiveData.map(doc => ({ ...doc, categoryKey: 'weekly_report' }));
      const taggedGeneral = generalData.map(doc => ({ ...doc, categoryKey: 'general_doc' }));
      const taggedTemplates = templateData.map(doc => ({ ...doc, categoryKey: 'templates', isTemplate: true }));

      setDocuments([...taggedArchive, ...taggedGeneral, ...taggedTemplates]);
    } catch (err) {
      console.error("Archive fetch error:", err);
    } finally {
      setLoadingDocs(false);
    }
  };

  useEffect(() => {
    fetchArchiveList();
  }, []);

  const handleFileChange = (e) => {
    const selectedFiles = Array.from(e.target.files);
    setFiles(selectedFiles);
    if (selectedFiles.length > 0 && !templateCustomName) {
      const firstFile = selectedFiles[0];
      const baseName = firstFile.name.substring(0, firstFile.name.lastIndexOf('.')) || firstFile.name;
      setTemplateCustomName(baseName.replace(/[_]/g, ' ').toUpperCase());
    }
    setFeedback(null);
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!hasUploadClearance) return alert("Security Restriction: You do not have command clearance to upload files.");
    if (!files || files.length === 0) return alert("Please select at least one file first.");

    const formData = new FormData();
    files.forEach((f) => formData.append("files", f));

    let endpoint = "";
    const targetRegionToSubmit = overrideRegion || (canViewGlobalActive && filterRegion !== 'ALL REGIONS' ? filterRegion : currentUser?.region);
    const targetStationToSubmit = overrideStation || (canViewGlobalActive && filterStation !== 'ALL STATIONS' ? filterStation : currentUser?.station);

    if (activeCategory === 'templates') {
      const templateIdKey = templateCustomName ? templateCustomName.toLowerCase().replace(/[^a-z0-9]/g, '_') : 'custom_template';
      endpoint = `/api/v1/templates/upload/${templateIdKey}`;
      formData.append("doc_type", "Command Template");
    } else if (activeCategory === 'general_doc') {
      endpoint = `/api/v1/general-docs/upload`;
      if (targetRegionToSubmit) formData.append("target_region", targetRegionToSubmit);
      if (targetStationToSubmit) formData.append("target_station", targetStationToSubmit);
    } else {
      endpoint = `/api/v1/reports/upload-word-report`;
      formData.append("doc_type", activeCategory); 
      if (targetRegionToSubmit) formData.append("target_region", targetRegionToSubmit);
      if (targetStationToSubmit) formData.append("target_station", targetStationToSubmit);
    }

    setUploading(true);
    try {
      const response = await authFetch(endpoint, { method: "POST", body: formData });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Upload failed.");

      setFeedback({ type: 'success', message: data.message || "Files securely uploaded!" });
      setFiles([]);
      setTemplateCustomName('');
      fetchArchiveList(); 
    } catch (err) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setUploading(false);
      setTimeout(() => setFeedback(null), 5000);
    }
  };

  const handleDeleteDoc = async (docId) => {
    if (!hasUploadClearance) return alert("Security Restriction: You do not have clearance to delete documents.");
    if (!window.confirm("Are you sure you want to permanently delete this document? This action cannot be undone.")) return;

    setActionLoading(`delete-${docId}`);
    try {
      const response = await authFetch(`/api/v1/reports/archive/${docId}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Failed to delete document.");
      setFeedback({ type: 'success', message: "Document successfully deleted." });
      fetchArchiveList(); 
    } catch (err) {
      alert(`Delete Error: ${err.message}`);
    } finally {
      setActionLoading(null);
      setTimeout(() => setFeedback(null), 4000);
    }
  };

  const handleReadDoc = async (docId, isTemplate = false, docName = 'Document', categoryKey = 'weekly_report') => {
    setActionLoading(`read-${docId}`);
    const mobileSafeWindow = window.open('about:blank', '_blank');

    try {
      let endpoint = `/api/v1/reports/download/${docId}?stamp=true&return_url=true&category=${categoryKey}`;
      
      if (categoryKey === 'general_doc') {
        endpoint = `/api/v1/general-docs/download/${docId}?stamp=true&return_url=true&category=${categoryKey}`;
      } else if (categoryKey === 'templates' || isTemplate) {
        endpoint = `/api/v1/templates/download/${docId}?stamp=true&return_url=true&category=${categoryKey}`;
      }
        
      const response = await authFetch(endpoint, { method: "GET" });
      
      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.detail || "Could not retrieve document viewer link.");
      }

      const data = await response.json();
      const s3Url = data.url || data.s3_url || data.file_url || data.view_url;
      
      if (!s3Url) throw new Error("Pre-signed S3 URL missing from backend response.");

      const lowerName = (docName || '').toLowerCase();
      
      if (lowerName.endsWith('.pdf') || lowerName.endsWith('.png') || lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) {
        mobileSafeWindow.location.href = s3Url;
      } else if (lowerName.endsWith('.xls') || lowerName.endsWith('.xlsx')) {
        mobileSafeWindow.location.href = s3Url;
      } else {
        const googleViewerUrl = `https://docs.google.com/viewer?url=${encodeURIComponent(s3Url)}&embedded=false`;
        mobileSafeWindow.location.href = googleViewerUrl;
      }
    } catch (err) {
      if (mobileSafeWindow) mobileSafeWindow.close();
      alert(`Reader Error: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDownloadDoc = async (docId, isTemplate = false, fileName = 'document', categoryKey = 'weekly_report') => {
    if (!hasDownloadClearance) return alert("Security Restriction: You do not have clearance to download.");

    setActionLoading(`download-${docId}`);
    try {
      let endpoint = `/api/v1/reports/download/${docId}?stamp=true&download=true&category=${categoryKey}`;
      
      if (categoryKey === 'general_doc') {
        endpoint = `/api/v1/general-docs/download/${docId}?stamp=true&download=true&category=${categoryKey}`;
      } else if (categoryKey === 'templates' || isTemplate) {
        endpoint = `/api/v1/templates/download/${docId}?stamp=true&download=true&category=${categoryKey}`;
      }
        
      const response = await authFetch(endpoint, { method: "GET" });
      if (!response.ok) throw new Error("Requested document not found on server.");

      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.style.display = 'none';
      link.href = blobUrl;
      link.setAttribute('download', fileName);
      
      document.body.appendChild(link);
      link.click();
      
      setTimeout(() => { document.body.removeChild(link); window.URL.revokeObjectURL(blobUrl); }, 15000);
    } catch (err) {
      alert(`Download Error: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const filteredDocuments = useMemo(() => {
    let result = documents.filter(doc => {
      if (doc.categoryKey !== activeCategory) return false;
      
      const stn = (doc.station || '').trim().toUpperCase();
      const reg = getOfficialRegionForStation(stn, doc.region);
      if (!canViewGlobalActive || filterRegion !== 'ALL REGIONS' || filterStation !== 'ALL STATIONS') {
        if (filterRegion !== 'ALL REGIONS' && reg !== filterRegion.toUpperCase()) return false;
        if (filterStation !== 'ALL STATIONS' && stn !== filterStation.toUpperCase()) return false;
      }
      
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const docName = (doc.name || '').toLowerCase();
        const docType = (doc.type || '').toLowerCase();
        if (!docName.includes(q) && !docType.includes(q)) return false;
      }

      return true;
    });

    result.sort((a, b) => {
      const dateA = new Date(a.date || a.created_at || 0).getTime();
      const dateB = new Date(b.date || b.created_at || 0).getTime();
      return (isNaN(dateB) ? 0 : dateB) - (isNaN(dateA) ? 0 : dateA);
    });

    return result;
  }, [documents, activeCategory, filterRegion, filterStation, canViewGlobalActive, searchQuery]);

  return (
    <div className="max-w-[1600px] mx-auto space-y-6 font-sans mb-8 p-4 md:p-6 animate-in fade-in duration-300">
      
      {/* 🟢 PROFESSIONAL HEADER WITH BACK BUTTON */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white px-6 py-5 rounded-2xl shadow-xl border border-blue-900/40">
        <div className="flex items-center space-x-3">
          <div className="w-12 h-12 rounded-xl bg-blue-600/30 border border-blue-400/30 flex items-center justify-center shrink-0 shadow-inner">
            <Server className="w-6 h-6 text-blue-400" />
          </div>
          <div>
            <h2 className="text-xl font-black uppercase tracking-wider flex items-center">
              Central Data Repository & Templates
            </h2>
            <p className="text-xs text-blue-200/70 font-medium mt-0.5">Universal secure intake hub supporting Word, Excel, PowerPoint, and PDF records.</p>
          </div>
        </div>

        <button 
          onClick={() => {
            if (typeof onBack === 'function') onBack();
            else if (typeof setCurrentPage === 'function') setCurrentPage('home');
          }} 
          className="flex items-center text-xs font-black uppercase tracking-wider text-white bg-blue-600 hover:bg-blue-500 px-4 py-2.5 rounded-xl shadow-lg border border-blue-400/40 transition-all cursor-pointer shrink-0"
        >
          <ArrowLeft size={16} className="mr-2" /> Return to Dashboard
        </button>
      </div>

      {/* SEARCH AND FILTER BAR */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        
        <div className="relative flex-1 w-full lg:max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
          <input 
            type="text" 
            value={searchQuery} 
            onChange={(e) => setSearchQuery(e.target.value)} 
            placeholder="Search reports or templates..." 
            className="w-full pl-9 pr-8 py-2.5 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-all shadow-inner" 
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold hover:text-red-500 cursor-pointer">
              <X size={14} />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
          <span className="text-xs font-extrabold text-slate-500 dark:text-slate-400 uppercase flex items-center">
            <Filter size={14} className="mr-1.5 text-blue-600 dark:text-blue-400" /> Jurisdiction Filters:
          </span>

          <select 
            value={filterRegion} 
            onChange={(e) => { setFilterRegion(e.target.value); setFilterStation('ALL STATIONS'); }}
            disabled={!canViewGlobalActive}
            className="border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-xs font-bold text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-950 outline-none cursor-pointer disabled:bg-slate-100 dark:disabled:bg-slate-900 disabled:text-slate-500 shadow-sm"
          >
            {canViewGlobalActive ? (
              <><option value="ALL REGIONS">ALL REGIONS</option>{Object.keys(REGIONAL_HIERARCHY).map(reg => (<option key={reg} value={reg}>{reg}</option>))}</>
            ) : (<option value={currentUser?.region || ''}>{currentUser?.region || 'UNKNOWN'}</option>)}
          </select>

          <select 
            value={filterStation} 
            onChange={(e) => setFilterStation(e.target.value)}
            disabled={!canViewGlobalActive}
            className="border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-xs font-bold text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-950 outline-none cursor-pointer disabled:bg-slate-100 dark:disabled:bg-slate-900 disabled:text-slate-500 shadow-sm"
          >
            {canViewGlobalActive ? (
              <><option value="ALL STATIONS">ALL STATIONS</option>{filterRegion !== 'ALL REGIONS' && (REGIONAL_HIERARCHY[filterRegion] || []).map(stn => (<option key={stn} value={stn}>{stn}</option>))}</>
            ) : (<option value={currentUser?.station || ''}>{currentUser?.station || 'UNKNOWN'}</option>)}
          </select>
        </div>
      </div>

      <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200">
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800">
          <div className="border-b border-slate-100 dark:border-slate-800 pb-4 mb-6">
            <h3 className="font-extrabold text-sm text-slate-900 dark:text-white uppercase tracking-wider">Universal File Intake Hub</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium">Upload multiple files simultaneously across any format directly into secure command storage.</p>
          </div>

          {!hasUploadClearance ? (
            <div className="p-6 text-center bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-2xl">
              <Lock className="w-6 h-6 text-amber-600 dark:text-amber-400 mx-auto mb-2" />
              <h3 className="text-amber-900 dark:text-amber-200 font-bold text-xs uppercase">Upload Restricted</h3>
              <p className="text-xs text-amber-700 dark:text-amber-300/80 mt-1 font-medium">You have reading access, but require command clearance or upload privileges to submit files.</p>
            </div>
          ) : (
            <form onSubmit={handleUpload} className="max-w-3xl space-y-4">
              <div className="bg-slate-100 dark:bg-slate-950 p-1.5 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row gap-1 shadow-inner">
                <button type="button" onClick={() => setActiveCategory('weekly_report')} className={`flex-1 py-2.5 px-3 text-xs font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer ${activeCategory === 'weekly_report' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'}`}>Weekly Reports</button>
                <button type="button" onClick={() => setActiveCategory('general_doc')} className={`flex-1 py-2.5 px-3 text-xs font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer ${activeCategory === 'general_doc' ? 'bg-slate-800 text-white shadow-md' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'}`}>General Docs / Statements</button>
                <button type="button" onClick={() => setActiveCategory('templates')} className={`flex-1 py-2.5 px-3 text-xs font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer ${activeCategory === 'templates' ? 'bg-amber-600 text-white shadow-md' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'}`}>Command Templates</button>
              </div>

              <div className="space-y-4 mt-4 animate-in fade-in">
                {activeCategory === 'templates' && (
                  <div className="bg-amber-50 dark:bg-amber-950/30 p-4 rounded-xl border border-amber-200 dark:border-amber-900/50 space-y-2">
                    <label className="block text-xs font-bold text-amber-900 dark:text-amber-300 uppercase tracking-wider">Custom Template Title / Designation *</label>
                    <input type="text" value={templateCustomName} onChange={(e) => setTemplateCustomName(e.target.value)} placeholder="e.g. NOMINAL ROLL SUBMISSION TEMPLATE" required className="w-full border border-amber-300 dark:border-amber-800 rounded-xl p-3 text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-amber-500 bg-white dark:bg-slate-900 uppercase shadow-inner"/>
                  </div>
                )}

                <div className={`border-2 border-dashed rounded-2xl p-6 text-center transition cursor-pointer relative shadow-sm ${activeCategory === 'templates' ? 'border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/20 hover:bg-amber-100/50' : 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 hover:bg-blue-50/50 dark:hover:bg-slate-900'}`}>
                  <input type="file" multiple onChange={handleFileChange} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"/>
                  <UploadCloud className={`w-10 h-10 mx-auto mb-2 ${activeCategory === 'templates' ? 'text-amber-500' : 'text-blue-500'}`} />
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide">Click or drop multiple files here for secure ingest</p>
                  <p className="text-[10px] text-slate-400 mt-1">Word, Excel, PDF, PowerPoint supported</p>
                </div>

                {files.length > 0 && (
                  <div className="space-y-2">
                    {files.map((f, idx) => (
                      <div key={idx} className="text-xs font-mono text-blue-900 dark:text-blue-200 bg-blue-50 dark:bg-blue-950/40 p-3.5 rounded-xl border border-blue-200 dark:border-blue-900 flex justify-between items-center shadow-inner">
                        <span className="flex items-center"><FileText className="w-4 h-4 mr-2 shrink-0 text-blue-600 dark:text-blue-400" /> <strong className="truncate max-w-[450px]">{f.name}</strong></span>
                        <span className="text-blue-600 dark:text-blue-400 font-bold shrink-0 ml-2">{Math.round(f.size / 1024)} KB</span>
                      </div>
                    ))}
                  </div>
                )}

                {feedback && (
                  <div className={`p-4 rounded-xl text-xs font-bold flex items-center shadow-sm ${feedback.type === 'success' ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-900' : 'bg-red-50 dark:bg-red-950/50 text-red-800 dark:text-red-200 border border-red-200 dark:border-red-900'}`}>
                    {feedback.type === 'success' ? <CheckCircle className="w-4 h-4 mr-2 text-emerald-600 dark:text-emerald-400 shrink-0" /> : <AlertTriangle className="w-4 h-4 mr-2 text-red-600 dark:text-red-400 shrink-0" />}
                    {feedback.message}
                  </div>
                )}

                <button type="submit" disabled={files.length === 0 || uploading} className={`w-full py-3.5 flex justify-center items-center text-white font-black rounded-xl shadow-lg text-xs uppercase tracking-wider transition disabled:bg-slate-300 dark:disabled:bg-slate-800 disabled:text-slate-500 cursor-pointer ${activeCategory === 'templates' ? 'bg-amber-600 hover:bg-amber-700 border border-amber-500' : 'bg-blue-600 hover:bg-blue-700 border border-blue-500'}`}>
                  {uploading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Uploading Files...</> : activeCategory === 'templates' ? `Upload ${files.length || ''} Template(s)` : `Upload ${files.length || ''} Document(s)`}
                </button>
              </div>
            </form>
          )}
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-slate-50 dark:bg-slate-950">
            <div>
              <h3 className="font-black text-slate-900 dark:text-white uppercase tracking-wider text-sm flex items-center">
                <FileArchive className="w-5 h-5 mr-2 text-emerald-600 dark:text-emerald-400" /> 
                System Records Ledger ({activeCategory.replace('_', ' ').toUpperCase()})
              </h3>
            </div>
            <div className="flex flex-wrap bg-slate-200 dark:bg-slate-800 p-1 rounded-xl border border-slate-300 dark:border-slate-700 w-full lg:w-auto shadow-inner">
              <button type="button" onClick={() => setActiveCategory('weekly_report')} className={`flex-1 px-4 py-2 text-[11px] sm:text-xs font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer ${activeCategory === 'weekly_report' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-700 dark:text-slate-300 hover:text-black dark:hover:text-white'}`}>Weekly Reports</button>
              <button type="button" onClick={() => setActiveCategory('general_doc')} className={`flex-1 px-4 py-2 text-[11px] sm:text-xs font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer ${activeCategory === 'general_doc' ? 'bg-slate-800 text-white shadow-md' : 'text-slate-700 dark:text-slate-300 hover:text-black dark:hover:text-white'}`}>General Docs</button>
              <button type="button" onClick={() => setActiveCategory('templates')} className={`flex-1 px-4 py-2 text-[11px] sm:text-xs font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer ${activeCategory === 'templates' ? 'bg-amber-600 text-white shadow-md' : 'text-slate-700 dark:text-slate-300 hover:text-black dark:hover:text-white'}`}>Templates</button>
            </div>
          </div>
            
          <div className="overflow-x-auto w-full">
            <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
              <thead className="bg-slate-100 dark:bg-slate-950">
                <tr>
                  <th className="px-6 py-3.5 text-left text-xs font-black text-slate-600 dark:text-slate-400 uppercase tracking-wider">Document Name</th>
                  <th className="px-6 py-3.5 text-left text-xs font-black text-slate-600 dark:text-slate-400 uppercase tracking-wider">Type / Designation</th>
                  <th className="px-6 py-3.5 text-left text-xs font-black text-slate-600 dark:text-slate-400 uppercase tracking-wider">Date Logged</th>
                  <th className="px-6 py-3.5 text-left text-xs font-black text-slate-600 dark:text-slate-400 uppercase tracking-wider">Size</th>
                  <th className="px-6 py-3.5 text-right text-xs font-black text-slate-600 dark:text-slate-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800">
                {loadingDocs ? (
                  <tr><td colSpan="5" className="px-6 py-10 text-center text-slate-500 text-xs font-bold uppercase tracking-wider"><Loader2 className="w-5 h-5 mx-auto animate-spin mb-2 text-blue-500" /> Fetching documents ledger...</td></tr>
                ) : filteredDocuments.length === 0 ? (
                  <tr><td colSpan="5" className="px-4 py-10 text-center text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider">No documents found under this category for the selected jurisdiction.</td></tr>
                ) : filteredDocuments.map((doc) => (
                  <tr key={doc.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-xs font-extrabold text-slate-900 dark:text-white flex items-center">
                      <FolderOpen className="w-4 h-4 mr-2.5 text-amber-500 shrink-0" />{doc.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-xs"><span className="px-2.5 py-1 rounded-lg font-black uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">{doc.type}</span></td>
                    <td className="px-6 py-4 whitespace-nowrap text-xs font-bold text-slate-500 dark:text-slate-400 flex items-center"><Clock className="w-3.5 h-3.5 mr-1.5" /> {doc.date}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-500 dark:text-slate-400 font-mono font-bold">{doc.size}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="flex justify-end space-x-2">
                        <button onClick={() => handleReadDoc(doc.id, doc.isTemplate, doc.name, doc.categoryKey)} disabled={actionLoading === `read-${doc.id}`} className="text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 px-3 py-1.5 rounded-xl transition flex items-center text-xs font-bold cursor-pointer disabled:opacity-50 shadow-xs">
                          {actionLoading === `read-${doc.id}` ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <ExternalLink className="w-3 h-3 mr-1.5 text-blue-600 dark:text-blue-400" />} Read
                        </button>

                        {hasDownloadClearance ? (
                          <>
                            <button onClick={() => handleDownloadDoc(doc.id, doc.isTemplate, doc.name, doc.categoryKey)} disabled={actionLoading === `download-${doc.id}`} className="text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 border border-emerald-200 dark:border-emerald-900 px-3 py-1.5 rounded-xl transition flex items-center text-xs font-bold cursor-pointer disabled:opacity-50 shadow-xs">
                              {actionLoading === `download-${doc.id}` ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Download className="w-3 h-3 mr-1.5" />} Download
                            </button>
                            {hasUploadClearance && (
                              <button onClick={() => handleDeleteDoc(doc.id)} disabled={actionLoading === `delete-${doc.id}`} className="text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 hover:bg-red-100 dark:hover:bg-red-900/50 border border-red-200 dark:border-red-900 px-3 py-1.5 rounded-xl transition flex items-center text-xs font-bold cursor-pointer disabled:opacity-50 shadow-xs">
                                {actionLoading === `delete-${doc.id}` ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Trash2 className="w-3 h-3 mr-1.5" />} Delete
                              </button>
                            )}
                          </>
                        ) : (
                          <button disabled className="text-slate-400 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-1.5 rounded-xl flex items-center text-xs font-bold cursor-not-allowed opacity-60" title="Command Clearance Required to Download"><Lock className="w-3 h-3 mr-1" /> Restricted</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WordReportUpload;