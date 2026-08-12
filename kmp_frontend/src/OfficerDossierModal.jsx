import React from 'react';
import { X } from 'lucide-react';

const OfficerDossierModal = ({ officer, onClose }) => {
  if (!officer) return null;

  // 🟢 STRICT DATA MAPPING: Catches both database snake_case and frontend squashed-case
  const safeData = {
    sn: officer.id || officer.sn,
    fnum: officer.f_num || officer.fnum,
    ipps: officer.ipps,
    nin: officer.nin,
    tin: officer.tin,
    name: officer.name,
    sex: officer.sex,
    dob: officer.dob,
    tribe: officer.tribe,
    homedist: officer.home_dist || officer.homedist,
    contact: officer.contact || officer.phone,
    educlevel: officer.educ_level || officer.educlevel,
    
    rank: officer.rank,
    position: officer.position,
    dir: officer.dir,
    // 🟢 Honor overridden target region/station if present, falling back to officer profile data
    region: officer.region || 'KMP HEADQUARTERS',
    district: officer.district || '-',
    station: officer.station || 'HEADQUARTERS',
    section: officer.section,
    doe: officer.doe,
    dopost: officer.do_post || officer.dopost || officer.dop,
    dopro: officer.do_pro || officer.dopro,
    bankbranch: officer.bank_branch || officer.bankbranch,
    accno: officer.acc_no || officer.accno,
    status: officer.status || "ACTIVE",
    last_updated_by: officer.last_updated_by || officer.logged_by
  };

  // COLUMN 1: Personal Details, Identifiers & Contact
  const leftAttributes = [
    { label: "System S/N", value: safeData.sn },
    { label: "Force Number (F/NO)", value: safeData.fnum },
    { label: "IPPS Number", value: safeData.ipps },
    { label: "National ID Number (NIN)", value: safeData.nin },
    { label: "Tax Identification (TIN)", value: safeData.tin },
    { label: "Full Name", value: safeData.name },
    { label: "Sex", value: safeData.sex },
    { label: "Date of Birth (D.O.B)", value: safeData.dob },
    { label: "Tribe / Nationality", value: safeData.tribe },
    { label: "Home District", value: safeData.homedist },
    { label: "Contact Telephone", value: safeData.contact },
    { label: "Educational Level", value: safeData.educlevel },
  ];

  // COLUMN 2: Service Record, Deployment & Financials
  const rightAttributes = [
    { label: "Rank", value: safeData.rank },
    { label: "Official Position / Title", value: safeData.position },
    { label: "Directorate", value: safeData.dir },
    { label: "Command Region", value: safeData.region },
    { label: "Deployment District", value: safeData.district },
    { label: "Duty Station", value: safeData.station },
    { label: "Division / Section", value: safeData.section },
    { label: "Date of Enlistment (D.O.E)", value: safeData.doe },
    { label: "Date of Posting (D.O.P)", value: safeData.dopost },
    { label: "Date of Promotion (D.O. PRO)", value: safeData.dopro },
    { label: "Bank & Branch", value: safeData.bankbranch },
    { label: "Bank Account Number", value: safeData.accno },
    { label: "Deployment Status", value: safeData.status },
  ];

  return (
    <div className="fixed inset-0 z-[250] bg-slate-950/70 backdrop-blur-sm flex justify-center items-center p-4 animate-in fade-in duration-200 font-sans">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh] border border-slate-300">
        
        {/* MODAL HEADER */}
        <div className="bg-slate-900 text-white px-6 py-4 flex justify-between items-center shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center font-extrabold text-white text-base shadow-inner border border-blue-400">
              {safeData.name ? safeData.name.charAt(0) : 'O'}
            </div>
            <div>
              <h3 className="font-extrabold text-sm tracking-wide uppercase">{safeData.rank} {safeData.name}</h3>
              <p className="text-[11px] text-blue-300 font-mono">F/NO: {safeData.fnum} | IPPS: {safeData.ipps || 'N/A'}</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 p-2 rounded-lg transition-colors cursor-pointer"
          >
            <X size={18}/>
          </button>
        </div>

        {/* MODAL BODY (TWO VERTICAL COLUMNS) */}
        <div className="p-6 overflow-y-auto bg-slate-50 flex-1 custom-scrollbar space-y-6">
          
          <div className="bg-blue-50/60 border border-blue-200 p-3 rounded-xl flex items-center justify-between text-xs font-bold text-blue-900">
            <span>🛡️ Official Nominal Roll Dossier Record</span>
            <span className="bg-white px-2.5 py-1 rounded-md shadow-sm border border-blue-200">
              Assigned Jurisdiction: {safeData.station} ({safeData.region})
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* COLUMN 1: IDENTIFIERS & DEMOGRAPHICS */}
            <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-5 space-y-3">
              <h4 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider border-b border-slate-100 pb-2">
                Personal Details & Identifiers
              </h4>
              <div className="space-y-2.5">
                {leftAttributes.map((attr, idx) => (
                  <div key={idx} className="flex flex-col border-b border-slate-50 pb-1.5">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{attr.label}</span>
                    <span className="text-xs font-extrabold text-slate-800 uppercase mt-0.5">{attr.value || '-'}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* COLUMN 2: SERVICE, DEPLOYMENT & FINANCIALS */}
            <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-5 space-y-3">
              <h4 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider border-b border-slate-100 pb-2">
                Service Record, Deployment & Financials
              </h4>
              <div className="space-y-2.5">
                {rightAttributes.map((attr, idx) => (
                  <div key={idx} className="flex flex-col border-b border-slate-50 pb-1.5">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{attr.label}</span>
                    <span className="text-xs font-extrabold text-slate-800 uppercase mt-0.5">{attr.value || '-'}</span>
                  </div>
                ))}
              </div>
            </div>

          </div>

          {safeData.last_updated_by && (
            <div className="text-center pt-2">
              <span className="text-[11px] text-slate-400 font-medium italic">
                Logged / Authorized under clearance by: {safeData.last_updated_by}
              </span>
            </div>
          )}

        </div>

        {/* MODAL FOOTER */}
        <div className="bg-white p-4 border-t border-slate-200 flex justify-end shrink-0">
          <button 
            type="button" 
            onClick={onClose} 
            className="bg-slate-900 hover:bg-slate-800 text-white font-bold py-2.5 px-6 rounded-xl text-xs transition shadow-sm cursor-pointer"
          >
            Close Dossier Viewer
          </button>
        </div>

      </div>
    </div>
  );
};

export default OfficerDossierModal;