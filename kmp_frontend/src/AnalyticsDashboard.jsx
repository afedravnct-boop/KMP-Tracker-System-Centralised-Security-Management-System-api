import React, { useState, useMemo } from 'react';
import { BarChart3, TrendingUp, TrendingDown, Calendar, Shield, Filter, ArrowUpRight, ArrowDownRight, PieChart } from 'lucide-react';
import * as XLSX from 'xlsx';

const REGIONAL_HIERARCHY = {
  "KMP NORTH": ["KAWEMPE", "KAKIRI", "KASANGATI", "MATUGGA", "NANSANA", "OLD KAMPALA", "WAKISO", "WANDEGEYA"],
  "KMP EAST": ["JINJA ROAD", "KIRA", "KIRA ROAD", "MUKONO", "NAGGALAMA", "SEETA"],
  "KMP SOUTH": ["NATEETE", "CPS KAMPALA", "PARLIAMENT", "ENTEBBE", "KABALAGALA", "KAJJANSI", "KASENYI", "KATWE", "KYENGERA", "NSANGI"],
  "KMP HEADQUARTERS": ["KMP HEADQUARTERS", "FLYING SQUAD", "CRIME INTELLIGENCE"],
  "POLICE HEADQUARTERS": ["NAGURU"]
};

const CHART_COLORS = [
  '#2563eb', '#7c3aed', '#db2777', '#ea580c', '#16a34a', 
  '#0891b2', '#4f46e5', '#9333ea', '#e11d48', '#ca8a04'
];

// OFFICIAL UPF RANK HIERARCHY
const RANK_HIERARCHY = [
  "IGP", "DIGP", "AIGP", "SCP", "CP", "ACP", "SSP", "SP", 
  "SASP", "ASP", "IP", "AIP", "HCM", "HC", "S/SGT", "SGT", 
  "CPL", "L/CPL", "PC", "SPC"
];

// Highly Specific Education Parser
const parseEducationLevel = (rawVal) => {
  if (!rawVal) return "UNEDUCATED / NOT SPECIFIED";
  const str = String(rawVal).trim().toUpperCase();
  
  if (!str || str === 'NONE' || str === 'N/A' || str === 'NIL' || str === 'NO' || str === 'UNEDUCATED') {
    return "UNEDUCATED";
  }

  // --- 1. BACHELORS / DEGREES (Qualification + Specific Course) ---
  if (
    str.includes("BACHELOR") || str.includes("DEGREE") || str.includes("B.A") || 
    str.includes("B.SC") || str.includes("BSC") || str.includes("BED") || 
    str.includes("LLB") || str.includes("BIT") || str.includes("BBA")
  ) {
    let course = str
      .replace(/BACHELOR['’]?S?(\s+OF|\s+IN)?/g, '')
      .replace(/DEGREE(\s+IN)?/g, '')
      .replace(/B\.?SC\.?/g, 'SCIENCE')
      .replace(/B\.?A\.?/g, 'ARTS')
      .replace(/B\.?COM\.?/g, 'COMMERCE')
      .replace(/B\.?I\.?T\.?/g, 'INFORMATION TECHNOLOGY')
      .replace(/B\.?B\.?A\.?/g, 'BUSINESS ADMINISTRATION')
      .replace(/L\.?L\.?B\.?/g, 'LAW')
      .replace(/^[-:\s]+|[-:\s]+$/g, '')
      .trim();

    return course && course !== 'SCIENCE' && course !== 'ARTS'
      ? `BACHELORS - ${course}`
      : `BACHELORS (${str})`;
  }

  // --- 2. DIPLOMAS (Qualification + Specific Course) ---
  if (str.includes("DIPLOMA") || str.includes("DIP.")) {
    let course = str
      .replace(/DIPLOMA(\s+IN)?/g, '')
      .replace(/DIP\.?/g, '')
      .replace(/^[-:\s]+|[-:\s]+$/g, '')
      .trim();

    return course ? `DIPLOMA - ${course}` : `DIPLOMA (${str})`;
  }

  // --- 3. CERTIFICATES (Qualification + Specific Course) ---
  if (str.includes("CERTIFICATE") || str.includes("CERT.")) {
    let course = str
      .replace(/CERTIFICATE(\s+IN)?/g, '')
      .replace(/CERT\.?/g, '')
      .replace(/^[-:\s]+|[-:\s]+$/g, '')
      .trim();

    return course ? `CERTIFICATE - ${course}` : `CERTIFICATE (${str})`;
  }

  // --- 4. VOCATIONAL & HIGH SCHOOL STANDARDS ---
  if (str.includes("UBTEB") || str.includes("VOCATIONAL") || str.includes("TECHNICAL")) return "UBTEB / TECHNICAL";
  if (str.includes("UACE") || str.includes("A LEVEL") || str.includes("A-LEVEL") || str.includes("S.6") || str.includes("S6") || str.includes("SENIOR 6")) return "UACE (A-LEVEL)";
  if (str.includes("UCE") || str.includes("O LEVEL") || str.includes("O-LEVEL") || str.includes("S.4") || str.includes("S4") || str.includes("SENIOR 4")) return "UCE (O-LEVEL)";
  
  // --- 5. LOWER SECONDARY LEVELS ---
  if (str.includes("S.3") || str.includes("S3") || str.includes("SENIOR 3")) return "S.3";
  if (str.includes("S.2") || str.includes("S2") || str.includes("SENIOR 2")) return "S.2";
  if (str.includes("S.1") || str.includes("S1") || str.includes("SENIOR 1")) return "S.1";

  // --- 6. PRIMARY SCHOOL LEVELS ---
  if (str.includes("P.7") || str.includes("P7") || str.includes("PLE") || str.includes("PRIMARY 7")) return "P.7 (PLE)";
  if (str.includes("P.6") || str.includes("P6") || str.includes("PRIMARY 6")) return "P.6";
  if (str.includes("P.5") || str.includes("P5") || str.includes("PRIMARY 5")) return "P.5";
  if (str.includes("P.4") || str.includes("P4") || str.includes("PRIMARY 4")) return "P.4";
  if (str.includes("P.3") || str.includes("P3") || str.includes("PRIMARY 3")) return "P.3";
  if (str.includes("P.2") || str.includes("P2") || str.includes("PRIMARY 2")) return "P.2";
  if (str.includes("P.1") || str.includes("P1") || str.includes("PRIMARY 1")) return "P.1";

  // Fallback for custom unmapped qualifications
  return str;
};

const AnalyticsDashboard = ({ nominalRolls = [], crimeRegistry = [], successStories = [], operationalStats = [], currentUser }) => {
  const [activeDomain, setActiveDomain] = useState('CRIME');
  const [metricCategory, setMetricCategory] = useState('CATEGORY');
  const [sortOrder, setSortOrder] = useState('DEFAULT');
  
  const [selectedRegion, setSelectedRegion] = useState('ALL REGIONS');
  const [selectedStation, setSelectedStation] = useState('ALL STATIONS');

  const currentDataset = useMemo(() => {
    if (activeDomain === 'CRIME') return crimeRegistry;
    if (activeDomain === 'PERSONNEL') return nominalRolls;
    if (activeDomain === 'SUCCESS') return successStories;
    if (activeDomain === 'OPERATIONS') return operationalStats;
    return [];
  }, [activeDomain, crimeRegistry, nominalRolls, successStories, operationalStats]);

  const aggregatedData = useMemo(() => {
    const grouped = {};
    
    currentDataset.forEach(item => {
      let key = 'UNCLASSIFIED';
      
      if (activeDomain === 'CRIME') {
        if (metricCategory === 'CATEGORY') key = (item.crime_category || item.offence || 'GENERAL CRIME').toUpperCase();
        else if (metricCategory === 'CASES') key = (item.status || 'PENDING').toUpperCase();
        else if (metricCategory === 'ARRESTS') key = String(item.suspects || item.arrested || '0').toUpperCase();
        else if (metricCategory === 'CONVICTIONS') key = String(item.convicted || '0').toUpperCase();
        else if (metricCategory === 'CONCLUDED') key = (item.status === 'CONCLUDED' || item.status === 'COMPLETED' ? 'CONCLUDED' : 'PENDING / IN PROGRESS').toUpperCase();
        else if (metricCategory === 'STATION') key = (item.station || 'UNKNOWN STATION').toUpperCase();
      } 
      else if (activeDomain === 'PERSONNEL') {
        if (metricCategory === 'RANK') key = (item.rank || 'UNRANKED').toUpperCase().trim();
        else if (metricCategory === 'UNIT' || metricCategory === 'STATION') key = (item.station || 'UNKNOWN').toUpperCase();
        // 🟢 NEW: Home District and Bank & Branch added to logic here
        else if (metricCategory === 'DISTRICT') key = (item.homedist || item.home_dist || 'UNSPECIFIED DISTRICT').toUpperCase().trim();
        else if (metricCategory === 'BANK_BRANCH') key = (item.bankbranch || item.bank_branch || 'UNSPECIFIED BANK / BRANCH').toUpperCase().trim();
        else if (metricCategory === 'EDUCATION') key = parseEducationLevel(item.educlevel || item.educ_level); 
        else if (metricCategory === 'AGE') {
          const dob = item.dob;
          if (dob) {
            const birthYear = new Date(dob).getFullYear();
            const age = new Date().getFullYear() - birthYear;
            if (age < 25) key = 'UNDER 25 YRS';
            else if (age <= 35) key = '25 - 35 YRS';
            else if (age <= 45) key = '36 - 45 YRS';
            else key = 'ABOVE 45 YRS';
          } else {
            key = 'UNKNOWN AGE';
          }
        }
        else if (metricCategory === 'SEX') {
          const rawSex = (item.sex || '').trim().toUpperCase();
          if (rawSex.startsWith('M')) key = 'MALE';
          else if (rawSex.startsWith('F')) key = 'FEMALE';
          else key = 'UNSPECIFIED';
        }
        else if (metricCategory === 'DIR') key = (item.dir || 'GENERAL DIRECTORATE').toUpperCase();
        else if (metricCategory === 'SECTION') key = (item.section || 'GENERAL SECTION').toUpperCase();
      }
      else if (activeDomain === 'SUCCESS') {
        if (metricCategory === 'CATEGORY') key = (item.impact_type || item.category || 'COMMUNITY RECOVERY').toUpperCase();
        else if (metricCategory === 'STATUS') key = (item.status || 'COMPLETED').toUpperCase();
        else if (metricCategory === 'STATION') key = (item.station || 'UNKNOWN STATION').toUpperCase();
      }
      else if (activeDomain === 'OPERATIONS') {
        if (metricCategory === 'CATEGORY') key = (item.operation_type || item.outcome || 'STANDARD DEPLOYMENT').toUpperCase();
        else if (metricCategory === 'STATION') key = (item.station || 'UNKNOWN STATION').toUpperCase();
      }

      if (!grouped[key]) grouped[key] = { label: key, count: 0 };
      grouped[key].count += 1;
    });

    // DYNAMIC SORTING LOGIC
    return Object.values(grouped).sort((a, b) => {
      // 1. SMART DEFAULT OR FORCED HIERARCHY
      if (sortOrder === 'HIERARCHY' || (sortOrder === 'DEFAULT' && activeDomain === 'PERSONNEL' && metricCategory === 'RANK')) {
        const indexA = RANK_HIERARCHY.indexOf(a.label);
        const indexB = RANK_HIERARCHY.indexOf(b.label);
        const weightA = indexA === -1 ? 999 : indexA;
        const weightB = indexB === -1 ? 999 : indexB;
        return weightA - weightB;
      }
      
      // 2. ALPHABETICAL ASCENDING (A-Z)
      if (sortOrder === 'ALPHA_ASC') return a.label.localeCompare(b.label);
      
      // 3. ALPHABETICAL DESCENDING (Z-A)
      if (sortOrder === 'ALPHA_DESC') return b.label.localeCompare(a.label);
      
      // 4. FREQUENCY ASCENDING (Lowest First)
      if (sortOrder === 'FREQ_ASC') return a.count - b.count;
      
      // 5. FREQUENCY DESCENDING (Highest First)
      return b.count - a.count;
    });
  }, [currentDataset, activeDomain, metricCategory, sortOrder]);

  const totalRecords = useMemo(() => aggregatedData.reduce((acc, curr) => acc + curr.count, 0), [aggregatedData]);

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
      
      const pathData = totalRecords === 1 || percent === 1
        ? "M 50 10 A 40 40 0 1 1 49.99 10 Z"
        : `M 50 50 L ${x1} ${y1} A 40 40 0 ${largeArcFlag} 1 ${x2} ${y2} Z`;

      return {
        label: item.label,
        count: item.count,
        percent: (percent * 100).toFixed(1),
        color: CHART_COLORS[index % CHART_COLORS.length],
        pathData
      };
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

  const weekComparisonData = useMemo(() => {
    const reports = Array.isArray(crimeRegistry) ? crimeRegistry : [];

    const filtered = reports.filter(r => {
      const reg = (r.region || '').trim().toUpperCase();
      const stn = (r.station || '').trim().toUpperCase();
      if (selectedRegion !== 'ALL REGIONS' && reg !== selectedRegion.toUpperCase()) return false;
      if (selectedStation !== 'ALL STATIONS' && stn !== selectedStation.toUpperCase()) return false;
      return true;
    });

    const stationWeekMap = {};
    const allWeeksSet = new Set();

    filtered.forEach(r => {
      const weekId = getWeekIdentifier(r.date);
      const station = (r.station || 'UNKNOWN STATION').trim().toUpperCase();
      const region = (r.region || 'UNKNOWN REGION').trim().toUpperCase();

      if (!weekId) return;
      allWeeksSet.add(weekId);

      if (!stationWeekMap[station]) {
        stationWeekMap[station] = { region, station, weeks: {} };
      }
      stationWeekMap[station].weeks[weekId] = (stationWeekMap[station].weeks[weekId] || 0) + 1;
    });

    const sortedWeeks = Array.from(allWeeksSet).sort();
    const currentWeek = sortedWeeks[sortedWeeks.length - 1] || 'N/A';
    const previousWeek = sortedWeeks[sortedWeeks.length - 2] || 'N/A';

    const rows = Object.values(stationWeekMap).map(item => {
      const currentCount = item.weeks[currentWeek] || 0;
      const previousCount = item.weeks[previousWeek] || 0;
      const diff = currentCount - previousCount;
      const pctChange = previousCount === 0 ? (currentCount > 0 ? 100 : 0) : Math.round((diff / previousCount) * 100);

      return {
        region: item.region,
        station: item.station,
        currentWeekCount: currentCount,
        previousWeekCount: previousCount,
        diff,
        pctChange
      };
    });

    return {
      rows: rows.sort((a, b) => b.currentWeekCount - a.currentWeekCount),
      currentWeek,
      previousWeek
    };
  }, [crimeRegistry, selectedRegion, selectedStation]);

const handleExportExcel = async () => {
    try {
      const wb = XLSX.utils.book_new();

      const forensicTimestamp = new Date().toISOString();
      const stampedBy = `${currentUser?.rank || 'OFFICER'} ${currentUser?.name || 'UNKNOWN'} (F/NO: ${currentUser?.fnum || 'HQ'})`;
      const commandPost = `${currentUser?.station || 'KMP HEADQUARTERS'}, ${currentUser?.region || 'KMP HEADQUARTERS'}`;

      // 1. Audit Stamp Sheet
      const metaSheetData = [
        ["KAMPALA METROPOLITAN POLICE - CENTRAL SECURITY DATA MANAGEMENT SYSTEM"],
        ["OFFICIAL FORENSIC ANALYTICS AUDIT REPORT"],
        [""],
        ["Export Timestamp (EAT):", forensicTimestamp],
        ["Authorized Exporting Officer:", stampedBy],
        ["Command Jurisdiction:", commandPost],
        ["Security Classification:", "RESTRICTED / ENCRYPTED LAW ENFORCEMENT RECORD"],
        ["System Audit Hash:", `KMP-CSDMS-ANALYTICS-${Math.random().toString(36).substring(2, 12).toUpperCase()}`]
      ];
      const wsMeta = XLSX.utils.aoa_to_sheet(metaSheetData);
      XLSX.utils.book_append_sheet(wb, wsMeta, "Forensic Audit Stamp");

      // 🟢 2. Crime Registry Sheet
      if (Array.isArray(crimeRegistry) && crimeRegistry.length > 0) {
        const crimeData = crimeRegistry.map((r, index) => ({
          "S/N": index + 1,
          "Database Audit ID": r.id || r.sn, 
          "Reference": r.sdRef || r.sd_ref,
          "Date": r.date,
          "Region": r.region,
          "Station": r.station,
          "Offence": r.offence,
          "Status": r.status,
          "Suspects": r.suspects || 0
        }));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(crimeData), "Crime Registry");
      }

      // 🟢 3. Nominal Roll Sheet 
      if (Array.isArray(nominalRolls) && nominalRolls.length > 0) {
        const nomData = nominalRolls.map((n, index) => ({
          "S/N": index + 1, 
          "Database Audit ID": n.id || n.sn, 
          "Force Number": n.fnum || n.f_num,
          "Rank": n.rank,
          "Full Name": n.name,
          "Sex": n.sex,
          "Education": n.educlevel || n.educ_level || 'NOT SPECIFIED',
          "Home District": n.homedist || n.home_dist || 'NOT SPECIFIED',
          "Bank & Branch": n.bankbranch || n.bank_branch || 'NOT SPECIFIED',
          "Position": n.position,
          "Station": n.station,
          "Region": n.region,
          "Status": n.status
        }));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(nomData), "Nominal Roll");
      }

      // 🟢 4. Operations Stats Sheet
      if (Array.isArray(operationalStats) && operationalStats.length > 0) {
        const opsData = operationalStats.map((o, index) => ({
          "S/N": index + 1,
          "Database Audit ID": o.id || o.sn || 'N/A',
          ...o
        }));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(opsData), "Operations Stats");
      }

      // 🟢 5. Success Stories Sheet
      if (Array.isArray(successStories) && successStories.length > 0) {
        const successData = successStories.map((s, index) => ({
          "S/N": index + 1,
          "Database Audit ID": s.id || s.sn || 'N/A',
          ...s
        }));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(successData), "Success Stories");
      }

      wb.Props = {
        Title: "KMP Command Analytics Report",
        Subject: `Encrypted Analytics generated by ${stampedBy}`,
        Author: stampedBy,
        Manager: "Kampala Metropolitan Police Command",
        Company: "Uganda Police Force",
        CreatedDate: new Date()
      };

      const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

      const filename = `KMP_Command_Analytics_Report_${new Date().toISOString().split('T')[0]}.xlsx`;
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.style.display = 'none';
      link.href = downloadUrl;
      link.download = filename;
      
      document.body.appendChild(link);
      link.click();
      
      setTimeout(() => {
        document.body.removeChild(link);
        window.URL.revokeObjectURL(downloadUrl);
      }, 2000);

      alert("🔒 Secure Analytics Report Downloaded Successfully!\n\nNote: Serial numbers (S/N) are chronologically numbered 1 through N for your regional jurisdiction, with Database Audit IDs preserved.");

    } catch (error) {
      console.error("Secure Export Error:", error);
      alert(`Export Failed: ${error.message}`);
    }
  };

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6 animate-in fade-in duration-300 font-sans">
      
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-200 gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">KMP Command Analytics Dashboard</h1>
          <p className="text-xs text-slate-500 mt-1 font-medium">Real-time cross-tabulation, visual metrics, intelligence tracking, and encrypted reporting.</p>
        </div>
        <button 
          onClick={handleExportExcel}
          className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl font-bold text-xs shadow-md transition flex items-center space-x-2 cursor-pointer"
        >
          <span>📥 Download 4-Sheet Analytics Report (Excel)</span>
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { id: 'CRIME', label: '📊 Crime Registry' },
          { id: 'PERSONNEL', label: '🛡️ Nominal Roll' },
          { id: 'SUCCESS', label: '🌟 Success Stories' },
          { id: 'OPERATIONS', label: '⚡ Operations' },
          { id: 'TRENDS', label: '📈 Week-to-Week Trends' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => { setActiveDomain(tab.id); setMetricCategory('CATEGORY'); setSortOrder('DEFAULT'); }}
            className={`p-4 rounded-xl font-bold text-xs transition border text-left shadow-sm cursor-pointer ${
              activeDomain === tab.id 
                ? 'bg-slate-900 text-white border-slate-900' 
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeDomain === 'TRENDS' ? (
        <div className="space-y-6 animate-in fade-in duration-200">
          
          <div className="bg-slate-900 rounded-2xl p-6 text-white shadow-xl flex flex-col md:flex-row justify-between items-center gap-4">
            <div>
              <h2 className="text-xl font-extrabold flex items-center tracking-wide">
                <TrendingUp className="mr-3 text-blue-400 w-6 h-6" /> Week-to-Week Comparative Crime Volume
              </h2>
              <p className="text-xs text-slate-400 mt-1 uppercase tracking-wider">
                Analyzing trends across regions and stations ({weekComparisonData.previousWeek} vs {weekComparisonData.currentWeek})
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <select 
                value={selectedRegion} 
                onChange={(e) => { setSelectedRegion(e.target.value); setSelectedStation('ALL STATIONS'); }}
                className="bg-slate-800 text-white border border-slate-700 text-xs font-bold rounded-lg px-3 py-2 outline-none focus:border-blue-400 cursor-pointer"
              >
                <option value="ALL REGIONS">ALL REGIONS</option>
                <option value="KMP NORTH">KMP NORTH</option>
                <option value="KMP EAST">KMP EAST</option>
                <option value="KMP SOUTH">KMP SOUTH</option>
                <option value="KMP HEADQUARTERS">KMP HEADQUARTERS</option>
                <option value="POLICE HEADQUARTERS">POLICE HEADQUARTERS</option>
              </select>

              <select 
                value={selectedStation} 
                onChange={(e) => setSelectedStation(e.target.value)}
                className="bg-slate-800 text-white border border-slate-700 text-xs font-bold rounded-lg px-3 py-2 outline-none focus:border-blue-400 cursor-pointer"
              >
                <option value="ALL STATIONS">ALL STATIONS</option>
                {selectedRegion !== 'ALL REGIONS' && (REGIONAL_HIERARCHY[selectedRegion] || []).map(stn => (
                  <option key={stn} value={stn}>{stn}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Current Period ({weekComparisonData.currentWeek})</span>
                <div className="text-3xl font-extrabold text-blue-700 mt-1">
                  {weekComparisonData.rows.reduce((sum, r) => sum + r.currentWeekCount, 0)} <span className="text-sm font-medium text-slate-500">Cases</span>
                </div>
              </div>
              <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600">
                <Calendar size={24} />
              </div>
            </div>

            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Previous Period ({weekComparisonData.previousWeek})</span>
                <div className="text-3xl font-extrabold text-slate-700 mt-1">
                  {weekComparisonData.rows.reduce((sum, r) => sum + r.previousWeekCount, 0)} <span className="text-sm font-medium text-slate-500">Cases</span>
                </div>
              </div>
              <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center text-slate-600">
                <Shield size={24} />
              </div>
            </div>

            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Net Trend Shift</span>
                {(() => {
                  const curTotal = weekComparisonData.rows.reduce((sum, r) => sum + r.currentWeekCount, 0);
                  const prevTotal = weekComparisonData.rows.reduce((sum, r) => sum + r.previousWeekCount, 0);
                  const diff = curTotal - prevTotal;
                  return (
                    <div className={`text-3xl font-extrabold mt-1 flex items-center ${diff <= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {diff > 0 ? `+${diff}` : diff} 
                      {diff <= 0 ? <ArrowDownRight className="ml-2 w-6 h-6" /> : <ArrowUpRight className="ml-2 w-6 h-6" />}
                    </div>
                  );
                })()}
              </div>
              <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600">
                <BarChart3 size={24} />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
              <h3 className="font-extrabold text-slate-800 text-sm uppercase tracking-wider flex items-center">
                <Filter size={16} className="mr-2 text-blue-600" /> Week-to-Week Crime Volume Breakdown by Station
              </h3>
              <span className="text-xs font-bold text-slate-500 bg-white px-3 py-1 rounded-full border shadow-xs">
                {weekComparisonData.rows.length} Stations Monitored
              </span>
            </div>

            <div className="overflow-x-auto w-full">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Region</th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Station / Division</th>
                    <th className="px-6 py-3 text-center text-xs font-bold text-slate-600 uppercase tracking-wider">Previous Week ({weekComparisonData.previousWeek})</th>
                    <th className="px-6 py-3 text-center text-xs font-bold text-slate-600 uppercase tracking-wider">Current Week ({weekComparisonData.currentWeek})</th>
                    <th className="px-6 py-3 text-center text-xs font-bold text-slate-600 uppercase tracking-wider">Variance (Cases)</th>
                    <th className="px-6 py-3 text-center text-xs font-bold text-slate-600 uppercase tracking-wider">Trend Direction</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {weekComparisonData.rows.map((row, index) => (
                    <tr key={index} className="even:bg-slate-50 hover:bg-blue-50/50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-xs font-bold text-slate-500 uppercase">{row.region}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-extrabold text-blue-700">{row.station}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-center font-bold text-slate-600">{row.previousWeekCount}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-center font-extrabold text-slate-900">{row.currentWeekCount}</td>
                      <td className={`px-6 py-4 whitespace-nowrap text-sm text-center font-extrabold ${row.diff > 0 ? 'text-red-600' : row.diff < 0 ? 'text-green-600' : 'text-slate-500'}`}>
                        {row.diff > 0 ? `+${row.diff}` : row.diff}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        {row.diff > 0 ? (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-800">
                            <TrendingUp size={14} className="mr-1" /> +{row.pctChange}% (Up)
                          </span>
                        ) : row.diff < 0 ? (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-green-100 text-green-800">
                            <TrendingDown size={14} className="mr-1" /> {row.pctChange}% (Down)
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700">
                            Stable (0%)
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {weekComparisonData.rows.length === 0 && (
                    <tr>
                      <td colSpan="6" className="text-center py-10 text-slate-400 font-medium text-sm">
                        No crime incidents found matching the selected parameters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      ) : (
        <div className="space-y-6 animate-in fade-in duration-200">
          
          <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 w-full md:w-auto">
              {/* 🟢 Group By Filter */}
              <div className="flex items-center space-x-3 w-full sm:w-auto">
                <span className="text-xs font-bold text-slate-500 uppercase whitespace-nowrap">Group By:</span>
                <select 
                  value={metricCategory}
                  onChange={e => {
                    setMetricCategory(e.target.value);
                    setSortOrder('DEFAULT');
                  }}
                  className="border border-slate-300 rounded-lg p-2 text-xs font-bold text-slate-800 bg-white outline-none cursor-pointer w-full sm:w-auto"
                >
                  {activeDomain === 'CRIME' && (
                    <>
                      <option value="CATEGORY">Crime Category / Offence</option>
                      <option value="CASES">Cases Reported / Case Status</option>
                      <option value="ARRESTS">Offenders Arrested</option>
                      <option value="CONVICTIONS">Offenders Convicted</option>
                      <option value="CONCLUDED">Cases investigated to conclusion</option>
                      <option value="STATION">Police Station</option>
                    </>
                  )}
                  {activeDomain === 'PERSONNEL' && (
                    <>
                      <option value="RANK">Officer Rank</option>
                      <option value="EDUCATION">Education Level & Courses</option>
                      <option value="BANK_BRANCH">Bank & Branch</option>
                      <option value="DISTRICT">Home District</option>
                      <option value="UNIT">Station / Unit</option>
                      <option value="AGE">Age</option>
                      <option value="SEX">Sex</option>
                      <option value="DIR">Directorate</option>
                      <option value="SECTION">Section</option>
                    </>
                  )}
                  {activeDomain === 'SUCCESS' && (
                    <>
                      <option value="CATEGORY">Success Impact Type</option>
                      <option value="STATUS">Status</option>
                      <option value="STATION">Police Station</option>
                    </>
                  )}
                  {activeDomain === 'OPERATIONS' && (
                    <>
                      <option value="CATEGORY">Deployment / Outcome Type</option>
                      <option value="STATION">Police Station</option>
                    </>
                  )}
                </select>
              </div>

              {/* Sort By Filter */}
              <div className="flex items-center space-x-3 w-full sm:w-auto">
                <span className="text-xs font-bold text-slate-500 uppercase whitespace-nowrap">Sort By:</span>
                <select 
                  value={sortOrder}
                  onChange={e => setSortOrder(e.target.value)}
                  className="border border-slate-300 rounded-lg p-2 text-xs font-bold text-slate-800 bg-white outline-none cursor-pointer w-full sm:w-auto"
                >
                  <option value="DEFAULT">Smart Default</option>
                  <option value="FREQ_DESC">Frequency (Highest First)</option>
                  <option value="FREQ_ASC">Frequency (Lowest First)</option>
                  <option value="ALPHA_ASC">Alphabetical (A - Z)</option>
                  <option value="ALPHA_DESC">Alphabetical (Z - A)</option>
                  {activeDomain === 'PERSONNEL' && metricCategory === 'RANK' && (
                    <option value="HIERARCHY">UPF Chain of Command</option>
                  )}
                </select>
              </div>
            </div>

            <span className="text-xs font-extrabold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-100 whitespace-nowrap">
              Total Analyzed Entries: {totalRecords}
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide w-full text-left mb-4 flex items-center">
                <PieChart size={16} className="mr-2 text-blue-600" /> Proportional Share ({metricCategory.replace('_', ' ')})
              </h3>
              
              <div className="relative w-48 h-48 my-2">
                {totalRecords > 0 ? (
                  <svg viewBox="0 0 100 100" className="w-full h-full transform -rotate-90 drop-shadow-sm">
                    {pieSlices.map((slice, idx) => (
                      <path
                        key={idx}
                        d={slice.pathData}
                        fill={slice.color}
                        className="transition-all duration-300 hover:opacity-80 cursor-pointer"
                      />
                    ))}
                  </svg>
                ) : (
                  <div className="w-full h-full rounded-full border-4 border-dashed border-slate-200 flex items-center justify-center text-xs text-slate-400 font-bold">
                    No Data
                  </div>
                )}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-xs text-slate-400 font-bold uppercase">Total</span>
                  <span className="text-lg font-extrabold text-slate-800">{totalRecords}</span>
                </div>
              </div>

              <div className="w-full mt-4 max-h-32 overflow-y-auto custom-scrollbar space-y-1.5 pr-1">
                {pieSlices.map((slice, idx) => (
                  <div key={idx} className="flex items-center justify-between text-xs font-bold text-slate-700 px-2 py-1 bg-slate-50 rounded">
                    <div className="flex items-center space-x-2 truncate">
                      <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: slice.color }}></span>
                      <span className="truncate">{slice.label}</span>
                    </div>
                    <span className="text-slate-500 font-mono shrink-0 ml-2">{slice.count} ({slice.percent}%)</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide flex items-center">
                <BarChart3 size={16} className="mr-2 text-indigo-600" /> Comparative Bar Graph ({metricCategory.replace('_', ' ')})
              </h3>
              <div className="space-y-3 max-h-[340px] overflow-y-auto pr-2 custom-scrollbar">
                {aggregatedData.map((item, idx) => {
                  const percentage = totalRecords > 0 ? (item.count / totalRecords) * 100 : 0;
                  return (
                    <div key={idx} className="space-y-1">
                      <div className="flex justify-between text-xs font-bold text-slate-700">
                        <span className="truncate pr-2">{item.label}</span>
                        <span className="text-blue-600 shrink-0">{item.count} ({percentage.toFixed(1)}%)</span>
                      </div>
                      <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden">
                        <div 
                          className="bg-blue-600 h-full rounded-full transition-all duration-500" 
                          style={{ width: `${Math.max(percentage, 2)}%` }}
                        ></div>
                      </div>
                    </div>
                  );
                })}
                {aggregatedData.length === 0 && (
                  <div className="p-8 text-center text-slate-400 text-xs">No records available for analysis in this view.</div>
                )}
              </div>
            </div>

          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide mb-4">Statistical Distribution Breakdown ({activeDomain})</h3>
            <div className="border border-slate-100 rounded-xl overflow-hidden max-h-[340px] overflow-y-auto custom-scrollbar">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-700 uppercase font-bold sticky top-0 border-b border-slate-200">
                  <tr>
                    <th className="p-3">{metricCategory.replace('_', ' ')} Attribute</th>
                    <th className="p-3 text-right">Frequency</th>
                    <th className="p-3 text-right">Share (%)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-600">
                  {aggregatedData.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="p-3 uppercase text-slate-800 font-semibold">{item.label}</td>
                      <td className="p-3 text-right font-extrabold text-blue-600">{item.count}</td>
                      <td className="p-3 text-right">{totalRecords > 0 ? ((item.count / totalRecords) * 100).toFixed(1) : 0}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            <div className="pt-4 text-center border-t border-slate-100 mt-4">
              <p className="text-[11px] text-slate-400 font-medium">Data compiled securely by KMP Centralised Security Data Management System.</p>
            </div>
          </div>

        </div>
      )}

    </div>
  );
};

export default AnalyticsDashboard;