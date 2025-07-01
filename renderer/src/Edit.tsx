import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import TextEditor from './components/TextEditor';
import * as idb from '../db/idb';
import type { Entry } from '../lib/types';
import { NavDirection } from '../lib/constants';

interface EditProps {
  entries: Entry[];
}

const Edit: React.FC<EditProps> = ({ entries }) => {
  const [entry, setEntry] = useState<Entry | null>(null);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const entryId = searchParams.get('id');

  useEffect(() => {
    const loadEntry = async () => {
      if (entryId) {
        try {
          const entry = await idb.idbGetEntryById(entryId);
          if (entry) {
            setEntry(entry);
          }
        } catch (error) {
          console.error('Failed to load entry:', error);
        }
      }
    };

    loadEntry();
  }, [entryId]);  

  const handleNavigate = (direction: NavDirection) => {
    if (!entry || entries.length === 0) return;

    const currentIndex = entries.findIndex(e => e.id === entry.id);
    if (currentIndex === -1) return;

    const newIndex = direction === NavDirection.PREV ? currentIndex + 1 : currentIndex - 1;

    if (newIndex >= 0 && newIndex < entries.length) {
      const newEntry = entries[newIndex];
      setEntry(newEntry);
      navigate(`/edit?id=${newEntry.id}`);
    }
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{
        textAlign: 'center',
        fontSize: '12px',
        color: 'grey'
      }}>
        {entry?.date}
      </div>
      <TextEditor
        displayNav={true}
        editable={false}
        entry={entry}
        isNewEntry={false}
        onNavigate={handleNavigate}
      />
    </div>
  );
};

export default Edit; 