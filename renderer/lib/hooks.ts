import { useState, useEffect } from 'react';
import * as db from '../db/db';
import { SyncState } from '../../shared/types';
import { networkManager } from './network-manager';
import { handleError } from './error-handler';

/**
 * useSyncState hook to subscribe to sync state changes from the main process.
 *
 * @returns {string} The current sync state.
 */
export const useSyncState = () => {
  const [syncState, setSyncState] = useState<SyncState>(SyncState.UNINITIALIZED)

  useEffect(() => {
    window.syncState.getState().then(setSyncState)
    window.syncState.onStateChange(setSyncState)
  }, [])

  return syncState
}

/**
 * usePasswordProtection hook to handle password protection and initialize app.
 *
 * @returns {Object} An object containing the password protected state, password verified state, and functions to handle password verification and update password protection state.
 */
export const usePasswordProtection = () => {
  const [passwordProtected, setPasswordProtected] = useState(false)
  const [passwordVerified, setPasswordVerified] = useState(false)
  const [isInitializing, setIsInitializing] = useState(true)

  useEffect(() => {
    initializeApp()
  }, [])

  const initializeApp = async () => {
    try {
      const hash = await db.getPasswordHash()
      if (hash && hash !== '') {
        setPasswordProtected(true)
      } else {
        setPasswordVerified(true)
      }
    } catch (error) {
      handleError(error)
      setPasswordVerified(true)
    } finally {
      setIsInitializing(false)
    }
  }

  const handlePasswordVerified = () => {
    setPasswordVerified(true)
  }

  const updatePasswordProtection = async () => {
    try {
      const hash = await db.getPasswordHash()
      if (hash && hash !== '') {
        setPasswordProtected(true)
        setPasswordVerified(false)
      } else {
        setPasswordProtected(false)
        setPasswordVerified(true)
      }
    } catch (error) {
      handleError(error)
    }
  }

  return {
    passwordProtected,
    passwordVerified,
    isInitializing,
    handlePasswordVerified,
    updatePasswordProtection
  }
}

/**
 * useNetworkSync hook to monitor network status and reinitialize S3 client when connection is restored.
 *
 * @returns {Object} An object containing the sync status.
 */
export const useNetworkSync = () => {
  const [syncStatus, setSyncStatus] = useState('initializing');

  useEffect(() => {
    const tryInitS3Client = async () => {
      if (!networkManager.isOnline()) {
        setSyncStatus('network offline');
        return;
      }

      try {
        await window.cloudSync.initS3Client();
        setSyncStatus('cloud sync success');
      } catch (err) {
        setSyncStatus('cloud sync failed');
      }
    };

    const unsubscribe = networkManager.subscribe((online) => {
      if (!online) {
        setSyncStatus('network offline');
        return;
      }
      tryInitS3Client();
    });

    tryInitS3Client();

    return unsubscribe;
  }, []);

  return { syncStatus };
};