import React, { useState, useEffect } from 'react';
import {  
  UploadCloud, FileText, Download, CheckCircle, AlertTriangle,  
  Loader2, FolderOpen, Clock, FileArchive, Eye, Lock, Server, Trash2
} from 'lucide-react';

// 🟢 Available System Templates List (Universal Support)
const TEMPLATE_TYPES = {
  nominal_roll: { id: 'nominal_roll', name: 'Nominal Roll Submission', desc: 'Official roster and personnel tracking template.', ext: 'ANY FORMAT' },
  weekly_report: { id: 'weekly_report', name: 'Weekly Report Template', desc: 'Standard formatting for weekly situational returns.', ext: 'ANY FORMAT' },
  custom_report: { id: 'custom_report', name: 'Custom Report Template', desc: 'Blank structured template for non-standard administrative reports.', ext: 'ANY FORMAT' },
  opord: { id: 'opord', name: 'OPORD (Operational Order)', desc: 'Standard operational directive and tactical deployment framework.', ext: 'ANY FORMAT' },
  pass_leave: { id: 'pass_leave', name: 'Pass / Leave Request', desc: 'Official authorization form for personnel absence requests.', ext: 'ANY FORMAT' },
  op_stats: { id: 'op_stats', name: 'Operational Statistics Returns', desc: 'Metrics and statistical tracking template.', ext: 'ANY FORMAT' },
  daily_sitrep: { id: 'daily_sitrep', name: 'Daily Sitrep', desc: 'Daily situational reporting framework.', ext: 'ANY FORMAT' },
  others: { id: 'others', name: 'Others / Miscellaneous', desc: 'General purpose command template.', ext: 'ANY FORMAT' }
};

const WordReportUpload = ({ currentUser, overrideRegion, overrideStation }) => {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [feedback, setFeedback] = useState(null);
  
  const [docCategory, setDocCategory] = useState('weekly_report'); 
  const [ledgerViewCategory, setLedgerViewCategory] = useState('weekly_report'); 

  const [documents, setDocuments] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);

  const [selectedTemplateId, setSelectedTemplateId] = useState('weekly_report');

  const hasDownloadClearance = ['SUPER_ADMIN', 'ADMIN', 'RPC'].includes(currentUser?.role?.toUpperCase());

  useEffect(() => {
    fetchArchiveList();
  }, []);

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
    if (!file) return alert("Please select a file first.");

    const formData = new FormData();
    formData.append("file", file);
    
    let endpoint = "";

    if (docCategory === 'templates') {
      endpoint = `${import.meta.env.VITE_API_URL || "http://127.0.0.1:8000"}/api/v1/templates/upload/${selectedTemplateId}`;
    } else {
      endpoint = `${import.meta.env.VITE_API_URL || "http://127.0.0.1:8000"}/api/v1/reports/upload-word-report`;
      formData.append("doc_type", docCategory); 
      if (overrideRegion) formData.append("target_region", overrideRegion);
      if (overrideStation) formData.append("target_station", overrideStation);
    }

    setUploading(true);
    try {
      const token = localStorage.getItem('kmp_authToken');
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` },
        body: formData
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Upload failed.");

      setFeedback({ type: 'success', message: data.message || "File securely uploaded!" });
      setFile(null);
      fetchArchiveList(); 
    } catch (err) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setUploading(false);
      setTimeout(() => setFeedback(null), 5000);
    }
  };

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
      fetchArchiveList(); 
    } catch (err) {
      alert(`Delete Error: ${err.message}`);
    } finally {
      setActionLoading(null);
      setTimeout(() => setFeedback(null), 4000);
    }
  };

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
        throw new Error(errorData.detail || "Requested template not found. Please upload it first.");
      }
      
      const contentType = response.headers.get("content-type");
      
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
          const viewerUrl = `https://docs.google.com/viewer?url=${encodeURIComponent(fileUrl)}&embedded=true`;
          const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
          if (isMobile) {
            window.location.href = viewerUrl;
          } else {
            const newWindow = window.open(viewerUrl, '_blank');
            if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') { 
              window.location.href = viewerUrl; 
            }
          }
        }
        
      } else {
        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        
        if (action === 'download') {
          const link = document.createElement('a');
          link.href = blobUrl;
          link.setAttribute('download', isTemplate ? `${docId}_template` : 'document');
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

  const filteredDocuments = documents.filter(doc => {
    if (ledgerViewCategory === 'weekly_report') {
      return doc.type === 'Formatted Weekly Report';
    } else if (ledgerViewCategory === 'general_doc') {
      return doc.type !== 'Formatted Weekly Report'; 
    }
    return false;
  });

  return (
    <div className="max-w-[1600px] mx-auto space-y-6 font-sans mb-8">
      
      <div className="bg-slate-900 text-white px-6 py-4 rounded-xl shadow-md flex items-center">
        <div>
          <h2 className="text-lg font-extrabold uppercase tracking-wider flex items-center">
            <Server className="w-5 h-5 mr-2 text-blue-400" />
            Central Data Repository & Universal Templates
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">Universal secure intake hub supporting Word, Excel, PowerPoint, PDF, and all document formats.</p>
        </div>
      </div>

      <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200">
        
        {/* 🟢 UNIVERSAL UPLOAD SECTION */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div className="border-b border-slate-100 pb-4 mb-6">
            <h3 className="font-extrabold text-sm text-slate-900 uppercase">Universal File Intake Hub</h3>
            <p className="text-xs text-slate-500 mt-1">Upload any format (Word `.docx`, Excel `.xlsx`, PowerPoint `.pptx`, PDF, etc.) directly into command storage.</p>
          </div>

          <form onSubmit={handleUpload} className="max-w-3xl space-y-4">
            
            <div className="bg-slate-50 p-1.5 rounded-lg border border-slate-200 flex flex-col sm:flex-row gap-1">
              <button
                type="button"
                onClick={() => setDocCategory('weekly_report')}
                className={`flex-1 py-2 px-2 text-xs font-bold rounded shadow-sm transition-colors ${docCategory === 'weekly_report' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-200'}`}
              >
                Weekly Reports
              </button>
              <button
                type="button"
                onClick={() => setDocCategory('general_doc')}
                className={`flex-1 py-2 px-2 text-xs font-bold rounded shadow-sm transition-colors ${docCategory === 'general_doc' ? 'bg-slate-700 text-white' : 'text-slate-600 hover:bg-slate-200'}`}
              >
                General Docs / Statements
              </button>
              <button
                type="button"
                onClick={() => setDocCategory('templates')}
                className={`flex-1 py-2 px-2 text-xs font-bold rounded shadow-sm transition-colors ${docCategory === 'templates' ? 'bg-amber-600 text-white' : 'text-slate-600 hover:bg-slate-200'}`}
              >
                Command Templates
              </button>
            </div>

            {docCategory === 'templates' && !hasDownloadClearance ? (
               <div className="p-8 text-center bg-red-50 border border-red-200 rounded-xl mt-4">
                 <Lock className="w-8 h-8 text-red-500 mx-auto mb-2" />
                 <h3 className="text-red-800 font-bold">Admin Clearance Required</h3>
                 <p className="text-xs text-red-600 mt-1">You do not have the required command clearance to overwrite system templates.</p>
               </div>
            ) : (
              <div className="space-y-4 mt-4 animate-in fade-in">
                
                {docCategory === 'templates' && (
                  <div className="bg-amber-50 p-4 rounded-xl border border-amber-200">
                    <label className="block text-xs font-bold text-amber-900 mb-2">Target Template Slot *</label>
                    <select 
                      value={selectedTemplateId} 
                      onChange={(e) => setSelectedTemplateId(e.target.value)}
                      className="w-full border border-amber-300 rounded-lg p-2.5 text-sm font-bold text-slate-700 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200 bg-white cursor-pointer"
                    >
                      {Object.values(TEMPLATE_TYPES).map(tpl => (
                        <option key={tpl.id} value={tpl.id}>{tpl.name}</option>
                      ))}
                    </select>
                    <p className="text-[10px] text-amber-700 mt-2 font-medium"><AlertTriangle className="w-3 h-3 inline mr-1" />Any format can be attached here (Word, Excel, PowerPoint, PDF).</p>
                  </div>
                )}

                {/* 🟢 UNIVERSAL ACCEPTANCE: removed restrictive accept filter */}
                <div className={`border-2 border-dashed rounded-xl p-6 text-center transition cursor-pointer relative ${docCategory === 'templates' ? 'border-amber-300 bg-amber-50/50 hover:bg-amber-100 hover:border-amber-400' : 'border-slate-300 bg-slate-50 hover:bg-blue-50 hover:border-blue-300'}`}>
                  <input 
                    type="file" 
                    onChange={handleFileChange} 
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  />
                  <UploadCloud className={`w-8 h-8 mx-auto mb-2 ${docCategory === 'templates' ? 'text-amber-500' : 'text-slate-400'}`} />
                  <p className="text-sm font-bold text-slate-600">Click or drop any file format (Word, Excel, PPT, PDF, etc.) here</p>
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
                  className={`w-full py-3 flex justify-center items-center text-white font-bold rounded-xl shadow-md text-xs uppercase tracking-wider transition disabled:bg-slate-300 ${docCategory === 'templates' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-slate-900 hover:bg-black'}`}
                >
                  {uploading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Uploading...</> : docCategory === 'templates' ? 'Confirm Universal Template Slot' : 'Upload Document to Secure Storage'}
                </button>
              </div>
            )}
          </form>
        </div>

        {/* 🟢 LEDGER SECTION */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-slate-50">
            <div>
              <h3 className="font-extrabold text-slate-900 uppercase flex items-center">
                <FileArchive className="w-5 h-5 mr-2 text-emerald-600" /> 
                System Records & Universal Templates Ledger
              </h3>
            </div>

            <div className="flex flex-wrap bg-slate-200 p-1 rounded-lg border border-slate-300 w-full lg:w-auto">
              <button
                type="button"
                onClick={() => setLedgerViewCategory('weekly_report')}
                className={`flex-1 px-4 py-1.5 text-[11px] sm:text-xs font-bold rounded-md transition-colors ${ledgerViewCategory === 'weekly_report' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-700 hover:text-black'}`}
              >
                Weekly Reports
              </button>
              <button
                type="button"
                onClick={() => setLedgerViewCategory('general_doc')}
                className={`flex-1 px-4 py-1.5 text-[11px] sm:text-xs font-bold rounded-md transition-colors ${ledgerViewCategory === 'general_doc' ? 'bg-slate-800 text-white shadow-xs' : 'text-slate-700 hover:text-black'}`}
              >
                General Docs
              </button>
              <button
                type="button"
                onClick={() => setLedgerViewCategory('templates')}
                className={`flex-1 px-4 py-1.5 text-[11px] sm:text-xs font-bold rounded-md transition-colors ${ledgerViewCategory === 'templates' ? 'bg-amber-600 text-white shadow-xs' : 'text-slate-700 hover:text-black'}`}
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
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">{ledgerViewCategory === 'templates' ? 'Description' : 'Type'}</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">{ledgerViewCategory === 'templates' ? 'Format Support' : 'Date Logged'}</th>
                  {ledgerViewCategory !== 'templates' && <th className="px-6 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Size</th>}
                  <th className="px-6 py-3 text-right text-xs font-bold text-slate-600 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-100">
                
                {ledgerViewCategory === 'templates' ? (
                  Object.values(TEMPLATE_TYPES).map((tpl) => (
                    <tr key={tpl.id} className="hover:bg-amber-50/30 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-slate-800 flex items-center">
                        <FolderOpen className="w-4 h-4 mr-2 text-amber-500 shrink-0" />
                        {tpl.name}
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-500 max-w-xs truncate" title={tpl.desc}>
                        {tpl.desc}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-xs font-mono font-bold text-amber-700">
                        {tpl.ext}
                      </td>
                      
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="flex justify-end space-x-2">
                          <button 
                            onClick={() => handleFileAction(tpl.id, 'read', true)}
                            disabled={actionLoading === `read-${tpl.id}`}
                            className="text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-300 px-3 py-1.5 rounded transition flex items-center text-xs font-bold cursor-pointer disabled:opacity-50"
                          >
                            {actionLoading === `read-${tpl.id}` ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Eye className="w-3 h-3 mr-1" />}
                            Read
                          </button>

                          <button 
                            onClick={() => handleFileAction(tpl.id, 'download', true)}
                            disabled={actionLoading === `download-${tpl.id}` || !hasDownloadClearance}
                            className="text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-3 py-1.5 rounded transition flex items-center text-xs font-bold cursor-pointer disabled:opacity-50"
                          >
                            {actionLoading === `download-${tpl.id}` ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Download className="w-3 h-3 mr-1" />}
                            Download
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  loadingDocs ? (
                    <tr>
                      <td colSpan="5" className="px-6 py-10 text-center text-slate-500 text-sm font-medium">
                        <Loader2 className="w-5 h-5 mx-auto animate-spin mb-2 text-blue-500" /> Fetching documents...
                      </td>
                    </tr>
                  ) : filteredDocuments.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="px-6 py-10 text-center text-slate-500 text-sm font-medium">
                        No documents found under this category.
                      </td>
                    </tr>
                  ) : filteredDocuments.map((doc) => (
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
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WordReportUpload;