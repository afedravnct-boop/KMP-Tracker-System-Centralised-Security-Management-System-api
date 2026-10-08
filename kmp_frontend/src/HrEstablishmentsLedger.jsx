// src/components/HrEstablishmentsLedger.jsx
import React, { useState, useMemo, useEffect } from 'react';
import { X, Shield, FileText, Users, Building, Filter, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { stripHtmlTags } from './App';
import { authFetch, hasValidSession } from './api';

const REGIONAL_HIERARCHY = {
  "KMP NORTH": ["KMP NORTH HEADQUARTERS", "KAWEMPE", "KAKIRI", "KASANGATI", "MATUGGA", "NANSANA", "OLD KAMPALA", "WAKISO", "WANDEGEYA"],
  "KMP EAST": ["KMP EAST HEADQUARTERS", "JINJA ROAD", "KIRA", "KIRA DIV", "KIRA ROAD", "MUKONO", "NAGGALAMA", "SEETA"],
  "KMP SOUTH": ["KMP SOUTH HEADQUARTERS", "NATEETE", "CPS KAMPALA", "PARLIAMENT", "ENTEBBE", "KABALAGALA", "KAJJANSI", "KASENYI", "KATWE", "KYENGERA", "NSANGI"],
  "KMP HEADQUARTERS": ["KMP HEADQUARTERS", "FLYING SQUAD", "CRIME INTELLIGENCE"],
  "POLICE HEADQUARTERS": ["NAGURU"]
};

const HrEstablishmentsLedger = ({ onClose, currentUser, canViewGlobal = false }) => {
  const [data, setData] = useState({ nominalAggregates: [], hierarchicalEstablishments: [] });
  const [isLoading, setIsLoading] = useState(true);

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

  const [selectedRegion, setSelectedRegion] = useState(canViewGlobalLevel ? 'ALL REGIONS' : userRegClean);
  const [selectedStation, setSelectedStation] = useState((canViewGlobalLevel || isRegionalCommand) ? 'ALL STATIONS' : stripHtmlTags(currentUser?.station || '').toUpperCase());

  const [expandedRegions, setExpandedRegions] = useState({
    "KMP NORTH": true,
    "KMP SOUTH": true,
    "KMP EAST": true,
    "KMP HEADQUARTERS": true,
    "POLICE HEADQUARTERS": true,
    "GENERAL / HQ": true
  });

  const toggleRegion = (regionName) => {
    setExpandedRegions(prev => ({
      ...prev,
      [regionName]: !prev[regionName]
    }));
  };

  useEffect(() => {
    if (canViewGlobalLevel) {
      setSelectedRegion('ALL REGIONS');
      setSelectedStation('ALL STATIONS');
    } else if (isRegionalCommand) {
      setSelectedRegion(userRegClean);
      setSelectedStation('ALL STATIONS');
    } else {
      setSelectedRegion(userRegClean);
      setSelectedStation(stripHtmlTags(currentUser?.station || '').toUpperCase());
    }
  }, [canViewGlobalLevel, isRegionalCommand, userRegClean, currentUser?.station]);

  useEffect(() => {
    const fetchAggregates = async () => {
      if (!hasValidSession()) return;
      setIsLoading(true);
      try {
        const res = await authFetch('/api/v1/hr/aggregated-ledger');
        if (res.ok) {
          const result = await res.json();
          setData(result);
        }
      } catch (err) {
        console.error("Failed to load server-aggregated HR ledger:", err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchAggregates();
  }, []);

  // Filter backend nominal aggregates based on active UI selections
  const filteredNominalAggregates = useMemo(() => {
    if (!data.nominalAggregates) return [];
    if (!selectedRegion || selectedRegion === 'ALL REGIONS') return data.nominalAggregates;

    const cleanSelected = selectedRegion.trim().toUpperCase();
    return data.nominalAggregates.filter(row => {
      const rName = (row.region || '').toUpperCase();
      if (cleanSelected.includes('NORTH') && rName.includes('NORTH')) return true;
      if (cleanSelected.includes('EAST') && rName.includes('EAST')) return true;
      if (cleanSelected.includes('SOUTH') && rName.includes('SOUTH')) return true;
      if (cleanSelected.includes('HEADQUARTERS') && (rName.includes('GENERAL') || rName.includes('HQ') || rName.includes('HEADQUARTERS'))) return true;
      return rName === cleanSelected;
    });
  }, [data.nominalAggregates, selectedRegion]);

  const filteredEstablishments = useMemo(() => {
    if (!data.hierarchicalEstablishments) return [];
    if (!selectedRegion || selectedRegion === 'ALL REGIONS') return data.hierarchicalEstablishments;

    const cleanSelected = selectedRegion.trim().toUpperCase();
    return data.hierarchicalEstablishments.filter(group => {
      const gName = (group.regionName || '').toUpperCase();
      return gName.includes(cleanSelected) || cleanSelected.includes(gName);
    });
  }, [data.hierarchicalEstablishments, selectedRegion]);

  const masterTotals = useMemo(() => {
    return filteredNominalAggregates.reduce((acc, curr) => {
      acc.totalOff += curr.totalOff;
      acc.totalNco += curr.totalNco;
      acc.regionTotal += curr.regionTotal;

      acc.offSex.M += curr.officers.sex.M;
      acc.offSex.F += curr.officers.sex.F;
      acc.ncoSex.M += curr.ncos.sex.M;
      acc.ncoSex.F += curr.ncos.sex.F;

      acc.offAge.twenties += curr.officers.age.twenties;
      acc.offAge.thirties += curr.officers.age.thirties;
      acc.offAge.forties += curr.officers.age.forties;
      acc.offAge.fifties += curr.officers.age.fifties;
      acc.offAge.unknown += curr.officers.age.unknown;

      acc.ncoAge.twenties += curr.ncos.age.twenties;
      acc.ncoAge.thirties += curr.ncos.age.thirties;
      acc.ncoAge.forties += curr.ncos.age.forties;
      acc.ncoAge.fifties += curr.ncos.age.fifties;
      acc.ncoAge.unknown += curr.ncos.age.unknown;

      acc.offEdu.degree += curr.officers.edu.degree;
      acc.offEdu.diploma += curr.officers.edu.diploma;
      acc.offEdu.cert += curr.officers.edu.cert;
      acc.offEdu.uace += curr.officers.edu.uace;
      acc.offEdu.uce += curr.officers.edu.uce;
      acc.offEdu.s2_s3 += curr.officers.edu.s2_s3;
      acc.offEdu.others += curr.officers.edu.others;

      acc.ncoEdu.degree += curr.ncos.edu.degree;
      acc.ncoEdu.diploma += curr.ncos.edu.diploma;
      acc.ncoEdu.cert += curr.ncos.edu.cert;
      acc.ncoEdu.uace += curr.ncos.edu.uace;
      acc.ncoEdu.uce += curr.ncos.edu.uce;
      acc.ncoEdu.s2_s3 += curr.ncos.edu.s2_s3;
      acc.ncoEdu.others += curr.ncos.edu.others;

      return acc;
    }, { 
      totalOff: 0, totalNco: 0, regionTotal: 0, 
      offSex: { M: 0, F: 0 }, ncoSex: { M: 0, F: 0 },
      offAge: { twenties: 0, thirties: 0, forties: 0, fifties: 0, unknown: 0 },
      ncoAge: { twenties: 0, thirties: 0, forties: 0, fifties: 0, unknown: 0 },
      offEdu: { degree: 0, diploma: 0, cert: 0, uace: 0, uce: 0, s2_s3: 0, others: 0 },
      ncoEdu: { degree: 0, diploma: 0, cert: 0, uace: 0, uce: 0, s2_s3: 0, others: 0 }
    });
  }, [filteredNominalAggregates]);

  const renderAgeBlock = (stats, isDark = false) => (
    <div className={`text-[9px] font-medium space-y-0.5 w-full max-w-[90px] mx-auto ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
      <div className="flex justify-between"><span>18-29yrs:</span> <strong className={isDark ? 'text-white' : 'text-slate-900'}>{stats.age.twenties}</strong></div>
      <div className="flex justify-between"><span>30-39yrs:</span> <strong className={isDark ? 'text-white' : 'text-slate-900'}>{stats.age.thirties}</strong></div>
      <div className="flex justify-between"><span>40-49yrs:</span> <strong className={isDark ? 'text-white' : 'text-slate-900'}>{stats.age.forties}</strong></div>
      <div className={`flex justify-between border-t pt-0.5 mt-0.5 ${isDark ? 'border-slate-600' : 'border-slate-200'}`}><span>50+ yrs:</span> <strong className={isDark ? 'text-white' : 'text-slate-900'}>{stats.age.fifties}</strong></div>
      {stats.age.unknown > 0 && <div className={`flex justify-between italic mt-0.5 ${isDark ? 'text-red-400' : 'text-red-500'}`}><span>Unrecorded:</span> <strong>{stats.age.unknown}</strong></div>}
    </div>
  );

  const renderEduBlock = (stats, isDark = false) => (
    <div className={`text-[9px] font-medium space-y-0.5 w-full max-w-[90px] mx-auto ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
      <div className="flex justify-between"><span>Degree:</span> <strong className={isDark ? 'text-white' : 'text-slate-900'}>{stats.edu.degree}</strong></div>
      <div className="flex justify-between"><span>Diploma:</span> <strong className={isDark ? 'text-white' : 'text-slate-900'}>{stats.edu.diploma}</strong></div>
      <div className="flex justify-between"><span>Cert:</span> <strong className={isDark ? 'text-white' : 'text-slate-900'}>{stats.edu.cert}</strong></div>
      <div className="flex justify-between text-blue-700 font-bold"><span>UACE (S6):</span> <strong className={isDark ? 'text-blue-300' : 'text-blue-900'}>{stats.edu.uace}</strong></div>
      <div className="flex justify-between text-emerald-700 font-bold"><span>UCE (S4):</span> <strong className={isDark ? 'text-emerald-300' : 'text-emerald-900'}>{stats.edu.uce}</strong></div>
      <div className={`flex justify-between border-t pt-0.5 mt-0.5 ${isDark ? 'border-slate-600' : 'border-slate-200'}`}><span>S2 / S3:</span> <strong className={isDark ? 'text-white' : 'text-slate-900'}>{stats.edu.s2_s3}</strong></div>
      <div className="flex justify-between"><span>Others:</span> <strong className={isDark ? 'text-white' : 'text-slate-900'}>{stats.edu.others}</strong></div>
    </div>
  );

  if (isLoading) {
    return (
      <div className="absolute inset-0 bg-slate-100 z-50 flex flex-col items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-2" />
        <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">Loading Server-Computed HR Aggregates...</p>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 bg-slate-100 z-50 flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
      <div className="bg-slate-900 text-white px-6 py-4 flex justify-between items-center shadow-md shrink-0">
        <div>
          <h2 className="text-lg font-black flex items-center tracking-wide uppercase"><FileText className="mr-2 text-blue-400" /> Human Resource & Establishments Ledger</h2>
          <p className="text-xs text-slate-400 font-medium mt-1 tracking-wider">KMP Command Operational Aggregates (Server Side)</p>
        </div>
        <button onClick={onClose} className="bg-slate-800 hover:bg-slate-700 text-white p-2 rounded-lg transition-colors border border-slate-600 shadow-sm flex items-center cursor-pointer">
          <X size={18} className="mr-2"/> Close Module
        </button>
      </div>

      <div className="bg-white px-6 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4 shrink-0 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-bold text-slate-500 uppercase flex items-center">
            <Filter size={14} className="mr-1 text-blue-600" /> Jurisdiction Filters:
          </span>

          <select 
            value={selectedRegion} 
            onChange={(e) => { setSelectedRegion(e.target.value); setSelectedStation('ALL STATIONS'); }}
            disabled={!canViewGlobalLevel}
            className="border border-slate-300 rounded-lg p-2 text-xs font-bold text-slate-800 bg-white outline-none cursor-pointer disabled:bg-slate-100 disabled:text-slate-500"
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

          <select 
            value={selectedStation} 
            onChange={(e) => setSelectedStation(e.target.value)}
            disabled={!(canViewGlobalLevel || isRegionalCommand)}
            className="border border-slate-300 rounded-lg p-2 text-xs font-bold text-slate-800 bg-white outline-none cursor-pointer disabled:bg-slate-100 disabled:text-slate-500"
          >
            {(canViewGlobalLevel || isRegionalCommand) ? (
              <>
                <option value="ALL STATIONS">ALL STATIONS</option>
                {selectedRegion !== 'ALL REGIONS' && (REGIONAL_HIERARCHY[selectedRegion] || []).map(stn => (
                  <option key={stn} value={stn}>{stn}</option>
                ))}
              </>
            ) : (
              <option value={stripHtmlTags(currentUser?.station || '').toUpperCase()}>{stripHtmlTags(currentUser?.station || '').toUpperCase() || 'UNKNOWN'}</option>
            )}
          </select>
        </div>

        <span className="text-xs font-extrabold text-blue-800 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-200">
          Active Filter: {selectedRegion} {selectedStation !== 'ALL STATIONS' ? `➔ ${selectedStation}` : ''}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-8 custom-scrollbar bg-slate-50 space-y-12">
        
        {/* NOMINAL ROLL AGGREGATES TABLE */}
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
                   {filteredNominalAggregates.map((row, index) => (
                      <tr key={index} className="hover:bg-blue-50/50 transition-colors">
                         <td className="p-3 text-center text-xs font-bold text-slate-700 border-r border-slate-200">{index + 1}</td>
                         <td className="p-3 text-left text-xs font-black text-slate-900 border-r border-slate-200 bg-slate-50/50">{stripHtmlTags(row.region)}</td>
                         
                         <td className="p-3 text-center text-sm font-extrabold text-blue-700 border-r border-slate-200">{row.totalOff}</td>
                         <td className="p-3 text-center text-sm font-extrabold text-green-700 border-r border-slate-200">{row.totalNco}</td>
                         
                         <td className="p-2 align-top border-r border-slate-200 bg-blue-50/10">{renderAgeBlock(row.officers)}</td>
                         <td className="p-2 align-top border-r border-slate-200 bg-green-50/10">{renderAgeBlock(row.ncos)}</td>
                         
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

                         <td className="p-2 align-top border-r border-slate-200 bg-blue-50/10">{renderEduBlock(row.officers)}</td>
                         <td className="p-2 align-top border-r border-slate-200 bg-green-50/10">{renderEduBlock(row.ncos)}</td>
                         
                         <td className="p-3 text-center text-sm font-black text-blue-800 bg-blue-50 border-r border-blue-100 shadow-inner">{row.totalOff}</td>
                         <td className="p-3 text-center text-sm font-black text-emerald-800 bg-emerald-50 border-r border-emerald-100 shadow-inner">{row.totalNco}</td>
                         <td className="p-3 text-center text-base font-bold text-slate-900 bg-slate-100 shadow-inner">{row.regionTotal}</td>
                      </tr>
                   ))}

                   <tr className="bg-slate-800 border-t-[3px] border-slate-900">
                      <td colSpan="2" className="p-4 text-center text-[11px] font-black text-yellow-400 uppercase tracking-widest border-r border-slate-700 shadow-inner">
                          KMP MASTER TOTALS:
                      </td>
                      <td className="p-4 text-center text-base font-bold text-blue-300 border-r border-slate-700">{masterTotals.totalOff}</td>
                      <td className="p-4 text-center text-base font-bold text-green-400 border-r border-slate-700">{masterTotals.totalNco}</td>
                      
                      <td className="p-2 align-top border-r border-slate-700 bg-slate-500/40">
                        {renderAgeBlock({ age: masterTotals.offAge }, true)}
                      </td>
                      <td className="p-2 align-top border-r border-slate-700 bg-slate-900/40">
                        {renderAgeBlock({ age: masterTotals.ncoAge }, true)}
                      </td>

                      <td className="p-2 text-center align-middle border-r border-slate-700 bg-slate-700/50">
                         <div className="inline-flex flex-col space-y-1">
                            <span className="text-[10px] font-bold text-blue-200 bg-blue-900/50 px-2 border border-blue-800 rounded shadow-sm">M: {masterTotals.offSex.M}</span>
                            <span className="text-[10px] font-bold text-pink-300 bg-pink-900/50 px-2 border border-pink-800 rounded shadow-sm">F: {masterTotals.offSex.F}</span>
                         </div>
                      </td>
                      <td className="p-2 text-center align-middle border-r border-slate-700 bg-slate-700/50">
                         <div className="inline-flex flex-col space-y-1">
                            <span className="text-[10px] font-bold text-blue-200 bg-blue-900/50 px-2 border border-blue-800 rounded shadow-sm">M: {masterTotals.ncoSex.M}</span>
                            <span className="text-[10px] font-bold text-pink-300 bg-pink-900/50 px-2 border border-blue-800 rounded shadow-sm">F: {masterTotals.ncoSex.F}</span>
                         </div>
                      </td>
                      
                      <td className="p-2 align-top border-r border-slate-700 bg-slate-500/40">
                        {renderEduBlock({ edu: masterTotals.offEdu }, true)}
                      </td>
                      <td className="p-2 align-top border-r border-slate-700 bg-slate-500/40">
                        {renderEduBlock({ edu: masterTotals.ncoEdu }, true)}
                      </td>

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

        {/* POLICE ESTABLISHMENTS TABLE */}
        <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden mx-auto max-w-[1400px]">
          <div className="bg-slate-100 px-4 py-3 border-b border-slate-200 flex justify-between items-center">
             <h3 className="font-extrabold text-green-900 text-sm uppercase tracking-wider flex items-center">
                <Building className="mr-2 w-5 h-5" /> Police Establishments (Hierarchical Nominal Roll Extraction)
             </h3>
          </div>
          <div className="overflow-x-auto w-full max-h-[650px] custom-scrollbar">
             <table className="min-w-full divide-y divide-slate-200 text-xs">
                <thead className="bg-slate-900 text-white sticky top-0 shadow-sm z-10">
                   <tr>
                      <th className="p-3 text-center text-[10px] font-black uppercase w-12 border-r border-slate-700">SN</th>
                      <th className="p-3 text-left text-[11px] font-black uppercase border-r border-slate-700">REGIONAL HQ</th>
                      <th className="p-3 text-center text-[10px] font-black uppercase border-r border-slate-700">NO OF PERSONNEL</th>
                      <th className="p-3 text-left text-[11px] font-black uppercase border-r border-slate-700">STATION</th>
                      <th className="p-3 text-center text-[10px] font-black uppercase border-r border-slate-700">NO OF PERSONNEL</th>
                      <th className="p-3 text-left text-[11px] font-black uppercase border-r border-slate-700">POST</th>
                      <th className="p-3 text-center text-[10px] font-black uppercase border-r border-slate-700">NO OF PERSONNEL</th>
                      <th className="p-3 text-center text-[11px] font-black uppercase bg-emerald-800 text-white">TOTAL MANPOWER</th>
                   </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-200">
                   {filteredEstablishments.map((regGroup, rIdx) => {
                      const isExpanded = !!expandedRegions[regGroup.regionName];
                      let regHqSum = regGroup.hqPersonnel;
                      let regTotalSum = regHqSum + Object.values(regGroup.stations).reduce((acc, s) => acc + s.stationPersonnel + Object.values(s.posts).reduce((a, b) => a + b, 0), 0);

                      return (
                         <React.Fragment key={regGroup.regionName}>
                            <tr 
                              onClick={() => toggleRegion(regGroup.regionName)}
                              className="bg-slate-100 hover:bg-slate-200 cursor-pointer transition-colors font-extrabold text-slate-900 border-t-2 border-slate-300 select-none"
                            >
                               <td className="p-3 text-center font-bold text-slate-700 border-r border-slate-200">{rIdx + 1}</td>
                               <td className="p-3 uppercase flex items-center space-x-2 border-r border-slate-200">
                                  <span className="text-blue-700">{isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</span>
                                  <span>🛡️ {regGroup.regionName} HEADQUARTERS</span>
                               </td>
                               <td className="p-3 text-center font-black text-blue-800 border-r border-slate-200">{regHqSum > 0 ? regHqSum : '-'}</td>
                               <td className="p-3 text-slate-400 border-r border-slate-200">-</td>
                               <td className="p-3 text-center text-slate-400 border-r border-slate-200">-</td>
                               <td className="p-3 text-slate-400 border-r border-slate-200">-</td>
                               <td className="p-3 text-center text-slate-400 border-r border-slate-200">-</td>
                               <td className="p-3 text-center font-black text-white bg-emerald-800 shadow-inner">{regTotalSum > 0 ? regTotalSum : '-'}</td>
                            </tr>

                            {isExpanded && Object.values(regGroup.stations).map((stnObj, sIdx) => {
                               const stnTotal = stnObj.stationPersonnel + Object.values(stnObj.posts).reduce((a, b) => a + b, 0);
                               
                               return (
                                  <React.Fragment key={`${regGroup.regionName}-${stnObj.stationName}-${sIdx}`}>
                                     <tr className="hover:bg-emerald-50/40 transition-colors bg-white">
                                        <td className="p-3 text-slate-400 border-r border-slate-200 text-center">·</td>
                                        <td className="p-3 text-slate-400 border-r border-slate-200">-</td>
                                        <td className="p-3 text-center text-slate-400 border-r border-slate-200">-</td>
                                        <td className="p-3 font-bold text-slate-700 uppercase border-r border-slate-200 pl-6">
                                            ↳ {stnObj.stationName}
                                        </td>
                                        <td className="p-3 text-center font-bold text-green-700 bg-slate-50/50 border-r border-slate-200">
                                           {stnObj.stationPersonnel > 0 ? stnObj.stationPersonnel : '-'}
                                        </td>
                                        <td className="p-3 text-slate-400 border-r border-slate-200">-</td>
                                        <td className="p-3 text-center text-slate-400 border-r border-slate-200">-</td>
                                        <td className="p-3 text-center font-bold text-emerald-700 bg-slate-50/30">
                                           {stnTotal > 0 ? stnTotal : '-'}
                                        </td>
                                     </tr>

                                     {Object.entries(stnObj.posts).map(([postName, postCount], pIdx) => (
                                         <tr key={`post-${pIdx}`} className="hover:bg-amber-50/30 transition-colors bg-slate-50/30">
                                            <td className="p-2 text-slate-400 border-r border-slate-200 text-center">·</td>
                                            <td className="p-2 text-slate-400 border-r border-slate-200">-</td>
                                            <td className="p-2 text-center text-slate-400 border-r border-slate-200">-</td>
                                            <td className="p-2 text-slate-400 border-r border-slate-200">-</td>
                                            <td className="p-2 text-center text-slate-400 border-r border-slate-200">-</td>
                                            <td className="p-2 font-medium text-slate-600 uppercase border-r border-slate-200 pl-8">
                                                └─ {postName}
                                            </td>
                                            <td className="p-2 text-center font-bold text-amber-700 border-r border-slate-200">
                                               {postCount > 0 ? postCount : '-'}
                                            </td>
                                            <td className="p-2 text-center font-bold text-amber-800 bg-amber-50/30">
                                               {postCount > 0 ? postCount : '-'}
                                            </td>
                                         </tr>
                                     ))}
                                  </React.Fragment>
                               );
                            })}
                         </React.Fragment>
                      );
                   })}
                </tbody>
             </table>
          </div>
        </div>

      </div>
    </div>
  );
};

export default HrEstablishmentsLedger;