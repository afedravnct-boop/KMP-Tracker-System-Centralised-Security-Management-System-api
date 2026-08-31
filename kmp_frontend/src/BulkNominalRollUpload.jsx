import React, { useState, useRef } from 'react';
import { Upload, CheckCircle, AlertTriangle, Loader2 } from 'lucide-react';
import { authFetch } from './api';

const ReintegrationHelper = ({ skipped, onDismiss }) => {
  const [selected, setSelected] = useState([]);
  const [reason, setReason] = useState("");
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState(null);

  const toggleSelect = (fnum) => {
    if (selected.includes(fnum)) {
      setSelected(selected.filter(s => s !== fnum));
    } else {
      setSelected([...selected, fnum]);
    }
  };

  const handleRestore = async () => {
    if (selected.length === 0) return alert("Select at least one officer.");
    if (!reason.trim()) return alert("Please enter a reason for re-integration.");
    
    setProcessing(true);
    let successCount = 0;
    let failCount = 0;

    for (const fnum of selected) {
      const officerData = skipped.find(o => o.fnum === fnum);
      if (!officerData) continue;
      
      try {
        const res = await authFetch('/api/v1/nominal-roll', {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            ...officerData.payload,
            reintegration_reason: reason
          })
        });
        if (res.ok) successCount++;
        else failCount++;
      } catch (err) {
        failCount++;
      }
    }
    
    setProcessing(false);
    setResults(`Successfully re-integrated ${successCount} officers. ${failCount > 0 ? `Failed: ${failCount}` : ''}`);
  };

  if (results) {
    return (
      <div className="bg-green-100 dark:bg-green-900/40 p-3 rounded text-green-800 dark:text-green-300 mt-2">
         <p className="font-bold text-sm">{results}</p>
         <button onClick={onDismiss} className="mt-3 text-xs bg-green-200 dark:bg-green-800 px-3 py-1.5 rounded font-bold hover:bg-green-300 transition-colors cursor-pointer">
           Finish & Refresh Table
         </button>
      </div>
    );
  }

  return (
    <div className="bg-amber-100/60 dark:bg-amber-900/40 p-2.5 rounded-lg border border-amber-300 dark:border-amber-700/50">
      <div className="mb-2">
        <p className="font-bold text-red-700 dark:text-red-400 text-[12px] uppercase">
          ⚠️ {skipped.length} Officers Found In Archive
        </p>
        <p className="text-amber-900 dark:text-amber-200 text-[11px] mt-1 leading-tight mb-2">
          Select the officers you wish to immediately restore to the active roll with the new data from your Excel file.
        </p>
        <input 
          type="text" 
          placeholder="Enter re-integration reason (e.g., Station Transfer, Returned from leave)" 
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="w-full text-xs p-1.5 rounded border border-amber-300 dark:bg-slate-800 dark:border-amber-700 mb-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-amber-500"
        />
      </div>
      
      <div className="bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800 rounded p-1.5 max-h-32 overflow-y-auto custom-scrollbar mb-2">
        <ul className="space-y-1">
          {skipped.map((off, i) => (
            <li key={i} className="flex items-center space-x-2 text-[10px] font-mono font-bold text-red-800 dark:text-red-400">
              <input 
                type="checkbox" 
                checked={selected.includes(off.fnum)}
                onChange={() => toggleSelect(off.fnum)}
                className="rounded border-amber-400 text-amber-600 focus:ring-amber-500 cursor-pointer"
              />
              <span>{off.display}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex justify-between items-center px-1">
         <button 
           onClick={() => setSelected(selected.length === skipped.length ? [] : skipped.map(s => s.fnum))}
           className="text-[10px] text-amber-700 dark:text-amber-400 underline hover:text-amber-900 cursor-pointer"
         >
           {selected.length === skipped.length ? 'Deselect All' : 'Select All'}
         </button>
         
         <button 
           onClick={handleRestore}
           disabled={processing || selected.length === 0}
           className="text-[10px] bg-red-600 text-white px-3 py-1.5 rounded font-bold hover:bg-red-700 disabled:opacity-50 transition-colors cursor-pointer"
         >
           {processing ? 'Processing...' : `Re-integrate Selected (${selected.length})`}
         </button>
      </div>
    </div>
  );
};

const BulkNominalRollUpload = ({ onUploadSuccess, multiple = false }) => {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState(null);
  const [status, setStatus] = useState('idle');
  
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
    files.forEach((file) => {
      formData.append("file", file);
    });

    try {
      const response = await authFetch('/api/v1/nominal-roll/bulk-upload', {
        method: 'POST',
        body: formData
      });

      const data = await response.json().catch(() => ({}));

      if (response.ok) {
        setStatus(data.status === 'warning' ? 'warning' : 'success');
        
        const hasArchived = data.skipped && data.skipped.length > 0;
        const hasBlanks = data.skipped_blank && data.skipped_blank.length > 0;

        if (hasArchived || hasBlanks) {
          setMessage(
            <div className="flex flex-col space-y-3 w-full">
              <div className="flex justify-between items-start border-b pb-1 border-amber-300 dark:border-amber-700">
                <p className="font-bold text-amber-900 dark:text-amber-300 text-xs pr-4">{data.message}</p>
                <button 
                  onClick={() => {
                    setMessage(null);
                    if (onUploadSuccess) onUploadSuccess();
                  }} 
                  className="shrink-0 text-[10px] bg-amber-200 dark:bg-amber-800 text-amber-900 dark:text-amber-200 px-2 py-1 rounded font-bold hover:bg-amber-300 cursor-pointer transition-colors"
                >
                  Dismiss & Refresh
                </button>
              </div>
              
              {hasArchived && (
                <ReintegrationHelper 
                  skipped={data.skipped} 
                  onDismiss={() => {
                    setMessage(null);
                    if (onUploadSuccess) onUploadSuccess();
                  }} 
                />
              )}

              {hasBlanks && (
                <div className="bg-slate-100 dark:bg-slate-800 p-2.5 rounded-lg border border-slate-300 dark:border-slate-600">
                  <p className="font-bold text-slate-700 dark:text-slate-300 text-[11px] mb-1">🚫 {data.skipped_blank.length} ROWS REJECTED (Missing Identifiers):</p>
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded p-1.5 max-h-24 overflow-y-auto custom-scrollbar">
                    <ul className="list-disc pl-4 space-y-0.5 text-slate-800 dark:text-slate-400 text-[10px] font-mono">
                      {data.skipped_blank.slice(0, 15).map((row, i) => <li key={i}>{row}</li>)}
                      {data.skipped_blank.length > 15 && <li className="italic text-slate-500">...and {data.skipped_blank.length - 15} more.</li>}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          );
        } else {
          setMessage(data.message || "Bulk upload completed successfully.");
          if (onUploadSuccess) {
            onUploadSuccess();
          }
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

      {message && (
        <div className={`p-4 rounded-xl border text-xs leading-relaxed font-medium shadow-sm max-h-48 overflow-y-auto custom-scrollbar break-words flex items-start transition-colors ${
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