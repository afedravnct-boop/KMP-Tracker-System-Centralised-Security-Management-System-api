// src/helpers.js

export const stripHtmlTags = (str) => {
  if (!str) return '';
  return str.toString().replace(/<[^>]*>?/gm, '');
};

export const isStationEquivalent = (statA, statB) => {
  const a = stripHtmlTags(statA || '').trim().toUpperCase();
  const b = stripHtmlTags(statB || '').trim().toUpperCase();
  if (!a || !b) return false;
  if (a === b) return true;
  const cleanA = a.replace(/(\s+HEADQUARTERS|\s+HQ)$/, '');
  const cleanB = b.replace(/(\s+HEADQUARTERS|\s+HQ)$/, '');
  return cleanA === cleanB && cleanA.length > 0;
};

export const checkClearance = (currentUser, permissionKey, defaultRoleAccess = true) => {
  if (!currentUser) return false;
  if (currentUser.role === 'SUPER_ADMIN') return true;

  const perms = currentUser.permissions || {};
  if (perms.global_observer === true || perms.view_global_roster === true || perms.global_open === true) {
    return true;
  }
  if (perms[permissionKey] === false) {
    return false;
  }
  if (perms[permissionKey] === true) {
    return true;
  }
  return Boolean(defaultRoleAccess);
};

export const calculateGrandTotals = (allSubmissions, currentUser, filterRegion, filterStation) => {
  const scopedSubmissions = (Array.isArray(allSubmissions) ? allSubmissions : []).filter(entry => {
    if (entry.is_hq_grand_total || isStationEquivalent(entry.station, 'HEADQUARTERS GENERAL TOTAL')) {
      return true;
    }
    if (filterRegion && filterRegion !== 'ALL REGIONS' && entry.region !== filterRegion) return false;
    if (filterStation && filterStation !== 'ALL STATIONS') {
        if (!isStationEquivalent(entry.station, filterStation)) return false;
    }
    return true;
  });

  const calculatedStationSum = scopedSubmissions.reduce((sum, entry) => {
    if (entry.is_hq_grand_total || isStationEquivalent(entry.station, 'HEADQUARTERS GENERAL TOTAL')) return sum;
    return sum + (Number(entry.total_value || entry.count || entry.amount || entry.daily_lock_up) || 0);
  }, 0);

  const hqEntry = scopedSubmissions.find(entry => entry.is_hq_grand_total || isStationEquivalent(entry.station, 'HEADQUARTERS GENERAL TOTAL'));
  const hqEnteredTotal = hqEntry ? (Number(hqEntry.total_value || hqEntry.count || hqEntry.amount || hqEntry.daily_lock_up) || 0) : null;

  return {
    displayTotal: hqEnteredTotal !== null ? hqEnteredTotal : calculatedStationSum,
    stationSum: calculatedStationSum,
    hqTotal: hqEnteredTotal,
    isReconciled: hqEnteredTotal === null || hqEnteredTotal === calculatedStationSum
  };
};

export const canViewGlobalJurisdiction = (user) => {
  if (!user) return false;
  const userRole = (user.role || '').toUpperCase();
  const userPos = (user.position || '').toUpperCase();
  const userReg = (user.region || '').trim().toUpperCase();
  if (['SUPER_ADMIN', 'ADMIN', 'ASSISTANT_SUPER_ADMIN'].includes(userRole)) return true;
  if (['KMP COMMANDER', 'DEPUTY KMP COMMANDER', 'KMP ADMIN OFFICER'].includes(userPos)) return true;
  if (['KMP HEADQUARTERS', 'POLICE HEADQUARTERS'].includes(userReg)) return true;
  const perms = user.permissions || {};
  return perms.view_global_roster === true || perms.global_observer === true || perms.global_open === true;
};

export const formatEATDateTime = (dateStr) => {
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