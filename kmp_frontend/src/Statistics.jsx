// src/components/Statistics.jsx
import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { BarChart3, PlusCircle, Edit, AlertTriangle, CheckCircle, Sprout, Save, HardDrive, X, Car, Flame } from 'lucide-react';
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
  <div className="bg-white dark:bg-slate-800 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col items-center justify-center text-center">
    <h4 className="text-[9px] font-extrabold mb-1 uppercase tracking-wider text-slate-500 dark:text-slate-400">{title}</h4>
    <div className={`text-base font-black leading-none ${colorClass}`}>{value}</div>
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
            <h3 className="font-extrabold text-white text-lg uppercase tracking-wider">
              {title} (FULL SCREEN)
            </h3>
            <button 
              onClick={closeFullScreen} 
              className="text-sm text-blue-400 hover:text-white font-bold cursor-pointer transition-colors bg-slate-800 dark:bg-slate-900 px-4 py-2 rounded-lg border border-slate-700"
            >
              Collapse ↙
            </button>
          </div>
          <div className="bg-white dark:bg-slate-900 dark:text-slate-100 flex-1 overflow-auto rounded-b-xl shadow-2xl p-4 border border-slate-300 dark:border-slate-800 custom-scrollbar">
            {children}
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col h-full relative z-10 mt-3">
          <div className="bg-slate-900 dark:bg-slate-950 px-4 py-3.5 flex justify-between items-center shrink-0 relative z-30">
            <h3 className="font-extrabold text-white text-sm uppercase tracking-wider">{title}</h3>
            <button 
              onClick={openFullScreen} 
              className="text-xs text-blue-400 hover:text-white font-bold cursor-pointer transition-colors bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg border border-slate-700 shadow-inner"
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

const Statistics = ({ currentUser, canViewGlobal: propCanViewGlobal = false, setSidebarOpen, isReadOnlyObserver }) => {
  const [operation, setOperation] = useState('new');
  const [notification, setNotification] = useState(null);

  const [statsDomain, setStatsDomain] = useState('DISRUPTIVE');
  
  const [disruptiveStats, setDisruptiveStats] = useState([]);
  const [agricStats, setAgricStats] = useState([]);
  const [accidentStats, setAccidentStats] = useState([]);
  const [fireStats, setFireStats] = useState([]); // 🟢 Fires state
  const [agricSummaryRecords, setAgricSummaryRecords] = useState([]);

  const [expandedAgricRegions, setExpandedAgricRegions] = useState({
    "KMP NORTH": true, "KMP SOUTH": false, "KMP EAST": false,
    "KMP HEADQUARTERS": false, "POLICE HEADQUARTERS": false
  });

  const toggleAgricRegion = (region) => {
    setExpandedAgricRegions(prev => ({ ...prev, [region]: !prev[region] }));
  };

  const userRoleClean = cleanStr(currentUser?.role);
  const userPosClean = cleanStr(currentUser?.position);
  const userRegClean = cleanStr(currentUser?.region);

  const isGlobalTier = ['SUPER_ADMIN', 'ADMIN', 'ASSISTANT_SUPER_ADMIN'].includes(userRoleClean) || 
    ['KMP COMMANDER', 'DEPUTY KMP COMMANDER', 'KMP ADMIN OFFICER'].includes(userPosClean) || 
    currentUser?.permissions?.view_global_roster === true;

  const isKmpSystemManager = userRoleClean === 'SYSTEM_MANAGER' && ['KMP HEADQUARTERS', 'POLICE HEADQUARTERS'].includes(userRegClean) && userPosClean.includes('KMP');
  const isKmpSpecialist = userRoleClean === 'ASSISTANT_SYSTEM_MANAGER' && ['KMP HEADQUARTERS', 'POLICE HEADQUARTERS'].includes(userRegClean) && userPosClean.includes('KMP');

  const canViewGlobalLevel = propCanViewGlobal || isGlobalTier || isKmpSystemManager || isKmpSpecialist;
  
  const isRegionalCommand = ['RPC', 'DEPUTY_RPC', 'SYSTEM_MANAGER', 'ASSISTANT_SYSTEM_MANAGER', 'REGIONAL_ADMIN', 'ASSISTANT_REGIONAL_ADMIN'].includes(userRoleClean) && !canViewGlobalLevel;
  
  const isCommandOrHR = isGlobalTier || isKmpSystemManager || isRegionalCommand || userPosClean.includes('HR');
  const canEditRecords = (isCommandOrHR || currentUser?.permissions?.upload_hr === true || currentUser?.permissions?.log_crime === true) && !isReadOnlyObserver;

  const [filterRegion, setFilterRegion] = useState(canViewGlobalLevel ? 'ALL REGIONS' : userRegClean);
  const [filterStation, setFilterStation] = useState((canViewGlobalLevel || isRegionalCommand) ? 'ALL STATIONS' : cleanStr(currentUser?.station));

  const [updateSearch, setUpdateSearch] = useState('');
  const [dateFilter, setDateFilter] = useState('ALL TIME');

  const getTodayString = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' }).split(',')[0].replace(/\//g, '-');

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

      if (statsDomain === 'DISRUPTIVE') {
          const res = await authFetch(`/api/v1/stats?${params.toString()}`);
          if (res.ok) setDisruptiveStats(await res.json());
      } else if (statsDomain === 'AGRICULTURAL') {
          const res = await authFetch(`/api/v1/agric-stats?${params.toString()}`);
          if (res.ok) setAgricStats(await res.json());
      } else if (statsDomain === 'ACCIDENTS') {
          const res = await authFetch(`/api/v1/accidents?${params.toString()}`);
          if (res.ok) setAccidentStats(await res.json());
      } else if (statsDomain === 'FIRES') { // 🟢 Fires fetch
          const res = await authFetch(`/api/v1/fires?${params.toString()}`);
          if (res.ok) setFireStats(await res.json());
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

      const res = await authFetch(`/api/v1/agric-summary?${params.toString()}`);
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
      else if (statsDomain === 'FIRES') raw = fireStats; // 🟢 Fires raw assignment

      if (dateFilter === 'ALL TIME') return raw;

      const { start, end } = getDateRangeParams(dateFilter);
      if (!start || !end) return raw;

      return raw.filter(item => {
          const itemDateStr = String(item.date || item.created_at || '').split('T')[0];
          if (!itemDateStr) return true;
          return itemDateStr >= start && itemDateStr <= end;
      });
  }, [statsDomain, disruptiveStats, agricStats, accidentStats, fireStats, dateFilter]);

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
      if (statsDomain === 'FIRES') targetEndpoint = '/api/v1/fires/export'; // 🟢 Fires export endpoint

      const params = new URLSearchParams();
      if (!canViewGlobalLevel && filterRegion && filterRegion !== 'ALL REGIONS') params.append('region', filterRegion);
      if (filterStation && filterStation !== 'ALL STATIONS') params.append('station', filterStation);
      
      const { start, end } = getDateRangeParams(dateFilter);
      if (start) params.append('start_date', start);
      if (end) params.append('end_date', end);

      const response = await authFetch(`${targetEndpoint}?${params.toString()}`);
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

    agricSummaryRecords.forEach(record => {
      let reg = (record.region || 'KMP NORTH').toUpperCase();
      const stn = (record.station || 'UNKNOWN').toUpperCase();
      
      if (!groups[reg]) groups[reg] = { stations: {} };
      if (!groups[reg].stations[stn]) groups[reg].stations[stn] = [];
      
      groups[reg].stations[stn].push(record);
    });
    return groups;
  }, [agricSummaryRecords]);

  const [agricFormData, setAgricFormData] = useState({
    region: currentUser.region || 'KMP NORTH',
    station: currentUser.station || REGIONAL_HIERARCHY[currentUser?.region]?.[0] || '',
    agric_crime_report: '',
    number_count_label: '',
    recovery_report: '',
    recoveries_label: '',
    status: 'UNDER INVESTIGATION',
    date: getTodayString()
  });

  const handleAgricInputChange = (e) => {
    const { name, value } = e.target;
    if (name === 'region') {
      setAgricFormData({ ...agricFormData, region: value.toUpperCase(), station: REGIONAL_HIERARCHY[value.toUpperCase()]?.[0] || '' });
    } else {
      setAgricFormData({ ...agricFormData, [name]: value.toUpperCase() });
    }
  };

  const handleAgricFormSubmit = async (e) => {
    e.preventDefault();
    if (!canEditRecords) return setNotification("Security Restriction: You do not have clearance to modify analytical records.");

    try {
      const payload = {
        region: agricFormData.region,
        station: agricFormData.station,
        date: agricFormData.date,
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

      setNotification(`✅ Agricultural summary successfully logged!`);
      fetchAgricSummaries();
      setAgricFormData({
        ...agricFormData,
        agric_crime_report: '',
        number_count_label: '',
        recovery_report: '',
        recoveries_label: '',
        status: 'UNDER INVESTIGATION',
      });
      setTimeout(() => setNotification(null), 4000);
    } catch (err) {
      setNotification(`❌ Error: ${err.message}`);
    }
  };
  
  const getInitialFormData = () => {
      if (statsDomain === 'ACCIDENTS') {
          return {
              sn: null, id: null, region: userRegClean, station: currentUser.station || REGIONAL_HIERARCHY[currentUser?.region]?.[0] || '',
              date: getTodayString(), nature_of_accident: '', custom_nature_of_accident: '', minor: 0, serious: 0, fatal: 0, victims: 0
          };
      }
      if (statsDomain === 'FIRES') { // 🟢 Initial form data for fires
          return {
              sn: null, id: null, region: userRegClean, station: currentUser.station || REGIONAL_HIERARCHY[currentUser?.region]?.[0] || '',
              date: getTodayString(), nature_of_fire: '', minor_outbreaks: 0, major_disasters: 0, fatal_fires: 0, victims: 0
          };
      }
      return {
          sn: null, id: null, region: userRegClean, station: currentUser.station || REGIONAL_HIERARCHY[currentUser?.region]?.[0] || '',
          date: getTodayString(), arrested: 0, given_bond: 0, cautioned: 0, pending_court: 0, taken_to_court: 0, released: 0, remanded: 0, convicted: 0
      };
  };

  const [formData, setFormData] = useState(getInitialFormData());

  useEffect(() => {
      setFormData(getInitialFormData());
      setOperation('new');
      setUpdateSearch('');
  }, [statsDomain]);

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

  const availableUpdateStats = useMemo(() => {
    return currentDomainStats.filter(s => {
      const statRegion = cleanStr(s.region);
      const statStation = cleanStr(s.station);
      
      if (!canViewGlobalLevel) {
         const belongsToRegion = statRegion === userRegClean || 
                                 (REGIONAL_HIERARCHY[userRegClean] && REGIONAL_HIERARCHY[userRegClean].some(st => isStationEquivalent(st, statStation)));
         if (!belongsToRegion) return false;
      }

      if (updateSearch) {
        const query = updateSearch.toLowerCase();
        const idStr = String(s.id || s.sn || '').toLowerCase();
        const stationStr = String(s.station || '').toLowerCase();
        const dateStr = String(s.date || '').toLowerCase();
        return idStr.includes(query) || stationStr.includes(query) || dateStr.includes(query);
      }
      return true;
    });
  }, [currentDomainStats, updateSearch, canViewGlobalLevel, userRegClean]);

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
    if (statsDomain === 'FIRES') { // 🟢 Totals calculation for fires
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
      acc.cautioned += (parseInt(curr.cautioned) || 0); acc.pending_court += (parseInt(curr.pending_court) || 0);
      acc.taken_to_court += (parseInt(curr.taken_to_court) || 0); acc.released += (parseInt(curr.released) || 0);
      acc.remanded += (parseInt(curr.remanded) || 0); acc.convicted += (parseInt(curr.convicted) || 0);
      return acc;
    }, { arrested: 0, given_bond: 0, cautioned: 0, pending_court: 0, taken_to_court: 0, released: 0, remanded: 0, convicted: 0 });
  }, [currentDomainStats, statsDomain]);

  const handleInputChange = (e) => {
    const { name, value, type } = e.target;
    if (name === 'region') setFormData({ ...formData, region: value, station: REGIONAL_HIERARCHY[value][0] });
    else setFormData({ ...formData, [name]: type === 'number' ? parseInt(value) || 0 : value.toUpperCase() });
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
    setFormData(updatedState);
  };

  const handleFormSubmit = async (e) => {  
    e.preventDefault();
    if (!canEditRecords) return setNotification("Security Restriction: You do not have clearance to modify analytical records.");
    
    let targetEndpoint = '/api/v1/stats';
    if (statsDomain === 'AGRICULTURAL') targetEndpoint = '/api/v1/agric-stats';
    if (statsDomain === 'ACCIDENTS') targetEndpoint = '/api/v1/accidents';
    if (statsDomain === 'FIRES') targetEndpoint = '/api/v1/fires'; // 🟢 Fires endpoint

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
        setNotification(`✅ Statistics recorded successfully for ${activeStation}!`);
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

  const getDomainTitle = () => {
      if (statsDomain === 'AGRICULTURAL') return '🌱 Agricultural Crimes Statistics';
      if (statsDomain === 'ACCIDENTS') return '🚓 Traffic & Accidents Statistics';
      if (statsDomain === 'FIRES') return '🔥 Fire & Rescue Incidents Statistics'; // 🟢 Fires title
      return '⚡ Disruptive OPS Statistics';
  };

  return (
    <div className="p-3 sm:p-6 max-w-[1600px] mx-auto space-y-6 relative z-10 dark:text-slate-100">
      <div className="text-center mb-8 flex flex-col items-center">
        <img src="/upf_badge.png" alt="UPF Logo" className="w-16 h-16 mb-3 object-contain contrast-200 brightness-75 drop-shadow-sm"/>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-700 dark:text-slate-100 tracking-tight">
          {getDomainTitle()}
        </h1>
        <h3 className="text-sm sm:text-lg text-blue-700 dark:text-blue-400 mt-2 font-medium">Weekly Numerical Aggregates</h3>
      </div>
      
      {complianceWarning && (
        <div className="bg-red-600 border border-red-800 shadow-lg rounded-xl p-4 flex items-center justify-center text-white animate-pulse transition-all">
          <AlertTriangle className="w-6 h-6 mr-3 shrink-0" />
          <span className="font-extrabold text-sm tracking-wide">{complianceWarning}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <>
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-200 dark:border-slate-800 overflow-hidden">
              <div className="bg-slate-900 dark:bg-slate-950 px-4 py-3.5 border-b border-gray-200 dark:border-slate-800 flex justify-between items-center relative z-30">
                <h3 className="text-white font-semibold flex items-center">
                  {statsDomain === 'ACCIDENTS' ? <Car className="w-5 h-5 mr-2 text-red-400" /> : statsDomain === 'FIRES' ? <Flame className="w-5 h-5 mr-2 text-amber-400" /> : <BarChart3 className="w-5 h-5 mr-2 text-blue-400" />} 
                  ⚙️ Log {statsDomain === 'AGRICULTURAL' ? 'Agri-Crimes' : statsDomain === 'ACCIDENTS' ? 'Accident' : statsDomain === 'FIRES' ? 'Fire' : 'Disruptive'} Stats
                </h3>
              </div>
              <div className="p-5 space-y-6 dark:bg-slate-900">
                <div className="flex space-x-2 bg-gray-100 dark:bg-slate-800 p-1 rounded-lg">
                  <button type="button" onClick={() => handleOperationToggle('new')} className={`flex-1 py-2 text-sm font-medium rounded-md transition-all cursor-pointer ${operation === 'new' ? 'bg-white dark:bg-slate-700 shadow text-blue-700 dark:text-blue-300' : 'text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200'}`}><PlusCircle className="w-4 h-4 inline mr-1" /> Register New</button>
                  <button type="button" onClick={() => handleOperationToggle('update')} className={`flex-1 py-2 text-sm font-medium rounded-md transition-all cursor-pointer ${operation === 'update' ? 'bg-white dark:bg-slate-700 shadow text-blue-700 dark:text-blue-300' : 'text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200'}`}><Edit className="w-4 h-4 inline mr-1" /> Update Existing</button>
                </div>
                {notification && <div className={`border px-4 py-3 rounded-lg flex items-center mb-4 ${notification.includes('Error') || notification.includes('❌') ? 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900 text-red-800 dark:text-red-300' : 'bg-green-50 dark:bg-green-950/40 border-green-200 dark:border-green-900 text-green-800 dark:text-green-300'}`}>{notification.includes('Error') || notification.includes('❌') ? <AlertTriangle className="w-5 h-5 mr-2 text-red-500 shrink-0" /> : <CheckCircle className="w-5 h-5 mr-2 text-green-500 shrink-0" />}<span className="text-sm font-medium">{notification}</span></div>}
                
                {operation === 'update' && (
                  <div className="bg-blue-50 dark:bg-slate-800 border border-blue-200 dark:border-slate-700 rounded-lg p-3">
                    <label className="block text-xs font-bold text-blue-800 dark:text-blue-400 mb-2">🔍 Search & Select Record to Update</label>
                    <input type="text" placeholder="Search by SN, Station, or Date..." value={updateSearch} onChange={e => setUpdateSearch(e.target.value)} className="w-full text-sm p-2 mb-2 border border-blue-200 dark:border-slate-700 rounded outline-none focus:ring-2 focus:ring-blue-400 bg-white dark:bg-slate-900 dark:text-slate-100" />
                    <div className="max-h-40 overflow-y-auto bg-white dark:bg-slate-900 border border-blue-100 dark:border-slate-800 rounded custom-scrollbar">
                      {availableUpdateStats.length === 0 ? (
                        <div className="p-3 text-xs text-gray-500 dark:text-slate-400 text-center">No records found matching your search.</div>
                      ) : (
                        availableUpdateStats.map(s => {
                          const recordKey = s.id !== undefined && s.id !== null ? s.id : s.sn;
                          const isSelected = formData.sn === recordKey || formData.id === recordKey;

                          return (
                            <div 
                              key={recordKey} 
                              onClick={() => {
                                populateUpdateForm(s);
                                setNotification(`Selected Record ID: ${recordKey} (${s.station}) for update.`);
                              }} 
                              className={`p-2.5 text-xs border-b dark:border-slate-800 cursor-pointer transition-colors ${isSelected ? 'bg-blue-700 text-white font-bold' : 'hover:bg-blue-100 dark:hover:bg-slate-800 text-gray-800 dark:text-slate-200'}`}
                            >
                              <span className={isSelected ? 'text-blue-200' : 'text-gray-400'}>ID: {recordKey}</span> | <span className={isSelected ? 'text-white' : 'font-bold text-blue-700 dark:text-blue-400'}>{s.date}</span> | {s.station}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}

                <form onSubmit={handleFormSubmit} className="space-y-5">
                  {operation === 'update' && (formData.sn || formData.id) && <div className="bg-slate-800 dark:bg-slate-950 text-white text-xs font-bold px-3 py-2 rounded">Currently Editing Record ID: {formData.id || formData.sn}</div>}
                  <div className="bg-gray-50 dark:bg-slate-800 p-4 rounded-lg border border-gray-200 dark:border-slate-700 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 mb-1">Select Region *</label>
                        <select name="region" value={formData.region} onChange={handleInputChange} disabled={!canViewGlobalLevel || operation === 'update'} required className="w-full text-sm border-gray-300 dark:border-slate-700 rounded-md shadow-sm bg-white dark:bg-slate-900 dark:text-slate-100 border p-2 focus:ring-blue-500 disabled:bg-gray-100 dark:disabled:bg-slate-950 disabled:text-gray-500">
                          {canViewGlobalLevel ? Object.keys(REGIONAL_HIERARCHY).map(reg => <option key={reg} value={reg}>{reg}</option>) : <option value={userRegClean}>{userRegClean}</option>}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 mb-1">Station / Division *</label>
                        <select name="station" value={formData.station} onChange={handleInputChange} disabled={!(canViewGlobalLevel || isRegionalCommand) || operation === 'update'} required className="w-full text-sm border-gray-300 dark:border-slate-700 rounded-md shadow-sm bg-white dark:bg-slate-900 dark:text-slate-100 border p-2 focus:ring-blue-500 disabled:bg-gray-100 dark:disabled:bg-slate-950 disabled:text-gray-500">
                          {operation === 'update' ? <option value={formData.station}>{formData.station}</option> : (canViewGlobalLevel || isRegionalCommand) ? (REGIONAL_HIERARCHY[formData.region] || []).map(stat => <option key={stat} value={stat}>{stat}</option>) : <option value={cleanStr(currentUser.station)}>{cleanStr(currentUser.station)}</option>}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 mb-1">Date of Record *</label>
                        <input type="date" name="date" value={formData.date} onChange={handleInputChange} disabled={operation === 'update'} required className="w-full text-sm border-gray-300 dark:border-slate-700 rounded-md shadow-sm border bg-white dark:bg-slate-900 dark:text-slate-100 p-2 disabled:bg-gray-100 dark:disabled:bg-slate-950 disabled:text-gray-500" />
                      </div>
                    </div>
                  </div> 
                  
                  {statsDomain === 'ACCIDENTS' ? (
                      <div className="bg-red-50 dark:bg-slate-800 p-4 rounded-lg border border-red-200 dark:border-slate-700">
                        <h4 className="text-sm font-bold text-red-900 dark:text-red-300 border-b border-red-200 dark:border-slate-700 pb-2 mb-4 flex items-center">📊 Traffic & Accidents Aggregates</h4>
                        
                        <div className="mb-4">
                            <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 mb-1">Nature of Accident *</label>
                            <select 
                              name="nature_of_accident" 
                              value={formData.nature_of_accident} 
                              onChange={handleInputChange} 
                              required 
                              className="w-full text-sm border border-gray-300 dark:border-slate-700 rounded-md shadow-sm bg-white dark:bg-slate-900 dark:text-slate-100 p-2 uppercase cursor-pointer"
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
                                  className="mt-2 w-full text-sm border border-red-300 dark:border-red-800 rounded-md shadow-sm bg-red-50 dark:bg-slate-900 dark:text-slate-100 p-2 uppercase focus:border-red-500 outline-none" 
                                />
                            )}
                        </div>

                        <div className="grid grid-cols-4 gap-3">
                          <div className="bg-white dark:bg-slate-900 p-2 rounded border border-gray-200 dark:border-slate-700 shadow-sm"><label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Minor</label><input type="number" name="minor" min="0" value={formData.minor} onChange={handleInputChange} className="w-full text-lg font-bold text-blue-600 dark:text-blue-400 border-b-2 border-transparent focus:border-blue-500 outline-none p-1 bg-transparent" /></div>
                          <div className="bg-white dark:bg-slate-900 p-2 rounded border border-gray-200 dark:border-slate-700 shadow-sm"><label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Serious</label><input type="number" name="serious" min="0" value={formData.serious} onChange={handleInputChange} className="w-full text-lg font-bold text-orange-600 dark:text-orange-400 border-b-2 border-transparent focus:border-orange-500 outline-none p-1 bg-transparent" /></div>
                          <div className="bg-white dark:bg-slate-900 p-2 rounded border border-gray-200 dark:border-slate-700 shadow-sm"><label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Fatal</label><input type="number" name="fatal" min="0" value={formData.fatal} onChange={handleInputChange} className="w-full text-lg font-bold text-red-600 dark:text-red-400 border-b-2 border-transparent focus:border-red-500 outline-none p-1 bg-transparent" /></div>
                          <div className="bg-white dark:bg-slate-900 p-2 rounded border border-gray-200 dark:border-slate-700 shadow-sm ring-1 ring-purple-500/20"><label className="block text-[10px] font-extrabold text-purple-600 dark:text-purple-400 uppercase tracking-wider mb-1">Victims (Count)</label><input type="number" name="victims" min="0" value={formData.victims} onChange={handleInputChange} className="w-full text-lg font-black text-purple-600 dark:text-purple-400 border-b-2 border-transparent focus:border-purple-500 outline-none p-1 bg-transparent" /></div>
                        </div>
                      </div>
                  ) : statsDomain === 'FIRES' ? (
                      <div className="bg-amber-50 dark:bg-slate-800 p-4 rounded-lg border border-amber-200 dark:border-slate-700">
                        <h4 className="text-sm font-bold text-amber-900 dark:text-amber-300 border-b border-amber-200 dark:border-slate-700 pb-2 mb-4 flex items-center">🔥 Fire & Rescue Aggregates</h4>
                        
                        <div className="mb-4">
                            <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 mb-1">Nature of Fire *</label>
                            <select 
                              name="nature_of_fire" 
                              value={formData.nature_of_fire || ''} 
                              onChange={handleInputChange} 
                              required 
                              className="w-full text-sm border border-gray-300 dark:border-slate-700 rounded-md shadow-sm bg-white dark:bg-slate-900 dark:text-slate-100 p-2 uppercase cursor-pointer"
                            >
                              <option value="" disabled>-- Select Nature of Fire --</option>
                              {COMMON_FIRES.map(fire => (
                                  <option key={fire} value={fire}>{fire}</option>
                              ))}
                            </select>
                        </div>

                        <div className="grid grid-cols-4 gap-3">
                          <div className="bg-white dark:bg-slate-900 p-2 rounded border border-gray-200 dark:border-slate-700 shadow-sm"><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Minor</label><input type="number" name="minor_outbreaks" min="0" value={formData.minor_outbreaks || 0} onChange={handleInputChange} className="w-full text-lg font-bold text-amber-600 outline-none p-1 bg-transparent" /></div>
                          <div className="bg-white dark:bg-slate-900 p-2 rounded border border-gray-200 dark:border-slate-700 shadow-sm"><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Major</label><input type="number" name="major_disasters" min="0" value={formData.major_disasters || 0} onChange={handleInputChange} className="w-full text-lg font-bold text-orange-600 outline-none p-1 bg-transparent" /></div>
                          <div className="bg-white dark:bg-slate-900 p-2 rounded border border-gray-200 dark:border-slate-700 shadow-sm"><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Fatal</label><input type="number" name="fatal_fires" min="0" value={formData.fatal_fires || 0} onChange={handleInputChange} className="w-full text-lg font-bold text-red-600 outline-none p-1 bg-transparent" /></div>
                          <div className="bg-white dark:bg-slate-900 p-2 rounded border border-gray-200 dark:border-slate-700 shadow-sm ring-1 ring-amber-500/20"><label className="block text-[10px] font-extrabold text-amber-600 uppercase mb-1">Victims</label><input type="number" name="victims" min="0" value={formData.victims || 0} onChange={handleInputChange} className="w-full text-lg font-black text-amber-700 outline-none p-1 bg-transparent" /></div>
                        </div>
                      </div>
                  ) : (
                      <div className="bg-blue-50 dark:bg-slate-800 p-4 rounded-lg border border-blue-200 dark:border-slate-700">
                        <h4 className="text-sm font-bold text-blue-900 dark:text-blue-300 border-b border-blue-200 dark:border-slate-700 pb-2 mb-4 flex items-center">📊 Enter Weekly Metric Aggregates (8 Fields)</h4>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="bg-white dark:bg-slate-900 p-2 rounded border border-gray-200 dark:border-slate-700 shadow-sm"><label className="block text-xs font-bold text-gray-600 dark:text-slate-400 uppercase tracking-wider mb-1">Suspects Arrested</label><input type="number" name="arrested" min="0" value={formData.arrested} onChange={handleInputChange} className="w-full text-lg font-bold text-blue-700 dark:text-blue-400 border-b-2 border-transparent focus:border-blue-500 outline-none p-1 bg-transparent" /></div>
                          <div className="bg-white dark:bg-slate-900 p-2 rounded border border-gray-200 dark:border-slate-700 shadow-sm"><label className="block text-xs font-bold text-gray-600 dark:text-slate-400 uppercase tracking-wider mb-1">Given Bond</label><input type="number" name="given_bond" min="0" value={formData.given_bond} onChange={handleInputChange} className="w-full text-lg font-bold text-blue-700 dark:text-blue-400 border-b-2 border-transparent focus:border-blue-500 outline-none p-1 bg-transparent" /></div>
                          <div className="bg-white dark:bg-slate-900 p-2 rounded border border-gray-200 dark:border-slate-700 shadow-sm"><label className="block text-xs font-bold text-gray-600 dark:text-slate-400 uppercase tracking-wider mb-1">Cautioned</label><input type="number" name="cautioned" min="0" value={formData.cautioned} onChange={handleInputChange} className="w-full text-lg font-bold text-blue-700 dark:text-blue-400 border-b-2 border-transparent focus:border-blue-500 outline-none p-1 bg-transparent" /></div>
                          <div className="bg-white dark:bg-slate-900 p-2 rounded border border-gray-200 dark:border-slate-700 shadow-sm"><label className="block text-xs font-bold text-gray-600 dark:text-slate-400 uppercase tracking-wider mb-1">Pending Court</label><input type="number" name="pending_court" min="0" value={formData.pending_court} onChange={handleInputChange} className="w-full text-lg font-bold text-yellow-600 dark:text-yellow-400 border-b-2 border-transparent focus:border-yellow-500 outline-none p-1 bg-transparent" /></div>
                          <div className="bg-white dark:bg-slate-900 p-2 rounded border border-gray-200 dark:border-slate-700 shadow-sm"><label className="block text-xs font-bold text-gray-600 dark:text-slate-400 uppercase tracking-wider mb-1">Taken to Court</label><input type="number" name="taken_to_court" min="0" value={formData.taken_to_court} onChange={handleInputChange} className="w-full text-lg font-bold text-blue-600 dark:text-blue-400 border-b-2 border-transparent focus:border-blue-500 outline-none p-1 bg-transparent" /></div>
                          <div className="bg-white dark:bg-slate-900 p-2 rounded border border-gray-200 dark:border-slate-700 shadow-sm"><label className="block text-xs font-bold text-gray-600 dark:text-slate-400 uppercase tracking-wider mb-1">Released by Court</label><input type="number" name="released" min="0" value={formData.released} onChange={handleInputChange} className="w-full text-lg font-bold text-green-600 dark:text-green-400 border-b-2 border-transparent focus:border-green-500 outline-none p-1 bg-transparent" /></div>
                          <div className="bg-white dark:bg-slate-900 p-2 rounded border border-gray-200 dark:border-slate-700 shadow-sm"><label className="block text-xs font-bold text-gray-600 dark:text-slate-400 uppercase tracking-wider mb-1">Suspects Remanded</label><input type="number" name="remanded" min="0" value={formData.remanded} onChange={handleInputChange} className="w-full text-lg font-bold text-red-600 dark:text-red-400 border-b-2 border-transparent focus:border-red-500 outline-none p-1 bg-transparent" /></div>
                          <div className="bg-white dark:bg-slate-900 p-2 rounded border border-gray-200 dark:border-slate-700 shadow-sm"><label className="block text-xs font-bold text-gray-600 dark:text-slate-400 uppercase tracking-wider mb-1">Suspects Convicted</label><input type="number" name="convicted" min="0" value={formData.convicted} onChange={handleInputChange} className="w-full text-lg font-bold text-purple-600 dark:text-purple-400 border-b-2 border-transparent focus:border-purple-500 outline-none p-1 bg-transparent" /></div>
                        </div>
                      </div>
                  )}
                  
                  <button type="submit" className="w-full bg-blue-700 hover:bg-blue-800 transition-colors text-white mt-4 py-4 font-bold rounded-lg shadow text-lg flex justify-center items-center cursor-pointer">
                    {operation === 'new' ? '💾 Submit Data Entry' : '💾 Save Updated Figures'}
                  </button>
                </form>
              </div>
            </div>
          </div>
          
          <div className="lg:col-span-8 space-y-4">
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
                  className="border-2 border-blue-500 dark:border-blue-600 text-blue-700 dark:text-blue-400 font-bold rounded-lg px-3 py-2 text-sm shadow-sm bg-white dark:bg-slate-800 outline-none cursor-pointer"
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
              <h4 className="text-sm font-bold text-slate-400 dark:text-slate-400 mb-3 uppercase tracking-wider">📋 Area Metrics ({filterRegion} - {dateFilter})</h4>
              
              {statsDomain === 'ACCIDENTS' ? (
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-4">
                    <MetricCard title="Minor Accidents" value={totals.minor} colorClass="text-blue-600 dark:text-blue-400" />
                    <MetricCard title="Serious Accidents" value={totals.serious} colorClass="text-orange-600 dark:text-orange-400" />
                    <MetricCard title="Fatal Accidents" value={totals.fatal} colorClass="text-red-600 dark:text-red-400" />
                    <MetricCard title="Victims (Count)" value={totals.victims} colorClass="text-purple-600 dark:text-purple-400" />
                    <MetricCard title="Total Instances" value={totals.total} colorClass="text-slate-800 dark:text-slate-100" />
                  </div>
              ) : statsDomain === 'FIRES' ? (
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-4">
                    <MetricCard title="Minor Outbreaks" value={totals.minor_outbreaks} colorClass="text-amber-600 dark:text-amber-400" />
                    <MetricCard title="Major Disasters" value={totals.major_disasters} colorClass="text-orange-600 dark:text-orange-400" />
                    <MetricCard title="Fatal Fires" value={totals.fatal_fires} colorClass="text-red-600 dark:text-red-400" />
                    <MetricCard title="Victims (Count)" value={totals.victims} colorClass="text-amber-700 dark:text-amber-300" />
                    <MetricCard title="Total Instances" value={totals.total} colorClass="text-slate-800 dark:text-slate-100" />
                  </div>
              ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 mt-4">
                    <MetricCard title="Arrested" value={totals.arrested} colorClass="text-blue-700 dark:text-blue-400" />
                    <MetricCard title="Given Bond" value={totals.given_bond} colorClass="text-indigo-600 dark:text-indigo-400" />
                    <MetricCard title="Cautioned" value={totals.cautioned} colorClass="text-gray-600 dark:text-slate-400" />
                    <MetricCard title="Pending Court" value={totals.pending_court} colorClass="text-yellow-600 dark:text-yellow-400" />
                    <MetricCard title="To Court" value={totals.taken_to_court} colorClass="text-blue-500 dark:text-blue-400" />
                    <MetricCard title="Released" value={totals.released} colorClass="text-green-600 dark:text-green-400" />
                    <MetricCard title="Remanded" value={totals.remanded} colorClass="text-red-600 dark:text-red-400" />
                    <MetricCard title="Convicted" value={totals.convicted} colorClass="text-purple-600 dark:text-purple-400" />
                  </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                <select value={filterRegion} onChange={(e) => { setFilterRegion(e.target.value); setFilterStation('ALL STATIONS'); }} disabled={!canViewGlobalLevel} className="border dark:border-slate-700 rounded-lg px-3 py-2 text-sm shadow-sm bg-white dark:bg-slate-800 dark:text-slate-100 disabled:bg-gray-100 dark:disabled:bg-slate-900 disabled:text-gray-500 w-full sm:w-auto outline-none focus:border-blue-500 cursor-pointer">
                  {canViewGlobalLevel ? (
                    <><option value="ALL REGIONS">ALL REGIONS</option>{Object.keys(REGIONAL_HIERARCHY).map(reg => <option key={reg} value={reg}>{reg}</option>)}</>
                  ) : <option value={userRegClean}>{userRegClean}</option>}
                </select>
                <select value={filterStation} onChange={(e) => setFilterStation(e.target.value)} disabled={!(canViewGlobalLevel || isRegionalCommand)} className="border dark:border-slate-700 rounded-lg px-3 py-2 text-sm shadow-sm bg-white dark:bg-slate-800 dark:text-slate-100 disabled:bg-gray-100 dark:disabled:bg-slate-900 disabled:text-gray-500 w-full sm:w-auto outline-none focus:border-blue-500 cursor-pointer">
                  {(canViewGlobalLevel || isRegionalCommand) ? (
                    <><option value="ALL STATIONS">ALL STATIONS</option>{filterRegion !== 'ALL REGIONS' && REGIONAL_HIERARCHY[filterRegion] ? REGIONAL_HIERARCHY[filterRegion].map(stat => <option key={stat} value={stat}>{stat}</option>) : null}</>
                  ) : <option value={cleanStr(currentUser.station)}>{cleanStr(currentUser.station)}</option>}
                </select>
              </div>

              <div className="inline-flex bg-slate-200 dark:bg-slate-800 p-1 rounded-xl border dark:border-slate-700 shadow-inner shrink-0 gap-1 flex-wrap">
                <button type="button" onClick={() => setStatsDomain('DISRUPTIVE')} className={`px-3 py-1.5 rounded-lg font-bold text-xs transition cursor-pointer ${statsDomain === 'DISRUPTIVE' ? 'bg-slate-900 dark:bg-slate-950 text-white shadow' : 'text-slate-700 dark:text-slate-300'}`}>
                  ⚡ Disruptive OPS
                </button>
                <button type="button" onClick={() => setStatsDomain('AGRICULTURAL')} className={`px-3 py-1.5 rounded-lg font-bold text-xs transition cursor-pointer ${statsDomain === 'AGRICULTURAL' ? 'bg-emerald-700 text-white shadow' : 'text-slate-700 dark:text-slate-300'}`}>
                  🌱 Agric Crimes
                </button>
                <button type="button" onClick={() => setStatsDomain('ACCIDENTS')} className={`px-3 py-1.5 rounded-lg font-bold text-xs transition cursor-pointer ${statsDomain === 'ACCIDENTS' ? 'bg-red-700 text-white shadow' : 'text-slate-700 dark:text-slate-300'}`}>
                  🚓 Accidents
                </button>
                <button type="button" onClick={() => setStatsDomain('FIRES')} className={`px-3 py-1.5 rounded-lg font-bold text-xs transition cursor-pointer ${statsDomain === 'FIRES' ? 'bg-amber-700 text-white shadow' : 'text-slate-700 dark:text-slate-300'}`}>
                  🔥 Fires
                </button>
              </div>
            </div>

            <ExpandableTableCard title={`Weekly Metrics Breakdown Ledger (${statsDomain === 'AGRICULTURAL' ? 'Agricultural Crimes' : statsDomain === 'ACCIDENTS' ? 'Accidents' : statsDomain === 'FIRES' ? 'Fires & Rescue' : 'Disruptive OPS'})`} onToggle={(expanded) => { if (setSidebarOpen) setSidebarOpen(!expanded); }}>
              <div className="overflow-x-auto w-full dark:bg-slate-900">
                
                {statsDomain === 'ACCIDENTS' ? (
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-800">
                    <thead className="bg-red-50 dark:bg-slate-950 sticky top-0">
                      <tr>
                        <th rowSpan="2" className="px-3 py-3 text-left text-xs font-black text-red-900 dark:text-red-300 uppercase tracking-wider border-b border-red-200 dark:border-slate-700 align-middle">S/N</th>
                        <th rowSpan="2" className="px-3 py-3 text-left text-xs font-black text-red-900 dark:text-red-300 uppercase tracking-wider border-b border-red-200 dark:border-slate-700 align-middle">Date</th>
                        <th rowSpan="2" className="px-3 py-3 text-left text-xs font-black text-red-900 dark:text-red-300 uppercase tracking-wider border-b border-red-200 dark:border-slate-700 align-middle">Division/Station</th>
                        
                        <th rowSpan="2" className="px-3 py-3 text-left text-xs font-black text-red-900 dark:text-red-300 uppercase tracking-wider border-b border-red-200 dark:border-slate-700 align-middle">Accident Type</th>
                        
                        <th colSpan="4" className="px-3 py-2 text-center text-xs font-black text-white bg-red-800 dark:bg-red-900 uppercase tracking-wider border-b border-red-200 dark:border-slate-700">Severity Breakdown & Casualties</th>
                        <th rowSpan="2" className="px-3 py-3 text-center text-xs font-black text-red-900 dark:text-red-300 uppercase tracking-wider border-b border-red-200 dark:border-slate-700 align-middle">TOTAL</th>
                        <th rowSpan="2" className="px-3 py-3 text-left text-xs font-black text-red-900 dark:text-red-300 uppercase tracking-wider border-b border-red-200 dark:border-slate-700 align-middle">Created By</th>
                        <th rowSpan="2" className="px-3 py-3 text-left text-xs font-black text-red-900 dark:text-red-300 uppercase tracking-wider border-b border-red-200 dark:border-slate-700 align-middle">Date Created</th>
                      </tr>
                      <tr>
                        <th className="px-2 py-2 text-center text-[10px] font-extrabold text-blue-800 dark:text-blue-300 bg-red-100 dark:bg-slate-900 border-b border-red-200 dark:border-slate-700 uppercase">Minor</th>
                        <th className="px-2 py-2 text-center text-[10px] font-extrabold text-orange-800 dark:text-orange-300 bg-red-100 dark:bg-slate-900 border-b border-red-200 dark:border-slate-700 uppercase">Serious</th>
                        <th className="px-2 py-2 text-center text-[10px] font-extrabold text-red-800 dark:text-red-400 bg-red-100 dark:bg-slate-900 border-b border-red-200 dark:border-slate-700 uppercase">Fatal</th>
                        <th className="px-2 py-2 text-center text-[10px] font-black text-purple-800 dark:text-purple-400 bg-purple-50 dark:bg-slate-900 border-b border-purple-200 dark:border-slate-700 uppercase">Victims</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-slate-900 divide-y divide-gray-200 dark:divide-slate-800">
                      {currentDomainStats.map((stat) => (
                        <tr key={stat.id || stat.sn} className="even:bg-slate-50 dark:even:bg-slate-800/40 hover:bg-red-50 dark:hover:bg-slate-800 transition-colors cursor-pointer" onClick={() => { if(operation === 'update') populateUpdateForm(stat); }}>
                          <td className="px-3 py-3 whitespace-nowrap text-xs font-bold text-gray-900 dark:text-slate-100 border-r border-slate-100 dark:border-slate-800">{stat.id || stat.sn}</td>
                          <td className="px-3 py-3 whitespace-nowrap text-xs text-gray-500 dark:text-slate-400 border-r border-slate-100 dark:border-slate-800">{stat.date}</td>
                          <td className="px-3 py-3 whitespace-nowrap text-xs font-bold text-red-800 dark:text-red-400 border-r border-slate-100 dark:border-slate-800">{stat.station}</td>
                          
                          <td className="px-3 py-3 whitespace-nowrap text-xs font-bold text-slate-700 dark:text-slate-300 border-r border-slate-100 dark:border-slate-800">{stat.nature_of_accident}</td>
                          
                          <td className="px-2 py-3 whitespace-nowrap text-xs text-center font-bold text-blue-600 dark:text-blue-400 border-r border-slate-100 dark:border-slate-800">{stat.minor}</td>
                          <td className="px-2 py-3 whitespace-nowrap text-xs text-center font-bold text-orange-600 dark:text-orange-400 border-r border-slate-100 dark:border-slate-800">{stat.serious}</td>
                          <td className="px-2 py-3 whitespace-nowrap text-xs text-center font-black text-red-600 dark:text-red-500 border-r border-slate-100 dark:border-slate-800">{stat.fatal}</td>
                          <td className="px-2 py-3 whitespace-nowrap text-xs text-center font-black text-purple-600 dark:text-purple-400 border-r border-slate-100 dark:border-slate-800">{stat.victims}</td>
                          
                          <td className="px-3 py-3 whitespace-nowrap text-sm text-center font-black text-slate-800 dark:text-slate-100 border-r border-slate-100 dark:border-slate-800">{stat.total}</td>
                          <td className="px-3 py-3 whitespace-nowrap text-[10px] font-semibold text-gray-500 dark:text-slate-400 border-r border-slate-100 dark:border-slate-800">{stat.entered_by || stat.last_updated_by}</td>
                          <td className="px-3 py-3 whitespace-nowrap text-[10px] font-mono text-gray-400 dark:text-slate-500">{stat.created_at ? stat.created_at.split('T')[0] : ''}</td>
                        </tr>
                      ))}
                      {currentDomainStats.length > 0 && (
                        <tr className="bg-red-900 text-white font-black">
                          <td colSpan="4" className="px-3 py-3 text-right text-xs uppercase tracking-wider">Total Aggregates</td>
                          <td className="px-2 py-3 text-center text-xs">{totals.minor}</td>
                          <td className="px-2 py-3 text-center text-xs">{totals.serious}</td>
                          <td className="px-2 py-3 text-center text-xs">{totals.fatal}</td>
                          <td className="px-2 py-3 text-center text-xs text-purple-200">{totals.victims}</td>
                          <td className="px-3 py-3 text-center text-sm bg-black">{totals.total}</td>
                          <td colSpan="2" className="px-3 py-3"></td>
                        </tr>
                      )}
                      {currentDomainStats.length === 0 && <tr><td colSpan="11" className="text-center py-6 text-gray-500 dark:text-slate-400 font-medium">No accident statistics logged for this jurisdiction.</td></tr>}
                    </tbody>
                  </table>
                ) : statsDomain === 'FIRES' ? (
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-800">
                    <thead className="bg-amber-50 dark:bg-slate-950 sticky top-0">
                      <tr>
                        <th rowSpan="2" className="px-3 py-3 text-left text-xs font-black text-amber-900 dark:text-amber-300 uppercase tracking-wider border-b border-amber-200 dark:border-slate-700 align-middle">S/N</th>
                        <th rowSpan="2" className="px-3 py-3 text-left text-xs font-black text-amber-900 dark:text-amber-300 uppercase tracking-wider border-b border-amber-200 dark:border-slate-700 align-middle">Date</th>
                        <th rowSpan="2" className="px-3 py-3 text-left text-xs font-black text-amber-900 dark:text-amber-300 uppercase tracking-wider border-b border-amber-200 dark:border-slate-700 align-middle">Division/Station</th>
                        <th rowSpan="2" className="px-3 py-3 text-left text-xs font-black text-amber-900 dark:text-amber-300 uppercase tracking-wider border-b border-amber-200 dark:border-slate-700 align-middle">Nature of Fire</th>
                        <th colSpan="4" className="px-3 py-2 text-center text-xs font-black text-white bg-amber-800 dark:bg-amber-900 uppercase tracking-wider border-b border-amber-200 dark:border-slate-700">Fire Outbreaks & Rescue Casualties</th>
                        <th rowSpan="2" className="px-3 py-3 text-center text-xs font-black text-amber-900 dark:text-amber-300 uppercase tracking-wider border-b border-amber-200 dark:border-slate-700 align-middle">TOTAL</th>
                        <th rowSpan="2" className="px-3 py-3 text-left text-xs font-black text-amber-900 dark:text-amber-300 uppercase tracking-wider border-b border-amber-200 dark:border-slate-700 align-middle">Created By</th>
                        <th rowSpan="2" className="px-3 py-3 text-left text-xs font-black text-amber-900 dark:text-amber-300 uppercase tracking-wider border-b border-amber-200 dark:border-slate-700 align-middle">Date Created</th>
                      </tr>
                      <tr>
                        <th className="px-2 py-2 text-center text-[10px] font-extrabold text-amber-800 bg-amber-100 dark:bg-slate-900 border-b border-amber-200 uppercase">Minor</th>
                        <th className="px-2 py-2 text-center text-[10px] font-extrabold text-orange-800 bg-amber-100 dark:bg-slate-900 border-b border-amber-200 uppercase">Major</th>
                        <th className="px-2 py-2 text-center text-[10px] font-extrabold text-red-800 bg-amber-100 dark:bg-slate-900 border-b border-amber-200 uppercase">Fatal</th>
                        <th className="px-2 py-2 text-center text-[10px] font-black text-amber-900 bg-amber-100 dark:bg-slate-900 border-b border-amber-200 uppercase">Victims</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-slate-900 divide-y divide-gray-200 dark:divide-slate-800">
                      {currentDomainStats.map((stat) => (
                        <tr key={stat.id || stat.sn} className="even:bg-slate-50 dark:even:bg-slate-800/40 hover:bg-amber-50 dark:hover:bg-slate-800 transition-colors cursor-pointer" onClick={() => { if(operation === 'update') populateUpdateForm(stat); }}>
                          <td className="px-3 py-3 whitespace-nowrap text-xs font-bold text-gray-900 dark:text-slate-100 border-r border-slate-100 dark:border-slate-800">{stat.id || stat.sn}</td>
                          <td className="px-3 py-3 whitespace-nowrap text-xs text-gray-500 dark:text-slate-400 border-r border-slate-100 dark:border-slate-800">{stat.date}</td>
                          <td className="px-3 py-3 whitespace-nowrap text-xs font-bold text-amber-800 dark:text-amber-400 border-r border-slate-100 dark:border-slate-800">{stat.station}</td>
                          <td className="px-3 py-3 whitespace-nowrap text-xs font-bold text-slate-700 dark:text-slate-300 border-r border-slate-100 dark:border-slate-800">{stat.nature_of_fire}</td>
                          <td className="px-2 py-3 whitespace-nowrap text-xs text-center font-bold text-amber-600 border-r border-slate-100 dark:border-slate-800">{stat.minor_outbreaks}</td>
                          <td className="px-2 py-3 whitespace-nowrap text-xs text-center font-bold text-orange-600 border-r border-slate-100 dark:border-slate-800">{stat.major_disasters}</td>
                          <td className="px-2 py-3 whitespace-nowrap text-xs text-center font-black text-red-600 border-r border-slate-100 dark:border-slate-800">{stat.fatal_fires}</td>
                          <td className="px-2 py-3 whitespace-nowrap text-xs text-center font-black text-amber-700 border-r border-slate-100 dark:border-slate-800">{stat.victims}</td>
                          <td className="px-3 py-3 whitespace-nowrap text-sm text-center font-black text-slate-800 dark:text-slate-100 border-r border-slate-100 dark:border-slate-800">{stat.total}</td>
                          <td className="px-3 py-3 whitespace-nowrap text-[10px] font-semibold text-gray-500 border-r border-slate-100 dark:border-slate-800">{stat.entered_by || stat.last_updated_by}</td>
                          <td className="px-3 py-3 whitespace-nowrap text-[10px] font-mono text-gray-400">{stat.created_at ? stat.created_at.split('T')[0] : ''}</td>
                        </tr>
                      ))}
                      {currentDomainStats.length > 0 && (
                        <tr className="bg-amber-900 text-white font-black">
                          <td colSpan="4" className="px-3 py-3 text-right text-xs uppercase tracking-wider">Total Aggregates</td>
                          <td className="px-2 py-3 text-center text-xs">{totals.minor_outbreaks}</td>
                          <td className="px-2 py-3 text-center text-xs">{totals.major_disasters}</td>
                          <td className="px-2 py-3 text-center text-xs">{totals.fatal_fires}</td>
                          <td className="px-2 py-3 text-center text-xs text-amber-200">{totals.victims}</td>
                          <td className="px-3 py-3 text-center text-sm bg-black">{totals.total}</td>
                          <td colSpan="2" className="px-3 py-3"></td>
                        </tr>
                      )}
                      {currentDomainStats.length === 0 && <tr><td colSpan="11" className="text-center py-6 text-gray-500 dark:text-slate-400 font-medium">No fire statistics logged for this jurisdiction.</td></tr>}
                    </tbody>
                  </table>
                ) : (
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-800">
                    <thead className="bg-gray-50 dark:bg-slate-950 sticky top-0">
                      <tr>
                        <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider leading-tight">S/N</th>
                        <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider leading-tight">Date</th>
                        <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider leading-tight">Division</th>
                        <th className="px-2 py-3 text-center text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider leading-tight">Suspects<br/>arrested</th>
                        <th className="px-2 py-3 text-center text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider leading-tight">Given<br/>Bond</th>
                        <th className="px-2 py-3 text-center text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider leading-tight">Cautioned</th>
                        <th className="px-2 py-3 text-center text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider leading-tight">Pending<br/>Court</th>
                        <th className="px-2 py-3 text-center text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider leading-tight">Taken to<br/>Court</th>
                        <th className="px-2 py-3 text-center text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider leading-tight">Released<br/>by court</th>
                        <th className="px-2 py-3 text-center text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider leading-tight">Suspects<br/>remanded</th>
                        <th className="px-2 py-3 text-center text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider leading-tight">Suspects<br/>convicted</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-slate-900 divide-y divide-gray-200 dark:divide-slate-800">
                      {currentDomainStats.map((stat) => (
                        <tr key={stat.id || stat.sn} className="even:bg-slate-50 dark:even:bg-slate-800/40 hover:bg-blue-50 dark:hover:bg-slate-800 transition-colors cursor-pointer" onClick={() => { if(operation === 'update') populateUpdateForm(stat); }}>
                          <td className="px-3 py-3 whitespace-nowrap text-xs font-bold text-gray-900 dark:text-slate-100">{stat.id || stat.sn}</td>
                          <td className="px-3 py-3 whitespace-nowrap text-xs text-gray-500 dark:text-slate-400">{stat.date}</td>
                          <td className="px-3 py-3 whitespace-nowrap text-xs font-medium text-blue-700 dark:text-blue-400">{stat.station}</td>
                          <td className="px-2 py-3 whitespace-nowrap text-xs text-center font-bold text-gray-700 dark:text-slate-300">{stat.arrested}</td>
                          <td className="px-2 py-3 whitespace-nowrap text-xs text-center font-bold text-gray-700 dark:text-slate-300">{stat.given_bond}</td>
                          <td className="px-2 py-3 whitespace-nowrap text-xs text-center font-bold text-gray-700 dark:text-slate-300">{stat.cautioned}</td>
                          <td className="px-2 py-3 whitespace-nowrap text-xs text-center font-bold text-yellow-600 dark:text-yellow-400">{stat.pending_court}</td>
                          <td className="px-2 py-3 whitespace-nowrap text-xs text-center font-bold text-blue-600 dark:text-blue-400">{stat.taken_to_court}</td>
                          <td className="px-2 py-3 whitespace-nowrap text-xs text-center font-bold text-green-600 dark:text-green-400">{stat.released}</td>
                          <td className="px-2 py-3 whitespace-nowrap text-xs text-center font-bold text-red-600 dark:text-red-400">{stat.remanded}</td>
                          <td className="px-2 py-3 whitespace-nowrap text-xs text-center font-bold text-purple-600 dark:text-purple-400">{stat.convicted}</td>
                        </tr>
                      ))}
                      {currentDomainStats.length > 0 && (
                        <tr className="bg-slate-200 dark:bg-slate-800 font-bold text-gray-900 dark:text-slate-100 border-t-2 border-slate-400 dark:border-slate-700">
                          <td colSpan="3" className="px-3 py-3 text-right text-xs uppercase tracking-wider">Total</td>
                          <td className="px-2 py-3 text-center text-xs text-blue-800 dark:text-blue-300">{totals.arrested}</td>
                          <td className="px-2 py-3 text-center text-xs text-blue-800 dark:text-blue-300">{totals.given_bond}</td>
                          <td className="px-2 py-3 text-center text-xs text-blue-800 dark:text-blue-300">{totals.cautioned}</td>
                          <td className="px-2 py-3 text-center text-xs text-blue-800 dark:text-blue-300">{totals.pending_court}</td>
                          <td className="px-2 py-3 text-center text-xs text-blue-800 dark:text-blue-300">{totals.taken_to_court}</td>
                          <td className="px-2 py-3 text-center text-xs text-blue-800 dark:text-blue-300">{totals.released}</td>
                          <td className="px-2 py-3 text-center text-xs text-blue-800 dark:text-blue-300">{totals.remanded}</td>
                          <td className="px-2 py-3 text-center text-xs text-blue-800 dark:text-blue-300">{totals.convicted}</td>
                        </tr>
                      )}
                      {currentDomainStats.length === 0 && <tr><td colSpan="11" className="text-center py-6 text-gray-500 dark:text-slate-400 font-medium">No statistics logged for this jurisdiction.</td></tr>}
                    </tbody>
                  </table>
                )}
              </div>
            </ExpandableTableCard>

            {statsDomain === 'AGRICULTURAL' && (
              <div className="mt-8 space-y-6 animate-in fade-in duration-200">
                <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-emerald-200 dark:border-slate-800 overflow-hidden">
                  <div className="bg-emerald-700 dark:bg-emerald-900 px-4 py-3 text-white font-extrabold text-xs uppercase tracking-wider flex items-center">
                    🌱 Log Station Agricultural Crime & Produce Entry
                  </div>
                  <form onSubmit={handleAgricFormSubmit} className="p-5 grid grid-cols-1 sm:grid-cols-6 gap-4 dark:bg-slate-900">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">Region *</label>
                      <select name="region" value={agricFormData.region} onChange={handleAgricInputChange} disabled={!canViewGlobalLevel} className="w-full text-xs border dark:border-slate-700 p-2 rounded bg-white dark:bg-slate-800 dark:text-slate-100 font-bold outline-none focus:border-emerald-500 disabled:bg-gray-100 disabled:text-gray-500">
                        {canViewGlobalLevel ? Object.keys(REGIONAL_HIERARCHY).map(reg => (
                          <option key={reg} value={reg}>{reg}</option>
                        )) : <option value={userRegClean}>{userRegClean}</option>}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">Station / Division *</label>
                      <select name="station" value={agricFormData.station} onChange={handleAgricInputChange} disabled={!(canViewGlobalLevel || isRegionalCommand)} className="w-full text-xs border dark:border-slate-700 p-2 rounded bg-white dark:bg-slate-800 dark:text-slate-100 font-bold outline-none focus:border-emerald-500 disabled:bg-gray-100 disabled:text-gray-500">
                        {(canViewGlobalLevel || isRegionalCommand) ? (REGIONAL_HIERARCHY[agricFormData.region] || [currentUser.station]).map(stn => (
                          <option key={stn} value={stn}>{stn}</option>
                        )) : <option value={cleanStr(currentUser.station)}>{cleanStr(currentUser.station)}</option>}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">Item (e.g. CATTLE) *</label>
                      <input type="text" name="agric_crime_report" value={agricFormData.agric_crime_report} onChange={handleAgricInputChange} required placeholder="e.g. CATTLE" className="w-full text-xs border dark:border-slate-700 p-2 rounded uppercase font-bold text-red-700 dark:text-red-400 bg-white dark:bg-slate-800 outline-none focus:border-emerald-500" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">Stolen Qty & Unit *</label>
                      <input type="text" name="number_count_label" value={agricFormData.number_count_label} onChange={handleAgricInputChange} required placeholder="e.g. 5 HEADS" className="w-full text-xs border dark:border-slate-700 p-2 rounded font-black text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-800 outline-none focus:border-emerald-500 uppercase" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">Action / Recovery *</label>
                      <input type="text" name="recovery_report" value={agricFormData.recovery_report} onChange={handleAgricInputChange} required placeholder="e.g. CATTLE RECOVERED" className="w-full text-xs border dark:border-slate-700 p-2 rounded uppercase font-bold text-emerald-700 dark:text-emerald-400 bg-white dark:bg-slate-800 outline-none focus:border-emerald-500" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">Recovery Qty *</label>
                      <input type="text" name="recoveries_label" value={agricFormData.recoveries_label} onChange={handleAgricInputChange} required placeholder="e.g. 2 HEADS" className="w-full text-xs border dark:border-slate-700 p-2 rounded font-black text-emerald-700 dark:text-emerald-400 bg-white dark:bg-slate-800 outline-none focus:border-emerald-500 uppercase" />
                    </div>
                    <div className="sm:col-span-6 flex justify-end pt-2">
                      <button type="submit" className="bg-emerald-700 hover:bg-emerald-800 text-white font-black py-2.5 px-6 rounded-lg text-xs uppercase shadow cursor-pointer transition flex items-center">
                        <Save className="w-4 h-4 mr-1.5" /> Save Entry to Ledger
                      </button>
                    </div>
                  </form>
                </div>

                <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-300 dark:border-slate-800 overflow-hidden">
                  <div className="bg-slate-900 dark:bg-slate-950 px-4 py-3 text-white font-extrabold text-xs uppercase tracking-wider flex items-center justify-between">
                    <span>📋 Regional Agricultural & Produce Theft Command Ledger</span>
                  </div>

                  <div className="overflow-x-auto w-full custom-scrollbar dark:bg-slate-900">
                    <table className="w-full text-left border-collapse text-xs whitespace-nowrap">
                      <thead className="bg-[#00b050] text-white uppercase font-black">
                        <tr>
                          <th className="p-3 border-r border-emerald-700 w-12 text-center">SN.</th>
                          <th className="p-3 border-r border-emerald-700 w-48">DISTRICT/DIVISION</th>
                          <th className="p-3 border-r border-emerald-700">REPORT</th>
                          <th className="p-3 border-r border-emerald-700 text-center w-24">QTY</th>
                          <th className="p-3 border-r border-emerald-700">ACTION</th>
                          <th className="p-3 text-center w-32">NUMBER</th>
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
                                <td colSpan="6" className="p-3 font-black text-emerald-900 dark:text-emerald-300 uppercase">
                                  <span className="mr-2 text-emerald-700 dark:text-emerald-400">{isExpanded ? '▼' : '▶'}</span> {regionName}
                                </td>
                              </tr>

                              {isExpanded && hasData && Object.keys(regionData.stations).map((stationName, idx) => {
                                const records = regionData.stations[stationName];
                                
                                return (
                                  <tr key={stationName} className="bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/50 border-b border-slate-300 dark:border-slate-800">
                                    <td className="p-3 font-bold text-slate-800 dark:text-slate-200 text-center align-top border-r border-slate-300 dark:border-slate-800">{idx + 1}</td>
                                    <td className="p-3 font-extrabold text-slate-900 dark:text-slate-100 uppercase align-top border-r border-slate-300 dark:border-slate-800">{stationName}</td>
                                    
                                    <td className="p-0 align-top border-r border-slate-300 dark:border-slate-800">
                                      {records.map((r, i) => (
                                        <div key={i} className={`px-3 py-2.5 font-bold text-red-600 dark:text-red-400 uppercase ${i !== records.length - 1 ? 'border-b border-slate-200 dark:border-slate-800' : ''}`}>
                                          {r.agric_crime_report} STOLEN
                                        </div>
                                      ))}
                                    </td>

                                    <td className="p-0 align-top border-r border-slate-300 dark:border-slate-800">
                                      {records.map((r, i) => {
                                        const parsed = parseAgricStatus(r);
                                        return (
                                          <div key={i} className={`px-3 py-2.5 font-black text-slate-900 dark:text-slate-100 text-center ${i !== records.length - 1 ? 'border-b border-slate-200 dark:border-slate-800' : ''}`}>
                                            {parsed.numLabel}
                                          </div>
                                        )
                                      })}
                                    </td>

                                    <td className="p-0 align-top border-r border-slate-300 dark:border-slate-800">
                                      {records.map((r, i) => {
                                        const parsed = parseAgricStatus(r);
                                        return (
                                          <div key={i} className={`px-3 py-2.5 font-bold text-emerald-700 dark:text-emerald-400 uppercase ${i !== records.length - 1 ? 'border-b border-slate-200 dark:border-slate-800' : ''}`}>
                                            {parsed.recReport}
                                          </div>
                                        )
                                      })}
                                    </td>

                                    <td className="p-0 align-top">
                                      {records.map((r, i) => {
                                        const parsed = parseAgricStatus(r);
                                        return (
                                          <div key={i} className={`px-3 py-2.5 font-black text-emerald-600 dark:text-emerald-400 text-center ${i !== records.length - 1 ? 'border-b border-slate-200 dark:border-slate-800' : ''}`}>
                                            {parsed.recLabel}
                                          </div>
                                        )
                                      })}
                                    </td>
                                  </tr>
                                )
                              })}
                              
                              {isExpanded && hasData && (
                                <tr className="bg-emerald-50 dark:bg-slate-800/80 border-b-2 border-emerald-400 dark:border-emerald-700">
                                  <td colSpan="3" className="p-3 font-black text-right text-emerald-900 dark:text-emerald-300 uppercase tracking-wider">
                                    {regionName} REGIONAL TOTAL:
                                  </td>
                                  <td className="p-3 text-center font-black text-red-700 dark:text-red-400 text-lg border-x border-emerald-200 dark:border-slate-700">
                                    {regionalTotalStolen}
                                  </td>
                                  <td className="p-3 font-bold text-emerald-900 dark:text-emerald-300 text-right uppercase border-r border-emerald-200 dark:border-slate-700">
                                    TOTAL RECOVERED:
                                  </td>
                                  <td className="p-3 text-center font-black text-emerald-700 dark:text-emerald-400 text-lg">
                                    {regionalTotalRecovered}
                                  </td>
                                </tr>
                              )}

                              {isExpanded && !hasData && (
                                <tr>
                                  <td colSpan="6" className="p-4 text-center text-slate-400 dark:text-slate-500 font-medium bg-slate-50 dark:bg-slate-900 italic">No entries logged for {regionName} yet.</td>
                                </tr>
                              )}
                            </React.Fragment>
                          )
                        })}

                        {agricSummaryRecords.length > 0 && (
                          <tr className="bg-slate-900 dark:bg-slate-950 text-white border-t-4 border-slate-700 shadow-inner">
                            <td colSpan="3" className="p-4 font-black text-right uppercase tracking-widest text-slate-200">
                              GRAND TOTAL (ALL REGIONS):
                            </td>
                            <td className="p-4 text-center font-black text-red-400 text-xl border-x border-slate-700">
                              {agricSummaryRecords.reduce((sum, r) => sum + (parseInt(r.number_count) || 0), 0)}
                            </td>
                            <td className="p-4 font-bold text-right text-slate-400 uppercase border-r border-slate-700">
                              OVERALL RECOVERED:
                            </td>
                            <td className="p-4 text-center font-black text-emerald-400 text-xl">
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