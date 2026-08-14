import React, { useState, useEffect } from 'react';
import { Building, X, Download, Shield } from 'lucide-react';
import * as XLSX from 'xlsx';

const HrEstablishmentsLedger = ({ data, onClose, currentUser = {} }) => {
  const [activeTab, setActiveTab] = useState('establishments'); // 'establishments' | 'nominal'

  // Normalize data safely
  const establishmentsList = Array.isArray(data) ? data : (data?.establishments || data?.items || []);
  const nominalList = Array.isArray(data?.nominal_roll) ? data.nominal_roll : [];

  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();

    // 1. Establishments Sheet
    if (establishmentsList.length > 0) {
      const estSheetData = establishmentsList.map((e, index) => ({
        "S/N": index + 1,
        "Region": e.region,
        "Division": e.division,
        "Station": e.station,
        "Personnel (Station)": e.personnel_in_station || 0,
        "Sub-Station": e.sub_station || '-',
        "Personnel (Sub-Station)": e.personnel_in_sub_station || 0,
        "Post": e.post || '-',
        "Personnel (Post)": e.personnel_in_post || 0,
        "Booths": e.booths || 0,
        "Location": e.location || '-',
        "Status": e.status || 'OPERATIONAL',
        "Comment": e.comment || '-'
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(estSheetData), "Establishments");
    }

    // 2. Specific Nominal Roll Columns Sheet
    if (nominalList.length > 0) {
      const nomSheetData = nominalList.map((n, index) => ({
        "S/N": index + 1,
        "Force Number": n.fnum || n.f_num,
        "Rank": n.rank,
        "Full Name": n.name,
        "Station": n.station,
        "Region": n.region,
        "Position": n.position,
        "Status": n.status || 'ACTIVE'
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(nomSheetData), "Nominal Roll Summary");
    }

    XLSX.writeFile(wb, `HR_Establishments_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[200] flex items-center justify-center p-4 sm:p-8 animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-2xl max-w-7xl w-full overflow-hidden border border-slate-300 flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="bg-slate-900 text-white px-6 py-4 flex justify-between items-center shrink-0">
          <div className="flex items-center space-x-3">
            <Building className="text-emerald-400" size={24} />
            <div>
              <h3 className="font-extrabold uppercase text-sm tracking-wider">HR & Establishments Master Ledger</h3>
              <p className="text-xs text-slate-400">Viewing integrated database records for infrastructure and personnel placement.</p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <button 
              onClick={handleExportExcel}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl font-bold text-xs shadow transition flex items-center space-x-2"
            >
              <Download size={16} />
              <span>Export HR Excel</span>
            </button>
            <button onClick={onClose} className="hover:bg-slate-800 p-2 rounded-lg transition text-slate-300 hover:text-white">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="bg-slate-100 px-6 py-3 border-b border-slate-200 flex space-x-3 shrink-0">
          <button
            onClick={() => setActiveTab('establishments')}
            className={`px-4 py-2 rounded-lg text-xs font-extrabold transition shadow-xs ${activeTab === 'establishments' ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 hover:bg-slate-200'}`}
          >
            🏢 Establishments Registry ({establishmentsList.length})
          </button>
          <button
            onClick={() => setActiveTab('nominal')}
            className={`px-4 py-2 rounded-lg text-xs font-extrabold transition shadow-xs ${activeTab === 'nominal' ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 hover:bg-slate-200'}`}
          >
            🛡️ Personnel Deployment Summary ({nominalList.length})
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 custom-scrollbar bg-slate-50">
          {activeTab === 'establishments' ? (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <table className="min-w-full divide-y divide-slate-200 text-xs">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    <th className="px-4 py-3 text-left font-bold text-slate-600 uppercase">Region</th>
                    <th className="px-4 py-3 text-left font-bold text-slate-600 uppercase">Division</th>
                    <th className="px-4 py-3 text-left font-bold text-slate-600 uppercase">Station</th>
                    <th className="px-4 py-3 text-center font-bold text-slate-600 uppercase">Pers (Stn)</th>
                    <th className="px-4 py-3 text-left font-bold text-slate-600 uppercase">Sub-Station</th>
                    <th className="px-4 py-3 text-center font-bold text-slate-600 uppercase">Pers (Sub-Stn)</th>
                    <th className="px-4 py-3 text-left font-bold text-slate-600 uppercase">Police Post</th>
                    <th className="px-4 py-3 text-center font-bold text-slate-600 uppercase">Pers (Post)</th>
                    <th className="px-4 py-3 text-center font-bold text-slate-600 uppercase">Booths</th>
                    <th className="px-4 py-3 text-left font-bold text-slate-600 uppercase">Location</th>
                    <th className="px-4 py-3 text-left font-bold text-slate-600 uppercase">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {establishmentsList.map((e, idx) => (
                    <tr key={e.id || idx} className="hover:bg-slate-50">
                      <td className="px-4 py-3 uppercase">{e.region}</td>
                      <td className="px-4 py-3 uppercase">{e.division || '-'}</td>
                      <td className="px-4 py-3 uppercase font-bold text-blue-700">{e.station}</td>
                      <td className="px-4 py-3 text-center font-black text-emerald-700">{e.personnel_in_station || 0}</td>
                      <td className="px-4 py-3 uppercase">{e.sub_station || '-'}</td>
                      <td className="px-4 py-3 text-center font-black text-emerald-700">{e.personnel_in_sub_station || 0}</td>
                      <td className="px-4 py-3 uppercase">{e.post || '-'}</td>
                      <td className="px-4 py-3 text-center font-black text-emerald-700">{e.personnel_in_post || 0}</td>
                      <td className="px-4 py-3 text-center font-bold">{e.booths || 0}</td>
                      <td className="px-4 py-3 uppercase">{e.location || '-'}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                          {e.status || 'OPERATIONAL'}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {establishmentsList.length === 0 && (
                    <tr><td colSpan="11" className="text-center py-8 text-slate-400 font-bold">No establishment records found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <table className="min-w-full divide-y divide-slate-200 text-xs">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    <th className="px-4 py-3 text-left font-bold text-slate-600 uppercase">S/N</th>
                    <th className="px-4 py-3 text-left font-bold text-slate-600 uppercase">Force Number</th>
                    <th className="px-4 py-3 text-left font-bold text-slate-600 uppercase">Rank</th>
                    <th className="px-4 py-3 text-left font-bold text-slate-600 uppercase">Full Name</th>
                    <th className="px-4 py-3 text-left font-bold text-slate-600 uppercase">Station</th>
                    <th className="px-4 py-3 text-left font-bold text-slate-600 uppercase">Region</th>
                    <th className="px-4 py-3 text-left font-bold text-slate-600 uppercase">Position</th>
                    <th className="px-4 py-3 text-left font-bold text-slate-600 uppercase">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {nominalList.map((n, idx) => (
                    <tr key={n.fnum || n.f_num || idx} className="hover:bg-slate-50">
                      <td className="px-4 py-3">{idx + 1}</td>
                      <td className="px-4 py-3 font-bold text-blue-700">{n.fnum || n.f_num}</td>
                      <td className="px-4 py-3 font-bold">{n.rank}</td>
                      <td className="px-4 py-3 uppercase font-extrabold">{n.name}</td>
                      <td className="px-4 py-3 uppercase">{n.station}</td>
                      <td className="px-4 py-3 uppercase">{n.region}</td>
                      <td className="px-4 py-3 uppercase">{n.position}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-100 text-green-800">
                          {n.status || 'ACTIVE'}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {nominalList.length === 0 && (
                    <tr><td colSpan="8" className="text-center py-8 text-slate-400 font-bold">No personnel records found in this view.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-100 p-4 border-t border-slate-200 flex justify-end shrink-0">
          <button onClick={onClose} className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-xs uppercase tracking-wider shadow">
            Close HR Ledger
          </button>
        </div>

      </div>
    </div>
  );
};

export default HrEstablishmentsLedger;