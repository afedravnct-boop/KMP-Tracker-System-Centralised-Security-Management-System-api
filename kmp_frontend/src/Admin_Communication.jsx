import React, { useState, useEffect } from 'react';
import { Send, Mail, AlertTriangle, CheckCircle, RadioReceiver, Users, ShieldAlert, Inbox, Calendar, Filter, Clock } from 'lucide-react';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';

const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

const AdminCommunication = ({ currentUser, users }) => {
  const [activeTab, setActiveTab] = useState('dispatch'); // 'dispatch' or 'inbox'
  const [notification, setNotification] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // --- EXISTING DISPATCH STATE ---
  const [formData, setFormData] = useState({
    targetAudience: 'ALL_USERS',
    targetRegion: 'ALL',
    messageType: 'GENERAL_INFO',
    subject: '',
    message: '',
    sendEmail: false
  });

  // --- NEW INBOX STATE ---
  const [inboxMessages, setInboxMessages] = useState([]);
  const [isLoadingInbox, setIsLoadingInbox] = useState(false);
  const [dateFilter, setDateFilter] = useState('all'); // 'all', 'today', 'recent', 'old', 'custom'
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  // --- EXISTING LOGIC ---
  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    
    if (name === 'targetAudience') {
      setFormData({ 
        ...formData, 
        targetAudience: value, 
        targetRegion: value === 'SPECIFIC_REGION' ? 'KMP NORTH' : 'ALL' 
      });
    } else {
      setFormData({ ...formData, [name]: type === 'checkbox' ? checked : value });
    }
  };

  const handleDispatch = async (e) => {
    e.preventDefault();
    if (!formData.subject || !formData.message) {
      setNotification({ type: 'error', text: 'Subject and Message body are required.' });
      return;
    }

    setIsSubmitting(true);
    setNotification({ type: 'info', text: 'Transmitting encrypted broadcast...' });

    try {
      const token = localStorage.getItem('kmp_authToken');
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

      setNotification({ type: 'success', text: '✅ Broadcast successfully dispatched to targeted terminals.' });
      setFormData({ ...formData, subject: '', message: '', sendEmail: false, targetAudience: 'ALL_USERS', targetRegion: 'ALL' });
    } catch (err) {
      console.error(err);
      setNotification({ type: 'error', text: `❌ ${err.message}` });
    } finally {
      setIsSubmitting(false);
      setTimeout(() => setNotification(null), 5000);
    }
  };

  // --- NEW INBOX LOGIC ---
  const fetchInbox = async () => {
    setIsLoadingInbox(true);
    try {
      const token = localStorage.getItem('kmp_authToken');
      
      // Calculate Date Ranges
      const today = new Date();
      let start = '';
      let end = '';

      if (dateFilter === 'today') {
          start = today.toISOString().split('T')[0];
          end = today.toISOString().split('T')[0];
      } else if (dateFilter === 'recent') {
          const sevenDaysAgo = new Date(today);
          sevenDaysAgo.setDate(today.getDate() - 7);
          start = sevenDaysAgo.toISOString().split('T')[0];
          end = today.toISOString().split('T')[0];
      } else if (dateFilter === 'old') {
          const sevenDaysAgo = new Date(today);
          sevenDaysAgo.setDate(today.getDate() - 7);
          end = sevenDaysAgo.toISOString().split('T')[0]; // Older than 7 days
      } else if (dateFilter === 'custom') {
          start = customStartDate;
          end = customEndDate;
      }

      // Build URL with parameters
      let url = `${API_URL}/api/v1/Admin_Communication`;
      const params = new URLSearchParams();
      if (start) params.append('start_date', start);
      if (end) params.append('end_date', end);
      
      if (params.toString()) {
          url += `?${params.toString()}`;
      }

      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setInboxMessages(data);
      } else {
        console.error("Failed to fetch inbox messages");
      }
    } catch (err) {
      console.error("Network error fetching inbox:", err);
    } finally {
      setIsLoadingInbox(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'inbox') {
      fetchInbox();
    }
  }, [activeTab, dateFilter, customStartDate, customEndDate]);

  // Helper to color-code message types
  const getPriorityStyle = (type) => {
    switch(type) {
      case 'CRITICAL_ALERT': return 'bg-red-100 text-red-800 border-red-300';
      case 'ASSIGNMENT': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      default: return 'bg-blue-100 text-blue-800 border-blue-300';
    }
  };

  return (
    <div className="p-6 w-full max-w-[1920px] mx-auto space-y-6 relative z-10">
      <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
        
        {/* HEADER */}
        <div className="bg-slate-900 px-6 py-4 flex items-center justify-between text-white">
          <div className="flex items-center">
            <RadioReceiver className="w-6 h-6 mr-3 text-green-400 animate-pulse" />
            <div>
              <h2 className="text-xl font-extrabold tracking-wide">Command Communication Hub</h2>
              <p className="text-xs text-slate-400 mt-1 uppercase tracking-wider">Secure Directive & Notification Network</p>
            </div>
          </div>
        </div>

        {/* TAB NAVIGATION */}
        <div className="flex border-b border-gray-200 bg-slate-50">
          <button 
            onClick={() => setActiveTab('dispatch')} 
            className={`flex-1 py-4 font-bold flex items-center justify-center transition-all ${activeTab === 'dispatch' ? 'bg-white border-b-2 border-blue-600 text-blue-700 shadow-sm' : 'text-gray-500 hover:bg-gray-100'}`}
          >
            <Send className="w-5 h-5 mr-2" /> Dispatch Console
          </button>
          <button 
            onClick={() => setActiveTab('inbox')} 
            className={`flex-1 py-4 font-bold flex items-center justify-center transition-all ${activeTab === 'inbox' ? 'bg-white border-b-2 border-blue-600 text-blue-700 shadow-sm' : 'text-gray-500 hover:bg-gray-100'}`}
          >
            <Inbox className="w-5 h-5 mr-2" /> Command Inbox
          </button>
        </div>

        <div className="p-8">
          {/* ========================================================= */}
          {/* TAB 1: DISPATCH CONSOLE (Original Logic)                    */}
          {/* ========================================================= */}
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
                      <option value="ALL_USERS">All System Users</option>
                      <option value="ADMINS_ONLY">System Admins Only</option>
                      <option value="RPC_ONLY">Regional Commanders (RPCs)</option>
                      <option value="SPECIFIC_REGION">Specific Region</option>
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
                      <option value="GENERAL_INFO">General Notification (Blue)</option>
                      <option value="ASSIGNMENT">Operational Assignment (Yellow)</option>
                      <option value="CRITICAL_ALERT">Critical Security Alert (Red)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Directive Subject / Title *</label>
                  <input type="text" name="subject" required value={formData.subject} onChange={handleInputChange} className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm font-bold text-slate-800 outline-none" placeholder="e.g., URGENT: Enhanced Deployment Protocols for Weekend..." />
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
                    <Mail size={16} className="mr-2"/> Push to Registered Emails via SMTP
                  </label>
                </div>

                <button type="submit" disabled={isSubmitting} className="w-full bg-slate-900 hover:bg-black text-white font-extrabold py-4 px-6 rounded-xl shadow-md transition-all flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed text-lg">
                  {isSubmitting ? 'Transmitting...' : <><Send size={20} className="mr-2"/> Dispatch Directive to Network</>}
                </button>
              </form>
            </>
          )}

          {/* ========================================================= */}
          {/* TAB 2: COMMAND INBOX                                      */}
          {/* ========================================================= */}
          {activeTab === 'inbox' && (
            <div className="space-y-6">
              
              {/* Filter Controls */}
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

              {/* Messages List */}
              {isLoadingInbox ? (
                <div className="flex justify-center items-center py-20 text-slate-400 font-bold animate-pulse">
                  <Inbox className="w-6 h-6 mr-2" /> Syncing Inbox...
                </div>
              ) : inboxMessages.length === 0 ? (
                <div className="bg-slate-50 border border-dashed border-slate-300 rounded-xl p-12 text-center">
                  <CheckCircle className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <h3 className="text-lg font-bold text-slate-600">Inbox Clear</h3>
                  <p className="text-sm text-slate-500 mt-1">No communications found for the selected time period.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {inboxMessages.map((msg) => (
                    <div key={msg.id} className="bg-white border border-slate-200 rounded-xl shadow-sm hover:shadow-md transition-shadow overflow-hidden">
                      {/* Message Header */}
                      <div className="bg-slate-50 px-5 py-3 border-b border-slate-200 flex flex-wrap justify-between items-center gap-2">
                        <div className="flex items-center space-x-3">
                          <span className={`px-3 py-1 rounded-full text-xs font-bold border ${getPriorityStyle(msg.message_type)}`}>
                            {msg.message_type.replace('_', ' ')}
                          </span>
                          <span className="text-xs font-bold text-slate-500 bg-slate-200 px-2 py-1 rounded">
                            TO: {msg.target_audience.replace('_', ' ')} {msg.target_audience === 'SPECIFIC_REGION' ? `(${msg.target_region})` : ''}
                          </span>
                        </div>
                        <div className="flex items-center text-xs font-bold text-slate-400">
                          <Clock size={14} className="mr-1"/> {msg.created_at}
                        </div>
                      </div>

                      {/* Message Body */}
                      <div className="p-5">
                        <h3 className="text-lg font-extrabold text-slate-800 mb-3">{msg.subject}</h3>
                        {/* Render HTML safely from ReactQuill */}
                        <div 
                          className="prose prose-sm max-w-none text-slate-700" 
                          dangerouslySetInnerHTML={{ __html: msg.message }} 
                        />
                      </div>

                      {/* Message Footer */}
                      <div className="bg-slate-50 px-5 py-3 border-t border-slate-100 flex items-center text-xs text-slate-500">
                        <span className="font-bold mr-2">Dispatched By:</span> 
                        {msg.sender_name} <span className="ml-1 text-slate-400">({msg.sender_fnum})</span>
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

export default AdminCommunication;
// Forcing Vercel to sync