// src/components/AnalyticsDashboard.jsx
import React, { useState, useMemo, useEffect } from 'react';
import { BarChart3, TrendingUp, TrendingDown, Calendar, Shield, Filter, ArrowUpRight, ArrowDownRight, PieChart as PieChartIcon, Clock, Users, Award, MapPin, Zap, CheckCircle2, GitCommit, Network, Loader2, BookOpen, ChevronDown, ChevronRight, Download, Truck, Scale, Lock, Car, AlertTriangle, Flame } from 'lucide-react';
import { authFetch, hasValidSession } from './api';
import { stripHtmlTags } from './App';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';

const REGIONAL_HIERARCHY = {
  "KMP NORTH": ["KMP NORTH HEADQUARTERS", "KAWEMPE", "KAKIRI", "KASANGATI", "MATUGGA", "NANSANA", "OLD KAMPALA", "WAKISO", "WANDEGEYA"],
  "KMP EAST": ["KMP EAST HEADQUARTERS", "JINJA ROAD", "KIRA", "KIRA DIV", "KIRA ROAD", "MUKONO", "NAGGALAMA", "SEETA"],
  "KMP SOUTH": ["KMP SOUTH HEADQUARTERS", "NATEETE", "CPS KAMPALA", "PARLIAMENT", "ENTEBBE", "KABALAGALA", "KAJJANSI", "KASENYI", "KATWE", "KYENGERA", "NSANGI"],
  "KMP HEADQUARTERS": ["KMP HEADQUARTERS", "FLYING SQUAD", "CRIME INTELLIGENCE"],
  "POLICE HEADQUARTERS": ["NAGURU"]
};

const PIE_COLORS = ['#596E47', '#A97142'];
const PIE_STATUS_COLORS = ['#3a3225', '#b8ab97'];

const isLockupLog = (item) => {
  if (!item) return false;
  return item.is_hq_general_total || 
         (item.station || '').includes('HEADQUARTERS GENERAL TOTAL') || 
         (item.daily_lock_up !== undefined && item.daily_lock_up !== null && Number(item.daily_lock_up) > 0);
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

const aggregateTimeSeries = (records, dateField, valueFields) => {
    if (!Array.isArray(records)) return { weekly: [], monthly: [] };
    const weeklyMap = {};
    const monthlyMap = {};

    records.forEach(r => {
        if (!r) return;
        const dStr = r[dateField];
        if (!dStr) return;
        try {
            const dt = new Date(dStr);
            if (isNaN(dt)) return;

            const weekKey = `${dt.getFullYear()}-W${String(Math.ceil(dt.getDate() / 7)).padStart(2, '0')}`;
            const monthKey = dt.toLocaleString('default', { month: 'short', year: 'numeric' });

            if (!weeklyMap[weekKey]) weeklyMap[weekKey] = { period: weekKey, count: 0 };
            if (!monthlyMap[monthKey]) monthlyMap[monthKey] = { period: monthKey, count: 0 };

            weeklyMap[weekKey].count += 1;
            monthlyMap[monthKey].count += 1;

            valueFields.forEach(vf => {
                if (!weeklyMap[weekKey][vf]) weeklyMap[weekKey][vf] = 0;
                if (!monthlyMap[monthKey][vf]) monthlyMap[monthKey][vf] = 0;
                weeklyMap[weekKey][vf] += Number(r[vf] || 0);
                monthlyMap[monthKey][vf] += Number(r[vf] || 0);
            });
        } catch (e) {}
    });

    return {
        weekly: Object.values(weeklyMap).sort((a, b) => a.period.localeCompare(b.period)),
        monthly: Object.values(monthlyMap)
    };
};

const AnalyticsDashboard = ({ 
  nominalRolls = [], 
  nominal_rolls = [], 
  crimeRegistry = [], 
  reports = [], 
  successStories = [], 
  impoundedExhibits = [], 
  lockupMatrix = [], 
  accidents = [], 
  fireIncidents = [], 
  operationalStats = [], 
  stats = [], 
  currentUser, 
  canViewGlobal = false 
}) => {
  const [fetchedRolls, setFetchedRolls] = useState([]);
  const [fetchedCrime, setFetchedCrime] = useState([]);
  const [fetchedOps, setFetchedOps] = useState([]);
  const [fetchedExhibits, setFetchedExhibits] = useState([]); 
  const [fetchedAccidents, setFetchedAccidents] = useState([]);
  const [fetchedSuccessStories, setFetchedSuccessStories] = useState([]);
  const [fetchedFireIncidents, setFetchedFireIncidents] = useState([]);

  const userRoleClean = stripHtmlTags(currentUser?.role || '').toUpperCase();
  const userPosClean = stripHtmlTags(currentUser?.position || '').toUpperCase();
  const userRegClean = stripHtmlTags(currentUser?.region || '').toUpperCase();

  const isSuperAdmin = userRoleClean === 'SUPER_ADMIN' || userRoleClean === 'ADMIN';
  const isGlobalTier = isSuperAdmin || 
    ['ASSISTANT_SUPER_ADMIN'].includes(userRoleClean) || 
    ['KMP COMMANDER', 'DEPUTY KMP COMMANDER', 'KMP ADMIN OFFICER'].includes(userPosClean) || 
    currentUser?.permissions?.view_global_roster === true ||
    !currentUser;

  const isKmpSystemManager = userRoleClean === 'SYSTEM_MANAGER' && ['KMP HEADQUARTERS', 'POLICE HEADQUARTERS'].includes(userRegClean) && userPosClean.includes('KMP');
  const isKmpSpecialist = userRoleClean === 'ASSISTANT_SYSTEM_MANAGER' && ['KMP HEADQUARTERS', 'POLICE HEADQUARTERS'].includes(userRegClean) && userPosClean.includes('KMP');

  const canViewGlobalLevel = canViewGlobal || isGlobalTier || isKmpSystemManager || isKmpSpecialist;

  const [selectedRegion, setSelectedRegion] = useState(canViewGlobalLevel || !currentUser ? 'ALL REGIONS' : (userRegClean || 'KMP HEADQUARTERS'));
  const [selectedStation, setSelectedStation] = useState('ALL STATIONS');

  const [backendDetentionCalendar, setBackendDetentionCalendar] = useState({ dates: [], dateMap: {}, regionDemographics: [], regionDuration: [], dailyMargins: [] });
  const [backendSuccessStories, setBackendSuccessStories] = useState([]);
  const [backendFireIntelligence, setBackendFireIntelligence] = useState({ totalFires: 0, totalDeaths: 0, totalInjuries: 0, fireList: [] });
  const [backendCrimeCategories, setBackendCrimeCategories] = useState([]);

  const [loading, setLoading] = useState(false);
  const [expandedManpowerRegion, setExpandedManpowerRegion] = useState(null);
  const [expandedCrimeRegion, setExpandedCrimeRegion] = useState(null);
  const [selectedDetentionDate, setSelectedDetentionDate] = useState(null);

  const toggleManpowerRegion = (regionName) => setExpandedManpowerRegion(prev => (prev === regionName ? null : regionName));
  const toggleCrimeRegion = (regionName) => setExpandedCrimeRegion(prev => (prev === regionName ? null : regionName));

  useEffect(() => {
    let isMounted = true;
    const fetchData = async () => {
      if (!hasValidSession()) return;
      setLoading(true);
      try {
        const intelParam = `?region=${encodeURIComponent(selectedRegion)}&station=${encodeURIComponent(selectedStation)}`;

        const [rollRes, crimeRes, statsRes, exhibitsRes, accidentsRes, intelRes] = await Promise.all([
          authFetch('/api/v1/nominal-roll').catch(() => null),
          authFetch('/api/v1/reports').catch(() => null),
          authFetch('/api/v1/stats').catch(() => null),
          authFetch('/api/v1/exhibits').catch(() => null),
          authFetch('/api/v1/accidents').catch(() => null),
          authFetch(`/api/v1/analytics/dashboard-intelligence${intelParam}`).catch(() => null)
        ]);

        const rollData = rollRes && rollRes.ok ? await rollRes.json() : [];
        const crimeData = crimeRes && crimeRes.ok ? await crimeRes.json() : [];
        const statsData = statsRes && statsRes.ok ? await statsRes.json() : [];
        const exhibitsData = exhibitsRes && exhibitsRes.ok ? await exhibitsRes.json() : [];
        const accidentsData = accidentsRes && accidentsRes.ok ? await accidentsRes.json() : [];
        const intelData = intelRes && intelRes.ok ? await intelRes.json() : null;

        if (isMounted) {
          setFetchedRolls(Array.isArray(rollData) ? rollData : []);
          setFetchedCrime(Array.isArray(crimeData) ? crimeData : []);
          setFetchedOps(Array.isArray(statsData) ? statsData : []);
          setFetchedExhibits(Array.isArray(exhibitsData) ? exhibitsData : []);
          setFetchedAccidents(Array.isArray(accidentsData) ? accidentsData : []);

          if (intelData) {
            if (intelData.detentionCalendar) {
              setBackendDetentionCalendar({
                dates: Array.isArray(intelData.detentionCalendar.dates) ? intelData.detentionCalendar.dates : [],
                dateMap: intelData.detentionCalendar.dateMap || {},
                regionDemographics: Array.isArray(intelData.detentionCalendar.regionDemographics) ? intelData.detentionCalendar.regionDemographics : [],
                regionDuration: Array.isArray(intelData.detentionCalendar.regionDuration) ? intelData.detentionCalendar.regionDuration : [],
                dailyMargins: Array.isArray(intelData.detentionCalendar.dailyMargins) ? intelData.detentionCalendar.dailyMargins : []
              });
              if (Array.isArray(intelData.detentionCalendar.dates) && intelData.detentionCalendar.dates.length > 0) {
                setSelectedDetentionDate(intelData.detentionCalendar.dates[0]);
              } else {
                setSelectedDetentionDate(null);
              }
            }
            if (Array.isArray(intelData.successStoriesProcessed)) {
              setBackendSuccessStories(intelData.successStoriesProcessed);
              setFetchedSuccessStories(intelData.successStoriesProcessed);
            }
            if (intelData.fireIntelligence) {
              setBackendFireIntelligence({
                totalFires: intelData.fireIntelligence.totalFires || 0,
                totalDeaths: intelData.fireIntelligence.totalDeaths || 0,
                totalInjuries: intelData.fireIntelligence.totalInjuries || 0,
                fireList: Array.isArray(intelData.fireIntelligence.fireList) ? intelData.fireIntelligence.fireList : []
              });
            }
            if (Array.isArray(intelData.crimeCategoryData)) setBackendCrimeCategories(intelData.crimeCategoryData);
            if (Array.isArray(intelData.exhibitsData)) setFetchedExhibits(intelData.exhibitsData);
            if (Array.isArray(intelData.accidentsData)) setFetchedAccidents(intelData.accidentsData);
          }
        }
      } catch (err) {
        if (err.message !== 'UNAUTHORIZED') console.error("Failed to fetch analytics data from NeonDB:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchData();
    return () => { isMounted = false; };
  }, [selectedRegion, selectedStation]);

  const resolvedNominalRolls = (Array.isArray(nominalRolls) && nominalRolls.length) ? nominalRolls : ((Array.isArray(nominal_rolls) && nominal_rolls.length) ? nominal_rolls : fetchedRolls);
  const resolvedCrimeRegistry = (Array.isArray(crimeRegistry) && crimeRegistry.length) ? crimeRegistry : ((Array.isArray(reports) && reports.length) ? reports : fetchedCrime);
  const resolvedOperationalStats = (Array.isArray(operationalStats) && operationalStats.length) ? operationalStats : ((Array.isArray(stats) && stats.length) ? stats : fetchedOps);
  const resolvedExhibits = (Array.isArray(impoundedExhibits) && impoundedExhibits.length) ? impoundedExhibits : fetchedExhibits;
  const resolvedSuccessStories = (Array.isArray(successStories) && successStories.length) ? successStories : fetchedSuccessStories;
  const resolvedAccidents = (Array.isArray(accidents) && accidents.length) ? accidents : fetchedAccidents;

  const [activeDomain, setActiveDomain] = useState('SUCCESS');
  const [selectedMonth, setSelectedMonth] = useState('ALL');
  const [dateFilter, setDateFilter] = useState('ALL'); 

  const timeFilteredData = (list) => {
    if (!Array.isArray(list)) return [];
    const now = new Date();
    return list.filter(item => {
      if (!item) return false;
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
  };

  const timeFilteredDataset = useMemo(() => {
    let baseData = [];
    if (activeDomain === 'CRIME' || activeDomain === 'CRIME_SUMMARY') baseData = resolvedCrimeRegistry.filter(r => !isLockupLog(r)); 
    else if (activeDomain === 'MANPOWER_DEEP') baseData = resolvedNominalRolls;
    else if (activeDomain === 'SUCCESS') baseData = resolvedSuccessStories;
    else if (activeDomain === 'OPERATIONS') baseData = resolvedOperationalStats;
    else if (activeDomain === 'EXHIBITS') baseData = resolvedExhibits;
    else if (activeDomain === 'ACCIDENTS') baseData = resolvedAccidents;
    else if (activeDomain === 'FIRES') baseData = resolvedCrimeRegistry; 
    else baseData = resolvedCrimeRegistry;

    if (!Array.isArray(baseData)) return [];

    return baseData.filter(item => {
      if (!item) return false;
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
      if (selectedStation !== 'ALL STATIONS' && !isStationEquivalent(stn, selectedStation)) return false;
      return true;
    });
  }, [activeDomain, resolvedCrimeRegistry, resolvedNominalRolls, resolvedSuccessStories, resolvedOperationalStats, resolvedExhibits, resolvedAccidents, selectedRegion, selectedStation, canViewGlobalLevel, userRegClean]);

  // 🟢 AUTO-FALLBACK ENGINES: Extracts data dynamically from raw Props if Backend is empty
  const displaySuccessStories = useMemo(() => {
    if (backendSuccessStories.length > 0) return backendSuccessStories;

    const parseIntelligence = (htmlText) => {
      const cleanStr = stripHtmlTags(htmlText || '').replace(/&nbsp;/g, ' ').trim();
      if (!cleanStr) return { suspects: 0, recoveries: 'NO ITEMS LISTED' };
      
      const lower = cleanStr.toLowerCase();
      let parsedSuspects = 0;

      const wordsToNum = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, twenty: 20 };
      const extractNum = (val) => isNaN(val) ? (wordsToNum[val.toLowerCase()] || 0) : parseInt(val, 10);

      const forwardRegex = /(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(?:notorious\s+|armed\s+|hardcore\s+|suspected\s+|male\s+|female\s+)?(?:suspects?|persons?|thieves|robbers|criminals?|individuals?)/i;
      const backwardRegex = /(?:arrested|apprehended|detained|held|caught|intercepted|custody)\s+(?:of\s+|a\s+total\s+of\s+)?(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)/i;

      const matchA = lower.match(forwardRegex);
      const matchB = lower.match(backwardRegex);

      if (matchA) {
        parsedSuspects = extractNum(matchA[1]);
      } else if (matchB) {
        parsedSuspects = extractNum(matchB[1]);
      } else if (/(suspects|thieves|robbers)/i.test(lower)) {
        parsedSuspects = 2;
      } else if (/(suspect|thief|robber)/i.test(lower)) {
        parsedSuspects = 1;
      }

      let parsedRecoveries = cleanStr.length > 70 ? cleanStr.substring(0, 70) + '...' : cleanStr;
      const recoveryRegex = /(?:recovery of|recovered|seized|impounded|rescued|exhibited)\s+([^,.;]+(?:kgs?|kilograms?|litres?|jerricans?|sacks?|pieces?|cows?|goats?|motorcycles?|vehicles?|cars?|phones?|tvs?|televisions?|cartons?|guns?|ammunition|weapons?|drugs?|suspected stolen))/i;
      const itemOnlyRegex = /(\d+|one|two|three|four|five)\s+(?:kgs?|kilograms?|litres?|jerricans?|sacks?|pieces?|cows?|goats?|motorcycles?|vehicles?|cars?|phones?|tvs?|televisions?|cartons?|guns?|ammunition|weapons?)/i;

      const rMatch = lower.match(recoveryRegex);
      const iMatch = lower.match(itemOnlyRegex);

      if (rMatch && rMatch[1]) {
        parsedRecoveries = rMatch[1].trim().toUpperCase();
      } else if (iMatch) {
        parsedRecoveries = iMatch[0].toUpperCase();
      }

      return { suspects: parsedSuspects, recoveries: parsedRecoveries };
    };

    return timeFilteredData(resolvedSuccessStories).map(st => {
      const intel = parseIntelligence(st.narrative);
      return {
        station: st.station || 'UNKNOWN',
        region: st.region || 'UNKNOWN',
        parsedSuspects: (st.suspects && st.suspects > 0) ? st.suspects : intel.suspects,
        parsedClassification: st.category || 'GENERAL OPERATIONS',
        parsedRecoveries: intel.recoveries,
        parsedLegalStatus: st.status || 'COMPLETED / SUCCESS'
      };
    });
  }, [backendSuccessStories, resolvedSuccessStories, selectedMonth, dateFilter]);

  const displayCrimeCategories = useMemo(() => {
    if (backendCrimeCategories.length > 0) return backendCrimeCategories;
    const tfCrimes = timeFilteredData(resolvedCrimeRegistry).filter(r => !isLockupLog(r));
    const map = {};
    tfCrimes.forEach(c => {
        const reg = c.region || 'UNKNOWN';
        const cat = c.category || 'GENERAL';
        if (!map[reg]) map[reg] = { region: reg, totalCrimes: 0, categories: {} };
        map[reg].totalCrimes++;
        map[reg].categories[cat] = (map[reg].categories[cat] || 0) + 1;
    });
    return Object.values(map).map(r => ({
        region: r.region,
        totalCrimes: r.totalCrimes,
        categoryList: Object.entries(r.categories).map(([name, count]) => ({ name, count }))
    })).sort((a,b) => b.totalCrimes - a.totalCrimes);
  }, [backendCrimeCategories, resolvedCrimeRegistry, selectedMonth, dateFilter]);

  const displayFireIncidents = useMemo(() => {
    if (backendFireIntelligence.fireList && backendFireIntelligence.fireList.length > 0) return backendFireIntelligence.fireList;
    const tfFires = timeFilteredData(resolvedCrimeRegistry).filter(r => (r.category || '').toUpperCase().includes('FIRE') || (r.offence || '').toUpperCase().includes('FIRE'));
    return tfFires.map(f => {
      const cleanSummary = stripHtmlTags(f.narrative || '').replace(/&nbsp;/g, ' ').trim();
      return {
        station: f.station || 'UNKNOWN',
        region: f.region || 'UNKNOWN',
        classification: f.category || 'FIRE OUTBREAK',
        deaths: f.fatal_fires || 0,
        injuries: f.victims || 0,
        summary: cleanSummary || 'No summary provided.'
      };
    });
  }, [backendFireIntelligence.fireList, resolvedCrimeRegistry, selectedMonth, dateFilter]);

  const displayFireTotals = useMemo(() => {
    if (backendFireIntelligence.totalFires > 0) return backendFireIntelligence;
    return {
        totalFires: displayFireIncidents.length,
        totalDeaths: displayFireIncidents.reduce((sum, f) => sum + (Number(f.deaths)||0), 0),
        totalInjuries: displayFireIncidents.reduce((sum, f) => sum + (Number(f.injuries)||0), 0)
    };
  }, [backendFireIntelligence, displayFireIncidents]);

  const accidentsTimeSeriesData = useMemo(() => {
      return aggregateTimeSeries(timeFilteredDataset, 'date', ['minor', 'serious', 'fatal', 'victims', 'total']);
  }, [timeFilteredDataset]);

  const selectedDayLockup = useMemo(() => {
    if (!selectedDetentionDate || !backendDetentionCalendar.dateMap[selectedDetentionDate]) {
      return { total: 0, stations: [] };
    }
    return backendDetentionCalendar.dateMap[selectedDetentionDate];
  }, [selectedDetentionDate, backendDetentionCalendar]);

  const manpowerAnalysis = useMemo(() => {
    const rolls = Array.isArray(resolvedNominalRolls) ? resolvedNominalRolls : [];
    const regionMap = {};

    const officerRanks = ['CP', 'ACP', 'SSP', 'SP', 'SASP', 'ASP', 'IP', 'AIP'];
    const ncoRanks = ['HCM', 'HC', 'S/SGT', 'SSGT', 'SGT', 'CPL', 'L/CPL', 'PC', 'PPC', 'SPC'];
    const allRanks = [...officerRanks, ...ncoRanks];

    let totalActive = 0, totalInactive = 0;
    let totalMale = 0, totalFemale = 0;

    Object.keys(REGIONAL_HIERARCHY).forEach(reg => {
      regionMap[reg] = { region: reg, totalDeployable: 0, stations: {} };
    });
    regionMap["GENERAL / OTHER"] = { region: "GENERAL / OTHER", totalDeployable: 0, stations: {} };

    rolls.forEach(o => {
      if (!o) return;
      let stn = stripHtmlTags(o.station || 'UNKNOWN').toUpperCase();
      if (stn === "KIRA DIVISION" || stn === "KIRA DIV" || stn === "KIRA") stn = "KIRA DIV";
      const reg = getOfficialRegionForStation(stn, o.region);
      const sex = (o.sex || 'M').toUpperCase();
      const rank = (o.rank || 'PC').toUpperCase();
      
      const statusStr = (o.status || o.deployment_status || o.remarks || 'ACTIVE').toUpperCase();
      const isInactive = ['SICK', 'LEAVE', 'MATERN', 'MISSION', 'SUSPEND', 'AWOL', 'COURSE', 'UNDEPLOY'].some(x => statusStr.includes(x));

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

      if (isInactive) totalInactive++; else totalActive++;
      if (sex.includes('F')) totalFemale++; else totalMale++;

      const targetReg = regionMap[reg] || regionMap["GENERAL / OTHER"];
      if (!targetReg.stations[stn]) {
        targetReg.stations[stn] = { station: stn, totalDeployable: 0, active: 0, inactive: 0, ranks: {} };
        allRanks.forEach(r => targetReg.stations[stn].ranks[r] = { M: 0, F: 0 });
      }

      targetReg.stations[stn].totalDeployable += 1;
      if (isInactive) targetReg.stations[stn].inactive += 1; else targetReg.stations[stn].active += 1;
      
      if (targetReg.stations[stn].ranks[rank]) {
        if (sex.includes('F')) targetReg.stations[stn].ranks[rank].F += 1;
        else targetReg.stations[stn].ranks[rank].M += 1;
      }
      
      targetReg.totalDeployable += 1;
    });

    const rows = Object.values(regionMap).filter(r => r.totalDeployable > 0).map(item => ({
      ...item,
      stationList: Object.values(item.stations).filter(s => s.totalDeployable > 0).sort((a,b) => a.station.localeCompare(b.station))
    }));

    return { 
      rows, allRanks, totalActive, totalInactive, totalMale, totalFemale,
      pieDeployData: [{ name: 'Active', value: totalActive }, { name: 'Inactive', value: totalInactive }],
      pieGenderData: [{ name: 'Male', value: totalMale }, { name: 'Female', value: totalFemale }]
    };
  }, [resolvedNominalRolls, selectedRegion, selectedStation, canViewGlobalLevel, userRegClean]);

  const exhibitGroupedData = useMemo(() => {
    const tf = timeFilteredData(resolvedExhibits);
    const map = {};
    tf.forEach(ex => {
      if (!ex) return;
      const cat = (ex.category || 'GENERAL').toUpperCase();
      const reg = (ex.region || 'KMP GENERAL').toUpperCase();
      const div = (ex.division || ex.station || 'N/A').toUpperCase();
      const stn = (ex.station || 'N/A').toUpperCase();
      const status = (ex.status || 'IMPOUNDED').toUpperCase();
      
      const descRaw = ex.type_make || '';
      const colRaw = ex.colour || '';
      let desc = `${descRaw} - ${colRaw}`.replace(/^ - | - $/g, '').trim().toUpperCase();
      if (!desc) desc = "UNSPECIFIED";

      if (canViewGlobalLevel && selectedRegion !== 'ALL REGIONS' && reg !== selectedRegion.toUpperCase()) return;
      if (selectedStation !== 'ALL STATIONS' && !isStationEquivalent(stn, selectedStation)) return;

      const key = `${cat}|${desc}|${reg}|${div}|${stn}|${status}`;
      map[key] = (map[key] || 0) + 1;
    });

    return Object.entries(map).map(([k, total]) => {
      const [category, desc, region, division, station, status] = k.split('|');
      return { category, desc, region, division, station, status, total };
    }).sort((a, b) => b.total - a.total);
  }, [resolvedExhibits, selectedRegion, selectedStation, selectedMonth, dateFilter, canViewGlobalLevel]);

  const summaryAggregates = useMemo(() => {
    const ops = timeFilteredData(resolvedOperationalStats);
    const ss = Array.isArray(displaySuccessStories) ? displaySuccessStories : [];
    const cr = timeFilteredData(resolvedCrimeRegistry).filter(r => !isLockupLog(r));
    const ex = timeFilteredData(resolvedExhibits);
    const nom = Array.isArray(resolvedNominalRolls) ? resolvedNominalRolls : [];
    const acc = timeFilteredData(resolvedAccidents);

    const calculatedFireTotal = backendFireIntelligence.totalFires > 0 
      ? backendFireIntelligence.totalFires 
      : (Array.isArray(displayFireIncidents) ? displayFireIncidents.length : 0);

    return {
      disruptiveOps: ops.length,
      manpowerTotal: nom.length,
      successOccasions: ss.length,
      totalExhibits: ex.length,
      totalDetentions: Object.values(backendDetentionCalendar.dateMap || {}).reduce((acc, curr) => acc + (curr.total || 0), 0),
      totalAccidents: acc.length,
      totalFires: calculatedFireTotal,
      totalArrests: ops.reduce((acc, curr) => acc + (Number(curr.arrests || curr.suspects || curr.arrested) || 0), 0),
      totalCrimes: cr.length
    };
  }, [resolvedOperationalStats, displaySuccessStories, resolvedCrimeRegistry, resolvedExhibits, resolvedNominalRolls, backendDetentionCalendar, resolvedAccidents, displayFireIncidents, backendFireIntelligence, selectedMonth, dateFilter]);

  const opsChartData = useMemo(() => {
    const regMap = {};
    const tfOps = timeFilteredData(resolvedOperationalStats);
    const tfCrimes = timeFilteredData(resolvedCrimeRegistry).filter(r => !isLockupLog(r));

    tfOps.forEach(o => {
      if (!o) return;
      const reg = getOfficialRegionForStation(o.station, o.region);
      if (canViewGlobalLevel && selectedRegion !== 'ALL REGIONS' && reg !== selectedRegion.toUpperCase()) return;
      if (!regMap[reg]) regMap[reg] = { name: reg, Arrests: 0, Crimes: 0 };
      regMap[reg].Arrests += (Number(o.arrests || o.suspects || o.arrested) || 0);
    });

    tfCrimes.forEach(c => {
      if (!c) return;
      const reg = getOfficialRegionForStation(c.station, c.region);
      if (canViewGlobalLevel && selectedRegion !== 'ALL REGIONS' && reg !== selectedRegion.toUpperCase()) return;
      if (!regMap[reg]) regMap[reg] = { name: reg, Arrests: 0, Crimes: 0 };
      regMap[reg].Crimes += 1;
    });

    return Object.values(regMap).sort((a, b) => b.Crimes - a.Crimes);
  }, [resolvedOperationalStats, resolvedCrimeRegistry, selectedRegion, selectedStation, canViewGlobalLevel]);

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

  const RADIAN = Math.PI / 180;
  const renderCustomizedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
    return (
      <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" className="text-[10px] font-bold">
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };

  return (
    <div className="p-2 max-w-[1600px] mx-auto space-y-2 font-sans min-h-screen pb-16 overflow-x-hidden" style={{ backgroundColor: '#f4eee2' }}>
        
      {/* Top Header Card */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-[#fbf8f3] px-3 py-2 rounded-xl shadow-xs border border-[#e2d6c3] gap-2">
        <div>
          <h1 className="text-base font-extrabold text-[#3a3225] tracking-tight">KMP Relational Operations & Intelligence Dashboard</h1>
          <p className="text-[10px] text-[#736450] font-medium">Monthly aggregates, crime categories, suspect legal statuses, open-ended recoveries, fire incidents, daily detentions, and accident analytics.</p>
        </div>
        <button onClick={handleExportExcel} className="bg-[#596E47] hover:bg-[#4A5D4E] text-white px-2.5 py-1 rounded-lg font-bold text-[10px] shadow-xs transition flex items-center space-x-1 cursor-pointer shrink-0">
          <Download size={13} className="mr-1" />
          <span>Download Relational Report (ZIP)</span>
        </button>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-1.5 px-3 bg-amber-50 rounded-lg border border-amber-200">
          <Loader2 className="w-4 h-4 animate-spin text-amber-600" />
        </div>
      )}

      {/* Tabs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-9 gap-1">
        {[
          { id: 'SUCCESS', label: '🌟 Success Stories' },
          { id: 'CRIME', label: '📊 Crime Categories' },
          { id: 'EXHIBITS', label: '🚚 Exhibits' },
          { id: 'DETENTIONS', label: '🔒 Detentions' },
          { id: 'ACCIDENTS', label: '🚓 Accidents' },
          { id: 'FIRES', label: '🔥 Fire Incidents' },
          { id: 'SUMMARY', label: '📋 Summary Table' },
          { id: 'OPERATIONS', label: '⚡ Disruptive Ops' },
          { id: 'MANPOWER_DEEP', label: '🛡️ Manpower Analysis' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveDomain(tab.id)}
            className={`px-2 py-1.5 rounded-lg font-bold text-[10px] transition border text-center shadow-xs cursor-pointer truncate ${
              activeDomain === tab.id ? 'bg-[#3a3225] text-[#f4eee2] border-[#3a3225]' : 'bg-[#fbf8f3] text-[#594d3c] border-[#e2d6c3] hover:bg-[#f1ebd9]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Filter Toolbar */}
      <div className="bg-[#fbf8f3] px-3 py-1.5 rounded-lg shadow-xs border border-[#e2d6c3] flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-bold text-[#736450] uppercase flex items-center">
            <Filter size={11} className="mr-1 text-[#596E47]" /> Filters:
          </span>

          <select value={selectedRegion} onChange={(e) => { if (canViewGlobalLevel) { setSelectedRegion(e.target.value); setSelectedStation('ALL STATIONS'); } }} disabled={!canViewGlobalLevel} className="border border-[#e2d6c3] rounded-md px-2 py-0.5 text-[10px] font-bold text-[#3a3225] bg-white outline-none cursor-pointer">
            <option value="ALL REGIONS">ALL REGIONS</option>
            {Object.keys(REGIONAL_HIERARCHY).map(reg => <option key={reg} value={reg}>{reg}</option>)}
          </select>

          <select value={selectedStation} onChange={(e) => setSelectedStation(e.target.value)} className="border border-[#e2d6c3] rounded-md px-2 py-0.5 text-[10px] font-bold text-[#3a3225] bg-white outline-none cursor-pointer">
            <option value="ALL STATIONS">ALL STATIONS / DIVISIONS</option>
            {REGIONAL_HIERARCHY[selectedRegion]?.map(stn => <option key={stn} value={stn}>{stn}</option>)}
          </select>

          <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="border border-[#e2d6c3] rounded-md px-2 py-0.5 text-[10px] font-bold text-[#3a3225] bg-white outline-none cursor-pointer">
            <option value="ALL">All Months</option>
            <option value="2026-10">October 2026</option>
            <option value="2026-09">September 2026</option>
            <option value="2026-08">August 2026</option>
            <option value="2026-07">July 2026</option>
          </select>

          <select value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className="border border-[#e2d6c3] rounded-md px-2 py-0.5 text-[10px] font-bold text-[#3a3225] bg-white outline-none cursor-pointer">
            <option value="ALL">All Time Range</option>
            <option value="1DAY">Last 1 Day</option>
            <option value="7DAYS">Last 7 Days (1 Week)</option>
            <option value="30DAYS">Last 30 Days (1 Month)</option>
            <option value="90DAYS">Last 90 Days (3 Months)</option>
            <option value="1YEAR">Last 365 Days (1 Year)</option>
          </select>
        </div>

        <span className="text-[10px] font-extrabold text-[#596E47] bg-[#e9eedf] px-2 py-0.5 rounded border border-[#cfe1b9]">
          Total Entries: {activeDomain === 'SUCCESS' ? displaySuccessStories.length : activeDomain === 'CRIME' ? displayCrimeCategories.length : activeDomain === 'EXHIBITS' ? exhibitGroupedData.length : activeDomain === 'FIRES' ? displayFireIncidents.length : timeFilteredDataset.length}
        </span>
      </div>

      {/* SUCCESS STORIES TAB */}
      {activeDomain === 'SUCCESS' && (
        <div className="space-y-2 pb-8">
          <div className="bg-[#3a3225] rounded-xl p-3 text-[#f4eee2] shadow-sm border border-[#534735]">
            <h2 className="text-xs font-extrabold flex items-center tracking-wide text-[#f4eee2]">
              <Award className="mr-2 text-[#C5A880] w-3.5 h-3.5" /> Success Stories & Operational Breakthrough Summaries
            </h2>
            <p className="text-[10px] text-[#b8ab97] mt-0.5 leading-tight">
              Automatically extracting arrest numbers, classified breakthroughs, open-ended property recoveries, and suspect legal status directly from story narratives.
            </p>
          </div>

          <div className="bg-[#fbf8f3] rounded-xl shadow-xs border border-[#e2d6c3] overflow-hidden">
            <div className="max-h-[520px] overflow-y-auto custom-scrollbar w-full">
              <table className="w-full table-fixed divide-y divide-[#e2d6c3]">
                <thead className="sticky top-0 z-20">
                  <tr className="bg-gradient-to-b from-[#f4eee2] to-[#e6dfd1] text-[#3a3225] font-extrabold border-b-2 border-[#d3c2a8]">
                    <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wide border-r border-[#d3c2a8] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]" style={{ width: '18%' }}>Station / Region</th>
                    <th className="px-3 py-2 text-center text-[10px] uppercase tracking-wide border-r border-[#d3c2a8] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]" style={{ width: '12%' }}>Suspects Arrested</th>
                    <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wide border-r border-[#d3c2a8] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]" style={{ width: '28%' }}>Classified Breakthrough Summary</th>
                    <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wide border-r border-[#d3c2a8] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]" style={{ width: '26%' }}>Recovered Properties & Quantities</th>
                    <th className="px-3 py-2 text-center text-[10px] uppercase tracking-wide shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]" style={{ width: '16%' }}>Suspect Legal Status</th>
                  </tr>
                </thead>
                <tbody className="bg-[#fbf8f3] divide-y divide-[#e2d6c3]">
                  {displaySuccessStories.length > 0 ? (
                    displaySuccessStories.map((st, idx) => (
                      <tr key={idx} className="hover:bg-[#e9eedf]/30 align-top">
                        <td className="px-3 py-2 text-[10px] font-bold text-[#3a3225] border-r border-[#e2d6c3] whitespace-normal break-words">
                          {st.station}<br/><span className="text-[9px] text-[#736450] font-medium">{st.region}</span>
                        </td>
                        <td className="px-3 py-2 text-center font-bold text-[#596E47] text-[10px] border-r border-[#e2d6c3] whitespace-normal break-words">{st.parsedSuspects || 0}</td>
                        <td className="px-3 py-2 text-[10px] font-extrabold text-[#3a3225] uppercase border-r border-[#e2d6c3] whitespace-normal break-words">
                          {st.parsedClassification}
                        </td>
                        <td className="px-3 py-2 text-[10px] text-[#594d3c] font-bold border-r border-[#e2d6c3] whitespace-normal break-words">
                          {st.parsedRecoveries ? st.parsedRecoveries.split('||').map((item, i) => (
                            <div key={i} className="bg-white/60 px-2 py-0.5 my-0.5 rounded border border-[#e2d6c3] shadow-2xs whitespace-normal break-words">{item.trim()}</div>
                          )) : '-'}
                        </td>
                        <td className="px-3 py-2 text-center whitespace-normal break-words">
                          <span className="px-2 py-0.5 rounded text-[9px] font-extrabold bg-[#3a3225] text-[#f4eee2] uppercase tracking-wide shadow-xs inline-block">
                            {st.parsedLegalStatus || '-'}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr><td colSpan="5" className="text-center py-6 text-[10px] text-[#736450]">No success stories found matching your filter criteria.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* CRIME CATEGORIES TAB */}
      {activeDomain === 'CRIME' && (
        <div className="space-y-2 pb-8">
          <div className="bg-[#3a3225] rounded-xl p-3 text-[#f4eee2] shadow-sm border border-[#534735]">
            <h2 className="text-xs font-extrabold flex items-center tracking-wide text-[#f4eee2]">
              <BarChart3 className="mr-2 text-[#C5A880] w-3.5 h-3.5" /> Crime Categories & Aggregated Incident Analytics
            </h2>
            <p className="text-[10px] text-[#b8ab97] mt-0.5 leading-tight">
              Granular breakdown of offences dynamically tallied by Region and Offence Category.
            </p>
          </div>

          <div className="bg-[#fbf8f3] rounded-xl shadow-xs border border-[#e2d6c3] overflow-hidden">
             <div className="bg-[#efece6] px-3 py-1.5 border-b border-[#d3c2a8] flex items-center justify-between">
                <h3 className="text-[11px] font-black text-[#3a3225] uppercase">Aggregated Regional Crime Volumes</h3>
             </div>
             <div className="max-h-[520px] overflow-y-auto custom-scrollbar w-full">
               <table className="w-full table-fixed divide-y divide-[#e2d6c3]">
                  <thead className="sticky top-0 z-20">
                     <tr className="bg-gradient-to-b from-[#f4eee2] to-[#e6dfd1] text-[#3a3225] font-extrabold border-b-2 border-[#d3c2a8]">
                        <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wide border-r border-[#d3c2a8] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]" style={{ width: '75%' }}>Command Region</th>
                        <th className="px-3 py-2 text-center text-[10px] uppercase tracking-wide shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]" style={{ width: '25%' }}>Total Crimes Recorded</th>
                     </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e2d6c3]">
                     {displayCrimeCategories.map((reg) => {
                        const isExpanded = (expandedCrimeRegion === reg.region);
                        return (
                          <React.Fragment key={reg.region}>
                            <tr onClick={() => toggleCrimeRegion(reg.region)} className="bg-[#efece6]/50 hover:bg-[#e9eedf]/50 cursor-pointer transition-colors border-t border-[#d3c2a8]">
                               <td className="px-3 py-2 text-[10px] font-extrabold text-[#3a3225] uppercase flex items-center space-x-1.5 border-r border-[#e2d6c3] whitespace-normal break-words">
                                  <span className="text-[#596E47]">{isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</span>
                                  <span>{reg.region}</span>
                               </td>
                               <td className="px-3 py-2 text-[10px] text-center font-black text-amber-800">{reg.totalCrimes}</td>
                            </tr>
                            {isExpanded && Array.isArray(reg.categoryList) && reg.categoryList.map((cat, cIdx) => (
                               <tr key={`cat-${cIdx}`} className="bg-white align-top">
                                  <td className="px-3 py-1.5 pl-7 text-[10px] font-semibold text-[#594d3c] uppercase border-r border-[#e2d6c3] whitespace-normal break-words">— {cat.name}</td>
                                  <td className="px-3 py-1.5 text-[10px] text-center font-bold text-amber-700">{cat.count}</td>
                               </tr>
                            ))}
                          </React.Fragment>
                        );
                     })}
                     {displayCrimeCategories.length === 0 && (
                        <tr><td colSpan="2" className="text-center py-6 text-[10px] text-[#736450]">No crimes logged for the selected period.</td></tr>
                     )}
                  </tbody>
               </table>
             </div>
          </div>
        </div>
      )}

      {/* DETENTIONS ANALYSIS TAB */}
      {activeDomain === 'DETENTIONS' && (
        <div className="space-y-3 pb-8">
          <div className="bg-[#3a3225] rounded-xl p-3 text-[#f4eee2] shadow-sm border border-[#534735]">
            <h2 className="text-xs font-extrabold flex items-center tracking-wide text-[#f4eee2]">
              <Lock className="mr-2 text-[#C5A880] w-3.5 h-3.5" /> Calendar Master Lock-Up & Margin Audit (Day-to-Day Delta)
            </h2>
            <p className="text-[10px] text-[#b8ab97] mt-0.5 leading-tight">
              Select any date from the calendar ribbon below to inspect master lock-ups, station breakdowns, demographic bar distributions, and population margin drops (bails/remands/releases).
            </p>
          </div>

          <div className="bg-white p-3 rounded-xl shadow-xs border border-[#e2d6c3] space-y-2">
            <h3 className="text-[11px] font-black text-[#3a3225] uppercase flex items-center">
              <Calendar className="w-3.5 h-3.5 mr-1.5 text-[#596E47]" /> Select Date for Station Lock-Up Audit:
            </h3>
            <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto custom-scrollbar p-1">
              {backendDetentionCalendar.dates.length > 0 ? (
                backendDetentionCalendar.dates.map(dateStr => {
                  const isSelected = selectedDetentionDate === dateStr;
                  const dayTotal = backendDetentionCalendar.dateMap[dateStr]?.total || 0;
                  return (
                    <button
                      key={dateStr}
                      onClick={() => setSelectedDetentionDate(dateStr)}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-extrabold transition border cursor-pointer flex flex-col items-center ${
                        isSelected ? 'bg-[#596E47] text-white border-[#4A5D4E] shadow-sm' : 'bg-[#fbf8f3] text-[#3a3225] border-[#e2d6c3] hover:bg-[#efece6]'
                      }`}
                    >
                      <span>{dateStr}</span>
                      <span className={`text-[9px] ${isSelected ? 'text-emerald-100' : 'text-[#736450]'}`}>Total: {dayTotal}</span>
                    </button>
                  );
                })
              ) : (
                <div className="text-[10px] text-[#736450] py-2">No detention calendar records found in NeonDB.</div>
              )}
            </div>
          </div>

          {selectedDetentionDate && (
            <div className="bg-[#fbf8f3] rounded-xl shadow-xs border border-[#e2d6c3] overflow-hidden">
              <div className="bg-[#efece6] px-3 py-2 border-b border-[#d3c2a8] flex justify-between items-center">
                <h3 className="text-[11px] font-black text-[#3a3225] uppercase">
                  Station Lock-Up Breakdown for <span className="text-[#596E47]">{selectedDetentionDate}</span>
                </h3>
                <span className="text-[11px] font-black bg-[#3a3225] text-[#f4eee2] px-2.5 py-0.5 rounded">
                  Master Total: {selectedDayLockup.total} Suspects
                </span>
              </div>
              <div className="max-h-[300px] overflow-y-auto custom-scrollbar w-full">
                <table className="w-full table-fixed divide-y divide-[#e2d6c3]">
                  <thead className="sticky top-0 z-20">
                    <tr className="bg-gradient-to-b from-[#f4eee2] to-[#e6dfd1] text-[#3a3225] font-extrabold border-b-2 border-[#d3c2a8]">
                      <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wide border-r border-[#d3c2a8]" style={{ width: '28%' }}>Region / Station</th>
                      <th className="px-3 py-2 text-center text-[10px] uppercase tracking-wide border-r border-[#d3c2a8]" style={{ width: '12%' }}>Total</th>
                      <th className="px-3 py-2 text-center text-[10px] uppercase tracking-wide border-r border-[#d3c2a8]" style={{ width: '12%' }}>M. Adults</th>
                      <th className="px-3 py-2 text-center text-[10px] uppercase tracking-wide border-r border-[#d3c2a8]" style={{ width: '12%' }}>M. Juv</th>
                      <th className="px-3 py-2 text-center text-[10px] uppercase tracking-wide border-r border-[#d3c2a8]" style={{ width: '12%' }}>F. Adults</th>
                      <th className="px-3 py-2 text-center text-[10px] uppercase tracking-wide border-r border-[#d3c2a8]" style={{ width: '12%' }}>F. Juv</th>
                      <th className="px-3 py-2 text-center text-[10px] uppercase tracking-wide text-red-800" style={{ width: '12%' }}>3+ Days</th>
                    </tr>
                  </thead>
                  <tbody className="bg-[#fbf8f3] divide-y divide-[#e2d6c3]">
                    {Array.isArray(selectedDayLockup.stations) && selectedDayLockup.stations.length > 0 ? (
                      selectedDayLockup.stations.map((stnRow, i) => (
                        <tr key={i} className="hover:bg-[#e9eedf]/30 align-top">
                          <td className="px-3 py-2 text-[10px] font-bold text-[#3a3225] border-r border-[#e2d6c3] whitespace-normal break-words">
                            {stnRow.station}<br/><span className="text-[9px] text-[#736450]">{stnRow.region}</span>
                          </td>
                          <td className="px-3 py-2 text-center text-[10px] font-black text-[#596E47] border-r border-[#e2d6c3]">{stnRow.suspects}</td>
                          <td className="px-3 py-2 text-center text-[10px] font-semibold border-r border-[#e2d6c3]">{stnRow.mAd}</td>
                          <td className="px-3 py-2 text-center text-[10px] font-semibold border-r border-[#e2d6c3]">{stnRow.mJuv}</td>
                          <td className="px-3 py-2 text-center text-[10px] font-semibold border-r border-[#e2d6c3]">{stnRow.fAd}</td>
                          <td className="px-3 py-2 text-center text-[10px] font-semibold border-r border-[#e2d6c3]">{stnRow.fJuv}</td>
                          <td className="px-3 py-2 text-center text-[10px] font-black text-red-700 bg-red-50/50">{stnRow.d3Over}</td>
                        </tr>
                      ))
                    ) : (
                      <tr><td colSpan="7" className="text-center py-4 text-[10px] text-[#736450]">No station records for this date.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl shadow-xs border border-[#e2d6c3] p-3">
            <h3 className="text-[11px] font-black text-[#3a3225] uppercase mb-2">Day-to-Day Population Margin & Increments/Decrements Audit</h3>
            <div className="max-h-[220px] overflow-y-auto custom-scrollbar">
              <table className="w-full table-fixed divide-y divide-[#e2d6c3] text-[10px]">
                <thead className="bg-[#efece6] sticky top-0 z-20">
                  <tr>
                    <th className="px-3 py-1.5 text-left font-bold text-[#594d3c]" style={{ width: '20%' }}>Date</th>
                    <th className="px-3 py-1.5 text-center font-bold text-[#3a3225]" style={{ width: '20%' }}>Total Lock-Up</th>
                    <th className="px-3 py-1.5 text-center font-bold text-[#594d3c]" style={{ width: '20%' }}>Margin Delta</th>
                    <th className="px-3 py-1.5 text-left font-bold text-[#594d3c]" style={{ width: '40%' }}>Operational Status / Audit Note</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e2d6c3]">
                  {backendDetentionCalendar.dailyMargins.map((m, idx) => (
                    <tr key={idx} className="hover:bg-[#e9eedf]/30 align-top">
                      <td className="px-3 py-1.5 font-bold text-[#3a3225] whitespace-normal break-words">{m.date}</td>
                      <td className="px-3 py-1.5 text-center font-black text-blue-900">{m.total}</td>
                      <td className={`px-3 py-1.5 text-center font-black ${m.margin < 0 ? 'text-red-700' : m.margin > 0 ? 'text-emerald-700' : 'text-slate-600'}`}>
                        {m.margin > 0 ? `+${m.margin}` : m.margin}
                      </td>
                      <td className="px-3 py-1.5 font-semibold text-[#736450] whitespace-normal break-words">{m.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="bg-white rounded-xl shadow-xs border border-[#e2d6c3] p-3 h-[340px]">
              <h3 className="text-[11px] font-black text-[#3a3225] uppercase mb-2">Suspect Demographics by Region (Y: Region, X: Suspects)</h3>
              {backendDetentionCalendar.regionDemographics.length > 0 ? (
                <ResponsiveContainer width="100%" height="90%">
                  <BarChart layout="vertical" data={backendDetentionCalendar.regionDemographics} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2d6c3" />
                    <XAxis type="number" tick={{fontSize: 9}} />
                    <YAxis dataKey="region" type="category" tick={{fontSize: 9, fontWeight: 'bold'}} width={110} />
                    <Tooltip contentStyle={{ borderRadius: '8px', fontSize: '10px', fontWeight: 'bold' }} />
                    <Legend wrapperStyle={{ fontSize: '10px', fontWeight: 'bold' }} />
                    <Bar dataKey="maleAdults" name="Male Adults" fill="#2563EB" stackId="a" />
                    <Bar dataKey="femaleAdults" name="Female Adults" fill="#DB2777" stackId="a" />
                    <Bar dataKey="maleJuveniles" name="Male Juveniles" fill="#3B82F6" stackId="a" />
                    <Bar dataKey="femaleJuveniles" name="Female Juveniles" fill="#EC4899" stackId="a" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[10px] text-[#736450]">No regional demographic data.</div>
              )}
            </div>

            <div className="bg-white rounded-xl shadow-xs border border-[#e2d6c3] p-3 h-[340px]">
              <h3 className="text-[11px] font-black text-[#3a3225] uppercase mb-2">Detention Duration by Region (1 Day, 2 Days, 3+ Days)</h3>
              {backendDetentionCalendar.regionDuration.length > 0 ? (
                <ResponsiveContainer width="100%" height="90%">
                  <BarChart layout="vertical" data={backendDetentionCalendar.regionDuration} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2d6c3" />
                    <XAxis type="number" tick={{fontSize: 9}} />
                    <YAxis dataKey="region" type="category" tick={{fontSize: 9, fontWeight: 'bold'}} width={110} />
                    <Tooltip contentStyle={{ borderRadius: '8px', fontSize: '10px', fontWeight: 'bold' }} />
                    <Legend wrapperStyle={{ fontSize: '10px', fontWeight: 'bold' }} />
                    <Bar dataKey="day1" name="1 Day" fill="#10B981" stackId="a" />
                    <Bar dataKey="day2" name="2 Days" fill="#F59E0B" stackId="a" />
                    <Bar dataKey="over3Days" name="3 Days & Over (48hr Breach)" fill="#DC2626" stackId="a" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[10px] text-[#736450]">No duration metrics available.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ACCIDENTS ANALYSIS TAB */}
      {activeDomain === 'ACCIDENTS' && (
        <div className="space-y-3 pb-8">
          <div className="bg-[#3a3225] rounded-xl p-3 text-[#f4eee2] shadow-sm border border-[#534735]">
            <h2 className="text-xs font-extrabold flex items-center tracking-wide text-[#f4eee2]">
              <Car className="mr-2 text-[#C5A880] w-3.5 h-3.5" /> Traffic & Accidents Time-Series Analytics
            </h2>
            <p className="text-[10px] text-[#b8ab97] mt-0.5 leading-tight">
              Weekly severity progression comparing minor, serious, fatal crashes, and human casualties.
            </p>
          </div>

          <div className="bg-white rounded-xl shadow-xs border border-[#e2d6c3] p-3 h-[380px]">
             <h3 className="text-[11px] font-black text-[#3a3225] uppercase mb-2">Weekly Accident Crash Severity & Casualties</h3>
             {accidentsTimeSeriesData.weekly.length > 0 ? (
               <ResponsiveContainer width="100%" height="88%">
                  <BarChart data={accidentsTimeSeriesData.weekly} margin={{ top: 10, right: 30, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2d6c3" />
                    <XAxis dataKey="period" tick={{fontSize: 10, fontWeight: 'bold'}} />
                    <YAxis tick={{fontSize: 10}} />
                    <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e2d6c3', fontSize: '10px', fontWeight: 'bold' }} />
                    <Legend wrapperStyle={{ fontSize: '10px', fontWeight: 'bold' }} />
                    <Bar dataKey="minor" name="Minor Crashes" fill="#2563EB" stackId="a" />
                    <Bar dataKey="serious" name="Serious Crashes" fill="#D97706" stackId="a" />
                    <Bar dataKey="fatal" name="Fatal Crashes" fill="#991B1B" stackId="a" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="victims" name="Total Victims" fill="#7C3AED" barSize={15} />
                  </BarChart>
               </ResponsiveContainer>
             ) : (
               <div className="w-full h-full flex items-center justify-center text-[10px] text-[#736450] font-bold">No accident statistics available for the selected timeframe.</div>
             )}
          </div>
        </div>
      )}

      {/* FIRE INCIDENTS ANALYSIS TAB */}
      {activeDomain === 'FIRES' && (
        <div className="space-y-3 pb-8">
          <div className="bg-[#3a3225] rounded-xl p-3 text-[#f4eee2] shadow-sm border border-[#534735]">
            <h2 className="text-xs font-extrabold flex items-center tracking-wide text-[#f4eee2]">
              <Flame className="mr-2 text-amber-500 w-3.5 h-3.5" /> Fire Outbreaks & Property Casualty Intelligence Audit
            </h2>
            <p className="text-[10px] text-[#b8ab97] mt-0.5 leading-tight">
              Classifying structures (schools, churches, residential houses, commercial/furniture shops, motor vehicles, vessels) and tracking explicit deaths vs. injuries.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
             <div className="bg-amber-900 text-white p-3 rounded-xl shadow-sm border border-amber-950 flex flex-col justify-between">
                <span className="text-[9px] font-extrabold uppercase tracking-widest text-amber-200">Total Fire Incidents</span>
                <div className="text-2xl font-black mt-1">{displayFireTotals.totalFires || 0}</div>
             </div>
             <div className="bg-red-900 text-white p-3 rounded-xl shadow-sm border border-red-950 flex flex-col justify-between">
                <span className="text-[9px] font-extrabold uppercase tracking-widest text-red-200">Total Fire Deaths</span>
                <div className="text-2xl font-black mt-1">{displayFireTotals.totalDeaths || 0}</div>
             </div>
             <div className="bg-orange-800 text-white p-3 rounded-xl shadow-sm border border-orange-950 flex flex-col justify-between">
                <span className="text-[9px] font-extrabold uppercase tracking-widest text-orange-200">Total Fire Injuries</span>
                <div className="text-2xl font-black mt-1">{displayFireTotals.totalInjuries || 0}</div>
             </div>
          </div>

          <div className="bg-[#fbf8f3] rounded-xl shadow-xs border border-[#e2d6c3] overflow-hidden">
            <div className="max-h-[520px] overflow-y-auto custom-scrollbar w-full">
              <table className="w-full table-fixed divide-y divide-[#e2d6c3]">
                <thead className="sticky top-0 z-20">
                  <tr className="bg-gradient-to-b from-[#f4eee2] to-[#e6dfd1] text-[#3a3225] font-extrabold border-b-2 border-[#d3c2a8]">
                    <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wide border-r border-[#d3c2a8] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]" style={{ width: '18%' }}>Station / Region</th>
                    <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wide border-r border-[#d3c2a8] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]" style={{ width: '22%' }}>Property / Structure Type</th>
                    <th className="px-3 py-2 text-center text-[10px] uppercase tracking-wide border-r border-[#d3c2a8] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]" style={{ width: '10%' }}>Deaths</th>
                    <th className="px-3 py-2 text-center text-[10px] uppercase tracking-wide border-r border-[#d3c2a8] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]" style={{ width: '10%' }}>Injuries</th>
                    <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wide shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]" style={{ width: '40%' }}>Incident Narrative Summary</th>
                  </tr>
                </thead>
                <tbody className="bg-[#fbf8f3] divide-y divide-[#e2d6c3]">
                  {displayFireIncidents.length > 0 ? (
                    displayFireIncidents.map((f, idx) => (
                      <tr key={idx} className="hover:bg-[#e9eedf]/30 align-top">
                        <td className="px-3 py-2 text-[10px] font-bold text-[#3a3225] border-r border-[#e2d6c3] whitespace-normal break-words">
                          {f.station}<br/><span className="text-[9px] text-[#736450]">{f.region}</span>
                        </td>
                        <td className="px-3 py-2 text-[10px] font-extrabold text-amber-800 uppercase border-r border-[#e2d6c3] whitespace-normal break-words">{f.classification}</td>
                        <td className="px-3 py-2 text-center font-black text-red-700 text-[10px] border-r border-[#e2d6c3] whitespace-normal break-words">{f.deaths}</td>
                        <td className="px-3 py-2 text-center font-black text-amber-600 text-[10px] border-r border-[#e2d6c3] whitespace-normal break-words">{f.injuries}</td>
                        <td className="px-3 py-2 text-[10px] text-[#3a3225] whitespace-normal break-words">{f.summary}</td>
                      </tr>
                    ))
                  ) : (
                    <tr><td colSpan="5" className="text-center py-6 text-[10px] text-[#736450]">No fire or arson incidents logged matching your filter.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* DISRUPTIVE OPS TAB */}
      {activeDomain === 'OPERATIONS' && (
        <div className="space-y-3 pb-8">
          <div className="bg-[#3a3225] rounded-xl p-3 text-[#f4eee2] shadow-sm border border-[#534735]">
            <h2 className="text-xs font-extrabold flex items-center tracking-wide text-[#f4eee2]">
              <Zap className="mr-2 text-[#C5A880] w-3.5 h-3.5" /> Comparative Disruptive Operations Matrix
            </h2>
            <p className="text-[10px] text-[#b8ab97] mt-0.5 leading-tight">
              Visualizing Total Crimes Reported against the Total Number of Suspects Arrested via Disruptive Operations.
            </p>
          </div>

          <div className="bg-white rounded-xl shadow-xs border border-[#e2d6c3] p-3 h-[380px]">
             {opsChartData.length > 0 ? (
               <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={opsChartData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2d6c3" />
                    <XAxis dataKey="name" tick={{fontSize: 10, fontWeight: 'bold'}} interval={0} />
                    <YAxis tick={{fontSize: 10}} />
                    <Tooltip cursor={{fill: '#fbf8f3'}} contentStyle={{ borderRadius: '8px', border: '1px solid #e2d6c3', fontSize: '10px', fontWeight: 'bold' }} />
                    <Legend wrapperStyle={{ fontSize: '10px', fontWeight: 'bold' }} />
                    <Bar dataKey="Crimes" name="Total Crimes Reported" fill="#A97142" radius={[4, 4, 0, 0]} barSize={40} />
                    <Bar dataKey="Arrests" name="Arrests from Disruptive Ops" fill="#596E47" radius={[4, 4, 0, 0]} barSize={40} />
                  </BarChart>
               </ResponsiveContainer>
             ) : (
               <div className="w-full h-full flex items-center justify-center text-[10px] text-[#736450] font-bold">No comparative operational data available.</div>
             )}
          </div>
        </div>
      )}

      {/* EXHIBITS TAB */}
      {activeDomain === 'EXHIBITS' && (
        <div className="space-y-3 pb-8">
          <div className="bg-[#3a3225] rounded-xl p-3 text-[#f4eee2] shadow-sm border border-[#534735]">
            <h2 className="text-xs font-extrabold flex items-center tracking-wide text-[#f4eee2]">
              <Truck className="mr-2 text-[#C5A880] w-3.5 h-3.5" /> Impounded Exhibits & Asset Recovery Analytics
            </h2>
            <p className="text-[10px] text-[#b8ab97] mt-0.5 leading-tight">
              Grouped, named, and summed by exhibit category, specific description, station, division, region, and status.
            </p>
          </div>

          <div className="bg-[#fbf8f3] rounded-xl shadow-xs border border-[#e2d6c3] overflow-hidden">
            <div className="max-h-[520px] overflow-y-auto custom-scrollbar w-full">
              <table className="w-full table-fixed divide-y divide-[#e2d6c3]">
                <thead className="sticky top-0 z-20">
                  <tr className="bg-gradient-to-b from-[#f4eee2] to-[#e6dfd1] text-[#3a3225] font-extrabold border-b-2 border-[#d3c2a8]">
                    <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wide border-r border-[#d3c2a8] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]" style={{ width: '22%' }}>Exhibit Category</th>
                    <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wide border-r border-[#d3c2a8] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]" style={{ width: '30%' }}>Description (Colour/Features)</th>
                    <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wide border-r border-[#d3c2a8] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]" style={{ width: '22%' }}>Region / Station</th>
                    <th className="px-3 py-2 text-center text-[10px] uppercase tracking-wide border-r border-[#d3c2a8] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]" style={{ width: '14%' }}>Status</th>
                    <th className="px-3 py-2 text-center text-[10px] uppercase tracking-wide shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]" style={{ width: '12%' }}>Total</th>
                  </tr>
                </thead>
                <tbody className="bg-[#fbf8f3] divide-y divide-[#e2d6c3]">
                  {exhibitGroupedData.length > 0 ? (
                    exhibitGroupedData.map((row, idx) => (
                      <tr key={idx} className="hover:bg-[#e9eedf]/30 align-top">
                        <td className="px-3 py-2 text-[10px] font-bold text-[#3a3225] uppercase border-r border-[#e2d6c3] whitespace-normal break-words">{row.category}</td>
                        <td className="px-3 py-2 text-[10px] font-bold text-[#596E47] uppercase border-r border-[#e2d6c3] whitespace-normal break-words">{row.desc}</td>
                        <td className="px-3 py-2 text-[10px] font-semibold text-[#736450] uppercase border-r border-[#e2d6c3] whitespace-normal break-words">{row.region}<br/>{row.station}</td>
                        <td className="px-3 py-2 text-center text-[10px] font-bold uppercase border-r border-[#e2d6c3] whitespace-normal break-words"><span className="px-2 py-0.5 rounded bg-teal-100 text-teal-900 inline-block">{row.status}</span></td>
                        <td className="px-3 py-2 text-center text-[10px] font-black text-teal-800">{row.total}</td>
                      </tr>
                    ))
                  ) : (
                    <tr><td colSpan="5" className="text-center py-6 text-[10px] text-[#736450]">No exhibits recorded for this filter.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUMMARY TABLE TAB */}
      {activeDomain === 'SUMMARY' && (
        <div className="space-y-3 pb-16">
          <div className="bg-[#3a3225] rounded-xl p-3 text-[#f4eee2] shadow-sm border border-[#534735]">
            <h2 className="text-xs font-extrabold flex items-center tracking-wide text-[#f4eee2]">
              <BarChart3 className="mr-2 text-[#C5A880] w-3.5 h-3.5" /> Master Summary Table (Aggregated Metrics)
            </h2>
            <p className="text-[10px] text-[#b8ab97] mt-0.5 leading-tight">
              Summarizing all operational modules over the selected timeframe (1 day to 1 year).
            </p>
          </div>

          <div className="bg-[#fbf8f3] rounded-xl shadow-xs border border-[#e2d6c3] overflow-hidden w-full max-w-full">
            <div className="max-h-[520px] overflow-y-auto custom-scrollbar w-full">
              <table className="w-full table-fixed divide-y divide-[#e2d6c3]">
                <thead className="sticky top-0 z-20">
                  <tr className="bg-gradient-to-b from-[#f4eee2] to-[#e6dfd1] text-[#3a3225] font-extrabold border-b-2 border-[#d3c2a8]">
                    <th className="px-4 py-2.5 text-left text-[11px] uppercase tracking-wide border-r border-[#d3c2a8] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]" style={{ width: '75%' }}>Operational Metric Attribute</th>
                    <th className="px-4 py-2.5 text-right text-[11px] uppercase tracking-wide shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]" style={{ width: '25%' }}>Aggregate Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e2d6c3]">
                  <tr className="hover:bg-[#e9eedf]/30 align-top"><td className="px-4 py-2 text-[11px] font-bold text-[#3a3225] border-r border-[#e2d6c3] whitespace-normal break-words">Total Disruptive Operations Registered</td><td className="px-4 py-2 text-right font-black text-[#596E47] text-[11px]">{summaryAggregates.disruptiveOps}</td></tr>
                  <tr className="hover:bg-[#e9eedf]/30 align-top"><td className="px-4 py-2 text-[11px] font-bold text-[#3a3225] border-r border-[#e2d6c3] whitespace-normal break-words">Force-Wide Manpower (Nominal Roll)</td><td className="px-4 py-2 text-right font-black text-[#3a3225] text-[11px]">{summaryAggregates.manpowerTotal}</td></tr>
                  <tr className="hover:bg-[#e9eedf]/30 align-top"><td className="px-4 py-2 text-[11px] font-bold text-[#3a3225] border-r border-[#e2d6c3] whitespace-normal break-words">Total Success Occasions / Breakthroughs</td><td className="px-4 py-2 text-right font-black text-amber-800 text-[11px]">{summaryAggregates.successOccasions}</td></tr>
                  <tr className="hover:bg-[#e9eedf]/30 align-top"><td className="px-4 py-2 text-[11px] font-bold text-[#3a3225] border-r border-[#e2d6c3] whitespace-normal break-words">Total Impounded Exhibits Tracked</td><td className="px-4 py-2 text-right font-black text-teal-800 text-[11px]">{summaryAggregates.totalExhibits}</td></tr>
                  <tr className="hover:bg-[#e9eedf]/30 align-top"><td className="px-4 py-2 text-[11px] font-bold text-[#3a3225] border-r border-[#e2d6c3] whitespace-normal break-words">Total Detention Logs Tracked</td><td className="px-4 py-2 text-right font-black text-blue-800 text-[11px]">{summaryAggregates.totalDetentions}</td></tr>
                  <tr className="hover:bg-[#e9eedf]/30 align-top"><td className="px-4 py-2 text-[11px] font-bold text-[#3a3225] border-r border-[#e2d6c3] whitespace-normal break-words">Total Traffic Accidents Recorded</td><td className="px-4 py-2 text-right font-black text-red-800 text-[11px]">{summaryAggregates.totalAccidents}</td></tr>
                  <tr className="hover:bg-[#e9eedf]/30 align-top"><td className="px-4 py-2 text-[11px] font-bold text-[#3a3225] border-r border-[#e2d6c3] whitespace-normal break-words">Total Fire & Arson Outbreaks Tracked</td><td className="px-4 py-2 text-right font-black text-amber-700 text-[11px]">{summaryAggregates.totalFires}</td></tr>
                  <tr className="hover:bg-[#e9eedf]/30 align-top"><td className="px-4 py-2 text-[11px] font-bold text-[#3a3225] border-r border-[#e2d6c3] whitespace-normal break-words">Total Suspects Arrested (Ops)</td><td className="px-4 py-2 text-right font-black text-[#596E47] text-[11px]">{summaryAggregates.totalArrests}</td></tr>
                  <tr className="hover:bg-[#e9eedf]/30 align-top"><td className="px-4 py-2 text-[11px] font-bold text-[#3a3225] border-r border-[#e2d6c3] whitespace-normal break-words">Total Crime Incidents Recorded</td><td className="px-4 py-2 text-right font-black text-[#3a3225] text-[11px]">{summaryAggregates.totalCrimes}</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MANPOWER ANALYSIS TAB */}
      {activeDomain === 'MANPOWER_DEEP' && (
        <div className="space-y-3 pb-8">
          <div className="bg-[#3a3225] rounded-xl p-3 text-[#f4eee2] shadow-sm border border-[#534735]">
            <h2 className="text-xs font-extrabold flex items-center tracking-wide text-[#f4eee2]">
              <Users className="mr-2 text-[#C5A880] w-3.5 h-3.5" /> Multi-Layered Manpower Matrix Analysis
            </h2>
            <p className="text-[10px] text-[#b8ab97] mt-0.5 leading-tight">
              Detailed structural breakdown of personnel force distribution by functional Units/Directorates and categorized Operational Casualties. Click a region to expand details.
            </p>
          </div>

          <div className="bg-[#fbf8f3] rounded-xl shadow-xs border border-[#e2d6c3] overflow-hidden">
             <div className="bg-[#efece6] px-3 py-1.5 border-b border-[#d3c2a8] flex items-center justify-between">
                <h3 className="text-[11px] font-black text-[#3a3225] uppercase">General Summary (Deployable Personnel vs Rank Distribution)</h3>
             </div>
             <div className="max-h-[520px] overflow-y-auto custom-scrollbar w-full">
               <table className="min-w-full divide-y divide-[#e2d6c3]">
                  <thead className="sticky top-0 z-20">
                     <tr className="bg-gradient-to-b from-[#f4eee2] to-[#e6dfd1] text-[#3a3225] font-extrabold border-b border-[#d3c2a8]">
                        <th rowSpan={2} className="px-3 py-2 text-left text-[10px] uppercase tracking-wide sticky left-0 bg-[#f4eee2] z-10 w-48 border-r border-[#d3c2a8] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">Command Region / Station</th>
                        <th rowSpan={2} className="px-3 py-2 text-center text-[10px] font-black uppercase border-r border-[#d3c2a8] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">Total Personnel</th>
                        <th rowSpan={2} className="px-2 py-2 text-center text-[10px] font-bold text-[#596E47] uppercase border-r border-[#d3c2a8] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">Active Deployable</th>
                        <th rowSpan={2} className="px-2 py-2 text-center text-[10px] font-bold text-red-700 uppercase border-r border-[#d3c2a8] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">Inactive (Sick/Leave)</th>
                        {manpowerAnalysis.allRanks.map(rank => (
                          <th key={rank} colSpan={2} className="px-2 py-1.5 text-center text-[9px] font-extrabold uppercase border-r border-[#d3c2a8] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">{rank}</th>
                        ))}
                     </tr>
                     <tr className="bg-gradient-to-b from-[#e6dfd1] to-[#ded6c8]">
                        {manpowerAnalysis.allRanks.map(rank => (
                           <React.Fragment key={`${rank}-gender`}>
                             <th className="px-1 py-1 text-center text-[8px] font-bold text-blue-800 border-r border-[#d3c2a8]">M</th>
                             <th className="px-1 py-1 text-center text-[8px] font-bold text-pink-800 border-r border-[#d3c2a8]">F</th>
                           </React.Fragment>
                        ))}
                     </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e2d6c3]">
                     {manpowerAnalysis.rows.map(reg => {
                        const isExpanded = (expandedManpowerRegion === reg.region);
                        return (
                          <React.Fragment key={reg.region}>
                            <tr onClick={() => toggleManpowerRegion(reg.region)} className="bg-[#efece6]/50 hover:bg-[#e9eedf]/50 cursor-pointer transition-colors border-t border-[#d3c2a8]">
                               <td className="px-3 py-2 text-[10px] font-extrabold text-[#3a3225] uppercase flex items-center space-x-1.5 sticky left-0 bg-[#efece6]/50 border-r border-[#d3c2a8]">
                                  <span className="text-[#596E47]">{isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</span>
                                  <span>{reg.region}</span>
                               </td>
                               <td className="px-3 py-2 text-[10px] text-center font-black text-[#3a3225] border-r border-[#d3c2a8]">{reg.totalDeployable}</td>
                               <td colSpan={2 + (manpowerAnalysis.allRanks.length * 2)} className="px-3 py-2 text-[10px] text-[#736450] italic">Expand to view station distribution...</td>
                            </tr>
                            {isExpanded && reg.stationList.map((stn, sIdx) => (
                               <tr key={`dep-${sIdx}`} className="bg-white align-top">
                                  <td className="px-3 py-1.5 pl-7 text-[10px] font-semibold text-[#594d3c] uppercase sticky left-0 bg-white border-r border-[#d3c2a8] whitespace-normal break-words">— {stn.station}</td>
                                  <td className="px-3 py-1.5 text-[10px] text-center font-bold text-[#3a3225] border-r border-[#d3c2a8]">{stn.totalDeployable}</td>
                                  <td className="px-3 py-1.5 text-[10px] text-center font-black text-[#596E47] border-r border-[#d3c2a8]">{stn.active}</td>
                                  <td className="px-3 py-1.5 text-[10px] text-center font-bold text-red-700 border-r border-[#d3c2a8]">{stn.inactive}</td>
                                  {manpowerAnalysis.allRanks.map(rank => (
                                    <React.Fragment key={`${stn.station}-${rank}`}>
                                      <td className="px-1 py-1.5 text-[10px] text-center font-medium text-blue-800 border-r border-[#d3c2a8] bg-blue-50/30">{stn.ranks[rank].M > 0 ? stn.ranks[rank].M : '-'}</td>
                                      <td className="px-1 py-1.5 text-[10px] text-center font-medium text-pink-800 border-r border-[#d3c2a8] bg-pink-50/30">{stn.ranks[rank].F > 0 ? stn.ranks[rank].F : '-'}</td>
                                    </React.Fragment>
                                  ))}
                               </tr>
                            ))}
                          </React.Fragment>
                        );
                     })}
                  </tbody>
               </table>
             </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
             <div className="bg-white rounded-xl shadow-xs border border-[#e2d6c3] p-3 flex flex-col items-center">
                <h3 className="text-[11px] font-black text-[#3a3225] uppercase border-b border-[#e2d6c3] w-full pb-1.5 mb-2 flex items-center"><Scale className="w-3.5 h-3.5 mr-1.5 text-[#A97142]" /> Gender Distribution Analysis</h3>
                <div className="h-[220px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={manpowerAnalysis.pieGenderData} cx="50%" cy="50%" labelLine={false} label={renderCustomizedLabel} outerRadius={75} fill="#8884d8" dataKey="value">
                        {manpowerAnalysis.pieGenderData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ borderRadius: '8px', fontSize: '10px', fontWeight: 'bold' }} />
                      <Legend wrapperStyle={{ fontSize: '10px', fontWeight: 'bold' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
             </div>
             
             <div className="bg-white rounded-xl shadow-xs border border-[#e2d6c3] p-3 flex flex-col items-center">
                <h3 className="text-[11px] font-black text-[#3a3225] uppercase border-b border-[#e2d6c3] w-full pb-1.5 mb-2 flex items-center"><PieChartIcon className="w-3.5 h-3.5 mr-1.5 text-[#596E47]" /> Force Deployability Index</h3>
                <div className="h-[220px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={manpowerAnalysis.pieDeployData} cx="50%" cy="50%" labelLine={false} label={renderCustomizedLabel} outerRadius={75} fill="#8884d8" dataKey="value">
                        {manpowerAnalysis.pieDeployData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={PIE_STATUS_COLORS[index % PIE_STATUS_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ borderRadius: '8px', fontSize: '10px', fontWeight: 'bold' }} />
                      <Legend wrapperStyle={{ fontSize: '10px', fontWeight: 'bold' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
             </div>
          </div>
          
        </div>
      )}

    </div>
  );
};

export default AnalyticsDashboard;