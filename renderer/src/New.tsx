import React, { useEffect, useState, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { formatCurrentDate, calendarToJournal, journalToCalendar, getCurrentCalendarDate } from '../lib/dates';
import { saveEntry } from '../lib/entries';
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
    <div className="flex flex-col">
      <div className="text-center text-[12px] text-gray-400">
        {dateRef.current}
      </div>
      <TextEditor
        entry={null}
        displayNav={false}
        editable={true}
        onContentChange={handleContentChange}
      />
      <div className="fixed bottom-0 right-0 px-[10px] pb-[10px]">
        <button onClick={handleSave} className="px-2 py-1 text-[12px]">Done</button>
      </div>
    </div>
  );
};

export default New; 