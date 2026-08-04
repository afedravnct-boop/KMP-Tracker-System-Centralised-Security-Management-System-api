import React, { useState } from 'react';

const WordReportUpload = ({ currentUser }) => {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
    setFeedback(null);
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file) return alert("Please select a Word (.docx) report file first.");

    const formData = new FormData();
    formData.append("file", file);

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

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6 font-sans">
      
      {/* Header Bar */}
      <div className="bg-slate-900 text-white px-6 py-4 rounded-xl shadow-md flex justify-between items-center">
        <div>
          <h2 className="text-lg font-extrabold uppercase tracking-wider">Tripartite Report Ingestion & Template Hub</h2>
          <p className="text-xs text-slate-400 mt-0.5">Upload standardized 3-format returns and download official templates.</p>
        </div>
        <span className="bg-blue-600 text-white text-xs px-3 py-1 rounded-lg font-mono">
          Secure Command Portal
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Left 2 Cols: 3-Format Upload Portal */}
        <div className="md:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <h3 className="font-extrabold text-sm text-slate-900 uppercase">Upload 3-Format Weekly Return (.docx)</h3>
            <p className="text-xs text-slate-500 mt-1">
              Your submission will automatically parse and segregate into:
            </p>
            <ul className="text-xs text-slate-600 list-disc list-inside mt-2 space-y-1 font-medium">
              <li><strong className="text-slate-800">Format 1:</strong> Full report archive with regional incident tables.</li>
              <li><strong className="text-slate-800">Format 2:</strong> Summary matrix of serious cases reported.</li>
              <li><strong className="text-slate-800">Format 3:</strong> Weekly disruptive operations arrest & court statistics.</li>
            </ul>
          </div>

          <form onSubmit={handleUpload} className="space-y-4">
            <div className="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center bg-slate-50 hover:bg-slate-100/50 transition">
              <input 
                type="file" 
                accept=".docx" 
                onChange={handleFileChange} 
                className="block w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-blue-700 file:text-white hover:file:bg-blue-800 cursor-pointer"
              />
            </div>

            {file && (
              <div className="text-xs font-mono text-slate-700 bg-blue-50 p-3 rounded-lg border border-blue-200 flex justify-between items-center">
                <span>Selected: <strong>{file.name}</strong></span>
                <span className="text-slate-400">{Math.round(file.size / 1024)} KB</span>
              </div>
            )}

            {feedback && (
              <div className={`p-4 rounded-xl text-xs font-bold ${feedback.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                {feedback.message}
              </div>
            )}

            <button 
              type="submit" 
              disabled={!file || uploading}
              className="w-full py-3 bg-blue-700 hover:bg-blue-800 disabled:bg-slate-300 text-white font-bold rounded-xl shadow-md text-xs uppercase tracking-wider transition"
            >
              {uploading ? 'Parsing & Compiling 3-Format Returns...' : 'Submit & Compile Report'}
            </button>
          </form>
        </div>

        {/* Right Col: Template & Assignment Download Hub */}
        <div className="space-y-6">
          
          {/* Report Templates Card */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
            <h3 className="font-extrabold text-sm text-slate-900 uppercase border-b border-slate-100 pb-3">Report Templates</h3>
            <p className="text-xs text-slate-500">Download official standardized formatting templates to ensure compliance.</p>
            
            <button 
              onClick={() => downloadTemplate('weekly-report')}
              className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl text-xs text-left flex justify-between items-center transition border border-slate-200"
            >
              <span>Weekly Report Return Template</span>
              <span className="font-mono text-blue-600 text-[10px] bg-white px-2 py-1 rounded border">.DOCX</span>
            </button>
          </div>

          {/* Assignment Templates Slot Card */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
            <h3 className="font-extrabold text-sm text-slate-900 uppercase border-b border-slate-100 pb-3">Assignment Templates</h3>
            <p className="text-xs text-slate-500">Download operational deployment and task assignment directive sheets.</p>
            
            <button 
              onClick={() => downloadTemplate('assignment')}
              className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl text-xs text-left flex justify-between items-center transition border border-slate-200"
            >
              <span>Task Assignment Template</span>
              <span className="font-mono text-emerald-600 text-[10px] bg-white px-2 py-1 rounded border">.DOCX</span>
            </button>
          </div>

        </div>

      </div>
    </div>
  );
};

export default WordReportUpload;