// src/components/AnalyticsDashboard.jsx
import React, { useState, useMemo, useEffect } from 'react';
import {
  BarChart3, Calendar, Shield, Filter, PieChart as PieChartIcon, Clock,
  Users, Award, MapPin, Zap, Loader2, ChevronDown, ChevronRight,
  Download, Truck, Scale, Lock, Car, Flame
} from 'lucide-react';
import { authFetch, hasValidSession } from './api';
import { stripHtmlTags } from './helpers';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line
} from 'recharts';

const REGIONAL_HIERARCHY = {
  "KMP NORTH": ["KMP NORTH HEADQUARTERS", "KAWEMPE", "KAKIRI", "KASANGATI", "MATUGGA", "NANSANA", "OLD KAMPALA", "WAKISO", "WANDEGEYA"],
  "KMP EAST": ["KMP EAST HEADQUARTERS", "JINJA ROAD", "KIRA", "KIRA DIV", "KIRA ROAD", "MUKONO", "NAGGALAMA", "SEETA"],
  "KMP SOUTH": ["KMP SOUTH HEADQUARTERS", "NATEETE", "CPS KAMPALA", "PARLIAMENT", "ENTEBBE", "KABALAGALA", "KAJJANSI", "KASENYI", "KATWE", "KYENGERA", "NSANGI"],
  "KMP HEADQUARTERS": ["KMP HEADQUARTERS", "FLYING SQUAD", "CRIME INTELLIGENCE"],
  "POLICE HEADQUARTERS": ["NAGURU"]
};

const PIE_COLORS = ['#596E47', '#A97142', '#2563EB', '#D97706', '#991B1B', '#7C3AED', '#0D9488', '#DB2777'];
const PIE_STATUS_COLORS = ['#3a3225', '#b8ab97', '#2563EB', '#DC2626'];

const DEFAULT_MANPOWER_COLS = ['sex', 'status', 'rank', 'doe', 'do_post', 'do_pro', 'dob', 'bank_branch'];

const ALL_MANPOWER_COLUMNS = [
  { key: 'rank', label: 'Rank Census' },
  { key: 'name', label: 'Name Audit' },
  { key: 'sex', label: 'Gender Distribution' },
  { key: 'position', label: 'Position / Role' },
  { key: 'dob', label: 'Age Demographics (18+)' },
  { key: 'doe', label: 'Length of Service (DOE)' },
  { key: 'do_post', label: 'Station Tenure (D.O. Post)' },
  { key: 'do_pro', label: 'Rank Tenure (D.O. Pro)' },
  { key: 'contact', label: 'Contact Audit' },
  { key: 'educ_level', label: 'Education Level' },
  { key: 'ipps', label: 'IPPS Audit' },
  { key: 'tin', label: 'TIN Audit' },
  { key: 'nin', label: 'NIN Audit' },
  { key: 'home_dist', label: 'Home District' },
  { key: 'tribe', label: 'Tribe Distribution' },
  { key: 'acc_no', label: 'Bank Account Audit' },
  { key: 'bank_branch', label: 'Bank / Branch Distribution' },
  { key: 'station', label: 'Station Distribution' },
  { key: 'district', label: 'District Distribution' },
  { key: 'region', label: 'Region Distribution' },
  { key: 'section', label: 'Section / Unit' },
  { key: 'dir', label: 'Directorate' },
  { key: 'status', label: 'Status / Deployability' }
];

const isLockupLog = (item) => {
  if (!item) return false;
  return (
    item.is_hq_general_total ||
    (item.station || '').includes('HEADQUARTERS GENERAL TOTAL') ||
    (item.daily_lock_up !== undefined && item.daily_lock_up !== null && Number(item.daily_lock_up) > 0)
  );
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

const calcYearsFromDate = (rawVal) => {
  if (!rawVal) return null;
  const s = String(rawVal).trim();
  if (!s || s === 'N/A' || s === '-' || s.toUpperCase() === 'NULL') return null;

  let dt = new Date(s);
  if (isNaN(dt.getTime())) {
    const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (m) {
      const year = m[3].length === 2 ? Number(`20${m[3]}`) : Number(m[3]);
      dt = new Date(year, Number(m[2]) - 1, Number(m[1]));
    }
  }
  if (isNaN(dt.getTime())) return null;
  const diffYears = (Date.now() - dt.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
  return diffYears >= 0 && diffYears < 100 ? diffYears : null;
};

const presenceLabel = (val) => {
  const s = String(val || '').trim().toUpperCase();
  return s && !['NONE', 'NULL', 'NAN', 'N/A', 'NIL', '-'].includes(s) ? 'RECORDED' : 'MISSING';
};

const toPieArray = (countMap, limit = 15) =>
  Object.entries(countMap)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, value]) => ({ name, value }));

const buildManpowerBucket = (list) => {
  const colMaps = {};
  ALL_MANPOWER_COLUMNS.forEach((c) => {
    colMaps[c.key] = {};
  });

  const inc = (col, key) => {
    const k = key || 'UNSPECIFIED';
    colMaps[col][k] = (colMaps[col][k] || 0) + 1;
  };

  list.forEach((o) => {
    if (!o) return;
    const sex = String(o.sex || 'M').toUpperCase();
    inc('sex', sex.includes('F') ? 'FEMALE' : 'MALE');

    const statusStr = String(o.status || o.deployment_status || o.remarks || 'ACTIVE').toUpperCase();
    const isInactive = ['SICK', 'LEAVE', 'MATERN', 'MISSION', 'SUSPEND', 'AWOL', 'COURSE', 'UNDEPLOY', 'NON-DEPLOYABLE'].some((x) =>
      statusStr.includes(x)
    );
    inc('status', isInactive ? 'NON-DEPLOYABLE (HEALTH/LEAVE)' : 'ACTIVE (DEPLOYABLE)');

    inc('rank', String(o.rank || 'UNKNOWN').trim().toUpperCase());
    inc('name', presenceLabel(o.name));
    inc('position', String(o.position || 'UNSPECIFIED').trim().toUpperCase());

    const ageY = calcYearsFromDate(o.dob || o.date_of_birth);
    const ageB = ageY === null || ageY < 18 ? 'UNKNOWN / UNRECORDED' : ageY < 30 ? '18-29 YEARS' : ageY < 40 ? '30-39 YEARS' : ageY < 50 ? '40-49 YEARS' : '50+ YEARS';
    inc('dob', ageB);

    const srvY = calcYearsFromDate(o.doe || o.date_of_enlistment);
    const srvB = srvY === null ? 'UNKNOWN / UNRECORDED' : srvY < 5 ? 'UNDER 5 YEARS' : srvY < 10 ? '5-9 YEARS' : srvY < 15 ? '10-14 YEARS' : srvY < 20 ? '15-19 YEARS' : srvY < 30 ? '20-29 YEARS' : '30+ YEARS';
    inc('doe', srvB);

    const depY = calcYearsFromDate(o.do_post || o.dopost || o.doPost);
    const depB = depY === null ? 'UNKNOWN / UNRECORDED' : depY < 1 ? 'UNDER 1 YEAR' : depY < 3 ? '1-2 YEARS' : depY < 5 ? '3-4 YEARS' : '5+ YEARS (OVERDUE ROTATION)';
    inc('do_post', depB);

    const rnkY = calcYearsFromDate(o.do_pro || o.dopro || o.doPro);
    const rnkB = rnkY === null ? 'UNKNOWN / UNRECORDED' : rnkY < 2 ? 'UNDER 2 YEARS' : rnkY < 5 ? '2-4 YEARS' : rnkY < 10 ? '5-9 YEARS' : '10+ YEARS';
    inc('do_pro', rnkB);

    inc('contact', presenceLabel(o.contact));
    inc('educ_level', String(o.educ_level || o.educlevel || 'UNSPECIFIED').trim().toUpperCase());
    inc('ipps', presenceLabel(o.ipps));
    inc('tin', presenceLabel(o.tin));
    inc('nin', presenceLabel(o.nin));
    inc('home_dist', String(o.home_dist || o.homedist || 'UNSPECIFIED').trim().toUpperCase());
    inc('tribe', String(o.tribe || 'UNSPECIFIED').trim().toUpperCase());
    inc('acc_no', presenceLabel(o.acc_no || o.accno));
    inc('bank_branch', String(o.bank_branch || o.bankbranch || o.bank || 'UNSPECIFIED').trim().toUpperCase());
    inc('station', String(o.station || 'UNKNOWN').trim().toUpperCase());
    inc('district', String(o.district || 'UNSPECIFIED').trim().toUpperCase());
    inc('region', getOfficialRegionForStation(o.station, o.region));
    inc('section', String(o.section || o.position || 'GENERAL DUTY').trim().toUpperCase());
    inc('dir', String(o.dir || 'UNSPECIFIED').trim().toUpperCase());
  });

  const columns = {};
  ALL_MANPOWER_COLUMNS.forEach((c) => {
    columns[c.key] = toPieArray(colMaps[c.key]);
  });

  return {
    total: list.length,
    genderDistribution: columns.sex,
    deployability: columns.status,
    rankDistribution: columns.rank,
    serviceLength: columns.doe,
    deploymentLength: columns.do_post,
    rankTenure: columns.do_pro,
    ageDemographics: columns.dob,
    bankBranch: columns.bank_branch,
    columns
  };
};

const ManpowerFeatureCard = ({
  title,
  icon,
  data = [],
  byRegion = {},
  colKey,
  bucketKey,
  groupLabel = 'Region',
  scope = 'GENERAL',
  colors = PIE_COLORS,
  emptyText = 'No data available.',
  defaultView = 'ALL',
  height = 260
}) => {
  const [viewMode, setViewMode] = useState(defaultView);
  const totalCount = data.reduce((sum, item) => sum + Number(item.value || 0), 0);

  const categoryColumns = useMemo(() => {
    const ordered = data.map((d) => d.name);
    const seen = new Set(ordered);
    Object.values(byRegion || {}).forEach((bucket) => {
      const list = bucket?.columns?.[colKey] || bucket?.[bucketKey] || [];
      list.forEach((item) => {
        if (!seen.has(item.name)) {
          seen.add(item.name);
          ordered.push(item.name);
        }
      });
    });
    return ordered;
  }, [data, byRegion, colKey, bucketKey]);

  const tableRows = useMemo(() => {
    const regionEntries =
      scope === 'GENERAL'
        ? Object.entries(byRegion || {})
        : byRegion?.[scope]
        ? [[scope, byRegion[scope]]]
        : [];

    return regionEntries.map(([regionName, bucket], idx) => {
      const counts = {};
      const list = bucket?.columns?.[colKey] || bucket?.[bucketKey] || [];
      list.forEach((item) => {
        counts[item.name] = Number(item.value || 0);
      });
      const rowTotal = categoryColumns.reduce((sum, col) => sum + (counts[col] || 0), 0);
      return { sn: idx + 1, region: regionName, counts, rowTotal };
    });
  }, [byRegion, colKey, bucketKey, scope, categoryColumns]);

  const columnTotals = useMemo(() => {
    const totals = {};
    categoryColumns.forEach((col) => {
      totals[col] = tableRows.reduce((sum, r) => sum + (r.counts[col] || 0), 0);
    });
    return totals;
  }, [categoryColumns, tableRows]);

  const grandTotal = useMemo(
    () => tableRows.reduce((sum, r) => sum + r.rowTotal, 0),
    [tableRows]
  );

  const renderPieLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
    if (percent < 0.04) return null;
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.55;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
    return (
      <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" className="text-[10px] font-bold">
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };

  const renderPie = () => (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} cx="50%" cy="50%" labelLine={false} label={renderPieLabel} outerRadius={72} dataKey="value">
            {data.map((entry, idx) => (
              <Cell key={`pie-${idx}`} fill={colors[idx % colors.length]} />
            ))}
          </Pie>
          <Tooltip contentStyle={{ borderRadius: '8px', fontSize: '10px', fontWeight: 'bold' }} />
          <Legend wrapperStyle={{ fontSize: '9px', fontWeight: 'bold' }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );

  // Vertical Bar Graph: X-Axis = Categories, Y-Axis = Number of Personnel
  const renderBar = () => (
    <div style={{ height: Math.max(height, 280) }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 20, left: 5, bottom: 55 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2d6c3" />
          <XAxis
            dataKey="name"
            interval={0}
            angle={-25}
            textAnchor="end"
            height={60}
            tick={{ fontSize: 9, fontWeight: 'bold', fill: '#3a3225' }}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 9, fontWeight: 'bold' }}
            label={{ value: 'Personnel', angle: -90, position: 'insideLeft', fontSize: 9, fontWeight: 'bold', fill: '#594d3c' }}
          />
          <Tooltip contentStyle={{ borderRadius: '8px', fontSize: '10px', fontWeight: 'bold' }} />
          <Bar dataKey="value" name="Personnel" radius={[4, 4, 0, 0]} maxBarSize={38}>
            {data.map((entry, idx) => (
              <Cell key={`bar-${idx}`} fill={colors[idx % colors.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );

  const renderTable = () => (
    <div className="w-full overflow-x-auto max-h-[340px] overflow-y-auto custom-scrollbar border border-[#d3c2a8] rounded-lg">
      <table className="min-w-full divide-y divide-[#e2d6c3] text-[10px]">
        <thead className="sticky top-0 z-20">
          <tr className="bg-gradient-to-b from-[#f4eee2] to-[#e6dfd1] text-[#3a3225] font-extrabold border-b-2 border-[#d3c2a8]">
            <th className="px-2.5 py-2 text-center uppercase border-r border-[#d3c2a8] sticky left-0 bg-[#f4eee2] z-10 w-12">S/NO</th>
            <th className="px-3 py-2 text-left uppercase border-r border-[#d3c2a8] sticky left-12 bg-[#f4eee2] z-10 min-w-[140px]">{groupLabel}</th>
            {categoryColumns.map((col) => (
              <th key={col} className="px-2.5 py-2 text-center uppercase border-r border-[#d3c2a8] whitespace-nowrap">
                {col}
              </th>
            ))}
            <th className="px-3 py-2 text-center uppercase bg-[#3a3225] text-[#f4eee2] whitespace-nowrap">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#e2d6c3] bg-[#fbf8f3]">
          {tableRows.map((row) => (
            <tr key={row.region} className="hover:bg-[#e9eedf]/40">
              <td className="px-2.5 py-1.5 text-center font-bold text-[#594d3c] border-r border-[#e2d6c3] sticky left-0 bg-[#fbf8f3]">
                {row.sn}
              </td>
              <td className="px-3 py-1.5 font-extrabold text-[#3a3225] uppercase border-r border-[#e2d6c3] sticky left-12 bg-[#fbf8f3] whitespace-nowrap">
                {row.region}
              </td>
              {categoryColumns.map((col) => (
                <td key={col} className="px-2.5 py-1.5 text-center font-semibold text-[#3a3225] border-r border-[#e2d6c3]">
                  {row.counts[col] ? row.counts[col].toLocaleString() : '-'}
                </td>
              ))}
              <td className="px-3 py-1.5 text-center font-black text-[#596E47] bg-[#e9eedf]/50">
                {row.rowTotal.toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="sticky bottom-0 z-20">
          <tr className="bg-[#3a3225] text-[#f4eee2] font-black border-t-2 border-[#534735]">
            <td colSpan={2} className="px-3 py-2 text-left uppercase tracking-wide border-r border-[#534735] sticky left-0 bg-[#3a3225]">
              Category Totals / Grand Total
            </td>
            {categoryColumns.map((col) => (
              <td key={col} className="px-2.5 py-2 text-center border-r border-[#534735]">
                {(columnTotals[col] || 0).toLocaleString()}
              </td>
            ))}
            <td className="px-3 py-2 text-center bg-[#596E47] text-white text-[11px]">
              {grandTotal.toLocaleString()}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );

  return (
    <div className="bg-white rounded-xl shadow-xs border border-[#e2d6c3] p-3 flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between border-b border-[#e2d6c3] pb-1.5 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="text-[11px] font-black text-[#3a3225] uppercase flex items-center truncate">
            {icon}
            <span className="truncate">{title}</span>
          </h3>
          <span className="text-[9px] font-extrabold text-[#736450] bg-[#f4eee2] px-1.5 py-0.5 rounded shrink-0">
            n = {totalCount.toLocaleString()}
          </span>
        </div>

        <div className="flex items-center gap-0.5 bg-[#f4eee2] p-0.5 rounded-md border border-[#e2d6c3] shrink-0">
          {[
            { id: 'ALL', label: 'All' },
            { id: 'PIE', label: 'Pie' },
            { id: 'BAR', label: 'Graph' },
            { id: 'TABLE', label: 'Table' }
          ].map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setViewMode(m.id)}
              className={`px-2 py-0.5 rounded text-[9px] font-extrabold uppercase transition cursor-pointer ${
                viewMode === m.id
                  ? 'bg-[#3a3225] text-[#f4eee2] shadow-xs'
                  : 'text-[#594d3c] hover:bg-[#e9e1d2]'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {data.length === 0 ? (
        <div style={{ height }} className="w-full flex items-center justify-center text-[10px] text-[#736450]">
          {emptyText}
        </div>
      ) : viewMode === 'ALL' ? (
        <div className="space-y-3">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
            <div className="border border-[#e2d6c3] rounded-lg p-2 bg-[#fbf8f3]/50">
              <div className="text-[9px] font-extrabold text-[#736450] uppercase mb-1">Pie Chart</div>
              {renderPie()}
            </div>
            <div className="border border-[#e2d6c3] rounded-lg p-2 bg-[#fbf8f3]/50">
              <div className="text-[9px] font-extrabold text-[#736450] uppercase mb-1">Vertical Bar Graph (X: Category, Y: Personnel)</div>
              {renderBar()}
            </div>
          </div>
          <div>
            <div className="text-[9px] font-extrabold text-[#736450] uppercase mb-1">{groupLabel} Breakdown Table</div>
            {renderTable()}
          </div>
        </div>
      ) : viewMode === 'PIE' ? (
        renderPie()
      ) : viewMode === 'BAR' ? (
        renderBar()
      ) : (
        renderTable()
      )}
    </div>
  );
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

  const userRoleClean = stripHtmlTags(currentUser?.role || '').toUpperCase();
  const userPosClean = stripHtmlTags(currentUser?.position || '').toUpperCase();
  const userRegClean = stripHtmlTags(currentUser?.region || '').toUpperCase();

  const isSuperAdmin = userRoleClean === 'SUPER_ADMIN' || userRoleClean === 'ADMIN';
  const isGlobalTier =
    isSuperAdmin ||
    ['ASSISTANT_SUPER_ADMIN'].includes(userRoleClean) ||
    ['KMP COMMANDER', 'DEPUTY KMP COMMANDER', 'KMP ADMIN OFFICER'].includes(userPosClean) ||
    currentUser?.permissions?.view_global_roster === true ||
    !currentUser;

  const isKmpSystemManager = userRoleClean === 'SYSTEM_MANAGER' && ['KMP HEADQUARTERS', 'POLICE HEADQUARTERS'].includes(userRegClean) && userPosClean.includes('KMP');
  const isKmpSpecialist = userRoleClean === 'ASSISTANT_SYSTEM_MANAGER' && ['KMP HEADQUARTERS', 'POLICE HEADQUARTERS'].includes(userRegClean) && userPosClean.includes('KMP');

  const canViewGlobalLevel = canViewGlobal || isGlobalTier || isKmpSystemManager || isKmpSpecialist;

  const [selectedRegion, setSelectedRegion] = useState(canViewGlobalLevel || !currentUser ? 'ALL REGIONS' : (userRegClean || 'KMP HEADQUARTERS'));
  const [selectedStation, setSelectedStation] = useState('ALL STATIONS');
  const [selectedManpowerCols, setSelectedManpowerCols] = useState(DEFAULT_MANPOWER_COLS);
  const [comparisonLevel, setComparisonLevel] = useState(canViewGlobalLevel ? 'REGION' : 'STATION');

  const [backendDetentionCalendar, setBackendDetentionCalendar] = useState({
    dates: [], dateMap: {}, regionDemographics: [], regionDuration: [], ageComparison: [], dailyMargins: []
  });
  const [backendSuccessStories, setBackendSuccessStories] = useState([]);
  const [backendSuccessStoriesComparison, setBackendSuccessStoriesComparison] = useState([]);
  const [backendFireIntelligence, setBackendFireIntelligence] = useState({
    totalFires: 0, totalDeaths: 0, totalInjuries: 0, fireList: [], fireCauses: [], fireMonthly: [], fireConcentration: []
  });
  const [backendAccidentsIntelligence, setBackendAccidentsIntelligence] = useState({
    accidentsMonthly: [], accidentsSeverity: [], accidentsRegional: []
  });
  const [backendCrimeCategories, setBackendCrimeCategories] = useState([]);
  const [backendManpowerIntel, setBackendManpowerIntel] = useState({ general: {}, byRegion: {} });
  const [manpowerSummaryScope, setManpowerSummaryScope] = useState('GENERAL');

  const [loading, setLoading] = useState(false);
  const [expandedManpowerRegion, setExpandedManpowerRegion] = useState(null);
  const [expandedCrimeRegion, setExpandedCrimeRegion] = useState(null);
  const [selectedDetentionDate, setSelectedDetentionDate] = useState(null);

  const toggleManpowerRegion = (regionName) => setExpandedManpowerRegion((prev) => (prev === regionName ? null : regionName));
  const toggleCrimeRegion = (regionName) => setExpandedCrimeRegion((prev) => (prev === regionName ? null : regionName));

  useEffect(() => {
    let isMounted = true;
    const fetchData = async () => {
      if (!hasValidSession()) return;
      setLoading(true);
      try {
        const intelParam = `?region=${encodeURIComponent(selectedRegion)}&station=${encodeURIComponent(selectedStation)}&columns=${encodeURIComponent(selectedManpowerCols.join(','))}`;

        const [rollRes, crimeRes, statsRes, exhibitsRes, intelRes] = await Promise.all([
          authFetch('/api/v1/nominal-roll').catch(() => null),
          authFetch('/api/v1/reports').catch(() => null),
          authFetch('/api/v1/stats').catch(() => null),
          authFetch('/api/v1/exhibits').catch(() => null),
          authFetch(`/api/v1/analytics/dashboard-intelligence${intelParam}`).catch(() => null)
        ]);

        const rollData = rollRes && rollRes.ok ? await rollRes.json() : [];
        const crimeData = crimeRes && crimeRes.ok ? await crimeRes.json() : [];
        const statsData = statsRes && statsRes.ok ? await statsRes.json() : [];
        const exhibitsData = exhibitsRes && exhibitsRes.ok ? await exhibitsRes.json() : [];
        const intelData = intelRes && intelRes.ok ? await intelRes.json() : null;

        if (isMounted) {
          setFetchedRolls(Array.isArray(rollData) ? rollData : []);
          setFetchedCrime(Array.isArray(crimeData) ? crimeData : []);
          setFetchedOps(Array.isArray(statsData) ? statsData : []);
          setFetchedExhibits(Array.isArray(exhibitsData) ? exhibitsData : []);

          if (intelData) {
            if (intelData.comparisonLevel) setComparisonLevel(intelData.comparisonLevel);

            if (intelData.detentionCalendar) {
              setBackendDetentionCalendar({
                dates: Array.isArray(intelData.detentionCalendar.dates) ? intelData.detentionCalendar.dates : [],
                dateMap: intelData.detentionCalendar.dateMap || {},
                regionDemographics: Array.isArray(intelData.detentionCalendar.regionDemographics) ? intelData.detentionCalendar.regionDemographics : [],
                regionDuration: Array.isArray(intelData.detentionCalendar.regionDuration) ? intelData.detentionCalendar.regionDuration : [],
                ageComparison: Array.isArray(intelData.detentionCalendar.ageComparison) ? intelData.detentionCalendar.ageComparison : [],
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
            if (Array.isArray(intelData.successStoriesComparison)) {
              setBackendSuccessStoriesComparison(intelData.successStoriesComparison);
            }
            if (intelData.fireIntelligence) {
              setBackendFireIntelligence({
                totalFires: intelData.fireIntelligence.totalFires || 0,
                totalDeaths: intelData.fireIntelligence.totalDeaths || 0,
                totalInjuries: intelData.fireIntelligence.totalInjuries || 0,
                fireList: Array.isArray(intelData.fireIntelligence.fireList) ? intelData.fireIntelligence.fireList : [],
                fireCauses: Array.isArray(intelData.fireIntelligence.fireCauses) ? intelData.fireIntelligence.fireCauses : [],
                fireMonthly: Array.isArray(intelData.fireIntelligence.fireMonthly) ? intelData.fireIntelligence.fireMonthly : [],
                fireConcentration: Array.isArray(intelData.fireIntelligence.fireConcentration) ? intelData.fireIntelligence.fireConcentration : []
              });
            }
            if (intelData.accidentsIntelligence) {
              setBackendAccidentsIntelligence({
                accidentsMonthly: Array.isArray(intelData.accidentsIntelligence.accidentsMonthly) ? intelData.accidentsIntelligence.accidentsMonthly : [],
                accidentsSeverity: Array.isArray(intelData.accidentsIntelligence.accidentsSeverity) ? intelData.accidentsIntelligence.accidentsSeverity : [],
                accidentsRegional: Array.isArray(intelData.accidentsIntelligence.accidentsRegional) ? intelData.accidentsIntelligence.accidentsRegional : []
              });
            }
            if (Array.isArray(intelData.crimeCategoryData)) setBackendCrimeCategories(intelData.crimeCategoryData);
            if (Array.isArray(intelData.exhibitsData)) setFetchedExhibits(intelData.exhibitsData);
            if (Array.isArray(intelData.accidentsData)) setFetchedAccidents(intelData.accidentsData);
            if (intelData.manpowerIntelligence) {
              setBackendManpowerIntel(intelData.manpowerIntelligence);
            }
          }
        }
      } catch (err) {
        if (err.message !== 'UNAUTHORIZED') console.error("Failed to fetch analytics data from NeonDB:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchData();
    return () => {
      isMounted = false;
    };
  }, [selectedRegion, selectedStation, selectedManpowerCols]);

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
    return list.filter((item) => {
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
    if (activeDomain === 'CRIME' || activeDomain === 'CRIME_SUMMARY') baseData = resolvedCrimeRegistry.filter((r) => !isLockupLog(r));
    else if (activeDomain === 'MANPOWER_DEEP') baseData = resolvedNominalRolls;
    else if (activeDomain === 'SUCCESS') baseData = resolvedSuccessStories;
    else if (activeDomain === 'OPERATIONS') baseData = resolvedOperationalStats;
    else if (activeDomain === 'EXHIBITS') baseData = resolvedExhibits;
    else if (activeDomain === 'ACCIDENTS') baseData = resolvedAccidents;
    else if (activeDomain === 'FIRES') baseData = resolvedCrimeRegistry;
    else baseData = resolvedCrimeRegistry;

    if (!Array.isArray(baseData)) return [];

    return baseData.filter((item) => {
      if (!item) return false;
      let stn = stripHtmlTags(item.station || '').toUpperCase();
      if (stn === "KIRA DIVISION" || stn === "KIRA DIV" || stn === "KIRA") stn = "KIRA DIV";
      const reg = getOfficialRegionForStation(stn, item.region);

      if (canViewGlobalLevel && selectedRegion === 'ALL REGIONS' && selectedStation === 'ALL STATIONS') {
        return true;
      }

      const activeTargetRegion = canViewGlobalLevel ? selectedRegion : userRegClean;
      const belongsToRegion =
        activeTargetRegion === 'ALL REGIONS' ||
        reg.toUpperCase() === activeTargetRegion.toUpperCase() ||
        (item.region && item.region.toUpperCase() === activeTargetRegion.toUpperCase()) ||
        (REGIONAL_HIERARCHY[activeTargetRegion] && REGIONAL_HIERARCHY[activeTargetRegion].some((s) => isStationEquivalent(s, stn)));

      if (!belongsToRegion) return false;
      if (selectedStation !== 'ALL STATIONS' && !isStationEquivalent(stn, selectedStation)) return false;
      return true;
    });
  }, [
    activeDomain, resolvedCrimeRegistry, resolvedNominalRolls, resolvedSuccessStories,
    resolvedOperationalStats, resolvedExhibits, resolvedAccidents, selectedRegion,
    selectedStation, canViewGlobalLevel, userRegClean
  ]);

  const displaySuccessStories = useMemo(() => {
    if (backendSuccessStories.length > 0) return backendSuccessStories;
    return timeFilteredData(resolvedSuccessStories).map((st) => ({
      station: st.station || 'UNKNOWN',
      region: st.region || 'UNKNOWN',
      parsedSuspects: st.suspects || 0,
      parsedClassification: st.category || 'GENERAL OPERATIONS',
      parsedRecoveries: st.recoveries || '-',
      parsedLegalStatus: st.status || 'COMPLETED / SUCCESS'
    }));
  }, [backendSuccessStories, resolvedSuccessStories, selectedMonth, dateFilter]);

  const displayCrimeCategories = useMemo(() => {
    if (backendCrimeCategories.length > 0) return backendCrimeCategories;
    const tfCrimes = timeFilteredData(resolvedCrimeRegistry).filter((r) => !isLockupLog(r));
    const map = {};
    tfCrimes.forEach((c) => {
      const reg = c.region || 'UNKNOWN';
      const cat = c.category || 'GENERAL';
      if (!map[reg]) map[reg] = { region: reg, totalCrimes: 0, categories: {} };
      map[reg].totalCrimes++;
      map[reg].categories[cat] = (map[reg].categories[cat] || 0) + 1;
    });
    return Object.values(map)
      .map((r) => ({
        region: r.region,
        totalCrimes: r.totalCrimes,
        categoryList: Object.entries(r.categories).map(([name, count]) => ({ name, count }))
      }))
      .sort((a, b) => b.totalCrimes - a.totalCrimes);
  }, [backendCrimeCategories, resolvedCrimeRegistry, selectedMonth, dateFilter]);

  // Comparative Crime Matrix (KMP North vs KMP East vs KMP South)
  const crimeComparativeMatrix = useMemo(() => {
    const tfCrimes = timeFilteredData(resolvedCrimeRegistry).filter((r) => !isLockupLog(r));
    const offenceMap = {};

    tfCrimes.forEach((c) => {
      if (!c) return;
      let stn = stripHtmlTags(c.station || '').trim().toUpperCase();
      if (stn === 'KIRA DIVISION' || stn === 'KIRA DIV' || stn === 'KIRA') stn = 'KIRA DIV';
      const reg = getOfficialRegionForStation(stn, c.region).toUpperCase();

      const activeTargetRegion = canViewGlobalLevel ? selectedRegion : userRegClean;
      if (activeTargetRegion && activeTargetRegion !== 'ALL REGIONS') {
        const belongsToRegion =
          reg === activeTargetRegion.toUpperCase() ||
          (REGIONAL_HIERARCHY[activeTargetRegion] &&
            REGIONAL_HIERARCHY[activeTargetRegion].some((s) => isStationEquivalent(s, stn)));
        if (!belongsToRegion) return;
      }
      if (selectedStation !== 'ALL STATIONS' && !isStationEquivalent(stn, selectedStation)) return;
      if (!['KMP NORTH', 'KMP EAST', 'KMP SOUTH'].includes(reg)) return;

      const offence = stripHtmlTags(c.offence || c.crime_category || 'UNSPECIFIED OFFENCE').trim().toUpperCase();
      if (!offenceMap[offence]) {
        offenceMap[offence] = { offence, kmpNorth: 0, kmpEast: 0, kmpSouth: 0, total: 0 };
      }

      if (reg === 'KMP NORTH') offenceMap[offence].kmpNorth += 1;
      else if (reg === 'KMP EAST') offenceMap[offence].kmpEast += 1;
      else if (reg === 'KMP SOUTH') offenceMap[offence].kmpSouth += 1;
      offenceMap[offence].total += 1;
    });

    const rows = Object.values(offenceMap)
      .sort((a, b) => b.total - a.total)
      .map((row, idx) => ({ sn: idx + 1, ...row }));

    const totals = rows.reduce(
      (acc, r) => ({
        kmpNorth: acc.kmpNorth + r.kmpNorth,
        kmpEast: acc.kmpEast + r.kmpEast,
        kmpSouth: acc.kmpSouth + r.kmpSouth,
        grandTotal: acc.grandTotal + r.total
      }),
      { kmpNorth: 0, kmpEast: 0, kmpSouth: 0, grandTotal: 0 }
    );

    return { rows, totals };
  }, [resolvedCrimeRegistry, selectedRegion, selectedStation, selectedMonth, dateFilter, canViewGlobalLevel, userRegClean]);

  const displayFireIncidents = useMemo(() => {
    if (backendFireIntelligence.fireList && backendFireIntelligence.fireList.length > 0) return backendFireIntelligence.fireList;
    return [];
  }, [backendFireIntelligence.fireList]);

  const displayFireTotals = useMemo(() => ({
    totalFires: backendFireIntelligence.totalFires || 0,
    totalDeaths: backendFireIntelligence.totalDeaths || 0,
    totalInjuries: backendFireIntelligence.totalInjuries || 0
  }), [backendFireIntelligence]);

  const fireCausesChartData = useMemo(() => backendFireIntelligence.fireCauses || [], [backendFireIntelligence]);
  const fireMonthlyChartData = useMemo(() => backendFireIntelligence.fireMonthly || [], [backendFireIntelligence]);
  const fireConcentrationChartData = useMemo(() => backendFireIntelligence.fireConcentration || [], [backendFireIntelligence]);

  const accidentsMonthlyChartData = useMemo(() => backendAccidentsIntelligence.accidentsMonthly || [], [backendAccidentsIntelligence]);
  const accidentsSeverityChartData = useMemo(() => backendAccidentsIntelligence.accidentsSeverity || [], [backendAccidentsIntelligence]);
  const accidentsRegionalChartData = useMemo(() => backendAccidentsIntelligence.accidentsRegional || [], [backendAccidentsIntelligence]);

  const displayAccidentsList = useMemo(() => {
    return timeFilteredData(resolvedAccidents).map((ac) => ({
      station: ac.station || 'UNKNOWN',
      region: ac.region || 'UNKNOWN',
      date: ac.date || 'N/A',
      nature: ac.nature_of_accident || 'TRAFFIC ACCIDENT',
      minor: ac.minor || 0,
      serious: ac.serious || 0,
      fatal: ac.fatal || 0,
      victims: ac.victims || 0,
      total: ac.total || 0
    }));
  }, [resolvedAccidents, selectedMonth, dateFilter]);

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

    Object.keys(REGIONAL_HIERARCHY).forEach((reg) => {
      regionMap[reg] = { region: reg, totalDeployable: 0, stations: {} };
    });
    regionMap["GENERAL / OTHER"] = { region: "GENERAL / OTHER", totalDeployable: 0, stations: {} };

    rolls.forEach((o) => {
      if (!o) return;
      let stn = stripHtmlTags(o.station || 'UNKNOWN').toUpperCase();
      if (stn === "KIRA DIVISION" || stn === "KIRA DIV" || stn === "KIRA") stn = "KIRA DIV";
      const reg = getOfficialRegionForStation(stn, o.region);
      const sex = (o.sex || 'M').toUpperCase();
      const rank = (o.rank || 'PC').toUpperCase();

      const statusStr = (o.status || o.deployment_status || o.remarks || 'ACTIVE').toUpperCase();
      const isInactive = ['SICK', 'LEAVE', 'MATERN', 'MISSION', 'SUSPEND', 'AWOL', 'COURSE', 'UNDEPLOY'].some((x) => statusStr.includes(x));

      const activeTargetRegion = canViewGlobalLevel ? selectedRegion : userRegClean;
      if (activeTargetRegion !== 'ALL REGIONS') {
        const belongsToRegion =
          reg.toUpperCase() === activeTargetRegion.toUpperCase() ||
          (o.region && o.region.toUpperCase() === activeTargetRegion.toUpperCase()) ||
          (REGIONAL_HIERARCHY[activeTargetRegion] && REGIONAL_HIERARCHY[activeTargetRegion].some((s) => isStationEquivalent(s, stn)));
        if (!belongsToRegion) return;
      }
      if (selectedStation !== 'ALL STATIONS' && !isStationEquivalent(stn, selectedStation)) return;

      if (isInactive) totalInactive++; else totalActive++;
      if (sex.includes('F')) totalFemale++; else totalMale++;

      const targetReg = regionMap[reg] || regionMap["GENERAL / OTHER"];
      if (!targetReg.stations[stn]) {
        targetReg.stations[stn] = { station: stn, totalDeployable: 0, active: 0, inactive: 0, ranks: {} };
        allRanks.forEach((r) => (targetReg.stations[stn].ranks[r] = { M: 0, F: 0 }));
      }

      targetReg.stations[stn].totalDeployable += 1;
      if (isInactive) targetReg.stations[stn].inactive += 1; else targetReg.stations[stn].active += 1;

      if (targetReg.stations[stn].ranks[rank]) {
        if (sex.includes('F')) targetReg.stations[stn].ranks[rank].F += 1;
        else targetReg.stations[stn].ranks[rank].M += 1;
      }
      targetReg.totalDeployable += 1;
    });

    const rows = Object.values(regionMap)
      .filter((r) => r.totalDeployable > 0)
      .map((item) => ({
        ...item,
        stationList: Object.values(item.stations)
          .filter((s) => s.totalDeployable > 0)
          .sort((a, b) => a.station.localeCompare(b.station))
      }));

    return { rows, allRanks, totalActive, totalInactive, totalMale, totalFemale };
  }, [resolvedNominalRolls, selectedRegion, selectedStation, canViewGlobalLevel, userRegClean]);

  const localManpowerIntel = useMemo(() => {
    const rolls = Array.isArray(resolvedNominalRolls) ? resolvedNominalRolls : [];
    const byRegionMap = {};
    rolls.forEach((o) => {
      if (!o) return;
      const grp = comparisonLevel === 'STATION'
        ? stripHtmlTags(o.station || 'UNKNOWN').trim().toUpperCase()
        : getOfficialRegionForStation(o.station, o.region);
      if (!byRegionMap[grp]) byRegionMap[grp] = [];
      byRegionMap[grp].push(o);
    });
    const byRegion = {};
    Object.entries(byRegionMap).forEach(([grp, list]) => {
      byRegion[grp] = buildManpowerBucket(list);
    });
    return { general: buildManpowerBucket(rolls), byRegion };
  }, [resolvedNominalRolls, comparisonLevel]);

  const effectiveManpowerIntel = useMemo(() => {
    const hasBackend = backendManpowerIntel?.general?.columns && Object.keys(backendManpowerIntel.general.columns).length > 0;
    return hasBackend ? backendManpowerIntel : localManpowerIntel;
  }, [backendManpowerIntel, localManpowerIntel]);

  const activeManpowerBucket = useMemo(() => {
    const bucket =
      manpowerSummaryScope === 'GENERAL'
        ? effectiveManpowerIntel?.general
        : effectiveManpowerIntel?.byRegion?.[manpowerSummaryScope];
    return { total: bucket?.total ?? 0, columns: bucket?.columns || {} };
  }, [effectiveManpowerIntel, manpowerSummaryScope]);

  const manpowerRegionKeys = useMemo(
    () => Object.keys(effectiveManpowerIntel?.byRegion || {}),
    [effectiveManpowerIntel]
  );

  const exhibitGroupedData = useMemo(() => {
    const tf = timeFilteredData(resolvedExhibits);
    const map = {};
    tf.forEach((ex) => {
      if (!ex) return;
      const cat = (ex.category || 'GENERAL').toUpperCase();
      const reg = (ex.region || 'KMP GENERAL').toUpperCase();
      const div = (ex.division || ex.station || 'N/A').toUpperCase();
      const stn = (ex.station || 'N/A').toUpperCase();
      const status = (ex.status || 'IMPOUNDED').toUpperCase();
      const desc = (ex.type_make || ex.description || ex.particulars || '').trim().toUpperCase() || 'UNSPECIFIED';

      if (canViewGlobalLevel && selectedRegion !== 'ALL REGIONS' && reg !== selectedRegion.toUpperCase()) return;
      if (selectedStation !== 'ALL STATIONS' && !isStationEquivalent(stn, selectedStation)) return;

      const key = `${cat}|${desc}|${reg}|${div}|${stn}|${status}`;
      map[key] = (map[key] || 0) + 1;
    });

    return Object.entries(map)
      .map(([k, total]) => {
        const [category, desc, region, division, station, status] = k.split('|');
        return { category, desc, region, division, station, status, total };
      })
      .sort((a, b) => b.total - a.total);
  }, [resolvedExhibits, selectedRegion, selectedStation, selectedMonth, dateFilter, canViewGlobalLevel]);

  const summaryAggregates = useMemo(() => {
    const ops = timeFilteredData(resolvedOperationalStats);
    const ss = Array.isArray(displaySuccessStories) ? displaySuccessStories : [];
    const cr = timeFilteredData(resolvedCrimeRegistry).filter((r) => !isLockupLog(r));
    const ex = timeFilteredData(resolvedExhibits);
    const nom = Array.isArray(resolvedNominalRolls) ? resolvedNominalRolls : [];
    const acc = timeFilteredData(resolvedAccidents);

    return {
      disruptiveOps: ops.length,
      manpowerTotal: nom.length,
      successOccasions: ss.length,
      totalExhibits: ex.length,
      totalDetentions: Object.values(backendDetentionCalendar.dateMap || {}).reduce((accSum, curr) => accSum + (curr.total || 0), 0),
      totalAccidents: acc.length,
      totalFires: backendFireIntelligence.totalFires || 0,
      totalArrests: ops.reduce((accSum, curr) => accSum + (Number(curr.arrests || curr.suspects || curr.arrested) || 0), 0),
      totalCrimes: cr.length
    };
  }, [resolvedOperationalStats, displaySuccessStories, resolvedCrimeRegistry, resolvedExhibits, resolvedNominalRolls, backendDetentionCalendar, resolvedAccidents, backendFireIntelligence, selectedMonth, dateFilter]);

  const opsChartData = useMemo(() => {
    const grpMap = {};
    const tfOps = timeFilteredData(resolvedOperationalStats);
    const tfCrimes = timeFilteredData(resolvedCrimeRegistry).filter((r) => !isLockupLog(r));

    const resolveGroup = (o) => {
      const reg = getOfficialRegionForStation(o.station, o.region);
      if (canViewGlobalLevel && selectedRegion !== 'ALL REGIONS' && reg !== selectedRegion.toUpperCase()) return null;
      return comparisonLevel === 'STATION' ? stripHtmlTags(o.station || 'UNKNOWN').trim().toUpperCase() : reg;
    };

    tfOps.forEach((o) => {
      if (!o) return;
      const grp = resolveGroup(o);
      if (!grp) return;
      if (!grpMap[grp]) grpMap[grp] = { name: grp, Arrests: 0, Crimes: 0 };
      grpMap[grp].Arrests += Number(o.arrests || o.suspects || o.arrested) || 0;
    });

    tfCrimes.forEach((c) => {
      if (!c) return;
      const grp = resolveGroup(c);
      if (!grp) return;
      if (!grpMap[grp]) grpMap[grp] = { name: grp, Arrests: 0, Crimes: 0 };
      grpMap[grp].Crimes += 1;
    });

    return Object.values(grpMap).sort((a, b) => b.Crimes - a.Crimes);
  }, [resolvedOperationalStats, resolvedCrimeRegistry, selectedRegion, selectedStation, canViewGlobalLevel, comparisonLevel]);

  const handleExportExcel = async () => {
    try {
      const params = new URLSearchParams({
        region: selectedRegion,
        station: selectedStation,
        columns: selectedManpowerCols.join(',')
      });
      const response = await authFetch(`/api/v1/analytics/export?${params.toString()}`);
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

  const groupLabelText = comparisonLevel === 'STATION' ? 'Station' : 'Region';

  return (
    <div className="p-2 max-w-[1600px] mx-auto space-y-2 font-sans min-h-screen pb-16 overflow-x-hidden" style={{ backgroundColor: '#f4eee2' }}>
      {/* Top Header Card */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-[#fbf8f3] px-3 py-2 rounded-xl shadow-xs border border-[#e2d6c3] gap-2">
        <div>
          <h1 className="text-base font-extrabold text-[#3a3225] tracking-tight">KMP Relational Operations & Intelligence Dashboard</h1>
          <p className="text-[10px] text-[#736450] font-medium">
            Monthly aggregates, crime categories, suspect legal statuses, open-ended recoveries, fire incidents, daily detentions, and accident analytics.
          </p>
        </div>
        <button
          onClick={handleExportExcel}
          className="bg-[#596E47] hover:bg-[#4A5D4E] text-white px-2.5 py-1 rounded-lg font-bold text-[10px] shadow-xs transition flex items-center space-x-1 cursor-pointer shrink-0"
        >
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
          { id: 'OPERATIONS', label: '⚡ Disruptive Ops' },
          { id: 'MANPOWER_DEEP', label: '🛡️ Manpower Analysis' },
          { id: 'SUMMARY', label: '📋 Summary Table' }
        ].map((tab) => (
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

          <select
            value={selectedRegion}
            onChange={(e) => {
              if (canViewGlobalLevel) {
                setSelectedRegion(e.target.value);
                setSelectedStation('ALL STATIONS');
              }
            }}
            disabled={!canViewGlobalLevel}
            className="border border-[#e2d6c3] rounded-md px-2 py-0.5 text-[10px] font-bold text-[#3a3225] bg-white outline-none cursor-pointer"
          >
            <option value="ALL REGIONS">ALL REGIONS</option>
            {Object.keys(REGIONAL_HIERARCHY).map((reg) => (
              <option key={reg} value={reg}>{reg}</option>
            ))}
          </select>

          <select
            value={selectedStation}
            onChange={(e) => setSelectedStation(e.target.value)}
            className="border border-[#e2d6c3] rounded-md px-2 py-0.5 text-[10px] font-bold text-[#3a3225] bg-white outline-none cursor-pointer"
          >
            <option value="ALL STATIONS">ALL STATIONS / DIVISIONS</option>
            {REGIONAL_HIERARCHY[selectedRegion]?.map((stn) => (
              <option key={stn} value={stn}>{stn}</option>
            ))}
          </select>

          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="border border-[#e2d6c3] rounded-md px-2 py-0.5 text-[10px] font-bold text-[#3a3225] bg-white outline-none cursor-pointer"
          >
            <option value="ALL">All Months</option>
            <option value="2026-11">November 2026</option>
            <option value="2026-10">October 2026</option>
            <option value="2026-09">September 2026</option>
            <option value="2026-08">August 2026</option>
            <option value="2026-07">July 2026</option>
          </select>

          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="border border-[#e2d6c3] rounded-md px-2 py-0.5 text-[10px] font-bold text-[#3a3225] bg-white outline-none cursor-pointer"
          >
            <option value="ALL">All Time Range</option>
            <option value="1DAY">Last 1 Day</option>
            <option value="7DAYS">Last 7 Days (1 Week)</option>
            <option value="30DAYS">Last 30 Days (1 Month)</option>
            <option value="90DAYS">Last 90 Days (3 Months)</option>
            <option value="1YEAR">Last 365 Days (1 Year)</option>
          </select>
        </div>

        <span className="text-[10px] font-extrabold text-[#596E47] bg-[#e9eedf] px-2 py-0.5 rounded border border-[#cfe1b9]">
          Total Entries: {activeDomain === 'SUCCESS' ? displaySuccessStories.length : activeDomain === 'CRIME' ? crimeComparativeMatrix.totals.grandTotal : activeDomain === 'EXHIBITS' ? exhibitGroupedData.length : activeDomain === 'FIRES' ? displayFireIncidents.length : activeDomain === 'ACCIDENTS' ? displayAccidentsList.length : timeFilteredDataset.length}
        </span>
      </div>

      {/* SUCCESS STORIES TAB */}
      {activeDomain === 'SUCCESS' && (
        <div className="space-y-3 pb-8">
          <div className="bg-[#3a3225] rounded-xl p-3 text-[#f4eee2] shadow-sm border border-[#534735]">
            <h2 className="text-xs font-extrabold flex items-center tracking-wide text-[#f4eee2]">
              <Award className="mr-2 text-[#C5A880] w-3.5 h-3.5" /> Success Stories & Operational Breakthrough Summaries
            </h2>
            <p className="text-[10px] text-[#b8ab97] mt-0.5 leading-tight">
              Automatically extracting arrest numbers, classified breakthroughs, open-ended property recoveries, and suspect legal status directly from story narratives.
            </p>
          </div>

          <div className="bg-white rounded-xl shadow-xs border border-[#e2d6c3] p-3 h-[330px]">
            <h3 className="text-[11px] font-black text-[#3a3225] uppercase mb-2">
              Success Stories Comparison by {groupLabelText}
            </h3>
            {backendSuccessStoriesComparison.length > 0 ? (
              <ResponsiveContainer width="100%" height="90%">
                <BarChart data={backendSuccessStoriesComparison} margin={{ top: 10, right: 20, left: 0, bottom: 45 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2d6c3" />
                  <XAxis dataKey="label" interval={0} angle={-20} textAnchor="end" height={55} tick={{ fontSize: 9, fontWeight: 'bold' }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 9 }} />
                  <Tooltip contentStyle={{ borderRadius: '8px', fontSize: '10px', fontWeight: 'bold' }} />
                  <Legend wrapperStyle={{ fontSize: '10px', fontWeight: 'bold' }} />
                  <Bar dataKey="stories" name="Success Stories" fill="#596E47" radius={[4, 4, 0, 0]} maxBarSize={32} />
                  <Bar dataKey="suspects" name="Suspects Arrested" fill="#A97142" radius={[4, 4, 0, 0]} maxBarSize={32} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-[10px] text-[#736450]">
                No comparative success stories data available.
              </div>
            )}
          </div>

          <div className="bg-[#fbf8f3] rounded-xl shadow-xs border border-[#e2d6c3] overflow-hidden">
            <div className="max-h-[520px] overflow-y-auto custom-scrollbar w-full">
              <table className="w-full table-fixed divide-y divide-[#e2d6c3]">
                <thead className="sticky top-0 z-20">
                  <tr className="bg-gradient-to-b from-[#f4eee2] to-[#e6dfd1] text-[#3a3225] font-extrabold border-b-2 border-[#d3c2a8]">
                    <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wide border-r border-[#d3c2a8]" style={{ width: '18%' }}>Station / Region</th>
                    <th className="px-3 py-2 text-center text-[10px] uppercase tracking-wide border-r border-[#d3c2a8]" style={{ width: '12%' }}>Suspects Arrested</th>
                    <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wide border-r border-[#d3c2a8]" style={{ width: '28%' }}>Classified Breakthrough Summary</th>
                    <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wide border-r border-[#d3c2a8]" style={{ width: '26%' }}>Recovered Properties & Quantities</th>
                    <th className="px-3 py-2 text-center text-[10px] uppercase tracking-wide" style={{ width: '16%' }}>Suspect Legal Status</th>
                  </tr>
                </thead>
                <tbody className="bg-[#fbf8f3] divide-y divide-[#e2d6c3]">
                  {displaySuccessStories.length > 0 ? (
                    displaySuccessStories.map((st, idx) => (
                      <tr key={idx} className="hover:bg-[#e9eedf]/30 align-top">
                        <td className="px-3 py-2 text-[10px] font-bold text-[#3a3225] border-r border-[#e2d6c3] whitespace-normal break-words">
                          {st.station}<br /><span className="text-[9px] text-[#736450] font-medium">{st.region}</span>
                        </td>
                        <td className="px-3 py-2 text-center font-bold text-[#596E47] text-[10px] border-r border-[#e2d6c3]">{st.parsedSuspects || 0}</td>
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
        <div className="space-y-3 pb-8">
          <div className="bg-[#3a3225] rounded-xl p-3 text-[#f4eee2] shadow-sm border border-[#534735]">
            <h2 className="text-xs font-extrabold flex items-center tracking-wide text-[#f4eee2]">
              <BarChart3 className="mr-2 text-[#C5A880] w-3.5 h-3.5" /> Crime Categories & Comparative Regional Analytics
            </h2>
            <p className="text-[10px] text-[#b8ab97] mt-0.5 leading-tight">
              Granular comparative breakdown of offences across KMP North, KMP East, and KMP South based on selected date range.
            </p>
          </div>

          {/* COMPARATIVE CRIME TABLE */}
          <div className="bg-[#fbf8f3] rounded-xl shadow-xs border border-[#e2d6c3] overflow-hidden">
            <div className="bg-[#efece6] px-3 py-2 border-b border-[#d3c2a8] flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-[11px] font-black text-[#3a3225] uppercase">
                Comparative Crime / Offence Breakdown by Region
              </h3>
              <span className="text-[10px] font-extrabold bg-[#3a3225] text-[#f4eee2] px-2.5 py-0.5 rounded">
                Grand Total: {crimeComparativeMatrix.totals.grandTotal.toLocaleString()} Cases
              </span>
            </div>

            <div className="max-h-[460px] overflow-auto custom-scrollbar w-full">
              <table className="min-w-full divide-y divide-[#e2d6c3] text-[10px]">
                <thead className="sticky top-0 z-20">
                  <tr className="bg-gradient-to-b from-[#f4eee2] to-[#e6dfd1] text-[#3a3225] font-extrabold border-b border-[#d3c2a8]">
                    <th rowSpan={2} className="px-3 py-2 text-center uppercase border-r border-[#d3c2a8] w-14">S/N</th>
                    <th rowSpan={2} className="px-3 py-2 text-left uppercase border-r border-[#d3c2a8] min-w-[220px]">Crime / Offence</th>
                    <th colSpan={3} className="px-3 py-1.5 text-center uppercase border-r border-[#d3c2a8] bg-[#e6dfd1]">
                      Number of Cases Reported (Period Under Review)
                    </th>
                    <th rowSpan={2} className="px-3 py-2 text-center uppercase bg-[#3a3225] text-[#f4eee2] w-24">Total</th>
                  </tr>
                  <tr className="bg-gradient-to-b from-[#e6dfd1] to-[#ded6c8] text-[#3a3225] font-extrabold border-b-2 border-[#d3c2a8]">
                    <th className="px-3 py-1.5 text-center uppercase border-r border-[#d3c2a8] text-[#596E47] w-28">KMP North</th>
                    <th className="px-3 py-1.5 text-center uppercase border-r border-[#d3c2a8] text-[#A97142] w-28">KMP East</th>
                    <th className="px-3 py-1.5 text-center uppercase border-r border-[#d3c2a8] text-blue-800 w-28">KMP South</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e2d6c3] bg-[#fbf8f3]">
                  {crimeComparativeMatrix.rows.length > 0 ? (
                    crimeComparativeMatrix.rows.map((row) => (
                      <tr key={row.offence} className="hover:bg-[#e9eedf]/40">
                        <td className="px-3 py-2 text-center font-bold text-[#594d3c] border-r border-[#e2d6c3]">{row.sn}</td>
                        <td className="px-3 py-2 font-extrabold text-[#3a3225] uppercase border-r border-[#e2d6c3] whitespace-normal break-words">{row.offence}</td>
                        <td className="px-3 py-2 text-center font-bold text-[#596E47] border-r border-[#e2d6c3]">{row.kmpNorth > 0 ? row.kmpNorth.toLocaleString() : '-'}</td>
                        <td className="px-3 py-2 text-center font-bold text-[#A97142] border-r border-[#e2d6c3]">{row.kmpEast > 0 ? row.kmpEast.toLocaleString() : '-'}</td>
                        <td className="px-3 py-2 text-center font-bold text-blue-800 border-r border-[#e2d6c3]">{row.kmpSouth > 0 ? row.kmpSouth.toLocaleString() : '-'}</td>
                        <td className="px-3 py-2 text-center font-black text-[#3a3225] bg-[#e9eedf]/50">{row.total.toLocaleString()}</td>
                      </tr>
                    ))
                  ) : (
                    <tr><td colSpan={6} className="text-center py-6 text-[10px] text-[#736450]">No comparative crime records found for the selected period.</td></tr>
                  )}
                </tbody>
                {crimeComparativeMatrix.rows.length > 0 && (
                  <tfoot className="sticky bottom-0 z-20">
                    <tr className="bg-[#3a3225] text-[#f4eee2] font-black border-t-2 border-[#534735]">
                      <td colSpan={2} className="px-3 py-2 text-left uppercase tracking-wide border-r border-[#534735]">Grand Total</td>
                      <td className="px-3 py-2 text-center border-r border-[#534735]">{crimeComparativeMatrix.totals.kmpNorth.toLocaleString()}</td>
                      <td className="px-3 py-2 text-center border-r border-[#534735]">{crimeComparativeMatrix.totals.kmpEast.toLocaleString()}</td>
                      <td className="px-3 py-2 text-center border-r border-[#534735]">{crimeComparativeMatrix.totals.kmpSouth.toLocaleString()}</td>
                      <td className="px-3 py-2 text-center bg-[#596E47] text-white text-[11px]">{crimeComparativeMatrix.totals.grandTotal.toLocaleString()}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          {/* VERTICAL COMPARATIVE CRIME BAR GRAPH */}
          <div className="bg-white rounded-xl shadow-xs border border-[#e2d6c3] p-3">
            <div className="flex flex-wrap items-center justify-between border-b border-[#e2d6c3] pb-1.5 mb-2 gap-2">
              <h3 className="text-[11px] font-black text-[#3a3225] uppercase">
                Comparative Crime Graph (KMP North vs KMP East vs KMP South)
              </h3>
              <span className="text-[9px] font-extrabold text-[#736450] bg-[#f4eee2] px-2 py-0.5 rounded">
                X: Crime / Offence • Y: Number of Cases
              </span>
            </div>

            {crimeComparativeMatrix.rows.length > 0 ? (
              <div className="h-[380px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={crimeComparativeMatrix.rows} margin={{ top: 10, right: 20, left: 5, bottom: 70 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2d6c3" />
                    <XAxis dataKey="offence" interval={0} angle={-25} textAnchor="end" height={75} tick={{ fontSize: 9, fontWeight: 'bold', fill: '#3a3225' }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 9, fontWeight: 'bold' }} />
                    <Tooltip contentStyle={{ borderRadius: '8px', fontSize: '10px', fontWeight: 'bold' }} />
                    <Legend wrapperStyle={{ fontSize: '10px', fontWeight: 'bold' }} />
                    <Bar dataKey="kmpNorth" name="KMP North" fill="#596E47" radius={[3, 3, 0, 0]} maxBarSize={20} />
                    <Bar dataKey="kmpEast" name="KMP East" fill="#A97142" radius={[3, 3, 0, 0]} maxBarSize={20} />
                    <Bar dataKey="kmpSouth" name="KMP South" fill="#2563EB" radius={[3, 3, 0, 0]} maxBarSize={20} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[220px] w-full flex items-center justify-center text-[10px] text-[#736450]">
                No comparative crime data available for graphing.
              </div>
            )}
          </div>

          <div className="bg-[#fbf8f3] rounded-xl shadow-xs border border-[#e2d6c3] overflow-hidden">
            <div className="bg-[#efece6] px-3 py-1.5 border-b border-[#d3c2a8] flex items-center justify-between">
              <h3 className="text-[11px] font-black text-[#3a3225] uppercase">Aggregated Regional Crime Volumes</h3>
            </div>
            <div className="max-h-[420px] overflow-y-auto custom-scrollbar w-full">
              <table className="w-full table-fixed divide-y divide-[#e2d6c3]">
                <thead className="sticky top-0 z-20">
                  <tr className="bg-gradient-to-b from-[#f4eee2] to-[#e6dfd1] text-[#3a3225] font-extrabold border-b-2 border-[#d3c2a8]">
                    <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wide border-r border-[#d3c2a8]" style={{ width: '75%' }}>Command Region</th>
                    <th className="px-3 py-2 text-center text-[10px] uppercase tracking-wide" style={{ width: '25%' }}>Total Crimes Recorded</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e2d6c3]">
                  {displayCrimeCategories.map((reg) => {
                    const isExpanded = expandedCrimeRegion === reg.region;
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
              <Lock className="mr-2 text-[#C5A880] w-3.5 h-3.5" /> Calendar Master Lock-Up, Age Comparison & Margin Audit
            </h2>
            <p className="text-[10px] text-[#b8ab97] mt-0.5 leading-tight">
              Select any date from the calendar ribbon below to inspect master lock-ups, station breakdowns, comparative age in detention, and population margin deltas.
            </p>
          </div>

          <div className="bg-white p-3 rounded-xl shadow-xs border border-[#e2d6c3] space-y-2">
            <h3 className="text-[11px] font-black text-[#3a3225] uppercase flex items-center">
              <Calendar className="w-3.5 h-3.5 mr-1.5 text-[#596E47]" /> Select Date for Station Lock-Up Audit:
            </h3>
            <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto custom-scrollbar p-1">
              {backendDetentionCalendar.dates.length > 0 ? (
                backendDetentionCalendar.dates.map((dateStr) => {
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
                            {stnRow.station}<br /><span className="text-[9px] text-[#736450]">{stnRow.region}</span>
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

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            {/* 1. Comparative Age in Detention (Adults vs Juveniles) */}
            <div className="bg-white rounded-xl shadow-xs border border-[#e2d6c3] p-3 h-[340px]">
              <h3 className="text-[11px] font-black text-[#3a3225] uppercase mb-2">
                Age in Detention Comparison by {groupLabelText} (Adults vs Juveniles)
              </h3>
              {(backendDetentionCalendar.ageComparison || []).length > 0 ? (
                <ResponsiveContainer width="100%" height="90%">
                  <BarChart data={backendDetentionCalendar.ageComparison} margin={{ top: 10, right: 15, left: 0, bottom: 45 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2d6c3" />
                    <XAxis dataKey="label" interval={0} angle={-20} textAnchor="end" height={55} tick={{ fontSize: 9, fontWeight: 'bold' }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 9 }} />
                    <Tooltip contentStyle={{ borderRadius: '8px', fontSize: '10px', fontWeight: 'bold' }} />
                    <Legend wrapperStyle={{ fontSize: '9px', fontWeight: 'bold' }} />
                    <Bar dataKey="adults" name="Adults (18+)" fill="#2563EB" radius={[4, 4, 0, 0]} maxBarSize={28} />
                    <Bar dataKey="juveniles" name="Juveniles (<18)" fill="#F59E0B" radius={[4, 4, 0, 0]} maxBarSize={28} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[10px] text-[#736450]">No age comparison data.</div>
              )}
            </div>

            {/* 2. Suspect Demographics (Vertical Stacked) */}
            <div className="bg-white rounded-xl shadow-xs border border-[#e2d6c3] p-3 h-[340px]">
              <h3 className="text-[11px] font-black text-[#3a3225] uppercase mb-2">Suspect Demographics by Region</h3>
              {backendDetentionCalendar.regionDemographics.length > 0 ? (
                <ResponsiveContainer width="100%" height="90%">
                  <BarChart data={backendDetentionCalendar.regionDemographics} margin={{ top: 10, right: 15, left: 0, bottom: 45 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2d6c3" />
                    <XAxis dataKey="region" interval={0} angle={-20} textAnchor="end" height={55} tick={{ fontSize: 9, fontWeight: 'bold' }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 9 }} />
                    <Tooltip contentStyle={{ borderRadius: '8px', fontSize: '10px', fontWeight: 'bold' }} />
                    <Legend wrapperStyle={{ fontSize: '9px', fontWeight: 'bold' }} />
                    <Bar dataKey="maleAdults" name="Male Adults" fill="#2563EB" stackId="a" />
                    <Bar dataKey="femaleAdults" name="Female Adults" fill="#DB2777" stackId="a" />
                    <Bar dataKey="maleJuveniles" name="Male Juveniles" fill="#3B82F6" stackId="a" />
                    <Bar dataKey="femaleJuveniles" name="Female Juveniles" fill="#EC4899" stackId="a" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[10px] text-[#736450]">No regional demographic data.</div>
              )}
            </div>

            {/* 3. Detention Duration (Vertical Stacked) */}
            <div className="bg-white rounded-xl shadow-xs border border-[#e2d6c3] p-3 h-[340px]">
              <h3 className="text-[11px] font-black text-[#3a3225] uppercase mb-2">Detention Duration by Region</h3>
              {backendDetentionCalendar.regionDuration.length > 0 ? (
                <ResponsiveContainer width="100%" height="90%">
                  <BarChart data={backendDetentionCalendar.regionDuration} margin={{ top: 10, right: 15, left: 0, bottom: 45 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2d6c3" />
                    <XAxis dataKey="region" interval={0} angle={-20} textAnchor="end" height={55} tick={{ fontSize: 9, fontWeight: 'bold' }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 9 }} />
                    <Tooltip contentStyle={{ borderRadius: '8px', fontSize: '10px', fontWeight: 'bold' }} />
                    <Legend wrapperStyle={{ fontSize: '9px', fontWeight: 'bold' }} />
                    <Bar dataKey="day1" name="1 Day" fill="#10B981" stackId="a" />
                    <Bar dataKey="day2" name="2 Days" fill="#F59E0B" stackId="a" />
                    <Bar dataKey="over3Days" name="3+ Days (48hr Breach)" fill="#DC2626" stackId="a" radius={[4, 4, 0, 0]} />
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
              <Car className="mr-2 text-[#C5A880] w-3.5 h-3.5" /> Traffic & Accidents Intelligence Audit & Analytics
            </h2>
            <p className="text-[10px] text-[#b8ab97] mt-0.5 leading-tight">
              Tracking monthly accident comparisons, crash severity, and {groupLabelText.toLowerCase()} concentration.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div className="bg-white rounded-xl shadow-xs border border-[#e2d6c3] p-3 h-[320px]">
              <h3 className="text-[11px] font-black text-[#3a3225] uppercase mb-2">Accident Occurrences by Month</h3>
              {accidentsMonthlyChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="90%">
                  <LineChart data={accidentsMonthlyChartData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2d6c3" />
                    <XAxis dataKey="month" tick={{ fontSize: 9, fontWeight: 'bold' }} />
                    <YAxis tick={{ fontSize: 9 }} />
                    <Tooltip contentStyle={{ borderRadius: '8px', fontSize: '10px', fontWeight: 'bold' }} />
                    <Line type="monotone" dataKey="count" name="Accidents" stroke="#2563EB" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[10px] text-[#736450]">No monthly accident data available.</div>
              )}
            </div>

            <div className="bg-white rounded-xl shadow-xs border border-[#e2d6c3] p-3 h-[320px]">
              <h3 className="text-[11px] font-black text-[#3a3225] uppercase mb-2">Accident Severity Breakdown</h3>
              {accidentsSeverityChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="90%">
                  <BarChart data={accidentsSeverityChartData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2d6c3" />
                    <XAxis dataKey="severity" tick={{ fontSize: 9, fontWeight: 'bold' }} />
                    <YAxis tick={{ fontSize: 9 }} />
                    <Tooltip contentStyle={{ borderRadius: '8px', fontSize: '10px', fontWeight: 'bold' }} />
                    <Bar dataKey="count" name="Severity Count" fill="#D97706" radius={[4, 4, 0, 0]} barSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[10px] text-[#736450]">No severity breakdown data.</div>
              )}
            </div>

            <div className="bg-white rounded-xl shadow-xs border border-[#e2d6c3] p-3 h-[320px] flex flex-col items-center">
              <h3 className="text-[11px] font-black text-[#3a3225] uppercase mb-1 w-full border-b border-[#e2d6c3] pb-1">
                Accident Concentration by {groupLabelText}
              </h3>
              {accidentsRegionalChartData.length > 0 ? (
                <div className="h-[260px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={accidentsRegionalChartData} cx="50%" cy="50%" labelLine={false} label={renderCustomizedLabel} outerRadius={70} fill="#8884d8" dataKey="value" nameKey="region">
                        {accidentsRegionalChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ borderRadius: '8px', fontSize: '10px', fontWeight: 'bold' }} />
                      <Legend wrapperStyle={{ fontSize: '9px', fontWeight: 'bold' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[10px] text-[#736450]">No accident distribution data.</div>
              )}
            </div>
          </div>

          <div className="bg-[#fbf8f3] rounded-xl shadow-xs border border-[#e2d6c3] overflow-hidden">
            <div className="max-h-[420px] overflow-y-auto custom-scrollbar w-full">
              <table className="w-full table-fixed divide-y divide-[#e2d6c3]">
                <thead className="sticky top-0 z-20">
                  <tr className="bg-gradient-to-b from-[#f4eee2] to-[#e6dfd1] text-[#3a3225] font-extrabold border-b-2 border-[#d3c2a8]">
                    <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wide border-r border-[#d3c2a8]" style={{ width: '18%' }}>Station / Region</th>
                    <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wide border-r border-[#d3c2a8]" style={{ width: '12%' }}>Date</th>
                    <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wide border-r border-[#d3c2a8]" style={{ width: '28%' }}>Nature of Accident</th>
                    <th className="px-3 py-2 text-center text-[10px] uppercase tracking-wide border-r border-[#d3c2a8]" style={{ width: '10%' }}>Minor</th>
                    <th className="px-3 py-2 text-center text-[10px] uppercase tracking-wide border-r border-[#d3c2a8]" style={{ width: '10%' }}>Serious</th>
                    <th className="px-3 py-2 text-center text-[10px] uppercase tracking-wide border-r border-[#d3c2a8]" style={{ width: '10%' }}>Fatal</th>
                    <th className="px-3 py-2 text-center text-[10px] uppercase tracking-wide border-r border-[#d3c2a8]" style={{ width: '10%' }}>Victims</th>
                    <th className="px-3 py-2 text-center text-[10px] uppercase tracking-wide" style={{ width: '12%' }}>Total</th>
                  </tr>
                </thead>
                <tbody className="bg-[#fbf8f3] divide-y divide-[#e2d6c3]">
                  {displayAccidentsList.length > 0 ? (
                    displayAccidentsList.map((ac, idx) => (
                      <tr key={idx} className="hover:bg-[#e9eedf]/30 align-top">
                        <td className="px-3 py-2 text-[10px] font-bold text-[#3a3225] border-r border-[#e2d6c3] whitespace-normal break-words">{ac.station}<br /><span className="text-[9px] text-[#736450]">{ac.region}</span></td>
                        <td className="px-3 py-2 text-[10px] font-semibold text-[#594d3c] border-r border-[#e2d6c3]">{ac.date}</td>
                        <td className="px-3 py-2 text-[10px] font-extrabold text-blue-900 uppercase border-r border-[#e2d6c3] whitespace-normal break-words">{ac.nature}</td>
                        <td className="px-3 py-2 text-center text-[10px] font-bold text-blue-700 border-r border-[#e2d6c3]">{ac.minor}</td>
                        <td className="px-3 py-2 text-center text-[10px] font-bold text-orange-700 border-r border-[#e2d6c3]">{ac.serious}</td>
                        <td className="px-3 py-2 text-center text-[10px] font-black text-red-700 border-r border-[#e2d6c3]">{ac.fatal}</td>
                        <td className="px-3 py-2 text-center text-[10px] font-black text-purple-700 border-r border-[#e2d6c3]">{ac.victims}</td>
                        <td className="px-3 py-2 text-center text-[10px] font-black text-[#3a3225]">{ac.total}</td>
                      </tr>
                    ))
                  ) : (
                    <tr><td colSpan="8" className="text-center py-6 text-[10px] text-[#736450]">No accident records found matching your filter criteria.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
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
              Classifying structures, tracking explicit deaths vs. injuries, and visualizing fire concentration by {groupLabelText.toLowerCase()}.
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

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div className="bg-white rounded-xl shadow-xs border border-[#e2d6c3] p-3 h-[320px]">
              <h3 className="text-[11px] font-black text-[#3a3225] uppercase mb-2">
                Fire Concentration by {groupLabelText}
              </h3>
              {fireConcentrationChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="90%">
                  <BarChart data={fireConcentrationChartData} margin={{ top: 10, right: 15, left: 0, bottom: 45 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2d6c3" />
                    <XAxis dataKey="label" interval={0} angle={-20} textAnchor="end" height={55} tick={{ fontSize: 9, fontWeight: 'bold' }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 9 }} />
                    <Tooltip contentStyle={{ borderRadius: '8px', fontSize: '10px', fontWeight: 'bold' }} />
                    <Bar dataKey="count" name="Fire Incidents" fill="#EA580C" radius={[4, 4, 0, 0]} maxBarSize={35} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[10px] text-[#736450]">No fire concentration data available.</div>
              )}
            </div>

            <div className="bg-white rounded-xl shadow-xs border border-[#e2d6c3] p-3 h-[320px]">
              <h3 className="text-[11px] font-black text-[#3a3225] uppercase mb-2">Frequency of Fire Incident Causes</h3>
              {fireCausesChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="90%">
                  <BarChart data={fireCausesChartData} margin={{ top: 10, right: 15, left: 0, bottom: 45 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2d6c3" />
                    <XAxis dataKey="cause" tick={{ fontSize: 8, fontWeight: 'bold' }} angle={-20} textAnchor="end" height={55} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 9 }} />
                    <Tooltip contentStyle={{ borderRadius: '8px', fontSize: '10px', fontWeight: 'bold' }} />
                    <Bar dataKey="count" name="Frequency" fill="#C2410C" radius={[4, 4, 0, 0]} maxBarSize={35} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[10px] text-[#736450]">No cause frequency data available.</div>
              )}
            </div>

            <div className="bg-white rounded-xl shadow-xs border border-[#e2d6c3] p-3 h-[320px]">
              <h3 className="text-[11px] font-black text-[#3a3225] uppercase mb-2">Annual Fire Occurrences by Month</h3>
              {fireMonthlyChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="90%">
                  <LineChart data={fireMonthlyChartData} margin={{ top: 10, right: 15, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2d6c3" />
                    <XAxis dataKey="month" tick={{ fontSize: 9, fontWeight: 'bold' }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 9 }} />
                    <Tooltip contentStyle={{ borderRadius: '8px', fontSize: '10px', fontWeight: 'bold' }} />
                    <Line type="monotone" dataKey="count" name="Fire Incidents" stroke="#DC2626" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[10px] text-[#736450]">No monthly occurrence data available.</div>
              )}
            </div>
          </div>

          <div className="bg-[#fbf8f3] rounded-xl shadow-xs border border-[#e2d6c3] overflow-hidden">
            <div className="max-h-[520px] overflow-y-auto custom-scrollbar w-full">
              <table className="w-full table-fixed divide-y divide-[#e2d6c3]">
                <thead className="sticky top-0 z-20">
                  <tr className="bg-gradient-to-b from-[#f4eee2] to-[#e6dfd1] text-[#3a3225] font-extrabold border-b-2 border-[#d3c2a8]">
                    <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wide border-r border-[#d3c2a8]" style={{ width: '18%' }}>Station / Region</th>
                    <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wide border-r border-[#d3c2a8]" style={{ width: '22%' }}>Property / Structure Type</th>
                    <th className="px-3 py-2 text-center text-[10px] uppercase tracking-wide border-r border-[#d3c2a8]" style={{ width: '10%' }}>Deaths</th>
                    <th className="px-3 py-2 text-center text-[10px] uppercase tracking-wide border-r border-[#d3c2a8]" style={{ width: '10%' }}>Injuries</th>
                    <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wide" style={{ width: '40%' }}>Incident Findings & Summary</th>
                  </tr>
                </thead>
                <tbody className="bg-[#fbf8f3] divide-y divide-[#e2d6c3]">
                  {displayFireIncidents.length > 0 ? (
                    displayFireIncidents.map((f, idx) => (
                      <tr key={idx} className="hover:bg-[#e9eedf]/30 align-top">
                        <td className="px-3 py-2 text-[10px] font-bold text-[#3a3225] border-r border-[#e2d6c3] whitespace-normal break-words">
                          {f.station}<br /><span className="text-[9px] text-[#736450]">{f.region}</span>
                        </td>
                        <td className="px-3 py-2 text-[10px] font-extrabold text-amber-800 uppercase border-r border-[#e2d6c3] whitespace-normal break-words">{f.classification}</td>
                        <td className="px-3 py-2 text-center font-black text-red-700 text-[10px] border-r border-[#e2d6c3]">{f.deaths}</td>
                        <td className="px-3 py-2 text-center font-black text-amber-600 text-[10px] border-r border-[#e2d6c3]">{f.injuries}</td>
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
              <Zap className="mr-2 text-[#C5A880] w-3.5 h-3.5" /> Comparative Disruptive Operations Matrix by {groupLabelText}
            </h2>
            <p className="text-[10px] text-[#b8ab97] mt-0.5 leading-tight">
              Visualizing Total Crimes Reported against the Total Number of Suspects Arrested via Disruptive Operations.
            </p>
          </div>

          <div className="bg-white rounded-xl shadow-xs border border-[#e2d6c3] p-3 h-[380px]">
            {opsChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={opsChartData} margin={{ top: 20, right: 30, left: 0, bottom: 45 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2d6c3" />
                  <XAxis dataKey="name" tick={{ fontSize: 9, fontWeight: 'bold' }} interval={0} angle={-20} textAnchor="end" height={55} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                  <Tooltip cursor={{ fill: '#fbf8f3' }} contentStyle={{ borderRadius: '8px', border: '1px solid #e2d6c3', fontSize: '10px', fontWeight: 'bold' }} />
                  <Legend wrapperStyle={{ fontSize: '10px', fontWeight: 'bold' }} />
                  <Bar dataKey="Crimes" name="Total Crimes Reported" fill="#A97142" radius={[4, 4, 0, 0]} maxBarSize={36} />
                  <Bar dataKey="Arrests" name="Arrests from Disruptive Ops" fill="#596E47" radius={[4, 4, 0, 0]} maxBarSize={36} />
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
                    <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wide border-r border-[#d3c2a8]" style={{ width: '22%' }}>Exhibit Category</th>
                    <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wide border-r border-[#d3c2a8]" style={{ width: '30%' }}>Description (Colour/Features)</th>
                    <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wide border-r border-[#d3c2a8]" style={{ width: '22%' }}>Region / Station</th>
                    <th className="px-3 py-2 text-center text-[10px] uppercase tracking-wide border-r border-[#d3c2a8]" style={{ width: '14%' }}>Status</th>
                    <th className="px-3 py-2 text-center text-[10px] uppercase tracking-wide" style={{ width: '12%' }}>Total</th>
                  </tr>
                </thead>
                <tbody className="bg-[#fbf8f3] divide-y divide-[#e2d6c3]">
                  {exhibitGroupedData.length > 0 ? (
                    exhibitGroupedData.map((row, idx) => (
                      <tr key={idx} className="hover:bg-[#e9eedf]/30 align-top">
                        <td className="px-3 py-2 text-[10px] font-bold text-[#3a3225] uppercase border-r border-[#e2d6c3] whitespace-normal break-words">{row.category}</td>
                        <td className="px-3 py-2 text-[10px] font-bold text-[#596E47] uppercase border-r border-[#e2d6c3] whitespace-normal break-words">{row.desc}</td>
                        <td className="px-3 py-2 text-[10px] font-semibold text-[#736450] uppercase border-r border-[#e2d6c3] whitespace-normal break-words">{row.region}<br />{row.station}</td>
                        <td className="px-3 py-2 text-center text-[10px] font-bold uppercase border-r border-[#e2d6c3]"><span className="px-2 py-0.5 rounded bg-teal-100 text-teal-900 inline-block">{row.status}</span></td>
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
                    <th className="px-4 py-2.5 text-left text-[11px] uppercase tracking-wide border-r border-[#d3c2a8]" style={{ width: '75%' }}>Operational Metric Attribute</th>
                    <th className="px-4 py-2.5 text-right text-[11px] uppercase tracking-wide" style={{ width: '25%' }}>Aggregate Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e2d6c3]">
                  <tr className="hover:bg-[#e9eedf]/30 align-top"><td className="px-4 py-2 text-[11px] font-bold text-[#3a3225] border-r border-[#e2d6c3]">Total Disruptive Operations Registered</td><td className="px-4 py-2 text-right font-black text-[#596E47] text-[11px]">{summaryAggregates.disruptiveOps}</td></tr>
                  <tr className="hover:bg-[#e9eedf]/30 align-top"><td className="px-4 py-2 text-[11px] font-bold text-[#3a3225] border-r border-[#e2d6c3]">Force-Wide Manpower (Nominal Roll)</td><td className="px-4 py-2 text-right font-black text-[#3a3225] text-[11px]">{summaryAggregates.manpowerTotal}</td></tr>
                  <tr className="hover:bg-[#e9eedf]/30 align-top"><td className="px-4 py-2 text-[11px] font-bold text-[#3a3225] border-r border-[#e2d6c3]">Total Success Occasions / Breakthroughs</td><td className="px-4 py-2 text-right font-black text-amber-800 text-[11px]">{summaryAggregates.successOccasions}</td></tr>
                  <tr className="hover:bg-[#e9eedf]/30 align-top"><td className="px-4 py-2 text-[11px] font-bold text-[#3a3225] border-r border-[#e2d6c3]">Total Impounded Exhibits Tracked</td><td className="px-4 py-2 text-right font-black text-teal-800 text-[11px]">{summaryAggregates.totalExhibits}</td></tr>
                  <tr className="hover:bg-[#e9eedf]/30 align-top"><td className="px-4 py-2 text-[11px] font-bold text-[#3a3225] border-r border-[#e2d6c3]">Total Detention Logs Tracked</td><td className="px-4 py-2 text-right font-black text-blue-800 text-[11px]">{summaryAggregates.totalDetentions}</td></tr>
                  <tr className="hover:bg-[#e9eedf]/30 align-top"><td className="px-4 py-2 text-[11px] font-bold text-[#3a3225] border-r border-[#e2d6c3]">Total Traffic Accidents Recorded</td><td className="px-4 py-2 text-right font-black text-red-800 text-[11px]">{summaryAggregates.totalAccidents}</td></tr>
                  <tr className="hover:bg-[#e9eedf]/30 align-top"><td className="px-4 py-2 text-[11px] font-bold text-[#3a3225] border-r border-[#e2d6c3]">Total Fire & Arson Outbreaks Tracked</td><td className="px-4 py-2 text-right font-black text-amber-700 text-[11px]">{summaryAggregates.totalFires}</td></tr>
                  <tr className="hover:bg-[#e9eedf]/30 align-top"><td className="px-4 py-2 text-[11px] font-bold text-[#3a3225] border-r border-[#e2d6c3]">Total Suspects Arrested (Ops)</td><td className="px-4 py-2 text-right font-black text-[#596E47] text-[11px]">{summaryAggregates.totalArrests}</td></tr>
                  <tr className="hover:bg-[#e9eedf]/30 align-top"><td className="px-4 py-2 text-[11px] font-bold text-[#3a3225] border-r border-[#e2d6c3]">Total Crime Incidents Recorded</td><td className="px-4 py-2 text-right font-black text-[#3a3225] text-[11px]">{summaryAggregates.totalCrimes}</td></tr>
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
              Detailed structural breakdown of personnel force distribution by functional Units/Directorates and selectable Nominal Roll columns.
            </p>
          </div>

          <div className="bg-[#fbf8f3] rounded-xl shadow-xs border border-[#e2d6c3] overflow-hidden">
            <div className="bg-[#efece6] px-3 py-1.5 border-b border-[#d3c2a8] flex items-center justify-between">
              <h3 className="text-[11px] font-black text-[#3a3225] uppercase">General Summary (Deployable Personnel vs Rank Distribution)</h3>
            </div>
            <div className="max-h-[420px] overflow-y-auto custom-scrollbar w-full">
              <table className="min-w-full divide-y divide-[#e2d6c3]">
                <thead className="sticky top-0 z-20">
                  <tr className="bg-gradient-to-b from-[#f4eee2] to-[#e6dfd1] text-[#3a3225] font-extrabold border-b border-[#d3c2a8]">
                    <th rowSpan={2} className="px-3 py-2 text-left text-[10px] uppercase tracking-wide sticky left-0 bg-[#f4eee2] z-10 w-48 border-r border-[#d3c2a8]">Command Region / Station</th>
                    <th rowSpan={2} className="px-3 py-2 text-center text-[10px] font-black uppercase border-r border-[#d3c2a8]">Total Personnel</th>
                    <th rowSpan={2} className="px-2 py-2 text-center text-[10px] font-bold text-[#596E47] uppercase border-r border-[#d3c2a8]">Active Deployable</th>
                    <th rowSpan={2} className="px-2 py-2 text-center text-[10px] font-bold text-red-700 uppercase border-r border-[#d3c2a8]">Inactive (Sick/Leave)</th>
                    {manpowerAnalysis.allRanks.map((rank) => (
                      <th key={rank} colSpan={2} className="px-2 py-1.5 text-center text-[9px] font-extrabold uppercase border-r border-[#d3c2a8]">{rank}</th>
                    ))}
                  </tr>
                  <tr className="bg-gradient-to-b from-[#e6dfd1] to-[#ded6c8]">
                    {manpowerAnalysis.allRanks.map((rank) => (
                      <React.Fragment key={`${rank}-gender`}>
                        <th className="px-1 py-1 text-center text-[8px] font-bold text-blue-800 border-r border-[#d3c2a8]">M</th>
                        <th className="px-1 py-1 text-center text-[8px] font-bold text-pink-800 border-r border-[#d3c2a8]">F</th>
                      </React.Fragment>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e2d6c3]">
                  {manpowerAnalysis.rows.map((reg) => {
                    const isExpanded = expandedManpowerRegion === reg.region;
                    return (
                      <React.Fragment key={reg.region}>
                        <tr onClick={() => toggleManpowerRegion(reg.region)} className="bg-[#efece6]/50 hover:bg-[#e9eedf]/50 cursor-pointer transition-colors border-t border-[#d3c2a8]">
                          <td className="px-3 py-2 text-[10px] font-extrabold text-[#3a3225] uppercase flex items-center space-x-1.5 sticky left-0 bg-[#efece6]/50 border-r border-[#d3c2a8]">
                            <span className="text-[#596E47]">{isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</span>
                            <span>{reg.region}</span>
                          </td>
                          <td className="px-3 py-2 text-[10px] text-center font-black text-[#3a3225] border-r border-[#d3c2a8]">{reg.totalDeployable}</td>
                          <td colSpan={2 + manpowerAnalysis.allRanks.length * 2} className="px-3 py-2 text-[10px] text-[#736450] italic">Expand to view station distribution...</td>
                        </tr>
                        {isExpanded && reg.stationList.map((stn, sIdx) => (
                          <tr key={`dep-${sIdx}`} className="bg-white align-top">
                            <td className="px-3 py-1.5 pl-7 text-[10px] font-semibold text-[#594d3c] uppercase sticky left-0 bg-white border-r border-[#d3c2a8] whitespace-normal break-words">— {stn.station}</td>
                            <td className="px-3 py-1.5 text-[10px] text-center font-bold text-[#3a3225] border-r border-[#d3c2a8]">{stn.totalDeployable}</td>
                            <td className="px-3 py-1.5 text-[10px] text-center font-black text-[#596E47] border-r border-[#d3c2a8]">{stn.active}</td>
                            <td className="px-3 py-1.5 text-[10px] text-center font-bold text-red-700 border-r border-[#d3c2a8]">{stn.inactive}</td>
                            {manpowerAnalysis.allRanks.map((rank) => (
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

          {/* SUMMARY SCOPE SWITCHER */}
          <div className="bg-white rounded-xl shadow-xs border border-[#e2d6c3] p-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e2d6c3] pb-2">
              <div>
                <h3 className="text-[11px] font-black text-[#3a3225] uppercase flex items-center">
                  <MapPin className="w-3.5 h-3.5 mr-1.5 text-[#596E47]" />
                  Manpower Analytics Summary Scope
                </h3>
                <p className="text-[10px] text-[#736450]">
                  Select <strong>General Summary</strong> for combined totals or pick a specific {groupLabelText.toLowerCase()} to isolate its charts, graphs, and tables.
                </p>
              </div>
              <span className="text-[10px] font-black bg-[#3a3225] text-[#f4eee2] px-2.5 py-1 rounded-lg">
                Viewing: {manpowerSummaryScope === 'GENERAL' ? 'GENERAL SUMMARY' : manpowerSummaryScope} ({activeManpowerBucket.total.toLocaleString()} Personnel)
              </span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setManpowerSummaryScope('GENERAL')}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-extrabold uppercase transition border cursor-pointer ${
                  manpowerSummaryScope === 'GENERAL'
                    ? 'bg-[#596E47] text-white border-[#4A5D4E] shadow-xs'
                    : 'bg-[#fbf8f3] text-[#3a3225] border-[#e2d6c3] hover:bg-[#efece6]'
                }`}
              >
                General Summary
              </button>

              {manpowerRegionKeys.map((regKey) => (
                <button
                  key={regKey}
                  type="button"
                  onClick={() => setManpowerSummaryScope(regKey)}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-extrabold uppercase transition border cursor-pointer ${
                    manpowerSummaryScope === regKey
                      ? 'bg-[#3a3225] text-[#f4eee2] border-[#3a3225] shadow-xs'
                      : 'bg-[#fbf8f3] text-[#594d3c] border-[#e2d6c3] hover:bg-[#efece6]'
                  }`}
                >
                  {regKey} ({effectiveManpowerIntel.byRegion[regKey]?.total || 0})
                </button>
              ))}
            </div>
          </div>

          {/* SELECTABLE NOMINAL ROLL COLUMNS (RANK -> STATUS, INCLUDING BANK) */}
          <div className="bg-white rounded-xl shadow-xs border border-[#e2d6c3] p-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e2d6c3] pb-1.5">
              <h3 className="text-[11px] font-black text-[#3a3225] uppercase">
                Select Nominal Roll Columns to Analyze & Export ({selectedManpowerCols.length} Active)
              </h3>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setSelectedManpowerCols(DEFAULT_MANPOWER_COLS)}
                  className="px-2 py-0.5 rounded bg-[#f4eee2] hover:bg-[#e6dfd1] text-[9px] font-extrabold text-[#3a3225] uppercase border border-[#d3c2a8] cursor-pointer"
                >
                  Default 8
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedManpowerCols(ALL_MANPOWER_COLUMNS.map((c) => c.key))}
                  className="px-2 py-0.5 rounded bg-[#596E47] hover:bg-[#4A5D4E] text-[9px] font-extrabold text-white uppercase cursor-pointer"
                >
                  Select All (23)
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {ALL_MANPOWER_COLUMNS.map((col) => {
                const active = selectedManpowerCols.includes(col.key);
                return (
                  <button
                    key={col.key}
                    type="button"
                    onClick={() =>
                      setSelectedManpowerCols((prev) =>
                        prev.includes(col.key)
                          ? prev.length > 1
                            ? prev.filter((k) => k !== col.key)
                            : prev
                          : [...prev, col.key]
                      )
                    }
                    className={`px-2.5 py-1 rounded-md text-[9px] font-extrabold uppercase border transition cursor-pointer ${
                      active
                        ? 'bg-[#3a3225] text-[#f4eee2] border-[#3a3225]'
                        : 'bg-[#fbf8f3] text-[#594d3c] border-[#e2d6c3] hover:bg-[#efece6]'
                    }`}
                  >
                    {active ? '✓ ' : '+ '}
                    {col.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* DYNAMIC MANPOWER CARDS FOR SELECTED COLUMNS */}
          <div className="space-y-3">
            {selectedManpowerCols.map((colKey) => {
              const colMeta = ALL_MANPOWER_COLUMNS.find((c) => c.key === colKey);
              const colData = activeManpowerBucket.columns?.[colKey] || [];
              return (
                <ManpowerFeatureCard
                  key={colKey}
                  title={colMeta?.label || colKey.toUpperCase()}
                  icon={<BarChart3 className="w-3.5 h-3.5 mr-1.5 text-[#596E47]" />}
                  data={colData}
                  byRegion={effectiveManpowerIntel.byRegion}
                  colKey={colKey}
                  bucketKey={colKey}
                  groupLabel={groupLabelText}
                  scope={manpowerSummaryScope}
                  colors={colKey === 'status' ? PIE_STATUS_COLORS : PIE_COLORS}
                  emptyText={`No ${colMeta?.label || colKey} data available.`}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default AnalyticsDashboard;