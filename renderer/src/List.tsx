import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { DecodedEntry, Entry } from '../../shared/types'
import { getDateParts } from '../lib/dates'
import { markdownToHtml } from '../lib/markdown'
import { handleError } from '../lib/error-handler'
import * as db from '../db/db'

const SEARCH_LIMIT = 50;

interface ListViewProps {
  entries: DecodedEntry[];
  style?: React.CSSProperties;
}

function toDecodedEntry(entry: Entry): DecodedEntry {
  return { ...entry, decodedContent: markdownToHtml(entry.content) };
}

function EntryRow({ entry, onClick }: { entry: DecodedEntry; onClick: () => void }) {
  const { year, month, day, weekday } = getDateParts(entry.date);
  return (
    <div
      onClick={onClick}
      className="flex border-b border-[color:var(--color-secondary-bg)] py-[10px] pr-5 flex-nowrap"
    >
      <div className="flex flex-row flex-1 justify-between">
        <div className="w-[100px] text-center shrink-0 flex flex-col items-center justify-evenly py-[10px]">
          <div>{weekday}</div>
          <div>{month} {day} {year}</div>
        </div>
        <div className="flex-1 min-w-0 overflow-hidden">
          <div
            className="max-h-[75px] overflow-hidden break-words cursor-default"
            dangerouslySetInnerHTML={{ __html: entry.decodedContent }}
          />
        </div>
      </div>
    </div>
  );
}

export default function ListView({ entries, style }: ListViewProps) {
  const navigate = useNavigate()
  const [searchValue, setSearchValue] = useState('');
  const [searchResults, setSearchResults] = useState<DecodedEntry[] | null>(null);
  const [searchLimit, setSearchLimit] = useState(SEARCH_LIMIT);
  const [hasMoreSearchResults, setHasMoreSearchResults] = useState(false);
  const [activeQuery, setActiveQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [ftsReady, setFtsReady] = useState(false);

  useEffect(() => {
    // The worker may have already finished before this component mounted (e.g.
    // on a small DB the build completes almost instantly). Check first so we
    // don't wait forever for an event that already fired.
    window.sqlite.isFtsReady().then(ready => {
      if (ready) {
        setFtsReady(true);
      } else {
        window.sqlite.onFtsReady(() => setFtsReady(true));
      }
    });
  }, []);

  const handleLoadMoreSearchResults = async () => {
    const newLimit = searchLimit + SEARCH_LIMIT;
    setSearchLimit(newLimit);
    setIsSearching(true);
    try {
      const results = await db.searchEntries(activeQuery, newLimit);
      setSearchResults(results.map(toDecodedEntry));
      setHasMoreSearchResults(results.length === newLimit);
    } catch (error) {
      handleError(error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleEntryClick = (entryId: string) => {
    navigate(`/edit?id=${entryId}`)
  }

  const handleSearchSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const query = searchValue.trim();
    if (!query) {
      setSearchResults(null);
      setActiveQuery('');
      setSearchLimit(SEARCH_LIMIT);
      return;
    }
    setIsSearching(true);
    setSearchLimit(SEARCH_LIMIT);
    try {
      const results = await db.searchEntries(query, SEARCH_LIMIT);
      setSearchResults(results.map(toDecodedEntry));
      setHasMoreSearchResults(results.length === SEARCH_LIMIT);
      setActiveQuery(query);
    } catch (error) {
      handleError(error);
      setSearchResults([]);
      setHasMoreSearchResults(false);
    } finally {
      setIsSearching(false);
    }
  };

  const handleClearSearch = () => {
    setSearchValue('');
    setSearchResults(null);
    setActiveQuery('');
    setSearchLimit(SEARCH_LIMIT);
    setHasMoreSearchResults(false);
  };

  const displayEntries = searchResults ?? entries;

  // memoize the rendered rows — component stays mounted, so this avoids re-renders on route changes
  const mappedEntries = useMemo(() => {
    return displayEntries.map(entry => (
      <EntryRow key={entry.id} entry={entry} onClick={() => handleEntryClick(entry.id)} />
    ));
  }, [displayEntries]);

  return (
    <div style={{ overflowY: 'auto', height: '100%', ...style }}>
      <div className="min-h-[calc(100%-30px)]">
        {mappedEntries}
      </div>
      <div className="sticky bottom-0 p-[2px] flex items-center justify-start gap-[6px] w-full h-[30px] bg-[color:var(--color-app-bg)]">
          <form onSubmit={handleSearchSubmit}>
            <input
              type="text"
              placeholder={ftsReady ? 'Search' : 'Indexing...'}
              value={searchValue}
              disabled={!ftsReady}
              className="p-[2px] ml-[2px] text-[10px] h-[20px] outline-none disabled:opacity-40"
              onChange={(e) => setSearchValue(e.target.value)}
            />
          </form>
          {isSearching && <span className="text-[10px] text-gray-400">...</span>}
          {searchResults !== null && !isSearching && (
            <span className="text-[10px] text-gray-400">{searchResults.length} result{searchResults.length !== 1 ? 's' : ''} for "{activeQuery}"</span>
          )}
          {hasMoreSearchResults && !isSearching && (
            <button type="button" className="text-[10px] h-[20px] flex items-center" onClick={handleLoadMoreSearchResults}>Load more</button>
          )}
          {searchValue.length > 0 && (
            <button type="button" className="text-[10px] h-[20px] flex items-center" onClick={handleClearSearch}>Clear</button>
          )}
      </div>
    </div>
  )
}
