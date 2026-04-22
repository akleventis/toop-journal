import React, { useEffect, useState } from 'react'
import type { DecodedEntry } from '../../shared/types'
import * as db from '../db/db'
import { HashRouter, BrowserRouter, Routes, Route, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import ListView from './List'
import Calendar from './Calendar'
import More from './More'
import New from './New'
import Edit from './Edit'
import Conflicts from './Conflicts'
import Logs from './Logs'
import Backups from './Backups'
import PasswordOverlay from './components/PasswordOverlay'
import NavBar from './components/NavBar'
import ErrorBoundary from './components/ErrorBoundary'
import { usePasswordProtection, useNetworkSync, useSyncState } from '../lib/hooks'
import { handleError } from '../lib/error-handler'
import { journalToCalendar, getCurrentCalendarDate } from '../lib/dates'
import { SyncState } from '../../shared/types'
import LoadingSpinner from './components/LoadingSpinner'

// type declaration for the global variable defined in vite.config.ts
declare global {
  const __IS_DEV__: boolean;
}


// using the global variable defined in vite.config.ts
const Router = __IS_DEV__ ? BrowserRouter : HashRouter;

// preloads decoded HTML to warm cache
const preloadHtmlDecodeCache = async () => {
  db.getDecodedEntries() 
}

function AppContent() {
  const [entries, setEntries] = useState<DecodedEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // initialize app and checks if password is protected
  const { passwordProtected, passwordVerified, isInitializing, handlePasswordVerified } = usePasswordProtection()
  // decide initial route from root after entries are loaded
  useEffect(() => {
    if (!passwordVerified) return
    if (location.pathname !== '/') return

    const decide = async () => {
      const hasToday = await isTodayFilled()
      navigate(hasToday ? '/list' : '/new', { replace: true })
    }
    decide()
  }, [passwordVerified, location.pathname])

  const isTodayFilled = async (): Promise<boolean> => {
    const latest = await db.getMostRecentEntry()
    if (!latest) return false
    return journalToCalendar(latest.date) === getCurrentCalendarDate()
  }

  const loadEntries = async () => {
    setLoading(true)
const entries = await db.getDecodedEntries()
    setEntries(entries)
    setLoading(false)
  }

  // handle reload and initial load when on /list
  useEffect(() => {
    if (!passwordVerified) return
    if (location.pathname == '/new') {
      preloadHtmlDecodeCache()
      return
    }
    if (location.pathname !== '/list') return

    const reload = searchParams.get('reload') === 'true'
    const shouldLoad = reload || entries.length === 0

    if (shouldLoad) {
      loadEntries()
      if (reload) {
        setSearchParams({})
      }
    }
  }, [passwordVerified, location.pathname, searchParams])

  // monitor network status and reinitialize S3 client when connection is restored
  useNetworkSync();

  // reload entries when sync completes so newly downloaded entries appear
  const syncState = useSyncState();
  useEffect(() => {
    if (syncState === SyncState.READY && passwordVerified) {
      db.clearDecodedCache();
      // silent reload — no spinner, entries update in place
      db.getDecodedEntries().then(setEntries).catch(handleError);
    }
  }, [syncState]);

  const reload = searchParams.get('reload') === 'true'

  // show password overlay during initialization or if protected and not verified
  if (isInitializing || (passwordProtected && !passwordVerified)) {
    return <PasswordOverlay onPasswordVerified={handlePasswordVerified} />
  }

  return (
    <div className="h-full flex flex-col">
      <NavBar activeTab={location.pathname} />
      <div className="flex-1 min-h-0 relative overflow-y-auto">
        <ListView
          entries={entries}
          style={{ display: location.pathname === '/list' && !reload && !loading ? 'block' : 'none' }}
        />
        <Routes>
          <Route path="/" element={null} />
          <Route path="/list" element={null} />
          <Route path="/calendar" element={<ErrorBoundary><Calendar entries={entries} loadEntries={loadEntries} selectedYear={selectedYear} setSelectedYear={setSelectedYear} /></ErrorBoundary>} />
          <Route path="/more" element={<ErrorBoundary><More /></ErrorBoundary>} />
          <Route path="/conflicts" element={<ErrorBoundary><Conflicts /></ErrorBoundary>} />
          <Route path="/logs" element={<ErrorBoundary><Logs /></ErrorBoundary>} />
          <Route path="/backups" element={<ErrorBoundary><Backups /></ErrorBoundary>} />
          <Route path="/new" element={<ErrorBoundary><New /></ErrorBoundary>} />
          <Route path="/edit" element={<ErrorBoundary><Edit entries={entries} /></ErrorBoundary>} />
        </Routes>
      </div>
      {loading && <div className="absolute top-[40px] left-0 w-full h-full flex justify-center items-center bg-[color:var(--color-app-bg)] z-[1000]"><LoadingSpinner size={32} /></div>}
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  );
}