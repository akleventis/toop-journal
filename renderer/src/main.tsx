import React from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { idbGetEntryById, idbCreateEntry, idbUpdateEntry, idbDeleteEntry } from '../db/idb'

const root = document.getElementById('root')
if (root) {
  // expose idb helpers for main-process executeJavaScript calls
  ;(window as any).idbGetEntryById = idbGetEntryById
  ;(window as any).idbCreateEntry = idbCreateEntry
  ;(window as any).idbUpdateEntry = idbUpdateEntry
  ;(window as any).idbDeleteEntry = idbDeleteEntry

  createRoot(root).render(
    <App />
  )
}