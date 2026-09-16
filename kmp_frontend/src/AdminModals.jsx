import React from 'react';
import { 
  Shield, CheckCircle, AlertTriangle, X, Lock, XCircle, ShieldAlert, Power, ArrowRight 
} from 'lucide-react';
import { stripHtmlTags } from './App';
import { REGIONAL_HIERARCHY } from './adminUtils';

// 🟢 HELPER: Inline UI Toggle Switch component
export const ToggleSwitch = ({ checked, onChange }) => (
  <div
    onClick={onChange}
    className={`w-10 h-5 flex items-center rounded-full p-1 cursor-pointer transition-colors duration-300 shadow-inner ${
      checked ? 'bg-red-600' : 'bg-slate-300'
    }`}
  >
    <div 
      className={`bg-white w-3.5 h-3.5 rounded-full shadow-md transform transition-transform duration-300 ${
        checked ? 'translate-x-4.5' : 'translate-x-0'
      }`} 
    />
  </div>
);

// 🟢 SIGNUP DOSSIER MODAL
export const SignupDossierModal = ({ user, onClose, setViewingPhotoModal, isProcessingAction, handleRejectUser, handleApproveUser, canModifyUser, currentUser }) => {
  if (!user) return null;
  const isModalCrossRegion = !canModifyUser(currentUser, user);

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[300] flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-300 flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-150">
        <div className="bg-slate-900 text-white p-4 px-6 flex justify-between items-center shrink-0">
          <h3 className="font-extrabold text-xs uppercase tracking-wider flex items-center">
            <Shield size={16} className="text-blue-400 mr-2"/> Signup Verification Dossier
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white cursor-pointer"><X size={18}/></button>
        </div>
        <div className="p-6 overflow-y-auto space-y-4 custom-scrollbar flex-1 bg-slate-50">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center space-x-4">
            <div 
              onClick={() => user.profile_photo_path && setViewingPhotoModal(user.profile_photo_path)}
              className="w-16 h-16 rounded-full bg-slate-100 border-2 border-blue-500 overflow-hidden shrink-0 flex items-center justify-center cursor-pointer shadow-sm"
            >
              {user.profile_photo_path ? (
                <img src={user.profile_photo_path} alt="Officer" className="w-full h-full object-cover" />
              ) : (
                <span className="font-black text-xl text-slate-600">{user.name?.charAt(0) || 'U'}</span>
              )}
            </div>
            <div>
              <h4 className="text-sm font-black text-slate-900">{user.rank} {user.name}</h4>
              <p className="text-xs font-mono font-bold text-blue-700">{user.fnum}</p>
              <p className="text-[11px] text-slate-500 uppercase font-semibold">{user.position || 'General Duties'}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-2xs text-xs">
            <div>
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">IPPS Number</span>
              <span className="font-extrabold text-slate-800">{user.ipps || 'N/A'}</span>
            </div>
            <div>
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">National ID (NIN)</span>
              <span className="font-extrabold text-slate-800 font-mono">{user.nin || 'N/A'}</span>
            </div>
            <div>
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Gender / Sex</span>
              <span className="font-extrabold text-slate-800">{user.sex || 'MALE'}</span>
            </div>
            <div>
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Role Requested</span>
              <span className="font-extrabold text-blue-700 uppercase">{user.role || 'USER'}</span>
            </div>
            <div>
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Command Region</span>
              <span className="font-extrabold text-slate-800">{user.region}</span>
            </div>
            <div>
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Assigned Station</span>
              <span className="font-extrabold text-slate-800">{user.station}</span>
            </div>
            <div className="col-span-2 border-t border-slate-100 pt-2">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Official Email</span>
              <span className="font-bold text-slate-800 break-all">{user.email || 'N/A'}</span>
            </div>
            <div className="col-span-2">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Phone Number</span>
              <span className="font-bold text-slate-800">{user.phone || 'N/A'}</span>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 border-t border-slate-200 flex justify-between items-center shrink-0">
          <button type="button" onClick={onClose} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer">
            Close
          </button>
          <div className="space-x-2">
            <button
              type="button"
              disabled={isProcessingAction || isModalCrossRegion}
              onClick={() => handleRejectUser(user)}
              title={isModalCrossRegion ? "Out of Jurisdiction (Requires Higher Tier)" : "Reject Request"}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition shadow-xs ${isModalCrossRegion ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-red-600 hover:bg-red-700 text-white cursor-pointer'}`}
            >
              <XCircle size={14} className="inline mr-1"/> Reject Request
            </button>
            <button
              type="button"
              disabled={isProcessingAction || isModalCrossRegion}
              onClick={() => handleApproveUser(user)}
              title={isModalCrossRegion ? "Out of Jurisdiction (Requires Higher Tier)" : "Approve Access"}
              className={`px-5 py-2 rounded-xl text-xs font-extrabold transition shadow-xs ${isModalCrossRegion ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-blue-700 hover:bg-blue-800 text-white cursor-pointer'}`}
            >
              <CheckCircle size={14} className="inline mr-1"/> Approve Access
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// 🟢 HR MODIFICATION DOSSIER MODAL
export const HRModificationModal = ({ req, onClose, isProcessingAction, handleReviewRequest, currentUser }) => {
  if (!req) return null;

  const targetRank = (req.requested_rank || req.current_rank || '').toUpperCase();
  const targetFnum = (req.requested_fnum || req.fnum || '').toUpperCase();
  const ncoRanks = ['PC', 'SPC', 'CPL', 'SGT'];
  const isTargetNCO = ncoRanks.includes(targetRank);
  const isFnumNumeric = /^\d+$/.test(targetFnum);
  
  const rankMismatchError = isTargetNCO && !isFnumNumeric 
    ? `SECURITY CONFLICT: Rank [${targetRank}] requires a strictly numeric Force Number.` 
    : (!isTargetNCO && isFnumNumeric && targetRank) 
    ? `SECURITY CONFLICT: Rank [${targetRank}] requires an alphanumeric File Number (e.g., A/123).` 
    : null;

  const isModalCrossRegion = !['SUPER_ADMIN', 'ASSISTANT_SUPER_ADMIN'].includes(currentUser?.role) && currentUser?.region !== req.current_region;

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[300] flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden border border-slate-300 flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-150">
        <div className="bg-slate-900 text-white p-4 px-6 flex justify-between items-center shrink-0">
          <h3 className="font-extrabold text-xs uppercase tracking-wider flex items-center text-amber-400">
            <Shield size={16} className="mr-2"/> HR Modification Dossier
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white cursor-pointer"><X size={18}/></button>
        </div>
        
        <div className="p-6 overflow-y-auto space-y-4 custom-scrollbar flex-1 bg-slate-50">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
             <div>
                <h4 className="text-sm font-black text-slate-900">Force/File Number</h4>
                <p className="text-lg font-mono font-bold text-blue-700">
                  {req.requested_fnum ? (
                    <><span className="line-through text-slate-400 mr-2">{req.fnum}</span> <span className="text-emerald-600">{req.requested_fnum}</span></>
                  ) : req.fnum}
                </p>
             </div>
             <div className="text-right">
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Requested On</p>
                <p className="text-xs font-bold text-slate-600">{stripHtmlTags(req.created_at)}</p>
             </div>
          </div>

          {rankMismatchError && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start shadow-sm">
              <AlertTriangle size={18} className="text-red-600 mr-3 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-black text-red-800 uppercase tracking-wider mb-1">HR Protocol Violation</h4>
                <p className="text-[11px] font-semibold text-red-700 leading-tight">{rankMismatchError}</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-rose-200 shadow-2xs overflow-hidden">
               <div className="bg-rose-50 px-4 py-2 border-b border-rose-200 text-[10px] font-black text-rose-800 uppercase tracking-wider">Current Active Profile</div>
               <div className="p-4 space-y-3 text-xs">
                 <div><span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Legal Name</span><span className="font-bold text-slate-600 line-through">{req.current_name}</span></div>
                 <div><span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Professional Rank</span><span className="font-bold text-slate-600 line-through">{req.current_rank}</span></div>
                 <div><span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Command Region</span><span className="font-bold text-slate-600 line-through">{req.current_region}</span></div>
                 <div><span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Assigned Station</span><span className="font-bold text-slate-600 line-through">{req.current_station}</span></div>
               </div>
            </div>

            <div className="bg-white rounded-xl border border-emerald-200 shadow-2xs overflow-hidden relative">
               <div className="absolute left-[-16px] top-1/2 transform -translate-y-1/2 bg-white rounded-full p-1 shadow-md z-10 hidden md:block border border-slate-200"><ArrowRight size={16} className="text-slate-400" /></div>
               <div className="bg-emerald-50 px-4 py-2 border-b border-emerald-200 text-[10px] font-black text-emerald-800 uppercase tracking-wider flex justify-between items-center">
                 <span>Requested Changes</span><span className="bg-emerald-200 text-emerald-800 px-1.5 py-0.5 rounded text-[8px]">PENDING</span>
               </div>
               <div className="p-4 space-y-3 text-xs">
                 <div><span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Legal Name</span><span className={`font-extrabold ${req.requested_name !== req.current_name ? 'text-emerald-700' : 'text-slate-700'}`}>{req.requested_name || req.current_name}</span></div>
                 <div><span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Professional Rank</span><span className={`font-extrabold ${req.requested_rank !== req.current_rank ? 'text-emerald-700' : 'text-slate-700'}`}>{req.requested_rank || req.current_rank}</span></div>
                 <div><span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Command Region</span><span className={`font-extrabold ${req.requested_region !== req.current_region ? 'text-emerald-700' : 'text-slate-700'}`}>{req.requested_region || req.current_region}</span></div>
                 <div><span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Assigned Station</span><span className={`font-extrabold ${req.requested_station !== req.current_station ? 'text-emerald-700' : 'text-slate-700'}`}>{req.requested_station || req.current_station}</span></div>
               </div>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 border-t border-slate-200 flex justify-between items-center shrink-0">
          <button type="button" onClick={onClose} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer">Close Preview</button>
          <div className="space-x-2">
            <button
              type="button"
              disabled={isProcessingAction || isModalCrossRegion}
              onClick={() => handleReviewRequest(req.id || req.sn, "REJECTED")}
              title={isModalCrossRegion ? "Out of Jurisdiction" : "Reject Changes"}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition shadow-xs ${isModalCrossRegion ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 cursor-pointer'}`}
            >
              <XCircle size={14} className="inline mr-1"/> Reject Changes
            </button>
            <button
              type="button"
              disabled={isProcessingAction || isModalCrossRegion || rankMismatchError !== null}
              onClick={() => handleReviewRequest(req.id || req.sn, "APPROVED")}
              title={rankMismatchError ? "Protocol Violation" : isModalCrossRegion ? "Out of Jurisdiction" : "Approve & Execute"}
              className={`px-5 py-2 rounded-xl text-xs font-extrabold transition shadow-xs ${isModalCrossRegion || rankMismatchError ? 'bg-slate-200 text-slate-400 cursor-not-allowed opacity-60' : 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer'}`}
            >
              <CheckCircle size={14} className="inline mr-1"/> Approve & Execute
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// 🟢 LOCKDOWN MATRIX MODAL
export const LockdownMatrixModal = ({ isOpen, onClose, activeLockdownSummary, lockdownData, handleToggleLockdown, lockdownRegionFilter, setLockdownRegionFilter }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-slate-50 w-full max-w-4xl rounded-2xl shadow-2xl border border-slate-300 overflow-hidden flex flex-col max-h-[90vh]">
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center">
            <ShieldAlert className="w-5 h-5 text-amber-500 mr-3 animate-pulse" />
            <div>
              <h3 className="text-sm font-black uppercase tracking-widest">Central Command Lockdown Matrix</h3>
              <p className="text-[10px] text-slate-400">Instantly suspend module access for specific regions or the entire system.</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white cursor-pointer transition"><X size={20} /></button>
        </div>

        <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-6">
          {activeLockdownSummary.length > 0 ? (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 shadow-sm animate-in fade-in">
              <h4 className="text-xs font-black text-red-800 uppercase tracking-wider mb-3 flex items-center">
                <AlertTriangle className="w-4 h-4 mr-1.5 animate-pulse" /> Currently Active Lockdowns ({activeLockdownSummary.length})
              </h4>
              <div className="flex flex-wrap gap-2">
                {activeLockdownSummary.map((item, idx) => (
                  <span key={idx} className="bg-white border border-red-300 text-red-700 text-[10px] font-bold px-2.5 py-1 rounded shadow-sm">{item}</span>
                ))}
              </div>
            </div>
          ) : (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 shadow-sm flex items-center animate-in fade-in">
              <CheckCircle className="w-4 h-4 text-emerald-600 mr-2" />
              <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider">All Systems Operational - No Active Lockdowns</span>
            </div>
          )}

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex items-center justify-between">
            <div>
              <h4 className="text-sm font-extrabold text-slate-900 flex items-center"><Power className="w-4 h-4 mr-2 text-red-600" /> Force-Wide System Lockdown</h4>
              <p className="text-xs text-slate-500 mt-1 max-w-lg">Activating this will instantly freeze the entire application. All active users (except Super Admins) will be forcefully logged out.</p>
            </div>
            <ToggleSwitch checked={lockdownData.system} onChange={() => handleToggleLockdown('SYSTEM', 'GLOBAL', lockdownData.system)} />
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="bg-slate-100 px-5 py-3 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-700">Jurisdictional Lockdowns</h4>
              <div className="flex items-center space-x-2">
                <span className="text-[10px] font-bold text-slate-500 uppercase">Select Region:</span>
                <select value={lockdownRegionFilter} onChange={(e) => setLockdownRegionFilter(e.target.value)} className="border border-slate-300 rounded p-1.5 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer bg-white">
                  {Object.keys(REGIONAL_HIERARCHY).map(reg => (<option key={reg} value={reg}>{reg}</option>))}
                </select>
              </div>
            </div>

            <div className="p-5 space-y-6">
              <div className="flex items-center justify-between bg-amber-50 border border-amber-200 p-4 rounded-lg shadow-inner">
                <div>
                  <h5 className="text-xs font-black text-amber-900 uppercase">Lock Entire Region: {lockdownRegionFilter}</h5>
                  <p className="text-[10px] text-amber-700 mt-0.5">Suspends access for ALL stations within this region immediately.</p>
                </div>
                <ToggleSwitch checked={!!lockdownData.regions[lockdownRegionFilter]} onChange={() => handleToggleLockdown('REGION', lockdownRegionFilter, !!lockdownData.regions[lockdownRegionFilter])} />
              </div>

              <div>
                <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3 border-b pb-2">Individual Station Lockdowns ({lockdownRegionFilter})</h5>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {REGIONAL_HIERARCHY[lockdownRegionFilter]?.map(station => (
                    <div key={station} className="flex items-center justify-between border border-slate-200 rounded-lg p-3 hover:bg-slate-50 transition-colors">
                      <span className="text-xs font-bold text-slate-700 uppercase truncate pr-2">{station}</span>
                      <ToggleSwitch checked={!!lockdownData.stations[station]} onChange={() => handleToggleLockdown('STATION', station, !!lockdownData.stations[station])} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// 🟢 REVOCATION JUSTIFICATION MODAL
export const RevocationModal = ({ prompt, setPrompt, executeRoleChange, executePermissionChange }) => {
  if (!prompt.isOpen) return null;

  return (
    <div className="fixed inset-0 z-[99999] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-slate-300 overflow-hidden flex flex-col">
        <div className="bg-red-600 px-6 py-4 flex items-center shrink-0">
          <AlertTriangle className="text-white mr-3 animate-pulse" size={22} />
          <h3 className="text-white font-extrabold text-sm uppercase tracking-wider">Mandatory Justification Required</h3>
        </div>
          
        <div className="p-6 space-y-4">
          <p className="text-sm font-bold text-slate-700 leading-relaxed">
            You are about to revoke <span className="text-red-600 bg-red-50 px-1 rounded">{prompt.actionType === 'ROLE' ? 'all system access' : `the "${stripHtmlTags(prompt.permissionKey)}"`} clearance</span> for this officer. By command directive, you must state an official operational reason to proceed.
          </p>
          <textarea 
            value={prompt.reason}
            onChange={(e) => setPrompt({...prompt, reason: stripHtmlTags(e.target.value)})}
            placeholder="Type official reason for revocation here..."
            className="w-full border border-slate-300 rounded-xl p-3 text-sm font-medium outline-none focus:border-red-500 focus:ring-2 focus:ring-red-200 resize-none h-32 bg-white"
          />
        </div>
          
        <div className="bg-slate-50 px-6 py-4 flex justify-end space-x-3 border-t border-slate-200 shrink-0">
          <button 
            onClick={() => setPrompt({ isOpen: false, fnum: null, actionType: null, targetValue: null, permissionKey: null, reason: '' })}
            className="px-4 py-2 font-bold text-slate-600 text-xs bg-white border border-slate-300 rounded-xl hover:bg-slate-100 transition cursor-pointer"
          >
            Cancel Action
          </button>
          {prompt.reason.trim().length >= 5 && (
            <button 
              onClick={() => {
                if (prompt.actionType === 'ROLE') {
                  executeRoleChange(prompt.fnum, prompt.targetValue, prompt.reason);
                } else {
                  executePermissionChange(prompt.fnum, prompt.permissionKey, prompt.targetValue, prompt.reason);
                }
                setPrompt({ isOpen: false, fnum: null, actionType: null, targetValue: null, permissionKey: null, reason: '' });
              }}
              className="px-4 py-2 font-bold text-white text-xs bg-red-600 rounded-xl hover:bg-red-700 shadow-md transition flex items-center cursor-pointer animate-in fade-in slide-in-from-right-4"
            >
              <CheckCircle size={15} className="mr-1.5" /> Confirm Revocation
            </button>
          )}
        </div>
      </div>
    </div>
  );
};