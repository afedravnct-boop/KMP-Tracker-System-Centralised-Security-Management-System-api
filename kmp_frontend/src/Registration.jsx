import React, { useState } from 'react';
import { authFetch } from './api'; // Use your existing authFetch utility
import './index.css';

export default function Registration({ activeTab, user }) {
  const [operation, setOperation] = useState("Register New Data");

  // Form State
  const [sdRef, setSdRef] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [offence, setOffence] = useState('');
  const [narrative, setNarrative] = useState('');
  const [suspects, setSuspects] = useState(0);
  const [status, setStatus] = useState('ACTIVE INVESTIGATION');

  const submitIncident = async (e) => {
    e.preventDefault();
    
    // PAYLOAD ALIGNED WITH CrimeReportPayload Pydantic Model
    const payload = { 
      sn: Math.floor(Math.random() * 1000000), 
      sd_Ref: sdRef,           // Matches Pydantic: sd_Ref
      region: user.region || "KMP HEADQUARTERS",
      station: user.station || "KMP HEADQUARTERS",
      date: date, 
      time: time, 
      offence: offence,
      narrative: narrative, 
      status: status, 
      suspects: parseInt(suspects, 10),
      last_Updated_By: user.fnum, // Matches Pydantic: last_Updated_By
      suspect_lockups: []        // Required to match Pydantic List type
    };

    try {
      // Using authFetch instead of standard fetch
      const response = await authFetch('/api/v1/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (response.ok) {
        alert("🚨 Case successfully registered to central database!");
        setSdRef('');
        setOffence('');
        setNarrative('');
        setSuspects(0);
      } else {
        const errorData = await response.json();
        console.error("Submission Error:", errorData);
        alert("❌ Failed to save: " + (errorData.detail || "Check backend logs"));
      }
    } catch (error) {
      console.error("Submission failed", error);
      alert("❌ Server connection error.");
    }
  };

  return (
    <div className="registration-form-container">
      <h3>⚙️ File Controls</h3>
      <select value={operation} onChange={(e) => setOperation(e.target.value)} className="form-select">
        <option value="Register New Data">🆕 Register New Data</option>
        <option value="Update Existing Data">✏️ Update Existing Data</option>
        {user?.role === 'SUPER_ADMIN' && <option value="Import Excel FORM">📂 Import Excel FORM</option>}
      </select>

      <hr />

      {activeTab === "Page1" && operation === "Register New Data" && (
        <form onSubmit={submitIncident} className="entry-form">
          
          <label>SD Reference Number (SD Ref):</label>
          <input type="text" placeholder="e.g. 14/03/07/2026" value={sdRef} onChange={(e) => setSdRef(e.target.value)} required />

          <label>Date Recorded:</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />

          <label>Time of Record:</label>
          <input type="text" placeholder="e.g. 0830Hrs" value={time} onChange={(e) => setTime(e.target.value)} required />

          <label>Offence / Incident Type *</label>
          <select value={offence} onChange={(e) => setOffence(e.target.value)} required>
            <option value="" disabled>-- Select Official Offence Category --</option>
            <option value="Murder">Murder</option>
            <option value="Aggravated Robbery">Aggravated Robbery</option>
            <option value="Theft">Theft</option>
            <option value="Assault">Assault</option>
            <option value="Burglary">Burglary</option>
            <option value="Defilement / Rape">Defilement / Rape</option>
            <option value="Traffic Accident (Fatal)">Traffic Accident (Fatal)</option>
            <option value="Traffic Accident (Minor)">Traffic Accident (Minor)</option>
            <option value="Fraud / Forgery">Fraud / Forgery</option>
            <option value="Drug Offenses">Drug Offenses</option>
            <option value="Other">Other</option>
          </select>

          <label>Full Narrative (Incident & Victim Details):</label>
          <textarea rows="4" placeholder="Detail the incident, victims involved, and immediate action taken..." value={narrative} onChange={(e) => setNarrative(e.target.value)} required />

          <label>Number of Suspects (Apprehended or Known):</label>
          <input type="number" min="0" value={suspects} onChange={(e) => setSuspects(e.target.value)} required />

          <label>Set Initial Status:</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="ACTIVE INVESTIGATION">ACTIVE INVESTIGATION</option>
            <option value="FORWARDED TO COURT">SANCTIONED (Forwarded to Court)</option>
            <option value="CLOSED / CONVICTED">CLOSED / CONVICTED</option>
            <option value="ADR">ALTERNATIVE DISPUTE RESOLUTION (ADR)</option>
          </select>

          <button type="submit" className="submit-btn primary" style={{ marginTop: "15px" }}>
            🚨 Submit Case/Report
          </button>
        </form>
      )}

      {activeTab === "Page2" && <p>Operations Statistics form goes here.</p>}
      {activeTab === "Page3" && <p>Success Stories form goes here.</p>}
      {activeTab === "Page4" && <p>Regional Establishments form goes here.</p>}
      {activeTab === "Page5" && <p>Nominal Roll form goes here.</p>}
    </div>
  );
}