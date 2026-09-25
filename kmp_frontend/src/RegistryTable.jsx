import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Filter } from 'lucide-react';
import './index.css';

const REGIONAL_HIERARCHY = {
  "KMP NORTH": ["KMP NORTH HEADQUARTERS", "KAWEMPE", "KAKIRI", "KASANGATI", "MATUGGA", "NANSANA", "OLD KAMPALA", "WAKISO", "WANDEGEYA"],
  "KMP EAST": ["KMP EAST HEADQUARTERS", "JINJA ROAD", "KIRA", "KIRA DIV", "KIRA ROAD", "MUKONO", "NAGGALAMA", "SEETA"],
  "KMP SOUTH": ["KMP SOUTH HEADQUARTERS", "NATEETE", "CPS KAMPALA", "PARLIAMENT", "ENTEBBE", "KABALAGALA", "KAJJANSI", "KASENYI", "KATWE", "KYENGERA", "NSANGI"],
  "KMP HEADQUARTERS": ["KMP HEADQUARTERS", "FLYING SQUAD", "CRIME INTELLIGENCE"],
  "POLICE HEADQUARTERS": ["NAGURU"]
};

const stripHtml = (html) => {
  if (!html) return '';
  return String(html).replace(/<[^>]*>?/gm, '').trim();
};

// 🟢 Dual-Equivalence Engine for Regional Headquarter matching
const isStationEquivalent = (statA, statB) => {
  const a = stripHtml(statA || '').trim().toUpperCase();
  const b = stripHtml(statB || '').trim().toUpperCase();
  if (!a || !b) return false;
  if (a === b) return true;

  const cleanA = a.replace(/(\s+HEADQUARTERS|\s+HQ)$/, '');
  const cleanB = b.replace(/(\s+HEADQUARTERS|\s+HQ)$/, '');

  return cleanA === cleanB && cleanA.length > 0;
};

const getOfficialRegionForStation = (stationName, dbRegion) => {
  const cleanStation = stripHtml(stationName || '').trim().toUpperCase();
  const cleanDbRegion = stripHtml(dbRegion || '').trim().toUpperCase();

  if (REGIONAL_HIERARCHY[cleanDbRegion] && REGIONAL_HIERARCHY[cleanDbRegion].some(s => isStationEquivalent(s, cleanStation))) {
    return cleanDbRegion;
  }

  for (const [regionName, stationsList] of Object.entries(REGIONAL_HIERARCHY)) {
    if (stationsList.some(s => isStationEquivalent(s, cleanStation))) {
      return regionName;
    }
  }

  return cleanDbRegion || 'KMP GENERAL';
};

export default function RegistryTable({ activeTab, user, reports = [], nominalRolls = [], establishments = [], canViewGlobal = false }) {
  
  // 🟢 OPSEC Role Classification Engine
  const userRoleClean = stripHtml(user?.role || '').toUpperCase();
  const userPosClean = stripHtml(user?.position || '').toUpperCase();
  const userRegClean = stripHtml(user?.region || '').toUpperCase();

  const isGlobalTier = ['SUPER_ADMIN', 'ADMIN', 'ASSISTANT_SUPER_ADMIN'].includes(userRoleClean) || 
    ['KMP COMMANDER', 'DEPUTY KMP COMMANDER', 'KMP ADMIN OFFICER'].includes(userPosClean) || 
    user?.permissions?.view_global_roster === true;

  const isKmpSystemManager = userRoleClean === 'SYSTEM_MANAGER' && ['KMP HEADQUARTERS', 'POLICE HEADQUARTERS'].includes(userRegClean) && userPosClean.includes('KMP');
  const isKmpSpecialist = userRoleClean === 'ASSISTANT_SYSTEM_MANAGER' && ['KMP HEADQUARTERS', 'POLICE HEADQUARTERS'].includes(userRegClean) && userPosClean.includes('KMP');

  const canViewGlobalActive = canViewGlobal || isGlobalTier || isKmpSystemManager || isKmpSpecialist;
  
  const isRegionalCommand = ['RPC', 'DEPUTY_RPC', 'SYSTEM_MANAGER', 'ASSISTANT_SYSTEM_MANAGER', 'REGIONAL_ADMIN', 'ASSISTANT_REGIONAL_ADMIN'].includes(userRoleClean) && !canViewGlobalLevel;

  const [filterRegion, setFilterRegion] = useState(canViewGlobalActive ? 'ALL REGIONS' : userRegClean);
  const [filterStation, setFilterStation] = useState((canViewGlobalActive || isRegionalCommand) ? 'ALL STATIONS' : stripHtml(user?.station || '').toUpperCase());

  const isFilterInitialized = useRef(false);
  useEffect(() => {
    if (!isFilterInitialized.current && user?.station) {
      if (canViewGlobalActive) {
        setFilterRegion('ALL REGIONS');
        setFilterStation('ALL STATIONS');
      } else if (isRegionalCommand) {
        setFilterRegion(userRegClean);
        setFilterStation('ALL STATIONS');
      } else {
        setFilterRegion(userRegClean);
        setFilterStation(stripHtml(user?.station || '').toUpperCase());
      }
      isFilterInitialized.current = true;
    }
  }, [canViewGlobalActive, isRegionalCommand, userRegClean, user?.station]);

  // 🟢 Filter Engine utilizing OPSEC & Dual-Equivalence
  const filterRecordByJurisdiction = (item) => {
    const stn = stripHtml(item.station || '').trim().toUpperCase();
    const reg = getOfficialRegionForStation(stn, item.region);

    if (canViewGlobalActive && filterRegion === 'ALL REGIONS' && filterStation === 'ALL STATIONS') {
      return true;
    }

    const belongsToRegion = filterRegion === 'ALL REGIONS' || 
                            reg === filterRegion || 
                            (REGIONAL_HIERARCHY[filterRegion] && REGIONAL_HIERARCHY[filterRegion].some(s => isStationEquivalent(s, stn)));

    if (!belongsToRegion) return false;

    if (filterStation !== 'ALL STATIONS') {
      if (!isStationEquivalent(stn, filterStation)) return false;
    }
    return true;
  };

  const filteredReports = useMemo(() => reports.filter(filterRecordByJurisdiction), [reports, filterRegion, filterStation, canViewGlobalActive]);
  const filteredEstablishments = useMemo(() => establishments.filter(filterRecordByJurisdiction), [establishments, filterRegion, filterStation, canViewGlobalActive]);
  const filteredNominalRolls = useMemo(() => nominalRolls.filter(filterRecordByJurisdiction), [nominalRolls, filterRegion, filterStation, canViewGlobalActive]);

  // RENDER TABLE BASED ON ACTIVE TAB
  const renderTable = () => {
    switch (activeTab) {
      case "Page1": // Crime Registry
        return (
          <>
            <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
              <h3>📋 Crime/Incident Registry Ledger ({filterRegion} {filterStation !== 'ALL STATIONS' ? `➔ ${filterStation}` : ''})</h3>
              
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-slate-500 uppercase flex items-center"><Filter size={12} className="mr-1 text-blue-600" /> Filter:</span>
                <select 
                  value={filterRegion} 
                  onChange={(e) => { setFilterRegion(e.target.value); setFilterStation('ALL STATIONS'); }}
                  disabled={!canViewGlobalActive}
                  className="border rounded p-1.5 text-xs font-bold bg-white outline-none cursor-pointer disabled:bg-slate-100 disabled:text-slate-500"
                >
                  {canViewGlobalActive ? (
                    <><option value="ALL REGIONS">ALL REGIONS</option>{Object.keys(REGIONAL_HIERARCHY).map(reg => <option key={reg} value={reg}>{reg}</option>)}</>
                  ) : <option value={userRegClean}>{userRegClean}</option>}
                </select>
                <select 
                  value={filterStation} 
                  onChange={(e) => setFilterStation(e.target.value)}
                  disabled={!(canViewGlobalActive || isRegionalCommand)}
                  className="border rounded p-1.5 text-xs font-bold bg-white outline-none cursor-pointer disabled:bg-slate-100 disabled:text-slate-500"
                >
                  {(canViewGlobalActive || isRegionalCommand) ? (
                    <><option value="ALL STATIONS">ALL STATIONS</option>{filterRegion !== 'ALL REGIONS' && (REGIONAL_HIERARCHY[filterRegion] || []).map(stn => <option key={stn} value={stn}>{stn}</option>)}</>
                  ) : <option value={stripHtml(user?.station || '').toUpperCase()}>{stripHtml(user?.station || '').toUpperCase()}</option>}
                </select>
              </div>
            </div>

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
                  {filteredReports.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="empty-table-msg">No crime records available for this jurisdiction.</td>
                    </tr>
                  ) : (
                    filteredReports.map((row) => (
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
            <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
              <h3>🏢 Regional Establishments Ledger ({filterRegion} {filterStation !== 'ALL STATIONS' ? `➔ ${filterStation}` : ''})</h3>
              
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-slate-500 uppercase flex items-center"><Filter size={12} className="mr-1 text-blue-600" /> Filter:</span>
                <select 
                  value={filterRegion} 
                  onChange={(e) => { setFilterRegion(e.target.value); setFilterStation('ALL STATIONS'); }}
                  disabled={!canViewGlobalActive}
                  className="border rounded p-1.5 text-xs font-bold bg-white outline-none cursor-pointer disabled:bg-slate-100 disabled:text-slate-500"
                >
                  {canViewGlobalActive ? (
                    <><option value="ALL REGIONS">ALL REGIONS</option>{Object.keys(REGIONAL_HIERARCHY).map(reg => <option key={reg} value={reg}>{reg}</option>)}</>
                  ) : <option value={userRegClean}>{userRegClean}</option>}
                </select>
                <select 
                  value={filterStation} 
                  onChange={(e) => setFilterStation(e.target.value)}
                  disabled={!(canViewGlobalActive || isRegionalCommand)}
                  className="border rounded p-1.5 text-xs font-bold bg-white outline-none cursor-pointer disabled:bg-slate-100 disabled:text-slate-500"
                >
                  {(canViewGlobalActive || isRegionalCommand) ? (
                    <><option value="ALL STATIONS">ALL STATIONS</option>{filterRegion !== 'ALL REGIONS' && (REGIONAL_HIERARCHY[filterRegion] || []).map(stn => <option key={stn} value={stn}>{stn}</option>)}</>
                  ) : <option value={stripHtml(user?.station || '').toUpperCase()}>{stripHtml(user?.station || '').toUpperCase()}</option>}
                </select>
              </div>
            </div>

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
                  {filteredEstablishments.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="empty-table-msg">No establishment records available for this jurisdiction.</td>
                    </tr>
                  ) : (
                    filteredEstablishments.map((row) => (
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
            <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
              <h3>👥 Personnel Nominal Roll ({filterRegion} {filterStation !== 'ALL STATIONS' ? `➔ ${filterStation}` : ''})</h3>
              
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-slate-500 uppercase flex items-center"><Filter size={12} className="mr-1 text-blue-600" /> Filter:</span>
                <select 
                  value={filterRegion} 
                  onChange={(e) => { setFilterRegion(e.target.value); setFilterStation('ALL STATIONS'); }}
                  disabled={!canViewGlobalActive}
                  className="border rounded p-1.5 text-xs font-bold bg-white outline-none cursor-pointer disabled:bg-slate-100 disabled:text-slate-500"
                >
                  {canViewGlobalActive ? (
                    <><option value="ALL REGIONS">ALL REGIONS</option>{Object.keys(REGIONAL_HIERARCHY).map(reg => <option key={reg} value={reg}>{reg}</option>)}</>
                  ) : <option value={userRegClean}>{userRegClean}</option>}
                </select>
                <select 
                  value={filterStation} 
                  onChange={(e) => setFilterStation(e.target.value)}
                  disabled={!(canViewGlobalActive || isRegionalCommand)}
                  className="border rounded p-1.5 text-xs font-bold bg-white outline-none cursor-pointer disabled:bg-slate-100 disabled:text-slate-500"
                >
                  {(canViewGlobalActive || isRegionalCommand) ? (
                    <><option value="ALL STATIONS">ALL STATIONS</option>{filterRegion !== 'ALL REGIONS' && (REGIONAL_HIERARCHY[filterRegion] || []).map(stn => <option key={stn} value={stn}>{stn}</option>)}</>
                  ) : <option value={stripHtml(user?.station || '').toUpperCase()}>{stripHtml(user?.station || '').toUpperCase()}</option>}
                </select>
              </div>
            </div>

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
                  {filteredNominalRolls.length === 0 ? (
                    <tr>
                      <td colSpan="4" className="empty-table-msg">No personnel records found for this jurisdiction.</td>
                    </tr>
                  ) : (
                    filteredNominalRolls.map((row) => (
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