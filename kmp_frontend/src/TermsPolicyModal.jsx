// TermsPolicyModal.jsx
import React from 'react';
import { X, Shield } from 'lucide-react';

export default function TermsPolicyModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[300] flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full overflow-hidden border border-slate-300 flex flex-col max-h-[85vh]">
        <div className="bg-slate-900 text-white px-6 py-4 flex justify-between items-center shrink-0">
          <div className="flex items-center space-x-2">
            <Shield className="w-5 h-5 text-blue-400" />
            <h3 className="font-extrabold uppercase text-xs tracking-wider">
              UGANDA POLICE FORCE — KAMPALA METROPOLITAN POLICE (KMP-CSDMS)
            </h3>
          </div>
          <button onClick={onClose} className="hover:bg-slate-800 p-1.5 rounded transition cursor-pointer text-slate-300 hover:text-white">
            <X size={18} />
          </button>
        </div>
        
        <div className="p-6 overflow-y-auto space-y-6 text-xs text-slate-700 leading-relaxed custom-scrollbar bg-slate-50 flex-1">
          <div>
            <h4 className="font-black text-sm text-slate-900 uppercase border-b pb-2 mb-3">Part 1: Terms and Conditions of Use</h4>
            <div className="space-y-2">
              <p><strong>1. Acceptance of Terms:</strong> By accessing, logging into, or utilizing KMP-CSDMS, you formally acknowledge, accept, and agree to be bound by these Terms and Conditions, the User Policy, and all operational directives issued by the Uganda Police Force (UPF) command. If you do not agree to these terms, you must immediately terminate any attempt to access the platform.</p>
              <p><strong>2. Authorized Use & Eligibility:</strong> The system is a secure, restricted government asset intended solely for authorized personnel of the Uganda Police Force and designated national security stakeholders under active deployment status. Any transfer, suspension, or termination of active police service instantly revokes system access privileges.</p>
              <p><strong>3. Intellectual Property & System Ownership:</strong> All software architecture, databases, UI designs, AI models, forensic watermarking protocols, and compiled templates within KMP-CSDMS are the exclusive property of the Uganda Police Force. Unauthorized replication, reverse engineering, extraction of source code, or redistribution is strictly prohibited and subject to legal prosecution.</p>
              <p><strong>4. Limitation of Liability:</strong> The UPF Command and system administrators maintain high-grade security standards, but assume no liability for operational delays, local hardware malfunctions, network interruptions, or unauthorized data access resulting from individual user negligence or credential compromise.</p>
              <p><strong>5. Modification of Terms:</strong> Command authorities reserve the right to alter, update, or revise these Terms and Conditions at any time to align with evolving national security frameworks or technical enhancements. Continued use following updates constitutes formal acceptance of the revised terms.</p>
            </div>
          </div>

          <div>
            <h4 className="font-black text-sm text-slate-900 uppercase border-b pb-2 mb-3">Part 2: User Policy (Information Security, Data Privacy & Acceptable Use)</h4>
            <div className="space-y-2">
              <p><strong>1. Purpose & Scope:</strong> Establishes mandatory security standards, operational guardrails, and behavioral protocols for personnel accessing sensitive police records, nominal rolls, crime registers, and intelligence databases to maintain operational security (OPSEC) and public trust.</p>
              <p><strong>2. Account Security & Credential Integrity:</strong> System access credentials (Force/File Number and Secret Key/Password) are strictly personal and non-transferable. Officers are fully accountable for all activities executed under their assigned credentials. Personnel must never leave active terminals unattended without utilizing the idle curtain or logging out. Credential sharing or secondary operation is a severe disciplinary breach.</p>
              <p><strong>3. Acceptable Use of System Modules:</strong> All modules (Crime Registry, Disruptive OPS Statistics, Success Stories, Establishments, Analytics Dashboard, Nominal Roll, Tripartite Reports, and AI Command Console) must be accessed strictly for official UPF operations and investigations. Unauthorized personal lookups or exposing unverified live tactical positions via AI prompts is prohibited.</p>
              <p><strong>4. Data Classification & Forensic Watermarking:</strong> All documents and exports (.xlsx, .docx) downloaded or generated via the Universal File Intake Hub or Master Database Export are classified as RESTRICTED / LAW ENFORCEMENT RECORDS. Files are dynamically stamped with cryptographic audit tokens identifying the downloading officer and encrypted via AES-256 password protection keyed to the officer's Force Number. Tampering with or disseminating restricted data to unauthorized external parties results in immediate revocation of access and disciplinary proceedings.</p>
              <p><strong>5. Audit Logging & Command Oversight:</strong> Every action performed within KMP-CSDMS (page access, record modifications, queries, and AES-encrypted exports) is automatically tracked by audit and activity logging engines. System Administrators, Regional Police Commanders (RPCs), and Super Admins retain the right to review audit logs and investigate suspicious or anomalous activity at any time.</p>
              <p><strong>6. Compliance & Enforcement:</strong> Failure to comply results in immediate suspension of system privileges, formal investigation by command authorities, and appropriate disciplinary or legal action under the laws of Uganda and UPF standing orders.</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 border-t border-slate-200 flex justify-end shrink-0">
          <button 
            type="button"
            onClick={onClose} 
            className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-black text-xs uppercase tracking-wider shadow cursor-pointer transition"
          >
            Close Document
          </button>
        </div>
      </div>
    </div>
  );
}