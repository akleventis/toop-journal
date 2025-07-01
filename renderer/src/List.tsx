import React, { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { Entry } from '../lib/types'
import { decodeHtmlEntities, getDateParts } from '../lib/utils'

interface ListViewProps {
  entries: Entry[];
  loadEntries: () => void;
}

export default function ListView({ entries, loadEntries }: ListViewProps) {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams();
  const reload = searchParams.get('reload') === 'true'

  // initial mount, reloads 
  useEffect(() => {
    if (entries.length > 0 ) return
    loadEntries()
  }, [])

  // re-fetch entries when reload is true (primarly used upon saving a new entry)
  useEffect(() => {
    if (!reload) return;
    loadEntries();
    setSearchParams({})
  }, [reload, setSearchParams]);

  // avoid double rendering when reload is true
  if (reload) return null;

  const handleEntryClick = (entryId: string) => {
    navigate(`/edit?id=${entryId}`)
  }

  return (
    <div
      style={{ overflowY: 'auto', height: '100vh' }}
    >
      {entries.map(entry => {
        const { year, month, day, weekday } = getDateParts(entry.date)
        return (
          <div
            key={entry.id}
            onClick={() => handleEntryClick(entry.id)}
            style={{
              display: 'flex',
              borderBottom: '1px solid var(--secondary-bg)',
              padding: 'var(--p-out-vertical) var(--p-out-horizontal) var(--p-out-vertical) 0',
              flexWrap: 'nowrap'
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'row', flex: 1, justifyContent: 'space-between' }}>
              <div style={{ width: 100, textAlign: 'center', flexShrink: 0, alignItems: 'center', justifyContent: 'space-evenly', display: 'flex', flexDirection: 'column', padding: '10px 0' }}>
                <div>{weekday}</div>
                <div>{month} {day} {year}</div>
              </div>
              <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                <div
                  style={{
                    maxHeight: '55px',
                    overflow: 'hidden',
                    wordBreak: 'break-word',
                    cursor: 'default'

                  }}
                  dangerouslySetInnerHTML={{ __html: decodeHtmlEntities(entry.content) }}
                />
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}