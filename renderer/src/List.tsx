import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { Entry } from '../lib/types'
import { decodeHtmlEntities, getDateParts } from '../lib/utils'

interface ListViewProps {
  entries: Entry[];
  loadEntries: () => void;
  style?: React.CSSProperties;
}

export default function ListView({ entries, loadEntries, style }: ListViewProps) {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams();
  const reload = searchParams.get('reload') === 'true'
  const [mappedEntries, setMappedEntries] = useState<React.ReactNode[]>([])
  const [searchValue, setSearchValue] = useState('');
  const [submittedSearchValue, setSubmittedSearchValue] = useState('');

  const handleEntryClick = (entryId: string) => {
    navigate(`/edit?id=${entryId}`)
  }

  const handleSearchSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmittedSearchValue(searchValue);
  }

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchValue(e.target.value);
  }

  const handleClearSearch = () => {
    setSearchValue("");
    setSubmittedSearchValue("");
  }


  // Filter entries based on submitted search value
  const filteredEntries = useMemo(() => {
    if (!submittedSearchValue.trim()) {
      return entries;
    }
    const searchLower = submittedSearchValue.toLowerCase();
    return entries.filter(entry => {
      console.log("filter memo")
      const decodedContent = decodeHtmlEntities(entry.content).toLowerCase();
      return decodedContent.includes(searchLower);
    });
  }, [entries, submittedSearchValue]);

  // initial mount, reloads 
  useEffect(() => {
    if (entries.length > 0) return 
    loadEntries()
  }, [])

  // re-fetch entries when reload is true (primarly used upon saving a new entry)
  useEffect(() => {
    if (!reload) return;
    loadEntries();
    setSearchParams({})
  }, [reload, setSearchParams]);

  // component stays mounted, useMemo to save entries mapping in memory
  useMemo(() => {
    const mappedEntries = filteredEntries.map(entry => {
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
    })
    setMappedEntries(mappedEntries)
  }, [filteredEntries]);

  // avoid double rendering when reload is true
  if (reload) return null;

  return (
    <div style={{ overflowY: 'auto', height: '100vh', ...style }} >
      {mappedEntries}
      {mappedEntries.length > 0 && (
        <div style={{ position: 'sticky', padding: '2px', display: 'flex', alignItems: 'center', justifyContent: 'flex-start', bottom: 0, width: '100%', height: '25px', backgroundColor: 'var(--app-bg)' }}>
          <form onSubmit={handleSearchSubmit}>
            <input type='text' placeholder='Search' value={searchValue} style={{ padding: '2px', fontSize: '10px', outline: 'none' }} onChange={handleSearchChange} />
          </form>
          {searchValue.length > 0 && <button type='button' style={{fontSize: '10px'}} onClick={handleClearSearch}>Clear</button>}
        </div>
      )}
    </div>
  )
}