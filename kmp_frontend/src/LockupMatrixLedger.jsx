import React, { useState, useMemo } from 'react';
import { X, Filter, TrendingUp, TrendingDown, Minus } from 'lucide-react';

const REGIONAL_HIERARCHY = {
  "KMP NORTH": ["KAWEMPE", "KAKIRI", "KASANGATI", "MATUGGA", "NANSANA", "OLD KAMPALA", "WAKISO", "WANDEGEYA"],
  "KMP EAST": ["JINJA ROAD", "KIRA", "KIRA ROAD", "MUKONO", "NAGGALAMA", "SEETA"],
  "KMP SOUTH": ["NATEETE", "CPS KAMPALA", "PARLIAMENT", "ENTEBBE", "KABALAGALA", "KAJJANSI", "KASENYI", "KATWE", "KYENGERA", "NSANGI"],
  "KMP HEADQUARTERS": ["KMP HEADQUARTERS", "FLYING SQUAD", "CRIME INTELLIGENCE"],
  "POLICE HEADQUARTERS": ["NAGURU"]
};

// Helper to resolve region consistently
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

const LockupMatrixLedger = ({ lockupEntries, allTimeLockupTotal, onClose, selectedRegion, selectedStation }) => {
  const [lockupFilter, setLockupFilter] = useState('ALL');

  const formatOfficerDisplay = (str) => {
    if (!str) return 'SYSTEM';
    return String(str).toUpperCase();
  };

  // 🟢 FILTER AND COMPUTE NET VARIATIONS BY JURISDICTION & TIME
  const filteredLockupEntries = useMemo(() => {
    let filtered = Array.isArray(lockupEntries) ? [...lockupEntries] : [];

    // 1. Regional Filter Application
    if (selectedRegion && selectedRegion !== 'ALL REGIONS') {
      const cleanTargetRegion = selectedRegion.trim().toUpperCase();
      filtered = filtered.filter(row => {
        const rowRegion = getOfficialRegionForStation(row.station, row.region);
        return rowRegion === cleanTargetRegion;
      });
    }

    // 2. Station Filter Application
    if (selectedStation && selectedStation !== 'ALL STATIONS') {
      const cleanTargetStation = selectedStation.trim().toUpperCase();
      filtered = filtered.filter(row => {
        const rowStation = (row.station || '').trim().toUpperCase();
        return rowStation === cleanTargetStation;
      });
    }

    // 3. Timeframe Filter Application
    if (lockupFilter !== 'ALL') {
      const today = new Date();
      const tzOffset = today.getTimezoneOffset() * 60000; 
      const localToday = new Date(today.getTime() - tzOffset);
      
      const todayStr = localToday.toISOString().split('T')[0];
      
      const weekAgo = new Date(localToday);
      weekAgo.setDate(weekAgo.getDate() - 7);
      const weekStr = weekAgo.toISOString().split('T')[0];
      
      const monthAgo = new Date(localToday);
      monthAgo.setDate(monthAgo.getDate() - 30);
      const monthStr = monthAgo.toISOString().split('T')[0];
      
      const yearAgo = new Date(localToday);
      yearAgo.setDate(yearAgo.getDate() - 365);
      const yearStr = yearAgo.toISOString().split('T')[0];

      filtered = filtered.filter(row => {
        if (!row.date) return false;
        if (lockupFilter === 'TODAY') return row.date >= todayStr;
        if (lockupFilter === 'WEEK') return row.date >= weekStr;
        if (lockupFilter === 'MONTH') return row.date >= monthStr;
        if (lockupFilter === 'YEAR') return row.date >= yearStr;
        return true;
      });
    }

    // Sort chronologically descending
    filtered.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

    // Compute variation dynamically relative to preceding logged entry
    return filtered.map((log, index, arr) => {
      if (index === arr.length - 1) return { ...log, variation: 0, hasPrev: false };
      const prevSuspects = Number(arr[index + 1]?.suspects || 0);
      const currentSuspects = Number(log?.suspects || 0);
      return { 
        ...log, 
        variation: currentSuspects - prevSuspects, 
        hasPrev: true 
      };
    });
  }, [lockupEntries, lockupFilter, selectedRegion, selectedStation]);

  // Calculations for filtered totals including explicit juvenile splits
  const totals = useMemo(() => {
    return filteredLockupEntries.reduce((acc, row) => {
      acc.suspects += Number(row.suspects || 0);
      acc.male += Number(row.male_count || row.male || 0);
      acc.male_juvenile += Number(row.male_juvenile_count || row.male_juvenile || 0);
      acc.female += Number(row.female_count || row.female || 0);
      acc.female_juvenile += Number(row.female_juvenile_count || row.female_juvenile || 0);
      acc.d1 += Number(row.detention_1day || 0);
      acc.d2 += Number(row.detention_2days || 0);
      acc.d3 += Number(row.detention_3days_over || 0);
      return acc;
    }, { suspects: 0, male: 0, male_juvenile: 0, female: 0, female_juvenile: 0, d1: 0, d2: 0, d3: 0 });
  }, [filteredLockupEntries]);

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[99999] flex items-center justify-center p-4 sm:p-6 animate-in fade-in zoom-in-95 duration-200">
      <div className="bg-white shadow-2xl max-w-7xl w-full flex flex-col max-h-[90vh] rounded-xl overflow-hidden border border-amber-300">
        
        {/* HEADER */}
        <div className="bg-amber-800 px-6 py-4 flex justify-between items-center shrink-0 shadow-md z-10">
          <div>
            <h3 className="text-sm font-extrabold text-white tracking-wider uppercase flex items-center">
              <Filter className="w-4 h-4 mr-2" />
              Independent Daily Suspect Lock-Up Matrix Ledger
            </h3>
            <p className="text-[10px] text-amber-200 font-medium mt-0.5">
              Showing records for: <span className="text-white font-bold">{selectedRegion || 'ALL REGIONS'}</span> {selectedStation && selectedStation !== 'ALL STATIONS' ? `➔ ${selectedStation}` : ''}
            </p>
          </div>
          <button onClick={onClose} className="text-amber-200 hover:text-white hover:bg-amber-700 p-1.5 rounded transition-colors cursor-pointer">
            <X size={20} />
          </button>
        </div>

        {/* FILTERS */}
        <div className="bg-amber-50 px-6 py-3 border-b border-amber-200 flex justify-end shrink-0">
          <div className="flex bg-amber-900 rounded-lg p-0.5 shadow-inner border border-amber-700/50 overflow-x-auto max-w-full custom-scrollbar">
            {['TODAY', 'WEEK', 'MONTH', 'YEAR', 'ALL'].map((f) => (
              <button
                key={f}
                onClick={() => setLockupFilter(f)}
                className={`px-4 py-1.5 text-[11px] font-extrabold uppercase rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  lockupFilter === f
                    ? 'bg-amber-500 text-amber-950 shadow-sm'
                    : 'text-amber-200 hover:text-white hover:bg-amber-800/80'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
        
        {/* TABLE BODY */}
        <div className="overflow-y-auto flex-1 custom-scrollbar bg-slate-50">
          <table className="w-full text-left border-collapse">
            <thead className="bg-amber-100 sticky top-0 border-b border-amber-200 shadow-sm z-20">
              <tr>
                <th rowSpan="2" className="px-3 py-3 text-[10px] font-black text-amber-900 uppercase border-r border-amber-200 text-center">S/N</th>
                <th rowSpan="2" className="px-3 py-3 text-[10px] font-black text-amber-900 uppercase border-r border-amber-200">Date Logged</th>
                <th rowSpan="2" className="px-3 py-3 text-[10px] font-black text-amber-900 uppercase border-r border-amber-200">Station / Origin</th>
                <th rowSpan="2" className="px-3 py-3 text-[10px] font-black text-white uppercase bg-amber-900 border-r border-amber-800 text-center">Total Suspects</th>
                
                {/* 🟢 SUBDIVIDED SEX & JUVENILE COLUMNS */}
                <th colSpan="4" className="px-2 py-2 text-[10px] font-black text-amber-900 uppercase border-r border-amber-200 text-center bg-amber-200/50">SEX & AGE CATEGORY</th>
                
                {/* SUBDIVIDED DURATION IN DETENTION COLUMN */}
                <th colSpan="3" className="px-2 py-2 text-[10px] font-black text-amber-900 uppercase border-r border-amber-200 text-center bg-amber-100">DURATION IN DETENTION</th>
                
                <th rowSpan="2" className="px-3 py-3 text-[10px] font-black text-amber-900 uppercase text-center border-r border-amber-200">Daily Net Variation</th>
                <th rowSpan="2" className="px-3 py-3 text-[10px] font-black text-amber-900 uppercase">Last Updated By</th>
              </tr>
              <tr className="bg-amber-50 border-b-2 border-amber-200">
                <th className="px-2 py-2 text-[9px] font-extrabold text-blue-800 uppercase border-r border-amber-200 text-center bg-blue-50/50">Male Adults</th>
                <th className="px-2 py-2 text-[9px] font-extrabold text-indigo-800 uppercase border-r border-amber-200 text-center bg-indigo-50/50">Male Juveniles</th>
                <th className="px-2 py-2 text-[9px] font-extrabold text-pink-800 uppercase border-r border-amber-200 text-center bg-pink-50/50">Female Adults</th>
                <th className="px-2 py-2 text-[9px] font-extrabold text-purple-800 uppercase border-r border-amber-200 text-center bg-purple-50/50">Female Juveniles</th>
                
                <th className="px-2 py-2 text-[9px] font-extrabold text-slate-700 uppercase border-r border-amber-200 text-center">1 Day</th>
                <th className="px-2 py-2 text-[9px] font-extrabold text-slate-700 uppercase border-r border-amber-200 text-center">2 Days</th>
                <th className="px-2 py-2 text-[9px] font-extrabold text-slate-700 uppercase border-r border-amber-200 text-center">3 Days & Over</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-amber-100 bg-white">
              {filteredLockupEntries.length > 0 ? (
                filteredLockupEntries.map((row, idx) => (
                  <tr key={idx} className="hover:bg-amber-50/50 transition-colors">
                    <td className="px-3 py-3 text-xs font-bold text-slate-400 text-center border-r border-slate-100">{idx + 1}</td>
                    <td className="px-3 py-3 text-xs font-bold text-slate-800 border-r border-slate-100">{row.date}</td>
                    <td className="px-3 py-3 text-xs font-bold text-slate-600 uppercase border-r border-slate-100">{row.station}</td>
                    <td className="px-3 py-3 text-sm font-black text-amber-900 text-center bg-amber-50/30 border-r border-slate-100">{row.suspects}</td>
                    
                    {/* 🟢 Sex & Juvenile Breakdown Data Cells */}
                    <td className="px-2 py-3 text-xs font-bold text-blue-700 text-center border-r border-slate-100 bg-blue-50/20">{row.male_count || row.male || 0}</td>
                    <td className="px-2 py-3 text-xs font-bold text-indigo-700 text-center border-r border-slate-100 bg-indigo-50/20">{row.male_juvenile_count || row.male_juvenile || 0}</td>
                    <td className="px-2 py-3 text-xs font-bold text-pink-700 text-center border-r border-slate-100 bg-pink-50/20">{row.female_count || row.female || 0}</td>
                    <td className="px-2 py-3 text-xs font-bold text-purple-700 text-center border-r border-slate-100 bg-purple-50/20">{row.female_juvenile_count || row.female_juvenile || 0}</td>

                    {/* Detention Duration Breakdown Values */}
                    <td className="px-2 py-3 text-xs font-medium text-slate-700 text-center border-r border-slate-100">{row.detention_1day || 0}</td>
                    <td className="px-2 py-3 text-xs font-medium text-slate-700 text-center border-r border-slate-100">{row.detention_2days || 0}</td>
                    <td className="px-2 py-3 text-xs font-medium text-slate-700 text-center border-r border-slate-100">{row.detention_3days_over || 0}</td>

                    <td className="px-3 py-3 text-xs font-bold text-center border-r border-slate-100">
                      {!row.hasPrev ? (
                        <span className="text-slate-400 flex items-center justify-center"><Minus className="w-3 h-3 mr-1"/> Base</span>
                      ) : row.variation > 0 ? (
                        <span className="text-red-600 bg-red-50 px-2 py-0.5 rounded border border-red-100 flex items-center justify-center max-w-max mx-auto">
                          <TrendingUp className="w-3 h-3 mr-1" /> +{row.variation}
                        </span>
                      ) : row.variation < 0 ? (
                        <span className="text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100 flex items-center justify-center max-w-max mx-auto">
                          <TrendingDown className="w-3 h-3 mr-1" /> {row.variation}
                        </span>
                      ) : (
                        <span className="text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 flex items-center justify-center max-w-max mx-auto">
                          <Minus className="w-3 h-3 mr-1" /> 0
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-[11px] font-semibold text-slate-500 uppercase">{formatOfficerDisplay(row.last_updated_by)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="13" className="px-6 py-12 text-center text-sm text-slate-500 font-bold">
                    No independent lock-up records found for this jurisdiction and period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* FOOTER TOTALS */}
        <div className="bg-slate-900 shrink-0 shadow-inner z-10 border-t border-slate-700 text-amber-300">
          <div className="grid grid-cols-2 md:grid-cols-6 gap-2 px-6 py-3 border-b border-slate-800 text-xs font-black uppercase">
            <div>{lockupFilter} Period Totals:</div>
            <div>Total: <span className="text-white">{totals.suspects}</span></div>
            <div>Male (Adult / Juv): <span className="text-blue-400">{totals.male}</span> / <span className="text-indigo-400">{totals.male_juvenile}</span></div>
            <div>Female (Adult / Juv): <span className="text-pink-400">{totals.female}</span> / <span className="text-purple-400">{totals.female_juvenile}</span></div>
            <div className="col-span-2">Detention Split (1d / 2d / 3d+): <span className="text-white">{totals.d1} / {totals.d2} / {totals.d3}</span></div>
          </div>
          <div className="flex justify-between items-center px-6 py-4 bg-slate-950">
            <div className="text-xs font-black text-yellow-400 uppercase tracking-wider">
              Cumulative Matrix Lock-Up Total (All-Time):
            </div>
            <div className="text-xl font-black text-yellow-400">{allTimeLockupTotal}</div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default LockupMatrixLedger;