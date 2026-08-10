import React, { useState, useEffect, useMemo } from 'react';
import { 
  Shield, CheckCircle, AlertTriangle, X, Lock, Unlock, 
  Users, RefreshCw, KeyRound, UserCheck, FileText 
} from 'lucide-react';

// 🟢 REGIONAL HIERARCHY CONSTANTS
const REGIONAL_HIERARCHY = {
  "KMP NORTH": ["KAWEMPE", "KAKIRI", "KASANGATI", "MATUGGA", "NANSANA", "OLD KAMPALA", "WAKISO", "WANDEGEYA"],
  "KMP EAST": ["JINJA ROAD", "KIRA", "KIRA ROAD", "MUKONO", "NAGGALAMA", "SEETA"],
  "KMP SOUTH": ["NATEETE", "CPS KAMPALA", "PARLIAMENT", "ENTEBBE", "KABALAGALA", "KAJJANSI", "KASENYI", "KATWE", "KYENGERA", "NSANGI"],
  "KMP HEADQUARTERS": ["KMP HEADQUARTERS", "FLYING SQUAD", "CRIME INTELLIGENCE", "KMP Headquarters", "KAWEMPE", "KAKIRI", "KASANGATI", "MATUGGA", "NANSANA", "OLD KAMPALA", "WAKISO", "WANDEGEYA", "JINJA ROAD", "KIRA", "KIRA ROAD", "MUKONO", "NAGGALAMA", "SEETA", "NATEETE", "CPS KAMPALA", "PARLIAMENT", "ENTEBBE", "KABALAGALA", "KAJJANSI", "KASENYI", "KATWE", "KYENGERA", "NSANGI"],
  "POLICE HEADQUARTERS": ["NAGURU", "KMP HEADQUARTERS", "FLYING SQUAD", "CRIME INTELLIGENCE", "KMP Headquarters", "KAWEMPE", "KAKIRI", "KASANGATI", "MATUGGA", "NANSANA", "OLD KAMPALA", "WAKISO", "WANDEGEYA", "JINJA ROAD", "KIRA", "KIRA ROAD", "MUKONO", "NAGGALAMA", "SEETA", "NATEETE", "CPS KAMPALA", "PARLIAMENT", "ENTEBBE", "KABALAGALA", "KAJJANSI", "KASENYI", "KATWE", "KYENGERA", "NSANGI"]
};

const autoCapitalize = (text) => {
  if (!text) return text;
  return text.replace(/(^\s*|>|\.\s+|\n\s*)([a-z])/g, (match, separator, letter) => {
    return separator + letter.toUpperCase();
  });
};

const formatEATDateTime = (dateStr) => {
  if (!dateStr) return 'N/A';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;

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

const POSITIONS = {
  ADMIN: [
    "System Manager", "IGP", "DIGP", "Director OPS", "Director CT", "Director CI", 
    "Director CID", "Director HRM & A", "Director logistics & engineering", 
    "KMP Commander", "Deputy KMP Commander",
    "KMP CID Commander", "KMP CI Commander", "KMP Operations Commander", 
    "KMP Traffic & Road Safety Commander", "KMP 999 eru commander", 
    "999 ERU Regional Data Officer", "Regional HR Officer", "KMP SFC Coordinator",
    "Regional Data officer", "Divisional Data Officer", "Station Data Officer", "Regional Data Assistant Officer", "Division Data Assistant Officer", "Station Data Assistant Officer", "Regional Traffic Officer", "Divisional Traffic Officer", "Divisional CID Officer", "Divisional CI Officer", "Regional CFPU Officer", "Divisional CFPU Officer", "Regional Fire Officer", "Divisional Fire Officer", "Regional Logistics Officer", "Divisional Logistics Officer"
  ],
  RPC: [
    "KMP South Commander", "KMP North Commander", "KMP East Commander", "Deputy Commander KMP south", "Deputy Commander KMP North", "Deputy Commander KMP East"
  ]
};

// 🟢 Helper to format officer string cleanly: FNUM RANK NAME
const formatOfficerHeader = (user) => {
  const fnum = user.fnum || user.f_num || 'NO-FNUM';
  const rank = user.rank || 'OFFICER';
  const name = user.name || 'UNKNOWN';
  return `${fnum} ${rank} ${name}`;
};

const AdminApprovals = ({ currentUser, authFetch: propAuthFetch }) => {
   
  // 🟢 FALLBACK SAFETY NET
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
   
  const [audit_logs, setaudit_logs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
   
  const [realPendingUsers, setRealPendingUsers] = useState([]);
  const [loadingPending, setLoadingPending] = useState(false);

  const [resetRequests, setResetRequests] = useState([]);
  const [loadingResets, setLoadingResets] = useState(false);

  // Active System Roster & Granular Matrix management
  const [allSystemUsers, setAllSystemUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  // 🟢 REVOKE MODAL STATE FOR COMPELLED JUSTIFICATION
  const [revokePrompt, setRevokePrompt] = useState({
    isOpen: false,
    fnum: null,
    actionType: null, // 'ROLE' or 'PERMISSION'
    targetValue: null,
    permissionKey: null,
    reason: ''
  });

  // Global Filter States for Super Admin / RPC capabilities
  const [filterRegion, setFilterRegion] = useState(currentUser?.role === 'SUPER_ADMIN' ? 'ALL REGIONS' : currentUser?.region || '');
  const [filterStation, setFilterStation] = useState((['SUPER_ADMIN', 'RPC', 'Deputy Commander', 'ASSISTANT_SUPER_ADMIN'].includes(currentUser?.role)) ? 'ALL STATIONS' : currentUser?.station || '');

  const isRPC = currentUser && ['RPC', 'Deputy Commander'].includes(currentUser.role);
  const isSystemAdmin = currentUser && ['ADMIN', 'SUPER_ADMIN', 'SYSTEM_ADMIN', 'ASSISTANT_SUPER_ADMIN'].includes(currentUser.role);

  // Component-level fetchers
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
        .then(data => { setaudit_logs(Array.isArray(data) ? data : []); setLoadingLogs(false); })
        .catch(err => { console.error(err); setLoadingLogs(false); });
    }
  }, [activeTab]);

  const filteredPending = useMemo(() => {
    return realPendingUsers.filter(u => {
      if (filterRegion !== 'ALL REGIONS' && u.region !== filterRegion) return false;
      if (filterStation !== 'ALL STATIONS' && u.station !== filterStation) return false;
      return true;
    });
  }, [realPendingUsers, filterRegion, filterStation]);

  const filteredRequests = useMemo(() => {
    return modRequests.filter(r => {
      if (filterRegion !== 'ALL REGIONS' && r.current_region !== filterRegion) return false;
      if (filterStation !== 'ALL STATIONS' && r.current_station !== filterStation) return false;
      return true;
    });
  }, [modRequests, filterRegion, filterStation]);

  const filteredResets = useMemo(() => {
    return resetRequests.filter(r => {
      if (filterRegion !== 'ALL REGIONS' && r.region !== filterRegion) return false;
      if (filterStation !== 'ALL STATIONS' && r.station !== filterStation) return false;
      return true;
    });
  }, [resetRequests, filterRegion, filterStation]);

  // 🟢 EXECUTION ENGINES WITH STRICT SUPER ADMIN EXCLUSIVE REINSTATEMENT
  const executePermissionChange = async (fnum, permissionKey, value, reason = '') => {
    const targetUser = allSystemUsers.find(u => u.fnum === fnum);
    if (!targetUser) return;

    let locks = targetUser.permissions?.super_admin_locks || {};
    
    // If Super Admin disables clearance, lock it down exclusively to Super Admin
    if (value === false && currentUser?.role === 'SUPER_ADMIN') {
      locks[permissionKey] = true;
    } else if (value === true && currentUser?.role === 'SUPER_ADMIN') {
      // Only Super Admin can clear the lock when reinstating
      locks[permissionKey] = false;
    }

    const updatedPermissions = {
      ...(targetUser.permissions || {}),
      [permissionKey]: value,
      super_admin_locks: locks,
      [`${permissionKey}_revoke_reason`]: reason || targetUser.permissions?.[`${permissionKey}_revoke_reason`]
    };

    setAllSystemUsers(allSystemUsers.map(u => u.fnum === fnum ? { ...u, permissions: updatedPermissions } : u));

    try {
      const response = await authFetch(`/api/v1/users/${encodeURIComponent(fnum.trim())}/access`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: targetUser.role, permissions: updatedPermissions })
      });
       
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `HTTP Error ${response.status}`);
      }
    } catch (err) {
      alert(`Permission Update Failed:\n${err.message}`);
      fetchAllSystemUsers();
    }
  };

  const executeRoleChange = async (fnum, newRole, reason = '') => {
    const targetUser = allSystemUsers.find(u => u.fnum === fnum);
    if (!targetUser) return;

    let updatedPermissions = { ...(targetUser.permissions || {}) };

    if (newRole === 'REVOKED') {
      updatedPermissions.revoke_reason = reason;
      updatedPermissions.revoked_by = currentUser?.role === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : currentUser?.role;
    } else if (currentUser?.role === 'SUPER_ADMIN') {
      // Only Super Admin can clear account-wide suspension metadata
      delete updatedPermissions.revoked_by;
      delete updatedPermissions.revoke_reason;
    }

    setAllSystemUsers(allSystemUsers.map(u => u.fnum === fnum ? { ...u, role: newRole, permissions: updatedPermissions } : u));

    try {
      const response = await authFetch(`/api/v1/users/${encodeURIComponent(fnum.trim())}/access`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole, permissions: updatedPermissions })
      });
       
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `HTTP Error ${response.status}`);
      }
    } catch (err) {
      alert(`Role Update Failed:\n${err.message}`);
      fetchAllSystemUsers();
    }
  };

  // Granular Matrix Toggle Handler with Strict Super Admin Reinstatement Enforcement
  const handleGranularPermissionChange = async (fnum, permissionKey, value) => {
    if (currentUser?.role === 'SYSTEM_ADMIN') {
      alert("Security Restriction: SYSTEM ADMIN has viewing and diagnostic access only and is strictly barred from modifying user permissions or access levels.");
      return;
    }

    const targetUser = allSystemUsers.find(u => u.fnum === fnum);
    if (!targetUser) return;

    // STRICT SUPER ADMIN EXCLUSIVE REINSTATEMENT LOCK
    if (value === true && currentUser?.role !== 'SUPER_ADMIN' && targetUser.permissions?.super_admin_locks?.[permissionKey]) {
      alert("SECURITY OVERRIDE DENIED: This clearance was explicitly revoked by a Global Super Admin. Only the Super Admin has the exclusive authority to reinstate it.");
      return;
    }

    // COMPELLED REASON FOR REMOVING CLEARANCE (For non-Super Admins)
    if (value === false && currentUser?.role !== 'SUPER_ADMIN') {
      setRevokePrompt({
        isOpen: true,
        fnum,
        actionType: 'PERMISSION',
        targetValue: value,
        permissionKey,
        reason: ''
      });
      return;
    }

    executePermissionChange(fnum, permissionKey, value, '');
  };

  // Role Tier Update Handler with Strict Super Admin Reinstatement Enforcement
  const handleRoleTierChange = async (fnum, newRole) => {
    if (currentUser?.role === 'SYSTEM_ADMIN') {
      alert("Security Restriction: SYSTEM ADMIN cannot manage or modify access clearance tiers.");
      return;
    }

    const targetUser = allSystemUsers.find(u => u.fnum === fnum);
    if (!targetUser) return;

    // STRICT SUPER ADMIN EXCLUSIVE REINSTATEMENT LOCK
    if (newRole !== 'REVOKED' && targetUser.role === 'REVOKED' && currentUser?.role !== 'SUPER_ADMIN' && targetUser.permissions?.revoked_by === 'SUPER_ADMIN') {
      alert("SECURITY OVERRIDE DENIED: This officer's access was revoked by a Global Super Admin. Only the Super Admin has the exclusive authority to reinstate them.");
      return;
    }

    // STATION ADMIN validation: Max 3 users per station rule check
    if (currentUser?.role === 'STATION_ADMIN') {
      const stationUsersCount = allSystemUsers.filter(u => u.station === currentUser.station).length;
      if (stationUsersCount >= 3 && newRole !== 'USER' && newRole !== 'REVOKED') {
        alert("Station Admin Limit: You are restricted to managing a maximum of 3 users per station.");
        return;
      }
    }

    // COMPELLED REASON FOR SUSPENDING ACCOUNT
    if (newRole === 'REVOKED' && currentUser?.role !== 'SUPER_ADMIN') {
      setRevokePrompt({
        isOpen: true,
        fnum,
        actionType: 'ROLE',
        targetValue: newRole,
        permissionKey: null,
        reason: ''
      });
      return;
    }

    executeRoleChange(fnum, newRole, '');
  };

  const handleApproveUser = async (fnum) => {
    try {
      const token = localStorage.getItem('kmp_authToken');
      const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
      const safeFnum = encodeURIComponent(fnum.trim());

      const response = await fetch(`${API_URL}/api/v1/admin/approve-user/${safeFnum}`, {
        method: "PATCH",
        headers: { 
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Failed to approve user.");

      alert(`Success: ${data.message}`);
      fetchPendingUsers();
      fetchAllSystemUsers();
    } catch (err) {
      alert(`Approval Error: ${err.message}`);
    }
  };

  const handleReviewRequest = async (reqId, actionStatus) => {
    if (!reqId) return alert("Error: Request ID is undefined.");

    let payload = { status: actionStatus };
    if (actionStatus === "REJECTED") {
      const reason = window.prompt("State the reason for rejecting this HR request:");
      if (reason === null) return; 
      payload.reason = reason;
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
        throw new Error(errData.detail || `Server Error: ${response.status}`);
      }
       
      setModRequests(modRequests.filter(r => r.id !== reqId && r.sn !== reqId));
      alert(`Request ${actionStatus.toLowerCase()} successfully!`);
    } catch (err) {
      alert(`Error processing request: ${err.message}`);
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
      if (!response.ok) throw new Error(data.detail);
       
      setResetRequests(resetRequests.filter(r => r.id !== reqId));
       
      if (actionStr === "APPROVE") {
        alert(`Password successfully reset! Temporary key: ${data.new_password}`);
      } else {
        alert("Request rejected.");
      }
    } catch (err) { 
      alert(`Error: ${err.message}`); 
    }
  };

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6 relative z-10 animate-in fade-in duration-300">
      <div className="text-center mb-6 flex flex-col items-center">
        <img src="/upf_badge.png" alt="UPF Logo" className="w-16 h-16 mb-3 object-contain contrast-200 brightness-75 drop-shadow-sm" onError={(e) => e.target.style.display = 'none'} />
        <h1 className="text-3xl font-black text-slate-900 tracking-tight">Access & Command Approvals</h1>
        <h3 className="text-xs text-slate-500 mt-1 font-medium">Review pending officer signups, granular clearance tiers, HR transfers, and Audit Logs.</h3>
      </div>

      {/* Global Filter States */}
      <div className="flex flex-col sm:flex-row justify-center gap-3 mb-4">
        <select 
          value={filterRegion} 
          onChange={(e) => { setFilterRegion(e.target.value); setFilterStation('ALL STATIONS'); }} 
          disabled={!['SUPER_ADMIN', 'ASSISTANT_SUPER_ADMIN'].includes(currentUser?.role)} 
          className="border border-slate-300 rounded-xl px-4 py-2 text-xs shadow-xs bg-white disabled:bg-slate-100 font-bold text-blue-800 outline-none focus:border-blue-500 cursor-pointer"
        >
          {['SUPER_ADMIN', 'ASSISTANT_SUPER_ADMIN'].includes(currentUser?.role) ? (
            <><option value="ALL REGIONS">ALL REGIONS (GLOBAL)</option>{Object.keys(REGIONAL_HIERARCHY || {}).map(reg => <option key={reg} value={reg}>{reg}</option>)}</>
          ) : <option value={currentUser?.region}>{currentUser?.region}</option>}
        </select>

        <select 
          value={filterStation} 
          onChange={(e) => setFilterStation(e.target.value)} 
          disabled={!(['SUPER_ADMIN', 'RPC', 'Deputy Commander', 'ASSISTANT_SUPER_ADMIN'].includes(currentUser?.role))} 
          className="border border-slate-300 rounded-xl px-4 py-2 text-xs shadow-xs bg-white disabled:bg-slate-100 font-bold text-blue-800 outline-none focus:border-blue-500 cursor-pointer"
        >
          {['SUPER_ADMIN', 'RPC', 'Deputy Commander', 'ASSISTANT_SUPER_ADMIN'].includes(currentUser?.role) ? (
            <><option value="ALL STATIONS">ALL STATIONS / DIVISIONS</option>{filterRegion !== 'ALL REGIONS' && REGIONAL_HIERARCHY?.[filterRegion] ? REGIONAL_HIERARCHY[filterRegion].map(stat => <option key={stat} value={stat}>{stat}</option>) : null}</>
          ) : <option value={currentUser?.station}>{currentUser?.station}</option>}
        </select>
      </div>

      {/* Navigation Tabs */}
      <div className="flex space-x-2 border-b border-slate-200 mb-6 bg-white/50 backdrop-blur rounded-t-xl px-4 pt-4 overflow-x-auto custom-scrollbar">
        <button onClick={() => setActiveTab('approvals')} className={`pb-3 px-4 text-xs font-bold border-b-2 transition-colors whitespace-nowrap ${activeTab === 'approvals' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>New Account Authorizations ({loadingPending ? '...' : filteredPending.length})</button>
        <button onClick={() => setActiveTab('matrix')} className={`pb-3 px-4 text-xs font-bold border-b-2 transition-colors whitespace-nowrap ${activeTab === 'matrix' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>Active Roster & Clearance Matrix ({allSystemUsers.length})</button>
        <button onClick={() => setActiveTab('requests')} className={`pb-3 px-4 text-xs font-bold border-b-2 transition-colors whitespace-nowrap ${activeTab === 'requests' ? 'border-amber-500 text-amber-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>HR Modification Requests ({filteredRequests.length})</button>
        <button onClick={() => setActiveTab('logs')} className={`pb-3 px-4 text-xs font-bold border-b-2 transition-colors whitespace-nowrap ${activeTab === 'logs' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>Audit Logs</button>
        <button onClick={() => setActiveTab('resets')} className={`pb-3 px-4 text-xs font-bold border-b-2 transition-colors whitespace-nowrap ${activeTab === 'resets' ? 'border-red-600 text-red-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>Password Resets ({filteredResets.length})</button>
      </div>

      {/* ACTIVE ROSTER & GRANULAR MATRIX TAB */}
      {activeTab === 'matrix' && (
        <div className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden max-w-[1500px] mx-auto">
          <div className="bg-slate-900 text-white p-4 text-xs font-extrabold uppercase tracking-wider flex items-center justify-between">
            <span className="flex items-center">
              <Shield className="w-4 h-4 mr-2 text-indigo-400" /> Active Roster & Granular Clearance Matrix
            </span>
            <span className="text-[10px] text-slate-400 font-mono">
              6-Tier Tiers: USER | ADMIN_USER | STATION_ADMIN | SYSTEM_ADMIN | SUPER_ADMIN_USER | SUPER_ADMIN | REVOKED
            </span>
          </div>
          {loadingUsers ? (
            <div className="p-12 text-center text-slate-400 font-medium animate-pulse text-xs">Syncing user database roster...</div>
          ) : allSystemUsers.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-xs font-medium">No registered system users found.</div>
          ) : (
            <div className="overflow-x-auto w-full">
              <table className="min-w-full divide-y divide-slate-200 text-xs">
                <thead className="bg-slate-50 text-slate-700 uppercase font-extrabold">
                  <tr>
                    <th className="p-3 text-left">Officer Details</th>
                    <th className="p-3 text-center">Administrative Tier</th>
                    <th className="p-3 text-center">View Ledger</th>
                    <th className="p-3 text-center">Register New</th>
                    <th className="p-3 text-center">Update / Edit</th>
                    <th className="p-3 text-center text-red-600 bg-red-50/50">Master Download</th>
                    <th className="p-3 text-center text-emerald-700 bg-emerald-50/50">Analytics / Reports</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {allSystemUsers.map(u => {
                    const p = u.permissions || {};
                    const isSuperAdmin = u.role === 'SUPER_ADMIN';
                    const isRevoked = u.role === 'REVOKED';

                    return (
                      <tr key={u.fnum} className={`transition-colors ${isRevoked ? 'bg-red-50/40' : 'hover:bg-slate-50'}`}>
                        <td className="p-3">
                          <div className={`font-extrabold text-xs flex items-center ${isRevoked ? 'text-red-900' : 'text-slate-900'}`}>
                            {formatOfficerHeader(u)}
                            {isSuperAdmin && (
                              <span className="ml-2 px-2 py-0.5 text-[9px] bg-red-100 text-red-700 font-bold rounded-full border border-red-200">
                                GOD-MODE
                              </span>
                            )}
                            {p.revoked_by === 'SUPER_ADMIN' && <Lock size={12} className="ml-2 text-red-600" title="Revoked by Super Admin" />}
                          </div>
                          <div className={`text-[11px] font-mono mt-0.5 ${isRevoked ? 'text-red-500' : 'text-slate-500'}`}>
                            Station: <strong className={isRevoked ? 'text-red-700' : 'text-slate-700'}>{u.station}</strong> ({u.region})
                          </div>
                        </td>

                        <td className="p-3 text-center">
                          <select 
                            value={u.role || 'USER'}
                            onChange={(e) => handleRoleTierChange(u.fnum, e.target.value)}
                            className={`border rounded-lg px-2.5 py-1 font-bold outline-none cursor-pointer text-[11px] ${
                              u.role === 'SUPER_ADMIN' ? 'bg-red-50 text-red-700 border-red-300' :
                              u.role === 'ASSISTANT_SUPER_ADMIN' ? 'bg-rose-50 text-rose-700 border-rose-300' :
                              u.role === 'SYSTEM_ADMIN' ? 'bg-purple-50 text-purple-700 border-purple-300' :
                              u.role === 'ADMIN_USER' ? 'bg-indigo-50 text-indigo-700 border-indigo-300' :
                              u.role === 'STATION_ADMIN' ? 'bg-blue-50 text-blue-700 border-blue-300' :
                              u.role === 'REVOKED' ? 'bg-red-100 text-red-800 border-red-400 shadow-inner' :
                              'bg-slate-100 text-slate-700 border-slate-300'
                            }`}
                          >
                            <option value="USER">USER (Data Entrant)</option>
                            <option value="ADMIN_USER">ADMIN-USER (Regional/Div/Station)</option>
                            <option value="STATION_ADMIN">STATION ADMIN (Max 3 Users)</option>
                            <option value="SYSTEM_ADMIN">SYSTEM ADMIN (Diagnostic Only)</option>
                            <option value="ASSISTANT_SUPER_ADMIN">SUPER ADMIN USER (Assistant Global)</option>
                            <option value="SUPER_ADMIN">SUPER ADMIN (Global)</option>
                            <option value="REVOKED" className="text-red-600 font-extrabold bg-red-50">REVOKED (Suspend Access)</option>
                          </select>
                        </td>

                        {[
                          { key: 'can_view', color: 'blue' },
                          { key: 'can_register', color: 'blue' },
                          { key: 'can_update', color: 'blue' },
                          { key: 'export_data', color: 'red', bg: 'bg-red-50/20' },
                          { key: 'can_view_analytics', color: 'emerald', bg: 'bg-emerald-50/20' }
                        ].map((col, idx) => {
                          const isLocked = !isSuperAdmin && p.super_admin_locks?.[col.key];
                          const isDisabled = isSuperAdmin || currentUser?.role === 'SYSTEM_ADMIN' || isLocked || isRevoked;

                          return (
                            <td key={idx} className={`p-3 text-center ${col.bg || ''}`}>
                              <div className="relative inline-flex items-center justify-center">
                                <input 
                                  type="checkbox" 
                                  checked={isSuperAdmin || Boolean(p[col.key] !== false)} 
                                  disabled={isDisabled}
                                  onChange={e => handleGranularPermissionChange(u.fnum, col.key, e.target.checked)} 
                                  className={`w-4 h-4 rounded cursor-pointer disabled:opacity-40 text-${col.color}-600`} 
                                />
                                {isLocked && <Lock size={10} className="absolute -top-1.5 -right-2 text-red-600 drop-shadow-sm" />}
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
                        <div className="text-[11px] text-slate-400">{user.phone}</div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="font-bold text-blue-700">{user.station}</div>
                        <div className="text-[11px] text-slate-500">{user.region}</div>
                        <div className="text-[10px] bg-slate-100 px-2 py-0.5 rounded mt-0.5 inline-block border font-bold text-slate-600">{user.position}</div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`px-2 inline-flex text-[11px] font-bold rounded-full border ${user.role?.includes('ADMIN') ? 'bg-purple-100 text-purple-800 border-purple-200' : 'bg-slate-100 text-slate-800 border-slate-200'}`}>
                          {user.role}
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
                        {req.requested_name && req.requested_name !== req.current_name && <div className="text-xs"><span className="font-bold text-slate-400">Name:</span> <span className="text-red-500 line-through mr-1">{req.current_name}</span> ➡️ <span className="text-emerald-600 font-bold">{req.requested_name}</span></div>}
                        {req.requested_rank && req.requested_rank !== req.current_rank && <div className="text-xs"><span className="font-bold text-slate-400">Rank:</span> <span className="text-red-500 line-through mr-1">{req.current_rank}</span> ➡️ <span className="text-emerald-600 font-bold">{req.requested_rank}</span></div>}
                        {req.requested_station && req.requested_station !== req.current_station && <div className="text-xs"><span className="font-bold text-slate-400">Station:</span> <span className="text-red-500 line-through mr-1">{req.current_station}</span> ➡️ <span className="text-emerald-600 font-bold">{req.requested_station}</span></div>}
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
          <div className="bg-slate-900 px-4 py-3 border-b border-slate-800 flex items-center text-white font-semibold text-xs uppercase tracking-wider">
            <Shield className="w-4 h-4 mr-2 text-blue-400" /> System Audit Logs (Global)
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
                ) : audit_logs.length === 0 ? (
                  <tr><td colSpan="5" className="p-4 text-center text-slate-500 text-xs">No recent security events logged in main database.</td></tr>
                ) : (
                  audit_logs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 whitespace-nowrap text-slate-500 font-mono text-[11px]">
                        {log.created_at || 'Unknown Time'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap font-extrabold text-blue-700">{log.user_fnum}</td>
                      <td className="px-4 py-3 whitespace-nowrap"><span className="font-extrabold text-slate-800 uppercase text-[11px]">{log.event_type}</span></td>
                      <td className="px-4 py-3 text-slate-600 font-medium">{log.target_user || 'N/A'}</td>
                      <td className="px-4 py-3 text-slate-600">{log.details}</td>
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
                      <td className="px-4 py-3 whitespace-nowrap font-bold text-slate-500 text-[11px]">{req.request_date}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="font-extrabold text-blue-700">
                          {formatOfficerHeader({ fnum: req.fnum, rank: req.rank, name: req.name })}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-slate-700">
                        <div className="font-bold">{req.station}</div>
                        <div className="text-[11px] text-slate-500">{req.region}</div>
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

      {/* 🔴 MANDATORY JUSTIFICATION MODAL FOR REVOKING ACCESS */}
      {revokePrompt.isOpen && (
        <div className="fixed inset-0 z-[99999] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-slate-300 overflow-hidden flex flex-col">
                <div className="bg-red-600 px-6 py-4 flex items-center shrink-0">
                    <AlertTriangle className="text-white mr-3 animate-pulse" size={24} />
                    <h3 className="text-white font-extrabold text-sm uppercase tracking-wider">Mandatory Justification Required</h3>
                </div>
                
                <div className="p-6 space-y-4">
                    <p className="text-sm font-bold text-slate-700 leading-relaxed">
                        You are about to revoke <span className="text-red-600 bg-red-50 px-1 rounded">{revokePrompt.actionType === 'ROLE' ? 'all system access' : `the "${revokePrompt.permissionKey}" clearance`}</span> for this officer. By command directive, you must state an official operational reason to proceed.
                    </p>
                    <textarea 
                        value={revokePrompt.reason}
                        onChange={(e) => setRevokePrompt({...revokePrompt, reason: e.target.value})}
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