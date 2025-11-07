import React, { useState, useEffect } from 'react';
import * as idb from '../db/idb';

// usePasswordProtection hook to handle password protection and initialize app
export const usePasswordProtection = () => {
  const [passwordProtected, setPasswordProtected] = useState(false)
  const [passwordVerified, setPasswordVerified] = useState(false)

  useEffect(() => {
    initializeApp()
  }, [])

  const initializeApp = async () => {
    try {
      await idb.initIDB()
      
      const hash = await idb.idbGetPasswordHash()
      if (hash && hash !== '') {
        setPasswordProtected(true)
      } else {
        setPasswordVerified(true)
      }
    } catch (error) {
      console.error('Failed to initialize app:', error)
      setPasswordVerified(true)
    }
  }

  const handlePasswordVerified = () => {
    setPasswordVerified(true)
  }

  const updatePasswordProtection = async () => {
    try {
      const hash = await idb.idbGetPasswordHash()
      if (hash && hash !== '') {
        setPasswordProtected(true)
        setPasswordVerified(false)
      } else {
        setPasswordProtected(false)
        setPasswordVerified(true)
      }
    } catch (error) {
      console.error('Failed to update password protection state:', error)
    }
  }

  return {
    passwordProtected,
    passwordVerified,
    handlePasswordVerified,
    updatePasswordProtection
  }
}

// useNetworkSync hook to monitor network status and reinitialize S3 client when connection is restored
export const useNetworkSync = () => {
  const [syncStatus, setSyncStatus] = useState('initializing');

  useEffect(() => {
    const tryInitS3Client = async () => {
      if (!window.network.isOnline()) {
        console.log("network offline")
        setSyncStatus('network offline');
        return;
      }

      try {
        await window.cloudSync.initS3Client();
        setSyncStatus('cloud sync success');
      } catch (err) {
        console.log('cloud sync not initialized')
        setSyncStatus('cloud sync failed');
      }
    };

    // register for future network status changes only
    window.network.onStatusChange((online) => {
      console.log("network status change", online)
      if (!online) {
        console.log("network offline")
        setSyncStatus('network offline');
        return;
      }
      tryInitS3Client();
    });

    tryInitS3Client();
  }, []);

  return { syncStatus };
};