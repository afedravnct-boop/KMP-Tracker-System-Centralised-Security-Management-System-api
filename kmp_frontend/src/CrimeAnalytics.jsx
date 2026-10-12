// src/components/CrimeAnalytics.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Shield, Sprout, Loader2 } from 'lucide-react';
import { authFetch, hasValidSession } from './api';
import { stripHtmlTags } from './App';

const REGIONAL_HIERARCHY = {
  "KMP NORTH": ["KMP NORTH HEADQUARTERS", "KAWEMPE", "KAKIRI", "KASANGATI", "MATUGGA", "NANSANA", "OLD KAMPALA", "WAKISO", "WANDEGEYA"],
  "KMP EAST": ["KMP EAST HEADQUARTERS", "JINJA ROAD", "KIRA", "KIRA DIV", "KIRA ROAD", "MUKONO", "NAGGALAMA", "SEETA"],
  "KMP SOUTH": ["KMP SOUTH HEADQUARTERS", "NATEETE", "CPS KAMPALA", "PARLIAMENT", "ENTEBBE", "KABALAGALA", "KAJJANSI", "KASENYI", "KATWE", "KYENGERA", "NSANGI"],
  "KMP HEADQUARTERS": ["KMP HEADQUARTERS", "FLYING SQUAD", "CRIME INTELLIGENCE"],
  "POLICE HEADQUARTERS": ["NAGURU"]
};

const isStationEquivalent = (statA, statB) => {
  const a = stripHtmlTags(statA || '').trim().toUpperCase();
  const b = stripHtmlTags(statB || '').trim().toUpperCase();
  if (!a || !b) return false;
  if (a === b) return true;

  const cleanA = a.replace(/(\s+HEADQUARTERS|\s+HQ)$/, '');
  const cleanB = b.replace(/(\s+HEADQUARTERS|\s+HQ)$/, '');

  return cleanA === cleanB && cleanA.length > 0;
};

export default function CrimeAnalytics({ currentUser, canViewGlobal = false }) {
  const [summaryData, setSummaryData] = useState([]);
  const [isFetching, setIsFetching] = useState(false);
  const [timeFilter, setTimeFilter] = useState("all"); 
  const [showAgriculturalOnly, setShowAgriculturalOnly] = useState(false);

  const userRoleClean = stripHtmlTags(currentUser?.role || '').toUpperCase();
  const userPosClean = stripHtmlTags(currentUser?.position || '').toUpperCase();
  const userRegClean = stripHtmlTags(currentUser?.region || '').toUpperCase();

  const isGlobalTier = ['SUPER_ADMIN', 'ADMIN', 'ASSISTANT_SUPER_ADMIN'].includes(userRoleClean) || 
    ['KMP COMMANDER', 'DEPUTY KMP COMMANDER', 'KMP ADMIN OFFICER'].includes(userPosClean) || 
    currentUser?.permissions?.view_global_roster === true;

  const isKmpSystemManager = userRoleClean === 'SYSTEM_MANAGER' && ['KMP HEADQUARTERS', 'POLICE HEADQUARTERS'].includes(userRegClean) && userPosClean.includes('KMP');
  const isKmpSpecialist = userRoleClean === 'ASSISTANT_SYSTEM_MANAGER' && ['KMP HEADQUARTERS', 'POLICE HEADQUARTERS'].includes(userRegClean) && userPosClean.includes('KMP');

  const canViewGlobalLevel = canViewGlobal || isGlobalTier || isKmpSystemManager || isKmpSpecialist;
  
  const isRegionalCommand = ['RPC', 'DEPUTY_RPC', 'SYSTEM_MANAGER', 'ASSISTANT_SYSTEM_MANAGER', 'REGIONAL_ADMIN', 'ASSISTANT_REGIONAL_ADMIN'].includes(userRoleClean) && !canViewGlobalLevel;

  const [filterRegion, setFilterRegion] = useState(canViewGlobalLevel ? 'ALL REGIONS' : userRegClean);
  const [filterStation, setFilterStation] = useState((canViewGlobalLevel || isRegionalCommand) ? 'ALL STATIONS' : stripHtmlTags(currentUser?.station || '').toUpperCase());

  const isFilterInitialized = useRef(false);

  useEffect(() => {
    if (!isFilterInitialized.current && currentUser?.station) {
      if (canViewGlobalLevel) {
        setFilterRegion('ALL REGIONS');
        setFilterStation('ALL STATIONS');
      } else if (isRegionalCommand) {
        setFilterRegion(userRegClean);
        setFilterStation('ALL STATIONS');
      } else {
        setFilterRegion(userRegClean);
        setFilterStation(stripHtmlTags(currentUser?.station || '').toUpperCase());
      }
      isFilterInitialized.current = true;
    }
  }, [canViewGlobalLevel, isRegionalCommand, userRegClean, currentUser?.station]);

  const getDateRangeParams = (filterOption) => {
    if (filterOption === 'all') return { start: null, end: null };
    const end = new Date();
    const start = new Date();
    if (filterOption === 'week') { start.setDate(start.getDate() - 7); }
    const pad = (n) => n.toString().padStart(2, '0');
    const format = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    
    if (filterOption === 'today') return { start: format(start), end: format(start) };
    return { start: format(start), end: format(end) };
  };

  const fetchAnalytics = useCallback(async () => {
    if (!hasValidSession()) return;
    setIsFetching(true);
    try {
      const params = new URLSearchParams();
      if (!canViewGlobalLevel && filterRegion && filterRegion !== 'ALL REGIONS') params.append('region', filterRegion);
      if (filterStation && filterStation !== 'ALL STATIONS') params.append('station', filterStation);
      if (showAgriculturalOnly) params.append('agri_only', 'true');
      
      const { start, end } = getDateRangeParams(timeFilter);
      if (start) params.append('start_date', start);
      if (end) params.append('end_date', end);

      const res = await authFetch(`/api/v1/reports/analytics?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setSummaryData(data);
      }
    } catch (err) {
      console.error("Failed to load analytics:", err);
    } finally {
      setIsFetching(false);
    }
  }, [filterRegion, filterStation, timeFilter, showAgriculturalOnly, canViewGlobalLevel]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const grandTotal = summaryData.reduce((sum, item) => sum + item.total, 0);

  return (
    <div className="p-6 bg-white dark:bg-slate-900 dark:text-slate-100 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 animate-in fade-in duration-300 font-sans">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-200 dark:border-slate-800 pb-3 mb-6 gap-3">
        <h2 className="text-xl font-extrabold text-slate-900 dark:text-slate-100 flex items-center">
          <Shield className="mr-2 text-blue-600 dark:text-blue-400" /> Standalone Crime Incident Summary
        </h2>
        <button
          type="button"
          onClick={() => setShowAgriculturalOnly(prev => !prev)}
          className={`px-3.5 py-2 text-xs font-black rounded-lg border transition-all flex items-center whitespace-nowrap shadow-sm cursor-pointer ${
            showAgriculturalOnly 
              ? 'bg-emerald-700 text-white border-emerald-800 ring-2 ring-emerald-500/20' 
              : 'bg-white dark:bg-slate-800 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-slate-700 hover:bg-emerald-50 dark:hover:bg-slate-700'
          }`}
        >
          <Sprout className="w-4 h-4 mr-1.5" />
          {showAgriculturalOnly ? 'Agri-Crimes: ON' : 'Filter Agri-Crimes'}
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="flex-1">
          <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Timeframe</label>
          <select 
            value={timeFilter} 
            onChange={(e) => setTimeFilter(e.target.value)} 
            className="w-full p-2.5 border border-slate-300 dark:border-slate-700 rounded-lg text-sm font-bold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 outline-none focus:border-blue-500 cursor-pointer"
          >
            <option value="all">All Time</option>
            <option value="today">Today Only</option>
            <option value="week">Past 7 Days</option>
          </select>
        </div>

        <div className="flex-1">
          <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Target Region</label>
          <select 
            value={filterRegion} 
            onChange={(e) => { setFilterRegion(e.target.value); setFilterStation('ALL STATIONS'); }}
            disabled={!canViewGlobalLevel}
            className="w-full p-2.5 border border-slate-300 dark:border-slate-700 rounded-lg text-sm font-bold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 outline-none focus:border-blue-500 cursor-pointer disabled:bg-slate-100 dark:disabled:bg-slate-900 disabled:text-slate-500"
          >
            {canViewGlobalLevel ? (
              <>
                <option value="ALL REGIONS">ALL REGIONS</option>
                {Object.keys(REGIONAL_HIERARCHY).map(reg => (
                  <option key={reg} value={reg}>{reg}</option>
                ))}
              </>
            ) : (
              <option value={userRegClean}>{userRegClean || 'UNKNOWN'}</option>
            )}
          </select>
        </div>

        <div className="flex-1">
          <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Station / Post</label>
          <select 
            value={filterStation} 
            onChange={(e) => setFilterStation(e.target.value)}
            disabled={!(canViewGlobalLevel || isRegionalCommand)}
            className="w-full p-2.5 border border-slate-300 dark:border-slate-700 rounded-lg text-sm font-bold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 outline-none focus:border-blue-500 cursor-pointer disabled:bg-slate-100 dark:disabled:bg-slate-900 disabled:text-slate-500"
          >
            {(canViewGlobalLevel || isRegionalCommand) ? (
              <>
                <option value="ALL STATIONS">ALL STATIONS</option>
                {filterRegion !== 'ALL REGIONS' && (REGIONAL_HIERARCHY[filterRegion] || []).map(stn => (
                  <option key={stn} value={stn}>{stn}</option>
                ))}
              </>
            ) : (
              <option value={stripHtmlTags(currentUser?.station || '').toUpperCase()}>{stripHtmlTags(currentUser?.station || '').toUpperCase() || 'UNKNOWN'}</option>
            )}
          </select>
        </div>
      </div>

      <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-800 table-auto">
          <thead className="bg-slate-900 dark:bg-slate-950">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider w-16">SN</th>
              <th className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider">Incident / Offence</th>
              <th className="px-4 py-3 text-right text-xs font-bold text-white uppercase tracking-wider">Total Reported</th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800">
            {isFetching ? (
               <tr>
                 <td colSpan="3" className="px-4 py-8 text-center text-sm text-slate-500 font-medium">
                    <Loader2 className="w-5 h-5 mx-auto animate-spin mb-2" /> Aggregating analytics...
                 </td>
               </tr>
            ) : summaryData.length > 0 ? (
              summaryData.map((row) => (
                <tr key={row.sn} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="px-4 py-3 text-sm font-bold text-slate-500 dark:text-slate-400">{row.sn}</td>
                  <td className="px-4 py-3 text-sm font-bold text-slate-800 dark:text-slate-200 uppercase">{row.incident}</td>
                  <td className="px-4 py-3 text-sm font-extrabold text-blue-600 dark:text-blue-400 text-right">{row.total}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="3" className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400 font-medium">
                  No crimes reported for these specific filters.
                </td>
              </tr>
            )}
          </tbody>
          {summaryData.length > 0 && (
            <tfoot className="bg-slate-100 dark:bg-slate-950 border-t-2 border-slate-300 dark:border-slate-800">
              <tr>
                <td colSpan="2" className="px-4 py-3 text-right text-sm font-extrabold text-slate-700 dark:text-slate-300 uppercase">
                  Grand Total ({filterRegion} {filterStation !== 'ALL STATIONS' ? `- ${filterStation}` : ''})
                </td>
                <td className="px-4 py-3 text-right text-base font-extrabold text-red-600 dark:text-red-400">
                  {grandTotal}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}