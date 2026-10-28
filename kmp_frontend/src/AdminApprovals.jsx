// src/components/AdminApprovals.jsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Shield, CheckCircle, AlertTriangle, X, Lock, Unlock, 
  Users, RefreshCw, KeyRound, UserCheck, FileText, Globe, CheckSquare, Square, Loader2, 
  Eye, XCircle, UserPlus, Camera, Filter, ArrowRight, Power, Search, Award, Trash2, Clock, Send, History, Activity
} from 'lucide-react';
import { stripHtmlTags } from './App';
import { authFetch, hasValidSession } from './api';

import { 
  TOP_TIER_ROLES, getRoleWeight, canModifyUser, 
  grantExpressAccess, CLEARANCE_MATRIX_COLS, formatOfficerHeader 
} from './adminUtils';

import { 
  HRModificationModal, LockdownMatrixModal, RevocationModal, ToggleSwitch 
} from './AdminModals';

const REGIONAL_HIERARCHY = {
  "KMP NORTH": ["KMP NORTH HEADQUARTERS", "KAWEMPE", "KAKIRI", "KASANGATI", "MATUGGA", "NANSANA", "OLD KAMPALA", "WAKISO", "WANDEGEYA"],
  "KMP EAST": ["KMP EAST HEADQUARTERS", "JINJA ROAD", "KIRA", "KIRA DIV", "KIRA ROAD", "MUKONO", "NAGGALAMA", "SEETA"],
  "KMP SOUTH": ["KMP SOUTH HEADQUARTERS", "NATEETE", "CPS KAMPALA", "PARLIAMENT", "ENTEBBE", "KABALAGALA", "KAJJANSI", "KASENYI", "KATWE", "KYENGERA", "NSANGI"],
  "KMP HEADQUARTERS": ["KMP HEADQUARTERS", "FLYING SQUAD", "CRIME INTELLIGENCE"],
  "POLICE HEADQUARTERS": ["NAGURU"]
};

const isStationEquivalent = (statA, statB) => {
  const a = stripHtmlTags(statA || '').trim().toUpperCase();
  const b = stripHtmlTags(statB || '').trim().toUpperCase();
  if (!a || !b) return false;
  if (a === b) return true;
  const cleanA = a.replace(/(\s+HEADQUARTERS|\s+HQ)$/, '');
  const cleanB = b.replace(/(\s+HEADQUARTERS|\s+HQ)$/, '');
  return cleanA === cleanB && cleanA.length > 0;
};

const SignupDossierModal = ({ user, onClose, isProcessingAction, handleRejectUser, handleApproveUser, handleRegrantAccess, handlePermanentDelete, isSuperAdmin, isReadOnlyObserver }) => {
  if (!user) return null;
  const isRevoked = user.role === 'REVOKED' || user.is_approved === false;

  return (
    <div className="fixed inset-0 bg-black/80 z-[99999] flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl text-white">
        <div className="bg-slate-950 px-6 py-4 flex justify-between items-center border-b border-slate-800">
          <h3 className="font-extrabold text-sm uppercase tracking-wider flex items-center">
            📋 Officer Dossier — {formatOfficerHeader(user)}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white cursor-pointer"><X size={18}/></button>
        </div>
        
        <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto custom-scrollbar text-xs">
          <div className="flex items-center space-x-4 bg-slate-800/80 p-4 rounded-xl border border-slate-700">
            {user.profile_photo_path ? (
              <img src={user.profile_photo_path} alt="Mugshot" className="w-16 h-16 rounded-full object-cover border-2 border-blue-500 shadow-md shrink-0" />
            ) : (
              <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center font-bold text-2xl shrink-0">{user.name?.charAt(0) || 'U'}</div>
            )}
            <div>
              <h4 className="text-sm font-extrabold uppercase">{user.rank} {user.name}</h4>
              <p className="text-blue-400 font-mono text-xs mt-0.5">F/NO: {user.fnum} | IPPS: {user.ipps || 'N/A'}</p>
              <p className="text-slate-400 text-[11px] mt-0.5">Role Tier: <span className="text-yellow-400 font-bold uppercase">{user.role}</span></p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 bg-slate-800/40 p-4 rounded-xl border border-slate-700">
            <div><span className="text-slate-400 block text-[10px] uppercase font-bold">NIN</span><span className="font-mono font-bold">{user.nin || 'N/A'}</span></div>
            <div><span className="text-slate-400 block text-[10px] uppercase font-bold">Gender</span><span className="font-bold">{user.sex || 'MALE'}</span></div>
            <div><span className="text-slate-400 block text-[10px] uppercase font-bold">Station / Region</span><span className="font-bold text-blue-300">{user.station} / {user.region}</span></div>
            <div><span className="text-slate-400 block text-[10px] uppercase font-bold">Position</span><span className="font-bold">{user.position || 'N/A'}</span></div>
            <div><span className="text-slate-400 block text-[10px] uppercase font-bold">Email</span><span className="font-bold">{user.email || 'N/A'}</span></div>
            <div><span className="text-slate-400 block text-[10px] uppercase font-bold">Contact Phone</span><span className="font-bold">{user.phone || 'N/A'}</span></div>
          </div>
        </div>

        <div className="bg-slate-950 px-6 py-4 border-t border-slate-800 flex justify-end space-x-3">
          <button onClick={onClose} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-bold text-xs cursor-pointer">Close Dossier</button>
          {!isReadOnlyObserver && (
            isRevoked ? (
              <>
                <button onClick={() => { handleRegrantAccess(user.fnum, user.name); onClose(); }} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs cursor-pointer flex items-center">
                  <Unlock size={14} className="mr-1.5"/> Restore Access
                </button>
                {isSuperAdmin && (
                  <button onClick={() => { handlePermanentDelete(user.fnum, user.name); onClose(); }} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold text-xs cursor-pointer flex items-center">
                    <Trash2 size={14} className="mr-1.5"/> Purge Record
                  </button>
                )}
              </>
            ) : (
              user.is_approved === false ? (
                <>
                  <button onClick={() => handleRejectUser(user)} disabled={isProcessingAction} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold text-xs cursor-pointer">Reject</button>
                  <button onClick={() => handleApproveUser(user)} disabled={isProcessingAction} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs cursor-pointer">Approve Authorization</button>
                </>
              ) : null
            )
          )}
        </div>
      </div>
    </div>
  );
};

const TransferDossierModal = ({ req, onClose, handleReviewRequest, isReadOnlyObserver }) => {
  if (!req) return null;
  return (
    <div className="fixed inset-0 bg-black/80 z-[99999] flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl text-white">
        <div className="bg-slate-950 px-6 py-4 flex justify-between items-center border-b border-slate-800">
          <h3 className="font-extrabold text-sm uppercase tracking-wider flex items-center">
            🔄 HR Transfer & History Trail — {formatOfficerHeader({ fnum: req.fnum, rank: req.current_rank, name: req.current_name })}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white cursor-pointer"><X size={18}/></button>
        </div>
        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto custom-scrollbar text-xs">
          <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 text-[11px]">
            <div className="flex items-center text-slate-300"><Clock size={14} className="mr-1.5 text-amber-400" /><span>Initiated On: <strong className="text-white font-mono">{req.created_at || 'N/A'}</strong></span></div>
            <div className="flex items-center text-slate-300"><Shield size={14} className="mr-1.5 text-blue-400" /><span>Review Status: <strong className="text-yellow-400 uppercase">{req.status || 'PENDING'}</strong></span></div>
            {req.reviewed_by && (
              <div className="w-full pt-2 sm:pt-0 sm:w-auto border-t sm:border-t-0 border-slate-800 text-slate-300"><span>Approved By: <strong className="text-emerald-400">{req.reviewed_by}</strong> ({req.reviewed_at || 'Recorded'})</span></div>
            )}
          </div>
          <div>
            <h4 className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider mb-2">Previous Baseline Deployment (Origin)</h4>
            <div className="grid grid-cols-2 gap-4 bg-slate-800/60 p-4 rounded-xl border border-slate-700">
              <div><span className="text-slate-400 block text-[10px] uppercase font-bold">Force Number (F/No)</span><span className="font-mono font-bold text-sm text-blue-400">{req.fnum}</span></div>
              <div><span className="text-slate-400 block text-[10px] uppercase font-bold">Officer Name</span><span className="font-bold text-sm">{req.current_name || 'N/A'}</span></div>
              <div><span className="text-slate-400 block text-[10px] uppercase font-bold">Officer Rank</span><span className="font-bold text-sm">{req.current_rank || 'N/A'}</span></div>
              <div><span className="text-slate-400 block text-[10px] uppercase font-bold">Origin Station / Region</span><span className="font-bold">{req.current_station || 'N/A'} / {req.current_region || 'N/A'}</span></div>
            </div>
          </div>
          <div>
            <h4 className="text-[11px] font-extrabold text-amber-400 uppercase tracking-wider mb-2">Requested Deployment Changes (Destination)</h4>
            <div className="grid grid-cols-2 gap-4 bg-amber-950/20 p-4 rounded-xl border border-amber-600/30">
              <div><span className="text-amber-400/70 block text-[10px] uppercase font-bold">Target Force No.</span><span className="font-mono font-bold text-sm text-amber-300">{req.requested_fnum || req.fnum}</span></div>
              <div><span className="text-amber-400/70 block text-[10px] uppercase font-bold">Target Name</span><span className="font-bold text-sm">{req.requested_name || req.current_name || 'N/A'}</span></div>
              <div><span className="text-amber-400/70 block text-[10px] uppercase font-bold">Target Rank</span><span className="font-bold text-sm">{req.requested_rank || req.current_rank || 'N/A'}</span></div>
              <div><span className="text-amber-400/70 block text-[10px] uppercase font-bold">Target Station / Region</span><span className="font-bold text-amber-200">{req.requested_station || 'N/A'} / {req.requested_region || 'N/A'}</span></div>
            </div>
          </div>
        </div>
        <div className="bg-slate-950 px-6 py-4 border-t border-slate-800 flex justify-end space-x-3">
          <button onClick={onClose} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-bold text-xs cursor-pointer">Close Dossier</button>
          {!isReadOnlyObserver && req.status !== 'APPROVED' && (
            <>
              <button onClick={() => { handleReviewRequest(req.id || req.sn, "REJECTED"); onClose(); }} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold text-xs cursor-pointer">Reject Transfer</button>
              <button onClick={() => { handleReviewRequest(req.id || req.sn, "APPROVED"); onClose(); }} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs cursor-pointer">Approve Transfer</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const BriefingPreviewModal = ({ isOpen, onClose, onDispatch, isDispatching }) => {
  const [briefType, setBriefType] = useState("ALL");
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 z-[99999] flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl text-white">
        <div className="bg-slate-950 px-6 py-4 border-b border-slate-800 flex justify-between items-center">
          <h3 className="font-extrabold uppercase flex items-center text-blue-400 tracking-wider">
            <Send className="w-4 h-4 mr-2" /> Dispatch Tactical Briefing
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={18}/></button>
        </div>
        <div className="p-6 space-y-5">
          <p className="text-xs text-slate-300 leading-relaxed">
            This action will immediately compile and dispatch filtered Situation Reports (SITREPs) to all active commanders via email.
          </p>
          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1.5">Select Briefing Focus</label>
            <select 
              value={briefType} 
              onChange={e => setBriefType(e.target.value)} 
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-sm font-bold text-white outline-none focus:border-blue-500 cursor-pointer"
            >
              <option value="ALL">General Matrix (All Crimes & Stats)</option>
              <option value="ROBBERIES">Robberies & Aggravated Offences Only</option>
              <option value="AGRIC_CRIMES">Agricultural Crimes Only</option>
              <option value="SUDDEN_DEATHS">Sudden Deaths & Homicides Only</option>
              <option value="ARRESTS">Lock-ups & Arrests Matrix Only</option>
            </select>
          </div>
          <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700 shadow-inner">
            <h4 className="text-[10px] uppercase font-black text-amber-400 mb-2 tracking-wider">Email Dispatch Preview</h4>
            <div className="text-xs text-slate-300 font-mono space-y-2">
              <p><strong className="text-white">Subject:</strong> {
                briefType === 'ALL' ? 'Weekly Command Briefing & Situation Report' : 
                briefType === 'ROBBERIES' ? 'TACTICAL ALERT: Robberies & Aggravated Offences Report' :
                briefType === 'AGRIC_CRIMES' ? 'TACTICAL ALERT: Agricultural Crimes Report' :
                briefType === 'SUDDEN_DEATHS' ? 'TACTICAL ALERT: Homicides & Sudden Deaths Report' :
                'TACTICAL ALERT: Lock-up & Arrests Summary'
              }</p>
              <hr className="border-slate-700 my-2" />
              <p className="text-emerald-400 leading-relaxed">
                DISPATCH ORIGIN: Manually triggered by YOU. (The automated Monday dispatch will remain distinct).
              </p>
            </div>
          </div>
        </div>
        <div className="bg-slate-950 px-6 py-4 flex justify-end space-x-3 border-t border-slate-800">
          <button onClick={onClose} disabled={isDispatching} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-bold text-xs cursor-pointer transition-colors">Cancel</button>
          <button onClick={() => onDispatch(briefType)} disabled={isDispatching} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs flex items-center cursor-pointer shadow-lg transition-colors">
            {isDispatching ? <Loader2 className="w-4 h-4 mr-2 animate-spin"/> : <Send className="w-4 h-4 mr-2"/>}
            Confirm & Dispatch
          </button>
        </div>
      </div>
    </div>
  );
};

const UserClearanceDossierModal = ({ user, onClose, currentUser, onUpdatePermissions }) => {
  if (!user) return null;

  const userPerms = user.permissions || {};
  const auditHistory = userPerms._audit_history || [];
  const clearanceLocks = userPerms._clearance_locks || {};

  const actorFnum = (currentUser?.fnum || "").trim().toUpperCase();
  const isPrincipalSuperAdmin = actorFnum === "A/2408" || currentUser?.role === "SUPER_ADMIN";

  const handleToggleBox = (permKey, currentVal) => {
    const lockInfo = clearanceLocks[permKey];
    if (lockInfo && lockInfo.revoked_by_fnum?.includes("A/2408") && !isPrincipalSuperAdmin) {
      alert("Security Restriction: This clearance was revoked by Principal Super Admin A/2408. Only A/2408 can reinstate it.");
      return;
    }

    if (onUpdatePermissions) {
      onUpdatePermissions(user.fnum, permKey, !currentVal);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[300] flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full overflow-hidden border border-slate-300 flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-150 text-slate-900">
        <div className="bg-slate-900 text-white p-4 px-6 flex justify-between items-center shrink-0">
          <h3 className="font-extrabold text-xs uppercase tracking-wider flex items-center">
            <Shield size={16} className="text-emerald-400 mr-2"/> Officer Clearance Dossier & Administrative Audit Trail
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white cursor-pointer"><X size={18}/></button>
        </div>

        <div className="p-6 overflow-y-auto space-y-6 custom-scrollbar flex-1 bg-slate-50 text-xs">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="w-14 h-14 rounded-full bg-slate-100 border-2 border-emerald-500 overflow-hidden shrink-0 flex items-center justify-center shadow-sm">
                {user.profile_photo_path ? (
                  <img src={user.profile_photo_path} alt="Officer" className="w-full h-full object-cover" />
                ) : (
                  <span className="font-black text-lg text-slate-600">{user.name?.charAt(0) || 'U'}</span>
                )}
              </div>
              <div>
                <h4 className="text-sm font-black text-slate-900 uppercase">
                  {user.fnum} {user.rank} {user.name}
                </h4>
                <p className="text-xs font-mono font-bold text-emerald-700">IPPS: {user.ipps || 'N/A'} {user.nin ? `| NIN: ${user.nin}` : ''}</p>
                <p className="text-[11px] text-slate-500 uppercase font-semibold">{user.station} ({user.region})</p>
              </div>
            </div>
            <div className="text-right">
              <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 font-extrabold rounded-lg text-[10px] uppercase">
                {user.role || 'USER'}
              </span>
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-3">
            <h4 className="font-extrabold text-slate-800 uppercase tracking-wider flex items-center text-xs border-b pb-2">
              <Lock size={14} className="mr-1.5 text-blue-600"/> Granular Access Clearances Matrix
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-1">
              {CLEARANCE_MATRIX_COLS.map((col) => {
                const key = col.key;
                const label = col.label;
                const isChecked = userPerms[key] !== false ? (['SUPER_ADMIN', 'ADMIN'].includes(user.role) || Boolean(userPerms[key])) : false;
                
                const lockInfo = clearanceLocks[key];
                const isLockedByApex = lockInfo && lockInfo.revoked_by_fnum?.includes("A/2408");

                const isSelf = user.fnum === currentUser?.fnum;
                const isObserverCol = key === 'global_observer';
                const isOpenCol = key === 'global_open';
                const isMutuallyDisabled = (isObserverCol && Boolean(userPerms.global_open)) || (isOpenCol && Boolean(userPerms.global_observer));
                const isDisabled = isSelf || isMutuallyDisabled || (isOpenCol && !isPrincipalSuperAdmin);

                return (
                  <div 
                    key={key} 
                    onClick={() => { if (!isDisabled) handleToggleBox(key, isChecked); }}
                    className={`p-3 rounded-xl border flex flex-col justify-between transition-all ${
                      isDisabled 
                        ? 'opacity-60 bg-slate-100 border-slate-200 cursor-not-allowed' 
                        : 'cursor-pointer hover:border-slate-300'
                    } ${
                      isChecked && !isDisabled
                        ? 'bg-emerald-50 border-emerald-300 shadow-xs' 
                        : !isDisabled ? 'bg-slate-50 border-slate-200' : ''
                    }`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-[10px] font-black text-slate-700 leading-tight">{label}</span>
                      <input 
                        type="checkbox" 
                        checked={isChecked} 
                        disabled={isDisabled}
                        onChange={() => {}} 
                        className={`rounded text-emerald-600 h-3.5 w-3.5 ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer focus:ring-emerald-500'}`} 
                      />
                    </div>
                    <div className="flex items-center justify-between pt-1 border-t border-slate-200/60 text-[9px]">
                      <span className={isChecked ? 'text-emerald-700 font-bold' : 'text-slate-400 font-medium'}>
                        {isChecked ? 'GRANTED' : 'REVOKED'}
                      </span>
                      {isLockedByApex && <Lock size={10} className="text-red-600" title="Locked by A/2408" />}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-3">
            <h4 className="font-extrabold text-slate-800 uppercase tracking-wider flex items-center text-xs border-b pb-2">
              <History size={14} className="mr-1.5 text-indigo-600"/> Administrative History & Audit Trail Timeline
            </h4>
            
            <div className="space-y-2.5 max-h-60 overflow-y-auto custom-scrollbar pr-2">
              {auditHistory.length === 0 ? (
                <div className="text-center py-6 text-slate-400 italic">No historical audit events logged for this officer yet.</div>
              ) : (
                auditHistory.map((event, idx) => (
                  <div key={idx} className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex items-start justify-between">
                    <div className="space-y-0.5">
                      <div className="font-bold text-slate-900 uppercase flex items-center">
                        <Activity size={12} className="mr-1.5 text-blue-600" /> {event.action}
                      </div>
                      <div className="text-[11px] text-slate-600 font-medium">{event.details}</div>
                      <div className="text-[9px] text-slate-400 font-mono">Actor FNum: {event.actor}</div>
                    </div>
                    <span className="text-[10px] font-bold text-slate-500 bg-white px-2 py-1 rounded border border-slate-200 shrink-0">
                      {event.timestamp}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="bg-white p-4 border-t border-slate-200 flex justify-end shrink-0">
          <button type="button" onClick={onClose} className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition cursor-pointer">
            Close Dossier
          </button>
        </div>
      </div>
    </div>
  );
};

const AdminApprovals = ({ currentUser, canViewGlobal = false, setCurrentPage, initialTab }) => {
  // 🟢 FIXED: Properly initialize with null to start in a neutral state, honoring initialTab if passed
  const [activeTab, setActiveTab] = useState(initialTab ? initialTab.toLowerCase() : null);
  const [matrixView, setMatrixView] = useState('ACTIVE');
   
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
  const [selectedClearanceUser, setSelectedClearanceUser] = useState(null);
  const [selectedModRequest, setSelectedModRequest] = useState(null);
  const [viewingPhotoModal, setViewingPhotoModal] = useState(null);
  const [isProcessingAction, setIsProcessingAction] = useState(false);
  
  const [isTriggeringBriefs, setIsTriggeringBriefs] = useState(false);
  const [showBriefingModal, setShowBriefingModal] = useState(false);

  const [isDbKillActive, setIsDbKillActive] = useState(false);
  const [loadingKillSwitch, setLoadingKillSwitch] = useState(false);
  const [activeLockdownCount, setActiveLockdownCount] = useState(0);
  const [showLockdownModal, setShowLockdownModal] = useState(false);
  const [lockdownRegionFilter, setLockdownRegionFilter] = useState("KMP NORTH");
  const [lockdownData, setLockdownData] = useState({ system: false, regions: {}, stations: {} });
   
  const [searchTerm, setSearchTerm] = useState('');
  const [showDelegationModal, setShowDelegationModal] = useState(false);
  const [delegationSearchTerm, setDelegationSearchTerm] = useState('');
  const [revokePrompt, setRevokePrompt] = useState({ isOpen: false, fnum: null, actionType: null, targetValue: null, permissionKey: null, reason: '' });

  // 🟢 Ensure initialTab changes are captured
  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab.toLowerCase());
    }
  }, [initialTab]);

  const activeLockdownSummary = useMemo(() => {
    let list = [];
    if (lockdownData.system) list.push("🚨 SYSTEM-WIDE FULL LOCKDOWN");
    Object.keys(lockdownData.regions).forEach(r => { if (lockdownData.regions[r]) list.push(`⚠️ REGION: ${r}`); });
    Object.keys(lockdownData.stations).forEach(s => { if (lockdownData.stations[s]) list.push(`🔒 STATION: ${s}`); });
    return list;
  }, [lockdownData]);

  const userRoleClean = stripHtmlTags(currentUser?.role || '').toUpperCase();
  const userPosClean = stripHtmlTags(currentUser?.position || '').toUpperCase();
  const userRegClean = stripHtmlTags(currentUser?.region || '').toUpperCase();
  const isSuperAdmin = userRoleClean === 'SUPER_ADMIN';

  const isReadOnlyObserver = currentUser?.permissions?.global_observer === true && !currentUser?.permissions?.global_open && !isSuperAdmin;

  const hasMasterOverride = useMemo(() => {
    const p = currentUser?.permissions || {};
    return isSuperAdmin || p.global_open === true || p.bypass_jurisdiction === true;
  }, [currentUser, isSuperAdmin]);

  const isGlobalTier = hasMasterOverride || isSuperAdmin || 
    userRoleClean === 'ASSISTANT_SUPER_ADMIN' ||
    ['KMP COMMANDER', 'DEPUTY KMP COMMANDER', 'KMP ADMIN OFFICER'].includes(userPosClean) ||
    currentUser?.permissions?.view_global_roster === true;

  const isRPC = ['RPC', 'DEPUTY_RPC'].includes(userRoleClean) || 
    (userRoleClean === 'SYSTEM_MANAGER' && !isGlobalTier) ||
    userPosClean.includes('RPC') || 
    userPosClean.includes('REGIONAL POLICE COMMANDER');

  const isTopCommand = isGlobalTier || isRPC || 
    ['ASSISTANT_SYSTEM_MANAGER', 'REGIONAL_ADMIN'].includes(userRoleClean) || 
    userPosClean.includes('HR');

  const hasDelegatedApprovalPower = currentUser?.permissions?.can_approve === true || currentUser?.permissions?.system_admin === true;
  const canAccessApprovalsPage = isTopCommand || hasDelegatedApprovalPower || currentUser?.permissions?.acc_approvals === true || isReadOnlyObserver;
  const canToggleKillSwitch = isSuperAdmin || userRoleClean === 'ASSISTANT_SUPER_ADMIN' || hasDelegatedApprovalPower || currentUser?.permissions?.ai_hr_access === true;
  const canViewGlobalActive = canViewGlobal || isGlobalTier || isReadOnlyObserver;
  
  const canTriggerBriefs = 
    ['SUPER_ADMIN', 'ASSISTANT_SUPER_ADMIN', 'SYSTEM_MANAGER', 'ASSISTANT_SYSTEM_MANAGER'].includes(userRoleClean) ||
    ['PRINCIPAL SUPER ADMIN', 'SUPER ADMIN', 'ASSISTANT SUPER ADMIN', 'SYSTEM MANAGER', 'ASSISTANT SYSTEM MANAGER', 'KMP COMMANDER', 'DEPUTY KMP COMMANDER', 'KMP ADMIN OFFICER', 'KMP CID COMMANDER', 'KMP CI COMMANDER', 'CI COMMANDER (KMP)', 'CID COMMANDER (KMP)'].some(pos => userPosClean.includes(pos)) ||
    userPosClean.includes('KMP COMMANDER') || userPosClean.includes('KMP CI') || userPosClean.includes('KMP CID');

  const [filterRegion, setFilterRegion] = useState(canViewGlobalActive ? 'ALL REGIONS' : userRegClean);
  const [filterStation, setFilterStation] = useState('ALL STATIONS');

  useEffect(() => {
    if (canViewGlobalActive) setFilterRegion('ALL REGIONS');
    else if (isRPC || isTopCommand) setFilterRegion(userRegClean);
  }, [canViewGlobalActive, isRPC, isTopCommand, userRegClean]);

  const canControlTargetUser = useCallback((targetUser) => {
    if (isReadOnlyObserver || !targetUser) return false;
    if (hasMasterOverride) return true; 

    const targetRole = (targetUser.role || '').toUpperCase();
    if (targetRole === 'SUPER_ADMIN' && !isSuperAdmin) return false; 

    const tierWeight = {
      'SUPER_ADMIN': 100, 'ASSISTANT_SUPER_ADMIN': 90, 'SYSTEM_MANAGER': 80, 'ASSISTANT_SYSTEM_MANAGER': 70, 
      'REGIONAL_ADMIN': 60, 'ASSISTANT_REGIONAL_ADMIN': 50, 'ADMIN_USER': 45, 'DIVISION_ADMIN': 40, 
      'DIVISION_USER': 30, 'STATION_ADMIN': 20, 'STATION_USER': 10, 'USER': 5, 'REVOKED': 0
    };

    if ((tierWeight[userRoleClean] || 0) <= (tierWeight[targetRole] || 0)) return false; 

    const belongsToMyRegion = targetUser.region === currentUser?.region || 
      (REGIONAL_HIERARCHY[currentUser?.region] && REGIONAL_HIERARCHY[currentUser?.region].some(s => isStationEquivalent(s, targetUser.station)));

    if (!isGlobalTier && !belongsToMyRegion) return false;
    return true;
  }, [hasMasterOverride, isSuperAdmin, userRoleClean, isGlobalTier, currentUser, isReadOnlyObserver]);

  const handleManualBriefDispatch = async (briefType) => {
    if (isReadOnlyObserver || !canTriggerBriefs) {
      alert("SECURITY RESTRICTION: Clearance denied.");
      return;
    }
    
    setIsTriggeringBriefs(true);
    try {
      const response = await authFetch('/api/v1/admin/trigger-briefs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brief_type: briefType })
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || 'Failed to dispatch briefs.');
      }

      setShowBriefingModal(false);
      alert(`✅ Tactical Briefings (${briefType}) are compiling and dispatching in the background!`);
    } catch (error) {
      console.error('Dispatch Error:', error);
      alert(`❌ Error: ${error.message}`);
    } finally {
      setIsTriggeringBriefs(false);
    }
  };

  const handleKillSwitchToggle = async () => {
    if (isReadOnlyObserver) return alert("SECURITY RESTRICTION: Read-only clearance does not permit toggling the AI database kill switch.");
    setLoadingKillSwitch(true);
    try {
      const res = await authFetch('/api/v1/ai/admin/toggle-db-query', { method: 'POST' });
      if (res && res.ok) {
        const data = await res.json();
        setIsDbKillActive(!data.ai_database_query_enabled);
        alert(data.message);
      } else alert("Failed to toggle AI database kill switch.");
    } catch (err) { alert("Error contacting the server."); } 
    finally { setLoadingKillSwitch(false); }
  };

  const handleToggleLockdown = async (type, name, currentStatus) => {
    if (isReadOnlyObserver) return alert("SECURITY RESTRICTION: Read-only clearance does not permit managing system lockdowns.");
    const isLifting = currentStatus; 
    const actionWord = isLifting ? "LIFT" : "ACTIVATE";
    const rawReason = window.prompt(`State official reason to ${actionWord} lockdown on [${type}: ${name}]:`);
    if (rawReason === null) return;
    const reason = stripHtmlTags(rawReason || (isLifting ? "Command Lockdown Lifted" : "Command Maintenance"));

    try {
      const res = await authFetch('/api/v1/admin/toggle-maintenance', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lockdown_type: type, target_name: name, reason: reason })
      });
      if (res && res.ok) fetchLockdownStatus();
      else alert(`❌ Failed to execute command: ${(await res.json().catch(() => ({}))).detail || 'Server error'}`);
    } catch (err) { alert("❌ Error communicating with the command server."); }
  };

  const handleReviewRequest = async (reqId, actionStatus) => {
    if (isReadOnlyObserver) return alert("Read-only clearance restricts reviewing requests.");
    try {
      const res = await authFetch(`/api/v1/requests/${reqId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: actionStatus })
      });
      if (!res.ok) throw new Error("Failed to process request on server.");
      setModRequests(prev => prev.filter(r => (r.id || r.sn) !== reqId));
      setSelectedModRequest(null); 
      alert(`Request ${actionStatus.toLowerCase()} successfully!`);
    } catch (err) { alert(`Error processing request: ${err.message}`); }
  };

  const handleApproveUser = async (userToApprove, customAssignedRole = 'STATION_ADMIN', customPermissions = {}) => {
    if (isReadOnlyObserver) return alert("Read-only clearance restricts approvals.");
    const cleanFnum = stripHtmlTags(typeof userToApprove === 'object' ? userToApprove.fnum : userToApprove).toUpperCase();
    const cleanIpps = stripHtmlTags(typeof userToApprove === 'object' ? userToApprove.ipps : '').toUpperCase();
    const cleanNin = stripHtmlTags(typeof userToApprove === 'object' ? userToApprove.nin : '').toUpperCase();

    const duplicateExists = allSystemUsers.some(u => {
      const uFnum = (u.fnum || '').toUpperCase();
      const uIpps = (u.ipps || '').toUpperCase();
      const uNin = (u.nin || '').toUpperCase();
      if (uFnum && cleanFnum && uFnum === cleanFnum) return true;
      if (uIpps && cleanIpps && uIpps === cleanIpps) return true;
      if (uNin && cleanNin && uNin === cleanNin) return true;
      return false;
    });

    if (duplicateExists) {
      alert(`⛔ APPROVAL BLOCKED: An existing or revoked account is already using this Force Number, IPPS, or NIN.`);
      return;
    }

    setIsProcessingAction(true);
    try {
      let assignedRole = customAssignedRole;
      const pos = stripHtmlTags(userToApprove.position || '').toUpperCase();
      
      if (pos.includes('KMP COMMANDER') || pos.includes('DEPUTY KMP COMMANDER') || pos === 'KMP ADMIN OFFICER') assignedRole = 'ASSISTANT_SUPER_ADMIN';
      else if (pos.includes('RPC') && !pos.includes('DEPUTY')) assignedRole = 'SYSTEM_MANAGER';
      else if (pos.includes('DEPUTY RPC')) assignedRole = 'ASSISTANT_SYSTEM_MANAGER';
      else if (pos.includes('REGIONAL HR') || pos.includes('REGIONAL ADMIN')) assignedRole = 'REGIONAL_ADMIN';
      else if (pos.includes('DPC') || pos.includes('DIVISION COMMANDER')) assignedRole = 'DIVISION_ADMIN';
      else if (pos.includes('OC STATION')) assignedRole = 'STATION_ADMIN';
      else if (pos.includes('OC CID')) assignedRole = 'ADMIN_USER';
      else if (pos.includes('KMP CID') || pos.includes('KMP CI') || pos.includes('KMP TRAFFIC') || pos.includes('KMP 999') || pos.includes('KMP FFU')) assignedRole = 'SYSTEM_MANAGER'; 

      const isGlobalAssign = ['ASSISTANT_SUPER_ADMIN'].includes(assignedRole) || (assignedRole === 'SYSTEM_MANAGER' && ['KMP HEADQUARTERS', 'POLICE HEADQUARTERS'].includes(userToApprove.region?.toUpperCase()));

      const grantedPermissions = {
        view_nominal_roll: true, upload_hr: true, export_data: true, view_crime_registry: true, log_crime: true, view_lockup: true,
        log_lockup: true, log_daily_lockup: true, view_exhibits: true, log_exhibits: true, view_global_roster: isGlobalAssign, global_open: isGlobalAssign, ...customPermissions
      };

      // 🟢 FIXED: Added '/admin/' prefix
      await authFetch(`/api/v1/admin/users/${encodeURIComponent(cleanFnum.trim())}/access`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, 
        body: JSON.stringify({ role: assignedRole, is_approved: true, permissions: grantedPermissions, station: userToApprove.station, region: userToApprove.region })
      });

      alert(`✅ Success: Access approved for ${cleanFnum}. Tier allocated: ${assignedRole}`);
      setSelectedPendingUser(null);
      fetchPendingUsers();
      fetchAllSystemUsers();
    } catch (err) { alert(`Approval Error: ${err.message}`); } 
    finally { setIsProcessingAction(false); }
  };

  const handleRejectUser = async (userToReject) => {
    if (isReadOnlyObserver) return alert("Read-only clearance restricts rejection.");
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

  const handleRevokeAccessCompletely = async (fnum, name) => {
    if (fnum === 'A/2408') return alert("SECURITY ERROR: Principal Super Admin (A/2408) account cannot be revoked under any circumstances.");
    if (isReadOnlyObserver) return alert("Read-only clearance restricts revocation.");
    const targetUser = allSystemUsers.find(u => u.fnum === fnum);
    if (targetUser && !canControlTargetUser(targetUser)) return alert("SECURITY OVERRIDE DENIED: Cannot revoke higher or equivalent command tier.");

    const rawReason = window.prompt(`State mandatory official reason to COMPLETELY REVOKE access for ${name} (${fnum}):`);
    if (rawReason === null) return;
    const reason = stripHtmlTags(rawReason || "Administrative Access Revocation");

    if (!window.confirm(`⚠️ Are you sure you want to completely deny system access for ${name}?`)) return;

    try {
      const res = await authFetch(`/api/v1/users/${encodeURIComponent(fnum)}/revoke?reason=${encodeURIComponent(reason)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await res.text());
      alert(`✅ Access completely revoked for ${fnum}.`);
      fetchAllSystemUsers(); fetchPendingUsers(); fetchAuditLogs();
    } catch (err) { alert(`Revocation Failed: ${err.message}`); }
  };

  const handlePermanentDelete = async (fnum, name) => {
    if (!isSuperAdmin) return alert("SECURITY RESTRICTION: Only Super Admins can permanently delete accounts.");
    if (!window.confirm(`⚠️ CRITICAL: Permanently erase ${name} (${fnum}) from the master database?`)) return;

    try {
      const res = await authFetch(`/api/v1/users/${encodeURIComponent(fnum)}/permanent-delete`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await res.text());
      alert(`✅ Account ${fnum} permanently purged.`);
      fetchPendingUsers(); fetchAllSystemUsers();
    } catch (err) { alert(`Deletion Failed: ${err.message}`); }
  };

  const handleRegrantAccess = async (fnum, name) => {
    if (isReadOnlyObserver) return alert("Read-only clearance restricts restoration.");
    if (!window.confirm(`⚠️ Are you sure you want to restore system access for ${name} (${fnum})?`)) return;

    setIsProcessingAction(true);
    try {
      const defaultRole = 'STATION_USER';
      const defaultPermissions = { view_nominal_roll: true, view_crime_registry: true, log_crime: true, view_lockup: true, log_lockup: true, log_daily_lockup: true, view_exhibits: true, log_exhibits: true };
      // 🟢 FIXED: Added '/admin/' prefix
      const res = await authFetch(`/api/v1/admin/users/${encodeURIComponent(fnum)}/access`, {
        method: 'PUT', headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: defaultRole, is_approved: true, permissions: defaultPermissions })
      });
      if (!res.ok) throw new Error(await res.text());
      alert(`✅ Access successfully restored for ${fnum}.`);
      fetchAllSystemUsers(); fetchPendingUsers(); fetchAuditLogs();
    } catch (err) { alert(`Restoration Failed: ${err.message}`); } 
    finally { setIsProcessingAction(false); }
  };

  const handleToggleDelegationPower = async (targetUser, givePower) => {
    if (isReadOnlyObserver) return alert("Read-only clearance restricts delegation.");
    if (!isTopCommand) return alert("SECURITY RESTRICTION: Only System Managers, RPCs, and Super Admins can delegate command powers.");
    if (!canControlTargetUser(targetUser)) return alert("SECURITY OVERRIDE DENIED: Insufficient clearance over this command tier.");

    const newPermissions = { ...(targetUser.permissions || {}), can_approve: givePower };
    try {
      const res = await authFetch(`/api/v1/admin/users/${encodeURIComponent(targetUser.fnum)}/access`, {
        method: "PUT", 
        headers: { "Content-Type": "application/json" }, 
        body: JSON.stringify({ role: targetUser.role, permissions: newPermissions })
      });
      if (!res.ok) throw new Error("Failed to update delegation.");
      alert(`✅ Delegation successfully ${givePower ? 'GRANTED' : 'REVOKED'} for ${targetUser.name} (${targetUser.fnum}).`);
      fetchAllSystemUsers();
    } catch (err) { alert(`Delegation Error: ${err.message}`); }
  };

  const handleBulkMatrixAction = async (fnum, setAllToTrue) => {
    if (isReadOnlyObserver) return;
    const cleanFnum = stripHtmlTags(fnum);
    const targetUser = allSystemUsers.find(u => u.fnum === cleanFnum);
    if (!targetUser || !canControlTargetUser(targetUser)) return alert("SECURITY OVERRIDE DENIED: Insufficient clearance.");

    const newPermissions = { ...(targetUser.permissions || {}) };
    CLEARANCE_MATRIX_COLS.forEach(col => { newPermissions[col.key] = setAllToTrue; });
    setAllSystemUsers(allSystemUsers.map(u => u.fnum === cleanFnum ? { ...u, permissions: newPermissions } : u));

    try {
      // 🟢 FIXED: Added '/admin/' prefix
      await authFetch(`/api/v1/admin/users/${encodeURIComponent(cleanFnum.trim())}/access`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role: targetUser.role, permissions: newPermissions })
      });
    } catch (err) { alert(`Bulk Update Failed: ${err.message}`); fetchAllSystemUsers(); }
  };

  const handleToggleEntireColumn = async (permissionKey, shouldEnable) => {
    if (isReadOnlyObserver) return;
    const updatedUsers = allSystemUsers.map(u => {
      const uRole = (u.role || '').toUpperCase();
      if (uRole === 'SUPER_ADMIN' || uRole === 'ASSISTANT_SUPER_ADMIN') return u;
      const p = { ...(u.permissions || {}) };
      p[permissionKey] = shouldEnable;
      return { ...u, permissions: p };
    });
    setAllSystemUsers(updatedUsers);

    try {
      await Promise.all(updatedUsers.map(u => {
        const uRole = (u.role || '').toUpperCase();
        if (uRole === 'SUPER_ADMIN' || uRole === 'ASSISTANT_SUPER_ADMIN') return Promise.resolve();
        // 🟢 FIXED: Added '/admin/' prefix
        return authFetch(`/api/v1/admin/users/${encodeURIComponent(u.fnum.trim())}/access`, {
          method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role: u.role, permissions: u.permissions })
        });
      }));
      alert(`✅ Successfully ${shouldEnable ? 'ENABLED' : 'DISABLED'} column [${permissionKey}] for all eligible officers.`);
    } catch (err) { alert(`Column bulk toggle error: ${err.message}`); fetchAllSystemUsers(); }
  };

  const handleGranularPermissionChange = async (fnum, permissionKey, value) => {
    if (isReadOnlyObserver) return;
    const cleanFnum = stripHtmlTags(fnum);
    const targetUser = allSystemUsers.find(u => u.fnum === cleanFnum);
    if (!targetUser || !canControlTargetUser(targetUser)) return;

    let updatedPermissions = { ...(targetUser.permissions || {}) };
    updatedPermissions[permissionKey] = value;
    setAllSystemUsers(allSystemUsers.map(u => u.fnum === cleanFnum ? { ...u, permissions: updatedPermissions } : u));

    try {
      // 🟢 FIXED: Added '/admin/' prefix
      await authFetch(`/api/v1/admin/users/${encodeURIComponent(cleanFnum.trim())}/access`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role: targetUser.role, permissions: updatedPermissions })
      });
    } catch (err) { alert(`Permission Update Failed: ${err.message}`); fetchAllSystemUsers(); }
  };

  const handleRoleTierChange = async (fnum, newRole) => {
    if (isReadOnlyObserver) return;
    const cleanFnum = stripHtmlTags(fnum);
    const targetUser = allSystemUsers.find(u => u.fnum === cleanFnum);
    if (!targetUser || !canControlTargetUser(targetUser)) return alert("SECURITY OVERRIDE DENIED: Insufficient clearance to alter this tier.");

    const updatedPermissions = grantExpressAccess(newRole, targetUser.permissions || {});
    setAllSystemUsers(allSystemUsers.map(u => u.fnum === cleanFnum ? { ...u, role: newRole, permissions: updatedPermissions } : u));

    try {
      // 🟢 FIXED: Added '/admin/' prefix
      await authFetch(`/api/v1/admin/users/${encodeURIComponent(cleanFnum.trim())}/access`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role: newRole, permissions: updatedPermissions })
      });
    } catch (err) { alert(`Role Update Failed: ${err.message}`); fetchAllSystemUsers(); }
  };

  const handleResetAction = async (reqId, actionStr) => {
    if (isReadOnlyObserver) return;
    try {
      const formData = new URLSearchParams(); formData.append('action', actionStr);
      const response = await authFetch(`/api/v1/admin/execute-reset/${reqId}`, { method: "POST", headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: formData });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail);
      setResetRequests(resetRequests.filter(r => r.id !== reqId));
      alert(actionStr === "APPROVE" ? `Password successfully reset! Key: ${data.new_password}` : "Request rejected.");
    } catch (err) { alert(`Error: ${err.message}`); }
  };

  const handleForcePassword = async (fnum, name) => {
    if (isReadOnlyObserver || !isSuperAdmin) return;
    const newPass = window.prompt(`[SUPER ADMIN OVERRIDE]\nEnter new 6+ character password for ${name} (${fnum}):`);
    if (!newPass || newPass.length < 6) return alert("Password must be at least 6 characters long.");

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

  const fetchLockdownStatus = useCallback(async () => {
    if (!hasValidSession()) return;
    try {
      const res = await authFetch('/api/v1/admin/lockdown/status');
      if (res && res.ok) {
        const data = await res.json();
        let count = 0; let newLockdownData = { system: false, regions: {}, stations: {} };
        if (data.system_lockdown) { count++; newLockdownData.system = true; }
        if (data.active_regions?.length > 0) { count += data.active_regions.length; data.active_regions.forEach(r => newLockdownData.regions[r] = true); }
        if (data.active_stations?.length > 0) { count += data.active_stations.length; data.active_stations.forEach(s => newLockdownData.stations[s] = true); }
        setActiveLockdownCount(count); setLockdownData(newLockdownData);
      }
    } catch (err) { console.error(err); }
  }, []);

  const fetchPendingUsers = useCallback(async () => {
    if (!hasValidSession()) return;
    setLoadingPending(true);
    try {
      const res = await authFetch("/api/v1/admin/pending-users");
      if (res && res.ok) {
        const data = await res.json();
        setRealPendingUsers(Array.isArray(data) ? data.filter(u => isSuperAdmin || u.role !== 'SUPER_ADMIN') : []);
      }
    } catch (err) { 
      setRealPendingUsers([]); 
    } finally { 
      setLoadingPending(false); 
    }
  }, [isSuperAdmin]);

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
      setResetRequests([]); 
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
        setAllSystemUsers(Array.isArray(data) ? data.filter(u => u.fnum !== 'A/2408' && (isSuperAdmin || u.role !== 'SUPER_ADMIN')) : []);
      }
    } catch (err) { 
      setAllSystemUsers([]); 
    } finally { 
      setLoadingUsers(false); 
    }
  }, [isSuperAdmin]);

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
      setModRequests([]); 
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
      setAuditLogs([]); 
    } finally { 
      setLoadingLogs(false); 
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'approvals') fetchPendingUsers();
    else if (activeTab === 'matrix' || activeTab === 'roster') { fetchAllSystemUsers(); fetchAuditLogs(); }
    else if (activeTab === 'requests') fetchModRequests();
    else if (activeTab === 'logs') { fetchAuditLogs(); fetchAllSystemUsers(); }
    else if (activeTab === 'resets') fetchResets();
    fetchLockdownStatus();
  }, [activeTab, fetchPendingUsers, fetchAllSystemUsers, fetchModRequests, fetchAuditLogs, fetchResets, fetchLockdownStatus]);

  const matchesSearch = (item, fields) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return fields.some(field => stripHtmlTags(String(item[field] || '')).toLowerCase().includes(term));
  };

  const filterByRegionStation = (items, itemRegionKey = 'region', itemStationKey = 'station', searchFields = []) => {
    const safeItems = Array.isArray(items) ? items : [];
    return safeItems.filter(item => {
      const itemRegion = stripHtmlTags(item[itemRegionKey] || '').trim().toUpperCase();
      const itemStation = stripHtmlTags(item[itemStationKey] || '').trim().toUpperCase();
      const activeReg = stripHtmlTags(filterRegion || '').trim().toUpperCase();
      const activeStat = stripHtmlTags(filterStation || '').trim().toUpperCase();

      if (canViewGlobalActive && activeReg === 'ALL REGIONS' && activeStat === 'ALL STATIONS') return matchesSearch(item, searchFields);

      const belongsToRegion = activeReg === 'ALL REGIONS' || itemRegion === activeReg || (REGIONAL_HIERARCHY[activeReg] && REGIONAL_HIERARCHY[activeReg].some(s => isStationEquivalent(s, itemStation)));
      if (!belongsToRegion) return false;
      if (activeStat && activeStat !== 'ALL STATIONS' && !isStationEquivalent(itemStation, activeStat)) return false;

      return matchesSearch(item, searchFields);
    });
  };

  const pendingAuthsList = useMemo(() => (Array.isArray(realPendingUsers) ? realPendingUsers : []).filter(u => u.role !== 'REVOKED'), [realPendingUsers]);
  const revokedUsersList = useMemo(() => (Array.isArray(realPendingUsers) ? realPendingUsers : []).filter(u => u.role === 'REVOKED'), [realPendingUsers]);

  const filteredPending = useMemo(() => filterByRegionStation(pendingAuthsList, 'region', 'station', ['fnum', 'name', 'rank', 'station', 'region', 'nin', 'ipps', 'phone', 'email']), [pendingAuthsList, filterRegion, filterStation, canViewGlobalActive, searchTerm]);
  const filteredRevoked = useMemo(() => filterByRegionStation(revokedUsersList, 'region', 'station', ['fnum', 'name', 'rank', 'station', 'region', 'nin', 'ipps', 'phone', 'email']), [revokedUsersList, filterRegion, filterStation, canViewGlobalActive, searchTerm]);
  const filteredRequests = useMemo(() => filterByRegionStation(modRequests, 'current_region', 'current_station', ['fnum', 'current_name', 'current_station', 'current_region', 'requested_station', 'requested_name']), [modRequests, filterRegion, filterStation, canViewGlobalActive, searchTerm]);
  const filteredResets = useMemo(() => filterByRegionStation(resetRequests, 'region', 'station', ['fnum', 'name', 'station', 'region']), [resetRequests, filterRegion, filterStation, canViewGlobalActive, searchTerm]);
  const filteredSystemUsers = useMemo(() => filterByRegionStation(allSystemUsers, 'region', 'station', ['fnum', 'name', 'rank', 'station', 'region', 'ipps', 'phone', 'email', 'role']), [allSystemUsers, filterRegion, filterStation, canViewGlobalActive, searchTerm]);

  const filteredLogs = useMemo(() => {
    const safeLogs = Array.isArray(auditLogs) ? auditLogs : [];
    return safeLogs.filter(log => {
      const logUser = (Array.isArray(allSystemUsers) ? allSystemUsers : []).find(u => u.fnum === log.user_fnum);
      const logRegion = stripHtmlTags(log.region || logUser?.region || '').trim().toUpperCase();
      const logStation = stripHtmlTags(log.station || logUser?.station || '').trim().toUpperCase();
      const activeReg = stripHtmlTags(filterRegion || '').trim().toUpperCase();
      const activeStat = stripHtmlTags(filterStation || '').trim().toUpperCase();

      if (canViewGlobalActive && activeReg === 'ALL REGIONS' && activeStat === 'ALL STATIONS') return matchesSearch(log, ['user_fnum', 'event_type', 'target_user', 'details']);

      const belongsToRegion = activeReg === 'ALL REGIONS' || logRegion === activeReg || (REGIONAL_HIERARCHY[activeReg] && REGIONAL_HIERARCHY[activeReg].some(s => isStationEquivalent(s, logStation)));
      if (!belongsToRegion) return false;
      if (activeStat && activeStat !== 'ALL STATIONS' && !isStationEquivalent(logStation, activeStat)) return false;

      return matchesSearch(log, ['user_fnum', 'event_type', 'target_user', 'details']);
    });
  }, [auditLogs, allSystemUsers, filterRegion, filterStation, canViewGlobalActive, searchTerm]);

  const getRevocationReason = useCallback((fnum) => {
    const cleanF = String(fnum || '').trim().toUpperCase();
    const safeLogs = Array.isArray(auditLogs) ? auditLogs : [];
    const log = safeLogs.find(l => (l.event_type === 'REVOKE_USER_ACCESS' || l.event_type === 'REVOCATION') && (String(l.target_user || '').trim().toUpperCase() === cleanF || String(l.details || '').toUpperCase().includes(cleanF)));
    if (log && log.details) {
      const match = log.details.match(/Reason:\s*(.*)/i) || log.details.match(/Remarks:\s*(.*)/i);
      if (match && match[1]) return match[1].trim();
      return log.details;
    }
    return 'Administrative Revocation';
  }, [auditLogs]);

  return (
    <div className="dark p-4 max-w-[1800px] mx-auto space-y-6 relative z-10 animate-in fade-in duration-300 text-slate-100">
      
      <div className="bg-slate-900 dark:bg-slate-950 text-white px-6 py-5 rounded-2xl shadow-lg border border-slate-800 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center space-x-4">
          <img src="/upf_badge.png" alt="UPF Logo" className="w-12 h-12 object-contain contrast-200 brightness-110 drop-shadow-md" onError={(e) => e.target.style.display = 'none'} />
          <div>
            <h1 className="text-xl font-black tracking-wide uppercase flex items-center">
              <Shield className="w-5 h-5 mr-2 text-blue-400" /> Access & Command Approvals {isReadOnlyObserver && <span className="ml-3 text-[10px] bg-amber-500/20 text-amber-300 px-2.5 py-0.5 rounded-full border border-amber-500/40">👁️ Global Observer (Read-Only)</span>}
            </h1>
            <p className="text-xs text-slate-400 mt-1 uppercase tracking-wider font-semibold">
              Review officer signups, jurisdictional clearances, tier matrices, and regional audit logs.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button 
            onClick={() => {
              if (typeof setCurrentPage === 'function') {
                setCurrentPage('home');
              } else {
                window.location.href = '/';
              }
            }}
            className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-extrabold px-4 py-2 rounded-xl text-xs flex items-center shadow-md transition cursor-pointer border border-slate-700"
          >
            <ArrowRight size={14} className="mr-2 rotate-180" /> Return to Dashboard
          </button>

          {canTriggerBriefs && !isReadOnlyObserver && (
            <button 
              onClick={() => setShowBriefingModal(true)}
              disabled={isTriggeringBriefs}
              className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-800 text-white font-extrabold px-4 py-2 rounded-xl text-xs flex items-center shadow-md transition cursor-pointer border border-emerald-500"
            >
              {isTriggeringBriefs ? <Loader2 size={14} className="mr-2 animate-spin" /> : <Send size={14} className="mr-2" />}
              Dispatch Tactical Briefs
            </button>
          )}

          {isTopCommand && !isReadOnlyObserver && (
            <button 
              onClick={() => { setDelegationSearchTerm(''); setShowDelegationModal(true); }}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold px-4 py-2 rounded-xl text-xs flex items-center shadow-md transition cursor-pointer"
            >
              <Award size={14} className="mr-2" /> Delegate Approval Powers
            </button>
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 p-4 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col xl:flex-row items-start xl:items-center justify-between gap-5 relative z-20">
        <div className="flex flex-wrap items-center gap-3 bg-slate-50 dark:bg-slate-800/80 p-2 rounded-lg border border-slate-100 dark:border-slate-700 w-full xl:w-auto">
          <span className="text-xs font-extrabold text-blue-900 dark:text-blue-300 uppercase flex items-center tracking-wider mr-1">
            <Filter size={14} className="mr-1.5 text-blue-600 dark:text-blue-400" /> Filter Scope:
          </span>
          <select value={filterRegion} onChange={(e) => { setFilterRegion(stripHtmlTags(e.target.value)); setFilterStation('ALL STATIONS'); }} disabled={!canViewGlobalActive} className="border border-slate-300 dark:border-slate-700 rounded-md p-2 text-xs shadow-sm bg-white dark:bg-slate-900 font-bold text-slate-700 dark:text-slate-200 outline-none cursor-pointer min-w-[180px]">
            {canViewGlobalActive ? (<><option value="ALL REGIONS">ALL REGIONS (GLOBAL)</option>{Object.keys(REGIONAL_HIERARCHY || {}).map(reg => <option key={reg} value={reg}>{reg}</option>)}</>) : <option value={userRegClean}>{userRegClean}</option>}
          </select>
          <select value={filterStation} onChange={(e) => setFilterStation(stripHtmlTags(e.target.value))} disabled={!canViewGlobalActive && !isRPC && !isTopCommand} className="border border-slate-300 dark:border-slate-700 rounded-md p-2 text-xs shadow-sm bg-white dark:bg-slate-900 font-bold text-slate-700 dark:text-slate-200 outline-none cursor-pointer min-w-[200px]">
            {canViewGlobalActive || isRPC || isTopCommand ? (
              <>
                <option value="ALL STATIONS">ALL STATIONS / DIVISIONS</option>
                {filterRegion !== 'ALL REGIONS' && REGIONAL_HIERARCHY?.[filterRegion] ? REGIONAL_HIERARCHY[filterRegion].map(stat => (
                  <option key={stat} value={stat}>{stat}</option>
                )) : null}
              </>
            ) : <option value={currentUser?.station}>{stripHtmlTags(currentUser?.station)}</option>}
          </select>
          
          <div className="relative flex items-center min-w-[240px]">
            <Search size={14} className="absolute left-3 text-slate-400 dark:text-slate-500" />
            <input 
              type="text" 
              value={searchTerm} 
              onChange={(e) => setSearchTerm(e.target.value)} 
              placeholder="Search individual FNUM, name, IPPS..." 
              className="w-full pl-9 pr-3 py-1.5 border border-slate-300 dark:border-slate-700 rounded-md text-xs font-bold text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-950"
            />
            {searchTerm && <button onClick={() => setSearchTerm('')} className="absolute right-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 text-xs font-bold">×</button>}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full xl:w-auto">
          <button onClick={() => { fetchPendingUsers(); fetchAllSystemUsers(); fetchModRequests(); fetchAuditLogs(); fetchResets(); fetchLockdownStatus(); }} className="bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 font-bold px-4 py-2 rounded-lg text-xs flex items-center transition cursor-pointer shadow-sm">
            <RefreshCw size={14} className="mr-2 text-blue-600 dark:text-blue-400" /> Sync Queue
          </button>
          {isSuperAdmin && (
            <button onClick={() => { fetchLockdownStatus(); setShowLockdownModal(true); }} className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer border ${activeLockdownCount > 0 ? 'bg-red-950 border-red-500 text-red-200 animate-pulse' : 'bg-amber-950/60 border-amber-600/50 text-amber-300'}`}>
              <span>🔒</span><span>{activeLockdownCount > 0 ? `Lockdowns (${activeLockdownCount} Active)` : 'Lockdowns'}</span>
            </button>
          )}

          {canToggleKillSwitch && (
            <button onClick={handleKillSwitchToggle} disabled={loadingKillSwitch} className={`font-bold px-4 py-2 rounded-lg text-xs flex items-center transition cursor-pointer shadow-sm border ${isDbKillActive ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-400 dark:border-emerald-600 text-emerald-800 dark:text-emerald-300' : 'bg-red-50 dark:bg-red-950/40 border-red-400 dark:border-red-600 text-red-800 dark:text-red-300'}`}>
              {loadingKillSwitch ? <Loader2 size={14} className="mr-2 animate-spin text-slate-500" /> : <AlertTriangle size={14} className={`mr-2 ${isDbKillActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`} />}
              {isDbKillActive ? 'AI DB Query: ON' : 'AI DB Query: KILLED'}
            </button>
          )}
        </div>
      </div>

      <div className="flex border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-t-xl shadow-sm overflow-x-auto custom-scrollbar">
        <button onClick={() => setActiveTab('approvals')} className={`flex-1 py-3.5 px-4 text-xs uppercase tracking-wider font-extrabold flex items-center justify-center transition-all min-w-max cursor-pointer ${activeTab === 'approvals' ? 'bg-slate-50 dark:bg-slate-800 border-b-[3px] border-blue-600 text-blue-700 dark:text-blue-400 shadow-inner' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50/50 dark:hover:bg-slate-800/50'}`}>
          <UserPlus className="w-4 h-4 mr-2"/> Authorizations ({loadingPending ? '...' : filteredPending.length})
        </button>
        <button onClick={() => setActiveTab('matrix')} className={`flex-1 py-3.5 px-4 text-xs uppercase tracking-wider font-extrabold flex items-center justify-center transition-all min-w-max cursor-pointer ${activeTab === 'matrix' ? 'bg-slate-50 dark:bg-slate-800 border-b-[3px] border-indigo-600 text-indigo-700 dark:text-indigo-400 shadow-inner' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50/50 dark:hover:bg-slate-800/50'}`}>
          <Shield className="w-4 h-4 mr-2"/> Clearance Matrix
        </button>
        <button onClick={() => setActiveTab('roster')} className={`flex-1 py-3.5 px-4 text-xs uppercase tracking-wider font-extrabold flex items-center justify-center transition-all min-w-max cursor-pointer ${activeTab === 'roster' ? 'bg-slate-50 dark:bg-slate-800 border-b-[3px] border-cyan-600 text-cyan-700 dark:text-cyan-400 shadow-inner' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50/50 dark:hover:bg-slate-800/50'}`}>
          <Users className="w-4 h-4 mr-2"/> Directory Roster ({filteredSystemUsers.length})
        </button>
        <button onClick={() => setActiveTab('requests')} className={`flex-1 py-3.5 px-4 text-xs uppercase tracking-wider font-extrabold flex items-center justify-center transition-all min-w-max cursor-pointer ${activeTab === 'requests' ? 'bg-slate-50 dark:bg-slate-800 border-b-[3px] border-amber-500 text-amber-700 dark:text-amber-400 shadow-inner' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50/50 dark:hover:bg-slate-800/50'}`}>
          <RefreshCw className="w-4 h-4 mr-2"/> HR Transfers ({filteredRequests.length})
        </button>
        <button onClick={() => setActiveTab('logs')} className={`flex-1 py-3.5 px-4 text-xs uppercase tracking-wider font-extrabold flex items-center justify-center transition-all min-w-max cursor-pointer ${activeTab === 'logs' ? 'bg-slate-50 dark:bg-slate-800 border-b-[3px] border-emerald-600 text-emerald-700 dark:text-emerald-400 shadow-inner' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50/50 dark:hover:bg-slate-800/50'}`}>
          <FileText className="w-4 h-4 mr-2"/> Audit Logs ({filteredLogs.length})
        </button>
        <button onClick={() => setActiveTab('resets')} className={`flex-1 py-3.5 px-4 text-xs uppercase tracking-wider font-extrabold flex items-center justify-center transition-all min-w-max cursor-pointer ${activeTab === 'resets' ? 'bg-slate-50 dark:bg-slate-800 border-b-[3px] border-red-600 text-red-700 dark:text-red-400 shadow-inner' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50/50 dark:hover:bg-slate-800/50'}`}>
          <KeyRound className="w-4 h-4 mr-2"/> Password Resets ({filteredResets.length})
        </button>
      </div>

      {/* 🟢 NEUTRAL LANDING STATE (NO TAB SELECTED YET) */}
      {!activeTab && (
        <div className="bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-800 rounded-xl p-16 text-center flex flex-col items-center justify-center min-h-[400px] shadow-sm">
          <Shield className="w-16 h-16 text-slate-200 dark:text-slate-800 mb-4" />
          <h3 className="text-lg font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
            Awaiting Command Selection
          </h3>
          <p className="text-xs font-bold text-slate-400 dark:text-slate-600 mt-2">
            Please select an administrative module from the tabs above to securely fetch and load its data.
          </p>
        </div>
      )}

      {activeTab === 'approvals' && (
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xs border border-slate-200 dark:border-slate-800 overflow-hidden w-full">
          {loadingPending ? (
            <div className="p-8 text-center text-slate-500 dark:text-slate-400 font-medium animate-pulse text-xs">Syncing with Command Database...</div>
          ) : filteredPending.length === 0 ? (
            <div className="p-8 text-center text-slate-500 dark:text-slate-400 font-medium text-xs">No active unapproved access requests pending.</div>
          ) : (
            <div className="w-full overflow-x-auto custom-scrollbar">
              <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800 text-xs whitespace-nowrap">
                <thead className="bg-slate-900 dark:bg-slate-950 text-blue-100 uppercase font-black text-[11px] tracking-wider">
                  <tr><th className="px-4 py-3.5 text-left">Officer Details</th><th className="px-4 py-3.5 text-left">Jurisdiction (Station / Region)</th><th className="px-4 py-3.5 text-left">Derived Role Tier</th><th className="px-4 py-3.5 text-right">Action</th></tr>
                </thead>
                <tbody className="bg-white dark:bg-slate-900 divide-y divide-slate-200 dark:divide-slate-800">
                  {filteredPending.map((user) => (
                    <tr key={user.fnum} onClick={() => setSelectedPendingUser(user)} className="hover:bg-blue-50/50 dark:hover:bg-slate-800 cursor-pointer transition-colors group">
                      <td className="px-4 py-3">
                        <div className="font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                          <Eye size={14} className="text-blue-500 group-hover:scale-110 transition-transform"/>
                          {formatOfficerHeader(user)}
                        </div>
                      </td>
                      <td className="px-4 py-3"><div className="font-bold text-blue-700 dark:text-blue-400 uppercase">{stripHtmlTags(user.station)} / {stripHtmlTags(user.region)}</div></td>
                      <td className="px-4 py-3"><span className="px-2 py-0.5 inline-flex text-[10px] font-bold rounded-full border bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-700">{user.role}</span></td>
                      <td className="px-4 py-3 text-right">
                        <button type="button" onClick={(e) => { e.stopPropagation(); setSelectedPendingUser(user); }} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-1.5 px-3 rounded-md text-[11px] cursor-pointer shadow-sm">
                          Inspect Dossier
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

      {activeTab === 'matrix' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xs border border-slate-200 dark:border-slate-800 overflow-hidden w-full">
          <div className="bg-slate-900 dark:bg-slate-950 p-2.5 flex justify-between items-center border-b border-slate-800">
            <div className="flex space-x-2 bg-slate-800/80 p-1 rounded-lg">
              <button onClick={() => setMatrixView('ACTIVE')} className={`px-4 py-1.5 text-[10px] uppercase tracking-wider font-black rounded-md transition-colors ${matrixView === 'ACTIVE' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white cursor-pointer'}`}>Active Matrix ({filteredSystemUsers.length})</button>
              <button onClick={() => setMatrixView('REVOKED')} className={`px-4 py-1.5 text-[10px] uppercase tracking-wider font-black rounded-md transition-colors ${matrixView === 'REVOKED' ? 'bg-red-600 text-white shadow-sm' : 'text-slate-400 hover:text-white cursor-pointer'}`}>Revoked Vault ({filteredRevoked.length})</button>
            </div>
            <span className="text-white text-[10px] font-extrabold uppercase tracking-widest hidden sm:block mr-2 opacity-80">System Clearance Module</span>
          </div>

          {loadingUsers ? (
            <div className="p-8 text-center text-slate-400 font-medium animate-pulse text-xs">Syncing user database...</div>
          ) : matrixView === 'ACTIVE' ? (
            <div className="w-full overflow-x-auto custom-scrollbar">
              <div className="min-w-[1200px]">
                <table className="w-full divide-y divide-slate-200 dark:divide-slate-800 text-xs table-fixed">
                  <thead className="bg-slate-100 dark:bg-slate-950/50 text-slate-700 dark:text-slate-300 uppercase font-black text-[10px]">
                    <tr>
                      <th className="p-2.5 text-left md:sticky md:left-0 z-20 bg-slate-100 dark:bg-slate-950 text-blue-900 dark:text-blue-100 w-[240px] min-w-[240px]">Officer Details</th>
                      <th className="p-2.5 text-center md:sticky md:left-[240px] z-20 bg-slate-100 dark:bg-slate-950 text-blue-900 dark:text-blue-100 w-[120px] min-w-[120px]">Administrative Tier</th>
                      <th className="p-2.5 text-center md:sticky md:left-[360px] z-20 bg-slate-100 dark:bg-slate-950 text-blue-900 dark:text-blue-100 w-[100px] min-w-[100px]">Quick Actions</th>
                      {CLEARANCE_MATRIX_COLS.map((col, idx) => {
                        const allChecked = filteredSystemUsers.length > 0 && filteredSystemUsers.every(u => {
                          const r = (u.role || '').toUpperCase();
                          if (r === 'SUPER_ADMIN' || r === 'ASSISTANT_SUPER_ADMIN') return true;
                          const p = u.permissions || {};
                          return p[col.key] !== false && (['SUPER_ADMIN', 'ADMIN'].includes(u.role) || Boolean(p[col.key]));
                        });

                        return (
                          <th key={idx} className="p-2 border-l border-slate-300 dark:border-slate-800 bg-slate-100 dark:bg-slate-950 w-20 min-w-[80px] align-middle">
                            <div className="flex flex-col items-center justify-center space-y-1">
                              <div className="w-20 min-w-[80px] text-[9px] text-blue-900 dark:text-blue-100 font-bold whitespace-normal break-words leading-tight text-center px-0.5" title={col.label}>
                                {col.label}
                              </div>
                              {isSuperAdmin && !isReadOnlyObserver && (
                                <input 
                                  type="checkbox" 
                                  checked={allChecked}
                                  title={`Toggle entire column [${col.label}] for all users`}
                                  onChange={(e) => handleToggleEntireColumn(col.key, e.target.checked)}
                                  className="w-3.5 h-3.5 cursor-pointer accent-blue-600 mt-1"
                                />
                              )}
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium text-slate-700 dark:text-slate-300">
                    {filteredSystemUsers.map(u => {
                      const p = u.permissions || {};
                      const isSelf = u.fnum === currentUser?.fnum;
                      const canModifyThisUser = canControlTargetUser(u);

                      return (
                        <tr key={u.fnum} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                          <td className="p-2.5 md:sticky md:left-0 z-10 bg-white dark:bg-slate-900 font-extrabold text-[11px] text-slate-900 dark:text-slate-100 w-[240px] min-w-[240px] truncate">
                            <button
                              type="button"
                              onClick={() => setSelectedClearanceUser(u)}
                              className="text-left font-extrabold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1.5 cursor-pointer truncate w-full bg-transparent border-none p-0"
                              title="Click to inspect officer clearance dossier"
                            >
                              <Eye size={12} className="shrink-0 text-blue-500" />
                              <span className="truncate">{formatOfficerHeader(u)}</span>
                            </button>
                          </td>
                          <td className="p-2.5 text-center md:sticky md:left-[240px] z-10 bg-white dark:bg-slate-900 w-[120px] min-w-[120px]">
                            <select value={u.role || 'USER'} onChange={(e) => handleRoleTierChange(u.fnum, e.target.value)} disabled={isSelf || !canModifyThisUser || isReadOnlyObserver} className="border border-slate-300 dark:border-slate-700 rounded-md px-1.5 py-1 font-bold outline-none uppercase text-[10px] w-full truncate bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-200 disabled:opacity-50">
                              <option value="USER">USER</option>
                              <option value="STATION_USER">STATION USER</option>
                              <option value="STATION_ADMIN">STN ADMIN</option>
                              <option value="DIVISION_USER">DIV USER</option>
                              <option value="DIVISION_ADMIN">DIV ADMIN</option>
                              <option value="REGIONAL_USER">REG USER</option>
                              <option value="ASSISTANT_REGIONAL_ADMIN">ASST REG ADMIN</option>
                              <option value="REGIONAL_ADMIN">REG ADMIN</option>
                              <option value="ADMIN_USER">ADMIN USER</option>
                              <option value="ASSISTANT_SYSTEM_MANAGER">ASST SYS MANAGER</option>
                              <option value="SYSTEM_MANAGER">SYSTEM MANAGER</option>
                              <option value="ASSISTANT_SUPER_ADMIN">ASST SUPER ADMIN</option>
                              <option value="SUPER_ADMIN">SUPER ADMIN</option>
                            </select>
                          </td>
                          <td className="p-2.5 text-center md:sticky md:left-[360px] z-10 bg-white dark:bg-slate-900 w-[100px] min-w-[100px]">
                            <div className="flex items-center justify-center space-x-1">
                              {canModifyThisUser && !isReadOnlyObserver && (
                                <>
                                  <button onClick={() => handleBulkMatrixAction(u.fnum, true)} title="Check All" className="p-1 rounded bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 cursor-pointer"><CheckSquare size={12} /></button>
                                  <button onClick={() => handleBulkMatrixAction(u.fnum, false)} title="Uncheck All" className="p-1 rounded bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800 cursor-pointer"><Square size={12} /></button>
                                  {u.fnum !== 'A/2408' && (
                                    <button onClick={() => handleRevokeAccessCompletely(u.fnum, u.name)} title="Revoke Access (Move to Vault)" className="p-1 rounded bg-rose-50 text-rose-700 border border-rose-300 cursor-pointer"><XCircle size={12} /></button>
                                  )}
                                </>
                              )}
                              {isSuperAdmin && !isReadOnlyObserver && (
                                <button onClick={() => handleForcePassword(u.fnum, u.name)} title="Force Password" className="p-1 rounded bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 cursor-pointer"><KeyRound size={12} /></button>
                              )}
                            </div>
                          </td>
                          {CLEARANCE_MATRIX_COLS.map((col, idx) => {
                            const isObserverCol = col.key === 'global_observer';
                            const isOpenCol = col.key === 'global_open';
                            const isMutuallyDisabled = (isObserverCol && Boolean(p.global_open)) || (isOpenCol && Boolean(p.global_observer));
                            const isDisabled = isSelf || isMutuallyDisabled || !canModifyThisUser || isReadOnlyObserver || (isOpenCol && !isSuperAdmin);

                            return (
                              <td key={idx} className="p-2 text-center border-l border-slate-100 dark:border-slate-800 w-20 min-w-[80px]">
                                <input 
                                  type="checkbox" 
                                  checked={p[col.key] !== false ? (['SUPER_ADMIN', 'ADMIN'].includes(u.role) || Boolean(p[col.key])) : false} 
                                  disabled={isDisabled}
                                  onChange={e => handleGranularPermissionChange(u.fnum, col.key, e.target.checked)} 
                                  className={`w-3.5 h-3.5 rounded ${isDisabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'} accent-blue-600`} 
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
            </div>
          ) : (
            <div className="w-full overflow-x-auto custom-scrollbar">
              <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800 text-xs whitespace-nowrap">
                <thead className="bg-red-950/30 text-red-900 dark:text-red-300 uppercase font-black text-[10px]">
                  <tr>
                    <th className="p-3 text-left">Officer Details</th>
                    <th className="p-3 text-left">Contact & Identifiers</th>
                    <th className="p-3 text-left">Revocation Reason</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium text-slate-700 dark:text-slate-300 bg-red-50/30 dark:bg-slate-900">
                  {filteredRevoked.map(u => (
                    <tr key={u.fnum} className="hover:bg-red-50 dark:hover:bg-slate-800/50">
                      <td className="p-3">
                        <div className="font-extrabold text-slate-900 dark:text-slate-100">{formatOfficerHeader(u)}</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">{u.station} / {u.region}</div>
                      </td>
                      <td className="p-3">
                        <div>IPPS: <span className="font-bold">{u.ipps || 'N/A'}</span> | NIN: <span className="font-bold">{u.nin || 'N/A'}</span></div>
                        <div className="text-[10px] text-slate-500 mt-0.5">{u.email || 'No Email'} • {u.phone || 'No Phone'}</div>
                      </td>
                      <td className="p-3 whitespace-normal break-words max-w-xs">
                        <div className="text-red-700 dark:text-red-400 font-bold text-[11px] bg-red-100 dark:bg-red-900/30 px-2 py-1 rounded inline-block">
                          {getRevocationReason(u.fnum)}
                        </div>
                      </td>
                      <td className="p-3 text-right space-x-2">
                        <button type="button" onClick={(e) => { e.stopPropagation(); setSelectedPendingUser(u); }} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-1.5 px-3 rounded-lg text-[10px] shadow-sm inline-flex items-center transition cursor-pointer">
                          <Eye size={12} className="mr-1.5"/> Inspect Dossier
                        </button>
                        
                        {!isReadOnlyObserver && (
                          <button onClick={() => handleRegrantAccess(u.fnum, u.name)} className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg font-bold text-[10px] shadow-sm flex items-center inline-flex transition cursor-pointer">
                            <Unlock size={12} className="mr-1.5"/> Restore
                          </button>
                        )}
                        
                        {isSuperAdmin && !isReadOnlyObserver ? (
                          <button onClick={() => handlePermanentDelete(u.fnum, u.name)} className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg font-bold text-[10px] shadow-sm flex items-center inline-flex transition cursor-pointer">
                            <Trash2 size={12} className="mr-1.5"/> Purge
                          </button>
                        ) : (
                          <span className="text-[10px] text-slate-400 italic">Restricted</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filteredRevoked.length === 0 && (
                    <tr>
                      <td colSpan="4" className="p-8 text-center text-slate-500 font-bold text-xs">No revoked accounts currently logged in the vault.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'roster' && (
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xs border border-slate-200 dark:border-slate-800 overflow-hidden w-full">
          <div className="bg-slate-900 dark:bg-slate-950 px-4 py-2.5 border-b border-slate-800 text-white font-semibold text-xs uppercase">
            Command Directory & System Roster
          </div>
          {loadingUsers ? (
            <div className="p-8 text-center text-slate-500 dark:text-slate-400 font-medium animate-pulse text-xs">Compiling roster...</div>
          ) : (
            <div className="w-full overflow-x-auto custom-scrollbar">
              <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800 text-xs whitespace-nowrap">
                <thead className="bg-slate-900 dark:bg-slate-950 text-blue-100 uppercase font-black text-[11px]">
                  <tr><th className="px-4 py-3.5 text-left">Officer Details</th><th className="px-4 py-3.5 text-left">Identifiers</th><th className="px-4 py-3.5 text-left">Contact Data</th><th className="px-4 py-3.5 text-right">Actions</th></tr>
                </thead>
                <tbody className="bg-white dark:bg-slate-900 divide-y divide-slate-200 dark:divide-slate-800">
                  {filteredSystemUsers.map((user) => (
                    <tr key={user.fnum} className="hover:bg-cyan-50/50 dark:hover:bg-slate-800">
                      <td className="px-4 py-3"><div className="font-extrabold text-slate-900 dark:text-slate-100">{formatOfficerHeader(user)}</div></td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300">IPPS: {user.ipps || 'N/A'}</td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{user.phone || 'N/A'}</td>
                      <td className="px-4 py-3 text-right">
                        {isSuperAdmin && !isReadOnlyObserver && (
                          <button onClick={() => handleForcePassword(user.fnum, user.name)} className="px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 font-bold text-[10px] cursor-pointer"><KeyRound size={12} className="inline mr-1" /> Force Password</button>
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
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xs border border-amber-200 dark:border-amber-900/50 overflow-hidden w-full">
          <div className="bg-slate-900 dark:bg-slate-950 px-4 py-2.5 text-white font-semibold text-xs uppercase flex justify-between items-center">
            <span>HR Modification & Transfer Requests</span>
            <span className="text-[10px] text-amber-400 font-normal">Click any entry to inspect full transfer history trail & approval metadata</span>
          </div>
          <div className="w-full overflow-x-auto custom-scrollbar">
            <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800 text-xs whitespace-nowrap">
              <thead className="bg-slate-900 dark:bg-slate-950 text-blue-100 uppercase font-black text-[11px]">
                <tr>
                  <th className="px-4 py-3.5 text-left">Officer Details</th>
                  <th className="px-4 py-3.5 text-left">Current Station / Region</th>
                  <th className="px-4 py-3.5 text-left">Requested Station / Region</th>
                  <th className="px-4 py-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-slate-900 divide-y divide-slate-200 dark:divide-slate-800">
                {filteredRequests.map((req) => (
                  <tr key={req.id || req.sn} onClick={() => setSelectedModRequest(req)} className="hover:bg-amber-50/50 dark:hover:bg-slate-800 cursor-pointer transition-colors group">
                    <td className="px-4 py-3 text-slate-900 dark:text-slate-100 font-extrabold flex items-center gap-2">
                      <Eye size={14} className="text-amber-500 group-hover:scale-110 transition-transform"/>
                      {formatOfficerHeader({ fnum: req.fnum, rank: req.current_rank, name: req.current_name })}
                    </td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300 font-bold">{req.current_station || 'N/A'} / {req.current_region || 'N/A'}</td>
                    <td className="px-4 py-3 text-amber-600 dark:text-amber-400 font-black">{req.requested_station || 'N/A'} / {req.requested_region || 'N/A'}</td>
                    <td className="px-4 py-3 text-right space-x-2">
                      <button type="button" onClick={(e) => { e.stopPropagation(); setSelectedModRequest(req); }} className="bg-amber-600 hover:bg-amber-700 text-white font-bold py-1.5 px-3 rounded-md text-[11px] cursor-pointer shadow-sm">
                        Inspect Transfer
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredRequests.length === 0 && (
                  <tr>
                    <td colSpan="4" className="p-8 text-center text-slate-500 font-bold text-xs">No active HR modification or transfer requests pending.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'logs' && (
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xs border border-slate-200 dark:border-slate-800 overflow-hidden w-full">
          <div className="bg-slate-900 dark:bg-slate-950 px-4 py-2.5 text-white font-semibold text-xs uppercase">System Audit & Authentication Logs</div>
          <div className="w-full overflow-x-auto custom-scrollbar">
            <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800 text-xs">
              <thead className="bg-slate-900 dark:bg-slate-950 text-blue-100 uppercase font-black text-[11px] whitespace-nowrap">
                <tr>
                  <th className="px-4 py-3.5 text-left w-32">Timestamp</th>
                  <th className="px-4 py-3.5 text-left w-48">User</th>
                  <th className="px-4 py-3.5 text-left w-40">Event Type</th>
                  <th className="px-4 py-3.5 text-left">Details / Lifecycle Context</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-slate-900 divide-y divide-slate-200 dark:divide-slate-800">
                {filteredLogs.map((log) => {
                  const evType = (log.event_type || '').toUpperCase();
                  let badgeColor = 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300';
                  if (evType.includes('AUTH') || evType.includes('LOGIN') || evType.includes('SESSION')) {
                    badgeColor = 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300';
                  } else if (evType.includes('LOGOUT') || evType.includes('TIMEOUT') || evType.includes('REVOKE')) {
                    badgeColor = 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300';
                  } else if (evType.includes('SUBMIT') || evType.includes('CREATE') || evType.includes('REGISTER')) {
                    badgeColor = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300';
                  }

                  return (
                    <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-800">
                      <td className="px-4 py-2.5 font-mono text-[10px] text-slate-500 dark:text-slate-400 whitespace-nowrap">{log.created_at}</td>
                       
                      <td className="px-4 py-2.5 font-extrabold text-blue-700 dark:text-blue-400 whitespace-nowrap">
                        {log.user_fnum} {log.user_name ? `- ${log.user_name}` : ''}
                      </td>

                      <td className="px-4 py-2.5 uppercase font-extrabold text-[10px] whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${badgeColor}`}>
                          {log.event_type}
                        </span>
                      </td>

                      <td className="px-4 py-2.5 text-[11px] text-slate-700 dark:text-slate-300 font-medium whitespace-normal break-words min-w-[500px] w-full">
                        {log.details?.includes('Target: SYSTEM | Changes: | Remarks:') 
                          ? 'Standard System Authentication / Active Session Lifecycle' 
                          : log.details}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'resets' && (  
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xs border border-red-200 dark:border-red-900/50 overflow-hidden w-full">
          <div className="bg-slate-900 dark:bg-slate-950 px-4 py-2.5 text-white font-semibold text-xs uppercase">Authorized Password Recovery</div>
          <div className="w-full overflow-x-auto custom-scrollbar">
            <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800 text-xs whitespace-nowrap">
              <thead className="bg-slate-900 dark:bg-slate-950 text-blue-100 uppercase font-black text-[11px]">
                <tr><th className="px-4 py-3.5 text-left">Date</th><th className="px-4 py-3.5 text-left">Officer</th><th className="px-4 py-3.5 text-right">Action</th></tr>
              </thead>
              <tbody className="bg-white dark:bg-slate-900 divide-y divide-slate-200 dark:divide-slate-800">
                {filteredResets.map((req) => (
                  <tr key={req.id} className="hover:bg-red-50/50 dark:hover:bg-slate-800">
                    <td className="px-4 py-2.5 font-bold text-[10px] text-slate-500 dark:text-slate-400">{req.request_date}</td>
                    <td className="px-4 py-2.5 font-extrabold text-blue-700 dark:text-blue-400">{formatOfficerHeader({ fnum: req.fnum, rank: req.rank, name: req.name })}</td>
                    <td className="px-4 py-2.5 text-right space-x-2">
                      {!isReadOnlyObserver && (
                        <>
                          <button onClick={() => handleResetAction(req.id, "APPROVE")} className="bg-red-600 hover:bg-red-700 text-white font-bold py-1 px-2.5 rounded text-[11px] cursor-pointer">Authorize Reset</button>
                          <button onClick={() => handleResetAction(req.id, "REJECT")} className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold py-1 px-2.5 rounded text-[11px] cursor-pointer">Reject</button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showDelegationModal && !isReadOnlyObserver && (
        <div className="fixed inset-0 bg-black/70 z-[999999] flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl p-6 space-y-4 shadow-2xl text-white">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="text-sm font-extrabold uppercase flex items-center">
                <Award className="w-4 h-4 mr-2 text-yellow-400" /> Delegate Command Approval Powers & Absence Status
              </h3>
              <button onClick={() => setShowDelegationModal(false)} className="text-slate-400 hover:text-white cursor-pointer"><X size={18}/></button>
            </div>
             
            <p className="text-xs text-slate-400">Search and select an officer in your command jurisdiction to delegate acting approval privileges, or broadcast your official command absence status.</p>
             
            {/* 🟢 COMMANDER LEAVE / ABSENCE REASON BROADCASTER */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-black uppercase text-amber-400">Broadcast Commander Leave / Absence Status</h4>
                  <p className="text-[10px] text-slate-400">If you are away (e.g., on leave or course), select a reason below to notify command nodes.</p>
                </div>
                <ToggleSwitch 
                  checked={currentUser?.permissions?.manual_delegation || false} 
                  onChange={async () => {
                    const nextAway = !(currentUser?.permissions?.manual_delegation);
                    const reasonSelect = document.getElementById('absenceReasonSelect')?.value || 'Annual Leave';
                    try {
                      const res = await authFetch('/api/v1/admin/set-commander-status', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ is_away: nextAway, absence_reason: reasonSelect })
                      });
                      if (res.ok) {
                        alert("✅ Command status broadcast updated successfully.");
                        window.location.reload(); // Refresh to sync permissions state
                      }
                    } catch (err) { alert("Failed to update status."); }
                  }} 
                />
              </div>
              <div className="flex items-center space-x-2 pt-1">
                <span className="text-[10px] uppercase font-bold text-slate-400 shrink-0">Absence Reason:</span>
                <select 
                  id="absenceReasonSelect"
                  defaultValue={currentUser?.permissions?.absence_reason || 'Annual Leave'}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-1.5 text-xs font-bold text-white outline-none focus:border-amber-500 cursor-pointer"
                >
                  <option value="Annual Leave">Annual Leave</option>
                  <option value="Official Course / Training (e.g., Cairo, Egypt)">Official Course / Training (e.g., Cairo, Egypt)</option>
                  <option value="Field Operations / Deployment">Field Operations / Deployment</option>
                  <option value="Medical Leave / Sick Sheet">Medical Leave / Sick Sheet</option>
                  <option value="Off Duty / Rest Days">Off Duty / Rest Days</option>
                </select>
              </div>
            </div>

            <div className="relative flex items-center pt-2">
              <Search size={14} className="absolute left-3 text-slate-400" />
              <input 
                type="text"
                value={delegationSearchTerm}
                onChange={(e) => setDelegationSearchTerm(e.target.value)}
                placeholder="Search by name, F/No, or station..."
                className="w-full pl-9 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs font-bold text-white outline-none focus:border-indigo-500"
              />
              {delegationSearchTerm && <button onClick={() => setDelegationSearchTerm('')} className="absolute right-3 text-slate-400 hover:text-white text-xs font-bold">×</button>}
            </div>

            <div className="max-h-80 overflow-y-auto space-y-3 custom-scrollbar pr-1">
              {allSystemUsers
                .filter(u => {
                  if (u.role === 'SUPER_ADMIN' || !canControlTargetUser(u)) return false;
                  if (!delegationSearchTerm.trim()) return true;
                  const term = delegationSearchTerm.trim().toLowerCase();
                  return (u.name || "").toLowerCase().includes(term) || (u.fnum || "").toLowerCase().includes(term) || (u.station || "").toLowerCase().includes(term);
                })
                .map(u => {
                  const uPerms = u.permissions || {};
                  return (
                    <div key={u.fnum} className="bg-slate-800/90 p-4 rounded-xl space-y-3 border border-slate-700 hover:border-indigo-500 transition-colors">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-bold text-xs">{formatOfficerHeader(u)}</div>
                          <div className="text-[10px] text-slate-400 mt-0.5">{u.station} / {u.region} • <span className="text-yellow-400 font-semibold">{u.role}</span></div>
                        </div>
                        <div className="space-x-2 shrink-0">
                          {uPerms?.can_approve ? (
                            <button onClick={() => handleToggleDelegationPower(u, false)} className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg text-[10px] font-extrabold cursor-pointer shadow-sm">Revoke All Powers</button>
                          ) : (
                            <button onClick={() => handleToggleDelegationPower(u, true)} className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-[10px] font-extrabold cursor-pointer shadow-sm">Grant Acting Power</button>
                          )}
                        </div>
                      </div>

                      {/* 🟢 GRANULAR ACTING POWERS CHECKLIST */}
                      <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 space-y-1.5">
                        <span className="text-[9px] font-extrabold uppercase tracking-wider text-slate-400 block">Scoped Acting Powers Checklist:</span>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[10px]">
                          {CLEARANCE_MATRIX_COLS.map(col => {
                            const isChecked = uPerms[col.key] === true;
                            return (
                              <label key={col.key} className="flex items-center space-x-1.5 cursor-pointer text-slate-300 hover:text-white truncate">
                                <input 
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={async (e) => {
                                    const nextPerms = { ...uPerms, [col.key]: e.target.checked, can_approve: true };
                                    try {
                                      // 🟢 Fixed: Included '/admin/' prefix to prevent 404 error
                                      const res = await authFetch(`/api/v1/admin/users/${encodeURIComponent(u.fnum)}/access`, {
                                        method: "PUT",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({ role: u.role, permissions: nextPerms })
                                      });
                                      if (!res.ok) throw new Error("Failed to update delegation privileges.");
                                      fetchAllSystemUsers();
                                    } catch (err) {
                                      alert(`❌ Error: ${err.message}`);
                                    }
                                  }}
                                  className="w-3.5 h-3.5 accent-blue-600 rounded cursor-pointer shrink-0"
                                />
                                <span className="truncate" title={col.label}>{col.label}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
             
            <div className="flex justify-end pt-2 border-t border-slate-800">
              <button onClick={() => setShowDelegationModal(false)} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-bold text-xs cursor-pointer">Done</button>
            </div>
          </div>
        </div>
      )}

      {/* MODALS */}
      <SignupDossierModal user={selectedPendingUser} onClose={() => setSelectedPendingUser(null)} setViewingPhotoModal={setViewingPhotoModal} currentUser={currentUser} isProcessingAction={isProcessingAction} handleRejectUser={handleRejectUser} handleApproveUser={handleApproveUser} handleRegrantAccess={handleRegrantAccess} handlePermanentDelete={handlePermanentDelete} isSuperAdmin={isSuperAdmin} canModifyUser={canControlTargetUser} isReadOnlyObserver={isReadOnlyObserver} />
      <UserClearanceDossierModal 
        user={allSystemUsers.find(u => u.fnum === selectedClearanceUser?.fnum) || selectedClearanceUser} 
        onClose={() => setSelectedClearanceUser(null)} 
        currentUser={currentUser} 
        onUpdatePermissions={handleGranularPermissionChange} 
      />
      <TransferDossierModal req={selectedModRequest} onClose={() => setSelectedModRequest(null)} handleReviewRequest={handleReviewRequest} isReadOnlyObserver={isReadOnlyObserver} />
      <LockdownMatrixModal isOpen={showLockdownModal} onClose={() => setShowLockdownModal(false)} activeLockdownSummary={activeLockdownSummary} lockdownData={lockdownData} handleToggleLockdown={handleToggleLockdown} lockdownRegionFilter={lockdownRegionFilter} setLockdownRegionFilter={setLockdownRegionFilter} />
      <RevocationModal prompt={revokePrompt} setPrompt={setRevokePrompt} executeRoleChange={() => {}} executePermissionChange={() => {}} />
      <BriefingPreviewModal isOpen={showBriefingModal} onClose={() => setShowBriefingModal(false)} onDispatch={handleManualBriefDispatch} isDispatching={isTriggeringBriefs} />

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