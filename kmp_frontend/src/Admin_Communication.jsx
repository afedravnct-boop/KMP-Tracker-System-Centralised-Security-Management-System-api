import React, { useState, useEffect } from 'react';
import { Send, Mail, AlertTriangle, CheckCircle, RadioReceiver, Users, ShieldAlert, Inbox, Filter, Clock, ArrowLeft, Eye, X, Edit3, UserPlus, Reply, CornerDownRight } from 'lucide-react';
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
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    
    d.setHours(d.getHours() - 3); // Re-calibrate time back 3 hours
    
    const pad = (n) => n.toString().padStart(2, '0');
    let adjusted = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    
    if (dateStr.split(':').length > 2) {
      adjusted += `:${pad(d.getSeconds())}`;
    }
    
    return adjusted;
  } catch (e) {
    return dateStr;
  }
};

// 🟢 THREADING ENGINE: Parses raw messages into a threaded vertical hierarchy
const parseDateString = (dateStr) => {
  if (!dateStr || dateStr === "Unknown Time") return 0;
  return new Date(dateStr.replace(' ', 'T')).getTime() || 0;
};

const buildThreads = (flatMsgs) => {
  const sorted = [...flatMsgs].sort((a, b) => parseDateString(a.created_at) - parseDateString(b.created_at));
  const threads = [];
  const processed = new Set();

  sorted.forEach(msg => {
    if (processed.has(msg.id)) return;

    const baseSubj = msg.subject.replace(/^(RE:\s*)+/i, '').trim().toLowerCase();

    const replies = sorted.filter(m => {
      if (m.id === msg.id || processed.has(m.id)) return false;
      const mBase = m.subject.replace(/^(RE:\s*)+/i, '').trim().toLowerCase();
      const isRe = /^RE:/i.test(m.subject);
      return mBase === baseSubj && isRe;
    });

    msg.replies = replies;
    threads.push(msg);

    processed.add(msg.id);
    replies.forEach(r => processed.add(r.id));
  });

  return threads.sort((a, b) => {
    const latestA = a.replies.length > 0 ? parseDateString(a.replies[a.replies.length - 1].created_at) : parseDateString(a.created_at);
    const latestB = b.replies.length > 0 ? parseDateString(b.replies[b.replies.length - 1].created_at) : parseDateString(b.created_at);
    return latestB - latestA;
  });
};

const Admin_Communication = ({ currentUser, users, setCurrentPage, onAcknowledgeComm, initialTab }) => {
  const canBroadcast = ['ADMIN', 'SUPER_ADMIN', 'RPC', 'Deputy Commander'].includes(currentUser?.role);
  
  const [activeTab, setActiveTab] = useState(
    initialTab ? initialTab.toLowerCase() : (canBroadcast ? 'dispatch' : 'inbox')
  ); 
  const [notification, setNotification] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isReplyingTo, setIsReplyingTo] = useState(false);

  const [filteredRecipientsList, setFilteredRecipientsList] = useState([]);
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('ALL');
  const [selectedRegionFilter, setSelectedRegionFilter] = useState('ALL');

  const [formData, setFormData] = useState({
    targetAudience: canBroadcast ? 'ALL_USERS' : 'SPECIFIC_USER', 
    targetRegion: 'ALL', 
    targetFnum: [], 
    messageType: canBroadcast ? 'GENERAL_INFO' : 'DIRECT_MESSAGE',
    subject: '', 
    message: '', 
    sendEmail: false
  });

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

  useEffect(() => {
    if (initialTab) setActiveTab(initialTab.toLowerCase());
  }, [initialTab]);

  const handleTabSwitch = (tab) => {
    setActiveTab(tab);
    if (tab !== 'dispatch') {
        setIsReplyingTo(false);
        setFormData({ ...formData, subject: '', message: '' });
    }
  };

  const fetchRecipientsList = async () => {
    try {
      const token = sessionStorage.getItem('kmp_authToken');
      const res = await fetch(`${API_URL}/api/v1/users/recipients-list`, {
        headers: { 'Authorization': `Bearer ${token}` }
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

  const [replyingToDoc, setReplyingToDoc] = useState(null);

  const handleReplyToMessage = (msg) => {
    setActiveTab('dispatch');
    setIsReplyingTo(true);
    setReplyingToDoc(msg);
    
    let newSubject = msg.subject;
    if (!/^RE:/i.test(newSubject)) {
        newSubject = `RE: ${newSubject}`;
    }

    setFormData({
      ...formData,
      targetAudience: 'SPECIFIC_USER',
      targetFnum: [msg.sender_fnum],
      messageType: msg.message_type === 'COMPLAINT_GRIEVANCE' ? 'COMPLAINT_GRIEVANCE' : 'DIRECT_MESSAGE',
      subject: newSubject,
      message: ''
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
      const token = sessionStorage.getItem('kmp_authToken');
      const response = await fetch(`${API_URL}/api/v1/communications`, {
        method: "POST", 
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          sender_fnum: currentUser.fnum, 
          sender_name: currentUser.name, 
          target_audience: formData.targetAudience,
          target_region: formData.targetRegion, 
          target_fnum: formData.targetFnum, 
          message_type: formData.messageType, 
          subject: formData.subject, 
          message: autoCapitalize(formData.message), 
          send_email: formData.sendEmail,
          requires_command_approval: containsCrossRegion
        })
      });

      if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          const errorMsg = Array.isArray(errData.detail) ? errData.detail.map(err => `${err.loc.join(' -> ')}: ${err.msg}`).join(', ') : (errData.detail || "Database rejected the transmission.");
          throw new Error(errorMsg);
      }

      setNotification({ type: 'success', text: '✅ Message successfully dispatched securely.' });
      setIsReplyingTo(false);
      setReplyingToDoc(null);
      setFormData({ 
        ...formData, subject: '', message: '', sendEmail: false, 
        targetAudience: canBroadcast ? 'ALL_USERS' : 'SPECIFIC_USER', 
        targetRegion: 'ALL', targetFnum: [] 
      });
      if (activeTab === 'outbox') fetchMessages();
      
    } catch (err) {
      let errorMessage = err.message || "An unexpected error occurred during transmission.";
      if (typeof err === 'object' && err.detail) {
        errorMessage = Array.isArray(err.detail) ? err.detail.map(d => `${d.loc.join(' -> ')}: ${d.msg}`).join(', ') : err.detail;
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
      const today = new Date();
      let start = ''; let end = '';
      const todayStr = today.toISOString().split('T')[0];

      const getPastDate = (daysCount) => {
        const pastDate = new Date(today);
        pastDate.setDate(today.getDate() - daysCount);
        return pastDate.toISOString().split('T')[0];
      };

      if (dateFilter === 'today') { start = todayStr; end = todayStr; } 
      else if (dateFilter === 'recent' || dateFilter === 'last_7') { start = getPastDate(7); end = todayStr; } 
      else if (dateFilter === 'last_14') { start = getPastDate(14); end = todayStr; }
      else if (dateFilter === 'last_21') { start = getPastDate(21); end = todayStr; }
      else if (dateFilter === 'last_30') { start = getPastDate(30); end = todayStr; }
      else if (dateFilter === 'last_60') { start = getPastDate(60); end = todayStr; }
      else if (dateFilter === 'last_90') { start = getPastDate(90); end = todayStr; }
      else if (dateFilter === 'last_120') { start = getPastDate(120); end = todayStr; }
      else if (dateFilter === 'last_180') { start = getPastDate(180); end = todayStr; }
      else if (dateFilter === 'old') { end = getPastDate(7); } 
      else if (dateFilter === 'custom') { start = customStartDate; end = customEndDate; }

      let url = `${API_URL}/api/v1/communications`;
      const params = new URLSearchParams();
      if (start) params.append('start_date', start);
      if (end) params.append('end_date', end);
      if (params.toString()) url += `?${params.toString()}`;

      const token = sessionStorage.getItem('kmp_authToken');
      const response = await fetch(url, { 
        method: 'GET',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const rawData = await response.json();
        const messageArray = Array.isArray(rawData) ? rawData : (rawData.messages || []);
        
        const data = messageArray.map(msg => ({
            ...msg,
            created_at: adjustTimeOffset(msg.created_at)
        }));

        const userFnum = currentUser?.fnum || "";
        const threadedData = buildThreads(data);

        setInboxMessages(threadedData.filter(t => t.sender_fnum !== userFnum || t.replies.some(r => r.sender_fnum !== userFnum)));
        setOutboxMessages(threadedData.filter(t => t.sender_fnum === userFnum || t.replies.some(r => r.sender_fnum === userFnum)));
      }
    } catch (err) { 
      console.error("Network error fetching messages:", err); 
    } finally { 
      setIsLoadingInbox(false); 
    }
  };

  const fetchReceipts = async (msg) => {
    setViewingReceiptsFor(msg.id);
    setLoadingReceipts(true);
    try {
      const token = sessionStorage.getItem('kmp_authToken');
      const res = await fetch(`${API_URL}/api/v1/communications/${msg.id}/readers`, { 
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
      });
      
      if (res.ok) {
        const rawData = await res.json();
        const readers = rawData.map(r => ({ ...r, read_at: adjustTimeOffset(r.read_at) }));

        const allSystemUsers = filteredRecipientsList.length > 0 ? filteredRecipientsList : (users || []);
        let targetPool = [];
        const audience = msg.target_audience;
        const region = msg.target_region;

        if (audience === 'ALL_USERS' || audience === 'ALL') targetPool = allSystemUsers;
        else if (audience === 'ADMINS_ONLY') targetPool = allSystemUsers.filter(u => ['ADMIN', 'SUPER_ADMIN'].includes(u.role));
        else if (audience === 'RPC_ONLY') targetPool = allSystemUsers.filter(u => ['RPC', 'ADMIN', 'SUPER_ADMIN'].includes(u.role) || (u.position || '').toUpperCase().includes('RPC'));
        else if (audience === 'DEPUTY RPC_ONLY') targetPool = allSystemUsers.filter(u => (u.position || '').toUpperCase().includes('DEPUTY'));
        else if (audience === 'SPECIFIC_REGION') targetPool = allSystemUsers.filter(u => (u.region || '').toUpperCase() === (region || '').toUpperCase());
        else if (audience === 'SPECIFIC_USER' && msg.target_fnum) {
            const targetFnumsArray = Array.isArray(msg.target_fnum) ? msg.target_fnum : String(msg.target_fnum).split(',').map(f => f.trim());
            targetPool = allSystemUsers.filter(u => targetFnumsArray.includes(u.fnum));
        }

        const readerFnums = new Set(readers.map(r => r.fnum));
        const pending = targetPool.filter(u => !readerFnums.has(u.fnum) && u.fnum !== msg.sender_fnum);

        setReceiptsData({ readers, pending });
      }
    } catch(e) { console.error(e); } 
    finally { setLoadingReceipts(false); }
  };

  useEffect(() => {
    if (activeTab === 'inbox' || activeTab === 'outbox') fetchMessages();
  }, [activeTab, dateFilter, customStartDate, customEndDate]);

  // 🟢 AUTOMATIC THREAD-WIDE READ STATUS CLEARING
  const handleOpenMessage = async (msg) => {
    const willExpand = !expandedMsgs[msg.id];
    setExpandedMsgs(prev => ({ ...prev, [msg.id]: willExpand }));

    const isSender = msg.sender_fnum === currentUser?.fnum;
    if (willExpand && !isSender) {
      try {
        const token = sessionStorage.getItem('kmp_authToken');
        
        // Collect root message ID and all unacknowledged reply IDs including nested replies
        const idsToAcknowledge = [msg.id];
        const collectReplyIds = (repliesList) => {
          if (!repliesList || repliesList.length === 0) return;
          repliesList.forEach(reply => {
            if (!reply.acknowledged && reply.sender_fnum !== currentUser?.fnum) {
              idsToAcknowledge.push(reply.id);
            }
            if (reply.replies && reply.replies.length > 0) {
              collectReplyIds(reply.replies);
            }
          });
        };
        collectReplyIds(msg.replies);

        await Promise.all(
          idsToAcknowledge.map(async (targetId) => {
            const encodedId = encodeURIComponent(encodeURIComponent(targetId));
            await fetch(`${API_URL}/api/v1/communications/${encodedId}/acknowledge`, { 
              method: 'POST', 
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
            });
          })
        );
        
        // Recursively update local UI state for all nested replies
        const markAllReadRecursive = (item) => ({
          ...item,
          acknowledged: true,
          replies: (item.replies || []).map(markAllReadRecursive)
        });

        setInboxMessages(prev => prev.map(m => m.id === msg.id ? markAllReadRecursive(m) : m));
        setOutboxMessages(prev => prev.map(m => m.id === msg.id ? markAllReadRecursive(m) : m));

        if (typeof onAcknowledgeComm === 'function') {
          idsToAcknowledge.forEach(id => onAcknowledgeComm(id));
        }

      } catch (err) {
        console.error("Automatic response read-detection error:", err);
      }
    }
  };

  // 🟢 BULK MARK ALL INBOX MESSAGES AS READ
  const handleMarkAllAsRead = async () => {
    try {
      const token = sessionStorage.getItem('kmp_authToken');
      const unreadList = inboxMessages.filter(m => !m.acknowledged);
      
      if (unreadList.length === 0) {
        setNotification({ type: 'info', text: 'ℹ️ Your inbox has no unread messages.' });
        setTimeout(() => setNotification(null), 3000);
        return;
      }

      await Promise.all(
        unreadList.map(async (msg) => {
          const encodedId = encodeURIComponent(encodeURIComponent(msg.id));
          await fetch(`${API_URL}/api/v1/communications/${encodedId}/acknowledge`, { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
          });
        })
      );

      const markAllReadRecursive = (item) => ({
        ...item,
        acknowledged: true,
        replies: (item.replies || []).map(markAllReadRecursive)
      });

      setInboxMessages(prev => prev.map(markAllReadRecursive));
      setNotification({ type: 'success', text: '✅ All inbox messages marked as read.' });
      setTimeout(() => setNotification(null), 3000);
    } catch (err) {
      console.error("Bulk acknowledge error:", err);
      setNotification({ type: 'error', text: '❌ Failed to mark all messages as read.' });
      setTimeout(() => setNotification(null), 3000);
    }
  };

  const handleManualAcknowledge = async (e, msg) => {
    e.stopPropagation(); 
    try {
      const token = sessionStorage.getItem('kmp_authToken');
      const encodedMsgId = encodeURIComponent(encodeURIComponent(msg.id));
      
      const res = await fetch(`${API_URL}/api/v1/communications/${encodedMsgId}/acknowledge`, { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
      });
      
      if (res.ok) {
        setInboxMessages(prev => prev.map(m => m.id === msg.id ? { ...m, acknowledged: true } : m));
        setOutboxMessages(prev => prev.map(m => m.id === msg.id ? { ...m, acknowledged: true } : m));
        
        if (typeof onAcknowledgeComm === 'function') onAcknowledgeComm(msg.id);
        
        setNotification({ type: 'success', text: '✅ Message acknowledged successfully.' });
        setTimeout(() => setNotification(null), 3000);
      } else {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || "Server rejected acknowledgment.");
      }
    } catch (err) {
      setNotification({ type: 'error', text: `❌ ${err.message || 'Failed to acknowledge receipt.'}` });
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
      
      {/* Quill Editor Dark Mode Override Style */}
      <style>{`
        .quill-editor-container .ql-editor {
          color: #0f172a !important;
          background-color: #ffffff !important;
        }
        .quill-editor-container .ql-toolbar {
          background-color: #f8fafc !important;
        }
      `}</style>

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
            onClick={() => handleTabSwitch('dispatch')} 
            className={`flex-1 py-4 px-4 font-bold flex items-center justify-center transition-all min-w-max cursor-pointer ${activeTab === 'dispatch' ? 'bg-white border-b-2 border-blue-600 text-blue-700 shadow-sm' : 'text-gray-500 hover:bg-gray-100'}`}
          >
            <Edit3 className="w-5 h-5 mr-2" /> {canBroadcast ? 'Dispatch Console' : 'Compose Message / Complaint / Inquiry / Appointment'}
          </button>
          
          <button 
            onClick={() => handleTabSwitch('inbox')} 
            className={`flex-1 py-4 px-4 font-bold flex items-center justify-center transition-all min-w-max cursor-pointer ${activeTab === 'inbox' ? 'bg-white border-b-2 border-blue-600 text-blue-700 shadow-sm' : 'text-gray-500 hover:bg-gray-100'}`}
          >
            <Inbox className="w-5 h-5 mr-2" /> Command Inbox
          </button>

          <button 
            onClick={() => handleTabSwitch('outbox')} 
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
                    {/* 🟢 Locked recipient view when replying to a direct message */}
                    {isReplyingTo && replyingToDoc ? (
                      <div className="flex items-center justify-between p-3 bg-white rounded-lg border border-blue-300 text-xs font-bold text-blue-900">
                        <span>🔒 Direct Reply Recipient: {replyingToDoc.sender_name} ({replyingToDoc.sender_fnum})</span>
                        <span className="text-[10px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded uppercase font-mono">Locked Thread</span>
                      </div>
                    ) : (
                      <>
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
                      </>
                    )}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Subject / Title *</label>
                  <input 
                    type="text" 
                    name="subject" 
                    required 
                    value={formData.subject} 
                    onChange={handleInputChange} 
                    disabled={isReplyingTo}
                    className={`w-full p-3 border rounded-lg text-sm font-bold outline-none ${isReplyingTo ? 'bg-slate-100 text-slate-500 border-slate-200 cursor-not-allowed' : 'bg-white border-slate-300 text-slate-800 focus:ring-2 focus:ring-blue-500'}`} 
                    placeholder="e.g., Request for leave / Investigation Update / Equipment missing..." 
                  />
                  {isReplyingTo && <p className="text-[10px] text-amber-600 mt-1 font-bold">Subject is locked to maintain accurate communication threads.</p>}
                </div>

                {/* 🟢 SEPARATED ORIGINAL MESSAGE REFERENCE BANNER */}
                {isReplyingTo && replyingToDoc && (
                  <div className="bg-slate-100 border-l-4 border-indigo-600 p-4 rounded-r-lg space-y-2 mb-4 shadow-sm">
                    <div className="flex justify-between items-center text-xs text-slate-500 font-bold uppercase">
                      <span>Replying to Message From: {replyingToDoc.sender_name} ({replyingToDoc.sender_fnum})</span>
                      <span className="font-mono">{replyingToDoc.created_at}</span>
                    </div>
                    <div className="text-xs font-bold text-slate-800">{replyingToDoc.subject}</div>
                    <div className="text-xs text-slate-600 bg-white p-3 rounded border border-slate-200 max-h-28 overflow-y-auto" dangerouslySetInnerHTML={{ __html: replyingToDoc.message }} />
                  </div>
                )}

                <div className="pb-12">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    {isReplyingTo ? 'Your Response Body *' : 'Communication Body *'}
                  </label>
                  {/* 🟢 Dark-mode protected Quill Editor container wrapper */}
                  <div className="quill-editor-container bg-white rounded-md shadow-sm">
                    <ReactQuill 
                      theme="snow" 
                      value={formData.message} 
                      onChange={(content) => {
                        setFormData({ ...formData, message: content });
                      }}
                      style={{ height: '300px', marginBottom: '40px' }}
                      modules={{ toolbar: [['bold', 'italic', 'underline'], [{'list': 'ordered'}, {'list': 'bullet'}], ['clean']] }}
                    />
                  </div>
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
                <div className="flex flex-col md:flex-row gap-4 items-end justify-between">
                  <div className="flex-1 w-full">
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center"><Filter size={14} className="mr-1"/> Time Filter</label>
                    <select 
                      value={dateFilter} 
                      onChange={(e) => setDateFilter(e.target.value)} 
                      className="w-full p-2.5 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-md font-bold outline-none focus:border-blue-500 cursor-pointer"
                    >
                      <option value="all">All Available Messages</option>
                      <option value="today">Current (Today)</option>
                      <option value="last_7">Recent (Last 7 Days)</option>
                      <option value="last_14">Last 14 Days</option>
                      <option value="last_21">Last 21 Days</option>
                      <option value="last_30">Last 30 Days</option>
                      <option value="last_60">Last 60 Days</option>
                      <option value="last_90">Last 90 Days</option>
                      <option value="last_120">Last 120 Days</option>
                      <option value="last_180">Last 180 Days</option>
                      <option value="old">Old (Older than 7 Days)</option>
                      <option value="custom">Custom Date Range (Backdate Search)</option>
                    </select>
                  </div>

                  {activeTab === 'inbox' && (
                    <div className="shrink-0">
                      <button 
                        onClick={handleMarkAllAsRead}
                        className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-4 rounded-lg text-xs shadow-sm transition-colors cursor-pointer flex items-center"
                      >
                        <CheckCircle size={14} className="mr-1.5" /> Mark All as Read
                      </button>
                    </div>
                  )}

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
                      const isSender = msg.sender_fnum === currentUser?.fnum;
                      const isUnread = !msg.acknowledged && !isSender;

                      return (
                        <div key={msg.id} className={`border rounded-xl transition-all overflow-hidden ${
                          isUnread 
                            ? 'bg-white border-blue-400 shadow-md ring-1 ring-blue-400' 
                            : 'bg-slate-50/60 border-slate-300 opacity-85 shadow-none'
                        }`}>
                          
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
                                <Eye size={14} className="mr-1"/> Click to open and read full message thread...
                              </p>
                            )}

                            {isExpanded && (
                              <div className="prose prose-sm max-w-none text-slate-700 mt-4 pt-4 border-t border-slate-100 animate-in fade-in space-y-4">
                                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 leading-relaxed" dangerouslySetInnerHTML={{ __html: msg.message }} onClick={(e) => e.stopPropagation()} />
                                
                                {msg.replies && msg.replies.length > 0 && (
                                  <div className="mt-8 pt-6 border-t-2 border-indigo-100 space-y-4">
                                    <h4 className="text-xs font-extrabold text-indigo-900 uppercase tracking-wider flex items-center bg-indigo-50 p-2.5 rounded-lg border border-indigo-200 w-max shadow-sm">
                                      <span className="w-2.5 h-2.5 bg-indigo-600 rounded-full mr-2 shadow-sm animate-pulse"></span>
                                      Threaded Responses ({msg.replies.length})
                                    </h4>
                                    
                                    <div className="space-y-4">
                                      {msg.replies.map((reply, rIdx) => (
                                        <div key={rIdx} className="bg-indigo-50/40 p-5 rounded-xl border-2 border-indigo-200/80 shadow-sm relative overflow-hidden">
                                          <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-indigo-600"></div>

                                          <div className="flex justify-between items-center border-b border-indigo-100 pb-2 mb-3 pl-2">
                                            <span className="font-extrabold text-indigo-950 uppercase text-xs tracking-tight flex items-center">
                                              <CornerDownRight size={14} className="mr-1.5 text-indigo-600" />
                                              Response From: {reply.sender_name} <span className="font-mono text-indigo-700 font-semibold ml-1.5">({reply.sender_fnum})</span>
                                            </span>
                                            <span className="text-[10px] text-slate-600 font-mono font-bold bg-white px-2.5 py-1 rounded border border-indigo-100 shadow-sm">
                                              {reply.created_at}
                                            </span>
                                          </div>
                                          
                                          <div className="text-slate-800 text-xs leading-relaxed bg-white p-4 rounded-lg border border-indigo-100 shadow-inner" dangerouslySetInnerHTML={{ __html: reply.message }} onClick={(e) => e.stopPropagation()} />
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
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
                                {!isSender && (
                                  <button 
                                    onClick={(e) => { e.stopPropagation(); handleReplyToMessage(msg); }} 
                                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-1.5 px-4 rounded transition-colors flex items-center shadow-sm cursor-pointer"
                                  >
                                    <Reply size={14} className="mr-1.5" /> Reply / Respond
                                  </button>
                                )}

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