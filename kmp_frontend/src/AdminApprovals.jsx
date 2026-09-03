import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Shield, CheckCircle, AlertTriangle, X, Lock, Unlock, 
  Users, RefreshCw, KeyRound, UserCheck, FileText, Globe, CheckSquare, Square, Loader2, ShieldAlert,
  Eye, XCircle, UserPlus, Camera
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
  { key: 'acc_tripartite', label: 'Tripartite', color: 'indigo', bg: 'bg-indigo-50/50' },
  { key: 'acc_ledgers', label: 'Reports & Ledgers', color: 'emerald', bg: 'bg-emerald-50/50' },
  { key: 'acc_consolidated', label: 'Consolidated', color: 'emerald', bg: 'bg-emerald-50/50' },
  { key: 'acc_analytics', label: 'Analytics & Reports', color: 'emerald', bg: 'bg-emerald-50/50' },
  { key: 'acc_approvals', label: 'Access Approvals', color: 'red', bg: 'bg-red-50/50' },
  { key: 'acc_roster', label: 'System Roster', color: 'red', bg: 'bg-red-50/50' },
  { key: 'acc_online', label: 'Active Online', color: 'red', bg: 'bg-red-50/50' },
  { key: 'export_data', label: 'Master Export', color: 'red', bg: 'bg-red-50/50' },
  { key: 'export_logs', label: 'Export Logs', color: 'red', bg: 'bg-red-50/50' },
  { key: 'acc_tripartite_download', label: 'Tripartite Download', color: 'indigo', bg: 'bg-indigo-50/50' }
];

const formatOfficerHeader = (user) => {
  const fnum = stripHtmlTags(user.fnum || user.f_num || 'NO-FNUM');
  const rank = stripHtmlTags(user.rank || 'OFFICER');
  const name = stripHtmlTags(user.name || 'UNKNOWN');
  return `${fnum} ${rank} ${name}`;
};

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

  // Modal inspection & photo states
  const [selectedPendingUser, setSelectedPendingUser] = useState(null);
  const [viewingPhotoModal, setViewingPhotoModal] = useState(null);
  const [isProcessingAction, setIsProcessingAction] = useState(false);

  // AI Kill Switch State
  const [isDbKillActive, setIsDbKillActive] = useState(false);
  const [loadingKillSwitch, setLoadingKillSwitch] = useState(false);

  const [revokePrompt, setRevokePrompt] = useState({
    isOpen: false,
    fnum: null,
    actionType: null,
    targetValue: null,
    permissionKey: null,
    reason: ''
  });

  const canViewGlobalActive = canViewGlobal || currentUser?.role === 'SUPER_ADMIN' || currentUser?.permissions?.view_global_roster === true || currentUser?.permissions?.global_observer === true;

  const userRoleClean = stripHtmlTags(currentUser?.role || '').toUpperCase();
  const userPosClean = stripHtmlTags(currentUser?.position || '').toUpperCase();
 
  const isSuperAdminOrTopCommand = (
    canViewGlobalActive ||
    userRoleClean === 'SUPER_ADMIN' ||
    userPosClean.includes('KMP COMMANDER') ||
    userPosClean.includes('DEPUTY KMP COMMANDER') ||
    userPosClean.includes('STAFF OFFICER ADMIN') ||
    userPosClean.includes('SO ADMIN')
  );

  const isExplicitHighCommand = [
    'IGP', 'DEPUTY IGP', 'DIRECTOR OPERATIONS', 'DEPUTY DIRECTOR OPERATIONS', 
    'KMP COMMANDER', 'DEPUTY KMP COMMANDER', 'KMP ADMIN'
  ].some(pos => userPosClean.includes(pos)) || userRoleClean === 'SUPER_ADMIN';

  const [filterRegion, setFilterRegion] = useState(isSuperAdminOrTopCommand ? 'ALL REGIONS' : stripHtmlTags(currentUser?.region || ''));
  const [filterStation, setFilterStation] = useState(isSuperAdminOrTopCommand ? 'ALL STATIONS' : stripHtmlTags(currentUser?.station || ''));

useEffect(() => {
    if (canViewGlobalActive || isSuperAdminOrTopCommand) {
      setFilterRegion('ALL REGIONS');
      setFilterStation('ALL STATIONS');
    }
  }, [canViewGlobalActive, isSuperAdminOrTopCommand]);

  const handleSystemMaintenanceToggle = async () => {
  // 1. Prompt for lockdown scope
  const scopeChoice = window.prompt(
    "Select Lockdown Scope:\n1 - Force-Wide System\n2 - Specific Region\n3 - Specific Station\n4 - Specific Module/Page\n\nEnter number (1-4):",
    "1"
  );
  if (!scopeChoice) return;

  let lockdownType = "SYSTEM";
  let targetName = "GLOBAL";
  let reason = "";

  if (scopeChoice === "1") {
    lockdownType = "SYSTEM";
    targetName = "GLOBAL";
  } else if (scopeChoice === "2") {
    lockdownType = "REGION";
    targetName = window.prompt("Enter exact Region Name (e.g. KMP NORTH):", "KMP NORTH")?.trim().toUpperCase();
    if (!targetName) return;
  } else if (scopeChoice === "3") {
    lockdownType = "STATION";
    targetName = window.prompt("Enter exact Station Name (e.g. KAWEMPE):", "KAWEMPE")?.trim().toUpperCase();
    if (!targetName) return;
  } else if (scopeChoice === "4") {
    lockdownType = "MODULE";
    targetName = window.prompt("Enter module key (e.g. acc_crime, ai_console):", "acc_crime")?.trim().toLowerCase();
    if (!targetName) return;
  } else {
    return alert("Invalid selection.");
  }

  const rawReason = window.prompt(`State operational reason for locking down [${lockdownType}: ${targetName}]:`);
  if (rawReason === null) return;
  reason = stripHtmlTags(rawReason || "Command Maintenance");

  try {
    const res = await authFetch('/api/v1/admin/toggle-maintenance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lockdown_type: lockdownType,
        target_name: targetName,
        reason: reason
      })
    });

    if (res.ok) {
      const data = await res.json();
      alert(`✅ Lockdown Executed Successfully:\n${data.message || 'Restrictions updated.'}`);
    } else {
      const err = await res.json().catch(() => ({}));
      alert(`❌ Failed to apply lockdown: ${err.detail || 'Server error'}`);
    }
  } catch (err) {
    alert("❌ Error communicating with the command server.");
  }
};

  // 🟢 AI Kill Switch Handler
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

  // 🟢 DATA FETCHERS
  const fetchPendingUsers = useCallback(async () => {
    if (!hasValidSession()) return;
    setLoadingPending(true);
    try {
      const res = await authFetch("/api/v1/admin/pending-users");
      if (res && res.ok) {
        const data = await res.json();
        setRealPendingUsers(Array.isArray(data) ? data : []);
      }
    } catch (err) { 
      console.error("Failed to sync pending users:", err); 
    } finally { 
      setLoadingPending(false); 
    }
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
    } catch (err) { 
      console.error("Failed to sync password resets:", err); 
    } finally { 
      setLoadingResets(false); 
    }
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
    } catch (err) { 
      console.error("Failed to sync system user roster:", err); 
    } finally { 
      setLoadingUsers(false); 
    }
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
    } catch (err) { 
      console.error("Failed to sync requests:", err);
    } finally { 
      setLoadingRequests(false); 
    }
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
    } catch (err) { 
      console.error("Failed to sync audit logs:", err);
    } finally { 
      setLoadingLogs(false); 
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'approvals') {
      fetchPendingUsers();
    } else if (activeTab === 'matrix') {
      fetchAllSystemUsers();
    } else if (activeTab === 'requests') {
      fetchModRequests();
    } else if (activeTab === 'logs') {
      fetchAuditLogs();
      fetchAllSystemUsers();
    } else if (activeTab === 'resets') {
      fetchResets();
    }
  }, [activeTab, fetchPendingUsers, fetchAllSystemUsers, fetchModRequests, fetchAuditLogs, fetchResets]);

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

      if (canViewGlobalActive && activeReg === 'ALL REGIONS' && activeStat === 'ALL STATIONS') {
        return true;
      }
      if (activeReg && activeReg !== 'ALL REGIONS' && uReg !== activeReg) {
        return false;
      }
      if (activeStat && activeStat !== 'ALL STATIONS' && uStat !== activeStat) {
        return false;
      }
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
    if (cleanFnum === currentUser?.fnum) {
      alert("Security Restriction: You cannot bulk-modify your own clearance access.");
      return;
    }
    if (!isExplicitHighCommand) {
      alert("Security Restriction: Only High Command or Super Admins are authorized to perform bulk clearance modifications.");
      return;
    }

    const targetUser = allSystemUsers.find(u => u.fnum === cleanFnum);
    if (!targetUser) return;

    const newPermissions = { ...(targetUser.permissions || {}) };
    const colsToProcess = CLEARANCE_MATRIX_COLS.filter(col => !(col.key === 'global_observer' && currentUser?.role !== 'SUPER_ADMIN'));

    colsToProcess.forEach(col => {
      newPermissions[col.key] = setAllToTrue;
    });

    setAllSystemUsers(allSystemUsers.map(u => u.fnum === cleanFnum ? { ...u, permissions: newPermissions } : u));

    try {
      const response = await authFetch(`/api/v1/users/${encodeURIComponent(cleanFnum.trim())}/access`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: targetUser.role, permissions: newPermissions })
      });
      if (!response.ok) throw new Error("Failed to update bulk permissions.");
    } catch (err) {
      alert(`Bulk Update Failed: ${err.message}`);
      fetchAllSystemUsers();
    }
  };

  const executePermissionChange = async (fnum, permissionKey, value, reason = '') => {
    const cleanFnum = stripHtmlTags(fnum);
    if (cleanFnum === currentUser?.fnum) {
      alert("Security Restriction: You cannot modify your own access clearance.");
      return;
    }

    const targetUser = allSystemUsers.find(u => u.fnum === cleanFnum);
    if (!targetUser) return;

    let locks = targetUser.permissions?.super_admin_locks || {};

    if (value === false && isSuperAdminOrTopCommand) {
      locks[permissionKey] = true;
    } else if (value === true && isSuperAdminOrTopCommand) {
      locks[permissionKey] = false;
    }

    const updatedPermissions = {
      ...(targetUser.permissions || {}),
      [permissionKey]: value,
      super_admin_locks: locks,
      [`${permissionKey}_revoke_reason`]: stripHtmlTags(reason || targetUser.permissions?.[`${permissionKey}_revoke_reason`])
    };

    setAllSystemUsers(allSystemUsers.map(u => u.fnum === cleanFnum ? { ...u, permissions: updatedPermissions } : u));

    try {
      const response = await authFetch(`/api/v1/users/${encodeURIComponent(cleanFnum.trim())}/access`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: targetUser.role, permissions: updatedPermissions })
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(stripHtmlTags(errorData.detail) || `HTTP Error ${response.status}`);
      }
    } catch (err) {
      alert(`Permission Update Failed:\n${stripHtmlTags(err.message)}`);
      fetchAllSystemUsers();
    }
  };

  const executeRoleChange = async (fnum, newRole, reason = '') => {
    const cleanFnum = stripHtmlTags(fnum);
    if (cleanFnum === currentUser?.fnum) {
      alert("Security Restriction: You cannot modify your own access role or tier.");
      return;
    }

    const targetUser = allSystemUsers.find(u => u.fnum === cleanFnum);
    if (!targetUser) return;

    let updatedPermissions = { ...(targetUser.permissions || {}) };

    if (newRole === 'REVOKED') {
      updatedPermissions.revoke_reason = stripHtmlTags(reason);
      updatedPermissions.revoked_by = isSuperAdminOrTopCommand ? 'SUPER_ADMIN' : stripHtmlTags(currentUser?.role);
    } else if (isSuperAdminOrTopCommand) {
      delete updatedPermissions.revoked_by;
      delete updatedPermissions.revoke_reason;
    }

    setAllSystemUsers(allSystemUsers.map(u => u.fnum === cleanFnum ? { ...u, role: newRole, permissions: updatedPermissions } : u));

    try {
      const response = await authFetch(`/api/v1/users/${encodeURIComponent(cleanFnum.trim())}/access`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole, permissions: updatedPermissions })
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(stripHtmlTags(errorData.detail) || `HTTP Error ${response.status}`);
      }
    } catch (err) {
      alert(`Role Update Failed:\n${stripHtmlTags(err.message)}`);
      fetchAllSystemUsers();
    }
  };

  const handleGranularPermissionChange = async (fnum, permissionKey, value) => {
    const cleanFnum = stripHtmlTags(fnum);
    if (cleanFnum === currentUser?.fnum) {
      alert("Security Restriction: You cannot modify your own access clearance.");
      return;
    }
    if (currentUser?.role === 'SYSTEM_ADMIN') {
      alert("Security Restriction: SYSTEM ADMIN has viewing access only and cannot modify permissions.");
      return;
    }

    const targetUser = allSystemUsers.find(u => u.fnum === cleanFnum);
    if (!targetUser) return;

    if (value === true && !isSuperAdminOrTopCommand && targetUser.permissions?.super_admin_locks?.[permissionKey]) {
      alert("SECURITY OVERRIDE DENIED: This clearance was locked by High Command.");
      return;
    }

    if (value === false && !isSuperAdminOrTopCommand) {
      setRevokePrompt({
        isOpen: true,
        fnum: cleanFnum,
        actionType: 'PERMISSION',
        targetValue: value,
        permissionKey,
        reason: ''
      });
      return;
    }

    let locks = { ...(targetUser.permissions?.super_admin_locks || {}) };
    if (isSuperAdminOrTopCommand) {
      locks[permissionKey] = !value;
    }

    const updatedPermissions = {
      ...(targetUser.permissions || {}),
      [permissionKey]: value,
      super_admin_locks: locks
    };

    setAllSystemUsers(allSystemUsers.map(u => u.fnum === cleanFnum ? { ...u, permissions: updatedPermissions } : u));

    try {
      const response = await authFetch(`/api/v1/users/${encodeURIComponent(cleanFnum.trim())}/access`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: targetUser.role, permissions: updatedPermissions })
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(stripHtmlTags(errorData.detail) || `HTTP Error ${response.status}`);
      }
    } catch (err) {
      alert(`Permission Update Failed:\n${stripHtmlTags(err.message)}`);
      fetchAllSystemUsers();
    }
  };

  const handleRoleTierChange = async (fnum, newRole) => {
    const cleanFnum = stripHtmlTags(fnum);
    if (cleanFnum === currentUser?.fnum) {
      alert("Security Restriction: You cannot modify your own access role.");
      return;
    }
    if (currentUser?.role === 'SYSTEM_ADMIN') {
      alert("Security Restriction: SYSTEM ADMIN cannot manage access clearance tiers.");
      return;
    }

    const targetUser = allSystemUsers.find(u => u.fnum === cleanFnum);
    if (!targetUser) return;

    if (newRole !== 'REVOKED' && targetUser.role === 'REVOKED' && !isSuperAdminOrTopCommand && targetUser.permissions?.revoked_by === 'SUPER_ADMIN') {
      alert("SECURITY OVERRIDE DENIED: This access was revoked by a Super Admin.");
      return;
    }

    if (newRole === 'REVOKED' && !isSuperAdminOrTopCommand) {
      setRevokePrompt({
        isOpen: true,
        fnum: cleanFnum,
        actionType: 'ROLE',
        targetValue: newRole,
        permissionKey: null,
        reason: ''
      });
      return;
    }

    let updatedPermissions = { ...(targetUser.permissions || {}) };
    if (newRole !== 'REVOKED' && isSuperAdminOrTopCommand) {
      delete updatedPermissions.revoked_by;
      delete updatedPermissions.revoke_reason;
    }

    setAllSystemUsers(allSystemUsers.map(u => u.fnum === cleanFnum ? { ...u, role: newRole, permissions: updatedPermissions } : u));

    try {
      const response = await authFetch(`/api/v1/users/${encodeURIComponent(cleanFnum.trim())}/access`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole, permissions: updatedPermissions })
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(stripHtmlTags(errorData.detail) || `HTTP Error ${response.status}`);
      }
    } catch (err) {
      alert(`Role Update Failed:\n${stripHtmlTags(err.message)}`);
      fetchAllSystemUsers();
    }
  };

  // 🟢 APPROVE ACCESS HANDLER
  const handleApproveUser = async (userToApprove) => {
    const fnum = typeof userToApprove === 'object' ? userToApprove.fnum : userToApprove;
    setIsProcessingAction(true);
    try {
      const cleanFnum = stripHtmlTags(fnum);
      const safeFnum = encodeURIComponent(cleanFnum.trim());

      const response = await authFetch(`/api/v1/users/${safeFnum}/access`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          role: typeof userToApprove === 'object' ? userToApprove.role || 'USER' : 'USER',
          is_approved: true 
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(stripHtmlTags(data.detail) || "Failed to approve user.");

      alert(`✅ Success: ${cleanFnum} access has been approved.`);
      setSelectedPendingUser(null);
      fetchPendingUsers();
      fetchAllSystemUsers();
    } catch (err) {
      alert(`Approval Error: ${stripHtmlTags(err.message)}`);
    } finally {
      setIsProcessingAction(false);
    }
  };

  // 🔴 REJECT REQUEST HANDLER
  const handleRejectUser = async (userToReject) => {
    const fnum = typeof userToReject === 'object' ? userToReject.fnum : userToReject;
    const name = typeof userToReject === 'object' ? userToReject.name : fnum;
    const rawReason = window.prompt(`Enter official reason for REJECTING ${name} (${fnum}):`);
    if (rawReason === null) return;
    if (!rawReason.trim()) return alert("Rejection justification is required.");

    setIsProcessingAction(true);
    try {
      const cleanFnum = stripHtmlTags(fnum);
      const safeFnum = encodeURIComponent(cleanFnum.trim());
      const safeReason = encodeURIComponent(stripHtmlTags(rawReason));

      const response = await authFetch(`/api/v1/users/${safeFnum}/revoke?reason=${safeReason}`, {
        method: "DELETE"
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(stripHtmlTags(errData.detail) || "Failed to reject registration request.");
      }

      alert(`⛔ Request Rejected: ${cleanFnum} has been removed from the queue.`);
      setSelectedPendingUser(null);
      fetchPendingUsers();
    } catch (err) {
      alert(`Rejection Error: ${stripHtmlTags(err.message)}`);
    } finally {
      setIsProcessingAction(false);
    }
  };

  const handleReviewRequest = async (reqId, actionStatus) => {
    if (!reqId) return alert("Error: Request ID is undefined.");

    let payload = { status: actionStatus };
    if (actionStatus === "REJECTED") {
      const rawReason = window.prompt("State the reason for rejecting this HR request:");
      if (rawReason === null) return; 
      payload.reason = stripHtmlTags(rawReason);
    }

    try {
      const response = await authFetch(`/api/v1/requests/${reqId}`, {
        method: "PATCH", 
        headers: { "Content-Type": "application/json" }, 
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(stripHtmlTags(errData.detail) || `Server Error: ${response.status}`);
      }
      
      setModRequests(modRequests.filter(r => r.id !== reqId && r.sn !== reqId));
      alert(`Request ${actionStatus.toLowerCase()} successfully!`);
    } catch (err) {
      alert(`Error processing request: ${stripHtmlTags(err.message)}`);
    }
  };

  const handleResetAction = async (reqId, actionStr) => {
    try {
      const formData = new URLSearchParams();
      formData.append('action', actionStr);
      
      const response = await authFetch(`/api/v1/admin/execute-reset/${reqId}`, {
        method: "POST", 
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, 
        body: formData
      });
      
      const data = await response.json();
      if (!response.ok) throw new Error(stripHtmlTags(data.detail));
      
      setResetRequests(resetRequests.filter(r => r.id !== reqId));
      
      if (actionStr === "APPROVE") {
        alert(`Password successfully reset! Temporary key: ${stripHtmlTags(data.new_password)}`);
      } else {
        alert("Request rejected.");
      }
    } catch (err) { 
      alert(`Error: ${stripHtmlTags(err.message)}`); 
    }
  };

  return (
    <div className="p-4 max-w-[1800px] mx-auto space-y-4 relative z-10 animate-in fade-in duration-300">
      <div className="text-center mb-4 flex flex-col items-center">
        <img src="/upf_badge.png" alt="UPF Logo" className="w-14 h-14 mb-2 object-contain contrast-200 brightness-75 drop-shadow-xs" onError={(e) => e.target.style.display = 'none'} />
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">Access & Command Approvals</h1>
        <h3 className="text-[11px] text-slate-500 mt-0.5 font-medium">Review pending officer signups, granular clearance tiers, HR transfers, and Audit Logs.</h3>
      </div>

      {/* Global Filters & Control Ribbon */}
      <div className="flex flex-col sm:flex-row justify-center gap-2 mb-3">
        <select 
          value={filterRegion} 
          onChange={(e) => { setFilterRegion(stripHtmlTags(e.target.value)); setFilterStation('ALL STATIONS'); }} 
          disabled={!canViewGlobalActive} 
          className="border border-slate-300 rounded-lg px-3 py-1.5 text-xs shadow-xs bg-white disabled:bg-slate-100 font-bold text-blue-800 outline-none focus:border-blue-500 cursor-pointer"
        >
          {canViewGlobalActive ? (
            <><option value="ALL REGIONS">ALL REGIONS (GLOBAL)</option>{Object.keys(REGIONAL_HIERARCHY || {}).map(reg => <option key={reg} value={reg}>{reg}</option>)}</>
          ) : <option value={currentUser?.region}>{stripHtmlTags(currentUser?.region)}</option>}
        </select>

        <select 
          value={filterStation} 
          onChange={(e) => setFilterStation(stripHtmlTags(e.target.value))} 
          disabled={!canViewGlobalActive && !['RPC', 'Deputy Commander'].includes(currentUser?.role)} 
          className="border border-slate-300 rounded-lg px-3 py-1.5 text-xs shadow-xs bg-white disabled:bg-slate-100 font-bold text-blue-800 outline-none focus:border-blue-500 cursor-pointer"
        >
          {canViewGlobalActive || ['RPC', 'Deputy Commander'].includes(currentUser?.role) ? (
            <><option value="ALL STATIONS">ALL STATIONS / DIVISIONS</option>{filterRegion !== 'ALL REGIONS' && REGIONAL_HIERARCHY?.[filterRegion] ? REGIONAL_HIERARCHY[filterRegion].map(stat => <option key={stat} value={stat}>{stat}</option>) : null}</>
          ) : <option value={currentUser?.station}>{stripHtmlTags(currentUser?.station)}</option>}
        </select>

        <button
          onClick={() => {
            if (activeTab === 'approvals') fetchPendingUsers();
            else if (activeTab === 'matrix') fetchAllSystemUsers();
            else if (activeTab === 'requests') fetchModRequests();
            else if (activeTab === 'logs') fetchAuditLogs();
            else if (activeTab === 'resets') fetchResets();
          }}
          className="bg-slate-900 hover:bg-slate-800 text-white font-bold px-3 py-1.5 rounded-lg text-xs flex items-center justify-center transition cursor-pointer shadow-xs"
          title="Refresh Current Queue"
        >
          <RefreshCw size={13} className="mr-1.5" /> Refresh Queue
        </button>

        {currentUser?.role === 'SUPER_ADMIN' && (
          <button
            onClick={handleKillSwitchToggle}
            disabled={loadingKillSwitch}
            className={`font-bold px-3 py-1.5 rounded-lg text-xs flex items-center justify-center transition cursor-pointer shadow-xs border ${
              isDbKillActive 
                ? 'bg-emerald-950 border-emerald-600 text-emerald-200 hover:bg-emerald-900' 
                : 'bg-red-950 border-red-600 text-red-200 hover:bg-red-900'
            }`}
            title="Toggle AI Direct Database Querying Access"
          >
            {loadingKillSwitch ? (
              <Loader2 size={13} className="mr-1.5 animate-spin" />
            ) : (
              <ShieldAlert size={13} className="mr-1.5" />
            )}
            {isDbKillActive ? 'Enable AI DB Query' : 'Kill AI DB Query'}
          </button>
        )}
      </div>

      {/* Navigation Tabs */}
      <div className="flex space-x-1 border-b border-slate-200 mb-4 bg-white/50 backdrop-blur rounded-t-xl px-3 pt-3 overflow-x-auto custom-scrollbar">
        <button onClick={() => setActiveTab('approvals')} className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition-colors whitespace-nowrap cursor-pointer ${activeTab === 'approvals' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>New Account Authorizations ({loadingPending ? '...' : filteredPending.length})</button>
        <button onClick={() => setActiveTab('matrix')} className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition-colors whitespace-nowrap cursor-pointer ${activeTab === 'matrix' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>Active Roster & Clearance Matrix ({filteredSystemUsers.length})</button>
        <button onClick={() => setActiveTab('requests')} className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition-colors whitespace-nowrap cursor-pointer ${activeTab === 'requests' ? 'border-amber-500 text-amber-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>HR Modification Requests ({filteredRequests.length})</button>
        <button onClick={() => setActiveTab('logs')} className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition-colors whitespace-nowrap cursor-pointer ${activeTab === 'logs' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>Audit Logs ({filteredLogs.length})</button>
        <button onClick={() => setActiveTab('resets')} className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition-colors whitespace-nowrap cursor-pointer ${activeTab === 'resets' ? 'border-red-600 text-red-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>Password Resets ({filteredResets.length})</button>
      </div>

      {/* TAB 1: NEW ACCOUNT AUTHORIZATIONS (INTERACTIVE INSPECTION & ACTIONS) */}
      {activeTab === 'approvals' && (
        <div className="bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden max-w-6xl mx-auto">
          {loadingPending ? (
            <div className="p-8 text-center text-slate-500 font-medium animate-pulse text-xs flex items-center justify-center">
              <Loader2 size={16} className="animate-spin mr-2 text-blue-600" /> Syncing with Command Database...
            </div>
          ) : filteredPending.length === 0 ? (
            <div className="p-8 text-center text-slate-500 font-medium text-xs">No active unapproved access requests pending in selected queue.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-xs">
                <thead className="bg-slate-50 text-slate-600 uppercase font-extrabold text-[10px]">
                  <tr>
                    <th className="px-4 py-2.5 text-left">Officer Details</th>
                    <th className="px-4 py-2.5 text-left">Command Post</th>
                    <th className="px-4 py-2.5 text-left">Derived Role Tier</th>
                    <th className="px-4 py-2.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-200">
                  {filteredPending.map((user) => (
                    <tr 
                      key={user.fnum} 
                      onClick={() => setSelectedPendingUser(user)}
                      className="hover:bg-blue-50/50 cursor-pointer transition-colors group"
                    >
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center space-x-3">
                          <div 
                            onClick={(e) => {
                              if (user.profile_photo_path) {
                                e.stopPropagation();
                                setViewingPhotoModal(user.profile_photo_path);
                              }
                            }}
                            className="w-9 h-9 rounded-full bg-slate-100 border border-slate-300 flex items-center justify-center font-bold text-xs text-slate-600 shrink-0 overflow-hidden shadow-xs group-hover:border-blue-400"
                          >
                            {user.profile_photo_path ? (
                              <img src={user.profile_photo_path} alt="" className="w-full h-full object-cover" />
                            ) : (
                              user.name?.charAt(0) || 'U'
                            )}
                          </div>
                          <div>
                            <div className="font-extrabold text-slate-900 group-hover:text-blue-700 transition-colors">
                              {formatOfficerHeader(user)}
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono">
                              NIN: {stripHtmlTags(user.nin || 'N/A')} • Tel: {stripHtmlTags(user.phone || 'N/A')}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="font-bold text-blue-700 uppercase">{stripHtmlTags(user.station)}</div>
                        <div className="text-[10px] text-slate-500 uppercase">{stripHtmlTags(user.region)}</div>
                        <div className="text-[9px] bg-slate-100 px-1.5 py-0.5 rounded mt-0.5 inline-block border font-bold text-slate-600">{stripHtmlTags(user.position)}</div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`px-2 py-0.5 inline-flex text-[10px] font-bold rounded-full border ${
                          user.role === 'SUPER_ADMIN' ? 'bg-purple-100 text-purple-800 border-purple-200' :
                          user.role === 'ADMIN' ? 'bg-blue-100 text-blue-800 border-blue-200' :
                          user.role === 'RPC' ? 'bg-amber-100 text-amber-800 border-amber-200' :
                          'bg-slate-100 text-slate-800 border-slate-200'
                        }`}>
                          {stripHtmlTags(user.role || 'USER')}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right space-x-2" onClick={(e) => e.stopPropagation()}>
                        <button 
                          type="button"
                          onClick={() => setSelectedPendingUser(user)}
                          className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-1.5 px-3 rounded-md text-[11px] transition inline-flex items-center cursor-pointer border border-slate-300"
                        >
                          <Eye size={13} className="mr-1" /> Review
                        </button>
                        <button 
                          type="button"
                          disabled={isProcessingAction}
                          onClick={() => handleRejectUser(user)}
                          className="bg-red-50 hover:bg-red-600 hover:text-white text-red-600 border border-red-200 font-bold py-1.5 px-3 rounded-md text-[11px] transition inline-flex items-center cursor-pointer disabled:opacity-50"
                        >
                          <XCircle size={13} className="mr-1" /> Reject
                        </button>
                        <button 
                          type="button"
                          disabled={isProcessingAction}
                          onClick={() => handleApproveUser(user)}
                          className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-1.5 px-3 rounded-md shadow-xs text-[11px] transition inline-flex items-center cursor-pointer disabled:opacity-50"
                        >
                          <CheckCircle size={13} className="mr-1" /> Approve Access
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 🟢 OFFICER SIGNUP INSPECTION DOSSIER MODAL */}
      {selectedPendingUser && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[300] flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-300 flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-150">
            
            <div className="bg-slate-900 text-white p-4 px-6 flex justify-between items-center shrink-0">
              <h3 className="font-extrabold text-xs uppercase tracking-wider flex items-center">
                <Shield size={16} className="text-blue-400 mr-2"/> Signup Verification Dossier
              </h3>
              <button onClick={() => setSelectedPendingUser(null)} className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white cursor-pointer"><X size={18}/></button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 custom-scrollbar flex-1 bg-slate-50">
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center space-x-4">
                <div 
                  onClick={() => selectedPendingUser.profile_photo_path && setViewingPhotoModal(selectedPendingUser.profile_photo_path)}
                  className="w-16 h-16 rounded-full bg-slate-100 border-2 border-blue-500 overflow-hidden shrink-0 flex items-center justify-center cursor-pointer shadow-sm"
                >
                  {selectedPendingUser.profile_photo_path ? (
                    <img src={selectedPendingUser.profile_photo_path} alt="Officer" className="w-full h-full object-cover" />
                  ) : (
                    <span className="font-black text-xl text-slate-600">{selectedPendingUser.name?.charAt(0) || 'U'}</span>
                  )}
                </div>
                <div>
                  <h4 className="text-sm font-black text-slate-900">{selectedPendingUser.rank} {selectedPendingUser.name}</h4>
                  <p className="text-xs font-mono font-bold text-blue-700">{selectedPendingUser.fnum}</p>
                  <p className="text-[11px] text-slate-500 uppercase font-semibold">{selectedPendingUser.position || 'General Duties'}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-2xs text-xs">
                <div>
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">IPPS Number</span>
                  <span className="font-extrabold text-slate-800">{selectedPendingUser.ipps || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">National ID (NIN)</span>
                  <span className="font-extrabold text-slate-800 font-mono">{selectedPendingUser.nin || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Gender / Sex</span>
                  <span className="font-extrabold text-slate-800">{selectedPendingUser.sex || 'MALE'}</span>
                </div>
                <div>
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Role Requested</span>
                  <span className="font-extrabold text-blue-700 uppercase">{selectedPendingUser.role || 'USER'}</span>
                </div>
                <div>
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Command Region</span>
                  <span className="font-extrabold text-slate-800">{selectedPendingUser.region}</span>
                </div>
                <div>
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Assigned Station</span>
                  <span className="font-extrabold text-slate-800">{selectedPendingUser.station}</span>
                </div>
                <div className="col-span-2 border-t border-slate-100 pt-2">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Official Email</span>
                  <span className="font-bold text-slate-800 break-all">{selectedPendingUser.email || 'N/A'}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Phone Number</span>
                  <span className="font-bold text-slate-800">{selectedPendingUser.phone || 'N/A'}</span>
                </div>
              </div>
            </div>

            <div className="bg-white p-4 border-t border-slate-200 flex justify-between items-center shrink-0">
              <button 
                type="button"
                onClick={() => setSelectedPendingUser(null)} 
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                Close
              </button>
              <div className="space-x-2">
                <button
                  type="button"
                  disabled={isProcessingAction}
                  onClick={() => handleRejectUser(selectedPendingUser)}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer disabled:opacity-50"
                >
                  <XCircle size={14} className="inline mr-1"/> Reject Request
                </button>
                <button
                  type="button"
                  disabled={isProcessingAction}
                  onClick={() => handleApproveUser(selectedPendingUser)}
                  className="px-5 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-xl text-xs font-extrabold transition shadow-xs cursor-pointer disabled:opacity-50"
                >
                  <CheckCircle size={14} className="inline mr-1"/> Approve Access
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Enlarged Photo Modal */}
      {viewingPhotoModal && (
        <div className="fixed inset-0 bg-black/90 z-[400] flex justify-center items-center p-4 animate-in fade-in" onClick={() => setViewingPhotoModal(null)}>
          <button className="absolute top-6 right-6 text-white hover:text-red-500 transition-colors bg-white/10 p-2 rounded-full shadow-lg cursor-pointer"><X size={24}/></button>
          <img src={viewingPhotoModal} alt="Enlarged Profile" className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl border-2 border-slate-700" onClick={(e) => e.stopPropagation()} />
        </div>
      )}

      {/* ACTIVE ROSTER & CLEARANCE MATRIX TAB */}
      {activeTab === 'matrix' && (
        <div className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden w-full">
          <div className="bg-slate-900 text-white p-3 text-xs font-extrabold uppercase tracking-wider flex flex-col md:flex-row items-start md:items-center justify-between gap-2">
            <span className="flex items-center">
              <Shield className="w-4 h-4 mr-1.5 text-indigo-400" /> Super Control Panel - Active Roster Matrix ({stripHtmlTags(filterRegion)} {filterStation !== 'ALL STATIONS' ? `/ ${stripHtmlTags(filterStation)}` : ''})
            </span>
            <span className="text-[10px] text-slate-400 font-mono text-right">
              Tiers: USER | ADMIN_USER | STATION_ADMIN | SYSTEM_ADMIN | SUPER_ADMIN | REVOKED
            </span>
          </div>
            
          {loadingUsers ? (
            <div className="p-8 text-center text-slate-400 font-medium animate-pulse text-xs flex items-center justify-center">
              <Loader2 size={16} className="animate-spin mr-2 text-indigo-600" /> Syncing user database roster...
            </div>
          ) : filteredSystemUsers.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs font-medium">No registered system users found for this regional filter.</div>
          ) : (
            <div className="overflow-x-auto w-full custom-scrollbar">
              <table className="min-w-max divide-y divide-slate-200 text-xs">
                <thead className="bg-slate-50 text-slate-700 uppercase font-extrabold text-[10px]">
                  <tr>
                    <th className="p-2.5 text-left sticky left-0 z-10 bg-slate-50 shadow-[1px_0_0_#e2e8f0]">Officer Details</th>
                    <th className="p-2.5 text-center sticky left-[240px] z-10 bg-slate-50 shadow-[1px_0_0_#e2e8f0]">Administrative Tier</th>
                    <th className="p-2.5 text-center sticky left-[360px] z-10 bg-slate-50 shadow-[1px_0_0_#e2e8f0]">Quick Actions</th>

                    {CLEARANCE_MATRIX_COLS.map((col, idx) => {
                      if (col.key === 'global_observer' && currentUser?.role !== 'SUPER_ADMIN') return null;

                      return (
                        <th key={idx} className={`p-2 text-center border-l border-white/50 ${col.bg || ''}`}>
                          <div className="w-16 mx-auto whitespace-normal break-words leading-tight">
                            {col.key === 'global_observer' && <Globe className="w-3 h-3 mx-auto text-fuchsia-600 mb-1" />}
                            {stripHtmlTags(col.label)}
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {filteredSystemUsers.map(u => {
                    const p = u.permissions || {};
                    const isSuperAdmin = u.role === 'SUPER_ADMIN';
                    const isRevoked = u.role === 'REVOKED';
                    const isSelf = u.fnum === currentUser?.fnum;
                    const isRoleSelectDisabled = isSelf || (isSuperAdmin && currentUser?.role !== 'SUPER_ADMIN');
                    const isBulkActionDisabled = isSelf || !isExplicitHighCommand;

                    return (
                      <tr key={u.fnum} className={`transition-colors ${isRevoked ? 'bg-red-50/40' : 'hover:bg-slate-50'} ${isSelf ? 'bg-blue-50/30 ring-1 ring-inset ring-blue-100' : ''}`}>
                        <td className="p-2.5 sticky left-0 z-10 bg-white shadow-[1px_0_0_#e2e8f0] min-w-[240px]">
                          <div className={`font-extrabold text-[11px] flex items-center ${isRevoked ? 'text-red-900' : 'text-slate-900'}`}>
                            {formatOfficerHeader(u)}
                            {isSelf && (
                              <span className="ml-2 px-1.5 py-0.5 text-[8px] bg-blue-100 text-blue-700 font-bold rounded-full border border-blue-200" title="You cannot modify your own row.">
                                YOU
                              </span>
                            )}
                            {isSuperAdmin && !isSelf && (
                              <span className="ml-2 px-1.5 py-0.5 text-[8px] bg-red-100 text-red-700 font-bold rounded-full border border-red-200">
                                GOD-MODE
                              </span>
                            )}
                            {p.global_observer && !isSuperAdmin && (
                              <span className="ml-2 px-1.5 py-0.5 text-[8px] bg-fuchsia-100 text-fuchsia-700 font-bold rounded-full border border-fuchsia-200">
                                OBSERVER
                              </span>
                            )}
                            {p.revoked_by === 'SUPER_ADMIN' && <Lock size={12} className="ml-2 text-red-600" title="Revoked by Super Admin" />}
                          </div>
                          <div className={`text-[10px] font-mono mt-0.5 ${isRevoked ? 'text-red-500' : 'text-slate-500'}`}>
                            Station: <strong className={isRevoked ? 'text-red-700' : 'text-slate-700'}>{stripHtmlTags(u.station)}</strong> ({stripHtmlTags(u.region)})
                          </div>
                        </td>

                        <td className="p-2.5 text-center sticky left-[240px] z-10 bg-white shadow-[1px_0_0_#e2e8f0] min-w-[120px]">
                          <select 
                            value={u.role || 'USER'}
                            onChange={(e) => handleRoleTierChange(u.fnum, stripHtmlTags(e.target.value))}
                            disabled={isRoleSelectDisabled}
                            className={`border rounded-md px-2 py-1 font-bold outline-none uppercase w-full text-[10px] ${isRoleSelectDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${
                              u.role === 'SUPER_ADMIN' ? 'bg-red-50 text-red-700 border-red-300' :
                              u.role === 'ASSISTANT_SUPER_ADMIN' ? 'bg-rose-50 text-rose-700 border-rose-300' :
                              u.role === 'SYSTEM_ADMIN' ? 'bg-purple-50 text-purple-700 border-purple-300' :
                              u.role === 'ADMIN_USER' ? 'bg-indigo-50 text-indigo-700 border-indigo-300' :
                              u.role === 'STATION_ADMIN' ? 'bg-blue-50 text-blue-700 border-blue-300' :
                              u.role === 'REVOKED' ? 'bg-red-100 text-red-800 border-red-400 shadow-inner' :
                              'bg-slate-100 text-slate-700 border-slate-300'
                            }`}
                          >
                            <option value="USER">USER</option>
                            <option value="ADMIN_USER">ADMIN-USER</option>
                            <option value="STATION_ADMIN">STN ADMIN</option>
                            <option value="SYSTEM_ADMIN">SYS ADMIN</option>
                            <option value="ASSISTANT_SUPER_ADMIN">ASST SUPER</option>
                            <option value="SUPER_ADMIN">SUPER ADMIN</option>
                            <option value="REVOKED" className="text-red-600 font-extrabold bg-red-50">REVOKED</option>
                          </select>
                        </td>

                        <td className="p-2.5 text-center sticky left-[360px] z-10 bg-white shadow-[1px_0_0_#e2e8f0] min-w-[90px]">
                          <div className="flex items-center justify-center space-x-1.5">
                            <button 
                              onClick={() => handleBulkMatrixAction(u.fnum, true)}
                              disabled={isBulkActionDisabled}
                              title={isSelf ? "You cannot self-modify" : !isExplicitHighCommand ? "Only High Command can Bulk Update" : "Check All Modules"}
                              className={`p-1 rounded border transition shadow-xs ${
                                isBulkActionDisabled ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed opacity-50' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-300 cursor-pointer'
                              }`}
                            >
                              <CheckSquare size={13} />
                            </button>
                            <button 
                              onClick={() => handleBulkMatrixAction(u.fnum, false)}
                              disabled={isBulkActionDisabled}
                              title={isSelf ? "You cannot self-modify" : !isExplicitHighCommand ? "Only High Command can Bulk Update" : "Uncheck All Modules (Deny Access)"}
                              className={`p-1 rounded border transition shadow-xs ${
                                isBulkActionDisabled ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed opacity-50' : 'bg-red-50 text-red-700 hover:bg-red-100 border-red-300 cursor-pointer'
                              }`}
                            >
                              <Square size={13} />
                            </button>
                          </div>
                        </td>

                        {CLEARANCE_MATRIX_COLS.map((col, idx) => {
                          if (col.key === 'global_observer' && currentUser?.role !== 'SUPER_ADMIN') return null;

                          const hasSuperAdminLock = Boolean(p.super_admin_locks?.[col.key]);
                          const isLockedVisually = hasSuperAdminLock && !isSuperAdminOrTopCommand;
                          const isStrictSuperAdminOnly = col.key === 'global_observer';

                          const isDisabled = 
                            isSelf ||
                            isSuperAdmin || 
                            isRevoked || 
                            currentUser?.role === 'SYSTEM_ADMIN' || 
                            (!isSuperAdminOrTopCommand && hasSuperAdminLock) ||
                            (isStrictSuperAdminOnly && currentUser?.role !== 'SUPER_ADMIN');

                          return (
                            <td key={idx} className={`p-2 text-center border-l border-white/50 ${col.bg || ''}`}>
                              <div className="relative inline-flex items-center justify-center">
                                <input 
                                  type="checkbox" 
                                  checked={isSuperAdmin || Boolean(p[col.key])} 
                                  disabled={isDisabled}
                                  onChange={e => handleGranularPermissionChange(u.fnum, col.key, e.target.checked)} 
                                  className={`w-3.5 h-3.5 rounded accent-${col.color}-600 ${isDisabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`} 
                                />
                                {(isLockedVisually || isSuperAdmin) && !isSelf && <Lock size={9} className="absolute -top-1.5 -right-2 text-red-600 drop-shadow-xs" title={isSuperAdmin ? "Super Admin Access Locked" : "Locked by High Command"} />}
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

      {/* HR MODIFICATION REQUESTS TAB */}
      {activeTab === 'requests' && (
        <div className="bg-white rounded-xl shadow-xs border border-amber-200 overflow-hidden max-w-6xl mx-auto">
          <div className="bg-slate-900 px-4 py-2.5 border-b border-slate-800 flex items-center text-white font-semibold text-xs uppercase tracking-wider">
            <Shield className="w-4 h-4 mr-2 text-amber-400" /> HR Modification Requests
          </div>
          {loadingRequests ? (
            <div className="p-8 text-center text-slate-500 font-medium animate-pulse text-xs flex items-center justify-center">
              <Loader2 size={16} className="animate-spin mr-2 text-amber-600" /> Loading pending modifications...
            </div>
          ) : filteredRequests.length === 0 ? (
            <div className="p-8 text-center text-slate-500 font-medium text-xs">No pending profile modification requests in selected queue.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-xs">
                <thead className="bg-slate-50 text-slate-600 uppercase font-extrabold text-[10px]">
                  <tr>
                    <th className="px-4 py-2.5 text-left">Officer Details</th>
                    <th className="px-4 py-2.5 text-left">Requested Changes</th>
                    <th className="px-4 py-2.5 text-left">Action</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-200">
                  {filteredRequests.map((req) => (
                    <tr key={req.id || req.sn} className="hover:bg-amber-50/50">
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <div className="font-extrabold text-blue-700">
                          {formatOfficerHeader({ fnum: req.fnum, rank: req.current_rank, name: req.current_name })}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-slate-700">
                        {req.requested_name && req.requested_name !== req.current_name && <div className="text-[11px]"><span className="font-bold text-slate-400">Name:</span> <span className="text-red-500 line-through mr-1">{stripHtmlTags(req.current_name)}</span> ➡️ <span className="text-emerald-600 font-bold">{stripHtmlTags(req.requested_name)}</span></div>}
                        {req.requested_rank && req.requested_rank !== req.current_rank && <div className="text-[11px]"><span className="font-bold text-slate-400">Rank:</span> <span className="text-red-500 line-through mr-1">{stripHtmlTags(req.current_rank)}</span> ➡️ <span className="text-emerald-600 font-bold">{stripHtmlTags(req.requested_rank)}</span></div>}
                        {req.requested_station && req.requested_station !== req.current_station && <div className="text-[11px]"><span className="font-bold text-slate-400">Station:</span> <span className="text-red-500 line-through mr-1">{stripHtmlTags(req.current_station)}</span> ➡️ <span className="text-emerald-600 font-bold">{stripHtmlTags(req.requested_station)}</span></div>}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <div className="flex space-x-2">
                          <button onClick={() => handleReviewRequest(req.id || req.sn, "APPROVED")} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-1 px-2.5 rounded text-[11px] transition flex items-center cursor-pointer shadow-xs"><CheckCircle size={13} className="mr-1" /> Approve</button>
                          <button onClick={() => handleReviewRequest(req.id || req.sn, "REJECTED")} className="bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 font-bold py-1 px-2.5 rounded text-[11px] transition flex items-center cursor-pointer shadow-xs"><X size={13} className="mr-1" /> Reject</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* AUDIT LOGS TAB */}
      {activeTab === 'logs' && (
        <div className="bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden max-w-6xl mx-auto">
          <div className="bg-slate-900 px-4 py-2.5 border-b border-slate-800 flex items-center justify-between text-white font-semibold text-xs uppercase tracking-wider">
            <span className="flex items-center">
              <Shield className="w-4 h-4 mr-2 text-blue-400" /> System Audit Logs ({stripHtmlTags(filterRegion)} {filterStation !== 'ALL STATIONS' ? `/ ${stripHtmlTags(filterStation)}` : ''})
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-xs">
              <thead className="bg-slate-50 text-slate-600 uppercase font-extrabold text-[10px]">
                <tr>
                  <th className="px-4 py-2.5 text-left">Timestamp</th>
                  <th className="px-4 py-2.5 text-left">User FNUM</th>
                  <th className="px-4 py-2.5 text-left">Event</th>
                  <th className="px-4 py-2.5 text-left">Target</th>
                  <th className="px-4 py-2.5 text-left">Details</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-200">
                {loadingLogs ? (
                  <tr><td colSpan="5" className="p-8 text-center text-slate-500 font-bold animate-pulse text-xs">Decrypting server logs...</td></tr>
                ) : filteredLogs.length === 0 ? (
                  <tr><td colSpan="5" className="p-4 text-center text-slate-500 text-xs">No audit logs found for the selected regional filter and station.</td></tr>
                ) : (
                  filteredLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2 whitespace-nowrap text-slate-500 font-mono text-[10px]">
                        {stripHtmlTags(log.created_at || 'Unknown Time')}
                      </td>
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
          <div className="bg-slate-900 px-4 py-2.5 border-b border-slate-800 flex items-center text-white font-semibold text-xs uppercase tracking-wider">
            <Lock className="w-4 h-4 mr-2 text-red-400" /> Authorized Password Recovery
          </div>
          {loadingResets ? (
            <div className="p-8 text-center text-slate-500 font-medium animate-pulse text-xs flex items-center justify-center">
              <Loader2 size={16} className="animate-spin mr-2 text-red-600" /> Scanning jurisdiction for requests...
            </div>
          ) : filteredResets.length === 0 ? (
            <div className="p-8 text-center text-slate-500 font-medium text-xs">No pending password reset requests in selected queue.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-xs">
                <thead className="bg-slate-50 text-slate-600 uppercase font-extrabold text-[10px]">
                  <tr>
                    <th className="px-4 py-2.5 text-left">Date Requested</th>
                    <th className="px-4 py-2.5 text-left">Officer Details</th>
                    <th className="px-4 py-2.5 text-left">Station / Division</th>
                    <th className="px-4 py-2.5 text-left">Command Action</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-200">
                  {filteredResets.map((req) => (
                    <tr key={req.id} className="hover:bg-red-50/50">
                      <td className="px-4 py-2.5 whitespace-nowrap font-bold text-slate-500 text-[10px]">{stripHtmlTags(req.request_date)}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <div className="font-extrabold text-blue-700">
                          {formatOfficerHeader({ fnum: req.fnum, rank: req.rank, name: req.name })}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-slate-700">
                        <div className="font-bold">{stripHtmlTags(req.station)}</div>
                        <div className="text-[10px] text-slate-500">{stripHtmlTags(req.region)}</div>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <div className="flex space-x-2">
                          <button onClick={() => handleResetAction(req.id, "APPROVE")} className="bg-red-600 hover:bg-red-700 text-white font-bold py-1 px-2.5 rounded text-[11px] transition flex items-center shadow-xs cursor-pointer"><Unlock size={13} className="mr-1" /> Authorize Reset</button>
                          <button onClick={() => handleResetAction(req.id, "REJECT")} className="bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 font-bold py-1 px-2.5 rounded text-[11px] transition flex items-center shadow-xs cursor-pointer"><X size={13} className="mr-1" /> Reject</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* MANDATORY JUSTIFICATION MODAL FOR REVOKING ACCESS */}
      {revokePrompt.isOpen && (
        <div className="fixed inset-0 z-[99999] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-slate-300 overflow-hidden flex flex-col">
            <div className="bg-red-600 px-6 py-4 flex items-center shrink-0">
              <AlertTriangle className="text-white mr-3 animate-pulse" size={22} />
              <h3 className="text-white font-extrabold text-sm uppercase tracking-wider">Mandatory Justification Required</h3>
            </div>
              
            <div className="p-6 space-y-4">
              <p className="text-sm font-bold text-slate-700 leading-relaxed">
                You are about to revoke <span className="text-red-600 bg-red-50 px-1 rounded">{revokePrompt.actionType === 'ROLE' ? 'all system access' : `the "${stripHtmlTags(revokePrompt.permissionKey)}" clearance`}</span> for this officer. By command directive, you must state an official operational reason to proceed.
              </p>
              <textarea 
                value={revokePrompt.reason}
                onChange={(e) => setRevokePrompt({...revokePrompt, reason: stripHtmlTags(e.target.value)})}
                placeholder="Type official reason for revocation here..."
                className="w-full border border-slate-300 rounded-xl p-3 text-sm font-medium outline-none focus:border-red-500 focus:ring-2 focus:ring-red-200 resize-none h-32 bg-white"
              />
            </div>
              
            <div className="bg-slate-50 px-6 py-4 flex justify-end space-x-3 border-t border-slate-200 shrink-0">
              <button 
                onClick={() => setRevokePrompt({ isOpen: false, fnum: null, actionType: null, targetValue: null, permissionKey: null, reason: '' })}
                className="px-4 py-2 font-bold text-slate-600 text-xs bg-white border border-slate-300 rounded-xl hover:bg-slate-100 transition cursor-pointer"
              >
                Cancel Action
              </button>
              {revokePrompt.reason.trim().length >= 5 && (
                <button 
                  onClick={() => {
                    if (revokePrompt.actionType === 'ROLE') {
                      executeRoleChange(revokePrompt.fnum, revokePrompt.targetValue, revokePrompt.reason);
                    } else {
                      executePermissionChange(revokePrompt.fnum, revokePrompt.permissionKey, revokePrompt.targetValue, revokePrompt.reason);
                    }
                    setRevokePrompt({ isOpen: false, fnum: null, actionType: null, targetValue: null, permissionKey: null, reason: '' });
                  }}
                  className="px-4 py-2 font-bold text-white text-xs bg-red-600 rounded-xl hover:bg-red-700 shadow-md transition flex items-center cursor-pointer animate-in fade-in slide-in-from-right-4"
                >
                  <CheckCircle size={15} className="mr-1.5" /> Confirm Revocation
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>  
  );
};

export default AdminApprovals;