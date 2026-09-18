import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Shield, CheckCircle, AlertTriangle, X, Lock, Unlock, 
  Users, RefreshCw, KeyRound, UserCheck, FileText, Globe, CheckSquare, Square, Loader2, ShieldAlert,
  Eye, XCircle, UserPlus, Camera, Filter, ArrowRight, Power, Search, Truck
} from 'lucide-react';
import { stripHtmlTags } from './App';
import { authFetch, hasValidSession } from './api';

// 🟢 Corrected paths: pointing directly to files in the same (src) folder
import { 
  REGIONAL_HIERARCHY, TOP_TIER_ROLES, getRoleWeight, canModifyUser, 
  grantExpressAccess, CLEARANCE_MATRIX_COLS, formatOfficerHeader 
} from './adminUtils';

import { 
  SignupDossierModal, HRModificationModal, LockdownMatrixModal, RevocationModal, ToggleSwitch 
} from './AdminModals';

import ExhibitsRegistry from './ExhibitsRegistry';

const AdminApprovals = ({ currentUser, canViewGlobal = false }) => {
  const [activeTab, setActiveTab] = useState('approvals');
    
  const [modRequests, setModRequests] = useState([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
    
  const [auditLogs, setAuditLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
    
  const [realPendingUsers, setRealPendingUsers] = useState([]);
  const [loadingPending, setLoadingPending] = useState(false);

  const [resetRequests, setResetRequests] = useState([]);
  const [loadingResets, setLoadingResets] = useState(false);

  const [allSystemUsers, setAllSystemUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  const [selectedPendingUser, setSelectedPendingUser] = useState(null);
  const [selectedModRequest, setSelectedModRequest] = useState(null);
  const [viewingPhotoModal, setViewingPhotoModal] = useState(null);
  const [isProcessingAction, setIsProcessingAction] = useState(false);

  const [isDbKillActive, setIsDbKillActive] = useState(false);
  const [loadingKillSwitch, setLoadingKillSwitch] = useState(false);

  const [activeLockdownCount, setActiveLockdownCount] = useState(0);
  const [showLockdownModal, setShowLockdownModal] = useState(false);
  const [lockdownRegionFilter, setLockdownRegionFilter] = useState("KMP NORTH");
  const [lockdownData, setLockdownData] = useState({ system: false, regions: {}, stations: {} });
  
  // 🟢 Search bar query state
  const [searchTerm, setSearchTerm] = useState('');

  const [revokePrompt, setRevokePrompt] = useState({
    isOpen: false, fnum: null, actionType: null, targetValue: null, permissionKey: null, reason: ''
  });

  const activeLockdownSummary = useMemo(() => {
    let list = [];
    if (lockdownData.system) list.push("🚨 SYSTEM-WIDE FULL LOCKDOWN");
    Object.keys(lockdownData.regions).forEach(r => { if (lockdownData.regions[r]) list.push(`⚠️ REGION: ${r}`); });
    Object.keys(lockdownData.stations).forEach(s => { if (lockdownData.stations[s]) list.push(`🔒 STATION: ${s}`); });
    return list;
  }, [lockdownData]);

  // 🟢 DUAL GLOBAL SCOPE SUPPORT
  const canViewGlobalActive = canViewGlobal || 
    ['SUPER_ADMIN', 'ASSISTANT_SUPER_ADMIN'].includes(currentUser?.role) || 
    currentUser?.permissions?.view_global_roster === true || 
    currentUser?.permissions?.global_observer === true ||
    currentUser?.permissions?.global_open === true;

  const userRoleClean = stripHtmlTags(currentUser?.role || '').toUpperCase();
  const userPosClean = stripHtmlTags(currentUser?.position || '').toUpperCase();
  const isSuperAdmin = userRoleClean === 'SUPER_ADMIN';

  // 🟢 STRICT READ-ONLY GUARD
  const isReadOnlyObserver = currentUser?.permissions?.global_observer === true && 
    !currentUser?.permissions?.global_open && 
    !isSuperAdmin;

  const isSuperAdminOrTopCommand = (
    canViewGlobalActive ||
    isSuperAdmin ||
    userPosClean.includes('KMP COMMANDER') ||
    userPosClean.includes('DEPUTY KMP COMMANDER') ||
    userPosClean.includes('STAFF OFFICER ADMIN') ||
    userPosClean.includes('SO ADMIN')
  );

  const isExplicitHighCommand = [
    'IGP', 'DEPUTY IGP', 'DIRECTOR OPERATIONS', 'DEPUTY DIRECTOR OPERATIONS', 
    'KMP COMMANDER', 'DEPUTY KMP COMMANDER', 'KMP ADMIN'
  ].some(pos => userPosClean.includes(pos)) || isSuperAdmin;

  const [filterRegion, setFilterRegion] = useState(isSuperAdminOrTopCommand ? 'ALL REGIONS' : stripHtmlTags(currentUser?.region || ''));
  const [filterStation, setFilterStation] = useState(isSuperAdminOrTopCommand ? 'ALL STATIONS' : stripHtmlTags(currentUser?.station || ''));

  useEffect(() => {
    if (canViewGlobalActive || isSuperAdminOrTopCommand) {
      setFilterRegion('ALL REGIONS');
      setFilterStation('ALL STATIONS');
    }
  }, [canViewGlobalActive, isSuperAdminOrTopCommand]);

  const fetchLockdownStatus = useCallback(async () => {
    if (!hasValidSession()) return;
    try {
      const res = await authFetch('/api/v1/admin/lockdown/status');
      if (res && res.ok) {
        const data = await res.json();
        let count = 0;
        let newLockdownData = { system: false, regions: {}, stations: {} };

        if (data.system_lockdown) { count++; newLockdownData.system = true; }
        if (data.active_regions?.length > 0) {
          count += data.active_regions.length;
          data.active_regions.forEach(r => newLockdownData.regions[r] = true);
        }
        if (data.active_stations?.length > 0) {
          count += data.active_stations.length;
          data.active_stations.forEach(s => newLockdownData.stations[s] = true);
        }
        setActiveLockdownCount(count);
        setLockdownData(newLockdownData);
      }
    } catch (err) {
      console.error("Failed to fetch lockdown status:", err);
    }
  }, []);

  const handleToggleLockdown = async (type, name, currentStatus) => {
    if (isReadOnlyObserver) {
      alert("SECURITY RESTRICTION: Global Observer (Read-Only) clearance does not permit managing system lockdowns.");
      return;
    }

    const isLifting = currentStatus; 
    const actionWord = isLifting ? "LIFT" : "ACTIVATE";

    const rawReason = window.prompt(`State official reason to ${actionWord} lockdown on [${type}: ${name}]:`);
    if (rawReason === null) return;
    const reason = stripHtmlTags(rawReason || (isLifting ? "Command Lockdown Lifted" : "Command Maintenance"));

    if (isLifting) {
      if (!window.confirm(`⚠️ Are you sure you want to LIFT the lockdown for [${type}: ${name}]?`)) return;
    } else {
      if (!window.confirm(`🛑 Are you sure you want to LOCK DOWN [${type}: ${name}]? This will instantly restrict access.`)) return;
    }

    try {
      const res = await authFetch('/api/v1/admin/toggle-maintenance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lockdown_type: type, target_name: name, reason: reason })
      });

      if (res && res.ok) fetchLockdownStatus();
      else {
        const err = await res.json().catch(() => ({}));
        alert(`❌ Failed to execute command: ${err.detail || 'Server error'}`);
      }
    } catch (err) {
      alert("❌ Error communicating with the command server.");
    }
  };

  const handleKillSwitchToggle = async () => {
    if (isReadOnlyObserver) {
      alert("SECURITY RESTRICTION: Global Observer (Read-Only) clearance does not permit toggling the AI database kill switch.");
      return;
    }

    setLoadingKillSwitch(true);
    try {
      const res = await authFetch('/api/v1/ai/admin/toggle-db-query', { method: 'POST' });
      if (res && res.ok) {
        const data = await res.json();
        setIsDbKillActive(!data.ai_database_query_enabled);
        alert(data.message);
      } else alert("Failed to toggle AI database kill switch.");
    } catch (err) {
      alert("Error contacting the server to toggle AI database access.");
    } finally {
      setLoadingKillSwitch(false);
    }
  };

  const fetchPendingUsers = useCallback(async () => {
    if (!hasValidSession()) return;
    setLoadingPending(true);
    try {
      const res = await authFetch("/api/v1/admin/pending-users");
      if (res && res.ok) {
        const data = await res.json();
        setRealPendingUsers(Array.isArray(data) ? data : []);
      }
    } catch (err) { console.error("Failed to sync pending users:", err); } 
    finally { setLoadingPending(false); }
  }, []);

  const fetchResets = useCallback(async () => {
    if (!hasValidSession()) return;
    setLoadingResets(true);
    try {
      const res = await authFetch("/api/v1/admin/reset-requests");
      if (res && res.ok) {
        const data = await res.json();
        setResetRequests(Array.isArray(data) ? data : []);
      }
    } catch (err) { console.error("Failed to sync password resets:", err); } 
    finally { setLoadingResets(false); }
  }, []);

  const fetchAllSystemUsers = useCallback(async () => {
    if (!hasValidSession()) return;
    setLoadingUsers(true);
    try {
      const res = await authFetch("/api/v1/users");
      if (res && res.ok) {
        const data = await res.json();
        setAllSystemUsers(Array.isArray(data) ? data : []);
      }
    } catch (err) { console.error("Failed to sync system user roster:", err); } 
    finally { setLoadingUsers(false); }
  }, []);

  const fetchModRequests = useCallback(async () => {
    if (!hasValidSession()) return;
    setLoadingRequests(true);
    try {
      const res = await authFetch("/api/v1/requests");
      if (res && res.ok) {
        const data = await res.json();
        setModRequests(Array.isArray(data) ? data : []);
      }
    } catch (err) { console.error("Failed to sync requests:", err); } 
    finally { setLoadingRequests(false); }
  }, []);

  const fetchAuditLogs = useCallback(async () => {
    if (!hasValidSession()) return;
    setLoadingLogs(true);
    try {
      const res = await authFetch("/api/v1/audit-logs");
      if (res && res.ok) {
        const data = await res.json();
        setAuditLogs(Array.isArray(data) ? data : []);
      }
    } catch (err) { console.error("Failed to sync audit logs:", err); } 
    finally { setLoadingLogs(false); }
  }, []);

  useEffect(() => {
    if (activeTab === 'approvals') fetchPendingUsers();
    else if (activeTab === 'matrix' || activeTab === 'roster') fetchAllSystemUsers();
    else if (activeTab === 'requests') fetchModRequests();
    else if (activeTab === 'logs') { fetchAuditLogs(); fetchAllSystemUsers(); }
    else if (activeTab === 'resets') fetchResets();
     
    if (typeof fetchLockdownStatus === 'function') fetchLockdownStatus();
  }, [activeTab, fetchPendingUsers, fetchAllSystemUsers, fetchModRequests, fetchAuditLogs, fetchResets, fetchLockdownStatus]);

  // 🟢 UNIVERSAL SEARCH & REGIONAL FILTER HELPER
  const matchesSearch = (item, fields) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return fields.some(field => {
      const val = stripHtmlTags(String(item[field] || ''));
      return val.toLowerCase().includes(term);
    });
  };

  const filterByRegionStation = (items, itemRegionKey = 'region', itemStationKey = 'station', searchFields = []) => {
    return items.filter(item => {
      const itemRegion = stripHtmlTags(item[itemRegionKey] || '').trim().toUpperCase();
      const itemStation = stripHtmlTags(item[itemStationKey] || '').trim().toUpperCase();
      const activeReg = stripHtmlTags(filterRegion || '').trim().toUpperCase();
      const activeStat = stripHtmlTags(filterStation || '').trim().toUpperCase();

      if (canViewGlobalActive && activeReg === 'ALL REGIONS' && activeStat === 'ALL STATIONS') {
        return matchesSearch(item, searchFields);
      }
      if (activeReg && activeReg !== 'ALL REGIONS' && itemRegion !== activeReg) return false;
      if (activeStat && activeStat !== 'ALL STATIONS' && itemStation !== activeStat) return false;
      
      return matchesSearch(item, searchFields);
    });
  };

  const filteredPending = useMemo(() => filterByRegionStation(realPendingUsers, 'region', 'station', ['fnum', 'name', 'rank', 'station', 'region', 'nin', 'ipps', 'phone', 'email']), [realPendingUsers, filterRegion, filterStation, canViewGlobalActive, searchTerm]);
  const filteredRequests = useMemo(() => filterByRegionStation(modRequests, 'current_region', 'current_station', ['fnum', 'current_name', 'current_station', 'current_region', 'requested_station', 'requested_name']), [modRequests, filterRegion, filterStation, canViewGlobalActive, searchTerm]);
  const filteredResets = useMemo(() => filterByRegionStation(resetRequests, 'region', 'station', ['fnum', 'name', 'station', 'region']), [resetRequests, filterRegion, filterStation, canViewGlobalActive, searchTerm]);
  const filteredSystemUsers = useMemo(() => filterByRegionStation(allSystemUsers, 'region', 'station', ['fnum', 'name', 'rank', 'station', 'region', 'ipps', 'phone', 'email', 'role']), [allSystemUsers, filterRegion, filterStation, canViewGlobalActive, searchTerm]);

  const filteredLogs = useMemo(() => {
    return auditLogs.filter(log => {
      const logUser = allSystemUsers.find(u => u.fnum === log.user_fnum);
      const logRegion = stripHtmlTags(log.region || logUser?.region || '').trim().toUpperCase();
      const logStation = stripHtmlTags(log.station || logUser?.station || '').trim().toUpperCase();
      const activeReg = stripHtmlTags(filterRegion || '').trim().toUpperCase();
      const activeStat = stripHtmlTags(filterStation || '').trim().toUpperCase();

      if (canViewGlobalActive && activeReg === 'ALL REGIONS' && activeStat === 'ALL STATIONS') {
        return matchesSearch(log, ['user_fnum', 'event_type', 'target_user', 'details']);
      }
      if (activeReg && activeReg !== 'ALL REGIONS' && logRegion !== activeReg) return false;
      if (activeStat && activeStat !== 'ALL STATIONS' && logStation !== activeStat) return false;
      
      return matchesSearch(log, ['user_fnum', 'event_type', 'target_user', 'details']);
    });
  }, [auditLogs, allSystemUsers, filterRegion, filterStation, canViewGlobalActive, searchTerm]);

  const handleBulkMatrixAction = async (fnum, setAllToTrue) => {
    if (isReadOnlyObserver) {
      alert("SECURITY RESTRICTION: Global Observer (Read-Only) clearance does not permit bulk matrix updates.");
      return;
    }

    const cleanFnum = stripHtmlTags(fnum);
    const targetUser = allSystemUsers.find(u => u.fnum === cleanFnum);
    if (!targetUser || !canModifyUser(currentUser, targetUser)) {
      alert("SECURITY OVERRIDE DENIED: Insufficient clearance.");
      return;
    }

    const newPermissions = { ...(targetUser.permissions || {}) };
    CLEARANCE_MATRIX_COLS.forEach(col => { newPermissions[col.key] = setAllToTrue; });
    setAllSystemUsers(allSystemUsers.map(u => u.fnum === cleanFnum ? { ...u, permissions: newPermissions } : u));

    try {
      await authFetch(`/api/v1/users/${encodeURIComponent(cleanFnum.trim())}/access`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role: targetUser.role, permissions: newPermissions })
      });
    } catch (err) { alert(`Bulk Update Failed: ${err.message}`); fetchAllSystemUsers(); }
  };

  const handleGranularPermissionChange = async (fnum, permissionKey, value) => {
    if (isReadOnlyObserver) {
      alert("SECURITY RESTRICTION: Your clearance is Read-Only.");
      return;
    }

    const cleanFnum = stripHtmlTags(fnum);
    const targetUser = allSystemUsers.find(u => u.fnum === cleanFnum);
    if (!targetUser) return;

    let updatedPermissions = { ...(targetUser.permissions || {}) };

    if (permissionKey === 'global_observer' && value === true) {
      updatedPermissions.global_observer = true;
      updatedPermissions.global_open = false; 
    } else if (permissionKey === 'global_open' && value === true) {
      updatedPermissions.global_open = true;
      updatedPermissions.global_observer = false; 
    } else {
      updatedPermissions[permissionKey] = value;
    }

    setAllSystemUsers(allSystemUsers.map(u => u.fnum === cleanFnum ? { ...u, permissions: updatedPermissions } : u));

    try {
      await authFetch(`/api/v1/users/${encodeURIComponent(cleanFnum.trim())}/access`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role: targetUser.role, permissions: updatedPermissions })
      });
    } catch (err) { alert(`Permission Update Failed: ${err.message}`); fetchAllSystemUsers(); }
  };

  const handleRoleTierChange = async (fnum, newRole) => {
    if (isReadOnlyObserver) {
      alert("SECURITY RESTRICTION: Global Observer (Read-Only) clearance does not permit changing role tiers.");
      return;
    }

    const cleanFnum = stripHtmlTags(fnum);
    const targetUser = allSystemUsers.find(u => u.fnum === cleanFnum);
    if (!targetUser || !canModifyUser(currentUser, targetUser)) {
      alert("SECURITY OVERRIDE DENIED: Insufficient clearance.");
      return;
    }

    // 🟢 HIERARCHICAL ENFORCEMENT: RPC (Regional Admin) can modify Assistant Regional Admin, but Assistant cannot modify RPC
    const currentRoleClean = (currentUser?.role || '').toUpperCase();
    if (currentRoleClean === 'ASSISTANT_REGIONAL_ADMIN' && newRole === 'REGIONAL_ADMIN') {
      alert("SECURITY RESTRICTION: Assistant Regional Admin cannot modify Regional Admin roles.");
      return;
    }

    const updatedPermissions = grantExpressAccess(newRole, targetUser.permissions || {});
    setAllSystemUsers(allSystemUsers.map(u => u.fnum === cleanFnum ? { ...u, role: newRole, permissions: updatedPermissions } : u));

    try {
      await authFetch(`/api/v1/users/${encodeURIComponent(cleanFnum.trim())}/access`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role: newRole, permissions: updatedPermissions })
      });
    } catch (err) { alert(`Role Update Failed: ${err.message}`); fetchAllSystemUsers(); }
  };

  const handleApproveUser = async (userToApprove) => {
    if (isReadOnlyObserver) {
      alert("SECURITY RESTRICTION: Global Observer (Read-Only) clearance does not permit approving access requests.");
      return;
    }

    const fnum = typeof userToApprove === 'object' ? userToApprove.fnum : userToApprove;
    setIsProcessingAction(true);
    try {
      const cleanFnum = stripHtmlTags(fnum);
      const grantedPermissions = grantExpressAccess('USER', userToApprove.permissions || {});

      await authFetch(`/api/v1/users/${encodeURIComponent(cleanFnum.trim())}/access`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role: 'USER', is_approved: true, permissions: grantedPermissions })
      });

      alert(`✅ Success: ${cleanFnum} access has been approved.`);
      setSelectedPendingUser(null);
      fetchPendingUsers();
      fetchAllSystemUsers();
    } catch (err) { alert(`Approval Error: ${err.message}`); } 
    finally { setIsProcessingAction(false); }
  };

  const handleRejectUser = async (userToReject) => {
    if (isReadOnlyObserver) {
      alert("SECURITY RESTRICTION: Global Observer (Read-Only) clearance does not permit rejecting access requests.");
      return;
    }

    const fnum = typeof userToReject === 'object' ? userToReject.fnum : userToReject;
    const rawReason = window.prompt(`Enter official reason for REJECTING ${fnum}:`);
    if (rawReason === null) return;

    setIsProcessingAction(true);
    try {
      await authFetch(`/api/v1/users/${encodeURIComponent(stripHtmlTags(fnum).trim())}/revoke?reason=${encodeURIComponent(stripHtmlTags(rawReason))}`, { method: "DELETE" });
      alert(`⛔ Request Rejected.`);
      setSelectedPendingUser(null);
      fetchPendingUsers();
    } catch (err) { alert(`Rejection Error: ${err.message}`); } 
    finally { setIsProcessingAction(false); }
  };

  const handleReviewRequest = async (reqId, actionStatus) => {
    if (isReadOnlyObserver) {
      alert("SECURITY RESTRICTION: Global Observer (Read-Only) clearance does not permit reviewing HR modifications.");
      return;
    }

    try {
      await authFetch(`/api/v1/requests/${reqId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: actionStatus })
      });
      setModRequests(modRequests.filter(r => (r.id || r.sn) !== reqId));
      setSelectedModRequest(null); 
      alert(`Request ${actionStatus.toLowerCase()} successfully!`);
    } catch (err) { alert(`Error processing request: ${err.message}`); }
  };

  const handleResetAction = async (reqId, actionStr) => {
    if (isReadOnlyObserver) {
      alert("SECURITY RESTRICTION: Global Observer (Read-Only) clearance does not permit executing password resets.");
      return;
    }

    try {
      const formData = new URLSearchParams();
      formData.append('action', actionStr);
      const response = await authFetch(`/api/v1/admin/execute-reset/${reqId}`, {
        method: "POST", headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: formData
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail);
      setResetRequests(resetRequests.filter(r => r.id !== reqId));
      alert(actionStr === "APPROVE" ? `Password successfully reset! Key: ${data.new_password}` : "Request rejected.");
    } catch (err) { alert(`Error: ${err.message}`); }
  };

  const handleForcePassword = async (fnum, name) => {
    if (isReadOnlyObserver) {
      alert("SECURITY RESTRICTION: Global Observer (Read-Only) clearance does not permit forcing password overrides.");
      return;
    }

    const newPass = window.prompt(`[SUPER ADMIN OVERRIDE]\nEnter new 6+ character password for ${name} (${fnum}):`);
    if (!newPass) return;
    if (newPass.length < 6) return alert("Password must be at least 6 characters long.");

    setIsProcessingAction(true);
    try {
      const response = await authFetch(`/api/v1/admin/users/${encodeURIComponent(fnum.trim())}/force-password`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ new_password: newPass })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Failed to force password reset.");
      alert(`✅ ${data.message}`);
    } catch (err) { alert(`❌ Error: ${err.message}`); } 
    finally { setIsProcessingAction(false); }
  };

  return (
    <div className="p-4 max-w-[1800px] mx-auto space-y-6 relative z-10 animate-in fade-in duration-300">
      
      <div className="bg-slate-900 text-white px-6 py-5 rounded-2xl shadow-lg flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center space-x-4">
          <img src="/upf_badge.png" alt="UPF Logo" className="w-12 h-12 object-contain contrast-200 brightness-110 drop-shadow-md" onError={(e) => e.target.style.display = 'none'} />
          <div>
            <h1 className="text-xl font-black tracking-wide uppercase flex items-center">
              <Shield className="w-5 h-5 mr-2 text-blue-400" /> Access & Command Approvals
            </h1>
            <p className="text-xs text-slate-400 mt-1 uppercase tracking-wider font-semibold">
              Review officer signups, granular clearance tiers, transfers, and audit logs.
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col xl:flex-row items-start xl:items-center justify-between gap-5 relative z-20">
        <div className="flex flex-wrap items-center gap-3 bg-slate-50 p-2 rounded-lg border border-slate-100 w-full xl:w-auto">
          <span className="text-xs font-extrabold text-blue-900 uppercase flex items-center tracking-wider mr-1">
            <Filter size={14} className="mr-1.5 text-blue-600" /> Filter Scope:
        </span>
          <select value={filterRegion} onChange={(e) => { setFilterRegion(stripHtmlTags(e.target.value)); setFilterStation('ALL STATIONS'); }} disabled={!canViewGlobalActive} className="border border-slate-300 rounded-md p-2 text-xs shadow-sm bg-white font-bold text-slate-700 outline-none cursor-pointer min-w-[180px]">
            {canViewGlobalActive ? (<><option value="ALL REGIONS">ALL REGIONS (GLOBAL)</option>{Object.keys(REGIONAL_HIERARCHY || {}).map(reg => <option key={reg} value={reg}>{reg}</option>)}</>) : <option value={currentUser?.region}>{stripHtmlTags(currentUser?.region)}</option>}
          </select>
          <select value={filterStation} onChange={(e) => setFilterStation(stripHtmlTags(e.target.value))} disabled={!canViewGlobalActive && !['RPC', 'Deputy Commander'].includes(currentUser?.role)} className="border border-slate-300 rounded-md p-2 text-xs shadow-sm bg-white font-bold text-slate-700 outline-none cursor-pointer min-w-[200px]">
            {canViewGlobalActive || ['RPC', 'Deputy Commander'].includes(currentUser?.role) ? (<><option value="ALL STATIONS">ALL STATIONS / DIVISIONS</option>{filterRegion !== 'ALL REGIONS' && REGIONAL_HIERARCHY?.[filterRegion] ? REGIONAL_HIERARCHY[filterRegion].map(stat => <option key={stat} value={stat}>{stat}</option>) : null}</>) : <option value={currentUser?.station}>{stripHtmlTags(currentUser?.station)}</option>}
          </select>
          
          {/* 🟢 SEARCH BAR INPUT */}
          <div className="relative flex items-center min-w-[220px]">
            <Search size={14} className="absolute left-3 text-slate-400" />
            <input 
              type="text" 
              value={searchTerm} 
              onChange={(e) => setSearchTerm(e.target.value)} 
              placeholder="Search FNUM, name, action..." 
              className="w-full pl-9 pr-3 py-1.5 border border-slate-300 rounded-md text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm('')} className="absolute right-2 text-slate-400 hover:text-slate-600 text-xs font-bold">×</button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full xl:w-auto">
          <button onClick={() => { fetchPendingUsers(); fetchAllSystemUsers(); fetchModRequests(); fetchAuditLogs(); fetchResets(); fetchLockdownStatus(); }} className="bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 font-bold px-4 py-2 rounded-lg text-xs flex items-center transition cursor-pointer shadow-sm">
            <RefreshCw size={14} className="mr-2 text-blue-600" /> Sync Queue
          </button>
          {isSuperAdmin && (
            <button onClick={() => { fetchLockdownStatus(); setShowLockdownModal(true); }} className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer border ${activeLockdownCount > 0 ? 'bg-red-950 border-red-500 text-red-200 animate-pulse' : 'bg-amber-950/60 border-amber-600/50 text-amber-300'}`}>
              <span>🔒</span><span>{activeLockdownCount > 0 ? `Lockdowns (${activeLockdownCount} Active)` : 'Lockdowns'}</span>
            </button>
          )}
          {isSuperAdmin && (
            <button onClick={handleKillSwitchToggle} disabled={loadingKillSwitch} className={`font-bold px-4 py-2 rounded-lg text-xs flex items-center transition cursor-pointer shadow-sm border ${isDbKillActive ? 'bg-emerald-50 border-emerald-400 text-emerald-800' : 'bg-red-50 border-red-400 text-red-800'}`}>
              {loadingKillSwitch ? <Loader2 size={14} className="mr-2 animate-spin text-slate-500" /> : <ShieldAlert size={14} className={`mr-2 ${isDbKillActive ? 'text-emerald-600' : 'text-red-600'}`} />}
              {isDbKillActive ? 'AI DB Query: ON' : 'AI DB Query: KILLED'}
            </button>
          )}
        </div>
      </div>

      <div className="flex border-b border-slate-200 bg-white rounded-t-xl shadow-sm overflow-x-auto custom-scrollbar">
        <button onClick={() => setActiveTab('approvals')} className={`flex-1 py-3.5 px-4 text-xs uppercase tracking-wider font-extrabold flex items-center justify-center transition-all min-w-max cursor-pointer ${activeTab === 'approvals' ? 'bg-slate-50 border-b-[3px] border-blue-600 text-blue-700 shadow-inner' : 'text-slate-500 hover:bg-slate-50/50'}`}>
          <UserPlus className="w-4 h-4 mr-2"/> Authorizations ({loadingPending ? '...' : filteredPending.length})
        </button>
        <button onClick={() => setActiveTab('matrix')} className={`flex-1 py-3.5 px-4 text-xs uppercase tracking-wider font-extrabold flex items-center justify-center transition-all min-w-max cursor-pointer ${activeTab === 'matrix' ? 'bg-slate-50 border-b-[3px] border-indigo-600 text-indigo-700 shadow-inner' : 'text-slate-500 hover:bg-slate-50/50'}`}>
          <Shield className="w-4 h-4 mr-2"/> Clearance Matrix ({filteredSystemUsers.length})
        </button>
        <button onClick={() => setActiveTab('exhibits')} className={`flex-1 py-3.5 px-4 text-xs uppercase tracking-wider font-extrabold flex items-center justify-center transition-all min-w-max cursor-pointer ${activeTab === 'exhibits' ? 'bg-slate-50 border-b-[3px] border-emerald-600 text-emerald-700 shadow-inner' : 'text-slate-500 hover:bg-slate-50/50'}`}>
          <Truck className="w-4 h-4 mr-2"/> Exhibits Clearance
        </button>
        <button onClick={() => setActiveTab('roster')} className={`flex-1 py-3.5 px-4 text-xs uppercase tracking-wider font-extrabold flex items-center justify-center transition-all min-w-max cursor-pointer ${activeTab === 'roster' ? 'bg-slate-50 border-b-[3px] border-cyan-600 text-cyan-700 shadow-inner' : 'text-slate-500 hover:bg-slate-50/50'}`}>
          <Users className="w-4 h-4 mr-2"/> Directory Roster ({filteredSystemUsers.length})
        </button>
        <button onClick={() => setActiveTab('requests')} className={`flex-1 py-3.5 px-4 text-xs uppercase tracking-wider font-extrabold flex items-center justify-center transition-all min-w-max cursor-pointer ${activeTab === 'requests' ? 'bg-slate-50 border-b-[3px] border-amber-500 text-amber-700 shadow-inner' : 'text-slate-500 hover:bg-slate-50/50'}`}>
          <RefreshCw className="w-4 h-4 mr-2"/> HR Transfers ({filteredRequests.length})
        </button>
        <button onClick={() => setActiveTab('logs')} className={`flex-1 py-3.5 px-4 text-xs uppercase tracking-wider font-extrabold flex items-center justify-center transition-all min-w-max cursor-pointer ${activeTab === 'logs' ? 'bg-slate-50 border-b-[3px] border-emerald-600 text-emerald-700 shadow-inner' : 'text-slate-500 hover:bg-slate-50/50'}`}>
          <FileText className="w-4 h-4 mr-2"/> Audit Logs ({filteredLogs.length})
        </button>
        <button onClick={() => setActiveTab('resets')} className={`flex-1 py-3.5 px-4 text-xs uppercase tracking-wider font-extrabold flex items-center justify-center transition-all min-w-max cursor-pointer ${activeTab === 'resets' ? 'bg-slate-50 border-b-[3px] border-red-600 text-red-700 shadow-inner' : 'text-slate-500 hover:bg-slate-50/50'}`}>
          <KeyRound className="w-4 h-4 mr-2"/> Password Resets ({filteredResets.length})
        </button>
      </div>

      {activeTab === 'approvals' && (
        <div className="bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden max-w-6xl mx-auto">
          {loadingPending ? (
            <div className="p-8 text-center text-slate-500 font-medium animate-pulse text-xs">Syncing with Command Database...</div>
          ) : filteredPending.length === 0 ? (
            <div className="p-8 text-center text-slate-500 font-medium text-xs">No active unapproved access requests pending.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-xs">
                <thead className="bg-slate-900 text-blue-100 uppercase font-black text-[11px] tracking-wider">
                  <tr><th className="px-4 py-3.5 text-left">Officer Details</th><th className="px-4 py-3.5 text-left">Command Post</th><th className="px-4 py-3.5 text-left">Derived Role Tier</th><th className="px-4 py-3.5 text-right">Action</th></tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-200">
                  {filteredPending.map((user) => (
                    <tr key={user.fnum} onClick={() => setSelectedPendingUser(user)} className="hover:bg-blue-50/50 cursor-pointer transition-colors group">
                      <td className="px-4 py-3 whitespace-nowrap"><div className="font-extrabold text-slate-900">{formatOfficerHeader(user)}</div></td>
                      <td className="px-4 py-3 whitespace-nowrap"><div className="font-bold text-blue-700 uppercase">{stripHtmlTags(user.station)}</div></td>
                      <td className="px-4 py-3 whitespace-nowrap"><span className="px-2 py-0.5 inline-flex text-[10px] font-bold rounded-full border bg-slate-100 text-slate-800">{user.role}</span></td>
                      <td className="px-4 py-3 whitespace-nowrap text-right"><button type="button" onClick={() => setSelectedPendingUser(user)} className="bg-slate-100 hover:bg-slate-200 font-bold py-1.5 px-3 rounded-md text-[11px]">Review</button></td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    )}

    {activeTab === 'matrix' && (
      <div className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden w-full">
        <div className="bg-slate-900 text-white p-3 text-xs font-extrabold uppercase tracking-wider flex justify-between">
          <span>Super Control Panel - Active Roster Matrix</span>
        </div>
        {loadingUsers ? (
          <div className="p-8 text-center text-slate-400 font-medium animate-pulse text-xs">Syncing user database roster...</div>
        ) : (
          <div className="overflow-x-auto w-full custom-scrollbar">
            <table className="min-w-max divide-y divide-slate-200 text-xs table-fixed">
              <thead className="bg-slate-900 text-white uppercase font-black text-[10px]">
                <tr>
                  <th className="p-2.5 text-left sticky left-0 z-20 bg-slate-900 text-blue-100 w-[240px] min-w-[240px]">Officer Details</th>
                  <th className="p-2.5 text-center sticky left-[240px] z-20 bg-slate-900 text-blue-100 w-[120px] min-w-[120px]">Administrative Tier</th>
                  <th className="p-2.5 text-center sticky left-[360px] z-20 bg-slate-900 text-blue-100 w-[100px] min-w-[100px]">Quick Actions</th>
                  {CLEARANCE_MATRIX_COLS.map((col, idx) => (
                    <th key={idx} className="p-2 border-l border-slate-700 bg-slate-900 w-20 min-w-[80px] align-middle">
                      <div className="w-20 min-w-[80px] text-[9px] text-blue-100 font-bold whitespace-normal break-words leading-tight text-center px-0.5" title={col.label}>
                        {col.label}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {filteredSystemUsers.map(u => {
                  const p = u.permissions || {};
                  const isSelf = u.fnum === currentUser?.fnum;
                  return (
                    <tr key={u.fnum} className="hover:bg-slate-50">
                      <td className="p-2.5 sticky left-0 z-10 bg-white font-extrabold text-[11px] w-[240px] min-w-[240px] truncate" title={formatOfficerHeader(u)}>{formatOfficerHeader(u)}</td>
                      <td className="p-2.5 text-center sticky left-[240px] z-10 bg-white w-[120px] min-w-[120px]">
                        <select value={u.role || 'USER'} onChange={(e) => handleRoleTierChange(u.fnum, e.target.value)} disabled={isSelf} className="border rounded-md px-1.5 py-1 font-bold outline-none uppercase text-[10px] w-full truncate bg-white">
                          <option value="USER">USER</option>
                          <option value="STATION_ADMIN">STN ADMIN</option>
                          <option value="DIVISION_USER">DIV USER</option>
                          <option value="DIVISION_ADMIN">DIV ADMIN</option>
                          <option value="REGIONAL_USER">REG USER</option>
                          <option value="REGIONAL_ADMIN">REG ADMIN</option>
                          <option value="ASSISTANT_REGIONAL_ADMIN">ASST REG ADMIN</option>
                          <option value="ADMIN">ADMIN</option>
                          <option value="SUPER_ADMIN">SUPER ADMIN</option>
                          <option value="ASSISTANT_SUPER_ADMIN">ASST SUPER ADMIN</option>
                          <option value="REVOKED">REVOKED</option>
                      </select>
                    </td>
                    <td className="p-2.5 text-center sticky left-[360px] z-10 bg-white w-[100px] min-w-[100px]">
                        <div className="flex items-center justify-center space-x-1">
                          <button onClick={() => handleBulkMatrixAction(u.fnum, true)} title="Check All" className="p-1 rounded bg-emerald-50 text-emerald-700 border cursor-pointer"><CheckSquare size={12} /></button>
                          <button onClick={() => handleBulkMatrixAction(u.fnum, false)} title="Uncheck All" className="p-1 rounded bg-red-50 text-red-700 border cursor-pointer"><Square size={12} /></button>
                          {isSuperAdmin && (
                            <button onClick={() => handleForcePassword(u.fnum, u.name)} title="Force Password" className="p-1 rounded bg-amber-50 text-amber-700 border cursor-pointer"><KeyRound size={12} /></button>
                          )}
                        </div>
                    </td>
                    {CLEARANCE_MATRIX_COLS.map((col, idx) => {
                      const isObserverCol = col.key === 'global_observer';
                      const isOpenCol = col.key === 'global_open';
                      
                      const isMutuallyDisabled = (isObserverCol && Boolean(p.global_open)) || (isOpenCol && Boolean(p.global_observer));
                      const isDisabled = isSelf || isMutuallyDisabled || u.role === 'SUPER_ADMIN';

                      return (
                          <td key={idx} className="p-2 text-center border-l border-slate-100 w-20 min-w-[80px]">
                            <input 
                              type="checkbox" 
                              checked={u.role === 'SUPER_ADMIN' || Boolean(p[col.key])} 
                              disabled={isDisabled}
                              onChange={e => handleGranularPermissionChange(u.fnum, col.key, e.target.checked)} 
                              className={`w-3.5 h-3.5 rounded ${isDisabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}`} 
                            />
                          </td>
                      );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    )}
  </div>
)}

    {activeTab === 'exhibits' && (
      <div className="bg-white rounded-xl shadow-sm border border-emerald-200 overflow-hidden">
        <ExhibitsRegistry currentUser={currentUser} canViewGlobal={canViewGlobal} isReadOnlyObserver={isReadOnlyObserver} />
      </div>
    )}

    {activeTab === 'roster' && (
      <div className="bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden max-w-6xl mx-auto">
        <div className="bg-slate-900 px-4 py-2.5 border-b border-slate-800 text-white font-semibold text-xs uppercase">
          Command Directory & System Roster
        </div>
        {loadingUsers ? (
          <div className="p-8 text-center text-slate-500 font-medium animate-pulse text-xs">Compiling roster...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-xs">
              <thead className="bg-slate-900 text-blue-100 uppercase font-black text-[11px]">
                <tr><th className="px-4 py-3.5 text-left">Officer Details</th><th className="px-4 py-3.5 text-left">Identifiers</th><th className="px-4 py-3.5 text-left">Contact Data</th><th className="px-4 py-3.5 text-right">Actions</th></tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-200">
                {filteredSystemUsers.map((user) => (
                  <tr key={user.fnum} className="hover:bg-cyan-50/50">
                    <td className="px-4 py-3 whitespace-nowrap"><div className="font-extrabold">{formatOfficerHeader(user)}</div></td>
                    <td className="px-4 py-3 whitespace-nowrap">IPPS: {user.ipps || 'N/A'}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{user.phone || 'N/A'}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-right">
                      {isSuperAdmin && (
                        <button onClick={() => handleForcePassword(user.fnum, user.name)} className="px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 font-bold text-[10px]"><KeyRound size={12} className="inline mr-1" /> Force Password</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    )}

    {activeTab === 'requests' && (
      <div className="bg-white rounded-xl shadow-xs border border-amber-200 overflow-hidden max-w-6xl mx-auto">
        <div className="bg-slate-900 px-4 py-2.5 text-white font-semibold text-xs uppercase">HR Modification Requests</div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-xs">
            <thead className="bg-slate-900 text-blue-100 uppercase font-black text-[11px]">
              <tr><th className="px-4 py-3.5 text-left">Officer</th><th className="px-4 py-3.5 text-left">Requested Changes</th><th className="px-4 py-3.5 text-right">Action</th></tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-200">
              {filteredRequests.map((req) => (
                <tr key={req.id || req.sn} className="hover:bg-amber-50/50">
                  <td className="px-4 py-2.5">{formatOfficerHeader({ fnum: req.fnum, rank: req.current_rank, name: req.current_name })}</td>
                  <td className="px-4 py-2.5">Station: {req.requested_station || req.current_station}</td>
                  <td className="px-4 py-2.5 text-right space-x-2">
                    <button onClick={() => handleReviewRequest(req.id || req.sn, "APPROVED")} className="bg-emerald-600 text-white font-bold py-1 px-2.5 rounded text-[11px]">Approve</button>
                    <button onClick={() => handleReviewRequest(req.id || req.sn, "REJECTED")} className="bg-red-50 text-red-600 font-bold py-1 px-2.5 rounded text-[11px]">Reject</button>
                  </td>
                </tr>
              ))}
          </tbody>
          </table>
        </div>
    </div>
  )}

    {activeTab === 'logs' && (
  <div className="bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden max-w-6xl mx-auto">
    <div className="bg-slate-900 px-4 py-2.5 text-white font-semibold text-xs uppercase">System Audit Logs</div>
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200 text-xs">
        <thead className="bg-slate-900 text-blue-100 uppercase font-black text-[11px]">
          <tr><th className="px-4 py-3.5 text-left">Timestamp</th><th className="px-4 py-3.5 text-left">User</th><th className="px-4 py-3.5 text-left">Event</th><th className="px-4 py-3.5 text-left">Details</th></tr>
        </thead>
        <tbody className="bg-white divide-y divide-slate-200">
          {filteredLogs.map((log) => (
            <tr key={log.id} className="hover:bg-slate-50">
              <td className="px-4 py-2 font-mono text-[10px]">{log.created_at}</td>
              {/* 🟢 Render user_fnum combined with user_name */}
              <td className="px-4 py-2 font-extrabold text-blue-700">
                {log.user_fnum} {log.user_name ? `- ${log.user_name}` : ''}
              </td>
              <td className="px-4 py-2 uppercase font-extrabold text-[10px]">{log.event_type}</td>
              <td className="px-4 py-2 text-[11px]">{log.details}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
)}

    {activeTab === 'resets' && (        
      <div className="bg-white rounded-xl shadow-xs border border-red-200 overflow-hidden max-w-6xl mx-auto">
        <div className="bg-slate-900 px-4 py-2.5 text-white font-semibold text-xs uppercase">Authorized Password Recovery</div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-xs">
            <thead className="bg-slate-900 text-blue-100 uppercase font-black text-[11px]">
              <tr><th className="px-4 py-3.5 text-left">Date</th><th className="px-4 py-3.5 text-left">Officer</th><th className="px-4 py-3.5 text-right">Action</th></tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-200">
              {filteredResets.map((req) => (
                <tr key={req.id} className="hover:bg-red-50/50">
                  <td className="px-4 py-2.5 font-bold text-[10px]">{req.request_date}</td>
                  <td className="px-4 py-2.5 font-extrabold text-blue-700">{formatOfficerHeader({ fnum: req.fnum, rank: req.rank, name: req.name })}</td>
                  <td className="px-4 py-2.5 text-right space-x-2">
                    <button onClick={() => handleResetAction(req.id, "APPROVE")} className="bg-red-600 text-white font-bold py-1 px-2.5 rounded text-[11px]">Authorize Reset</button>
                    <button onClick={() => handleResetAction(req.id, "REJECT")} className="bg-slate-100 text-slate-700 font-bold py-1 px-2.5 rounded text-[11px]">Reject</button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
  </div>
)}

  {/* MODALS */}
  <SignupDossierModal user={selectedPendingUser} onClose={() => setSelectedPendingUser(null)} setViewingPhotoModal={setViewingPhotoModal} currentUser={currentUser} isProcessingAction={isProcessingAction} handleRejectUser={handleRejectUser} handleApproveUser={handleApproveUser} canModifyUser={canModifyUser} />
  <HRModificationModal req={selectedModRequest} onClose={() => setSelectedModRequest(null)} currentUser={currentUser} isProcessingAction={isProcessingAction} handleReviewRequest={handleReviewRequest} />
  <LockdownMatrixModal isOpen={showLockdownModal} onClose={() => setShowLockdownModal(false)} activeLockdownSummary={activeLockdownSummary} lockdownData={lockdownData} handleToggleLockdown={handleToggleLockdown} lockdownRegionFilter={lockdownRegionFilter} setLockdownRegionFilter={setLockdownRegionFilter} />
  <RevocationModal prompt={revokePrompt} setPrompt={setRevokePrompt} executeRoleChange={() => {}} executePermissionChange={() => {}} />

  {viewingPhotoModal && (
    <div className="fixed inset-0 bg-black/90 z-[400] flex justify-center items-center p-4" onClick={() => setViewingPhotoModal(null)}>
      <button className="absolute top-6 right-6 text-white bg-white/10 p-2 rounded-full"><X size={24}/></button>
      <img src={viewingPhotoModal} alt="Enlarged" className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl" onClick={(e) => e.stopPropagation()} />
    </div>
  )}
</div>  
  );
};

export default AdminApprovals;