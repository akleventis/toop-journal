import { useState, useEffect, useRef, useCallback } from 'react';
import * as db from '../db/db';
import { SyncState, Entry } from '../../shared/types';
import { networkManager } from './network-manager';
import { handleError } from './error-handler';

// Subscribes to sync state changes pushed from the main process.
export const useSyncState = () => {
  const [syncState, setSyncState] = useState<SyncState>(SyncState.UNINITIALIZED)

  useEffect(() => {
    window.syncState.getState().then(setSyncState)
    return window.syncState.onStateChange(setSyncState)
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
      if (hash) {
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
      if (hash) {
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

// Owns all entry list state, pagination, and sync-push subscriptions.
export const useEntryList = (passwordVerified: boolean) => {
  const [entries, setEntries] = useState<Entry[]>([])
  const [calendarEntries, setCalendarEntries] = useState<Entry[]>([])
  const [loadedLimit, setLoadedLimit] = useState<number | undefined>(undefined)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  // ref keeps limit current for onEntriesChanged without re-registering the effect on pagination
  const loadedLimitRef = useRef<number | undefined>(undefined)

  const loadEntries = useCallback(async () => {
    setLoading(true)
    const limit = db.getEntryLimitFromStorage()
    const [listEntries, calEntries] = await Promise.all([
      db.getEntriesForList(limit),
      db.getEntriesForCalendar(),
    ])
    setEntries(listEntries)
    setLoadedLimit(limit)
    loadedLimitRef.current = limit
    setCalendarEntries(calEntries)
    setLoading(false)
  }, [])

  const handleLoadMore = async () => {
    const perPage = db.getEntryLimitFromStorage()
    if (perPage == null) return
    const nextLimit = (loadedLimit ?? perPage) * 2
    setLoadingMore(true)
    const listEntries = await db.getEntriesForList(nextLimit)
    setEntries(listEntries)
    setLoadedLimit(nextLimit)
    loadedLimitRef.current = nextLimit
    setLoadingMore(false)
  }

  const hasMore = loadedLimit != null && entries.length >= loadedLimit

  // silent reload when sync pipeline writes remote entries
  useEffect(() => {
    if (!passwordVerified) return;
    return window.sqlite.onEntriesChanged(() => {
      db.getEntriesForList(loadedLimitRef.current).then(setEntries).catch(handleError);
      db.getEntriesForCalendar().then(setCalendarEntries).catch(handleError);
    });
  }, [passwordVerified]);

  return { entries, calendarEntries, loading, loadingMore, hasMore, loadedLimit, loadEntries, handleLoadMore }
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