import React, { useEffect, useState } from 'react'
import type { Entry } from '../lib/types'
import * as idb from '../db/idb'
import { HashRouter, BrowserRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import ListView from './List'
import Calendar from './Calendar'
import More from './More'
import New from './New'
import Edit from './Edit'
import PasswordOverlay from './components/PasswordOverlay'
import NavBar from './components/NavBar'
import { usePasswordProtection, useNetworkSync } from '../lib/hooks'
import { journalDateToCalendarFormat, formatCurrentDateToYearMonthDay, decodeHtmlEntities } from '../lib/utils'
import { idbGetEntries } from '../db/idb';

// type declaration for the global variable defined in vite.config.ts
declare global {
  const __IS_DEV__: boolean;
}

// using the global variable defined in vite.config.ts
const Router = __IS_DEV__ ? BrowserRouter : HashRouter;

// preloads decoded HTML to warm cache
const preloadHtmlDecodeCache = async () => {
  const entries = await idbGetEntries()
  for (const e of entries) decodeHtmlEntities(e.content)
}

function AppContent() {
  console.log("AppContent")
  const [entries, setEntries] = useState<Entry[]>([])
  const location = useLocation();
  const navigate = useNavigate();

  // initialize app and checks if password is protected
  const { passwordProtected, passwordVerified, handlePasswordVerified } = usePasswordProtection()

  // decide initial route from root after entries are loaded
  useEffect(() => {
    if (!passwordVerified) return
    if (location.pathname !== '/') return
    const decide = async () => {
      const hasToday = await isTodayFilled()

      // warm cache in background
      !hasToday && preloadHtmlDecodeCache() 

      navigate(hasToday ? '/list' : '/new', { replace: true })
    }
    decide()
  }, [passwordVerified, location.pathname])

  const isTodayFilled = async (): Promise<boolean> => {
    const latest = await idb.idbGetMostRecentEntry()
    if (!latest) return false
    return journalDateToCalendarFormat(latest.date) === formatCurrentDateToYearMonthDay()
  }

  const loadEntries = async () => {
    const entries = await idb.idbGetEntries()
    const sorted = [...entries].sort((a, b) => b.timestamp - a.timestamp)
    setEntries(sorted)
  }

  // monitor network status and reinitialize S3 client when connection is restored
  useNetworkSync();

  // show password overlay if protected and not verified
  if (passwordProtected && !passwordVerified) {
    return <PasswordOverlay onPasswordVerified={handlePasswordVerified} />
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <NavBar activeTab={location.pathname} />
      <Routes>
        <Route path="/" element={null} />
        <Route path="/list" element={<ListView entries={entries} loadEntries={loadEntries} />} />
        <Route path="/calendar" element={<Calendar entries={entries} loadEntries={loadEntries} />} />
        <Route path="/more" element={<More />} />
        <Route path="/new" element={<New />} />
        <Route path="/edit" element={<Edit entries={entries} />} />
      </Routes>
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