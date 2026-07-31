import React, { useState, useEffect } from 'react';
import { Send, Mail, AlertTriangle, CheckCircle, RadioReceiver, Users, ShieldAlert, Inbox, Filter, Clock, ArrowLeft, Eye, X, Edit3, UserPlus } from 'lucide-react';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';

const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

const Admin_Communication = ({ currentUser, users, setCurrentPage }) => {
  // 🟢 Is this user a high-ranking official allowed to broadcast globally?
  const canBroadcast = ['ADMIN', 'SUPER_ADMIN', 'RPC', 'Deputy Commander'].includes(currentUser?.role);
  
  // Everyone starts at inbox, except Admins who default to Compose
  const [activeTab, setActiveTab] = useState(canBroadcast ? 'dispatch' : 'inbox'); 
  const [notification, setNotification] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // --- COMPOSITION STATE ---
  const [formData, setFormData] = useState({
    targetAudience: canBroadcast ? 'ALL_USERS' : 'SPECIFIC_USER', 
    targetRegion: 'ALL', 
    targetFnum: '', 
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

  const [viewingReceiptsFor, setViewingReceiptsFor] = useState(null);
  const [receiptsData, setReceiptsData] = useState([]);
  const [loadingReceipts, setLoadingReceipts] = useState(false);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    if (name === 'targetAudience') {
      setFormData({ 
        ...formData, 
        targetAudience: value, 
        targetRegion: value === 'SPECIFIC_REGION' ? 'KMP NORTH' : 'ALL',
        targetFnum: '' 
      });
    } else {
      setFormData({ ...formData, [name]: type === 'checkbox' ? checked : value });
    }
  };

  const handleDispatch = async (e) => {
    e.preventDefault();
    if (!formData.subject || !formData.message) return setNotification({ type: 'error', text: 'Subject and Message body are required.' });
    if (formData.targetAudience === 'SPECIFIC_USER' && !formData.targetFnum) return setNotification({ type: 'error', text: 'Please select a specific recipient from the list.' });

    setIsSubmitting(true);
    setNotification({ type: 'info', text: 'Transmitting encrypted message...' });

    try {
      const token = localStorage.getItem('kmp_authToken');
      const response = await fetch(`${API_URL}/api/v1/communications`, {
        method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({
          sender_fnum: currentUser.fnum, 
          sender_name: currentUser.name, 
          target_audience: formData.targetAudience,
          target_region: formData.targetRegion, 
          target_fnum: formData.targetFnum, 
          message_type: formData.messageType, 
          subject: formData.subject,
          message: formData.message, 
          send_email: formData.sendEmail
        })
      });

      if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.detail || "Database rejected the transmission.");
      }

      setNotification({ type: 'success', text: '✅ Message successfully dispatched securely.' });
      setFormData({ 
        ...formData, subject: '', message: '', sendEmail: false, 
        targetAudience: canBroadcast ? 'ALL_USERS' : 'SPECIFIC_USER', 
        targetRegion: 'ALL', targetFnum: '' 
      });
      if (activeTab === 'outbox') fetchMessages();
      
    } catch (err) {
      setNotification({ type: 'error', text: `❌ ${err.message}` });
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
        const data = await response.json();
        setInboxMessages(data.filter(msg => msg.sender_fnum !== currentUser.fnum || msg.target_fnum === currentUser.fnum));
        setOutboxMessages(data.filter(msg => msg.sender_fnum === currentUser.fnum));
      }
    } catch (err) { console.error("Network error fetching messages:", err); } 
    finally { setIsLoadingInbox(false); }
  };

  const fetchReceipts = async (commId) => {
    setViewingReceiptsFor(commId);
    setLoadingReceipts(true);
    try {
      const token = localStorage.getItem('kmp_authToken');
      const res = await fetch(`${API_URL}/api/v1/communications/${commId}/readers`, { headers: { 'Authorization': `Bearer ${token}` } });
      if(res.ok) setReceiptsData(await res.json());
    } catch(e) { console.error(e); } finally { setLoadingReceipts(false); }
  };

  useEffect(() => {
    if (activeTab === 'inbox' || activeTab === 'outbox') fetchMessages();
  }, [activeTab, dateFilter, customStartDate, customEndDate]);

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
    <div className="p-6 w-full max-w-[1920px] mx-auto space-y-6 relative z-10">
      
      {viewingReceiptsFor && (
        <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-sm flex justify-center items-center p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-300">
                <div className="bg-slate-900 text-white p-4 flex justify-between items-center">
                   <h3 className="font-bold flex items-center text-sm"><Eye size={16} className="mr-2 text-blue-400"/> Read Receipts Tracker</h3>
                   <button onClick={() => setViewingReceiptsFor(null)} className="hover:bg-slate-700 p-1 rounded"><X size={18}/></button>
                </div>
                <div className="p-4 max-h-[60vh] overflow-y-auto custom-scrollbar bg-slate-50">
                   {loadingReceipts ? (
                      <p className="text-xs text-center text-gray-500 font-bold animate-pulse py-4">Fetching ledgers...</p>
                   ) : receiptsData.length === 0 ? (
                      <p className="text-xs text-center text-gray-500 font-medium py-4">No officers have acknowledged this dispatch yet.</p>
                   ) : (
                       <div className="space-y-2">
                          {receiptsData.map((r, i) => (
                             <div key={i} className="flex justify-between items-center text-xs p-3 bg-white rounded shadow-sm border border-gray-100">
                                <div><span className="font-extrabold text-slate-800 block">{r.name}</span><span className="font-mono text-[9px] text-gray-400">{r.fnum}</span></div>
                                <span className="text-xs text-green-600 font-bold bg-green-50 px-2 py-1 rounded border border-green-200">Read: {r.read_at}</span>
                             </div>
                          ))}
                       </div>
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
            className="flex items-center space-x-2 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white px-4 py-2.5 rounded-lg text-sm font-bold transition-all border border-slate-700 shadow-sm shrink-0"
          >
            <ArrowLeft size={16} />
            <span>Return to Dashboard</span>
          </button>
        </div>

        <div className="flex border-b border-gray-200 bg-slate-50 overflow-x-auto">
          <button 
            onClick={() => setActiveTab('dispatch')} 
            className={`flex-1 py-4 px-4 font-bold flex items-center justify-center transition-all min-w-max ${activeTab === 'dispatch' ? 'bg-white border-b-2 border-blue-600 text-blue-700 shadow-sm' : 'text-gray-500 hover:bg-gray-100'}`}
          >
            <Edit3 className="w-5 h-5 mr-2" /> {canBroadcast ? 'Dispatch Console' : 'Compose Message / Complaint'}
          </button>
          
          <button 
            onClick={() => setActiveTab('inbox')} 
            className={`flex-1 py-4 px-4 font-bold flex items-center justify-center transition-all min-w-max ${activeTab === 'inbox' ? 'bg-white border-b-2 border-blue-600 text-blue-700 shadow-sm' : 'text-gray-500 hover:bg-gray-100'}`}
          >
            <Inbox className="w-5 h-5 mr-2" /> Command Inbox
          </button>

          <button 
            onClick={() => setActiveTab('outbox')} 
            className={`flex-1 py-4 px-4 font-bold flex items-center justify-center transition-all min-w-max ${activeTab === 'outbox' ? 'bg-white border-b-2 border-blue-600 text-blue-700 shadow-sm' : 'text-gray-500 hover:bg-gray-100'}`}
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
                          <option value="SPECIFIC_REGION">Specific Region</option>
                        </>
                      )}
                      <option value="SPECIFIC_USER">Specific Officer / Admin (Direct)</option>
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

                  {formData.targetAudience === 'SPECIFIC_USER' && (
                    <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                      <label className="block text-xs font-bold text-blue-800 uppercase tracking-wider mb-2 flex items-center"><UserPlus size={14} className="mr-1"/> Select Recipient</label>
                      <select name="targetFnum" required value={formData.targetFnum} onChange={handleInputChange} className="w-full p-2.5 bg-white border border-blue-300 rounded-md font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500">
                         <option value="" disabled>-- Select Officer --</option>
                         {(users || []).map(u => (
                            <option key={u.fnum} value={u.fnum}>{u.name} - {u.rank} ({u.fnum})</option>
                         ))}
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

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Subject / Title *</label>
                  <input type="text" name="subject" required value={formData.subject} onChange={handleInputChange} className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm font-bold text-slate-800 outline-none" placeholder="e.g., Request for leave / Investigation Update / Equipment missing..." />
                </div>

                <div className="pb-10">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Communication Body *</label>
                  <ReactQuill 
                    theme="snow" 
                    value={formData.message} 
                    onChange={(content) => setFormData({ ...formData, message: content })}
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

                <button type="submit" disabled={isSubmitting} className="w-full bg-slate-900 hover:bg-black text-white font-extrabold py-4 px-6 rounded-xl shadow-md transition-all flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed text-lg">
                  {isSubmitting ? 'Transmitting...' : <><Send size={20} className="mr-2"/> Send Secure Message</>}
                </button>
              </form>
            </>
          )}

          {(activeTab === 'inbox' || activeTab === 'outbox') && (
            <div className="space-y-6">
              
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 flex flex-col md:flex-row gap-4 items-end">
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

              {isLoadingInbox ? (
                <div className="flex justify-center items-center py-20 text-slate-400 font-bold animate-pulse">
                  <Inbox className="w-6 h-6 mr-2" /> Syncing network...
                </div>
              ) : (activeTab === 'inbox' ? inboxMessages : outboxMessages).length === 0 ? (
                <div className="bg-slate-50 border border-dashed border-slate-300 rounded-xl p-12 text-center">
                  <CheckCircle className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <h3 className="text-lg font-bold text-slate-600">Box Clear</h3>
                  <p className="text-sm text-slate-500 mt-1">No communications found for the selected time period.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {(activeTab === 'inbox' ? inboxMessages : outboxMessages).map((msg) => (
                    <div key={msg.id} className="bg-white border border-slate-200 rounded-xl shadow-sm hover:shadow-md transition-shadow overflow-hidden">
                      
                      <div className="bg-slate-50 px-5 py-3 border-b border-slate-200 flex flex-wrap justify-between items-center gap-2">
                        <div className="flex items-center space-x-3">
                          <span className={`px-3 py-1 rounded-full text-[10px] uppercase font-extrabold border ${getPriorityStyle(msg.message_type)}`}>
                            {msg.message_type.replace('_', ' ')}
                          </span>
                          <span className="text-[10px] font-bold text-slate-500 bg-slate-200 px-2 py-1 rounded border border-slate-300">
                            TO: {msg.target_audience.replace('_', ' ')} {msg.target_audience === 'SPECIFIC_REGION' ? `(${msg.target_region})` : ''} {msg.target_fnum ? `[Officer: ${msg.target_fnum}]` : ''}
                          </span>
                        </div>
                        <div className="flex items-center text-xs font-bold text-slate-400">
                          <Clock size={14} className="mr-1"/> {msg.created_at}
                        </div>
                      </div>

                      <div className="p-5">
                        <h3 className="text-lg font-extrabold text-slate-800 mb-3">{msg.subject}</h3>
                        <div className="prose prose-sm max-w-none text-slate-700" dangerouslySetInnerHTML={{ __html: msg.message }} />
                      </div>

                      {/* 🟢 NEW FOOTER WITH MSG_REF */}
                      <div className="bg-slate-50 px-5 py-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
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
                        
                        <button 
                          onClick={() => fetchReceipts(msg.id)} 
                          className="bg-blue-100 hover:bg-blue-200 text-blue-700 font-bold py-1.5 px-3 rounded transition-colors flex items-center border border-blue-200 shrink-0"
                        >
                          <Eye size={14} className="mr-1" /> View Read Receipts
                        </button>
                      </div>

                    </div>
                  ))}
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