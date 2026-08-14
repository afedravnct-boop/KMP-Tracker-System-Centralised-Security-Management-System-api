import React, { useState } from 'react';

import { Building, PlusCircle, CheckCircle, AlertTriangle, Loader2 } from 'lucide-react';



// 🟢 FIX: Added default empty objects (= {}) to props to prevent undefined crashes

const LogEstablishment = ({ currentUser = {}, REGIONAL_HIERARCHY = {}, onEstablishmentAdded }) => {

  const [formData, setFormData] = useState({

    region: currentUser.region || 'KMP NORTH',

    division: '',

    station: currentUser.station || '',

    personnel_in_station: 0,

    sub_station: '',

    personnel_in_sub_station: 0,

    post: '',

    personnel_in_post: 0,

    booths: 0,

    location: '',

    personnel_in_booth: 0,

    status: 'OPERATIONAL',

    comment: ''

  });



  const [loading, setLoading] = useState(false);

  const [feedback, setFeedback] = useState(null);



  const handleInputChange = (e) => {

    const { name, value, type } = e.target;

    if (name === 'region') {

      setFormData({ 

        ...formData, 

        region: value, 

        division: REGIONAL_HIERARCHY[value]?.[0] || '',

        station: REGIONAL_HIERARCHY[value]?.[0] || '' 

      });

    } else {

      setFormData({ 

        ...formData, 

        [name]: type === 'number' ? parseInt(value) || 0 : value 

      });

    }

  };



  const handleSubmit = async (e) => {

    e.preventDefault();

    setLoading(true);

    setFeedback(null);



    try {

      const token = localStorage.getItem('kmp_authToken');

      const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";



      const response = await fetch(`${API_URL}/api/v1/establishments`, {

        method: "POST",

        headers: { 

          "Content-Type": "application/json",

          "Authorization": `Bearer ${token}` 

        },

        body: JSON.stringify({

          ...formData,

          installed_by: `${currentUser.name} (${currentUser.fnum})`,

          last_updated_by: `${currentUser.name} (${currentUser.fnum})`

        })

      });



      const data = await response.json();

      if (!response.ok) throw new Error(data.detail || "Failed to log establishment.");



      setFeedback({ type: 'success', message: "Establishment logged successfully!" });

      if (onEstablishmentAdded) onEstablishmentAdded();

      

      // Reset form fields

      setFormData({

        region: currentUser.region || 'KMP NORTH',

        division: '',

        station: currentUser.station || '',

        personnel_in_station: 0,

        sub_station: '',

        personnel_in_sub_station: 0,

        post: '',

        personnel_in_post: 0,

        booths: 0,

        location: '',

        personnel_in_booth: 0,

        status: 'OPERATIONAL',

        comment: ''

      });

    } catch (err) {

      setFeedback({ type: 'error', message: err.message });

    } finally {

      setLoading(false);

      setTimeout(() => setFeedback(null), 5000);

    }

  };



  const isGlobalCommand = ['SUPER_ADMIN', 'ADMIN'].includes(currentUser?.role?.toUpperCase());



  return (

    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 max-w-4xl mx-auto my-6 font-sans">

      <div className="border-b border-slate-100 pb-4 mb-6 flex items-center justify-between">

        <div>

          <h3 className="font-extrabold text-base text-slate-900 uppercase flex items-center">

            <Building className="w-5 h-5 mr-2 text-emerald-600" /> Log Police Establishment

          </h3>

          <p className="text-xs text-slate-500 mt-0.5">Register structural deployment units, stations, posts, and personnel allocation.</p>

        </div>

      </div>



      {feedback && (

        <div className={`p-3 rounded-xl text-xs font-bold flex items-center mb-6 ${feedback.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>

          {feedback.type === 'success' ? <CheckCircle className="w-4 h-4 mr-2 text-emerald-600" /> : <AlertTriangle className="w-4 h-4 mr-2 text-red-600 shrink-0" />}

          {feedback.message}

        </div>

      )}



      <form onSubmit={handleSubmit} className="space-y-4">

        {/* 🟢 SIDE-BY-SIDE GRID LAYOUT */}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          

          {/* Region */}

          <div>

            <label className="block text-xs font-bold text-slate-700 mb-1">Region *</label>

            <select 

              name="region" 

              value={formData.region} 

              onChange={handleInputChange} 

              disabled={!isGlobalCommand}

              required 

              className="w-full text-sm border-slate-300 rounded-lg shadow-sm bg-slate-50 border p-2.5 outline-none focus:border-blue-500 disabled:bg-slate-100 disabled:text-slate-500 font-bold"

            >

              {isGlobalCommand ? Object.keys(REGIONAL_HIERARCHY).map(reg => <option key={reg} value={reg}>{reg}</option>) : <option value={currentUser.region}>{currentUser.region}</option>}

            </select>

          </div>



          {/* Station */}

          <div>

            <label className="block text-xs font-bold text-slate-700 mb-1">Station *</label>

            <input 

              type="text" 

              name="station" 

              value={formData.station} 

              onChange={handleInputChange} 

              required 

              placeholder="e.g. KAWEMPE" 

              className="w-full text-sm border-slate-300 rounded-lg shadow-sm border p-2.5 outline-none focus:border-blue-500 uppercase font-bold text-slate-800" 

            />

          </div>



          {/* Division */}

          <div>

            <label className="block text-xs font-bold text-slate-700 mb-1">Division</label>

            <input 

              type="text" 

              name="division" 

              value={formData.division} 

              onChange={handleInputChange} 

              placeholder="e.g. KAMPALA" 

              className="w-full text-sm border-slate-300 rounded-lg shadow-sm border p-2.5 outline-none focus:border-blue-500 uppercase" 

            />

          </div>



          {/* Personnel in Station */}

          <div>

            <label className="block text-xs font-bold text-slate-700 mb-1">Personnel Strength (Station)</label>

            <input 

              type="number" 

              name="personnel_in_station" 

              value={formData.personnel_in_station} 

              onChange={handleInputChange} 

              min="0" 

              className="w-full text-sm border-slate-300 rounded-lg shadow-sm border p-2.5 outline-none focus:border-blue-500 font-bold text-blue-700" 

            />

          </div>



          {/* Sub-Station */}

          <div>

            <label className="block text-xs font-bold text-slate-700 mb-1">Sub-Station</label>

            <input 

              type="text" 

              name="sub_station" 

              value={formData.sub_station} 

              onChange={handleInputChange} 

              placeholder="Sub-station name if any..." 

              className="w-full text-sm border-slate-300 rounded-lg shadow-sm border p-2.5 outline-none focus:border-blue-500 uppercase" 

            />

          </div>



          {/* Personnel in Sub-Station */}

          <div>

            <label className="block text-xs font-bold text-slate-700 mb-1">Personnel Strength (Sub-Station)</label>

            <input 

              type="number" 

              name="personnel_in_sub_station" 

              value={formData.personnel_in_sub_station} 

              onChange={handleInputChange} 

              min="0" 

              className="w-full text-sm border-slate-300 rounded-lg shadow-sm border p-2.5 outline-none focus:border-blue-500 font-bold text-blue-700" 

            />

          </div>



          {/* Post */}

          <div>

            <label className="block text-xs font-bold text-slate-700 mb-1">Police Post</label>

            <input 

              type="text" 

              name="post" 

              value={formData.post} 

              onChange={handleInputChange} 

              placeholder="Post name..." 

              className="w-full text-sm border-slate-300 rounded-lg shadow-sm border p-2.5 outline-none focus:border-blue-500 uppercase" 

            />

          </div>



          {/* Personnel in Post */}

          <div>

            <label className="block text-xs font-bold text-slate-700 mb-1">Personnel Strength (Post)</label>

            <input 

              type="number" 

              name="personnel_in_post" 

              value={formData.personnel_in_post} 

              onChange={handleInputChange} 

              min="0" 

              className="w-full text-sm border-slate-300 rounded-lg shadow-sm border p-2.5 outline-none focus:border-blue-500 font-bold text-blue-700" 

            />

          </div>



          {/* Booths / Location */}

          <div>

            <label className="block text-xs font-bold text-slate-700 mb-1">Booths Count</label>

            <input 

              type="number" 

              name="booths" 

              value={formData.booths} 

              onChange={handleInputChange} 

              min="0" 

              className="w-full text-sm border-slate-300 rounded-lg shadow-sm border p-2.5 outline-none focus:border-blue-500" 

            />

          </div>



          <div>

            <label className="block text-xs font-bold text-slate-700 mb-1">Location / Zone</label>

            <input 

              type="text" 

              name="location" 

              value={formData.location} 

              onChange={handleInputChange} 

              placeholder="e.g. Zone 2 Bwaise" 

              className="w-full text-sm border-slate-300 rounded-lg shadow-sm border p-2.5 outline-none focus:border-blue-500 uppercase" 

            />

          </div>



          {/* Status */}

          <div className="md:col-span-2">

            <label className="block text-xs font-bold text-slate-700 mb-1">Operational Status</label>

            <select 

              name="status" 

              value={formData.status} 

              onChange={handleInputChange} 

              className="w-full text-sm border-slate-300 rounded-lg shadow-sm bg-white border p-2.5 outline-none focus:border-blue-500 font-bold"

            >

              <option value="OPERATIONAL">OPERATIONAL</option>

              <option value="UNDER CONSTRUCTION">UNDER CONSTRUCTION</option>

              <option value="SUSPENDED">SUSPENDED</option>

            </select>

          </div>



          {/* Comment / Remarks (Full Width) */}

          <div className="md:col-span-2">

            <label className="block text-xs font-bold text-slate-700 mb-1">Remarks / Comments</label>

            <textarea 

              name="comment" 

              value={formData.comment} 

              onChange={handleInputChange} 

              rows="2"

              placeholder="Additional logistical or structural notes..." 

              className="w-full text-sm border-slate-300 rounded-lg shadow-sm border p-2.5 outline-none focus:border-blue-500 uppercase"

            />

          </div>



        </div>



        <button 

          type="submit" 

          disabled={loading}

          className="w-full mt-4 py-3 flex justify-center items-center text-white font-bold rounded-xl shadow-md text-xs uppercase tracking-wider transition bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-300 cursor-pointer"

        >

          {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Logging Establishment...</> : <><PlusCircle className="w-4 h-4 mr-2" /> Log Establishment Record</>}

        </button>

      </form>

    </div>

  );

};



export default LogEstablishment; 

