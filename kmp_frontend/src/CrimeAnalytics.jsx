// src/components/CrimeAnalytics.jsx
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Filter, Search, Shield, Sprout } from 'lucide-react';
import { authFetch } from './api';

const REGIONAL_HIERARCHY = {
  "KMP NORTH": ["KMP NORTH HEADQUARTERS", "KAWEMPE", "KAKIRI", "KASANGATI", "MATUGGA", "NANSANA", "OLD KAMPALA", "WAKISO", "WANDEGEYA"],
  "KMP EAST": ["KMP EAST HEADQUARTERS", "JINJA ROAD", "KIRA", "KIRA DIV", "KIRA ROAD", "MUKONO", "NAGGALAMA", "SEETA"],
  "KMP SOUTH": ["KMP SOUTH HEADQUARTERS", "NATEETE", "CPS KAMPALA", "PARLIAMENT", "ENTEBBE", "KABALAGALA", "KAJJANSI", "KASENYI", "KATWE", "KYENGERA", "NSANGI"],
  "KMP HEADQUARTERS": ["KMP HEADQUARTERS", "FLYING SQUAD", "CRIME INTELLIGENCE"],
  "POLICE HEADQUARTERS": ["NAGURU"]
};

const stripHtml = (html) => {
  if (!html) return '';
  return String(html).replace(/<[^>]*>?/gm, '').trim();
};

const isStationEquivalent = (statA, statB) => {
  const a = stripHtml(statA || '').trim().toUpperCase();
  const b = stripHtml(statB || '').trim().toUpperCase();
  if (!a || !b) return false;
  if (a === b) return true;

  const cleanA = a.replace(/(\s+HEADQUARTERS|\s+HQ)$/, '');
  const cleanB = b.replace(/(\s+HEADQUARTERS|\s+HQ)$/, '');

  return cleanA === cleanB && cleanA.length > 0;
};

const getOfficialRegionForStation = (stationName, dbRegion) => {
  const cleanStation = stripHtml(stationName || '').trim().toUpperCase();
  const cleanDbRegion = stripHtml(dbRegion || '').trim().toUpperCase();

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

export default function CrimeAnalytics({ currentUser, canViewGlobal = false }) {
  const [reports, setReports] = useState([]);
  const [timeFilter, setTimeFilter] = useState("all"); 
  const [showAgriculturalOnly, setShowAgriculturalOnly] = useState(false);

  const userRoleClean = stripHtml(currentUser?.role || '').toUpperCase();
  const userPosClean = stripHtml(currentUser?.position || '').toUpperCase();
  const userRegClean = stripHtml(currentUser?.region || '').toUpperCase();

  const isGlobalTier = ['SUPER_ADMIN', 'ADMIN', 'ASSISTANT_SUPER_ADMIN'].includes(userRoleClean) || 
    ['KMP COMMANDER', 'DEPUTY KMP COMMANDER', 'KMP ADMIN OFFICER'].includes(userPosClean) || 
    currentUser?.permissions?.view_global_roster === true;

  const isKmpSystemManager = userRoleClean === 'SYSTEM_MANAGER' && ['KMP HEADQUARTERS', 'POLICE HEADQUARTERS'].includes(userRegClean) && userPosClean.includes('KMP');
  const isKmpSpecialist = userRoleClean === 'ASSISTANT_SYSTEM_MANAGER' && ['KMP HEADQUARTERS', 'POLICE HEADQUARTERS'].includes(userRegClean) && userPosClean.includes('KMP');

  const canViewGlobalLevel = canViewGlobal || isGlobalTier || isKmpSystemManager || isKmpSpecialist;
  
  const isRegionalCommand = ['RPC', 'DEPUTY_RPC', 'SYSTEM_MANAGER', 'ASSISTANT_SYSTEM_MANAGER', 'REGIONAL_ADMIN', 'ASSISTANT_REGIONAL_ADMIN'].includes(userRoleClean) && !canViewGlobalLevel;

  const [filterRegion, setFilterRegion] = useState(canViewGlobalLevel ? 'ALL REGIONS' : userRegClean);
  const [filterStation, setFilterStation] = useState((canViewGlobalLevel || isRegionalCommand) ? 'ALL STATIONS' : stripHtml(currentUser?.station || '').toUpperCase());

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
        setFilterStation(stripHtml(currentUser?.station || '').toUpperCase());
      }
      isFilterInitialized.current = true;
    }
  }, [canViewGlobalLevel, isRegionalCommand, userRegClean, currentUser?.station]);

  useEffect(() => {
    let isMounted = true;
    
    const fetchWrapper = typeof authFetch === 'function' ? authFetch : async (url) => {
      const token = localStorage.getItem('kmp_authToken');
      return fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
    };

    const API_URL = import.meta.env?.VITE_API_URL || "http://127.0.0.1:8000";
    
    fetchWrapper(`${API_URL}/api/v1/reports`)
      .then(res => {
        if (!res.ok) throw new Error("Failed to authenticate");
        return res.json();
      })
      .then(data => {
        if (isMounted) setReports(Array.isArray(data) ? data : []);
      })
      .catch(err => console.error("Failed to fetch reports:", err));

    return () => { isMounted = false; };
  }, []);

  const filteredReports = useMemo(() => {
    return reports.filter(report => {
      if (timeFilter !== "all") {
        const reportDateStr = report.date || report.createdAt || report.timestamp;
        if (!reportDateStr) return true;
        const reportDate = new Date(reportDateStr);
        const today = new Date();
        
        if (timeFilter === "today") {
          if (reportDate.toDateString() !== today.toDateString()) return false;
        } else if (timeFilter === "week") {
          const oneWeekAgo = new Date();
          oneWeekAgo.setDate(today.getDate() - 7);
          if (reportDate < oneWeekAgo) return false;
        }
      }

      // 🟢 Heavy-Lift Backend Flag Integration with Frontend Fallback
      if (showAgriculturalOnly) {
        if (report.isAgriculturalCrime !== undefined) {
          if (!report.isAgriculturalCrime) return false;
        } else {
          const offenceText = stripHtml(report.offence || '').toLowerCase();
          const narrativeText = stripHtml(report.narrative || '').toLowerCase();
          const combinedText = `${offenceText} ${narrativeText}`;

          const excludedTerms = ['murder', 'homicide', 'killed', 'death', 'accident', 'tar', 'collision', 'hit and run', 'overturned', 'crash', 'boda boda', 'motorcycle', 'motor cycle', 'bajaj', 'tvs', 'boxer', 'scooter', 'traffic', 'aggravated robbery', 'defilement', 'rape'];
          if (excludedTerms.some(term => offenceText.includes(term) || combinedText.includes(term))) {
            return false;
          }

          const agriCrimeIndicators = ['theft of produce', 'produce theft', 'animal theft', 'cattle theft', 'stole a cow', 'stole cattle', 'stock theft', 'theft of livestock', 'granary', 'granaries', 'broke into food store', 'food stores', 'storehouse', 'barn', 'silo', 'silos', 'cutting down crops', 'cutting crops', 'slashing crops', 'burning crops', 'burning produce', 'destroying crops', 'crop destruction', 'arson of crops', 'arson of produce', 'theft of crops', 'theft of coffee', 'theft of vanilla', 'theft of cassava', 'theft of maize', 'coffee theft', 'vanilla theft', 'maize theft', 'matooke theft', 'theft of matooke', 'bribery to receive farm inputs', 'extortion of farmers', 'farm break-in', 'farm robbery', 'farm trespass', 'fire on crops', 'fire in the sugarcane', 'fire on farm house', 'crop theft', 'suspected stolen cows', 'suspected stolen cattle', 'suspected stolen goats', 'suspected stolen sheep', 'suspected stolen chicken', 'suspected stolen eggs', 'suspected stolen produce', 'suspected stolen coffee', 'suspected stolen vanilla', 'suspected stolen maize', 'suspected stolen matooke', 'suspected stolen cassava', 'suspected stolen livestock', 'suspected stolen funds for farmers'];

          const isAgriCrimeMatch = agriCrimeIndicators.some(indicator => combinedText.includes(indicator));
          if (!isAgriCrimeMatch) return false;
        }
      }

      const stn = stripHtml(report.station || '').toUpperCase();
      const reg = getOfficialRegionForStation(stn, report.region);

      if (canViewGlobalLevel && filterRegion === 'ALL REGIONS' && filterStation === 'ALL STATIONS') {
        return true;
      }

      const belongsToRegion = filterRegion === 'ALL REGIONS' || 
                              reg === filterRegion || 
                              (REGIONAL_HIERARCHY[filterRegion] && REGIONAL_HIERARCHY[filterRegion].some(s => isStationEquivalent(s, stn)));

      if (!belongsToRegion) return false;

      if (filterStation !== 'ALL STATIONS') {
        if (!isStationEquivalent(stn, filterStation)) return false;
      }

      return true;
    });
  }, [reports, timeFilter, showAgriculturalOnly, filterRegion, filterStation, canViewGlobalLevel]);

  const summaryData = useMemo(() => {
    const crimeCounts = {};
    filteredReports.forEach(report => {
      if (report.is_hq_general_total || (report.daily_lock_up && !report.offence)) return;

      const crimeName = report.offence || report.crime_category || "Unspecified";
      if (crimeCounts[crimeName]) {
        crimeCounts[crimeName] += 1;
      } else {
        crimeCounts[crimeName] = 1;
      }
    });

    return Object.keys(crimeCounts).map((crimeName, index) => ({
      sn: index + 1,
      incident: crimeName,
      total: crimeCounts[crimeName]
    })).sort((a, b) => b.total - a.total);
  }, [filteredReports]);

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
              <option value={stripHtml(currentUser?.station || '').toUpperCase()}>{stripHtml(currentUser?.station || '').toUpperCase() || 'UNKNOWN'}</option>
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
            {summaryData.length > 0 ? (
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