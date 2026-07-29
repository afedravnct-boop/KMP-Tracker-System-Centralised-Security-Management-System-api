import React, { useState } from 'react';
import { Upload, AlertCircle, CheckCircle } from 'lucide-react';


const BulkNominalRollUpload = ({ onUploadSuccess }) => {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
      setFeedback(null); // Clear previous messages
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setFeedback(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const token = localStorage.getItem("token") || sessionStorage.getItem("token");

      const response = await fetch("http://localhost:8000/api/v1/nominal-roll/bulk-upload", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`
        },
        body: formData,
      });

      const data = await response.json();

      if (response.ok) {
        setFeedback({ type: "success", message: data.message });
        setFile(null); // Reset the selected file
        if (onUploadSuccess) onUploadSuccess(); // Refresh the nominal roll table instantly
      } else {
        setFeedback({ type: "error", message: data.detail || "Upload failed." });
      }
    } catch (error) {
      console.error("Bulk upload error:", error);
      setFeedback({ type: "error", message: "Network error. Make sure the backend server is running." });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 mb-6">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        
        {/* Left Side: Info */}
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="bg-blue-100 p-2 rounded-lg text-blue-700">
            <Upload size={24} />
          </div>
          <div>
            <h3 className="font-bold text-gray-800 text-sm">Bulk Excel Nominal Roll Import</h3>
            <p className="text-xs text-gray-500">Upload legacy .xlsx or .xls spreadsheets to batch-import personnel into NeonDB.</p>
          </div>
        </div>

        {/* Right Side: Inputs & Buttons */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <input
            type="file"
            accept=".xlsx, .xls"
            onChange={handleFileChange}
            id="nominal-excel-upload"
            className="hidden"
            disabled={uploading}
          />
          <label
            htmlFor="nominal-excel-upload"
            className={`px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium cursor-pointer transition-colors truncate max-w-[200px] sm:max-w-xs ${
              file ? 'bg-blue-50 text-blue-700 border-blue-300' : 'bg-white text-gray-700 hover:bg-gray-50'
            } ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {file ? file.name : "Select Excel File"}
          </label>

          <button
            onClick={handleUpload}
            disabled={!file || uploading}
            className="flex items-center gap-2 bg-blue-700 hover:bg-blue-800 text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed shadow-sm whitespace-nowrap"
          >
            {uploading ? (
              <>
                <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                Processing...
              </>
            ) : (
              <>
                <Upload size={16} />
                Upload Data
              </>
            )}
          </button>
        </div>
      </div>

      {/* Feedback Message */}
      {feedback && (
        <div className={`mt-3 p-3 rounded-lg text-sm flex items-center gap-2 font-medium ${
          feedback.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'
        }`}>
          {feedback.type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
          {feedback.message}
        </div>
      )}
    </div>
  );
};

export default BulkNominalRollUpload;