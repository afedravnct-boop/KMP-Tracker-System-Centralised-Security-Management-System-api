import React, { useState, useMemo } from 'react';
import { X, Filter, TrendingUp, TrendingDown, Minus } from 'lucide-react';

const LockupMatrixLedger = ({ lockupEntries, allTimeLockupTotal, onClose }) => {
  const [lockupFilter, setLockupFilter] = useState('ALL');

const formatOfficerDisplay = (str) => {
  if (!str) return 'SYSTEM';
  // If it's already in the format containing numbers and names, return uppercase
  return String(str).toUpperCase();
};

  // 🟢 SECURELY FILTER LOCK-UP ENTRIES
  const filteredLockupEntries = useMemo(() => {
    if (lockupFilter === 'ALL') return lockupEntries;
    
    const today = new Date();
    const tzOffset = today.getTimezoneOffset() * 60000; 
    const localToday = new Date(today - tzOffset);
    
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

    return lockupEntries.filter(row => {
      if (!row.date) return false;
      if (lockupFilter === 'TODAY') return row.date >= todayStr;
      if (lockupFilter === 'WEEK') return row.date >= weekStr;
      if (lockupFilter === 'MONTH') return row.date >= monthStr;
      if (lockupFilter === 'YEAR') return row.date >= yearStr;
      return true;
    });
  }, [lockupEntries, lockupFilter]);

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[99999] flex items-center justify-center p-4 sm:p-6 animate-in fade-in zoom-in-95 duration-200">
      <div className="bg-white shadow-2xl max-w-4xl w-full flex flex-col max-h-[90vh] rounded-xl overflow-hidden border border-amber-300">
        
        {/* HEADER */}
        <div className="bg-amber-800 px-6 py-4 flex justify-between items-center shrink-0 shadow-md z-10">
          <div>
            <h3 className="text-sm font-extrabold text-white tracking-wider uppercase flex items-center">
              <Filter className="w-4 h-4 mr-2" />
              Independent Daily Suspect Lock-Up Matrix
            </h3>
            <p className="text-[10px] text-amber-200 font-medium mt-0.5">Daily & Cumulative Custody Records</p>
          </div>
          <button onClick={onClose} className="text-amber-200 hover:text-white hover:bg-amber-700 p-1.5 rounded transition-colors">
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
                className={`px-4 py-1.5 text-[11px] font-extrabold uppercase rounded-md transition-colors whitespace-nowrap ${
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
          <table className="w-full text-left">
            <thead className="bg-amber-100 sticky top-0 border-b border-amber-200 shadow-sm z-10">
              <tr>
                <th className="px-6 py-3 text-[11px] font-extrabold text-amber-900 uppercase">S/N</th>
                <th className="px-6 py-3 text-[11px] font-extrabold text-amber-900 uppercase">Date (Day Record)</th>
                <th className="px-6 py-3 text-[11px] font-extrabold text-amber-900 uppercase">Station / Origin</th>
                <th className="px-6 py-3 text-[11px] font-extrabold text-amber-900 uppercase text-center">Daily Count</th>
                <th className="px-6 py-3 text-[11px] font-extrabold text-amber-900 uppercase text-center">Daily Net Variation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-amber-100 bg-white">
              {filteredLockupEntries.length > 0 ? (
                filteredLockupEntries.map((row, idx) => (
                  <tr key={idx} className="hover:bg-amber-50/50 transition-colors">
                    <td className="px-6 py-4 text-xs font-bold text-slate-400">{idx + 1}</td>
                    <td className="px-6 py-4 text-xs font-bold text-slate-800">{row.date}</td>
                    <td className="px-6 py-4 text-xs font-bold text-slate-600 uppercase">{row.station}</td>
                    <td className="px-6 py-4 text-base font-black text-amber-700 text-center">{row.suspects}</td>
                    <td className="px-6 py-4 text-xs font-bold text-center">
                      {!row.hasPrev ? (
                        <span className="text-slate-400 flex items-center justify-center"><Minus className="w-3 h-3 mr-1"/> Base</span>
                      ) : row.variation > 0 ? (
                        <span className="text-red-600 bg-red-50 px-2 py-0.5 rounded border border-red-100 flex items-center justify-center max-w-max mx-auto">
                          <TrendingUp className="w-3 h-3 mr-1" /> +{row.variation} Added
                        </span>
                      ) : row.variation < 0 ? (
                        <span className="text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100 flex items-center justify-center max-w-max mx-auto">
                          <TrendingDown className="w-3 h-3 mr-1" /> {row.variation} Cleared
                        </span>
                      ) : (
                        <span className="text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 flex items-center justify-center max-w-max mx-auto">
                          <Minus className="w-3 h-3 mr-1" /> No Change
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5" className="px-6 py-12 text-center text-sm text-slate-500 font-bold">
                    No independent lock-up records found for this period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* FOOTER */}
        <div className="bg-slate-900 shrink-0 shadow-inner z-10 border-t border-slate-700">
          <div className="flex justify-between items-center px-6 py-3 border-b border-slate-700">
            <div className="text-[11px] font-black text-amber-300 uppercase tracking-wider">
              {lockupFilter === 'ALL' ? 'All-Time Filtered Total:' : `${lockupFilter} Period Total:`}
            </div>
            <div className="text-base font-black text-amber-300">
              {filteredLockupEntries.reduce((sum, l) => sum + Number(l.suspects || 0), 0)}
            </div>
          </div>
          <div className="flex justify-between items-center px-6 py-4 bg-slate-950">
            <div className="text-xs font-black text-yellow-400 uppercase tracking-wider">
              Cumulative Matrix Lock-Up Total:
            </div>
            <div className="text-xl font-black text-yellow-400">{allTimeLockupTotal}</div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default LockupMatrixLedger;