import { useState, useEffect } from 'react';
import * as db from '../db/db';
import { SyncState } from '../../shared/types';
import { networkManager } from './network-manager';
import { handleError } from './error-handler';

// Subscribes to sync state changes pushed from the main process.
export const useSyncState = () => {
  const [syncState, setSyncState] = useState<SyncState>(SyncState.UNINITIALIZED)

  useEffect(() => {
    window.syncState.getState().then(setSyncState)
    window.syncState.onStateChange(setSyncState)
  }, [])

  return syncState
}

// Checks for a stored password hash on mount and gates app content until verified.
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

// Monitors network status and reinitializes the S3 client + pipeline when connection is restored.
export const useNetworkSync = () => {
  useEffect(() => {
    const tryInitS3Client = async () => {
      if (!networkManager.isOnline()) return;
      try {
        await window.cloudSync.initS3Client();
        await window.cloudSync.cloudSyncPipeline();
      } catch (err) {
        handleError(err);
      }
    };

    const unsubscribe = networkManager.subscribe((online) => {
      if (online) tryInitS3Client();
    });

    tryInitS3Client();

    return unsubscribe;
  }, []);
};