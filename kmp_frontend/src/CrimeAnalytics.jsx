import React, { useState, useEffect } from 'react';
export default function CrimeAnalytics() {
  const [reports, setReports] = useState([]);
  const [timeFilter, setTimeFilter] = useState("all"); // 'all', 'today', 'week'
  const [locationType, setLocationType] = useState("region"); // 'region', 'station'
  const [locationValue, setLocationValue] = useState("ALL");

  // Fetch the data when the component loads
  useEffect(() => {
    authFetch("/api/v1/reports") // Matches your api_backend.py route
      .then(res => res.json())
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
  }));

  const grandTotal = summaryData.reduce((sum, item) => sum + item.total, 0);

  // Get unique locations based on your backend fields
  const uniqueLocations = [...new Set(reports.map(r => r[locationType]).filter(Boolean))];

  return (
    <div className="analytics-container" style={{ padding: "20px", backgroundColor: "white", borderRadius: "8px" }}>
      <h2 style={{ color: "#0B2147", borderBottom: "2px solid #ccc", paddingBottom: "10px" }}>
        Crime Incident Summary
      </h2>

      {/* FILTER CONTROLS */}
      <div className="filters" style={{ display: "flex", gap: "15px", margin: "20px 0" }}>
        <select value={timeFilter} onChange={(e) => setTimeFilter(e.target.value)} style={{ padding: "8px" }}>
          <option value="all">All Time</option>
          <option value="today">Today</option>
          <option value="week">Past 7 Days</option>
        </select>

        <select value={locationType} onChange={(e) => {
            setLocationType(e.target.value);
            setLocationValue("ALL");
          }} style={{ padding: "8px" }}>
          <option value="region">Filter by Region</option>
          <option value="station">Filter by Station</option>
        </select>

        <select value={locationValue} onChange={(e) => setLocationValue(e.target.value)} style={{ padding: "8px" }}>
          <option value="ALL">All {locationType}s</option>
          {uniqueLocations.map(loc => (
            <option key={loc} value={loc}>{loc}</option>
          ))}
        </select>
      </div>

      {/* SUMMARY TABLE */}
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "20px" }}>
        <thead>
          <tr style={{ backgroundColor: "#0B2147", color: "white", textAlign: "left" }}>
            <th style={{ padding: "12px", border: "1px solid #ddd" }}>SN</th>
            <th style={{ padding: "12px", border: "1px solid #ddd" }}>Incident / Offence</th>
            <th style={{ padding: "12px", border: "1px solid #ddd" }}>Total Reported</th>
          </tr>
        </thead>
        <tbody>
          {summaryData.length > 0 ? (
            summaryData.map((row) => (
              <tr key={row.sn}>
                <td style={{ padding: "12px", border: "1px solid #ddd" }}>{row.sn}</td>
                <td style={{ padding: "12px", border: "1px solid #ddd" }}>{row.incident}</td>
                <td style={{ padding: "12px", border: "1px solid #ddd", fontWeight: "bold" }}>{row.total}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan="3" style={{ padding: "12px", textAlign: "center", border: "1px solid #ddd" }}>
                No crimes reported for these filters.
              </td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr style={{ backgroundColor: "#f1f1f1", fontWeight: "bold", fontSize: "1.1em" }}>
            <td colSpan="2" style={{ padding: "12px", textAlign: "right", border: "1px solid #ddd" }}>
              GRAND TOTAL:
            </td>
            <td style={{ padding: "12px", border: "1px solid #ddd", color: "darkred" }}>
              {grandTotal}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}