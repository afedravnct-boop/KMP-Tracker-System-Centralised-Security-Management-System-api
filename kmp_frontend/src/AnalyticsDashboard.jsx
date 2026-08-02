import React, { useState, useMemo } from 'react';

const AnalyticsDashboard = ({ nominalRolls = [], crimeRegistry = [], successStories = [], operationalStats = [] }) => {
  const [activeDomain, setActiveDomain] = useState('CRIME'); // 'CRIME' | 'PERSONNEL' | 'SUCCESS' | 'OPERATIONS'
  const [metricCategory, setMetricCategory] = useState('CATEGORY');

  // 1. Dataset & Aggregator Resolver based on Domain and Grouping
  const currentDataset = useMemo(() => {
    if (activeDomain === 'CRIME') return crimeRegistry;
    if (activeDomain === 'PERSONNEL') return nominalRolls;
    if (activeDomain === 'SUCCESS') return successStories;
    if (activeDomain === 'OPERATIONS') return operationalStats;
    return [];
  }, [activeDomain, crimeRegistry, nominalRolls, successStories, operationalStats]);

  const aggregatedData = useMemo(() => {
    const grouped = {};
    
    currentDataset.forEach(item => {
      let key = 'UNCLASSIFIED';
      
      if (activeDomain === 'CRIME') {
        if (metricCategory === 'CATEGORY') key = (item.crime_category || item.offence || 'GENERAL CRIME').toUpperCase();
        else if (metricCategory === 'CASES') key = (item.status || 'PENDING').toUpperCase();
        else if (metricCategory === 'ARRESTS') key = String(item.suspects || item.arrested || '0').toUpperCase();
        else if (metricCategory === 'CONVICTIONS') key = String(item.convicted || '0').toUpperCase();
        else if (metricCategory === 'CONCLUDED') key = (item.status === 'CONCLUDED' || item.status === 'COMPLETED' ? 'CONCLUDED' : 'PENDING / IN PROGRESS').toUpperCase();
        else if (metricCategory === 'STATION') key = (item.station || 'UNKNOWN STATION').toUpperCase();
      } 
      else if (activeDomain === 'PERSONNEL') {
        if (metricCategory === 'RANK') key = (item.rank || 'UNRANKED').toUpperCase();
        else if (metricCategory === 'UNIT') key = (item.station || 'UNKNOWN').toUpperCase();
        else if (metricCategory === 'DISTRICT') key = (item.homedist || item.home_dist || 'UNKNOWN').toUpperCase();
        else if (metricCategory === 'AGE') {
          const dob = item.dob;
          if (dob) {
            const birthYear = new Date(dob).getFullYear();
            const age = new Date().getFullYear() - birthYear;
            if (age < 25) key = 'UNDER 25 YRS';
            else if (age <= 35) key = '25 - 35 YRS';
            else if (age <= 45) key = '36 - 45 YRS';
            else key = 'ABOVE 45 YRS';
          } else {
            key = 'UNKNOWN AGE';
          }
        }
        else if (metricCategory === 'SEX') key = (item.sex || 'UNSPECIFIED').toUpperCase();
        else if (metricCategory === 'DIR') key = (item.dir || 'GENERAL DIRECTORATE').toUpperCase();
        else if (metricCategory === 'SECTION') key = (item.section || 'GENERAL SECTION').toUpperCase();
      }
      else if (activeDomain === 'SUCCESS') {
        if (metricCategory === 'CATEGORY') key = (item.impact_type || item.category || 'COMMUNITY RECOVERY').toUpperCase();
        else if (metricCategory === 'STATUS') key = (item.status || 'COMPLETED').toUpperCase();
        else if (metricCategory === 'STATION') key = (item.station || 'UNKNOWN STATION').toUpperCase();
      }
      else if (activeDomain === 'OPERATIONS') {
        if (metricCategory === 'CATEGORY') key = (item.operation_type || item.outcome || 'STANDARD DEPLOYMENT').toUpperCase();
        else if (metricCategory === 'STATION') key = (item.station || 'UNKNOWN STATION').toUpperCase();
      }

      if (!grouped[key]) grouped[key] = { label: key, count: 0 };
      grouped[key].count += 1;
    });

    return Object.values(grouped).sort((a, b) => b.count - a.count);
  }, [currentDataset, activeDomain, metricCategory]);

  const totalRecords = useMemo(() => aggregatedData.reduce((acc, curr) => acc + curr.count, 0), [aggregatedData]);

  // 2. Secure Enterprise Encrypted Download Handler
  const handleExportExcel = async () => {
    try {
      const token = localStorage.getItem('kmp_authToken');
      const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
      
      const exportUrl = `${API_URL}/api/v1/analytics/export?domain=${activeDomain}&category=${metricCategory}`;
      
      const response = await fetch(exportUrl, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) {
        throw new Error("Server rejected secure export clearance.");
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.style.display = 'none';
      link.href = downloadUrl;
      link.download = `KMP_Secure_Analytics_${activeDomain}_${new Date().toISOString().split('T')[0]}.zip`;
      
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        document.body.removeChild(link);
        window.URL.revokeObjectURL(downloadUrl);
      }, 2000);

      alert("🔒 Secure Analytics Report Downloaded Successfully!\n\nNote: The ZIP file is AES-encrypted. Unzip using your official Force Number (F/No) as the password.");

    } catch (error) {
      console.error("Secure Export Error:", error);
      alert(`Export Failed: ${error.message}`);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 animate-in fade-in duration-300 font-sans">
      
      {/* HEADER & EXPORT BUTTON */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-200 gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">KMP Command Analytics Dashboard</h1>
          <p className="text-xs text-slate-500 mt-1 font-medium">Real-time cross-tabulation, visual metrics, and exportable data intelligence.</p>
        </div>
        <button 
          onClick={handleExportExcel}
          className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl font-bold text-xs shadow-md transition flex items-center space-x-2 cursor-pointer"
        >
          <span>📥 Download Analytics Report (Excel/CSV)</span>
        </button>
      </div>

      {/* DOMAIN SWITCHER TABS */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { id: 'CRIME', label: '📊 Crime Incident Registry' },
          { id: 'PERSONNEL', label: '🛡️ Personnel & Nominal Roll' },
          { id: 'SUCCESS', label: '🌟 Success Stories' },
          { id: 'OPERATIONS', label: '⚡ Operational Statistics' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => { setActiveDomain(tab.id); setMetricCategory('CATEGORY'); }}
            className={`p-4 rounded-xl font-bold text-xs transition border text-left shadow-sm cursor-pointer ${
              activeDomain === tab.id 
                ? 'bg-slate-900 text-white border-slate-900' 
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* SUB-CATEGORY FILTER BAR */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <span className="text-xs font-bold text-slate-500 uppercase">Group By:</span>
          <select 
            value={metricCategory}
            onChange={e => setMetricCategory(e.target.value)}
            className="border border-slate-300 rounded-lg p-2 text-xs font-bold text-slate-800 bg-white outline-none cursor-pointer"
          >
            {activeDomain === 'CRIME' && (
              <>
                <option value="CATEGORY">Crime Category / Offence</option>
                <option value="CASES">Cases Reported / Case Status</option>
                <option value="ARRESTS">Offenders Arrested</option>
                <option value="CONVICTIONS">Offenders Convicted</option>
                <option value="CONCLUDED">Cases investigated to conclusion</option>
                <option value="STATION">Police Station</option>
              </>
            )}
            {activeDomain === 'PERSONNEL' && (
              <>
                <option value="RANK">Officer Rank</option>
                <option value="UNIT">Station / Unit</option>
                <option value="DISTRICT">Home District</option>
                <option value="AGE">Age</option>
                <option value="SEX">Sex</option>
                <option value="DIR">Directorate</option>
                <option value="SECTION">Section</option>
              </>
            )}
            {activeDomain === 'SUCCESS' && (
              <>
                <option value="CATEGORY">Success Impact Type</option>
                <option value="STATUS">Status</option>
                <option value="STATION">Police Station</option>
              </>
            )}
            {activeDomain === 'OPERATIONS' && (
              <>
                <option value="CATEGORY">Deployment / Outcome Type</option>
                <option value="STATION">Police Station</option>
              </>
            )}
          </select>
        </div>
        <span className="text-xs font-extrabold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-100">
          Total Analyzed Entries: {totalRecords}
        </span>
      </div>

      {/* VISUAL CHARTS & BREAKDOWN GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* BAR GRAPH VIEW */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Comparative Bar Graph ({metricCategory})</h3>
          <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
            {aggregatedData.map((item, idx) => {
              const percentage = totalRecords > 0 ? (item.count / totalRecords) * 100 : 0;
              return (
                <div key={idx} className="space-y-1">
                  <div className="flex justify-between text-xs font-bold text-slate-700">
                    <span>{item.label}</span>
                    <span className="text-blue-600">{item.count} ({percentage.toFixed(1)}%)</span>
                  </div>
                  <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden">
                    <div 
                      className="bg-blue-600 h-full rounded-full transition-all duration-500" 
                      style={{ width: `${Math.max(percentage, 2)}%` }}
                    ></div>
                  </div>
                </div>
              );
            })}
            {aggregatedData.length === 0 && (
              <div className="p-8 text-center text-slate-400 text-xs">No records available for analysis in this view.</div>
            )}
          </div>
        </div>

        {/* STRUCTURED DATA TABLE VIEW */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide mb-4">Statistical Distribution Breakdown ({activeDomain})</h3>
            <div className="border border-slate-100 rounded-xl overflow-hidden max-h-[340px] overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-700 uppercase font-bold sticky top-0 border-b border-slate-200">
                  <tr>
                    <th className="p-3">{metricCategory.replace('_', ' ')} Attribute</th>
                    <th className="p-3 text-right">Frequency</th>
                    <th className="p-3 text-right">Share (%)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-600">
                  {aggregatedData.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="p-3 uppercase text-slate-800 font-semibold">{item.label}</td>
                      <td className="p-3 text-right font-extrabold text-blue-600">{item.count}</td>
                      <td className="p-3 text-right">{totalRecords > 0 ? ((item.count / totalRecords) * 100).toFixed(1) : 0}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          
          <div className="pt-4 text-center border-t border-slate-100 mt-4">
            <p className="text-[11px] text-slate-400 font-medium">Data compiled securely by KMP Centralised Security Data Management System.</p>
          </div>
        </div>

      </div>

    </div>
  );
};

export default AnalyticsDashboard;