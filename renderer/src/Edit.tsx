import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import TextEditor from './components/TextEditor';
import * as db from '../db/db';
import type { DecodedEntry } from '../../shared/types';
import { NavDirection } from '../lib/constants';
import { saveEntry } from '../lib/entries';
import { handleError } from '../lib/error-handler';
import { setNavGuard, clearNavGuard } from '../lib/nav-guard';

const Edit: React.FC = () => {
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
            const decoded = { ...entry, decodedContent: entry.content };
            setEntry(decoded);
          }
        } catch (error) {
          handleError(error);
        }
      }
    };

    loadEntry();
  }, [entryId]);

  const handleNavigate = async (direction: NavDirection) => {
    if (!entry) return;
    try {
      const adjacent = await db.getAdjacentEntry(entry.id, direction === NavDirection.PREV ? 'prev' : 'next');
      if (adjacent) navigate(`/edit?id=${adjacent.id}`);
    } catch (error) {
      handleError(error);
    }
  };

  const hasUnsavedChanges = isEditing && !isSaving && currentHtml !== (entry?.content ?? '');
  useEffect(() => {
    hasUnsavedChanges
      ? setNavGuard(() => window.confirm('You have unsaved changes. Leave anyway?'))
      : clearNavGuard();
    return () => clearNavGuard();
  }, [hasUnsavedChanges]);

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
    <div className="flex flex-col">
      <div className="text-center text-[12px] text-gray-400">
        {entry?.date}
      </div>
      <TextEditor
        displayNav={true}
        editable={false}
        entry={entry}
        onNavigate={handleNavigate}
        onEditModeChange={handleEditModeChange}
        onContentChange={handleContentChange}
      />
      {isEditing && (
        <div className="fixed bottom-0 right-0 px-[10px] pb-[10px]">
          <button onClick={handleSave} disabled={isSaving} className="px-2 py-1 text-[12px]">{isSaving ? 'Saving...' : 'Done'}</button>
        </div>
      )}
    </div>
  );
};

export default Edit; 