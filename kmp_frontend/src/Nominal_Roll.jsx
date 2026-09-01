import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  Users, PlusCircle, Edit, AlertTriangle, CheckCircle, Upload, 
  BarChart3, PieChart, ArrowRight 
} from 'lucide-react';
import { authFetch } from './api';
import BulkNominalRollUpload from './BulkNominalRollUpload';
import OfficerDossierModal from './OfficerDossierModal';

const REGIONAL_HIERARCHY = {
  "KMP NORTH": ["KAWEMPE", "KAKIRI", "KASANGATI", "MATUGGA", "NANSANA", "OLD KAMPALA", "WAKISO", "WANDEGEYA"],
  "KMP EAST": ["JINJA ROAD", "KIRA", "KIRA ROAD", "MUKONO", "NAGGALAMA", "SEETA"],
  "KMP SOUTH": ["NATEETE", "CPS KAMPALA", "PARLIAMENT", "ENTEBBE", "KABALAGALA", "KAJJANSI", "KASENYI", "KATWE", "KYENGERA", "NSANGI"],
  "KMP HEADQUARTERS": ["KMP HEADQUARTERS", "FLYING SQUAD", "CRIME INTELLIGENCE"],
  "POLICE HEADQUARTERS": ["NAGURU"]
};

const getRankWeight = (rank) => {
  if (!rank) return 99;
  const r = rank.toUpperCase().trim();
   
  if (r === 'IGP') return 1;
  if (r === 'DIGP') return 2;
  if (r === 'AIGP') return 3;
  if (r === 'SCP') return 4;
  if (r === 'CP') return 5;
  if (r === 'ACP') return 6;
  if (r === 'SSP') return 7;
  if (r === 'SP') return 8;
  if (r === 'SASP') return 9;
  if (r === 'ASP') return 10;
  if (r === 'IP') return 11;
  if (r === 'AIP') return 12;
  if (r === 'HCM') return 13;
  if (r === 'HC') return 14;
  if (r === 'S/SGT' || r === 'SSGT') return 15;
  if (r === 'SGT') return 16;
  if (r === 'CPL') return 17;
  if (r === 'L/CPL' || r === 'LCPL') return 18;
  if (r === 'PC') return 19;
  if (r === 'PPC') return 20;
  if (r === 'SPC') return 21;
   
  return 50;
};

const parseEducationLevel = (educ) => {
  if (!educ) return 'UNKNOWN';
  const e = educ.toUpperCase().trim();
  
  if (e.includes('DEGREE') || e.includes('BACHELOR') || e.includes('MASTER') || e.includes('PHD')) return 'DEGREE / POSTGRAD';
  if (e.includes('DIPLOMA')) return 'DIPLOMA';
  if (e.includes('CERT')) return 'CERTIFICATE';
  if (e.includes('UACE') || e.includes('S.6') || e.includes('SENIOR 6')) return 'UACE (A-LEVEL)';
  if (e.includes('UCE') || e.includes('S.4') || e.includes('SENIOR 4')) return 'UCE (O-LEVEL)';
  
  if (e.includes('S.3') || e.includes('SENIOR 3')) return 'SENIOR 3 (S.3)';
  if (e.includes('S.2') || e.includes('SENIOR 2')) return 'SENIOR 2 (S.2)';
  if (e.includes('S.1') || e.includes('SENIOR 1')) return 'SENIOR 1 (S.1)';
  if (e.includes('P.7') || e.includes('PRIMARY 7')) return 'PRIMARY 7 (P.7)';
  if (e.includes('P.6') || e.includes('PRIMARY 6')) return 'PRIMARY 6 (P.6)';
  if (e.includes('P.5') || e.includes('PRIMARY 5')) return 'PRIMARY 5 (P.5)';
  if (e.includes('P.4') || e.includes('PRIMARY 4')) return 'PRIMARY 4 (P.4)';
  if (e.includes('P.3') || e.includes('PRIMARY 3')) return 'PRIMARY 3 (P.3)';
  if (e.includes('P.2') || e.includes('PRIMARY 2')) return 'PRIMARY 2 (P.2)';
  if (e.includes('P.1') || e.includes('PRIMARY 1')) return 'PRIMARY 1 (P.1)';
  if (e.includes('UNEDUCATED') || e.includes('NONE') || e.includes('NIL')) return 'UNEDUCATED';

  return 'OTHER / UNRECORDED';
};

const MetricCard = ({ title, value, colorClass }) => (
  <div className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs flex flex-col items-center justify-center text-center">
    <h4 className="text-[10px] font-extrabold text-slate-400 dark:text-slate-400 uppercase tracking-wider mb-1">{title}</h4>
    <div className={`text-xl font-black ${colorClass}`}>{value}</div>
  </div>
);

const ExpandableTableCard = ({ title, children, onToggle }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  return (
    <div className={isExpanded ? "fixed inset-4 z-[9999] bg-white dark:bg-slate-900 rounded-xl shadow-2xl p-6 overflow-hidden flex flex-col" : "bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col h-[650px]"}>
      <div className="bg-slate-50 dark:bg-slate-900 px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center shrink-0">
        <h3 className="text-gray-800 dark:text-slate-100 font-bold text-sm uppercase tracking-wider">{title}</h3>
        <button onClick={() => { const next = !isExpanded; setIsExpanded(next); if (onToggle) onToggle(next); }} className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer">
          {isExpanded ? 'Collapse ↙' : 'Expand ↗'}
        </button>
      </div>
      <div className="p-0 overflow-auto flex-1 custom-scrollbar">{children}</div>
    </div>
  );
};

const Nominal_Roll = ({ currentUser, canViewGlobal: propCanViewGlobal, Nominal_Rolls, setNominal_Rolls, Nominal_Roll_archives, setNominal_Roll_archives, setSidebarOpen }) => {
  const [operation, setOperation] = useState('new');
  const [notification, setNotification] = useState(null);
  const [selectedOfficer, setSelectedOfficer] = useState(null);
  const [updateSearch, setUpdateSearch] = useState(''); 

  const isCommandOrHR = ['ADMIN', 'SUPER_ADMIN', 'RPC', 'Deputy Commander'].includes(currentUser?.role) ||                         
                        (currentUser?.position || '').toUpperCase().includes('HR') ||
                        currentUser?.permissions?.system_admin === true;

  const canEditRecords = isCommandOrHR || currentUser?.permissions?.upload_hr === true;
   
  const canViewGlobal = propCanViewGlobal !== undefined 
    ? propCanViewGlobal 
    : (currentUser?.role === 'SUPER_ADMIN' || currentUser?.role === 'ADMIN' || currentUser?.role === 'RPC' || currentUser?.role === 'Deputy Commander' || isCommandOrHR || currentUser?.permissions?.view_global_roster === true || currentUser?.permissions?.global_observer === true);

  const [filterRegion, setFilterRegion] = useState(canViewGlobal ? 'ALL REGIONS' : currentUser?.region || '');
  const [filterStation, setFilterStation] = useState(canViewGlobal ? 'ALL STATIONS' : ((isCommandOrHR) ? 'ALL STATIONS' : currentUser?.station || ''));

  const isFilterInitialized = useRef(false);
  useEffect(() => {
    if (!isFilterInitialized.current && currentUser?.station) {
      if (canViewGlobal) {
        setFilterRegion('ALL REGIONS');
        setFilterStation('ALL STATIONS');
      } else {
        setFilterRegion(currentUser.region || '');
        setFilterStation(currentUser.station || '');
      }
      isFilterInitialized.current = true;
    }
  }, [canViewGlobal, currentUser?.station, currentUser?.region]);

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
       
      const response = await authFetch(`/api/v1/nominal-roll/${encodeURIComponent(cleanTargetFnum)}/archive`, {
        method: "PUT", 
        headers: { "Content-Type": "application/json" }, 
        body: JSON.stringify({ archive_reason: finalArchiveReason })
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
      const statusStr = (n.status || '').trim().toUpperCase();
      if (statusStr === 'ARCHIVED' || n.is_archived === true) return false;

      const dbRegion = (n.region || '').trim().toUpperCase();
      const dbStation = (n.station || '').trim().toUpperCase();
      const selRegion = (filterRegion || '').trim().toUpperCase();
      const selStation = (filterStation || '').trim().toUpperCase();

      if (canViewGlobal && selRegion === 'ALL REGIONS') {
        // Global viewing active
      } else if (selRegion !== 'ALL REGIONS' && selRegion !== '' && dbRegion !== selRegion) {
        return false;
      }

      if (canViewGlobal && selRegion === 'ALL REGIONS' && selStation === 'ALL STATIONS') {
        return true;
      }

      if (selStation !== 'ALL STATIONS' && selStation !== '' && dbStation !== selStation) {
        return false;
      }

      return true;
    }).sort((a, b) => {
      const weightA = getRankWeight(a.rank);
      const weightB = getRankWeight(b.rank);
      if (weightA !== weightB) {
        return weightA - weightB;
      }
      return (a.name || '').localeCompare(b.name || '');
    });
  }, [Nominal_Rolls, filterRegion, filterStation, canViewGlobal]);

  const filteredNominal_Roll_archives = useMemo(() => {
    if (!Array.isArray(Nominal_Roll_archives)) return [];

    return Nominal_Roll_archives.filter(n => {
      const dbRegion = (n.region || '').trim().toUpperCase();
      const dbStation = (n.station || '').trim().toUpperCase();
      const selRegion = (filterRegion || '').trim().toUpperCase();
      const selStation = (filterStation || '').trim().toUpperCase();

      if (canViewGlobal && selRegion === 'ALL REGIONS') {
        // Global viewing active
      } else if (selRegion !== 'ALL REGIONS' && selRegion !== '' && dbRegion !== selRegion) {
        return false;
      }

      if (canViewGlobal && selRegion === 'ALL REGIONS' && selStation === 'ALL STATIONS') {
        return true;
      }

      if (selStation !== 'ALL STATIONS' && selStation !== '' && dbStation !== selStation) {
        return false;
      }

      return true;
    }).sort((a, b) => {
      const weightA = getRankWeight(a.rank);
      const weightB = getRankWeight(b.rank);
      if (weightA !== weightB) {
        return weightA - weightB;
      }
      return (a.name || '').localeCompare(b.name || '');
    });
  }, [Nominal_Roll_archives, filterRegion, filterStation, canViewGlobal]);

  const currentRollDataset = useMemo(() => {
    return viewMode === 'archive' ? filteredNominal_Roll_archives : filteredRolls;
  }, [viewMode, filteredRolls, filteredNominal_Roll_archives]);

  const availableUpdateRolls = useMemo(() => {
    return (Array.isArray(Nominal_Rolls) ? Nominal_Rolls : []).filter(n => {
      const fNumVal = n.fnum || n.f_num || '';
      if (!['ADMIN', 'SUPER_ADMIN'].includes(currentUser.role) && !canViewGlobal && n.region !== currentUser.region) return false;
      if (updateSearch) {
        const query = updateSearch.toLowerCase();
        return (fNumVal && fNumVal.toLowerCase().includes(query)) || 
               (n.name && n.name.toLowerCase().includes(query)) || 
               (n.ipps && String(n.ipps).includes(query));
      }
      return true;
    });
  }, [Nominal_Rolls, currentUser, updateSearch, canViewGlobal]);

  const calculatedMetrics = useMemo(() => {
      if (!showAnalytics) return [];
      const grouped = {};
       
      currentRollDataset.forEach(n => {
          let key = 'Unknown';
          const sexStr = (n.sex || '').trim().toUpperCase();
          const ninStr = (n.nin || '').trim().toUpperCase();
          const isFemale = sexStr === 'F' || sexStr === 'FEMALE' || ninStr.startsWith('CF');
          const isMale = sexStr === 'M' || sexStr === 'MALE' || ninStr.startsWith('CM');
           
          const homeDistrict = n.homedist || n.home_dist || '';
          const bankBranch = n.bankbranch || n.bank_branch || '';
          const educLevel = n.educlevel || n.educ_level || '';
           
          if (metricCategory === 'RANK') key = n.rank ? n.rank.trim().toUpperCase() : 'UNRANKED';
          else if (metricCategory === 'UNIT') key = `${n.station || 'UNKNOWN'} ${n.section ? '- ' + n.section : ''}`.trim();
          else if (metricCategory === 'SEX') key = isFemale ? 'FEMALE' : (isMale ? 'MALE' : 'UNSPECIFIED');
          else if (metricCategory === 'BANK') key = bankBranch ? bankBranch.trim().toUpperCase() : 'BANK UNKNOWN';
          else if (metricCategory === 'DISTRICT') key = homeDistrict ? homeDistrict.trim().toUpperCase() : 'DISTRICT UNKNOWN';
          else if (metricCategory === 'TRIBE') key = n.tribe ? n.tribe.trim().toUpperCase() : 'TRIBE UNKNOWN';
          else if (metricCategory === 'EDUCATION') key = parseEducationLevel(educLevel);

          else if (metricCategory === 'AGE') {
              if (n.dob) {
                  const birthYear = new Date(n.dob).getFullYear();
                  if (!isNaN(birthYear)) {
                      const age = new Date().getFullYear() - birthYear;
                      key = age < 30 ? '18-29 Years' : age < 40 ? '30-39 Years' : age < 50 ? '40-49 Years' : '50+ Years';
                  } else {
                      key = 'Age Not Recorded';
                  }
              } else { 
                  key = 'Age Not Recorded'; 
              }
          }
           
          if (!grouped[key]) grouped[key] = { category: key, total: 0, male: 0, female: 0, unknown: 0 };
          grouped[key].total += 1;
          if (isFemale) grouped[key].female += 1;
          else if (isMale) grouped[key].male += 1;
          else grouped[key].unknown += 1;
      });

      const resultsArray = Object.values(grouped);

      if (metricCategory === 'RANK') {
          return resultsArray.sort((a, b) => getRankWeight(a.category) - getRankWeight(b.category));
      } else {
          return resultsArray.sort((a, b) => b.total - a.total);
      }
  }, [currentRollDataset, metricCategory, showAnalytics]);

  const metricsData = useMemo(() => {
    let maleCount = 0;
    let femaleCount = 0;
    const uniqueStations = {};

    currentRollDataset.forEach(n => {
      const sexStr = (n.sex || '').trim().toUpperCase();
      const ninStr = (n.nin || '').trim().toUpperCase();
       
      if (sexStr === 'F' || sexStr === 'FEMALE' || ninStr.startsWith('CF')) {
        femaleCount++;
      } else if (sexStr === 'M' || sexStr === 'MALE' || ninStr.startsWith('CM')) {
        maleCount++;
      }

      if (n.station) {
        uniqueStations[n.station] = true;
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
    <div className="p-6 max-w-[1600px] mx-auto space-y-6 relative z-10">
      <div className="text-center mb-8 flex flex-col items-center">
        <img src="/upf_badge.png" alt="UPF Logo" className="w-16 h-16 mb-3 object-contain contrast-200 brightness-75 drop-shadow-sm" onError={(e) => { e.target.style.display = 'none'; }} />
        <h1 className="text-3xl font-extrabold text-gray-700 dark:text-slate-100 tracking-tight">Master Nominal Roll</h1>
        <h3 className="text-lg text-indigo-500 dark:text-indigo-400 mt-2 font-medium">Man-Power Auditing & Deployment Registry</h3>
      </div>
       
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-4 mb-6">
        <div className="flex flex-col md:flex-row justify-between items-center mb-4 border-b border-gray-200 dark:border-slate-700 pb-2">
          <h3 className="font-bold text-slate-800 dark:text-slate-100 flex items-center">
            <BarChart3 className="w-5 h-5 mr-2 text-blue-600 dark:text-blue-400"/> 
            Personnel Metrics Dashboard ({viewMode === 'archive' ? 'Archived Records' : 'Active Roll'})
          </h3>
          <div className="flex space-x-2 mt-2 md:mt-0">
             <button onClick={() => { setViewMode('active'); setShowAnalytics(false); setBulkSelectMode(false); }} className={`px-4 py-1.5 text-xs font-bold rounded shadow-sm transition-colors cursor-pointer ${viewMode === 'active' && !showAnalytics ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-600'}`}>Active Roll</button>
             <button onClick={() => { setViewMode('archive'); setShowAnalytics(false); setBulkSelectMode(false); }} className={`px-4 py-1.5 text-xs font-bold rounded shadow-sm transition-colors cursor-pointer ${viewMode === 'archive' && !showAnalytics ? 'bg-red-700 text-white' : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-600'}`}>Archived</button>
             <button onClick={() => setShowAnalytics(!showAnalytics)} className={`px-4 py-1.5 text-xs font-bold rounded shadow-sm transition-colors cursor-pointer ${showAnalytics ? 'bg-indigo-600 text-white' : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-600'}`}>
                {showAnalytics ? 'Close Analytics' : 'Analytics'}
             </button>
          </div>
        </div>

        {!showAnalytics && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
             <MetricCard title={viewMode === 'archive' ? "Total Archived" : "Total Personnel"} value={metricsData.total} colorClass={viewMode === 'archive' ? "text-red-700 dark:text-red-400" : "text-blue-700 dark:text-blue-400"} />
             <MetricCard title="Male Officers" value={metricsData.male} colorClass="text-indigo-600 dark:text-indigo-400" />
             <MetricCard title="Female Officers" value={metricsData.female} colorClass="text-pink-600 dark:text-pink-400" />
             <MetricCard title="Unassigned Sex" value={metricsData.unassigned} colorClass="text-slate-400 dark:text-slate-400" />
             <MetricCard title="Stations" value={metricsData.stations} colorClass="text-emerald-600 dark:text-emerald-400" />
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-5 space-y-5">
          {canEditRecords && (
            <>
              <div className="bg-white dark:bg-slate-800 p-3 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 space-y-2 overflow-hidden">
                <div>
                  <h4 className="font-bold text-gray-800 dark:text-slate-100 text-sm flex items-center">
                    <Upload className="w-4 h-4 mr-2 text-blue-600 dark:text-blue-400 shrink-0" /> Batch Excel / Multi-File Import
                  </h4>
                </div>
                 
                <div className="bg-slate-50 dark:bg-slate-900 p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-[10px] font-mono text-slate-700 dark:text-slate-300 flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                  <span className="bg-white dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700 shadow-sm font-bold">sn</span>
                  <span className="bg-white dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700 shadow-sm font-bold">f_num</span>
                  <span className="bg-white dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700 shadow-sm font-bold">rank</span>
                  <span className="bg-white dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700 shadow-sm font-bold">name</span>
                  <span className="bg-white dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700 shadow-sm font-bold">sex</span>
                  <span className="bg-white dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700 shadow-sm font-bold">position</span>
                  <span className="bg-white dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700 shadow-sm font-bold">dob</span>
                  <span className="bg-white dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700 shadow-sm font-bold">doe</span>
                  <span className="bg-white dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700 shadow-sm font-bold">do_post</span>
                  <span className="bg-white dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700 shadow-sm font-bold">do_pro</span>
                  <span className="bg-white dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700 shadow-sm font-bold">contact</span>
                  <span className="bg-white dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700 shadow-sm font-bold">educ_level</span>
                  <span className="bg-white dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700 shadow-sm font-bold">ipps</span>
                  <span className="bg-white dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700 shadow-sm font-bold">tin</span>
                  <span className="bg-white dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700 shadow-sm font-bold">nin</span>
                  <span className="bg-white dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700 shadow-sm font-bold">home_dist</span>
                  <span className="bg-white dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700 shadow-sm font-bold">tribe</span>
                  <span className="bg-white dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700 shadow-sm font-bold">acc_no</span>
                  <span className="bg-white dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700 shadow-sm font-bold">bank_branch</span>
                  <span className="bg-white dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700 shadow-sm font-bold">station</span>
                  <span className="bg-white dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700 shadow-sm font-bold">district</span>
                  <span className="bg-white dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700 shadow-sm font-bold">region</span>
                  <span className="bg-white dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700 shadow-sm font-bold">section</span>
                  <span className="bg-white dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700 shadow-sm font-bold">dir</span>
                  <span className="bg-white dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700 shadow-sm font-bold">status</span>
                </div>
                <BulkNominalRollUpload multiple onUploadSuccess={() => window.location.reload()} />
              </div>

              <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden">
                <div className="bg-slate-900 dark:bg-slate-950 px-4 py-2.5 border-b border-gray-200 dark:border-slate-700 flex justify-between items-center">
                  <h3 className="text-white text-sm font-semibold flex items-center"><Users className="w-4 h-4 mr-2 text-blue-400" /> ⚙️ Log Personnel</h3>
                </div>
                <div className="p-4 space-y-4">
                  <div className="flex space-x-2 bg-gray-100 dark:bg-slate-900 p-1 rounded-lg">
                    <button type="button" onClick={() => handleOperationToggle('new')} className={`flex-1 py-1.5 text-xs font-bold rounded transition-all cursor-pointer ${operation === 'new' ? 'bg-white dark:bg-slate-800 shadow text-blue-700 dark:text-blue-400' : 'text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200'}`}><PlusCircle className="w-3.5 h-3.5 inline mr-1" /> Register New</button>
                    <button type="button" onClick={() => handleOperationToggle('update')} className={`flex-1 py-1.5 text-xs font-bold rounded transition-all cursor-pointer ${operation === 'update' ? 'bg-white dark:bg-slate-800 shadow text-blue-700 dark:text-blue-400' : 'text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200'}`}><Edit className="w-3.5 h-3.5 inline mr-1" /> Update Existing</button>
                  </div>

                  {notification && <div className={`px-3 py-2 rounded-lg flex items-center text-xs ${notification.includes('Error') || notification.includes('❌') ? 'bg-red-50 border border-red-200 text-red-800' : 'bg-green-50 border border-green-200 text-green-800'}`}>{notification.includes('Error') || notification.includes('❌') ? <AlertTriangle className="w-4 h-4 mr-2 text-red-500 shrink-0" /> : <CheckCircle className="w-4 h-4 mr-2 text-green-500 shrink-0" />}<span className="font-medium">{notification}</span></div>}

                  {operation === 'update' && (
                    <div className="bg-blue-50 dark:bg-slate-900 border border-blue-200 dark:border-slate-700 rounded-lg p-2.5">
                      <label className="block text-[11px] font-bold text-blue-800 dark:text-blue-400 mb-1.5">🔍 Search & Select Officer to Update</label>
                      <input type="text" placeholder="Search by Force No, Name, IPPS..." value={updateSearch} onChange={e => setUpdateSearch(e.target.value)} className="w-full text-xs p-1.5 mb-1.5 border border-blue-200 dark:border-slate-700 rounded outline-none focus:ring-1 focus:ring-blue-400 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100" />
                      <div className="max-h-32 overflow-y-auto bg-white dark:bg-slate-800 border border-blue-100 dark:border-slate-700 rounded custom-scrollbar">
                        {availableUpdateRolls.length === 0 ? <div className="p-2 text-[11px] text-gray-500 dark:text-slate-400 text-center">No personnel found.</div> : availableUpdateRolls.map(n => (
                            <div key={n.sn || n.fnum} onClick={() => populateUpdateForm(n)} className={`p-1.5 text-[11px] border-b dark:border-slate-700 cursor-pointer transition-colors ${formData.sn === n.sn ? 'bg-blue-600 text-white font-bold' : 'hover:bg-blue-50 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-200'}`}>
                              <span className={formData.sn === n.sn ? 'text-blue-200' : 'text-gray-400 dark:text-slate-400'}>F/NO: {n.fnum || n.f_num}</span> | <span className={formData.sn === n.sn ? 'text-white' : 'font-bold text-blue-700 dark:text-blue-400'}>{n.name}</span>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                   
                  <form onSubmit={handleFormSubmit} className="space-y-3">
                    {operation === 'update' && (formData.sn || formData.fnum) && (
                      <div className="bg-red-50 dark:bg-red-950/40 p-3 rounded-lg border border-red-200 dark:border-red-900 space-y-2.5 mb-4 shadow-sm">
                        <h4 className="text-[11px] font-bold text-red-700 dark:text-red-400 uppercase border-b border-red-200 dark:border-red-900 pb-1 flex items-center"><AlertTriangle size={12} className="mr-1.5"/> Archive / Remove</h4>
                        
                        <div className="space-y-2">
                            <div>
                                <label className="block text-[10px] font-bold text-red-800 dark:text-red-300 mb-0.5">Removal Reason *</label>
                                <select value={archiveReason} onChange={(e) => setArchiveReason(e.target.value)} className="w-full text-xs border-red-300 dark:border-red-900 rounded shadow-sm border py-1.5 px-2 font-bold text-red-700 dark:text-red-400 outline-none focus:ring-1 focus:ring-red-400 bg-white dark:bg-slate-800">
                                    <option value="TRANSFERRED">Transferred</option>
                                    <option value="DEATH">Death</option>
                                    <option value="DISMISSAL">Dismissal</option>
                                    <option value="DESERTION">Desertion</option>
                                    <option value="RETIREMENT">Retirement</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-[10px] font-bold text-red-800 dark:text-red-300 mb-0.5">Destination / Date Context *</label>
                                <input 
                                    type="text"
                                    placeholder={archiveReason === 'TRANSFERRED' ? "e.g. CPS Kampala to Arua" : "e.g. 15/08/2026 at Mulago"}
                                    value={archiveDetail}
                                    onChange={(e) => setArchiveDetail(e.target.value)}
                                    className="w-full text-xs border border-red-300 dark:border-red-900 rounded p-1.5 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 outline-none"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-[10px] font-bold text-red-800 dark:text-red-300 mb-0.5">Correspondence Ref (Message / Letter) *</label>
                                <input 
                                    type="text"
                                    placeholder="e.g. CR/123/2026 or POL/MSG/89"
                                    value={corrRef}
                                    onChange={(e) => setCorrRef(e.target.value)}
                                    className="w-full text-xs border border-red-300 dark:border-red-900 rounded p-1.5 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-mono outline-none"
                                    required
                                />
                            </div>

                            <button type="button" onClick={handleArchivePersonnel} className="w-full bg-red-600 hover:bg-red-700 text-white py-2 rounded font-bold text-xs shadow transition border border-red-800 cursor-pointer mt-1">Move to Archive</button>
                        </div>
                      </div>
                    )}

                    {operation === 'update' && (formData.sn || formData.fnum) && <div className="bg-slate-800 text-white text-[11px] font-bold px-2.5 py-1.5 rounded">Editing: {formData.fnum}</div>}
                     
                    <div className="bg-gray-50 dark:bg-slate-900 p-3 rounded-lg border border-gray-200 dark:border-slate-700 space-y-2.5">
                      <h4 className="text-[10px] font-bold text-gray-500 dark:text-slate-400 uppercase border-b dark:border-slate-700 pb-0.5">1. Identifiers</h4>
                      <div className="grid grid-cols-2 gap-2">
                        <div><label className="block text-[10px] font-bold text-gray-700 dark:text-slate-300 mb-0.5">F/NO. *</label><input type="text" name="fnum" value={formData.fnum} onChange={handleInputChange} required className="w-full text-xs border-gray-300 dark:border-slate-700 rounded shadow-sm border py-1.5 px-2 uppercase bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100" /></div>
                        <div><label className="block text-[10px] font-bold text-gray-700 dark:text-slate-300 mb-0.5">IPPS NO. *</label><input type="text" name="ipps" value={formData.ipps} onChange={handleInputChange} required className="w-full text-xs border-gray-300 dark:border-slate-700 rounded shadow-sm border py-1.5 px-2 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100" /></div>
                        <div className="col-span-2"><label className="block text-[10px] font-bold text-gray-700 dark:text-slate-300 mb-0.5">NAME *</label><input type="text" name="name" value={formData.name} onChange={handleInputChange} required className="w-full text-xs border-gray-300 dark:border-slate-700 rounded shadow-sm border py-1.5 px-2 uppercase bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100" /></div>
                        <div><label className="block text-[10px] font-bold text-gray-700 dark:text-slate-300 mb-0.5">RANK *</label><input type="text" name="rank" value={formData.rank} onChange={handleInputChange} required className="w-full text-xs border-gray-300 dark:border-slate-700 rounded shadow-sm border py-1.5 px-2 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100" /></div>
                        <div><label className="block text-[10px] font-bold text-gray-700 dark:text-slate-300 mb-0.5">SEX</label><select name="sex" value={formData.sex} onChange={handleInputChange} className="w-full text-xs border-gray-300 dark:border-slate-700 rounded shadow-sm border py-1.5 px-2 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"><option>MALE</option><option>FEMALE</option></select></div>
                        <div><label className="block text-[10px] font-bold text-gray-700 dark:text-slate-300 mb-0.5">TIN NO.</label><input type="text" name="tin" value={formData.tin} onChange={handleInputChange} className="w-full text-xs border-gray-300 dark:border-slate-700 rounded shadow-sm border py-1.5 px-2 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100" /></div>
                        <div><label className="block text-[10px] font-bold text-gray-700 dark:text-slate-300 mb-0.5">NIN</label><input type="text" name="nin" value={formData.nin} onChange={handleInputChange} className="w-full text-xs border-gray-300 dark:border-slate-700 rounded shadow-sm border py-1.5 px-2 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100" /></div>
                      </div>
                    </div>

                    <div className="bg-gray-50 dark:bg-slate-900 p-3 rounded-lg border border-gray-200 dark:border-slate-700 space-y-2.5">
                      <h4 className="text-[10px] font-bold text-gray-500 dark:text-slate-400 uppercase border-b dark:border-slate-700 pb-0.5">2. Service & Placement</h4>
                      <div className="grid grid-cols-2 gap-2">
                        <div><label className="block text-[10px] font-bold text-gray-700 dark:text-slate-300 mb-0.5">REGION *</label><select name="region" value={formData.region} onChange={handleInputChange} disabled={!['ADMIN', 'SUPER_ADMIN'].includes(currentUser.role)} required className="w-full text-xs border-gray-300 dark:border-slate-700 rounded shadow-sm border py-1.5 px-2 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 disabled:bg-gray-100 dark:disabled:bg-slate-900 disabled:text-gray-500">{['ADMIN', 'SUPER_ADMIN'].includes(currentUser.role) ? Object.keys(REGIONAL_HIERARCHY).map(reg => <option key={reg} value={reg}>{reg}</option>) : <option value={currentUser.region}>{currentUser.region}</option>}</select></div>
                        <div><label className="block text-[10px] font-bold text-gray-700 dark:text-slate-300 mb-0.5">DUTY STATION *</label><select name="station" value={formData.station} onChange={handleInputChange} disabled={!['ADMIN', 'SUPER_ADMIN', 'RPC', 'Deputy Commander'].includes(currentUser.role)} required className="w-full text-xs border-gray-300 dark:border-slate-700 rounded shadow-sm border py-1.5 px-2 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 disabled:bg-gray-100 dark:disabled:bg-slate-900 disabled:text-gray-500">{['ADMIN', 'SUPER_ADMIN', 'RPC', 'Deputy Commander'].includes(currentUser.role) ? (REGIONAL_HIERARCHY[formData.region] || []).map(stat => <option key={stat} value={stat}>{stat}</option>) : (<option value={currentUser.station}>{currentUser.station}</option>)}</select></div>
                        <div><label className="block text-[10px] font-bold text-gray-700 dark:text-slate-300 mb-0.5">POSITION *</label><input type="text" name="position" value={formData.position} onChange={handleInputChange} required className="w-full text-xs border-gray-300 dark:border-slate-700 rounded shadow-sm border py-1.5 px-2 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100" /></div>
                        <div><label className="block text-[10px] font-bold text-gray-700 dark:text-slate-300 mb-0.5">DISTRICT</label><input type="text" name="district" value={formData.district} onChange={handleInputChange} className="w-full text-xs border-gray-300 dark:border-slate-700 rounded shadow-sm border py-1.5 px-2 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100" /></div>
                        <div><label className="block text-[10px] font-bold text-gray-700 dark:text-slate-300 mb-0.5">SECTION</label><input type="text" name="section" value={formData.section} onChange={handleInputChange} className="w-full text-xs border-gray-300 dark:border-slate-700 rounded shadow-sm border py-1.5 px-2 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100" /></div>
                        <div><label className="block text-[10px] font-bold text-gray-700 dark:text-slate-300 mb-0.5">DIR (Directorate)</label><input type="text" name="dir" value={formData.dir} onChange={handleInputChange} className="w-full text-xs border-gray-300 dark:border-slate-700 rounded shadow-sm border py-1.5 px-2 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100" /></div>
                      </div>
                    </div>

                    <div className="bg-gray-50 dark:bg-slate-900 p-3 rounded-lg border border-gray-200 dark:border-slate-700 space-y-2.5">
                      <h4 className="text-[10px] font-bold text-gray-500 dark:text-slate-400 uppercase border-b dark:border-slate-700 pb-0.5">3. Demographics</h4>
                      <div className="grid grid-cols-2 gap-2">
                        <div><label className="block text-[10px] font-bold text-gray-700 dark:text-slate-300 mb-0.5">D.O.B</label><input type="date" name="dob" value={formData.dob} onChange={handleInputChange} className="w-full text-xs border-gray-300 dark:border-slate-700 rounded shadow-sm border py-1.5 px-2 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100" /></div>
                        <div><label className="block text-[10px] font-bold text-gray-700 dark:text-slate-300 mb-0.5">D.O.E</label><input type="date" name="doe" value={formData.doe} onChange={handleInputChange} className="w-full text-xs border-gray-300 dark:border-slate-700 rounded shadow-sm border py-1.5 px-2 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100" /></div>
                        <div><label className="block text-[10px] font-bold text-gray-700 dark:text-slate-300 mb-0.5">D.O. POST</label><input type="date" name="dopost" value={formData.dopost} onChange={handleInputChange} className="w-full text-xs border-gray-300 dark:border-slate-700 rounded shadow-sm border py-1.5 px-2 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100" /></div>
                        <div><label className="block text-[10px] font-bold text-gray-700 dark:text-slate-300 mb-0.5">D.O. PRO</label><input type="date" name="dopro" value={formData.dopro} onChange={handleInputChange} className="w-full text-xs border-gray-300 dark:border-slate-700 rounded shadow-sm border py-1.5 px-2 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100" /></div>
                        <div className="col-span-2"><label className="block text-[10px] font-bold text-gray-700 dark:text-slate-300 mb-0.5">CONTACT</label><input type="text" name="contact" value={formData.contact} onChange={handleInputChange} className="w-full text-xs border-gray-300 dark:border-slate-700 rounded shadow-sm border py-1.5 px-2 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100" /></div>
                        <div><label className="block text-[10px] font-bold text-gray-700 dark:text-slate-300 mb-0.5">EDUC LEVEL</label><input type="text" name="educlevel" value={formData.educlevel} onChange={handleInputChange} className="w-full text-xs border-gray-300 dark:border-slate-700 rounded shadow-sm border py-1.5 px-2 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100" /></div>
                        <div><label className="block text-[10px] font-bold text-gray-700 dark:text-slate-300 mb-0.5">HOME DIST</label><input type="text" name="homedist" value={formData.homedist} onChange={handleInputChange} className="w-full text-xs border-gray-300 dark:border-slate-700 rounded shadow-sm border py-1.5 px-2 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100" /></div>
                        <div><label className="block text-[10px] font-bold text-gray-700 dark:text-slate-300 mb-0.5">TRIBE</label><input type="text" name="tribe" value={formData.tribe} onChange={handleInputChange} className="w-full text-xs border-gray-300 dark:border-slate-700 rounded shadow-sm border py-1.5 px-2 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100" /></div>
                      </div>
                    </div>

                    <div className="bg-gray-50 dark:bg-slate-900 p-3 rounded-lg border border-gray-200 dark:border-slate-700 space-y-2.5">
                      <h4 className="text-[10px] font-bold text-gray-500 dark:text-slate-400 uppercase border-b dark:border-slate-700 pb-0.5">4. Financial & Status</h4>
                      <div className="grid grid-cols-2 gap-2">
                        <div><label className="block text-[10px] font-bold text-gray-700 dark:text-slate-300 mb-0.5">ACC. NO</label><input type="text" name="accno" value={formData.accno} onChange={handleInputChange} className="w-full text-xs border-gray-300 dark:border-slate-700 rounded shadow-sm border py-1.5 px-2 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100" /></div>
                        <div><label className="block text-[10px] font-bold text-gray-700 dark:text-slate-300 mb-0.5">BANK & BRANCH</label><input type="text" name="bankbranch" value={formData.bankbranch} onChange={handleInputChange} className="w-full text-xs border-gray-300 dark:border-slate-700 rounded shadow-sm border py-1.5 px-2 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100" /></div>
                        <div className="col-span-2"><label className="block text-[10px] font-bold text-gray-700 dark:text-slate-300 mb-0.5">STATUS</label><select name="status" value={formData.status} onChange={handleInputChange} className="w-full text-xs border-gray-300 dark:border-slate-700 rounded shadow-sm border py-1.5 px-2 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-bold"><option>ACTIVE</option><option>ON LEAVE</option><option>SUSPENDED</option></select></div>
                      </div>
                    </div>

                    {operation === 'new' && isArchivedReturnee && archiveDetails && (
                      <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 p-3 rounded-lg mt-3 animate-in fade-in zoom-in-95 shadow-sm">
                        <div className="flex items-start mb-2">
                          <AlertTriangle className="text-amber-500 w-4 h-4 mr-1.5 mt-0.5 shrink-0" />
                          <div>
                            <h4 className="text-xs font-bold text-amber-900 dark:text-amber-300">Historical Record Match</h4>
                            <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5">
                              Found in archives: 
                              <span className="font-mono bg-amber-100 dark:bg-amber-900 px-1 py-0.5 rounded mx-1 font-bold text-amber-900 dark:text-amber-200 border border-amber-200 dark:border-amber-800">
                                {archiveDetails.old_rank} {archiveDetails.old_fnum}
                              </span>
                            </p>
                          </div>
                        </div>
                         
                        <div className="space-y-3 bg-white dark:bg-slate-800 p-3 rounded-md border border-amber-100 dark:border-amber-900">
                          <div>
                            <label className="block text-[10px] font-bold text-slate-700 dark:text-slate-300 mb-0.5">Re-integration Authority / Reason *</label>
                            <input
                              type="text"
                              required
                              value={customReason}
                              onChange={(e) => setCustomReason(e.target.value)}
                              placeholder="e.g., Deployed from HR HQs back to KMP..."
                              className="w-full text-xs py-1.5 px-2 border border-slate-300 dark:border-slate-700 rounded shadow-sm focus:ring-1 focus:ring-amber-500 outline-none bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
                            />
                          </div>
                           
                          <div>
                            <label className="block text-[10px] font-bold text-slate-700 dark:text-slate-300 mb-0.5 flex items-center">
                              Previous Force No. <span className="text-slate-400 font-normal ml-1">(If promoted to Gazetted File No.)</span>
                            </label>
                            <div className="flex flex-col sm:flex-row sm:items-center space-y-1.5 sm:space-y-0 sm:space-x-1.5">
                              <input
                                type="text"
                                value={previousFnum}
                                onChange={(e) => setPreviousFnum(e.target.value)}
                                placeholder="Leave blank if unchanged"
                                className="flex-1 text-xs py-1.5 px-2 border border-slate-300 dark:border-slate-700 rounded shadow-sm focus:ring-1 focus:ring-amber-500 outline-none uppercase bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
                              />
                              {previousFnum && (
                                <div className="flex items-center text-[9px] font-bold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900 px-1.5 py-1 rounded border border-amber-200 dark:border-amber-800">
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
            </>
          )}
        </div>

        <div className="lg:col-span-7 space-y-4">
          {viewMode === 'active' && canEditRecords && (
            <div className="bg-slate-50 dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700 flex flex-col justify-between items-stretch gap-3">
              <div className="flex justify-between items-center">
                  <button
                      onClick={() => { setBulkSelectMode(!bulkSelectMode); setSelectedOfficers([]); }}
                      className={`text-xs font-bold px-4 py-2 rounded-lg transition-colors border shadow-sm cursor-pointer ${bulkSelectMode ? 'bg-slate-800 text-white border-slate-900 dark:bg-slate-900' : 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-600'}`}
                  >
                      {bulkSelectMode ? 'Cancel Bulk Select' : '☑️ Enable Bulk Archive'}
                  </button>
                  {bulkSelectMode && selectedOfficers.length > 0 && (
                      <span className="text-xs font-black text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950 px-3 py-1 rounded">
                        {selectedOfficers.length} Selected
                      </span>
                  )}
              </div>
               
              {bulkSelectMode && selectedOfficers.length > 0 && (
                  <div className="flex flex-col sm:flex-row items-center gap-2 animate-in fade-in slide-in-from-left-4 bg-white dark:bg-slate-900 p-3 rounded-lg shadow-sm border border-red-200 dark:border-red-900">
                      <select
                          value={bulkArchiveReason}
                          onChange={(e) => setBulkArchiveReason(e.target.value)}
                          className="w-full sm:w-auto text-xs border border-slate-300 dark:border-slate-700 rounded p-1.5 outline-none font-bold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 cursor-pointer"
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
                          className="w-full sm:flex-1 text-xs border border-slate-300 dark:border-slate-700 rounded p-1.5 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
                      />

                      <input 
                          type="text"
                          placeholder="Correspondence Ref..."
                          value={bulkCorrRef}
                          onChange={(e) => setBulkCorrRef(e.target.value)}
                          className="w-full sm:w-40 text-xs border border-slate-300 dark:border-slate-700 rounded p-1.5 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-mono"
                      />

                      <button
                          onClick={handleBulkArchive}
                          disabled={isBulkArchiving}
                          className="w-full sm:w-auto text-xs font-bold bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
                      >
                          {isBulkArchiving ? 'Archiving...' : `Archive (${selectedOfficers.length})`}
                      </button>
                  </div>
              )}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3">
            <select value={filterRegion} onChange={(e) => { setFilterRegion(e.target.value); setFilterStation('ALL STATIONS'); }} disabled={!canViewGlobal} className="border rounded-lg px-3 py-2 text-sm shadow-sm bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border-slate-300 dark:border-slate-700 disabled:bg-gray-100 dark:disabled:bg-slate-900 disabled:text-gray-500 w-full sm:w-auto outline-none focus:border-blue-500 cursor-pointer">
              {canViewGlobal ? (
                <><option value="ALL REGIONS">ALL REGIONS</option>{Array.from(new Set([...Object.keys(REGIONAL_HIERARCHY), ...(filteredRolls || []).map(n => n.region).filter(Boolean)])).sort().map(reg => <option key={reg} value={reg}>{reg}</option>)}</>
              ) : <option value={currentUser?.region}>{currentUser?.region}</option>}
            </select>
            <select value={filterStation} onChange={(e) => setFilterStation(e.target.value)} disabled={!(isCommandOrHR || canViewGlobal)} className="border rounded-lg px-3 py-2 text-sm shadow-sm bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border-slate-300 dark:border-slate-700 disabled:bg-gray-100 dark:disabled:bg-slate-900 disabled:text-gray-500 w-full sm:w-auto outline-none focus:border-blue-500 cursor-pointer">
              {(isCommandOrHR || canViewGlobal) ? (
                <><option value="ALL STATIONS">ALL STATIONS</option>{Array.from(new Set([...(REGIONAL_HIERARCHY[filterRegion] || []), ...(filteredRolls || []).filter(n => filterRegion === 'ALL REGIONS' || n.region === filterRegion).map(n => n.station).filter(Boolean)])).sort().map(stat => <option key={stat} value={stat}>{stat}</option>)}</>
              ) : <option value={currentUser?.station}>{currentUser?.station}</option>}
            </select>
          </div>

          {showAnalytics ? (
            <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm animate-in fade-in zoom-in-95 duration-200">
                <div className="flex justify-between items-center mb-6 border-b border-gray-200 dark:border-slate-700 pb-4">
                    <h3 className="font-extrabold text-lg text-indigo-900 dark:text-indigo-300 flex items-center"><PieChart className="mr-2"/> {viewMode === 'archive' ? 'Archived Roll Analytics' : 'Active Roll Analytics'}</h3>
                    <div className="flex items-center space-x-2 bg-indigo-50 dark:bg-slate-900 p-2 rounded-lg border border-indigo-100 dark:border-slate-700">
                        <label className="text-xs font-bold text-indigo-800 dark:text-indigo-300 uppercase">Categorize By:</label>
                        <select value={metricCategory} onChange={e => setMetricCategory(e.target.value)} className="border border-indigo-300 dark:border-slate-700 rounded p-1 text-sm font-bold text-indigo-700 dark:text-indigo-300 outline-none bg-white dark:bg-slate-800 cursor-pointer">
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
                <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-700 border border-gray-200 dark:border-slate-700 rounded-lg overflow-hidden">
                    <thead className="bg-indigo-50 dark:bg-slate-900">
                        <tr>
                            <th className="px-4 py-3 text-left text-xs font-bold text-indigo-800 dark:text-indigo-300 uppercase">{metricCategory}</th>
                            <th className="px-4 py-3 text-center text-xs font-bold text-indigo-800 dark:text-indigo-300 uppercase">Total Personnel</th>
                            <th className="px-4 py-3 text-center text-xs font-bold text-indigo-800 dark:text-indigo-300 uppercase">Male</th>
                            <th className="px-4 py-3 text-center text-xs font-bold text-indigo-800 dark:text-indigo-300 uppercase">Female</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-slate-800 divide-y divide-gray-100 dark:divide-slate-700">
                        {calculatedMetrics.map(m => (
                            <tr key={m.category} className="hover:bg-indigo-50/30 dark:hover:bg-slate-700/50 transition-colors">
                                <td className="px-4 py-3 text-sm font-bold text-gray-800 dark:text-slate-100">{m.category}</td>
                                <td className="px-4 py-3 text-sm text-center font-extrabold text-indigo-600 dark:text-indigo-400">{m.total}</td>
                                <td className="px-4 py-3 text-sm text-center font-medium text-blue-600 dark:text-blue-400">{m.male}</td>
                                <td className="px-4 py-3 text-sm text-center font-medium text-pink-600 dark:text-pink-400">{m.female}</td>
                            </tr>
                        ))}
                        {calculatedMetrics.length === 0 && <tr><td colSpan="4" className="text-center p-4 text-gray-500 dark:text-slate-400 font-medium">No data available for this filter constraint.</td></tr>}
                    </tbody>
                </table>
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm overflow-hidden">
              <div className="p-3 border-b border-slate-200 dark:border-slate-700 font-bold text-xs text-slate-800 dark:text-slate-200">
                {viewMode === 'active' ? "Active Nominal Roll (Full Screen Mode)" : "Archived Personnel Ledger"}
              </div>
              <div className="overflow-x-auto w-full">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-700">
                  <thead className="bg-gray-50 dark:bg-slate-900 sticky top-0 z-10">
                    <tr>
                      {bulkSelectMode && viewMode === 'active' && canEditRecords && (
                        <th className="px-3 py-3 text-center text-xs font-bold text-gray-500 dark:text-slate-400 uppercase whitespace-nowrap">
                           <input 
                             type="checkbox" 
                             checked={selectedOfficers.length === filteredRolls.length && filteredRolls.length > 0}
                             onChange={(e) => {
                                 if (e.target.checked) setSelectedOfficers(filteredRolls.map(n => n.f_num || n.fnum));
                                 else setSelectedOfficers([]);
                             }}
                             className="w-4 h-4 cursor-pointer accent-red-600"
                           />
                        </th>
                      )}
                      <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 dark:text-slate-400 uppercase whitespace-nowrap">S/No</th>
                      <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 dark:text-slate-400 uppercase whitespace-nowrap">F/NO</th>
                      <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 dark:text-slate-400 uppercase whitespace-nowrap">Rank</th>
                      <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 dark:text-slate-400 uppercase whitespace-nowrap">Name</th>
                      <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 dark:text-slate-400 uppercase whitespace-nowrap">Sex</th>
                      <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 dark:text-slate-400 uppercase whitespace-nowrap">Position</th>
                      <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 dark:text-slate-400 uppercase whitespace-nowrap">DOB</th>
                      <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 dark:text-slate-400 uppercase whitespace-nowrap">DOE</th>
                      <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 dark:text-slate-400 uppercase whitespace-nowrap">D.O. Post</th>
                      <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 dark:text-slate-400 uppercase whitespace-nowrap">D.O. Pro</th>
                      <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 dark:text-slate-400 uppercase whitespace-nowrap">Contact</th>
                      <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 dark:text-slate-400 uppercase whitespace-nowrap">Educ Level</th>
                      <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 dark:text-slate-400 uppercase whitespace-nowrap">IPPS</th>
                      <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 dark:text-slate-400 uppercase whitespace-nowrap">TIN</th>
                      <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 dark:text-slate-400 uppercase whitespace-nowrap">NIN</th>
                      <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 dark:text-slate-400 uppercase whitespace-nowrap">Home Dist</th>
                      <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 dark:text-slate-400 uppercase whitespace-nowrap">Tribe</th>
                      <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 dark:text-slate-400 uppercase whitespace-nowrap">Acc No</th>
                      <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 dark:text-slate-400 uppercase whitespace-nowrap">Bank Branch</th>
                      <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 dark:text-slate-400 uppercase whitespace-nowrap">Station</th>
                      <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 dark:text-slate-400 uppercase whitespace-nowrap">District</th>
                      <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 dark:text-slate-400 uppercase whitespace-nowrap">Region</th>
                      <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 dark:text-slate-400 uppercase whitespace-nowrap">Section</th>
                      <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 dark:text-slate-400 uppercase whitespace-nowrap">Dir</th>
                      <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 dark:text-slate-400 uppercase whitespace-nowrap">Status</th>
                      <th className="px-3 py-3 text-left text-xs font-bold text-gray-500 dark:text-slate-400 uppercase whitespace-nowrap">Last Updated By</th>
                      {viewMode === 'archive' && (
                        <>
                          <th className="px-3 py-3 text-left text-xs font-bold text-red-600 dark:text-red-400 uppercase whitespace-nowrap bg-red-50 dark:bg-red-950">Archive Reason</th>
                          <th className="px-3 py-3 text-left text-xs font-bold text-red-600 dark:text-red-400 uppercase whitespace-nowrap bg-red-50 dark:bg-red-950">Archive Date</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-slate-800 divide-y divide-gray-200 dark:divide-slate-700">
                    {(viewMode === 'active' ? filteredRolls : filteredNominal_Roll_archives).map((n, index) => (
                      <tr 
                        key={n.sn || n.id || n.f_num || n.fnum} 
                        className={`${viewMode === 'archive' ? 'bg-slate-50 dark:bg-slate-900/50 opacity-80' : bulkSelectMode && selectedOfficers.includes(n.f_num || n.fnum) ? 'bg-red-50 dark:bg-red-950/40' : 'hover:bg-blue-50 dark:hover:bg-slate-700'} transition-colors ${canEditRecords ? 'cursor-pointer' : ''}`} 
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
                            <td className="px-3 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                              <input 
                                type="checkbox" 
                                checked={selectedOfficers.includes(n.f_num || n.fnum)}
                                onChange={(e) => {
                                  const target = n.f_num || n.fnum;
                                  if (e.target.checked) setSelectedOfficers(prev => [...prev, target]);
                                  else setSelectedOfficers(prev => prev.filter(id => id !== target));
                                }}
                                className="w-4 h-4 cursor-pointer accent-red-600"
                              />
                            </td>
                        )}
                        <td className="px-3 py-2 whitespace-nowrap text-xs font-bold text-gray-900 dark:text-slate-100">{index + 1}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-xs font-bold text-blue-800 dark:text-blue-400">{n.f_num || n.fnum || ''}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-xs font-bold text-slate-800 dark:text-slate-100">{n.rank || ''}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-xs font-medium uppercase text-slate-800 dark:text-slate-100">{n.name || ''}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-xs text-slate-700 dark:text-slate-300">{n.sex || ''}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-700 dark:text-slate-300">{n.position || ''}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500 dark:text-slate-400">{n.dob || ''}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500 dark:text-slate-400">{n.doe || ''}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500 dark:text-slate-400">{n.do_post || n.dopost || n.dop || ''}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500 dark:text-slate-400">{n.do_pro || n.dopro || ''}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-xs text-slate-700 dark:text-slate-300">{n.contact || ''}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-xs text-slate-700 dark:text-slate-300">{n.educ_level || n.educlevel || ''}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-xs font-mono text-slate-700 dark:text-slate-300">{n.ipps || ''}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-xs text-slate-700 dark:text-slate-300">{n.tin || ''}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-xs text-slate-700 dark:text-slate-300">{n.nin || ''}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-xs text-slate-700 dark:text-slate-300">{n.home_dist || n.homedist || ''}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-xs text-slate-700 dark:text-slate-300">{n.tribe || ''}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-xs text-slate-700 dark:text-slate-300">{n.acc_no || n.accno || ''}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-xs text-slate-700 dark:text-slate-300">{n.bank_branch || n.bankbranch || ''}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-xs font-bold text-blue-700 dark:text-blue-400">{n.station || ''}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-xs text-slate-700 dark:text-slate-300">{n.district || ''}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-xs text-slate-700 dark:text-slate-300">{n.region || ''}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-xs text-slate-700 dark:text-slate-300">{n.section || ''}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-xs text-slate-700 dark:text-slate-300">{n.dir || ''}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-xs font-bold text-green-700 dark:text-green-400">{n.status || 'ACTIVE'}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500 dark:text-slate-400">{n.last_updated_by || ''}</td>
                        {viewMode === 'archive' && (
                          <>
                            <td className="px-3 py-2 whitespace-nowrap text-xs font-bold text-red-700 dark:text-red-400 bg-red-50/50 dark:bg-red-950/20">{n.archive_reason || ''}</td>
                            <td className="px-3 py-2 whitespace-nowrap text-xs text-red-500 dark:text-red-400 bg-red-50/50 dark:bg-red-950/20">{n.archive_date || ''}</td>
                          </>
                        )}
                      </tr>
                    ))}
                    {(viewMode === 'active' ? filteredRolls : filteredNominal_Roll_archives).length === 0 && (
                      <tr><td colSpan={viewMode === 'archive' ? "28" : (bulkSelectMode ? "27" : "26")} className="text-center py-6 text-gray-500 dark:text-slate-400 font-medium">No personnel records found in this view.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
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