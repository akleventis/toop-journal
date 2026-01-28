import React, { useEffect, useState, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { formatCurrentDate, calendarToJournal, journalToCalendar, getCurrentCalendarDate, saveEntry } from '../lib/utils';
import TextEditor from './components/TextEditor';
import * as db from '../db/db';

const New: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [currentHtml, setCurrentHtml] = useState('');
  const navigate = useNavigate();

  // get most recent entry
  useEffect(() => {
    const loadMostRecentEntry = async () => {
      const entry = await db.getMostRecentEntry();
      if (entry) {
        if (journalToCalendar(entry.date) === getCurrentCalendarDate()) {
          navigate(`/edit?id=${entry.id}`);
        }
      }
    };
    loadMostRecentEntry();
  }, []);

  // get date from url param (in instances when we want create a new entry for a specific date) or use current date
  const dateParam = searchParams.get('date');
  const dateRef = useRef(dateParam ? calendarToJournal(dateParam) : formatCurrentDate());

  const handleSave = async () => {
    await saveEntry(currentHtml, null, navigate);
  };

  const handleContentChange = (html: string) => {
    setCurrentHtml(html);
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
      <div style={{ textAlign: 'center', fontSize: '12px', color: 'grey' }}>
        {dateRef.current}
      </div>
      <TextEditor
        entry={null}
        displayNav={false}
        editable={true}
        onContentChange={handleContentChange}
      />
      <div style={{ borderTop: '1px solid var(--border-color)', textAlign: 'right', padding: '0 10px 10px' }}>
        <button onClick={handleSave} style={{ padding: '4px 8px', fontSize: '12px' }}>Done</button>
      </div>
    </div>
  );
};

export default New; 