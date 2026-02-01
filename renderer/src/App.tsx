import React, { useEffect, useState } from 'react'
import type { DecodedEntry } from '../lib/types'
import * as db from '../db/db'
import { HashRouter, BrowserRouter, Routes, Route, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import ListView from './List'
import Calendar from './Calendar'
import More from './More'
import New from './New'
import Edit from './Edit'
import Conflicts from './Conflicts'
import PasswordOverlay from './components/PasswordOverlay'
import NavBar from './components/NavBar'
import { usePasswordProtection, useNetworkSync } from '../lib/hooks'
import { journalToCalendar, getCurrentCalendarDate } from '../lib/utils'

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

  const reload = searchParams.get('reload') === 'true'

  // show password overlay during initialization or if protected and not verified
  if (isInitializing || (passwordProtected && !passwordVerified)) {
    return <PasswordOverlay onPasswordVerified={handlePasswordVerified} />
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <NavBar activeTab={location.pathname} />
      <ListView
        entries={entries}
        style={{ display: location.pathname === '/list' && !reload && !loading ? 'block' : 'none' }}
        />
      <Routes>
        <Route path="/" element={null} />
        <Route path="/list" element={null} />
        <Route path="/calendar" element={<Calendar entries={entries} loadEntries={loadEntries} selectedYear={selectedYear} setSelectedYear={setSelectedYear} />} />
        <Route path="/more" element={<More />} />
        <Route path="/conflicts" element={<Conflicts />} />
        <Route path="/new" element={<New />} />
        <Route path="/edit" element={<Edit entries={entries} />} />
      </Routes>
      {loading && <div style={{ position: 'absolute', top: '40px', left: 0, width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', backgroundColor: 'var(--app-bg)', zIndex: 1000 }}>Loading ...</div>}
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