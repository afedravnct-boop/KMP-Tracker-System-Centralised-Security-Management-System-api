import React, { useState, useEffect } from 'react';
import { 
  UploadCloud, FileText, Download, CheckCircle, AlertTriangle, 
  Loader2, FolderOpen, Clock, FileArchive, Eye, Lock, X 
} from 'lucide-react';

const WordReportUpload = ({ currentUser }) => {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [feedback, setFeedback] = useState(null);
  
  const [activeTab, setActiveTab] = useState('upload'); // 'upload' | 'archive'
  const [docCategory, setDocCategory] = useState('weekly_report'); 

  const [documents, setDocuments] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(false);

  // 🟢 Preview Modal State
  const [previewDoc, setPreviewDoc] = useState(null);
  const [readingLoading, setReadingLoading] = useState(false);

  // Clearance Logic
  const hasDownloadClearance = ['SUPER_ADMIN', 'ADMIN', 'RPC'].includes(currentUser?.role?.toUpperCase());

  useEffect(() => {
    if (activeTab === 'archive') {
      fetchArchiveList();
    }
  }, [activeTab]);

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
    if (!file) return alert("Please select a Word (.docx) report file first.");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("doc_type", docCategory); 

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
      if (!response.ok) throw new Error(data.detail || "Upload compilation failed.");

      setFeedback({ type: 'success', message: data.message });
      setFile(null);
      
      fetchArchiveList();
    } catch (err) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setUploading(false);
    }
  };

  const downloadTemplate = (type) => {
    const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
    window.open(`${API_URL}/api/v1/templates/download/${type}`, '_blank');
  };

  // 🟢 FIXED: Secure Read Handler
  const handleSecureRead = async (doc) => {
    setReadingLoading(doc.id);
    try {
      const token = localStorage.getItem('kmp_authToken');
      const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
      
      const response = await fetch(`${API_URL}/api/v1/reports/download/${doc.id}`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || "File not found or unreadable on local server instance.");
      }
      
      const blob = await response.blob();
      
      // Force trigger browser stream load or download fallback
      const blobUrl = window.URL.createObjectURL(blob);
      
      // Open in preview container or prompt file reader
      const link = document.createElement('a');
      link.href = blobUrl;
      link.setAttribute('download', doc.name);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      setTimeout(() => window.URL.revokeObjectURL(blobUrl), 10000);
    } catch (err) {
      alert(`Read Error: ${err.message}`);
    } finally {
      setReadingLoading(false);
    }
  };

  const handleSecureDownload = (docId) => {
    const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
    window.open(`${API_URL}/api/v1/reports/download/${docId}`, '_blank');
  };

  return (
    <div className="max-w-[1600px] mx-auto space-y-6 font-sans mb-8">
      
      {/* Header Bar */}
      <div className="bg-slate-900 text-white px-6 py-4 rounded-xl shadow-md flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <h2 className="text-lg font-extrabold uppercase tracking-wider flex items-center">
            <FileText className="w-5 h-5 mr-2 text-blue-400" />
            Tripartite Report Ingestion & Template Hub
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">Manage standardized 3-format returns and system-generated reports.</p>
        </div>
        
        <div className="flex bg-slate-800 p-1 rounded-lg border border-slate-700">
          <button 
            onClick={() => setActiveTab('upload')}
            className={`flex items-center px-4 py-2 text-xs font-bold rounded-md transition-colors ${activeTab === 'upload' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-300 hover:text-white hover:bg-slate-700'}`}
          >
            <UploadCloud className="w-4 h-4 mr-2" /> Upload & Templates
          </button>
          <button 
            onClick={() => setActiveTab('archive')}
            className={`flex items-center px-4 py-2 text-xs font-bold rounded-md transition-colors ${activeTab === 'archive' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-300 hover:text-white hover:bg-slate-700'}`}
          >
            <FolderOpen className="w-4 h-4 mr-2" /> View Document Archive
          </button>
        </div>
      </div>

      {activeTab === 'upload' ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-in fade-in zoom-in-95 duration-200">
          
          {/* Left 2 Cols: Upload Portal */}
          <div className="md:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-6">
            <div className="border-b border-slate-100 pb-4">
              <h3 className="font-extrabold text-sm text-slate-900 uppercase">Document Upload Center</h3>
              <p className="text-xs text-slate-500 mt-1">
                Select the type of document you are uploading to apply the correct processing rules.
              </p>
            </div>

            <form onSubmit={handleUpload} className="space-y-4">
              
              <div className="bg-slate-50 p-1.5 rounded-lg border border-slate-200 flex mb-4">
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
                  accept=".docx" 
                  onChange={handleFileChange} 
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />
                <UploadCloud className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                <p className="text-sm font-bold text-slate-600">Click or drag a .docx file here</p>
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
                className={`w-full py-3 flex justify-center items-center text-white font-bold rounded-xl shadow-md text-xs uppercase tracking-wider transition ${docCategory === 'weekly_report' ? 'bg-blue-700 hover:bg-blue-800' : 'bg-slate-800 hover:bg-slate-900'} disabled:bg-slate-300`}
              >
                {uploading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Processing Document...</> : `Upload ${docCategory === 'weekly_report' ? 'Weekly Report' : 'Document'}`}
              </button>
            </form>
          </div>

          {/* Right Col: Template Hub */}
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
              <h3 className="font-extrabold text-sm text-slate-900 uppercase border-b border-slate-100 pb-3 flex items-center">
                <Download className="w-4 h-4 mr-2 text-slate-500" /> Report Templates
              </h3>
              <p className="text-xs text-slate-500">Official formatting templates available for all personnel.</p>
              <button 
                onClick={() => downloadTemplate('weekly-report')}
                className="w-full py-2.5 px-4 bg-slate-50 hover:bg-blue-50 text-slate-800 hover:text-blue-700 font-bold rounded-xl text-xs text-left flex justify-between items-center transition border border-slate-200 hover:border-blue-200 cursor-pointer"
              >
                <span>Weekly Report Return</span>
                <span className="font-mono text-blue-600 text-[10px] bg-white px-2 py-1 rounded border shadow-sm">.DOCX</span>
              </button>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
              <h3 className="font-extrabold text-sm text-slate-900 uppercase border-b border-slate-100 pb-3 flex items-center">
                <Download className="w-4 h-4 mr-2 text-slate-500" /> Assignment Templates
              </h3>
              <p className="text-xs text-slate-500">Operational deployment directive sheets available for all personnel.</p>
              <button 
                onClick={() => downloadTemplate('assignment')}
                className="w-full py-2.5 px-4 bg-slate-50 hover:bg-emerald-50 text-slate-800 hover:text-emerald-700 font-bold rounded-xl text-xs text-left flex justify-between items-center transition border border-slate-200 hover:border-emerald-200 cursor-pointer"
              >
                <span>Task Assignment Template</span>
                <span className="font-mono text-emerald-600 text-[10px] bg-white px-2 py-1 rounded border shadow-sm">.DOCX</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
          <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
            <div>
              <h3 className="font-extrabold text-slate-900 uppercase flex items-center">
                <FileArchive className="w-5 h-5 mr-2 text-emerald-600" /> 
                System Document Archive
              </h3>
              <p className="text-xs text-slate-500 mt-1">Review previously uploaded raw reports. Downloads are restricted by command clearance.</p>
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
                          onClick={() => handleSecureRead(doc)}
                          disabled={readingLoading === doc.id}
                          className="text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-3 py-1.5 rounded transition flex items-center text-xs font-bold cursor-pointer disabled:opacity-50"
                        >
                          {readingLoading === doc.id ? (
                            <Loader2 className="w-3 h-3 mr-1 animate-spin text-blue-700" />
                          ) : (
                            <Eye className="w-3 h-3 mr-1" />
                          )}
                          Read
                        </button>

                        {hasDownloadClearance ? (
                          <button 
                            onClick={() => handleSecureDownload(doc.id)}
                            className="text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-3 py-1.5 rounded transition flex items-center text-xs font-bold cursor-pointer"
                          >
                            <Download className="w-3 h-3 mr-1" /> Download
                          </button>
                        ) : (
                          <button 
                            disabled
                            className="text-slate-400 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded flex items-center text-xs font-bold cursor-not-allowed opacity-60"
                            title="Command Clearance Required to Download"
                          >
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
      )}
    </div>
  );
};

export default WordReportUpload;