import React, { useState, useEffect, useMemo, useRef } from 'react';
import {  
  UploadCloud, FileText, Download, CheckCircle, AlertTriangle,  
  Loader2, FolderOpen, Clock, FileArchive, Eye, Lock, Server, Trash2, Filter
} from 'lucide-react';
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

const WordReportUpload = ({ currentUser, overrideRegion, overrideStation, canViewGlobal = false }) => {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const [activeCategory, setActiveCategory] = useState('weekly_report'); 

  const [documents, setDocuments] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);

  const [templateCustomName, setTemplateCustomName] = useState('');

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

  const hasUploadClearance = canViewGlobalActive || currentUser?.role === 'SUPER_ADMIN' || (currentUser?.permissions?.acc_tripartite_upload !== false && (canUploadByRole || currentUser?.permissions?.acc_tripartite_upload === true));
  const hasDownloadClearance = canViewGlobalActive || currentUser?.role === 'SUPER_ADMIN' || (currentUser?.permissions?.acc_tripartite_download !== false && (canDownloadByRole || currentUser?.permissions?.acc_tripartite_download === true));

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
    files.forEach((f) => {
      formData.append("files", f);
    });

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
      const response = await authFetch(endpoint, {
        method: "POST",
        body: formData
      });

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
      const response = await authFetch(`/api/v1/reports/archive/${docId}`, {
        method: "DELETE"
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || "Failed to delete document.");
      }

      setFeedback({ type: 'success', message: "Document successfully deleted." });
      fetchArchiveList(); 
    } catch (err) {
      alert(`Delete Error: ${err.message}`);
    } finally {
      setActionLoading(null);
      setTimeout(() => setFeedback(null), 4000);
    }
  };

  // 🟢 FIXED FILE ACTION HANDLER: Correctly streams binary blobs for Read (preview) and Download
  const handleFileAction = async (docId, action, isTemplate = false) => {
    if (action === 'download' && !hasDownloadClearance) {
      return alert("Security Restriction: You do not have command clearance to download documents.");
    }

    setActionLoading(`${action}-${docId}`);
    try {
      const endpoint = isTemplate 
        ? `/api/v1/templates/download/${docId}`
        : `/api/v1/reports/download/${docId}`;

      const response = await authFetch(endpoint, {
        method: "GET"
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || "Requested document not found.");
      }

      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);

      if (action === 'read') {
        // Open document preview in a new tab
        window.open(blobUrl, '_blank');
      } else {
        // Trigger physical download
        const link = document.createElement('a');
        link.href = blobUrl;
        link.setAttribute('download', '');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }

      setTimeout(() => window.URL.revokeObjectURL(blobUrl), 15000);

    } catch (err) {
      alert(`Document Action Error: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const filteredDocuments = useMemo(() => {
    return documents.filter(doc => {
      if (doc.categoryKey !== activeCategory) {
        return false;
      }

      const stn = (doc.station || '').trim().toUpperCase();
      const reg = getOfficialRegionForStation(stn, doc.region);

      if (canViewGlobalActive && filterRegion === 'ALL REGIONS' && filterStation === 'ALL STATIONS') {
        return true;
      }
      if (filterRegion !== 'ALL REGIONS' && reg !== filterRegion.toUpperCase()) return false;
      if (filterStation !== 'ALL STATIONS' && stn !== filterStation.toUpperCase()) return false;

      return true;
    });
  }, [documents, activeCategory, filterRegion, filterStation, canViewGlobalActive]);

  return (
    <div className="max-w-[1600px] mx-auto space-y-6 font-sans mb-8">
      
      <div className="bg-slate-900 text-white px-6 py-4 rounded-xl shadow-md flex items-center">
        <div>
          <h2 className="text-lg font-extrabold uppercase tracking-wider flex items-center">
            <Server className="w-5 h-5 mr-2 text-blue-400" />
            Central Data Repository & Universal Templates
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">Universal secure intake hub supporting Word, Excel, PowerPoint, PDF, and multiple file uploads simultaneously.</p>
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-bold text-slate-500 uppercase flex items-center">
            <Filter size={14} className="mr-1 text-blue-600" /> Jurisdiction Filters:
          </span>

          <select 
            value={filterRegion} 
            onChange={(e) => { setFilterRegion(e.target.value); setFilterStation('ALL STATIONS'); }}
            disabled={!canViewGlobalActive}
            className="border border-slate-300 rounded-lg p-2 text-xs font-bold text-slate-800 bg-white outline-none cursor-pointer disabled:bg-slate-100 disabled:text-slate-500"
          >
            {canViewGlobalActive ? (
              <>
                <option value="ALL REGIONS">ALL REGIONS</option>
                {Object.keys(REGIONAL_HIERARCHY).map(reg => (
                  <option key={reg} value={reg}>{reg}</option>
                ))}
              </>
            ) : (
              <option value={currentUser?.region || ''}>{currentUser?.region || 'UNKNOWN'}</option>
            )}
          </select>

          <select 
            value={filterStation} 
            onChange={(e) => setFilterStation(e.target.value)}
            disabled={!canViewGlobalActive}
            className="border border-slate-300 rounded-lg p-2 text-xs font-bold text-slate-800 bg-white outline-none cursor-pointer disabled:bg-slate-100 disabled:text-slate-500"
          >
            {canViewGlobalActive ? (
              <>
                <option value="ALL STATIONS">ALL STATIONS</option>
                {filterRegion !== 'ALL REGIONS' && (REGIONAL_HIERARCHY[filterRegion] || []).map(stn => (
                  <option key={stn} value={stn}>{stn}</option>
                ))}
              </>
            ) : (
              <option value={currentUser?.station || ''}>{currentUser?.station || 'UNKNOWN'}</option>
            )}
          </select>
        </div>

        <span className="text-xs font-extrabold text-blue-800 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-200">
          Showing: {filterRegion} {filterStation !== 'ALL STATIONS' ? `➔ ${filterStation}` : ''}
        </span>
      </div>

      <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200">
        
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div className="border-b border-slate-100 pb-4 mb-6">
            <h3 className="font-extrabold text-sm text-slate-900 uppercase">Universal File Intake Hub</h3>
            <p className="text-xs text-slate-500 mt-1">Upload multiple files simultaneously across any format directly into command storage.</p>
          </div>

          {!hasUploadClearance ? (
            <div className="p-6 text-center bg-amber-50 border border-amber-200 rounded-xl">
              <Lock className="w-6 h-6 text-amber-600 mx-auto mb-2" />
              <h3 className="text-amber-900 font-bold text-xs uppercase">Upload Restricted</h3>
              <p className="text-xs text-amber-700 mt-1">You have viewing access to view and read documents, but require specific command clearance or upload privileges to submit files.</p>
            </div>
          ) : (
            <form onSubmit={handleUpload} className="max-w-3xl space-y-4">

              <div className="bg-slate-50 p-1.5 rounded-lg border border-slate-200 flex flex-col sm:flex-row gap-1">
                <button
                  type="button"
                  onClick={() => setActiveCategory('weekly_report')}
                  className={`flex-1 py-2 px-2 text-xs font-bold rounded shadow-sm transition-colors cursor-pointer ${activeCategory === 'weekly_report' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-200'}`}
                >
                  Weekly Reports
                </button>
                <button
                  type="button"
                  onClick={() => setActiveCategory('general_doc')}
                  className={`flex-1 py-2 px-2 text-xs font-bold rounded shadow-sm transition-colors cursor-pointer ${activeCategory === 'general_doc' ? 'bg-slate-700 text-white' : 'text-slate-600 hover:bg-slate-200'}`}
                >
                  General Docs / Statements
                </button>
                <button
                  type="button"
                  onClick={() => setActiveCategory('templates')}
                  className={`flex-1 py-2 px-2 text-xs font-bold rounded shadow-sm transition-colors cursor-pointer ${activeCategory === 'templates' ? 'bg-amber-600 text-white' : 'text-slate-600 hover:bg-slate-200'}`}
                >
                  Command Templates
                </button>
              </div>

              <div className="space-y-4 mt-4 animate-in fade-in">

                {activeCategory === 'templates' && (
                  <div className="bg-amber-50 p-4 rounded-xl border border-amber-200 space-y-2">
                    <label className="block text-xs font-bold text-amber-900">Custom Template Title / Designation *</label>
                    <input 
                      type="text" 
                      value={templateCustomName} 
                      onChange={(e) => setTemplateCustomName(e.target.value)} 
                      placeholder="e.g. NOMINAL ROLL SUBMISSION TEMPLATE" 
                      required 
                      className="w-full border border-amber-300 rounded-lg p-2.5 text-sm font-bold text-slate-800 outline-none focus:border-amber-500 bg-white uppercase"
                    />
                  </div>
                )}

                <div className={`border-2 border-dashed rounded-xl p-4 text-center transition cursor-pointer relative ${activeCategory === 'templates' ? 'border-amber-300 bg-amber-50/50 hover:bg-amber-100' : 'border-slate-300 bg-slate-50 hover:bg-blue-50'}`}>
                  <input 
                    type="file" 
                    multiple 
                    onChange={handleFileChange} 
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  />
                  <UploadCloud className={`w-8 h-5 mx-auto mb-2 ${activeCategory === 'templates' ? 'text-amber-500' : 'text-slate-400'}`} />
                  <p className="text-sm font-bold text-slate-600">Click or drop multiple files here</p>
                </div>

                {files.length > 0 && (
                  <div className="space-y-2">
                    {files.map((f, idx) => (
                      <div key={idx} className="text-xs font-mono text-blue-800 bg-blue-50 p-3 rounded-lg border border-blue-200 flex justify-between items-center">
                        <span className="flex items-center"><FileText className="w-4 h-4 mr-2 shrink-0" /> <strong className="truncate max-w-[450px]">{f.name}</strong></span>
                        <span className="text-blue-500 font-bold shrink-0 ml-2">{Math.round(f.size / 1024)} KB</span>
                      </div>
                    ))}
                  </div>
                )}

                {feedback && (
                  <div className={`p-4 rounded-xl text-xs font-bold flex items-center ${feedback.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                    {feedback.type === 'success' ? <CheckCircle className="w-4 h-4 mr-2 text-emerald-600" /> : <AlertTriangle className="w-4 h-4 mr-2 text-red-600 shrink-0" />}
                    {feedback.message}
                  </div>
                )}

                <button 
                  type="submit" 
                  disabled={files.length === 0 || uploading}
                  className={`w-full py-3 flex justify-center items-center text-white font-bold rounded-xl shadow-md text-xs uppercase tracking-wider transition disabled:bg-slate-300 cursor-pointer ${activeCategory === 'templates' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-slate-900 hover:bg-black'}`}
                >
                  {uploading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Uploading Files...</> : activeCategory === 'templates' ? `Upload ${files.length || ''} Template(s)` : `Upload ${files.length || ''} Document(s)`}
                </button>
              </div>
            </form>
          )}
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-slate-50">
            <div>
              <h3 className="font-extrabold text-slate-900 uppercase flex items-center">
                <FileArchive className="w-5 h-5 mr-2 text-emerald-600" /> 
                System Records Ledger ({activeCategory.replace('_', ' ').toUpperCase()})
              </h3>
            </div>

            <div className="flex flex-wrap bg-slate-200 p-1 rounded-lg border border-slate-300 w-full lg:w-auto">
              <button
                type="button"
                onClick={() => setActiveCategory('weekly_report')}
                className={`flex-1 px-4 py-1.5 text-[11px] sm:text-xs font-bold rounded-md transition-colors cursor-pointer ${activeCategory === 'weekly_report' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-700 hover:text-black'}`}
              >
                Weekly Reports
              </button>
              <button
                type="button"
                onClick={() => setActiveCategory('general_doc')}
                className={`flex-1 px-4 py-1.5 text-[11px] sm:text-xs font-bold rounded-md transition-colors cursor-pointer ${activeCategory === 'general_doc' ? 'bg-slate-800 text-white shadow-xs' : 'text-slate-700 hover:text-black'}`}
              >
                General Docs
              </button>
              <button
                type="button"
                onClick={() => setActiveCategory('templates')}
                className={`flex-1 px-4 py-1.5 text-[11px] sm:text-xs font-bold rounded-md transition-colors cursor-pointer ${activeCategory === 'templates' ? 'bg-amber-600 text-white shadow-xs' : 'text-slate-700 hover:text-black'}`}
              >
                Templates
              </button>
            </div>
          </div>
          
          <div className="overflow-x-auto w-full">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-100">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Document Name</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Type / Designation</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Date Logged</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Size</th>
                  <th className="px-6 py-3 text-right text-xs font-bold text-slate-600 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-100">
                {loadingDocs ? (
                  <tr>
                    <td colSpan="5" className="px-6 py-10 text-center text-slate-500 text-sm font-medium">
                      <Loader2 className="w-5 h-5 mx-auto animate-spin mb-2 text-blue-500" /> Fetching documents...
                    </td>
                  </tr>
                ) : filteredDocuments.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="px-4 py-10 text-center text-slate-500 text-sm font-medium">
                      No documents found under this category for the selected jurisdiction.
                    </td>
                  </tr>
                ) : filteredDocuments.map((doc) => (
                  <tr key={doc.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-4 whitespace-nowrap text-sm font-bold text-slate-800 flex items-center">
                      <FolderOpen className="w-4 h-4 mr-2 text-amber-500 shrink-0" />
                      {doc.name}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-xs">
                      <span className="px-2 py-1 rounded font-bold uppercase tracking-wide bg-slate-100 text-slate-700 border border-slate-200">
                        {doc.type}
                      </span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-xs text-slate-500 flex items-center">
                      <Clock className="w-3 h-3 mr-1" /> {doc.date}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-xs text-slate-500 font-mono">
                      {doc.size}
                    </td>
                    
                    <td className="px-4 py-4 whitespace-nowrap text-right">
                      <div className="flex justify-end space-x-2">
                        <button 
                          onClick={() => handleFileAction(doc.id, 'read', doc.isTemplate)}
                          disabled={actionLoading === `read-${doc.id}`}
                          className="text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-300 px-3 py-1.5 rounded transition flex items-center text-xs font-bold cursor-pointer disabled:opacity-50"
                        >
                          {actionLoading === `read-${doc.id}` ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Eye className="w-3 h-3 mr-1" />}
                          Read
                        </button>

                        {hasDownloadClearance ? (
                          <>
                            <button 
                              onClick={() => handleFileAction(doc.id, 'download', doc.isTemplate)}
                              disabled={actionLoading === `download-${doc.id}`}
                              className="text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-3 py-1.5 rounded transition flex items-center text-xs font-bold cursor-pointer disabled:opacity-50"
                            >
                              {actionLoading === `download-${doc.id}` ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Download className="w-3 h-3 mr-1" />}
                              Download
                            </button>
                            
                            {hasUploadClearance && (
                              <button 
                                onClick={() => handleDeleteDoc(doc.id)}
                                disabled={actionLoading === `delete-${doc.id}`}
                                className="text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 px-3 py-1.5 rounded transition flex items-center text-xs font-bold cursor-pointer disabled:opacity-50"
                              >
                                {actionLoading === `delete-${doc.id}` ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Trash2 className="w-3 h-3 mr-1" />}
                                Delete
                              </button>
                            )}
                          </>
                        ) : (
                          <button disabled className="text-slate-400 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded flex items-center text-xs font-bold cursor-not-allowed opacity-60" title="Command Clearance Required to Download">
                            <Lock className="w-3 h-3 mr-1" /> Restricted
                          </button>
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