import React, { useState, useRef } from 'react';
import { Upload, CheckCircle, AlertTriangle, Loader2 } from 'lucide-react';
import { authFetch } from './api';

const BulkNominalRollUpload = ({ onUploadSuccess, multiple = false }) => {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState(null);
  const [status, setStatus] = useState('idle'); // 'idle', 'success', 'warning', 'error'
  
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    const selectedFiles = Array.from(e.target.files);
    if (selectedFiles.length > 0) {
      setFiles(selectedFiles);
      setMessage(null);
      setStatus('idle');
    }
  };

  const handleUpload = async () => {
    if (!files || files.length === 0) {
      setMessage("Please select at least one valid Excel (.xlsx, .xls) or CSV file first.");
      setStatus('error');
      return;
    }

    setUploading(true);
    setMessage(`Processing ${files.length} file(s) and mapping columns to the database. This may take a moment...`);
    setStatus('idle');

    const formData = new FormData();
    
    // 🟢 Always append using the key "file" which FastAPI natively expects. 
    // If multiple=true is used, FastAPI will accept it as a List[UploadFile] under the "file" key.
    files.forEach((file) => {
      formData.append("file", file);
    });

    try {
      const response = await authFetch('/api/v1/nominal-roll/bulk-upload', {
        method: 'POST',
        // Note: Do NOT manually set the Content-Type header here. 
        // Our api.js correctly allows the browser to set the 'multipart/form-data' boundary automatically.
        body: formData
      });

      const data = await response.json().catch(() => ({}));

      if (response.ok) {
        setMessage(data.message || "Bulk upload completed successfully.");
        setStatus(data.status === 'warning' ? 'warning' : 'success');
        
        if (onUploadSuccess && (data.status === 'success' || data.status === 'warning')) {
          onUploadSuccess();
        }
      } else {
        setMessage(data.detail || data.message || "An error occurred during upload. Check your column headers.");
        setStatus('error');
      }
    } catch (error) {
      setMessage(`Upload error: ${error.message}`);
      setStatus('error');
    } finally {
      setUploading(false);
      setFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-4 w-full">
      {/* Upload Controls */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <input 
          ref={fileInputRef}
          type="file" 
          accept=".xlsx, .xls, .csv" 
          onChange={handleFileChange}
          disabled={uploading}
          multiple={multiple}
          className="text-xs w-full file:mr-4 file:py-2.5 file:px-4 file:rounded-md file:border-0 file:text-xs file:font-bold file:bg-blue-50 dark:file:bg-blue-900/40 file:text-blue-700 dark:file:text-blue-400 hover:file:bg-blue-100 dark:hover:file:bg-blue-800/60 border border-slate-300 dark:border-slate-700 rounded-md p-1 shadow-sm bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
        />
        
        <button
          onClick={handleUpload}
          disabled={files.length === 0 || uploading}
          className={`flex items-center justify-center px-6 py-3 text-xs font-bold text-white rounded-md shadow-sm transition-all whitespace-nowrap w-full sm:w-auto cursor-pointer ${
            files.length === 0 || uploading 
              ? 'bg-slate-400 dark:bg-slate-700 cursor-not-allowed text-slate-200 dark:text-slate-500' 
              : 'bg-blue-700 hover:bg-blue-800 hover:shadow-md dark:bg-blue-600 dark:hover:bg-blue-500'
          }`}
        >
          {uploading ? <Loader2 size={16} className="animate-spin mr-2" /> : <Upload size={16} className="mr-2" />}
          {uploading ? 'Processing Data...' : `Upload ${files.length > 1 ? `(${files.length} Files)` : 'to Database'}`}
        </button>
      </div>

      {/* Status / Message Display */}
      {message && (
        <div className={`p-4 rounded-xl border text-xs leading-relaxed font-medium shadow-sm max-h-40 overflow-y-auto custom-scrollbar break-words flex items-start transition-colors ${
          status === 'error' ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-900/50 text-red-800 dark:text-red-300' : 
          status === 'warning' ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-900/50 text-amber-800 dark:text-amber-300' : 
          status === 'success' ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-emerald-900/50 text-green-800 dark:text-emerald-300' : 
          'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-900/50 text-blue-800 dark:text-blue-300'
        }`}>
          <div className="mt-0.5 mr-2 shrink-0">
            {status === 'error' ? <AlertTriangle size={16} className="text-red-500 dark:text-red-400" /> : 
             status === 'warning' ? <AlertTriangle size={16} className="text-amber-500 dark:text-amber-400" /> : 
             status === 'success' ? <CheckCircle size={16} className="text-green-500 dark:text-emerald-400" /> : 
             <Loader2 size={16} className="text-blue-500 dark:text-blue-400 animate-spin" />}
          </div>
          <div className="flex-1 font-mono tracking-tight">{message}</div>
        </div>
      )}
    </div>
  );
};

export default BulkNominalRollUpload;