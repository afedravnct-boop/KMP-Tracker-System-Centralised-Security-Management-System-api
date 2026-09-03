// SystemUserGuideModal.jsx
import React from 'react';
import { X, BookOpen } from 'lucide-react';

export default function SystemUserGuideModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[300] flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full overflow-hidden border border-slate-300 flex flex-col max-h-[85vh]">
        <div className="bg-slate-900 text-white px-6 py-4 flex justify-between items-center shrink-0">
          <div className="flex items-center space-x-2">
            <BookOpen className="w-5 h-5 text-blue-400" />
            <h3 className="font-extrabold uppercase text-xs tracking-wider">
              KMP-CSDMS SYSTEM USER GUIDE
            </h3>
          </div>
          <button onClick={onClose} className="hover:bg-slate-800 p-1.5 rounded transition cursor-pointer text-slate-300 hover:text-white">
            <X size={18} />
          </button>
        </div>
        
        <div className="p-6 overflow-y-auto space-y-4 text-xs text-slate-700 leading-relaxed custom-scrollbar bg-slate-50 flex-1">
          <h4 className="font-black text-sm text-slate-900 uppercase border-b pb-2">Comprehensive Navigation & Operational Manual</h4>
          
          <div className="space-y-3">
            <p><strong>1. Authentication & Access Portal:</strong> Secure login via Force/File Number and Password requiring mandatory policy acknowledgment. Includes a 30-second security lockout after 3 failed attempts, self-service sign-up requests with strict NIN validation (`CM`/`CF`), mandatory officer photo upload, and an animated UPF idle standby security curtain.</p>
            <p><strong>2. Home Dashboard & Navigation:</strong> Central command hub featuring officer greetings, command dispatch alerts, live synchronization status badges, active online roster tracking, and Monday compliance alert triggers.</p>
            <p><strong>3. Command Communications (`Admin_Communication`):</strong> Secure messaging center featuring priority-color-coded inboxes/outboxes, a rich-text dispatch broadcast console, read-receipt verification, and threaded conversation tracking.</p>
            <p><strong>4. Crime Registry (`CrimeIncidentRegistry`):</strong> Multi-parameter filtering by region, station, and time range; specialized Agri-Crimes filtering; case registration and progress note updates; life-cycle status tracking; suspect profiling with mugshot uploads; and formal printable crime dossiers.</p>
            <p><strong>5. OPS & Agricultural Statistics (`Statistics`):</strong> Weekly numerical aggregates across 8 core operational metrics per station, domain toggling, and hierarchical agricultural command matrices tracking produce and livestock recoveries.</p>
            <p><strong>6. Success Stories (`SuccessStories`):</strong> Milestone documentation for tactical breakthroughs, automated narrative parsing linked to prior reference records (SD Ref, CRB), and direct physical evidence attachments.</p>
            <p><strong>7. Establishments & Nominal Roll (`Establishments` & `Nominal_Roll`):</strong> Regional infrastructure hierarchy mapping (divisions down to booths), human resources personnel deployment ledgers, bulk spreadsheet upload handlers, rank seniority sorting, and secure personnel archiving.</p>
            <p><strong>8. Analytics & Tripartite Hub (`AnalyticsDashboard` & `WordReportUpload`):</strong> Dynamic visual data insights, proportional share graphs, and the Universal File Intake Hub for archiving operational documents and Word templates.</p>
            <p><strong>9. AI Command Console (`AICommandConsole`):</strong> Tier-restricted RAG conversational assistant configured for natural language database querying and administrative brief drafting under strict OPSEC guardrails.</p>
            <p><strong>10. Master Database Export (`export_master_database`):</strong> Dual-sheet Excel workbook generation (Print Copy vs. Full NeonDB Copy) across all core domains, securely packaged in an AES-256 password-protected ZIP archive keyed strictly to the downloading officer's Force Number.</p>
          </div>
        </div>

        <div className="bg-white p-4 border-t border-slate-200 flex justify-end shrink-0">
          <button 
            type="button"
            onClick={onClose} 
            className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-black text-xs uppercase tracking-wider shadow cursor-pointer transition"
          >
            Close Guide
          </button>
        </div>
      </div>
    </div>
  );
}