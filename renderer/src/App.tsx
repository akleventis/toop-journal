import React, { useEffect, useState } from 'react'
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
import { usePasswordProtection, useNetworkSync, useEntryList } from '../lib/hooks'
import { journalToCalendar, getCurrentCalendarDate } from '../lib/dates'
import LoadingSpinner from './components/LoadingSpinner'

// type declaration for the global variable defined in vite.config.ts
declare global {
  const __IS_DEV__: boolean;
}


// using the global variable defined in vite.config.ts
const Router = __IS_DEV__ ? BrowserRouter : HashRouter;

function AppContent() {
  const { passwordProtected, passwordVerified, isInitializing, handlePasswordVerified } = usePasswordProtection()
  const { entries, calendarEntries, loading, loadingMore, hasMore, loadedLimit, loadEntries, handleLoadMore } = useEntryList(passwordVerified)
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // decide initial route from root after password gate clears
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

  // handle reload and initial load when on /list
  useEffect(() => {
    if (!passwordVerified) return
    if (location.pathname == '/new') return
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
    <div className="h-full flex flex-col">
      <NavBar activeTab={location.pathname} />
      <div className="flex-1 min-h-0 relative overflow-y-auto">
        <div style={{ display: location.pathname === '/list' && !reload && !loading ? undefined : 'none', height: '100%' }}>
          <ListView entries={entries} onLoadMore={handleLoadMore} hasMore={hasMore} loadMoreCount={loadedLimit} loadingMore={loadingMore} />
        </div>
        <Routes>
          <Route path="/" element={null} />
          <Route path="/list" element={null} />
          <Route path="/calendar" element={<ErrorBoundary><Calendar entries={calendarEntries} loadEntries={loadEntries} selectedYear={selectedYear} setSelectedYear={setSelectedYear} /></ErrorBoundary>} />
          <Route path="/more" element={<ErrorBoundary><More /></ErrorBoundary>} />
          <Route path="/conflicts" element={<ErrorBoundary><Conflicts /></ErrorBoundary>} />
          <Route path="/logs" element={<ErrorBoundary><Logs /></ErrorBoundary>} />
          <Route path="/backups" element={<ErrorBoundary><Backups /></ErrorBoundary>} />
          <Route path="/new" element={<ErrorBoundary><New /></ErrorBoundary>} />
          <Route path="/edit" element={<ErrorBoundary><Edit /></ErrorBoundary>} />
        </Routes>
        {loading && <div className="absolute inset-0 flex justify-center items-center bg-app z-[1000]"><LoadingSpinner size={32} /></div>}
      </div>
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