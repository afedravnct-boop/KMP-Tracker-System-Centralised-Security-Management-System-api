import React, { useState, useMemo } from 'react';
import { Eye, Filter, X } from 'lucide-react';

const REGIONAL_HIERARCHY = {
  "KMP NORTH": ["KAWEMPE", "KAKIRI", "KASANGATI", "MATUGGA", "NANSANA", "OLD KAMPALA", "WAKISO", "WANDEGEYA"],
  "KMP EAST": ["JINJA ROAD", "KIRA", "KIRA ROAD", "MUKONO", "NAGGALAMA", "SEETA"],
  "KMP SOUTH": ["NATEETE", "CPS KAMPALA", "PARLIAMENT", "ENTEBBE", "KABALAGALA", "KAJJANSI", "KASENYI", "KATWE", "KYENGERA", "NSANGI"],
  "KMP HEADQUARTERS": ["KMP HEADQUARTERS", "FLYING SQUAD", "CRIME INTELLIGENCE"],
  "POLICE HEADQUARTERS": ["NAGURU"]
};

const getOfficialRegionForStation = (stationName, dbRegion) => {
  const cleanStation = (stationName || '').trim().toUpperCase();
  const cleanDbRegion = (dbRegion || '').trim().toUpperCase();

  if (REGIONAL_HIERARCHY[cleanDbRegion] && REGIONAL_HIERARCHY[cleanDbRegion].includes(cleanStation)) {
    return cleanDbRegion;
  }

  for (const [regionName, stationsList] of Object.entries(REGIONAL_HIERARCHY)) {
    if (stationsList.includes(cleanStation)) {
      return regionName;
    }
  }

  return cleanDbRegion || 'KMP GENERAL';
};

const ConsolidatedLedger = ({ data, reports, stats, stories, agricSummary = [], onClose, currentUser, canViewGlobal = false }) => {
  const today = new Date();
  const lastWeek = new Date(today);
  lastWeek.setDate(today.getDate() - 6);

  const [startDate, setStartDate] = useState(lastWeek.toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(today.toISOString().split('T')[0]);

  const canViewGlobalActive = canViewGlobal || 
    currentUser?.role === 'SUPER_ADMIN' || 
    ['ADMIN', 'RPC', 'Deputy Commander'].includes(currentUser?.role) ||
    currentUser?.permissions?.view_global_roster === true || 
    currentUser?.permissions?.global_observer === true;

  const [filterRegion, setFilterRegion] = useState(canViewGlobalActive ? 'ALL REGIONS' : currentUser?.region || '');
  const [filterStation, setFilterStation] = useState(canViewGlobalActive ? 'ALL STATIONS' : currentUser?.station || '');

  React.useEffect(() => {
    if (canViewGlobalActive) {
      setFilterRegion('ALL REGIONS');
      setFilterStation('ALL STATIONS');
    } else if (currentUser) {
      setFilterRegion(currentUser.region || 'ALL REGIONS');
      setFilterStation(currentUser.station || 'ALL STATIONS');
    }
  }, [currentUser, canViewGlobalActive]);

  const rawReports = Array.isArray(reports) ? reports : (data?.crimes || data?.reports || []);
  const rawStats = Array.isArray(stats) ? stats : (data?.statistics || data?.stats || []);
  const rawStories = Array.isArray(stories) ? stories : (data?.stories || data?.successStories || []);
  const rawAgric = Array.isArray(agricSummary) ? agricSummary : (data?.agricSummary || []);

  const getRoman = (num) => {
    const romans = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', 'xi', 'xii', 'xiii', 'xiv', 'xv', 'xvi', 'xvii', 'xviii', 'xix', 'xx'];
    return romans[num - 1] || num;
  };

  const formatDateLabel = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' }).toUpperCase();
  };

  const isLockupLog = (item) => {
    return Boolean(
      item.is_hq_general_total || 
      (item.station || '').includes('HEADQUARTERS GENERAL TOTAL') || 
      (item.daily_lock_up !== undefined && item.daily_lock_up !== null && Number(item.daily_lock_up) > 0 && !item.offence)
    );
  };

  const dataMapping = useMemo(() => {
    const crimeRegional = {};
    const crimeGeneral = {};
    let grandCrimeCases = 0;
    let grandCrimeSuspects = 0;

    const opsRegional = {};
    const opsGeneral = { arrested: 0, given_bond: 0, cautioned: 0, pending_court: 0, taken_to_court: 0, released: 0, remanded: 0, convicted: 0 };

    const storyRegional = {};
    let grandStories = 0;

    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setDate(end.getDate() + 1); 

    const isWithinWeek = (dateStr) => {
      if (!dateStr) return false;
      const recordDate = new Date(dateStr);
      return recordDate >= start && recordDate < end;
    };

    // --- Process Standard Crimes ---
    rawReports.filter(r => isWithinWeek(r.date)).forEach(r => {
      if (isLockupLog(r)) return;

      const stn = (r.station || '').trim().toUpperCase();
      const reg = getOfficialRegionForStation(stn, r.region);

      if (!(canViewGlobalActive && filterRegion === 'ALL REGIONS' && filterStation === 'ALL STATIONS')) {
        if (filterRegion !== 'ALL REGIONS' && reg !== filterRegion.toUpperCase()) return;
        if (filterStation !== 'ALL STATIONS' && stn !== filterStation.toUpperCase()) return;
      }

      const off = r.offence ? r.offence.toUpperCase() : 'UNSPECIFIED INCIDENT';
      const suspects = parseInt(r.suspects, 10) || 0;

      if (!crimeRegional[reg]) crimeRegional[reg] = {};
      if (!crimeRegional[reg][off]) crimeRegional[reg][off] = { cases: 0, suspects: 0 };
      
      crimeRegional[reg][off].cases += 1;
      crimeRegional[reg][off].suspects += suspects;

      if (!crimeGeneral[off]) crimeGeneral[off] = { cases: 0, suspects: 0 };
      crimeGeneral[off].cases += 1;
      crimeGeneral[off].suspects += suspects;

      grandCrimeCases += 1;
      grandCrimeSuspects += suspects;
    });

    // --- Process Agricultural Crimes & Produce Summaries ---
    rawAgric.filter(a => isWithinWeek(a.date)).forEach(a => {
      const stn = (a.station || '').trim().toUpperCase();
      const reg = getOfficialRegionForStation(stn, a.region);

      if (!(canViewGlobalActive && filterRegion === 'ALL REGIONS' && filterStation === 'ALL STATIONS')) {
        if (filterRegion !== 'ALL REGIONS' && reg !== filterRegion.toUpperCase()) return;
        if (filterStation !== 'ALL STATIONS' && stn !== filterStation.toUpperCase()) return;
      }

      const off = (a.agric_crime_report || 'AGRICULTURAL THEFT').toUpperCase();
      const count = parseInt(a.number_count, 10) || 0;

      if (!crimeRegional[reg]) crimeRegional[reg] = {};
      if (!crimeRegional[reg][off]) crimeRegional[reg][off] = { cases: 0, suspects: 0 };
      
      crimeRegional[reg][off].cases += count;

      if (!crimeGeneral[off]) crimeGeneral[off] = { cases: 0, suspects: 0 };
      crimeGeneral[off].cases += count;

      grandCrimeCases += count;
    });

    // --- Process Operational Statistics ---
    rawStats.filter(s => isWithinWeek(s.date)).forEach(s => {
      const stn = (s.station || '').trim().toUpperCase();
      const reg = getOfficialRegionForStation(stn, s.region);

      if (!(canViewGlobalActive && filterRegion === 'ALL REGIONS' && filterStation === 'ALL STATIONS')) {
        if (filterRegion !== 'ALL REGIONS' && reg !== filterRegion.toUpperCase()) return;
        if (filterStation !== 'ALL STATIONS' && stn !== filterStation.toUpperCase()) return;
      }
      
      if (!opsRegional[reg]) {
        opsRegional[reg] = { arrested: 0, given_bond: 0, cautioned: 0, pending_court: 0, taken_to_court: 0, released: 0, remanded: 0, convicted: 0 };
      }

      const keys = ['arrested', 'given_bond', 'cautioned', 'pending_court', 'taken_to_court', 'released', 'remanded', 'convicted'];
      keys.forEach(key => {
        const val = parseInt(s[key], 10) || 0;
        opsRegional[reg][key] += val;
        opsGeneral[key] += val;
      });
    });

    // --- Process Success Stories ---
    rawStories.filter(s => isWithinWeek(s.date)).forEach(s => {
      const stn = (s.station || '').trim().toUpperCase();
      const reg = getOfficialRegionForStation(stn, s.region);

      if (!(canViewGlobalActive && filterRegion === 'ALL REGIONS' && filterStation === 'ALL STATIONS')) {
        if (filterRegion !== 'ALL REGIONS' && reg !== filterRegion.toUpperCase()) return;
        if (filterStation !== 'ALL STATIONS' && stn !== filterStation.toUpperCase()) return;
      }

      if (!storyRegional[reg]) storyRegional[reg] = 0;
      storyRegional[reg] += 1;
      grandStories += 1;
    });

    const regionOrder = ["KMP NORTH", "KMP EAST", "KMP SOUTH", "KMP HEADQUARTERS", "POLICE HEADQUARTERS"];
    const sorter = (a, b) => {
       const idxA = regionOrder.indexOf(a); 
       const idxB = regionOrder.indexOf(b);
       if (idxA !== -1 && idxB !== -1) return idxA - idxB;
       if (idxA !== -1) return -1; 
       if (idxB !== -1) return 1;
       return a.localeCompare(b);
    };

    const sortedCrimeRegions = Object.keys(crimeRegional).sort(sorter);
    const sortedOpsRegions = Object.keys(opsRegional).sort(sorter);
    const sortedStoryRegions = Object.keys(storyRegional).sort(sorter);

    return { 
      crimeRegional, crimeGeneral, sortedCrimeRegions, grandCrimeCases, grandCrimeSuspects,
      opsRegional, opsGeneral, sortedOpsRegions,
      storyRegional, sortedStoryRegions, grandStories
    };
  }, [rawReports, rawStats, rawStories, rawAgric, startDate, endDate, filterRegion, filterStation, canViewGlobalActive]);

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-10 relative z-10 animate-in fade-in duration-300">
      
      {/* FILTER BAR */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex flex-col lg:flex-row justify-between items-center gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-800 flex items-center"><Eye size={20} className="mr-2 text-blue-600"/> Command Master Ledger</h2>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-bold text-slate-500 uppercase flex items-center">
            <Filter size={14} className="mr-1 text-blue-600" /> Jurisdiction:
          </span>

          <select 
            value={filterRegion} 
            onChange={(e) => { setFilterRegion(e.target.value); setFilterStation('ALL STATIONS'); }}
            disabled={!canViewGlobalActive}
            className="border border-slate-300 rounded-lg p-2 text-xs font-bold text-slate-800 bg-white outline-none cursor-pointer disabled:bg-slate-100 disabled:text-slate-500"
          >
            {canViewGlobalActive ? (
              <>
                <option value="ALL REGIONS">ALL REGIONS</option>
                {Object.keys(REGIONAL_HIERARCHY).map(reg => (
                  <option key={reg} value={reg}>{reg}</option>
                ))}
              </>
            ) : (
              <option value={currentUser?.region || ''}>{currentUser?.region || 'UNKNOWN'}</option>
            )}
          </select>

          <select 
            value={filterStation} 
            onChange={(e) => setFilterStation(e.target.value)}
            disabled={!canViewGlobalActive}
            className="border border-slate-300 rounded-lg p-2 text-xs font-bold text-slate-800 bg-white outline-none cursor-pointer disabled:bg-slate-100 disabled:text-slate-500"
          >
            {canViewGlobalActive ? (
              <>
                <option value="ALL STATIONS">ALL STATIONS</option>
                {filterRegion !== 'ALL REGIONS' && (REGIONAL_HIERARCHY[filterRegion] || []).map(stn => (
                  <option key={stn} value={stn}>{stn}</option>
                ))}
              </>
            ) : (
              <option value={currentUser?.station || ''}>{currentUser?.station || 'UNKNOWN'}</option>
            )}
          </select>

          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">From Date</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="text-sm font-bold text-slate-800 bg-white border border-slate-300 rounded px-2 py-1 outline-none" />
          </div>
          <span className="text-slate-400 font-bold mt-4">-</span>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">To Date</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="text-sm font-bold text-slate-800 bg-white border border-slate-300 rounded px-2 py-1 outline-none" />
          </div>
          <button onClick={onClose} className="mt-4 ml-2 bg-slate-800 text-white px-3 py-1.5 rounded font-bold text-xs hover:bg-slate-700 shadow-sm transition-colors cursor-pointer">Close Ledger</button>
        </div>
      </div>

      {/* ======================================================== */}
      {/* SECTION 1: CRIME & AGRICULTURAL SUMMARY TABLES            */}
      {/* ======================================================== */}
      <div className="space-y-6">
        <div className="bg-white shadow-xl overflow-hidden">
          <table className="w-full text-sm border-collapse border-2 border-slate-400 bg-white">
            <thead>
              <tr className="bg-[#b4c6e7] border-2 border-slate-400">
                <th colSpan="5" className="p-3 text-center font-extrabold text-slate-900 tracking-wide border-2 border-slate-400 text-[13px]">
                  SUMMARY OF CRIMES & AGRICULTURAL THEFTS REGISTERED FROM {formatDateLabel(startDate)} TO {formatDateLabel(endDate)}
                </th>
              </tr>
              <tr className="bg-slate-100 text-slate-800">
                <th className="p-2 text-center font-bold border-2 border-slate-400 w-32 uppercase text-xs">REGION</th>
                <th className="p-2 text-center font-bold border-2 border-slate-400 w-12 uppercase text-xs">NO</th>
                <th className="p-2 text-left font-bold border-2 border-slate-400 uppercase text-xs">OFFENCE / PRODUCE THEFT</th>
                <th className="p-2 text-center font-bold border-2 border-slate-400 w-32 uppercase text-xs leading-tight">NUMBER OF<br/>CASES / QTY</th>
                <th className="p-2 text-center font-bold border-2 border-slate-400 w-32 uppercase text-xs leading-tight">SUSPECTS IN<br/>CUSTODY</th>
              </tr>
            </thead>
            <tbody>
              {dataMapping.sortedCrimeRegions.map(region => {
                const offences = Object.keys(dataMapping.crimeRegional[region]);
                let regCases = 0; 
                let regSuspects = 0;
                
                const rows = offences.map((off, idx) => {
                  const item = dataMapping.crimeRegional[region][off];
                  regCases += item.cases; 
                  regSuspects += item.suspects;
                  return (
                    <tr key={`crime-${region}-${off}`} className="hover:bg-slate-50 transition-colors">
                      {idx === 0 && (
                        <td rowSpan={offences.length} className="px-3 py-2 border-2 border-slate-400 align-middle font-bold text-center bg-white text-slate-900">{region}</td>
                      )}
                      <td className="px-3 py-1.5 border border-slate-400 text-center text-slate-600 font-medium">{getRoman(idx + 1)}.</td>
                      <td className="px-3 py-1.5 border border-slate-400 text-slate-800 text-xs font-semibold uppercase">{off}</td>
                      <td className="px-3 py-1.5 border border-slate-400 text-center font-bold">{item.cases}</td>
                      <td className="px-3 py-1.5 border border-slate-400 text-center font-bold">{item.suspects}</td>
                    </tr>
                  );
                });
                
                rows.push(
                  <tr key={`crime-${region}-subtotal`} className="bg-[#d9d9d9] font-extrabold text-slate-900 border-2 border-slate-400">
                    <td colSpan="3" className="px-3 py-2 border border-slate-400 text-left pl-12 uppercase tracking-wide text-xs">SUB-TOTAL</td>
                    <td className="px-3 py-2 border border-slate-400 text-center text-sm">{regCases}</td>
                    <td className="px-3 py-2 border border-slate-400 text-center text-sm">{regSuspects}</td>
                  </tr>
                );
                return rows;
              })}
              {dataMapping.sortedCrimeRegions.length === 0 && (
                <tr><td colSpan="5" className="text-center py-6 text-gray-500 italic">No crimes or agricultural thefts registered in this period.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {dataMapping.sortedCrimeRegions.length > 0 && (
          <div className="bg-white shadow-xl overflow-hidden">
            <table className="w-full text-sm border-collapse border-2 border-slate-400 bg-white">
              <thead>
                <tr className="bg-[#c6e0b4] border-2 border-slate-400">
                  <th colSpan="4" className="p-3 text-center font-extrabold text-slate-900 tracking-wide border-2 border-slate-400 text-[13px]">
                    GENERAL CRIME & AGRICULTURAL PRODUCE SUMMARY
                  </th>
                </tr>
                <tr className="bg-slate-100 text-slate-800">
                  <th className="p-2 text-center font-bold border-2 border-slate-400 w-16 uppercase text-xs">NO</th>
                  <th className="p-2 text-left font-bold border-2 border-slate-400 uppercase text-xs">OFFENCES / AGRICULTURAL THEFTS</th>
                  <th className="p-2 text-center font-bold border-2 border-slate-400 w-40 uppercase text-xs leading-tight">TOTAL CASES / QTY</th>
                  <th className="p-2 text-center font-bold border-2 border-slate-400 w-40 uppercase text-xs leading-tight">SUSPECTS IN<br/>CUSTODY</th>
                </tr>
              </thead>
              <tbody>
                {Object.keys(dataMapping.crimeGeneral).map((off, idx) => {
                  const item = dataMapping.crimeGeneral[off];
                  return (
                    <tr key={`gen-crime-${off}`} className="hover:bg-slate-50 transition-colors">
                      <td className="px-3 py-1.5 border border-slate-400 text-center text-slate-600 font-medium">{idx + 1}</td>
                      <td className="px-3 py-1.5 border border-slate-400 text-slate-800 text-xs font-semibold uppercase">{off}</td>
                      <td className="px-3 py-1.5 border border-slate-400 text-center font-bold">{item.cases}</td>
                      <td className="px-3 py-1.5 border border-slate-400 text-center font-bold">{item.suspects}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-[#a9d08e] font-extrabold text-slate-900 border-2 border-slate-400">
                <tr>
                  <td colSpan="2" className="px-3 py-3 border border-slate-400 text-left pl-6 uppercase tracking-wider text-sm">GRAND TOTAL</td>
                  <td className="px-3 py-3 border border-slate-400 text-center text-base">{dataMapping.grandCrimeCases}</td>
                  <td className="px-3 py-3 border border-slate-400 text-center text-base">{dataMapping.grandCrimeSuspects}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* ======================================================== */}
      {/* SECTION 2: OPERATIONAL STATISTICS TABLES                 */}
      {/* ======================================================== */}
      <div className="space-y-6 pt-6">
        <div className="bg-white shadow-xl overflow-hidden">
          <table className="min-w-full text-sm border-collapse border-2 border-slate-400 bg-white">
            <thead>
              <tr className="bg-[#ffd966] border-2 border-slate-400">
                <th colSpan="9" className="p-3 text-center font-extrabold text-slate-900 tracking-wide border-2 border-slate-400 text-[13px]">
                  SUMMARY OF DISRUPTIVE OPERATIONS FROM {formatDateLabel(startDate)} TO {formatDateLabel(endDate)}
                </th>
              </tr>
              <tr className="bg-slate-100 text-slate-800">
                <th className="p-2 text-center font-bold border-2 border-slate-400 uppercase text-[10px] leading-tight">REGION</th>
                <th className="p-2 text-center font-bold border-2 border-slate-400 uppercase text-[10px] leading-tight">ARRESTED</th>
                <th className="p-2 text-center font-bold border-2 border-slate-400 uppercase text-[10px] leading-tight">GIVEN<br/>BOND</th>
                <th className="p-2 text-center font-bold border-2 border-slate-400 uppercase text-[10px] leading-tight">CAUTIONED</th>
                <th className="p-2 text-center font-bold border-2 border-slate-400 uppercase text-[10px] leading-tight">PENDING<br/>COURT</th>
                <th className="p-2 text-center font-bold border-2 border-slate-400 uppercase text-[10px] leading-tight">TAKEN TO<br/>COURT</th>
                <th className="p-2 text-center font-bold border-2 border-slate-400 uppercase text-[10px] leading-tight">RELEASED</th>
                <th className="p-2 text-center font-bold border-2 border-slate-400 uppercase text-[10px] leading-tight">REMANDED</th>
                <th className="p-2 text-center font-bold border-2 border-slate-400 uppercase text-[10px] leading-tight">CONVICTED</th>
              </tr>
            </thead>
            <tbody>
              {dataMapping.sortedOpsRegions.map((region) => {
                const item = dataMapping.opsRegional[region];
                return (
                  <tr key={`ops-${region}`} className="hover:bg-slate-50 transition-colors">
                    <td className="px-2 py-2 border border-slate-400 text-center font-bold text-slate-900 text-xs">{region}</td>
                    <td className="px-2 py-2 border border-slate-400 text-center font-bold">{item.arrested}</td>
                    <td className="px-2 py-2 border border-slate-400 text-center font-bold">{item.given_bond}</td>
                    <td className="px-2 py-2 border border-slate-400 text-center font-bold">{item.cautioned}</td>
                    <td className="px-2 py-2 border border-slate-400 text-center font-bold">{item.pending_court}</td>
                    <td className="px-2 py-2 border border-slate-400 text-center font-bold">{item.taken_to_court}</td>
                    <td className="px-2 py-2 border border-slate-400 text-center font-bold">{item.released}</td>
                    <td className="px-2 py-2 border border-slate-400 text-center font-bold text-red-700">{item.remanded}</td>
                    <td className="px-2 py-2 border border-slate-400 text-center font-bold text-purple-700">{item.convicted}</td>
                  </tr>
                );
              })}
              {dataMapping.sortedOpsRegions.length === 0 && (
                <tr><td colSpan="9" className="text-center py-6 text-gray-500 italic">No operational statistics recorded in this period.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {dataMapping.sortedOpsRegions.length > 0 && (
          <div className="bg-white shadow-xl overflow-hidden mt-8">
            <table className="min-w-full text-sm border-collapse border-2 border-slate-400 bg-white">
              <thead>
                <tr className="bg-[#f8cbad] border-2 border-slate-400">
                  <th colSpan="9" className="p-3 text-center font-extrabold text-slate-900 tracking-wide border-2 border-slate-400 text-[13px]">
                    GENERAL OPERATIONAL SUMMARY (ALL REGIONS)
                  </th>
                </tr>
                <tr className="bg-slate-100 text-slate-800">
                  <th className="p-2 text-center font-bold border-2 border-slate-400 uppercase text-[10px] leading-tight">CATEGORY</th>
                  <th className="p-2 text-center font-bold border-2 border-slate-400 uppercase text-[10px] leading-tight">TOTAL<br/>ARRESTED</th>
                  <th className="p-2 text-center font-bold border-2 border-slate-400 uppercase text-[10px] leading-tight">GIVEN<br/>BOND</th>
                  <th className="p-2 text-center font-bold border-2 border-slate-400 uppercase text-[10px] leading-tight">CAUTIONED</th>
                  <th className="p-2 text-center font-bold border-2 border-slate-400 uppercase text-[10px] leading-tight">PENDING<br/>COURT</th>
                  <th className="p-2 text-center font-bold border-2 border-slate-400 uppercase text-[10px] leading-tight">TAKEN TO<br/>COURT</th>
                  <th className="p-2 text-center font-bold border-2 border-slate-400 uppercase text-[10px] leading-tight">RELEASED</th>
                  <th className="p-2 text-center font-bold border-2 border-slate-400 uppercase text-[10px] leading-tight">REMANDED</th>
                  <th className="p-2 text-center font-bold border-2 border-slate-400 uppercase text-[10px] leading-tight">CONVICTED</th>
                </tr>
              </thead>
              <tbody>
                <tr className="bg-[#e2efda] font-extrabold text-slate-900 border-2 border-slate-400">
                  <td className="px-2 py-3 border border-slate-400 text-center uppercase tracking-wide text-xs">SELECTED JURISDICTION</td>
                  <td className="px-2 py-3 border border-slate-400 text-center text-sm">{dataMapping.opsGeneral.arrested}</td>
                  <td className="px-2 py-3 border border-slate-400 text-center text-sm">{dataMapping.opsGeneral.given_bond}</td>
                  <td className="px-2 py-3 border border-slate-400 text-center text-sm">{dataMapping.opsGeneral.cautioned}</td>
                  <td className="px-2 py-3 border border-slate-400 text-center text-sm">{dataMapping.opsGeneral.pending_court}</td>
                  <td className="px-2 py-3 border border-slate-400 text-center text-sm">{dataMapping.opsGeneral.taken_to_court}</td>
                  <td className="px-2 py-3 border border-slate-400 text-center text-sm">{dataMapping.opsGeneral.released}</td>
                  <td className="px-2 py-3 border border-slate-400 text-center text-sm text-red-700">{dataMapping.opsGeneral.remanded}</td>
                  <td className="px-2 py-3 border border-slate-400 text-center text-sm text-purple-700">{dataMapping.opsGeneral.convicted}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ======================================================== */}
      {/* SECTION 3: SUCCESS STORIES SUMMARY                       */}
      {/* ======================================================== */}
      <div className="space-y-6 pt-6">
        <div className="bg-white shadow-xl overflow-hidden">
          <table className="min-w-full text-sm border-collapse border-2 border-slate-400 bg-white">
            <thead>
              <tr className="bg-[#ffe699] border-2 border-slate-400">
                <th colSpan="3" className="p-3 text-center font-extrabold text-slate-900 tracking-wide border-2 border-slate-400 text-[13px]">
                  SUMMARY OF SUCCESSFUL OPERATIONS & MILESTONES FROM {formatDateLabel(startDate)} TO {formatDateLabel(endDate)}
                </th>
              </tr>
              <tr className="bg-slate-100 text-slate-800">
                <th className="p-2 text-center font-bold border-2 border-slate-400 w-16 uppercase text-xs">NO</th>
                <th className="p-2 text-center font-bold border-2 border-slate-400 w-48 uppercase text-xs">REGION</th>
                <th className="p-2 text-center font-bold border-2 border-slate-400 uppercase text-xs">TOTAL SUCCESS STORIES LOGGED</th>
              </tr>
            </thead>
            <tbody>
              {dataMapping.sortedStoryRegions.map((region, idx) => (
                <tr key={`story-${region}`} className="hover:bg-slate-50 transition-colors">
                  <td className="px-3 py-2 border border-slate-400 text-center font-medium text-slate-600">{idx + 1}</td>
                  <td className="px-3 py-2 border border-slate-400 text-center font-bold text-slate-900">{region}</td>
                  <td className="px-3 py-2 border border-slate-400 text-center font-bold text-amber-600 text-base">{dataMapping.storyRegional[region]}</td>
                </tr>
              ))}
              {dataMapping.sortedStoryRegions.length === 0 && (
                <tr><td colSpan="3" className="text-center py-6 text-gray-500 italic">No success stories recorded in this period.</td></tr>
              )}
            </tbody>
            {dataMapping.sortedStoryRegions.length > 0 && (
              <tfoot className="bg-[#ffd966] font-extrabold text-slate-900 border-2 border-slate-400">
                <tr>
                  <td colSpan="2" className="px-3 py-3 border border-slate-400 text-right pr-6 uppercase tracking-wider text-sm">GRAND TOTAL MILESTONES</td>
                  <td className="px-3 py-3 border border-slate-400 text-center text-lg">{dataMapping.grandStories}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

    </div>
  );
};

export default ConsolidatedLedger;