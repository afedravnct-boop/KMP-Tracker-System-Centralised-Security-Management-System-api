import React, { useMemo } from 'react';
import { Users, Building, X, ShieldAlert, Upload } from 'lucide-react';

// Standard UPF hierarchy to ensure ranks sort from highest to lowest
const UPF_RANKS = [
  'IGP', 'DIGP', 'AIGP', 'SCP', 'CP', 'ACP', 'SSP', 'SP', 'ASP', 
  'IP', 'AIP', 'SGT', 'CPL', 'PC', 'SPC'
];

const HrEstablishmentsLedger = ({ data, onClose }) => {
  // Establishments data fallback
  const estData = data?.establishments || [];

  // =================================================================
  // AGGREGATION LOGIC: Process raw HR data into Regional Summaries
  // =================================================================
  const manpowerAggregates = useMemo(() => {
    const hrRecords = data?.hr || [];
    if (hrRecords.length === 0) return { regions: [], grandTotal: 0 };

    const grouped = {};
    let totalActive = 0;

    hrRecords.forEach(person => {
      // Standardize region name
      const region = person.region ? person.region.toUpperCase() : 'UNASSIGNED';
      
      if (!grouped[region]) {
        grouped[region] = {
          region: region,
          total: 0,
          ranks: {},
          sex: { M: 0, F: 0 },
          ages: { '20-29': 0, '30-39': 0, '40-49': 0, '50+': 0, 'Unknown': 0 },
          education: {}
        };
      }

      const grp = grouped[region];
      grp.total += 1;
      totalActive += 1;

      // 1. Compile Ranks
      const rank = person.rank ? person.rank.toUpperCase() : 'UNKNOWN';
      grp.ranks[rank] = (grp.ranks[rank] || 0) + 1;

      // 2. Compile Sex
      const sex = person.sex ? person.sex.toUpperCase().charAt(0) : '?';
      if (sex === 'M' || sex === 'F') {
        grp.sex[sex] += 1;
      }

      // 3. Compile Age Brackets
      const age = parseInt(person.age);
      if (!isNaN(age)) {
        if (age < 30) grp.ages['20-29'] += 1;
        else if (age < 40) grp.ages['30-39'] += 1;
        else if (age < 50) grp.ages['40-49'] += 1;
        else grp.ages['50+'] += 1;
      } else {
        grp.ages['Unknown'] += 1;
      }

      // 4. Compile Education
      const edu = person.educ_level ? person.educ_level.toUpperCase() : 'N/A';
      grp.education[edu] = (grp.education[edu] || 0) + 1;
    });

    // Sort regions alphabetically, then sort ranks internally by UPF hierarchy
    const formattedRegions = Object.values(grouped).sort((a, b) => a.region.localeCompare(b.region)).map(reg => {
      const sortedRanks = Object.entries(reg.ranks).sort((a, b) => {
        const idxA = UPF_RANKS.indexOf(a[0]);
        const idxB = UPF_RANKS.indexOf(b[0]);
        if (idxA === -1) return 1;
        if (idxB === -1) return -1;
        return idxA - idxB;
      });

      return { ...reg, sortedRanks };
    });

    return { regions: formattedRegions, grandTotal: totalActive };
  }, [data?.hr]);

  return (
    <div className="mt-6 bg-white p-6 rounded-xl shadow-lg border border-gray-200 animate-in fade-in duration-300 relative z-10 max-w-[1400px] mx-auto">
      <div className="flex justify-between items-center mb-6 pb-4 border-b">
        <div>
          <h2 className="text-2xl font-extrabold text-gray-800 tracking-tight">HR & Establishments Master Ledger</h2>
          <p className="text-sm font-bold text-gray-500 mt-1 uppercase tracking-wider">Cross-Referenced Structure & Personnel Data</p>
        </div>
        <button onClick={onClose} className="text-gray-600 hover:text-white hover:bg-slate-800 font-bold px-5 py-2.5 border border-gray-300 rounded-lg transition-colors flex items-center shadow-sm cursor-pointer">
          <X size={16} className="mr-2" /> Close Master View
        </button>
      </div>

      <div className="flex flex-col space-y-10">
        
        {/* ========================================= */}
        {/* TABLE 1: HR NOMINAL ROLL SUMMARY          */}
        {/* ========================================= */}
        <div>
          <h3 className="text-lg font-bold text-blue-900 mb-3 bg-blue-50 border border-blue-100 p-3 rounded-t-lg flex items-center">
            <Users size={18} className="mr-2"/> Nominal Roll Aggregates (Manpower Summary)
          </h3>
          <div className="overflow-x-auto shadow-sm ring-1 ring-black ring-opacity-5 rounded-b-lg custom-scrollbar pb-2">
            <table className="min-w-full divide-y divide-gray-200 table-auto border-collapse">
              <thead className="bg-slate-100">
                <tr>
                  <th className="px-4 py-3 text-left text-[10px] font-extrabold text-gray-600 uppercase tracking-wider border-r border-gray-200">SN</th>
                  <th className="px-4 py-3 text-left text-[10px] font-extrabold text-gray-600 uppercase tracking-wider border-r border-gray-200">Region</th>
                  <th className="px-4 py-3 text-left text-[10px] font-extrabold text-gray-600 uppercase tracking-wider border-r border-gray-200">Rank Breakdown</th>
                  <th className="px-4 py-3 text-left text-[10px] font-extrabold text-gray-600 uppercase tracking-wider border-r border-gray-200">Age Demographics</th>
                  <th className="px-4 py-3 text-center text-[10px] font-extrabold text-gray-600 uppercase tracking-wider border-r border-gray-200">Sex Ratio</th>
                  <th className="px-4 py-3 text-left text-[10px] font-extrabold text-gray-600 uppercase tracking-wider border-r border-gray-200">Education Base</th>
                  <th className="px-4 py-3 text-center text-[10px] font-extrabold text-white bg-blue-800 uppercase tracking-wider border-l border-blue-900">Sub-Total</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {manpowerAggregates.regions.map((reg, index) => (
                  <tr key={reg.region} className="hover:bg-blue-50 transition-colors">
                    {/* Serial Number */}
                    <td className="px-4 py-3 text-xs font-bold text-gray-500 border-r border-gray-100 align-top pt-4">
                      {index + 1}
                    </td>
                    
                    {/* Region Name */}
                    <td className="px-4 py-3 text-sm font-black text-blue-800 border-r border-gray-100 align-top pt-4">
                      {reg.region}
                    </td>
                    
                    {/* Formatted Ranks (Highest to Lowest) */}
                    <td className="px-4 py-3 text-[11px] font-medium text-gray-700 max-w-xs leading-relaxed border-r border-gray-100 align-top">
                      <div className="flex flex-wrap gap-1">
                        {reg.sortedRanks.map(([rank, count]) => (
                          <span key={rank} className="inline-block bg-slate-100 border border-slate-300 rounded px-1.5 py-0.5 font-bold">
                            {rank}: <span className="text-blue-700">{count}</span>
                          </span>
                        ))}
                      </div>
                    </td>
                    
                    {/* Age Brackets */}
                    <td className="px-4 py-3 text-[11px] font-medium text-gray-700 border-r border-gray-100 align-top">
                      {Object.entries(reg.ages).filter(([_, count]) => count > 0).map(([bracket, count]) => (
                        <div key={bracket} className="flex justify-between w-24 mb-0.5 border-b border-gray-50 pb-0.5">
                          <span>{bracket} yrs:</span> <span className="font-bold text-gray-900">{count}</span>
                        </div>
                      ))}
                    </td>
                    
                    {/* Sex Metrics */}
                    <td className="px-4 py-3 whitespace-nowrap text-xs font-extrabold text-center border-r border-gray-100 align-top pt-4">
                      <span className="text-blue-600 bg-blue-50 px-2 py-1 rounded border border-blue-100">M: {reg.sex.M}</span> 
                      <span className="mx-1"></span> 
                      <span className="text-rose-600 bg-rose-50 px-2 py-1 rounded border border-rose-100">F: {reg.sex.F}</span>
                    </td>
                    
                    {/* Education Breakdown */}
                    <td className="px-4 py-3 text-[11px] font-medium text-gray-700 border-r border-gray-100 align-top">
                      {Object.entries(reg.education).map(([edu, count]) => (
                        <div key={edu} className="truncate max-w-[140px] mb-0.5 border-b border-gray-50 pb-0.5" title={edu}>
                          <span className="font-bold text-gray-900">{count}</span> - {edu}
                        </div>
                      ))}
                    </td>
                    
                    {/* Sub-Total for Region */}
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-extrabold text-center text-blue-900 bg-blue-50 border-l border-blue-100 align-middle">
                      {reg.total}
                    </td>
                  </tr>
                ))}
                
                {/* Fallback if no HR data */}
                {manpowerAggregates.regions.length === 0 && (
                  <tr>
                    <td colSpan="7" className="text-center py-6 text-sm text-gray-500">
                      No personnel records found to aggregate.
                    </td>
                  </tr>
                )}
              </tbody>
              
              {/* Grand Total Row */}
              {manpowerAggregates.regions.length > 0 && (
                <tfoot className="bg-slate-800 border-t-2 border-slate-900">
                  <tr>
                    <td colSpan="6" className="px-4 py-4 text-right text-xs font-extrabold text-white uppercase tracking-wider border-r border-slate-700">
                      Grand Total Active Personnel:
                    </td>
                    <td className="px-4 py-4 text-center text-base font-extrabold text-yellow-400 border-l border-slate-600">
                      {manpowerAggregates.grandTotal}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

        {/* ========================================= */}
        {/* TABLE 2: ESTABLISHMENTS SUMMARY           */}
        {/* ========================================= */}
        <div>
          <h3 className="text-lg font-bold text-emerald-900 mb-3 bg-emerald-50 border border-emerald-100 p-3 rounded-t-lg flex items-center">
            <Building size={18} className="mr-2"/> Police Establishments
          </h3>
          <div className="overflow-x-auto shadow-sm ring-1 ring-black ring-opacity-5 rounded-b-lg custom-scrollbar pb-2">
            <table className="min-w-full divide-y divide-gray-200 table-auto border-collapse">
              <thead className="bg-slate-100">
                <tr>
                  <th className="px-2 py-3 text-left text-[10px] font-extrabold text-gray-600 uppercase tracking-wider border-r border-gray-200">SN</th>
                  <th className="px-2 py-3 text-left text-[10px] font-extrabold text-gray-600 uppercase tracking-wider border-r border-gray-200">Region</th>
                  <th className="px-2 py-3 text-left text-[10px] font-extrabold text-gray-600 uppercase tracking-wider border-r border-gray-200">Division</th>
                  <th className="px-2 py-3 text-left text-[10px] font-extrabold text-gray-600 uppercase tracking-wider border-r border-gray-200">Station</th>
                  <th className="px-2 py-3 text-center text-[10px] font-extrabold text-emerald-700 bg-emerald-50 uppercase tracking-wider border-r border-gray-200">Pers<br/>(STN)</th>
                  <th className="px-2 py-3 text-left text-[10px] font-extrabold text-gray-600 uppercase tracking-wider border-r border-gray-200">Sub-Station</th>
                  <th className="px-2 py-3 text-left text-[10px] font-extrabold text-gray-600 uppercase tracking-wider border-r border-gray-200">Post</th>
                  <th className="px-2 py-3 text-center text-[10px] font-extrabold text-emerald-700 bg-emerald-50 uppercase tracking-wider">Pers<br/>(POST)</th>
                  <th className="px-2 py-3 text-center text-[10px] font-extrabold text-white bg-emerald-800 uppercase tracking-wider border-l border-emerald-900">Total<br/>Personnel</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {estData.map((row, index) => (
                  <tr key={`est-${index}`} className="hover:bg-slate-50 transition-colors">
                    <td className="px-2 py-2 text-xs font-bold text-gray-500 border-r border-gray-100">{index + 1}</td>
                    <td className="px-2 py-2 text-xs font-bold text-emerald-800 border-r border-gray-100">{row.region}</td>
                    <td className="px-2 py-2 text-xs font-bold text-gray-800 border-r border-gray-100">{row.division}</td>
                    <td className="px-2 py-2 text-xs font-medium text-gray-700 border-r border-gray-100">{row.station}</td>
                    <td className="px-2 py-2 text-xs text-center font-extrabold text-emerald-800 bg-emerald-50/50 border-r border-gray-100">{row.pers_stn || "-"}</td>
                    <td className="px-2 py-2 text-xs font-medium text-gray-600 border-r border-gray-100">{row.sub_station}</td>
                    <td className="px-2 py-2 text-xs font-medium text-gray-600 border-r border-gray-100">{row.post}</td>
                    <td className="px-2 py-2 text-xs text-center font-extrabold text-emerald-800 bg-emerald-50/50">{row.pers_post || "-"}</td>
                    <td className="px-2 py-2 text-sm text-center font-extrabold text-emerald-900 bg-emerald-50 border-l border-emerald-100">{row.sub_total}</td>
                  </tr>
                ))}
                {estData.length === 0 && (
                  <tr><td colSpan="9" className="text-center py-6 text-sm text-gray-500">No establishments recorded.</td></tr>
                )}
              </tbody>
              {estData.length > 0 && (
                <tfoot className="bg-slate-800 border-t-2 border-slate-900">
                  <tr>
                    <td colSpan="4" className="px-4 py-3 text-right text-xs font-extrabold text-white uppercase tracking-wider border-r border-slate-700">Totals:</td>
                    <td className="px-2 py-3 text-center text-sm font-extrabold text-emerald-300 border-r border-slate-700">
                      {estData.reduce((sum, row) => sum + (row.pers_stn || 0), 0)}
                    </td>
                    <td className="border-r border-slate-700"></td>
                    <td className="border-r border-slate-700"></td>
                    <td className="px-2 py-3 text-center text-sm font-extrabold text-emerald-300 border-r border-slate-700">
                      {estData.reduce((sum, row) => sum + (row.pers_post || 0), 0)}
                    </td>
                    <td className="px-2 py-3 text-center text-base font-extrabold text-yellow-400 border-l border-emerald-900">
                      {estData.reduce((sum, row) => sum + (row.sub_total || 0), 0)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

      </div>
    </div>
  );
};

export default HrEstablishmentsLedger;