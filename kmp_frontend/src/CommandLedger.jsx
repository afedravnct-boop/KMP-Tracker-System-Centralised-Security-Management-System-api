import React from 'react';
import { Users, Building, X } from 'lucide-react';

const CommandLedger = ({ hrLedgerData, onClose }) => {
  if (!hrLedgerData) return null;

  return (
    <div className="mt-6 bg-white p-6 rounded-xl shadow-lg border border-gray-200 animate-in fade-in duration-300">
      <div className="flex justify-between items-center mb-6 pb-4 border-b">
        <div>
          <h2 className="text-2xl font-extrabold text-gray-800 tracking-tight">HR & Establishments Master Ledger</h2>
          <p className="text-sm font-bold text-gray-500 mt-1 uppercase tracking-wider">Cross-Referenced Structure & Personnel Data</p>
        </div>
        <button onClick={onClose} className="text-gray-600 hover:text-white hover:bg-slate-800 font-bold px-5 py-2.5 border border-gray-300 rounded-lg transition-colors flex items-center shadow-sm">
          <X size={16} className="mr-2" /> Close Master View
        </button>
      </div>

      <div className="flex flex-col space-y-10">
        
        {/* TABLE 1: HR NOMINAL ROLL SUMMARY */}
        <div>
          <h3 className="text-lg font-bold text-blue-900 mb-3 bg-blue-50 border border-blue-100 p-3 rounded-t-lg flex items-center">
            <Users size={18} className="mr-2"/> Nominal Roll Aggregates
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
                {hrLedgerData.hr?.map((row, index) => (
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
              </tbody>
              {hrLedgerData.hr?.length > 0 && (
                <tfoot className="bg-slate-800 border-t-2 border-slate-900">
                  <tr>
                    <td colSpan="8" className="px-4 py-3 text-right text-xs font-extrabold text-white uppercase tracking-wider">Grand Total Active Personnel:</td>
                    <td className="px-3 py-3 text-center text-base font-extrabold text-yellow-400 border-l border-slate-600">
                      {hrLedgerData.hr.reduce((sum, row) => sum + row.sub_total, 0)}
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
            <Building size={18} className="mr-2"/> Structural Establishments
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
                {hrLedgerData.establishments?.map((row, index) => (
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
              </tbody>
              {hrLedgerData.establishments?.length > 0 && (
                <tfoot className="bg-slate-800 border-t-2 border-slate-900">
                  <tr>
                    <td colSpan="2" className="px-4 py-3 text-right text-xs font-extrabold text-white uppercase tracking-wider border-r border-slate-700">Totals:</td>
                    <td className="px-2 py-3 text-center text-sm font-extrabold text-emerald-300 border-r border-slate-700">-</td>
                    <td className="border-r border-slate-700"></td>
                    <td className="px-2 py-3 text-center text-sm font-extrabold text-emerald-300 border-r border-slate-700">
                      {hrLedgerData.establishments.reduce((sum, row) => sum + row.pers_stn, 0)}
                    </td>
                    <td className="border-r border-slate-700"></td>
                    <td className="border-r border-slate-700"></td>
                    <td className="px-2 py-3 text-center text-sm font-extrabold text-emerald-300 border-r border-slate-700">-</td>
                    <td className="border-r border-slate-700"></td>
                    <td className="border-r border-slate-700"></td>
                    <td className="px-2 py-3 text-center text-sm font-extrabold text-emerald-300 border-r border-slate-700">
                      {hrLedgerData.establishments.reduce((sum, row) => sum + row.pers_post, 0)}
                    </td>
                    <td className="px-2 py-3 text-center text-base font-extrabold text-yellow-400 border-l border-emerald-900">
                      {hrLedgerData.establishments.reduce((sum, row) => sum + row.sub_total, 0)}
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