// src/components/Statistics.jsx
import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { BarChart3, PlusCircle, Edit, AlertTriangle, CheckCircle, Sprout, Save, HardDrive, X, Car, Flame, Info } from 'lucide-react';
import { authFetch, hasValidSession } from './api';

const REGIONAL_HIERARCHY = {
  "KMP NORTH": ["KMP NORTH HEADQUARTERS", "KAWEMPE", "KAKIRI", "KASANGATI", "MATUGGA", "NANSANA", "OLD KAMPALA", "WAKISO", "WANDEGEYA"],
  "KMP EAST": ["KMP EAST HEADQUARTERS", "JINJA ROAD", "KIRA", "KIRA DIV", "KIRA ROAD", "MUKONO", "NAGGALAMA", "SEETA"],
  "KMP SOUTH": ["KMP SOUTH HEADQUARTERS", "NATEETE", "CPS KAMPALA", "PARLIAMENT", "ENTEBBE", "KABALAGALA", "KAJJANSI", "KASENYI", "KATWE", "KYENGERA", "NSANGI"],
  "KMP HEADQUARTERS": ["KMP HEADQUARTERS", "FLYING SQUAD", "CRIME INTELLIGENCE"],
  "POLICE HEADQUARTERS": ["NAGURU"]
};

const COMMON_ACCIDENTS = [
  "HEAD-ON COLLISION",
  "REAR-END COLLISION",
  "SIDE-IMPACT (T-BONE) COLLISION",
  "HIT AND RUN",
  "MOTORCYCLE (BODA BODA) CRASH",
  "PEDESTRIAN KNOCKED",
  "OVERTURNING / ROLLOVER",
  "MULTIPLE VEHICLE PILE-UP",
  "LOSS OF CONTROL / SKIDDING",
  "BICYCLE COLLISION",
  "VEHICLE FIRE",
  "BOAT CRASH",
  "BOAT CAPSIZING",
  "TRAIN DERAILMENT / LEVEL CROSSING",
  "AIRCRAFT / AVIATION INCIDENT"
];

const COMMON_FIRES = [
  "MARKET FIRE OUTBREAK",
  "RESIDENTIAL BUILDING FIRE",
  "COMMERCIAL PLAZA FIRE",
  "INDUSTRIAL / FACTORY FIRE",
  "SCHOOL / DORMITORY FIRE",
  "FUEL TANKER / VEHICLE FIRE",
  "BUSH / GRASS FIRE",
  "ELECTRICAL SHORT CIRCUIT FIRE",
  "GAS CYLINDER EXPLOSION",
  "WAREHOUSE / STORAGE FIRE",
  "LIGHTNING STRIKE / ACT OF GOD",
  "OTHER"
];

const cleanStr = (str) => {
  if (!str) return '';
  return String(str).replace(/\s+/g, ' ').trim().toUpperCase();
};

const isStationEquivalent = (statA, statB) => {
  const a = cleanStr(statA);
  const b = cleanStr(statB);
  if (!a || !b) return false;
  if (a === b) return true;

  const cleanA = a.replace(/(\s+HEADQUARTERS|\s+HQ)$/, '');
  const cleanB = b.replace(/(\s+HEADQUARTERS|\s+HQ)$/, '');

  return cleanA === cleanB && cleanA.length > 0;
};

const MetricCard = ({ title, value, colorClass }) => (
  <div className="bg-white dark:bg-slate-800 p-2 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col items-center justify-center text-center">
    <h4 className="text-[10px] font-bold mb-1 uppercase tracking-wider text-slate-500 dark:text-slate-400">{title}</h4>
    <div className={`text-[15px] font-black leading-none ${colorClass}`}>{value}</div>
  </div>
);

const ExpandableTableCard = ({ title, children, onToggle }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const openFullScreen = () => {
    setIsExpanded(true);
    if (typeof onToggle === 'function') onToggle(true);
  };

  const closeFullScreen = () => {
    setIsExpanded(false);
    if (typeof onToggle === 'function') onToggle(false);
  };

  return (
    <>
      {isExpanded ? (
        <div className="fixed inset-0 z-[250] bg-slate-900/95 backdrop-blur-sm flex flex-col p-4 sm:p-8 animate-in fade-in zoom-in duration-200">
          <div className="bg-slate-900 dark:bg-slate-950 px-6 py-4 flex justify-between items-center rounded-t-xl shadow-2xl shrink-0 border-b border-slate-800">
            <h3 className="font-extrabold text-white text-[13px] uppercase tracking-wider">
              {title} (FULL SCREEN)
            </h3>
            <button 
              onClick={closeFullScreen} 
              className="text-xs text-blue-400 hover:text-white font-bold cursor-pointer transition-colors bg-slate-800 dark:bg-slate-900 px-4 py-2 rounded-lg border border-slate-700"
            >
              Collapse ↙
            </button>
          </div>
          <div className="bg-white dark:bg-slate-900 dark:text-slate-100 flex-1 overflow-auto rounded-b-xl shadow-2xl p-4 border border-slate-300 dark:border-slate-800 custom-scrollbar">
            {children}
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col h-full relative z-10 mt-3">
          <div className="bg-slate-900 dark:bg-slate-950 px-4 py-2.5 flex justify-between items-center shrink-0 relative z-30">
            <h3 className="font-extrabold text-white text-[11px] uppercase tracking-wider">{title}</h3>
            <button 
              onClick={openFullScreen} 
              className="text-[10px] text-blue-400 hover:text-white font-bold cursor-pointer transition-colors bg-slate-800 hover:bg-slate-700 px-2 py-1 rounded border border-slate-700 shadow-inner"
            >
              Expand ↗
            </button>
          </div>
          <div className="w-full overflow-auto max-h-[600px] custom-scrollbar dark:bg-slate-900">
            {children}
          </div>
        </div>
      )}
    </>
  );
};

// 🟢 ACCOUNTABILITY LOGIC GUIDE
const AccountabilityGuide = () => (
  <div className="bg-slate-100 dark:bg-slate-800/80 p-4 rounded-lg border border-slate-300 dark:border-slate-700 text-[10px] text-slate-700 dark:text-slate-300 space-y-2.5 mt-5 leading-relaxed font-medium shadow-inner">
    <h5 className="font-black uppercase text-blue-900 dark:text-blue-400 flex items-center mb-1">
      <Info className="w-3.5 h-3.5 mr-1.5" /> Accountability Logic & Guide
    </h5>
    <ul className="space-y-2 pl-1">
      <li className="flex items-start"><span className="mr-1.5 text-blue-500">•</span> <span>The summation in accountability of suspects arrested from disruptive operations is majorly determined by three components namely; <strong>those given bond, cautioned and taken to court.</strong></span></li>
      <li className="flex items-start"><span className="mr-1.5 text-blue-500">•</span> <span>Pending court the previous day, and pending court today are purely for tracking the numbers (pending action), and labelled as not given bond, not cautioned and not taken to court. It is necessary only for distribution of suspects in correspondance with the original total arrested, those given bond and the ones taken to court, but has no impact on the statistics.</span></li>
      <li className="flex items-start"><span className="mr-1.5 text-blue-500">•</span> <span>Precisely, a station tracks suspects who are pending action in police custody using those two columns.</span></li>
      <li className="flex items-start"><span className="mr-1.5 text-blue-500">•</span> <span>In summary, the actual summation by action taken is done using the columns of given bond, cautioned and taken to court.</span></li>
      <li className="flex items-start"><span className="mr-1.5 text-blue-500">•</span> <span>The number of convicted suspects may be inconsistent with the actual number of suspects taken to court, as a result of deferred court actions, some of which happen without police involvement e.g. the granting of bail to a suspect who was remanded 6 months ago, in addition to the variations in remand periods.</span></li>
    </ul>
    <div className="font-black text-slate-900 dark:text-slate-100 uppercase border-t border-slate-300 dark:border-slate-600 pt-2.5 mt-3 text-[9px] tracking-wide bg-amber-50 dark:bg-amber-950/20 p-2 rounded">
      NOTE: WHEN A PREVIOUS WEEK'S PENDING COURT IS FORWARDED TO CURRENT WEEK, ANY EXCESSES IN FINAL TOTAL SHOULD EQUATE TO THE FORWARDED NUMBER, THAT MISSED COURT/ACTION THAT PAST WEEK.
    </div>
  </div>
);

const Statistics = ({ currentUser, canViewGlobal: propCanViewGlobal = false, setSidebarOpen, isReadOnlyObserver }) => {
  const userRoleClean = cleanStr(currentUser?.role);
  const userPosClean = cleanStr(currentUser?.position);
  const userRegClean = cleanStr(currentUser?.region);

  const isGlobalTier = ['SUPER_ADMIN', 'ASSISTANT_SUPER_ADMIN'].includes(userRoleClean) || 
    ['KMP COMMANDER', 'DEPUTY KMP COMMANDER', 'KMP ADMIN OFFICER'].includes(userPosClean) || 
    currentUser?.permissions?.view_global_roster === true;

  const isKmpSystemManager = userRoleClean === 'SYSTEM_MANAGER' && ['KMP HEADQUARTERS', 'POLICE HEADQUARTERS'].includes(userRegClean) && userPosClean.includes('KMP');
  const isKmpSpecialist = userRoleClean === 'ASSISTANT_SYSTEM_MANAGER' && ['KMP HEADQUARTERS', 'POLICE HEADQUARTERS'].includes(userRegClean) && userPosClean.includes('KMP');

  const canViewGlobalLevel = propCanViewGlobal || isGlobalTier || isKmpSystemManager || isKmpSpecialist;
  const isRegionalCommand = ['RPC', 'DEPUTY_RPC', 'SYSTEM_MANAGER', 'ASSISTANT_SYSTEM_MANAGER', 'REGIONAL_ADMIN', 'ASSISTANT_REGIONAL_ADMIN'].includes(userRoleClean) && !canViewGlobalLevel;
  const isCommandOrHR = isGlobalTier || isKmpSystemManager || isRegionalCommand || userPosClean.includes('HR');
  const canEditRecords = (isCommandOrHR || currentUser?.permissions?.upload_hr === true || currentUser?.permissions?.log_crime === true) && !isReadOnlyObserver;

  const [operation, setOperation] = useState('new');
  const [notification, setNotification] = useState(null);
  const [statsDomain, setStatsDomain] = useState('DISRUPTIVE');
  const [viewMode, setViewMode] = useState('STATION');
  const [disruptiveStats, setDisruptiveStats] = useState([]);
  const [agricStats, setAgricStats] = useState([]);
  const [accidentStats, setAccidentStats] = useState([]);
  const [fireStats, setFireStats] = useState([]);
  const [agricSummaryRecords, setAgricSummaryRecords] = useState([]);
  const [expandedAgricRegions, setExpandedAgricRegions] = useState({
    "KMP NORTH": true, "KMP SOUTH": false, "KMP EAST": false,
    "KMP HEADQUARTERS": false, "POLICE HEADQUARTERS": false
  });
  
  const [filterRegion, setFilterRegion] = useState(canViewGlobalLevel ? 'ALL REGIONS' : userRegClean);
  const [filterStation, setFilterStation] = useState((canViewGlobalLevel || isRegionalCommand) ? 'ALL STATIONS' : cleanStr(currentUser?.station));
  
  const [updateSearch, setUpdateSearch] = useState('');
  const [dateFilter, setDateFilter] = useState('ALL TIME');
  const isFilterInitialized = useRef(false);

  const getTodayString = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' }).split(',')[0].replace(/\//g, '-');

  const getInitialFormData = useCallback(() => {
      const targetRegion = (canViewGlobalLevel && filterRegion !== 'ALL REGIONS') ? filterRegion : userRegClean;
      const targetStation = (canViewGlobalLevel || isRegionalCommand) && filterStation !== 'ALL STATIONS' ? filterStation : currentUser.station || REGIONAL_HIERARCHY[currentUser?.region]?.[0] || '';
      
      if (statsDomain === 'ACCIDENTS') {
          return { sn: null, id: null, region: targetRegion, station: targetStation, date: getTodayString(), nature_of_accident: '', custom_nature_of_accident: '', minor: 0, serious: 0, fatal: 0, victims: 0 };
      }
      if (statsDomain === 'FIRES') {
          return { sn: null, id: null, region: targetRegion, station: targetStation, date: getTodayString(), nature_of_fire: '', custom_nature_of_fire: '', minor_outbreaks: 0, major_disasters: 0, fatal_fires: 0, victims: 0 };
      }
      return { sn: null, id: null, region: targetRegion, station: targetStation, date: getTodayString(), arrested: 0, given_bond: 0, cautioned: 0, pending_court_prev_ops: 0, pending_court_today_ops: 0, taken_to_court_prev_lockup: 0, taken_to_court_today_ops: 0, released: 0, remanded: 0, convicted: 0 };
  }, [statsDomain, userRegClean, currentUser.station, currentUser.region, filterRegion, filterStation, canViewGlobalLevel, isRegionalCommand]);

  const [formData, setFormData] = useState(getInitialFormData());
  const [agricFormData, setAgricFormData] = useState({
    agric_crime_report: '',
    number_count_label: '',
    recovery_report: '',
    recoveries_label: '',
    status: 'UNDER INVESTIGATION',
  });

  const handleGlobalFilterRegionChange = (newRegion) => {
    const cleanRegion = cleanStr(newRegion);
    setFilterRegion(cleanRegion);
    setFilterStation('ALL STATIONS');
    if (operation === 'new') {
        setFormData(prev => ({ ...prev, region: cleanRegion, station: REGIONAL_HIERARCHY[cleanRegion]?.[0] || '' }));
    }
  };

  const handleGlobalFilterStationChange = (newStation) => {
    const cleanStation = cleanStr(newStation);
    setFilterStation(cleanStation);
    if (operation === 'new') {
        setFormData(prev => ({ ...prev, station: cleanStation }));
    }
  };

  const getDateRangeParams = (filterOption) => {
    if (filterOption === 'ALL TIME') return { start: null, end: null };
    const nowStr = new Date().toLocaleString("en-US", { timeZone: "Africa/Nairobi" });
    const end = new Date(nowStr);
    const start = new Date(nowStr);

    if (filterOption === 'LAST 7 DAYS') { start.setDate(start.getDate() - 7); }
    else if (filterOption === 'LAST 14 DAYS') { start.setDate(start.getDate() - 14); }
    else if (filterOption === 'LAST 21 DAYS') { start.setDate(start.getDate() - 21); }
    else if (filterOption === 'LAST 30 DAYS') { start.setDate(start.getDate() - 30); }
    else if (filterOption === 'LAST 60 DAYS') { start.setDate(start.getDate() - 60); }
    else if (filterOption === 'LAST 90 DAYS') { start.setDate(start.getDate() - 90); }
    else if (filterOption === 'LAST 120 DAYS') { start.setDate(start.getDate() - 120); }
    else if (filterOption === 'LAST 180 DAYS') { start.setDate(start.getDate() - 180); }
    
    const pad = (n) => n.toString().padStart(2, '0');
    const format = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    
    if (filterOption === 'TODAY') return { start: format(end), end: format(end) };
    return { start: format(start), end: format(end) };
  };

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
        setFilterStation(cleanStr(currentUser.station));
      }
      isFilterInitialized.current = true;
    }
  }, [canViewGlobalLevel, isRegionalCommand, userRegClean, currentUser?.station]);

  const fetchDomainStats = useCallback(async () => {
    if (!hasValidSession()) return;
    try {
      const params = new URLSearchParams();
      if (!canViewGlobalLevel && filterRegion && filterRegion !== 'ALL REGIONS') params.append('region', filterRegion);
      if (filterStation && filterStation !== 'ALL STATIONS') params.append('station', filterStation);

      const qs = params.toString();
      let targetEndpoint = '';
      if (statsDomain === 'DISRUPTIVE') targetEndpoint = '/api/v1/stats';
      else if (statsDomain === 'AGRICULTURAL') targetEndpoint = '/api/v1/agric-stats';
      else if (statsDomain === 'ACCIDENTS') targetEndpoint = '/api/v1/accidents';
      else if (statsDomain === 'FIRES') targetEndpoint = '/api/v1/fires';

      const finalUrl = qs ? `${targetEndpoint}?${qs}` : targetEndpoint;
      const res = await authFetch(finalUrl);
      
      if (res.ok) {
          const data = await res.json();
          if (statsDomain === 'DISRUPTIVE') setDisruptiveStats(data);
          else if (statsDomain === 'AGRICULTURAL') setAgricStats(data);
          else if (statsDomain === 'ACCIDENTS') setAccidentStats(data);
          else if (statsDomain === 'FIRES') setFireStats(data);
      }
    } catch (err) {
      console.error(`Failed to load ${statsDomain} ledger:`, err);
    }
  }, [statsDomain, filterRegion, filterStation, canViewGlobalLevel]);

  const fetchAgricSummaries = useCallback(async () => {
    if (!hasValidSession() || statsDomain !== 'AGRICULTURAL') return;
    try {
      const params = new URLSearchParams();
      if (!canViewGlobalLevel && filterRegion && filterRegion !== 'ALL REGIONS') params.append('region', filterRegion);
      if (filterStation && filterStation !== 'ALL STATIONS') params.append('station', filterStation);

      const qs = params.toString();
      const finalUrl = qs ? `/api/v1/agric-summary?${qs}` : '/api/v1/agric-summary';

      const res = await authFetch(finalUrl);
      if (res.ok) {
        setAgricSummaryRecords(await res.json());
      }
    } catch (err) {
      console.error("Failed to load agricultural summary ledger:", err);
    }
  }, [statsDomain, filterRegion, filterStation, canViewGlobalLevel]);

  useEffect(() => {
    fetchDomainStats();
    fetchAgricSummaries();
  }, [fetchDomainStats, fetchAgricSummaries]);

  const currentDomainStats = useMemo(() => {
      let raw = [];
      if (statsDomain === 'DISRUPTIVE') raw = disruptiveStats;
      else if (statsDomain === 'AGRICULTURAL') raw = agricStats;
      else if (statsDomain === 'ACCIDENTS') raw = accidentStats;
      else if (statsDomain === 'FIRES') raw = fireStats;

      const { start, end } = getDateRangeParams(dateFilter);
      const activeReg = cleanStr(filterRegion);
      const activeStat = cleanStr(filterStation);

      return raw.filter(item => {
          const itemDateStr = String(item.date || item.created_at || '').split('T')[0];
          const itemRegion = cleanStr(item.region);
          const itemStation = cleanStr(item.station);

          if (start && end && (itemDateStr < start || itemDateStr > end)) return false;
          if (canViewGlobalLevel && activeReg === 'ALL REGIONS' && activeStat === 'ALL STATIONS') return true;

          const belongsToRegion = activeReg === 'ALL REGIONS' || itemRegion === activeReg || 
                                  (REGIONAL_HIERARCHY[activeReg] && REGIONAL_HIERARCHY[activeReg].some(s => isStationEquivalent(s, itemStation)));
          
          if (!belongsToRegion) return false;
          if (activeStat && activeStat !== 'ALL STATIONS' && !isStationEquivalent(itemStation, activeStat)) return false;

          return true;
      });
  }, [statsDomain, disruptiveStats, agricStats, accidentStats, fireStats, dateFilter, filterRegion, filterStation, canViewGlobalLevel]);

  const regionalSummationData = useMemo(() => {
    if (statsDomain !== 'DISRUPTIVE') return [];
    
    const stationsList = filterRegion !== 'ALL REGIONS' && REGIONAL_HIERARCHY[filterRegion] 
      ? REGIONAL_HIERARCHY[filterRegion] 
      : Object.values(REGIONAL_HIERARCHY).flat();

    const stationMap = {};
    stationsList.forEach(stn => {
      stationMap[stn] = {
        station: stn,
        arrested: 0, given_bond: 0, cautioned: 0, taken_to_court: 0, released: 0, remanded: 0, convicted: 0
      };
    });

    currentDomainStats.forEach(stat => {
      const stnName = cleanStr(stat.station);
      let matchedKey = Object.keys(stationMap).find(k => isStationEquivalent(k, stnName));
      if (!matchedKey) {
        matchedKey = stnName;
        stationMap[matchedKey] = {
          station: matchedKey, arrested: 0, given_bond: 0, cautioned: 0, taken_to_court: 0, released: 0, remanded: 0, convicted: 0
        };
      }
      stationMap[matchedKey].arrested += (parseInt(stat.arrested) || 0);
      stationMap[matchedKey].given_bond += (parseInt(stat.given_bond) || 0);
      stationMap[matchedKey].cautioned += (parseInt(stat.cautioned) || 0);
      stationMap[matchedKey].taken_to_court += (parseInt(stat.taken_to_court_prev_lockup) || 0) + (parseInt(stat.taken_to_court_today_ops) || 0);
      stationMap[matchedKey].released += (parseInt(stat.released) || 0);
      stationMap[matchedKey].remanded += (parseInt(stat.remanded) || 0);
      stationMap[matchedKey].convicted += (parseInt(stat.convicted) || 0);
    });

    return Object.values(stationMap).filter(s => s.arrested > 0 || s.given_bond > 0 || s.cautioned > 0 || s.taken_to_court > 0 || s.released > 0 || s.remanded > 0 || s.convicted > 0 || stationsList.includes(s.station));
  }, [currentDomainStats, filterRegion, statsDomain]);

  const handleExportDomainStats = async () => {
    if (!currentDomainStats.length) {
      alert("No records available to export for the selected filters.");
      return;
    }
    
    setNotification("⏳ Generating AES-256 secure encrypted spreadsheet archive. Please wait...");
    
    try {
      let targetEndpoint = '/api/v1/stats/export';
      if (statsDomain === 'AGRICULTURAL') targetEndpoint = '/api/v1/agric-stats/export';
      if (statsDomain === 'ACCIDENTS') targetEndpoint = '/api/v1/accidents/export';
      if (statsDomain === 'FIRES') targetEndpoint = '/api/v1/fires/export';

      const params = new URLSearchParams();
      if (!canViewGlobalLevel && filterRegion && filterRegion !== 'ALL REGIONS') params.append('region', filterRegion);
      if (filterStation && filterStation !== 'ALL STATIONS') params.append('station', filterStation);
      
      const { start, end } = getDateRangeParams(dateFilter);
      if (start) params.append('start_date', start);
      if (end) params.append('end_date', end);

      const qs = params.toString();
      const finalUrl = qs ? `${targetEndpoint}?${qs}` : targetEndpoint;

      const response = await authFetch(finalUrl, { 
          method: "POST",
          headers: { "Content-Type": "application/json" }
      });
      
      if (!response.ok) throw new Error("Secure export failed on server.");
      
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      
      const disposition = response.headers.get('Content-Disposition');
      let filename = `KMP_${statsDomain}_SECURE_EXPORT.zip`;
      if (disposition && disposition.indexOf('filename=') !== -1) {
          filename = disposition.split('filename=')[1].replace(/["']/g, '');
      } else {
          const timestamp = new Date().toISOString().split('T')[0];
          filename = `KMP_${statsDomain}_SECURE_EXPORT_${timestamp}.zip`;
      }

      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      setNotification("✅ Secure AES-256 archive downloaded successfully! Use your Force Number to unlock.");
      setTimeout(() => setNotification(null), 6000);
    } catch (err) {
      console.error("Export error:", err);
      setNotification("❌ Failed to generate secure export archive.");
    }
  };

  const groupedAgricData = useMemo(() => {
    const groups = {};
    Object.keys(REGIONAL_HIERARCHY).forEach(reg => {
      groups[reg] = { stations: {} };
    });

    const activeReg = cleanStr(filterRegion);
    const activeStat = cleanStr(filterStation);

    agricSummaryRecords.forEach(record => {
      let reg = (record.region || 'KMP NORTH').toUpperCase();
      const stn = (record.station || 'UNKNOWN').toUpperCase();

      if (!canViewGlobalLevel) {
          const belongsToRegion = activeReg === 'ALL REGIONS' || reg === activeReg || (REGIONAL_HIERARCHY[activeReg] && REGIONAL_HIERARCHY[activeReg].some(s => isStationEquivalent(s, stn)));
          if (!belongsToRegion) return;
          if (activeStat && activeStat !== 'ALL STATIONS' && !isStationEquivalent(stn, activeStat)) return;
      }
      
      if (!groups[reg]) groups[reg] = { stations: {} };
      if (!groups[reg].stations[stn]) groups[reg].stations[stn] = [];
      
      groups[reg].stations[stn].push(record);
    });
    return groups;
  }, [agricSummaryRecords, filterRegion, filterStation, canViewGlobalLevel]);

  const toggleAgricRegion = (region) => {
    setExpandedAgricRegions(prev => ({ ...prev, [region]: !prev[region] }));
  };

  const handleInputChange = (e) => {
    const { name, value, type } = e.target;
    if (name === 'region') setFormData({ ...formData, region: value, station: REGIONAL_HIERARCHY[value][0] });
    else setFormData({ ...formData, [name]: type === 'number' ? parseInt(value) || 0 : value.toUpperCase() });
  };

  const handleAgricInputChange = (e) => {
    const { name, value } = e.target;
    setAgricFormData({ ...agricFormData, [name]: value.toUpperCase() });
  };

  const handleOperationToggle = (op) => {
    setOperation(op); setNotification(null);
    if (op === 'new') {
      setFormData(getInitialFormData());
      setUpdateSearch('');
    }
  };

  const populateUpdateForm = (statData) => {
    const recordIdentifier = statData.id !== undefined && statData.id !== null ? statData.id : statData.sn;
    
    let updatedState = { ...statData, sn: recordIdentifier, id: recordIdentifier };
    if (statsDomain === 'ACCIDENTS') {
        if (!COMMON_ACCIDENTS.includes(statData.nature_of_accident)) {
            updatedState.nature_of_accident = 'OTHER';
            updatedState.custom_nature_of_accident = statData.nature_of_accident;
        }
    }
    if (statsDomain === 'FIRES') {
        if (!COMMON_FIRES.includes(statData.nature_of_fire)) {
            updatedState.nature_of_fire = 'OTHER';
            updatedState.custom_nature_of_fire = statData.nature_of_fire;
        }
    }
    if (statsDomain === 'DISRUPTIVE' || statsDomain === 'AGRICULTURAL') {
        updatedState.pending_court_prev_ops = statData.pending_court_prev_ops || 0;
        updatedState.pending_court_today_ops = statData.pending_court_today_ops || 0;
        updatedState.taken_to_court_prev_lockup = statData.taken_to_court_prev_lockup || 0;
        updatedState.taken_to_court_today_ops = statData.taken_to_court_today_ops || 0;
    }
    setFormData(updatedState);
  };

  const handleFormSubmit = async (e) => {  
    e.preventDefault();
    if (!canEditRecords) return setNotification("Security Restriction: You do not have clearance to modify analytical records.");

    // 🟢 MASS BALANCE MATHEMATICAL VALIDATOR TO PREVENT FORGERY
    if (statsDomain === 'DISRUPTIVE' || statsDomain === 'AGRICULTURAL') {
        const arrested = parseInt(formData.arrested) || 0;
        const bond = parseInt(formData.given_bond) || 0;
        const cautioned = parseInt(formData.cautioned) || 0;
        const pending_prev = parseInt(formData.pending_court_prev_ops) || 0;
        const pending_today = parseInt(formData.pending_court_today_ops) || 0;
        const taken_prev = parseInt(formData.taken_to_court_prev_lockup) || 0;
        const taken_today = parseInt(formData.taken_to_court_today_ops) || 0;

        const totalIn = arrested + pending_prev;
        const totalOut = bond + cautioned + taken_today + taken_prev + pending_today;

        if (totalIn !== totalOut) {
            return setNotification(`❌ INCONSISTENT DATA: Suspects distribution does not balance. Arrested (${arrested}) + Pending Prev (${pending_prev}) MUST EQUAL Bond (${bond}) + Cautioned (${cautioned}) + Taken Today (${taken_today}) + Taken Prev (${taken_prev}) + Pending Today (${pending_today}).`);
        }
        
        if (taken_prev > pending_prev) {
            return setNotification(`❌ INCONSISTENT DATA: Taken to Court from Previous Lockup (${taken_prev}) cannot exceed the number Pending Court from Previous Day (${pending_prev}).`);
        }
    }
    
    let targetEndpoint = '/api/v1/stats';
    if (statsDomain === 'AGRICULTURAL') targetEndpoint = '/api/v1/agric-stats';
    if (statsDomain === 'ACCIDENTS') targetEndpoint = '/api/v1/accidents';
    if (statsDomain === 'FIRES') targetEndpoint = '/api/v1/fires';

    const activeRegion = (canViewGlobalLevel && filterRegion && filterRegion !== 'ALL REGIONS') ? filterRegion : formData.region;
    const activeStation = (canViewGlobalLevel && filterStation && filterStation !== 'ALL STATIONS') ? filterStation : formData.station;

    if (operation === 'new') {
      let isDuplicate = false;
      if (statsDomain !== 'ACCIDENTS' && statsDomain !== 'FIRES') {
          isDuplicate = currentDomainStats.some(s =>  
            String(s.station || '').trim().toUpperCase() === String(activeStation || '').trim().toUpperCase() &&  
            String(s.date) === String(formData.date)
          );
      }
      
      if (isDuplicate) {
        return setNotification(`❌ Error: Statistics for station '${activeStation}' on date '${formData.date}' have already been logged.`);
      }

      const exactNextSN = currentDomainStats.length > 0 ? Math.max(...currentDomainStats.map(s => s.sn || s.id || 0)) + 1 : 1;
      
      let newStat = {  
        ...formData,  
        region: activeRegion,  
        station: activeStation,  
        sn: exactNextSN,  
        last_updated_by: `${currentUser.name} (${currentUser.fnum})`,
        entered_by: `${currentUser.name} (${currentUser.fnum})`
      };

      if (statsDomain === 'ACCIDENTS') {
          newStat.total = (parseInt(formData.minor) || 0) + (parseInt(formData.serious) || 0) + (parseInt(formData.fatal) || 0);
          if (newStat.nature_of_accident === 'OTHER') {
              newStat.nature_of_accident = formData.custom_nature_of_accident;
          }
      } else if (statsDomain === 'FIRES') {
          newStat.total = (parseInt(formData.minor_outbreaks) || 0) + (parseInt(formData.major_disasters) || 0) + (parseInt(formData.fatal_fires) || 0);
          if (newStat.nature_of_fire === 'OTHER') {
              newStat.nature_of_fire = formData.custom_nature_of_fire;
          }
      } else if (statsDomain === 'DISRUPTIVE' || statsDomain === 'AGRICULTURAL') {
          newStat.pending_court_prev_ops = parseInt(formData.pending_court_prev_ops) || 0;
          newStat.pending_court_today_ops = parseInt(formData.pending_court_today_ops) || 0;
          newStat.taken_to_court_prev_lockup = parseInt(formData.taken_to_court_prev_lockup) || 0;
          newStat.taken_to_court_today_ops = parseInt(formData.taken_to_court_today_ops) || 0;

          newStat.pending_court = newStat.pending_court_prev_ops + newStat.pending_court_today_ops;
          newStat.taken_to_court = newStat.taken_to_court_prev_lockup + newStat.taken_to_court_today_ops;
      }
      
      try {
        const response = await authFetch(targetEndpoint, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newStat)
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.detail || "Database rejected the entry.");
        }
        
        fetchDomainStats();  
        setNotification(`✅ Suspects statistics recorded successfully for ${activeStation}!`);
        setFormData(getInitialFormData());
      } catch (err) {  
        setNotification(`❌ Error: ${err.message}`);  
      }
      
    } else if (operation === 'update') {
      const recordKey = formData.id || formData.sn;
      if (!recordKey) return setNotification("Error: Please select a record from the list to update first.");

      let isDuplicateConflict = false;
      if (statsDomain !== 'ACCIDENTS' && statsDomain !== 'FIRES') {
          isDuplicateConflict = currentDomainStats.some(s =>  
            (String(s.station || '').trim().toUpperCase() === String(activeStation || '').trim().toUpperCase() &&  
             String(s.date) === String(formData.date)) &&  
            (s.id !== recordKey && s.sn !== recordKey)
          );
      }
      
      if (isDuplicateConflict) {
        return setNotification(`❌ Error: Another record for station '${activeStation}' on date '${formData.date}' already exists.`);
      }

      let updatedRecord = {  
        ...formData,  
        region: activeRegion,  
        station: activeStation,  
        last_updated_by: `${currentUser.name} (${currentUser.fnum})`  
      };

      if (statsDomain === 'ACCIDENTS') {
          updatedRecord.total = (parseInt(formData.minor) || 0) + (parseInt(formData.serious) || 0) + (parseInt(formData.fatal) || 0);
          if (updatedRecord.nature_of_accident === 'OTHER') {
              updatedRecord.nature_of_accident = formData.custom_nature_of_accident;
          }
      } else if (statsDomain === 'FIRES') {
          updatedRecord.total = (parseInt(formData.minor_outbreaks) || 0) + (parseInt(formData.major_disasters) || 0) + (parseInt(formData.fatal_fires) || 0);
          if (updatedRecord.nature_of_fire === 'OTHER') {
              updatedRecord.nature_of_fire = formData.custom_nature_of_fire;
          }
      } else if (statsDomain === 'DISRUPTIVE' || statsDomain === 'AGRICULTURAL') {
          updatedRecord.pending_court_prev_ops = parseInt(formData.pending_court_prev_ops) || 0;
          updatedRecord.pending_court_today_ops = parseInt(formData.pending_court_today_ops) || 0;
          updatedRecord.taken_to_court_prev_lockup = parseInt(formData.taken_to_court_prev_lockup) || 0;
          updatedRecord.taken_to_court_today_ops = parseInt(formData.taken_to_court_today_ops) || 0;

          updatedRecord.pending_court = updatedRecord.pending_court_prev_ops + updatedRecord.pending_court_today_ops;
          updatedRecord.taken_to_court = updatedRecord.taken_to_court_prev_lockup + updatedRecord.taken_to_court_today_ops;
      }

      try {
        const response = await authFetch(`${targetEndpoint}/${recordKey}`, {
          method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updatedRecord)
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(errText || "Failed to update record in database.");
        }
        
        fetchDomainStats();
        setNotification(`✅ Statistics ID ${recordKey} successfully updated!`);
        handleOperationToggle('new');
      } catch (err) {  
        setNotification(`❌ Error: ${err.message}`);  
      }
    }
  };

  const handleAgricFormSubmit = async (e) => {
    e.preventDefault();
    if (!canEditRecords) return setNotification("Security Restriction: You do not have clearance to modify analytical records.");

    try {
      const activeRegion = (canViewGlobalLevel && filterRegion && filterRegion !== 'ALL REGIONS') ? filterRegion : formData.region;
      const activeStation = (canViewGlobalLevel && filterStation && filterStation !== 'ALL STATIONS') ? filterStation : formData.station;

      const payload = {
        region: activeRegion,
        station: activeStation,
        date: formData.date,
        agric_crime_report: agricFormData.agric_crime_report,
        number_count: parseInt(agricFormData.number_count_label) || 0,
        recoveries: parseInt(agricFormData.recoveries_label) || 0,
        status: JSON.stringify({
          numLabel: agricFormData.number_count_label,
          recReport: agricFormData.recovery_report,
          recLabel: agricFormData.recoveries_label,
          baseStatus: agricFormData.status
        })
      };

      const response = await authFetch('/api/v1/agric-summary', {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || "Failed to save agricultural entry.");
      }

      setNotification(`✅ Agricultural produce & recoveries successfully logged for ${activeStation}!`);
      fetchAgricSummaries();
      setAgricFormData({
        agric_crime_report: '',
        number_count_label: '',
        recovery_report: '',
        recoveries_label: '',
        status: 'UNDER INVESTIGATION',
      });
      setTimeout(() => setNotification(null), 5000);
    } catch (err) {
      setNotification(`❌ Error: ${err.message}`);
    }
  };

  useEffect(() => {
      setFormData(getInitialFormData());
      setOperation('new');
      setUpdateSearch('');
  }, [statsDomain, getInitialFormData]);

  const handleToggleDomain = (domain) => {
    setStatsDomain(domain);
  };

  const complianceWarning = useMemo(() => {
    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Africa/Nairobi" }));
    const dayOfWeek = now.getDay(); 

    const isWarningPeriod = dayOfWeek === 5 || dayOfWeek === 6 || dayOfWeek === 0;
    if (!isWarningPeriod) return null;

    const startOfWeek = new Date(now);
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    startOfWeek.setDate(now.getDate() + diffToMonday);
    
    const yyyy = startOfWeek.getFullYear();
    const mm = String(startOfWeek.getMonth() + 1).padStart(2, '0');
    const dd = String(startOfWeek.getDate()).padStart(2, '0');
    const mondayDateStr = `${yyyy}-${mm}-${dd}`;

    const targetStation = filterStation !== 'ALL STATIONS' ? filterStation : cleanStr(currentUser?.station);
    if (targetStation === 'ALL STATIONS') return null;

    const hasSubmitted = currentDomainStats.some(s => {
      return isStationEquivalent(s.station, targetStation) && s.date >= mondayDateStr;
    });

    if (!hasSubmitted) {
      return `COMMAND COMPLIANCE WARNING: No ${statsDomain.toLowerCase()} statistics have been logged for ${targetStation} this week. Mandatory submission is required before Sunday 23:59Hrs.`;
    }

    return null;
  }, [currentDomainStats, currentUser?.station, filterStation, statsDomain]);

  const totals = useMemo(() => {
    if (statsDomain === 'ACCIDENTS') {
        return currentDomainStats.reduce((acc, curr) => {
            acc.minor += (parseInt(curr.minor) || 0);
            acc.serious += (parseInt(curr.serious) || 0);
            acc.fatal += (parseInt(curr.fatal) || 0);
            acc.victims += (parseInt(curr.victims) || 0);
            acc.total += (parseInt(curr.total) || 0);
            return acc;
        }, { minor: 0, serious: 0, fatal: 0, victims: 0, total: 0 });
    }
    if (statsDomain === 'FIRES') {
        return currentDomainStats.reduce((acc, curr) => {
            acc.minor_outbreaks += (parseInt(curr.minor_outbreaks) || 0);
            acc.major_disasters += (parseInt(curr.major_disasters) || 0);
            acc.fatal_fires += (parseInt(curr.fatal_fires) || 0);
            acc.victims += (parseInt(curr.victims) || 0);
            acc.total += (parseInt(curr.total) || 0);
            return acc;
        }, { minor_outbreaks: 0, major_disasters: 0, fatal_fires: 0, victims: 0, total: 0 });
    }
    return currentDomainStats.reduce((acc, curr) => {
      acc.arrested += (parseInt(curr.arrested) || 0); acc.given_bond += (parseInt(curr.given_bond) || 0);
      acc.cautioned += (parseInt(curr.cautioned) || 0); 
      // 🟢 OMITTING PENDING COURT FROM TOTALS TO PREVENT INFLATION
      acc.taken_to_court += (parseInt(curr.taken_to_court_prev_lockup) || 0) + (parseInt(curr.taken_to_court_today_ops) || 0);
      acc.released += (parseInt(curr.released) || 0);
      acc.remanded += (parseInt(curr.remanded) || 0); acc.convicted += (parseInt(curr.convicted) || 0);
      return acc;
    }, { arrested: 0, given_bond: 0, cautioned: 0, pending_court: 0, taken_to_court: 0, released: 0, remanded: 0, convicted: 0 });
  }, [currentDomainStats, statsDomain]);

  const getDomainTitle = () => {
      if (statsDomain === 'AGRICULTURAL') return '🌱 Agricultural Crimes Statistics';
      if (statsDomain === 'ACCIDENTS') return '🚓 Traffic & Accidents Statistics';
      if (statsDomain === 'FIRES') return '🔥 Fire & Rescue Incidents Statistics';
      return '⚡ Disruptive OPS Statistics';
  };

  return (
    <div className="p-3 sm:p-6 max-w-[1600px] mx-auto space-y-6 relative z-10 dark:text-slate-100 font-[Tahoma]">
      <div className="text-center mb-6 flex flex-col items-center">
        <img src="/upf_badge.png" alt="UPF Logo" className="w-14 h-14 mb-2 object-contain contrast-200 brightness-75 drop-shadow-sm"/>
        <h1 className="text-xl sm:text-2xl font-black text-gray-700 dark:text-slate-100 tracking-tight">
          {getDomainTitle()}
        </h1>
        <h3 className="text-xs sm:text-sm text-blue-700 dark:text-blue-400 mt-1 font-bold">Weekly Numerical Aggregates</h3>
      </div>
      
      {complianceWarning && (
        <div className="bg-red-600 border border-red-800 shadow-lg rounded-xl p-3 flex items-center justify-center text-white animate-pulse transition-all">
          <AlertTriangle className="w-5 h-5 mr-3 shrink-0" />
          <span className="font-extrabold text-xs tracking-wide">{complianceWarning}</span>
        </div>
      )}

      {canViewGlobalLevel && statsDomain === 'DISRUPTIVE' && (
        <div className="flex justify-center mb-4">
          <div className="bg-slate-200 dark:bg-slate-800 p-1 rounded-xl shadow-inner inline-flex gap-2">
            <button
              type="button"
              onClick={() => setViewMode('STATION')}
              className={`px-3 py-1.5 rounded-lg font-black text-[11px] transition cursor-pointer ${viewMode === 'STATION' ? 'bg-blue-700 text-white shadow' : 'text-slate-700 dark:text-slate-300'}`}
            >
              📝 Station Daily Entry View (REVISED DIV TEMPLATE)
            </button>
            <button
              type="button"
              onClick={() => setViewMode('REGIONAL')}
              className={`px-3 py-1.5 rounded-lg font-black text-[11px] transition cursor-pointer ${viewMode === 'REGIONAL' ? 'bg-emerald-700 text-white shadow' : 'text-slate-700 dark:text-slate-300'}`}
            >
              📊 Regional Summation Table View (REVISED REG TEMPLATE)
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <>
          {viewMode === 'STATION' && (
            <div className="lg:col-span-4 space-y-5">
              
              {/* MAIN FORM PANEL */}
              <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-200 dark:border-slate-800 overflow-hidden">
                <div className="bg-slate-900 dark:bg-slate-950 px-4 py-3 border-b border-gray-200 dark:border-slate-800 flex justify-between items-center relative z-30">
                  <h3 className="text-white font-bold text-xs flex items-center">
                    {statsDomain === 'ACCIDENTS' ? <Car className="w-4 h-4 mr-2 text-red-400" /> : statsDomain === 'FIRES' ? <Flame className="w-4 h-4 mr-2 text-amber-400" /> : statsDomain === 'AGRICULTURAL' ? <Sprout className="w-4 h-4 mr-2 text-emerald-400" /> : <BarChart3 className="w-4 h-4 mr-2 text-blue-400" />} 
                    ⚙️ Log {statsDomain === 'AGRICULTURAL' ? 'Agri-Crimes' : statsDomain === 'ACCIDENTS' ? 'Accident' : statsDomain === 'FIRES' ? 'Fire' : 'Disruptive'} Stats
                  </h3>
                </div>
                <div className="p-4 space-y-5 dark:bg-slate-900">
                  <div className="flex space-x-2 bg-gray-100 dark:bg-slate-800 p-1 rounded-lg">
                    <button type="button" onClick={() => handleOperationToggle('new')} className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all cursor-pointer ${operation === 'new' ? 'bg-white dark:bg-slate-700 shadow text-blue-700 dark:text-blue-300' : 'text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200'}`}><PlusCircle className="w-3.5 h-3.5 inline mr-1" /> Register New</button>
                    <button type="button" onClick={() => handleOperationToggle('update')} className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all cursor-pointer ${operation === 'update' ? 'bg-white dark:bg-slate-700 shadow text-blue-700 dark:text-blue-300' : 'text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200'}`}><Edit className="w-3.5 h-3.5 inline mr-1" /> Update Existing</button>
                  </div>
                  {notification && <div className={`border px-3 py-2 rounded-lg flex items-start mb-3 ${notification.includes('Error') || notification.includes('❌') ? 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900 text-red-800 dark:text-red-300' : 'bg-green-50 dark:bg-green-950/40 border-green-200 dark:border-green-900 text-green-800 dark:text-green-300'}`}>{notification.includes('Error') || notification.includes('❌') ? <AlertTriangle className="w-4 h-4 mr-2 mt-0.5 text-red-500 shrink-0" /> : <CheckCircle className="w-4 h-4 mr-2 mt-0.5 text-green-500 shrink-0" />}<span className="text-xs font-bold leading-snug">{notification}</span></div>}
                  
                  {operation === 'update' && (
                    <div className="bg-blue-50 dark:bg-slate-800 border border-blue-200 dark:border-slate-700 rounded-lg p-3">
                      <label className="block text-[10px] font-black text-blue-800 dark:text-blue-400 mb-1.5">🔍 Search & Select Record to Update</label>
                      <input type="text" placeholder="Search by SN, Station, or Date..." value={updateSearch} onChange={e => setUpdateSearch(e.target.value)} className="w-full text-xs p-1.5 mb-2 border border-blue-200 dark:border-slate-700 rounded outline-none focus:ring-2 focus:ring-blue-400 bg-white dark:bg-slate-900 dark:text-slate-100 font-bold" />
                      <div className="max-h-32 overflow-y-auto bg-white dark:bg-slate-900 border border-blue-100 dark:border-slate-800 rounded custom-scrollbar">
                        {availableUpdateStats.length === 0 ? (
                          <div className="p-2 text-[10px] text-gray-500 dark:text-slate-400 text-center font-bold">No records found matching your search.</div>
                        ) : (
                          availableUpdateStats.map((s, idx) => {
                            const recordKey = s.id !== undefined && s.id !== null ? s.id : s.sn;
                            const isSelected = formData.sn === recordKey || formData.id === recordKey;

                            return (
                              <div 
                                key={recordKey} 
                                onClick={() => {
                                  populateUpdateForm(s);
                                  setNotification(`Selected Record ID: ${recordKey} (${s.station}) for update.`);
                                }} 
                                className={`p-2 text-[10px] border-b dark:border-slate-800 cursor-pointer transition-colors ${isSelected ? 'bg-blue-700 text-white font-black' : 'hover:bg-blue-100 dark:hover:bg-slate-800 text-gray-800 dark:text-slate-200 font-bold'}`}
                              >
                                <span className={isSelected ? 'text-blue-200' : 'text-gray-400'}>S/N: {idx + 1}</span> | <span className={isSelected ? 'text-white' : 'text-blue-700 dark:text-blue-400'}>{s.date}</span> | {s.station}
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}

                  <form onSubmit={handleFormSubmit} className="space-y-4">
                    {operation === 'update' && (formData.sn || formData.id) && <div className="bg-slate-800 dark:bg-slate-950 text-white text-[10px] font-black px-2 py-1.5 rounded">Currently Editing Record ID: {formData.id || formData.sn}</div>}
                    
                    {/* BASE SETTINGS (Region, Station, Date) */}
                    <div className="bg-gray-50 dark:bg-slate-800 p-3 rounded-lg border border-gray-200 dark:border-slate-700 space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3">
                        <div>
                          <label className="block text-[10px] font-black text-gray-700 dark:text-slate-300 mb-1">Select Region *</label>
                          <select name="region" value={formData.region} onChange={handleInputChange} disabled={!canViewGlobalLevel || operation === 'update'} required className="w-full text-xs font-bold border-gray-300 dark:border-slate-700 rounded shadow-sm bg-white dark:bg-slate-900 dark:text-slate-100 border p-1.5 focus:ring-blue-500 disabled:bg-gray-100 dark:disabled:bg-slate-950 disabled:text-gray-500">
                            {canViewGlobalLevel ? Object.keys(REGIONAL_HIERARCHY).map(reg => <option key={reg} value={reg}>{reg}</option>) : <option value={userRegClean}>{userRegClean}</option>}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] font-black text-gray-700 dark:text-slate-300 mb-1">Station / Division *</label>
                          <select name="station" value={formData.station} onChange={handleInputChange} disabled={!(canViewGlobalLevel || isRegionalCommand) || operation === 'update'} required className="w-full text-xs font-bold border-gray-300 dark:border-slate-700 rounded shadow-sm bg-white dark:bg-slate-900 dark:text-slate-100 border p-1.5 focus:ring-blue-500 disabled:bg-gray-100 dark:disabled:bg-slate-950 disabled:text-gray-500">
                            {operation === 'update' ? <option value={formData.station}>{formData.station}</option> : (canViewGlobalLevel || isRegionalCommand) ? (REGIONAL_HIERARCHY[formData.region] || []).map(stat => <option key={stat} value={stat}>{stat}</option>) : <option value={cleanStr(currentUser.station)}>{cleanStr(currentUser.station)}</option>}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] font-black text-gray-700 dark:text-slate-300 mb-1">Date of Record *</label>
                          <input type="date" name="date" value={formData.date} onChange={handleInputChange} disabled={operation === 'update'} required className="w-full text-xs font-bold border-gray-300 dark:border-slate-700 rounded shadow-sm border bg-white dark:bg-slate-900 dark:text-slate-100 p-1.5 disabled:bg-gray-100 dark:disabled:bg-slate-950 disabled:text-gray-500" />
                        </div>
                      </div>
                    </div> 
                    
                    {/* ACCIDENTS FORM */}
                    {statsDomain === 'ACCIDENTS' ? (
                        <div className="bg-red-50 dark:bg-slate-800 p-3 rounded-lg border border-red-200 dark:border-slate-700">
                          <h4 className="text-xs font-black text-red-900 dark:text-red-300 border-b border-red-200 dark:border-slate-700 pb-1.5 mb-3 flex items-center">📊 Traffic & Accidents Aggregates</h4>
                          
                          <div className="mb-3">
                              <label className="block text-[10px] font-black text-gray-700 dark:text-slate-300 mb-1">Nature of Accident *</label>
                              <select 
                                name="nature_of_accident" 
                                value={formData.nature_of_accident} 
                                onChange={handleInputChange} 
                                required 
                                className="w-full text-xs font-bold border border-gray-300 dark:border-slate-700 rounded shadow-sm bg-white dark:bg-slate-900 dark:text-slate-100 p-1.5 uppercase cursor-pointer"
                              >
                                <option value="" disabled>-- Select Nature of Accident --</option>
                                {COMMON_ACCIDENTS.map(acc => (
                                    <option key={acc} value={acc}>{acc}</option>
                                ))}
                                {formData.nature_of_accident && formData.nature_of_accident !== 'OTHER' && !COMMON_ACCIDENTS.includes(formData.nature_of_accident) && (
                                    <option value={formData.nature_of_accident}>{formData.nature_of_accident}</option>
                                )}
                                <option value="OTHER">OTHER (SPECIFY BELOW)</option>
                              </select>
                              
                              {formData.nature_of_accident === 'OTHER' && (
                                  <input 
                                    type="text" 
                                    name="custom_nature_of_accident" 
                                    value={formData.custom_nature_of_accident || ''} 
                                    onChange={handleInputChange} 
                                    required 
                                    placeholder="Type specific nature of accident..." 
                                    className="mt-2 w-full text-xs font-bold border border-red-300 dark:border-red-800 rounded shadow-sm bg-red-50 dark:bg-slate-900 dark:text-slate-100 p-1.5 uppercase focus:border-red-500 outline-none" 
                                  />
                              )}
                          </div>

                          <div className="grid grid-cols-4 gap-2">
                            <div className="bg-white dark:bg-slate-900 p-1.5 rounded border border-gray-200 dark:border-slate-700 shadow-sm"><label className="block text-[9px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-0.5">Minor</label><input type="number" name="minor" min="0" value={formData.minor} onChange={handleInputChange} className="w-full text-[13px] font-black text-blue-600 dark:text-blue-400 border-b-2 border-transparent focus:border-blue-500 outline-none p-0.5 bg-transparent" /></div>
                            <div className="bg-white dark:bg-slate-900 p-1.5 rounded border border-gray-200 dark:border-slate-700 shadow-sm"><label className="block text-[9px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-0.5">Serious</label><input type="number" name="serious" min="0" value={formData.serious} onChange={handleInputChange} className="w-full text-[13px] font-black text-orange-600 dark:text-orange-400 border-b-2 border-transparent focus:border-orange-500 outline-none p-0.5 bg-transparent" /></div>
                            <div className="bg-white dark:bg-slate-900 p-1.5 rounded border border-gray-200 dark:border-slate-700 shadow-sm"><label className="block text-[9px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-0.5">Fatal</label><input type="number" name="fatal" min="0" value={formData.fatal} onChange={handleInputChange} className="w-full text-[13px] font-black text-red-600 dark:text-red-400 border-b-2 border-transparent focus:border-red-500 outline-none p-0.5 bg-transparent" /></div>
                            <div className="bg-white dark:bg-slate-900 p-1.5 rounded border border-gray-200 dark:border-slate-700 shadow-sm ring-1 ring-purple-500/20"><label className="block text-[9px] font-black text-purple-600 dark:text-purple-400 uppercase tracking-wider mb-0.5">Victims (Count)</label><input type="number" name="victims" min="0" value={formData.victims} onChange={handleInputChange} className="w-full text-[13px] font-black text-purple-600 dark:text-purple-400 border-b-2 border-transparent focus:border-purple-500 outline-none p-0.5 bg-transparent" /></div>
                          </div>
                        </div>

                    // FIRES FORM
                    ) : statsDomain === 'FIRES' ? (
                        <div className="bg-amber-50 dark:bg-slate-800 p-3 rounded-lg border border-amber-200 dark:border-slate-700">
                          <h4 className="text-xs font-black text-amber-900 dark:text-amber-300 border-b border-amber-200 dark:border-slate-700 pb-1.5 mb-3 flex items-center">🔥 Fire & Rescue Aggregates</h4>
                          
                          <div className="mb-3">
                              <label className="block text-[10px] font-black text-gray-700 dark:text-slate-300 mb-1">Nature of Fire / Cause *</label>
                              <select 
                                name="nature_of_fire" 
                                value={formData.nature_of_fire || ''} 
                                onChange={handleInputChange} 
                                required 
                                className="w-full text-xs font-bold border border-gray-300 dark:border-slate-700 rounded shadow-sm bg-white dark:bg-slate-900 dark:text-slate-100 p-1.5 uppercase cursor-pointer"
                              >
                                <option value="" disabled>-- Select Nature of Fire --</option>
                                {COMMON_FIRES.map(fire => (
                                    <option key={fire} value={fire}>{fire}</option>
                                ))}
                                {formData.nature_of_fire && formData.nature_of_fire !== 'OTHER' && !COMMON_FIRES.includes(formData.nature_of_fire) && (
                                    <option value={formData.nature_of_fire}>{formData.nature_of_fire}</option>
                                )}
                                <option value="OTHER">OTHER (SPECIFY BELOW)</option>
                              </select>
                              
                              {formData.nature_of_fire === 'OTHER' && (
                                  <input 
                                    type="text" 
                                    name="custom_nature_of_fire" 
                                    value={formData.custom_nature_of_fire || ''} 
                                    onChange={handleInputChange} 
                                    required 
                                    placeholder="Type specific nature or natural cause (e.g. LIGHTNING STRIKE)..." 
                                    className="mt-2 w-full text-xs font-bold border border-amber-300 dark:border-amber-800 rounded shadow-sm bg-amber-50 dark:bg-slate-900 dark:text-slate-100 p-1.5 uppercase focus:border-amber-500 outline-none" 
                                  />
                              )}
                          </div>

                          <div className="grid grid-cols-4 gap-2">
                            <div className="bg-white dark:bg-slate-900 p-1.5 rounded border border-gray-200 dark:border-slate-700 shadow-sm"><label className="block text-[9px] font-black text-slate-500 uppercase mb-0.5">Minor</label><input type="number" name="minor_outbreaks" min="0" value={formData.minor_outbreaks || 0} onChange={handleInputChange} className="w-full text-[13px] font-black text-amber-600 outline-none p-0.5 bg-transparent" /></div>
                            <div className="bg-white dark:bg-slate-900 p-1.5 rounded border border-gray-200 dark:border-slate-700 shadow-sm"><label className="block text-[9px] font-black text-slate-500 uppercase mb-0.5">Major</label><input type="number" name="major_disasters" min="0" value={formData.major_disasters || 0} onChange={handleInputChange} className="w-full text-[13px] font-black text-orange-600 outline-none p-0.5 bg-transparent" /></div>
                            <div className="bg-white dark:bg-slate-900 p-1.5 rounded border border-gray-200 dark:border-slate-700 shadow-sm"><label className="block text-[9px] font-black text-slate-500 uppercase mb-0.5">Fatal</label><input type="number" name="fatal_fires" min="0" value={formData.fatal_fires || 0} onChange={handleInputChange} className="w-full text-[13px] font-black text-red-600 outline-none p-0.5 bg-transparent" /></div>
                            <div className="bg-white dark:bg-slate-900 p-1.5 rounded border border-gray-200 dark:border-slate-700 shadow-sm ring-1 ring-amber-500/20"><label className="block text-[9px] font-black text-amber-600 uppercase mb-0.5">Victims</label><input type="number" name="victims" min="0" value={formData.victims || 0} onChange={handleInputChange} className="w-full text-[13px] font-black text-amber-700 outline-none p-0.5 bg-transparent" /></div>
                          </div>
                        </div>

                    // 🟢 AGRICULTURAL SUSPECTS FORM
                    ) : statsDomain === 'AGRICULTURAL' ? (
                        <>
                          <div className="bg-emerald-50 dark:bg-slate-800 p-3 rounded-lg border border-emerald-200 dark:border-slate-700 space-y-3">
                            <h4 className="text-xs font-black text-emerald-900 dark:text-emerald-300 border-b border-emerald-200 dark:border-slate-700 pb-1.5 mb-2 flex items-center">
                              📊 Agric Crimes Suspects & Lockup Entry
                            </h4>
                            
                            <div className="grid grid-cols-2 gap-2">
                              <div className="bg-white dark:bg-slate-900 p-1.5 rounded border border-gray-200 dark:border-slate-700 shadow-sm"><label className="block text-[9px] font-black text-gray-600 dark:text-slate-400 uppercase tracking-wider mb-0.5">Suspects Arrested</label><input type="number" name="arrested" min="0" value={formData.arrested || 0} onChange={handleInputChange} className="w-full text-[13px] font-black text-emerald-700 dark:text-emerald-400 outline-none p-0.5 bg-transparent" /></div>
                              <div className="bg-white dark:bg-slate-900 p-1.5 rounded border border-gray-200 dark:border-slate-700 shadow-sm"><label className="block text-[9px] font-black text-gray-600 dark:text-slate-400 uppercase tracking-wider mb-0.5">Given Bond</label><input type="number" name="given_bond" min="0" value={formData.given_bond || 0} onChange={handleInputChange} className="w-full text-[13px] font-black text-green-700 dark:text-green-400 outline-none p-0.5 bg-transparent" /></div>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <div className="bg-white dark:bg-slate-900 p-1.5 rounded border border-gray-200 dark:border-slate-700 shadow-sm"><label className="block text-[9px] font-black text-gray-600 dark:text-slate-400 uppercase tracking-wider mb-0.5">Cautioned</label><input type="number" name="cautioned" min="0" value={formData.cautioned || 0} onChange={handleInputChange} className="w-full text-[13px] font-black text-blue-600 dark:text-blue-400 outline-none p-0.5 bg-transparent" /></div>
                              <div className="bg-white dark:bg-slate-900 p-1.5 rounded border border-gray-200 dark:border-slate-700 shadow-sm"><label className="block text-[9px] font-black text-gray-600 dark:text-slate-400 uppercase tracking-wider mb-0.5">Pending Court (Prev Day)</label><input type="number" name="pending_court_prev_ops" min="0" value={formData.pending_court_prev_ops || 0} onChange={handleInputChange} className="w-full text-[13px] font-black text-yellow-600 dark:text-yellow-400 outline-none p-0.5 bg-transparent" /></div>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <div className="bg-white dark:bg-slate-900 p-1.5 rounded border border-gray-200 dark:border-slate-700 shadow-sm"><label className="block text-[9px] font-black text-gray-600 dark:text-slate-400 uppercase tracking-wider mb-0.5">Pending Court (Today's OPS)</label><input type="number" name="pending_court_today_ops" min="0" value={formData.pending_court_today_ops || 0} onChange={handleInputChange} className="w-full text-[13px] font-black text-yellow-600 dark:text-yellow-400 outline-none p-0.5 bg-transparent" /></div>
                              <div className="bg-white dark:bg-slate-900 p-1.5 rounded border border-gray-200 dark:border-slate-700 shadow-sm"><label className="block text-[9px] font-black text-gray-600 dark:text-slate-400 uppercase tracking-wider mb-0.5">Taken to Court (Prev Lockup)</label><input type="number" name="taken_to_court_prev_lockup" min="0" value={formData.taken_to_court_prev_lockup || 0} onChange={handleInputChange} className="w-full text-[13px] font-black text-red-600 dark:text-red-400 outline-none p-0.5 bg-transparent" /></div>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <div className="bg-white dark:bg-slate-900 p-1.5 rounded border border-gray-200 dark:border-slate-700 shadow-sm"><label className="block text-[9px] font-black text-gray-600 dark:text-slate-400 uppercase tracking-wider mb-0.5">Taken to Court (Today's OPS)</label><input type="number" name="taken_to_court_today_ops" min="0" value={formData.taken_to_court_today_ops || 0} onChange={handleInputChange} className="w-full text-[13px] font-black text-red-600 dark:text-red-400 outline-none p-0.5 bg-transparent" /></div>
                              <div className="bg-white dark:bg-slate-900 p-1.5 rounded border border-gray-200 dark:border-slate-700 shadow-sm"><label className="block text-[9px] font-black text-gray-600 dark:text-slate-400 uppercase tracking-wider mb-0.5">Released by Court</label><input type="number" name="released" min="0" value={formData.released || 0} onChange={handleInputChange} className="w-full text-[13px] font-black text-green-600 dark:text-green-400 outline-none p-0.5 bg-transparent" /></div>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <div className="bg-white dark:bg-slate-900 p-1.5 rounded border border-gray-200 dark:border-slate-700 shadow-sm"><label className="block text-[9px] font-black text-gray-600 dark:text-slate-400 uppercase tracking-wider mb-0.5">Suspects Remanded</label><input type="number" name="remanded" min="0" value={formData.remanded || 0} onChange={handleInputChange} className="w-full text-[13px] font-black text-red-700 dark:text-red-400 outline-none p-0.5 bg-transparent" /></div>
                              <div className="bg-white dark:bg-slate-900 p-1.5 rounded border border-gray-200 dark:border-slate-700 shadow-sm"><label className="block text-[9px] font-black text-gray-600 dark:text-slate-400 uppercase tracking-wider mb-0.5">Suspects Convicted</label><input type="number" name="convicted" min="0" value={formData.convicted || 0} onChange={handleInputChange} className="w-full text-[13px] font-black text-purple-600 dark:text-purple-400 outline-none p-0.5 bg-transparent" /></div>
                            </div>
                          </div>
                        </>

                    // DISRUPTIVE OPS FORM
                    ) : (
                        <>
                          <div className="bg-blue-50 dark:bg-slate-800 p-3 rounded-lg border border-blue-200 dark:border-slate-700 space-y-3">
                            <h4 className="text-xs font-black text-blue-900 dark:text-blue-300 border-b border-blue-200 dark:border-slate-700 pb-1.5 mb-2 flex items-center">📊 Disruptive Operations Form (REVISED DIV TEMPLATE)</h4>
                            
                            <div className="grid grid-cols-2 gap-2">
                              <div className="bg-white dark:bg-slate-900 p-1.5 rounded border border-gray-200 dark:border-slate-700 shadow-sm"><label className="block text-[9px] font-black text-gray-600 dark:text-slate-400 uppercase tracking-wider mb-0.5">Suspects Arrested</label><input type="number" name="arrested" min="0" value={formData.arrested || 0} onChange={handleInputChange} className="w-full text-[13px] font-black text-blue-700 dark:text-blue-400 outline-none p-0.5 bg-transparent" /></div>
                              <div className="bg-white dark:bg-slate-900 p-1.5 rounded border border-gray-200 dark:border-slate-700 shadow-sm"><label className="block text-[9px] font-black text-gray-600 dark:text-slate-400 uppercase tracking-wider mb-0.5">Given Bond</label><input type="number" name="given_bond" min="0" value={formData.given_bond || 0} onChange={handleInputChange} className="w-full text-[13px] font-black text-green-700 dark:text-green-400 outline-none p-0.5 bg-transparent" /></div>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <div className="bg-white dark:bg-slate-900 p-1.5 rounded border border-gray-200 dark:border-slate-700 shadow-sm"><label className="block text-[9px] font-black text-gray-600 dark:text-slate-400 uppercase tracking-wider mb-0.5">Cautioned</label><input type="number" name="cautioned" min="0" value={formData.cautioned || 0} onChange={handleInputChange} className="w-full text-[13px] font-black text-blue-600 dark:text-blue-400 outline-none p-0.5 bg-transparent" /></div>
                              <div className="bg-white dark:bg-slate-900 p-1.5 rounded border border-gray-200 dark:border-slate-700 shadow-sm"><label className="block text-[9px] font-black text-gray-600 dark:text-slate-400 uppercase tracking-wider mb-0.5">Pending Court (Prev Day)</label><input type="number" name="pending_court_prev_ops" min="0" value={formData.pending_court_prev_ops || 0} onChange={handleInputChange} className="w-full text-[13px] font-black text-yellow-600 dark:text-yellow-400 outline-none p-0.5 bg-transparent" /></div>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <div className="bg-white dark:bg-slate-900 p-1.5 rounded border border-gray-200 dark:border-slate-700 shadow-sm"><label className="block text-[9px] font-black text-gray-600 dark:text-slate-400 uppercase tracking-wider mb-0.5">Pending Court (Today's OPS)</label><input type="number" name="pending_court_today_ops" min="0" value={formData.pending_court_today_ops || 0} onChange={handleInputChange} className="w-full text-[13px] font-black text-yellow-600 dark:text-yellow-400 outline-none p-0.5 bg-transparent" /></div>
                              <div className="bg-white dark:bg-slate-900 p-1.5 rounded border border-gray-200 dark:border-slate-700 shadow-sm"><label className="block text-[9px] font-black text-gray-600 dark:text-slate-400 uppercase tracking-wider mb-0.5">Taken to Court (Prev Lockup)</label><input type="number" name="taken_to_court_prev_lockup" min="0" value={formData.taken_to_court_prev_lockup || 0} onChange={handleInputChange} className="w-full text-[13px] font-black text-red-600 dark:text-red-400 outline-none p-0.5 bg-transparent" /></div>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <div className="bg-white dark:bg-slate-900 p-1.5 rounded border border-gray-200 dark:border-slate-700 shadow-sm"><label className="block text-[9px] font-black text-gray-600 dark:text-slate-400 uppercase tracking-wider mb-0.5">Taken to Court (Today's OPS)</label><input type="number" name="taken_to_court_today_ops" min="0" value={formData.taken_to_court_today_ops || 0} onChange={handleInputChange} className="w-full text-[13px] font-black text-red-600 dark:text-red-400 outline-none p-0.5 bg-transparent" /></div>
                              <div className="bg-white dark:bg-slate-900 p-1.5 rounded border border-gray-200 dark:border-slate-700 shadow-sm"><label className="block text-[9px] font-black text-gray-600 dark:text-slate-400 uppercase tracking-wider mb-0.5">Released by Court</label><input type="number" name="released" min="0" value={formData.released || 0} onChange={handleInputChange} className="w-full text-[13px] font-black text-green-600 dark:text-green-400 outline-none p-0.5 bg-transparent" /></div>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <div className="bg-white dark:bg-slate-900 p-1.5 rounded border border-gray-200 dark:border-slate-700 shadow-sm"><label className="block text-[9px] font-black text-gray-600 dark:text-slate-400 uppercase tracking-wider mb-0.5">Suspects Remanded</label><input type="number" name="remanded" min="0" value={formData.remanded || 0} onChange={handleInputChange} className="w-full text-[13px] font-black text-red-700 dark:text-red-400 outline-none p-0.5 bg-transparent" /></div>
                              <div className="bg-white dark:bg-slate-900 p-1.5 rounded border border-gray-200 dark:border-slate-700 shadow-sm"><label className="block text-[9px] font-black text-gray-600 dark:text-slate-400 uppercase tracking-wider mb-0.5">Suspects Convicted</label><input type="number" name="convicted" min="0" value={formData.convicted || 0} onChange={handleInputChange} className="w-full text-[13px] font-black text-purple-600 dark:text-purple-400 outline-none p-0.5 bg-transparent" /></div>
                            </div>
                          </div>
                        </>
                    )}
                    
                    <button type="submit" className="w-full bg-blue-700 hover:bg-blue-800 transition-colors text-white mt-3 py-2.5 font-black rounded-lg shadow text-[13px] flex justify-center items-center cursor-pointer">
                      {operation === 'new' ? '💾 Submit Suspects Entry' : '💾 Save Updated Figures'}
                    </button>

                    {/* 🟢 ACCOUNTABILITY LOGIC GUIDE ADDED TO FORMS */}
                    {(statsDomain === 'DISRUPTIVE' || statsDomain === 'AGRICULTURAL') && <AccountabilityGuide />}
                  </form>
                </div>
              </div>

              {/* 🟢 AGRICULTURAL PRODUCE RECOVERY FORM (Stacked below Suspects Form) */}
              {statsDomain === 'AGRICULTURAL' && operation === 'new' && (
                <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-emerald-200 dark:border-slate-800 overflow-hidden mt-5 animate-in slide-in-from-top-4">
                  <div className="bg-emerald-700 dark:bg-emerald-900 px-4 py-3 text-white font-extrabold text-xs uppercase tracking-wider flex items-center">
                    🌱 Log Produce & Recoveries
                  </div>
                  <form onSubmit={handleAgricFormSubmit} className="p-4 space-y-3 dark:bg-slate-900">
                    <div className="bg-emerald-50 dark:bg-slate-800/80 p-2 rounded border border-emerald-200 dark:border-slate-700 text-[10px] font-bold text-emerald-800 dark:text-emerald-300">
                      Syncing to: <span className="font-black uppercase text-emerald-600 dark:text-emerald-400">{formData.station} ({formData.region})</span> on {formData.date}
                    </div>
                    
                    <div>
                      <label className="block text-[10px] font-black text-slate-700 dark:text-slate-300 uppercase mb-0.5">Item (e.g. CATTLE) *</label>
                      <input type="text" name="agric_crime_report" value={agricFormData.agric_crime_report} onChange={handleAgricInputChange} required placeholder="e.g. CATTLE" className="w-full text-[11px] border border-slate-300 dark:border-slate-700 p-1.5 rounded uppercase font-bold text-red-700 dark:text-red-400 bg-white dark:bg-slate-950 outline-none focus:ring-2 focus:ring-emerald-500" />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-black text-slate-700 dark:text-slate-300 uppercase mb-0.5">Stolen Qty *</label>
                        <input type="text" name="number_count_label" value={agricFormData.number_count_label} onChange={handleAgricInputChange} required placeholder="e.g. 5 HEADS" className="w-full text-[11px] border border-slate-300 dark:border-slate-700 p-1.5 rounded font-black text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-950 outline-none focus:ring-2 focus:ring-emerald-500 uppercase" />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black text-slate-700 dark:text-slate-300 uppercase mb-0.5">Recovery Qty *</label>
                        <input type="text" name="recoveries_label" value={agricFormData.recoveries_label} onChange={handleAgricInputChange} required placeholder="e.g. 2 HEADS" className="w-full text-[11px] border border-slate-300 dark:border-slate-700 p-1.5 rounded font-black text-emerald-700 dark:text-emerald-400 bg-white dark:bg-slate-950 outline-none focus:ring-2 focus:ring-emerald-500 uppercase" />
                      </div>
                    </div>
                    
                    <div>
                      <label className="block text-[10px] font-black text-slate-700 dark:text-slate-300 uppercase mb-0.5">Action / Recovery Note *</label>
                      <input type="text" name="recovery_report" value={agricFormData.recovery_report} onChange={handleAgricInputChange} required placeholder="e.g. CATTLE RECOVERED" className="w-full text-[11px] border border-slate-300 dark:border-slate-700 p-1.5 rounded uppercase font-bold text-emerald-700 dark:text-emerald-400 bg-white dark:bg-slate-950 outline-none focus:ring-2 focus:ring-emerald-500" />
                    </div>
                    
                    <button type="submit" className="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-black py-2.5 rounded shadow-sm cursor-pointer transition-colors flex items-center justify-center mt-1 text-[13px]">
                      <Save className="w-4 h-4 mr-2" /> Save Produce Entry
                    </button>
                  </form>
                </div>
              )}
            </div>
          )}
          
          <div className={viewMode === 'STATION' ? "lg:col-span-8 space-y-4" : "lg:col-span-12 space-y-4"}>
            <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm relative">
              
              <div className="absolute top-4 right-4 z-10 flex gap-2">
                <button 
                  type="button" 
                  onClick={handleExportDomainStats} 
                  className="px-3.5 py-2 text-xs font-black rounded-lg border transition-all flex items-center whitespace-nowrap shadow-sm cursor-pointer bg-emerald-700 text-white border-emerald-800 hover:bg-emerald-800 ring-2 ring-emerald-500/20"
                >
                  <HardDrive className="w-3.5 h-3.5 mr-1.5" /> Export Secure Excel (.zip)
                </button>
                <select 
                  value={dateFilter} 
                  onChange={(e) => setDateFilter(e.target.value)} 
                  className="border-2 border-blue-500 dark:border-blue-600 text-blue-700 dark:text-blue-400 font-black rounded-lg px-2 py-1.5 text-[11px] shadow-sm bg-white dark:bg-slate-800 outline-none cursor-pointer"
                >
                  <option value="ALL TIME">ALL TIME</option>
                  <option value="TODAY">TODAY ONLY</option>
                  <option value="LAST 7 DAYS">LAST 7 DAYS</option>
                  <option value="LAST 14 DAYS">LAST 14 DAYS</option>
                  <option value="LAST 21 DAYS">LAST 21 DAYS</option>
                  <option value="LAST 30 DAYS">LAST 30 DAYS</option>
                  <option value="LAST 60 DAYS">LAST 60 DAYS</option>
                  <option value="LAST 90 DAYS">LAST 90 DAYS</option>
                  <option value="LAST 120 DAYS">LAST 120 DAYS</option>
                  <option value="LAST 180 DAYS">LAST 180 DAYS</option>
                </select>
              </div>
              <h4 className="text-xs font-black text-slate-400 dark:text-slate-400 mb-2 uppercase tracking-wider">📋 AREA METRICS ({filterRegion} - {dateFilter})</h4>
              
              {statsDomain === 'ACCIDENTS' ? (
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-3">
                    <MetricCard title="Minor Accidents" value={totals.minor} colorClass="text-blue-600 dark:text-blue-400" />
                    <MetricCard title="Serious Accidents" value={totals.serious} colorClass="text-orange-600 dark:text-orange-400" />
                    <MetricCard title="Fatal Accidents" value={totals.fatal} colorClass="text-red-600 dark:text-red-400" />
                    <MetricCard title="Victims (Count)" value={totals.victims} colorClass="text-purple-600 dark:text-purple-400" />
                    <MetricCard title="Total Instances" value={totals.total} colorClass="text-slate-800 dark:text-slate-100" />
                  </div>
              ) : statsDomain === 'FIRES' ? (
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-3">
                    <MetricCard title="Minor Outbreaks" value={totals.minor_outbreaks} colorClass="text-amber-600 dark:text-amber-400" />
                    <MetricCard title="Major Disasters" value={totals.major_disasters} colorClass="text-orange-600 dark:text-orange-400" />
                    <MetricCard title="Fatal Fires" value={totals.fatal_fires} colorClass="text-red-600 dark:text-red-400" />
                    <MetricCard title="Victims (Count)" value={totals.victims} colorClass="text-amber-700 dark:text-amber-300" />
                    <MetricCard title="Total Instances" value={totals.total} colorClass="text-slate-800 dark:text-slate-100" />
                  </div>
              ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 mt-3">
                    <MetricCard title="Arrested" value={totals.arrested} colorClass="text-blue-700 dark:text-blue-400" />
                    <MetricCard title="Given Bond" value={totals.given_bond} colorClass="text-indigo-600 dark:text-indigo-400" />
                    <MetricCard title="Cautioned" value={totals.cautioned} colorClass="text-gray-600 dark:text-slate-400" />
                    <MetricCard title="Taken to Court" value={totals.taken_to_court} colorClass="text-blue-500 dark:text-blue-400" />
                    <MetricCard title="Released" value={totals.released} colorClass="text-green-600 dark:text-green-400" />
                    <MetricCard title="Remanded" value={totals.remanded} colorClass="text-red-600 dark:text-red-400" />
                    <MetricCard title="Convicted" value={totals.convicted} colorClass="text-purple-600 dark:text-purple-400" />
                  </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                <select value={filterRegion} onChange={(e) => handleGlobalFilterRegionChange(e.target.value)} disabled={!canViewGlobalLevel} className="border dark:border-slate-700 rounded px-2 py-1.5 text-[11px] font-black shadow-sm bg-white dark:bg-slate-800 dark:text-slate-100 disabled:bg-gray-100 dark:disabled:bg-slate-900 disabled:text-gray-500 w-full sm:w-auto outline-none focus:border-blue-500 cursor-pointer">
                  {canViewGlobalLevel ? (
                    <><option value="ALL REGIONS">ALL REGIONS</option>{Object.keys(REGIONAL_HIERARCHY).map(reg => <option key={reg} value={reg}>{reg}</option>)}</>
                  ) : <option value={userRegClean}>{userRegClean}</option>}
                </select>
                <select value={filterStation} onChange={(e) => handleGlobalFilterStationChange(e.target.value)} disabled={!(canViewGlobalLevel || isRegionalCommand)} className="border dark:border-slate-700 rounded px-2 py-1.5 text-[11px] font-black shadow-sm bg-white dark:bg-slate-800 dark:text-slate-100 disabled:bg-gray-100 dark:disabled:bg-slate-900 disabled:text-gray-500 w-full sm:w-auto outline-none focus:border-blue-500 cursor-pointer">
                  {(canViewGlobalLevel || isRegionalCommand) ? (
                    <><option value="ALL STATIONS">ALL STATIONS</option>{filterRegion !== 'ALL REGIONS' && REGIONAL_HIERARCHY[filterRegion] ? REGIONAL_HIERARCHY[filterRegion].map(stat => <option key={stat} value={stat}>{stat}</option>) : null}</>
                  ) : <option value={cleanStr(currentUser.station)}>{cleanStr(currentUser.station)}</option>}
                </select>
              </div>

              {/* 🟢 Synchronized Statistics Domain Toggles */}
              <div className="inline-flex bg-slate-200 dark:bg-slate-800 p-1 rounded-lg border dark:border-slate-700 shadow-inner shrink-0 gap-1 flex-wrap">
                <button type="button" onClick={() => handleToggleDomain('DISRUPTIVE')} className={`px-2 py-1 rounded font-black text-[10px] transition cursor-pointer ${statsDomain === 'DISRUPTIVE' ? 'bg-slate-900 dark:bg-slate-950 text-white shadow' : 'text-slate-700 dark:text-slate-300'}`}>
                  ⚡ Disruptive OPS
                </button>
                <button type="button" onClick={() => handleToggleDomain('AGRICULTURAL')} className={`px-2 py-1 rounded font-black text-[10px] transition cursor-pointer ${statsDomain === 'AGRICULTURAL' ? 'bg-emerald-700 text-white shadow' : 'text-slate-700 dark:text-slate-300'}`}>
                  🌱 Agric Crimes
                </button>
                <button type="button" onClick={() => handleToggleDomain('ACCIDENTS')} className={`px-2 py-1 rounded font-black text-[10px] transition cursor-pointer ${statsDomain === 'ACCIDENTS' ? 'bg-red-700 text-white shadow' : 'text-slate-700 dark:text-slate-300'}`}>
                  🚓 Accidents
                </button>
                <button type="button" onClick={() => handleToggleDomain('FIRES')} className={`px-2 py-1 rounded font-black text-[10px] transition cursor-pointer ${statsDomain === 'FIRES' ? 'bg-amber-700 text-white shadow' : 'text-slate-700 dark:text-slate-300'}`}>
                  🔥 Fires
                </button>
              </div>
            </div>

            <ExpandableTableCard title={`WEEKLY METRICS BREAKDOWN LEDGER (${statsDomain === 'AGRICULTURAL' ? 'AGRICULTURAL CRIMES' : statsDomain === 'ACCIDENTS' ? 'ACCIDENTS' : statsDomain === 'FIRES' ? 'FIRES & RESCUE' : viewMode === 'REGIONAL' ? 'REGIONAL SUMMATION TABLE (REVISED REG TEMPLATE)' : 'DISRUPTIVE OPS (REVISED DIV TEMPLATE)'})`} onToggle={(expanded) => { if (setSidebarOpen) setSidebarOpen(!expanded); }}>
              <div className="overflow-x-auto w-full dark:bg-slate-900">
                
                {statsDomain === 'ACCIDENTS' ? (
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-800 text-[11px]">
                    <thead className="bg-red-50 dark:bg-slate-950 sticky top-0">
                      <tr>
                        <th rowSpan="2" className="px-2 py-2 text-center font-black text-red-900 dark:text-red-300 uppercase border-r border-slate-300 dark:border-slate-700 border-b align-middle">S/N</th>
                        <th rowSpan="2" className="px-2 py-2 text-center font-black text-red-900 dark:text-red-300 uppercase border-r border-slate-300 dark:border-slate-700 border-b align-middle">Date</th>
                        <th rowSpan="2" className="px-2 py-2 text-center font-black text-red-900 dark:text-red-300 uppercase border-r border-slate-300 dark:border-slate-700 border-b align-middle">Division/Station</th>
                        
                        <th rowSpan="2" className="px-2 py-2 text-center font-black text-red-900 dark:text-red-300 uppercase border-r border-slate-300 dark:border-slate-700 border-b align-middle">Accident Type</th>
                        
                        <th colSpan="4" className="px-2 py-2 text-center font-extrabold text-white bg-red-800 dark:bg-red-900 uppercase border-r border-slate-300 dark:border-slate-700 border-b">Severity Breakdown & Casualties</th>
                        <th rowSpan="2" className="px-2 py-2 text-center font-black text-red-900 dark:text-red-300 uppercase border-r border-slate-300 dark:border-slate-700 border-b align-middle">TOTAL</th>
                        <th rowSpan="2" className="px-2 py-2 text-center font-black text-red-900 dark:text-red-300 uppercase border-r border-slate-300 dark:border-slate-700 border-b align-middle whitespace-normal leading-tight w-16">Created By</th>
                        <th rowSpan="2" className="px-2 py-2 text-center font-black text-red-900 dark:text-red-300 uppercase border-b border-slate-300 dark:border-slate-700 align-middle whitespace-normal leading-tight w-16">Date Created</th>
                      </tr>
                      <tr>
                        <th className="px-2 py-2 text-center text-[10px] font-extrabold text-blue-800 dark:text-blue-300 bg-red-100 dark:bg-slate-900 border-r border-slate-300 dark:border-slate-700 border-b uppercase">Minor</th>
                        <th className="px-2 py-2 text-center text-[10px] font-extrabold text-orange-800 dark:text-orange-300 bg-red-100 dark:bg-slate-900 border-r border-slate-300 dark:border-slate-700 border-b uppercase">Serious</th>
                        <th className="px-2 py-2 text-center text-[10px] font-extrabold text-red-800 dark:text-red-400 bg-red-100 dark:bg-slate-900 border-r border-slate-300 dark:border-slate-700 border-b uppercase">Fatal</th>
                        <th className="px-2 py-2 text-center text-[10px] font-black text-purple-800 dark:text-purple-400 bg-purple-50 dark:bg-slate-900 border-r border-slate-300 dark:border-slate-700 border-b uppercase">Victims</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-slate-900 divide-y divide-gray-200 dark:divide-slate-800">
                      {currentDomainStats.map((stat, idx) => (
                        <tr key={stat.id || stat.sn} className="even:bg-slate-50 dark:even:bg-slate-800/40 hover:bg-red-50 dark:hover:bg-slate-800 transition-colors cursor-pointer" onClick={() => { if(operation === 'update') populateUpdateForm(stat); }}>
                          <td className="px-2 py-2 text-center font-bold text-gray-900 dark:text-slate-100 border-r border-slate-200 dark:border-slate-800">{idx + 1}</td>
                          <td className="px-2 py-2 text-center whitespace-nowrap text-gray-500 dark:text-slate-400 border-r border-slate-200 dark:border-slate-800">{stat.date}</td>
                          <td className="px-2 py-2 text-center font-bold text-red-800 dark:text-red-400 border-r border-slate-200 dark:border-slate-800">{stat.station}</td>
                          
                          <td className="px-2 py-2 text-center font-bold text-slate-700 dark:text-slate-300 border-r border-slate-200 dark:border-slate-800">{stat.nature_of_accident}</td>
                          
                          <td className="px-2 py-2 text-center font-bold text-blue-600 dark:text-blue-400 border-r border-slate-200 dark:border-slate-800">{stat.minor}</td>
                          <td className="px-2 py-2 text-center font-bold text-orange-600 dark:text-orange-400 border-r border-slate-200 dark:border-slate-800">{stat.serious}</td>
                          <td className="px-2 py-2 text-center font-black text-red-600 dark:text-red-500 border-r border-slate-200 dark:border-slate-800">{stat.fatal}</td>
                          <td className="px-2 py-2 text-center font-black text-purple-600 dark:text-purple-400 border-r border-slate-200 dark:border-slate-800">{stat.victims}</td>
                          
                          <td className="px-2 py-2 text-center font-black text-[13px] text-slate-800 dark:text-slate-100 border-r border-slate-200 dark:border-slate-800">{stat.total}</td>
                          <td className="px-2 py-2 text-center text-[9px] font-semibold text-gray-500 dark:text-slate-400 border-r border-slate-200 dark:border-slate-800">{stat.entered_by || stat.last_updated_by}</td>
                          <td className="px-2 py-2 text-center text-[9px] font-mono text-gray-400 dark:text-slate-500">{stat.created_at ? stat.created_at.split('T')[0] : ''}</td>
                        </tr>
                      ))}
                      {currentDomainStats.length > 0 && (
                        <tr className="bg-red-900 text-white font-black">
                          <td colSpan="4" className="px-2 py-2 text-right uppercase tracking-wider border-r border-red-700">Total Aggregates</td>
                          <td className="px-2 py-2 text-center border-r border-red-700">{totals.minor}</td>
                          <td className="px-2 py-2 text-center border-r border-red-700">{totals.serious}</td>
                          <td className="px-2 py-2 text-center border-r border-red-700">{totals.fatal}</td>
                          <td className="px-2 py-2 text-center border-r border-red-700 text-purple-200">{totals.victims}</td>
                          <td className="px-2 py-2 text-center text-[13px] bg-black border-r border-red-700">{totals.total}</td>
                          <td colSpan="2" className="px-2 py-2"></td>
                        </tr>
                      )}
                      {currentDomainStats.length === 0 && <tr><td colSpan="11" className="text-center py-6 text-gray-500 dark:text-slate-400 font-bold">No accident statistics logged for this jurisdiction.</td></tr>}
                    </tbody>
                  </table>
                ) : statsDomain === 'FIRES' ? (
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-800 text-[11px]">
                    <thead className="bg-amber-50 dark:bg-slate-950 sticky top-0">
                      <tr>
                        <th rowSpan="2" className="px-2 py-2 text-center font-black text-amber-900 dark:text-amber-300 uppercase border-r border-slate-300 dark:border-slate-700 border-b align-middle">S/N</th>
                        <th rowSpan="2" className="px-2 py-2 text-center font-black text-amber-900 dark:text-amber-300 uppercase border-r border-slate-300 dark:border-slate-700 border-b align-middle">Date</th>
                        <th rowSpan="2" className="px-2 py-2 text-center font-black text-amber-900 dark:text-amber-300 uppercase border-r border-slate-300 dark:border-slate-700 border-b align-middle">Division/Station</th>
                        <th rowSpan="2" className="px-2 py-2 text-center font-black text-amber-900 dark:text-amber-300 uppercase border-r border-slate-300 dark:border-slate-700 border-b align-middle">Nature of Fire</th>
                        <th colSpan="4" className="px-2 py-2 text-center font-extrabold text-white bg-amber-800 dark:bg-amber-900 uppercase border-r border-slate-300 dark:border-slate-700 border-b">Fire Outbreaks & Rescue Casualties</th>
                        <th rowSpan="2" className="px-2 py-2 text-center font-black text-amber-900 dark:text-amber-300 uppercase border-r border-slate-300 dark:border-slate-700 border-b align-middle">TOTAL</th>
                        <th rowSpan="2" className="px-2 py-2 text-center font-black text-amber-900 dark:text-amber-300 uppercase border-r border-slate-300 dark:border-slate-700 border-b align-middle whitespace-normal leading-tight w-16">Created By</th>
                        <th rowSpan="2" className="px-2 py-2 text-center font-black text-amber-900 dark:text-amber-300 uppercase border-b border-slate-300 dark:border-slate-700 align-middle whitespace-normal leading-tight w-16">Date Created</th>
                      </tr>
                      <tr>
                        <th className="px-2 py-2 text-center text-[10px] font-extrabold text-amber-800 bg-amber-100 dark:bg-slate-900 border-r border-slate-300 dark:border-slate-700 border-b uppercase">Minor</th>
                        <th className="px-2 py-2 text-center text-[10px] font-extrabold text-orange-800 bg-amber-100 dark:bg-slate-900 border-r border-slate-300 dark:border-slate-700 border-b uppercase">Major</th>
                        <th className="px-2 py-2 text-center text-[10px] font-extrabold text-red-800 bg-amber-100 dark:bg-slate-900 border-r border-slate-300 dark:border-slate-700 border-b uppercase">Fatal</th>
                        <th className="px-2 py-2 text-center text-[10px] font-black text-amber-900 bg-amber-100 dark:bg-slate-900 border-r border-slate-300 dark:border-slate-700 border-b uppercase">Victims</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-slate-900 divide-y divide-gray-200 dark:divide-slate-800">
                      {currentDomainStats.map((stat, idx) => (
                        <tr key={stat.id || stat.sn} className="even:bg-slate-50 dark:even:bg-slate-800/40 hover:bg-amber-50 dark:hover:bg-slate-800 transition-colors cursor-pointer" onClick={() => { if(operation === 'update') populateUpdateForm(stat); }}>
                          <td className="px-2 py-2 text-center font-bold text-gray-900 dark:text-slate-100 border-r border-slate-200 dark:border-slate-800">{idx + 1}</td>
                          <td className="px-2 py-2 text-center whitespace-nowrap text-gray-500 dark:text-slate-400 border-r border-slate-200 dark:border-slate-800">{stat.date}</td>
                          <td className="px-2 py-2 text-center font-bold text-amber-800 dark:text-amber-400 border-r border-slate-200 dark:border-slate-800">{stat.station}</td>
                          <td className="px-2 py-2 text-center font-bold text-slate-700 dark:text-slate-300 border-r border-slate-200 dark:border-slate-800">{stat.nature_of_fire}</td>
                          <td className="px-2 py-2 text-center font-bold text-amber-600 border-r border-slate-200 dark:border-slate-800">{stat.minor_outbreaks}</td>
                          <td className="px-2 py-2 text-center font-bold text-orange-600 border-r border-slate-200 dark:border-slate-800">{stat.major_disasters}</td>
                          <td className="px-2 py-2 text-center font-black text-red-600 border-r border-slate-200 dark:border-slate-800">{stat.fatal_fires}</td>
                          <td className="px-2 py-2 text-center font-black text-amber-700 border-r border-slate-200 dark:border-slate-800">{stat.victims}</td>
                          <td className="px-2 py-2 text-center font-black text-[13px] text-slate-800 dark:text-slate-100 border-r border-slate-200 dark:border-slate-800">{stat.total}</td>
                          <td className="px-2 py-2 text-center text-[9px] font-semibold text-gray-500 border-r border-slate-200 dark:border-slate-800">{stat.entered_by || stat.last_updated_by}</td>
                          <td className="px-2 py-2 text-center text-[9px] font-mono text-gray-400">{stat.created_at ? stat.created_at.split('T')[0] : ''}</td>
                        </tr>
                      ))}
                      {currentDomainStats.length > 0 && (
                        <tr className="bg-amber-900 text-white font-black">
                          <td colSpan="4" className="px-2 py-2 text-right uppercase tracking-wider border-r border-amber-700">Total Aggregates</td>
                          <td className="px-2 py-2 text-center border-r border-amber-700">{totals.minor_outbreaks}</td>
                          <td className="px-2 py-2 text-center border-r border-amber-700">{totals.major_disasters}</td>
                          <td className="px-2 py-2 text-center border-r border-amber-700">{totals.fatal_fires}</td>
                          <td className="px-2 py-2 text-center border-r border-amber-700 text-amber-200">{totals.victims}</td>
                          <td className="px-2 py-2 text-center text-[13px] bg-black border-r border-amber-700">{totals.total}</td>
                          <td colSpan="2" className="px-2 py-2"></td>
                        </tr>
                      )}
                      {currentDomainStats.length === 0 && <tr><td colSpan="11" className="text-center py-6 text-gray-500 dark:text-slate-400 font-bold">No fire statistics logged for this jurisdiction.</td></tr>}
                    </tbody>
                  </table>
                ) : viewMode === 'REGIONAL' ? (
                  // 🟢 REVISED REG TEMPLATE (Summation Table View)
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-800 border border-slate-300 dark:border-slate-800 text-[11px]">
                    <thead className="bg-slate-100 dark:bg-slate-950 sticky top-0">
                      <tr>
                        <th rowSpan="2" className="px-2 py-2 text-center font-black uppercase border-r border-slate-300 dark:border-slate-700 border-b align-middle w-8">S/n</th>
                        <th rowSpan="2" className="px-2 py-2 text-center font-black uppercase border-r border-slate-300 dark:border-slate-700 border-b align-middle">Division</th>
                        <th rowSpan="2" className="px-2 py-2 text-center font-black uppercase border-r border-slate-300 dark:border-slate-700 border-b align-middle whitespace-normal leading-tight w-16">Suspects<br/>arrested</th>
                        
                        <th colSpan="3" className="px-2 py-2 text-center font-extrabold uppercase bg-orange-400 dark:bg-orange-600 text-white border-r border-slate-300 dark:border-slate-700 border-b">ACTION TAKEN</th>
                        <th colSpan="3" className="px-2 py-2 text-center font-extrabold uppercase bg-red-600 dark:bg-red-800 text-white border-b border-slate-300 dark:border-slate-700">STATUS OF THOSE TAKEN TO COURT</th>
                      </tr>
                      <tr>
                        <th className="px-2 py-2 text-center text-[9px] font-bold uppercase bg-green-200 dark:bg-green-900/40 text-green-900 dark:text-green-300 border-r border-slate-300 dark:border-slate-700 border-b whitespace-normal leading-tight w-16">Given<br/>Bond</th>
                        <th className="px-2 py-2 text-center text-[9px] font-bold uppercase bg-blue-200 dark:bg-blue-900/40 text-blue-900 dark:text-blue-300 border-r border-slate-300 dark:border-slate-700 border-b whitespace-normal leading-tight w-16">Cautioned</th>
                        <th className="px-2 py-2 text-center text-[9px] font-bold uppercase bg-red-600 dark:bg-red-800 text-white border-r border-slate-300 dark:border-slate-700 border-b whitespace-normal leading-tight w-16">Taken to<br/>Court</th>
                        
                        <th className="px-2 py-2 text-center text-[9px] font-bold uppercase bg-red-600 dark:bg-red-800 text-white border-r border-slate-300 dark:border-slate-700 border-b whitespace-normal leading-tight w-16">Released<br/>by court</th>
                        <th className="px-2 py-2 text-center text-[9px] font-bold uppercase bg-red-600 dark:bg-red-800 text-white border-r border-slate-300 dark:border-slate-700 border-b whitespace-normal leading-tight w-16">Suspects<br/>remanded</th>
                        <th className="px-2 py-2 text-center text-[9px] font-bold uppercase bg-red-600 dark:bg-red-800 text-white border-b border-slate-300 dark:border-slate-700 whitespace-normal leading-tight w-16">Suspects<br/>convicted</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-slate-900 divide-y divide-gray-200 dark:divide-slate-800">
                      {regionalSummationData.map((row, idx) => (
                        <tr key={idx} className="hover:bg-blue-50 dark:hover:bg-slate-800 transition-colors">
                          <td className="px-2 py-2 text-center font-bold border-r border-slate-200 dark:border-slate-800">{idx + 1}</td>
                          <td className="px-2 py-2 text-center font-bold border-r border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200">{row.station}</td>
                          <td className="px-2 py-2 text-center border-r border-slate-200 dark:border-slate-800 font-bold">{row.arrested}</td>
                          <td className="px-2 py-2 text-center border-r border-slate-200 dark:border-slate-800">{row.given_bond}</td>
                          <td className="px-2 py-2 text-center border-r border-slate-200 dark:border-slate-800">{row.cautioned}</td>
                          <td className="px-2 py-2 text-center border-r border-slate-200 dark:border-slate-800 font-bold text-red-600 dark:text-red-400">{row.taken_to_court}</td>
                          <td className="px-2 py-2 text-center border-r border-slate-200 dark:border-slate-800">{row.released}</td>
                          <td className="px-2 py-2 text-center border-r border-slate-200 dark:border-slate-800">{row.remanded}</td>
                          <td className="px-2 py-2 text-center border-slate-200 dark:border-slate-800">{row.convicted}</td>
                        </tr>
                      ))}
                      {regionalSummationData.length > 0 && (
                        <tr className="bg-slate-200 dark:bg-slate-800 font-bold border-t-2 border-slate-400 dark:border-slate-600">
                          <td colSpan="2" className="px-2 py-2 text-right uppercase border-r border-slate-300 dark:border-slate-700">TOTAL</td>
                          <td className="px-2 py-2 text-center text-[13px] text-blue-800 dark:text-blue-400 border-r border-slate-300 dark:border-slate-700">{regionalSummationData.reduce((s, r) => s + r.arrested, 0)}</td>
                          <td className="px-2 py-2 text-center text-[13px] text-green-800 dark:text-green-400 border-r border-slate-300 dark:border-slate-700">{regionalSummationData.reduce((s, r) => s + r.given_bond, 0)}</td>
                          <td className="px-2 py-2 text-center text-[13px] text-blue-800 dark:text-blue-400 border-r border-slate-300 dark:border-slate-700">{regionalSummationData.reduce((s, r) => s + r.cautioned, 0)}</td>
                          <td className="px-2 py-2 text-center text-[13px] text-red-800 dark:text-red-400 border-r border-slate-300 dark:border-slate-700">{regionalSummationData.reduce((s, r) => s + r.taken_to_court, 0)}</td>
                          <td className="px-2 py-2 text-center text-[13px] text-red-800 dark:text-red-400 border-r border-slate-300 dark:border-slate-700">{regionalSummationData.reduce((s, r) => s + r.released, 0)}</td>
                          <td className="px-2 py-2 text-center text-[13px] text-red-800 dark:text-red-400 border-r border-slate-300 dark:border-slate-700">{regionalSummationData.reduce((s, r) => s + r.remanded, 0)}</td>
                          <td className="px-2 py-2 text-center text-[13px] text-purple-800 dark:text-purple-400">{regionalSummationData.reduce((s, r) => s + r.convicted, 0)}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                ) : (
                  // 🟢 REVISED DIV TEMPLATE (Station Form & Daily Breakdown Ledger View)
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-800 border border-slate-300 dark:border-slate-800 text-[11px]">
                    <thead className="bg-slate-100 dark:bg-slate-950 sticky top-0">
                      <tr>
                        <th rowSpan="2" className="px-2 py-2 text-center font-black uppercase border-r border-slate-300 dark:border-slate-700 border-b align-middle w-8">S/n</th>
                        <th rowSpan="2" className="px-2 py-2 text-center font-black uppercase border-r border-slate-300 dark:border-slate-700 border-b align-middle">Division</th>
                        <th rowSpan="2" className="px-2 py-2 text-center font-black uppercase border-r border-slate-300 dark:border-slate-700 border-b align-middle whitespace-normal leading-tight w-16">Day &<br/>Date</th>
                        <th rowSpan="2" className="px-2 py-2 text-center font-black uppercase border-r border-slate-300 dark:border-slate-700 border-b align-middle whitespace-normal leading-tight w-16">Suspects<br/>arrested</th>
                        
                        <th colSpan="4" className="px-2 py-2 text-center font-extrabold uppercase border-r border-slate-300 dark:border-slate-700 border-b">STATUS OF SUSPECTS ARRESTED</th>
                        <th colSpan="5" className="px-2 py-2 text-center font-extrabold uppercase border-b border-slate-300 dark:border-slate-700">STATUS OF THOSE TAKEN TO COURT</th>
                      </tr>
                      <tr>
                        <th className="px-2 py-2 text-center text-[9px] font-bold uppercase border-r border-slate-300 dark:border-slate-700 border-b bg-green-50 dark:bg-green-900/10 whitespace-normal leading-tight w-16">Given<br/>Bond</th>
                        <th className="px-2 py-2 text-center text-[9px] font-bold uppercase border-r border-slate-300 dark:border-slate-700 border-b bg-blue-50 dark:bg-blue-900/10 whitespace-normal leading-tight w-16">Cautioned</th>
                        <th className="px-2 py-2 text-center text-[9px] font-bold uppercase border-r border-slate-300 dark:border-slate-700 border-b whitespace-normal leading-tight w-24">Pending Court<br/>from prev<br/>day's OPS</th>
                        <th className="px-2 py-2 text-center text-[9px] font-bold uppercase border-r border-slate-300 dark:border-slate-700 border-b whitespace-normal leading-tight w-24">Pending court<br/>from Today's<br/>OPS</th>
                        
                        <th className="px-2 py-2 text-center text-[9px] font-bold uppercase border-r border-slate-300 dark:border-slate-700 border-b whitespace-normal leading-tight w-24">Taken to court<br/>from prev<br/>day's lockup</th>
                        <th className="px-2 py-2 text-center text-[9px] font-bold uppercase border-r border-slate-300 dark:border-slate-700 border-b whitespace-normal leading-tight w-24">Taken to Court<br/>from today's<br/>OPS</th>
                        <th className="px-2 py-2 text-center text-[9px] font-bold uppercase border-r border-slate-300 dark:border-slate-700 border-b whitespace-normal leading-tight w-16">Released<br/>by court</th>
                        <th className="px-2 py-2 text-center text-[9px] font-bold uppercase border-r border-slate-300 dark:border-slate-700 border-b whitespace-normal leading-tight w-16">Suspects<br/>remanded</th>
                        <th className="px-2 py-2 text-center text-[9px] font-bold uppercase border-b border-slate-300 dark:border-slate-700 whitespace-normal leading-tight w-16">Suspects<br/>convicted</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-slate-900 divide-y divide-gray-200 dark:divide-slate-800">
                      {currentDomainStats.map((stat, idx) => (
                        <tr key={stat.id || stat.sn} className="even:bg-slate-50 dark:even:bg-slate-800/40 hover:bg-blue-50 dark:hover:bg-slate-800 transition-colors cursor-pointer" onClick={() => { if(operation === 'update') populateUpdateForm(stat); }}>
                          <td className="px-2 py-2 text-center font-bold border-r border-slate-200 dark:border-slate-800">{idx + 1}</td>
                          <td className="px-2 py-2 text-center font-bold border-r border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200">{stat.station}</td>
                          <td className="px-2 py-2 text-center border-r border-slate-200 dark:border-slate-800 whitespace-nowrap">{stat.date}</td>
                          <td className="px-2 py-2 text-center font-bold border-r border-slate-200 dark:border-slate-800">{stat.arrested}</td>
                          
                          <td className="px-2 py-2 text-center border-r border-slate-200 dark:border-slate-800 text-green-700 dark:text-green-500 font-bold">{stat.given_bond}</td>
                          <td className="px-2 py-2 text-center border-r border-slate-200 dark:border-slate-800 text-blue-700 dark:text-blue-500 font-bold">{stat.cautioned}</td>
                          <td className="px-2 py-2 text-center border-r border-slate-200 dark:border-slate-800 font-bold text-yellow-600 dark:text-yellow-500">{stat.pending_court_prev_ops}</td>
                          <td className="px-2 py-2 text-center border-r border-slate-200 dark:border-slate-800 font-bold text-yellow-600 dark:text-yellow-500">{stat.pending_court_today_ops}</td>
                          
                          <td className="px-2 py-2 text-center border-r border-slate-200 dark:border-slate-800 font-bold text-red-600 dark:text-red-500">{stat.taken_to_court_prev_lockup}</td>
                          <td className="px-2 py-2 text-center border-r border-slate-200 dark:border-slate-800 font-bold text-red-600 dark:text-red-500">{stat.taken_to_court_today_ops}</td>
                          <td className="px-2 py-2 text-center border-r border-slate-200 dark:border-slate-800 text-green-700 dark:text-green-500 font-bold">{stat.released}</td>
                          <td className="px-2 py-2 text-center border-r border-slate-200 dark:border-slate-800 text-red-700 dark:text-red-500 font-bold">{stat.remanded}</td>
                          <td className="px-2 py-2 text-center border-slate-200 dark:border-slate-800 text-purple-700 dark:text-purple-400 font-bold">{stat.convicted}</td>
                        </tr>
                      ))}
                      {currentDomainStats.length > 0 && (
                        <tr className="bg-slate-200 dark:bg-slate-800 font-bold border-t-2 border-slate-400 dark:border-slate-600">
                          <td colSpan="3" className="px-2 py-2 text-right uppercase border-r border-slate-300 dark:border-slate-700">TOTAL</td>
                          <td className="px-2 py-2 text-center text-[13px] text-blue-800 dark:text-blue-400 border-r border-slate-300 dark:border-slate-700">{totals.arrested}</td>
                          
                          <td className="px-2 py-2 text-center text-[13px] text-green-800 dark:text-green-400 border-r border-slate-300 dark:border-slate-700">{totals.given_bond}</td>
                          <td className="px-2 py-2 text-center text-[13px] text-blue-800 dark:text-blue-400 border-r border-slate-300 dark:border-slate-700">{totals.cautioned}</td>
                          
                          {/* 🟢 BLANKED OUT TO PREVENT MATHEMATICAL INFLATION OF PENDING SUSPECTS */}
                          <td className="px-2 py-2 text-center text-[13px] border-r border-slate-300 dark:border-slate-700 text-slate-400">-</td>
                          <td className="px-2 py-2 text-center text-[13px] border-r border-slate-300 dark:border-slate-700 text-slate-400">-</td>
                          
                          <td className="px-2 py-2 text-center text-[13px] border-r border-slate-300 dark:border-slate-700 text-red-800 dark:text-red-400">{currentDomainStats.reduce((s, r) => s + (parseInt(r.taken_to_court_prev_lockup) || 0), 0)}</td>
                          <td className="px-2 py-2 text-center text-[13px] border-r border-slate-300 dark:border-slate-700 text-red-800 dark:text-red-400">{currentDomainStats.reduce((s, r) => s + (parseInt(r.taken_to_court_today_ops) || 0), 0)}</td>
                          <td className="px-2 py-2 text-center text-[13px] text-green-800 dark:text-green-400 border-r border-slate-300 dark:border-slate-700">{totals.released}</td>
                          <td className="px-2 py-2 text-center text-[13px] text-red-800 dark:text-red-400 border-r border-slate-300 dark:border-slate-700">{totals.remanded}</td>
                          <td className="px-2 py-2 text-center text-[13px] text-purple-800 dark:text-purple-400">{totals.convicted}</td>
                        </tr>
                      )}
                      {currentDomainStats.length === 0 && <tr><td colSpan="13" className="text-center py-6 text-gray-500 dark:text-slate-400 font-bold">No statistics logged for this jurisdiction.</td></tr>}
                    </tbody>
                  </table>
                )}
              </div>
            </ExpandableTableCard>

            {statsDomain === 'AGRICULTURAL' && (
              <div className="mt-6 space-y-6 animate-in fade-in duration-200">
                <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-300 dark:border-slate-800 overflow-hidden">
                  <div className="bg-slate-900 dark:bg-slate-950 px-4 py-3 text-white font-extrabold text-xs uppercase tracking-wider flex items-center justify-between">
                    <span>📋 Regional Agricultural & Produce Theft Command Ledger</span>
                  </div>

                  <div className="overflow-x-auto w-full custom-scrollbar dark:bg-slate-900">
                    <table className="w-full text-left border-collapse text-[11px] whitespace-nowrap">
                      <thead className="bg-[#00b050] text-white uppercase font-black">
                        <tr>
                          <th className="p-2 border-r border-emerald-700 w-10 text-center">SN.</th>
                          <th className="p-2 border-r border-emerald-700 w-40">DISTRICT/DIVISION</th>
                          <th className="p-2 border-r border-emerald-700">REPORT</th>
                          <th className="p-2 border-r border-emerald-700 text-center w-20">QTY</th>
                          <th className="p-2 border-r border-emerald-700">ACTION</th>
                          <th className="p-2 text-center w-28">NUMBER</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-300 dark:divide-slate-800 border-b border-slate-300 dark:border-slate-800">
                        {Object.keys(groupedAgricData).map((regionName) => {
                          const regionData = groupedAgricData[regionName];
                          const isExpanded = expandedAgricRegions[regionName];
                          const hasData = Object.keys(regionData.stations).length > 0;

                          const allRegionRecords = Object.values(regionData.stations).flat();
                          const regionalTotalStolen = allRegionRecords.reduce((sum, r) => sum + (parseInt(r.number_count) || 0), 0);
                          const regionalTotalRecovered = allRegionRecords.reduce((sum, r) => sum + (parseInt(r.recoveries) || 0), 0);

                          return (
                            <React.Fragment key={regionName}>
                              <tr
                                onClick={() => toggleAgricRegion(regionName)}
                                className="bg-[#00b050]/20 hover:bg-[#00b050]/30 cursor-pointer transition-colors border-t-2 border-emerald-600"
                              >
                                <td colSpan="6" className="p-2 font-black text-emerald-900 dark:text-emerald-300 uppercase">
                                  <span className="mr-2 text-emerald-700 dark:text-emerald-400">{isExpanded ? '▼' : '▶'}</span> {regionName}
                                </td>
                              </tr>

                              {isExpanded && hasData && Object.keys(regionData.stations).map((stationName, idx) => {
                                const records = regionData.stations[stationName];
                                
                                return (
                                  <tr key={stationName} className="bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/50 border-b border-slate-300 dark:border-slate-800">
                                    <td className="p-2 font-bold text-slate-800 dark:text-slate-200 text-center align-top border-r border-slate-300 dark:border-slate-800">{idx + 1}</td>
                                    <td className="p-2 font-extrabold text-slate-900 dark:text-slate-100 uppercase align-top border-r border-slate-300 dark:border-slate-800">{stationName}</td>
                                    
                                    <td className="p-0 align-top border-r border-slate-300 dark:border-slate-800">
                                      {records.map((r, i) => (
                                        <div key={i} className={`px-2 py-2 font-bold text-red-600 dark:text-red-400 uppercase ${i !== records.length - 1 ? 'border-b border-slate-200 dark:border-slate-800' : ''}`}>
                                          {r.agric_crime_report} STOLEN
                                        </div>
                                      ))}
                                    </td>

                                    <td className="p-0 align-top border-r border-slate-300 dark:border-slate-800">
                                      {records.map((r, i) => {
                                        return (
                                          <div key={i} className={`px-2 py-2 font-black text-slate-900 dark:text-slate-100 text-center ${i !== records.length - 1 ? 'border-b border-slate-200 dark:border-slate-800' : ''}`}>
                                            {r.number_count_label}
                                          </div>
                                        )
                                      })}
                                    </td>

                                    <td className="p-0 align-top border-r border-slate-300 dark:border-slate-800">
                                      {records.map((r, i) => (
                                        <div key={i} className={`px-2 py-2 font-bold text-emerald-700 dark:text-emerald-400 uppercase ${i !== records.length - 1 ? 'border-b border-slate-200 dark:border-slate-800' : ''}`}>
                                          {r.recovery_report}
                                        </div>
                                      ))}
                                    </td>

                                    <td className="p-0 align-top">
                                      {records.map((r, i) => (
                                        <div key={i} className={`px-2 py-2 font-black text-emerald-600 dark:text-emerald-400 text-center ${i !== records.length - 1 ? 'border-b border-slate-200 dark:border-slate-800' : ''}`}>
                                          {r.recoveries_label}
                                        </div>
                                      ))}
                                    </td>
                                  </tr>
                                )
                              })}
                              
                              {isExpanded && hasData && (
                                <tr className="bg-emerald-50 dark:bg-slate-800/80 border-b-2 border-emerald-400 dark:border-emerald-700">
                                  <td colSpan="3" className="p-2 font-black text-right text-emerald-900 dark:text-emerald-300 uppercase tracking-wider">
                                    {regionName} REGIONAL TOTAL:
                                  </td>
                                  <td className="p-2 text-center font-black text-red-700 dark:text-red-400 text-base border-x border-emerald-200 dark:border-slate-700">
                                    {regionalTotalStolen}
                                  </td>
                                  <td className="p-2 font-bold text-emerald-900 dark:text-emerald-300 text-right uppercase border-r border-emerald-200 dark:border-slate-700">
                                    TOTAL RECOVERED:
                                  </td>
                                  <td className="p-2 text-center font-black text-emerald-700 dark:text-emerald-400 text-base">
                                    {regionalTotalRecovered}
                                  </td>
                                </tr>
                              )}

                              {isExpanded && !hasData && (
                                <tr>
                                  <td colSpan="6" className="p-4 text-center text-slate-400 dark:text-slate-500 font-bold bg-slate-50 dark:bg-slate-900 italic">No entries logged for {regionName} yet.</td>
                                </tr>
                              )}
                            </React.Fragment>
                          )
                        })}

                        {agricSummaryRecords.length > 0 && (
                          <tr className="bg-slate-900 dark:bg-slate-950 text-white border-t-4 border-slate-700 shadow-inner">
                            <td colSpan="3" className="p-3 font-black text-right uppercase tracking-widest text-slate-200">
                              GRAND TOTAL (ALL REGIONS):
                            </td>
                            <td className="p-3 text-center font-black text-red-400 text-lg border-x border-slate-700">
                              {agricSummaryRecords.reduce((sum, r) => sum + (parseInt(r.number_count) || 0), 0)}
                            </td>
                            <td className="p-3 font-bold text-right text-slate-400 uppercase border-r border-slate-700">
                              OVERALL RECOVERED:
                            </td>
                            <td className="p-3 text-center font-black text-emerald-400 text-lg">
                              {agricSummaryRecords.reduce((sum, r) => sum + (parseInt(r.recoveries) || 0), 0)}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      </div>
    </div>
  );
};

export default Statistics;