import React, { useState, useEffect } from 'react';
import { Send, Mail, AlertTriangle, CheckCircle, RadioReceiver, Users, ShieldAlert, Inbox, Filter, Clock, ArrowLeft, Eye, X, Edit3, UserPlus } from 'lucide-react';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';

const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

// 🟢 AUTO-CAPITALIZATION ENGINE
const autoCapitalize = (text) => {
  if (!text) return text;
  return text.replace(/(^\s*|>|\.\s+|\n\s*)([a-z])/g, (match, separator, letter) => {
    return separator + letter.toUpperCase();
  });
};

// 🟢 TIME OFFSET FIX ENGINE
const adjustTimeOffset = (dateStr) => {
  if (!dateStr || dateStr === "Unknown Time") return dateStr;
  try {
    const parts = dateStr.match(/(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})(?::(\d{2}))?/);
    if (!parts) return dateStr;
    
    const year = parseInt(parts[1], 10);
    const month = parseInt(parts[2], 10) - 1;
    const day = parseInt(parts[3], 10);
    const hour = parseInt(parts[4], 10);
    const minute = parseInt(parts[5], 10);
    const second = parts[6] ? parseInt(parts[6], 10) : 0;

    const d = new Date(year, month, day, hour, minute, second);
    d.setHours(d.getHours() - 3); // 🟢 Re-calibrate time back 3 hours
    
    const pad = (n) => n.toString().padStart(2, '0');
    let adjusted = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    
    if (parts[6]) {
      adjusted += `:${pad(d.getSeconds())}`;
    }
    
    return adjusted;
  } catch (e) {
    return dateStr;
  }
};

const Admin_Communication = ({ currentUser, users, setCurrentPage, onAcknowledgeComm, initialTab }) => {
  const canBroadcast = ['ADMIN', 'SUPER_ADMIN', 'RPC', 'Deputy Commander'].includes(currentUser?.role);
  
  // 🟢 Dynamically honor initialTab from dashboard notifications
  const [activeTab, setActiveTab] = useState(
    initialTab ? initialTab.toLowerCase() : (canBroadcast ? 'dispatch' : 'inbox')
  ); 
  const [notification, setNotification] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // --- RECIPIENTS LIST FROM BACKEND ENDPOINT ---
  const [filteredRecipientsList, setFilteredRecipientsList] = useState([]);
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('ALL');
  const [selectedRegionFilter, setSelectedRegionFilter] = useState('ALL');

  // --- COMPOSITION STATE ---
  const [formData, setFormData] = useState({
    targetAudience: canBroadcast ? 'ALL_USERS' : 'SPECIFIC_USER', 
    targetRegion: 'ALL', 
    targetFnum: [], 
    messageType: canBroadcast ? 'GENERAL_INFO' : 'DIRECT_MESSAGE',
    subject: '', 
    message: '', 
    sendEmail: false
  });

  // --- INBOX & OUTBOX STATE ---
  const [inboxMessages, setInboxMessages] = useState([]);
  const [outboxMessages, setOutboxMessages] = useState([]);
  const [isLoadingInbox, setIsLoadingInbox] = useState(false);
  const [dateFilter, setDateFilter] = useState('all'); 
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  
  const [activeFilter, setActiveFilter] = useState('all');

  const [viewingReceiptsFor, setViewingReceiptsFor] = useState(null);
  const [receiptsData, setReceiptsData] = useState({ readers: [], pending: [] });
  const [loadingReceipts, setLoadingReceipts] = useState(false);

  const [expandedMsgs, setExpandedMsgs] = useState({});

  useEffect(() => {
    fetchRecipientsList();
  }, []);

  // 🟢 Keep active tab synchronized when initialTab prop changes
  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab.toLowerCase());
    }
  }, [initialTab]);

  const fetchRecipientsList = async () => {
    try {
      const token = localStorage.getItem('kmp_authToken');
      const res = await fetch(`${API_URL}/api/v1/users/recipients-list`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setFilteredRecipientsList(data);
      } else {
        setFilteredRecipientsList(users || []);
      }
    } catch (err) {
      console.error("Failed to load command recipients list:", err);
      setFilteredRecipientsList(users || []);
    }
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    if (name === 'targetAudience') {
      setFormData({ 
        ...formData, 
        targetAudience: value, 
        targetRegion: value === 'SPECIFIC_REGION' ? 'KMP NORTH' : 'ALL',
        targetFnum: [] 
      });
    } else if (name === 'subject') {
      setFormData({ ...formData, subject: autoCapitalize(value) });
    } else {
      setFormData({ ...formData, [name]: type === 'checkbox' ? checked : value });
    }
  };

  const finalSelectableRecipients = (filteredRecipientsList.length > 0 ? filteredRecipientsList : (users || [])).filter(user => {
    if (user.fnum === currentUser.fnum) return false;
    const region = (user.region || "").toUpperCase();
    
    if (selectedCategoryFilter === 'POLICE_HQ' && !region.includes("POLICE HEADQUARTERS")) return false;
    if (selectedCategoryFilter === 'KMP_HQ' && !region.includes("KMP HEADQUARTERS")) return false;
    if (selectedCategoryFilter === 'FIELD_COMMAND' && region.includes("HEADQUARTERS")) return false;

    if (selectedRegionFilter !== 'ALL' && region !== selectedRegionFilter) return false;

    return true;
  });

  const handleDispatch = async (e) => {
    e.preventDefault();
    if (!formData.subject || !formData.message) return setNotification({ type: 'error', text: 'Subject and Message body are required.' });
    if (formData.targetAudience === 'SPECIFIC_USER' && (!formData.targetFnum || formData.targetFnum.length === 0)) {
      return setNotification({ type: 'error', text: 'Please select at least one recipient from the list.' });
    }

    const containsCrossRegion = formData.targetFnum.some(fnum => {
      const recipientObj = finalSelectableRecipients.find(u => u.fnum === fnum);
      return recipientObj && recipientObj.region !== currentUser.region;
    });

    if (containsCrossRegion && !['RPC', 'DPC', 'SUPER_ADMIN', 'ADMIN'].includes(currentUser.role)) {
      return setNotification({ type: 'error', text: '⚠️ Cross-region communication requires routing through your regional RPC or DPC for approval.' });
    }

    setIsSubmitting(true);
    setNotification({ type: 'info', text: 'Transmitting encrypted message...' });

    try {
      const token = localStorage.getItem('kmp_authToken');
      const response = await fetch(`${API_URL}/api/v1/communications`, {
        method: "POST", 
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({
          sender_fnum: currentUser.fnum, 
          sender_name: currentUser.name, 
          target_audience: formData.targetAudience,
          target_region: formData.targetRegion, 
          target_fnum: formData.targetFnum, 
          message_type: formData.messageType, 
          subject: formData.subject, 
          message: formData.message, 
          send_email: formData.sendEmail,
          requires_command_approval: containsCrossRegion
        })
      });

      if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          const errorMsg = Array.isArray(errData.detail)
            ? errData.detail.map(err => `${err.loc.join(' -> ')}: ${err.msg}`).join(', ')
            : (errData.detail || "Database rejected the transmission.");
          throw new Error(errorMsg);
      }

      setNotification({ type: 'success', text: '✅ Message successfully dispatched securely.' });
      setFormData({ 
        ...formData, subject: '', message: '', sendEmail: false, 
        targetAudience: canBroadcast ? 'ALL_USERS' : 'SPECIFIC_USER', 
        targetRegion: 'ALL', targetFnum: [] 
      });
      if (activeTab === 'outbox') fetchMessages();
      
    } catch (err) {
      let errorMessage = err.message || "An unexpected error occurred during transmission.";
      if (typeof err === 'object' && err.detail) {
        errorMessage = Array.isArray(err.detail) 
          ? err.detail.map(d => `${d.loc.join(' -> ')}: ${d.msg}`).join(', ') 
          : err.detail;
      }
      setNotification({ type: 'error', text: `❌ ${errorMessage}` });
    } finally {
      setIsSubmitting(false);
      setTimeout(() => setNotification(null), 5000);
    }
  };

  const fetchMessages = async () => {
    setIsLoadingInbox(true);
    try {
      const token = localStorage.getItem('kmp_authToken');
      const today = new Date();
      let start = ''; let end = '';

      if (dateFilter === 'today') { start = today.toISOString().split('T')[0]; end = today.toISOString().split('T')[0]; } 
      else if (dateFilter === 'recent') { const sevenDaysAgo = new Date(today); sevenDaysAgo.setDate(today.getDate() - 7); start = sevenDaysAgo.toISOString().split('T')[0]; end = today.toISOString().split('T')[0]; } 
      else if (dateFilter === 'old') { const sevenDaysAgo = new Date(today); sevenDaysAgo.setDate(today.getDate() - 7); end = sevenDaysAgo.toISOString().split('T')[0];  } 
      else if (dateFilter === 'custom') { start = customStartDate; end = customEndDate; }

      let url = `${API_URL}/api/v1/Admin_Communication`;
      const params = new URLSearchParams();
      if (start) params.append('start_date', start);
      if (end) params.append('end_date', end);
      if (params.toString()) url += `?${params.toString()}`;

      const response = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });

      if (response.ok) {
        const rawData = await response.json();
        const data = rawData.map(msg => ({
            ...msg,
            created_at: adjustTimeOffset(msg.created_at)
        }));

        setInboxMessages(data.filter(msg => msg.sender_fnum !== currentUser.fnum || (msg.target_fnum && msg.target_fnum.includes(currentUser.fnum))));
        setOutboxMessages(data.filter(msg => msg.sender_fnum === currentUser.fnum));
      }
    } catch (err) { console.error("Network error fetching messages:", err); } 
    finally { setIsLoadingInbox(false); }
  };

  const fetchReceipts = async (msg) => {
    setViewingReceiptsFor(msg.id);
    setLoadingReceipts(true);
    try {
      const token = localStorage.getItem('kmp_authToken');
      const res = await fetch(`${API_URL}/api/v1/communications/${msg.id}/readers`, { headers: { 'Authorization': `Bearer ${token}` } });
      if(res.ok) {
          const rawData = await res.json();
          const readers = rawData.map(r => ({
              ...r,
              read_at: adjustTimeOffset(r.read_at)
          }));

          const allSystemUsers = filteredRecipientsList.length > 0 ? filteredRecipientsList : (users || []);
          let targetPool = [];

          const audience = msg.target_audience;
          const region = msg.target_region;

          if (audience === 'ALL_USERS' || audience === 'ALL') {
              targetPool = allSystemUsers;
          } else if (audience === 'ADMINS_ONLY') {
              targetPool = allSystemUsers.filter(u => ['ADMIN', 'SUPER_ADMIN'].includes(u.role));
          } else if (audience === 'RPC_ONLY') {
              targetPool = allSystemUsers.filter(u => ['RPC', 'ADMIN', 'SUPER_ADMIN'].includes(u.role) || (u.position || '').toUpperCase().includes('RPC'));
          } else if (audience === 'DEPUTY RPC_ONLY') {
              targetPool = allSystemUsers.filter(u => (u.position || '').toUpperCase().includes('DEPUTY'));
          } else if (audience === 'SPECIFIC_REGION') {
              targetPool = allSystemUsers.filter(u => (u.region || '').toUpperCase() === (region || '').toUpperCase());
          } else if (audience === 'SPECIFIC_USER' && msg.target_fnum) {
              targetPool = allSystemUsers.filter(u => msg.target_fnum.includes(u.fnum));
          }

          const readerFnums = new Set(readers.map(r => r.fnum));
          const pending = targetPool.filter(u => !readerFnums.has(u.fnum) && u.fnum !== msg.sender_fnum);

          setReceiptsData({ readers, pending });
      }
    } catch(e) { console.error(e); } finally { setLoadingReceipts(false); }
  };

  useEffect(() => {
    if (activeTab === 'inbox' || activeTab === 'outbox') fetchMessages();
  }, [activeTab, dateFilter, customStartDate, customEndDate]);

  const handleOpenMessage = (msg) => {
    setExpandedMsgs(prev => ({ ...prev, [msg.id]: !prev[msg.id] }));
  };

  const handleManualAcknowledge = async (e, msg) => {
    e.stopPropagation(); 
    try {
      const token = localStorage.getItem('kmp_authToken');
      const res = await fetch(`${API_URL}/api/v1/communications/${msg.id}/acknowledge`, { 
        method: 'POST', 
        headers: { 'Authorization': `Bearer ${token}` } 
      });
      
      if (res.ok) {
        setInboxMessages(prev => prev.map(m => m.id === msg.id ? { ...m, acknowledged: true } : m));
        setOutboxMessages(prev => prev.map(m => m.id === msg.id ? { ...m, acknowledged: true } : m));
        
        if (typeof onAcknowledgeComm === 'function') {
          onAcknowledgeComm(msg.id);
        }
        
        setNotification({ type: 'success', text: '✅ Message acknowledged successfully.' });
        setTimeout(() => setNotification(null), 3000);
      } else {
        throw new Error("Server rejected acknowledgment.");
      }
    } catch (err) {
      console.error("Failed to acknowledge receipt:", err);
      setNotification({ type: 'error', text: '❌ Failed to acknowledge receipt.' });
      setTimeout(() => setNotification(null), 3000);
    }
  };

  const getPriorityStyle = (type) => {
    switch(type) {
      case 'CRITICAL_ALERT': return 'bg-red-100 text-red-800 border-red-300';
      case 'COMPLAINT_GRIEVANCE': return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'ASSIGNMENT': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'DIRECT_MESSAGE': return 'bg-purple-100 text-purple-800 border-purple-300';
      default: return 'bg-blue-100 text-blue-800 border-blue-300';
    }
  };

  return (
    <div className="p-6 w-full max-w-[1920px] mx-auto space-y-6 relative z-10 font-sans">
      
      {viewingReceiptsFor && (
        <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-sm flex justify-center items-center p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-300">
                <div className="bg-slate-900 text-white p-4 flex justify-between items-center">
                   <h3 className="font-bold flex items-center text-sm"><Eye size={16} className="mr-2 text-blue-400"/> Read Receipts & Group Tracker</h3>
                   <button onClick={() => setViewingReceiptsFor(null)} className="hover:bg-slate-700 p-1 rounded cursor-pointer"><X size={18}/></button>
                </div>
                <div className="p-4 max-h-[65vh] overflow-y-auto custom-scrollbar bg-slate-50 space-y-4">
                   {loadingReceipts ? (
                     <p className="text-xs text-center text-gray-500 font-bold animate-pulse py-4">Fetching ledgers...</p>
                   ) : (
                     <>
                       <div>
                         <h4 className="text-xs font-extrabold text-green-700 uppercase tracking-wider mb-2 flex items-center">
                           <CheckCircle size={14} className="mr-1.5"/> Read & Acknowledged ({receiptsData.readers.length})
                         </h4>
                         {receiptsData.readers.length === 0 ? (
                           <p className="text-xs text-gray-400 italic bg-white p-2.5 rounded border border-slate-200">No officers have acknowledged this message yet.</p>
                         ) : (
                           <div className="space-y-1.5">
                              {receiptsData.readers.map((r, i) => (
                                 <div key={i} className="flex justify-between items-center text-xs p-2.5 bg-white rounded shadow-sm border border-green-100">
                                    <div><span className="font-extrabold text-slate-800 block">{r.name}</span><span className="font-mono text-[9px] text-gray-400">{r.fnum}</span></div>
                                    <span className="text-[11px] text-green-700 font-bold bg-green-50 px-2 py-0.5 rounded border border-green-200">{r.read_at}</span>
                                 </div>
                              ))}
                           </div>
                         )}
                       </div>

                       <div className="pt-2 border-t border-slate-200">
                         <h4 className="text-xs font-extrabold text-amber-700 uppercase tracking-wider mb-2 flex items-center">
                           <Clock size={14} className="mr-1.5"/> Pending Acknowledgment ({receiptsData.pending.length})
                         </h4>
                         {receiptsData.pending.length === 0 ? (
                           <p className="text-xs text-gray-400 italic bg-white p-2.5 rounded border border-slate-200">All targeted users have read this message!</p>
                         ) : (
                           <div className="space-y-1.5 max-h-40 overflow-y-auto custom-scrollbar pr-1">
                              {receiptsData.pending.map((p, i) => (
                                 <div key={i} className="flex justify-between items-center text-xs p-2.5 bg-white rounded shadow-sm border border-amber-100">
                                    <div><span className="font-bold text-slate-700 block">{p.rank} {p.name}</span><span className="font-mono text-[9px] text-gray-400">{p.fnum} • {p.station}</span></div>
                                    <span className="text-[10px] text-amber-700 font-bold bg-amber-50 px-2 py-0.5 rounded border border-amber-200">Unread</span>
                                 </div>
                              ))}
                           </div>
                         )}
                       </div>
                     </>
                   )}
                </div>
            </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
        
        <div className="bg-slate-900 px-6 py-4 flex items-center justify-between text-white">
          <div className="flex items-center">
            <RadioReceiver className="w-6 h-6 mr-3 text-green-400 animate-pulse" />
            <div>
              <h2 className="text-xl font-extrabold tracking-wide">Command Comms & Direct Messaging</h2>
              <p className="text-xs text-slate-400 mt-1 uppercase tracking-wider">Secure Directives, Direct Messages & Complaints Channel</p>
            </div>
          </div>

          <button
            onClick={() => setCurrentPage('home')} 
            className="flex items-center space-x-2 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white px-4 py-2.5 rounded-lg text-sm font-bold transition-all border border-slate-700 shadow-sm shrink-0 cursor-pointer"
          >
            <ArrowLeft size={16} />
            <span>Return to Dashboard</span>
          </button>
        </div>

        <div className="flex border-b border-gray-200 bg-slate-50 overflow-x-auto">
          <button 
            onClick={() => setActiveTab('dispatch')} 
            className={`flex-1 py-4 px-4 font-bold flex items-center justify-center transition-all min-w-max cursor-pointer ${activeTab === 'dispatch' ? 'bg-white border-b-2 border-blue-600 text-blue-700 shadow-sm' : 'text-gray-500 hover:bg-gray-100'}`}
          >
            <Edit3 className="w-5 h-5 mr-2" /> {canBroadcast ? 'Dispatch Console' : 'Compose Message / Complaint / Inquiry / Appointment'}
          </button>
          
          <button 
            onClick={() => setActiveTab('inbox')} 
            className={`flex-1 py-4 px-4 font-bold flex items-center justify-center transition-all min-w-max cursor-pointer ${activeTab === 'inbox' ? 'bg-white border-b-2 border-blue-600 text-blue-700 shadow-sm' : 'text-gray-500 hover:bg-gray-100'}`}
          >
            <Inbox className="w-5 h-5 mr-2" /> Command Inbox
          </button>

          <button 
            onClick={() => setActiveTab('outbox')} 
            className={`flex-1 py-4 px-4 font-bold flex items-center justify-center transition-all min-w-max cursor-pointer ${activeTab === 'outbox' ? 'bg-white border-b-2 border-blue-600 text-blue-700 shadow-sm' : 'text-gray-500 hover:bg-gray-100'}`}
          >
            <Send className="w-5 h-5 mr-2" /> Outbox (Sent)
          </button>
        </div>

        <div className="p-8">
          
          {activeTab === 'dispatch' && (
            <>
              {notification && (
                <div className={`p-4 rounded-lg mb-6 text-sm font-bold flex items-center shadow-sm ${
                  notification.type === 'error' ? 'bg-red-50 text-red-700 border border-red-200' : 
                  notification.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 
                  'bg-blue-50 text-blue-700 border border-blue-200'
                }`}>
                  {notification.type === 'error' ? <AlertTriangle className="w-5 h-5 mr-2" /> : <CheckCircle className="w-5 h-5 mr-2" />}
                  {notification.text}
                </div>
              )}

              <form onSubmit={handleDispatch} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  
                  <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center"><Users size={14} className="mr-1"/> Target Audience</label>
                    <select name="targetAudience" value={formData.targetAudience} onChange={handleInputChange} className="w-full p-2.5 bg-white border border-slate-300 rounded-md font-bold text-slate-700 outline-none focus:border-blue-500">
                      {canBroadcast && (
                        <>
                          <option value="ALL_USERS">All System Users</option>
                          <option value="ADMINS_ONLY">System Admins Only</option>
                          <option value="RPC_ONLY">Regional Commanders (RPCs)</option>
                          <option value="DEPUTY RPC_ONLY">Deputy Regional Commanders (RPCs)</option>
                          <option value="SPECIFIC_REGION">Specific Region</option>
                        </>
                      )}
                      <option value="SPECIFIC_USER">Specific Officers / Admins (Direct)</option>
                    </select>
                  </div>

                  {formData.targetAudience === 'SPECIFIC_REGION' && (
                    <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Select Region</label>
                      <select name="targetRegion" value={formData.targetRegion} onChange={handleInputChange} className="w-full p-2.5 bg-white border border-slate-300 rounded-md font-bold text-slate-700 outline-none">
                        <option value="KMP NORTH">KMP NORTH</option>
                        <option value="KMP EAST">KMP EAST</option>
                        <option value="KMP SOUTH">KMP SOUTH</option>
                        <option value="KMP HEADQUARTERS">KMP HEADQUARTERS</option>
                        <option value="POLICE HEADQUARTERS">POLICE HEADQUARTERS</option>
                      </select>
                    </div>
                  )}

                  <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center"><ShieldAlert size={14} className="mr-1"/> Priority Level</label>
                    <select name="messageType" value={formData.messageType} onChange={handleInputChange} className="w-full p-2.5 bg-white border border-slate-300 rounded-md font-bold text-slate-700 outline-none focus:border-blue-500">
                      {canBroadcast && (
                        <>
                          <option value="GENERAL_INFO">General Notification (Blue)</option>
                          <option value="ASSIGNMENT">Operational Assignment (Yellow)</option>
                          <option value="CRITICAL_ALERT">Critical Security Alert (Red)</option>
                        </>
                      )}
                      <option value="DIRECT_MESSAGE">Direct Message / Inquiry (Purple)</option>
                      <option value="COMPLAINT_GRIEVANCE">Complaint / Grievance (Orange)</option>
                    </select>
                  </div>
                </div>

                {formData.targetAudience === 'SPECIFIC_USER' && (
                  <div className="bg-blue-50 p-4 rounded-lg border border-blue-200 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-blue-900 uppercase mb-1">Filter by Command Category</label>
                        <select 
                          value={selectedCategoryFilter} 
                          onChange={(e) => setSelectedCategoryFilter(e.target.value)}
                          className="w-full p-2.5 bg-white border border-blue-300 rounded-lg text-xs font-bold text-slate-800"
                        >
                          <option value="ALL">All System Categories</option>
                          <option value="POLICE_HQ">Police Headquarters</option>
                          <option value="KMP_HQ">KMP Headquarters</option>
                          <option value="FIELD_COMMAND">Field Regions & Divisions</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-blue-900 uppercase mb-1">Filter by Specific Jurisdiction</label>
                        <select 
                          value={selectedRegionFilter} 
                          onChange={(e) => setSelectedRegionFilter(e.target.value)}
                          className="w-full p-2.5 bg-white border border-blue-300 rounded-lg text-xs font-bold text-slate-800"
                        >
                          <option value="ALL">All Active Jurisdictions</option>
                          {Array.from(new Set((filteredRecipientsList.length > 0 ? filteredRecipientsList : (users || [])).map(r => r.region))).filter(Boolean).map(reg => (
                            <option key={reg} value={reg}>{reg}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-blue-800 uppercase tracking-wider mb-2 flex items-center justify-between">
                        <span className="flex items-center"><UserPlus size={14} className="mr-1"/> Select Recipients (Multi-Select)</span>
                        <span className="text-[10px] bg-blue-200 text-blue-900 px-2 py-0.5 rounded font-mono">
                          {formData.targetFnum.length} Selected
                        </span>
                      </label>
                      
                      <div className="max-h-48 overflow-y-auto bg-white border border-blue-300 rounded-md p-2 space-y-1.5 custom-scrollbar">
                        {finalSelectableRecipients.length === 0 ? (
                          <p className="text-xs text-center text-slate-400 py-4 font-bold">No active users match the selected filters.</p>
                        ) : (
                          finalSelectableRecipients.map(u => {
                            const isChecked = formData.targetFnum.includes(u.fnum);
                            return (
                              <label key={u.fnum} className={`flex items-center justify-between p-2 rounded cursor-pointer transition-colors text-xs font-bold ${isChecked ? 'bg-blue-100/70 border border-blue-300 text-blue-900' : 'hover:bg-slate-50 text-slate-700'}`}>
                                <div className="flex items-center space-x-2">
                                  <input 
                                    type="checkbox" 
                                    checked={isChecked}
                                    onChange={(e) => {
                                      const currentList = [...formData.targetFnum];
                                      if (e.target.checked) {
                                        currentList.push(u.fnum);
                                      } else {
                                        const index = currentList.indexOf(u.fnum);
                                        if (index > -1) currentList.splice(index, 1);
                                      }
                                      setFormData({ ...formData, targetFnum: currentList });
                                    }}
                                    className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 cursor-pointer"
                                  />
                                  <span>{u.rank} {u.name} ({u.position || 'Officer'})</span>
                                </div>
                                <span className="text-[10px] uppercase font-mono text-slate-500 bg-white px-1.5 py-0.5 rounded border">{u.station} [{u.region}]</span>
                              </label>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Subject / Title *</label>
                  <input type="text" name="subject" required value={formData.subject} onChange={handleInputChange} className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm font-bold text-slate-800 outline-none" placeholder="e.g., Request for leave / Investigation Update / Equipment missing..." />
                </div>

                <div className="pb-10">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Communication Body *</label>
                  <ReactQuill 
                    theme="snow" 
                    value={formData.message} 
                    onChange={(content) => {
                      setFormData({ ...formData, message: autoCapitalize(content) });
                    }}
                    className="bg-white rounded-md h-64 mb-4"
                    modules={{ toolbar: [['bold', 'italic', 'underline'], [{'list': 'ordered'}, {'list': 'bullet'}], ['clean']] }}
                  />
                </div>

                <div className="flex items-center space-x-3 bg-blue-50 p-4 rounded-lg border border-blue-100 mt-8">
                  <input type="checkbox" id="sendEmail" name="sendEmail" checked={formData.sendEmail} onChange={handleInputChange} className="w-5 h-5 text-blue-600 rounded border-gray-300 cursor-pointer" />
                  <label htmlFor="sendEmail" className="text-sm font-bold text-blue-900 cursor-pointer flex items-center">
                    <Mail size={16} className="mr-2"/> Push notification copy to recipient's Email via SMTP
                  </label>
                </div>

                <button type="submit" disabled={isSubmitting} className="w-full bg-slate-900 hover:bg-black text-white font-extrabold py-4 px-6 rounded-xl shadow-md transition-all flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed text-lg cursor-pointer">
                  {isSubmitting ? 'Transmitting...' : <><Send size={20} className="mr-2"/> Send Secure Message</>}
                </button>
              </form>
            </>
          )}

          {(activeTab === 'inbox' || activeTab === 'outbox') && (
            <div className="space-y-6">
              
              {notification && (
                <div className={`p-4 rounded-lg text-sm font-bold flex items-center shadow-sm ${
                  notification.type === 'error' ? 'bg-red-50 text-red-700 border border-red-200' : 
                  notification.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 
                  'bg-blue-50 text-blue-700 border border-blue-200'
                }`}>
                  {notification.type === 'error' ? <AlertTriangle className="w-5 h-5 mr-2" /> : <CheckCircle className="w-5 h-5 mr-2" />}
                  {notification.text}
                </div>
              )}

              <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-4">
                <div className="flex flex-col md:flex-row gap-4 items-end">
                  <div className="flex-1 w-full">
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center"><Filter size={14} className="mr-1"/> Time Filter</label>
                    <select value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className="w-full p-2.5 bg-white border border-slate-300 rounded-md font-bold text-slate-700 outline-none focus:border-blue-500">
                      <option value="all">All Available Messages</option>
                      <option value="today">Current (Today)</option>
                      <option value="recent">Recent (Last 7 Days)</option>
                      <option value="old">Old (Older than 7 Days)</option>
                      <option value="custom">Custom Date Range (Backdate Search)</option>
                    </select>
                  </div>

                  {dateFilter === 'custom' && (
                    <>
                      <div className="flex-1 w-full">
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Start Date</label>
                        <input type="date" value={customStartDate} onChange={(e) => setCustomStartDate(e.target.value)} className="w-full p-2.5 bg-white border border-slate-300 rounded-md font-bold text-slate-700 outline-none" />
                      </div>
                      <div className="flex-1 w-full">
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">End Date</label>
                        <input type="date" value={customEndDate} onChange={(e) => setCustomEndDate(e.target.value)} className="w-full p-2.5 bg-white border border-slate-300 rounded-md font-bold text-slate-700 outline-none" />
                      </div>
                    </>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200">
                  <span className="text-xs font-bold text-slate-500 uppercase mr-2">Category Filter:</span>
                  
                  <button
                    onClick={() => setActiveFilter('all')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      activeFilter === 'all' 
                        ? 'bg-slate-900 text-white shadow' 
                        : 'bg-white text-slate-600 border border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    All Types
                  </button>

                  <button
                    onClick={() => setActiveFilter('GENERAL_INFO')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      activeFilter === 'GENERAL_INFO' 
                        ? 'bg-blue-600 text-white shadow' 
                        : 'bg-white text-slate-600 border border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    💬 Messages / Notices
                  </button>

                  <button
                    onClick={() => setActiveFilter('COMPLAINT_GRIEVANCE')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      activeFilter === 'COMPLAINT_GRIEVANCE' 
                        ? 'bg-orange-600 text-white shadow' 
                        : 'bg-white text-slate-600 border border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    ⚠️ Complaints
                  </button>

                  <button
                    onClick={() => setActiveFilter('DIRECT_MESSAGE')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      activeFilter === 'DIRECT_MESSAGE' 
                        ? 'bg-purple-600 text-white shadow' 
                        : 'bg-white text-slate-600 border border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    🔍 Inquiries
                  </button>

                  <button
                    onClick={() => setActiveFilter('ASSIGNMENT')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      activeFilter === 'ASSIGNMENT' 
                        ? 'bg-emerald-600 text-white shadow' 
                        : 'bg-white text-slate-600 border border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    📅 Appointments / Assignments
                  </button>
                </div>
              </div>

              {isLoadingInbox ? (
                <div className="flex justify-center items-center py-20 text-slate-400 font-bold animate-pulse">
                  <Inbox className="w-6 h-6 mr-2" /> Syncing network...
                </div>
              ) : (activeTab === 'inbox' ? inboxMessages : outboxMessages)
                  .filter(msg => activeFilter === 'all' || msg.message_type === activeFilter).length === 0 ? (
                <div className="bg-slate-50 border border-dashed border-slate-300 rounded-xl p-12 text-center">
                  <CheckCircle className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <h3 className="text-lg font-bold text-slate-600">Box Clear</h3>
                  <p className="text-sm text-slate-500 mt-1">No communications found matching the selected category and time period.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {(activeTab === 'inbox' ? inboxMessages : outboxMessages)
                    .filter(msg => activeFilter === 'all' || msg.message_type === activeFilter)
                    .map((msg) => {
                      const isExpanded = expandedMsgs[msg.id];
                      const isSender = msg.sender_fnum === currentUser.fnum;
                      const isUnread = !msg.acknowledged && !isSender;

                      return (
                        <div key={msg.id} className={`bg-white border ${isUnread ? 'border-blue-400 shadow-md ring-1 ring-blue-400' : 'border-slate-200'} rounded-xl shadow-sm hover:shadow-md transition-shadow overflow-hidden`}>
                          
                          <div 
                            className="bg-slate-50 px-5 py-3 border-b border-slate-200 flex flex-wrap justify-between items-center gap-2 cursor-pointer"
                            onClick={() => handleOpenMessage(msg)}
                          >
                            <div className="flex items-center space-x-3">
                              {isUnread && (
                                <span className="w-2.5 h-2.5 bg-blue-600 rounded-full animate-pulse shadow-[0_0_5px_#2563eb] shrink-0"></span>
                              )}
                              <span className={`px-3 py-1 rounded-full text-[10px] uppercase font-extrabold border ${getPriorityStyle(msg.message_type)}`}>
                                {msg.message_type.replace('_', ' ')}
                              </span>
                              <span className="text-[10px] font-bold text-slate-500 bg-slate-200 px-2 py-1 rounded border border-slate-300">
                                TO: {msg.target_audience.replace('_', ' ')} {msg.target_audience === 'SPECIFIC_REGION' ? `(${msg.target_region})` : ''}
                              </span>
                            </div>
                            <div className="flex items-center text-xs font-bold text-slate-400">
                              <Clock size={14} className="mr-1"/> {msg.created_at}
                            </div>
                          </div>

                          <div 
                            className="p-5 cursor-pointer hover:bg-slate-50/50 transition-colors"
                            onClick={() => handleOpenMessage(msg)}
                          >
                            <h3 className={`text-lg font-extrabold ${isUnread ? 'text-blue-900' : 'text-slate-800'}`}>{msg.subject}</h3>
                            
                            {!isExpanded && (
                              <p className="text-xs text-blue-600 font-bold mt-2 flex items-center">
                                <Eye size={14} className="mr-1"/> Click to open and read full message...
                              </p>
                            )}

                            {isExpanded && (
                              <div 
                                className="prose prose-sm max-w-none text-slate-700 mt-4 pt-4 border-t border-slate-100 animate-in fade-in" 
                                dangerouslySetInnerHTML={{ __html: msg.message }} 
                                onClick={(e) => e.stopPropagation()} 
                              />
                            )}
                          </div>

                          {isExpanded && (
                            <div className="bg-slate-50 px-5 py-3 border-t border-slate-100 flex flex-wrap gap-3 items-center justify-between text-xs text-slate-500 animate-in fade-in">
                              <div className="flex flex-col">
                                <div className="mb-1">
                                  <span className="font-bold mr-2">Dispatched By:</span> 
                                  {msg.sender_name} <span className="ml-1 text-slate-400">({msg.sender_fnum})</span>
                                </div>
                                {msg.msg_ref && msg.msg_ref !== 'UPF/UNKNOWN/000' && (
                                  <div className="font-mono text-[10px] text-slate-500 font-bold uppercase tracking-wider flex items-center">
                                    REF: <span className="text-blue-700 bg-blue-50/50 px-2 py-0.5 ml-1 border border-blue-100 rounded">{msg.msg_ref}</span>
                                  </div>
                                )}
                              </div>
                              
                              <div className="flex items-center space-x-2">
                                {!msg.acknowledged && !isSender && (
                                  <button 
                                    onClick={(e) => handleManualAcknowledge(e, msg)} 
                                    className="bg-green-600 hover:bg-green-700 text-white font-bold py-1.5 px-4 rounded transition-colors flex items-center shadow-sm cursor-pointer"
                                  >
                                    <CheckCircle size={14} className="mr-1.5" /> Acknowledge Receipt
                                  </button>
                                )}
                                <button 
                                  onClick={(e) => { e.stopPropagation(); fetchReceipts(msg); }} 
                                  className="bg-blue-100 hover:bg-blue-200 text-blue-700 font-bold py-1.5 px-3 rounded transition-colors flex items-center border border-blue-200 shrink-0 cursor-pointer"
                                >
                                  <Eye size={14} className="mr-1" /> View Read Receipts
                                </button>
                              </div>
                            </div>
                          )}

                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default Admin_Communication;