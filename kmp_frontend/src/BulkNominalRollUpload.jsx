import React, { useState } from 'react';
import { FileSpreadsheet, CheckCircle, AlertTriangle, X } from 'lucide-react';

const BulkNominalRollUpload = ({ onUploadSuccess }) => {
  const [file, setFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState(null);
  const [isError, setIsError] = useState(false);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile && (selectedFile.name.endsWith('.xlsx') || selectedFile.name.endsWith('.xls'))) {
      setFile(selectedFile);
      setMessage(null);
      setIsError(false);
    } else {
      setFile(null);
      setIsError(true);
      setMessage("Please select a valid Excel file (.xlsx or .xls)");
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    
    setIsUploading(true);
    setMessage("⏳ Processing Excel file. This may take a minute...");
    setIsError(false);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
      const token = localStorage.getItem('kmp_authToken');

      // 🟢 NOTICE: No 'Content-Type' header here! The browser handles it.
      const response = await fetch(`${API_URL}/api/v1/nominal-roll/bulk-upload`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`
        },
        body: formData
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Server failed to process the file.");
      }

      setIsError(false);
      setMessage(`✅ ${data.message}`);
      setFile(null);
      
      document.getElementById('excel-upload-input').value = "";
      
      if (onUploadSuccess) {
        setTimeout(onUploadSuccess, 2500);
      }

    } catch (err) {
      console.error(err);
      setIsError(true);
      setMessage(err.message === 'Failed to fetch' 
        ? "❌ Network error: Backend server is offline or blocking the connection." 
        : `❌ Error: ${err.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg mt-4">
      {message && (
        <div className={`p-3 mb-4 rounded flex items-center text-sm font-bold ${isError ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
          {isError ? <AlertTriangle size={16} className="mr-2 shrink-0"/> : <CheckCircle size={16} className="mr-2 shrink-0"/>}
          {message}
        </div>
      )}

      <div className="flex items-center space-x-4">
        <label className={`flex-1 flex flex-col items-center justify-center p-4 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${file ? 'border-green-400 bg-green-50' : 'border-blue-300 bg-white hover:bg-blue-100'}`}>
          <FileSpreadsheet size={28} className={file ? "text-green-600 mb-2" : "text-blue-500 mb-2"} />
          <span className="text-xs font-bold text-slate-700 text-center">
            {file ? file.name : "Click to select Master Excel File (.xlsx)"}
          </span>
          <input 
            id="excel-upload-input"
            type="file" 
            accept=".xlsx, .xls" 
            onChange={handleFileChange} 
            className="hidden" 
          />
        </label>

        {file && (
          <button 
            onClick={handleUpload}
            disabled={isUploading}
            className="bg-blue-700 hover:bg-blue-800 disabled:bg-slate-400 text-white font-bold py-4 px-6 rounded-lg shadow-md transition-colors h-full flex items-center shrink-0"
          >
            {isUploading ? 'Uploading...' : 'Execute Import'}
          </button>
        )}
      </div>
    </div>
  );
};

export default BulkNominalRollUpload;