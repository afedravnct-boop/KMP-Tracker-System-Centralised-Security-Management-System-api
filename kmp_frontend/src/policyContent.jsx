import React from 'react';

export const FullUserPolicyText = () => (
  <div className="space-y-6 text-xs text-slate-700 leading-relaxed">
    <div>
      <h4 className="font-black text-sm text-slate-900 uppercase border-b pb-2 mb-3">Part 1: Terms and Conditions of Use</h4>
      <div className="space-y-2">
        <p><strong>1. Acceptance of Terms:</strong> By accessing, logging into, or utilizing the Kampala Metropolitan Police Centralised Security Data Management System (KMP-CSDMS), you (&ldquo;the User&rdquo;) formally acknowledge, accept, and agree to be bound by these Terms and Conditions, the User Policy, and all operational directives issued by the Uganda Police Force (UPF) command. If you do not agree to these terms, you must immediately terminate any attempt to access the platform.</p>
        <p><strong>2. Authorized Use & Eligibility:</strong></p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Law Enforcement Restriction:</strong> The KMP-CSDMS is a secure, restricted government asset intended solely for authorized personnel of the Uganda Police Force and designated national security stakeholders.</li>
          <li><strong>Active Status Requirement:</strong> Access rights are strictly contingent upon an officer&rsquo;s active deployment status and formal Command approval. Any transfer, suspension, or termination of active police service instantly revokes system access privileges.</li>
        </ul>
        <p><strong>3. Intellectual Property & System Ownership:</strong></p>
        <ul className="list-disc pl-5 space-y-1">
          <li>All software architecture, databases, UI designs, AI models, forensic watermarking protocols, and compiled templates within KMP-CSDMS are the exclusive property of the Uganda Police Force.</li>
          <li>Unauthorized replication, reverse engineering, extraction of source code, or redistribution of platform components is strictly prohibited and subject to legal prosecution.</li>
        </ul>
        <p><strong>4. Limitation of Liability:</strong></p>
        <ul className="list-disc pl-5 space-y-1">
          <li>The UPF Command and system administrators maintain the platform with high-grade security and redundancy standards. However, the command assumes no liability for operational delays, local hardware malfunctions, network interruptions, or unauthorized data access resulting from individual user negligence or credential compromise.</li>
        </ul>
        <p><strong>5. Modification of Terms:</strong></p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Command authorities reserve the right to alter, update, or revise these Terms and Conditions at any time to align with evolving national security frameworks or technical enhancements. Continued use of the platform following updates constitutes formal acceptance of the revised terms.</li>
        </ul>
      </div>
    </div>

    <div>
      <h4 className="font-black text-sm text-slate-900 uppercase border-b pb-2 mb-3">Part 2: User Policy (Information Security, Data Privacy & Acceptable Use)</h4>
      <div className="space-y-2">
        <p><strong>1. Purpose & Scope:</strong> This policy establishes the mandatory security standards, operational guardrails, and behavioral protocols for all personnel authorized to access and utilize the KMP-CSDMS platform. Given the sensitive nature of police records, nominal rolls, crime registers, and intelligence databases, strict adherence to this policy is required to maintain operational security (OPSEC) and public trust.</p>
        <p><strong>2. Account Security & Credential Integrity:</strong></p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Personal Accountability:</strong> System access credentials (Force/File Number and Secret Key/Password) are strictly personal and non-transferable. Officers are fully accountable for all activities, queries, and data submissions executed under their assigned credentials.</li>
          <li><strong>Session Management:</strong> Personnel must never leave an active terminal unattended. Officers must utilize the system&rsquo;s idle curtain or manually log out when stepping away from a workstation to prevent unauthorized access.</li>
          <li><strong>Credential Sharing Prohibited:</strong> Sharing passwords or allowing secondary users to operate under another officer&rsquo;s active session constitutes a severe disciplinary breach.</li>
        </ul>
        <p><strong>3. Acceptable Use of System Modules:</strong></p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Law Enforcement Purpose Only:</strong> All modules&mdash;including the Crime Registry, Disruptive OPS Statistics, Success Stories, Establishments, Analytics Dashboard, Nominal Roll, Tripartite Reports, and AI Command Console&mdash;shall be accessed strictly for official Uganda Police Force operations and investigations.</li>
          <li><strong>Prohibition of Unauthorized Queries:</strong> Using system search tools or AI prompts to conduct personal lookups, verify non-official records, or query data outside an officer&rsquo;s lawful jurisdiction is strictly prohibited.</li>
          <li><strong>AI Interaction Guardrails:</strong> When interacting with the AI Command Console, officers must ensure prompts do not expose unverified live tactical positions or compromise ongoing sensitive operations.</li>
        </ul>
        <p><strong>4. Data Classification & Forensic Watermarking:</strong></p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Restricted Status:</strong> All documents, exports (.xlsx, .docx), and intelligence briefs downloaded or generated via the Universal File Intake Hub or Master Database Export are classified as RESTRICTED / LAW ENFORCEMENT RECORDS.</li>
          <li><strong>Cryptographic Traceability:</strong> Downloaded files are dynamically stamped with forensic metadata, digital receipts, and a unique cryptographic audit token identifying the downloading officer and encrypted via AES-256 password protection (keyed to the officer&rsquo;s Force Number). Removing, altering, or tampering with these embedded forensic stamps is a violation of command protocol.</li>
          <li><strong>Data Leakage Prevention:</strong> Disseminating restricted system data to unauthorized external parties, social media platforms, or non-law-enforcement personnel will result in immediate revocation of access and disciplinary proceedings.</li>
        </ul>
        <p><strong>5. Audit Logging & Command Oversight:</strong></p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Universal Tracking:</strong> Every action performed within the KMP-CSDMS&mdash;including page access, record modifications, queries, and AES-encrypted file exports&mdash;is automatically tracked by the system&rsquo;s audit and activity logging engines.</li>
          <li><strong>Supervisory Review:</strong> System Administrators, Regional Police Commanders (RPCs), and Super Admins retain the right to review audit logs and investigate suspicious or anomalous activity at any time.</li>
        </ul>
        <p><strong>6. Compliance & Enforcement:</strong> Failure to comply with this User & Security Policy will result in immediate suspension of system privileges, formal investigation by command authorities, and appropriate disciplinary or legal action under the laws of Uganda and Uganda Police Force standing orders. By logging into the KMP-CSDMS platform, you formally acknowledge that you have read, understood, and agreed to abide by the terms set forth in this Operational Security Policy.</p>
      </div>
    </div>

    <div>
      <h4 className="font-black text-sm text-slate-900 uppercase border-b pb-2 mb-3">Part 3: Comprehensive System User Guide</h4>
      <p className="mb-2">This guide details the step-by-step navigation and operational usage of all core features integrated within the KMP-CSDMS platform.</p>
      
      <div className="space-y-4">
        <div>
          <h5 className="font-bold text-slate-900">Section 1: Authentication & Access Portal</h5>
          <ul className="list-disc pl-5 space-y-1 mt-1">
            <li><strong>Secure Login:</strong> Access the portal using your registered Force/File Number (e.g., A/2408 or 63034) and your assigned Security Key (Password). The system implements a security lockout after 3 consecutive failed authentication attempts.</li>
            <li><strong>New Account Sign-Up:</strong> Officers without credentials can click Sign Up (Request Access), providing their Force Number, IPPS, National ID (NIN starting with CM or CF, exactly 14 characters), rank, station, position, contact details, and a mandatory passport-style identification photo. Accounts remain pending until approved by an administrator or RPC.</li>
            <li><strong>Initiating a Request:</strong> Users without pre-existing credentials can access the registration interface by clicking the &ldquo;Sign Up (Request Access)&rdquo; button located on the main login screen.</li>
            <li><strong>Mandatory Information & Validation:</strong>
              <ul className="list-circle pl-5 mt-1 space-y-1">
                <li>Applicants must provide their official File/Force Number (fnum), IPPS Number, and National ID (NIN).</li>
                <li>The National ID (NIN) is subjected to strict validation, requiring it to start with either &ldquo;CM&rdquo; or &ldquo;CF&rdquo; and be precisely 14 characters long.</li>
                <li>Additional required fields include Full Name, Rank (e.g., AIP, IP, ASP, PC), Gender/Sex, Region, Station, Position/Title, official Email, and Telephone number (must be exactly 10 digits).</li>
              </ul>
            </li>
            <li><strong>Mandatory Identification Photo:</strong> Uploading an officer identification photo is a mandatory step in the registration form, which supports direct cloud upload preview or secure fallback handling.</li>
            <li><strong>Automated Role Derivation:</strong> The system automatically assigns a user role based on the selected position or station:
              <ul className="list-circle pl-5 mt-1 space-y-1">
                <li>Selecting &ldquo;System Manager&rdquo; assigns the SUPER_ADMIN role.</li>
                <li>Selecting admin positions, divisional commander titles, KMP Headquarters, or Police Headquarters assigns the ADMIN role.</li>
                <li>Selecting RPC positions or regional commander titles assigns the RPC role.</li>
                <li>Standard deployment roles default to user-level clearances.</li>
              </ul>
            </li>
            <li><strong>Approval Workflow:</strong> Once submitted, accounts do not grant immediate access; they remain in a pending state until reviewed, verified, and explicitly approved by an authorized administrator or Regional Police Commander (RPC) via the Access Approvals module.</li>
            <li><strong>Password Recovery:</strong> Use the Forgot Security Key? utility to trigger an automated reset request routed directly to Command oversight.</li>
            <li><strong>Idle Standby (Security Curtain):</strong> If left unattended for an extended period, the system automatically activates a secure visual standby curtain featuring the UPF emblem and digital indicators to protect active terminals.</li>
          </ul>
        </div>

        <div>
          <h5 className="font-bold text-slate-900">Section 2: Home Dashboard & Navigation</h5>
          <ul className="list-disc pl-5 space-y-1 mt-1">
            <li><strong>Sidebar Menu:</strong> Provides seamless access to all functional system modules based on your clearance level.</li>
            <li><strong>Active Online Roster:</strong> View real-time indicators showing active officers currently logged into the network.</li>
            <li><strong>Network Status Badge:</strong> Displays live sync activity and tracks any offline queue packets waiting to synchronize.</li>
            <li><strong>Monday Compliance Alerts:</strong> Automated notification triggers for field commanders and data officers regarding weekly return submissions.</li>
          </ul>
        </div>

        <div>
          <h5 className="font-bold text-slate-900">Section 3: Command Communications & Direct Messaging (Admin_Communication)</h5>
          <ul className="list-disc pl-5 space-y-1 mt-1">
            <li><strong>Inbox & Outbox:</strong> Review incoming secure directives, critical alerts, complaints, and general notices. Messages are color-coded by priority (e.g., Red for Critical Alerts, Orange for Grievances, Purple for Inquiries, Blue for Notices).</li>
            <li><strong>Dispatch Console:</strong> Broadcast notifications across the force (subject to command clearance) or target specific regions/officers. Supports rich-text editing via the integrated editor and automated SMTP email forwarding copies.</li>
            <li><strong>Read Receipts & Thread Tracking:</strong> Click View Read Receipts on any dispatched message to monitor exactly which officers have acknowledged the directive and who remains pending. Use the Reply / Respond feature to open a structured, color-coded conversation thread.</li>
          </ul>
        </div>

        <div>
          <h5 className="font-bold text-slate-900">Section 4: Crime & Incident Registry (CrimeIncidentRegistry)</h5>
          <ul className="list-disc pl-5 space-y-1 mt-1">
            <li><strong>Multi-Parameter Filtering:</strong> Filter records instantly by Region, Station, Time Range (Today up to 180 Days, or Custom), and specialized filters like the Agri-Crimes Filter (which isolates produce and livestock theft while omitting unrelated incidents).</li>
            <li><strong>Case Registration & Updating:</strong> Register new incidents using custom reference prefixes (SD Ref:, CRB:, DEF:, GEF:, TAR:, CID:) combined with station hierarchy routing. Update active files by appending progress notes.</li>
            <li><strong>Status Tracking:</strong> Manage cases across lifecycle states including ACTIVE INVESTIGATION, FORWARDED TO COURT, BAIL, ACQUITTED, CLOSED / CONVICTED, and ADR.</li>
            <li><strong>Suspect Management & Mugshots:</strong> Attach individual suspect profiles (Name, Sex, Age, Tribe, Nationality, Residence, Contact, and Mental Health Status) along with secure mugshot uploads.</li>
            <li><strong>Official Crime Dossier:</strong> Click on any ledger entry to generate a printable, formatted Uganda Police Force official crime dossier complete with audit IDs and watermarks.</li>
          </ul>
        </div>

        <div>
          <h5 className="font-bold text-slate-900">Section 5: Disruptive OPS & Agricultural Statistics (Statistics)</h5>
          <ul className="list-disc pl-5 space-y-1 mt-1">
            <li><strong>Weekly Numerical Aggregates:</strong> Track 8 core operational metrics per station: Suspects Arrested, Given Bond, Cautioned, Pending Court, Taken to Court, Released by Court, Remanded, and Convicted.</li>
            <li><strong>Domain Toggle:</strong> Switch seamlessly between Disruptive OPS Statistics and Agricultural Crimes Statistics.</li>
            <li><strong>Agricultural Command Matrix:</strong> Log produce or livestock theft (e.g., cattle, coffee, vanilla) alongside recovery counts and actions. The ledger aggregates entries hierarchically by region using interactive accordion dropdowns and calculates regional and grand totals automatically.</li>
          </ul>
        </div>

        <div>
          <h5 className="font-bold text-slate-900">Section 6: Success Stories (SuccessStories)</h5>
          <ul className="list-disc pl-5 space-y-1 mt-1">
            <li><strong>Milestone Documentation:</strong> Record high-impact anti-crime achievements, tactical breakthroughs, and recoveries.</li>
            <li><strong>Case Traceability:</strong> The system automatically parses narrative text for prior references (e.g., SD Ref, CRB) and links success stories directly to matching crime records for cross-verification.</li>
            <li><strong>Evidence Attachment:</strong> Upload scene photos or exhibits directly into the achievement log.</li>
          </ul>
        </div>

        <div>
          <h5 className="font-bold text-slate-900">Section 7: Establishments & Nominal Roll (Establishments & Nominal_Roll)</h5>
          <ul className="list-disc pl-5 space-y-1 mt-1">
            <li><strong>HR Ledger Mapping:</strong> Monitor personnel distribution across regions, divisions, stations, sub-stations, posts, and booths.</li>
            <li><strong>Personnel Registry:</strong> Manage officer details, deploy personnel, handle bulk nominal roll uploads, and track archive records for separated or transferred personnel.</li>
          </ul>
        </div>

        <div>
          <h5 className="font-bold text-slate-900">Section 8: Analytics & Intelligence Reports (AnalyticsDashboard)</h5>
          <ul className="list-disc pl-5 space-y-1 mt-1">
            <li><strong>Visual Data Insights:</strong> Review dynamic graphs, cross-tabulations, and performance indicators compiled from live crime, operations, and personnel datasets.</li>
            <li><strong>Automated Briefings:</strong> Utilize backend schedulers configured to generate weekly tactical summaries.</li>
          </ul>
        </div>

        <div>
          <h5 className="font-bold text-slate-900">Section 9: Tripartite Reports & Document Hub (WordReportUpload)</h5>
          <ul className="list-disc pl-5 space-y-1 mt-1">
            <li><strong>File Intake:</strong> Upload, archive, and manage official operational documents, Word templates, and tripartite review briefs.</li>
            <li><strong>Secure Storage:</strong> Files are indexed by station and region with verified metadata tracking.</li>
          </ul>
        </div>

        <div>
          <h5 className="font-bold text-slate-900">Section 10: AI Command Intelligence Console (AICommandConsole)</h5>
          <ul className="list-disc pl-5 space-y-1 mt-1">
            <li><strong>Natural Language Querying:</strong> Interact with the embedded AI assistant to query database metrics, analyze crime trends, and draft administrative briefs safely within operational security parameters.</li>
          </ul>
        </div>

        <div>
          <h5 className="font-bold text-slate-900">Section 11: Master Database Export & Security (export_master_database)</h5>
          <ul className="list-disc pl-5 space-y-1 mt-1">
            <li><strong>Dual-Sheet Architecture:</strong> Generating a master database export produces an Excel workbook (.xlsx) where every single module features two parallel sheets:
              <ul className="list-circle pl-5 mt-1 space-y-1">
                <li><strong>Print Copy:</strong> A compact, clean summary sheet optimized for physical printing with selected essential columns.</li>
                <li><strong>Full Copy:</strong> A comprehensive sheet containing all raw NeonDB columns and detailed text attributes.</li>
              </ul>
            </li>
            <li><strong>AES-256 Encryption & Delivery:</strong> Master exports are bundled into a secure password-protected .zip archive where the extraction password is strictly keyed to the downloading officer&rsquo;s exact Force Number. Embedded cryptographic audit tokens ensure complete data traceability and prevent unauthorized leakage.</li>
          </ul>
        </div>
      </div>
    </div>

    <div>
      <h4 className="font-black text-sm text-slate-900 uppercase border-b pb-2 mb-3">Part 4: Technical Troubleshooting & System Administration Guide</h4>
      <p className="mb-2">This guide provides step-by-step diagnostic procedures and resolutions for common technical challenges encountered by station data officers, regional commanders, and system administrators.</p>
      
      <div className="space-y-4">
        <div>
          <h5 className="font-bold text-slate-900">Section 1: Authentication & Access Issues</h5>
          <ul className="list-disc pl-5 space-y-1 mt-1">
            <li><strong>Symptom 1:</strong> &ldquo;Incorrect Force Number or password&rdquo; error during login.
              <ul className="list-circle pl-5 mt-1 space-y-1">
                <li><strong>Cause:</strong> Incorrect credential entry, or account password has been reset by Command.</li>
                <li><strong>Resolution:</strong> Ensure your Force/File Number follows the correct format (e.g., A/2408 or 63034) with proper uppercase styling. If you forgot your security key, utilize the Forgot Security Key? utility on the login screen to submit a reset request to your Regional Police Commander (RPC) or System Administrator.</li>
              </ul>
            </li>
            <li><strong>Symptom 2:</strong> Account locked out after multiple failed attempts.
              <ul className="list-circle pl-5 mt-1 space-y-1">
                <li><strong>Cause:</strong> Security protocols trigger a mandatory 30-second lockout after 3 consecutive failed login attempts.</li>
                <li><strong>Resolution:</strong> Wait for the on-screen countdown timer to reach zero before attempting to log in again with verified credentials.</li>
              </ul>
            </li>
            <li><strong>Symptom 3:</strong> Pending account approval status (&ldquo;Awaiting Admin Approval&rdquo;).
              <ul className="list-circle pl-5 mt-1 space-y-1">
                <li><strong>Cause:</strong> Newly registered accounts require manual verification and clearance assignment by an authorized administrator or RPC.</li>
                <li><strong>Resolution:</strong> Contact your regional command center or system administrator to verify your credentials against the active HR Nominal Roll and approve your access clearance matrix.</li>
              </ul>
            </li>
          </ul>
        </div>

        <div>
          <h5 className="font-bold text-slate-900">Section 2: Network Connectivity & Offline Queue Synchronization</h5>
          <ul className="list-disc pl-5 space-y-1 mt-1">
            <li><strong>Symptom 1:</strong> &ldquo;Offline Mode&rdquo; indicator active on the network status badge.
              <ul className="list-circle pl-5 mt-1 space-y-1">
                <li><strong>Cause:</strong> Loss of local internet connection or temporary disruption in communication with the backend Render/NeonDB servers.</li>
                <li><strong>Resolution:</strong> The system features an automatic offline queue. You may continue registering cases or logging metrics; data will be safely stored in local memory and automatically synchronized once network connectivity is restored. Check your local router or mobile data connection.</li>
              </ul>
            </li>
            <li><strong>Symptom 2:</strong> Queued records failing to clear after reconnecting.
              <ul className="list-circle pl-5 mt-1 space-y-1">
                <li><strong>Cause:</strong> Expired authentication token during offline state.</li>
                <li><strong>Resolution:</strong> Refresh your browser or re-authenticate via the login portal to refresh your active bearer token, then trigger a manual sync or wait for the automatic background sync cycle.</li>
              </ul>
            </li>
          </ul>
        </div>

        <div>
          <h5 className="font-bold text-slate-900">Section 3: Data Entry, Duplicate Errors & File Uploads</h5>
          <ul className="list-disc pl-5 space-y-1 mt-1">
            <li><strong>Symptom 1:</strong> &ldquo;Error: This specific entry or identical narrative already exists.&rdquo;
              <ul className="list-circle pl-5 mt-1 space-y-1">
                <li><strong>Cause:</strong> The system prevents duplicate record entries by checking if an identical reference number (SD Ref, CRB, etc.) or exact narrative text has already been registered for that station.</li>
                <li><strong>Resolution:</strong> Verify your station&rsquo;s occurrence book (OB) reference number. If updating an existing case, switch the file control toggle to Update Existing rather than Register New.</li>
              </ul>
            </li>
            <li><strong>Symptom 2:</strong> Image or Mugshot upload failure.
              <ul className="list-circle pl-5 mt-1 space-y-1">
                <li><strong>Cause:</strong> Unsupported image format, excessive file size, or unstable cloud storage (S3) connectivity.</li>
                <li><strong>Resolution:</strong> Ensure uploaded images are standard web formats (JPG, PNG) under 5MB. If cloud storage is temporarily unreachable, the system will generate a temporary local preview URL allowing you to proceed with your submission.</li>
              </ul>
            </li>
          </ul>
        </div>

        <div>
          <h5 className="font-bold text-slate-900">Section 4: Master Database Export & Decryption Troubleshooting</h5>
          <ul className="list-disc pl-5 space-y-1 mt-1">
            <li><strong>Symptom 1:</strong> Browser download blocked or failing to trigger.
              <ul className="list-circle pl-5 mt-1 space-y-1">
                <li><strong>Cause:</strong> Browser popup blocker or strict MIME-type security policies blocking binary stream downloads.</li>
                <li><strong>Resolution:</strong> Allow downloads from the KMP-CSDMS domain in your browser settings. Ensure you have appropriate data export clearance assigned to your user profile.</li>
              </ul>
            </li>
            <li><strong>Symptom 2:</strong> &ldquo;Incorrect password&rdquo; error when attempting to extract the downloaded .zip master database export.
              <ul className="list-circle pl-5 mt-1 space-y-1">
                <li><strong>Cause:</strong> The downloaded archive is secured with AES-256 encryption, and the extraction password is strictly keyed to the downloading officer&rsquo;s exact Force/File Number.</li>
                <li><strong>Resolution:</strong> Enter your official Force Number exactly as registered in the system (including slashes or capitalization if required, e.g., A/2408) as the archive password.</li>
              </ul>
            </li>
          </ul>
        </div>

        <div>
          <h5 className="font-bold text-slate-900">Section 5: Session Management & Security Curtains</h5>
          <ul className="list-disc pl-5 space-y-1 mt-1">
            <li><strong>Symptom 1:</strong> Unexpected redirection to login or &ldquo;Session Expired due to inactivity&rdquo;.
              <ul className="list-circle pl-5 mt-1 space-y-1">
                <li><strong>Cause:</strong> The system automatically enforces an inactivity timeout after 30 minutes of no user interaction, or the background heartbeat token verification failed.</li>
                <li><strong>Resolution:</strong> A warning modal will appear 60 seconds prior to timeout allowing you to continue your session. If timed out, re-enter your credentials to resume work safely.</li>
              </ul>
            </li>
          </ul>
        </div>
      </div>
    </div>
  </div>
);