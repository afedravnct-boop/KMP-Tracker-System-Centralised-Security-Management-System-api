import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  Users, PlusCircle, Edit, AlertTriangle, CheckCircle, Upload, 
  BarChart3, PieChart, ArrowRight, Shield, Archive, Eye, Search, X, Download, Filter
} from 'lucide-react';
import { authFetch } from './api';
import BulkNominalRollUpload from './BulkNominalRollUpload';
import OfficerDossierModal from './OfficerDossierModal';

// 🟢 Fully mapping Regions to their core HQs and Sub-stations
const REGIONAL_HIERARCHY = {
  "KMP NORTH": ["KMP NORTH HEADQUARTERS", "KMP NORTH", "KAWEMPE", "KAKIRI", "KASANGATI", "MATUGGA", "NANSANA", "OLD KAMPALA", "WAKISO", "WANDEGEYA"],
  "KMP EAST": ["KMP EAST HEADQUARTERS", "KMP EAST", "JINJA ROAD", "KIRA", "KIRA DIV", "KIRA ROAD", "MUKONO", "NAGGALAMA", "SEETA"],
  "KMP SOUTH": ["KMP SOUTH HEADQUARTERS", "KMP SOUTH", "NATEETE", "CPS KAMPALA", "PARLIAMENT", "ENTEBBE", "KABALAGALA", "KAJJANSI", "KASENYI", "KATWE", "KYENGERA", "NSANGI"],
  "KMP HEADQUARTERS": ["KMP HEADQUARTERS", "KMP CID", "KMP TRAFFIC", "KMP ICT", "KMP FLYING SQUAD", "KMP CRIME INTELLIGENCE"],
  "POLICE HEADQUARTERS": ["NAGURU", "OPERATIONS", "CRIME INTELLIGENCE", "CID", "LOGISTICS & ENGINEERING", "ICT", "CT", "FIRE & RESCUE"]
};

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

const getOfficialRegionForStation = (stationName, dbRegion) => {
  const cleanStation = cleanStr(stationName);
  const cleanDbRegion = cleanStr(dbRegion);

  if (!cleanStation && !cleanDbRegion) return 'UNASSIGNED';

  if (REGIONAL_HIERARCHY[cleanDbRegion] && REGIONAL_HIERARCHY[cleanDbRegion].includes(cleanStation)) return cleanDbRegion;

  for (const [regionName, stationsList] of Object.entries(REGIONAL_HIERARCHY)) {
    if (stationsList.includes(cleanStation)) return regionName;
  }
  return cleanDbRegion || cleanStation || 'UNASSIGNED';
};

const getStationPriorityWeight = (station, region) => {
  const stn = cleanStr(station);
  const reg = cleanStr(region);
  
  if (stn.includes('KMP HEADQUARTERS') || reg.includes('KMP HEADQUARTERS') || stn === 'HQ') {
    return 0;
  }
  if (stn.includes('HEADQUARTERS') || stn.includes('RPC')) {
    return 1;
  }
  return 2;
};

const getCommandWeight = (officer) => {
  if (!officer) return 99;
  const pos = cleanStr(officer.position);
  const rank = cleanStr(officer.rank);
  const name = cleanStr(officer.name);
  
  if (pos.includes('COMMANDER KMP') || pos.includes('COMDR KMP') || pos.includes('KMP COMMANDER') || name.includes('COMMANDER KMP')) {
    if (pos.includes('DEPUTY') || pos.includes('D/COMDR') || pos.includes('D/COMMANDER')) {
      return 1; 
    }
    return 0; 
  }
  
  if (pos.includes('ADMIN OFFICER') || pos.includes('ADMINISTRATIVE OFFICER')) return 2;
  if (pos === 'RPC' || rank === 'RPC') return 3;
  if (pos === 'D/RPC' || pos === 'DEPUTY RPC' || rank === 'D/RPC') return 4;
  if (pos.startsWith('R/')) return 5; 
  if (pos === 'OC' || pos.startsWith('OC ') || pos.includes('I/C') || pos.includes('IN CHARGE')) return 6;
  
  return 99; 
};

const getRankWeight = (rank) => {
  if (!rank) return 99;
  let r = cleanStr(rank);

  if (r === 'DC' || r.startsWith('D/C')) {
    r = 'PC';
  } else if (r.startsWith('D/') || r.startsWith('D-') || r.startsWith('D ')) {
    r = r.replace(/^D[\/\- ]/, '').trim();
    if (r === 'C') r = 'PC';
  }

  if (r.includes('/DRV') || r.includes('-DRV') || r.includes(' DRV') || r === 'DRV' || r.includes('C/DRV')) {
    if (r === 'C/DRV' || r === 'DRV') {
      r = 'PC';
    } else {
      r = r.replace(/\/DRV|-DRV| DRV|DRV/g, '').trim();
    }
  }

  if (!r) r = 'PC';

  let baseWeight = 50;
  if (r === 'IGP') baseWeight = 1;
  else if (r === 'DIGP') baseWeight = 2;
  else if (r === 'AIGP') baseWeight = 3;
  else if (r === 'SCP') baseWeight = 4;
  else if (r === 'CP') baseWeight = 5;
  else if (r === 'ACP') baseWeight = 6;
  else if (r === 'SSP') baseWeight = 7;
  else if (r === 'SP') baseWeight = 8;
  else if (r === 'SASP') baseWeight = 9;
  else if (r === 'ASP') baseWeight = 10;
  else if (r === 'IP') baseWeight = 11;
  else if (r === 'AIP') baseWeight = 12;
  else if (r === 'HCM') baseWeight = 13;
  else if (r === 'HC') baseWeight = 14;
  else if (r === 'S/SGT' || r === 'SSGT') baseWeight = 15;
  else if (r === 'SGT') baseWeight = 16;
  else if (r === 'CPL') baseWeight = 17;
  else if (r === 'L/CPL' || r === 'LCPL') baseWeight = 18;
  else if (r === 'PC' || r === 'CONSTABLE') baseWeight = 19;
  else if (r === 'PPC') baseWeight = 20;
  else if (r === 'SPC') baseWeight = 21;
  else if (r === 'CIVILIAN') baseWeight = 98;

  return baseWeight;
};

const parseEducationLevel = (educ) => {
  if (!educ) return 'UNKNOWN';
  const e = cleanStr(educ);
  
  if (e.includes('DEGREE') || e.includes('BACHELOR') || e.includes('MASTER') || e.includes('PHD')) return 'DEGREE / POSTGRAD';
  if (e.includes('DIPLOMA')) return 'DIPLOMA';
  if (e.includes('CERT')) return 'CERTIFICATE';
  if (e.includes('UACE') || e.includes('S.6') || e.includes('SENIOR 6')) return 'UACE (A-LEVEL)';
  if (e.includes('UCE') || e.includes('S.4') || e.includes('SENIOR 4')) return 'UCE (O-LEVEL)';
  
  return 'OTHER / UNRECORDED';
};

const MetricCard = ({ title, value, colorClass }) => (
  <div className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-sm flex flex-col items-center justify-center text-center">
    <h4 className="text-[9px] font-extrabold mb-1 uppercase tracking-wider text-slate-500">{title}</h4>
    <div className={`text-base font-black leading-none ${colorClass}`}>{value}</div>
  </div>
);

const ExpandableTableCard = ({ title, children, onToggle }) => {
  const [expanded, setExpanded] = useState(false);

  const handleToggle = () => {
    const nextState = !expanded;
    setExpanded(nextState);
    if (onToggle) onToggle(nextState);
  };

  return (
    <div className={`bg-white shadow-2xl border border-slate-200 overflow-hidden flex flex-col transition-all duration-300 ${
      expanded ? 'fixed inset-0 z-[99999] rounded-none h-screen w-screen m-0 p-0 bg-white' : 'rounded-xl w-full'
    }`}>
      <div className="bg-slate-900 px-4 py-3 flex justify-between items-center shrink-0">
        <h3 className="font-extrabold text-white text-xs sm:text-sm uppercase tracking-wider flex items-center">
          {title} {expanded && <span className="ml-2 text-[10px] bg-blue-600 px-2 py-0.5 rounded text-white font-mono">FULL SCREEN VIEW</span>}
        </h3>
        <button 
          type="button"
          onClick={handleToggle} 
          className="text-xs text-blue-400 hover:text-white font-bold transition flex items-center bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg border border-slate-700 shadow-inner cursor-pointer"
        >
          {expanded ? 'Collapse ↙' : 'Expand ↗'}
        </button>
      </div>
      <div className="w-full bg-white overflow-hidden flex-1 flex flex-col">
        {typeof children === 'function' ? children(expanded) : children}
      </div>
    </div>
  );
};

const Nominal_Roll = ({ currentUser, canViewGlobal: propCanViewGlobal, Nominal_Rolls, setNominal_Rolls, Nominal_Roll_archives, setNominal_Roll_archives, setSidebarOpen }) => {
  const [operation, setOperation] = useState('new');
  const [notification, setNotification] = useState(null);
  const [selectedOfficer, setSelectedOfficer] = useState(null);
  const [updateSearch, setUpdateSearch] = useState(''); 
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState('audit'); 
  
  const userRoleClean = cleanStr(currentUser?.role);
  const userPosClean = cleanStr(currentUser?.position);
  const userRegClean = cleanStr(currentUser?.region);

  // 🟢 Enhanced Scope Resolutions
  const isGlobalTier = ['SUPER_ADMIN', 'ADMIN', 'ASSISTANT_SUPER_ADMIN'].includes(userRoleClean) || 
    ['KMP COMMANDER', 'DEPUTY KMP COMMANDER', 'KMP ADMIN OFFICER'].includes(userPosClean) || 
    currentUser?.permissions?.view_global_roster === true;

  const isKmpSystemManager = userRoleClean === 'SYSTEM_MANAGER' && ['KMP HEADQUARTERS', 'POLICE HEADQUARTERS'].includes(userRegClean) && userPosClean.includes('KMP');
  const isKmpSpecialist = userRoleClean === 'ASSISTANT_SYSTEM_MANAGER' && ['KMP HEADQUARTERS', 'POLICE HEADQUARTERS'].includes(userRegClean) && userPosClean.includes('KMP');

  const canViewGlobalLevel = propCanViewGlobal !== undefined ? propCanViewGlobal : (isGlobalTier || isKmpSystemManager || isKmpSpecialist);
  const isRegionalCommand = ['RPC', 'DEPUTY_RPC', 'SYSTEM_MANAGER', 'ASSISTANT_SYSTEM_MANAGER', 'REGIONAL_ADMIN', 'ASSISTANT_REGIONAL_ADMIN'].includes(userRoleClean) && !canViewGlobalLevel;

  const canEditRecords = isGlobalTier || isKmpSystemManager || isRegionalCommand || currentUser?.permissions?.upload_hr === true;
  
  const [filterRegion, setFilterRegion] = useState(canViewGlobalLevel ? 'ALL REGIONS' : userRegClean);
  const [filterStation, setFilterStation] = useState((canViewGlobalLevel || isRegionalCommand) ? 'ALL STATIONS' : cleanStr(currentUser?.station));

  const [targetRegion, setTargetRegion] = useState(canViewGlobalLevel ? 'ALL REGIONS' : userRegClean);
  const [targetStation, setTargetStation] = useState('ALL STATIONS');

  useEffect(() => {
    if (canViewGlobalLevel) {
      setFilterRegion('ALL REGIONS');
      setFilterStation('ALL STATIONS');
      setTargetRegion('ALL REGIONS');
    } else if (isRegionalCommand) {
      setFilterRegion(userRegClean);
      setFilterStation('ALL STATIONS');
      setTargetRegion(userRegClean);
    }
  }, [canViewGlobalLevel, isRegionalCommand, userRegClean]);

  const [searchTerm, setSearchTerm] = useState('');
  const [bulkSelectMode, setBulkSelectMode] = useState(false);
  const [selectedOfficers, setSelectedOfficers] = useState([]);
  const [bulkArchiveReason, setBulkArchiveReason] = useState('TRANSFERRED');
  const [bulkArchiveDetail, setBulkArchiveDetail] = useState('');
  const [bulkCorrRef, setBulkCorrRef] = useState('');
  const [isBulkArchiving, setIsBulkArchiving] = useState(false);

  const [isArchivedReturnee, setIsArchivedReturnee] = useState(false);
  const [archiveDetails, setArchiveDetails] = useState(null);
  const [customReason, setCustomReason] = useState('');
  const [previousFnum, setPreviousFnum] = useState('');

  const [viewMode, setViewMode] = useState('active'); 
  const [showAnalytics, setShowAnalytics] = useState(false); 
   
  const [metricCategory, setMetricCategory] = useState('RANK');  
  const [archiveReason, setArchiveReason] = useState('TRANSFERRED');
  const [archiveDetail, setArchiveDetail] = useState('');
  const [corrRef, setCorrRef] = useState('');
  
  const [formData, setFormData] = useState({
    sn: null, fnum: '', rank: '', name: '', sex: 'MALE', position: '',
    dob: '', doe: '', dopost: '', dopro: '', contact: '', educlevel: '',
    ipps: '', tin: '', nin: '', homedist: '', tribe: '', accno: '', bankbranch: '',
    station: currentUser?.station || REGIONAL_HIERARCHY[currentUser?.region]?.[0] || '', 
    district: '', region: currentUser?.region, section: '', dir: '', status: 'ACTIVE'
  });

  const availableStationsList = useMemo(() => {
    const list = new Set();
    (Array.isArray(Nominal_Rolls) ? Nominal_Rolls : []).forEach(n => {
      if (n.station) {
        const cleaned = cleanStr(n.station);
        if (cleaned) list.add(cleaned);
      }
    });
    if (list.size === 0) {
      Object.values(REGIONAL_HIERARCHY).forEach(arr => arr.forEach(stn => list.add(stn)));
    }
    return Array.from(list).sort();
  }, [Nominal_Rolls]);

  const populateUpdateForm = (data) => setFormData({ ...data, fnum: data.fnum || data.f_num || '' });

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    if (name === 'region') {
      setFormData({ ...formData, region: value, station: REGIONAL_HIERARCHY[value]?.[0] || '' });
    } else {
      setFormData({ ...formData, [name]: value });
    }
  };

  const handleOperationToggle = (mode) => {
    setOperation(mode);
    if (mode === 'new') {
      setFormData({
        sn: null, fnum: '', rank: '', name: '', sex: 'MALE', position: '',
        dob: '', doe: '', dopost: '', dopro: '', contact: '', educlevel: '',
        ipps: '', tin: '', nin: '', homedist: '', tribe: '', accno: '', bankbranch: '',
        station: currentUser?.station || REGIONAL_HIERARCHY[currentUser?.region]?.[0] || '', 
        district: '', region: currentUser?.region, section: '', dir: '', status: 'ACTIVE'
      });
      setUpdateSearch('');
      setIsArchivedReturnee(false);
      setArchiveDetails(null);
      setCustomReason('');
      setPreviousFnum('');
    }
  };

  const handleExecuteExportModal = async () => {
    try {
      const endpoint = modalMode === 'audit' 
        ? `/api/v1/nominal-roll/export-missing-audit?region=${encodeURIComponent(targetRegion)}&station=${encodeURIComponent(targetStation)}`
        : `/api/v1/nominal-roll/export-station-ledger?region=${encodeURIComponent(targetRegion)}&station=${encodeURIComponent(targetStation)}`;

      const response = await authFetch(endpoint, { method: 'GET' });
      if (!response.ok) throw new Error("Export generation failed.");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = modalMode === 'audit' 
        ? `Missing_Info_Audit_${targetStation.replace(/\s+/g, '_')}.zip` 
        : `Station_Nominal_Roll_${targetStation.replace(/\s+/g, '_')}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      setShowModal(false);
    } catch (err) {
      alert(`Export Error: ${err.message}`);
    }
  };

  const handleArchivePersonnel = async () => {
    if (!canEditRecords) return alert("Security Restriction: You do not have clearance to archive personnel.");
     
    let rawFnum = formData.fnum || formData.f_num || '';
    const cleanTargetFnum = rawFnum.toString().split('/ARCHIVE')[0].trim();
     
    if (!cleanTargetFnum) {
      return alert("Missing Force Number. Cannot archive this record.");
    }
     
    let finalArchiveReason = archiveDetail.trim() ? `${archiveReason}: ${archiveDetail.trim()}` : archiveReason;
    if (corrRef.trim()) {
      finalArchiveReason += ` [Ref: ${corrRef.trim()}]`;
    }

    if (!window.confirm(`Are you sure you want to move ${formData.name} (${cleanTargetFnum}) to archives?`)) {
      return;
    }

    try {
      setNotification("Moving record to archive...");
       
      const response = await authFetch(`/api/v1/nominal-roll/archive-record`, {
        method: "PUT", 
        headers: { "Content-Type": "application/json" }, 
        body: JSON.stringify({ 
          fnum: cleanTargetFnum,
          archive_reason: finalArchiveReason 
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || "Database failed to locate the record.");
      }

      const archivedRecord = {
          sn: formData.sn, f_num: cleanTargetFnum, rank: formData.rank, name: formData.name, sex: formData.sex, position: formData.position,
          dob: formData.dob, doe: formData.doe, do_post: formData.dopost, do_pro: formData.dopro, contact: formData.contact, educ_level: formData.educlevel,         
          ipps: formData.ipps, tin: formData.tin, nin: formData.nin, home_dist: formData.homedist, tribe: formData.tribe, acc_no: formData.accno,         
          bank_branch: formData.bankbranch, station: formData.station, district: formData.district, region: formData.region, section: formData.section,
          dir: formData.dir, status: "ARCHIVED", last_updated_by: `${currentUser.name} (${currentUser.fnum})`, archive_reason: finalArchiveReason,
          archive_date: new Date().toISOString().split('T')[0]
      };
       
      setNominal_Roll_archives([archivedRecord, ...(Array.isArray(Nominal_Roll_archives) ? Nominal_Roll_archives : [])]);
      setNominal_Rolls((Array.isArray(Nominal_Rolls) ? Nominal_Rolls : []).filter(n => (n.fnum || n.f_num) !== cleanTargetFnum));
      setNotification(`Officer ${formData.name} archived successfully.`);
      setArchiveDetail('');
      setCorrRef('');
      handleOperationToggle('new');
    } catch (error) { 
      setNotification("Error: Could not move to archive."); 
      alert(`Error archiving record: ${error.message}`); 
    }
  };

  const handleBulkArchive = async () => {
    if (!canEditRecords) return alert("Security Restriction: You do not have clearance to archive personnel.");
    if (selectedOfficers.length === 0) return;

    let finalBulkReason = bulkArchiveDetail.trim() ? `${bulkArchiveReason}: ${bulkArchiveDetail.trim()}` : bulkArchiveReason;
    if (bulkCorrRef.trim()) {
      finalBulkReason += ` [Ref: ${bulkCorrRef.trim()}]`;
    }

    if (!window.confirm(`Are you sure you want to archive ${selectedOfficers.length} officers with reason: ${finalBulkReason}?`)) return;

    setIsBulkArchiving(true);
    setNotification(`Archiving ${selectedOfficers.length} officers. Please wait...`);
     
    try {
      const response = await authFetch(`/api/v1/nominal-roll/bulk-archive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fnums: selectedOfficers,
          archive_reason: finalBulkReason
        })
      });
       
      const resData = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(resData.detail || "Bulk archive request failed.");

      const archivedFnumsSet = new Set(selectedOfficers);
      const newlyArchivedRows = (Array.isArray(Nominal_Rolls) ? Nominal_Rolls : []).filter(n => archivedFnumsSet.has(n.f_num || n.fnum)).map(n => ({
        ...n,
        status: "ARCHIVED",
        archive_reason: finalBulkReason,
        archive_date: new Date().toISOString().split('T')[0],
        last_updated_by: `${currentUser.name} (${currentUser.fnum})`
      }));

      setNominal_Roll_archives(prev => [...newlyArchivedRows, ...(Array.isArray(prev) ? prev : [])]);
      setNominal_Rolls(prev => (Array.isArray(prev) ? prev : []).filter(n => !archivedFnumsSet.has(n.f_num || n.fnum)));

      setNotification(`✅ Bulk Archive Complete: ${resData.success_count} succeeded, ${resData.fail_count} failed.`);
      setSelectedOfficers([]);
      setBulkArchiveDetail('');
      setBulkCorrRef('');
      setBulkSelectMode(false);
    } catch (err) { 
      setNotification(`❌ Bulk Archive Error: ${err.message}`);
    } finally { 
      setIsBulkArchiving(false);
      setTimeout(() => setNotification(null), 5000);
    }
  };

  const handleFormSubmit = async (e) => { 
    e.preventDefault();
    if (!canEditRecords) return alert("Security Restriction: You do not have clearance to modify the Nominal Roll.");

    const currentRolls = Array.isArray(Nominal_Rolls) ? Nominal_Rolls : [];
     
    if (formData.nin) {
        const cleanNin = formData.nin.toUpperCase().trim();
        if (!/^C[MF][A-Z0-9]{12}$/.test(cleanNin)) return setNotification("⚠️ Error: National ID must start with CM or CF, be exactly 14 characters.");
        formData.nin = cleanNin; 
    }

    if (operation === 'new') {
      const exactNextSN = currentRolls.length > 0 ? Math.max(...currentRolls.map(n => n.sn || 0)) + 1 : 1;
       
      const newEntryPayload = { 
        ...formData, 
        sn: exactNextSN, 
        last_updated_by: `${currentUser.name} (${currentUser.fnum})`,
        ...(isArchivedReturnee && { reintegration_reason: customReason, previous_fnum: previousFnum || formData.fnum })
      };
       
      try {
        const response = await authFetch(`/api/v1/nominal-roll`, {
          method: "POST", 
          headers: { "Content-Type": "application/json" }, 
          body: JSON.stringify(newEntryPayload)
        });
         
        const responseData = await response.json().catch(() => ({}));

        if (!response.ok) {
            if (response.status === 409 && responseData.is_archived_returnee) {
                setIsArchivedReturnee(true);
                setArchiveDetails(responseData);
                setNotification("⚠️ Officer history found in archive. Please authorize re-entry below.");
                return;
            }
            throw new Error(responseData.detail || "Database rejected the entry.");
        }
         
        setNominal_Rolls([newEntryPayload, ...currentRolls]); 
        setNotification(`Officer ${formData.name} recorded successfully!`); 
        handleOperationToggle('new');
      } catch (err) { setNotification(`Error: ${err.message}`); }
       
    } else if (operation === 'update') {
      const updatedRecord = { ...formData, last_updated_by: `${currentUser.name} (${currentUser.fnum})` };
      try {
          const targetIdentifier = String(formData.fnum || formData.f_num || formData.sn).trim();
          const response = await authFetch(`/api/v1/nominal-roll/${encodeURIComponent(targetIdentifier)}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(updatedRecord) 
          });
          if (!response.ok) throw new Error("Failed to update record.");
          setNominal_Rolls(currentRolls.map(n => (n.sn === formData.sn || n.fnum === formData.fnum || n.f_num === formData.fnum) ? updatedRecord : n));
          setNotification(`Officer ${formData.name} successfully updated!`);
      } catch (err) { setNotification("Error: Could not update the record."); }
    }
  };

  const filteredRolls = useMemo(() => {
    return (Array.isArray(Nominal_Rolls) ? Nominal_Rolls : []).filter(n => {
      const statusStr = cleanStr(n.status);
      if (statusStr === 'ARCHIVED' || n.is_archived === true) return false;

      const stn = cleanStr(n.station);
      const reg = getOfficialRegionForStation(stn, cleanStr(n.region));

      const selRegion = cleanStr(filterRegion);
      const selStation = cleanStr(filterStation);

      if (selRegion && selRegion !== 'ALL REGIONS' && reg !== selRegion) return false;
      if (selStation && selStation !== 'ALL STATIONS') {
        if (!isStationEquivalent(stn, selStation)) return false;
      }

      if (searchTerm.trim()) {
        const query = searchTerm.trim().toLowerCase();
        const fnum = cleanStr(n.f_num || n.fnum).toLowerCase();
        const name = cleanStr(n.name).toLowerCase();
        const rank = cleanStr(n.rank).toLowerCase();
        const ipps = cleanStr(n.ipps).toLowerCase();
        const station = cleanStr(n.station).toLowerCase();
        const nin = cleanStr(n.nin).toLowerCase();
        
        if (!fnum.includes(query) && !name.includes(query) && !rank.includes(query) && !ipps.includes(query) && !station.includes(query) && !nin.includes(query)) {
          return false;
        }
      }
      return true;
    }).sort((a, b) => {
      const prioA = getStationPriorityWeight(a.station, a.region);
      const prioB = getStationPriorityWeight(b.station, b.region);
      if (prioA !== prioB) return prioA - prioB;

      const cmdA = getCommandWeight(a);
      const cmdB = getCommandWeight(b);
      if (cmdA !== cmdB) return cmdA - cmdB;

      const weightA = getRankWeight(a.rank);
      const weightB = getRankWeight(b.rank);
      if (weightA !== weightB) return weightA - weightB;

      return cleanStr(a.f_num || a.fnum).localeCompare(cleanStr(b.f_num || b.fnum), undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [Nominal_Rolls, filterRegion, filterStation, searchTerm]);

  const filteredNominal_Roll_archives = useMemo(() => {
    if (!Array.isArray(Nominal_Roll_archives)) return [];

    return Nominal_Roll_archives.filter(n => {
      const stn = cleanStr(n.station);
      const reg = getOfficialRegionForStation(stn, cleanStr(n.region));

      const selRegion = cleanStr(filterRegion);
      const selStation = cleanStr(filterStation);

      if (selRegion && selRegion !== 'ALL REGIONS' && reg !== selRegion) return false;
      if (selStation && selStation !== 'ALL STATIONS') {
        if (!isStationEquivalent(stn, selStation)) return false;
      }

      if (searchTerm.trim()) {
        const query = searchTerm.trim().toLowerCase();
        const fnum = cleanStr(n.f_num || n.fnum).toLowerCase();
        const name = cleanStr(n.name).toLowerCase();
        const rank = cleanStr(n.rank).toLowerCase();
        const ipps = cleanStr(n.ipps).toLowerCase();
        const station = cleanStr(n.station).toLowerCase();
        const nin = cleanStr(n.nin).toLowerCase();
        const reason = cleanStr(n.archive_reason).toLowerCase();
        
        if (!fnum.includes(query) && !name.includes(query) && !rank.includes(query) && !ipps.includes(query) && !station.includes(query) && !nin.includes(query) && !reason.includes(query)) {
          return false;
        }
      }
      return true;
    }).sort((a, b) => {
      const prioA = getStationPriorityWeight(a.station, a.region);
      const prioB = getStationPriorityWeight(b.station, b.region);
      if (prioA !== prioB) return prioA - prioB;

      const cmdA = getCommandWeight(a);
      const cmdB = getCommandWeight(b);
      if (cmdA !== cmdB) return cmdA - cmdB;

      const weightA = getRankWeight(a.rank);
      const weightB = getRankWeight(b.rank);
      if (weightA !== weightB) return weightA - weightB;

      return cleanStr(a.f_num || a.fnum).localeCompare(cleanStr(b.f_num || b.fnum), undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [Nominal_Roll_archives, filterRegion, filterStation, searchTerm]);

  const currentRollDataset = useMemo(() => {
    return viewMode === 'archive' ? filteredNominal_Roll_archives : filteredRolls;
  }, [viewMode, filteredRolls, filteredNominal_Roll_archives]);

  const availableUpdateRolls = useMemo(() => {
    return (Array.isArray(Nominal_Rolls) ? Nominal_Rolls : []).filter(n => {
      const fNumVal = cleanStr(n.fnum || n.f_num);
      if (!isGlobalTier && !canViewGlobalLevel && cleanStr(n.region) !== userRegClean) return false;
      if (updateSearch) {
        const query = updateSearch.toLowerCase();
        return fNumVal.toLowerCase().includes(query) || 
               cleanStr(n.name).toLowerCase().includes(query) || 
               cleanStr(n.ipps).toLowerCase().includes(query);
      }
      return true;
    });
  }, [Nominal_Rolls, userRegClean, updateSearch, isGlobalTier, canViewGlobalLevel]);

  const calculatedMetrics = useMemo(() => {
      const grouped = {};
       
      currentRollDataset.forEach(n => {
          let key = 'Unknown';
          const sexStr = cleanStr(n.sex);
          const ninStr = cleanStr(n.nin);
          const isFemale = sexStr === 'F' || sexStr === 'FEMALE' || ninStr.startsWith('CF');
          const isMale = sexStr === 'M' || sexStr === 'MALE' || ninStr.startsWith('CM');
           
          const homeDistrict = cleanStr(n.homedist || n.home_dist || n.district || n.home_district);
          const bankBranch = cleanStr(n.bankbranch || n.bank_branch || n.bank || n.bank_name);
          const educLevel = cleanStr(n.educlevel || n.educ_level || n.education);
           
          const stationStr = cleanStr(n.station) || 'UNKNOWN';
          const sectionStr = cleanStr(n.section);

          if (metricCategory === 'RANK') {
              let r = cleanStr(n.rank);
              if (r === 'DC' || r.startsWith('D/C')) r = 'PC';
              else if (r.startsWith('D/') || r.startsWith('D-') || r.startsWith('D ')) {
                  r = r.replace(/^D[\/\- ]/, '').trim();
                  if (r === 'C') r = 'PC';
              }
              key = r || 'UNRANKED';
          }
          else if (metricCategory === 'UNIT') key = `${stationStr} ${sectionStr ? '- ' + sectionStr : ''}`.trim();
          else if (metricCategory === 'SEX') key = isFemale ? 'FEMALE' : (isMale ? 'MALE' : 'UNSPECIFIED');
          else if (metricCategory === 'BANK') key = bankBranch || 'BANK UNKNOWN';
          else if (metricCategory === 'DISTRICT') key = homeDistrict || 'DISTRICT UNKNOWN';
          else if (metricCategory === 'TRIBE') key = cleanStr(n.tribe) || 'TRIBE UNKNOWN';
          else if (metricCategory === 'EDUCATION') key = parseEducationLevel(educLevel);
          else if (metricCategory === 'AGE') {
              if (n.dob) {
                  const birthYear = new Date(n.dob).getFullYear();
                  if (!isNaN(birthYear)) {
                      const age = new Date().getFullYear() - birthYear;
                      key = age < 30 ? '18-29 Years' : age < 40 ? '30-39 Years' : age < 50 ? '40-49 Years' : '50+ Years';
                  } else key = 'Age Not Recorded';
              } else key = 'Age Not Recorded'; 
          }
           
          if (!grouped[key]) grouped[key] = { category: key, total: 0, male: 0, female: 0, unknown: 0 };
          grouped[key].total += 1;
          if (isFemale) grouped[key].female += 1;
          else if (isMale) grouped[key].male += 1;
          else grouped[key].unknown += 1;
      });

      const resultsArray = Object.values(grouped);

      if (metricCategory === 'RANK') {
          return resultsArray.sort((a, b) => {
             const weightA = getRankWeight(a.category);
             const weightB = getRankWeight(b.category);
             return weightA - weightB;
          });
      } else {
          return resultsArray.sort((a, b) => b.total - a.total);
      }
  }, [currentRollDataset, metricCategory]);

  const metricsData = useMemo(() => {
    let maleCount = 0;
    let femaleCount = 0;
    const uniqueStations = {};

    currentRollDataset.forEach(n => {
      const sexStr = cleanStr(n.sex);
      const ninStr = cleanStr(n.nin);
       
      if (sexStr === 'F' || sexStr === 'FEMALE' || ninStr.startsWith('CF')) {
        femaleCount++;
      } else if (sexStr === 'M' || sexStr === 'MALE' || ninStr.startsWith('CM')) {
        maleCount++;
      }

      if (n.station) {
        const cleanStation = cleanStr(n.station);
        if (cleanStation) uniqueStations[cleanStation] = true;
      }
    });

    return {
      total: currentRollDataset.length,
      male: maleCount,
      female: femaleCount,
      unassigned: currentRollDataset.length - (maleCount + femaleCount),
      stations: Object.keys(uniqueStations).length
    };
  }, [currentRollDataset]);

  return (
    <div className="p-3 sm:p-6 max-w-[1600px] mx-auto space-y-5 relative z-10 pb-20">
      <div className="text-center mb-4 flex flex-col items-center">
        <img src="/upf_badge.png" alt="UPF Logo" className="w-14 h-14 mb-2 object-contain contrast-200 brightness-75 drop-shadow-sm" onError={(e) => { e.target.style.display = 'none'; }} />
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-800 tracking-tight">Master Nominal Roll</h1>
        <h3 className="text-xs sm:text-sm text-blue-700 mt-0.5 font-semibold uppercase tracking-wider">Man-Power Auditing & Deployment Registry</h3>
      </div>
       
      <div className="bg-white/90 backdrop-blur p-3.5 rounded-xl border border-slate-200 shadow-sm relative">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-3 gap-2">
          <h4 className="text-xs font-extrabold text-slate-500 uppercase tracking-wider flex items-center">
            <BarChart3 className="w-4 h-4 mr-1.5 text-blue-600 shrink-0"/> 
            Personnel Metrics Dashboard ({viewMode === 'archive' ? 'Archived Records' : 'Active Roll'})
          </h4>
          <div className="flex items-center gap-2">
            {canEditRecords && viewMode === 'active' && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => { setModalMode('audit'); setShowModal(true); }}
                  className="bg-amber-600 hover:bg-amber-700 text-white px-3 py-1 text-xs font-bold rounded-md shadow transition-all cursor-pointer flex items-center"
                >
                  <Download className="w-3.5 h-3.5 mr-1" /> Audit Missing Info
                </button>
                <button
                  type="button"
                  onClick={() => { setModalMode('station_list'); setShowModal(true); }}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 text-xs font-bold rounded-md shadow transition-all cursor-pointer flex items-center"
                >
                  <Download className="w-3.5 h-3.5 mr-1" /> Station Nominal List
                </button>
              </div>
            )}
            <div className="inline-flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 shadow-inner shrink-0">
               <button 
                type="button"
                onClick={() => { setViewMode('active'); setShowAnalytics(false); setBulkSelectMode(false); }} 
                className={`px-3 py-1 text-xs font-bold rounded-md transition-all cursor-pointer ${viewMode === 'active' && !showAnalytics ? 'bg-slate-900 text-white shadow' : 'text-slate-600 hover:text-slate-900'}`}
               >
                 Active Roll
               </button>
               <button 
                type="button"
                onClick={() => { setViewMode('archive'); setShowAnalytics(false); setBulkSelectMode(false); }} 
                className={`px-3 py-1 text-xs font-bold rounded-md transition-all cursor-pointer ${viewMode === 'archive' && !showAnalytics ? 'bg-red-700 text-white shadow' : 'text-slate-600 hover:text-slate-900'}`}
               >
                 Archived
               </button>
               <button 
                type="button"
                onClick={() => setShowAnalytics(!showAnalytics)} 
                className={`px-3 py-1 text-xs font-bold rounded-md transition-all cursor-pointer ${showAnalytics ? 'bg-indigo-700 text-white shadow' : 'text-slate-600 hover:text-slate-900'}`}
               >
                  {showAnalytics ? 'Close Analytics' : 'Analytics Breakdown'}
               </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
           <MetricCard title="Total Personnel" value={metricsData.total} colorClass={viewMode === 'archive' ? "text-red-700" : "text-blue-700"} />
           <MetricCard title="Male Officers" value={metricsData.male} colorClass="text-indigo-600" />
           <MetricCard title="Female Officers" value={metricsData.female} colorClass="text-pink-600" />
           <MetricCard title="Unassigned Sex" value={metricsData.unassigned} colorClass="text-slate-400" />
           <MetricCard title="Stations" value={metricsData.stations} colorClass="text-emerald-600" />
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-[999999] bg-black/50 backdrop-blur-xs flex items-center justify-center p-3 animate-in fade-in">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-md p-5 space-y-4">
            <div className="flex justify-between items-center border-b pb-2">
              <h3 className="text-sm font-extrabold text-slate-800 uppercase flex items-center">
                <Filter className="w-4 h-4 mr-1.5 text-blue-600" /> 
                {modalMode === 'audit' ? 'Scoped Missing Info Audit' : 'Station & Post Nominal List Export'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X size={16} />
              </button>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              {modalMode === 'audit' 
                ? 'Generate an Excel audit report identifying missing personnel information for a specific station or post.' 
                : 'Download a complete, perfectly formatted nominal list for any selected station, division, or police post (e.g., BUGOLOBI).'}
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Target Region</label>
                <select 
                  value={targetRegion} 
                  onChange={(e) => { setTargetRegion(e.target.value); setTargetStation('ALL STATIONS'); }}
                  disabled={!canViewGlobalLevel}
                  className="w-full text-xs border rounded p-2 bg-white font-bold text-slate-800 outline-none disabled:bg-gray-100 disabled:text-gray-500"
                >
                  {canViewGlobalLevel ? (
                    <><option value="ALL REGIONS">ALL REGIONS</option>{Object.keys(REGIONAL_HIERARCHY).map(reg => <option key={reg} value={reg}>{reg}</option>)}</>
                  ) : <option value={userRegClean}>{userRegClean}</option>}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Target Station, Division or Post</label>
                <select 
                  value={targetStation} 
                  onChange={(e) => setTargetStation(e.target.value)}
                  disabled={!(canViewGlobalLevel || isRegionalCommand)}
                  className="w-full text-xs border rounded p-2 bg-white font-bold text-slate-800 outline-none disabled:bg-gray-100 disabled:text-gray-500"
                >
                  {(canViewGlobalLevel || isRegionalCommand) ? (
                    <>
                      <option value="ALL STATIONS">ALL STATIONS (Full Region / Global)</option>
                      {availableStationsList.map(stn => <option key={stn} value={stn}>{stn}</option>)}
                    </>
                  ) : <option value={currentUser?.station}>{cleanStr(currentUser?.station)}</option>}
                </select>
              </div>
            </div>
            <div className="flex space-x-2 pt-2">
              <button 
                type="button" 
                onClick={() => setShowModal(false)} 
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-2 rounded text-xs font-bold transition cursor-pointer"
              >
                Cancel
              </button>
              <button 
                type="button" 
                onClick={handleExecuteExportModal} 
                className="flex-1 bg-blue-700 hover:bg-blue-800 text-white py-2 rounded text-xs font-bold shadow transition cursor-pointer flex items-center justify-center"
              >
                <Download className="w-3.5 h-3.5 mr-1" /> Download Excel File
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 space-y-4">
          {canEditRecords && (
            <div className="space-y-4">
              <div className="bg-white p-3.5 rounded-xl shadow-sm border border-slate-200 space-y-2.5 overflow-visible">
                <div className="border-b border-slate-100 pb-1.5 flex justify-between items-center">
                  <h4 className="font-extrabold text-slate-800 text-xs uppercase tracking-wider flex items-center">
                    <Upload className="w-3.5 h-3.5 mr-1.5 text-blue-600 shrink-0" /> Batch Excel / Multi-File Import
                  </h4>
                  <span className="text-[10px] text-amber-600 bg-amber-50 px-2 py-0.5 rounded font-bold border border-amber-200">
                    ⚠️ Ensure valid date formats (YYYY-MM-DD or DD-MM-YYYY)
                  </span>
                </div>
                 
                <div className="relative group inline-block w-full">
                  <div className="w-full">
                    <BulkNominalRollUpload multiple onUploadSuccess={() => window.location.reload()} />
                  </div>

                  <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 hidden group-hover:block z-50 bg-slate-900 text-white p-4 rounded-xl shadow-2xl border border-slate-700 animate-in fade-in zoom-in-95 duration-150 pointer-events-none w-[460px] sm:w-[520px]">
                    <p className="text-xs font-extrabold text-blue-400 uppercase tracking-wider mb-2 border-b border-slate-800 pb-1.5 flex items-center justify-between">
                      <span>📋 Ensure your column headers match these exactly:</span>
                    </p>
                    <div className="flex flex-wrap gap-1.5 text-xs font-mono">
                      <span className="bg-slate-800 px-2 py-1 rounded text-slate-100 border border-slate-700 font-bold">sn</span>
                      <span className="bg-slate-800 px-2 py-1 rounded text-slate-100 border border-slate-700 font-bold">f_num</span>
                      <span className="bg-slate-800 px-2 py-1 rounded text-slate-100 border border-slate-700 font-bold">rank</span>
                      <span className="bg-slate-800 px-2 py-1 rounded text-slate-100 border border-slate-700 font-bold">name</span>
                      <span className="bg-slate-800 px-2 py-1 rounded text-slate-100 border border-slate-700 font-bold">sex</span>
                      <span className="bg-slate-800 px-2 py-1 rounded text-slate-100 border border-slate-700 font-bold">position</span>
                      <span className="bg-slate-800 px-2 py-1 rounded text-slate-100 border border-slate-700 font-bold">dob</span>
                      <span className="bg-slate-800 px-2 py-1 rounded text-slate-100 border border-slate-700 font-bold">doe</span>
                      <span className="bg-slate-800 px-2 py-1 rounded text-slate-100 border border-slate-700 font-bold">do_post</span>
                      <span className="bg-slate-800 px-2 py-1 rounded text-slate-100 border border-slate-700 font-bold">do_pro</span>
                      <span className="bg-slate-800 px-2 py-1 rounded text-slate-100 border border-slate-700 font-bold">contact</span>
                      <span className="bg-slate-800 px-2 py-1 rounded text-slate-100 border border-slate-700 font-bold">educ_level</span>
                      <span className="bg-slate-800 px-2 py-1 rounded text-slate-100 border border-slate-700 font-bold">ipps</span>
                      <span className="bg-slate-800 px-2 py-1 rounded text-slate-100 border border-slate-700 font-bold">tin</span>
                      <span className="bg-slate-800 px-2 py-1 rounded text-slate-100 border border-slate-700 font-bold">nin</span>
                      <span className="bg-slate-800 px-2 py-1 rounded text-slate-100 border border-slate-700 font-bold">home_dist</span>
                      <span className="bg-slate-800 px-2 py-1 rounded text-slate-100 border border-slate-700 font-bold">tribe</span>
                      <span className="bg-slate-800 px-2 py-1 rounded text-slate-100 border border-slate-700 font-bold">acc_no</span>
                      <span className="bg-slate-800 px-2 py-1 rounded text-slate-100 border border-slate-700 font-bold">bank_branch</span>
                      <span className="bg-slate-800 px-2 py-1 rounded text-slate-100 border border-slate-700 font-bold">station</span>
                      <span className="bg-slate-800 px-2 py-1 rounded text-slate-100 border border-slate-700 font-bold">district</span>
                      <span className="bg-slate-800 px-2 py-1 rounded text-slate-100 border border-slate-700 font-bold">region</span>
                      <span className="bg-slate-800 px-2 py-1 rounded text-slate-100 border border-slate-700 font-bold">section</span>
                      <span className="bg-slate-800 px-2 py-1 rounded text-slate-100 border border-slate-700 font-bold">dir</span>
                      <span className="bg-slate-800 px-2 py-1 rounded text-slate-100 border border-slate-700 font-bold">status</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="bg-slate-900 px-4 py-2.5 border-b border-slate-800 flex justify-between items-center">
                  <h3 className="text-white text-xs font-bold uppercase tracking-wider flex items-center">
                    <Users className="w-3.5 h-3.5 mr-1.5 text-blue-400" /> ⚙️ Log Personnel
                  </h3>
                </div>
                <div className="p-3.5 space-y-3.5">
                  <div className="flex space-x-2 bg-gray-100 p-1 rounded-lg">
                    <button type="button" onClick={() => handleOperationToggle('new')} className={`flex-1 py-1.5 text-xs font-bold rounded transition-all cursor-pointer ${operation === 'new' ? 'bg-white shadow text-blue-700' : 'text-gray-600 hover:text-gray-900'}`}><PlusCircle className="w-3.5 h-3.5 inline mr-1" /> Register New</button>
                    <button type="button" onClick={() => handleOperationToggle('update')} className={`flex-1 py-1.5 text-xs font-bold rounded transition-all cursor-pointer ${operation === 'update' ? 'bg-white shadow text-blue-700' : 'text-gray-600 hover:text-gray-900'}`}><Edit className="w-3.5 h-3.5 inline mr-1" /> Update Existing</button>
                  </div>

                  {notification && <div className={`px-3 py-2 rounded-lg flex items-center text-xs ${notification.includes('Error') || notification.includes('❌') ? 'bg-red-50 border border-red-200 text-red-800' : 'bg-green-50 border border-green-200 text-green-800'}`}>{notification.includes('Error') || notification.includes('❌') ? <AlertTriangle className="w-4 h-4 mr-2 text-red-500 shrink-0" /> : <CheckCircle className="w-4 h-4 mr-2 text-green-500 shrink-0" />}<span className="font-medium">{notification}</span></div>}

                  {operation === 'update' && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5">
                      <label className="block text-[11px] font-bold text-blue-800 mb-1.5">🔍 Search & Select Officer to Update</label>
                      <input type="text" placeholder="Search by Force No, Name, IPPS..." value={updateSearch} onChange={e => setUpdateSearch(e.target.value)} className="w-full text-xs p-1.5 mb-1.5 border border-blue-200 rounded outline-none focus:ring-1 focus:ring-blue-400 bg-white text-slate-800" />
                      <div className="max-h-32 overflow-y-auto bg-white border border-blue-100 rounded custom-scrollbar">
                        {availableUpdateRolls.length === 0 ? <div className="p-2 text-[11px] text-gray-500 text-center">No personnel found.</div> : availableUpdateRolls.map(n => (
                            <div key={n.sn || n.fnum} onClick={() => populateUpdateForm(n)} className={`p-1.5 text-[11px] border-b cursor-pointer transition-colors ${formData.sn === n.sn ? 'bg-blue-600 text-white font-bold' : 'hover:bg-blue-50 text-gray-700'}`}>
                              <span className={formData.sn === n.sn ? 'text-blue-200' : 'text-gray-400'}>F/NO: {cleanStr(n.fnum || n.f_num)}</span> | <span className={formData.sn === n.sn ? 'text-white' : 'font-bold text-blue-700'}>{cleanStr(n.name)}</span>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                    
                  <form onSubmit={handleFormSubmit} className="space-y-3">
                    {operation === 'update' && (formData.sn || formData.fnum) && (
                      <div className="bg-red-50 p-3 rounded-lg border border-red-200 space-y-2 mb-3 shadow-xs">
                        <h4 className="text-[11px] font-bold text-red-700 uppercase border-b border-red-200 pb-1 flex items-center"><AlertTriangle size={12} className="mr-1.5"/> Archive / Remove</h4>
                        
                        <div className="space-y-2">
                            <div>
                                <label className="block text-[10px] font-bold text-red-800 mb-0.5">Removal Reason *</label>
                                <select value={archiveReason} onChange={(e) => setArchiveReason(e.target.value)} className="w-full text-xs border-red-300 rounded shadow-xs border py-1.5 px-2 font-bold text-red-700 outline-none focus:ring-1 focus:ring-red-400 bg-white">
                                    <option value="TRANSFERRED">Transferred</option>
                                    <option value="DEATH">Death</option>
                                    <option value="DISMISSAL">Dismissal</option>
                                    <option value="DESERTION">Desertion</option>
                                    <option value="RETIREMENT">Retirement</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-[10px] font-bold text-red-800 mb-0.5">Destination / Date Context *</label>
                                <input 
                                    type="text"
                                    placeholder={archiveReason === 'TRANSFERRED' ? "e.g. CPS Kampala to Arua" : "e.g. 15/08/2026 at Mulago"}
                                    value={archiveDetail}
                                    onChange={(e) => setArchiveDetail(e.target.value)}
                                    className="w-full text-xs border border-red-300 rounded p-1.5 bg-white text-slate-800 outline-none"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-[10px] font-bold text-red-800 mb-0.5">Correspondence Ref (Message / Letter) *</label>
                                <input 
                                    type="text"
                                    placeholder="e.g. CR/123/2026 or POL/MSG/89"
                                    value={corrRef}
                                    onChange={(e) => setCorrRef(e.target.value)}
                                    className="w-full text-xs border border-red-300 rounded p-1.5 bg-white text-slate-800 font-mono outline-none"
                                    required
                                />
                            </div>

                            <button type="button" onClick={handleArchivePersonnel} className="w-full bg-red-600 hover:bg-red-700 text-white py-1.5 rounded font-bold text-xs shadow-xs transition border border-red-800 cursor-pointer mt-1">Move to Archive</button>
                        </div>
                      </div>
                    )}

                    {operation === 'update' && (formData.sn || formData.fnum) && <div className="bg-slate-800 text-white text-[11px] font-bold px-2.5 py-1.5 rounded">Editing: {formData.fnum}</div>}
                      
                    <div className="bg-gray-50 p-2.5 rounded-lg border border-gray-200 space-y-2">
                      <h4 className="text-[10px] font-bold text-gray-500 uppercase border-b pb-0.5">1. Identifiers</h4>
                      <div className="grid grid-cols-2 gap-2">
                        <div><label className="block text-[10px] font-bold text-gray-700 mb-0.5">F/NO. *</label><input type="text" name="fnum" value={formData.fnum} onChange={handleInputChange} required className="w-full text-xs border-gray-300 rounded shadow-xs border py-1.5 px-2 uppercase bg-white text-slate-800" /></div>
                        <div><label className="block text-[10px] font-bold text-gray-700 mb-0.5">IPPS NO. *</label><input type="text" name="ipps" value={formData.ipps} onChange={handleInputChange} required className="w-full text-xs border-gray-300 rounded shadow-xs border py-1.5 px-2 bg-white text-slate-800" /></div>
                        <div className="col-span-2"><label className="block text-[10px] font-bold text-gray-700 mb-0.5">NAME *</label><input type="text" name="name" value={formData.name} onChange={handleInputChange} required className="w-full text-xs border-gray-300 rounded shadow-xs border py-1.5 px-2 uppercase bg-white text-slate-800" /></div>
                        <div><label className="block text-[10px] font-bold text-gray-700 mb-0.5">RANK *</label><input type="text" name="rank" value={formData.rank} onChange={handleInputChange} required className="w-full text-xs border-gray-300 rounded shadow-xs border py-1.5 px-2 bg-white text-slate-800" /></div>
                        <div><label className="block text-[10px] font-bold text-gray-700 mb-0.5">SEX</label><select name="sex" value={formData.sex} onChange={handleInputChange} className="w-full text-xs border-gray-300 rounded shadow-xs border py-1.5 px-2 bg-white text-slate-800"><option>MALE</option><option>FEMALE</option></select></div>
                        <div><label className="block text-[10px] font-bold text-gray-700 mb-0.5">TIN NO.</label><input type="text" name="tin" value={formData.tin} onChange={handleInputChange} className="w-full text-xs border-gray-300 rounded shadow-xs border py-1.5 px-2 bg-white text-slate-800" /></div>
                        <div><label className="block text-[10px] font-bold text-gray-700 mb-0.5">NIN</label><input type="text" name="nin" value={formData.nin} onChange={handleInputChange} className="w-full text-xs border-gray-300 rounded shadow-xs border py-1.5 px-2 bg-white text-slate-800" /></div>
                      </div>
                    </div>

                    <div className="bg-gray-50 p-2.5 rounded-lg border border-gray-200 space-y-2">
                      <h4 className="text-[10px] font-bold text-gray-500 uppercase border-b pb-0.5">2. Service & Placement</h4>
                      <div className="grid grid-cols-2 gap-2">
                        <div><label className="block text-[10px] font-bold text-gray-700 mb-0.5">REGION *</label><select name="region" value={formData.region} onChange={handleInputChange} disabled={!isGlobalTier} required className="w-full text-xs border-gray-300 rounded shadow-xs border py-1.5 px-2 bg-white text-slate-800 disabled:bg-gray-100 disabled:text-gray-500">{isGlobalTier ? Object.keys(REGIONAL_HIERARCHY).map(reg => <option key={reg} value={reg}>{reg}</option>) : <option value={userRegClean}>{userRegClean}</option>}</select></div>
                        <div><label className="block text-[10px] font-bold text-gray-700 mb-0.5">DUTY STATION *</label><select name="station" value={formData.station} onChange={handleInputChange} disabled={!isGlobalTier && !isRegionalCommand} required className="w-full text-xs border-gray-300 rounded shadow-xs border py-1.5 px-2 bg-white text-slate-800 disabled:bg-gray-100 disabled:text-gray-500">{(isGlobalTier || isRegionalCommand) ? (REGIONAL_HIERARCHY[formData.region] || []).map(stat => <option key={stat} value={stat}>{stat}</option>) : (<option value={currentUser.station}>{cleanStr(currentUser.station)}</option>)}</select></div>
                        <div><label className="block text-[10px] font-bold text-gray-700 mb-0.5">POSITION *</label><input type="text" name="position" value={formData.position} onChange={handleInputChange} required className="w-full text-xs border-gray-300 rounded shadow-xs border py-1.5 px-2 bg-white text-slate-800" /></div>
                        <div><label className="block text-[10px] font-bold text-gray-700 mb-0.5">DISTRICT</label><input type="text" name="district" value={formData.district} onChange={handleInputChange} className="w-full text-xs border-gray-300 rounded shadow-xs border py-1.5 px-2 bg-white text-slate-800" /></div>
                        <div><label className="block text-[10px] font-bold text-gray-700 mb-0.5">SECTION</label><input type="text" name="section" value={formData.section} onChange={handleInputChange} className="w-full text-xs border-gray-300 rounded shadow-xs border py-1.5 px-2 bg-white text-slate-800" /></div>
                        <div><label className="block text-[10px] font-bold text-gray-700 mb-0.5">DIR (Directorate)</label><input type="text" name="dir" value={formData.dir} onChange={handleInputChange} className="w-full text-xs border-gray-300 rounded shadow-xs border py-1.5 px-2 bg-white text-slate-800" /></div>
                      </div>
                    </div>

                    <div className="bg-gray-50 p-2.5 rounded-lg border border-gray-200 space-y-2">
                      <h4 className="text-[10px] font-bold text-gray-500 uppercase border-b pb-0.5">3. Demographics</h4>
                      <div className="grid grid-cols-2 gap-2">
                        <div><label className="block text-[10px] font-bold text-gray-700 mb-0.5">D.O.B</label><input type="date" name="dob" min="1940-01-01" max="2035-12-31" value={formData.dob} onChange={handleInputChange} className="w-full text-xs border-gray-300 rounded shadow-xs border py-1.5 px-2 bg-white text-slate-800" /></div>
                        <div><label className="block text-[10px] font-bold text-gray-700 mb-0.5">D.O.E</label><input type="date" name="doe" min="1950-01-01" max="2035-12-31" value={formData.doe} onChange={handleInputChange} className="w-full text-xs border-gray-300 rounded shadow-xs border py-1.5 px-2 bg-white text-slate-800" /></div>
                        <div><label className="block text-[10px] font-bold text-gray-700 mb-0.5">D.O. POST</label><input type="date" name="dopost" min="1950-01-01" max="2035-12-31" value={formData.dopost} onChange={handleInputChange} className="w-full text-xs border-gray-300 rounded shadow-xs border py-1.5 px-2 bg-white text-slate-800" /></div>
                        <div><label className="block text-[10px] font-bold text-gray-700 mb-0.5">D.O. PRO</label><input type="date" name="dopro" min="1950-01-01" max="2035-12-31" value={formData.dopro} onChange={handleInputChange} className="w-full text-xs border-gray-300 rounded shadow-xs border py-1.5 px-2 bg-white text-slate-800" /></div>
                        <div className="col-span-2"><label className="block text-[10px] font-bold text-gray-700 mb-0.5">CONTACT</label><input type="text" name="contact" value={formData.contact} onChange={handleInputChange} className="w-full text-xs border-gray-300 rounded shadow-xs border py-1.5 px-2 bg-white text-slate-800" /></div>
                        <div><label className="block text-[10px] font-bold text-gray-700 mb-0.5">EDUC LEVEL</label><input type="text" name="educlevel" value={formData.educlevel} onChange={handleInputChange} className="w-full text-xs border-gray-300 rounded shadow-xs border py-1.5 px-2 bg-white text-slate-800" /></div>
                        <div><label className="block text-[10px] font-bold text-gray-700 mb-0.5">HOME DIST</label><input type="text" name="homedist" value={formData.homedist} onChange={handleInputChange} className="w-full text-xs border-gray-300 rounded shadow-xs border py-1.5 px-2 bg-white text-slate-800" /></div>
                        <div><label className="block text-[10px] font-bold text-gray-700 mb-0.5">TRIBE</label><input type="text" name="tribe" value={formData.tribe} onChange={handleInputChange} className="w-full text-xs border-gray-300 rounded shadow-xs border py-1.5 px-2 bg-white text-slate-800" /></div>
                      </div>
                    </div>

                    <div className="bg-gray-50 p-2.5 rounded-lg border border-gray-200 space-y-2">
                      <h4 className="text-[10px] font-bold text-gray-500 uppercase border-b pb-0.5">4. Financial & Status</h4>
                      <div className="grid grid-cols-2 gap-2">
                        <div><label className="block text-[10px] font-bold text-gray-700 mb-0.5">ACC. NO</label><input type="text" name="accno" value={formData.accno} onChange={handleInputChange} className="w-full text-xs border-gray-300 rounded shadow-xs border py-1.5 px-2 bg-white text-slate-800" /></div>
                        <div><label className="block text-[10px] font-bold text-gray-700 mb-0.5">BANK & BRANCH</label><input type="text" name="bankbranch" value={formData.bankbranch} onChange={handleInputChange} className="w-full text-xs border-gray-300 rounded shadow-xs border py-1.5 px-2 bg-white text-slate-800" /></div>
                        <div className="col-span-2"><label className="block text-[10px] font-bold text-gray-700 mb-0.5">STATUS</label><select name="status" value={formData.status} onChange={handleInputChange} className="w-full text-xs border-gray-300 rounded shadow-xs border py-1.5 px-2 bg-white text-slate-800 font-bold"><option>ACTIVE</option><option>AWOL</option><option>SICK</option><option>ON MISSION</option><option>ON LEAVE</option><option>ON COURSE</option><option>DUTY OUT</option><option>SUSPENDED</option><option>DISCHARGED</option><option>DESERTED</option><option>DISMISSED</option><option>INTERDICTED</option></select></div>
                      </div>
                    </div>

                    {operation === 'new' && isArchivedReturnee && archiveDetails && (
                      <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg mt-2.5 animate-in fade-in zoom-in-95 shadow-xs">
                        <div className="flex items-start mb-2">
                          <AlertTriangle className="text-amber-500 w-4 h-4 mr-1.5 mt-0.5 shrink-0" />
                          <div>
                            <h4 className="text-xs font-bold text-amber-900">Historical Record Match</h4>
                            <p className="text-[11px] text-amber-700 mt-0.5">
                              Found in archives: 
                              <span className="font-mono bg-amber-100 px-1 py-0.5 rounded mx-1 font-bold text-amber-900 border border-amber-200">
                                {archiveDetails.old_rank} {archiveDetails.old_fnum}
                              </span>
                            </p>
                          </div>
                        </div>
                          
                        <div className="space-y-2.5 bg-white p-2.5 rounded-md border border-amber-100">
                          <div>
                            <label className="block text-[10px] font-bold text-slate-700 mb-0.5">Re-integration Authority / Reason *</label>
                            <input
                              type="text"
                              required
                              value={customReason}
                              onChange={(e) => setCustomReason(e.target.value)}
                              placeholder="e.g., Deployed from HR HQs back to KMP..."
                              className="w-full text-xs py-1.5 px-2 border border-slate-300 rounded shadow-xs focus:ring-1 focus:ring-amber-500 outline-none bg-white text-slate-800"
                            />
                          </div>
                            
                          <div>
                            <label className="block text-[10px] font-bold text-slate-700 mb-0.5 flex items-center">
                              Previous Force No. <span className="text-slate-400 font-normal ml-1">(If promoted to Gazetted File No.)</span>
                            </label>
                            <div className="flex flex-col sm:flex-row sm:items-center space-y-1 sm:space-y-0 sm:space-x-1.5">
                              <input
                                type="text"
                                value={previousFnum}
                                onChange={(e) => setPreviousFnum(e.target.value)}
                                placeholder="Leave blank if unchanged"
                                className="flex-1 text-xs py-1.5 px-2 border border-slate-300 rounded shadow-xs focus:ring-1 focus:ring-amber-500 outline-none uppercase bg-white text-slate-800"
                              />
                              {previousFnum && (
                                <div className="flex items-center text-[9px] font-bold text-amber-700 bg-amber-100 px-1.5 py-1 rounded border border-amber-200">
                                  <span>{previousFnum}</span>
                                  <ArrowRight className="w-2.5 h-2.5 mx-0.5" />
                                  <span>{formData.fnum}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    <button type="submit" className={`w-full transition-colors text-white py-2.5 font-bold rounded-lg shadow text-xs uppercase flex justify-center items-center cursor-pointer ${isArchivedReturnee ? 'bg-amber-600 hover:bg-amber-700' : 'bg-blue-700 hover:bg-blue-800'}`}>
                      {operation === 'new' 
                        ? (isArchivedReturnee ? '⚠️ Execute Safe Re-integration' : '💾 Log Personnel Record') 
                        : '💾 Save Updates'}
                    </button>
                  </form>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="lg:col-span-7 space-y-3.5">
          {viewMode === 'active' && canEditRecords && (
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 flex flex-col justify-between items-stretch gap-2.5">
              <div className="flex justify-between items-center">
                  <button
                    type="button"
                    onClick={() => { setBulkSelectMode(!bulkSelectMode); setSelectedOfficers([]); }}
                    className={`text-xs font-bold px-3.5 py-1.5 rounded-lg transition-colors border shadow-xs cursor-pointer ${bulkSelectMode ? 'bg-slate-800 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'}`}
                  >
                      {bulkSelectMode ? 'Cancel Bulk Select' : '☑️ Enable Bulk Archive'}
                  </button>
                  {bulkSelectMode && selectedOfficers.length > 0 && (
                      <span className="text-xs font-black text-red-600 bg-red-50 px-2.5 py-0.5 rounded border border-red-200">
                        {selectedOfficers.length} Selected
                      </span>
                  )}
              </div>
                
              {bulkSelectMode && selectedOfficers.length > 0 && (
                  <div className="flex flex-col sm:flex-row items-center gap-2 animate-in fade-in slide-in-from-left-4 bg-white p-2.5 rounded-lg shadow-xs border border-red-200">
                      <select
                          value={bulkArchiveReason}
                          onChange={(e) => setBulkArchiveReason(e.target.value)}
                          className="w-full sm:w-auto text-xs border border-slate-300 rounded p-1.5 outline-none font-bold text-slate-700 bg-white cursor-pointer"
                      >
                          <option value="TRANSFERRED">Transferred</option>
                          <option value="DEATH">Death</option>
                          <option value="AWOL">Awol</option>
                          <option value="SUSPENDED">Suspended</option>
                          <option value="INTERDICTED">Interdicted</option>
                          <option value="DISMISSAL">Dismissal</option>
                          <option value="DESERTION">Desertion</option>
                          <option value="RETIREMENT">Retirement</option>
                      </select>

                      <input 
                          type="text"
                          placeholder="Bulk destination/date context..."
                          value={bulkArchiveDetail}
                          onChange={(e) => setBulkArchiveDetail(e.target.value)}
                          className="w-full sm:flex-1 text-xs border border-slate-300 rounded p-1.5 bg-white text-slate-800"
                      />

                      <input 
                          type="text"
                          placeholder="Correspondence Ref..."
                          value={bulkCorrRef}
                          onChange={(e) => setBulkCorrRef(e.target.value)}
                          className="w-full sm:w-36 text-xs border border-slate-300 rounded p-1.5 bg-white text-slate-800 font-mono"
                      />

                      <button
                          type="button"
                          onClick={handleBulkArchive}
                          disabled={isBulkArchiving}
                          className="w-full sm:w-auto text-xs font-bold bg-red-600 hover:bg-red-700 text-white px-3.5 py-1.5 rounded transition-colors shadow-xs disabled:opacity-50 cursor-pointer shrink-0"
                      >
                          {isBulkArchiving ? 'Archiving...' : `Archive (${selectedOfficers.length})`}
                      </button>
                  </div>
              )}
            </div>
          )}

          {/* JURISDICTION DROPDOWNS & SEARCH */}
          <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between">
            <div className="flex flex-col sm:flex-row gap-2.5 flex-1">
              <select value={filterRegion} onChange={(e) => { setFilterRegion(e.target.value); setFilterStation('ALL STATIONS'); }} disabled={!canViewGlobalLevel} className="border rounded-lg px-3 py-1.5 text-xs font-bold shadow-xs bg-white text-slate-800 border-slate-300 disabled:bg-gray-100 disabled:text-gray-500 w-full sm:w-auto outline-none focus:border-blue-500 cursor-pointer">
                {canViewGlobalLevel ? (
                  <><option value="ALL REGIONS">ALL REGIONS</option>{Array.from(new Set([...Object.keys(REGIONAL_HIERARCHY), ...(filteredRolls || []).map(n => cleanStr(n.region)).filter(Boolean)])).sort().map(reg => <option key={reg} value={reg}>{reg}</option>)}</>
                ) : <option value={userRegClean}>{userRegClean}</option>}
              </select>
              <select value={filterStation} onChange={(e) => setFilterStation(e.target.value) } disabled={!(canViewGlobalLevel || isRegionalCommand)} className="border rounded-lg px-3 py-1.5 text-xs font-bold shadow-xs bg-white text-slate-800 border-slate-300 disabled:bg-gray-100 disabled:text-gray-500 w-full sm:w-auto outline-none focus:border-blue-500 cursor-pointer">
                {(canViewGlobalLevel || isRegionalCommand) ? (
                  <><option value="ALL STATIONS">ALL STATIONS</option>{Array.from(new Set([...(REGIONAL_HIERARCHY[filterRegion] || []), ...(filteredRolls || []).filter(n => filterRegion === 'ALL REGIONS' || cleanStr(n.region) === filterRegion).map(n => cleanStr(n.station)).filter(Boolean)])).sort().map(stat => <option key={stat} value={stat}>{stat}</option>)}</>
                ) : <option value={currentUser?.station}>{cleanStr(currentUser?.station)}</option>}
              </select>
            </div>

            <div className="relative w-full sm:w-64 shrink-0">
              <input 
                type="text"
                placeholder="Search ledger by name, f/no, rank..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full text-xs border border-slate-300 rounded-lg pl-8 pr-7 py-1.5 bg-white text-slate-800 outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs font-medium"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold cursor-pointer"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          {/* ANALYTICS BREAKDOWN OR TABLE LEDGER VIEW */}
          {showAnalytics ? (
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-xs animate-in fade-in zoom-in-95 duration-200">
                <div className="flex justify-between items-center mb-4 border-b border-gray-200 pb-3">
                    <h3 className="font-extrabold text-base text-indigo-900 flex items-center"><PieChart className="mr-2 w-4 h-4"/> {viewMode === 'archive' ? 'Archived Roll Analytics' : 'Active Roll Analytics'}</h3>
                    <div className="flex items-center space-x-2 bg-indigo-50 p-1.5 rounded-lg border border-indigo-100">
                        <label className="text-[10px] font-bold text-indigo-800 uppercase">Categorize By:</label>
                        <select value={metricCategory} onChange={e => setMetricCategory(e.target.value)} className="border border-indigo-300 rounded p-1 text-xs font-bold text-indigo-700 outline-none bg-white cursor-pointer">
                            <option value="RANK">Rank Breakdown</option>
                            <option value="UNIT">Unit / Station Breakdown</option>
                            <option value="SEX">Sex Distribution</option>
                            <option value="DISTRICT">Home District Breakdown</option>
                            <option value="BANK">Bank Branch Breakdown</option>
                            <option value="TRIBE">Tribe Breakdown</option>
                            <option value="EDUCATION">Education Level Breakdown</option>
                            <option value="AGE">Age Demographics Breakdown</option>
                        </select>
                    </div>
                </div>
                <div className="overflow-x-auto overflow-y-auto max-h-[460px] custom-scrollbar border border-gray-200 rounded-lg">
                  <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-indigo-50 sticky top-0 z-10 shadow-xs">
                          <tr>
                              <th className="px-3 py-2.5 text-left text-xs font-bold text-indigo-800 uppercase">{metricCategory}</th>
                              <th className="px-3 py-2.5 text-center text-xs font-bold text-indigo-800 uppercase">Total Strength</th>
                              <th className="px-3 py-2.5 text-center text-xs font-bold text-indigo-800 uppercase">Male</th>
                              <th className="px-3 py-2.5 text-center text-xs font-bold text-indigo-800 uppercase">Female</th>
                          </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-100">
                          {calculatedMetrics.map(m => (
                              <tr key={m.category} className="hover:bg-indigo-50/30 transition-colors">
                                  <td className="px-3 py-2.5 text-xs font-bold text-gray-800">{m.category}</td>
                                  <td className="px-3 py-2.5 text-xs text-center font-extrabold text-indigo-600">{m.total}</td>
                                  <td className="px-3 py-2.5 text-xs text-center font-medium text-blue-600">{m.male}</td>
                                  <td className="px-3 py-2.5 text-xs text-center font-medium text-pink-600">{m.female}</td>
                              </tr>
                          ))}
                          {calculatedMetrics.length === 0 && <tr><td colSpan="4" className="text-center p-4 text-xs text-gray-500 font-medium">No records match the current filter constraint.</td></tr>}
                      </tbody>
                  </table>
                </div>
            </div>
          ) : (
            <ExpandableTableCard 
              title={viewMode === 'active' ? "Active Nominal Roll Ledger" : "Archived Personnel Ledger"}
              onToggle={(expanded) => { if (setSidebarOpen) setSidebarOpen(!expanded); }}
            >
              {(expanded) => (
                <div className={`overflow-x-auto overflow-y-auto w-full ${expanded ? 'h-full flex-1' : 'max-h-[500px]'} custom-scrollbar`}>
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50 sticky top-0 z-10 shadow-xs">
                      <tr>
                        {bulkSelectMode && viewMode === 'active' && canEditRecords && (
                          <th className="px-2.5 py-2.5 text-center text-xs font-bold text-gray-500 uppercase whitespace-nowrap">
                             <input 
                               type="checkbox" 
                               checked={selectedOfficers.length === filteredRolls.length && filteredRolls.length > 0}
                               onChange={(e) => {
                                   if (e.target.checked) setSelectedOfficers(filteredRolls.map(n => n.f_num || n.fnum));
                                   else setSelectedOfficers([]);
                               }}
                               className="w-3.5 h-3.5 cursor-pointer accent-red-600"
                             />
                          </th>
                        )}
                        <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-500 uppercase whitespace-nowrap">S/No</th>
                        <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-500 uppercase whitespace-nowrap">F/NO</th>
                        <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-500 uppercase whitespace-nowrap">Rank</th>
                        <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-500 uppercase whitespace-nowrap">Name</th>
                        <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-500 uppercase whitespace-nowrap">Sex</th>
                        <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-500 uppercase whitespace-nowrap">Position</th>
                        <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-500 uppercase whitespace-nowrap">DOB</th>
                        <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-500 uppercase whitespace-nowrap">DOE</th>
                        <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-500 uppercase whitespace-nowrap">D.O. Post</th>
                        <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-500 uppercase whitespace-nowrap">D.O. Pro</th>
                        <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-500 uppercase whitespace-nowrap">Contact</th>
                        <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-500 uppercase whitespace-nowrap">Educ Level</th>
                        <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-500 uppercase whitespace-nowrap">IPPS</th>
                        <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-500 uppercase whitespace-nowrap">TIN</th>
                        <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-500 uppercase whitespace-nowrap">NIN</th>
                        <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-500 uppercase whitespace-nowrap">Home Dist</th>
                        <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-500 uppercase whitespace-nowrap">Tribe</th>
                        <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-500 uppercase whitespace-nowrap">Acc No</th>
                        <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-500 uppercase whitespace-nowrap">Bank Branch</th>
                        <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-500 uppercase whitespace-nowrap">Station</th>
                        <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-500 uppercase whitespace-nowrap">District</th>
                        <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-500 uppercase whitespace-nowrap">Region</th>
                        <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-500 uppercase whitespace-nowrap">Section</th>
                        <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-500 uppercase whitespace-nowrap">Dir</th>
                        <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-500 uppercase whitespace-nowrap">Status</th>
                        <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-500 uppercase whitespace-nowrap">Last Updated By</th>
                        {viewMode === 'archive' && (
                          <>
                            <th className="px-3 py-2.5 text-left text-xs font-bold text-red-600 uppercase whitespace-nowrap bg-red-50">Archive Reason</th>
                            <th className="px-3 py-2.5 text-left text-xs font-bold text-red-600 uppercase whitespace-nowrap bg-red-50">Archive Date</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {(viewMode === 'active' ? filteredRolls : filteredNominal_Roll_archives).map((n, index) => (
                        <tr 
                          key={n.sn || n.id || n.f_num || n.fnum} 
                          className={`${viewMode === 'archive' ? 'bg-slate-50 opacity-80' : bulkSelectMode && selectedOfficers.includes(n.f_num || n.fnum) ? 'bg-red-50' : 'hover:bg-blue-50'} transition-colors ${canEditRecords ? 'cursor-pointer' : ''}`} 
                          onClick={() => {
                              if (!canEditRecords) return;
                               
                              if (bulkSelectMode && viewMode === 'active') {
                                const target = n.f_num || n.fnum;
                                if (selectedOfficers.includes(target)) {
                                    setSelectedOfficers(prev => prev.filter(id => id !== target));
                                } else {
                                    setSelectedOfficers(prev => [...prev, target]);
                                }
                              } else {
                                setSelectedOfficer(n);
                              }
                          }}
                        >
                          {bulkSelectMode && viewMode === 'active' && canEditRecords && (
                              <td className="px-2.5 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                                <input 
                                  type="checkbox" 
                                  checked={selectedOfficers.includes(n.f_num || n.fnum)}
                                  onChange={(e) => {
                                    const target = n.f_num || n.fnum;
                                    if (e.target.checked) setSelectedOfficers(prev => [...prev, target]);
                                    else setSelectedOfficers(prev => prev.filter(id => id !== target));
                                  }}
                                  className="w-3.5 h-3.5 cursor-pointer accent-red-600"
                                />
                              </td>
                          )}
                          <td className="px-3 py-2 whitespace-nowrap text-xs font-bold text-gray-900">{index + 1}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs font-bold text-blue-800">{cleanStr(n.f_num || n.fnum)}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs font-bold text-slate-800">{cleanStr(n.rank)}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs font-medium uppercase text-slate-800">{cleanStr(n.name)}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-slate-700">{cleanStr(n.sex)}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-700">{cleanStr(n.position)}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500">{n.dob || ''}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500">{n.doe || ''}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500">{n.do_post || n.dopost || n.dop || ''}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500">{n.do_pro || n.dopro || ''}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-slate-700">{cleanStr(n.contact)}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-slate-700">{cleanStr(n.educ_level || n.educlevel)}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs font-mono text-slate-700">{cleanStr(n.ipps)}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-slate-700">{cleanStr(n.tin)}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-slate-700">{cleanStr(n.nin)}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-slate-700">{cleanStr(n.home_dist || n.homedist)}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-slate-700">{cleanStr(n.tribe)}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-slate-700">{cleanStr(n.acc_no || n.accno)}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-slate-700">{cleanStr(n.bank_branch || n.bankbranch)}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs font-bold text-blue-700">{cleanStr(n.station)}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-slate-700">{cleanStr(n.district)}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-slate-700">{cleanStr(n.region)}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-slate-700">{cleanStr(n.section)}</td>
                          <td className="px-3 py-2 text-xs text-slate-700 max-w-[130px] truncate" title={cleanStr(n.dir)}>{cleanStr(n.dir)}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs font-bold text-green-700">{cleanStr(n.status) || 'ACTIVE'}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500">{n.last_updated_by || ''}</td>
                          {viewMode === 'archive' && (
                            <>
                              <td className="px-3 py-2 whitespace-nowrap text-xs font-bold text-red-700 bg-red-50/50">{cleanStr(n.archive_reason)}</td>
                              <td className="px-3 py-2 whitespace-nowrap text-xs text-red-500 bg-red-50/50">{n.archive_date || ''}</td>
                            </>
                          )}
                        </tr>
                      ))}
                      {(viewMode === 'active' ? filteredRolls : filteredNominal_Roll_archives).length === 0 && (
                        <tr><td colSpan={viewMode === 'archive' ? "28" : (bulkSelectMode ? "27" : "26")} className="text-center py-6 text-xs text-gray-500 font-medium">No personnel records found in this view.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </ExpandableTableCard>
          )}
        </div>
      </div>

      {selectedOfficer && (
        <OfficerDossierModal 
          officer={selectedOfficer} 
          onClose={() => setSelectedOfficer(null)} 
        />
      )}
    </div>  
  );
};

export default Nominal_Roll;