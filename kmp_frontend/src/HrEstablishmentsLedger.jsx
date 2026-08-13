import React, { useMemo } from 'react';
import { Users, Building, X, ShieldAlert, Upload } from 'lucide-react';

const HrEstablishmentsLedger = ({ data, onClose }) => {
  const estData = data?.establishments || [];

  // =================================================================
  // AGGREGATION LOGIC: Process raw HR data into Officers & NCOs Matrices
  // =================================================================
  const manpowerAggregates = useMemo(() => {
    // 🟢 FIXED: Check all potential data properties to correctly catch nominal roll records
    const hrRecords = data?.hr || data?.nominal_rolls || data?.nominalRolls || [];
    
    // Blank template for statistical buckets
    const getBlankStats = () => ({
      total: 0,
      ages: { '18-35': 0, '36-45': 0, '46-50': 0, '51-55': 0, '56-60': 0, 'Unknown': 0 },
      sex: { M: 0, F: 0 },
      edu: { 'Bachelors': 0, 'Diplomas': 0, 'Certificates': 0, 'Others': 0 }
    });

    const grouped = {};
    const grandTotals = {
      officers: getBlankStats(),
      ncos: getBlankStats(),
      total: 0
    };

    if (hrRecords.length === 0) return { regions: [], grandTotals };

    // Classification Helpers
    const isOfficer = (rankStr) => {
      if (!rankStr) return false;
      const clean = rankStr.toUpperCase().trim().replace('D/', '');
      const officers = ['IGP', 'DIGP', 'AIGP', 'SCP', 'CP', 'ACP', 'SSP', 'SP', 'ASP', 'IP', 'AIP'];
      return officers.includes(clean);
    };

    const getAgeBracket = (dobStr) => {
      if (!dobStr) return 'Unknown';
      const birthYear = new Date(dobStr).getFullYear();
      if (isNaN(birthYear)) return 'Unknown';
      
      const age = new Date().getFullYear() - birthYear;
      if (age >= 18 && age <= 35) return '18-35';
      if (age >= 36 && age <= 45) return '36-45';
      if (age >= 46 && age <= 50) return '46-50';
      if (age >= 51 && age <= 55) return '51-55';
      if (age >= 56 && age <= 60) return '56-60';
      return 'Unknown';
    };

    const getEduBucket = (eduStr) => {
      if (!eduStr) return 'Others';
      const up = eduStr.toUpperCase();
      if (up.includes('BACHELOR') || up.includes('DEGREE') || up.includes('B.A') || up.includes('B.SC') || up.includes('BSC') || up.includes('LLB') || up.includes('BBA')) return 'Bachelors';
      if (up.includes('DIPLOMA') || up.includes('DIP')) return 'Diplomas';
      if (up.includes('CERTIFICATE') || up.includes('CERT')) return 'Certificates';
      return 'Others';
    };

    // Process all personnel records
    hrRecords.forEach(person => {
      const region = person.region ? person.region.toUpperCase() : 'UNASSIGNED';
      
      if (!grouped[region]) {
        grouped[region] = {
          region: region,
          officers: getBlankStats(),
          ncos: getBlankStats(),
          total: 0
        };
      }

      const grp = grouped[region];
      const isOff = isOfficer(person.rank);
      
      // Select the correct bucket for the region
      const target = isOff ? grp.officers : grp.ncos;
      // Select the correct bucket for the KMP Grand Totals
      const globalTarget = isOff ? grandTotals.officers : grandTotals.ncos;

      // 1. Increment Totals
      target.total += 1;
      grp.total += 1;
      globalTarget.total += 1;
      grandTotals.total += 1;

      // 2. Compile Ages
      const ageBracket = getAgeBracket(person.dob);
      target.ages[ageBracket] += 1;
      globalTarget.ages[ageBracket] += 1;

      // 3. Compile Sex
      const sex = person.sex ? person.sex.toUpperCase().charAt(0) : '?';
      if (sex === 'M' || sex === 'F') {
        target.sex[sex] += 1;
        globalTarget.sex[sex] += 1;
      }

      // 4. Compile Education
      const eduBucket = getEduBucket(person.educlevel || person.educ_level);
      target.edu[eduBucket] += 1;
      globalTarget.edu[eduBucket] += 1;
    });

    const formattedRegions = Object.values(grouped).sort((a, b) => a.region.localeCompare(b.region));

    return { regions: formattedRegions, grandTotals };
  }, [data]);

  // UI Render Helpers for inner cells
  const renderAges = (ages) => (
    <div className="flex flex-col gap-1 w-full text-[10px]">
      {Object.entries(ages).filter(([_, count]) => count > 0).map(([bracket, count]) => (
        <div key={bracket} className="flex justify-between border-b border-slate-100 last:border-0 pb-0.5">
          <span className="text-slate-500">{bracket}:</span> 
          <span className="font-extrabold text-slate-800">{count}</span>
        </div>
      ))}
    </div>
  );

  const renderSex = (sex) => (
    <div className="flex flex-col gap-1.5 text-[10px] font-bold w-full">
      <div className="text-blue-700 bg-blue-50/50 px-1 py-0.5 rounded border border-blue-100 flex justify-between"><span>M:</span> <span>{sex.M}</span></div>
      <div className="text-rose-700 bg-rose-50/50 px-1 py-0.5 rounded border border-rose-100 flex justify-between"><span>F:</span> <span>{sex.F}</span></div>
    </div>
  );

  const renderEdu = (edu) => (
    <div className="flex flex-col gap-1 w-full text-[10px]">
      {Object.entries(edu).filter(([_, count]) => count > 0).map(([bucket, count]) => (
        <div key={bucket} className="flex justify-between border-b border-slate-100 last:border-0 pb-0.5">
          <span className="text-slate-500 truncate mr-1" title={bucket}>{bucket}:</span> 
          <span className="font-extrabold text-slate-800">{count}</span>
        </div>
      ))}
    </div>
  );

  return (
    <div className="mt-6 bg-white p-6 rounded-xl shadow-lg border border-gray-200 animate-in fade-in duration-300 relative z-10 max-w-[1600px] mx-auto">
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
        {/* TABLE 1: HR NOMINAL ROLL SUMMARY         */}
        {/* ========================================= */}
        <div>
          <h3 className="text-lg font-bold text-blue-900 mb-3 bg-blue-50 border border-blue-100 p-3 rounded-t-lg flex items-center">
            <Users size={18} className="mr-2"/> Nominal Roll Aggregates (Manpower Summary)
          </h3>
          <div className="overflow-x-auto shadow-sm ring-1 ring-black ring-opacity-5 rounded-b-lg custom-scrollbar pb-2">
            <table className="min-w-full divide-y divide-gray-200 table-auto border-collapse">
              <thead className="bg-slate-100">
                {/* Primary Header Row */}
                <tr>
                  <th rowSpan="2" className="px-3 py-2 text-left text-[10px] font-extrabold text-gray-600 uppercase tracking-wider border-r border-b border-gray-200 align-bottom w-12">SN</th>
                  <th rowSpan="2" className="px-3 py-2 text-left text-[10px] font-extrabold text-gray-600 uppercase tracking-wider border-r border-b border-gray-200 align-bottom w-32">Region</th>
                  <th colSpan="2" className="px-3 py-2 text-center text-[10px] font-extrabold text-gray-800 uppercase tracking-wider border-r border-b border-gray-300 bg-slate-200/50">Rank Total</th>
                  <th colSpan="2" className="px-3 py-2 text-center text-[10px] font-extrabold text-gray-800 uppercase tracking-wider border-r border-b border-gray-300 bg-slate-200/50">Age Demographics</th>
                  <th colSpan="2" className="px-3 py-2 text-center text-[10px] font-extrabold text-gray-800 uppercase tracking-wider border-r border-b border-gray-300 bg-slate-200/50 w-32">Sex Ratio</th>
                  <th colSpan="2" className="px-3 py-2 text-center text-[10px] font-extrabold text-gray-800 uppercase tracking-wider border-r border-b border-gray-300 bg-slate-200/50">Education Base</th>
                  <th colSpan="3" className="px-3 py-2 text-center text-[10px] font-extrabold text-white uppercase tracking-wider border-b border-blue-900 bg-blue-800">Sub-Totals</th>
                </tr>
                {/* Secondary Header Row (Officers vs NCOs) */}
                <tr>
                  <th className="px-2 py-2 text-center text-[9px] font-extrabold text-blue-700 uppercase tracking-wider border-r border-b border-gray-200">Officers</th>
                  <th className="px-2 py-2 text-center text-[9px] font-extrabold text-emerald-700 uppercase tracking-wider border-r border-b border-gray-200">NCOs</th>
                  
                  <th className="px-2 py-2 text-center text-[9px] font-extrabold text-blue-700 uppercase tracking-wider border-r border-b border-gray-200">Officers</th>
                  <th className="px-2 py-2 text-center text-[9px] font-extrabold text-emerald-700 uppercase tracking-wider border-r border-b border-gray-200">NCOs</th>
                  
                  <th className="px-2 py-2 text-center text-[9px] font-extrabold text-blue-700 uppercase tracking-wider border-r border-b border-gray-200">Officers</th>
                  <th className="px-2 py-2 text-center text-[9px] font-extrabold text-emerald-700 uppercase tracking-wider border-r border-b border-gray-200">NCOs</th>
                  
                  <th className="px-2 py-2 text-center text-[9px] font-extrabold text-blue-700 uppercase tracking-wider border-r border-b border-gray-200">Officers</th>
                  <th className="px-2 py-2 text-center text-[9px] font-extrabold text-emerald-700 uppercase tracking-wider border-r border-b border-gray-200">NCOs</th>
                  
                  <th className="px-2 py-2 text-center text-[9px] font-extrabold text-blue-100 bg-blue-700 uppercase tracking-wider border-r border-b border-blue-800">Total OFF</th>
                  <th className="px-2 py-2 text-center text-[9px] font-extrabold text-emerald-100 bg-emerald-700 uppercase tracking-wider border-r border-b border-emerald-800">Total NCO</th>
                  <th className="px-2 py-2 text-center text-[10px] font-extrabold text-white bg-slate-900 uppercase tracking-wider border-b border-slate-950">Region Total</th>
                </tr>
              </thead>
              
              <tbody className="bg-white divide-y divide-gray-200">
                {manpowerAggregates.regions.map((reg, index) => (
                  <tr key={reg.region} className="hover:bg-blue-50/30 transition-colors">
                    <td className="px-3 py-3 text-xs font-bold text-gray-500 border-r border-gray-100 align-top">{index + 1}</td>
                    <td className="px-3 py-3 text-xs font-black text-blue-900 border-r border-gray-100 align-top">{reg.region}</td>
                    
                    {/* Rank Breakdowns */}
                    <td className="px-3 py-3 text-sm font-black text-blue-600 text-center border-r border-gray-100 align-top bg-blue-50/20">{reg.officers.total}</td>
                    <td className="px-3 py-3 text-sm font-black text-emerald-600 text-center border-r border-gray-200 align-top bg-emerald-50/20">{reg.ncos.total}</td>
                    
                    {/* Age Demographics */}
                    <td className="px-3 py-3 align-top border-r border-gray-100">{renderAges(reg.officers.ages)}</td>
                    <td className="px-3 py-3 align-top border-r border-gray-200">{renderAges(reg.ncos.ages)}</td>
                    
                    {/* Sex Ratio */}
                    <td className="px-2 py-3 align-top border-r border-gray-100">{renderSex(reg.officers.sex)}</td>
                    <td className="px-2 py-3 align-top border-r border-gray-200">{renderSex(reg.ncos.sex)}</td>
                    
                    {/* Education Base */}
                    <td className="px-3 py-3 align-top border-r border-gray-100">{renderEdu(reg.officers.edu)}</td>
                    <td className="px-3 py-3 align-top border-r border-gray-200">{renderEdu(reg.ncos.edu)}</td>
                    
                    {/* Sub-Totals */}
                    <td className="px-3 py-3 text-sm font-black text-blue-800 text-center border-r border-blue-100 align-middle bg-blue-50/50">{reg.officers.total}</td>
                    <td className="px-3 py-3 text-sm font-black text-emerald-800 text-center border-r border-emerald-100 align-middle bg-emerald-50/50">{reg.ncos.total}</td>
                    <td className="px-3 py-3 text-base font-black text-slate-900 text-center border-l-2 border-slate-200 align-middle bg-slate-100">{reg.total}</td>
                  </tr>
                ))}

                {manpowerAggregates.regions.length === 0 && (
                  <tr><td colSpan="13" className="text-center py-6 text-sm text-gray-500">No personnel records found to aggregate.</td></tr>
                )}
              </tbody>
              
              {/* Grand Total KMP Row */}
              {manpowerAggregates.regions.length > 0 && (
                <tfoot className="bg-slate-800 border-t-[3px] border-slate-900">
                  <tr>
                    <td colSpan="2" className="px-4 py-4 text-right text-sm font-black text-white uppercase tracking-wider border-r border-slate-700">KMP Master Totals:</td>
                    
                    <td className="px-3 py-4 text-center text-sm font-black text-blue-300 border-r border-slate-700">{manpowerAggregates.grandTotals.officers.total}</td>
                    <td className="px-3 py-4 text-center text-sm font-black text-emerald-300 border-r border-slate-700">{manpowerAggregates.grandTotals.ncos.total}</td>
                    
                    <td className="px-3 py-4 border-r border-slate-700"><div className="text-slate-300 opacity-90">{renderAges(manpowerAggregates.grandTotals.officers.ages)}</div></td>
                    <td className="px-3 py-4 border-r border-slate-700"><div className="text-slate-300 opacity-90">{renderAges(manpowerAggregates.grandTotals.ncos.ages)}</div></td>
                    
                    <td className="px-2 py-4 border-r border-slate-700"><div className="text-slate-300 opacity-90">{renderSex(manpowerAggregates.grandTotals.officers.sex)}</div></td>
                    <td className="px-2 py-4 border-r border-slate-700"><div className="text-slate-300 opacity-90">{renderSex(manpowerAggregates.grandTotals.ncos.sex)}</div></td>
                    
                    <td className="px-3 py-4 border-r border-slate-700"><div className="text-slate-300 opacity-90">{renderEdu(manpowerAggregates.grandTotals.officers.edu)}</div></td>
                    <td className="px-3 py-4 border-r border-slate-700"><div className="text-slate-300 opacity-90">{renderEdu(manpowerAggregates.grandTotals.ncos.edu)}</div></td>

                    <td className="px-3 py-4 text-center text-base font-black text-blue-400 bg-blue-900 border-r border-slate-700">{manpowerAggregates.grandTotals.officers.total}</td>
                    <td className="px-3 py-4 text-center text-base font-black text-emerald-400 bg-emerald-900 border-r border-slate-700">{manpowerAggregates.grandTotals.ncos.total}</td>
                    <td className="px-4 py-4 text-center text-lg font-black text-yellow-400 bg-slate-900 border-l border-slate-700">{manpowerAggregates.grandTotals.total}</td>
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