import React from 'react';
import { X } from 'lucide-react';

const OfficerDossierModal = ({ officer, onClose }) => {
  if (!officer) return null;

  // COLUMN 1: Personal Details, Identifiers & Contact
  const leftAttributes = [
    { label: "System S/N", value: officer.sn || officer.id },
    { label: "Force Number (F/NO)", value: officer.fnum || officer.f_num },
    { label: "IPPS Number", value: officer.ipps },
    { label: "National ID Number (NIN)", value: officer.nin },
    { label: "Tax Identification (TIN)", value: officer.tin },
    { label: "Full Name", value: officer.name },
    { label: "Sex", value: officer.sex },
    { label: "Date of Birth (D.O.B)", value: officer.dob },
    { label: "Tribe / Nationality", value: officer.tribe },
    { label: "Home District", value: officer.homedist || officer.home_dist },
    { label: "Contact Telephone", value: officer.contact || officer.phone },
    { label: "Educational Level", value: officer.educlevel || officer.educ_level },
  ];

  // COLUMN 2: Service Record, Deployment & Financials
  const rightAttributes = [
    { label: "Rank", value: officer.rank },
    { label: "Official Position / Title", value: officer.position },
    { label: "Directorate", value: officer.dir },
    { label: "Command Region", value: officer.region },
    { label: "Deployment District", value: officer.district },
    { label: "Duty Station", value: officer.station },
    { label: "Division / Section", value: officer.section },
    { label: "Date of Enlistment (D.O.E)", value: officer.doe },
    { label: "Date of Posting (D.O.P)", value: officer.dopost || officer.do_post || officer.dop },
    { label: "Date of Promotion (D.O. PRO)", value: officer.dopro || officer.do_pro },
    { label: "Bank & Branch", value: officer.bankbranch || officer.bank_branch },
    { label: "Bank Account Number", value: officer.accno || officer.acc_no },
    { label: "Deployment Status", value: officer.status || "ACTIVE" },
  ];

  return (
    <div className="fixed inset-0 z-[250] bg-slate-950/70 backdrop-blur-sm flex justify-center items-center p-4 animate-in fade-in duration-200 font-sans">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh] border border-slate-300">
        
        {/* MODAL HEADER */}
        <div className="bg-slate-900 text-white px-6 py-4 flex justify-between items-center shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center font-extrabold text-white text-base shadow-inner border border-blue-400">
              {officer.name ? officer.name.charAt(0) : 'O'}
            </div>
            <div>
              <h3 className="font-extrabold text-sm tracking-wide uppercase">{officer.rank} {officer.name}</h3>
              <p className="text-[11px] text-blue-300 font-mono">F/NO: {officer.fnum || officer.f_num} | IPPS: {officer.ipps || 'N/A'}</p>
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
              Station: {officer.station} ({officer.region})
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

          {officer.last_updated_by && (
            <div className="text-center pt-2">
              <span className="text-[11px] text-slate-400 font-medium italic">
                Last modified / logged by: {officer.last_updated_by}
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