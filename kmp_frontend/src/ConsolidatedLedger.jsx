import React, { useState, useMemo } from 'react';
import { Eye } from 'lucide-react';

const ConsolidatedLedger = ({ reports, stats, stories, onClose }) => {
  const today = new Date();
  const lastWeek = new Date(today);
  lastWeek.setDate(today.getDate() - 6);

  const [startDate, setStartDate] = useState(lastWeek.toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(today.toISOString().split('T')[0]);

  const getRoman = (num) => {
    const romans = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', 'xi', 'xii', 'xiii', 'xiv', 'xv', 'xvi', 'xvii', 'xviii', 'xix', 'xx'];
    return romans[num - 1] || num;
  };

  const formatDateLabel = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' }).toUpperCase();
  };

  const dataMapping = useMemo(() => {
    // 1. Variables for Crime Data
    const crimeRegional = {};
    const crimeGeneral = {};
    let grandCrimeCases = 0;
    let grandCrimeSuspects = 0;

    // 2. Variables for Operational Stats Data
    const opsRegional = {};
    const opsGeneral = { arrested: 0, given_bond: 0, cautioned: 0, pending_court: 0, taken_to_court: 0, released: 0, remanded: 0, convicted: 0 };

    // 3. Variables for Success Stories
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

    // --- Process Crimes ---
    (reports || []).filter(r => isWithinWeek(r.date)).forEach(r => {
      const reg = r.region ? r.region.toUpperCase() : 'UNSPECIFIED REGION';
      const off = r.offence ? r.offence.toUpperCase() : 'UNSPECIFIED INCIDENT';
      const suspects = parseInt(r.suspects) || 0;

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

    // --- Process Operational Statistics ---
    (stats || []).filter(s => isWithinWeek(s.date)).forEach(s => {
      const reg = s.region ? s.region.toUpperCase() : 'UNSPECIFIED REGION';
      
      if (!opsRegional[reg]) {
        opsRegional[reg] = { arrested: 0, given_bond: 0, cautioned: 0, pending_court: 0, taken_to_court: 0, released: 0, remanded: 0, convicted: 0 };
      }

      const keys = ['arrested', 'given_bond', 'cautioned', 'pending_court', 'taken_to_court', 'released', 'remanded', 'convicted'];
      keys.forEach(key => {
        const val = parseInt(s[key]) || 0;
        opsRegional[reg][key] += val;
        opsGeneral[key] += val;
      });
    });

    // --- Process Success Stories ---
    (stories || []).filter(s => isWithinWeek(s.date)).forEach(s => {
      const reg = s.region ? s.region.toUpperCase() : 'UNSPECIFIED REGION';
      if (!storyRegional[reg]) storyRegional[reg] = 0;
      
      storyRegional[reg] += 1;
      grandStories += 1;
    });

    const regionOrder = ["KMP NORTH", "KMP EAST", "KMP SOUTH", "KMP HEADQUARTERS", "POLICE HEADQUARTERS"];
    
    const sorter = (a, b) => {
       const idxA = regionOrder.indexOf(a); const idxB = regionOrder.indexOf(b);
       if (idxA !== -1 && idxB !== -1) return idxA - idxB;
       if (idxA !== -1) return -1; if (idxB !== -1) return 1;
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
  }, [reports, stats, stories, startDate, endDate]);

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-10 relative z-10 animate-in fade-in duration-300">
      
      {/* FILTER BAR */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex flex-col sm:flex-row justify-between items-center gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-800 flex items-center"><Eye size={20} className="mr-2 text-blue-600"/> Command Master Ledger</h2>
        </div>
        <div className="flex items-center space-x-3 bg-slate-50 p-2 rounded-lg border border-slate-200">
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">From Date</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="text-sm font-bold text-slate-800 bg-white border border-slate-300 rounded px-2 py-1 outline-none" />
          </div>
          <span className="text-slate-400 font-bold mt-4">-</span>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">To Date</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="text-sm font-bold text-slate-800 bg-white border border-slate-300 rounded px-2 py-1 outline-none" />
          </div>
          <button onClick={onClose} className="mt-4 ml-2 bg-slate-800 text-white px-3 py-1.5 rounded font-bold text-xs hover:bg-slate-700 shadow-sm transition-colors">Close Ledger</button>
        </div>
      </div>

      {/* ======================================================== */}
      {/* SECTION 1: CRIME SUMMARY TABLES                          */}
      {/* ======================================================== */}
      <div className="space-y-6">
        <div className="bg-white shadow-xl overflow-hidden">
          <table className="w-full text-sm border-collapse border-2 border-slate-400 bg-white">
            <thead>
              <tr className="bg-[#b4c6e7] border-2 border-slate-400">
                <th colSpan="5" className="p-3 text-center font-extrabold text-slate-900 tracking-wide border-2 border-slate-400 text-[13px]">
                  SUMMARY OF CRIMES REGISTERED FROM {formatDateLabel(startDate)} TO {formatDateLabel(endDate)}
                </th>
              </tr>
              <tr className="bg-slate-100 text-slate-800">
                <th className="p-2 text-center font-bold border-2 border-slate-400 w-32 uppercase text-xs">REGION</th>
                <th className="p-2 text-center font-bold border-2 border-slate-400 w-12 uppercase text-xs">NO</th>
                <th className="p-2 text-left font-bold border-2 border-slate-400 uppercase text-xs">OFFENCE/INCIDENT</th>
                <th className="p-2 text-center font-bold border-2 border-slate-400 w-32 uppercase text-xs leading-tight">NUMBER OF<br/>CASES</th>
                <th className="p-2 text-center font-bold border-2 border-slate-400 w-32 uppercase text-xs leading-tight">SUSPECTS IN<br/>CUSTODY</th>
              </tr>
            </thead>
            <tbody>
              {dataMapping.sortedCrimeRegions.map(region => {
                const offences = Object.keys(dataMapping.crimeRegional[region]);
                let regCases = 0; let regSuspects = 0;
                const rows = offences.map((off, idx) => {
                    const data = dataMapping.crimeRegional[region][off];
                    regCases += data.cases; regSuspects += data.suspects;
                    return (
                      <tr key={`crime-${region}-${off}`} className="hover:bg-slate-50 transition-colors">
                        {idx === 0 && (
                          <td rowSpan={offences.length} className="px-3 py-2 border-2 border-slate-400 align-middle font-bold text-center bg-white text-slate-900">{region}</td>
                        )}
                        <td className="px-3 py-1.5 border border-slate-400 text-center text-slate-600 font-medium">{getRoman(idx + 1)}.</td>
                        <td className="px-3 py-1.5 border border-slate-400 text-slate-800 text-xs font-semibold uppercase">{off}</td>
                        <td className="px-3 py-1.5 border border-slate-400 text-center font-bold">{data.cases}</td>
                        <td className="px-3 py-1.5 border border-slate-400 text-center font-bold">{data.suspects}</td>
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
                <tr><td colSpan="5" className="text-center py-6 text-gray-500 italic">No crimes registered in this period.</td></tr>
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
                    GENERAL CRIME SUMMARY
                  </th>
                </tr>
                <tr className="bg-slate-100 text-slate-800">
                  <th className="p-2 text-center font-bold border-2 border-slate-400 w-16 uppercase text-xs">NO</th>
                  <th className="p-2 text-left font-bold border-2 border-slate-400 uppercase text-xs">OFFENCES</th>
                  <th className="p-2 text-center font-bold border-2 border-slate-400 w-40 uppercase text-xs leading-tight">NUMBER OF CASES</th>
                  <th className="p-2 text-center font-bold border-2 border-slate-400 w-40 uppercase text-xs leading-tight">SUSPECTS IN<br/>CUSTODY</th>
                </tr>
              </thead>
              <tbody>
                {Object.keys(dataMapping.crimeGeneral).map((off, idx) => {
                  const data = dataMapping.crimeGeneral[off];
                  return (
                      <tr key={`gen-crime-${off}`} className="hover:bg-slate-50 transition-colors">
                        <td className="px-3 py-1.5 border border-slate-400 text-center text-slate-600 font-medium">{idx + 1}</td>
                        <td className="px-3 py-1.5 border border-slate-400 text-slate-800 text-xs font-semibold uppercase">{off}</td>
                        <td className="px-3 py-1.5 border border-slate-400 text-center font-bold">{data.cases}</td>
                        <td className="px-3 py-1.5 border border-slate-400 text-center font-bold">{data.suspects}</td>
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
                const data = dataMapping.opsRegional[region];
                return (
                  <tr key={`ops-${region}`} className="hover:bg-slate-50 transition-colors">
                    <td className="px-2 py-2 border border-slate-400 text-center font-bold text-slate-900 text-xs">{region}</td>
                    <td className="px-2 py-2 border border-slate-400 text-center font-bold">{data.arrested}</td>
                    <td className="px-2 py-2 border border-slate-400 text-center font-bold">{data.given_bond}</td>
                    <td className="px-2 py-2 border border-slate-400 text-center font-bold">{data.cautioned}</td>
                    <td className="px-2 py-2 border border-slate-400 text-center font-bold">{data.pending_court}</td>
                    <td className="px-2 py-2 border border-slate-400 text-center font-bold">{data.taken_to_court}</td>
                    <td className="px-2 py-2 border border-slate-400 text-center font-bold">{data.released}</td>
                    <td className="px-2 py-2 border border-slate-400 text-center font-bold text-red-700">{data.remanded}</td>
                    <td className="px-2 py-2 border border-slate-400 text-center font-bold text-purple-700">{data.convicted}</td>
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
                  <td className="px-2 py-3 border border-slate-400 text-center uppercase tracking-wide text-xs">ALL KMP REGIONS</td>
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