import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Shield, CheckCircle, AlertTriangle, X, Lock, Unlock, 
  Users, RefreshCw, KeyRound, UserCheck, FileText, Globe, CheckSquare, Square, Loader2, ShieldAlert,
  Eye, XCircle, UserPlus, Camera, Filter, ArrowRight, Power
} from 'lucide-react';
import { stripHtmlTags } from './App';
import { authFetch, hasValidSession } from './api';

// 🟢 REGIONAL HIERARCHY CONSTANTS
const REGIONAL_HIERARCHY = {
  "KMP NORTH": ["KAWEMPE", "KAKIRI", "KASANGATI", "MATUGGA", "NANSANA", "OLD KAMPALA", "WAKISO", "WANDEGEYA"],
  "KMP EAST": ["JINJA ROAD", "KIRA", "KIRA DIV", "KIRA ROAD", "MUKONO", "NAGGALAMA", "SEETA"],
  "KMP SOUTH": ["NATEETE", "CPS KAMPALA", "PARLIAMENT", "ENTEBBE", "KABALAGALA", "KAJJANSI", "KASENYI", "KATWE", "KYENGERA", "NSANGI"],
  "KMP HEADQUARTERS": ["KMP HEADQUARTERS", "FLYING SQUAD", "CRIME INTELLIGENCE"],
  "POLICE HEADQUARTERS": ["NAGURU"]
};

// 🟢 TOP TIER ROLES (RESTRICTED TO SUPER ADMIN ONLY)
const TOP_TIER_ROLES = ['SUPER_ADMIN', 'ASSISTANT_SUPER_ADMIN', 'SYSTEM_ADMIN'];

// 🟢 EXPANDED SUPER CONTROL PANEL MODULES
const CLEARANCE_MATRIX_COLS = [
  { key: 'global_observer', label: 'Global Observer (Read-Only)', color: 'fuchsia', bg: 'bg-fuchsia-50/50' },
  { key: 'ai_hr_access', label: 'AI Nominal Roll', color: 'amber', bg: 'bg-amber-100/60' },
  { key: 'acc_home', label: 'Home Dash', color: 'slate', bg: 'bg-slate-100/50' },
  { key: 'acc_profile', label: 'Profile', color: 'slate', bg: 'bg-slate-100/50' },
  { key: 'acc_comms', label: 'Command Comms', color: 'blue', bg: 'bg-blue-50/50' },
  { key: 'acc_crime', label: 'Crime Registry', color: 'blue', bg: 'bg-blue-50/50' },
  { key: 'acc_ops', label: 'Disruptive Ops', color: 'blue', bg: 'bg-blue-50/50' },
  { key: 'acc_stories', label: 'Success Stories', color: 'blue', bg: 'bg-blue-50/50' },
  { key: 'acc_est', label: 'Establishments', color: 'indigo', bg: 'bg-indigo-50/50' },
  { key: 'acc_hr', label: 'Nominal Roll', color: 'indigo', bg: 'bg-indigo-50/50' },
  { key: 'acc_documents', label: 'Documents', color: 'indigo', bg: 'bg-indigo-50/50' },
  { key: 'acc_ledgers', label: 'Reports & Ledgers', color: 'emerald', bg: 'bg-emerald-50/50' },
  { key: 'acc_consolidated', label: 'Consolidated', color: 'emerald', bg: 'bg-emerald-50/50' },
  { key: 'acc_analytics', label: 'Analytics & Reports', color: 'emerald', bg: 'bg-emerald-50/50' },
  { key: 'acc_approvals', label: 'Access Approvals', color: 'red', bg: 'bg-red-50/50' },
  { key: 'acc_roster', label: 'System Roster', color: 'red', bg: 'bg-red-50/50' },
  { key: 'acc_online', label: 'Active Online', color: 'red', bg: 'bg-red-50/50' },
  { key: 'export_data', label: 'Master Export', color: 'red', bg: 'bg-red-50/50' },
  { key: 'export_logs', label: 'Export Logs', color: 'red', bg: 'bg-red-50/50' },
  { key: 'acc_documents_download', label: 'Documents Download', color: 'indigo', bg: 'bg-indigo-50/50' }
];

const formatOfficerHeader = (user) => {
  const fnum = stripHtmlTags(user.fnum || user.f_num || 'NO-FNUM');
  const rank = stripHtmlTags(user.rank || 'OFFICER');
  const name = stripHtmlTags(user.name || 'UNKNOWN');
  return `${fnum} ${rank} ${name}`;
};

const ToggleSwitch = ({ checked, onChange }) => (
  <div onClick={onChange} className={`w-10 h-5 flex items-center rounded-full p-1 cursor-pointer transition-colors duration-300 shadow-inner ${checked ? 'bg-red-600' : 'bg-slate-300'}`}>
    <div className={`bg-white w-3.5 h-3.5 rounded-full shadow-md transform transition-transform duration-300 ${checked ? 'translate-x-4.5' : 'translate-x-0'}`} />
  </div>
);

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

  const canViewGlobalActive = canViewGlobal || 
    currentUser?.role === 'SUPER_ADMIN' || 
    currentUser?.permissions?.view_global_roster === true || 
    currentUser?.permissions?.global_observer === true;

  const userRoleClean = stripHtmlTags(currentUser?.role || '').toUpperCase();
  const userPosClean = stripHtmlTags(currentUser?.position || '').toUpperCase();

  // 🟢 DEFINED PROPERLY TO ELIMINATE REFERENCE ERROR
  const isSuperAdmin = userRoleClean === 'SUPER_ADMIN';

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
      if (res.ok) {
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

      if (res.ok) fetchLockdownStatus();
      else {
        const err = await res.json().catch(() => ({}));
        alert(`❌ Failed to execute command: ${err.detail || 'Server error'}`);
      }
    } catch (err) {
      alert("❌ Error communicating with the command server.");
    }
  };

  const handleKillSwitchToggle = async () => {
    setLoadingKillSwitch(true);
    try {
      const res = await authFetch('/api/v1/ai/admin/toggle-db-query', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setIsDbKillActive(!data.ai_database_query_enabled);
        alert(data.message);
      } else {
        alert("Failed to toggle AI database kill switch.");
      }
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

  // 🟢 FIXED: Ensures users load when clicking either Matrix or Roster tab
  useEffect(() => {
    if (activeTab === 'approvals') fetchPendingUsers();
    else if (activeTab === 'matrix' || activeTab === 'roster') fetchAllSystemUsers();
    else if (activeTab === 'requests') fetchModRequests();
    else if (activeTab === 'logs') { fetchAuditLogs(); fetchAllSystemUsers(); }
    else if (activeTab === 'resets') fetchResets();
    fetchLockdownStatus();
  }, [activeTab, fetchPendingUsers, fetchAllSystemUsers, fetchModRequests, fetchAuditLogs, fetchResets, fetchLockdownStatus]);

  const filteredPending = useMemo(() => {
    return realPendingUsers.filter(u => {
      const uRegion = stripHtmlTags(u.region || '');
      const uStation = stripHtmlTags(u.station || '');
      if (canViewGlobalActive && filterRegion === 'ALL REGIONS' && filterStation === 'ALL STATIONS') return true;
      if (filterRegion !== 'ALL REGIONS' && uRegion !== filterRegion) return false;
      if (filterStation !== 'ALL STATIONS' && uStation !== filterStation) return false;
      return true;
    });
  }, [realPendingUsers, filterRegion, filterStation, canViewGlobalActive]);

  const filteredRequests = useMemo(() => {
    return modRequests.filter(r => {
      const rRegion = stripHtmlTags(r.current_region || '');
      const rStation = stripHtmlTags(r.current_station || '');
      if (canViewGlobalActive && filterRegion === 'ALL REGIONS' && filterStation === 'ALL STATIONS') return true;
      if (filterRegion !== 'ALL REGIONS' && rRegion !== filterRegion) return false;
      if (filterStation !== 'ALL STATIONS' && rStation !== filterStation) return false;
      return true;
    });
  }, [modRequests, filterRegion, filterStation, canViewGlobalActive]);

  const filteredResets = useMemo(() => {
    return resetRequests.filter(r => {
      const rRegion = stripHtmlTags(r.region || '');
      const rStation = stripHtmlTags(r.station || '');
      if (canViewGlobalActive && filterRegion === 'ALL REGIONS' && filterStation === 'ALL STATIONS') return true;
      if (filterRegion !== 'ALL REGIONS' && rRegion !== filterRegion) return false;
      if (filterStation !== 'ALL STATIONS' && rStation !== filterStation) return false;
      return true;
    });
  }, [resetRequests, filterRegion, filterStation, canViewGlobalActive]);

  const filteredSystemUsers = useMemo(() => {
    return allSystemUsers.filter(u => {
      const uReg = stripHtmlTags(u.region || '').trim().toUpperCase();
      const uStat = stripHtmlTags(u.station || '').trim().toUpperCase();
      const activeReg = stripHtmlTags(filterRegion || '').trim().toUpperCase();
      const activeStat = stripHtmlTags(filterStation || '').trim().toUpperCase();

      if (canViewGlobalActive && activeReg === 'ALL REGIONS' && activeStat === 'ALL STATIONS') return true;
      if (activeReg && activeReg !== 'ALL REGIONS' && uReg !== activeReg) return false;
      if (activeStat && activeStat !== 'ALL STATIONS' && uStat !== activeStat) return false;
      return true;
    });
  }, [allSystemUsers, filterRegion, filterStation, canViewGlobalActive]);

  const filteredLogs = useMemo(() => {
    return auditLogs.filter(log => {
      const logUser = allSystemUsers.find(u => u.fnum === log.user_fnum);
      const logRegion = stripHtmlTags(log.region || logUser?.region || '');
      const logStation = stripHtmlTags(log.station || logUser?.station || '');

      if (canViewGlobalActive && filterRegion === 'ALL REGIONS' && filterStation === 'ALL STATIONS') return true;
      if (filterRegion !== 'ALL REGIONS' && logRegion && logRegion !== filterRegion) return false;
      if (filterStation !== 'ALL STATIONS' && logStation && logStation !== filterStation) return false;
      return true;
    });
  }, [auditLogs, allSystemUsers, filterRegion, filterStation, canViewGlobalActive]);

  const handleBulkMatrixAction = async (fnum, setAllToTrue) => {
    const cleanFnum = stripHtmlTags(fnum);
    const targetUser = allSystemUsers.find(u => u.fnum === cleanFnum);
    
    if (!targetUser) return;
    if (!canModifyUser(currentUser, targetUser)) {
      alert("SECURITY OVERRIDE DENIED: Insufficient clearance to bulk-update this user.");
      return;
    }

    const newPermissions = { ...(targetUser.permissions || {}) };
    if (!newPermissions.super_admin_locks) newPermissions.super_admin_locks = {};

    const colsToProcess = CLEARANCE_MATRIX_COLS.filter(col => !(col.key === 'global_observer' && !isSuperAdmin));

    colsToProcess.forEach(col => {
      const isLocked = newPermissions.super_admin_locks[col.key];
      if (!isSuperAdmin && isLocked) return; 
      newPermissions[col.key] = setAllToTrue;
      if (isSuperAdmin) newPermissions.super_admin_locks[col.key] = !setAllToTrue; 
    });

    setAllSystemUsers(allSystemUsers.map(u => u.fnum === cleanFnum ? { ...u, permissions: newPermissions } : u));

    try {
      const response = await authFetch(`/api/v1/users/${encodeURIComponent(cleanFnum.trim())}/access`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role: targetUser.role, permissions: newPermissions })
      });
      if (!response.ok) throw new Error("Failed to update bulk permissions.");
    } catch (err) { alert(`Bulk Update Failed: ${err.message}`); fetchAllSystemUsers(); }
  };

  const handleGranularPermissionChange = async (fnum, permissionKey, value) => {
    const cleanFnum = stripHtmlTags(fnum);
    const targetUser = allSystemUsers.find(u => u.fnum === cleanFnum);
    
    if (!targetUser) return;
    if (!canModifyUser(currentUser, targetUser)) {
      alert("SECURITY OVERRIDE DENIED: Insufficient clearance to modify this user.");
      return;
    }

    if (value === true && !isSuperAdmin && targetUser.permissions?.super_admin_locks?.[permissionKey]) {
      alert("SECURITY OVERRIDE DENIED: This clearance was locked by High Command.");
      return;
    }

    if (value === false && !isSuperAdmin) {
      setRevokePrompt({ isOpen: true, fnum: cleanFnum, actionType: 'PERMISSION', targetValue: value, permissionKey, reason: '' });
      return;
    }

    let locks = { ...(targetUser.permissions?.super_admin_locks || {}) };
    if (isSuperAdmin) locks[permissionKey] = !value;

    const updatedPermissions = { ...(targetUser.permissions || {}), [permissionKey]: value, super_admin_locks: locks };

    setAllSystemUsers(allSystemUsers.map(u => u.fnum === cleanFnum ? { ...u, permissions: updatedPermissions } : u));

    try {
      const response = await authFetch(`/api/v1/users/${encodeURIComponent(cleanFnum.trim())}/access`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role: targetUser.role, permissions: updatedPermissions })
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(stripHtmlTags(errorData.detail) || `HTTP Error ${response.status}`);
      }
    } catch (err) { alert(`Permission Update Failed:\n${stripHtmlTags(err.message)}`); fetchAllSystemUsers(); }
  };

  const handleRoleTierChange = async (fnum, newRole) => {
    const cleanFnum = stripHtmlTags(fnum);
    const targetUser = allSystemUsers.find(u => u.fnum === cleanFnum);
    
    if (!targetUser) return;
    if (!canModifyUser(currentUser, targetUser)) {
      alert("SECURITY OVERRIDE DENIED: Insufficient clearance to modify this user.");
      return;
    }

    if (newRole !== 'REVOKED' && targetUser.role === 'REVOKED' && !isSuperAdmin && targetUser.permissions?.revoked_by === 'SUPER_ADMIN') {
      alert("SECURITY OVERRIDE DENIED: This access was revoked by a Super Admin.");
      return;
    }

    if (newRole === 'REVOKED' && !isSuperAdmin) {
      setRevokePrompt({ isOpen: true, fnum: cleanFnum, actionType: 'ROLE', targetValue: newRole, permissionKey: null, reason: '' });
      return;
    }

    let updatedPermissions = { ...(targetUser.permissions || {}) };
    if (newRole !== 'REVOKED') {
      updatedPermissions = grantExpressAccess(newRole, updatedPermissions);
      if (isSuperAdmin) { delete updatedPermissions.revoked_by; delete updatedPermissions.revoke_reason; }
    }

    setAllSystemUsers(allSystemUsers.map(u => u.fnum === cleanFnum ? { ...u, role: newRole, permissions: updatedPermissions } : u));

    try {
      const response = await authFetch(`/api/v1/users/${encodeURIComponent(cleanFnum.trim())}/access`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role: newRole, permissions: updatedPermissions })
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(stripHtmlTags(errorData.detail) || `HTTP Error ${response.status}`);
      }
    } catch (err) { alert(`Role Update Failed:\n${stripHtmlTags(err.message)}`); fetchAllSystemUsers(); }
  };

  const handleApproveUser = async (userToApprove) => {
    const fnum = typeof userToApprove === 'object' ? userToApprove.fnum : userToApprove;
    
    if (!canModifyUser(currentUser, userToApprove)) {
        alert("SECURITY OVERRIDE DENIED: Out of Jurisdiction.");
        return;
    }

    setIsProcessingAction(true);
    try {
      const cleanFnum = stripHtmlTags(fnum);
      const safeFnum = encodeURIComponent(cleanFnum.trim());
      let finalRole = typeof userToApprove === 'object' ? userToApprove.role || 'USER' : 'USER';

      if (getRoleWeight(finalRole) >= getRoleWeight(currentUser.role) && !isSuperAdmin) {
          const proceed = window.confirm(`SECURITY HALT: This officer requested [${finalRole.replace(/_/g, ' ')}] clearance, which exceeds your authority to grant.\n\nWould you like to approve them with standard [USER] clearance instead?`);
          if (!proceed) { setIsProcessingAction(false); return; }
          finalRole = 'USER';
      }

      const grantedPermissions = grantExpressAccess(finalRole, userToApprove.permissions || {});

      const response = await authFetch(`/api/v1/users/${safeFnum}/access`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role: finalRole, is_approved: true, permissions: grantedPermissions })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(stripHtmlTags(data.detail) || "Failed to approve user.");

      alert(`✅ Success: ${cleanFnum} access has been approved.`);
      setSelectedPendingUser(null);
      fetchPendingUsers();
      fetchAllSystemUsers();
    } catch (err) { alert(`Approval Error: ${stripHtmlTags(err.message)}`); } 
    finally { setIsProcessingAction(false); }
  };

  const handleRejectUser = async (userToReject) => {
    const fnum = typeof userToReject === 'object' ? userToReject.fnum : userToReject;
    const name = typeof userToReject === 'object' ? userToReject.name : fnum;

    if (!canModifyUser(currentUser, userToReject)) {
        alert("SECURITY OVERRIDE DENIED: Out of Jurisdiction.");
        return;
    }

    const rawReason = window.prompt(`Enter official reason for REJECTING ${name} (${fnum}):`);
    if (rawReason === null) return;
    if (!rawReason.trim()) return alert("Rejection justification is required.");

    setIsProcessingAction(true);
    try {
      const cleanFnum = stripHtmlTags(fnum);
      const safeFnum = encodeURIComponent(cleanFnum.trim());
      const safeReason = encodeURIComponent(stripHtmlTags(rawReason));

      const response = await authFetch(`/api/v1/users/${safeFnum}/revoke?reason=${safeReason}`, { method: "DELETE" });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(stripHtmlTags(errData.detail) || "Failed to reject registration request.");
      }

      alert(`⛔ Request Rejected: ${cleanFnum} has been removed from the queue.`);
      setSelectedPendingUser(null);
      fetchPendingUsers();
    } catch (err) { alert(`Rejection Error: ${stripHtmlTags(err.message)}`); } 
    finally { setIsProcessingAction(false); }
  };

  const handleReviewRequest = async (reqId, actionStatus) => {
    if (!reqId) return alert("Error: Request ID is undefined.");
    const reqObj = modRequests.find(r => (r.id || r.sn) === reqId);
    
    if (reqObj && !['SUPER_ADMIN', 'ASSISTANT_SUPER_ADMIN'].includes(currentUser?.role) && currentUser?.region !== reqObj.current_region) {
        alert("SECURITY OVERRIDE DENIED: Cross-regional HR modifications are strictly restricted to Super/Assistant Admins.");
        return;
    }

    let payload = { status: actionStatus };
    if (actionStatus === "REJECTED") {
      const rawReason = window.prompt("State the reason for rejecting this HR request:");
      if (rawReason === null) return; 
      payload.reason = stripHtmlTags(rawReason);
    }

    try {
      const response = await authFetch(`/api/v1/requests/${reqId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(stripHtmlTags(errData.detail) || `Server Error: ${response.status}`);
      }
      
      setModRequests(modRequests.filter(r => r.id !== reqId && r.sn !== reqId));
      setSelectedModRequest(null); 
      alert(`Request ${actionStatus.toLowerCase()} successfully!`);
    } catch (err) { alert(`Error processing request: ${stripHtmlTags(err.message)}`); }
  };

  const handleResetAction = async (reqId, actionStr) => {
    const reqObj = resetRequests.find(r => r.id === reqId);
    
    if (reqObj && !['SUPER_ADMIN', 'ASSISTANT_SUPER_ADMIN'].includes(currentUser?.role) && currentUser?.region !== reqObj.region) {
        alert("SECURITY OVERRIDE DENIED: Cross-regional password resets are strictly restricted to Super/Assistant Admins.");
        return;
    }

    try {
      const formData = new URLSearchParams();
      formData.append('action', actionStr);
      
      const response = await authFetch(`/api/v1/admin/execute-reset/${reqId}`, {
        method: "POST", headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: formData
      });
      
      const data = await response.json();
      if (!response.ok) throw new Error(stripHtmlTags(data.detail));
      
      setResetRequests(resetRequests.filter(r => r.id !== reqId));
      
      if (actionStr === "APPROVE") alert(`Password successfully reset! Temporary key: ${stripHtmlTags(data.new_password)}`);
      else alert("Request rejected.");
    } catch (err) { alert(`Error: ${stripHtmlTags(err.message)}`); }
  };

  const handleForcePassword = async (fnum, name) => {
    const newPass = window.prompt(`[SUPER ADMIN OVERRIDE]\nEnter new 6+ character password for ${name} (${fnum}):`);
    if (!newPass) return;
    if (newPass.length < 6) return alert("Password must be at least 6 characters long.");

    setIsProcessingAction(true);
    try {
      const response = await authFetch(`/api/v1/admin/users/${encodeURIComponent(fnum.trim())}/force-password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_password: newPass })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Failed to force password reset.");
      alert(`✅ ${data.message}`);
    } catch (err) {
      alert(`❌ Error: ${err.message}`);
    } finally {
      setIsProcessingAction(false);
    }
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

          <select 
            value={filterRegion} 
            onChange={(e) => { setFilterRegion(stripHtmlTags(e.target.value)); setFilterStation('ALL STATIONS'); }} 
            disabled={!canViewGlobalActive} 
            className="border border-slate-300 rounded-md p-2 text-xs shadow-sm bg-white disabled:bg-slate-100 font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer min-w-[180px]"
          >
            {canViewGlobalActive ? (
              <><option value="ALL REGIONS">ALL REGIONS (GLOBAL)</option>{Object.keys(REGIONAL_HIERARCHY || {}).map(reg => <option key={reg} value={reg}>{reg}</option>)}</>
            ) : <option value={currentUser?.region}>{stripHtmlTags(currentUser?.region)}</option>}
          </select>

          <select 
            value={filterStation} 
            onChange={(e) => setFilterStation(stripHtmlTags(e.target.value))} 
            disabled={!canViewGlobalActive && !['RPC', 'Deputy Commander'].includes(currentUser?.role)} 
            className="border border-slate-300 rounded-md p-2 text-xs shadow-sm bg-white disabled:bg-slate-100 font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer min-w-[200px]"
          >
            {canViewGlobalActive || ['RPC', 'Deputy Commander'].includes(currentUser?.role) ? (
              <><option value="ALL STATIONS">ALL STATIONS / DIVISIONS</option>{filterRegion !== 'ALL REGIONS' && REGIONAL_HIERARCHY?.[filterRegion] ? REGIONAL_HIERARCHY[filterRegion].map(stat => <option key={stat} value={stat}>{stat}</option>) : null}</>
            ) : <option value={currentUser?.station}>{stripHtmlTags(currentUser?.station)}</option>}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full xl:w-auto">
          <button onClick={() => { fetchPendingUsers(); fetchAllSystemUsers(); fetchModRequests(); fetchAuditLogs(); fetchResets(); fetchLockdownStatus(); }} className="bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 font-bold px-4 py-2 rounded-lg text-xs flex items-center transition cursor-pointer shadow-sm">
            <RefreshCw size={14} className="mr-2 text-blue-600" /> Sync Queue
          </button>

          {isSuperAdmin && (
            <button onClick={() => { fetchLockdownStatus(); setShowLockdownModal(true); }} className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer border ${activeLockdownCount > 0 ? 'bg-red-950 border-red-500 text-red-200 animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.5)]' : 'bg-amber-950/60 border-amber-600/50 text-amber-300 hover:bg-amber-900/60'}`}>
              <span>🔒</span><span>{activeLockdownCount > 0 ? `Lockdowns (${activeLockdownCount} Active)` : 'Lockdowns'}</span>
            </button>
          )}

          {isSuperAdmin && (
            <button onClick={handleKillSwitchToggle} disabled={loadingKillSwitch} className={`font-bold px-4 py-2 rounded-lg text-xs flex items-center transition cursor-pointer shadow-sm border ${isDbKillActive ? 'bg-emerald-50 border-emerald-400 text-emerald-800 hover:bg-emerald-100' : 'bg-red-50 border-red-400 text-red-800 hover:bg-red-100'}`}>
              {loadingKillSwitch ? <Loader2 size={14} className="mr-2 animate-spin text-slate-500" /> : <ShieldAlert size={14} className={`mr-2 ${isDbKillActive ? 'text-emerald-600' : 'text-red-600'}`} />}
              {isDbKillActive ? 'AI DB Query: ON' : 'AI DB Query: KILLED'}
            </button>
          )}
        </div>
      </div>

      {/* TABS SECTION */}
      <div className="flex border-b border-slate-200 bg-white rounded-t-xl shadow-sm overflow-x-auto custom-scrollbar">
        <button onClick={() => setActiveTab('approvals')} className={`flex-1 py-3.5 px-4 text-xs uppercase tracking-wider font-extrabold flex items-center justify-center transition-all min-w-max cursor-pointer ${activeTab === 'approvals' ? 'bg-slate-50 border-b-[3px] border-blue-600 text-blue-700 shadow-inner' : 'text-slate-500 hover:bg-slate-50/50 hover:text-slate-800'}`}>
          <UserPlus className="w-4 h-4 mr-2"/> Authorizations ({loadingPending ? '...' : filteredPending.length})
        </button>
        <button onClick={() => setActiveTab('matrix')} className={`flex-1 py-3.5 px-4 text-xs uppercase tracking-wider font-extrabold flex items-center justify-center transition-all min-w-max cursor-pointer ${activeTab === 'matrix' ? 'bg-slate-50 border-b-[3px] border-indigo-600 text-indigo-700 shadow-inner' : 'text-slate-500 hover:bg-slate-50/50 hover:text-slate-800'}`}>
          <Shield className="w-4 h-4 mr-2"/> Clearance Matrix ({filteredSystemUsers.length})
        </button>
        <button onClick={() => setActiveTab('roster')} className={`flex-1 py-3.5 px-4 text-xs uppercase tracking-wider font-extrabold flex items-center justify-center transition-all min-w-max cursor-pointer ${activeTab === 'roster' ? 'bg-slate-50 border-b-[3px] border-cyan-600 text-cyan-700 shadow-inner' : 'text-slate-500 hover:bg-slate-50/50 hover:text-slate-800'}`}>
          <Users className="w-4 h-4 mr-2"/> Directory Roster ({filteredSystemUsers.length})
        </button>
        <button onClick={() => setActiveTab('requests')} className={`flex-1 py-3.5 px-4 text-xs uppercase tracking-wider font-extrabold flex items-center justify-center transition-all min-w-max cursor-pointer ${activeTab === 'requests' ? 'bg-slate-50 border-b-[3px] border-amber-500 text-amber-700 shadow-inner' : 'text-slate-500 hover:bg-slate-50/50 hover:text-slate-800'}`}>
          <RefreshCw className="w-4 h-4 mr-2"/> HR Transfers ({filteredRequests.length})
        </button>
        <button onClick={() => setActiveTab('logs')} className={`flex-1 py-3.5 px-4 text-xs uppercase tracking-wider font-extrabold flex items-center justify-center transition-all min-w-max cursor-pointer ${activeTab === 'logs' ? 'bg-slate-50 border-b-[3px] border-emerald-600 text-emerald-700 shadow-inner' : 'text-slate-500 hover:bg-slate-50/50 hover:text-slate-800'}`}>
          <FileText className="w-4 h-4 mr-2"/> Audit Logs ({filteredLogs.length})
        </button>
        <button onClick={() => setActiveTab('resets')} className={`flex-1 py-3.5 px-4 text-xs uppercase tracking-wider font-extrabold flex items-center justify-center transition-all min-w-max cursor-pointer ${activeTab === 'resets' ? 'bg-slate-50 border-b-[3px] border-red-600 text-red-700 shadow-inner' : 'text-slate-500 hover:bg-slate-50/50 hover:text-slate-800'}`}>
          <KeyRound className="w-4 h-4 mr-2"/> Password Resets ({filteredResets.length})
        </button>
      </div>

      {/* PENDING USERS TAB */}
      {activeTab === 'approvals' && (
        <div className="bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden max-w-6xl mx-auto">
          {loadingPending ? (
            <div className="p-8 text-center text-slate-500 font-medium animate-pulse text-xs flex items-center justify-center"><Loader2 size={16} className="animate-spin mr-2 text-blue-600" /> Syncing with Command Database...</div>
          ) : filteredPending.length === 0 ? (
            <div className="p-8 text-center text-slate-500 font-medium text-xs">No active unapproved access requests pending in selected queue.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-xs">
                <thead className="bg-slate-900 text-blue-100 uppercase font-black text-[11px] tracking-wider border-b-2 border-blue-500">
                  <tr><th className="px-4 py-3.5 text-left">Officer Details</th><th className="px-4 py-3.5 text-left">Command Post</th><th className="px-4 py-3.5 text-left">Derived Role Tier</th><th className="px-4 py-3.5 text-right">Action</th></tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-200">
                  {filteredPending.map((user) => {
                    const isCrossRegion = !canModifyUser(currentUser, user);
                    return (
                      <tr key={user.fnum} onClick={() => setSelectedPendingUser(user)} className="hover:bg-blue-50/50 cursor-pointer transition-colors group">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center space-x-3">
                            <div onClick={(e) => { if (user.profile_photo_path) { e.stopPropagation(); setViewingPhotoModal(user.profile_photo_path); } }} className="w-9 h-9 rounded-full bg-slate-100 border border-slate-300 flex items-center justify-center font-bold text-xs text-slate-600 shrink-0 overflow-hidden shadow-xs group-hover:border-blue-400">
                              {user.profile_photo_path ? <img src={user.profile_photo_path} alt="" className="w-full h-full object-cover" /> : user.name?.charAt(0) || 'U'}
                            </div>
                            <div>
                              <div className="font-extrabold text-slate-900 group-hover:text-blue-700 transition-colors">{formatOfficerHeader(user)}</div>
                              <div className="text-[10px] text-slate-400 font-mono">NIN: {stripHtmlTags(user.nin || 'N/A')} • Tel: {stripHtmlTags(user.phone || 'N/A')}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="font-bold text-blue-700 uppercase">{stripHtmlTags(user.station)}</div>
                          <div className="text-[10px] text-slate-500 uppercase">{stripHtmlTags(user.region)}</div>
                          <div className="text-[9px] bg-slate-100 px-1.5 py-0.5 rounded mt-0.5 inline-block border font-bold text-slate-600">{stripHtmlTags(user.position)}</div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`px-2 py-0.5 inline-flex text-[10px] font-bold rounded-full border ${user.role === 'SUPER_ADMIN' ? 'bg-purple-100 text-purple-800 border-purple-200' : user.role === 'ADMIN' ? 'bg-blue-100 text-blue-800 border-blue-200' : user.role === 'RPC' ? 'bg-amber-100 text-amber-800 border-amber-200' : 'bg-slate-100 text-slate-800 border-slate-200'}`}>{stripHtmlTags(user.role || 'USER')}</span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right space-x-2" onClick={(e) => e.stopPropagation()}>
                          <button type="button" onClick={() => setSelectedPendingUser(user)} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-1.5 px-3 rounded-md text-[11px] transition inline-flex items-center cursor-pointer border border-slate-300"><Eye size={13} className="mr-1" /> Review</button>
                          <button type="button" disabled={isProcessingAction || isCrossRegion} onClick={() => handleRejectUser(user)} title={isCrossRegion ? "Out of Jurisdiction" : "Reject Request"} className={`border font-bold py-1.5 px-3 rounded-md text-[11px] transition inline-flex items-center ${isCrossRegion ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed opacity-50' : 'bg-red-50 hover:bg-red-600 hover:text-white text-red-600 border-red-200 cursor-pointer'}`}><XCircle size={13} className="mr-1" /> Reject</button>
                          <button type="button" disabled={isProcessingAction || isCrossRegion} onClick={() => handleApproveUser(user)} title={isCrossRegion ? "Out of Jurisdiction" : "Approve Access"} className={`font-bold py-1.5 px-3 rounded-md shadow-xs text-[11px] transition inline-flex items-center ${isCrossRegion ? 'bg-slate-200 text-slate-400 cursor-not-allowed opacity-50' : 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer'}`}><CheckCircle size={13} className="mr-1" /> Approve Access</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* CLEARANCE MATRIX TAB */}
      {activeTab === 'matrix' && (
        <div className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden w-full">
          <div className="bg-slate-900 text-white p-3 text-xs font-extrabold uppercase tracking-wider flex flex-col md:flex-row items-start md:items-center justify-between gap-2">
            <span className="flex items-center"><Shield className="w-4 h-4 mr-1.5 text-indigo-400" /> Super Control Panel - Active Roster Matrix ({stripHtmlTags(filterRegion)} {filterStation !== 'ALL STATIONS' ? `/ ${stripHtmlTags(filterStation)}` : ''})</span>
            <span className="text-[10px] text-slate-400 font-mono text-right">Tiers: USER | STN_ADMIN | DIV_ADMIN | REGIONAL_ADMIN | SYS_ADMIN | ASST_SUPER | SUPER_ADMIN | REVOKED</span>
          </div>
            
          {loadingUsers ? (
            <div className="p-8 text-center text-slate-400 font-medium animate-pulse text-xs flex items-center justify-center"><Loader2 size={16} className="animate-spin mr-2 text-indigo-600" /> Syncing user database roster...</div>
          ) : filteredSystemUsers.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs font-medium">No registered system users found for this regional filter.</div>
          ) : (
            <div className="overflow-x-auto w-full custom-scrollbar">
              <table className="min-w-max divide-y divide-slate-200 text-xs">
                <thead className="bg-slate-900 text-white uppercase font-black text-[10px] tracking-wider border-b-2 border-blue-500">
                  <tr>
                    <th className="p-2.5 text-left sticky left-0 z-10 bg-slate-900 shadow-[1px_0_0_#3b82f6] text-blue-100">Officer Details</th>
                    <th className="p-2.5 text-center sticky left-[240px] z-10 bg-slate-900 shadow-[1px_0_0_#3b82f6] text-blue-100">Administrative Tier</th>
                    <th className="p-2.5 text-center sticky left-[360px] z-10 bg-slate-900 shadow-[1px_0_0_#3b82f6] text-blue-100">Quick Actions</th>
                    {CLEARANCE_MATRIX_COLS.map((col, idx) => {
                      if (col.key === 'global_observer' && !isSuperAdmin) return null;
                      return (
                        <th key={idx} className="p-2 text-center border-l border-slate-700 bg-slate-900">
                          <div className="w-16 mx-auto whitespace-normal break-words leading-tight text-[9px] text-blue-100">
                            {col.key === 'global_observer' && <Globe className="w-3 h-3 mx-auto text-fuchsia-400 mb-1" />}{stripHtmlTags(col.label)}
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {filteredSystemUsers.map(u => {
                    const p = u.permissions || {};
                    const isRevoked = u.role === 'REVOKED';
                    const isSelf = u.fnum === currentUser?.fnum;
                    const isRoleSelectDisabled = isSelf || !canModifyUser(currentUser, u);
                    const isBulkActionDisabled = isSelf || !canModifyUser(currentUser, u) || !isExplicitHighCommand;

                    return (
                      <tr key={u.fnum} className={`transition-colors ${isRevoked ? 'bg-red-50/40' : 'hover:bg-slate-50'} ${isSelf ? 'bg-blue-50/30 ring-1 ring-inset ring-blue-100' : ''}`}>
                        <td className="p-2.5 sticky left-0 z-10 bg-white shadow-[1px_0_0_#e2e8f0] min-w-[240px]">
                          <div className={`font-extrabold text-[11px] flex items-center ${isRevoked ? 'text-red-900' : 'text-slate-900'}`}>
                            {formatOfficerHeader(u)}
                            {isSelf && <span className="ml-2 px-1.5 py-0.5 text-[8px] bg-blue-100 text-blue-700 font-bold rounded-full border border-blue-200" title="You cannot modify your own row.">YOU</span>}
                            {u.role === 'SUPER_ADMIN' && !isSelf && <span className="ml-2 px-1.5 py-0.5 text-[8px] bg-red-100 text-red-700 font-bold rounded-full border border-red-200">GOD-MODE</span>}
                            {p.global_observer && u.role !== 'SUPER_ADMIN' && <span className="ml-2 px-1.5 py-0.5 text-[8px] bg-fuchsia-100 text-fuchsia-700 font-bold rounded-full border border-fuchsia-200">OBSERVER</span>}
                            {p.revoked_by === 'SUPER_ADMIN' && <Lock size={12} className="ml-2 text-red-600" title="Revoked by Super Admin" />}
                          </div>
                          <div className={`text-[10px] font-mono mt-0.5 ${isRevoked ? 'text-red-500' : 'text-slate-500'}`}>Station: <strong className={isRevoked ? 'text-red-700' : 'text-slate-700'}>{stripHtmlTags(u.station)}</strong> ({stripHtmlTags(u.region)})</div>
                        </td>

                        <td className="p-2.5 text-center sticky left-[240px] z-10 bg-white shadow-[1px_0_0_#e2e8f0] min-w-[120px]">
                          <select 
                            id={`role-select-${u.fnum}`} name={`role_select_${u.fnum}`} value={u.role || 'USER'} onChange={(e) => handleRoleTierChange(u.fnum, stripHtmlTags(e.target.value))}
                            disabled={isRoleSelectDisabled} title={isRoleSelectDisabled ? "Insufficient authority to change this user's role." : ""}
                            className={`border rounded-md px-2 py-1 font-bold outline-none uppercase w-full text-[10px] ${isRoleSelectDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${u.role === 'SUPER_ADMIN' ? 'bg-red-50 text-red-700 border-red-300' : u.role === 'ASSISTANT_SUPER_ADMIN' ? 'bg-rose-50 text-rose-700 border-rose-300' : u.role === 'SYSTEM_ADMIN' ? 'bg-purple-50 text-purple-700 border-purple-300' : (u.role === 'ADMIN_USER' || u.role === 'ADMIN') ? 'bg-indigo-50 text-indigo-700 border-indigo-300' : u.role === 'DIVISION_ADMIN' ? 'bg-sky-50 text-sky-700 border-sky-300' : u.role === 'STATION_ADMIN' ? 'bg-blue-50 text-blue-700 border-blue-300' : u.role === 'REVOKED' ? 'bg-red-100 text-red-800 border-red-400 shadow-inner' : 'bg-slate-100 text-slate-700 border-slate-300'}`}
                          >
                            <option value="USER">USER</option>
                            <option value="STATION_ADMIN">STN ADMIN</option>
                            {(getRoleWeight(currentUser?.role) > 60 || isSuperAdmin) && <option value="DIVISION_ADMIN">DIV ADMIN</option>}
                            {(getRoleWeight(currentUser?.role) > 70 || isSuperAdmin) && <option value="ADMIN_USER">REGIONAL ADMIN</option>}
                            {(getRoleWeight(currentUser?.role) > 80 || isSuperAdmin) && <option value="SYSTEM_ADMIN">SYS ADMIN</option>}
                            {(getRoleWeight(currentUser?.role) > 90 || isSuperAdmin) && <option value="ASSISTANT_SUPER_ADMIN">ASST SUPER</option>}
                            {isSuperAdmin && <option value="SUPER_ADMIN">SUPER ADMIN</option>}
                            <option value="REVOKED" className="text-red-600 font-extrabold bg-red-50">REVOKED</option>
                          </select>
                        </td>

                        <td className="p-2.5 text-center sticky left-[360px] z-10 bg-white shadow-[1px_0_0_#e2e8f0] min-w-[90px]">
                          <div className="flex items-center justify-center space-x-1.5">
                            <button onClick={() => handleBulkMatrixAction(u.fnum, true)} disabled={isBulkActionDisabled} title={isBulkActionDisabled ? "Insufficient authority to execute bulk updates." : "Check All Modules"} className={`p-1 rounded border transition shadow-xs ${isBulkActionDisabled ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed opacity-50' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-300 cursor-pointer'}`}><CheckSquare size={13} /></button>
                            <button onClick={() => handleBulkMatrixAction(u.fnum, false)} disabled={isBulkActionDisabled} title={isBulkActionDisabled ? "Insufficient authority to execute bulk updates." : "Uncheck All Modules (Deny Access)"} className={`p-1 rounded border transition shadow-xs ${isBulkActionDisabled ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed opacity-50' : 'bg-red-50 text-red-700 hover:bg-red-100 border-red-300 cursor-pointer'}`}><Square size={13} /></button>
                            
                            {isSuperAdmin && !isSelf && (
                              <button 
                                onClick={() => handleForcePassword(u.fnum, u.name)}
                                disabled={isProcessingAction}
                                title="Force Password Reset"
                                className="p-1 rounded border transition shadow-xs bg-amber-50 text-amber-700 hover:bg-amber-100 border-amber-300 cursor-pointer"
                              >
                                <KeyRound size={13} />
                              </button>
                            )}
                          </div>
                        </td>

                        {CLEARANCE_MATRIX_COLS.map((col, idx) => {
                          if (col.key === 'global_observer' && !isSuperAdmin) return null;
                          const hasSuperAdminLock = Boolean(p.super_admin_locks?.[col.key]);
                          const isLockedVisually = hasSuperAdminLock && !isSuperAdmin;
                          const isStrictSuperAdminOnly = col.key === 'global_observer';
                          const isDisabled = isSelf || !canModifyUser(currentUser, u) || u.role === 'SUPER_ADMIN' || isRevoked || currentUser?.role === 'SYSTEM_ADMIN' || (!isSuperAdmin && hasSuperAdminLock) || (isStrictSuperAdminOnly && !isSuperAdmin);
                          let lockTitle = "";
                          if (!canModifyUser(currentUser, u)) lockTitle = "Out of Jurisdiction (Requires Higher Tier)";
                          else if (u.role === 'SUPER_ADMIN') lockTitle = "Super Admin Access Locked";
                          else if (hasSuperAdminLock) lockTitle = "Locked by High Command";

                          return (
                            <td key={idx} className={`p-2 text-center border-l border-white/50 ${col.bg || ''}`}>
                              <div className="relative inline-flex items-center justify-center">
                                <input type="checkbox" id={`clearance-${u.fnum}-${col.key}`} name={`clearance_${u.fnum}_${col.key}`} checked={u.role === 'SUPER_ADMIN' || Boolean(p[col.key])} disabled={isDisabled} title={lockTitle} onChange={e => handleGranularPermissionChange(u.fnum, col.key, e.target.checked)} className={`w-3.5 h-3.5 rounded accent-${col.color}-600 ${isDisabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`} />
                                {((isLockedVisually || u.role === 'SUPER_ADMIN') && !isSelf && canModifyUser(currentUser, u)) && <Lock size={9} className="absolute -top-1.5 -right-2 text-red-600 drop-shadow-xs" title={lockTitle} />}
                              </div>
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

      {/* SYSTEM DIRECTORY ROSTER TAB */}
      {activeTab === 'roster' && (
        <div className="bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden max-w-6xl mx-auto">
          <div className="bg-slate-900 px-4 py-2.5 border-b border-slate-800 flex items-center justify-between text-white font-semibold text-xs uppercase tracking-wider">
            <span className="flex items-center">
              <Users className="w-4 h-4 mr-2 text-cyan-400" /> Command Directory & System Roster ({stripHtmlTags(filterRegion)} {filterStation !== 'ALL STATIONS' ? `/ ${stripHtmlTags(filterStation)}` : ''})
            </span>
          </div>
          
          {loadingUsers ? (
            <div className="p-8 text-center text-slate-500 font-medium animate-pulse text-xs flex items-center justify-center">
              <Loader2 size={16} className="animate-spin mr-2 text-cyan-600" /> Compiling deployment roster...
            </div>
          ) : filteredSystemUsers.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs font-medium">No registered personnel found for this filter.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-xs">
                <thead className="bg-slate-900 text-blue-100 uppercase font-black text-[11px] tracking-wider border-b-2 border-blue-500">
                  <tr>
                    <th className="px-4 py-3.5 text-left">Officer Details</th>
                    <th className="px-4 py-3.5 text-left">Identifiers</th>
                    <th className="px-4 py-3.5 text-left">Contact Data</th>
                    <th className="px-4 py-3.5 text-left">Deployment</th>
                    <th className="px-4 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-200">
                  {filteredSystemUsers.map((user) => (
                    <tr key={user.fnum} className="hover:bg-cyan-50/50 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center space-x-3">
                          <div className="w-9 h-9 rounded-full bg-slate-100 border border-slate-300 flex items-center justify-center font-bold text-xs text-slate-600 shrink-0 overflow-hidden shadow-xs">
                            {user.profile_photo_path ? (
                              <img src={user.profile_photo_path} alt="" className="w-full h-full object-cover" />
                            ) : (
                              user.name?.charAt(0) || 'U'
                            )}
                          </div>
                          <div>
                            <div className="font-extrabold text-slate-900">
                              {formatOfficerHeader(user)}
                            </div>
                            <div className="text-[10px] text-slate-500 font-bold uppercase mt-0.5">
                              {stripHtmlTags(user.position || 'General Duties')}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="text-[11px] text-slate-700"><span className="font-bold text-slate-400">IPPS:</span> {stripHtmlTags(user.ipps || 'N/A')}</div>
                        <div className="text-[11px] text-slate-700 font-mono"><span className="font-bold text-slate-400">NIN:</span> {stripHtmlTags(user.nin || 'N/A')}</div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="text-[11px] text-slate-700 font-bold">{stripHtmlTags(user.phone || 'N/A')}</div>
                        <div className="text-[10px] text-slate-500">{stripHtmlTags(user.email || 'N/A')}</div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="font-bold text-blue-700 uppercase">{stripHtmlTags(user.station)}</div>
                        <div className="text-[10px] text-slate-500 uppercase">{stripHtmlTags(user.region)}</div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right">
                         {isSuperAdmin && currentUser?.fnum !== user.fnum && (
                           <button 
                             onClick={() => handleForcePassword(user.fnum, user.name)}
                             disabled={isProcessingAction}
                             title="Force Password Reset"
                             className="px-3 py-1.5 rounded-lg border transition shadow-xs bg-amber-50 text-amber-700 hover:bg-amber-100 border-amber-300 cursor-pointer font-bold inline-flex items-center text-[10px] uppercase tracking-wider"
                           >
                             <KeyRound size={12} className="mr-1.5" /> Force Password
                           </button>
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

      {/* HR MODIFICATION REQUESTS TAB */}
      {activeTab === 'requests' && (
        <div className="bg-white rounded-xl shadow-xs border border-amber-200 overflow-hidden max-w-6xl mx-auto">
          <div className="bg-slate-900 px-4 py-2.5 border-b border-slate-800 flex items-center text-white font-semibold text-xs uppercase tracking-wider"><Shield className="w-4 h-4 mr-2 text-amber-400" /> HR Modification Requests</div>
          {loadingRequests ? (
            <div className="p-8 text-center text-slate-500 font-medium animate-pulse text-xs flex items-center justify-center"><Loader2 size={16} className="animate-spin mr-2 text-amber-600" /> Loading pending modifications...</div>
          ) : filteredRequests.length === 0 ? (
            <div className="p-8 text-center text-slate-500 font-medium text-xs">No pending profile modification requests in selected queue.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-xs">
                <thead className="bg-slate-900 text-blue-100 uppercase font-black text-[11px] tracking-wider border-b-2 border-blue-500">
                  <tr><th className="px-4 py-3.5 text-left">Officer Details</th><th className="px-4 py-3.5 text-left">Requested Changes</th><th className="px-4 py-3.5 text-left">Action</th></tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-200">
                  {filteredRequests.map((req) => {
                    const isCrossRegion = !['SUPER_ADMIN', 'ASSISTANT_SUPER_ADMIN'].includes(currentUser?.role) && currentUser?.region !== req.current_region;
                    return (
                      <tr key={req.id || req.sn} className="hover:bg-amber-50/50">
                        <td className="px-4 py-2.5 whitespace-nowrap"><div className="font-extrabold text-blue-700">{formatOfficerHeader({ fnum: req.fnum, rank: req.current_rank, name: req.current_name })}</div></td>
                        <td className="px-4 py-2.5 text-slate-700">
                          {req.requested_name && req.requested_name !== req.current_name && <div className="text-[11px]"><span className="font-bold text-slate-400">Name:</span> <span className="text-red-500 line-through mr-1">{stripHtmlTags(req.current_name)}</span> ➡️ <span className="text-emerald-600 font-bold">{stripHtmlTags(req.requested_name)}</span></div>}
                          {req.requested_rank && req.requested_rank !== req.current_rank && <div className="text-[11px]"><span className="font-bold text-slate-400">Rank:</span> <span className="text-red-500 line-through mr-1">{stripHtmlTags(req.current_rank)}</span> ➡️ <span className="text-emerald-600 font-bold">{stripHtmlTags(req.requested_rank)}</span></div>}
                          {req.requested_station && req.requested_station !== req.current_station && <div className="text-[11px]"><span className="font-bold text-slate-400">Station:</span> <span className="text-red-500 line-through mr-1">{stripHtmlTags(req.current_station)}</span> ➡️ <span className="text-emerald-600 font-bold">{stripHtmlTags(req.requested_station)}</span></div>}
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <div className="flex space-x-2">
                            <button onClick={() => setSelectedModRequest(req)} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-1 px-2.5 rounded text-[11px] transition flex items-center shadow-xs cursor-pointer border border-slate-300"><Eye size={13} className="mr-1" /> Preview Details</button>
                            <button disabled={isCrossRegion} title={isCrossRegion ? "Out of Jurisdiction" : ""} onClick={() => handleReviewRequest(req.id || req.sn, "APPROVED")} className={`font-bold py-1 px-2.5 rounded text-[11px] transition flex items-center shadow-xs ${isCrossRegion ? 'bg-slate-200 text-slate-400 cursor-not-allowed opacity-50' : 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer'}`}><CheckCircle size={13} className="mr-1" /> Approve</button>
                            <button disabled={isCrossRegion} title={isCrossRegion ? "Out of Jurisdiction" : ""} onClick={() => handleReviewRequest(req.id || req.sn, "REJECTED")} className={`font-bold py-1 px-2.5 rounded text-[11px] transition flex items-center shadow-xs ${isCrossRegion ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed opacity-50' : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 cursor-pointer'}`}><X size={13} className="mr-1" /> Reject</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* AUDIT LOGS TAB */}
      {activeTab === 'logs' && (
        <div className="bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden max-w-6xl mx-auto">
          <div className="bg-slate-900 px-4 py-2.5 border-b border-slate-800 flex items-center justify-between text-white font-semibold text-xs uppercase tracking-wider"><span className="flex items-center"><Shield className="w-4 h-4 mr-2 text-blue-400" /> System Audit Logs ({stripHtmlTags(filterRegion)} {filterStation !== 'ALL STATIONS' ? `/ ${stripHtmlTags(filterStation)}` : ''})</span></div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-xs">
              <thead className="bg-slate-900 text-blue-100 uppercase font-black text-[11px] tracking-wider border-b-2 border-blue-500">
                <tr><th className="px-4 py-3.5 text-left">Timestamp</th><th className="px-4 py-3.5 text-left">User FNUM</th><th className="px-4 py-3.5 text-left">Event</th><th className="px-4 py-3.5 text-left">Target</th><th className="px-4 py-3.5 text-left">Details</th></tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-200">
                {loadingLogs ? (
                  <tr><td colSpan="5" className="p-8 text-center text-slate-500 font-bold animate-pulse text-xs">Decrypting server logs...</td></tr>
                ) : filteredLogs.length === 0 ? (
                  <tr><td colSpan="5" className="p-4 text-center text-slate-500 text-xs">No audit logs found for the selected regional filter and station.</td></tr>
                ) : (
                  filteredLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2 whitespace-nowrap text-slate-500 font-mono text-[10px]">{stripHtmlTags(log.created_at || 'Unknown Time')}</td>
                      <td className="px-4 py-2 whitespace-nowrap font-extrabold text-blue-700">{stripHtmlTags(log.user_fnum)}</td>
                      <td className="px-4 py-2 whitespace-nowrap"><span className="font-extrabold text-slate-800 uppercase text-[10px]">{stripHtmlTags(log.event_type)}</span></td>
                      <td className="px-4 py-2 text-slate-600 font-medium text-[11px]">{stripHtmlTags(log.target_user || 'N/A')}</td>
                      <td className="px-4 py-2 text-slate-600 text-[11px]">{stripHtmlTags(log.details)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* PASSWORD RESETS TAB */}
      {activeTab === 'resets' && (        
        <div className="bg-white rounded-xl shadow-xs border border-red-200 overflow-hidden max-w-6xl mx-auto">
          <div className="bg-slate-900 px-4 py-2.5 border-b border-slate-800 flex items-center text-white font-semibold text-xs uppercase tracking-wider"><Lock className="w-4 h-4 mr-2 text-red-400" /> Authorized Password Recovery</div>
          {loadingResets ? (
            <div className="p-8 text-center text-slate-500 font-medium animate-pulse text-xs flex items-center justify-center"><Loader2 size={16} className="animate-spin mr-2 text-red-600" /> Scanning jurisdiction for requests...</div>
          ) : filteredResets.length === 0 ? (
            <div className="p-8 text-center text-slate-500 font-medium text-xs">No pending password reset requests in selected queue.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-xs">
                <thead className="bg-slate-900 text-blue-100 uppercase font-black text-[11px] tracking-wider border-b-2 border-blue-500">
                  <tr><th className="px-4 py-3.5 text-left">Date Requested</th><th className="px-4 py-3.5 text-left">Officer Details</th><th className="px-4 py-3.5 text-left">Station / Division</th><th className="px-4 py-3.5 text-left">Command Action</th></tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-200">
                  {filteredResets.map((req) => {
                    const isCrossRegion = !['SUPER_ADMIN', 'ASSISTANT_SUPER_ADMIN'].includes(currentUser?.role) && currentUser?.region !== req.region;
                    return (
                      <tr key={req.id} className="hover:bg-red-50/50">
                        <td className="px-4 py-2.5 whitespace-nowrap font-bold text-slate-500 text-[10px]">{stripHtmlTags(req.request_date)}</td>
                        <td className="px-4 py-2.5 whitespace-nowrap"><div className="font-extrabold text-blue-700">{formatOfficerHeader({ fnum: req.fnum, rank: req.rank, name: req.name })}</div></td>
                        <td className="px-4 py-2.5 whitespace-nowrap text-slate-700"><div className="font-bold">{stripHtmlTags(req.station)}</div><div className="text-[10px] text-slate-500">{stripHtmlTags(req.region)}</div></td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <div className="flex space-x-2">
                            <button disabled={isCrossRegion} onClick={() => handleResetAction(req.id, "APPROVE")} className={`font-bold py-1 px-2.5 rounded text-[11px] transition flex items-center shadow-xs ${isCrossRegion ? 'bg-slate-200 text-slate-400 cursor-not-allowed opacity-50' : 'bg-red-600 hover:bg-red-700 text-white cursor-pointer'}`}><Unlock size={13} className="mr-1" /> Authorize Reset</button>
                            <button disabled={isCrossRegion} onClick={() => handleResetAction(req.id, "REJECT")} className={`font-bold py-1 px-2.5 rounded text-[11px] transition flex items-center shadow-xs ${isCrossRegion ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed opacity-50' : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 cursor-pointer'}`}><X size={13} className="mr-1" /> Reject</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* MODALS EXTERNALLY LOADED */}
      <SignupDossierModal 
        user={selectedPendingUser} 
        onClose={() => setSelectedPendingUser(null)} 
        setViewingPhotoModal={setViewingPhotoModal} 
        currentUser={currentUser} 
        isProcessingAction={isProcessingAction} 
        handleRejectUser={handleRejectUser} 
        handleApproveUser={handleApproveUser} 
        canModifyUser={canModifyUser} 
      />

      <HRModificationModal 
        req={selectedModRequest} 
        onClose={() => setSelectedModRequest(null)} 
        currentUser={currentUser} 
        isProcessingAction={isProcessingAction} 
        handleReviewRequest={handleReviewRequest} 
      />

      <LockdownMatrixModal 
        isOpen={showLockdownModal} 
        onClose={() => setShowLockdownModal(false)} 
        activeLockdownSummary={activeLockdownSummary} 
        lockdownData={lockdownData} 
        handleToggleLockdown={handleToggleLockdown} 
        lockdownRegionFilter={lockdownRegionFilter} 
        setLockdownRegionFilter={setLockdownRegionFilter} 
      />

      <RevocationModal 
        prompt={revokePrompt} 
        setPrompt={setRevokePrompt} 
        executeRoleChange={executeRoleChange} 
        executePermissionChange={executePermissionChange} 
      />

      {viewingPhotoModal && (
        <div className="fixed inset-0 bg-black/90 z-[400] flex justify-center items-center p-4 animate-in fade-in" onClick={() => setViewingPhotoModal(null)}>
          <button className="absolute top-6 right-6 text-white hover:text-red-500 transition-colors bg-white/10 p-2 rounded-full shadow-lg cursor-pointer"><X size={24}/></button>
          <img src={viewingPhotoModal} alt="Enlarged Profile" className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl border-2 border-slate-700" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>  
  );
};

export default AdminApprovals;