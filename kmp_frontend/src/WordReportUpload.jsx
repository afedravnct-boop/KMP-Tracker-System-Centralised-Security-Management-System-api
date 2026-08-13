import React, { useState, useEffect, useRef } from 'react';
import { 
  UploadCloud, FileText, Download, CheckCircle, AlertTriangle, 
  Loader2, FolderOpen, Clock, FileArchive, Eye, Lock, FilePlus, ListFilter, Server, Trash2
} from 'lucide-react';

// 🟢 Available System Templates List
const TEMPLATE_TYPES = {
  nominal_roll: { id: 'nominal_roll', name: 'Nominal Roll Submission', desc: 'Official roster and personnel tracking template.', ext: '.DOCX' },
  weekly_report: { id: 'weekly_report', name: 'Weekly Report Template', desc: 'Standard formatting for weekly situational returns.', ext: '.DOCX' },
  custom_report: { id: 'custom_report', name: 'Custom Report Template', desc: 'Blank structured template for non-standard administrative reports.', ext: '.DOCX' },
  opord: { id: 'opord', name: 'OPORD (Operational Order)', desc: 'Standard operational directive and tactical deployment framework.', ext: '.DOCX' },
  pass_leave: { id: 'pass_leave', name: 'Pass / Leave Request', desc: 'Official authorization form for personnel absence requests.', ext: '.DOCX' },
  op_stats: { id: 'op_stats', name: 'Operational Statistics Returns', desc: 'Metrics and statistical tracking template.', ext: '.XLSX' },
  daily_sitrep: { id: 'daily_sitrep', name: 'Daily Sitrep', desc: 'Daily situational reporting framework.', ext: '.DOCX' },
  others: { id: 'others', name: 'Others / Miscellaneous', desc: 'General purpose command template.', ext: '.DOCX' }
};

// 🟢 CRITICAL FIX: Explicitly receive the override props from App.jsx
const WordReportUpload = ({ currentUser, overrideRegion, overrideStation }) => {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [feedback, setFeedback] = useState(null);
  
  // 🟢 STRICT TAB SEPARATION
  const [mainTab, setMainTab] = useState('reports'); // 'reports' | 'templates'
  const [docCategory, setDocCategory] = useState('weekly_report'); 

  const [documents, setDocuments] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);

  // 🟢 TEMPLATE HUB STATES
  const [selectedTemplateId, setSelectedTemplateId] = useState('weekly_report');
  const [uploadingTemplate, setUploadingTemplate] = useState(false);
  const hiddenFileInput = useRef(null);

  const hasDownloadClearance = ['SUPER_ADMIN', 'ADMIN', 'RPC'].includes(currentUser?.role?.toUpperCase());

  useEffect(() => {
    if (mainTab === 'reports') {
      fetchArchiveList();
    }
  }, [mainTab]);

  const fetchArchiveList = async () => {
    setLoadingDocs(true);
    try {
      const token = localStorage.getItem('kmp_authToken');
      const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
      
      const response = await fetch(`${API_URL}/api/v1/reports/archive`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      
      if (!response.ok) throw new Error("Failed to fetch documents");
      
      const data = await response.json();
      setDocuments(data);
    } catch (err) {
      console.error("Archive fetch error:", err);
    } finally {
      setLoadingDocs(false);
    }
  };

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
    setFeedback(null);
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file) return alert("Please select a report file first.");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("doc_type", docCategory); 
    
    // 🟢 CRITICAL FIX: Append the jurisdiction overrides to the payload
    if (overrideRegion) formData.append("target_region", overrideRegion);
    if (overrideStation) formData.append("target_station", overrideStation);

    setUploading(true);
    try {
      const token = localStorage.getItem('kmp_authToken');
      const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
      
      const response = await fetch(`${API_URL}/api/v1/reports/upload-word-report`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` },
        body: formData
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Upload failed.");

      setFeedback({ type: 'success', message: data.message });
      setFile(null);
      fetchArchiveList(); // Refresh ledger immediately
    } catch (err) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setUploading(false);
    }
  };

  const handleTemplateUploadClick = () => {
    hiddenFileInput.current.click();
  };

  const handleTemplateFileChange = async (e) => {
    const templateFile = e.target.files[0];
    if (!templateFile) return;

    setUploadingTemplate(true);
    try {
      const token = localStorage.getItem('kmp_authToken');
      const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
      
      const formData = new FormData();
      formData.append("file", templateFile);
      
      const response = await fetch(`${API_URL}/api/v1/templates/upload/${selectedTemplateId}`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` },
        body: formData
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Template update failed.");

      alert(`Success! '${TEMPLATE_TYPES[selectedTemplateId].name}' template has been updated in the system.`);
    } catch (err) {
      alert(`Template Upload Error: ${err.message}`);
    } finally {
      setUploadingTemplate(false);
      e.target.value = null; 
    }
  };

  // 🟢 NEW: DELETE DOCUMENT HANDLER
  const handleDeleteDoc = async (docId) => {
    if (!window.confirm("Are you sure you want to permanently delete this document? This action cannot be undone.")) return;
    
    setActionLoading(`delete-${docId}`);
    try {
      const token = localStorage.getItem('kmp_authToken');
      const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
      
      const response = await fetch(`${API_URL}/api/v1/reports/archive/${docId}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${token}` }
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || "Failed to delete document.");
      }
      
      setFeedback({ type: 'success', message: "Document successfully deleted." });
      fetchArchiveList(); // Refresh the ledger immediately
    } catch (err) {
      alert(`Delete Error: ${err.message}`);
    } finally {
      setActionLoading(null);
      setTimeout(() => setFeedback(null), 4000);
    }
  };

// 🟢 MOBILE-OPTIMIZED FILE ACTION (Read & Download)
  const handleFileAction = async (docId, action, isTemplate = false) => {
    setActionLoading(`${action}-${docId}`);
    try {
      const token = localStorage.getItem('kmp_authToken');
      const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
      
      const endpoint = isTemplate 
        ? `${API_URL}/api/v1/templates/download/${docId}`
        : `${API_URL}/api/v1/reports/download/${docId}`;

      const response = await fetch(endpoint, {
        method: "GET",
        headers: { "Authorization": `Bearer ${token}` }
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || "Failed to retrieve secure file.");
      }
      
      const contentType = response.headers.get("content-type");
      
      // If S3 URL returned from Database:
      if (contentType && contentType.includes("application/json")) {
        const data = await response.json();
        const fileUrl = data.download_url || data.file_url;
        
        if (!fileUrl) throw new Error("No secure URL returned from the server.");
        
        if (action === 'download') {
          const link = document.createElement('a');
          link.href = fileUrl;
          link.setAttribute('download', '');
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        } else if (action === 'read') {
          // 🟢 MOBILE FIX: Use Google Docs Viewer for reliable cross-platform rendering
          const viewerUrl = `https://docs.google.com/viewer?url=${encodeURIComponent(fileUrl)}&embedded=true`;
          
          const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
          if (isMobile) {
            // Force direct page transition on mobile to completely bypass popup blockers
            window.location.href = viewerUrl;
          } else {
            const newWindow = window.open(viewerUrl, '_blank');
            if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') { 
              window.location.href = viewerUrl; 
            }
          }
        }
        
      } else {
        // Legacy Blob Fallback
        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        
        if (action === 'download') {
          const link = document.createElement('a');
          link.href = blobUrl;
          link.setAttribute('download', isTemplate ? `${docId}.docx` : 'document.docx');
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        } else if (action === 'read') {
          const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
          if (isMobile) {
            window.location.href = blobUrl;
          } else {
            const newWindow = window.open(blobUrl, '_blank');
            if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') { 
              window.location.href = blobUrl; 
            }
          }
        }
        
        setTimeout(() => window.URL.revokeObjectURL(blobUrl), 10000);
      }
      
    } catch (err) {
      alert(`Document Action Error: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const currentTemplate = TEMPLATE_TYPES[selectedTemplateId];

  return (
    <div className="max-w-[1600px] mx-auto space-y-6 font-sans mb-8">
      
      {/* 🟢 MASTER NAVIGATION HEADER */}
      <div className="bg-slate-900 text-white px-6 py-4 rounded-xl shadow-md flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <h2 className="text-lg font-extrabold uppercase tracking-wider flex items-center">
            <FileText className="w-5 h-5 mr-2 text-blue-400" />
            File Management & Templates
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">Secure storage for reports and structural command templates.</p>
        </div>
        
        <div className="flex bg-slate-800 p-1 rounded-lg border border-slate-700 w-full md:w-auto">
          <button 
            onClick={() => setMainTab('reports')}
            className={`flex-1 flex justify-center items-center px-6 py-2.5 text-xs font-bold rounded-md transition-colors ${mainTab === 'reports' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-300 hover:text-white hover:bg-slate-700'}`}
          >
            <Server className="w-4 h-4 mr-2" /> Reports Storage
          </button>
          <button 
            onClick={() => setMainTab('templates')}
            className={`flex-1 flex justify-center items-center px-6 py-2.5 text-xs font-bold rounded-md transition-colors ${mainTab === 'templates' ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-300 hover:text-white hover:bg-slate-700'}`}
          >
            <FolderOpen className="w-4 h-4 mr-2" /> Command Templates
          </button>
        </div>
      </div>

      {/* ========================================================= */}
      {/* TAB 1: REPORTS STORAGE (Upload + Ledger)                    */}
      {/* ========================================================= */}
      {mainTab === 'reports' && (
        <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200">
          
          {/* UPLOAD SECTION */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <div className="border-b border-slate-100 pb-4 mb-6">
              <h3 className="font-extrabold text-sm text-slate-900 uppercase">Secure Document Upload</h3>
              <p className="text-xs text-slate-500 mt-1">
                Upload completed reports to store them securely. They will be accessible to cleared admins below.
              </p>
            </div>

            <form onSubmit={handleUpload} className="max-w-3xl space-y-4">
              <div className="bg-slate-50 p-1.5 rounded-lg border border-slate-200 flex">
                <button
                  type="button"
                  onClick={() => setDocCategory('weekly_report')}
                  className={`flex-1 py-2 text-xs font-bold rounded shadow-sm transition-colors ${docCategory === 'weekly_report' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-200'}`}
                >
                  Weekly Report Returns
                </button>
                <button
                  type="button"
                  onClick={() => setDocCategory('general_doc')}
                  className={`flex-1 py-2 text-xs font-bold rounded shadow-sm transition-colors ${docCategory === 'general_doc' ? 'bg-slate-700 text-white' : 'text-slate-600 hover:bg-slate-200'}`}
                >
                  General Documents / Essays
                </button>
              </div>

              <div className="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center bg-slate-50 hover:bg-blue-50 hover:border-blue-300 transition cursor-pointer relative">
                <input 
                  type="file" 
                  accept=".docx,.xlsx,.pdf" 
                  onChange={handleFileChange} 
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />
                <UploadCloud className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                <p className="text-sm font-bold text-slate-600">Click or drag a completed file here</p>
              </div>

              {file && (
                <div className="text-xs font-mono text-blue-800 bg-blue-50 p-3 rounded-lg border border-blue-200 flex justify-between items-center">
                  <span className="flex items-center"><FileText className="w-4 h-4 mr-2" /> <strong>{file.name}</strong></span>
                  <span className="text-blue-500 font-bold">{Math.round(file.size / 1024)} KB</span>
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
                disabled={!file || uploading}
                className="w-full py-3 flex justify-center items-center text-white font-bold rounded-xl shadow-md text-xs uppercase tracking-wider transition bg-slate-900 hover:bg-black disabled:bg-slate-300"
              >
                {uploading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Uploading...</> : `Upload Document to Secure Storage`}
              </button>
            </form>
          </div>

          {/* LEDGER SECTION */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div>
                <h3 className="font-extrabold text-slate-900 uppercase flex items-center">
                  <FileArchive className="w-5 h-5 mr-2 text-emerald-600" /> 
                  Uploaded Reports Ledger
                </h3>
                <p className="text-xs text-slate-500 mt-1">Secure access to previously uploaded reports.</p>
              </div>
            </div>
            
            <div className="overflow-x-auto w-full">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Document Name</th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Type</th>
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
                  ) : documents.map((doc) => (
                    <tr key={doc.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-blue-700 flex items-center">
                        <FileText className="w-4 h-4 mr-2 text-slate-400" />
                        {doc.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-xs">
                        <span className={`px-2 py-1 rounded font-bold uppercase tracking-wide ${doc.type === 'Formatted Weekly Report' ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' : 'bg-slate-100 text-slate-600 border border-slate-200'}`}>
                          {doc.type}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-500 flex items-center">
                        <Clock className="w-3 h-3 mr-1" /> {doc.date}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-500 font-mono">
                        {doc.size}
                      </td>
                      
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="flex justify-end space-x-2">
                          <button 
                            onClick={() => handleFileAction(doc.id, 'read')}
                            disabled={actionLoading === `read-${doc.id}`}
                            className="text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-300 px-3 py-1.5 rounded transition flex items-center text-xs font-bold cursor-pointer disabled:opacity-50"
                          >
                            {actionLoading === `read-${doc.id}` ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Eye className="w-3 h-3 mr-1" />}
                            Read
                          </button>

                          {hasDownloadClearance ? (
                            <>
                              <button 
                                onClick={() => handleFileAction(doc.id, 'download')}
                                disabled={actionLoading === `download-${doc.id}`}
                                className="text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-3 py-1.5 rounded transition flex items-center text-xs font-bold cursor-pointer disabled:opacity-50"
                              >
                                {actionLoading === `download-${doc.id}` ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Download className="w-3 h-3 mr-1" />}
                                Download
                              </button>
                              
                              <button 
                                onClick={() => handleDeleteDoc(doc.id)}
                                disabled={actionLoading === `delete-${doc.id}`}
                                className="text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 px-3 py-1.5 rounded transition flex items-center text-xs font-bold cursor-pointer disabled:opacity-50"
                              >
                                {actionLoading === `delete-${doc.id}` ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Trash2 className="w-3 h-3 mr-1" />}
                                Delete
                              </button>
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
                  {!loadingDocs && documents.length === 0 && (
                    <tr>
                      <td colSpan="5" className="px-6 py-10 text-center text-slate-500 text-sm font-medium">
                        No documents found in the archive.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 2: COMMAND TEMPLATES                                  */}
      {/* ========================================================= */}
      {mainTab === 'templates' && (
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 max-w-4xl mx-auto animate-in fade-in zoom-in-95 duration-200">
          <div className="text-center border-b border-slate-100 pb-6 mb-8">
            <FolderOpen className="w-12 h-12 mx-auto text-amber-500 mb-3" />
            <h3 className="font-extrabold text-xl text-slate-900 uppercase">Command Template Repository</h3>
            <p className="text-sm text-slate-500 mt-2">Select a guiding document from the dropdown below to view or download.</p>
          </div>
          
          <div className="relative mb-8 max-w-md mx-auto">
            <ListFilter className="absolute left-4 top-3.5 w-5 h-5 text-slate-400" />
            <select 
              value={selectedTemplateId}
              onChange={(e) => setSelectedTemplateId(e.target.value)}
              className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer appearance-none shadow-sm"
            >
              {Object.values(TEMPLATE_TYPES).map(template => (
                <option key={template.id} value={template.id}>{template.name}</option>
              ))}
            </select>
          </div>
          
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-8 max-w-xl mx-auto">
            <div className="text-center mb-8">
               <h4 className="text-lg font-black text-slate-800 uppercase mb-2">{currentTemplate.name}</h4>
               <p className="text-sm text-slate-600 mb-4">{currentTemplate.desc}</p>
               <span className="font-mono text-amber-700 text-xs font-bold bg-amber-100 px-3 py-1.5 rounded shadow-sm border border-amber-300">
                 Format: {currentTemplate.ext}
               </span>
            </div>

            <div className="space-y-3">
              <div className="flex space-x-3">
                {/* READ BUTTON */}
                <button 
                  onClick={() => handleFileAction(selectedTemplateId, 'read', true)} 
                  disabled={actionLoading === `read-${selectedTemplateId}`}
                  className="flex-1 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 text-sm font-bold py-3.5 rounded-xl transition flex justify-center items-center shadow-sm"
                >
                  {actionLoading === `read-${selectedTemplateId}` ? <Loader2 size={18} className="mr-2 animate-spin"/> : <Eye size={18} className="mr-2"/>} Read Template
                </button>
                
                {/* DOWNLOAD BUTTON */}
                <button 
                  onClick={() => handleFileAction(selectedTemplateId, 'download', true)} 
                  disabled={actionLoading === `download-${selectedTemplateId}` || !hasDownloadClearance}
                  title={!hasDownloadClearance ? "Command clearance required to download" : ""}
                  className="flex-1 bg-amber-600 hover:bg-amber-700 disabled:bg-slate-300 text-white text-sm font-bold py-3.5 rounded-xl transition flex justify-center items-center shadow-sm"
                >
                  {actionLoading === `download-${selectedTemplateId}` ? <Loader2 size={18} className="mr-2 animate-spin"/> : (!hasDownloadClearance ? <Lock size={18} className="mr-2"/> : <Download size={18} className="mr-2"/>)} Download
                </button>
              </div>

              {/* UPLOAD/OVERWRITE BUTTON */}
              <div>
                <input type="file" accept=".docx,.xlsx" className="hidden" ref={hiddenFileInput} onChange={handleTemplateFileChange} />
                <button 
                  onClick={handleTemplateUploadClick}
                  disabled={uploadingTemplate || !hasDownloadClearance}
                  className="w-full bg-slate-900 hover:bg-black disabled:bg-slate-300 text-white text-xs font-bold py-3 rounded-xl transition flex justify-center items-center cursor-pointer shadow-sm mt-4"
                >
                  {uploadingTemplate ? <Loader2 size={14} className="mr-2 animate-spin"/> : (!hasDownloadClearance ? <Lock size={14} className="mr-2"/> : <FilePlus size={14} className="mr-2"/>)} 
                  {hasDownloadClearance ? 'Admin Action: Overwrite Template on Server' : 'Admin Clearance Required to Overwrite'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default WordReportUpload;