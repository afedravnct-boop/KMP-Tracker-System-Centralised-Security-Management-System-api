import React from 'react';

export default function RegistryTable({ activeTab, user, reports, nominalRolls, establishments }) {
  
  // RENDER TABLE BASED ON ACTIVE TAB
  const renderTable = () => {
    switch (activeTab) {
      case "Page1": // Crime Registry
        return (
          <>
            <h3>📋 Crime/Incident Registry Ledger</h3>
            <table className="kmp-table">
              <thead>
                <tr>
                  <th>SN</th>
                  <th>Date</th>
                  <th>Region/Station</th>
                  <th>Offence</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((row) => (
                  <tr key={row.sn}>
                    <td>{row.sn}</td>
                    <td>{row.date}</td>
                    <td>{row.region} - {row.station}</td>
                    <td>{row.offence}</td>
                    <td><span className="status-badge">{row.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        );

      case "Page5": // Nominal Roll
        return (
          <>
            <h3>👥 Personnel Nominal Roll</h3>
            <table className="kmp-table">
              <thead>
                <tr>
                  <th>F/No.</th>
                  <th>Rank</th>
                  <th>Name</th>
                  <th>Station</th>
                </tr>
              </thead>
              <tbody>
                {nominalRolls.map((row) => (
                  <tr key={row.sn}>
                    <td>{row.f_num}</td>
                    <td>{row.rank}</td>
                    <td>{row.name}</td>
                    <td>{row.station}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        );

      default:
        return <p>Select a module to view records.</p>;
    }
  };

  return (
    <div className="table-container">
      {renderTable()}
    </div>
  );
}