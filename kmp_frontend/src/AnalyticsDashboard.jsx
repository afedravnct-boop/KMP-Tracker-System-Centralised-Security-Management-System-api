import React, { useState, useMemo } from 'react';
import { BarChart3, TrendingUp, TrendingDown, Calendar, Shield, Filter, ArrowUpRight, ArrowDownRight, PieChart, Clock, Users, Award, MapPin, Zap, CheckCircle2, GitCommit, Network } from 'lucide-react';
import * as XLSX from 'xlsx';

const REGIONAL_HIERARCHY = {
  "KMP NORTH": ["KAWEMPE", "KAKIRI", "KASANGATI", "MATUGGA", "NANSANA", "OLD KAMPALA", "WAKISO", "WANDEGEYA"],
  "KMP EAST": ["JINJA ROAD", "KIRA", "KIRA ROAD", "MUKONO", "NAGGALAMA", "SEETA"],
  "KMP SOUTH": ["NATEETE", "CPS KAMPALA", "PARLIAMENT", "ENTEBBE", "KABALAGALA", "KAJJANSI", "KASENYI", "KATWE", "KYENGERA", "NSANGI"],
  "KMP HEADQUARTERS": ["KMP HEADQUARTERS", "FLYING SQUAD", "CRIME INTELLIGENCE"],
  "POLICE HEADQUARTERS": ["NAGURU"]
};

const CHART_COLORS = [
  '#85581A', '#A97142', '#596E47', '#7C9070', '#C5A880', 
  '#4A5D4E', '#B38B59', '#6B5837', '#9E7B54', '#3E4D3E'
];

const RANK_HIERARCHY = [
  "IGP", "DIGP", "AIGP", "SCP", "CP", "ACP", "SSP", "SP", 
  "SASP", "ASP", "IP", "AIP", "HCM", "HC", "S/SGT", "SGT", 
  "CPL", "L/CPL", "PC", "SPC"
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

const classifySuccessStory = (story) => {
  const text = `${story.title || ''} ${story.narrative || ''} ${story.category || ''} ${story.impact_type || ''}`.toUpperCase();
  if (text.includes('MOTORCYCLE') || text.includes('BODA') || text.includes('MOTOR CYCLE') || text.includes('BAJAJ') || text.includes('TVS')) {
    return 'MOTORCYCLE / ASSET RECOVERY';
  }
  if (text.includes('ROBBERY') || text.includes('FOIL') || text.includes('INTERCEPT') || text.includes('WAYLAY') || text.includes('HEIST')) {
    return 'ROBBERY FOILED / ARMED ATTACK BLOCKED';
  }
  if (text.includes('ARREST') || text.includes('WANTED') || text.includes('ROUNDUP') || text.includes('SUSPECTS') || text.includes('APPREHEND')) {
    return 'MASS ARRESTS / WANTED CRIMINALS CAPTURED';
  }
  if (text.includes('GUN') || text.includes('PISTOL') || text.includes('AMMO') || text.includes('WEAPON') || text.includes('RIFLE')) {
    return 'WEAPON RECOVERY / BALLISTIC SEIZURE';
  }
  return 'GENERAL OPERATIONAL BREAKTHROUGH';
};

const AnalyticsDashboard = ({ nominalRolls = [], crimeRegistry = [], successStories = [], operationalStats = [], currentUser }) => {
  const [activeDomain, setActiveDomain] = useState('CRIME');
  const [metricCategory, setMetricCategory] = useState('CATEGORY');
  const [sortOrder, setSortOrder] = useState('DEFAULT');
  const [dateFilter, setDateFilter] = useState('ALL'); 
  
  const [selectedRegion, setSelectedRegion] = useState('ALL REGIONS');
  const [selectedStation, setSelectedStation] = useState('ALL STATIONS');
  const [personnelViewMode, setPersonnelViewMode] = useState('RANKS');
  const [operationsViewMode, setOperationsViewMode] = useState('HIERARCHICAL');

  const currentDataset = useMemo(() => {
    let baseData = [];
    if (activeDomain === 'CRIME') baseData = crimeRegistry.filter(r => !isLockupLog(r)); 
    else if (activeDomain === 'PERSONNEL') baseData = nominalRolls;
    else if (activeDomain === 'SUCCESS') baseData = successStories;
    else if (activeDomain === 'OPERATIONS') baseData = operationalStats;

    if (activeDomain !== 'PERSONNEL' && dateFilter !== 'ALL') {
      const now = new Date();
      baseData = baseData.filter(item => {
        const itemDateStr = item.date || item.createdAt || item.timestamp;
        if (!itemDateStr) return true; 
        const itemDate = new Date(itemDateStr);
        if (isNaN(itemDate)) return true;

        if (dateFilter === 'TODAY') return itemDate.toDateString() === now.toDateString();
        if (dateFilter === 'WEEK') {
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
  }, [activeDomain, crimeRegistry, nominalRolls, successStories, operationalStats, dateFilter]);

  const aggregatedData = useMemo(() => {
    const grouped = {};
    currentDataset.forEach(item => {
      let key = 'UNCLASSIFIED';
      if (activeDomain === 'CRIME') {
        if (metricCategory === 'CATEGORY') key = normalizeOffenceCategory(item.crime_category || item.offence || 'GENERAL CRIME');
        else if (metricCategory === 'CASES') key = (item.status || 'PENDING').toUpperCase();
        else if (metricCategory === 'STATION') key = (item.station || 'UNKNOWN STATION').toUpperCase();
      } else if (activeDomain === 'SUCCESS') {
        key = classifySuccessStory(item);
      } else if (activeDomain === 'OPERATIONS') {
        key = (item.operation_type || item.outcome || item.category || 'SNAP OPERATION / DISRUPTIVE SWEEP').toUpperCase();
      }

      if (!grouped[key]) grouped[key] = { label: key, count: 0 };
      grouped[key].count += 1;
    });

    return Object.values(grouped).sort((a, b) => b.count - a.count);
  }, [currentDataset, activeDomain, metricCategory, sortOrder]);

  const totalRecords = useMemo(() => aggregatedData.reduce((acc, curr) => acc + curr.count, 0), [aggregatedData]);

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

  // 🟢 RELATIONAL IMPACT MATRIX: Links Operations (Arrests/Snaps) -> Success Stories -> Crime Reductions
  const relationalImpactMatrix = useMemo(() => {
    const reports = Array.isArray(crimeRegistry) ? crimeRegistry.filter(r => !isLockupLog(r)) : [];
    const ops = Array.isArray(operationalStats) ? operationalStats : [];
    const successes = Array.isArray(successStories) ? successStories : [];

    const regionMap = {};

    // Initialize regions from hierarchy
    Object.keys(REGIONAL_HIERARCHY).forEach(reg => {
      regionMap[reg] = { region: reg, stations: {}, totalArrests: 0, totalSuccesses: 0, crimeCount: 0 };
      REGIONAL_HIERARCHY[reg].forEach(stn => {
        regionMap[reg].stations[stn] = { station: stn, arrests: 0, successes: 0, crimes: 0 };
      });
    });

    // Aggregate Operations (Arrests from Snap/Disruptive Ops)
    ops.forEach(o => {
      const reg = (o.region || '').trim().toUpperCase();
      const stn = (o.station || '').trim().toUpperCase();
      const arrestsCount = Number(o.arrests || o.suspects || o.suspects_arrested || 1);
      
      if (regionMap[reg] && regionMap[reg].stations[stn]) {
        regionMap[reg].stations[stn].arrests += arrestsCount;
        regionMap[reg].totalArrests += arrestsCount;
      }
    });

    // Aggregate Success Stories (Recoveries, Foiled Robberies)
    successes.forEach(s => {
      const reg = (s.region || '').trim().toUpperCase();
      const stn = (s.station || '').trim().toUpperCase();
      if (regionMap[reg] && regionMap[reg].stations[stn]) {
        regionMap[reg].stations[stn].successes += 1;
        regionMap[reg].totalSuccesses += 1;
      }
    });

    // Aggregate Crimes (To show inverse dependency: higher arrests & breakthroughs -> lower crime volume)
    reports.forEach(r => {
      const reg = (r.region || '').trim().toUpperCase();
      const stn = (r.station || '').trim().toUpperCase();
      if (regionMap[reg] && regionMap[reg].stations[stn]) {
        regionMap[reg].stations[stn].crimes += 1;
        regionMap[reg].crimeCount += 1;
      }
    });

    const rows = [];
    Object.values(regionMap).forEach(regObj => {
      // Region Summary Header
      rows.push({
        isRegionHeader: true,
        region: regObj.region,
        station: `${regObj.region} (REGIONAL COMMAND)`,
        arrests: regObj.totalArrests,
        successes: regObj.totalSuccesses,
        crimes: regObj.crimeCount,
        disruptionRating: regObj.totalArrests > 10 ? 'HIGH DISRUPTION' : regObj.totalArrests > 3 ? 'MODERATE' : 'LOW ACTIVITY'
      });

      // Stations
      Object.values(regObj.stations).forEach(stnObj => {
        if (stnObj.arrests > 0 || stnObj.successes > 0 || stnObj.crimes > 0) {
          rows.push({
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
    });

    return rows;
  }, [crimeRegistry, operationalStats, successStories]);

  // 🟢 Week-to-Week Operations & Crime Comparison
  const operationsTrendsData = useMemo(() => {
    const ops = Array.isArray(operationalStats) ? operationalStats : [];
    const reports = Array.isArray(crimeRegistry) ? crimeRegistry.filter(r => !isLockupLog(r)) : [];

    const stationWeeks = {};
    const allWeeksSet = new Set();

    ops.forEach(o => {
      const weekId = getWeekIdentifier(o.date || o.timestamp);
      const stn = (o.station || 'UNKNOWN').trim().toUpperCase();
      const reg = (o.region || 'UNKNOWN').trim().toUpperCase();
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
        currentOps: cur.opsCount,
        previousOps: prev.opsCount,
        diffArrests
      };
    });

    return { rows: rows.sort((a, b) => b.currentArrests - a.currentArrests), currentWeek, previousWeek };
  }, [operationalStats, crimeRegistry]);

  const handleExportExcel = async () => {
    try {
      const wb = XLSX.utils.book_new();
      const forensicTimestamp = new Date().toISOString();
      const stampedBy = `${currentUser?.rank || 'OFFICER'} ${currentUser?.name || 'UNKNOWN'} (F/NO: ${currentUser?.fnum || 'HQ'})`;
      const commandPost = `${currentUser?.station || 'KMP HEADQUARTERS'}, ${currentUser?.region || 'KMP HEADQUARTERS'}`;

      const metaSheetData = [
        ["KAMPALA METROPOLITAN POLICE - CENTRAL SECURITY DATA MANAGEMENT SYSTEM"],
        ["OFFICIAL FORENSIC ANALYTICS & RELATIONAL IMPACT REPORT"],
        [""],
        ["Export Timestamp (EAT):", forensicTimestamp],
        ["Authorized Exporting Officer:", stampedBy],
        ["Command Jurisdiction:", commandPost],
        ["Security Classification:", "RESTRICTED / ENCRYPTED LAW ENFORCEMENT RECORD"]
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(metaSheetData), "Forensic Audit Stamp");

      if (Array.isArray(operationalStats) && operationalStats.length > 0) {
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(operationalStats), "Disruptive Operations");
      }
      if (Array.isArray(successStories) && successStories.length > 0) {
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(successStories), "Success Stories");
      }

      const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const filename = `KMP_Relational_Operations_Analytics_${new Date().toISOString().split('T')[0]}.xlsx`;
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      setTimeout(() => { document.body.removeChild(link); window.URL.revokeObjectURL(downloadUrl); }, 2000);
      alert("🔒 Relational Operations Report Downloaded Successfully!");
    } catch (error) {
      alert(`Export Failed: ${error.message}`);
    }
  };

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6 animate-in fade-in duration-300 font-sans min-h-screen" style={{ backgroundColor: '#f4eee2' }}>
      
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-[#fbf8f3] p-6 rounded-2xl shadow-sm border border-[#e2d6c3] gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-[#3a3225] tracking-tight">KMP Relational Operations & Intelligence Dashboard</h1>
          <p className="text-xs text-[#736450] mt-1 font-medium">Tracking the dependency matrix: Disruptive Snap Operations ➔ Information Acquisition ➔ Asset Recovery & Gang Dismantling.</p>
        </div>
        <button onClick={handleExportExcel} className="bg-[#596E47] hover:bg-[#4A5D4E] text-white px-5 py-2.5 rounded-xl font-bold text-xs shadow-md transition flex items-center space-x-2 cursor-pointer">
          <span>📥 Download Relational Audit Report (Excel)</span>
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { id: 'OPERATIONS', label: '⚡ Disruptive Operations' },
          { id: 'RELATIONAL', label: '🔗 Relational Impact Matrix' },
          { id: 'SUCCESS', label: '🌟 Success Stories' },
          { id: 'CRIME', label: '📊 Crime Registry' },
          { id: 'TRENDS', label: '📈 Week-to-Week Ops Trends' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => { setActiveDomain(tab.id); setMetricCategory('CATEGORY'); }}
            className={`p-4 rounded-xl font-bold text-xs transition border text-left shadow-sm cursor-pointer ${
              activeDomain === tab.id ? 'bg-[#3a3225] text-[#f4eee2] border-[#3a3225]' : 'bg-[#fbf8f3] text-[#594d3c] border-[#e2d6c3] hover:bg-[#f1ebd9]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeDomain === 'RELATIONAL' ? (
        /* 🟢 RELATIONAL DEPENDENCY MATRIX: SHOWING HOW ARRESTS REDUCE CRIME & UNLOCK PROPERTY */
        <div className="space-y-6 animate-in fade-in duration-200">
          
          <div className="bg-[#3a3225] rounded-2xl p-6 text-[#f4eee2] shadow-xl border border-[#534735]">
            <h2 className="text-xl font-extrabold flex items-center tracking-wide text-[#f4eee2]">
              <Network className="mr-3 text-[#C5A880] w-6 h-6" /> Operations ➔ Intelligence ➔ Crime Suppression Dependency Matrix
            </h2>
            <p className="text-xs text-[#b8ab97] mt-1 leading-relaxed">
              Demonstrating operational impact: Snap sweeps in crime hotspots generate arrests. Interrogations answer pending cases, recover stolen motorcycles/property from hideouts, and dismantle entire syndicates, driving crime down.
            </p>
          </div>

          <div className="bg-[#fbf8f3] rounded-xl shadow-sm border border-[#e2d6c3] overflow-hidden">
            <div className="bg-[#f4eee2] px-6 py-4 border-b border-[#e2d6c3] flex justify-between items-center">
              <h3 className="font-extrabold text-[#3a3225] text-sm uppercase tracking-wider flex items-center">
                <GitCommit size={16} className="mr-2 text-[#596E47]" /> Regional & Divisional Relational Breakdown
              </h3>
              <span className="text-xs font-bold text-[#736450] bg-[#fbf8f3] px-3 py-1 rounded-full border border-[#e2d6c3]">
                Live Dependency Index
              </span>
            </div>

            <div className="overflow-x-auto w-full">
              <table className="min-w-full divide-y divide-[#e2d6c3]">
                <thead className="bg-[#efece6]">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-bold text-[#594d3c] uppercase tracking-wider">Command Region</th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-[#594d3c] uppercase tracking-wider">Station / Hotspot Division</th>
                    <th className="px-6 py-3 text-center text-xs font-bold text-[#594d3c] uppercase tracking-wider">Snap Arrests / Disruptive Ops</th>
                    <th className="px-6 py-3 text-center text-xs font-bold text-[#594d3c] uppercase tracking-wider">Success Breakthroughs (Recoveries)</th>
                    <th className="px-6 py-3 text-center text-xs font-bold text-[#594d3c] uppercase tracking-wider">Active Crime Volume</th>
                    <th className="px-6 py-3 text-center text-xs font-bold text-[#594d3c] uppercase tracking-wider">Operational Impact Status</th>
                  </tr>
                </thead>
                <tbody className="bg-[#fbf8f3] divide-y divide-[#e2d6c3]">
                  {relationalImpactMatrix.map((row, index) => {
                    if (row.isRegionHeader) {
                      return (
                        <tr key={`reg-${index}`} className="bg-[#efece6] font-extrabold text-[#3a3225] border-t-2 border-[#d3c2a8]">
                          <td className="px-6 py-3.5 text-xs uppercase tracking-wider" colSpan="2">🛡️ {row.station}</td>
                          <td className="px-6 py-3.5 text-center font-black text-[#596E47]">{row.arrests} Arrests</td>
                          <td className="px-6 py-3.5 text-center font-black text-amber-800">{row.successes} Breakthroughs</td>
                          <td className="px-6 py-3.5 text-center font-bold">{row.crimes} Crimes</td>
                          <td className="px-6 py-3.5 text-center">
                            <span className="px-2.5 py-1 rounded text-[11px] font-bold bg-[#3a3225] text-[#f4eee2]">{row.disruptionRating}</span>
                          </td>
                        </tr>
                      );
                    }
                    return (
                      <tr key={`stn-${index}`} className="hover:bg-[#e9eedf]/30">
                        <td className="px-6 py-3 pl-10 text-xs font-bold text-[#736450] uppercase">{row.region}</td>
                        <td className="px-6 py-3 text-xs font-bold text-[#594d3c]">— {row.station}</td>
                        <td className="px-6 py-3 text-xs text-center font-bold text-[#596E47]">{row.arrests}</td>
                        <td className="px-6 py-3 text-xs text-center font-bold text-amber-800">{row.successes}</td>
                        <td className="px-6 py-3 text-xs text-center font-bold text-[#3a3225]">{row.crimes}</td>
                        <td className="px-6 py-3 text-center text-xs">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#e9eedf] text-[#3b4c2e]">{row.disruptionRating}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : activeDomain === 'TRENDS' ? (
        /* 🟢 WEEK-TO-WEEK OPERATIONS TRENDS */
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="bg-[#3a3225] rounded-2xl p-6 text-[#f4eee2] shadow-xl flex justify-between items-center">
            <div>
              <h2 className="text-xl font-extrabold">Week-to-Week Disruptive Operations & Arrest Trends</h2>
              <p className="text-xs text-[#b8ab97] mt-1">Comparing snap sweeps and suspect apprehensions ({operationsTrendsData.previousWeek} vs {operationsTrendsData.currentWeek})</p>
            </div>
          </div>

          <div className="bg-[#fbf8f3] rounded-xl shadow-sm border border-[#e2d6c3] overflow-hidden">
            <table className="min-w-full divide-y divide-[#e2d6c3]">
              <thead className="bg-[#efece6]">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-bold text-[#594d3c] uppercase">Region</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-[#594d3c] uppercase">Station / Post</th>
                  <th className="px-6 py-3 text-center text-xs font-bold text-[#594d3c] uppercase">Previous Arrests</th>
                  <th className="px-6 py-3 text-center text-xs font-bold text-[#594d3c] uppercase">Current Arrests</th>
                  <th className="px-6 py-3 text-center text-xs font-bold text-[#594d3c] uppercase">Arrests Variance</th>
                </tr>
              </thead>
              <tbody className="bg-[#fbf8f3] divide-y divide-[#e2d6c3]">
                {operationsTrendsData.rows.map((row, index) => (
                  <tr key={index} className="hover:bg-[#e9eedf]/30">
                    <td className="px-6 py-3 text-xs font-bold text-[#736450] uppercase">{row.region}</td>
                    <td className="px-6 py-3 text-xs font-bold text-[#3a3225]">{row.station}</td>
                    <td className="px-6 py-3 text-xs text-center">{row.previousArrests}</td>
                    <td className="px-6 py-3 text-xs text-center font-bold text-[#596E47]">{row.currentArrests}</td>
                    <td className={`px-6 py-3 text-xs text-center font-extrabold ${row.diffArrests >= 0 ? 'text-[#596E47]' : 'text-amber-800'}`}>
                      {row.diffArrests > 0 ? `+${row.diffArrests}` : row.diffArrests}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* STANDARD DOMAIN VIEW */
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="bg-[#fbf8f3] p-4 rounded-xl shadow-sm border border-[#e2d6c3] flex justify-between items-center">
            <span className="text-xs font-extrabold text-[#596E47] bg-[#e9eedf] px-3 py-1.5 rounded-lg border border-[#cfe1b9]">
              Total Analyzed Entries ({activeDomain}): {totalRecords}
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-[#fbf8f3] p-6 rounded-2xl shadow-sm border border-[#e2d6c3] flex flex-col items-center justify-between">
              <h3 className="text-sm font-bold text-[#3a3225] uppercase tracking-wide w-full text-left mb-4">Proportional Share</h3>
              <div className="relative w-48 h-48 my-2">
                <svg viewBox="0 0 100 100" className="w-full h-full transform -rotate-90">
                  {pieSlices.map((slice, idx) => <path key={idx} d={slice.pathData} fill={slice.color} />)}
                </svg>
              </div>
            </div>

            <div className="bg-[#fbf8f3] p-6 rounded-2xl shadow-sm border border-[#e2d6c3] space-y-4">
              <h3 className="text-sm font-bold text-[#3a3225] uppercase tracking-wide">Comparative Distribution</h3>
              <div className="space-y-3 max-h-[340px] overflow-y-auto pr-2 custom-scrollbar">
                {aggregatedData.map((item, idx) => {
                  const percentage = totalRecords > 0 ? (item.count / totalRecords) * 100 : 0;
                  return (
                    <div key={idx} className="space-y-1">
                      <div className="flex justify-between text-xs font-bold text-[#594d3c]">
                        <span className="truncate pr-2 uppercase">{item.label}</span>
                        <span className="text-[#596E47]">{item.count} ({percentage.toFixed(1)}%)</span>
                      </div>
                      <div className="w-full bg-[#efece6] h-3 rounded-full overflow-hidden">
                        <div className="bg-[#596E47] h-full rounded-full" style={{ width: `${Math.max(percentage, 2)}%` }}></div>
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