import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  Users, PlusCircle, Edit, Upload, 
  BarChart3, PieChart 
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
             <MetricCard title={viewMode === 'archive' ? 'Archived Personnel' : 'Total Personnel'} value={metricsData.total} colorClass={viewMode === 'archive' ? 'text-red-700 dark:text-red-400' : 'text-blue-700 dark:text-blue-400'} />
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
                    <Upload className="w-4 h-4 mr-2 text-blue-600 dark:text-blue-400 shrink-0"/> Batch Excel / Multi-File Import
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
                </div>

                <BulkNominalRollUpload authFetch={authFetch} currentUser={currentUser} setNominal_Rolls={setNominal_Rolls} setNotification={setNotification} />
              </div>
            </>
          )}

          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-700 pb-3">
              <h3 className="font-bold text-gray-800 dark:text-slate-100 flex items-center text-sm uppercase tracking-wider">
                {operation === 'new' ? <PlusCircle className="w-4 h-4 mr-2 text-emerald-600 dark:text-emerald-400"/> : <Edit className="w-4 h-4 mr-2 text-blue-600 dark:text-blue-400"/>}
                {operation === 'new' ? 'Register New Officer' : 'Modify Existing Record'}
              </h3>
              {canEditRecords && (
                <div className="flex space-x-1 bg-slate-100 dark:bg-slate-900 p-1 rounded-lg">
                  <button type="button" onClick={() => handleOperationToggle('new')} className={`px-3 py-1 text-xs font-bold rounded cursor-pointer ${operation === 'new' ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-xs' : 'text-slate-500'}`}>New</button>
                  <button type="button" onClick={() => handleOperationToggle('update')} className={`px-3 py-1 text-xs font-bold rounded cursor-pointer ${operation === 'update' ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-xs' : 'text-slate-500'}`}>Update</button>
                </div>
              )}
            </div>

            {notification && (
              <div className="p-3 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200 text-xs rounded-lg flex items-center justify-between">
                <span>{notification}</span>
                <button onClick={() => setNotification(null)} className="text-blue-500 hover:text-blue-700 font-bold ml-2">×</button>
              </div>
            )}

            {operation === 'update' && (
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Select Officer to Modify</label>
                <input 
                  type="text" 
                  placeholder="Search by name, Force No (fnum), or IPPS..." 
                  value={updateSearch} 
                  onChange={(e) => setUpdateSearch(e.target.value)}
                  className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-gray-800 dark:text-slate-100 focus:outline-hidden focus:border-blue-500"
                />
                <div className="max-h-40 overflow-y-auto space-y-1 border border-slate-200 dark:border-slate-700 rounded-lg p-1 bg-slate-50/50 dark:bg-slate-900/50 custom-scrollbar">
                  {availableUpdateRolls.length === 0 ? (
                    <div className="p-2 text-center text-xs text-slate-400">No matching officers found</div>
                  ) : (
                    availableUpdateRolls.map(n => (
                      <div 
                        key={n.sn || n.fnum || n.f_num}
                        onClick={() => populateUpdateForm(n)}
                        className={`p-2 rounded cursor-pointer text-xs flex justify-between items-center transition-colors ${formData.fnum === (n.fnum || n.f_num) ? 'bg-blue-600 text-white font-medium' : 'hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'}`}
                      >
                        <span>{n.rank || ''} {n.name || ''} ({n.fnum || n.f_num})</span>
                        <span className="text-[10px] opacity-75">{n.station || ''}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            <form onSubmit={handleFormSubmit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-extrabold text-slate-500 dark:text-slate-400 uppercase">Force Number *</label>
                  <input type="text" name="fnum" required value={formData.fnum} onChange={handleInputChange} placeholder="e.g. 45892" className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-gray-800 dark:text-slate-100" />
                </div>
                <div>
                  <label className="text-[10px] font-extrabold text-slate-500 dark:text-slate-400 uppercase">Rank *</label>
                  <input type="text" name="rank" required value={formData.rank} onChange={handleInputChange} placeholder="e.g. AIP, PC, SP" className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-gray-800 dark:text-slate-100" />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-extrabold text-slate-500 dark:text-slate-400 uppercase">Full Name *</label>
                <input type="text" name="name" required value={formData.name} onChange={handleInputChange} placeholder="SURNAME Given Name" className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-gray-800 dark:text-slate-100" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-extrabold text-slate-500 dark:text-slate-400 uppercase">Sex *</label>
                  <select name="sex" value={formData.sex} onChange={handleInputChange} className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-gray-800 dark:text-slate-100">
                    <option value="MALE">MALE</option>
                    <option value="FEMALE">FEMALE</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-extrabold text-slate-500 dark:text-slate-400 uppercase">Position / Duties</label>
                  <input type="text" name="position" value={formData.position} onChange={handleInputChange} placeholder="e.g. OC Station" className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-gray-800 dark:text-slate-100" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-extrabold text-slate-500 dark:text-slate-400 uppercase">Region *</label>
                  <select name="region" value={formData.region} onChange={handleInputChange} className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-gray-800 dark:text-slate-100">
                    {Object.keys(REGIONAL_HIERARCHY).map(reg => (
                      <option key={reg} value={reg}>{reg}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-extrabold text-slate-500 dark:text-slate-400 uppercase">Station *</label>
                  <select name="station" value={formData.station} onChange={handleInputChange} className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-gray-800 dark:text-slate-100">
                    {(REGIONAL_HIERARCHY[formData.region] || []).map(st => (
                      <option key={st} value={st}>{st}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-extrabold text-slate-500 dark:text-slate-400 uppercase">IPPS Number</label>
                  <input type="text" name="ipps" value={formData.ipps} onChange={handleInputChange} placeholder="e.g. 123456" className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-gray-800 dark:text-slate-100" />
                </div>
                <div>
                  <label className="text-[10px] font-extrabold text-slate-500 dark:text-slate-400 uppercase">National ID (NIN)</label>
                  <input type="text" name="nin" value={formData.nin} onChange={handleInputChange} placeholder="CMxxxxxxxxxxxx" className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-gray-800 dark:text-slate-100" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-extrabold text-slate-500 dark:text-slate-400 uppercase">Date of Birth</label>
                  <input type="date" name="dob" value={formData.dob} onChange={handleInputChange} className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-gray-800 dark:text-slate-100" />
                </div>
                <div>
                  <label className="text-[10px] font-extrabold text-slate-500 dark:text-slate-400 uppercase">Date of Enlistment</label>
                  <input type="date" name="doe" value={formData.doe} onChange={handleInputChange} className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-gray-800 dark:text-slate-100" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-extrabold text-slate-500 dark:text-slate-400 uppercase">Date Posted to Station</label>
                  <input type="date" name="dopost" value={formData.dopost} onChange={handleInputChange} className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-gray-800 dark:text-slate-100" />
                </div>
                <div>
                  <label className="text-[10px] font-extrabold text-slate-500 dark:text-slate-400 uppercase">Date of Promotion</label>
                  <input type="date" name="dopro" value={formData.dopro} onChange={handleInputChange} className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-gray-800 dark:text-slate-100" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-extrabold text-slate-500 dark:text-slate-400 uppercase">Contact Number</label>
                  <input type="text" name="contact" value={formData.contact} onChange={handleInputChange} placeholder="e.g. 0770000000" className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-gray-800 dark:text-slate-100" />
                </div>
                <div>
                  <label className="text-[10px] font-extrabold text-slate-500 dark:text-slate-400 uppercase">Education Level</label>
                  <input type="text" name="educlevel" value={formData.educlevel} onChange={handleInputChange} placeholder="e.g. DEGREE" className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-gray-800 dark:text-slate-100" />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[10px] font-extrabold text-slate-500 dark:text-slate-400 uppercase">TIN Number</label>
                  <input type="text" name="tin" value={formData.tin} onChange={handleInputChange} placeholder="TIN" className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-gray-800 dark:text-slate-100" />
                </div>
                <div>
                  <label className="text-[10px] font-extrabold text-slate-500 dark:text-slate-400 uppercase">Home District</label>
                  <input type="text" name="homedist" value={formData.homedist} onChange={handleInputChange} placeholder="District" className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-gray-800 dark:text-slate-100" />
                </div>
                <div>
                  <label className="text-[10px] font-extrabold text-slate-500 dark:text-slate-400 uppercase">Tribe</label>
                  <input type="text" name="tribe" value={formData.tribe} onChange={handleInputChange} placeholder="Tribe" className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-gray-800 dark:text-slate-100" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-extrabold text-slate-500 dark:text-slate-400 uppercase">Account Number</label>
                  <input type="text" name="accno" value={formData.accno} onChange={handleInputChange} placeholder="Acc Number" className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-gray-800 dark:text-slate-100" />
                </div>
                <div>
                  <label className="text-[10px] font-extrabold text-slate-500 dark:text-slate-400 uppercase">Bank Branch</label>
                  <input type="text" name="bankbranch" value={formData.bankbranch} onChange={handleInputChange} placeholder="Bank Branch" className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-gray-800 dark:text-slate-100" />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[10px] font-extrabold text-slate-500 dark:text-slate-400 uppercase">District</label>
                  <input type="text" name="district" value={formData.district} onChange={handleInputChange} placeholder="Station District" className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-gray-800 dark:text-slate-100" />
                </div>
                <div>
                  <label className="text-[10px] font-extrabold text-slate-500 dark:text-slate-400 uppercase">Section</label>
                  <input type="text" name="section" value={formData.section} onChange={handleInputChange} placeholder="Section" className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-gray-800 dark:text-slate-100" />
                </div>
                <div>
                  <label className="text-[10px] font-extrabold text-slate-500 dark:text-slate-400 uppercase">Directorate</label>
                  <input type="text" name="dir" value={formData.dir} onChange={handleInputChange} placeholder="Directorate" className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-gray-800 dark:text-slate-100" />
                </div>
              </div>

              {operation === 'update' && (
                <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg space-y-2 mt-4">
                  <h4 className="text-xs font-bold text-red-800 dark:text-red-300">Archive / Separation Record Details</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-bold text-red-800 dark:text-red-300 uppercase">Separation Reason</label>
                      <select 
                        value={archiveReason} 
                        onChange={(e) => setArchiveReason(e.target.value)}
                        className="w-full p-2 bg-white dark:bg-slate-900 border border-red-200 dark:border-red-800 rounded text-xs text-gray-800 dark:text-slate-100 mt-1"
                      >
                        <option value="TRANSFERRED">TRANSFERRED</option>
                        <option value="RETIRED">RETIRED</option>
                        <option value="DISMISSED">DISMISSED</option>
                        <option value="ABSENTEEISM">ABSENTEEISM</option>
                        <option value="DECEASED">DECEASED</option>
                        <option value="RESIGNED">RESIGNED</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-red-800 dark:text-red-300 uppercase">Correspondence Ref</label>
                      <input 
                        type="text" 
                        value={corrRef} 
                        onChange={(e) => setCorrRef(e.target.value)} 
                        placeholder="e.g. Ref: AD.12/3" 
                        className="w-full p-2 bg-white dark:bg-slate-900 border border-red-200 dark:border-red-800 rounded text-xs text-gray-800 dark:text-slate-100 mt-1"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-red-800 dark:text-red-300 uppercase">Additional Remarks / Details</label>
                    <input 
                      type="text" 
                      value={archiveDetail} 
                      onChange={(e) => setArchiveDetail(e.target.value)} 
                      placeholder="e.g. To KMP Headquarters effective..." 
                      className="w-full p-2 bg-white dark:bg-slate-900 border border-red-200 dark:border-red-800 rounded text-xs text-gray-800 dark:text-slate-100 mt-1"
                    />
                  </div>
                </div>
              )}

              {isArchivedReturnee && (
                <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-700 rounded-lg space-y-2">
                  <h4 className="text-xs font-bold text-amber-800 dark:text-amber-300">Reintegration Authorization Required</h4>
                  <p className="text-[11px] text-amber-700 dark:text-amber-400">
                    This officer was previously archived. Reason: {archiveDetails?.archive_reason || 'Not specified'} on {archiveDetails?.archive_date || 'Unknown date'}.
                  </p>
                  <div>
                    <label className="text-[10px] font-bold text-amber-800 dark:text-amber-300 uppercase">Reintegration Reason / Authority Ref</label>
                    <input 
                      type="text" 
                      value={customReason} 
                      onChange={(e) => setCustomReason(e.target.value)} 
                      placeholder="e.g. Reinstated per Minute Ref..." 
                      className="w-full p-2 bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 rounded-lg text-xs text-gray-800 dark:text-slate-100 mt-1"
                    />
                  </div>
                </div>
              )}

              {canEditRecords && (
                <div className="pt-2 flex gap-2">
                  <button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold p-2.5 rounded-lg text-xs shadow-sm transition-colors cursor-pointer">
                    {operation === 'new' ? 'Save New Officer Record' : 'Save Changes'}
                  </button>
                  {operation === 'update' && formData.fnum && (
                    <button type="button" onClick={handleArchivePersonnel} className="bg-red-600 hover:bg-red-700 text-white font-bold px-4 py-2.5 rounded-lg text-xs shadow-sm transition-colors cursor-pointer" title="Move to Archives">
                      Archive
                    </button>
                  )}
                </div>
              )}
            </form>
          </div>
        </div>

        <div className="lg:col-span-7 space-y-4">
          {showAnalytics ? (
            <div className="space-y-4">
              <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center space-x-2">
                  <PieChart className="w-5 h-5 text-indigo-600 dark:text-indigo-400"/>
                  <h3 className="font-bold text-gray-800 dark:text-slate-100 text-sm uppercase">Analytics Breakdown</h3>
                </div>
                <div className="flex flex-wrap gap-1">
                  {['RANK', 'UNIT', 'SEX', 'BANK', 'DISTRICT', 'TRIBE', 'EDUCATION', 'AGE'].map(cat => (
                    <button 
                      key={cat} 
                      onClick={() => setMetricCategory(cat)} 
                      className={`px-3 py-1 text-xs font-bold rounded-lg cursor-pointer transition-colors ${metricCategory === cat ? 'bg-indigo-600 text-white shadow-xs' : 'bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800'}`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              <ExpandableTableCard title={`Distribution Records by ${metricCategory} (${currentRollDataset.length} Analyzed)`}>
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-900 text-slate-400 dark:text-slate-400 font-extrabold uppercase text-[10px] border-b border-slate-200 dark:border-slate-700 sticky top-0 z-10">
                      <th className="p-3">Category</th>
                      <th className="p-3 text-center">Total</th>
                      <th className="p-3 text-center">Male</th>
                      <th className="p-3 text-center">Female</th>
                      <th className="p-3 text-right">Percentage</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-700 text-gray-700 dark:text-slate-300">
                    {calculatedMetrics.length === 0 ? (
                      <tr>
                        <td colSpan="5" className="p-6 text-center text-slate-400">No data available for analytics</td>
                      </tr>
                    ) : (
                      calculatedMetrics.map((row, idx) => {
                        const percentage = currentRollDataset.length > 0 ? ((row.total / currentRollDataset.length) * 100).toFixed(1) : 0;
                        return (
                          <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
                            <td className="p-3 font-bold text-gray-800 dark:text-slate-200">{row.category}</td>
                            <td className="p-3 text-center font-black text-blue-600 dark:text-blue-400">{row.total}</td>
                            <td className="p-3 text-center">{row.male}</td>
                            <td className="p-3 text-center">{row.female}</td>
                            <td className="p-3 text-right">
                              <div className="flex items-center justify-end space-x-2">
                                <span className="font-semibold">{percentage}%</span>
                                <div className="w-16 bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
                                  <div className="bg-blue-600 h-full rounded-full" style={{ width: `${percentage}%` }}></div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </ExpandableTableCard>
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col h-[650px]">
              <div className="bg-slate-50 dark:bg-slate-900 p-4 border-b border-slate-200 dark:border-slate-700 flex flex-wrap justify-between items-center gap-3 shrink-0">
                <div className="flex items-center space-x-3">
                  <Users className="w-5 h-5 text-blue-600 dark:text-blue-400"/>
                  <div>
                    <h3 className="font-bold text-gray-800 dark:text-slate-100 text-sm uppercase tracking-wider">
                      {viewMode === 'archive' ? 'Archived Personnel Registry' : 'Active Personnel Registry'} ({currentRollDataset.length})
                    </h3>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  {canViewGlobal && (
                    <select 
                      value={filterRegion} 
                      onChange={(e) => { setFilterRegion(e.target.value); setFilterStation('ALL STATIONS'); }}
                      className="p-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold text-gray-700 dark:text-slate-300"
                    >
                      <option value="ALL REGIONS">ALL REGIONS</option>
                      {Object.keys(REGIONAL_HIERARCHY).map(reg => (
                        <option key={reg} value={reg}>{reg}</option>
                      ))}
                    </select>
                  )}

                  {(canViewGlobal || isCommandOrHR) && filterRegion !== 'ALL REGIONS' && (
                    <select 
                      value={filterStation} 
                      onChange={(e) => setFilterStation(e.target.value)}
                      className="p-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold text-gray-700 dark:text-slate-300"
                    >
                      <option value="ALL STATIONS">ALL STATIONS</option>
                      {(REGIONAL_HIERARCHY[filterRegion] || []).map(st => (
                        <option key={st} value={st}>{st}</option>
                      ))}
                    </select>
                  )}

                  {canEditRecords && viewMode === 'active' && (
                    <button 
                      onClick={() => setBulkSelectMode(!bulkSelectMode)} 
                      className={`px-3 py-1.5 text-xs font-bold rounded-lg cursor-pointer transition-colors ${bulkSelectMode ? 'bg-amber-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'}`}
                    >
                      {bulkSelectMode ? 'Cancel Bulk' : 'Bulk Select'}
                    </button>
                  )}
                </div>
              </div>

              {bulkSelectMode && selectedOfficers.length > 0 && (
                <div className="bg-amber-50 dark:bg-amber-950/40 p-3 border-b border-amber-200 dark:border-amber-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
                  <span className="text-xs font-bold text-amber-800 dark:text-amber-300">{selectedOfficers.length} officers selected for bulk archive</span>
                  <div className="flex items-center space-x-2">
                    <select 
                      value={bulkArchiveReason} 
                      onChange={(e) => setBulkArchiveReason(e.target.value)}
                      className="p-1.5 bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 rounded text-xs"
                    >
                      <option value="TRANSFERRED">TRANSFERRED</option>
                      <option value="RETIRED">RETIRED</option>
                      <option value="DISMISSED">DISMISSED</option>
                      <option value="ABSENTEEISM">ABSENTEEISM</option>
                      <option value="DECEASED">DECEASED</option>
                    </select>
                    <button 
                      onClick={handleBulkArchive}
                      disabled={isBulkArchiving}
                      className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded shadow-sm cursor-pointer disabled:opacity-50"
                    >
                      {isBulkArchiving ? 'Processing...' : 'Confirm Bulk Archive'}
                    </button>
                  </div>
                </div>
              )}

              <div className="p-0 overflow-auto flex-1 custom-scrollbar">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-900 text-slate-400 dark:text-slate-400 font-extrabold uppercase text-[10px] border-b border-slate-200 dark:border-slate-700 sticky top-0 z-10">
                      {bulkSelectMode && <th className="p-3 w-8 text-center">#</th>}
                      <th className="p-3">Force No</th>
                      <th className="p-3">Rank & Name</th>
                      <th className="p-3">Station / Section</th>
                      <th className="p-3">Position</th>
                      <th className="p-3">Contact</th>
                      {viewMode === 'archive' && <th className="p-3">Archive Reason</th>}
                      <th className="p-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-700 text-gray-700 dark:text-slate-300">
                    {currentRollDataset.length === 0 ? (
                      <tr>
                        <td colSpan={viewMode === 'archive' ? 7 : 6} className="p-8 text-center text-slate-400">
                          No personnel records found matching current filters.
                        </td>
                      </tr>
                    ) : (
                      currentRollDataset.map((n, idx) => {
                        const fNumVal = n.fnum || n.f_num || '';
                        const isSelected = selectedOfficers.includes(fNumVal);
                        return (
                          <tr key={fNumVal || idx} className={`hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors ${isSelected ? 'bg-blue-50/50 dark:bg-blue-950/20' : ''}`}>
                            {bulkSelectMode && (
                              <td className="p-3 text-center">
                                <input 
                                  type="checkbox" 
                                  checked={isSelected} 
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedOfficers([...selectedOfficers, fNumVal]);
                                    } else {
                                      setSelectedOfficers(selectedOfficers.filter(f => f !== fNumVal));
                                    }
                                  }}
                                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                />
                              </td>
                            )}
                            <td className="p-3 font-mono font-bold text-blue-600 dark:text-blue-400">{fNumVal}</td>
                            <td className="p-3">
                              <div className="font-bold text-gray-800 dark:text-slate-100">{n.rank || ''} {n.name || ''}</div>
                              <div className="text-[10px] text-slate-400">{n.ipps ? `IPPS: ${n.ipps}` : ''} {n.sex ? `• ${n.sex}` : ''}</div>
                            </td>
                            <td className="p-3">
                              <div className="font-semibold">{n.station || ''}</div>
                              <div className="text-[10px] text-slate-400">{n.region || ''} {n.section ? `• ${n.section}` : ''}</div>
                            </td>
                            <td className="p-3 text-slate-600 dark:text-slate-400">{n.position || '—'}</td>
                            <td className="p-3 font-mono text-slate-600 dark:text-slate-400">{n.contact || '—'}</td>
                            {viewMode === 'archive' && (
                              <td className="p-3 text-red-600 dark:text-red-400 font-medium">
                                {n.archive_reason || 'Not specified'}
                                <div className="text-[10px] text-slate-400">{n.archive_date || ''}</div>
                              </td>
                            )}
                            <td className="p-3 text-right">
                              <button 
                                onClick={() => setSelectedOfficer(n)}
                                className="px-2.5 py-1 bg-slate-100 dark:bg-slate-700 hover:bg-blue-600 hover:text-white text-slate-700 dark:text-slate-200 font-bold text-[10px] rounded transition-colors cursor-pointer"
                              >
                                Dossier
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {selectedOfficer && (
        <OfficerDossierModal officer={selectedOfficer} onClose={() => setSelectedOfficer(null)} 
          currentUser={currentUser}
          authFetch={authFetch}
        />
      )}
    </div>
  );
};

export default Nominal_Roll;