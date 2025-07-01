import React, { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { formatCurrentDate, calendarDateToJournalFormat, journalDateToCalendarFormat, formatCurrentDateToYearMonthDay } from '../lib/utils';
import TextEditor from './components/TextEditor';
import type { Entry } from '../lib/types';
import * as idb from '../db/idb';

const New: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [todaysEntry, setTodaysEntry] = useState<Entry | null>(null);

  // get most recent entry
  useEffect(() => {
    const loadMostRecentEntry = async () => {
      const entry = await idb.idbGetMostRecentEntry();
      if (entry) {
        if (journalDateToCalendarFormat(entry.date) === formatCurrentDateToYearMonthDay()) {
          setTodaysEntry(entry);
        }
      }
    };
    loadMostRecentEntry();
  }, []);

  // get date from url param (in instances when we want create a new entry for a specific date) or use current date
  const dateParam = searchParams.get('date');
  const dateRef = useRef(dateParam ? calendarDateToJournalFormat(dateParam) : formatCurrentDate());

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ textAlign: 'center', fontSize: '12px', color: 'grey' }}>
        {dateRef.current}
      </div>
      <TextEditor
        entry={todaysEntry}
        displayNav={false}
        editable={true}
        isNewEntry={true}
      />
    </div>
  );
};

export default New; 