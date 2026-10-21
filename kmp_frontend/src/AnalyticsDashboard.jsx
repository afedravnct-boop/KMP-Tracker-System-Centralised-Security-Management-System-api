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

const parseSuccessStoryNarrative = (rawHtmlNarrative) => {
  if (!rawHtmlNarrative) {
    return {
      suspects: 0,
      recoveries: "NONE RECORDED",
      legalStatus: "UNDER INVESTIGATION",
      classification: "OPERATIONAL BREAKTHROUGH & SUSPECT APPREHENSION"
    };
  }

  const cleanHtmlAndEntities = (str) => {
    if (!str) return '';
    let cleaned = str.replace(/<[^>]*>?/gm, ' ');
    cleaned = cleaned.replace(/&nbsp;/gi, ' '); 
    cleaned = cleaned.replace(/&amp;/gi, '&'); 
    cleaned = cleaned.replace(/&quot;/gi, '"'); 
    cleaned = cleaned.replace(/&#39;/g, "'"); 
    return cleaned.replace(/\s+/g, ' ').trim(); 
  };

  const headlineMatch = rawHtmlNarrative.match(/<strong>(.*?)<\/strong>/i);
  let classification = "OPERATIONAL BREAKTHROUGH & SUSPECT APPREHENSION";

  if (headlineMatch && headlineMatch[1]) {
     const cleanedHeadline = cleanHtmlAndEntities(headlineMatch[1]);
     if (cleanedHeadline.length > 3) {
         classification = cleanedHeadline.toUpperCase();
     }
  } else {
     const fallbackText = cleanHtmlAndEntities(rawHtmlNarrative);
     if (fallbackText) {
         classification = fallbackText.split('.')[0].substring(0, 80).toUpperCase();
     }
  }

  const plainText = cleanHtmlAndEntities(rawHtmlNarrative);
  const lowerText = plainText.toLowerCase();
  
  let suspectsCount = 0;
  const suspectMatches = [
    lowerText.match(/(\d+)\s*(?:suspects|suspect|person|persons|culprits|thieves|gang|individuals)/i),
    lowerText.match(/(?:arrest(?:ed|ing)?|apprehend(?:ed)?|detain(?:ed)?)\s*(?:of)?\s*(\d+)/i)
  ];
  
  for (const m of suspectMatches) {
    if (m && m[1]) {
      suspectsCount = parseInt(m[1], 10);
      break;
    }
  }

  if (suspectsCount === 0 && (lowerText.includes('suspect') || lowerText.includes('arrest') || lowerText.includes('apprehend'))) {
    suspectsCount = 1; 
  }

  let legalStatus = 'UNDER INVESTIGATION';
  if (lowerText.includes('remand') || lowerText.includes('remanded')) legalStatus = 'REMANDED';
  else if (lowerText.includes('convict') || lowerText.includes('sentenced')) legalStatus = 'CONVICTED';
  else if (lowerText.includes('acquit')) legalStatus = 'ACQUITTED';
  else if (lowerText.includes('court') || lowerText.includes('trial') || lowerText.includes('magistrate') || lowerText.includes('arraign')) legalStatus = 'UNDERGOING COURT TRIAL';

  const recoveriesList = [];
  const recoveryRegex = /(\d+)\s*([a-z\s]+(?:cows|cow|cattle|phones|phone|pistol|pistols|gun|guns|firearm|firearms|cash|money|shillings|computers|computer|chairs|chair|tables|table|shoes|shoe|motorcycles|motorcycle|vehicles|vehicle|pangas|panga|weapons|weapon|items))/gi;
  let match;
  while ((match = recoveryRegex.exec(lowerText)) !== null) {
    const formattedCount = String(match[1]).padStart(2, '0');
    recoveriesList.push(`${formattedCount} | ${match[2].trim().toUpperCase()}`);
  }

  if (recoveriesList.length === 0 && (lowerText.includes('recovery') || lowerText.includes('recovered') || lowerText.includes('recover') || lowerText.includes('impound'))) {
    recoveriesList.push('01 | RECOVERED EXHIBIT / ASSET');
  }

  return {
    suspects: suspectsCount,
    recoveries: recoveriesList.length > 0 ? recoveriesList.join(' || ') : 'NONE RECORDED',
    legalStatus: legalStatus,
    classification: classification
  };
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
    const weeklyMap = {};
    const monthlyMap = {};

    records.forEach(r => {
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
  operationalStats = [], 
  stats = [], 
  impoundedExhibits = [], 
  currentUser, 
  canViewGlobal = false 
}) => {
  const [fetchedRolls, setFetchedRolls] = useState([]);
  const [fetchedCrime, setFetchedCrime] = useState([]);
  const [fetchedSuccess, setFetchedSuccess] = useState([]);
  const [fetchedOps, setFetchedOps] = useState([]);
  const [fetchedExhibits, setFetchedExhibits] = useState([]); 
  const [fetchedLockup, setFetchedLockup] = useState([]);
  const [fetchedAccidents, setFetchedAccidents] = useState([]);
  const [loading, setLoading] = useState(false);

  const [expandedManpowerRegions, setExpandedManpowerRegions] = useState({});
  const [expandedCrimeRegions, setExpandedCrimeRegions] = useState({});

  const toggleManpowerRegion = (regionName) => {
    setExpandedManpowerRegions(prev => ({ ...prev, [regionName]: !prev[regionName] }));
  };
  const toggleCrimeRegion = (regionName) => {
    setExpandedCrimeRegions(prev => ({ ...prev, [regionName]: !prev[regionName] }));
  };

  useEffect(() => {
    let isMounted = true;
    const fetchData = async () => {
      if (!hasValidSession()) return;

      setLoading(true);
      try {
        const [rollRes, crimeRes, storyRes, statsRes, exhibitsRes, lockupRes, accidentsRes] = await Promise.all([
          authFetch('/api/v1/nominal-roll').catch(() => null),
          authFetch('/api/v1/reports').catch(() => null),
          authFetch('/api/v1/stories').catch(() => null),
          authFetch('/api/v1/stats').catch(() => null),
          authFetch('/api/v1/exhibits').catch(() => null),
          authFetch('/api/v1/lockup-matrix').catch(() => null),
          authFetch('/api/v1/accidents').catch(() => null)
        ]);

        const rollData = rollRes && rollRes.ok ? await rollRes.json() : [];
        const crimeData = crimeRes && crimeRes.ok ? await crimeRes.json() : [];
        const storyData = storyRes && storyRes.ok ? await storyRes.json() : [];
        const statsData = statsRes && statsRes.ok ? await statsRes.json() : [];
        const exhibitsData = exhibitsRes && exhibitsRes.ok ? await exhibitsRes.json() : [];
        const lockupData = lockupRes && lockupRes.ok ? await lockupRes.json() : [];
        const accidentsData = accidentsRes && accidentsRes.ok ? await accidentsRes.json() : [];

        if (isMounted) {
          setFetchedRolls(Array.isArray(rollData) ? rollData : []);
          setFetchedCrime(Array.isArray(crimeData) ? crimeData : []);
          setFetchedSuccess(Array.isArray(storyData) ? storyData : []);
          setFetchedOps(Array.isArray(statsData) ? statsData : []);
          setFetchedExhibits(Array.isArray(exhibitsData) ? exhibitsData : []);
          setFetchedLockup(Array.isArray(lockupData) ? lockupData : []);
          setFetchedAccidents(Array.isArray(accidentsData) ? accidentsData : []);
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

  const timeFilteredData = (list) => {
    const now = new Date();
    return list.filter(item => {
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
    else if (activeDomain === 'DETENTIONS') baseData = fetchedLockup;
    else if (activeDomain === 'ACCIDENTS') baseData = fetchedAccidents;
    else if (activeDomain === 'FIRES') baseData = resolvedCrimeRegistry;

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

    if (activeDomain !== 'MANPOWER_DEEP' && activeDomain !== 'RELATIONAL') {
      baseData = timeFilteredData(baseData);
    }
    return baseData;
  }, [activeDomain, resolvedCrimeRegistry, resolvedNominalRolls, resolvedSuccessStories, resolvedOperationalStats, resolvedExhibits, fetchedLockup, fetchedAccidents, dateFilter, selectedRegion, selectedStation, canViewGlobalLevel, userRegClean]);

  const parsedSuccessStories = useMemo(() => {
    return timeFilteredDataset.map(st => {
      const parsed = parseSuccessStoryNarrative(st.narrative || st.title);
      return {
        ...st,
        parsedSuspects: st.suspects_arrested || st.suspects_arrested_count || parsed.suspects,
        parsedRecoveries: st.suspected_stolen_properties_recovered || st.property_recovered || parsed.recoveries,
        parsedLegalStatus: st.legal_status || parsed.legalStatus,
        parsedClassification: parsed.classification
      };
    });
  }, [timeFilteredDataset]);

  // 🟢 Intelligent Fire Incident Parser for Frontend
  const fireIntelligence = useMemo(() => {
    const records = timeFilteredData(resolvedCrimeRegistry);
    const fireKeywords = ["fire", "arson", "burnt", "flames", "inferno", "scorch"];
    const fireList = [];
    let totalCasualties = 0;

    records.forEach(cr => {
        const narrative = String(cr.narrative || "").toLowerCase();
        const offence = String(cr.offence || "").toLowerCase();
        if (fireKeywords.some(kw => narrative.includes(kw) || offence.includes(kw))) {
            let casualties = 0;
            const match = narrative.match(/(\d+)\s*(?:casualties|casualty|dead|deaths|injured|injury|burnt|victims)/);
            if (match) casualties = parseInt(match[1], 10);
            totalCasualties += casualties;
            fireList.push({
                station: cr.station || 'UNKNOWN',
                region: cr.region || 'KMP GENERAL',
                date: cr.date || 'N/A',
                casualties,
                summary: stripHtmlTags(cr.narrative || cr.offence || 'Fire incident logged.')
            });
        }
    });

    return { totalFires: fireList.length, totalCasualties, fireList };
  }, [resolvedCrimeRegistry, selectedMonth, dateFilter, selectedRegion, selectedStation]);

  const detentionTimeSeriesData = useMemo(() => {
      return aggregateTimeSeries(timeFilteredDataset, 'date', ['suspects', 'male_count', 'detention_3days_over']);
  }, [timeFilteredDataset]);

  const accidentsTimeSeriesData = useMemo(() => {
      return aggregateTimeSeries(timeFilteredDataset, 'date', ['minor', 'serious', 'fatal', 'victims', 'total']);
  }, [timeFilteredDataset]);

  // 🟢 Lockup Intelligence & Station Overstay Breakdown
  const lockupIntelligence = useMemo(() => {
    const records = fetchedLockup; 
    if (!Array.isArray(records) || records.length === 0) {
        return { overstayed: 0, femaleTotal: 0, femaleAdults: 0, femaleJuveniles: 0, totalJuveniles: 0, stationMap: {} };
    }

    let overstayed = 0;
    let femaleAdults = 0;
    let femaleJuveniles = 0;
    let maleJuveniles = 0;
    const stationMap = {};

    records.forEach(r => {
        const d3Plus = Number(r.detention_3days_over || 0);
        const fAd = Number(r.female_count || r.female || 0);
        const fJuv = Number(r.female_juvenile_count || r.female_juvenile || 0);
        const mJuv = Number(r.male_juvenile_count || r.male_juvenile || 0);

        if (d3Plus > 0) {
            overstayed += d3Plus;
            const stn = r.station || 'UNKNOWN STATION';
            stationMap[stn] = (stationMap[stn] || 0) + d3Plus;
        }
        femaleAdults += fAd;
        femaleJuveniles += fJuv;
        maleJuveniles += mJuv;
    });

    return {
        overstayed,
        femaleAdults,
        femaleJuveniles,
        femaleTotal: femaleAdults + femaleJuveniles,
        totalJuveniles: maleJuveniles + femaleJuveniles,
        stationMap
    };
  }, [fetchedLockup]);

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

  const crimeCategoryData = useMemo(() => {
    const tf = timeFilteredData(resolvedCrimeRegistry).filter(r => !isLockupLog(r));
    const regionalMap = {};

    tf.forEach(r => {
      const cat = normalizeOffenceCategory(r.crime_category || r.offence || 'GENERAL CRIME');
      const reg = getOfficialRegionForStation(r.station, r.region);
      const stn = (r.station || 'N/A').toUpperCase();

      if (selectedCrimeCategory !== 'ALL' && cat !== selectedCrimeCategory) return;
      if (canViewGlobalLevel && selectedRegion !== 'ALL REGIONS' && reg !== selectedRegion.toUpperCase()) return;
      if (selectedStation !== 'ALL STATIONS' && !isStationEquivalent(stn, selectedStation)) return;

      if (!regionalMap[reg]) regionalMap[reg] = { region: reg, totalCrimes: 0, categories: {} };
      
      regionalMap[reg].totalCrimes += 1;
      if (!regionalMap[reg].categories[cat]) regionalMap[reg].categories[cat] = 0;
      regionalMap[reg].categories[cat] += 1;
    });

    return Object.values(regionalMap).map(regObj => ({
      ...regObj,
      categoryList: Object.entries(regObj.categories).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }))
    })).sort((a, b) => b.totalCrimes - a.totalCrimes);
  }, [resolvedCrimeRegistry, selectedCrimeCategory, selectedRegion, selectedStation, selectedMonth, dateFilter, canViewGlobalLevel]);

  const exhibitGroupedData = useMemo(() => {
    const tf = timeFilteredData(resolvedExhibits);
    const map = {};
    tf.forEach(ex => {
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
    const ss = timeFilteredData(resolvedSuccessStories);
    const cr = timeFilteredData(resolvedCrimeRegistry).filter(r => !isLockupLog(r));
    const ex = timeFilteredData(resolvedExhibits);
    const nom = resolvedNominalRolls;
    const lck = timeFilteredData(fetchedLockup);
    const acc = timeFilteredData(fetchedAccidents);

    return {
      disruptiveOps: ops.length,
      manpowerTotal: nom.length,
      successOccasions: ss.length,
      totalExhibits: ex.length,
      totalDetentions: lck.length,
      totalAccidents: acc.length,
      totalFires: fireIntelligence.totalFires,
      totalArrests: ops.reduce((acc, curr) => acc + (Number(curr.arrests || curr.suspects || curr.arrested) || 0), 0),
      totalCrimes: cr.length
    };
  }, [resolvedOperationalStats, resolvedSuccessStories, resolvedCrimeRegistry, resolvedExhibits, resolvedNominalRolls, fetchedLockup, fetchedAccidents, fireIntelligence, selectedMonth, dateFilter]);

  const opsChartData = useMemo(() => {
    const regMap = {};
    const tfOps = timeFilteredData(resolvedOperationalStats);
    const tfCrimes = timeFilteredData(resolvedCrimeRegistry).filter(r => !isLockupLog(r));

    tfOps.forEach(o => {
      const reg = getOfficialRegionForStation(o.station, o.region);
      if (canViewGlobalLevel && selectedRegion !== 'ALL REGIONS' && reg !== selectedRegion.toUpperCase()) return;
      if (!regMap[reg]) regMap[reg] = { name: reg, Arrests: 0, Crimes: 0 };
      regMap[reg].Arrests += (Number(o.arrests || o.suspects || o.arrested) || 0);
    });

    tfCrimes.forEach(c => {
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
  const renderCustomizedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, index }) => {
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
    <div className="p-3 max-w-[1600px] mx-auto space-y-3 font-sans min-h-screen pb-24" style={{ backgroundColor: '#f4eee2' }}>
        
      {/* Top Header Card */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-[#fbf8f3] px-4 py-2.5 rounded-xl shadow-xs border border-[#e2d6c3] gap-2">
        <div>
          <h1 className="text-lg font-extrabold text-[#3a3225] tracking-tight">KMP Relational Operations & Intelligence Dashboard</h1>
          <p className="text-[11px] text-[#736450] font-medium">Monthly aggregates, crime categories, suspect legal statuses, open-ended recoveries, fire incidents, time-series detentions, and accident analytics.</p>
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
      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-9 gap-1.5">
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
          Total Entries: {activeDomain === 'SUCCESS' ? parsedSuccessStories.length : activeDomain === 'CRIME' ? crimeCategoryData.length : activeDomain === 'EXHIBITS' ? exhibitGroupedData.length : activeDomain === 'FIRES' ? fireIntelligence.fireList.length : timeFilteredDataset.length}
        </span>
      </div>

      {/* SUCCESS STORIES TAB */}
      {activeDomain === 'SUCCESS' && (
        <div className="space-y-3 pb-12">
          <div className="bg-[#3a3225] rounded-xl p-3.5 text-[#f4eee2] shadow-sm border border-[#534735]">
            <h2 className="text-sm font-extrabold flex items-center tracking-wide text-[#f4eee2]">
              <Award className="mr-2 text-[#C5A880] w-4 h-4" /> Success Stories & Operational Breakthrough Summaries
            </h2>
            <p className="text-[11px] text-[#b8ab97] mt-0.5 leading-tight">
              Automatically extracting arrest numbers, classified breakthroughs, open-ended property recoveries, and suspect legal status directly from story narratives.
            </p>
          </div>

          <div className="bg-[#fbf8f3] rounded-xl shadow-xs border border-[#e2d6c3] overflow-hidden">
            <div className="overflow-x-auto w-full">
              <table className="min-w-full divide-y divide-[#e2d6c3]">
                <thead className="bg-[#efece6]">
                  <tr>
                    <th className="px-3 py-2 text-left text-[11px] font-bold text-[#594d3c] uppercase">Station / Region</th>
                    <th className="px-3 py-2 text-center text-[11px] font-bold text-[#594d3c] uppercase">Suspects Arrested</th>
                    <th className="px-3 py-2 text-left text-[11px] font-bold text-[#594d3c] uppercase">Classified Breakthrough Summary</th>
                    <th className="px-3 py-2 text-left text-[11px] font-bold text-[#594d3c] uppercase">Recovered Properties & Quantities</th>
                    <th className="px-3 py-2 text-center text-[11px] font-bold text-[#594d3c] uppercase">Suspect Legal Status</th>
                  </tr>
                </thead>
                <tbody className="bg-[#fbf8f3] divide-y divide-[#e2d6c3]">
                  {parsedSuccessStories.length > 0 ? (
                    parsedSuccessStories.map((st, idx) => (
                      <tr key={idx} className="hover:bg-[#e9eedf]/30">
                        <td className="px-3 py-2 text-[11px] font-bold text-[#3a3225]">
                          {st.station}<br/><span className="text-[10px] text-[#736450]">{st.region}</span>
                        </td>
                        <td className="px-3 py-2 text-center font-bold text-[#596E47] text-[11px]">{st.parsedSuspects}</td>
                        <td className="px-3 py-2 text-[11px] font-extrabold text-[#3a3225] uppercase">
                          {st.parsedClassification}
                        </td>
                        <td className="px-3 py-2 text-[11px] text-[#594d3c] font-bold">
                          {st.parsedRecoveries.split('||').map((item, i) => (
                            <div key={i}>{item.trim()}</div>
                          ))}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-[#3a3225] text-[#f4eee2] uppercase">
                            {st.parsedLegalStatus}
                          </span>
                        </td>
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
              Granular breakdown of offences dynamically tallied by Region and Offence Category.
            </p>
          </div>

          <div className="bg-[#fbf8f3] rounded-xl shadow-xs border border-[#e2d6c3] overflow-hidden">
             <div className="bg-[#efece6] px-4 py-2 border-b border-[#d3c2a8] flex items-center justify-between">
                <h3 className="text-xs font-black text-[#3a3225] uppercase">Aggregated Regional Crime Volumes</h3>
             </div>
             <div className="overflow-x-auto w-full custom-scrollbar">
               <table className="min-w-full divide-y divide-[#e2d6c3]">
                  <thead className="bg-[#efece6]">
                     <tr>
                       <th className="px-3 py-2 text-left text-[11px] font-bold text-[#594d3c] uppercase sticky left-0 bg-[#efece6] z-10 w-64">Command Region</th>
                       <th className="px-3 py-2 text-center text-[11px] font-bold text-[#3a3225] uppercase">Total Crimes Recorded</th>
                     </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e2d6c3]">
                     {crimeCategoryData.map((reg) => {
                        const isExpanded = !!expandedCrimeRegions[reg.region];
                        return (
                          <React.Fragment key={reg.region}>
                            <tr onClick={() => toggleCrimeRegion(reg.region)} className="bg-[#efece6]/50 hover:bg-[#e9eedf]/50 cursor-pointer transition-colors border-t border-[#d3c2a8]">
                               <td className="px-3 py-2 text-[11px] font-extrabold text-[#3a3225] uppercase flex items-center space-x-1.5 sticky left-0 bg-[#efece6]/50">
                                  <span className="text-[#596E47]">{isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
                                  <span>{reg.region}</span>
                               </td>
                               <td className="px-3 py-2 text-[11px] text-center font-black text-amber-800">{reg.totalCrimes}</td>
                            </tr>
                            {isExpanded && reg.categoryList.map((cat, cIdx) => (
                               <tr key={`cat-${cIdx}`} className="bg-white">
                                  <td className="px-3 py-1.5 pl-7 text-[10px] font-semibold text-[#594d3c] uppercase sticky left-0 bg-white">— {cat.name}</td>
                                  <td className="px-3 py-1.5 text-[10px] text-center font-bold text-amber-700">{cat.count}</td>
                               </tr>
                            ))}
                          </React.Fragment>
                        );
                     })}
                     {crimeCategoryData.length === 0 && (
                        <tr><td colSpan="2" className="text-center py-6 text-[11px] text-[#736450]">No crimes logged for the selected period.</td></tr>
                     )}
                  </tbody>
               </table>
             </div>
          </div>
        </div>
      )}

      {/* 🔒 DETENTIONS ANALYSIS TAB (WITH PRECISE STATION OVERSTAY BREAKDOWN) */}
      {activeDomain === 'DETENTIONS' && (
        <div className="space-y-4 pb-12">
          <div className="bg-[#3a3225] rounded-xl p-3.5 text-[#f4eee2] shadow-sm border border-[#534735]">
            <h2 className="text-sm font-extrabold flex items-center tracking-wide text-[#f4eee2]">
              <Lock className="mr-2 text-[#C5A880] w-4 h-4" /> Cell Detentions Time-Series Intelligence & Human Rights Audit
            </h2>
            <p className="text-[11px] text-[#b8ab97] mt-0.5 leading-tight">
              Tracking statutory 48-hour overstays, women counts, juvenile protection, and weekly population fluctuations.
            </p>
          </div>

          {/* Intelligence Alert Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-red-900 text-white p-4 rounded-xl shadow-sm border border-red-950 flex flex-col justify-between">
                <div className="flex items-center justify-between">
                    <span className="text-[10px] font-extrabold uppercase tracking-widest text-red-200">Constitutional Alert</span>
                    <AlertTriangle size={18} className="text-red-300 animate-pulse" />
                </div>
                <div className="mt-3">
                    <div className="text-2xl font-black">{lockupIntelligence.overstayed}</div>
                    <div className="text-xs font-semibold text-red-200">Overstayed Suspects (3+ Days Detention)</div>
                </div>
                <div className="mt-2 text-[10px] text-red-300 font-medium">
                    {Object.keys(lockupIntelligence.stationMap).length > 0 ? (
                        <div>
                            <strong>Station Breakdown:</strong>
                            {Object.entries(lockupIntelligence.stationMap).map(([stn, count]) => (
                                <div key={stn}>• {stn}: {count} suspect(s)</div>
                            ))}
                        </div>
                    ) : "No overstays flagged across stations."}
                </div>
            </div>

            <div className="bg-[#3a3225] text-[#f4eee2] p-4 rounded-xl shadow-sm border border-[#534735] flex flex-col justify-between">
                <div className="flex items-center justify-between">
                    <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#C5A880]">Gender Demographics</span>
                    <Users size={18} className="text-[#C5A880]" />
                </div>
                <div className="mt-3">
                    <div className="text-2xl font-black">{lockupIntelligence.femaleTotal}</div>
                    <div className="text-xs font-semibold text-[#b8ab97]">Total Women in Custody</div>
                </div>
                <div className="mt-2 text-[10px] text-[#b8ab97] font-medium">Breakdown: {lockupIntelligence.femaleAdults} Adults | {lockupIntelligence.femaleJuveniles} Juveniles</div>
            </div>

            <div className="bg-purple-900 text-white p-4 rounded-xl shadow-sm border border-purple-950 flex flex-col justify-between">
                <div className="flex items-center justify-between">
                    <span className="text-[10px] font-extrabold uppercase tracking-widest text-purple-200">Child Protection</span>
                    <Shield size={18} className="text-purple-300" />
                </div>
                <div className="mt-3">
                    <div className="text-2xl font-black">{lockupIntelligence.totalJuveniles}</div>
                    <div className="text-xs font-semibold text-purple-200">Total Juveniles (Minors) in Cells</div>
                </div>
                <div className="mt-2 text-[10px] text-purple-300 font-medium">Mandatory legal aid & probation tracking required.</div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-xs border border-[#e2d6c3] p-4 h-[400px]">
             <h3 className="text-xs font-black text-[#3a3225] uppercase mb-3">Weekly Detentions Trend (Suspect Population & Overstays)</h3>
             {detentionTimeSeriesData.weekly.length > 0 ? (
               <ResponsiveContainer width="100%" height="88%">
                  <LineChart data={detentionTimeSeriesData.weekly} margin={{ top: 10, right: 30, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2d6c3" />
                    <XAxis dataKey="period" tick={{fontSize: 10, fontWeight: 'bold'}} />
                    <YAxis tick={{fontSize: 10}} />
                    <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e2d6c3', fontSize: '11px', fontWeight: 'bold' }} />
                    <Legend wrapperStyle={{ fontSize: '11px', fontWeight: 'bold' }} />
                    <Line type="monotone" dataKey="suspects" name="Total Suspects" stroke="#596E47" strokeWidth={3} dot={{r: 4}} />
                    <Line type="monotone" dataKey="detention_3days_over" name="Detained 3+ Days" stroke="#991B1B" strokeWidth={2} dot={{r: 3}} />
                  </LineChart>
               </ResponsiveContainer>
             ) : (
               <div className="w-full h-full flex items-center justify-center text-[11px] text-[#736450] font-bold">No lockup matrix time-series data available for the selected timeframe.</div>
             )}
          </div>
        </div>
      )}

      {/* 🚓 ACCIDENTS ANALYSIS TAB */}
      {activeDomain === 'ACCIDENTS' && (
        <div className="space-y-4 pb-12">
          <div className="bg-[#3a3225] rounded-xl p-3.5 text-[#f4eee2] shadow-sm border border-[#534735]">
            <h2 className="text-sm font-extrabold flex items-center tracking-wide text-[#f4eee2]">
              <Car className="mr-2 text-[#C5A880] w-4 h-4" /> Traffic & Accidents Time-Series Analytics
            </h2>
            <p className="text-[11px] text-[#b8ab97] mt-0.5 leading-tight">
              Weekly severity progression comparing minor, serious, fatal crashes, and human casualties.
            </p>
          </div>

          <div className="bg-white rounded-xl shadow-xs border border-[#e2d6c3] p-4 h-[400px]">
             <h3 className="text-xs font-black text-[#3a3225] uppercase mb-3">Weekly Accident Crash Severity & Casualties</h3>
             {accidentsTimeSeriesData.weekly.length > 0 ? (
               <ResponsiveContainer width="100%" height="88%">
                  <BarChart data={accidentsTimeSeriesData.weekly} margin={{ top: 10, right: 30, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2d6c3" />
                    <XAxis dataKey="period" tick={{fontSize: 10, fontWeight: 'bold'}} />
                    <YAxis tick={{fontSize: 10}} />
                    <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e2d6c3', fontSize: '11px', fontWeight: 'bold' }} />
                    <Legend wrapperStyle={{ fontSize: '11px', fontWeight: 'bold' }} />
                    <Bar dataKey="minor" name="Minor Crashes" fill="#2563EB" stackId="a" />
                    <Bar dataKey="serious" name="Serious Crashes" fill="#D97706" stackId="a" />
                    <Bar dataKey="fatal" name="Fatal Crashes" fill="#991B1B" stackId="a" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="victims" name="Total Victims" fill="#7C3AED" barSize={15} />
                  </BarChart>
               </ResponsiveContainer>
             ) : (
               <div className="w-full h-full flex items-center justify-center text-[11px] text-[#736450] font-bold">No accident statistics available for the selected timeframe.</div>
             )}
          </div>
        </div>
      )}

      {/* 🔥 FIRE INCIDENTS ANALYSIS TAB */}
      {activeDomain === 'FIRES' && (
        <div className="space-y-4 pb-12">
          <div className="bg-[#3a3225] rounded-xl p-3.5 text-[#f4eee2] shadow-sm border border-[#534735]">
            <h2 className="text-sm font-extrabold flex items-center tracking-wide text-[#f4eee2]">
              <Flame className="mr-2 text-amber-500 w-4 h-4" /> Fire Outbreaks & Arson Intelligence Audit
            </h2>
            <p className="text-[11px] text-[#b8ab97] mt-0.5 leading-tight">
              Intelligently parsed from crime registry narratives, highlighting disaster locations and human casualties.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
             <div className="bg-amber-900 text-white p-4 rounded-xl shadow-sm border border-amber-950 flex flex-col justify-between">
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-amber-200">Total Fire Incidents</span>
                <div className="text-3xl font-black mt-2">{fireIntelligence.totalFires}</div>
                <div className="text-xs text-amber-200 mt-1">Recorded across filtered jurisdictions</div>
             </div>
             <div className="bg-red-950 text-white p-4 rounded-xl shadow-sm border border-red-900 flex flex-col justify-between">
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-red-200">Total Fire Casualties</span>
                <div className="text-3xl font-black mt-2">{fireIntelligence.totalCasualties}</div>
                <div className="text-xs text-red-200 mt-1">Injuries and fatalities from reported fires</div>
             </div>
          </div>

          <div className="bg-[#fbf8f3] rounded-xl shadow-xs border border-[#e2d6c3] overflow-hidden">
            <div className="overflow-x-auto w-full">
              <table className="min-w-full divide-y divide-[#e2d6c3]">
                <thead className="bg-[#efece6]">
                  <tr>
                    <th className="px-3 py-2 text-left text-[11px] font-bold text-[#594d3c] uppercase">Station / Region</th>
                    <th className="px-3 py-2 text-center text-[11px] font-bold text-[#594d3c] uppercase">Casualties</th>
                    <th className="px-3 py-2 text-left text-[11px] font-bold text-[#594d3c] uppercase">Incident Summary & Narrative</th>
                  </tr>
                </thead>
                <tbody className="bg-[#fbf8f3] divide-y divide-[#e2d6c3]">
                  {fireIntelligence.fireList.length > 0 ? (
                    fireIntelligence.fireList.map((f, idx) => (
                      <tr key={idx} className="hover:bg-[#e9eedf]/30">
                        <td className="px-3 py-2 text-[11px] font-bold text-[#3a3225]">
                          {f.station}<br/><span className="text-[10px] text-[#736450]">{f.region}</span>
                        </td>
                        <td className="px-3 py-2 text-center font-black text-red-700 text-[11px]">{f.casualties}</td>
                        <td className="px-3 py-2 text-[11px] text-[#3a3225]">{f.summary}</td>
                      </tr>
                    ))
                  ) : (
                    <tr><td colSpan="3" className="text-center py-6 text-[11px] text-[#736450]">No fire or arson incidents logged matching your filter.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* DISRUPTIVE OPS TAB */}
      {activeDomain === 'OPERATIONS' && (
        <div className="space-y-4 pb-12">
          <div className="bg-[#3a3225] rounded-xl p-3.5 text-[#f4eee2] shadow-sm border border-[#534735]">
            <h2 className="text-sm font-extrabold flex items-center tracking-wide text-[#f4eee2]">
              <Zap className="mr-2 text-[#C5A880] w-4 h-4" /> Comparative Disruptive Operations Matrix
            </h2>
            <p className="text-[11px] text-[#b8ab97] mt-0.5 leading-tight">
              Visualizing Total Crimes Reported against the Total Number of Suspects Arrested via Disruptive Operations.
            </p>
          </div>

          <div className="bg-white rounded-xl shadow-xs border border-[#e2d6c3] p-4 h-[400px]">
             {opsChartData.length > 0 ? (
               <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={opsChartData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2d6c3" />
                    <XAxis dataKey="name" tick={{fontSize: 10, fontWeight: 'bold'}} interval={0} />
                    <YAxis tick={{fontSize: 10}} />
                    <Tooltip cursor={{fill: '#fbf8f3'}} contentStyle={{ borderRadius: '8px', border: '1px solid #e2d6c3', fontSize: '11px', fontWeight: 'bold' }} />
                    <Legend wrapperStyle={{ fontSize: '11px', fontWeight: 'bold' }} />
                    <Bar dataKey="Crimes" name="Total Crimes Reported" fill="#A97142" radius={[4, 4, 0, 0]} barSize={40} />
                    <Bar dataKey="Arrests" name="Arrests from Disruptive Ops" fill="#596E47" radius={[4, 4, 0, 0]} barSize={40} />
                  </BarChart>
               </ResponsiveContainer>
             ) : (
               <div className="w-full h-full flex items-center justify-center text-[11px] text-[#736450] font-bold">No comparative operational data available.</div>
             )}
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
              Grouped, named, and summed by exhibit category, specific description, station, division, region, and status.
            </p>
          </div>

          <div className="bg-[#fbf8f3] rounded-xl shadow-xs border border-[#e2d6c3] overflow-hidden">
            <div className="overflow-x-auto w-full">
              <table className="min-w-full divide-y divide-[#e2d6c3]">
                <thead className="bg-[#efece6]">
                  <tr>
                    <th className="px-3 py-2 text-left text-[11px] font-bold text-[#594d3c] uppercase">Exhibit Category</th>
                    <th className="px-3 py-2 text-left text-[11px] font-bold text-[#594d3c] uppercase">Description (Colour/Features)</th>
                    <th className="px-3 py-2 text-left text-[11px] font-bold text-[#594d3c] uppercase">Region / Station</th>
                    <th className="px-3 py-2 text-center text-[11px] font-bold text-[#594d3c] uppercase">Status</th>
                    <th className="px-3 py-2 text-center text-[11px] font-bold text-[#594d3c] uppercase">Total Count</th>
                  </tr>
                </thead>
                <tbody className="bg-[#fbf8f3] divide-y divide-[#e2d6c3]">
                  {exhibitGroupedData.length > 0 ? (
                    exhibitGroupedData.map((row, idx) => (
                      <tr key={idx} className="hover:bg-[#e9eedf]/30">
                        <td className="px-3 py-2 text-[11px] font-bold text-[#3a3225] uppercase">{row.category}</td>
                        <td className="px-3 py-2 text-[10px] font-bold text-[#596E47] uppercase">{row.desc}</td>
                        <td className="px-3 py-2 text-[10px] font-semibold text-[#736450] uppercase">{row.region}<br/>{row.station}</td>
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
        </div>
      )}

      {/* SUMMARY TABLE TAB */}
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
                <tr className="hover:bg-[#e9eedf]/30"><td className="px-6 py-3 text-sm font-bold text-[#3a3225]">Total Detention Logs Tracked</td><td className="px-6 py-3 text-right font-black text-blue-800 text-sm">{summaryAggregates.totalDetentions}</td></tr>
                <tr className="hover:bg-[#e9eedf]/30"><td className="px-6 py-3 text-sm font-bold text-[#3a3225]">Total Traffic Accidents Recorded</td><td className="px-6 py-3 text-right font-black text-red-800 text-sm">{summaryAggregates.totalAccidents}</td></tr>
                <tr className="hover:bg-[#e9eedf]/30"><td className="px-6 py-3 text-sm font-bold text-[#3a3225]">Total Fire & Arson Outbreaks Tracked</td><td className="px-6 py-3 text-right font-black text-amber-700 text-sm">{summaryAggregates.totalFires}</td></tr>
                <tr className="hover:bg-[#e9eedf]/30"><td className="px-6 py-3 text-sm font-bold text-[#3a3225]">Total Suspects Arrested (Ops)</td><td className="px-6 py-3 text-right font-black text-[#596E47] text-sm">{summaryAggregates.totalArrests}</td></tr>
                <tr className="hover:bg-[#e9eedf]/30"><td className="px-6 py-3 text-sm font-bold text-[#3a3225]">Total Crime Incidents Recorded</td><td className="px-6 py-3 text-right font-black text-[#3a3225] text-sm">{summaryAggregates.totalCrimes}</td></tr>
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
                <h3 className="text-xs font-black text-[#3a3225] uppercase">General Summary (Deployable Personnel vs Rank Distribution)</h3>
             </div>
             <div className="overflow-x-auto w-full custom-scrollbar">
               <table className="min-w-full divide-y divide-[#e2d6c3]">
                  <thead className="bg-[#efece6]">
                     <tr>
                       <th rowSpan={2} className="px-3 py-2 text-left text-[11px] font-bold text-[#594d3c] uppercase sticky left-0 bg-[#efece6] z-10 w-48 border-r border-[#d3c2a8]">Command Region / Station</th>
                       <th rowSpan={2} className="px-3 py-2 text-center text-[10px] font-black text-[#3a3225] uppercase border-r border-[#d3c2a8]">Total Personnel</th>
                       <th rowSpan={2} className="px-2 py-2 text-center text-[10px] font-bold text-[#596E47] uppercase border-r border-[#d3c2a8]">Active Deployable</th>
                       <th rowSpan={2} className="px-2 py-2 text-center text-[10px] font-bold text-red-700 uppercase border-r border-[#d3c2a8]">Inactive (Sick/Leave)</th>
                       {manpowerAnalysis.allRanks.map(rank => (
                         <th key={rank} colSpan={2} className="px-2 py-2 text-center text-[9px] font-extrabold text-[#594d3c] uppercase border-r border-[#d3c2a8]">{rank}</th>
                       ))}
                     </tr>
                     <tr className="bg-white">
                        {manpowerAnalysis.allRanks.map(rank => (
                           <React.Fragment key={`${rank}-gender`}>
                             <th className="px-1 py-1 text-center text-[8px] font-bold text-blue-700 border-r border-[#d3c2a8]">M</th>
                             <th className="px-1 py-1 text-center text-[8px] font-bold text-pink-700 border-r border-[#d3c2a8]">F</th>
                           </React.Fragment>
                        ))}
                     </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e2d6c3]">
                     {manpowerAnalysis.rows.map(reg => {
                        const isExpanded = !!expandedManpowerRegions[reg.region];
                        return (
                          <React.Fragment key={reg.region}>
                            <tr onClick={() => toggleManpowerRegion(reg.region)} className="bg-[#efece6]/50 hover:bg-[#e9eedf]/50 cursor-pointer transition-colors border-t border-[#d3c2a8]">
                               <td className="px-3 py-2 text-[11px] font-extrabold text-[#3a3225] uppercase flex items-center space-x-1.5 sticky left-0 bg-[#efece6]/50 border-r border-[#d3c2a8]">
                                  <span className="text-[#596E47]">{isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
                                  <span>{reg.region}</span>
                               </td>
                               <td className="px-3 py-2 text-[11px] text-center font-black text-[#3a3225] border-r border-[#d3c2a8]">{reg.totalDeployable}</td>
                               <td colSpan={2 + (manpowerAnalysis.allRanks.length * 2)} className="px-3 py-2 text-[10px] text-[#736450] italic">Expand to view station distribution...</td>
                            </tr>
                            {isExpanded && reg.stationList.map((stn, sIdx) => (
                               <tr key={`dep-${sIdx}`} className="bg-white">
                                  <td className="px-3 py-1.5 pl-7 text-[10px] font-semibold text-[#594d3c] uppercase sticky left-0 bg-white border-r border-[#d3c2a8]">— {stn.station}</td>
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             <div className="bg-white rounded-xl shadow-xs border border-[#e2d6c3] p-4 flex flex-col items-center">
                <h3 className="text-xs font-black text-[#3a3225] uppercase border-b border-[#e2d6c3] w-full pb-2 mb-2 flex items-center"><Scale className="w-4 h-4 mr-1.5 text-[#A97142]" /> Gender Distribution Analysis</h3>
                <div className="h-[250px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={manpowerAnalysis.pieGenderData} cx="50%" cy="50%" labelLine={false} label={renderCustomizedLabel} outerRadius={80} fill="#8884d8" dataKey="value">
                        {manpowerAnalysis.pieGenderData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ borderRadius: '8px', fontSize: '11px', fontWeight: 'bold' }} />
                      <Legend wrapperStyle={{ fontSize: '11px', fontWeight: 'bold' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
             </div>
             
             <div className="bg-white rounded-xl shadow-xs border border-[#e2d6c3] p-4 flex flex-col items-center">
                <h3 className="text-xs font-black text-[#3a3225] uppercase border-b border-[#e2d6c3] w-full pb-2 mb-2 flex items-center"><PieChartIcon className="w-4 h-4 mr-1.5 text-[#596E47]" /> Force Deployability Index</h3>
                <div className="h-[250px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={manpowerAnalysis.pieDeployData} cx="50%" cy="50%" labelLine={false} label={renderCustomizedLabel} outerRadius={80} fill="#8884d8" dataKey="value">
                        {manpowerAnalysis.pieDeployData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={PIE_STATUS_COLORS[index % PIE_STATUS_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ borderRadius: '8px', fontSize: '11px', fontWeight: 'bold' }} />
                      <Legend wrapperStyle={{ fontSize: '11px', fontWeight: 'bold' }} />
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