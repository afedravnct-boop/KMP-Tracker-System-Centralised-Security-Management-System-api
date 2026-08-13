import React, { useState, useRef } from 'react';
import { Upload, CheckCircle, AlertTriangle, Loader2 } from 'lucide-react';

const BulkNominalRollUpload = ({ onUploadSuccess }) => {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState(null);
  const [status, setStatus] = useState('idle'); // 'idle', 'success', 'warning', 'error'
  
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      setMessage(null);
      setStatus('idle');
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setMessage("Please select a valid Excel or CSV file first.");
      setStatus('error');
      return;
    }

    setUploading(true);
    setMessage("Processing file and mapping columns to the database. This may take a moment...");
    setStatus('idle');

    const formData = new FormData();
    formData.append("file", file);

    try {
      const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
      const token = localStorage.getItem('kmp_authToken');

      const response = await fetch(`${API_URL}/api/v1/nominal-roll/bulk-upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      // 🟢 Intercept expired sessions globally
      if (response.status === 401) {
        window.dispatchEvent(new Event('auth-expired'));
        return;
      }

      const data = await response.json();

      if (response.ok) {
        setMessage(data.message || "Upload completed.");
        setStatus(data.status === 'warning' ? 'warning' : 'success');
        
        // Trigger parent refresh if data was actually added/updated
        if (onUploadSuccess && (data.status === 'success' || data.status === 'warning')) {
          onUploadSuccess();
        }
      } else {
        setMessage(data.detail || data.message || "An error occurred during upload.");
        setStatus('error');
      }
    } catch (error) {
      setMessage(`Network error: ${error.message}`);
      setStatus('error');
    } finally {
      setUploading(false);
      setFile(null);
      // Reset the file input visually
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
          className="text-xs w-full file:mr-4 file:py-2.5 file:px-4 file:rounded-md file:border-0 file:text-xs file:font-bold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 border border-slate-300 rounded-md p-1 shadow-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        />
        
        <button
          onClick={handleUpload}
          disabled={!file || uploading}
          className={`flex items-center justify-center px-6 py-3 text-xs font-bold text-white rounded-md shadow-sm transition-all whitespace-nowrap w-full sm:w-auto ${
            !file || uploading 
              ? 'bg-slate-400 cursor-not-allowed' 
              : 'bg-blue-700 hover:bg-blue-800 hover:shadow-md'
          }`}
        >
          {uploading ? <Loader2 size={16} className="animate-spin mr-2" /> : <Upload size={16} className="mr-2" />}
          {uploading ? 'Processing Data...' : 'Upload to Database'}
        </button>
      </div>

      {/* 🟢 THE GREEN SPILLOVER FIX (Scrollable, break-words, max-height) */}
      {message && (
        <div className={`p-4 rounded-xl border text-xs leading-relaxed font-medium shadow-sm max-h-40 overflow-y-auto custom-scrollbar break-words flex items-start ${
          status === 'error' ? 'bg-red-50 border-red-200 text-red-800' : 
          status === 'warning' ? 'bg-amber-50 border-amber-200 text-amber-800' :
          status === 'success' ? 'bg-green-50 border-green-200 text-green-800' :
          'bg-blue-50 border-blue-200 text-blue-800'
        }`}>
          <div className="mt-0.5 mr-2 shrink-0">
            {status === 'error' ? <AlertTriangle size={16} className="text-red-500" /> : 
             status === 'warning' ? <AlertTriangle size={16} className="text-amber-500" /> :
             status === 'success' ? <CheckCircle size={16} className="text-green-500" /> :
             <Loader2 size={16} className="text-blue-500 animate-spin" />}
          </div>
          <div className="flex-1 font-mono tracking-tight">{message}</div>
        </div>
      )}

    </div>
  );
};

export default BulkNominalRollUpload;