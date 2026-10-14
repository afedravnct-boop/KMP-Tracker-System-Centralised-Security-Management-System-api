// src/components/ConsolidatedLedger.jsx
import React, { useState } from 'react';
import { Eye, Filter, X } from 'lucide-react';

const cleanStr = (str) => {
  if (!str) return '';
  return String(str).replace(/\s+/g, ' ').trim().toUpperCase();
};

const REGIONAL_HIERARCHY = {
  "KMP NORTH": ["KMP NORTH HEADQUARTERS", "KMP NORTH", "KAWEMPE", "KAKIRI", "KASANGATI", "MATUGGA", "NANSANA", "OLD KAMPALA", "WAKISO", "WANDEGEYA"],
  "KMP EAST": ["KMP EAST HEADQUARTERS", "KMP EAST", "JINJA ROAD", "KIRA", "KIRA DIV", "KIRA ROAD", "MUKONO", "NAGGALAMA", "SEETA"],
  "KMP SOUTH": ["KMP SOUTH HEADQUARTERS", "KMP SOUTH", "NATEETE", "CPS KAMPALA", "PARLIAMENT", "ENTEBBE", "KABALAGALA", "KAJJANSI", "KASENYI", "KATWE", "KYENGERA", "NSANGI"],
  "KMP HEADQUARTERS": ["KMP HEADQUARTERS", "KMP CID", "KMP TRAFFIC", "KMP ICT", "KMP FLYING SQUAD", "KMP CRIME INTELLIGENCE"],
  "POLICE HEADQUARTERS": ["NAGURU", "OPERATIONS", "CRIME INTELLIGENCE", "CID", "LOGISTICS & ENGINEERING", "ICT", "CT", "FIRE & RESCUE"]
};

const isStationEquivalent = (statA, statB) => {
  const a = cleanStr(statA);
  const b = cleanStr(statB);
  if (!a || !b) return false;
  if (a === b) return true;
  const cleanA = a.replace(/(\s+HEADQUARTERS|\s+HQ)$/, '');
  const cleanB = b.replace(/(\s+HEADQUARTERS|\s+HQ)$/, '');
  return cleanA === cleanB && cleanA.length > 0;
};

const ConsolidatedLedger = ({ data, reports, stats, stories, agricSummary = [], onClose, currentUser, canViewGlobal = false }) => {
  const today = new Date();
  const lastWeek = new Date(today);
  lastWeek.setDate(today.getDate() - 6);

  const [startDate, setStartDate] = useState(lastWeek.toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(today.toISOString().split('T')[0]);

  const userRoleClean = cleanStr(currentUser?.role);
  const userPosClean = cleanStr(currentUser?.position);
  const userRegClean = cleanStr(currentUser?.region);

  const isGlobalTier = ['SUPER_ADMIN', 'ADMIN', 'ASSISTANT_SUPER_ADMIN'].includes(userRoleClean) || 
    ['KMP COMMANDER', 'DEPUTY KMP COMMANDER', 'KMP ADMIN OFFICER'].includes(userPosClean) || 
    currentUser?.permissions?.view_global_roster === true;

  const canViewGlobalLevel = canViewGlobal || isGlobalTier;
  const isRegionalCommand = ['RPC', 'DEPUTY_RPC', 'SYSTEM_MANAGER', 'ASSISTANT_SYSTEM_MANAGER', 'REGIONAL_ADMIN', 'ASSISTANT_REGIONAL_ADMIN'].includes(userRoleClean) && !canViewGlobalLevel;

  const [filterRegion, setFilterRegion] = useState(canViewGlobalLevel ? 'ALL REGIONS' : userRegClean);
  const [filterStation, setFilterStation] = useState((canViewGlobalLevel || isRegionalCommand) ? 'ALL STATIONS' : cleanStr(currentUser?.station));

  const dataMapping = data || {
    sortedCrimeRegions: [],
    crimeRegional: {},
    crimeGeneral: {},
    grandCrimeCases: 0,
    grandCrimeSuspects: 0,
    sortedOpsRegions: [],
    opsRegional: {},
    opsGeneral: { arrested: 0, given_bond: 0, cautioned: 0, pending_court: 0, taken_to_court: 0, released: 0, remanded: 0, convicted: 0 },
    sortedStoryRegions: [],
    storyRegional: {},
    grandStories: 0
  };

  const getRoman = (num) => {
    const romans = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', 'xi', 'xii', 'xiii', 'xiv', 'xv', 'xvi', 'xvii', 'xviii', 'xix', 'xx'];
    return romans[num - 1] || num;
  };

  const formatDateLabel = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' }).toUpperCase();
  };

  return (
    <div className="p-4 md:p-6 max-w-[1600px] mx-auto space-y-6 relative z-10 animate-in fade-in duration-300">
      
      {/* FILTER BAR */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-slate-800 flex flex-col lg:flex-row justify-between items-center gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-800 dark:text-slate-100 flex items-center"><Eye size={20} className="mr-2 text-blue-600"/> Command Master Ledger</h2>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-bold text-slate-500 uppercase flex items-center">
            <Filter size={14} className="mr-1 text-blue-600" /> Jurisdiction:
          </span>

          <select 
            value={filterRegion} 
            onChange={(e) => { setFilterRegion(e.target.value); setFilterStation('ALL STATIONS'); }}
            disabled={!canViewGlobalLevel}
            className="border border-slate-300 dark:border-slate-700 rounded-lg p-2 text-xs font-bold text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-800 outline-none cursor-pointer disabled:bg-slate-100 dark:disabled:bg-slate-900"
          >
            {canViewGlobalLevel ? (
              <>
                <option value="ALL REGIONS">ALL REGIONS</option>
                <option value="KMP NORTH">KMP NORTH</option>
                <option value="KMP EAST">KMP EAST</option>
                <option value="KMP SOUTH">KMP SOUTH</option>
                <option value="KMP HEADQUARTERS">KMP HEADQUARTERS</option>
                <option value="POLICE HEADQUARTERS">POLICE HEADQUARTERS</option>
              </>
            ) : (
              <option value={userRegClean}>{userRegClean || 'UNKNOWN'}</option>
            )}
          </select>

          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">From Date</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="text-sm font-bold text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2 py-1 outline-none" />
          </div>
          <span className="text-slate-400 font-bold mt-4">-</span>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">To Date</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="text-sm font-bold text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2 py-1 outline-none" />
          </div>
          <button onClick={onClose} className="mt-4 ml-2 bg-slate-800 text-white px-3 py-1.5 rounded font-bold text-xs hover:bg-slate-700 shadow-sm transition-colors cursor-pointer">Close Ledger</button>
        </div>
      </div>

      {/* INDEPENDENT VERTICAL & HORIZONTAL SCROLLABLE LEDGER CONTAINER */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col h-[700px] overflow-hidden">
        <div className="flex-1 overflow-auto custom-scrollbar p-4 space-y-8">
          
          {/* SECTION 1: CRIME & AGRICULTURAL SUMMARY TABLES */}
          <div className="space-y-6">
            <div className="shadow-md overflow-x-auto">
              <table className="w-full text-sm border-collapse border-2 border-slate-400 bg-white dark:bg-slate-900">
                <thead>
                  <tr className="bg-[#b4c6e7] dark:bg-slate-800 border-2 border-slate-400">
                    <th colSpan="5" className="p-3 text-center font-extrabold text-slate-900 dark:text-slate-100 tracking-wide border-2 border-slate-400 text-[13px]">
                      SUMMARY OF CRIMES & AGRICULTURAL THEFTS REGISTERED FROM {formatDateLabel(startDate)} TO {formatDateLabel(endDate)}
                    </th>
                  </tr>
                  <tr className="bg-slate-100 dark:bg-slate-950 text-slate-800 dark:text-slate-200">
                    <th className="p-2 text-center font-bold border-2 border-slate-400 w-32 uppercase text-xs">REGION</th>
                    <th className="p-2 text-center font-bold border-2 border-slate-400 w-12 uppercase text-xs">NO</th>
                    <th className="p-2 text-left font-bold border-2 border-slate-400 uppercase text-xs">OFFENCE / PRODUCE THEFT</th>
                    <th className="p-2 text-center font-bold border-2 border-slate-400 w-32 uppercase text-xs leading-tight">NUMBER OF<br/>CASES / QTY</th>
                    <th className="p-2 text-center font-bold border-2 border-slate-400 w-32 uppercase text-xs leading-tight">SUSPECTS IN<br/>CUSTODY</th>
                  </tr>
                </thead>
                <tbody>
                  {(dataMapping.sortedCrimeRegions || []).map(region => {
                    const offences = Object.keys(dataMapping.crimeRegional[region] || {});
                    let regCases = 0; 
                    let regSuspects = 0;
                    
                    const rows = offences.map((off, idx) => {
                      const item = dataMapping.crimeRegional[region][off];
                      regCases += item.cases; 
                      regSuspects += item.suspects;
                      return (
                        <tr key={`crime-${region}-${off}`} className="hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                          {idx === 0 && (
                            <td rowSpan={offences.length} className="px-3 py-2 border-2 border-slate-400 align-middle font-bold text-center bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">{region}</td>
                          )}
                          <td className="px-3 py-1.5 border border-slate-400 text-center text-slate-600 dark:text-slate-400 font-medium">{getRoman(idx + 1)}.</td>
                          <td className="px-3 py-1.5 border border-slate-400 text-slate-800 dark:text-slate-200 text-xs font-semibold uppercase">{off}</td>
                          <td className="px-3 py-1.5 border border-slate-400 text-center font-bold">{item.cases}</td>
                          <td className="px-3 py-1.5 border border-slate-400 text-center font-bold">{item.suspects}</td>
                        </tr>
                      );
                    });
                    
                    rows.push(
                      <tr key={`crime-${region}-subtotal`} className="bg-[#d9d9d9] dark:bg-slate-800 font-extrabold text-slate-900 dark:text-slate-100 border-2 border-slate-400">
                        <td colSpan="3" className="px-3 py-2 border border-slate-400 text-left pl-12 uppercase tracking-wide text-xs">SUB-TOTAL</td>
                        <td className="px-3 py-2 border border-slate-400 text-center text-sm">{regCases}</td>
                        <td className="px-3 py-2 border border-slate-400 text-center text-sm">{regSuspects}</td>
                      </tr>
                    );
                    return rows;
                  })}
                  {(!dataMapping.sortedCrimeRegions || dataMapping.sortedCrimeRegions.length === 0) && (
                    <tr><td colSpan="5" className="text-center py-6 text-gray-500 italic">No crimes or agricultural thefts registered in this period.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </div>

    </div>
  );
};

export default ConsolidatedLedger;