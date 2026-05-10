import React, { useEffect, useState, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { formatCurrentDate, calendarToJournal, journalToCalendar, getCurrentCalendarDate } from '../lib/dates';
import { saveEntry } from '../lib/entries';
import { setNavGuard, clearNavGuard } from '../lib/nav-guard';
import { handleError } from '../lib/error-handler';
import TextEditor from './components/TextEditor';
import * as db from '../db/db';

const New: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [currentHtml, setCurrentHtml] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const navigate = useNavigate();

  // get date from url param (in instances when we want create a new entry for a specific date) or use current date
  const dateParam = searchParams.get('date');
  const dateRef = useRef(dateParam ? calendarToJournal(dateParam) : formatCurrentDate());

  // redirect to today's edit view if an entry already exists — skip when a specific date is requested
  useEffect(() => {
    if (dateParam) return;
    const loadMostRecentEntry = async () => {
      const entry = await db.getMostRecentEntry();
      if (entry && journalToCalendar(entry.date) === getCurrentCalendarDate()) {
        navigate(`/edit?id=${entry.id}`);
      }
    };
    loadMostRecentEntry();
  }, []);

  const isEmpty = !currentHtml || currentHtml === '<br>' || currentHtml === '<p><br></p>';
  useEffect(() => {
    isEmpty
      ? clearNavGuard()
      : setNavGuard(() => window.confirm('You have unsaved changes. Leave anyway?'));
    return () => clearNavGuard();
  }, [isEmpty]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await saveEntry(currentHtml, null, navigate, dateParam ? dateRef.current : undefined);
    } catch (error) {
      handleError(error);
    } finally {
      setIsSaving(false);
    }
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
        <button onClick={handleSave} disabled={isSaving} className="px-2 py-1 text-[12px]">{isSaving ? 'Saving...' : 'Done'}</button>
      </div>
    </div>
  );
};

export default New; 