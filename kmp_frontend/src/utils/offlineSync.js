// src/utils/offlineSync.js

const OFFLINE_QUEUE_KEY = 'kmp_offline_submission_queue';

export const queueOfflineSubmission = (endpoint, payload) => {
  try {
    const existingQueue = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]');
    const newEntry = {
      id: Date.now(),
      endpoint,
      payload,
      timestamp: new Date().toISOString()
    };
    
    existingQueue.push(newEntry);
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(existingQueue));
    return existingQueue.length;
  } catch (error) {
    console.error('Failed to queue submission offline:', error);
    return 0;
  }
};

export const getOfflineQueueCount = () => {
  try {
    const queue = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]');
    return queue.length;
  } catch (error) {
    return 0;
  }
};

export const syncOfflineQueue = async (authToken) => {
  const queue = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]');
  if (queue.length === 0) return 0;

  const remainingQueue = [];

  for (const item of queue) {
    try {
      const response = await fetch(item.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify(item.payload)
      });

      if (!response.ok) {
        remainingQueue.push(item); 
      }
    } catch (error) {
      remainingQueue.push(item); 
    }
  }

  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(remainingQueue));
  return remainingQueue.length;
};