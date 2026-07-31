// src/utils/apiService.js
import { queueOfflineSubmission } from './offlineSync';

export const secureSubmit = async (endpoint, formData, successMessage = 'Record successfully submitted and synced!') => {
  const token = localStorage.getItem('kmp_authToken');

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(formData)
    });

    if (!res.ok) throw new Error('Server unreachable');

    alert(successMessage);
    return { success: true, offline: false };
    
  } catch (error) {
    // 🟢 UNIVERSAL FALLBACK: Automatically queues ANY failed entry locally
    const queuedCount = queueOfflineSubmission(endpoint, formData);
    alert(`Network connection lost. Record securely saved to local offline queue (${queuedCount} pending sync).`);
    return { success: false, offline: true, queuedCount };
  }
};