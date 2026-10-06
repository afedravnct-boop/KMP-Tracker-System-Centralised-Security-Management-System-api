// src/components/AnalyticsDashboard.jsx
import React, { useState, useMemo, useEffect } from 'react';
import { BarChart3, TrendingUp, TrendingDown, Calendar, Shield, Filter, ArrowUpRight, ArrowDownRight, PieChart, Clock, Users, Award, MapPin, Zap, CheckCircle2, GitCommit, Network, Loader2, BookOpen, ChevronDown, ChevronRight, Download, Truck, Scale } from 'lucide-react';
import { authFetch, hasValidSession } from './api';
import { stripHtmlTags } from './App';

const REGIONAL_HIERARCHY = {
  "KMP NORTH": ["KMP NORTH HEADQUARTERS", "KAWEMPE", "KAKIRI", "KASANGATI", "MATUGGA", "NANSANA", "OLD KAMPALA", "WAKISO", "WANDEGEYA"],
  "KMP EAST": ["KMP EAST HEADQUARTERS", "JINJA ROAD", "KIRA", "KIRA DIV", "KIRA ROAD", "MUKONO", "NAGGALAMA", "SEETA"],
  "KMP SOUTH": ["KMP SOUTH HEADQUARTERS", "NATEETE", "CPS KAMPALA", "PARLIAMENT", "ENTEBBE", "KABALAGALA", "KAJJANSI", "KASENYI", "KATWE", "KYENGERA", "NSANGI"],
  "KMP HEADQUARTERS": ["KMP HEADQUARTERS", "FLYING SQUAD", "CRIME INTELLIGENCE"],
  "POLICE HEADQUARTERS": ["NAGURU"]
};

const CHART_COLORS = [
  '#85581A', '#A97142', '#596E47', '#7C9070', '#C5A880', 
  '#4A5D4E', '#B38B59', '#6B5837', '#9E7B54', '#3E4D3E'
];

const isLockupLog = (item) => {
  return item.is_hq_general_total || 
         (item.station || '').includes('HEADQUARTERS GENERAL TOTAL') || 
         (item.daily_lock_up !== undefined && item.daily_lock_up !== null && Number(item.daily_lock_up) > 0);
};

const normalizeOffenceCategory = (rawOffence) => {
  if (!rawOffence) return "UNSPECIFIED OFFENCE";
  let clean = String(rawOffence).trim().toUpperCase();
  if (clean.includes("FATAL") && (clean.includes("TRAFFIC") || clean.includes("ACCIDENT"))) return "TRAFFIC ACCIDENT (FATAL)";
  if (clean.includes("MINOR") && (clean.includes("TRAFFIC") || clean.includes("ACCIDENT"))) return "TRAFFIC ACCIDENT (MINOR)";
  if (clean.includes("DEFILEMENT") || clean.includes("RAPE")) return "DEFILEMENT / RAPE";
  const words = clean.replace(/[^A-Z0-9\s]/g, '').split(/\s+/).filter(Boolean);
  words.sort();
  return words.join(' ') || clean;
};

const normalizeAnalyticsRank = (rankStr) => {
  if (!rankStr) return 'UNRANKED';
  let r = String(rankStr).trim().toUpperCase();
  if (r === 'DC' || r.startsWith('D/C')) {
    r = 'PC';
  } else if (r.startsWith('D/') || r.startsWith('D-') || r.startsWith('D ')) {
    r = r.replace(/^D[\/\- ]/, '').trim();
    if (r === 'C') r = 'PC';
  }
  if (r.includes('/DRV') || r.includes('-DRV') || r.includes(' DRV') || r === 'DRV' || r.includes('C/DRV')) {
    if (r === 'C/DRV' || r === 'DRV' || r === 'PC/DRV') {
      r = 'PC';
    } else {
      r = r.replace(/\/DRV|-DRV| DRV|DRV/g, '').trim();
    }
  }
  if (r === 'C' || r === '') r = 'PC';
  return r;
};

const normalizeUnitName = (rawUnit) => {
  if (!rawUnit) return 'GENERAL DUTIES';
  let clean = String(rawUnit).trim().toUpperCase();
  clean = clean.replace(/[\.\,\-\/]/g, ' ').replace(/\s+/g, ' ').trim();

  if (['G D', 'GD', 'G DUTIES', 'GENERAL DUTY', 'GENERAL DUTIES'].includes(clean)) return 'GENERAL DUTIES';
  if (['CCTV', 'CCTV CAMERA', 'CCTV CAMERAS', 'CCTV SURVEILLANCE'].includes(clean)) return 'CCTV';
  if (['CID', 'CRIME INVESTIGATION', 'CRIME INVESTIGATIONS'].includes(clean)) return 'CID';
  if (['CI', 'CRIME INT', 'CRIME INTELLIGENCE'].includes(clean)) return 'CRIME INTELLIGENCE';
  if (['TRAFFIC', 'TRF', 'TRAF'].includes(clean)) return 'TRAFFIC';
  if (['LOG', 'LOGISTICS', 'LOGIS', 'LOG AND ENG', 'LOGS'].includes(clean)) return 'LOGISTICS';
  if (['ICT', 'COMMUNICATIONS', 'SIGNAL', 'SIGNALS', 'SIGNAL AND COMM'].includes(clean)) return 'ICT & COMMUNICATIONS';

  return clean;
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

const getOfficialRegionForStation = (stationName, dbRegion) => {
  let cleanStation = stripHtmlTags(stationName || '').trim().toUpperCase();
  const cleanDbRegion = stripHtmlTags(dbRegion || '').trim().toUpperCase();

  if (cleanStation === "KIRA DIVISION" || cleanStation === "KIRA DIV" || cleanStation === "KIRA") {
    cleanStation = "KIRA DIV";
  }

  if (REGIONAL_HIERARCHY[cleanDbRegion] && REGIONAL_HIERARCHY[cleanDbRegion].includes(cleanStation)) {
    return cleanDbRegion;
  }

  for (const [regionName, stationsList] of Object.entries(REGIONAL_HIERARCHY)) {
    if (stationsList.includes(cleanStation)) {
      return regionName;
    }
  }

  if (cleanStation.includes("KIRA") && !cleanStation.includes("KIRA ROAD")) {
    return "KMP EAST";
  }

  return cleanDbRegion || 'KMP GENERAL';
};

const AnalyticsDashboard = ({ 
  nominalRolls = [], 
  nominal_rolls = [], 
  crimeRegistry = [], 
  reports = [], 
  successStories = [], 
  operationalStats = [], 
  stats = [], 
  impoundedExhibits = [], 
  currentUser, 
  canViewGlobal = false 
}) => {
  const [fetchedRolls, setFetchedRolls] = useState([]);
  const [fetchedArchiveRolls, setFetchedArchiveRolls] = useState([]);
  const [fetchedLockup, setFetchedLockup] = useState([]);
  const [fetchedCrime, setFetchedCrime] = useState([]);
  const [fetchedSuccess, setFetchedSuccess] = useState([]);
  const [fetchedOps, setFetchedOps] = useState([]);
  const [fetchedExhibits, setFetchedExhibits] = useState([]); 
  const [loading, setLoading] = useState(false);

  const [expandedManpowerRegions, setExpandedManpowerRegions] = useState({});

  const toggleManpowerRegion = (regionName) => {
    setExpandedManpowerRegions(prev => ({
      ...prev,
      [regionName]: !prev[regionName]
    }));
  };

  useEffect(() => {
    let isMounted = true;
    const fetchNeonData = async () => {
      if (!hasValidSession()) return;

      setLoading(true);
      try {
        const [rollRes, archiveRes, lockupRes, crimeRes, storyRes, statsRes, exhibitsRes] = await Promise.all([
          authFetch('/api/v1/nominal-roll').catch(() => null),
          authFetch('/api/v1/nominal-roll-archive').catch(() => null),
          authFetch('/api/v1/lockup-matrix').catch(() => null),
          authFetch('/api/v1/reports').catch(() => null),
          authFetch('/api/v1/stories').catch(() => null),
          authFetch('/api/v1/stats').catch(() => null),
          authFetch('/api/v1/exhibits').catch(() => null)
        ]);

        const rollData = rollRes && rollRes.ok ? await rollRes.json() : [];
        const archiveData = archiveRes && archiveRes.ok ? await archiveRes.json() : [];
        const lockupData = lockupRes && lockupRes.ok ? await lockupRes.json() : [];
        const crimeData = crimeRes && crimeRes.ok ? await crimeRes.json() : [];
        const storyData = storyRes && storyRes.ok ? await storyRes.json() : [];
        const statsData = statsRes && statsRes.ok ? await statsRes.json() : [];
        const exhibitsData = exhibitsRes && exhibitsRes.ok ? await exhibitsRes.json() : [];

        if (isMounted) {
          setFetchedRolls(Array.isArray(rollData) ? rollData : []);
          setFetchedArchiveRolls(Array.isArray(archiveData) ? archiveData : []);
          setFetchedLockup(Array.isArray(lockupData) ? lockupData : []);
          setFetchedCrime(Array.isArray(crimeData) ? crimeData : []);
          setFetchedSuccess(Array.isArray(storyData) ? storyData : []);
          setFetchedOps(Array.isArray(statsData) ? statsData : []);
          setFetchedExhibits(Array.isArray(exhibitsData) ? exhibitsData : []);
        }
      } catch (err) {
        if (err.message !== 'UNAUTHORIZED') {
          console.error("Failed to fetch analytics data from NeonDB:", err);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchData();
    return () => { isMounted = false; };
  }, []);

  const resolvedNominalRolls = nominalRolls.length ? nominalRolls : (nominal_rolls.length ? nominal_rolls : fetchedRolls);
  const resolvedCrimeRegistry = crimeRegistry.length ? crimeRegistry : (reports.length ? reports : fetchedCrime);
  const resolvedSuccessStories = successStories.length ? successStories : fetchedSuccess;
  const resolvedOperationalStats = operationalStats.length ? operationalStats : (stats.length ? stats : fetchedOps);
  const resolvedExhibits = impoundedExhibits.length ? impoundedExhibits : fetchedExhibits;

  const [activeDomain, setActiveDomain] = useState('SUCCESS');
  const [metricCategory, setMetricCategory] = useState('CATEGORY');
  const [selectedMonth, setSelectedMonth] = useState('ALL');
  const [selectedCrimeCategory, setSelectedCrimeCategory] = useState('ALL');
  const [dateFilter, setDateFilter] = useState('ALL'); 
  
  const userRoleClean = stripHtmlTags(currentUser?.role || '').toUpperCase();
  const userPosClean = stripHtmlTags(currentUser?.position || '').toUpperCase();
  const userRegClean = stripHtmlTags(currentUser?.region || '').toUpperCase();

  const isSuperAdmin = userRoleClean === 'SUPER_ADMIN' || userRoleClean === 'ADMIN';
  const isGlobalTier = isSuperAdmin || 
    ['ASSISTANT_SUPER_ADMIN', 'ADMIN'].includes(userRoleClean) || 
    ['KMP COMMANDER', 'DEPUTY KMP COMMANDER', 'KMP ADMIN OFFICER'].includes(userPosClean) || 
    currentUser?.permissions?.view_global_roster === true ||
    !currentUser;

  const isKmpSystemManager = userRoleClean === 'SYSTEM_MANAGER' && ['KMP HEADQUARTERS', 'POLICE HEADQUARTERS'].includes(userRegClean) && userPosClean.includes('KMP');
  const isKmpSpecialist = userRoleClean === 'ASSISTANT_SYSTEM_MANAGER' && ['KMP HEADQUARTERS', 'POLICE HEADQUARTERS'].includes(userRegClean) && userPosClean.includes('KMP');

  const canViewGlobalLevel = canViewGlobal || isGlobalTier || isKmpSystemManager || isKmpSpecialist;

  const [selectedRegion, setSelectedRegion] = useState('ALL REGIONS');
  const [selectedStation, setSelectedStation] = useState('ALL STATIONS');

  useEffect(() => {
    if (canViewGlobalLevel || !currentUser) {
      setSelectedRegion('ALL REGIONS');
      setSelectedStation('ALL STATIONS');
    } else {
      setSelectedRegion(userRegClean || 'KMP HEADQUARTERS');
      setSelectedStation('ALL STATIONS');
    }
  }, [canViewGlobalLevel, userRegClean, currentUser]);

  const timeFilteredDataset = useMemo(() => {
    let baseData = [];
    if (activeDomain === 'CRIME' || activeDomain === 'CRIME_SUMMARY') baseData = resolvedCrimeRegistry.filter(r => !isLockupLog(r)); 
    else if (activeDomain === 'MANPOWER_DEEP') baseData = resolvedNominalRolls;
    else if (activeDomain === 'SUCCESS') baseData = resolvedSuccessStories;
    else if (activeDomain === 'OPERATIONS') baseData = resolvedOperationalStats;
    else if (activeDomain === 'EXHIBITS') baseData = resolvedExhibits;

    baseData = baseData.filter(item => {
      let stn = stripHtmlTags(item.station || '').toUpperCase();
      if (stn === "KIRA DIVISION" || stn === "KIRA DIV" || stn === "KIRA") stn = "KIRA DIV";
      const reg = getOfficialRegionForStation(stn, item.region);

      if (canViewGlobalLevel && selectedRegion === 'ALL REGIONS' && selectedStation === 'ALL STATIONS') {
        return true;
      }

      const activeTargetRegion = canViewGlobalLevel ? selectedRegion : userRegClean;
      
      const belongsToRegion = activeTargetRegion === 'ALL REGIONS' || 
                              reg.toUpperCase() === activeTargetRegion.toUpperCase() || 
                              (item.region && item.region.toUpperCase() === activeTargetRegion.toUpperCase()) ||
                              (REGIONAL_HIERARCHY[activeTargetRegion] && REGIONAL_HIERARCHY[activeTargetRegion].some(s => isStationEquivalent(s, stn)));

      if (!belongsToRegion) return false;

      if (selectedStation !== 'ALL STATIONS') {
        if (!isStationEquivalent(stn, selectedStation)) return false;
      }
      return true;
    });

    if (activeDomain !== 'MANPOWER_DEEP' && activeDomain !== 'RELATIONAL' && (dateFilter !== 'ALL' || selectedMonth !== 'ALL')) {
      const now = new Date();
      baseData = baseData.filter(item => {
        const itemDateStr = item.date || item.createdAt || item.timestamp || item.date_impounded;
        if (!itemDateStr) return true; 
        const itemDate = new Date(itemDateStr);
        if (isNaN(itemDate)) return true;

        if (selectedMonth !== 'ALL') {
          const itemMonth = `${itemDate.getFullYear()}-${String(itemDate.getMonth() + 1).padStart(2, '0')}`;
          if (itemMonth !== selectedMonth) return false;
        }

        if (dateFilter !== 'ALL') {
          const diffDays = Math.ceil(Math.abs(now - itemDate) / (1000 * 60 * 60 * 24));
          if (dateFilter === 'TODAY' || dateFilter === 'today') return itemDate.toDateString() === now.toDateString();
          if (dateFilter === '1DAY') return diffDays <= 1;
          if (dateFilter === '7DAYS' || dateFilter === 'WEEK' || dateFilter === 'week') return diffDays <= 7;
          if (dateFilter === '30DAYS' || dateFilter === 'MONTH') return diffDays <= 30;
          if (dateFilter === '90DAYS') return diffDays <= 90;
          if (dateFilter === '1YEAR') return diffDays <= 365;
        }
        return true;
      });
    }
    return baseData;
  }, [activeDomain, resolvedCrimeRegistry, resolvedNominalRolls, resolvedSuccessStories, resolvedOperationalStats, resolvedExhibits, dateFilter, selectedMonth, selectedRegion, selectedStation, canViewGlobalLevel, userRegClean]);

  const manpowerAnalysis = useMemo(() => {
    const rolls = Array.isArray(resolvedNominalRolls) ? resolvedNominalRolls : [];
    const unitsSet = new Set();
    const reasonsSet = new Set();
    const regionMap = {};

    Object.keys(REGIONAL_HIERARCHY).forEach(reg => {
      regionMap[reg] = { region: reg, units: {}, reasons: {}, totalDeployable: 0, totalNonDeployable: 0, stations: {} };
    });
    regionMap["GENERAL / OTHER"] = { region: "GENERAL / OTHER", units: {}, reasons: {}, totalDeployable: 0, totalNonDeployable: 0, stations: {} };

    const grandTotals = { deployableTotal: 0, nonDeployableTotal: 0, units: {}, reasons: {} };

    rolls.forEach(o => {
      let stn = stripHtmlTags(o.station || 'UNKNOWN').toUpperCase();
      if (stn === "KIRA DIVISION" || stn === "KIRA DIV" || stn === "KIRA") stn = "KIRA DIV";
      const reg = getOfficialRegionForStation(stn, o.region);

      const activeTargetRegion = canViewGlobalLevel ? selectedRegion : userRegClean;

      if (activeTargetRegion !== 'ALL REGIONS') {
        const belongsToRegion = reg.toUpperCase() === activeTargetRegion.toUpperCase() || 
                                (o.region && o.region.toUpperCase() === activeTargetRegion.toUpperCase()) ||
                                (REGIONAL_HIERARCHY[activeTargetRegion] && REGIONAL_HIERARCHY[activeTargetRegion].some(s => isStationEquivalent(s, stn)));
        if (!belongsToRegion) return;
      }
      if (selectedStation !== 'ALL STATIONS') {
        if (!isStationEquivalent(stn, selectedStation)) return;
      }

      const targetReg = regionMap[reg] || regionMap["GENERAL / OTHER"];
      if (!targetReg.stations[stn]) {
        targetReg.stations[stn] = { station: stn, units: {}, reasons: {}, totalDeployable: 0, totalNonDeployable: 0 };
      }
      const targetStn = targetReg.stations[stn];

      const depStr = String(o.deployability || o.deployable_status || '').toUpperCase();
      const statStr = String(o.status || '').toUpperCase();
      const casStr = String(o.casualty || o.casualty_type || o.reason || '').toUpperCase();
      
      const nonDeployableKeywords = [
        'DISABLED', 'CHRONICALLY SICK', 'SICK', 'MENTAL', 'MATERNITY', 
        'COURSE', 'INTERDICTED', 'SUSPENDED', 'DISCIPLINARY', 'STUDY', 
        'MISSION', 'AWOL', 'LEAVE', 'CASUALTY', 'NON'
      ];

      const combinedText = `${statStr} ${depStr} ${casStr}`;
      const isNonDeployable = nonDeployableKeywords.some(keyword => combinedText.includes(keyword));

      if (isNonDeployable) {
          let reason = 'UNSPECIFIED';
          if (combinedText.includes('MISSION')) reason = 'MISSION';
          else if (combinedText.includes('MATERNITY')) reason = 'MATERNITY LEAVE';
          else if (combinedText.includes('SICK') || combinedText.includes('CHRONICALLY')) reason = 'SICK / CHRONICALLY SICK';
          else if (combinedText.includes('MENTAL')) reason = 'MENTAL HEALTH ISSUE';
          else if (combinedText.includes('DISABLED')) reason = 'DISABLED';
          else if (combinedText.includes('COURSE') || combinedText.includes('STUDY')) reason = 'ON COURSE / STUDY LEAVE';
          else if (combinedText.includes('INTERDICTED')) reason = 'INTERDICTED';
          else if (combinedText.includes('SUSPENDED')) reason = 'SUSPENDED';
          else if (combinedText.includes('DISCIPLINARY')) reason = 'DISCIPLINARY COURT';
          else if (combinedText.includes('AWOL')) reason = 'AWOL';
          else if (combinedText.includes('ANNUAL') || combinedText.includes('LEAVE')) reason = 'LEAVE';
          else reason = statStr || casStr || 'NON-DEPLOYABLE';

          reasonsSet.add(reason);
          targetReg.reasons[reason] = (targetReg.reasons[reason] || 0) + 1;
          targetStn.reasons[reason] = (targetStn.reasons[reason] || 0) + 1;
          targetReg.totalNonDeployable += 1;
          targetStn.totalNonDeployable += 1;
          
          grandTotals.reasons[reason] = (grandTotals.reasons[reason] || 0) + 1;
          grandTotals.nonDeployableTotal += 1;
      } else {
          let unit = normalizeUnitName(o.section || o.dir || o.unit || 'GD');
          unitsSet.add(unit);
          targetReg.units[unit] = (targetReg.units[unit] || 0) + 1;
          targetStn.units[unit] = (targetStn.units[unit] || 0) + 1;
          targetReg.totalDeployable += 1;
          targetStn.totalDeployable += 1;
          
          grandTotals.units[unit] = (grandTotals.units[unit] || 0) + 1;
          grandTotals.deployableTotal += 1;
      }
    });

    const uniqueUnits = Array.from(unitsSet).sort();
    const uniqueReasons = Array.from(reasonsSet).sort();
    const rows = Object.values(regionMap).filter(r => r.totalDeployable > 0 || r.totalNonDeployable > 0).map(item => ({
      ...item,
      stationList: Object.values(item.stations).filter(s => s.totalDeployable > 0 || s.totalNonDeployable > 0).sort((a,b) => a.station.localeCompare(b.station))
    }));

    return { rows, uniqueUnits, uniqueReasons, grandTotals };
  }, [resolvedNominalRolls, selectedRegion, selectedStation, canViewGlobalLevel, userRegClean]);

  // Crime Categories (Aggregated with month, crime category, station, division, region filters)
  const crimeCategoryData = useMemo(() => {
    const tf = timeFilteredData(resolvedCrimeRegistry);
    const grouped = {};

    tf.forEach(r => {
      const cat = normalizeOffenceCategory(r.crime_category || r.offence || 'GENERAL CRIME');
      const reg = (r.region || 'KMP GENERAL').toUpperCase();
      const div = (r.division || r.station || 'N/A').toUpperCase();
      const stn = (r.station || 'N/A').toUpperCase();

      if (selectedCrimeCategory !== 'ALL' && cat !== selectedCrimeCategory) return;
      if (canViewGlobalLevel && selectedRegion !== 'ALL REGIONS' && reg !== selectedRegion.toUpperCase()) return;
      if (selectedStation !== 'ALL STATIONS' && !isStationEquivalent(stn, selectedStation)) return;

      const key = `${cat}|${reg}|${div}|${stn}`;
      if (!grouped[key]) {
        grouped[key] = { category: cat, region: reg, division: div, station: stn, count: 0 };
      }
      grouped[key].count += 1;
    });

    return Object.values(grouped).sort((a, b) => b.count - a.count);
  }, [resolvedCrimeRegistry, selectedCrimeCategory, selectedRegion, selectedStation, selectedMonth, dateFilter, canViewGlobalLevel]);

  // Exhibits Grouped & Summed by category, station, division, region, status
  const exhibitGroupedData = useMemo(() => {
    const tf = timeFilteredData(resolvedExhibits);
    const map = {};
    tf.forEach(ex => {
      const cat = (ex.category || 'GENERAL').toUpperCase();
      const reg = (ex.region || 'KMP GENERAL').toUpperCase();
      const div = (ex.division || ex.station || 'N/A').toUpperCase();
      const stn = (ex.station || 'N/A').toUpperCase();
      const status = (ex.status || 'IMPOUNDED').toUpperCase();

      if (canViewGlobalLevel && selectedRegion !== 'ALL REGIONS' && reg !== selectedRegion.toUpperCase()) return;
      if (selectedStation !== 'ALL STATIONS' && !isStationEquivalent(stn, selectedStation)) return;

      const key = `${cat}|${reg}|${div}|${stn}|${status}`;
      map[key] = (map[key] || 0) + 1;
    });

    return Object.entries(map).map(([k, total]) => {
      const [category, region, division, station, status] = k.split('|');
      return { category, region, division, station, status, total };
    }).sort((a, b) => b.total - a.total);
  }, [resolvedExhibits, selectedRegion, selectedStation, selectedMonth, dateFilter, canViewGlobalLevel]);

  // Summary Table Aggregates based on timeframe (1 day to 1 year)
  const summaryAggregates = useMemo(() => {
    const ops = timeFilteredData(resolvedOperationalStats);
    const ss = timeFilteredData(resolvedSuccessStories);
    const cr = timeFilteredData(resolvedCrimeRegistry);
    const ex = timeFilteredData(resolvedExhibits);
    const nom = resolvedNominalRolls;

    return {
      disruptiveOps: ops.length,
      manpowerTotal: nom.length,
      successOccasions: ss.length,
      totalExhibits: ex.length,
      totalArrests: ops.reduce((acc, curr) => acc + (Number(curr.arrests || curr.suspects) || 0), 0),
      totalCrimes: cr.length
    };
  }, [resolvedOperationalStats, resolvedSuccessStories, resolvedCrimeRegistry, resolvedExhibits, resolvedNominalRolls, selectedMonth, dateFilter]);

  // Ops Trends: Region and Station as FIRST column, followed by week-over-week comparisons
  const opsTrendsData = useMemo(() => {
    const weeklyMap = {};
    resolvedOperationalStats.forEach(o => {
      const stn = stripHtmlTags(o.station || 'N/A').toUpperCase();
      const reg = getOfficialRegionForStation(stn, o.region);

      if (canViewGlobalLevel && selectedRegion !== 'ALL REGIONS' && reg.toUpperCase() !== selectedRegion.toUpperCase()) return;
      if (selectedStation !== 'ALL STATIONS' && !isStationEquivalent(stn, selectedStation)) return;

      const dStr = o.date || o.timestamp;
      if (!dStr) return;
      const d = new Date(dStr);
      if (isNaN(d)) return;
      const weekKey = `${d.getFullYear()}-W${Math.ceil(d.getDate() / 7)}`;

      const key = `${reg}|${stn}|${weekKey}`;
      if (!weeklyMap[key]) {
        weeklyMap[key] = { region: reg, station: stn, week: weekKey, ops: 0, successes: 0, crimes: 0 };
      }
      weeklyMap[key].ops += 1;
    });

    resolvedSuccessStories.forEach(s => {
      const stn = stripHtmlTags(s.station || 'N/A').toUpperCase();
      const reg = getOfficialRegionForStation(stn, s.region);
      if (canViewGlobalLevel && selectedRegion !== 'ALL REGIONS' && reg.toUpperCase() !== selectedRegion.toUpperCase()) return;
      if (selectedStation !== 'ALL STATIONS' && !isStationEquivalent(stn, selectedStation)) return;

      const dStr = s.date || s.createdAt;
      if (!dStr) return;
      const d = new Date(dStr);
      if (isNaN(d)) return;
      const weekKey = `${d.getFullYear()}-W${Math.ceil(d.getDate() / 7)}`;

      const key = `${reg}|${stn}|${weekKey}`;
      if (!weeklyMap[key]) {
        weeklyMap[key] = { region: reg, station: stn, week: weekKey, ops: 0, successes: 0, crimes: 0 };
      }
      weeklyMap[key].successes += 1;
    });

    return Object.values(weeklyMap).sort((a, b) => b.week.localeCompare(a.week));
  }, [resolvedOperationalStats, resolvedSuccessStories, selectedRegion, selectedStation, canViewGlobalLevel]);

  const handleExportExcel = async () => {
    try {
      const response = await authFetch('/api/v1/analytics/export'); 
      if (!response.ok) throw new Error("Failed to securely generate the report.");
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'SECURE_ANALYTICS_REPORT.zip';
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      alert(`Export Failed: ${error.message}`);
    }
  };

  return (
    <div className="p-3 max-w-[1600px] mx-auto space-y-3 font-sans min-h-screen pb-24" style={{ backgroundColor: '#f4eee2' }}>
      
      {/* Top Header Card */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-[#fbf8f3] px-4 py-2.5 rounded-xl shadow-xs border border-[#e2d6c3] gap-2">
        <div>
          <h1 className="text-lg font-extrabold text-[#3a3225] tracking-tight">KMP Relational Operations & Intelligence Dashboard</h1>
          <p className="text-[11px] text-[#736450] font-medium">Monthly aggregates, crime categories, suspect legal statuses, open-ended recoveries, and hierarchical operational trends.</p>
        </div>
        <button onClick={handleExportExcel} className="bg-[#596E47] hover:bg-[#4A5D4E] text-white px-3 py-1.5 rounded-lg font-bold text-[11px] shadow-xs transition flex items-center space-x-1.5 cursor-pointer shrink-0">
          <Download size={14} className="mr-1" />
          <span>Download Relational Report (ZIP)</span>
        </button>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-2 px-3 bg-amber-50 rounded-lg border border-amber-200 text-[11px] text-amber-800 font-bold">
          <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin text-amber-600" /> Fetching live analytics data streams from NeonDB...
        </div>
      )}

      {/* Tabs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-1.5">
        {[
          { id: 'SUCCESS', label: '🌟 Success Stories' },
          { id: 'CRIME', label: '📊 Crime Categories' },
          { id: 'EXHIBITS', label: '🚚 Exhibits' },
          { id: 'SUMMARY', label: '📋 Summary Table' },
          { id: 'TRENDS', label: '📈 Ops Trends' },
          { id: 'OPERATIONS', label: '⚡ Disruptive Ops' },
          { id: 'MANPOWER_DEEP', label: '🛡️ Manpower Analysis' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => { setActiveDomain(tab.id); setMetricCategory('CATEGORY'); }}
            className={`px-2.5 py-2 rounded-lg font-bold text-[11px] transition border text-center shadow-xs cursor-pointer truncate ${
              activeDomain === tab.id ? 'bg-[#3a3225] text-[#f4eee2] border-[#3a3225]' : 'bg-[#fbf8f3] text-[#594d3c] border-[#e2d6c3] hover:bg-[#f1ebd9]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Filter Toolbar */}
      <div className="bg-[#fbf8f3] px-3 py-2 rounded-lg shadow-xs border border-[#e2d6c3] flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold text-[#736450] uppercase flex items-center">
            <Filter size={12} className="mr-1 text-[#596E47]" /> Filters:
          </span>

          <select value={selectedRegion} onChange={(e) => { if (canViewGlobalLevel) { setSelectedRegion(e.target.value); setSelectedStation('ALL STATIONS'); } }} disabled={!canViewGlobalLevel} className="border border-[#e2d6c3] rounded-md px-2 py-1 text-[11px] font-bold text-[#3a3225] bg-white outline-none cursor-pointer">
            <option value="ALL REGIONS">ALL REGIONS</option>
            {Object.keys(REGIONAL_HIERARCHY).map(reg => <option key={reg} value={reg}>{reg}</option>)}
          </select>

          <select value={selectedStation} onChange={(e) => setSelectedStation(e.target.value)} className="border border-[#e2d6c3] rounded-md px-2 py-1 text-[11px] font-bold text-[#3a3225] bg-white outline-none cursor-pointer">
            <option value="ALL STATIONS">ALL STATIONS / DIVISIONS</option>
            {REGIONAL_HIERARCHY[selectedRegion]?.map(stn => <option key={stn} value={stn}>{stn}</option>)}
          </select>

          <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="border border-[#e2d6c3] rounded-md px-2 py-1 text-[11px] font-bold text-[#3a3225] bg-white outline-none cursor-pointer">
            <option value="ALL">All Months</option>
            <option value="2026-10">October 2026</option>
            <option value="2026-09">September 2026</option>
            <option value="2026-08">August 2026</option>
            <option value="2026-07">July 2026</option>
          </select>

          <select value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className="border border-[#e2d6c3] rounded-md px-2 py-1 text-[11px] font-bold text-[#3a3225] bg-white outline-none cursor-pointer">
            <option value="ALL">All Time Range</option>
            <option value="1DAY">Last 1 Day</option>
            <option value="7DAYS">Last 7 Days (1 Week)</option>
            <option value="30DAYS">Last 30 Days (1 Month)</option>
            <option value="90DAYS">Last 90 Days (3 Months)</option>
            <option value="1YEAR">Last 365 Days (1 Year)</option>
          </select>
        </div>

        <span className="text-[11px] font-extrabold text-[#596E47] bg-[#e9eedf] px-2 py-0.5 rounded border border-[#cfe1b9]">
          Total Entries: {activeDomain === 'SUCCESS' ? filteredSuccessStories.length : activeDomain === 'CRIME' ? crimeCategoryData.length : activeDomain === 'EXHIBITS' ? exhibitGroupedData.length : timeFilteredDataset.length}
        </span>
      </div>

      {/* SUCCESS STORIES TAB */}
      {activeDomain === 'SUCCESS' && (
        <div className="space-y-3 pb-12">
          <div className="bg-[#3a3225] rounded-xl p-3.5 text-[#f4eee2] shadow-sm border border-[#534735]">
            <h2 className="text-sm font-extrabold flex items-center tracking-wide text-[#f4eee2]">
              <Award className="mr-2 text-[#C5A880] w-4 h-4" /> Success Stories & Operational Breakthrough Analytics
            </h2>
            <p className="text-[11px] text-[#b8ab97] mt-0.5 leading-tight">
              Listing suspects arrested, open-ended recovered properties (phones, shoes, chairs, tables, money, computers, livestock, produce, etc.), and suspect legal status (court, remanded, convicted, acquitted, or undergoing investigations).
            </p>
          </div>

          <div className="bg-[#fbf8f3] rounded-xl shadow-xs border border-[#e2d6c3] overflow-hidden">
            <div className="overflow-x-auto w-full">
              <table className="min-w-full divide-y divide-[#e2d6c3]">
                <thead className="bg-[#efece6]">
                  <tr>
                    <th className="px-3 py-2 text-left text-[11px] font-bold text-[#594d3c] uppercase">Station / Region</th>
                    <th className="px-3 py-2 text-center text-[11px] font-bold text-[#594d3c] uppercase">Suspects Arrested</th>
                    <th className="px-3 py-2 text-left text-[11px] font-bold text-[#594d3c] uppercase">Recovered Properties (Open-ended / Quantities)</th>
                    <th className="px-3 py-2 text-center text-[11px] font-bold text-[#594d3c] uppercase">Suspect Legal Status</th>
                    <th className="px-3 py-2 text-left text-[11px] font-bold text-[#594d3c] uppercase">Operational Highlight / Narrative</th>
                  </tr>
                </thead>
                <tbody className="bg-[#fbf8f3] divide-y divide-[#e2d6c3]">
                  {filteredSuccessStories.length > 0 ? (
                    filteredSuccessStories.map((st, idx) => (
                      <tr key={idx} className="hover:bg-[#e9eedf]/30">
                        <td className="px-3 py-2 text-[11px] font-bold text-[#3a3225]">
                          {st.station}<br/><span className="text-[10px] text-[#736450]">{st.region}</span>
                        </td>
                        <td className="px-3 py-2 text-center font-bold text-[#596E47] text-[11px]">{st.suspects_arrested || st.suspects_arrested_count || 0}</td>
                        <td className="px-3 py-2 text-[11px] text-[#594d3c] font-medium">
                          {st.suspected_stolen_properties_recovered || st.property_recovered || 'None recorded'}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-[#3a3225] text-[#f4eee2] uppercase">
                            {st.legal_status || 'UNDER INVESTIGATION'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-[11px] text-[#3a3225]" dangerouslySetInnerHTML={{ __html: st.narrative }} />
                      </tr>
                    ))
                  ) : (
                    <tr><td colSpan="5" className="text-center py-6 text-[11px] text-[#736450]">No success stories found matching your filter criteria.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* CRIME CATEGORIES TAB */}
      {activeDomain === 'CRIME' && (
        <div className="space-y-3 pb-12">
          <div className="bg-[#3a3225] rounded-xl p-3.5 text-[#f4eee2] shadow-sm border border-[#534735]">
            <h2 className="text-sm font-extrabold flex items-center tracking-wide text-[#f4eee2]">
              <BarChart3 className="mr-2 text-[#C5A880] w-4 h-4" /> Crime Categories & Aggregated Incident Analytics
            </h2>
            <p className="text-[11px] text-[#b8ab97] mt-0.5 leading-tight">
              Granular breakdown of offences filtered by month, crime category, station, division, and region.
            </p>
          </div>

          <div className="bg-[#fbf8f3] p-3 rounded-lg shadow-xs border border-[#e2d6c3] flex items-center gap-3">
            <label className="text-xs font-bold text-[#3a3225]">Filter Specific Offence:</label>
            <select value={selectedCrimeCategory} onChange={(e) => setSelectedCrimeCategory(e.target.value)} className="border border-[#e2d6c3] rounded px-2 py-1 text-xs font-bold bg-white text-[#3a3225] outline-none">
              <option value="ALL">All Crime Categories</option>
              {Array.from(new Set(resolvedCrimeRegistry.map(r => normalizeOffenceCategory(r.crime_category || r.offence)))).map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div className="bg-[#fbf8f3] rounded-xl shadow-xs border border-[#e2d6c3] overflow-hidden">
            <table className="min-w-full divide-y divide-[#e2d6c3]">
              <thead className="bg-[#efece6]">
                <tr>
                  <th className="px-3 py-2 text-left text-[11px] font-bold text-[#594d3c] uppercase">Crime Offence Category</th>
                  <th className="px-3 py-2 text-left text-[11px] font-bold text-[#594d3c] uppercase">Region</th>
                  <th className="px-3 py-2 text-left text-[11px] font-bold text-[#594d3c] uppercase">Division / Station</th>
                  <th className="px-3 py-2 text-center text-[11px] font-bold text-[#594d3c] uppercase">Aggregated Total</th>
                </tr>
              </thead>
              <tbody className="bg-[#fbf8f3] divide-y divide-[#e2d6c3]">
                {crimeCategoryData.length > 0 ? (
                  crimeCategoryData.map((row, idx) => (
                    <tr key={idx} className="hover:bg-[#e9eedf]/30">
                      <td className="px-3 py-2 text-[11px] font-bold text-[#3a3225] uppercase">{row.category}</td>
                      <td className="px-3 py-2 text-[11px] font-semibold text-[#736450] uppercase">{row.region}</td>
                      <td className="px-3 py-2 text-[11px] font-semibold text-[#594d3c] uppercase">{row.division} / {row.station}</td>
                      <td className="px-3 py-2 text-center text-[11px] font-black text-[#596E47]">{row.count}</td>
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan="4" className="text-center py-6 text-[11px] text-[#736450]">No crime records match the selected filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* EXHIBITS TAB */}
      {activeDomain === 'EXHIBITS' && (
        <div className="space-y-3 pb-12">
          <div className="bg-[#3a3225] rounded-xl p-3.5 text-[#f4eee2] shadow-sm border border-[#534735]">
            <h2 className="text-sm font-extrabold flex items-center tracking-wide text-[#f4eee2]">
              <Truck className="mr-2 text-[#C5A880] w-4 h-4" /> Impounded Exhibits & Asset Recovery Analytics
            </h2>
            <p className="text-[11px] text-[#b8ab97] mt-0.5 leading-tight">
              Grouped, named, and summed by exhibit category, station, division, region, and status.
            </p>
          </div>

          <div className="bg-[#fbf8f3] rounded-xl shadow-xs border border-[#e2d6c3] overflow-hidden">
            <table className="min-w-full divide-y divide-[#e2d6c3]">
              <thead className="bg-[#efece6]">
                <tr>
                  <th className="px-3 py-2 text-left text-[11px] font-bold text-[#594d3c] uppercase">Exhibit Category</th>
                  <th className="px-3 py-2 text-left text-[11px] font-bold text-[#594d3c] uppercase">Region</th>
                  <th className="px-3 py-2 text-left text-[11px] font-bold text-[#594d3c] uppercase">Division / Station</th>
                  <th className="px-3 py-2 text-center text-[11px] font-bold text-[#594d3c] uppercase">Status</th>
                  <th className="px-3 py-2 text-center text-[11px] font-bold text-[#594d3c] uppercase">Total Count</th>
                </tr>
              </thead>
              <tbody className="bg-[#fbf8f3] divide-y divide-[#e2d6c3]">
                {exhibitGroupedData.length > 0 ? (
                  exhibitGroupedData.map((row, idx) => (
                    <tr key={idx} className="hover:bg-[#e9eedf]/30">
                      <td className="px-3 py-2 text-[11px] font-bold text-[#3a3225] uppercase">{row.category}</td>
                      <td className="px-3 py-2 text-[11px] font-semibold text-[#736450] uppercase">{row.region}</td>
                      <td className="px-3 py-2 text-[11px] font-semibold text-[#594d3c] uppercase">{row.division} / {row.station}</td>
                      <td className="px-3 py-2 text-center text-[10px] font-bold uppercase"><span className="px-2 py-0.5 rounded bg-teal-100 text-teal-900">{row.status}</span></td>
                      <td className="px-3 py-2 text-center text-[11px] font-black text-teal-800">{row.total}</td>
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan="5" className="text-center py-6 text-[11px] text-[#736450]">No exhibits recorded for this filter.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUMMARY TABLE TAB (WIDESCREEN EXPANDED) */}
      {activeDomain === 'SUMMARY' && (
        <div className="space-y-3 pb-24">
          <div className="bg-[#3a3225] rounded-xl p-3.5 text-[#f4eee2] shadow-sm border border-[#534735]">
            <h2 className="text-sm font-extrabold flex items-center tracking-wide text-[#f4eee2]">
              <BarChart3 className="mr-2 text-[#C5A880] w-4 h-4" /> Master Summary Table (Aggregated Metrics)
            </h2>
            <p className="text-[11px] text-[#b8ab97] mt-0.5 leading-tight">
              Summarizing all operational modules over the selected timeframe (1 day to 1 year).
            </p>
          </div>

          <div className="bg-[#fbf8f3] rounded-xl shadow-xs border border-[#e2d6c3] overflow-hidden w-full max-w-full">
            <table className="min-w-full divide-y divide-[#e2d6c3]">
              <thead className="bg-[#efece6]">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-bold text-[#594d3c] uppercase">Operational Metric Attribute</th>
                  <th className="px-6 py-3 text-right text-xs font-bold text-[#594d3c] uppercase">Aggregate Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e2d6c3]">
                <tr className="hover:bg-[#e9eedf]/30"><td className="px-6 py-3 text-sm font-bold text-[#3a3225]">Total Disruptive Operations Registered</td><td className="px-6 py-3 text-right font-black text-[#596E47] text-sm">{summaryAggregates.disruptiveOps}</td></tr>
                <tr className="hover:bg-[#e9eedf]/30"><td className="px-6 py-3 text-sm font-bold text-[#3a3225]">Force-Wide Manpower (Nominal Roll)</td><td className="px-6 py-3 text-right font-black text-[#3a3225] text-sm">{summaryAggregates.manpowerTotal}</td></tr>
                <tr className="hover:bg-[#e9eedf]/30"><td className="px-6 py-3 text-sm font-bold text-[#3a3225]">Total Success Occasions / Breakthroughs</td><td className="px-6 py-3 text-right font-black text-amber-800 text-sm">{summaryAggregates.successOccasions}</td></tr>
                <tr className="hover:bg-[#e9eedf]/30"><td className="px-6 py-3 text-sm font-bold text-[#3a3225]">Total Impounded Exhibits Tracked</td><td className="px-6 py-3 text-right font-black text-teal-800 text-sm">{summaryAggregates.totalExhibits}</td></tr>
                <tr className="hover:bg-[#e9eedf]/30"><td className="px-6 py-3 text-sm font-bold text-[#3a3225]">Total Suspects Arrested (Ops)</td><td className="px-6 py-3 text-right font-black text-[#596E47] text-sm">{summaryAggregates.totalArrests}</td></tr>
                <tr className="hover:bg-[#e9eedf]/30"><td className="px-6 py-3 text-sm font-bold text-[#3a3225]">Total Crime Incidents Recorded</td><td className="px-6 py-3 text-right font-black text-[#3a3225] text-sm">{summaryAggregates.totalCrimes}</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* OPS TRENDS TAB (REGION & STATION FIRST COLUMN) */}
      {activeDomain === 'TRENDS' && (
        <div className="space-y-3 pb-12">
          <div className="bg-[#3a3225] rounded-xl p-3.5 text-[#f4eee2] shadow-sm">
            <h2 className="text-sm font-extrabold">Operational Trends & Comparative Matrix</h2>
            <p className="text-[11px] text-[#b8ab97]">Region & station hierarchical filters with week-over-week operational tracking.</p>
          </div>

          <div className="bg-[#fbf8f3] rounded-xl shadow-xs border border-[#e2d6c3] overflow-hidden">
            <table className="min-w-full divide-y divide-[#e2d6c3]">
              <thead className="bg-[#efece6]">
                <tr>
                  <th className="px-3 py-2 text-left text-[11px] font-bold text-[#594d3c] uppercase">Command Region & Station / Division</th>
                  <th className="px-3 py-2 text-center text-[11px] font-bold text-[#594d3c] uppercase">Period (Week)</th>
                  <th className="px-3 py-2 text-center text-[11px] font-bold text-[#594d3c] uppercase">Disruptive Operations</th>
                  <th className="px-3 py-2 text-center text-[11px] font-bold text-[#594d3c] uppercase">Success Stories</th>
                </tr>
              </thead>
              <tbody className="bg-[#fbf8f3] divide-y divide-[#e2d6c3]">
                {opsTrendsData.length > 0 ? (
                  opsTrendsData.map((row, idx) => (
                    <tr key={idx} className="hover:bg-[#e9eedf]/30">
                      <td className="px-3 py-2 text-[11px] font-bold text-[#3a3225] uppercase">{row.region} — {row.station}</td>
                      <td className="px-3 py-2 text-center text-[11px] font-semibold text-[#736450]">{row.week}</td>
                      <td className="px-3 py-2 text-center text-[11px] font-extrabold text-[#596E47]">{row.ops}</td>
                      <td className="px-3 py-2 text-center text-[11px] font-extrabold text-amber-800">{row.successes}</td>
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan="4" className="text-center py-6 text-[11px] text-[#736450]">No operational trend records found for this station/region.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MANPOWER ANALYSIS TAB */}
      {activeDomain === 'MANPOWER_DEEP' && (
        <div className="space-y-6 pb-12">
          <div className="bg-[#3a3225] rounded-xl p-3.5 text-[#f4eee2] shadow-sm border border-[#534735]">
            <h2 className="text-sm font-extrabold flex items-center tracking-wide text-[#f4eee2]">
              <Users className="mr-2 text-[#C5A880] w-4 h-4" /> Multi-Layered Manpower Matrix Analysis
            </h2>
            <p className="text-[11px] text-[#b8ab97] mt-0.5 leading-tight">
              Detailed structural breakdown of personnel force distribution by functional Units/Directorates and categorized Operational Casualties. Click a region to expand details.
            </p>
          </div>

          <div className="bg-[#fbf8f3] rounded-xl shadow-xs border border-[#e2d6c3] overflow-hidden">
             <div className="bg-[#efece6] px-4 py-2 border-b border-[#d3c2a8] flex items-center justify-between">
                <h3 className="text-xs font-black text-[#3a3225] uppercase">General Summary (Deployable Personnel)</h3>
             </div>
             <div className="overflow-x-auto w-full custom-scrollbar">
               <table className="min-w-full divide-y divide-[#e2d6c3]">
                  <thead className="bg-[#efece6]">
                     <tr>
                       <th className="px-3 py-2 text-left text-[11px] font-bold text-[#594d3c] uppercase sticky left-0 bg-[#efece6] z-10 w-48">Command Region / Station</th>
                       <th className="px-3 py-2 text-center text-[11px] font-bold text-[#3a3225] uppercase">Total Active Personnel</th>
                     </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e2d6c3]">
                     {manpowerAnalysis.rows.map(reg => {
                        const isExpanded = !!expandedManpowerRegions[reg.region];
                        return (
                          <React.Fragment key={reg.region}>
                            <tr onClick={() => toggleManpowerRegion(reg.region)} className="bg-[#efece6]/50 hover:bg-[#e9eedf]/50 cursor-pointer transition-colors border-t border-[#d3c2a8]">
                               <td className="px-3 py-2 text-[11px] font-extrabold text-[#3a3225] uppercase flex items-center space-x-1.5 sticky left-0 bg-[#efece6]/50">
                                  <span className="text-[#596E47]">{isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
                                  <span>{reg.region}</span>
                               </td>
                               <td className="px-3 py-2 text-[11px] text-center font-black text-emerald-800">{reg.totalDeployable}</td>
                            </tr>
                            {isExpanded && reg.stationList.map((stn, sIdx) => (
                               <tr key={`dep-${sIdx}`} className="bg-white">
                                  <td className="px-3 py-1.5 pl-7 text-[10px] font-semibold text-[#594d3c] uppercase sticky left-0 bg-white">— {stn.station}</td>
                                  <td className="px-3 py-1.5 text-[10px] text-center font-bold text-emerald-700">{stn.totalDeployable || ''}</td>
                               </tr>
                            ))}
                          </React.Fragment>
                        );
                     })}
                  </tbody>
               </table>
             </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default AnalyticsDashboard;