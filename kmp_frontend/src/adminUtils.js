// 🟢 UTILITY MOVED HERE TO BREAK CIRCULAR DEPENDENCY
export const stripHtmlTags = (str) => {
  if (!str) return '';
  return str.toString().replace(/<[^>]*>?/gm, '');
};

export const REGIONAL_HIERARCHY = {
  "KMP NORTH": ["KAWEMPE", "KAKIRI", "KASANGATI", "MATUGGA", "NANSANA", "OLD KAMPALA", "WAKISO", "WANDEGEYA"],
  "KMP EAST": ["JINJA ROAD", "KIRA", "KIRA DIV", "KIRA ROAD", "MUKONO", "NAGGALAMA", "SEETA"],
  "KMP SOUTH": ["NATEETE", "CPS KAMPALA", "PARLIAMENT", "ENTEBBE", "KABALAGALA", "KAJJANSI", "KASENYI", "KATWE", "KYENGERA", "NSANGI"],
  "KMP HEADQUARTERS": ["KMP HEADQUARTERS", "FLYING SQUAD", "CRIME INTELLIGENCE"],
  "POLICE HEADQUARTERS": ["NAGURU"]
};

export const TOP_TIER_ROLES = ['SUPER_ADMIN', 'ASSISTANT_SUPER_ADMIN', 'SYSTEM_ADMIN'];

export const getRoleWeight = (role) => {
  if (role === 'SUPER_ADMIN') return 100;
  if (role === 'ASSISTANT_SUPER_ADMIN') return 90;
  if (role === 'SYSTEM_ADMIN') return 80;
  if (role === 'ADMIN_USER' || role === 'ADMIN' || role === 'RPC') return 70;
  if (role === 'DIVISION_ADMIN') return 60; 
  if (role === 'STATION_ADMIN') return 50;  
  if (role === 'USER') return 10;
  return 0; 
};

export const canModifyUser = (currentUser, targetUser) => {
  if (!currentUser || !targetUser) return false;
  if (currentUser.role === 'SUPER_ADMIN') return true; 
  if (currentUser.fnum === targetUser.fnum) return false; 
  
  const currWeight = getRoleWeight(currentUser.role);
  const targetWeight = getRoleWeight(targetUser.role);
  
  if (currWeight <= targetWeight) return false; 
  if (currentUser.role === 'ASSISTANT_SUPER_ADMIN') return true; 
  
  return currentUser.region === targetUser.region; 
};

export const grantExpressAccess = (role, currentPerms) => {
  let newPerms = { ...(currentPerms || {}) };
  
  const baseModules = ['acc_home', 'acc_profile', 'acc_comms', 'acc_crime', 'acc_ops', 'acc_stories', 'acc_documents'];
  const adminModules = ['acc_est', 'acc_analytics', 'acc_hr', 'acc_ledgers'];
  const topModules = ['acc_approvals', 'acc_consolidated', 'acc_roster'];

  if (role !== 'REVOKED') {
      baseModules.forEach(key => {
          if (!newPerms?.super_admin_locks?.[key]) newPerms[key] = true;
      });
  }

  if (['STATION_ADMIN', 'DIVISION_ADMIN', 'ADMIN_USER', 'ADMIN', 'RPC', 'SYSTEM_ADMIN', 'ASSISTANT_SUPER_ADMIN'].includes(role)) {
      adminModules.forEach(key => {
          if (!newPerms?.super_admin_locks?.[key]) newPerms[key] = true;
      });
  }

  if (['SYSTEM_ADMIN', 'ASSISTANT_SUPER_ADMIN'].includes(role)) {
      topModules.forEach(key => {
          if (!newPerms?.super_admin_locks?.[key]) newPerms[key] = true;
      });
  }

  if (role === 'ASSISTANT_SUPER_ADMIN') {
      if (!newPerms?.super_admin_locks?.view_global_roster) newPerms.view_global_roster = true;
      if (!newPerms?.super_admin_locks?.export_data) newPerms.export_data = true;
  }
  
  return newPerms;
};

export const CLEARANCE_MATRIX_COLS = [
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

export const formatOfficerHeader = (user) => {
  const fnum = stripHtmlTags(user.fnum || user.f_num || 'NO-FNUM');
  const rank = stripHtmlTags(user.rank || 'OFFICER');
  const name = stripHtmlTags(user.name || 'UNKNOWN');
  return `${fnum} ${rank} ${name}`;
};