import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import TextEditor from './components/TextEditor';
import * as db from '../db/db';
import type { DecodedEntry } from '../../shared/types';
import { NavDirection } from '../lib/constants';
import { markdownToHtml } from '../lib/markdown';
import { saveEntry } from '../lib/entries';
import { handleError } from '../lib/error-handler';

interface EditProps {
  entries: DecodedEntry[];
}

const Edit: React.FC<EditProps> = ({ entries }) => {
  const [entry, setEntry] = useState<DecodedEntry | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [currentHtml, setCurrentHtml] = useState('');
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const entryId = searchParams.get('id');

  useEffect(() => {
    const loadEntry = async () => {
      if (entryId) {
        try {
          const entry = await db.getEntryById(entryId);
          if (entry) {
            const decoded = { ...entry, decodedContent: markdownToHtml(entry.content) };
            setEntry(decoded);
          }
        } catch (error) {
          handleError(error);
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

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await saveEntry(currentHtml, entry, navigate);
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditModeChange = (editing: boolean) => {
    setIsEditing(editing);
  };

  const handleContentChange = (html: string) => {
    setCurrentHtml(html);
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <div className="text-center text-[12px] text-gray-400">
        {entry?.date}
      </div>
      <div className="flex-1 overflow-hidden flex flex-col">
        <TextEditor
          displayNav={true}
          editable={false}
          entry={entry}
          onNavigate={handleNavigate}
          onEditModeChange={handleEditModeChange}
          onContentChange={handleContentChange}
        />
      </div>
      {isEditing && (
        <div className="border-t border-[color:var(--color-third-bg)] text-right px-[10px] pb-[10px]">
          <button onClick={handleSave} disabled={isSaving} className="px-2 py-1 text-[12px]">{isSaving ? 'Saving...' : 'Done'}</button>
        </div>
      )}
    </div>
  );
};

export default Edit; 