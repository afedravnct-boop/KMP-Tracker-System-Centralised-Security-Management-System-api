import React, { useState, useEffect, useMemo } from 'react';
import { 
  Shield, CheckCircle, AlertTriangle, X, Lock, Unlock, 
  Users, RefreshCw, KeyRound, UserCheck, FileText, Globe, CheckSquare, Square
} from 'lucide-react';
import { stripHtmlTags } from './App';

// 🟢 REGIONAL HIERARCHY CONSTANTS
const REGIONAL_HIERARCHY = {
  "KMP NORTH": ["KAWEMPE", "KAKIRI", "KASANGATI", "MATUGGA", "NANSANA", "OLD KAMPALA", "WAKISO", "WANDEGEYA"],
  "KMP EAST": ["JINJA ROAD", "KIRA", "KIRA ROAD", "MUKONO", "NAGGALAMA", "SEETA"],
  "KMP SOUTH": ["NATEETE", "CPS KAMPALA", "PARLIAMENT", "ENTEBBE", "KABALAGALA", "KAJJANSI", "KASENYI", "KATWE", "KYENGERA", "NSANGI"],
  "KMP HEADQUARTERS": ["KMP HEADQUARTERS", "FLYING SQUAD", "CRIME INTELLIGENCE", "KMP Headquarters", "KAWEMPE", "KAKIRI", "KASANGATI", "MATUGGA", "NANSANA", "OLD KAMPALA", "WAKISO", "WANDEGEYA", "JINJA ROAD", "KIRA", "KIRA ROAD", "MUKONO", "NAGGALAMA", "SEETA", "NATEETE", "CPS KAMPALA", "PARLIAMENT", "ENTEBBE", "KABALAGALA", "KAJJANSI", "KASENYI", "KATWE", "KYENGERA", "NSANGI"],
  "POLICE HEADQUARTERS": ["NAGURU", "KMP HEADQUARTERS", "FLYING SQUAD", "CRIME INTELLIGENCE", "KMP Headquarters", "KAWEMPE", "KAKIRI", "KASANGATI", "MATUGGA", "NANSANA", "OLD KAMPALA", "WAKISO", "WANDEGEYA", "JINJA ROAD", "KIRA", "KIRA ROAD", "MUKONO", "NAGGALAMA", "SEETA", "NATEETE", "CPS KAMPALA", "PARLIAMENT", "ENTEBBE", "KABALAGALA", "KAJJANSI", "KASENYI", "KATWE", "KYENGERA", "NSANGI"]
};

// 🟢 EXPANDED SUPER CONTROL PANEL MODULES
const CLEARANCE_MATRIX_COLS = [
  { key: 'global_observer', label: 'Global Observer (Read-Only)', color: 'fuchsia', bg: 'bg-fuchsia-50/50' },
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

const autoCapitalize = (text) => {
  if (!text) return text;
  return stripHtmlTags(text).replace(/(^\s*|>|\.\s+|\n\s*)([a-z])/g, (match, separator, letter) => {
    return separator + letter.toUpperCase();
  });
};

const formatEATDateTime = (dateStr) => {
  if (!dateStr) return 'N/A';
  const cleanDateStr = stripHtmlTags(dateStr);
  const d = new Date(cleanDateStr);
  if (isNaN(d.getTime())) return cleanDateStr;

  return d.toLocaleString('en-GB', {
    timeZone: 'Africa/Nairobi', 
    hour12: false,              
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
};

const formatOfficerHeader = (user) => {
  const fnum = stripHtmlTags(user.fnum || user.f_num || 'NO-FNUM');
  const rank = stripHtmlTags(user.rank || 'OFFICER');
  const name = stripHtmlTags(user.name || 'UNKNOWN');
  return `${fnum} ${rank} ${name}`;
};

const AdminApprovals = ({ currentUser, canViewGlobal = false, authFetch: propAuthFetch }) => {
    
  const authFetch = propAuthFetch || (async (url, options = {}) => {
    const token = localStorage.getItem('kmp_authToken');
    const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
    return fetch(`${API_URL}${url}`, {
      ...options,
      headers: {
        ...options?.headers,
        'Authorization': `Bearer ${token}`
      }
    });
  });

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

  const [revokePrompt, setRevokePrompt] = useState({
    isOpen: false,
    fnum: null,
    actionType: null,
    targetValue: null,
    permissionKey: null,
    reason: ''
  });

  // 🟢 Safely resolve global view active state matching other modules
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

  const [filterRegion, setFilterRegion] = useState(isSuperAdminOrTopCommand ? 'ALL REGIONS' : stripHtmlTags(currentUser?.region || ''));
  const [filterStation, setFilterStation] = useState(isSuperAdminOrTopCommand ? 'ALL STATIONS' : stripHtmlTags(currentUser?.station || ''));

  const fetchPendingUsers = async () => {
    setLoadingPending(true);
    try {
      let res = await authFetch("/api/v1/admin/pending-users");
      if (!res.ok) res = await authFetch("/api/v1/users/pending");
      if (!res.ok) res = await authFetch("/api/v1/auth/pending");
      if (!res.ok) res = await authFetch("/api/v1/pending-users");

      if (res.ok) {
        const data = await res.json();
        setRealPendingUsers(Array.isArray(data) ? data : []);
      }
    } catch (err) { 
      console.error("Failed to sync pending users:", err); 
    } finally { 
      setLoadingPending(false); 
    }
  };

  const fetchResets = async () => {
    setLoadingResets(true);
    try {
      let res = await authFetch("/api/v1/admin/reset-requests");
      if (!res.ok) res = await authFetch("/api/v1/auth/reset-requests");

      if (res.ok) {
        const data = await res.json();
        setResetRequests(Array.isArray(data) ? data : []);
      }
    } catch (err) { 
      console.error("Failed to sync password resets:", err); 
    } finally { 
      setLoadingResets(false); 
    }
  };

  const fetchAllSystemUsers = async () => {
    setLoadingUsers(true);
    try {
      const res = await authFetch("/api/v1/users");
      if (res.ok) {
        const data = await res.json();
        setAllSystemUsers(Array.isArray(data) ? data : []);
      }
    } catch (err) { 
      console.error("Failed to sync system user roster:", err); 
    } finally { 
      setLoadingUsers(false); 
    }
  };

  useEffect(() => {
    setLoadingRequests(true);
    authFetch("/api/v1/requests")
      .then(res => res.json())
      .then(data => { setModRequests(Array.isArray(data) ? data : []); setLoadingRequests(false); })
      .catch(err => { console.error(err); setLoadingRequests(false); });

    fetchPendingUsers();
    fetchResets();
    fetchAllSystemUsers();

    if (activeTab === 'logs') {
      setLoadingLogs(true);
      authFetch("/api/v1/audit-logs")
        .then(res => res.json())
        .then(data => { setAuditLogs(Array.isArray(data) ? data : []); setLoadingLogs(false); })
        .catch(err => { console.error(err); setLoadingLogs(false); });
    }
  }, [activeTab]);

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
    if (currentUser?.role === 'SYSTEM_ADMIN') {
      alert("Security Restriction: SYSTEM ADMIN is restricted from modifying user permissions.");
      return;
    }

    const cleanFnum = stripHtmlTags(fnum);
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
    if (currentUser?.role === 'SYSTEM_ADMIN') {
      alert("Security Restriction: SYSTEM ADMIN has viewing and diagnostic access only and is strictly barred from modifying user permissions or access levels.");
      return;
    }

    const cleanFnum = stripHtmlTags(fnum);
    const targetUser = allSystemUsers.find(u => u.fnum === cleanFnum);
    if (!targetUser) return;

    if (value === true && !isSuperAdminOrTopCommand && targetUser.permissions?.super_admin_locks?.[permissionKey]) {
      alert("SECURITY OVERRIDE DENIED: This clearance was explicitly locked. Only High Command or Super Admin has the authority to reinstate it.");
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
      if (value === false) {
        locks[permissionKey] = true;
      } else {
        locks[permissionKey] = false;
      }
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
    if (currentUser?.role === 'SYSTEM_ADMIN') {
      alert("Security Restriction: SYSTEM ADMIN cannot manage or modify access clearance tiers.");
      return;
    }

    const cleanFnum = stripHtmlTags(fnum);
    const targetUser = allSystemUsers.find(u => u.fnum === cleanFnum);
    if (!targetUser) return;

    if (newRole !== 'REVOKED' && targetUser.role === 'REVOKED' && !isSuperAdminOrTopCommand && targetUser.permissions?.revoked_by === 'SUPER_ADMIN') {
      alert("SECURITY OVERRIDE DENIED: This officer's access was revoked by a Global Super Admin. Only the Super Admin has the exclusive authority to reinstate them.");
      return;
    }

    if (currentUser?.role === 'STATION_ADMIN') {
      const currentUserStation = stripHtmlTags(currentUser.station || '');
      const stationUsersCount = allSystemUsers.filter(u => stripHtmlTags(u.station || '') === currentUserStation).length;
      if (stationUsersCount >= 3 && newRole !== 'USER' && newRole !== 'REVOKED') {
        alert("Station Admin Limit: You are restricted to managing a maximum of 3 users per station.");
        return;
      }
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

  const handleApproveUser = async (fnum) => {
    try {
      const token = localStorage.getItem('kmp_authToken');
      const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
      const cleanFnum = stripHtmlTags(fnum);
      const safeFnum = encodeURIComponent(cleanFnum.trim());

      const response = await fetch(`${API_URL}/api/v1/admin/approve-user/${safeFnum}`, {
        method: "PATCH",
        headers: { 
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      });

      const data = await response.json();
      if (!response.ok) throw new Error(stripHtmlTags(data.detail) || "Failed to approve user.");

      alert(`Success: ${stripHtmlTags(data.message)}`);
      fetchPendingUsers();
      fetchAllSystemUsers();
    } catch (err) {
      alert(`Approval Error: ${stripHtmlTags(err.message)}`);
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
      const token = localStorage.getItem('kmp_authToken');
      const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
        
      const response = await fetch(`${API_URL}/api/v1/requests/${reqId}`, {
        method: "PATCH", 
        headers: { 
          "Content-Type": "application/json", 
          "Authorization": `Bearer ${token}` 
        }, 
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
    <div className="p-6 max-w-[1800px] mx-auto space-y-6 relative z-10 animate-in fade-in duration-300">
      <div className="text-center mb-6 flex flex-col items-center">
        <img src="/upf_badge.png" alt="UPF Logo" className="w-16 h-16 mb-3 object-contain contrast-200 brightness-75 drop-shadow-sm" onError={(e) => e.target.style.display = 'none'} />
        <h1 className="text-3xl font-black text-slate-900 tracking-tight">Access & Command Approvals</h1>
        <h3 className="text-xs text-slate-500 mt-1 font-medium">Review pending officer signups, granular clearance tiers, HR transfers, and Audit Logs.</h3>
      </div>

      {/* Global Filter States */}
      <div className="flex flex-col sm:flex-row justify-center gap-3 mb-4">
        <select 
          value={filterRegion} 
          onChange={(e) => { setFilterRegion(stripHtmlTags(e.target.value)); setFilterStation('ALL STATIONS'); }} 
          disabled={!canViewGlobalActive} 
          className="border border-slate-300 rounded-xl px-4 py-2 text-xs shadow-xs bg-white disabled:bg-slate-100 font-bold text-blue-800 outline-none focus:border-blue-500 cursor-pointer"
        >
          {canViewGlobalActive ? (
            <><option value="ALL REGIONS">ALL REGIONS (GLOBAL)</option>{Object.keys(REGIONAL_HIERARCHY || {}).map(reg => <option key={reg} value={reg}>{reg}</option>)}</>
          ) : <option value={currentUser?.region}>{stripHtmlTags(currentUser?.region)}</option>}
        </select>

        <select 
          value={filterStation} 
          onChange={(e) => setFilterStation(stripHtmlTags(e.target.value))} 
          disabled={!canViewGlobalActive && !['RPC', 'Deputy Commander'].includes(currentUser?.role)} 
          className="border border-slate-300 rounded-xl px-4 py-2 text-xs shadow-xs bg-white disabled:bg-slate-100 font-bold text-blue-800 outline-none focus:border-blue-500 cursor-pointer"
        >
          {canViewGlobalActive || ['RPC', 'Deputy Commander'].includes(currentUser?.role) ? (
            <><option value="ALL STATIONS">ALL STATIONS / DIVISIONS</option>{filterRegion !== 'ALL REGIONS' && REGIONAL_HIERARCHY?.[filterRegion] ? REGIONAL_HIERARCHY[filterRegion].map(stat => <option key={stat} value={stat}>{stat}</option>) : null}</>
          ) : <option value={currentUser?.station}>{stripHtmlTags(currentUser?.station)}</option>}
        </select>
      </div>

      {/* Navigation Tabs */}
      <div className="flex space-x-2 border-b border-slate-200 mb-6 bg-white/50 backdrop-blur rounded-t-xl px-4 pt-4 overflow-x-auto custom-scrollbar">
        <button onClick={() => setActiveTab('approvals')} className={`pb-3 px-4 text-xs font-bold border-b-2 transition-colors whitespace-nowrap ${activeTab === 'approvals' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>New Account Authorizations ({loadingPending ? '...' : filteredPending.length})</button>
        <button onClick={() => setActiveTab('matrix')} className={`pb-3 px-4 text-xs font-bold border-b-2 transition-colors whitespace-nowrap ${activeTab === 'matrix' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>Active Roster & Clearance Matrix ({filteredSystemUsers.length})</button>
        <button onClick={() => setActiveTab('requests')} className={`pb-3 px-4 text-xs font-bold border-b-2 transition-colors whitespace-nowrap ${activeTab === 'requests' ? 'border-amber-500 text-amber-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>HR Modification Requests ({filteredRequests.length})</button>
        <button onClick={() => setActiveTab('logs')} className={`pb-3 px-4 text-xs font-bold border-b-2 transition-colors whitespace-nowrap ${activeTab === 'logs' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>Audit Logs ({filteredLogs.length})</button>
        <button onClick={() => setActiveTab('resets')} className={`pb-3 px-4 text-xs font-bold border-b-2 transition-colors whitespace-nowrap ${activeTab === 'resets' ? 'border-red-600 text-red-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>Password Resets ({filteredResets.length})</button>
      </div>

      {/* ACTIVE ROSTER & EXPANDED GRANULAR MATRIX TAB */}
      {activeTab === 'matrix' && (
        <div className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden w-full">
          <div className="bg-slate-900 text-white p-4 text-xs font-extrabold uppercase tracking-wider flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
            <span className="flex items-center">
              <Shield className="w-4 h-4 mr-2 text-indigo-400" /> Super Control Panel - Active Roster Matrix ({stripHtmlTags(filterRegion)} {filterStation !== 'ALL STATIONS' ? `/ ${stripHtmlTags(filterStation)}` : ''})
            </span>
            <span className="text-[10px] text-slate-400 font-mono text-right">
              Tiers: USER | ADMIN_USER | STATION_ADMIN | SYSTEM_ADMIN | SUPER_ADMIN_USER | SUPER_ADMIN | REVOKED
            </span>
          </div>
            
          {loadingUsers ? (
            <div className="p-12 text-center text-slate-400 font-medium animate-pulse text-xs">Syncing user database roster...</div>
          ) : filteredSystemUsers.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-xs font-medium">No registered system users found for this regional filter.</div>
          ) : (
            <div className="overflow-x-auto w-full custom-scrollbar">
              <table className="min-w-max divide-y divide-slate-200 text-xs">
                <thead className="bg-slate-50 text-slate-700 uppercase font-extrabold text-[10px]">
                  <tr>
                    <th className="p-3 text-left sticky left-0 z-10 bg-slate-50 shadow-[1px_0_0_#e2e8f0]">Officer Details</th>
                    <th className="p-3 text-center sticky left-[240px] z-10 bg-slate-50 shadow-[1px_0_0_#e2e8f0]">Administrative Tier</th>
                    
                    <th className="p-3 text-center sticky left-[360px] z-10 bg-slate-50 shadow-[1px_0_0_#e2e8f0]">Quick Actions</th>

                    {CLEARANCE_MATRIX_COLS.map((col, idx) => {
                      if (col.key === 'global_observer' && currentUser?.role !== 'SUPER_ADMIN') {
                        return null;
                      }

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
                      
                    const isRoleSelectDisabled = isSuperAdmin && currentUser?.role !== 'SUPER_ADMIN';

                    return (
                      <tr key={u.fnum} className={`transition-colors ${isRevoked ? 'bg-red-50/40' : 'hover:bg-slate-50'}`}>
                        <td className="p-3 sticky left-0 z-10 bg-white shadow-[1px_0_0_#e2e8f0] min-w-[240px]">
                          <div className={`font-extrabold text-[11px] flex items-center ${isRevoked ? 'text-red-900' : 'text-slate-900'}`}>
                            {formatOfficerHeader(u)}
                            {isSuperAdmin && (
                              <span className="ml-2 px-1.5 py-0.5 text-[8px] bg-red-100 text-red-700 font-bold rounded-full border border-red-200">
                                GOD-MODE
                              </span>
                            )}
                            {p.global_observer && !isSuperAdmin && (
                              <span className="ml-2 px-1.5 py-0.5 text-[8px] bg-fuchsia-100 text-fuchsia-700 font-bold rounded-full border border-fuchsia-200" title="Observer Mode Active">
                                OBSERVER
                              </span>
                            )}
                            {p.revoked_by === 'SUPER_ADMIN' && <Lock size={12} className="ml-2 text-red-600" title="Revoked by Super Admin" />}
                          </div>
                          <div className={`text-[10px] font-mono mt-0.5 ${isRevoked ? 'text-red-500' : 'text-slate-500'}`}>
                            Station: <strong className={isRevoked ? 'text-red-700' : 'text-slate-700'}>{stripHtmlTags(u.station)}</strong> ({stripHtmlTags(u.region)})
                          </div>
                        </td>

                        <td className="p-3 text-center sticky left-[240px] z-10 bg-white shadow-[1px_0_0_#e2e8f0] min-w-[120px]">
                          <select 
                            value={u.role || 'USER'}
                            onChange={(e) => handleRoleTierChange(u.fnum, stripHtmlTags(e.target.value))}
                            disabled={isRoleSelectDisabled}
                            className={`border rounded-md px-2 py-1 font-bold outline-none cursor-pointer text-[10px] uppercase w-full ${
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

                        <td className="p-3 text-center sticky left-[360px] z-10 bg-white shadow-[1px_0_0_#e2e8f0] min-w-[90px]">
                          <div className="flex items-center justify-center space-x-1.5">
                            <button 
                              onClick={() => handleBulkMatrixAction(u.fnum, true)}
                              title="Check All Modules"
                              className="p-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded border border-emerald-300 transition shadow-sm"
                            >
                              <CheckSquare size={14} />
                            </button>
                            <button 
                              onClick={() => handleBulkMatrixAction(u.fnum, false)}
                              title="Uncheck All Modules (Deny Access)"
                              className="p-1.5 bg-red-50 text-red-700 hover:bg-red-100 rounded border border-red-300 transition shadow-sm"
                            >
                              <Square size={14} />
                            </button>
                          </div>
                        </td>

                        {CLEARANCE_MATRIX_COLS.map((col, idx) => {
                          if (col.key === 'global_observer' && currentUser?.role !== 'SUPER_ADMIN') {
                            return null;
                          }

                          const hasSuperAdminLock = Boolean(p.super_admin_locks?.[col.key]);
                          const isLockedVisually = hasSuperAdminLock && !isSuperAdminOrTopCommand;

                          const isStrictSuperAdminOnly = col.key === 'global_observer';

                          const isDisabled = 
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
                                  className={`w-4 h-4 rounded cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed accent-${col.color}-600`} 
                                />
                                {(isLockedVisually || isSuperAdmin) && <Lock size={10} className="absolute -top-1.5 -right-2 text-red-600 drop-shadow-sm" title={isSuperAdmin ? "Super Admin Access Locked" : "Locked by High Command"} />}
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

      {/* APPROVALS TAB */}
      {activeTab === 'approvals' && (
        <div className="bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden max-w-6xl mx-auto">
          {loadingPending ? (
            <div className="p-8 text-center text-slate-500 font-medium animate-pulse text-xs">Syncing with Command Database...</div>
          ) : filteredPending.length === 0 ? (
            <div className="p-8 text-center text-slate-500 font-medium text-xs">No active unapproved access requests pending in selected queue.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-xs">
                <thead className="bg-slate-50 text-slate-600 uppercase font-extrabold">
                  <tr>
                    <th className="px-4 py-3 text-left">Officer Details</th>
                    <th className="px-4 py-3 text-left">Command Post</th>
                    <th className="px-4 py-3 text-left">Derived Role Tier</th>
                    <th className="px-4 py-3 text-left">Action</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-200">
                  {filteredPending.map((user) => (
                    <tr key={user.fnum} className="hover:bg-blue-50/50">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="font-bold text-slate-900">{formatOfficerHeader(user)}</div>
                        <div className="text-[11px] text-slate-400">{stripHtmlTags(user.phone)}</div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="font-bold text-blue-700">{stripHtmlTags(user.station)}</div>
                        <div className="text-[11px] text-slate-500">{stripHtmlTags(user.region)}</div>
                        <div className="text-[10px] bg-slate-100 px-2 py-0.5 rounded mt-0.5 inline-block border font-bold text-slate-600">{stripHtmlTags(user.position)}</div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`px-2 inline-flex text-[11px] font-bold rounded-full border ${user.role?.includes('ADMIN') ? 'bg-purple-100 text-purple-800 border-purple-200' : 'bg-slate-100 text-slate-800 border-slate-200'}`}>
                          {stripHtmlTags(user.role)}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <button onClick={() => handleApproveUser(user.fnum)} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-1.5 px-4 rounded-lg shadow-xs text-xs transition flex items-center cursor-pointer">
                          <CheckCircle size={14} className="mr-1" /> Approve Access
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

      {/* HR MODIFICATION REQUESTS TAB */}
      {activeTab === 'requests' && (
        <div className="bg-white rounded-xl shadow-xs border border-amber-200 overflow-hidden max-w-6xl mx-auto">
          <div className="bg-slate-900 px-4 py-3 border-b border-slate-800 flex items-center text-white font-semibold text-xs uppercase tracking-wider">
            <Shield className="w-4 h-4 mr-2 text-amber-400" /> HR Modification Requests
          </div>
          {loadingRequests ? (
            <div className="p-8 text-center text-slate-500 font-medium animate-pulse text-xs">Loading pending modifications...</div>
          ) : filteredRequests.length === 0 ? (
            <div className="p-8 text-center text-slate-500 font-medium text-xs">No pending profile modification requests in selected queue.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-xs">
                <thead className="bg-slate-50 text-slate-600 uppercase font-extrabold">
                  <tr>
                    <th className="px-4 py-3 text-left">Officer Details</th>
                    <th className="px-4 py-3 text-left">Requested Changes</th>
                    <th className="px-4 py-3 text-left">Action</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-200">
                  {filteredRequests.map((req) => (
                    <tr key={req.id || req.sn} className="hover:bg-amber-50/50">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="font-extrabold text-blue-700">
                          {formatOfficerHeader({ fnum: req.fnum, rank: req.current_rank, name: req.current_name })}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {req.requested_name && req.requested_name !== req.current_name && <div className="text-xs"><span className="font-bold text-slate-400">Name:</span> <span className="text-red-500 line-through mr-1">{stripHtmlTags(req.current_name)}</span> ➡️ <span className="text-emerald-600 font-bold">{stripHtmlTags(req.requested_name)}</span></div>}
                        {req.requested_rank && req.requested_rank !== req.current_rank && <div className="text-xs"><span className="font-bold text-slate-400">Rank:</span> <span className="text-red-500 line-through mr-1">{stripHtmlTags(req.current_rank)}</span> ➡️ <span className="text-emerald-600 font-bold">{stripHtmlTags(req.requested_rank)}</span></div>}
                        {req.requested_station && req.requested_station !== req.current_station && <div className="text-xs"><span className="font-bold text-slate-400">Station:</span> <span className="text-red-500 line-through mr-1">{stripHtmlTags(req.current_station)}</span> ➡️ <span className="text-emerald-600 font-bold">{stripHtmlTags(req.requested_station)}</span></div>}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex space-x-2">
                          <button onClick={() => handleReviewRequest(req.id || req.sn, "APPROVED")} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-1.5 px-3 rounded text-xs transition flex items-center cursor-pointer shadow-xs"><CheckCircle size={14} className="mr-1" /> Approve</button>
                          <button onClick={() => handleReviewRequest(req.id || req.sn, "REJECTED")} className="bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 font-bold py-1.5 px-3 rounded text-xs transition flex items-center cursor-pointer shadow-xs"><X size={14} className="mr-1" /> Reject</button>
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
          <div className="bg-slate-900 px-4 py-3 border-b border-slate-800 flex items-center justify-between text-white font-semibold text-xs uppercase tracking-wider">
            <span className="flex items-center">
              <Shield className="w-4 h-4 mr-2 text-blue-400" /> System Audit Logs ({stripHtmlTags(filterRegion)} {filterStation !== 'ALL STATIONS' ? `/ ${stripHtmlTags(filterStation)}` : ''})
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-xs">
              <thead className="bg-slate-50 text-slate-600 uppercase font-extrabold">
                <tr>
                  <th className="px-4 py-3 text-left">Timestamp</th>
                  <th className="px-4 py-3 text-left">User FNUM</th>
                  <th className="px-4 py-3 text-left">Event</th>
                  <th className="px-4 py-3 text-left">Target</th>
                  <th className="px-4 py-3 text-left">Details</th>
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
                      <td className="px-4 py-3 whitespace-nowrap text-slate-500 font-mono text-[11px]">
                        {stripHtmlTags(log.created_at || 'Unknown Time')}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap font-extrabold text-blue-700">{stripHtmlTags(log.user_fnum)}</td>
                      <td className="px-4 py-3 whitespace-nowrap"><span className="font-extrabold text-slate-800 uppercase text-[11px]">{stripHtmlTags(log.event_type)}</span></td>
                      <td className="px-4 py-3 text-slate-600 font-medium">{stripHtmlTags(log.target_user || 'N/A')}</td>
                      <td className="px-4 py-3 text-slate-600">{stripHtmlTags(log.details)}</td>
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
          <div className="bg-slate-900 px-4 py-3 border-b border-slate-800 flex items-center text-white font-semibold text-xs uppercase tracking-wider">
            <Lock className="w-4 h-4 mr-2 text-red-400" /> Authorized Password Recovery
          </div>
          {loadingResets ? (
            <div className="p-8 text-center text-slate-500 font-medium animate-pulse text-xs">Scanning jurisdiction for requests...</div>
          ) : filteredResets.length === 0 ? (
            <div className="p-8 text-center text-slate-500 font-medium text-xs">No pending password reset requests in selected queue.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-xs">
                <thead className="bg-slate-50 text-slate-600 uppercase font-extrabold">
                  <tr>
                    <th className="px-4 py-3 text-left">Date Requested</th>
                    <th className="px-4 py-3 text-left">Officer Details</th>
                    <th className="px-4 py-3 text-left">Station / Division</th>
                    <th className="px-4 py-3 text-left">Command Action</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-200">
                  {filteredResets.map((req) => (
                    <tr key={req.id} className="hover:bg-red-50/50">
                      <td className="px-4 py-3 whitespace-nowrap font-bold text-slate-500 text-[11px]">{stripHtmlTags(req.request_date)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="font-extrabold text-blue-700">
                          {formatOfficerHeader({ fnum: req.fnum, rank: req.rank, name: req.name })}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-slate-700">
                        <div className="font-bold">{stripHtmlTags(req.station)}</div>
                        <div className="text-[11px] text-slate-500">{stripHtmlTags(req.region)}</div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex space-x-2">
                          <button onClick={() => handleResetAction(req.id, "APPROVE")} className="bg-red-600 hover:bg-red-700 text-white font-bold py-1.5 px-3 rounded text-xs transition flex items-center shadow-xs cursor-pointer"><Unlock size={14} className="mr-1" /> Authorize Reset</button>
                          <button onClick={() => handleResetAction(req.id, "REJECT")} className="bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 font-bold py-1.5 px-3 rounded text-xs transition flex items-center shadow-xs cursor-pointer"><X size={14} className="mr-1" /> Reject</button>
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
                    <AlertTriangle className="text-white mr-3 animate-pulse" size={24} />
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
                        className="w-full border border-slate-300 rounded-xl p-3 text-sm font-medium outline-none focus:border-red-500 focus:ring-2 focus:ring-red-200 resize-none h-32"
                    />
                </div>
                 
                <div className="bg-slate-50 px-6 py-4 flex justify-end space-x-3 border-t border-slate-200 shrink-0">
                    <button 
                        onClick={() => setRevokePrompt({ isOpen: false, fnum: null, actionType: null, targetValue: null, permissionKey: null, reason: '' })}
                        className="px-5 py-2.5 font-bold text-slate-600 text-xs bg-white border border-slate-300 rounded-xl hover:bg-slate-100 transition cursor-pointer"
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
                            className="px-5 py-2.5 font-bold text-white text-xs bg-red-600 rounded-xl hover:bg-red-700 shadow-md transition flex items-center cursor-pointer animate-in fade-in slide-in-from-right-4"
                        >
                            <CheckCircle size={16} className="mr-2" /> Confirm Revocation
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