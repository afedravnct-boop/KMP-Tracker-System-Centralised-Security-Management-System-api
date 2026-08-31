import React from 'react';
import './index.css';

export default function RegistryTable({ activeTab, user, reports = [], nominalRolls = [], establishments = [] }) {
  
  // RENDER TABLE BASED ON ACTIVE TAB
  const renderTable = () => {
    switch (activeTab) {
      case "Page1": // Crime Registry
        return (
          <>
            <h3>📋 Crime/Incident Registry Ledger</h3>
            <div className="table-responsive">
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
                  {reports.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="empty-table-msg">No crime records available.</td>
                    </tr>
                  ) : (
                    reports.map((row) => (
                      <tr key={row.sn || row.id}>
                        <td>{row.sn || row.id}</td>
                        <td>{row.date}</td>
                        <td>{row.region} - {row.station}</td>
                        <td>{row.offence}</td>
                        <td><span className="status-badge">{row.status}</span></td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        );

      case "Page4": // Regional Establishments
        return (
          <>
            <h3>🏢 Regional Establishments Ledger</h3>
            <div className="table-responsive">
              <table className="kmp-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Division</th>
                    <th>Station</th>
                    <th>Personnel (Stn)</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {establishments.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="empty-table-msg">No establishment records available.</td>
                    </tr>
                  ) : (
                    establishments.map((row) => (
                      <tr key={row.id || row.sn}>
                        <td>{row.id || row.sn}</td>
                        <td>{row.division}</td>
                        <td>{row.station}</td>
                        <td>{row.personnel_in_station || 0}</td>
                        <td><span className="status-badge">{row.status || 'OPERATIONAL'}</span></td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        );

      case "Page5": // Nominal Roll
        return (
          <>
            <h3>👥 Personnel Nominal Roll</h3>
            <div className="table-responsive">
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
                  {nominalRolls.length === 0 ? (
                    <tr>
                      <td colSpan="4" className="empty-table-msg">No personnel records found.</td>
                    </tr>
                  ) : (
                    nominalRolls.map((row) => (
                      <tr key={row.sn || row.id || row.f_num || row.fnum}>
                        <td>{row.f_num || row.fnum}</td>
                        <td>{row.rank}</td>
                        <td>{row.name}</td>
                        <td>{row.station}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        );

      default:
        return <p className="default-tab-msg">Select an active module tab to view system records.</p>;
    }
  };

  return (
    <div className="table-container">
      {renderTable()}
    </div>
  );
}