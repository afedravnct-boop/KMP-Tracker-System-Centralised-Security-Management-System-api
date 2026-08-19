import React, { useState, useMemo } from 'react';
import { Users, Building, X, Filter } from 'lucide-react';
import { stripHtmlTags } from './App';

const REGIONAL_HIERARCHY = {
  "KMP NORTH": ["KAWEMPE", "KAKIRI", "KASANGATI", "MATUGGA", "NANSANA", "OLD KAMPALA", "WAKISO", "WANDEGEYA"],
  "KMP EAST": ["JINJA ROAD", "KIRA", "KIRA ROAD", "MUKONO", "NAGGALAMA", "SEETA"],
  "KMP SOUTH": ["NATEETE", "CPS KAMPALA", "PARLIAMENT", "ENTEBBE", "KABALAGALA", "KAJJANSI", "KASENYI", "KATWE", "KYENGERA", "NSANGI"],
  "KMP HEADQUARTERS": ["KMP HEADQUARTERS", "FLYING SQUAD", "CRIME INTELLIGENCE"],
  "POLICE HEADQUARTERS": ["NAGURU"]
};

const getOfficialRegionForStation = (stationName, dbRegion) => {
  const cleanStation = stripHtmlTags(stationName || '').trim().toUpperCase();
  const cleanDbRegion = stripHtmlTags(dbRegion || '').trim().toUpperCase();

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

const CommandLedger = ({ hrLedgerData, onClose, currentUser, canViewGlobal = false }) => {
  if (!hrLedgerData) return null;

  // 🟢 Safely resolve global view active state matching other modules
  const canViewGlobalActive = canViewGlobal || currentUser?.role === 'SUPER_ADMIN' || currentUser?.permissions?.view_global_roster === true || currentUser?.permissions?.global_observer === true;

  const [filterRegion, setFilterRegion] = useState(canViewGlobalActive ? 'ALL REGIONS' : currentUser?.region || '');
  const [filterStation, setFilterStation] = useState(canViewGlobalActive ? 'ALL STATIONS' : currentUser?.station || '');

  // 🟢 Filtered HR records based on selected jurisdiction
  const filteredHr = useMemo(() => {
    const rawHr = hrLedgerData.hr || [];
    return rawHr.filter(row => {
      const stn = stripHtmlTags(row.station || '').trim().toUpperCase();
      const reg = getOfficialRegionForStation(stn, row.region);

      if (canViewGlobalActive && filterRegion === 'ALL REGIONS' && filterStation === 'ALL STATIONS') {
        return true;
      }
      if (filterRegion !== 'ALL REGIONS' && reg !== filterRegion.toUpperCase()) return false;
      if (filterStation !== 'ALL STATIONS' && stn !== filterStation.toUpperCase()) return false;
      return true;
    });
  }, [hrLedgerData.hr, filterRegion, filterStation, canViewGlobalActive]);

  // 🟢 Filtered Establishments records based on selected jurisdiction
  const filteredEstablishments = useMemo(() => {
    const rawEst = hrLedgerData.establishments || [];
    return rawEst.filter(row => {
      const stn = stripHtmlTags(row.station || '').trim().toUpperCase();
      const reg = getOfficialRegionForStation(stn, row.region);

      if (canViewGlobalActive && filterRegion === 'ALL REGIONS' && filterStation === 'ALL STATIONS') {
        return true;
      }
      if (filterRegion !== 'ALL REGIONS' && reg !== filterRegion.toUpperCase()) return false;
      if (filterStation !== 'ALL STATIONS' && stn !== filterStation.toUpperCase()) return false;
      return true;
    });
  }, [hrLedgerData.establishments, filterRegion, filterStation, canViewGlobalActive]);

  return (
    <div className="mt-6 bg-white p-6 rounded-xl shadow-lg border border-gray-200 animate-in fade-in duration-300">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 pb-4 border-b gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-gray-800 tracking-tight">HR & Establishments Master Ledger</h2>
          <p className="text-sm font-bold text-gray-500 mt-1 uppercase tracking-wider">Cross-Referenced Structure & Personnel Data</p>
        </div>

        {/* 🟢 JURISDICTION FILTER BAR */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-bold text-gray-500 uppercase flex items-center">
            <Filter size={14} className="mr-1 text-blue-600" /> Jurisdiction:
          </span>

          <select 
            value={filterRegion} 
            onChange={(e) => { setFilterRegion(e.target.value); setFilterStation('ALL STATIONS'); }}
            disabled={!canViewGlobalActive}
            className="border border-gray-300 rounded-lg p-2 text-xs font-bold text-gray-800 bg-white outline-none cursor-pointer disabled:bg-gray-100 disabled:text-gray-500"
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
            className="border border-gray-300 rounded-lg p-2 text-xs font-bold text-gray-800 bg-white outline-none cursor-pointer disabled:bg-gray-100 disabled:text-gray-500"
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

          <button onClick={onClose} className="text-gray-600 hover:text-white hover:bg-slate-800 font-bold px-5 py-2.5 border border-gray-300 rounded-lg transition-colors flex items-center shadow-sm cursor-pointer">
            <X size={16} className="mr-2" /> Close Master View
          </button>
        </div>
      </div>

      <div className="flex flex-col space-y-10">
        
        {/* TABLE 1: HR NOMINAL ROLL SUMMARY */}
        <div>
          <h3 className="text-lg font-bold text-blue-900 mb-3 bg-blue-50 border border-blue-100 p-3 rounded-t-lg flex items-center">
            <Users size={18} className="mr-2"/> Nominal Roll Aggregates ({filterRegion} {filterStation !== 'ALL STATIONS' ? `➔ ${filterStation}` : ''})
          </h3>
          <div className="overflow-x-auto shadow-sm ring-1 ring-black ring-opacity-5 rounded-b-lg custom-scrollbar pb-2">
            <table className="min-w-full divide-y divide-gray-200 table-auto">
              <thead className="bg-slate-100">
                <tr>
                  <th className="px-3 py-3 text-left text-[10px] font-extrabold text-gray-600 uppercase tracking-wider border-r border-gray-200">SN</th>
                  <th className="px-3 py-3 text-left text-[10px] font-extrabold text-gray-600 uppercase tracking-wider border-r border-gray-200">Rank</th>
                  <th className="px-3 py-3 text-center text-[10px] font-extrabold text-gray-600 uppercase tracking-wider border-r border-gray-200">Age</th>
                  <th className="px-3 py-3 text-center text-[10px] font-extrabold text-gray-600 uppercase tracking-wider border-r border-gray-200">Sex</th>
                  <th className="px-3 py-3 text-left text-[10px] font-extrabold text-gray-600 uppercase tracking-wider border-r border-gray-200">Educ Level</th>
                  <th className="px-3 py-3 text-left text-[10px] font-extrabold text-gray-600 uppercase tracking-wider border-r border-gray-200">Region</th>
                  <th className="px-3 py-3 text-left text-[10px] font-extrabold text-gray-600 uppercase tracking-wider border-r border-gray-200">DIR</th>
                  <th className="px-3 py-3 text-left text-[10px] font-extrabold text-gray-600 uppercase tracking-wider border-r border-gray-200">Section</th>
                  <th className="px-3 py-3 text-center text-[10px] font-extrabold text-white bg-blue-800 uppercase tracking-wider border-l border-blue-900">Sub-Total</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredHr.map((row, index) => (
                  <tr key={`hr-${index}`} className="hover:bg-slate-50 transition-colors">
                    <td className="px-3 py-2 text-xs font-bold text-gray-500 border-r border-gray-100">{index + 1}</td>
                    <td className="px-3 py-2 text-xs font-bold text-gray-900 border-r border-gray-100">{row.rank}</td>
                    <td className="px-3 py-2 text-xs text-center font-medium text-gray-600 border-r border-gray-100">{row.age}</td>
                    <td className="px-3 py-2 text-xs text-center font-bold text-gray-700 border-r border-gray-100">{row.sex}</td>
                    <td className="px-3 py-2 text-xs font-medium text-gray-700 truncate max-w-[150px] border-r border-gray-100">{row.educ_level}</td>
                    <td className="px-3 py-2 text-xs font-bold text-blue-700 border-r border-gray-100">{row.region}</td>
                    <td className="px-3 py-2 text-xs font-medium text-gray-700 border-r border-gray-100">{row.dir}</td>
                    <td className="px-3 py-2 text-xs font-medium text-gray-700">{row.section}</td>
                    <td className="px-3 py-2 text-sm text-center font-extrabold text-blue-900 bg-blue-50 border-l border-blue-100">{row.sub_total}</td>
                  </tr>
                ))}
                {filteredHr.length === 0 && (
                  <tr><td colSpan="9" className="text-center py-6 text-gray-500 italic">No personnel records found for this jurisdiction.</td></tr>
                )}
              </tbody>
              {filteredHr.length > 0 && (
                <tfoot className="bg-slate-800 border-t-2 border-slate-900">
                  <tr>
                    <td colSpan="8" className="px-4 py-3 text-right text-xs font-extrabold text-white uppercase tracking-wider">Grand Total Active Personnel:</td>
                    <td className="px-3 py-3 text-center text-base font-extrabold text-yellow-400 border-l border-slate-600">
                      {filteredHr.reduce((sum, row) => sum + row.sub_total, 0)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

        {/* TABLE 2: ESTABLISHMENTS SUMMARY (12 COLUMNS) */}
        <div>
          <h3 className="text-lg font-bold text-emerald-900 mb-3 bg-emerald-50 border border-emerald-100 p-3 rounded-t-lg flex items-center">
            <Building size={18} className="mr-2"/> Structural Establishments ({filterRegion} {filterStation !== 'ALL STATIONS' ? `➔ ${filterStation}` : ''})
          </h3>
          <div className="overflow-x-auto shadow-sm ring-1 ring-black ring-opacity-5 rounded-b-lg custom-scrollbar pb-2">
            <table className="min-w-full divide-y divide-gray-200 table-auto border-collapse">
              <thead className="bg-slate-100">
                <tr>
                  <th className="px-2 py-3 text-left text-[10px] font-extrabold text-gray-600 uppercase tracking-wider border-r border-gray-200">SN</th>
                  <th className="px-2 py-3 text-left text-[10px] font-extrabold text-gray-600 uppercase tracking-wider border-r border-gray-200">Region</th>
                  <th className="px-2 py-3 text-center text-[10px] font-extrabold text-emerald-700 bg-emerald-50 uppercase tracking-wider border-r border-gray-200">Personnel</th>
                  <th className="px-2 py-3 text-left text-[10px] font-extrabold text-gray-600 uppercase tracking-wider border-r border-gray-200">Division</th>
                  <th className="px-2 py-3 text-center text-[10px] font-extrabold text-emerald-700 bg-emerald-50 uppercase tracking-wider border-r border-gray-200">Personnel</th>
                  <th className="px-2 py-3 text-left text-[10px] font-extrabold text-gray-600 uppercase tracking-wider border-r border-gray-200">Station</th>
                  <th className="px-2 py-3 text-center text-[10px] font-extrabold text-emerald-700 bg-emerald-50 uppercase tracking-wider border-r border-gray-200">Personnel</th>
                  <th className="px-2 py-3 text-left text-[10px] font-extrabold text-gray-600 uppercase tracking-wider border-r border-gray-200">Sub-Station</th>
                  <th className="px-2 py-3 text-center text-[10px] font-extrabold text-emerald-700 bg-emerald-50 uppercase tracking-wider border-r border-gray-200">Personnel</th>
                  <th className="px-2 py-3 text-left text-[10px] font-extrabold text-gray-600 uppercase tracking-wider border-r border-gray-200">Post</th>
                  <th className="px-2 py-3 text-center text-[10px] font-extrabold text-emerald-700 bg-emerald-50 uppercase tracking-wider">Personnel</th>
                  <th className="px-2 py-3 text-center text-[10px] font-extrabold text-white bg-emerald-800 uppercase tracking-wider border-l border-emerald-900">Sub-Total</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredEstablishments.map((row, index) => (
                  <tr key={`est-${index}`} className="hover:bg-slate-50 transition-colors">
                    <td className="px-2 py-2 text-xs font-bold text-gray-500 border-r border-gray-100">{index + 1}</td>
                    <td className="px-2 py-2 text-xs font-bold text-emerald-800 border-r border-gray-100">{row.region}</td>
                    <td className="px-2 py-2 text-xs text-center font-medium text-gray-400 bg-slate-50 border-r border-gray-100">-</td>
                    <td className="px-2 py-2 text-xs font-bold text-gray-800 border-r border-gray-100">{row.division}</td>
                    <td className="px-2 py-2 text-xs text-center font-medium text-gray-400 bg-slate-50 border-r border-gray-100">-</td>
                    <td className="px-2 py-2 text-xs font-medium text-gray-700 border-r border-gray-100">{row.station}</td>
                    <td className="px-2 py-2 text-xs text-center font-extrabold text-emerald-800 bg-emerald-50/50 border-r border-gray-100">{row.pers_stn || "-"}</td>
                    <td className="px-2 py-2 text-xs font-medium text-gray-600 border-r border-gray-100">{row.sub_station}</td>
                    <td className="px-2 py-2 text-xs text-center font-medium text-gray-400 bg-slate-50 border-r border-gray-100">-</td>
                    <td className="px-2 py-2 text-xs font-medium text-gray-600 border-r border-gray-100">{row.post}</td>
                    <td className="px-2 py-2 text-xs text-center font-extrabold text-emerald-800 bg-emerald-50/50">{row.pers_post || "-"}</td>
                    <td className="px-2 py-2 text-sm text-center font-extrabold text-emerald-900 bg-emerald-50 border-l border-emerald-100">{row.sub_total}</td>
                  </tr>
                ))}
                {filteredEstablishments.length === 0 && (
                  <tr><td colSpan="12" className="text-center py-6 text-gray-500 italic">No establishment records found for this jurisdiction.</td></tr>
                )}
              </tbody>
              {filteredEstablishments.length > 0 && (
                <tfoot className="bg-slate-800 border-t-2 border-slate-900">
                  <tr>
                    <td colSpan="2" className="px-4 py-3 text-right text-xs font-extrabold text-white uppercase tracking-wider border-r border-slate-700">Totals:</td>
                    <td className="px-2 py-3 text-center text-sm font-extrabold text-emerald-300 border-r border-slate-700">-</td>
                    <td className="border-r border-slate-700"></td>
                    <td className="px-2 py-3 text-center text-sm font-extrabold text-emerald-300 border-r border-slate-700">
                      {filteredEstablishments.reduce((sum, row) => sum + (parseInt(row.pers_stn) || 0), 0)}
                    </td>
                    <td className="border-r border-slate-700"></td>
                    <td className="border-r border-slate-700"></td>
                    <td className="px-2 py-3 text-center text-sm font-extrabold text-emerald-300 border-r border-slate-700">-</td>
                    <td className="border-r border-slate-700"></td>
                    <td className="border-r border-slate-700"></td>
                    <td className="px-2 py-3 text-center text-sm font-extrabold text-emerald-300 border-r border-slate-700">
                      {filteredEstablishments.reduce((sum, row) => sum + (parseInt(row.pers_post) || 0), 0)}
                    </td>
                    <td className="px-2 py-3 text-center text-base font-extrabold text-yellow-400 border-l border-emerald-900">
                      {filteredEstablishments.reduce((sum, row) => sum + (parseInt(row.sub_total) || 0), 0)}
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

export default CommandLedger;