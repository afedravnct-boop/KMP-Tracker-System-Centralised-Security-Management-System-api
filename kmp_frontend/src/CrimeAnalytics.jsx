import React, { useState, useEffect } from 'react';

export default function CrimeAnalytics() {
  const [reports, setReports] = useState([]);
  const [timeFilter, setTimeFilter] = useState("all"); // 'all', 'today', 'week'
  const [locationType, setLocationType] = useState("region"); // 'region', 'station'
  const [locationValue, setLocationValue] = useState("ALL");

  // Fetch the data securely when the component loads
  useEffect(() => {
    const token = localStorage.getItem('kmp_authToken');
    const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

    fetch(`${API_URL}/api/v1/reports`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => {
        if (!res.ok) throw new Error("Failed to authenticate");
        return res.json();
      })
      .then(data => setReports(data))
      .catch(err => console.error("Failed to fetch reports:", err));
  }, []);

  // 1. FILTERING LOGIC
  const filteredReports = reports.filter(report => {
    // Time Filtering
    if (timeFilter !== "all") {
      const reportDate = new Date(report.date);
      const today = new Date();
      if (timeFilter === "today") {
        if (reportDate.toDateString() !== today.toDateString()) return false;
      } else if (timeFilter === "week") {
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(today.getDate() - 7);
        if (reportDate < oneWeekAgo) return false;
      }
    }

    // Location Filtering
    if (locationValue !== "ALL") {
      // Matches the specific region or station field
      if (report[locationType] !== locationValue) return false;
    }

    return true;
  });

  // 2. GROUPING LOGIC (Using 'offence' key from your backend)
  const crimeCounts = {};
  filteredReports.forEach(report => {
    const crimeName = report.offence || "Unspecified"; // Backend model key
    
    if (crimeCounts[crimeName]) {
      crimeCounts[crimeName] += 1;
    } else {
      crimeCounts[crimeName] = 1;
    }
  });

  // Convert the grouped object back into an array
  const summaryData = Object.keys(crimeCounts).map((crimeName, index) => ({
    sn: index + 1,
    incident: crimeName,
    total: crimeCounts[crimeName]
  })).sort((a, b) => b.total - a.total); // Sorted by highest frequency

  const grandTotal = summaryData.reduce((sum, item) => sum + item.total, 0);

  // Get unique locations based on your backend fields
  const uniqueLocations = [...new Set(reports.map(r => r[locationType]).filter(Boolean))].sort();

  return (
    <div className="p-6 bg-white rounded-xl shadow-sm border border-slate-200 animate-in fade-in duration-300 font-sans">
      <h2 className="text-xl font-extrabold text-slate-900 border-b border-slate-200 pb-3 mb-6">
        Standalone Crime Incident Summary
      </h2>

      {/* FILTER CONTROLS */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="flex-1">
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Timeframe</label>
          <select 
            value={timeFilter} 
            onChange={(e) => setTimeFilter(e.target.value)} 
            className="w-full p-2.5 border border-slate-300 rounded-lg text-sm font-bold text-slate-700 outline-none focus:border-blue-500 cursor-pointer"
          >
            <option value="all">All Time</option>
            <option value="today">Today Only</option>
            <option value="week">Past 7 Days</option>
          </select>
        </div>

        <div className="flex-1">
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Geography Type</label>
          <select 
            value={locationType} 
            onChange={(e) => {
              setLocationType(e.target.value);
              setLocationValue("ALL");
            }} 
            className="w-full p-2.5 border border-slate-300 rounded-lg text-sm font-bold text-slate-700 outline-none focus:border-blue-500 cursor-pointer"
          >
            <option value="region">Filter by Region</option>
            <option value="station">Filter by Station</option>
          </select>
        </div>

        <div className="flex-1">
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Specific Location</label>
          <select 
            value={locationValue} 
            onChange={(e) => setLocationValue(e.target.value)} 
            className="w-full p-2.5 border border-slate-300 rounded-lg text-sm font-bold text-slate-700 outline-none focus:border-blue-500 cursor-pointer"
          >
            <option value="ALL">All {locationType === 'region' ? 'Regions' : 'Stations'}</option>
            {uniqueLocations.map(loc => (
              <option key={loc} value={loc}>{loc}</option>
            ))}
          </select>
        </div>
      </div>

      {/* SUMMARY TABLE */}
      <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <table className="min-w-full divide-y divide-gray-200 table-auto">
          <thead className="bg-slate-900">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider w-16">SN</th>
              <th className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider">Incident / Offence</th>
              <th className="px-4 py-3 text-right text-xs font-bold text-white uppercase tracking-wider">Total Reported</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-100">
            {summaryData.length > 0 ? (
              summaryData.map((row) => (
                <tr key={row.sn} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 text-sm font-bold text-slate-500">{row.sn}</td>
                  <td className="px-4 py-3 text-sm font-bold text-slate-800 uppercase">{row.incident}</td>
                  <td className="px-4 py-3 text-sm font-extrabold text-blue-600 text-right">{row.total}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="3" className="px-4 py-8 text-center text-sm text-slate-500 font-medium">
                  No crimes reported for these specific filters.
                </td>
              </tr>
            )}
          </tbody>
          {summaryData.length > 0 && (
            <tfoot className="bg-slate-100 border-t-2 border-slate-300">
              <tr>
                <td colSpan="2" className="px-4 py-3 text-right text-sm font-extrabold text-slate-700 uppercase">
                  Grand Total
                </td>
                <td className="px-4 py-3 text-right text-base font-extrabold text-red-600">
                  {grandTotal}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}