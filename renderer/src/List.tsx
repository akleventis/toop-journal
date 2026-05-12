import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { Entry } from '../../shared/types'
import { getDateParts } from '../lib/dates'
import { handleError } from '../lib/error-handler'
import * as db from '../db/db'

// outer padding (10) + max content (75) + outer padding (10) + border (1)
const ROW_HEIGHT = 96;

interface ListViewProps {
  entries: Entry[];
  onLoadMore?: () => void;
  hasMore?: boolean;
  loadMoreCount?: number;
  loadingMore?: boolean;
}

function EntryRow({ entry, onClick }: { entry: Entry; onClick: () => void }) {
  const { year, month, day, weekday } = getDateParts(entry.date);
  return (
    <div
      onClick={onClick}
      className="flex border-b border-surface py-[10px] pr-5 flex-nowrap"
    >
      <div className="flex flex-row flex-1 justify-between">
        <div className="w-[100px] text-center shrink-0 flex flex-col items-center justify-evenly py-[10px]">
          <div>{weekday}</div>
          <div>{month} {day} {year}</div>
        </div>
        <div className="flex-1 min-w-0 overflow-hidden">
          <div
            className="max-h-[75px] overflow-hidden break-words cursor-default whitespace-pre-wrap"
            dangerouslySetInnerHTML={{ __html: entry.content }}
          />
        </div>
      </div>
    </div>
  );
}

export default function ListView({ entries, onLoadMore, hasMore, loadMoreCount, loadingMore }: ListViewProps) {
  const navigate = useNavigate()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [searchValue, setSearchValue] = useState('');
  const [searchResults, setSearchResults] = useState<Entry[] | null>(null);
  const [hasMoreSearchResults, setHasMoreSearchResults] = useState(false);
  const [searchPage, setSearchPage] = useState(1);
  const [activeQuery, setActiveQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [atBottom, setAtBottom] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => setAtBottom(el.scrollTop + el.clientHeight >= el.scrollHeight - 40);
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  const displayEntries = searchResults ?? entries;

  const virtualizer = useVirtualizer({
    count: displayEntries.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 5,
  });

  const handleEntryClick = (entryId: string) => {
    navigate(`/edit?id=${entryId}`)
  }

  const handleSearchSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const query = searchValue.trim();
    if (!query) {
      setSearchResults(null);
      setActiveQuery('');
      setSearchPage(1);
      setHasMoreSearchResults(false);
      return;
    }
    setIsSearching(true);
    setSearchPage(1);
    const limit = db.getSearchLimit();
    try {
      const results = await db.searchEntries(query, limit);
      setSearchResults(results);
      setActiveQuery(query);
      setHasMoreSearchResults(limit != null && results.length === limit);
    } catch (error) {
      handleError(error);
      setSearchResults([]);
      setHasMoreSearchResults(false);
    } finally {
      setIsSearching(false);
    }
  };

  const handleLoadMoreSearchResults = async () => {
    const nextPage = searchPage + 1;
    const limit = db.getSearchLimit();
    if (limit == null) return;
    setIsSearching(true);
    try {
      const results = await db.searchEntries(activeQuery, limit * nextPage);
      setSearchResults(results);
      setSearchPage(nextPage);
      setHasMoreSearchResults(results.length === limit * nextPage);
    } catch (error) {
      handleError(error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleClearSearch = () => {
    setSearchValue('');
    setSearchResults(null);
    setActiveQuery('');
    setSearchPage(1);
    setHasMoreSearchResults(false);
  };

  return (
    <div className="h-full flex flex-col overflow-x-hidden">
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {virtualizer.getVirtualItems().map(virtualRow => {
            const entry = displayEntries[virtualRow.index];
            return (
              <div
                key={virtualRow.key}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <EntryRow entry={entry} onClick={() => handleEntryClick(entry.id)} />
              </div>
            );
          })}
        </div>
      </div>
      <div className="p-[2px] flex items-center justify-start gap-[6px] w-full h-[30px] bg-app">
        <form onSubmit={handleSearchSubmit}>
          <input
            type="text"
            placeholder="Search"
            value={searchValue}
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
        {hasMore && !searchResults && atBottom && (
          <button type="button" className="text-[10px] h-[20px] flex items-center ml-auto mr-[4px] text-muted" onClick={() => { setAtBottom(false); onLoadMore?.(); }} disabled={loadingMore}>
            {loadingMore ? 'Loading...' : `Load ${loadMoreCount} more`}
          </button>
        )}
      </div>
    </div>
  )
}
