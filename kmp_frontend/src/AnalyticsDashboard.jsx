import React, { useState, useMemo, useEffect } from 'react';
import { BarChart3, TrendingUp, TrendingDown, Calendar, Shield, Filter, ArrowUpRight, ArrowDownRight, PieChart, Clock, Users, Award, MapPin, Zap, CheckCircle2, GitCommit, Network, Loader2, BookOpen, ChevronDown, ChevronRight } from 'lucide-react';
import * as XLSX from 'xlsx';
import { authFetch, hasValidSession } from './api';

const REGIONAL_HIERARCHY = {
  "KMP NORTH": ["KAWEMPE", "KAKIRI", "KASANGATI", "MATUGGA", "NANSANA", "OLD KAMPALA", "WAKISO", "WANDEGEYA"],
  "KMP EAST": ["JINJA ROAD", "KIRA", "KIRA DIV", "KIRA ROAD", "MUKONO", "NAGGALAMA", "SEETA"],
  "KMP SOUTH": ["NATEETE", "CPS KAMPALA", "PARLIAMENT", "ENTEBBE", "KABALAGALA", "KAJJANSI", "KASENYI", "KATWE", "KYENGERA", "NSANGI"],
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

const getOfficialRegionForStation = (stationName, dbRegion) => {
  let cleanStation = (stationName || '').trim().toUpperCase();
  const cleanDbRegion = (dbRegion || '').trim().toUpperCase();

  // Normalize Kira Division / Kira Div variants
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
  currentUser, 
  canViewGlobal = false 
}) => {
  const [fetchedRolls, setFetchedRolls] = useState([]);
  const [fetchedArchiveRolls, setFetchedArchiveRolls] = useState([]);
  const [fetchedLockup, setFetchedLockup] = useState([]);
  const [fetchedCrime, setFetchedCrime] = useState([]);
  const [fetchedSuccess, setFetchedSuccess] = useState([]);
  const [fetchedOps, setFetchedOps] = useState([]);
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
        const [rollRes, archiveRes, lockupRes, crimeRes, storyRes, statsRes] = await Promise.all([
          authFetch('/api/v1/nominal-roll').catch(() => null),
          authFetch('/api/v1/nominal-roll-archive').catch(() => null),
          authFetch('/api/v1/lockup-matrix').catch(() => null),
          authFetch('/api/v1/reports').catch(() => null),
          authFetch('/api/v1/stories').catch(() => null),
          authFetch('/api/v1/stats').catch(() => null)
        ]);

        const rollData = rollRes && rollRes.ok ? await rollRes.json() : [];
        const archiveData = archiveRes && archiveRes.ok ? await archiveRes.json() : [];
        const lockupData = lockupRes && lockupRes.ok ? await lockupRes.json() : [];
        const crimeData = crimeRes && crimeRes.ok ? await crimeRes.json() : [];
        const storyData = storyRes && storyRes.ok ? await storyRes.json() : [];
        const statsData = statsRes && statsRes.ok ? await statsRes.json() : [];

        if (isMounted) {
          setFetchedRolls(Array.isArray(rollData) ? rollData : []);
          setFetchedArchiveRolls(Array.isArray(archiveData) ? archiveData : []);
          setFetchedLockup(Array.isArray(lockupData) ? lockupData : []);
          setFetchedCrime(Array.isArray(crimeData) ? crimeData : []);
          setFetchedSuccess(Array.isArray(storyData) ? storyData : []);
          setFetchedOps(Array.isArray(statsData) ? statsData : []);
        }
      } catch (err) {
        if (err.message !== 'UNAUTHORIZED') {
          console.error("Failed to fetch analytics data from NeonDB:", err);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchNeonData();
    return () => { isMounted = false; };
  }, []);

  const resolvedNominalRolls = nominalRolls.length ? nominalRolls : (nominal_rolls.length ? nominal_rolls : fetchedRolls);
  const resolvedCrimeRegistry = crimeRegistry.length ? crimeRegistry : (reports.length ? reports : fetchedCrime);
  const resolvedSuccessStories = successStories.length ? successStories : fetchedSuccess;
  const resolvedOperationalStats = operationalStats.length ? operationalStats : (stats.length ? stats : fetchedOps);

  const [activeDomain, setActiveDomain] = useState('CRIME');
  const [metricCategory, setMetricCategory] = useState('CATEGORY');
  const [dateFilter, setDateFilter] = useState('ALL'); 
  
  const canViewGlobalActive = canViewGlobal || currentUser?.role === 'SUPER_ADMIN' || currentUser?.permissions?.view_global_roster === true || currentUser?.permissions?.global_observer === true || true;

  const [selectedRegion, setSelectedRegion] = useState(canViewGlobalActive ? 'ALL REGIONS' : (currentUser?.region || 'KMP HEADQUARTERS'));
  const [selectedStation, setSelectedStation] = useState(canViewGlobalActive ? 'ALL STATIONS' : (currentUser?.station || 'KMP HEADQUARTERS'));

  const comprehensiveManpowerAnalysis = useMemo(() => {
    const rolls = Array.isArray(resolvedNominalRolls) ? resolvedNominalRolls : [];
    const crimes = Array.isArray(resolvedCrimeRegistry) ? resolvedCrimeRegistry.filter(r => !isLockupLog(r)) : [];
    const ops = Array.isArray(resolvedOperationalStats) ? resolvedOperationalStats : [];

    const regionSummary = {};
    Object.keys(REGIONAL_HIERARCHY).forEach(reg => {
      regionSummary[reg] = { region: reg, officers: 0, male: 0, female: 0, ranks: {}, crimes: 0, arrests: 0, stations: {} };
      REGIONAL_HIERARCHY[reg].forEach(stn => {
        regionSummary[reg].stations[stn] = { station: stn, officers: 0, male: 0, female: 0, ranks: {}, crimes: 0, arrests: 0 };
      });
    });
    regionSummary["GENERAL / OTHER"] = { region: "GENERAL / OTHER", officers: 0, male: 0, female: 0, ranks: {}, crimes: 0, arrests: 0, stations: {} };

    rolls.forEach(o => {
      let stn = (o.station || 'UNKNOWN').trim().toUpperCase();
      if (stn === "KIRA DIVISION" || stn === "KIRA DIV" || stn === "KIRA") stn = "KIRA DIV";

      const reg = getOfficialRegionForStation(stn, o.region);
      const targetReg = regionSummary[reg] || regionSummary["GENERAL / OTHER"];
      
      targetReg.officers += 1;
      const sex = (o.sex || '').trim().toUpperCase();
      if (sex.startsWith('F')) targetReg.female += 1;
      else targetReg.male += 1;

      const rank = (o.rank || 'UNRANKED').trim().toUpperCase();
      targetReg.ranks[rank] = (targetReg.ranks[rank] || 0) + 1;

      if (!targetReg.stations[stn]) {
        targetReg.stations[stn] = { station: stn, officers: 0, male: 0, female: 0, ranks: {}, crimes: 0, arrests: 0 };
      }
      targetReg.stations[stn].officers += 1;
      if (sex.startsWith('F')) targetReg.stations[stn].female += 1;
      else targetReg.stations[stn].male += 1;
      targetReg.stations[stn].ranks[rank] = (targetReg.stations[stn].ranks[rank] || 0) + 1;
    });

    crimes.forEach(c => {
      let stn = (c.station || 'UNKNOWN').trim().toUpperCase();
      if (stn === "KIRA DIVISION" || stn === "KIRA DIV" || stn === "KIRA") stn = "KIRA DIV";

      const reg = getOfficialRegionForStation(stn, c.region);
      const targetReg = regionSummary[reg] || regionSummary["GENERAL / OTHER"];
      targetReg.crimes += 1;

      if (!targetReg.stations[stn]) {
        targetReg.stations[stn] = { station: stn, officers: 0, male: 0, female: 0, ranks: {}, crimes: 0, arrests: 0 };
      }
      targetReg.stations[stn].crimes += 1;
    });

    ops.forEach(op => {
      let stn = (op.station || 'UNKNOWN').trim().toUpperCase();
      if (stn === "KIRA DIVISION" || stn === "KIRA DIV" || stn === "KIRA") stn = "KIRA DIV";

      const reg = getOfficialRegionForStation(stn, op.region);
      const targetReg = regionSummary[reg] || regionSummary["GENERAL / OTHER"];
      const arrestsCount = Number(op.arrests || op.suspects || 1);
      targetReg.arrests += arrestsCount;

      if (!targetReg.stations[stn]) {
        targetReg.stations[stn] = { station: stn, officers: 0, male: 0, female: 0, ranks: {}, crimes: 0, arrests: 0 };
      }
      targetReg.stations[stn].arrests += arrestsCount;
    });

    return Object.values(regionSummary).map(item => ({
      ...item,
      crimePerOfficer: item.officers > 0 ? (item.crimes / item.officers).toFixed(2) : '0.00',
      arrestsPerOfficer: item.officers > 0 ? (item.arrests / item.officers).toFixed(2) : '0.00',
      dominantRank: Object.entries(item.ranks).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A',
      stationList: Object.values(item.stations).map(stn => ({
        ...stn,
        crimePerOfficer: stn.officers > 0 ? (stn.crimes / stn.officers).toFixed(2) : '0.00',
        arrestsPerOfficer: stn.officers > 0 ? (stn.arrests / stn.officers).toFixed(2) : '0.00',
        dominantRank: Object.entries(stn.ranks).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A'
      }))
    }));
  }, [resolvedNominalRolls, resolvedCrimeRegistry, resolvedOperationalStats]);

  const manpowerGrandTotals = useMemo(() => {
    const totalOfficers = comprehensiveManpowerAnalysis.reduce((sum, r) => sum + r.officers, 0);
    const totalMale = comprehensiveManpowerAnalysis.reduce((sum, r) => sum + r.male, 0);
    const totalFemale = comprehensiveManpowerAnalysis.reduce((sum, r) => sum + r.female, 0);
    const totalCrimes = comprehensiveManpowerAnalysis.reduce((sum, r) => sum + r.crimes, 0);
    const totalArrests = comprehensiveManpowerAnalysis.reduce((sum, r) => sum + r.arrests, 0);

    return {
      totalOfficers,
      totalMale,
      totalFemale,
      totalCrimes,
      crimePerOfficer: totalOfficers > 0 ? (totalCrimes / totalOfficers).toFixed(2) : '0.00',
      arrestsPerOfficer: totalOfficers > 0 ? (totalArrests / totalOfficers).toFixed(2) : '0.00'
    };
  }, [comprehensiveManpowerAnalysis]);

  const currentDataset = useMemo(() => {
    let baseData = [];
    if (activeDomain === 'CRIME' || activeDomain === 'CRIME_SUMMARY') baseData = resolvedCrimeRegistry.filter(r => !isLockupLog(r)); 
    else if (activeDomain === 'MANPOWER_DEEP') baseData = resolvedNominalRolls;
    else if (activeDomain === 'SUCCESS') baseData = resolvedSuccessStories;
    else if (activeDomain === 'OPERATIONS') baseData = resolvedOperationalStats;

    baseData = baseData.filter(item => {
      let stn = (item.station || '').trim().toUpperCase();
      if (stn === "KIRA DIVISION" || stn === "KIRA DIV" || stn === "KIRA") stn = "KIRA DIV";
      const reg = getOfficialRegionForStation(stn, item.region);

      if (canViewGlobalActive && selectedRegion === 'ALL REGIONS' && selectedStation === 'ALL STATIONS') {
        return true;
      }

      if (selectedRegion !== 'ALL REGIONS' && reg !== selectedRegion.toUpperCase()) return false;
      if (selectedStation !== 'ALL STATIONS' && stn !== selectedStation.toUpperCase()) return false;
      return true;
    });

    if (activeDomain !== 'MANPOWER_DEEP' && activeDomain !== 'RELATIONAL' && dateFilter !== 'ALL') {
      const now = new Date();
      baseData = baseData.filter(item => {
        const itemDateStr = item.date || item.createdAt || item.timestamp;
        if (!itemDateStr) return true; 
        const itemDate = new Date(itemDateStr);
        if (isNaN(itemDate)) return true;

        if (dateFilter === 'TODAY' || dateFilter === 'today') return itemDate.toDateString() === now.toDateString();
        if (dateFilter === 'WEEK' || dateFilter === 'week') {
          const weekAgo = new Date();
          weekAgo.setDate(now.getDate() - 7);
          return itemDate >= weekAgo && itemDate <= now;
        }
        if (dateFilter === 'MONTH') return itemDate.getMonth() === now.getMonth() && itemDate.getFullYear() === now.getFullYear();
        if (dateFilter === 'YEAR') return itemDate.getFullYear() === now.getFullYear();
        return true;
      });
    }
    return baseData;
  }, [activeDomain, resolvedCrimeRegistry, resolvedNominalRolls, resolvedSuccessStories, resolvedOperationalStats, dateFilter, selectedRegion, selectedStation, canViewGlobalActive]);

  const aggregatedData = useMemo(() => {
    const grouped = {};
    currentDataset.forEach(item => {
      let key = 'UNCLASSIFIED';
      if (activeDomain === 'CRIME') {
        if (metricCategory === 'CATEGORY') key = normalizeOffenceCategory(item.crime_category || item.offence || 'GENERAL CRIME');
        else if (metricCategory === 'CASES') key = (item.status || 'PENDING').toUpperCase();
        else if (metricCategory === 'STATION') key = (item.station || 'UNKNOWN STATION').toUpperCase();
      } else if (activeDomain === 'SUCCESS') {
        key = (item.impact_type || item.category || 'COMMUNITY RECOVERY').toUpperCase();
      } else if (activeDomain === 'OPERATIONS') {
        key = (item.operation_type || item.outcome || item.category || 'SNAP OPERATION / DISRUPTIVE SWEEP').toUpperCase();
      }

      if (!grouped[key]) grouped[key] = { label: key, count: 0 };
      grouped[key].count += 1;
    });

    return Object.values(grouped).sort((a, b) => b.count - a.count);
  }, [currentDataset, activeDomain, metricCategory]);

  const crimeSummaryData = useMemo(() => {
    const crimeCounts = {};
    currentDataset.forEach(report => {
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
  }, [currentDataset]);

  const totalRecords = useMemo(() => aggregatedData.reduce((acc, curr) => acc + curr.count, 0), [aggregatedData]);
  const crimeSummaryGrandTotal = useMemo(() => crimeSummaryData.reduce((sum, item) => sum + item.total, 0), [crimeSummaryData]);

  const pieSlices = useMemo(() => {
    if (totalRecords === 0) return [];
    let cumulativePercent = 0;
    return aggregatedData.map((item, index) => {
      const percent = item.count / totalRecords;
      const startAngle = cumulativePercent * 360;
      cumulativePercent += percent;
      const endAngle = cumulativePercent * 360;
      const x1 = 50 + 40 * Math.cos((Math.PI * (startAngle - 90)) / 180);
      const y1 = 50 + 40 * Math.sin((Math.PI * (startAngle - 90)) / 180);
      const x2 = 50 + 40 * Math.cos((Math.PI * (endAngle - 90)) / 180);
      const y2 = 50 + 40 * Math.sin((Math.PI * (endAngle - 90)) / 180);
      const largeArcFlag = percent > 0.5 ? 1 : 0;
      const pathData = totalRecords === 1 || percent === 1 ? "M 50 10 A 40 40 0 1 1 49.99 10 Z" : `M 50 50 L ${x1} ${y1} A 40 40 0 ${largeArcFlag} 1 ${x2} ${y2} Z`;
      return { label: item.label, count: item.count, percent: (percent * 100).toFixed(1), color: CHART_COLORS[index % CHART_COLORS.length], pathData };
    });
  }, [aggregatedData, totalRecords]);

  const getWeekIdentifier = (dateStr) => {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    const target = new Date(d.valueOf());
    const dayNr = (d.getDay() + 6) % 7;
    target.setDate(target.getDate() - dayNr + 3);
    const firstThursday = new Date(target.getFullYear(), 0, 4);
    const weekNr = Math.ceil((((target - firstThursday) / 86400000) + 1) / 7);
    return `${target.getFullYear()}-W${String(weekNr).padStart(2, '0')}`;
  };

  const relationalImpactMatrix = useMemo(() => {
    const reports = Array.isArray(resolvedCrimeRegistry) ? resolvedCrimeRegistry.filter(r => !isLockupLog(r)) : [];
    const ops = Array.isArray(resolvedOperationalStats) ? resolvedOperationalStats : [];
    const successes = Array.isArray(resolvedSuccessStories) ? resolvedSuccessStories : [];

    const regionMap = {};

    Object.keys(REGIONAL_HIERARCHY).forEach(reg => {
      regionMap[reg] = { region: reg, stations: {}, totalArrests: 0, totalSuccesses: 0, crimeCount: 0 };
      REGIONAL_HIERARCHY[reg].forEach(stn => {
        regionMap[reg].stations[stn] = { station: stn, arrests: 0, successes: 0, crimes: 0 };
      });
    });

    ops.forEach(o => {
      let stn = (o.station || '').trim().toUpperCase();
      if (stn === "KIRA DIVISION" || stn === "KIRA DIV" || stn === "KIRA") stn = "KIRA DIV";

      const reg = getOfficialRegionForStation(stn, o.region);
      const arrestsCount = Number(o.arrests || o.suspects || o.suspects_arrested || 1);
      
      if (regionMap[reg] && regionMap[reg].stations[stn]) {
        regionMap[reg].stations[stn].arrests += arrestsCount;
        regionMap[reg].totalArrests += arrestsCount;
      }
    });

    successes.forEach(s => {
      let stn = (s.station || '').trim().toUpperCase();
      if (stn === "KIRA DIVISION" || stn === "KIRA DIV" || stn === "KIRA") stn = "KIRA DIV";

      const reg = getOfficialRegionForStation(stn, s.region);
      if (regionMap[reg] && regionMap[reg].stations[stn]) {
        regionMap[reg].stations[stn].successes += 1;
        regionMap[reg].totalSuccesses += 1;
      }
    });

    reports.forEach(r => {
      let stn = (r.station || '').trim().toUpperCase();
      if (stn === "KIRA DIVISION" || stn === "KIRA DIV" || stn === "KIRA") stn = "KIRA DIV";

      const reg = getOfficialRegionForStation(stn, r.region);
      if (regionMap[reg] && regionMap[reg].stations[stn]) {
        regionMap[reg].stations[stn].crimes += 1;
        regionMap[reg].crimeCount += 1;
      }
    });

    const rows = [];
    Object.values(regionMap).forEach(regObj => {
      if (selectedRegion !== 'ALL REGIONS' && regObj.region !== selectedRegion) return;

      let hasMatchingStation = false;
      const stationRows = [];

      Object.values(regObj.stations).forEach(stnObj => {
        if (selectedStation !== 'ALL STATIONS' && stnObj.station !== selectedStation) return;
        if (stnObj.arrests > 0 || stnObj.successes > 0 || stnObj.crimes > 0) {
          hasMatchingStation = true;
          stationRows.push({
            isRegionHeader: false,
            region: regObj.region,
            station: stnObj.station,
            arrests: stnObj.arrests,
            successes: stnObj.successes,
            crimes: stnObj.crimes,
            disruptionRating: stnObj.arrests >= stnObj.crimes ? 'POSITIVE IMPACT (CRIME SUPPRESSED)' : 'ACTIVE SWEEP'
          });
        }
      });

      if (hasMatchingStation || selectedStation === 'ALL STATIONS') {
        rows.push({
          isRegionHeader: true,
          region: regObj.region,
          station: `${regObj.region} (REGIONAL COMMAND)`,
          arrests: regObj.totalArrests,
          successes: regObj.totalSuccesses,
          crimes: regObj.crimeCount,
          disruptionRating: regObj.totalArrests > 10 ? 'HIGH DISRUPTION' : 'MODERATE'
        });
        rows.push(...stationRows);
      }
    });

    return rows;
  }, [resolvedCrimeRegistry, resolvedOperationalStats, resolvedSuccessStories, selectedRegion, selectedStation]);

  const operationsTrendsData = useMemo(() => {
    const ops = Array.isArray(resolvedOperationalStats) ? resolvedOperationalStats : [];
    const stationWeeks = {};
    const allWeeksSet = new Set();

    ops.forEach(o => {
      let stn = (o.station || 'UNKNOWN').trim().toUpperCase();
      if (stn === "KIRA DIVISION" || stn === "KIRA DIV" || stn === "KIRA") stn = "KIRA DIV";

      const reg = getOfficialRegionForStation(stn, o.region);

      if (selectedRegion !== 'ALL REGIONS' && reg !== selectedRegion) return;
      if (selectedStation !== 'ALL STATIONS' && stn !== selectedStation) return;

      const weekId = getWeekIdentifier(o.date || o.timestamp);
      if (!weekId) return;
      allWeeksSet.add(weekId);

      if (!stationWeeks[stn]) stationWeeks[stn] = { region: reg, station: stn, weeks: {} };
      if (!stationWeeks[stn].weeks[weekId]) stationWeeks[stn].weeks[weekId] = { arrests: 0, opsCount: 0 };
      
      stationWeeks[stn].weeks[weekId].arrests += Number(o.arrests || o.suspects || 1);
      stationWeeks[stn].weeks[weekId].opsCount += 1;
    });

    const sortedWeeks = Array.from(allWeeksSet).sort();
    const currentWeek = sortedWeeks[sortedWeeks.length - 1] || 'N/A';
    const previousWeek = sortedWeeks[sortedWeeks.length - 2] || 'N/A';

    const rows = Object.values(stationWeeks).map(item => {
      const cur = item.weeks[currentWeek] || { arrests: 0, opsCount: 0 };
      const prev = item.weeks[previousWeek] || { arrests: 0, opsCount: 0 };
      const diffArrests = cur.arrests - prev.arrests;

      return {
        region: item.region,
        station: item.station,
        currentArrests: cur.arrests,
        previousArrests: prev.arrests,
        diffArrests
      };
    });

    return { rows: rows.sort((a, b) => b.currentArrests - a.currentArrests), currentWeek, previousWeek };
  }, [resolvedOperationalStats, selectedRegion, selectedStation]);

const handleExportExcel = async () => {
    try {
      const wb = XLSX.utils.book_new();
      const forensicTimestamp = new Date().toISOString();

      // Extract explicit officer credentials
      const officerFnum = (currentUser?.fnum || 'HQ-UNKNOWN').trim().toUpperCase();
      const officerRank = (currentUser?.rank || 'OFFICER').trim().toUpperCase();
      const officerName = (currentUser?.name || 'UNKNOWN').trim().toUpperCase();
      const officerSignature = `${officerFnum} ${officerRank} ${officerName}`;
      const commandPost = `${currentUser?.station || 'KMP HEADQUARTERS'}, ${currentUser?.region || 'KMP HEADQUARTERS'}`;
      
      const forensicId = `KMP-STAMP-${officerFnum}-${Date.now().toString(36).toUpperCase()}`;
      const cryptographicToken = btoa(JSON.stringify({
        fnum: officerFnum,
        rank: officerRank,
        name: officerName,
        station: currentUser?.station || 'HQ',
        region: currentUser?.region || 'KMP HEADQUARTERS',
        timestamp: forensicTimestamp,
        stamp_id: forensicId
      }));

      // 🟢 1. Inject Immutable OOXML Core & Custom Properties
      wb.Props = {
        Title: "KMP Relational Operations & Manpower Audit",
        Subject: `Exported by Force No: ${officerFnum}`,
        Author: officerSignature,
        LastAuthor: officerSignature,
        Keywords: `KMP_CSDMS_AUDIT_STAMP;FNUM:${officerFnum};TOKEN:${cryptographicToken}`,
        Comments: `Certified Law Enforcement Export. Originating Officer: ${officerSignature} [${commandPost}] at ${forensicTimestamp}. Stamp ID: ${forensicId}`,
        Category: "RESTRICTED / FORENSIC POLICE RECORD",
        Company: "Uganda Police Force - Kampala Metropolitan Command",
        CreatedDate: new Date()
      };

      wb.Custprops = {
        "OriginatingOfficer": officerSignature,
        "ForceNumber": officerFnum,
        "OfficerRank": officerRank,
        "OfficerName": officerName,
        "ExportTimestamp": forensicTimestamp,
        "CommandJurisdiction": commandPost,
        "AuditStampID": forensicId,
        "CryptographicVerificationToken": cryptographicToken
      };

      // 🟢 2. Primary Visible Forensic Audit Sheet
      const metaSheetData = [
        ["KAMPALA METROPOLITAN POLICE - CENTRAL SECURITY DATA MANAGEMENT SYSTEM"],
        ["OFFICIAL FORENSIC ANALYTICS & RELATIONAL IMPACT REPORT"],
        [""],
        ["Export Timestamp (EAT):", forensicTimestamp],
        ["Authorized Exporting Officer:", officerSignature],
        ["Force Number (F/NO):", officerFnum],
        ["Command Jurisdiction:", commandPost],
        ["Security Classification:", "RESTRICTED / ENCRYPTED LAW ENFORCEMENT RECORD"],
        ["Cryptographic System Stamp ID:", forensicId],
        ["Encrypted Forensic Token:", cryptographicToken]
      ];

      const wsMeta = XLSX.utils.aoa_to_sheet(metaSheetData);
      wsMeta['!cols'] = [{ wch: 34 }, { wch: 70 }];
      XLSX.utils.book_append_sheet(wb, wsMeta, "Forensic Audit Stamp");

      // 🟢 3. Relational Impact Data Sheet
      if (relationalImpactMatrix.length > 0) {
        const relationalData = relationalImpactMatrix.map(row => ({
          "Command Region": row.region,
          "Station / Division": row.station,
          "Snap Arrests / Disruptive Ops": row.arrests,
          "Success Breakthroughs": row.successes,
          "Active Crime Volume": row.crimes,
          "Operational Impact Status": row.disruptionRating
        }));
        const wsRel = XLSX.utils.json_to_sheet(relationalData);
        wsRel['!cols'] = [{ wch: 22 }, { wch: 30 }, { wch: 28 }, { wch: 30 }, { wch: 22 }, { wch: 35 }];
        XLSX.utils.book_append_sheet(wb, wsRel, "Relational Impact Stats");
      }

      // 🟢 4. Deep Manpower Analysis Data Sheet
      if (comprehensiveManpowerAnalysis.length > 0) {
        const manpowerData = comprehensiveManpowerAnalysis.map(row => ({
          "Command Region": row.region,
          "Total Officers": row.officers,
          "Male Personnel": row.male,
          "Female Personnel": row.female,
          "Dominant Rank": row.dominantRank,
          "Recorded Crimes": row.crimes,
          "Crime / Officer Ratio": row.crimePerOfficer,
          "Arrests / Officer Ratio": row.arrestsPerOfficer
        }));
        const wsMan = XLSX.utils.json_to_sheet(manpowerData);
        wsMan['!cols'] = [{ wch: 24 }, { wch: 16 }, { wch: 16 }, { wch: 18 }, { wch: 16 }, { wch: 18 }, { wch: 22 }, { wch: 22 }];
        XLSX.utils.book_append_sheet(wb, wsMan, "Deep Manpower Analysis");
      }

      // 🟢 5. Generate and Download Workbook
      const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array', props: true });
      const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const filename = `KMP_Relational_Operations_Report_${new Date().toISOString().split('T')[0]}.xlsx`;
      
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      setTimeout(() => { 
        document.body.removeChild(link); 
        window.URL.revokeObjectURL(downloadUrl); 
      }, 2000);

      alert(`🔒 Forensic stamp compiled. Originating Officer: ${officerSignature}`);
    } catch (error) {
      alert(`Export Failed: ${error.message}`);
    }
  };

  return (
    <div className="p-3 max-w-[1600px] mx-auto space-y-3 font-sans min-h-screen" style={{ backgroundColor: '#f4eee2' }}>
      
      {/* Top Header Card */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-[#fbf8f3] px-4 py-2.5 rounded-xl shadow-xs border border-[#e2d6c3] gap-2">
        <div>
          <h1 className="text-lg font-extrabold text-[#3a3225] tracking-tight">KMP Relational Operations & Intelligence Dashboard</h1>
          <p className="text-[11px] text-[#736450] font-medium">Tracking the dependency matrix: Disruptive Snap Operations ➔ Information Acquisition ➔ Asset Recovery & Gang Dismantling.</p>
        </div>
        <button onClick={handleExportExcel} className="bg-[#596E47] hover:bg-[#4A5D4E] text-white px-3 py-1.5 rounded-lg font-bold text-[11px] shadow-xs transition flex items-center space-x-1.5 cursor-pointer shrink-0">
          <span>📥 Download Relational Report (Excel)</span>
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
          { id: 'OPERATIONS', label: '⚡ Disruptive Ops' },
          { id: 'RELATIONAL', label: '🔗 Relational Matrix' },
          { id: 'MANPOWER_DEEP', label: '🛡️ Manpower Analysis' },
          { id: 'SUCCESS', label: '🌟 Success Stories' },
          { id: 'CRIME', label: '📊 Crime Categories' },
          { id: 'CRIME_SUMMARY', label: '📋 Summary Table' },
          { id: 'TRENDS', label: '📈 Ops Trends' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => { setActiveDomain(tab.id); setMetricCategory('CATEGORY'); }}
            className={`px-2.5 py-2 rounded-lg font-bold text-[11px] transition border text-left shadow-xs cursor-pointer truncate ${
              activeDomain === tab.id ? 'bg-[#3a3225] text-[#f4eee2] border-[#3a3225]' : 'bg-[#fbf8f3] text-[#594d3c] border-[#e2d6c3] hover:bg-[#f1ebd9]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Filter Toolbar */}
      <div className="bg-[#fbf8f3] px-3 py-2 rounded-lg shadow-xs border border-[#e2d6c3] flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <span className="text-[11px] font-bold text-[#736450] uppercase flex items-center">
            <Filter size={12} className="mr-1 text-[#596E47]" /> Filters:
          </span>

          <select 
            value={selectedRegion} 
            onChange={(e) => { setSelectedRegion(e.target.value); setSelectedStation('ALL STATIONS'); }}
            disabled={!canViewGlobalActive}
            className="border border-[#e2d6c3] rounded-md px-2 py-1 text-[11px] font-bold text-[#3a3225] bg-white outline-none cursor-pointer disabled:bg-[#f4eee2] disabled:text-[#736450]"
          >
            {canViewGlobalActive ? (
              <>
                <option value="ALL REGIONS">ALL REGIONS</option>
                {Object.keys(REGIONAL_HIERARCHY).map(reg => (
                  <option key={reg} value={reg}>{reg}</option>
                ))}
              </>
            ) : (
              <option value={currentUser?.region || 'KMP HEADQUARTERS'}>{currentUser?.region || 'KMP HEADQUARTERS'}</option>
            )}
          </select>

          <select 
            value={selectedStation} 
            onChange={(e) => setSelectedStation(e.target.value)}
            disabled={!canViewGlobalActive}
            className="border border-[#e2d6c3] rounded-md px-2 py-1 text-[11px] font-bold text-[#3a3225] bg-white outline-none cursor-pointer disabled:bg-[#f4eee2] disabled:text-[#736450]"
          >
            {canViewGlobalActive ? (
              <>
                <option value="ALL STATIONS">ALL STATIONS</option>
                {selectedRegion !== 'ALL REGIONS' && (REGIONAL_HIERARCHY[selectedRegion] || []).map(stn => (
                  <option key={stn} value={stn}>{stn}</option>
                ))}
              </>
            ) : (
              <option value={currentUser?.station || 'KMP HEADQUARTERS'}>{currentUser?.station || 'KMP HEADQUARTERS'}</option>
            )}
          </select>

          {activeDomain !== 'RELATIONAL' && activeDomain !== 'MANPOWER_DEEP' && (
            <select 
              value={dateFilter} 
              onChange={(e) => setDateFilter(e.target.value)}
              className="border border-[#e2d6c3] rounded-md px-2 py-1 text-[11px] font-bold text-[#3a3225] bg-white outline-none cursor-pointer"
            >
              <option value="ALL">All Time</option>
              <option value="TODAY">Today Only</option>
              <option value="WEEK">This Week (Last 7 Days)</option>
              <option value="MONTH">This Month</option>
              <option value="YEAR">This Year</option>
            </select>
          )}
        </div>

        <span className="text-[11px] font-extrabold text-[#596E47] bg-[#e9eedf] px-2 py-0.5 rounded border border-[#cfe1b9]">
          Total: {activeDomain === 'RELATIONAL' ? relationalImpactMatrix.length : activeDomain === 'MANPOWER_DEEP' ? comprehensiveManpowerAnalysis.length : activeDomain === 'CRIME_SUMMARY' ? crimeSummaryGrandTotal : totalRecords}
        </span>
      </div>

      {/* Main View Area */}
      {activeDomain === 'RELATIONAL' ? (
        <div className="space-y-3">
          <div className="bg-[#3a3225] rounded-xl p-3.5 text-[#f4eee2] shadow-sm border border-[#534735]">
            <h2 className="text-sm font-extrabold flex items-center tracking-wide text-[#f4eee2]">
              <Network className="mr-2 text-[#C5A880] w-4 h-4" /> Operations ➔ Intelligence ➔ Crime Suppression Dependency Matrix
            </h2>
            <p className="text-[11px] text-[#b8ab97] mt-0.5 leading-tight">
              Demonstrating operational impact: Snap sweeps in crime hotspots generate arrests, answer pending cases, and recover stolen property.
            </p>
          </div>

          <div className="bg-[#fbf8f3] rounded-xl shadow-xs border border-[#e2d6c3] overflow-hidden">
            <div className="overflow-x-auto w-full">
              <table className="min-w-full divide-y divide-[#e2d6c3]">
                <thead className="bg-[#efece6]">
                  <tr>
                    <th className="px-3 py-2 text-left text-[11px] font-bold text-[#594d3c] uppercase">Command Region</th>
                    <th className="px-3 py-2 text-left text-[11px] font-bold text-[#594d3c] uppercase">Station / Hotspot Division</th>
                    <th className="px-3 py-2 text-center text-[11px] font-bold text-[#594d3c] uppercase">Snap Arrests</th>
                    <th className="px-3 py-2 text-center text-[11px] font-bold text-[#594d3c] uppercase">Recoveries</th>
                    <th className="px-3 py-2 text-center text-[11px] font-bold text-[#594d3c] uppercase">Active Crime</th>
                    <th className="px-3 py-2 text-center text-[11px] font-bold text-[#594d3c] uppercase">Impact Status</th>
                  </tr>
                </thead>
                <tbody className="bg-[#fbf8f3] divide-y divide-[#e2d6c3]">
                  {relationalImpactMatrix.map((row, index) => {
                    if (row.isRegionHeader) {
                      return (
                        <tr key={`reg-${index}`} className="bg-[#efece6] font-extrabold text-[#3a3225] border-t border-[#d3c2a8]">
                          <td className="px-3 py-2 text-[11px] uppercase tracking-wider" colSpan="2">🛡️ {row.station}</td>
                          <td className="px-3 py-2 text-center font-black text-[#596E47] text-[11px]">{row.arrests} Arrests</td>
                          <td className="px-3 py-2 text-center font-black text-amber-800 text-[11px]">{row.successes} Breakthroughs</td>
                          <td className="px-3 py-2 text-center font-bold text-[11px]">{row.crimes} Crimes</td>
                          <td className="px-3 py-2 text-center">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#3a3225] text-[#f4eee2]">{row.disruptionRating}</span>
                          </td>
                        </tr>
                      );
                    }
                    return (
                      <tr key={`stn-${index}`} className="hover:bg-[#e9eedf]/30">
                        <td className="px-3 py-1.5 pl-6 text-[11px] font-bold text-[#736450] uppercase">{row.region}</td>
                        <td className="px-3 py-1.5 text-[11px] font-bold text-[#594d3c]">— {row.station}</td>
                        <td className="px-3 py-1.5 text-[11px] text-center font-bold text-[#596E47]">{row.arrests}</td>
                        <td className="px-3 py-1.5 text-[11px] text-center font-bold text-amber-800">{row.successes}</td>
                        <td className="px-3 py-1.5 text-[11px] text-center font-bold text-[#3a3225]">{row.crimes}</td>
                        <td className="px-3 py-1.5 text-center text-[11px]">
                          <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-[#e9eedf] text-[#3b4c2e]">{row.disruptionRating}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : activeDomain === 'MANPOWER_DEEP' ? (
        <div className="space-y-3">
          <div className="bg-[#3a3225] rounded-xl p-3.5 text-[#f4eee2] shadow-sm border border-[#534735]">
            <h2 className="text-sm font-extrabold flex items-center tracking-wide text-[#f4eee2]">
              <Users className="mr-2 text-[#C5A880] w-4 h-4" /> Deep Manpower Multi-Relational Analysis
            </h2>
            <p className="text-[11px] text-[#b8ab97] mt-0.5 leading-tight">
              Analyzing force distribution across multiple parameters: Strength, Gender ratios, Dominant ranks, Crime workload, and Arrest efficiency. Click a region to view stations.
            </p>
          </div>

          <div className="bg-[#fbf8f3] rounded-xl shadow-xs border border-[#e2d6c3] overflow-hidden">
            <table className="min-w-full divide-y divide-[#e2d6c3]">
              <thead className="bg-[#efece6]">
                <tr>
                  <th className="px-3 py-2 text-left text-[11px] font-bold text-[#594d3c] uppercase">Command Region / Division</th>
                  <th className="px-3 py-2 text-center text-[11px] font-bold text-[#594d3c] uppercase">Total Officers</th>
                  <th className="px-3 py-2 text-center text-[11px] font-bold text-[#594d3c] uppercase">Male / Female</th>
                  <th className="px-3 py-2 text-center text-[11px] font-bold text-[#594d3c] uppercase">Dominant Rank</th>
                  <th className="px-3 py-2 text-center text-[11px] font-bold text-[#594d3c] uppercase">Recorded Crimes</th>
                  <th className="px-3 py-2 text-center text-[11px] font-bold text-[#594d3c] uppercase">Crime / Officer</th>
                  <th className="px-3 py-2 text-center text-[11px] font-bold text-[#594d3c] uppercase">Arrests / Officer</th>
                </tr>
              </thead>
              <tbody className="bg-[#fbf8f3] divide-y divide-[#e2d6c3]">
                {comprehensiveManpowerAnalysis.map((row, index) => {
                  const isExpanded = !!expandedManpowerRegions[row.region];
                  const hasStations = row.stationList && row.stationList.length > 0;

                  return (
                    <React.Fragment key={index}>
                      <tr 
                        onClick={() => toggleManpowerRegion(row.region)}
                        className="hover:bg-[#e9eedf]/50 cursor-pointer transition-colors border-t border-[#e2d6c3] select-none"
                      >
                        <td className="px-3 py-2 text-[11px] font-extrabold text-[#3a3225] uppercase flex items-center space-x-1.5">
                          <span className="text-[#596E47]">
                            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </span>
                          <span>{row.region}</span>
                        </td>
                        <td className="px-3 py-2 text-[11px] text-center font-black text-[#596E47]">{row.officers}</td>
                        <td className="px-3 py-2 text-[11px] text-center font-bold text-[#736450]">👨‍✈️ {row.male} | 👩‍✈️ {row.female}</td>
                        <td className="px-3 py-2 text-[11px] text-center font-bold text-amber-900 uppercase">{row.dominantRank}</td>
                        <td className="px-3 py-2 text-[11px] text-center font-bold text-slate-800">{row.crimes}</td>
                        <td className="px-3 py-2 text-[11px] text-center font-extrabold text-blue-800">{row.crimePerOfficer}</td>
                        <td className="px-3 py-2 text-[11px] text-center font-extrabold text-emerald-800">{row.arrestsPerOfficer}</td>
                      </tr>

                      {isExpanded && hasStations && row.stationList.map((stn, sIdx) => (
                        <tr key={`stn-sub-${sIdx}`} className="bg-[#f7f3eb] hover:bg-[#ece6d8] transition-colors border-t border-[#e2d6c3]/60">
                          <td className="px-3 py-1.5 pl-8 text-[11px] font-semibold text-[#594d3c] uppercase flex items-center space-x-1.5">
                            <span className="text-[10px] text-[#8c7b65]">↳</span>
                            <span>{stn.station}</span>
                          </td>
                          <td className="px-3 py-1.5 text-[11px] text-center font-bold text-[#596E47]">{stn.officers}</td>
                          <td className="px-3 py-1.5 text-[11px] text-center text-[#736450]">👨‍✈️ {stn.male} | 👩‍✈️ {stn.female}</td>
                          <td className="px-3 py-1.5 text-[11px] text-center text-amber-900 uppercase">{stn.dominantRank}</td>
                          <td className="px-3 py-1.5 text-[11px] text-center text-slate-700">{stn.crimes}</td>
                          <td className="px-3 py-1.5 text-[11px] text-center font-semibold text-blue-700">{stn.crimePerOfficer}</td>
                          <td className="px-3 py-1.5 text-[11px] text-center font-semibold text-emerald-700">{stn.arrestsPerOfficer}</td>
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                })}
              </tbody>

              <tfoot className="bg-[#efece6] border-t-2 border-[#d3c2a8]">
                <tr className="font-extrabold text-[#3a3225]">
                  <td className="px-3 py-2.5 text-[11px] uppercase tracking-wider">GRAND TOTAL</td>
                  <td className="px-3 py-2.5 text-[11px] text-center font-black text-[#596E47]">{manpowerGrandTotals.totalOfficers}</td>
                  <td className="px-3 py-2.5 text-[11px] text-center font-bold text-[#736450]">👨‍✈️ {manpowerGrandTotals.totalMale} | 👩‍✈️ {manpowerGrandTotals.totalFemale}</td>
                  <td className="px-3 py-2.5 text-[11px] text-center font-bold text-amber-900 uppercase">OVERALL</td>
                  <td className="px-3 py-2.5 text-[11px] text-center font-bold text-slate-800">{manpowerGrandTotals.totalCrimes}</td>
                  <td className="px-3 py-2.5 text-[11px] text-center font-black text-blue-900">{manpowerGrandTotals.crimePerOfficer}</td>
                  <td className="px-3 py-2.5 text-[11px] text-center font-black text-emerald-900">{manpowerGrandTotals.arrestsPerOfficer}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      ) : activeDomain === 'TRENDS' ? (
        <div className="space-y-3">
          <div className="bg-[#3a3225] rounded-xl p-3.5 text-[#f4eee2] shadow-sm flex justify-between items-center">
            <div>
              <h2 className="text-sm font-extrabold">Week-to-Week Disruptive Operations & Arrest Trends</h2>
              <p className="text-[11px] text-[#b8ab97] mt-0.5">Comparing snap sweeps ({operationsTrendsData.previousWeek} vs {operationsTrendsData.currentWeek})</p>
            </div>
          </div>

          <div className="bg-[#fbf8f3] rounded-xl shadow-xs border border-[#e2d6c3] overflow-hidden">
            <table className="min-w-full divide-y divide-[#e2d6c3]">
              <thead className="bg-[#efece6]">
                <tr>
                  <th className="px-3 py-2 text-left text-[11px] font-bold text-[#594d3c] uppercase">Region</th>
                  <th className="px-3 py-2 text-left text-[11px] font-bold text-[#594d3c] uppercase">Station / Post</th>
                  <th className="px-3 py-2 text-center text-[11px] font-bold text-[#594d3c] uppercase">Previous Arrests</th>
                  <th className="px-3 py-2 text-center text-[11px] font-bold text-[#594d3c] uppercase">Current Arrests</th>
                  <th className="px-3 py-2 text-center text-[11px] font-bold text-[#594d3c] uppercase">Arrests Variance</th>
                </tr>
              </thead>
              <tbody className="bg-[#fbf8f3] divide-y divide-[#e2d6c3]">
                {operationsTrendsData.rows.map((row, index) => (
                  <tr key={index} className="hover:bg-[#e9eedf]/30">
                    <td className="px-3 py-1.5 text-[11px] font-bold text-[#736450] uppercase">{row.region}</td>
                    <td className="px-3 py-1.5 text-[11px] font-bold text-[#3a3225]">{row.station}</td>
                    <td className="px-3 py-1.5 text-[11px] text-center">{row.previousArrests}</td>
                    <td className="px-3 py-1.5 text-[11px] text-center font-bold text-[#596E47]">{row.currentArrests}</td>
                    <td className={`px-3 py-1.5 text-[11px] text-center font-extrabold ${row.diffArrests >= 0 ? 'text-[#596E47]' : 'text-amber-800'}`}>
                      {row.diffArrests > 0 ? `+${row.diffArrests}` : row.diffArrests}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : activeDomain === 'CRIME_SUMMARY' ? (
        <div className="space-y-3">
          <div className="bg-[#3a3225] rounded-xl p-3.5 text-[#f4eee2] shadow-sm border border-[#534735]">
            <h2 className="text-sm font-extrabold flex items-center tracking-wide text-[#f4eee2]">
              <BarChart3 className="mr-2 text-[#C5A880] w-4 h-4" /> Standalone Crime Incident Summary Table
            </h2>
            <p className="text-[11px] text-[#b8ab97] mt-0.5 leading-tight">
              Consolidated frequency count of crime incidents recorded across selected jurisdictions.
            </p>
          </div>

          <div className="bg-[#fbf8f3] rounded-xl shadow-xs border border-[#e2d6c3] overflow-hidden">
            <table className="min-w-full divide-y divide-[#e2d6c3]">
              <thead className="bg-[#3a3225]">
                <tr>
                  <th className="px-3 py-2 text-left text-[11px] font-bold text-[#f4eee2] uppercase tracking-wider w-12">SN</th>
                  <th className="px-3 py-2 text-left text-[11px] font-bold text-[#f4eee2] uppercase tracking-wider">Incident / Offence</th>
                  <th className="px-3 py-2 text-right text-[11px] font-bold text-[#f4eee2] uppercase tracking-wider">Total Reported</th>
                </tr>
              </thead>
              <tbody className="bg-[#fbf8f3] divide-y divide-[#e2d6c3]">
                {crimeSummaryData.length > 0 ? (
                  crimeSummaryData.map((row) => (
                    <tr key={row.sn} className="hover:bg-[#e9eedf]/40 transition-colors">
                      <td className="px-3 py-1.5 text-[11px] font-bold text-[#736450]">{row.sn}</td>
                      <td className="px-3 py-1.5 text-[11px] font-bold text-[#3a3225] uppercase">{row.incident}</td>
                      <td className="px-3 py-1.5 text-[11px] font-extrabold text-[#596E47] text-right">{row.total}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="3" className="px-3 py-4 text-center text-[11px] text-[#736450] font-medium">
                      No crimes reported for these specific filters.
                    </td>
                  </tr>
                )}
              </tbody>
              {crimeSummaryData.length > 0 && (
                <tfoot className="bg-[#efece6] border-t-2 border-[#d3c2a8]">
                  <tr>
                    <td colSpan="2" className="px-3 py-2 text-right text-[11px] font-extrabold text-[#3a3225] uppercase">
                      Grand Total
                    </td>
                    <td className="px-3 py-2 text-right text-xs font-extrabold text-amber-800">
                      {crimeSummaryGrandTotal}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            
            <div className="bg-[#fbf8f3] p-3.5 rounded-xl shadow-xs border border-[#e2d6c3] flex flex-col items-center justify-between">
              <h3 className="text-xs font-bold text-[#3a3225] uppercase tracking-wide w-full text-left mb-2 flex items-center">
                <PieChart size={14} className="mr-1.5 text-[#596E47]" /> Proportional Share
              </h3>
              
              <div className="relative w-36 h-36 my-1">
                {totalRecords > 0 ? (
                  <svg viewBox="0 0 100 100" className="w-full h-full transform -rotate-90 drop-shadow-xs">
                    {pieSlices.map((slice, idx) => (
                      <path key={idx} d={slice.pathData} fill={slice.color} className="transition-all duration-300 hover:opacity-80 cursor-pointer" />
                    ))}
                  </svg>
                ) : (
                  <div className="w-full h-full rounded-full border-2 border-dashed border-[#e2d6c3] flex items-center justify-center text-[10px] text-[#736450] font-bold">No Data</div>
                )}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-[10px] text-[#736450] font-bold uppercase">Total</span>
                  <span className="text-sm font-extrabold text-[#3a3225]">{totalRecords}</span>
                </div>
              </div>

              <div className="w-full mt-2 max-h-28 overflow-y-auto custom-scrollbar space-y-1 pr-1 border-t border-[#e2d6c3] pt-2">
                {pieSlices.map((slice, idx) => (
                  <div key={idx} className="flex items-center justify-between text-[11px] font-bold text-[#594d3c] px-2 py-1 bg-[#f4eee2] rounded border border-[#e2d6c3]/50">
                    <div className="flex items-center space-x-1.5 truncate">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: slice.color }}></span>
                      <span className="truncate uppercase">{slice.label}</span>
                    </div>
                    <span className="text-[#736450] font-mono shrink-0 ml-2">{slice.count} ({slice.percent}%)</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-[#fbf8f3] p-3.5 rounded-xl shadow-xs border border-[#e2d6c3] space-y-2">
              <h3 className="text-xs font-bold text-[#3a3225] uppercase tracking-wide flex items-center">
                <BarChart3 size={14} className="mr-1.5 text-[#596E47]" /> Comparative Distribution & Volume
              </h3>
              <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1 custom-scrollbar">
                {aggregatedData.map((item, idx) => {
                  const percentage = totalRecords > 0 ? (item.count / totalRecords) * 100 : 0;
                  return (
                    <div key={idx} className="space-y-0.5">
                      <div className="flex justify-between text-[11px] font-bold text-[#594d3c]">
                        <span className="truncate pr-2 uppercase">{item.label}</span>
                        <span className="text-[#596E47] shrink-0">{item.count} ({percentage.toFixed(1)}%)</span>
                      </div>
                      <div className="w-full bg-[#efece6] h-2 rounded-full overflow-hidden shadow-inner">
                        <div className="bg-[#596E47] h-full rounded-full transition-all duration-500" style={{ width: `${Math.max(percentage, 2)}%` }}></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};

export default AnalyticsDashboard;