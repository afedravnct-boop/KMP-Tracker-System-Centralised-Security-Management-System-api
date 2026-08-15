import React, { useMemo } from 'react';
import { X, Shield, FileText, Users, Building } from 'lucide-react';

const HrEstablishmentsLedger = ({ data, onClose, currentUser }) => {
  
  // 🟢 1. ROBUST PARSING LOGIC FOR NOMINAL ROLL AGGREGATES
  const nominalAggregates = useMemo(() => {
    // Safely grab the nominal roll array (handling multiple possible backend keys)
    const rawRoll = (data?.nominal_roll || data?.nominal_rolls || data?.Nominal_Rolls || data?.personnel || []).filter(p => {
        const statusStr = String(p.status || '').trim().toUpperCase();
        return statusStr !== 'ARCHIVED' && p.is_archived !== true;
    });
    
    const regions = [
      { key: 'GENERAL / HQ', match: ['HEADQUARTERS', 'HQ', 'GENERAL'] },
      { key: 'KMP EAST', match: ['KMP EAST', 'EAST'] },
      { key: 'KMP NORTH', match: ['KMP NORTH', 'NORTH'] },
      { key: 'KMP SOUTH', match: ['KMP SOUTH', 'SOUTH'] }
    ];

    // 🟢 FIX 1: Flawless Officer vs NCO Classification (IGP down to AIP)
    const isOfficer = (rankStr) => {
      if (!rankStr) return false;
      // Clean the rank string (e.g., "D/AIP" -> "DAIP", "A.I.P" -> "AIP")
      let cleanRank = String(rankStr).toUpperCase().replace(/[\.\/]/g, '').trim();
      const officerKeywords = ['IGP', 'DIGP', 'AIGP', 'SCP', 'CP', 'ACP', 'SSP', 'SP', 'ASP', 'IP', 'AIP', 'DAIP', 'DIP'];
      
      const words = cleanRank.split(/\s+/); 
      return words.some(word => officerKeywords.includes(word)) || 
             cleanRank.includes('INSPECTOR') || 
             cleanRank.includes('SUPERINTENDENT') || 
             cleanRank.includes('COMMISSIONER');
    };

    // Deep-parse the demographics safely, preventing null crashes
    const calculateStats = (personnelList) => {
      const stats = {
        total: personnelList.length,
        sex: { M: 0, F: 0 },
        age: { twenties: 0, thirties: 0, forties: 0, fifties: 0, unknown: 0 },
        edu: { degree: 0, diploma: 0, cert: 0, highschool: 0, others: 0 }
      };

      personnelList.forEach(p => {
        // 🟢 FIX 2: Sex Parsing - Checks explicit sex or infers from NIN (CM/CF)
        const sexStr = String(p.sex || p.gender || '').trim().toUpperCase();
        const ninStr = String(p.nin || '').trim().toUpperCase();
        
        if (sexStr === 'M' || sexStr === 'MALE' || ninStr.startsWith('CM')) {
            stats.sex.M++;
        } else if (sexStr === 'F' || sexStr === 'FEMALE' || ninStr.startsWith('CF')) {
            stats.sex.F++;
        } else {
            // Default to Male if completely blank to preserve headcount metrics
            stats.sex.M++; 
        }

        // 🟢 FIX 3: Age Parsing - Robust Date string extraction
        const dobStr = p.dob || p.date_of_birth || p.dateofbirth;
        let ageCalculated = false;
        
        if (dobStr) {
          let birthYear;
          const strVal = String(dobStr).trim();
          if (strVal.includes('-')) {
             const parts = strVal.split('-');
             birthYear = parts[0].length === 4 ? parseInt(parts[0], 10) : parseInt(parts[2], 10);
          } else if (strVal.includes('/')) {
             const parts = strVal.split('/');
             birthYear = parts[2].length === 4 ? parseInt(parts[2], 10) : parseInt(parts[0], 10);
          } else {
             birthYear = new Date(strVal).getFullYear();
          }

          const currentYear = new Date().getFullYear();
          if (!isNaN(birthYear) && birthYear > 1900 && birthYear <= currentYear) {
            const age = currentYear - birthYear;
            if (age >= 18 && age <= 29) { stats.age.twenties++; ageCalculated = true; }
            else if (age >= 30 && age <= 39) { stats.age.thirties++; ageCalculated = true; }
            else if (age >= 40 && age <= 49) { stats.age.forties++; ageCalculated = true; }
            else if (age >= 50) { stats.age.fifties++; ageCalculated = true; }
          }
        }
        
        if (!ageCalculated) {
            stats.age.unknown++;
        }

        // 🟢 FIX 4: Education Parsing - Broad Keyword tracking
        const eduStr = String(p.educ_level || p.educlevel || p.education || '').trim().toUpperCase();
        
        if (eduStr.includes('DEGREE') || eduStr.includes('BACHELOR') || eduStr.match(/\bB\.?A\b/) || eduStr.match(/\bB\.?SC\b/) || eduStr.includes('MASTER') || eduStr.includes('PHD')) {
            stats.edu.degree++;
        } else if (eduStr.includes('DIP') || eduStr.includes('ND') || eduStr.includes('DIPLOMA')) {
            stats.edu.diploma++;
        } else if (eduStr.includes('CERT')) {
            stats.edu.cert++;
        } else if (eduStr.includes('UACE') || eduStr.includes('UCE') || eduStr.includes('LEVEL') || eduStr.includes('S.4') || eduStr.includes('S.6') || eduStr.match(/\bS4\b/) || eduStr.match(/\bS6\b/)) {
            stats.edu.highschool++;
        } else {
            stats.edu.others++;
        }
      });

      return stats;
    };

    const aggregatedRegions = regions.map(reg => {
      const regionPersonnel = rawRoll.filter(p => {
        const pReg = String(p.region || '').trim().toUpperCase();
        return reg.match.some(m => pReg.includes(m));
      });

      const officers = regionPersonnel.filter(p => isOfficer(p.rank));
      const ncos = regionPersonnel.filter(p => !isOfficer(p.rank));

      return {
        region: reg.key,
        officers: calculateStats(officers),
        ncos: calculateStats(ncos),
        totalOff: officers.length,
        totalNco: ncos.length,
        regionTotal: regionPersonnel.length
      };
    });
    
    // Catch-all for personnel whose Region wasn't mapped cleanly
    const assignedIds = new Set();
    aggregatedRegions.forEach(r => {
        rawRoll.filter(p => regions.find(reg => reg.key === r.region)?.match.some(m => String(p.region || '').toUpperCase().includes(m)))
               .forEach(p => assignedIds.add(p.id || p.sn || p.fnum));
    });
    
    const unassigned = rawRoll.filter(p => !assignedIds.has(p.id || p.sn || p.fnum));
    if (unassigned.length > 0) {
        const officers = unassigned.filter(p => isOfficer(p.rank));
        const ncos = unassigned.filter(p => !isOfficer(p.rank));
        aggregatedRegions.push({
            region: 'OTHER / UNASSIGNED',
            officers: calculateStats(officers),
            ncos: calculateStats(ncos),
            totalOff: officers.length,
            totalNco: ncos.length,
            regionTotal: unassigned.length
        });
    }

    return aggregatedRegions;
  }, [data]);

  const masterTotals = useMemo(() => {
    return nominalAggregates.reduce((acc, curr) => {
      acc.totalOff += curr.totalOff;
      acc.totalNco += curr.totalNco;
      acc.regionTotal += curr.regionTotal;
      
      ['M', 'F'].forEach(s => {
         acc.offSex[s] += curr.officers.sex[s];
         acc.ncoSex[s] += curr.ncos.sex[s];
      });
      return acc;
    }, { totalOff: 0, totalNco: 0, regionTotal: 0, offSex: {M:0, F:0}, ncoSex: {M:0, F:0} });
  }, [nominalAggregates]);

  const estData = Array.isArray(data?.establishments) ? data.establishments : (Array.isArray(data?.Establishments) ? data.Establishments : []);
  const estTotals = estData.reduce((acc, curr) => {
      acc.station += (parseInt(curr.personnel_in_station, 10) || 0);
      acc.post += (parseInt(curr.personnel_in_post, 10) || 0);
      acc.booth += (parseInt(curr.personnel_in_booth, 10) || 0);
      return acc;
  }, { station: 0, post: 0, booth: 0 });

  // UI Block Renderers
  const renderAgeBlock = (stats) => (
    <div className="text-[9px] text-slate-600 font-medium space-y-0.5 w-full max-w-[90px] mx-auto">
      <div className="flex justify-between"><span>18-29yrs:</span> <strong className="text-slate-900">{stats.twenties}</strong></div>
      <div className="flex justify-between"><span>30-39yrs:</span> <strong className="text-slate-900">{stats.thirties}</strong></div>
      <div className="flex justify-between"><span>40-49yrs:</span> <strong className="text-slate-900">{stats.forties}</strong></div>
      <div className="flex justify-between border-t border-slate-200 pt-0.5 mt-0.5"><span>50+ yrs:</span> <strong className="text-slate-900">{stats.fifties}</strong></div>
      {stats.unknown > 0 && <div className="flex justify-between text-red-500 italic mt-0.5"><span>Unrecorded:</span> <strong>{stats.unknown}</strong></div>}
    </div>
  );

  const renderEduBlock = (stats) => (
    <div className="text-[9px] text-slate-600 font-medium space-y-0.5 w-full max-w-[90px] mx-auto">
      <div className="flex justify-between"><span>Degree:</span> <strong className="text-slate-900">{stats.degree}</strong></div>
      <div className="flex justify-between"><span>Diploma:</span> <strong className="text-slate-900">{stats.diploma}</strong></div>
      <div className="flex justify-between"><span>Certificate:</span> <strong className="text-slate-900">{stats.cert}</strong></div>
      <div className="flex justify-between border-t border-slate-200 pt-0.5 mt-0.5"><span>High Sch:</span> <strong className="text-slate-900">{stats.highschool}</strong></div>
      <div className="flex justify-between"><span>Others:</span> <strong className="text-slate-900">{stats.others}</strong></div>
    </div>
  );

  return (
    <div className="absolute inset-0 bg-slate-100 z-50 flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
      <div className="bg-slate-900 text-white px-6 py-4 flex justify-between items-center shadow-md shrink-0">
        <div>
          <h2 className="text-lg font-black flex items-center tracking-wide uppercase"><FileText className="mr-2 text-blue-400" /> Human Resource & Establishments Ledger</h2>
          <p className="text-xs text-slate-400 font-medium mt-1 tracking-wider">KMP Command Operational Aggregates</p>
        </div>
        <button onClick={onClose} className="bg-slate-800 hover:bg-slate-700 text-white p-2 rounded-lg transition-colors border border-slate-600 shadow-sm flex items-center">
          <X size={18} className="mr-2"/> Close Module
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-8 custom-scrollbar space-y-8 bg-slate-50">
        
        {/* NOMINAL ROLL AGGREGATES MATRIX */}
        <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden mx-auto max-w-[1400px]">
          <div className="bg-slate-100 px-4 py-3 border-b border-slate-200 flex justify-between items-center">
             <h3 className="font-extrabold text-blue-900 text-sm uppercase tracking-wider flex items-center">
               <Users className="mr-2 w-5 h-5" /> Nominal Roll Aggregates (Manpower Summary)
             </h3>
          </div>
          <div className="overflow-x-auto w-full p-0">
             <table className="min-w-full divide-y divide-slate-200 border-collapse table-fixed">
                <thead className="bg-slate-50">
                   <tr>
                      <th rowSpan="2" className="p-3 text-center text-[10px] font-black text-slate-600 uppercase border-r border-slate-200 w-[4%]">SN</th>
                      <th rowSpan="2" className="p-3 text-left text-[11px] font-black text-slate-600 uppercase border-r border-slate-200 w-[14%] bg-slate-100">REGION</th>
                      <th colSpan="2" className="p-2 text-center text-[10px] font-black text-slate-600 uppercase border-r border-slate-200">RANK TOTAL</th>
                      <th colSpan="2" className="p-2 text-center text-[10px] font-black text-slate-600 uppercase border-r border-slate-200 bg-slate-100">AGE DEMOGRAPHICS</th>
                      <th colSpan="2" className="p-2 text-center text-[10px] font-black text-slate-600 uppercase border-r border-slate-200">SEX RATIO</th>
                      <th colSpan="2" className="p-2 text-center text-[10px] font-black text-slate-600 uppercase border-r border-slate-200 bg-slate-100">EDUCATION BASE</th>
                      <th colSpan="3" className="p-3 text-center text-[11px] font-black text-white uppercase bg-blue-900 shadow-inner">SUB-TOTALS</th>
                   </tr>
                   <tr className="bg-white border-b-2 border-slate-300">
                      <th className="p-2 text-center text-[9px] font-extrabold text-blue-700 uppercase border-r border-slate-200">OFFICERS</th>
                      <th className="p-2 text-center text-[9px] font-extrabold text-green-700 uppercase border-r border-slate-200">NCOS</th>
                      <th className="p-2 text-center text-[9px] font-extrabold text-blue-700 uppercase border-r border-slate-200 bg-blue-50/30">OFFICERS</th>
                      <th className="p-2 text-center text-[9px] font-extrabold text-green-700 uppercase border-r border-slate-200 bg-green-50/30">NCOS</th>
                      <th className="p-2 text-center text-[9px] font-extrabold text-blue-700 uppercase border-r border-slate-200">OFFICERS</th>
                      <th className="p-2 text-center text-[9px] font-extrabold text-green-700 uppercase border-r border-slate-200">NCOS</th>
                      <th className="p-2 text-center text-[9px] font-extrabold text-blue-700 uppercase border-r border-slate-200 bg-blue-50/30">OFFICERS</th>
                      <th className="p-2 text-center text-[9px] font-extrabold text-green-700 uppercase border-r border-slate-200 bg-green-50/30">NCOS</th>
                      <th className="p-2 text-center text-[10px] font-black text-white bg-blue-800 border-r border-blue-900 shadow-inner">TOTAL OFF</th>
                      <th className="p-2 text-center text-[10px] font-black text-white bg-emerald-700 border-r border-emerald-800 shadow-inner">TOTAL NCO</th>
                      <th className="p-2 text-center text-[10px] font-black text-yellow-300 bg-slate-900 uppercase tracking-widest shadow-inner">REGION TOTAL</th>
                   </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-200">
                   {nominalAggregates.map((row, index) => (
                      <tr key={index} className="hover:bg-blue-50/50 transition-colors">
                         <td className="p-3 text-center text-xs font-bold text-slate-700 border-r border-slate-200">{index + 1}</td>
                         <td className="p-3 text-left text-xs font-black text-slate-900 border-r border-slate-200 bg-slate-50/50">{row.region}</td>
                         
                         <td className="p-3 text-center text-sm font-extrabold text-blue-700 border-r border-slate-200">{row.totalOff}</td>
                         <td className="p-3 text-center text-sm font-extrabold text-green-700 border-r border-slate-200">{row.totalNco}</td>
                         
                         <td className="p-2 align-top border-r border-slate-200 bg-blue-50/10">{renderAgeBlock(row.officers.age)}</td>
                         <td className="p-2 align-top border-r border-slate-200 bg-green-50/10">{renderAgeBlock(row.ncos.age)}</td>
                         
                         <td className="p-2 text-center align-middle border-r border-slate-200">
                            <div className="inline-flex flex-col space-y-1">
                               <span className="text-[10px] font-bold text-blue-800 bg-blue-100 px-2 rounded">M: {row.officers.sex.M}</span>
                               <span className="text-[10px] font-bold text-pink-700 bg-pink-100 px-2 rounded">F: {row.officers.sex.F}</span>
                            </div>
                         </td>
                         <td className="p-2 text-center align-middle border-r border-slate-200">
                            <div className="inline-flex flex-col space-y-1">
                               <span className="text-[10px] font-bold text-blue-800 bg-blue-100 px-2 rounded">M: {row.ncos.sex.M}</span>
                               <span className="text-[10px] font-bold text-pink-700 bg-pink-100 px-2 rounded">F: {row.ncos.sex.F}</span>
                            </div>
                         </td>

                         <td className="p-2 align-top border-r border-slate-200 bg-blue-50/10">{renderEduBlock(row.officers.edu)}</td>
                         <td className="p-2 align-top border-r border-slate-200 bg-green-50/10">{renderEduBlock(row.ncos.edu)}</td>
                         
                         <td className="p-3 text-center text-sm font-black text-blue-800 bg-blue-50 border-r border-blue-100 shadow-inner">{row.totalOff}</td>
                         <td className="p-3 text-center text-sm font-black text-emerald-800 bg-emerald-50 border-r border-emerald-100 shadow-inner">{row.totalNco}</td>
                         <td className="p-3 text-center text-base font-black text-slate-900 bg-slate-100 shadow-inner">{row.regionTotal}</td>
                      </tr>
                   ))}
                   {/* KMP MASTER TOTALS ROW */}
                   <tr className="bg-slate-800 border-t-[3px] border-slate-900">
                      <td colSpan="2" className="p-4 text-center text-[11px] font-black text-white uppercase tracking-widest border-r border-slate-700 shadow-inner">
                         KMP MASTER TOTALS:
                      </td>
                      <td className="p-4 text-center text-base font-black text-blue-300 border-r border-slate-700">{masterTotals.totalOff}</td>
                      <td className="p-4 text-center text-base font-black text-green-400 border-r border-slate-700">{masterTotals.totalNco}</td>
                      <td colSpan="2" className="p-4 text-center text-[10px] font-medium text-slate-400 border-r border-slate-700 bg-slate-900/50 italic">Full Age Demographic Analysis Processed</td>
                      <td className="p-2 text-center align-middle border-r border-slate-700 bg-slate-700/50">
                         <div className="inline-flex flex-col space-y-1">
                            <span className="text-[10px] font-bold text-blue-200 bg-blue-900/50 px-2 border border-blue-800 rounded shadow-sm">M: {masterTotals.offSex.M}</span>
                            <span className="text-[10px] font-bold text-pink-300 bg-pink-900/50 px-2 border border-pink-800 rounded shadow-sm">F: {masterTotals.offSex.F}</span>
                         </div>
                      </td>
                      <td className="p-2 text-center align-middle border-r border-slate-700 bg-slate-700/50">
                         <div className="inline-flex flex-col space-y-1">
                            <span className="text-[10px] font-bold text-blue-200 bg-blue-900/50 px-2 border border-blue-800 rounded shadow-sm">M: {masterTotals.ncoSex.M}</span>
                            <span className="text-[10px] font-bold text-pink-300 bg-pink-900/50 px-2 border border-pink-800 rounded shadow-sm">F: {masterTotals.ncoSex.F}</span>
                         </div>
                      </td>
                      <td colSpan="2" className="p-4 text-center text-[10px] font-medium text-slate-400 border-r border-slate-700 bg-slate-900/50 italic">Full Educational Base Analyzed</td>
                      <td className="p-4 text-center text-lg font-black text-white bg-blue-800 border-r border-blue-900 shadow-inner">{masterTotals.totalOff}</td>
                      <td className="p-4 text-center text-lg font-black text-white bg-emerald-700 border-r border-emerald-900 shadow-inner">{masterTotals.totalNco}</td>
                      <td className="p-4 text-center text-xl font-black text-yellow-400 bg-slate-950 shadow-inner">
                         {masterTotals.regionTotal}
                      </td>
                   </tr>
                </tbody>
             </table>
          </div>
        </div>

        {/* POLICE ESTABLISHMENTS MATRIX */}
        <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden mx-auto max-w-[1400px]">
          <div className="bg-slate-100 px-4 py-3 border-b border-slate-200 flex justify-between items-center">
             <h3 className="font-extrabold text-green-900 text-sm uppercase tracking-wider flex items-center">
               <Building className="mr-2 w-5 h-5" /> Police Establishments
             </h3>
          </div>
          <div className="overflow-x-auto w-full max-h-[500px] custom-scrollbar">
             <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50 sticky top-0 shadow-sm z-10">
                   <tr>
                      <th className="p-3 text-left text-[10px] font-black text-slate-600 uppercase">SN</th>
                      <th className="p-3 text-left text-[11px] font-black text-slate-600 uppercase bg-slate-100">REGION</th>
                      <th className="p-3 text-left text-[10px] font-black text-slate-600 uppercase">DIVISION</th>
                      <th className="p-3 text-left text-[10px] font-black text-slate-600 uppercase bg-slate-100">STATION</th>
                      <th className="p-3 text-center text-[10px] font-black text-slate-600 uppercase">PERS<br/>(STN)</th>
                      <th className="p-3 text-left text-[10px] font-black text-slate-600 uppercase bg-slate-100">SUB-STATION</th>
                      <th className="p-3 text-left text-[10px] font-black text-slate-600 uppercase">POST</th>
                      <th className="p-3 text-center text-[10px] font-black text-slate-600 uppercase bg-slate-100">PERS<br/>(POST)</th>
                      <th className="p-3 text-center text-[11px] font-black text-white uppercase bg-emerald-800 shadow-inner">TOTAL<br/>PERSONNEL</th>
                   </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-200">
                   {estData.map((e, idx) => {
                      const stn = parseInt(e.personnel_in_station, 10) || 0;
                      const sub = parseInt(e.personnel_in_sub_station, 10) || 0;
                      const pst = parseInt(e.personnel_in_post, 10) || 0;
                      const bth = parseInt(e.personnel_in_booth, 10) || 0;
                      const totalPerLocation = stn + sub + pst + bth;
                      
                      return (
                         <tr key={idx} className="hover:bg-emerald-50/40 transition-colors">
                            <td className="p-3 text-xs text-slate-500 font-bold">{idx + 1}</td>
                            <td className="p-3 text-xs font-black text-slate-800 bg-slate-50/50 uppercase">{e.region}</td>
                            <td className="p-3 text-xs font-bold text-slate-600 uppercase">{e.division || '-'}</td>
                            <td className="p-3 text-xs font-bold text-slate-600 bg-slate-50/50 uppercase">{e.station || '-'}</td>
                            <td className="p-3 text-center text-sm font-extrabold text-green-700">{stn > 0 ? stn : '-'}</td>
                            <td className="p-3 text-xs font-medium text-slate-600 bg-slate-50/50 capitalize">{e.sub_station || '-'}</td>
                            <td className="p-3 text-xs font-medium text-slate-600 capitalize">{e.post || '-'}</td>
                            <td className="p-3 text-center text-sm font-bold text-emerald-600 bg-slate-50/50">{pst > 0 ? pst : '-'}</td>
                            <td className="p-3 text-center text-sm font-black text-emerald-900 bg-emerald-50 shadow-inner border-l border-emerald-100">{totalPerLocation > 0 ? totalPerLocation : '-'}</td>
                         </tr>
                      );
                   })}
                   {estData.length === 0 && <tr><td colSpan="9" className="p-6 text-center text-slate-500 font-medium">No establishments data available.</td></tr>}
                   
                   <tr className="bg-slate-800 border-t-4 border-slate-900">
                      <td colSpan="4" className="p-4 text-right text-[11px] font-black text-white uppercase tracking-widest shadow-inner border-r border-slate-700">
                         TOTALS:
                      </td>
                      <td className="p-4 text-center text-base font-black text-green-400 border-r border-slate-700">{estTotals.station > 0 ? estTotals.station : '-'}</td>
                      <td colSpan="2" className="p-4 text-center border-r border-slate-700 bg-slate-900/50"></td>
                      <td className="p-4 text-center text-base font-black text-emerald-300 border-r border-slate-700">{estTotals.post > 0 ? estTotals.post : '-'}</td>
                      <td className="p-4 text-center text-lg font-black text-yellow-400 bg-slate-900 shadow-inner">
                         {estTotals.station + estTotals.post + estTotals.booth}
                      </td>
                   </tr>
                </tbody>
             </table>
          </div>
        </div>

      </div>
    </div>
  );
};

export default HrEstablishmentsLedger;